import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getEvolutionConfig,
  resolveGroupMentions,
  sendEvolutionText,
} from './evolution';

export type AutomationType = 'birthday' | 'reading_plan' | 'custom';
export type AutomationMode = 'automatic' | 'manual';

export type AutomationRow = {
  id: string;
  name: string;
  type: AutomationType;
  enabled: boolean;
  send_time: string;
  timezone: string;
  group_id: string;
  message_template: string;
  config: Record<string, unknown> | null;
  last_sent_date: string | null;
  last_sent_at: string | null;
  last_status: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type MemberRow = {
  id: string;
  full_name: string;
  phone: string | null;
  birth_date: string | null;
  status: string | null;
};

type PreparedMessage = {
  message: string;
  mentioned: string[];
  metadata: Record<string, unknown>;
  contentLabel: string;
};

export type AutomationRunResult = {
  ok: boolean;
  automationId: string;
  status: 'queued' | 'skipped' | 'failed';
  skipped?: string;
  message?: string;
  error?: string;
  providerStatus?: string;
  messageId?: string;
  contentLabel?: string;
  metadata?: Record<string, unknown>;
};

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const LOWERCASE_WORDS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

function titleCase(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('pt-BR')
    .split(/\s+/)
    .map((word, index) =>
      index > 0 && LOWERCASE_WORDS.has(word)
        ? word
        : word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1),
    )
    .join(' ');
}

function onlyDigits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeBrazilPhone(value: string | null) {
  let digits = onlyDigits(value);
  if (!digits) return '';
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits.length >= 12 && digits.length <= 13 ? digits : '';
}

export function clockInTimezone(timezone = DEFAULT_TIMEZONE, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || DEFAULT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((item) => item.type === type)?.value || '';
  const hour = get('hour');
  const minute = get('minute');
  const date = `${get('year')}-${get('month')}-${get('day')}`;

  return {
    date,
    monthDay: `${get('month')}-${get('day')}`,
    displayDate: `${get('day')}/${get('month')}/${get('year')}`,
    weekday: new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone || DEFAULT_TIMEZONE,
      weekday: 'long',
    }).format(now),
    time: `${hour}:${minute}`,
    minutes: Number(hour) * 60 + Number(minute),
  };
}

function renderTemplate(template: string, variables: Record<string, string>) {
  return Object.entries(variables).reduce(
    (message, [key, value]) => message.replaceAll(`{{${key}}}`, value),
    template,
  );
}

function birthdayList(
  members: Array<{ name: string; phone: string; mentionJid: string | null }>,
) {
  return members
    .map((member) => {
      const mention = member.mentionJid && member.phone ? ` — @${member.phone}` : '';
      return `• *${member.name}*${mention}`;
    })
    .join('\n');
}

async function prepareBirthdayMessage(
  service: SupabaseClient,
  automation: AutomationRow,
  mode: AutomationMode,
): Promise<PreparedMessage | null> {
  const clock = clockInTimezone(automation.timezone);
  const { data, error } = await service
    .from('members')
    .select('id, full_name, phone, birth_date, status')
    .order('full_name', { ascending: true });

  if (error) throw new Error(error.message);

  let rows = ((data || []) as MemberRow[])
    .filter(
      (member) =>
        String(member.status || 'ativo').toLocaleLowerCase('pt-BR') !== 'inativo',
    )
    .filter((member) => member.birth_date?.slice(5) === clock.monthDay);

  let isSimulation = false;
  if (!rows.length && mode === 'manual') {
    const firstAvailable = ((data || []) as MemberRow[]).find(
      (member) =>
        String(member.status || 'ativo').toLocaleLowerCase('pt-BR') !== 'inativo' &&
        Boolean(member.full_name),
    );
    if (firstAvailable) {
      rows = [firstAvailable];
      isSimulation = true;
    }
  }

  if (!rows.length) return null;

  const members = rows.map((member) => ({
    id: member.id,
    name: titleCase(member.full_name),
    phone: normalizeBrazilPhone(member.phone),
    mentionJid: null as string | null,
  }));

  const mentionMap = isSimulation
    ? new Map<string, string>()
    : await resolveGroupMentions(
        automation.group_id,
        members.map((member) => member.phone).filter(Boolean),
      );

  for (const member of members) {
    member.mentionJid = mentionMap.get(member.phone) || null;
  }

  const names = members.map((member) => member.name);
  const template =
    automation.message_template ||
    '🎉 *Hoje é dia de celebrar!*\n\nA CEAMI deseja um feliz aniversário para:\n\n{{aniversariantes}}\n\nQue Deus continue abençoando cada vida, família e caminhada. Que este novo ciclo seja cheio da presença de Deus, alegria e propósito.\n\nDeixe aqui sua mensagem de carinho! 🧡';
  const message = renderTemplate(template, {
    data: clock.displayDate,
    dia_semana: clock.weekday,
    aniversariantes: birthdayList(members),
    nomes: names.join(', '),
    quantidade: String(members.length),
  });

  return {
    message: isSimulation ? `🧪 *Teste de automação*\n\n${message}` : message,
    mentioned: members
      .map((member) => member.mentionJid)
      .filter((jid): jid is string => Boolean(jid)),
    metadata: {
      memberIds: members.map((member) => member.id),
      memberNames: names,
      simulation: isSimulation,
    },
    contentLabel: isSimulation ? `Simulação com ${names[0]}` : names.join(', '),
  };
}

async function prepareReadingPlanMessage(
  service: SupabaseClient,
  automation: AutomationRow,
  mode: AutomationMode,
): Promise<PreparedMessage | null> {
  const clock = clockInTimezone(automation.timezone);
  const { data, error } = await service
    .from('reading_plan_entries')
    .select('reading_date,reference')
    .eq('reading_date', clock.date)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.reference) return null;

  const template =
    automation.message_template ||
    '📖 *Plano de Leitura CEAMI*\n\nBom dia, igreja! 🙏\n\nA leitura de hoje, {{data}}, é:\n\n📚 *{{leitura}}*\n\nSepare um momento do seu dia para estar na presença de Deus e meditar na Palavra.\n\nDeus abençoe sua leitura! ❤️';
  const message = renderTemplate(template, {
    data: clock.displayDate,
    data_iso: clock.date,
    dia_semana: clock.weekday,
    leitura: String(data.reference),
    nome_plano: automation.name,
  });

  return {
    message: mode === 'manual' ? `🧪 *Teste de automação*\n\n${message}` : message,
    mentioned: [],
    metadata: { readingDate: data.reading_date, reference: data.reference },
    contentLabel: String(data.reference),
  };
}

async function prepareCustomMessage(
  automation: AutomationRow,
  mode: AutomationMode,
): Promise<PreparedMessage | null> {
  const clock = clockInTimezone(automation.timezone);
  const message = renderTemplate(automation.message_template || '', {
    data: clock.displayDate,
    data_iso: clock.date,
    dia_semana: clock.weekday,
    nome_automacao: automation.name,
  }).trim();

  if (!message) return null;

  return {
    message: mode === 'manual' ? `🧪 *Teste de automação*\n\n${message}` : message,
    mentioned: [],
    metadata: {},
    contentLabel: automation.name,
  };
}

async function prepareMessage(
  service: SupabaseClient,
  automation: AutomationRow,
  mode: AutomationMode,
) {
  if (automation.type === 'birthday') {
    return prepareBirthdayMessage(service, automation, mode);
  }
  if (automation.type === 'reading_plan') {
    return prepareReadingPlanMessage(service, automation, mode);
  }
  return prepareCustomMessage(automation, mode);
}

async function updateAutomationStatus(
  service: SupabaseClient,
  automationId: string,
  values: Record<string, unknown>,
) {
  await service
    .from('automations')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('id', automationId);
}

export async function runAutomation(
  service: SupabaseClient,
  automationId: string,
  options: { mode: AutomationMode; force?: boolean } = { mode: 'automatic' },
): Promise<AutomationRunResult> {
  const { data, error } = await service
    .from('automations')
    .select('*')
    .eq('id', automationId)
    .maybeSingle();

  if (error) {
    return { ok: false, automationId, status: 'failed', error: error.message };
  }
  if (!data) {
    return {
      ok: false,
      automationId,
      status: 'failed',
      error: 'Automação não encontrada. Execute a migration mais recente.',
    };
  }

  const automation = data as AutomationRow;
  if (options.mode === 'automatic' && !automation.enabled) {
    return { ok: true, automationId, status: 'skipped', skipped: 'disabled' };
  }

  const clock = clockInTimezone(automation.timezone);
  if (
    options.mode === 'automatic' &&
    !options.force &&
    automation.last_sent_date === clock.date
  ) {
    return {
      ok: true,
      automationId,
      status: 'skipped',
      skipped: 'already_processed',
    };
  }
  const idempotencyKey =
    options.mode === 'automatic' && !options.force
      ? `automatic:${automation.id}:${clock.date}`
      : `manual:${automation.id}:${randomUUID()}`;

  const { data: run, error: runInsertError } = await service
    .from('automation_runs')
    .insert({
      automation_id: automation.id,
      idempotency_key: idempotencyKey,
      run_type: options.mode,
      scheduled_date: clock.date,
      destination_group_id: automation.group_id,
      status: 'processing',
    })
    .select('id')
    .maybeSingle();

  if (runInsertError) {
    if (runInsertError.code === '23505') {
      return {
        ok: true,
        automationId,
        status: 'skipped',
        skipped: 'already_processed',
      };
    }
    return {
      ok: false,
      automationId,
      status: 'failed',
      error: runInsertError.message,
    };
  }

  const runId = String(run?.id || '');

  try {
    const prepared = await prepareMessage(service, automation, options.mode);

    if (!prepared) {
      const reason =
        automation.type === 'birthday'
          ? 'Nenhum aniversariante encontrado para hoje.'
          : automation.type === 'reading_plan'
            ? 'Nenhuma leitura cadastrada para hoje.'
            : 'A mensagem desta automação está vazia.';

      await service
        .from('automation_runs')
        .update({
          status: 'skipped',
          error_message: reason,
          completed_at: new Date().toISOString(),
        })
        .eq('id', runId);

      await updateAutomationStatus(service, automation.id, {
        ...(options.mode === 'automatic' ? { last_sent_date: clock.date } : {}),
        last_sent_at: new Date().toISOString(),
        last_status: 'skipped',
        last_error: reason,
      });

      return {
        ok: true,
        automationId,
        status: 'skipped',
        skipped: 'no_content',
        error: reason,
      };
    }

    const groupId = automation.group_id || getEvolutionConfig().defaultGroupId;
    let outgoingMessage = prepared.message;
    let sendResult = await sendEvolutionText({
      groupId,
      text: outgoingMessage,
      mentioned: prepared.mentioned,
    });

    if (!sendResult.ok && sendResult.httpStatus === 400 && prepared.mentioned.length > 0) {
      outgoingMessage = prepared.message.replace(/ — @\d+/g, '');
      sendResult = await sendEvolutionText({
        groupId,
        text: outgoingMessage,
        mentioned: [],
      });
    }

    if (!sendResult.ok) {
      await service
        .from('automation_runs')
        .update({
          status: 'failed',
          message: outgoingMessage,
          metadata: prepared.metadata,
          provider_response: sendResult.payload,
          provider_status: sendResult.providerStatus,
          error_message: sendResult.errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq('id', runId);

      await updateAutomationStatus(service, automation.id, {
        last_sent_at: new Date().toISOString(),
        last_status: 'failed',
        last_error: sendResult.errorMessage,
      });

      return {
        ok: false,
        automationId,
        status: 'failed',
        error: sendResult.errorMessage,
        providerStatus: sendResult.providerStatus,
      };
    }

    await service
      .from('automation_runs')
      .update({
        status: 'queued',
        message: outgoingMessage,
        metadata: prepared.metadata,
        provider_message_id: sendResult.messageId,
        provider_status: sendResult.providerStatus,
        provider_response: sendResult.payload,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId);

    await updateAutomationStatus(service, automation.id, {
      ...(options.mode === 'automatic' ? { last_sent_date: clock.date } : {}),
      last_sent_at: new Date().toISOString(),
      last_status: 'queued',
      last_error: null,
    });

    return {
      ok: true,
      automationId,
      status: 'queued',
      message: outgoingMessage,
      providerStatus: sendResult.providerStatus,
      messageId: sendResult.messageId,
      contentLabel: prepared.contentLabel,
      metadata: prepared.metadata,
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Não foi possível executar a automação.';

    await service
      .from('automation_runs')
      .update({
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId);

    await updateAutomationStatus(service, automation.id, {
      last_sent_at: new Date().toISOString(),
      last_status: 'failed',
      last_error: message,
    });

    return { ok: false, automationId, status: 'failed', error: message };
  }
}

export async function runDueAutomations(service: SupabaseClient) {
  const { data, error } = await service
    .from('automations')
    .select('*')
    .eq('enabled', true)
    .order('send_time', { ascending: true });

  if (error) throw new Error(error.message);

  const results: AutomationRunResult[] = [];
  for (const automation of (data || []) as AutomationRow[]) {
    const clock = clockInTimezone(automation.timezone);
    const [hour, minute] = String(automation.send_time).split(':').map(Number);
    const target = hour * 60 + minute;
    const difference = clock.minutes - target;

    if (difference < 0 || difference > 4) {
      results.push({
        ok: true,
        automationId: automation.id,
        status: 'skipped',
        skipped: 'outside_window',
      });
      continue;
    }

    results.push(
      await runAutomation(service, automation.id, { mode: 'automatic', force: false }),
    );
  }

  return results;
}
