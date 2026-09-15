import { NextRequest, NextResponse } from 'next/server';
import { runDueAutomations } from '@/lib/server/automation-runner';
import {
  cleanupStaleAutomationMessages,
  getEvolutionConnectionState,
} from '@/lib/server/evolution-guard';
import { getEvolutionConfig } from '@/lib/server/evolution';
import { getServiceClient, hasValidBearer } from '@/lib/server/security';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const ONE_TIME_TEST_KEY = 'ceami-evolution-test:2026-09-15:5551995092781:v1';
const ONE_TIME_TEST_PHONE = '5551995092781';
const ONE_TIME_TEST_MESSAGE = '✅ Teste CEAMI: conexão da Evolution API funcionando. 15/09/2026.';

async function runOneTimeConnectionTest(service: NonNullable<ReturnType<typeof getServiceClient>>) {
  const { data: inserted, error: insertError } = await service
    .from('automation_runs')
    .insert({
      automation_id: 'birthdays',
      idempotency_key: ONE_TIME_TEST_KEY,
      run_type: 'manual',
      scheduled_date: '2026-09-15',
      destination_group_id: ONE_TIME_TEST_PHONE,
      status: 'processing',
      message: ONE_TIME_TEST_MESSAGE,
      metadata: { purpose: 'evolution_connection_test', destination: '(51) 99509-2781' },
    })
    .select('id')
    .maybeSingle();

  if (insertError) {
    if (insertError.code === '23505') {
      return { attempted: false, alreadyAttempted: true };
    }
    console.error('CEAMI one-time test reservation failed', insertError.message);
    return { attempted: false, reservationError: insertError.message };
  }

  if (!inserted?.id) return { attempted: false, reservationError: 'run id unavailable' };

  const config = getEvolutionConfig();
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
          number: ONE_TIME_TEST_PHONE,
          text: ONE_TIME_TEST_MESSAGE,
          delay: 500,
          linkPreview: false,
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      },
    );

    const raw = await response.text();
    let payload: unknown = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { raw: raw.slice(0, 2000) };
    }

    const obj = (payload || {}) as Record<string, unknown>;
    const nested = obj.response && typeof obj.response === 'object'
      ? (obj.response as Record<string, unknown>)
      : obj;
    const key = nested.key && typeof nested.key === 'object'
      ? (nested.key as Record<string, unknown>)
      : {};
    const messageId = String(key.id || '');
    const remoteJid = String(key.remoteJid || '');
    const providerStatus = String(nested.status || obj.status || 'UNKNOWN').toUpperCase();
    const rejected = ['ERROR', 'FAILED', 'CANCELED', 'CANCELLED'].includes(providerStatus);
    const accepted = response.ok && Boolean(messageId) && !rejected;

    await service
      .from('automation_runs')
      .update({
        status: accepted ? 'queued' : 'failed',
        provider_message_id: messageId || null,
        provider_status: providerStatus,
        provider_response: payload,
        error_message: accepted ? null : `Evolution respondeu HTTP ${response.status}; status ${providerStatus}`,
        completed_at: new Date().toISOString(),
        metadata: {
          purpose: 'evolution_connection_test',
          destination: '(51) 99509-2781',
          remoteJid: remoteJid || null,
          httpStatus: response.status,
        },
      })
      .eq('id', inserted.id);

    console.info('CEAMI one-time WhatsApp test', {
      accepted,
      httpStatus: response.status,
      providerStatus,
      messageId: messageId || null,
      remoteJid: remoteJid || null,
    });

    return { attempted: true, accepted, httpStatus: response.status, providerStatus };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao acessar a Evolution.';
    await service
      .from('automation_runs')
      .update({
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', inserted.id);
    console.error('CEAMI one-time WhatsApp test failed', message);
    return { attempted: true, accepted: false, error: message };
  }
}

async function run(request: NextRequest) {
  if (!(await hasValidBearer(request, 'birthday_cron'))) {
    return NextResponse.json({ error: 'Automação não autorizada.' }, { status: 401 });
  }

  const service = getServiceClient();
  if (!service) {
    return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  }

  try {
    // Nunca entrega mensagens para a Evolution se o WhatsApp não estiver realmente aberto.
    // Assim uma queda de conexão não cria uma fila que possa ser descarregada dias depois.
    const connection = await getEvolutionConnectionState();
    console.info('CEAMI Evolution diagnostic', {
      open: connection.open,
      state: connection.state,
      httpStatus: connection.httpStatus,
      error: connection.error || null,
    });
    if (!connection.open) {
      return NextResponse.json({
        ok: true,
        skipped: 'whatsapp_not_open',
        connection: {
          state: connection.state,
          httpStatus: connection.httpStatus,
          error: connection.error || null,
        },
        results: [],
      });
    }

    const connectionTest = await runOneTimeConnectionTest(service);

    // Limpeza pontual das mensagens antigas mostradas no incidente de 10/09/2026.
    // A função registra a tentativa no metadata para não repetir exclusões bem-sucedidas.
    const cleanup = await cleanupStaleAutomationMessages(service);
    const results = await runDueAutomations(service);
    return NextResponse.json({ ok: true, connectionTest, cleanup, results });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Não foi possível executar as automações.',
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
