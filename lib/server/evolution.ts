export type EvolutionConfig = {
  apiUrl: string;
  apiKey: string;
  instance: string;
  defaultGroupId: string;
};

type ProviderEnvelope = {
  key?: { id?: string; remoteJid?: string };
  status?: string;
  message?: { key?: { id?: string; remoteJid?: string }; status?: string } | unknown;
  data?: { key?: { id?: string; remoteJid?: string }; status?: string };
  response?: {
    key?: { id?: string; remoteJid?: string };
    status?: string;
    message?: { key?: { id?: string; remoteJid?: string }; status?: string } | unknown;
  };
};

type JidValue =
  | string
  | { _serialized?: string; user?: string; server?: string }
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
      data?: GroupParticipant[] | { participants?: GroupParticipant[]; participantsData?: GroupParticipant[] };
      response?: GroupParticipant[] | { participants?: GroupParticipant[] };
    };

export type EvolutionSendResult = {
  ok: boolean;
  httpStatus: number;
  messageId: string;
  remoteJid: string;
  providerStatus: string;
  payload: unknown;
  errorMessage: string;
};

export function getEvolutionConfig(): EvolutionConfig {
  return {
    apiUrl: String(process.env.EVOLUTION_API_URL || '').replace(/\/$/, ''),
    apiKey: process.env.EVOLUTION_API_KEY || '',
    instance: process.env.EVOLUTION_INSTANCE || '',
    defaultGroupId:
      process.env.EVOLUTION_GROUP_ID || process.env.EVOLUTION_TEST_GROUP_ID || '',
  };
}

export function evolutionConfigured(config = getEvolutionConfig()) {
  return Boolean(config.apiUrl && config.apiKey && config.instance);
}

function readProviderEnvelope(payload: unknown) {
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
    providerStatus: String(
      nested.status || nestedMessage?.status || envelope.data?.status || 'UNKNOWN',
    ).toUpperCase(),
  };
}

function collectErrorStrings(value: unknown, output: string[], depth = 0) {
  if (depth > 6 || value === null || value === undefined) return;

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (normalized && normalized.toLocaleLowerCase('pt-BR') !== 'bad request') {
      output.push(normalized);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectErrorStrings(item, output, depth + 1);
    return;
  }

  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    for (const key of ['message', 'error', 'response', 'details', 'raw']) {
      if (key in object) collectErrorStrings(object[key], output, depth + 1);
    }
  }
}

function providerErrorMessage(payload: unknown) {
  const errors: string[] = [];
  collectErrorStrings(payload, errors);
  return [...new Set(errors)].join('; ').slice(0, 700);
}

async function readPayload(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text.slice(0, 3000) };
  }
}

export async function sendEvolutionText(input: {
  groupId: string;
  text: string;
  mentioned?: string[];
  delay?: number;
}): Promise<EvolutionSendResult> {
  const config = getEvolutionConfig();

  if (!evolutionConfigured(config)) {
    return {
      ok: false,
      httpStatus: 503,
      messageId: '',
      remoteJid: '',
      providerStatus: 'NOT_CONFIGURED',
      payload: null,
      errorMessage:
        'Configure EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE na Vercel.',
    };
  }

  if (!/^\d+@g\.us$/.test(input.groupId)) {
    return {
      ok: false,
      httpStatus: 400,
      messageId: '',
      remoteJid: '',
      providerStatus: 'INVALID_GROUP',
      payload: null,
      errorMessage: 'O identificador do grupo é inválido. Ele deve terminar em @g.us.',
    };
  }

  const mentioned = [...new Set(input.mentioned || [])].filter((jid) =>
    /^\d+@s\.whatsapp\.net$/.test(jid),
  );

  try {
    const response = await fetch(
      `${config.apiUrl}/message/sendText/${encodeURIComponent(config.instance)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: config.apiKey,
        },
        body: JSON.stringify({
          number: input.groupId,
          text: input.text,
          delay: input.delay ?? 1200,
          linkPreview: false,
          mentionsEveryOne: false,
          ...(mentioned.length ? { mentioned } : {}),
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(25_000),
      },
    );

    const payload = await readPayload(response);
    const envelope = readProviderEnvelope(payload);
    const rejected = ['ERROR', 'FAILED', 'CANCELED', 'CANCELLED'].includes(
      envelope.providerStatus,
    );
    const accepted =
      response.ok &&
      Boolean(envelope.messageId) &&
      envelope.remoteJid === input.groupId &&
      !rejected;

    const detail = providerErrorMessage(payload);
    const errorMessage = accepted
      ? ''
      : !response.ok
        ? `Evolution respondeu ${response.status}${detail ? `: ${detail}` : ''}.`
        : `A Evolution não confirmou o grupo de destino. Status: ${envelope.providerStatus}; destino: ${envelope.remoteJid || 'não informado'}.`;

    return {
      ok: accepted,
      httpStatus: response.status,
      messageId: envelope.messageId,
      remoteJid: envelope.remoteJid,
      providerStatus: envelope.providerStatus,
      payload,
      errorMessage,
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: 502,
      messageId: '',
      remoteJid: '',
      providerStatus: 'REQUEST_FAILED',
      payload: null,
      errorMessage:
        error instanceof Error ? error.message : 'Não foi possível acessar a Evolution.',
    };
  }
}

function normalizeJid(value: JidValue | undefined) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value._serialized === 'string') return value._serialized.trim();
  if (value.user && value.server) return `${value.user}@${value.server}`;
  return '';
}

function onlyDigits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeBrazilPhone(value: unknown) {
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

function participantPhones(participant: GroupParticipant) {
  const jids = [
    participant.id,
    participant.jid,
    participant.remoteJid,
    participant.JID,
    participant.LID,
  ]
    .map(normalizeJid)
    .filter(Boolean);

  const candidates: unknown[] = [
    participant.phoneNumber,
    participant.PhoneNumber,
    participant.phone,
    participant.participantAlt,
    ...jids.filter((jid) => !jid.endsWith('@lid')).map((jid) => jid.split('@')[0]),
  ];

  const phones = new Set<string>();
  for (const candidate of candidates) {
    const normalized = normalizeBrazilPhone(candidate) || onlyDigits(candidate);
    if (!normalized) continue;
    for (const variant of phoneVariants(normalized)) phones.add(variant);
  }
  return phones;
}

export async function resolveGroupMentions(
  groupId: string,
  phones: string[],
): Promise<Map<string, string>> {
  const config = getEvolutionConfig();
  const result = new Map<string, string>();
  if (!evolutionConfigured(config) || !groupId || !phones.length) return result;

  try {
    const response = await fetch(
      `${config.apiUrl}/group/participants/${encodeURIComponent(config.instance)}?groupJid=${encodeURIComponent(groupId)}`,
      {
        headers: { apikey: config.apiKey },
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      },
    );

    if (!response.ok) return result;
    const participants = extractParticipants((await response.json()) as ParticipantPayload);

    for (const rawPhone of phones) {
      const phone = normalizeBrazilPhone(rawPhone);
      if (!phone) continue;
      const wanted = phoneVariants(phone);
      const found = participants.some((participant) => {
        const available = participantPhones(participant);
        return [...wanted].some((variant) => available.has(variant));
      });
      if (found) result.set(rawPhone, `${phone}@s.whatsapp.net`);
    }
  } catch {
    return result;
  }

  return result;
}
