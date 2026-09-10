import type { SupabaseClient } from '@supabase/supabase-js';
import { getEvolutionConfig } from './evolution';

type ConnectionStateResult = {
  ok: boolean;
  open: boolean;
  state: string;
  httpStatus: number;
  error?: string;
};

type DeleteMessageResult = {
  ok: boolean;
  httpStatus: number;
  payload: unknown;
  error?: string;
};

type AutomationRunRow = {
  id: string;
  scheduled_date: string;
  destination_group_id: string;
  provider_message_id: string | null;
  metadata: Record<string, unknown> | null;
};

async function readPayload(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text.slice(0, 1200) };
  }
}

export async function getEvolutionConnectionState(): Promise<ConnectionStateResult> {
  const config = getEvolutionConfig();
  if (!config.apiUrl || !config.apiKey || !config.instance) {
    return {
      ok: false,
      open: false,
      state: 'not_configured',
      httpStatus: 503,
      error: 'Evolution não configurada.',
    };
  }

  try {
    const response = await fetch(
      `${config.apiUrl}/instance/connectionState/${encodeURIComponent(config.instance)}`,
      {
        method: 'GET',
        headers: { apikey: config.apiKey },
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      },
    );
    const payload = (await readPayload(response)) as
      | { state?: unknown; instance?: { state?: unknown } }
      | null;
    const state = String(payload?.instance?.state ?? payload?.state ?? '').toLocaleLowerCase('en-US');
    const open = response.ok && state === 'open';

    return {
      ok: response.ok,
      open,
      state: state || 'unknown',
      httpStatus: response.status,
      ...(open
        ? {}
        : {
            error: response.ok
              ? `Sessão WhatsApp não está aberta (estado: ${state || 'desconhecido'}).`
              : `Não foi possível confirmar a sessão WhatsApp (HTTP ${response.status}).`,
          }),
    };
  } catch (error) {
    return {
      ok: false,
      open: false,
      state: 'unreachable',
      httpStatus: 502,
      error: error instanceof Error ? error.message : 'Falha ao consultar a Evolution.',
    };
  }
}

export async function deleteEvolutionMessageForEveryone(input: {
  messageId: string;
  remoteJid: string;
}): Promise<DeleteMessageResult> {
  const config = getEvolutionConfig();
  if (!config.apiUrl || !config.apiKey || !config.instance) {
    return { ok: false, httpStatus: 503, payload: null, error: 'Evolution não configurada.' };
  }

  try {
    const response = await fetch(
      `${config.apiUrl}/chat/deleteMessageForEveryone/${encodeURIComponent(config.instance)}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          apikey: config.apiKey,
        },
        body: JSON.stringify({
          id: input.messageId,
          remoteJid: input.remoteJid,
          fromMe: true,
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(12_000),
      },
    );
    const payload = await readPayload(response);
    return {
      ok: response.ok,
      httpStatus: response.status,
      payload,
      ...(response.ok ? {} : { error: `Evolution respondeu HTTP ${response.status}.` }),
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: 502,
      payload: null,
      error: error instanceof Error ? error.message : 'Falha ao excluir mensagem na Evolution.',
    };
  }
}

const STALE_SCREENSHOT_DATES = ['2026-09-05', '2026-09-06'];

export async function cleanupStaleAutomationMessages(service: SupabaseClient) {
  const { data, error } = await service
    .from('automation_runs')
    .select('id,scheduled_date,destination_group_id,provider_message_id,metadata')
    .eq('run_type', 'automatic')
    .in('scheduled_date', STALE_SCREENSHOT_DATES)
    .not('provider_message_id', 'is', null)
    .order('created_at', { ascending: true });

  if (error) {
    return [{ ok: false, error: error.message }];
  }

  const results: Array<Record<string, unknown>> = [];
  for (const row of (data || []) as AutomationRunRow[]) {
    const metadata = row.metadata || {};
    if (metadata.staleCleanupAttemptedAt) continue;
    if (!row.provider_message_id || !row.destination_group_id) continue;

    const deletion = await deleteEvolutionMessageForEveryone({
      messageId: row.provider_message_id,
      remoteJid: row.destination_group_id,
    });

    const attemptedAt = new Date().toISOString();
    const nextMetadata = {
      ...metadata,
      staleCleanupAttemptedAt: attemptedAt,
      staleCleanupReason: 'Mensagens antigas de 05/09 e 06/09 liberadas fora da data em 10/09/2026.',
      staleCleanupDeleted: deletion.ok,
      staleCleanupHttpStatus: deletion.httpStatus,
      ...(deletion.error ? { staleCleanupError: deletion.error } : {}),
    };

    // Em falhas transitórias, não marca como tentado para permitir nova tentativa no próximo cron.
    if (deletion.httpStatus >= 500) {
      delete nextMetadata.staleCleanupAttemptedAt;
    }

    await service.from('automation_runs').update({ metadata: nextMetadata }).eq('id', row.id);

    results.push({
      id: row.id,
      scheduledDate: row.scheduled_date,
      messageId: row.provider_message_id,
      deleted: deletion.ok,
      httpStatus: deletion.httpStatus,
      error: deletion.error || null,
    });
  }

  return results;
}
