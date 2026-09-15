import { NextRequest, NextResponse } from 'next/server';
import { runDueAutomations } from '@/lib/server/automation-runner';
import {
  cleanupStaleAutomationMessages,
  getEvolutionConnectionState,
} from '@/lib/server/evolution-guard';
import { getServiceClient, hasValidBearer } from '@/lib/server/security';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

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

    // Limpeza pontual das mensagens antigas mostradas no incidente de 10/09/2026.
    // A função registra a tentativa no metadata para não repetir exclusões bem-sucedidas.
    const cleanup = await cleanupStaleAutomationMessages(service);
    const results = await runDueAutomations(service);
    return NextResponse.json({ ok: true, cleanup, results });
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
