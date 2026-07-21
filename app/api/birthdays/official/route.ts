import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const TIME_ZONE = 'America/Sao_Paulo';
const OFFICIAL_INSTANCE = 'ceamirs';
const OFFICIAL_GROUP_ID = '120363148206200208@g.us';
const OFFICIAL_GROUP_NAME = 'CEAMI GRUPO';

type MemberRow = {
  id: string;
  full_name: string;
  phone: string | null;
  birth_date: string | null;
  status: string | null;
};

type BirthdayMember = {
  id: string;
  name: string;
  phone: string;
  mentionJid: string | null;
};

type JidValue =
  | string
  | {
      _serialized?: string;
      user?: string;
      server?: string;
    }
  | null;

type GroupParticipant = {
  id?: JidValue;
  jid?: JidValue;
  remoteJid?: JidValue;
  phoneNumber?: string;
  phone?: string;
};

type ProviderEnvelope = {
  key?: { id?: string; remoteJid?: string };
  status?: string;
  message?: { key?: { id?: string; remoteJid?: string }; status?: string };
  data?: { key?: { id?: string; remoteJid?: string }; status?: string };
  response?: {
    key?: { id?: string; remoteJid?: string };
    status?: string;
    message?: { key?: { id?: string; remoteJid?: string }; status?: string };
  };
};

type EvolutionAttempt = {
  schema: 'documented' | 'legacy';
  status: number;
  ok: boolean;
  payload: unknown;
};

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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

function phoneVariants(phone: string) {
  const variants = new Set<string>([phone]);
  if (!phone.startsWith('55')) return variants;

  if (phone.length === 13 && phone.charAt(4) === '9') {
    variants.add(`${phone.slice(0, 4)}${phone.slice(5)}`);
  }

  if (phone.length === 12) {
    variants.add(`${phone.slice(0, 4)}9${phone.slice(4)}`);
  }

  return variants;
}

function titleCase(value: string) {
  const lowerWords = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  return value
    .trim()
    .toLocaleLowerCase('pt-BR')
    .split(/\s+/)
    .map((word, index) =>
      index > 0 && lowerWords.has(word)
        ? word
        : word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1),
    )
    .join(' ');
}

function brazilDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((item) => item.type === type)?.value || '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  return {
    date: `${year}-${month}-${day}`,
    monthDay: `${month}-${day}`,
  };
}

function normalizeJid(value: JidValue | undefined) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value._serialized === 'string') return value._serialized.trim();
  if (value.user && value.server) return `${value.user}@${value.server}`;
  return '';
}

function isValidMentionJid(value: string) {
  return /^\d+@(s\.whatsapp\.net|lid)$/.test(value);
}

function participantJid(participant: GroupParticipant) {
  const candidates = [participant.id, participant.jid, participant.remoteJid];
  for (const candidate of candidates) {
    const jid = normalizeJid(candidate);
    if (jid) return jid;
  }
  return '';
}

function participantPhones(participant: GroupParticipant) {
  const values = [participant.phoneNumber, participant.phone];
  const jid = participantJid(participant);
  if (jid && !jid.endsWith('@lid')) values.push(jid.split('@')[0]);

  const phones = new Set<string>();
  for (const value of values) {
    const digits = normalizeBrazilPhone(String(value || '')) || onlyDigits(value);
    if (!digits) continue;
    for (const variant of phoneVariants(digits)) phones.add(variant);
  }
  return phones;
}

function toBirthdayMember(member: MemberRow): BirthdayMember {
  const phone = normalizeBrazilPhone(member.phone);
  return {
    id: member.id,
    name: titleCase(member.full_name),
    phone,
    mentionJid: phone ? `${phone}@s.whatsapp.net` : null,
  };
}

function memberLine(member: BirthdayMember) {
  return member.mentionJid && member.phone
    ? `*${member.name}* — @${member.phone}`
    : `*${member.name}*`;
}

function buildMessage(members: BirthdayMember[]) {
  if (members.length === 1) {
    return `🎉 *Hoje é dia de celebrar!*\n\nA CEAMI deseja um feliz aniversário para ${memberLine(members[0])}! 🥳\n\nQue Deus continue abençoando sua vida, sua família e sua caminhada. Que este novo ciclo seja cheio da presença de Deus, alegria e propósito.\n\nDeixe aqui sua mensagem de carinho! 🧡`;
  }

  const list = members.map((member) => `• ${memberLine(member)}`).join('\n');
  return `🎉 *Hoje é dia de celebrar!*\n\nA CEAMI deseja um feliz aniversário aos nossos aniversariantes de hoje:\n\n${list}\n\nQue Deus continue abençoando cada vida, família e caminhada. Que este novo ciclo seja cheio da presença de Deus, alegria e propósito.\n\nDeixe aqui sua mensagem de carinho! 🧡`;
}

async function loadTodayBirthdays(service: SupabaseClient) {
  const { monthDay } = brazilDate();
  const { data, error } = await service
    .from('members')
    .select('id, full_name, phone, birth_date, status')
    .order('full_name', { ascending: true });

  if (error) throw new Error(error.message);

  return ((data || []) as MemberRow[])
    .filter((member) => String(member.status || 'ativo').toLocaleLowerCase('pt-BR') !== 'inativo')
    .filter((member) => member.birth_date?.slice(5) === monthDay)
    .map(toBirthdayMember);
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text.slice(0, 3000) };
  }
}

async function fetchParticipants(apiUrl: string, apiKey: string) {
  try {
    const response = await fetch(
      `${apiUrl}/group/participants/${encodeURIComponent(OFFICIAL_INSTANCE)}?groupJid=${encodeURIComponent(OFFICIAL_GROUP_ID)}`,
      {
        headers: { apikey: apiKey },
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!response.ok) return [] as GroupParticipant[];

    const payload = (await response.json()) as
      | GroupParticipant[]
      | { participants?: GroupParticipant[]; data?: { participants?: GroupParticipant[] } };

    if (Array.isArray(payload)) return payload;
    return payload.participants || payload.data?.participants || [];
  } catch {
    return [] as GroupParticipant[];
  }
}

async function resolveMentions(members: BirthdayMember[], apiUrl: string, apiKey: string) {
  const participants = await fetchParticipants(apiUrl, apiKey);

  return members.map((member) => {
    if (!member.phone) return { ...member, mentionJid: null };

    const wanted = phoneVariants(member.phone);
    const participant = participants.find((item) => {
      const available = participantPhones(item);
      return [...wanted].some((phone) => available.has(phone));
    });

    const exactJid = participant ? participantJid(participant) : '';
    const fallbackJid = `${member.phone}@s.whatsapp.net`;
    const mentionJid = isValidMentionJid(exactJid) ? exactJid : fallbackJid;

    return { ...member, mentionJid };
  });
}

function providerEnvelope(payload: unknown) {
  const envelope = (payload || {}) as ProviderEnvelope;
  const nested = envelope.response || envelope;
  const key = nested.key || nested.message?.key || envelope.data?.key || {};
  return {
    messageId: String(key.id || ''),
    remoteJid: String(key.remoteJid || ''),
    status: String(
      nested.status || nested.message?.status || envelope.data?.status || 'UNKNOWN',
    ).toUpperCase(),
  };
}

function providerErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') return '';
  const value = payload as Record<string, unknown>;
  const response = value.response;
  const candidates = [
    value.message,
    value.error,
    response && typeof response === 'object'
      ? (response as Record<string, unknown>).message
      : null,
    value.raw,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().slice(0, 500);
    if (Array.isArray(candidate) && candidate.length) {
      return candidate.map((item) => String(item)).join('; ').slice(0, 500);
    }
  }
  return '';
}

async function evolutionRequest(
  apiUrl: string,
  apiKey: string,
  message: string,
  mentioned: string[],
  schema: EvolutionAttempt['schema'],
) {
  const body = schema === 'documented'
    ? {
        number: OFFICIAL_GROUP_ID,
        textMessage: { text: message },
        delay: 1200,
        linkPreview: false,
        mentioned,
      }
    : {
        number: OFFICIAL_GROUP_ID,
        text: message,
        delay: 1200,
        linkPreview: false,
        mentionsEveryOne: false,
        mentioned,
      };

  const response = await fetch(
    `${apiUrl}/message/sendText/${encodeURIComponent(OFFICIAL_INSTANCE)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(25000),
    },
  );

  return {
    schema,
    status: response.status,
    ok: response.ok,
    payload: await readJson(response),
  } satisfies EvolutionAttempt;
}

async function sendBirthdayMessage(
  apiUrl: string,
  apiKey: string,
  message: string,
  mentioned: string[],
) {
  const attempts: EvolutionAttempt[] = [];

  const documented = await evolutionRequest(apiUrl, apiKey, message, mentioned, 'documented');
  attempts.push(documented);
  if (documented.status !== 400) return { final: documented, attempts };

  const legacy = await evolutionRequest(apiUrl, apiKey, message, mentioned, 'legacy');
  attempts.push(legacy);
  return { final: legacy, attempts };
}

export async function POST(request: Request) {
  const service = serviceClient();
  if (!service) {
    return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  }

  const apiUrl = String(process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  const apiKey = process.env.EVOLUTION_API_KEY || '';
  const configuredInstance = process.env.EVOLUTION_INSTANCE || '';
  const configuredGroup = process.env.EVOLUTION_GROUP_ID || process.env.EVOLUTION_TEST_GROUP_ID || '';

  if (configuredInstance !== OFFICIAL_INSTANCE || configuredGroup !== OFFICIAL_GROUP_ID) {
    return NextResponse.json(
      { error: 'O envio oficial está bloqueado porque a instância ou o grupo da Vercel não correspondem à CEAMI.' },
      { status: 503 },
    );
  }

  if (!apiUrl || !apiKey) {
    return NextResponse.json({ error: 'Evolution não configurada na Vercel.' }, { status: 503 });
  }

  let body: { force?: boolean; source?: 'automatic' | 'manual' } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {}

  const source = body.source === 'manual' ? 'manual' : 'automatic';
  const force = Boolean(body.force);
  const today = brazilDate();

  try {
    let members = await loadTodayBirthdays(service);

    if (!members.length) {
      await service
        .from('birthday_automation_settings')
        .update({
          last_sent_date: today.date,
          last_sent_at: new Date().toISOString(),
          last_status: 'no_birthdays',
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 'default');

      return NextResponse.json({ ok: true, skipped: 'no_birthdays' });
    }

    if (!force) {
      const { data: previous, error: lookupError } = await service
        .from('birthday_messages')
        .select('id')
        .eq('send_date', today.date)
        .eq('group_id', OFFICIAL_GROUP_ID)
        .in('message_type', ['today', 'automatic', 'manual'])
        .in('status', ['sent', 'queued', 'accepted'])
        .limit(1);

      if (lookupError) throw new Error(lookupError.message);
      if (previous?.length) {
        return NextResponse.json({ ok: true, skipped: 'already_sent' });
      }
    }

    members = await resolveMentions(members, apiUrl, apiKey);
    const names = members.map((member) => member.name);
    const mentioned = [...new Set(
      members
        .map((member) => member.mentionJid)
        .filter((jid): jid is string => typeof jid === 'string' && isValidMentionJid(jid)),
    )];
    const message = buildMessage(members);

    const result = await sendBirthdayMessage(apiUrl, apiKey, message, mentioned);
    const providerResponse = result.final.payload;
    const provider = providerEnvelope(providerResponse);
    const rejected = ['ERROR', 'FAILED', 'CANCELED', 'CANCELLED'].includes(provider.status);
    const accepted =
      result.final.ok &&
      Boolean(provider.messageId) &&
      provider.remoteJid === OFFICIAL_GROUP_ID &&
      !rejected;

    const logBase = {
      member_id: members[0].id,
      send_date: today.date,
      group_id: OFFICIAL_GROUP_ID,
      group_name: OFFICIAL_GROUP_NAME,
      message_type: source,
      member_ids: members.map((member) => member.id),
      member_names: names,
      message,
      provider_response: {
        finalSchema: result.final.schema,
        attempts: result.attempts,
      },
    };

    if (!accepted) {
      const providerDetail = providerErrorMessage(providerResponse);
      const reason = !result.final.ok
        ? `Evolution respondeu ${result.final.status}${providerDetail ? `: ${providerDetail}` : ''}.`
        : `A Evolution não confirmou o grupo de destino. Status: ${provider.status}; destino: ${provider.remoteJid || 'não informado'}.`;

      await service.from('birthday_messages').insert({
        ...logBase,
        status: 'failed',
        error_message: reason,
      });

      await service
        .from('birthday_automation_settings')
        .update({
          last_sent_date: null,
          last_sent_at: new Date().toISOString(),
          last_status: 'failed',
          last_error: reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 'default');

      return NextResponse.json(
        {
          error: reason,
          details: providerResponse,
          attemptedSchemas: result.attempts.map((attempt) => ({
            schema: attempt.schema,
            status: attempt.status,
          })),
        },
        { status: 502 },
      );
    }

    const { error: historyError } = await service.from('birthday_messages').insert({
      ...logBase,
      status: 'queued',
      error_message: null,
    });

    await service
      .from('birthday_automation_settings')
      .update({
        last_sent_date: today.date,
        last_sent_at: new Date().toISOString(),
        last_status: 'queued',
        last_error: historyError?.message || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'default');

    return NextResponse.json({
      ok: true,
      accepted: true,
      deliveryStatus: 'queued',
      providerStatus: provider.status,
      messageId: provider.messageId,
      names,
      mentioned,
      groupId: OFFICIAL_GROUP_ID,
      groupName: OFFICIAL_GROUP_NAME,
      schemaUsed: result.final.schema,
      historySaved: !historyError,
      historyError: historyError?.message || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível enviar.';

    await service
      .from('birthday_automation_settings')
      .update({
        last_sent_date: null,
        last_sent_at: new Date().toISOString(),
        last_status: 'failed',
        last_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'default');

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
