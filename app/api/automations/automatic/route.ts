import { NextRequest, NextResponse } from 'next/server';
import {
  clockInTimezone,
  runAutomation,
  runDueAutomations,
} from '@/lib/server/automation-runner';
import {
  cleanupStaleAutomationMessages,
  getEvolutionConnectionState,
} from '@/lib/server/evolution-guard';
import { getServiceClient, hasValidBearer } from '@/lib/server/security';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const RESUME_DATE = '2026-09-15';
const RESUME_AUTOMATIONS = ['birthdays', 'reading-plan'];

async function ensureDailyAutomationsEnabled(service: NonNullable<ReturnType<typeof getServiceClient>>) {
  const { error } = await service
    .from('automations')
    .update({ enabled: true, updated_at: new Date().toISOString() })
    .in('id', RESUME_AUTOMATIONS);

  if (error) throw new Error(`Não foi possível reativar as automações: ${error.message}`);
}

async function runResumeDateOnce(service: NonNullable<ReturnType<typeof getServiceClient>>) {
  const clock = clockInTimezone('America/Sao_Paulo');
  if (clock.date !== RESUME_DATE) {
    return { skipped: 'resume_date_passed', date: clock.date, results: [] };
  }

  const { data: automations, error } = await service
    .from('automations')
    .select('id,group_id')
    .in('id', RESUME_AUTOMATIONS);

  if (error) throw new Error(`Não foi possível carregar as automações reativadas: ${error.message}`);

  const results: Array<Record<string, unknown>> = [];

  for (const automation of automations || []) {
    const markerKey = `resume:${RESUME_DATE}:${automation.id}`;
    const { data: marker, error: markerError } = await service
      .from('automation_runs')
      .insert({
        automation_id: automation.id,
        idempotency_key: markerKey,
        run_type: 'manual',
        scheduled_date: RESUME_DATE,
        destination_group_id: automation.group_id,
        status: 'processing',
        metadata: {
          purpose: 'resume_daily_automations',
          resumeDate: RESUME_DATE,
        },
      })
      .select('id')
      .maybeSingle();

    if (markerError?.code === '23505') {
      results.push({ automationId: automation.id, skipped: 'already_resumed_today' });
      continue;
    }
    if (markerError) {
      results.push({ automationId: automation.id, status: 'failed', error: markerError.message });
      continue;
    }

    const result = await runAutomation(service, automation.id, {
      mode: 'automatic',
      force: true,
    });

    if (marker?.id) {
      await service
        .from('automation_runs')
        .update({
          status:
            result.status === 'queued'
              ? 'queued'
              : result.status === 'failed'
                ? 'failed'
                : 'skipped',
          metadata: {
            purpose: 'resume_daily_automations',
            resumeDate: RESUME_DATE,
            result,
          },
          error_message: result.error || null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', marker.id);
    }

    results.push(result as unknown as Record<string, unknown>);
  }

  return { skipped: null, date: clock.date, results };
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
    // A partir de 15/09/2026, aniversário e plano de leitura ficam ativos novamente.
    await ensureDailyAutomationsEnabled(service);

    // Nunca entrega mensagens para a Evolution se o WhatsApp não estiver realmente aberto.
    const connection = await getEvolutionConnectionState();
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

    // Em 15/09, envia uma única vez o conteúdo oficial do próprio dia, sem recuperar datas anteriores.
    const resume = await runResumeDateOnce(service);

    // Limpeza pontual das mensagens antigas mostradas no incidente de 10/09/2026.
    const cleanup = await cleanupStaleAutomationMessages(service);
    const results = await runDueAutomations(service);
    return NextResponse.json({ ok: true, resume, cleanup, results });
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
