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
  JID?: JidValue;
  LID?: JidValue;
  phoneNumber?: string;
  PhoneNumber?: string;
  phone?: string;
  participantAlt?: string;
};

type ParticipantPayload =
  | GroupParticipant[]
  | {
      participants?: GroupParticipant[];
      participantsData?: GroupParticipant[];
      data?:
        | GroupParticipant[]
        | {
            participants?: GroupParticipant[];
            participantsData?: GroupParticipant[];
          };
      response?: GroupParticipant[] | { participants?: GroupParticipant[] };
    };

type ProviderEnvelope = {
  key?: { id?: string; remoteJid?: string };
  status?: string;
  message?: { key?: { id?: string; remoteJid?: string }; status?: string };
  data?: { key?: { id?: string; remoteJid?: string }; status?: string };
  response?: {
    key?: { id?: string; remoteJid?: string };
    status?: string;
    message?: { key?: { id?: string; remoteJid?: string }; status?: string } | unknown;
  };
};

type EvolutionAttempt = {
  mode: 'with_mentions' | 'without_mentions';
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

function participantJids(participant: GroupParticipant) {
  return [
    participant.id,
    participant.jid,
    participant.remoteJid,
    participant.JID,
    participant.LID,
  ]
    .map(normalizeJid)
    .filter(Boolean);
}

function participantPhones(participant: GroupParticipant) {
  const candidates: unknown[] = [
    participant.phoneNumber,
    participant.PhoneNumber,
    participant.phone,
    participant.participantAlt,
    ...participantJids(participant)
      .filter((jid) => !jid.endsWith('@lid'))
      .map((jid) => jid.split('@')[0]),
  ];

  const phones = new Set<string>();

  for (const candidate of candidates) {
    const normalized = normalizeBrazilPhone(String(candidate || '')) || onlyDigits(candidate);
    if (!normalized) continue;
    for (const variant of phoneVariants(normalized)) phones.add(variant);
  }

  return phones;
}

function toBirthdayMember(member: MemberRow): BirthdayMember {
  const phone = normalizeBrazilPhone(member.phone);

  return {
    id: member.id,
    name: titleCase(member.full_name),
    phone,
    mentionJid: null,
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
    .filter(
      (member) =>
        String(member.status || 'ativo').toLocaleLowerCase('pt-BR') !== 'inativo',
    )
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

function extractParticipants(payload: ParticipantPayload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.participants)) return payload.participants;
  if (Array.isArray(payload.participantsData)) return payload.participantsData;
  if (Array.isArray(payload.data)) return payload.data;

  if (payload.data && !Array.isArray(payload.data)) {
    if (Array.isArray(payload.data.participants)) return payload.data.participants;
    if (Array.isArray(payload.data.participantsData)) return payload.data.participantsData;
  }

  if (Array.isArray(payload.response)) return payload.response;
  if (payload.response && !Array.isArray(payload.response)) {
    if (Array.isArray(payload.response.participants)) return payload.response.participants;
  }

  return [];
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

    return extractParticipants((await response.json()) as ParticipantPayload);
  } catch {
    return [] as GroupParticipant[];
  }
}

async function resolveMentions(
  members: BirthdayMember[],
  apiUrl: string,
  apiKey: string,
) {
  const participants = await fetchParticipants(apiUrl, apiKey);

  return members.map((member) => {
    if (!member.phone) return member;

    const wanted = phoneVariants(member.phone);
    const isParticipant = participants.some((participant) => {
      const available = participantPhones(participant);
      return [...wanted].some((phone) => available.has(phone));
    });

    return {
      ...member,
      mentionJid: isParticipant ? `${member.phone}@s.whatsapp.net` : null,
    };
  });
}

function providerEnvelope(payload: unknown) {
  const envelope = (payload || {}) as ProviderEnvelope;
  const nested = envelope.response || envelope;
  const nestedMessage =
    nested.message && typeof nested.message === 'object'
      ? (nested.message as { key?: { id?: string; remoteJid?: string }; status?: string })
      : undefined;
  const key = nested.key || nestedMessage?.key || envelope.data?.key || {};

  return {
    messageId: String(key.id || ''),
    remoteJid: String(key.remoteJid || ''),
    status: String(
      nested.status || nestedMessage?.status || envelope.data?.status || 'UNKNOWN',
    ).toUpperCase(),
  };
}

function collectErrorStrings(value: unknown, output: string[], depth = 0) {
  if (depth > 6 || value === null || value === undefined) return;

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (normalized && normalized.toLowerCase() !== 'bad request') output.push(normalized);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectErrorStrings(item, output, depth + 1);
    return;
  }

  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    const priorityKeys = ['message', 'error', 'response', 'details', 'raw'];

    for (const key of priorityKeys) {
      if (key in object) collectErrorStrings(object[key], output, depth + 1);
    }
  }
}

function providerErrorMessage(payload: unknown) {
  const errors: string[] = [];
  collectErrorStrings(payload, errors);
  return [...new Set(errors)].join('; ').slice(0, 700);
}

async function sendLegacyText(
  apiUrl: string,
  apiKey: string,
  message: string,
  mentioned: string[],
  mode: EvolutionAttempt['mode'],
) {
  const payload = {
    number: OFFICIAL_GROUP_ID,
    text: message,
    delay: 1200,
    linkPreview: false,
    mentionsEveryOne: false,
    ...(mentioned.length > 0 ? { mentioned } : {}),
  };

  const response = await fetch(
    `${apiUrl}/message/sendText/${encodeURIComponent(OFFICIAL_INSTANCE)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: AbortSignal.timeout(25000),
    },
  );

  return {
    mode,
    status: response.status,
    ok: response.ok,
    payload: await readJson(response),
  } satisfies EvolutionAttempt;
}

async function sendBirthdayMessage(
  apiUrl: string,
  apiKey: string,
  members: BirthdayMember[],
) {
  const mentioned = [...new Set(
    members
      .map((member) => member.mentionJid)
      .filter((jid): jid is string => typeof jid === 'string' && /^\d+@s\.whatsapp\.net$/.test(jid)),
  )];

  const attempts: EvolutionAttempt[] = [];
  const messageWithMentions = buildMessage(members);
  const first = await sendLegacyText(
    apiUrl,
    apiKey,
    messageWithMentions,
    mentioned,
    'with_mentions',
  );
  attempts.push(first);

  if (first.status !== 400 || mentioned.length === 0) {
    return {
      final: first,
      attempts,
      message: messageWithMentions,
      mentioned,
      sentWithoutMentions: false,
    };
  }

  const membersWithoutMentions = members.map((member) => ({ ...member, mentionJid: null }));
  const messageWithoutMentions = buildMessage(membersWithoutMentions);
  const fallback = await sendLegacyText(
    apiUrl,
    apiKey,
    messageWithoutMentions,
    [],
    'without_mentions',
  );
  attempts.push(fallback);

  return {
    final: fallback,
    attempts,
    message: messageWithoutMentions,
    mentioned: [] as string[],
    sentWithoutMentions: fallback.ok,
  };
}

export async function POST(request: Request) {
  const service = serviceClient();

  if (!service) {
    return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  }

  const apiUrl = String(process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  const apiKey = process.env.EVOLUTION_API_KEY || '';
  const configuredInstance = process.env.EVOLUTION_INSTANCE || '';
  const configuredGroup =
    process.env.EVOLUTION_GROUP_ID || process.env.EVOLUTION_TEST_GROUP_ID || '';

  if (configuredInstance !== OFFICIAL_INSTANCE || configuredGroup !== OFFICIAL_GROUP_ID) {
    return NextResponse.json(
      {
        error:
          'O envio oficial está bloqueado porque a instância ou o grupo da Vercel não correspondem à CEAMI.',
      },
      { status: 503 },
    );
  }

  if (!apiUrl || !apiKey) {
    return NextResponse.json(
      { error: 'Evolution não configurada na Vercel.' },
      { status: 503 },
    );
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
    const sendResult = await sendBirthdayMessage(apiUrl, apiKey, members);
    const providerResponse = sendResult.final.payload;
    const provider = providerEnvelope(providerResponse);
    const rejected = ['ERROR', 'FAILED', 'CANCELED', 'CANCELLED'].includes(
      provider.status,
    );
    const accepted =
      sendResult.final.ok &&
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
      message: sendResult.message,
      provider_response: {
        attempts: sendResult.attempts,
        sentWithoutMentions: sendResult.sentWithoutMentions,
      },
    };

    if (!accepted) {
      const providerDetail = providerErrorMessage(providerResponse);
      const reason = !sendResult.final.ok
        ? `Evolution respondeu ${sendResult.final.status}${providerDetail ? `: ${providerDetail}` : ''}.`
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
          attempts: sendResult.attempts.map((attempt) => ({
            mode: attempt.mode,
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
      mentioned: sendResult.mentioned,
      sentWithoutMentions: sendResult.sentWithoutMentions,
      groupId: OFFICIAL_GROUP_ID,
      groupName: OFFICIAL_GROUP_NAME,
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
