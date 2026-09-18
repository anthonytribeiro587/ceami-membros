import { evolutionConfigured, getEvolutionConfig } from '@/lib/server/evolution';

export type EvolutionPhoneSendResult = {
  ok: boolean;
  httpStatus: number;
  messageId: string;
  remoteJid: string;
  providerStatus: string;
  errorMessage: string;
};

function normalizeBrazilPhone(value: unknown) {
  let digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  digits = digits.replace(/^0+/, '');
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits.length >= 12 && digits.length <= 13 ? digits : '';
}

function providerEnvelope(payload: unknown) {
  const root = (payload || {}) as Record<string, unknown>;
  const response =
    root.response && typeof root.response === 'object'
      ? (root.response as Record<string, unknown>)
      : root;
  const data =
    root.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>)
      : {};
  const message =
    response.message && typeof response.message === 'object'
      ? (response.message as Record<string, unknown>)
      : {};
  const key =
    (response.key && typeof response.key === 'object'
      ? response.key
      : message.key && typeof message.key === 'object'
        ? message.key
        : data.key && typeof data.key === 'object'
          ? data.key
          : {}) as Record<string, unknown>;

  return {
    messageId: String(key.id || ''),
    remoteJid: String(key.remoteJid || ''),
    status: String(response.status || message.status || data.status || 'UNKNOWN').toUpperCase(),
  };
}

async function readPayload(response: Response) {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { raw: raw.slice(0, 1000) };
  }
}

export async function sendEvolutionPhoneText(input: {
  phone: string;
  text: string;
  delay?: number;
}): Promise<EvolutionPhoneSendResult> {
  const config = getEvolutionConfig();
  const phone = normalizeBrazilPhone(input.phone);

  if (!evolutionConfigured(config)) {
    return {
      ok: false,
      httpStatus: 503,
      messageId: '',
      remoteJid: '',
      providerStatus: 'NOT_CONFIGURED',
      errorMessage: 'Evolution não configurada.',
    };
  }

  if (!phone) {
    return {
      ok: false,
      httpStatus: 400,
      messageId: '',
      remoteJid: '',
      providerStatus: 'INVALID_PHONE',
      errorMessage: 'Telefone inválido.',
    };
  }

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
          number: phone,
          text: input.text,
          delay: input.delay ?? 900,
          linkPreview: false,
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      },
    );

    const payload = await readPayload(response);
    const envelope = providerEnvelope(payload);
    const rejected = ['ERROR', 'FAILED', 'CANCELED', 'CANCELLED'].includes(envelope.status);
    const ok = response.ok && Boolean(envelope.messageId) && !rejected;

    return {
      ok,
      httpStatus: response.status,
      messageId: envelope.messageId,
      remoteJid: envelope.remoteJid,
      providerStatus: envelope.status,
      errorMessage: ok
        ? ''
        : `Evolution não confirmou o envio (${response.status} / ${envelope.status}).`,
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: 502,
      messageId: '',
      remoteJid: '',
      providerStatus: 'REQUEST_FAILED',
      errorMessage:
        error instanceof Error ? error.message : 'Falha ao acessar a Evolution.',
    };
  }
}
