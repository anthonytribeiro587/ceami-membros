import { evolutionConfigured, getEvolutionConfig } from '@/lib/server/evolution';

type DeliveryCheck = {
  confirmed: boolean;
  failed: boolean;
  status: string;
  attempts: number;
};

const SUCCESS_STATUSES = new Set([
  'SERVER_ACK',
  'DELIVERY_ACK',
  'READ',
  'READ_ACK',
  'PLAYED',
  'PLAYED_ACK',
]);

const FAILURE_STATUSES = new Set([
  'ERROR',
  'FAILED',
  'CANCELED',
  'CANCELLED',
]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messageRows(payload: unknown) {
  const root = payload as Record<string, unknown> | null;
  const messages = root?.messages as Record<string, unknown> | unknown[] | undefined;
  if (Array.isArray(messages)) return messages;
  if (messages && typeof messages === 'object' && Array.isArray(messages.records)) {
    return messages.records;
  }
  if (Array.isArray(root?.records)) return root!.records as unknown[];
  return [] as unknown[];
}

function statusFromRecord(record: unknown) {
  if (!record || typeof record !== 'object') return '';
  const row = record as Record<string, unknown>;
  const direct = String(row.status || row.messageStatus || '').toUpperCase();
  if (direct) return direct;

  const updates = Array.isArray(row.MessageUpdate) ? row.MessageUpdate : [];
  for (let index = updates.length - 1; index >= 0; index -= 1) {
    const update = updates[index];
    if (!update || typeof update !== 'object') continue;
    const status = String((update as Record<string, unknown>).status || '').toUpperCase();
    if (status) return status;
  }
  return '';
}

function idFromRecord(record: unknown) {
  if (!record || typeof record !== 'object') return '';
  const row = record as Record<string, unknown>;
  const key = row.key && typeof row.key === 'object'
    ? (row.key as Record<string, unknown>)
    : {};
  return String(key.id || '');
}

async function readMessageStatus(messageId: string, remoteJid: string) {
  const config = getEvolutionConfig();
  if (!evolutionConfigured(config) || !messageId || !remoteJid) return '';

  const response = await fetch(
    `${config.apiUrl}/chat/findMessages/${encodeURIComponent(config.instance)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.apiKey,
      },
      body: JSON.stringify({
        where: { key: { remoteJid } },
        page: 1,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) return '';
  const raw = await response.text();
  let payload: unknown = {};
  try { payload = JSON.parse(raw) as unknown; } catch { return ''; }

  const row = messageRows(payload).find((item) => idFromRecord(item) === messageId);
  return statusFromRecord(row);
}

export async function waitForEvolutionMessageDelivery({
  messageId,
  remoteJid,
  initialStatus = '',
  maxWaitMs = 15_000,
  intervalMs = 2_000,
}: {
  messageId: string;
  remoteJid: string;
  initialStatus?: string;
  maxWaitMs?: number;
  intervalMs?: number;
}): Promise<DeliveryCheck> {
  let status = String(initialStatus || '').toUpperCase();
  if (SUCCESS_STATUSES.has(status)) {
    return { confirmed: true, failed: false, status, attempts: 0 };
  }
  if (FAILURE_STATUSES.has(status)) {
    return { confirmed: false, failed: true, status, attempts: 0 };
  }

  const deadline = Date.now() + maxWaitMs;
  let attempts = 0;

  while (Date.now() < deadline) {
    await sleep(intervalMs);
    attempts += 1;
    try {
      const current = await readMessageStatus(messageId, remoteJid);
      if (current) status = current;
    } catch {
      // Uma falha transitória de consulta não transforma PENDING em sucesso.
    }

    if (SUCCESS_STATUSES.has(status)) {
      return { confirmed: true, failed: false, status, attempts };
    }
    if (FAILURE_STATUSES.has(status)) {
      return { confirmed: false, failed: true, status, attempts };
    }
  }

  return {
    confirmed: false,
    failed: false,
    status: status || 'PENDING',
    attempts,
  };
}
