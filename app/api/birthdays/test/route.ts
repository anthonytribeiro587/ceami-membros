import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const TIME_ZONE = 'America/Sao_Paulo';

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

type GroupParticipant = {
  id?: string;
  jid?: string;
  remoteJid?: string;
  phoneNumber?: string;
  phone?: string;
};

type EvolutionGroup = {
  id?: string;
  jid?: string;
  remoteJid?: string;
  subject?: string;
  name?: string;
};

type ProviderEnvelope = {
  key?: { id?: string; remoteJid?: string };
  status?: string;
  message?: { key?: { id?: string; remoteJid?: string }; status?: string };
  data?: { key?: { id?: string; remoteJid?: string }; status?: string };
};

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
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

function participantJid(participant: GroupParticipant) {
  return participant.id || participant.jid || participant.remoteJid || '';
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

function isActive(member: MemberRow) {
  return String(member.status || 'ativo').toLocaleLowerCase('pt-BR') !== 'inativo';
}

function getBrazilDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === 'year')?.value || '';
  const month = parts.find((part) => part.type === 'month')?.value || '';
  const day = parts.find((part) => part.type === 'day')?.value || '';

  return {
    date: `${year}-${month}-${day}`,
    monthDay: `${month}-${day}`,
    displayDate: `${day}/${month}/${year}`,
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

async function loadMembers(service: SupabaseClient) {
  const { data, error } = await service
    .from('members')
    .select('id, full_name, phone, birth_date, status')
    .order('full_name', { ascending: true });

  if (error) throw new Error(error.message);
  return ((data || []) as MemberRow[]).filter(isActive);
}

async function getTodayBirthdays(service: SupabaseClient) {
  const { monthDay } = getBrazilDate();
  const members = await loadMembers(service);
  return members
    .filter((member) => member.birth_date?.slice(5) === monthDay)
    .map(toBirthdayMember);
}

async function getSimulationMembers(service: SupabaseClient) {
  const members = await loadMembers(service);
  return members
    .map(toBirthdayMember)
    .filter((member) => Boolean(member.phone))
    .map(({ id, name, phone }) => ({ id, name, phone }));
}

function groupJid(group: EvolutionGroup) {
  return group.id || group.remoteJid || group.jid || '';
}

function extractGroups(payload: unknown): EvolutionGroup[] {
  if (Array.isArray(payload)) return payload as EvolutionGroup[];
  if (!payload || typeof payload !== 'object') return [];

  const value = payload as {
    groups?: EvolutionGroup[];
    data?: EvolutionGroup[] | { groups?: EvolutionGroup[] };
    response?: EvolutionGroup[];
  };

  if (Array.isArray(value.groups)) return value.groups;
  if (Array.isArray(value.data)) return value.data;
  if (value.data && !Array.isArray(value.data) && Array.isArray(value.data.groups)) {
    return value.data.groups;
  }
  if (Array.isArray(value.response)) return value.response;
  return [];
}

async function validateEvolutionGroup(
  apiUrl: string,
  apiKey: string,
  instance: string,
  groupId: string,
) {
  const response = await fetch(
    `${apiUrl}/group/fetchAllGroups/${encodeURIComponent(instance)}?getParticipants=false`,
    {
      method: 'GET',
      headers: { apikey: apiKey },
      cache: 'no-store',
    },
  );

  const responseText = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(responseText);
  } catch {
    payload = { raw: responseText.slice(0, 1000) };
  }

  if (!response.ok) {
    return {
      ok: false,
      groupName: '',
      error: `A Evolution não conseguiu listar os grupos da instância “${instance}” (${response.status}).`,
      details: payload,
    };
  }

  const groups = extractGroups(payload);
  const group = groups.find((item) => groupJid(item) === groupId);

  if (!group) {
    return {
      ok: false,
      groupName: '',
      error: `A instância “${instance}” não encontrou o grupo configurado. Confira EVOLUTION_INSTANCE, EVOLUTION_API_KEY e EVOLUTION_GROUP_ID na Vercel.`,
      details: { instance, groupId, groupsFound: groups.length },
    };
  }

  return {
    ok: true,
    groupName: group.subject || group.name || 'CEAMI GRUPO',
    error: '',
    details: null,
  };
}

async function fetchGroupParticipants(
  apiUrl: string,
  apiKey: string,
  instance: string,
  groupId: string,
) {
  const response = await fetch(
    `${apiUrl}/group/participants/${encodeURIComponent(instance)}?groupJid=${encodeURIComponent(groupId)}`,
    {
      method: 'GET',
      headers: { apikey: apiKey },
      cache: 'no-store',
    },
  );

  if (!response.ok) return [] as GroupParticipant[];

  const payload = (await response.json()) as
    | GroupParticipant[]
    | { participants?: GroupParticipant[]; data?: { participants?: GroupParticipant[] } };

  if (Array.isArray(payload)) return payload;
  return payload.participants || payload.data?.participants || [];
}

async function resolveGroupMentions(
  members: BirthdayMember[],
  apiUrl: string,
  apiKey: string,
  instance: string,
  groupId: string,
) {
  const participants = await fetchGroupParticipants(apiUrl, apiKey, instance, groupId);

  return members.map((member) => {
    if (!member.phone) return { ...member, mentionJid: null };

    const wanted = phoneVariants(member.phone);
    const participant = participants.find((item) => {
      const available = participantPhones(item);
      return [...wanted].some((phone) => available.has(phone));
    });

    const exactJid = participant ? participantJid(participant) : '';
    return {
      ...member,
      mentionJid: exactJid || `${member.phone}@s.whatsapp.net`,
    };
  });
}

function readProviderEnvelope(payload: unknown) {
  const envelope = (payload || {}) as ProviderEnvelope;
  const key = envelope.key || envelope.message?.key || envelope.data?.key || {};
  const status = String(envelope.status || envelope.message?.status || envelope.data?.status || '').toUpperCase();

  return {
    messageId: String(key.id || ''),
    remoteJid: String(key.remoteJid || ''),
    providerStatus: status || 'UNKNOWN',
  };
}

export async function GET() {
  const service = getServiceClient();
  if (!service) {
    return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  }

  try {
    const [birthdays, simulationMembers] = await Promise.all([
      getTodayBirthdays(service),
      getSimulationMembers(service),
    ]);
    const today = getBrazilDate();

    return NextResponse.json({
      date: today.date,
      displayDate: today.displayDate,
      birthdays: birthdays.map(({ id, name, phone }) => ({ id, name, phone })),
      simulationMembers,
      configuration: {
        apiUrlConfigured: Boolean(process.env.EVOLUTION_API_URL),
        instance: process.env.EVOLUTION_INSTANCE || '',
        groupId: process.env.EVOLUTION_GROUP_ID || process.env.EVOLUTION_TEST_GROUP_ID || '',
        apiKeyConfigured: Boolean(process.env.EVOLUTION_API_KEY),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao consultar aniversariantes.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const service = getServiceClient();
  if (!service) {
    return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  }

  const apiUrl = String(process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  const groupId = process.env.EVOLUTION_GROUP_ID || process.env.EVOLUTION_TEST_GROUP_ID;

  if (!apiUrl || !apiKey || !instance || !groupId) {
    return NextResponse.json(
      { error: 'Configure EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE e EVOLUTION_GROUP_ID na Vercel.' },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as { mode?: string; testMemberId?: string; force?: boolean };
    const mode: 'today' | 'simulation' = body.mode === 'today' ? 'today' : 'simulation';
    const force = Boolean(body.force);
    const today = getBrazilDate();
    let members: BirthdayMember[];

    const groupCheck = await validateEvolutionGroup(apiUrl, apiKey, instance, groupId);
    if (!groupCheck.ok) {
      if (mode === 'today') {
        await service.from('birthday_automation_settings').update({
          last_sent_at: new Date().toISOString(),
          last_status: 'failed',
          last_error: groupCheck.error,
          updated_at: new Date().toISOString(),
        }).eq('id', 'default');
      }

      return NextResponse.json(
        {
          error: groupCheck.error,
          details: groupCheck.details,
          instance,
          groupId,
        },
        { status: 409 },
      );
    }

    if (mode === 'today') {
      members = await getTodayBirthdays(service);
      if (!members.length) {
        return NextResponse.json({ error: 'Não há aniversariantes hoje.' }, { status: 400 });
      }

      if (!force) {
        const { data: previous, error: lookupError } = await service
          .from('birthday_messages')
          .select('id')
          .eq('send_date', today.date)
          .eq('group_id', groupId)
          .in('message_type', ['today', 'automatic'])
          .in('status', ['sent', 'queued', 'accepted'])
          .limit(1);

        if (lookupError) {
          return NextResponse.json(
            {
              error: 'O histórico ainda não está atualizado. Execute a migration de correção antes do envio oficial.',
              details: lookupError.message,
            },
            { status: 503 },
          );
        }

        if (previous && previous.length > 0) {
          return NextResponse.json({ error: 'A mensagem de hoje já foi aceita anteriormente. Use o reenvio manual apenas se ela realmente não apareceu no grupo.' }, { status: 409 });
        }
      }
    } else {
      const testMemberId = String(body.testMemberId || '').trim();
      if (!testMemberId) {
        return NextResponse.json({ error: 'Selecione o membro usado na simulação.' }, { status: 400 });
      }

      const { data, error } = await service
        .from('members')
        .select('id, full_name, phone, birth_date, status')
        .eq('id', testMemberId)
        .maybeSingle();

      if (error || !data) {
        return NextResponse.json({ error: 'Membro não encontrado.' }, { status: 404 });
      }

      const member = toBirthdayMember(data as MemberRow);
      if (!member.phone) {
        return NextResponse.json(
          { error: 'Esse membro não possui um WhatsApp válido para ser mencionado.' },
          { status: 400 },
        );
      }

      members = [member];
    }

    members = await resolveGroupMentions(members, apiUrl, apiKey, instance, groupId);

    const names = members.map((member) => member.name);
    const mentioned = members
      .map((member) => member.mentionJid)
      .filter((jid): jid is string => Boolean(jid));
    const message = buildMessage(members);

    const response = await fetch(`${apiUrl}/message/sendText/${encodeURIComponent(instance)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({
        number: groupId,
        text: message,
        delay: 1200,
        linkPreview: false,
        mentionsEveryOne: false,
        mentioned,
      }),
      cache: 'no-store',
    });

    const responseText = await response.text();
    let providerResponse: unknown;
    try {
      providerResponse = JSON.parse(responseText);
    } catch {
      providerResponse = { raw: responseText.slice(0, 3000) };
    }

    const provider = readProviderEnvelope(providerResponse);
    const rejectedState = ['ERROR', 'FAILED', 'CANCELED', 'CANCELLED'].includes(provider.providerStatus);
    const accepted =
      response.ok &&
      Boolean(provider.messageId) &&
      provider.remoteJid === groupId &&
      !rejectedState;

    const logBase = {
      member_id: members[0]?.id,
      send_date: today.date,
      group_id: groupId,
      group_name: groupCheck.groupName,
      message_type: mode,
      member_ids: members.map((member) => member.id),
      member_names: names,
      message,
      provider_response: providerResponse,
    };

    if (!accepted) {
      const reason = !response.ok
        ? `Evolution respondeu ${response.status}`
        : `A Evolution não confirmou o destino do grupo. Status: ${provider.providerStatus}; destino: ${provider.remoteJid || 'não informado'}.`;

      await service.from('birthday_messages').insert({
        ...logBase,
        status: 'failed',
        error_message: reason,
      });

      if (mode === 'today') {
        await service.from('birthday_automation_settings').update({
          last_sent_date: null,
          last_sent_at: new Date().toISOString(),
          last_status: 'failed',
          last_error: reason,
          updated_at: new Date().toISOString(),
        }).eq('id', 'default');
      }

      return NextResponse.json(
        {
          error: reason,
          details: providerResponse,
          instance,
          groupId,
        },
        { status: 502 },
      );
    }

    const { error: logError } = await service.from('birthday_messages').insert({
      ...logBase,
      status: 'queued',
      error_message: null,
    });

    if (mode === 'today') {
      await service.from('birthday_automation_settings').update({
        last_sent_date: today.date,
        last_sent_at: new Date().toISOString(),
        last_status: 'queued',
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq('id', 'default');
    }

    return NextResponse.json({
      ok: true,
      accepted: true,
      deliveryStatus: 'queued',
      providerStatus: provider.providerStatus,
      messageId: provider.messageId,
      message,
      names,
      mentioned,
      instance,
      groupId,
      groupName: groupCheck.groupName,
      historySaved: !logError,
      historyError: logError?.message || null,
      forcedRetry: force,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Não foi possível enviar.' },
      { status: 500 },
    );
  }
}
