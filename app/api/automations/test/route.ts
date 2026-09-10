import { NextRequest, NextResponse } from 'next/server';
import { runAutomation } from '@/lib/server/automation-runner';
import { getEvolutionConnectionState } from '@/lib/server/evolution-guard';
import {
  consumeRateLimit,
  getServiceClient,
  publicErrorMessage,
  readLimitedJson,
  requestComesFromSameSite,
} from '@/lib/server/security';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!requestComesFromSameSite(request)) {
    return NextResponse.json({ error: 'Origem da solicitação não autorizada.' }, { status: 403 });
  }

  const service = getServiceClient();
  if (!service) {
    return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  }

  const allowed = await consumeRateLimit(request, 'automation_manual_test', 60, 5);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Muitos testes em sequência. Aguarde um minuto antes de tentar novamente.' },
      { status: 429 },
    );
  }

  try {
    const body = await readLimitedJson<{ automationId?: string }>(request, 2_000);
    const automationId = String(body.automationId || '').trim();
    if (!automationId) {
      return NextResponse.json({ error: 'Automação não informada.' }, { status: 400 });
    }

    const connection = await getEvolutionConnectionState();
    if (!connection.open) {
      return NextResponse.json(
        {
          error:
            'O WhatsApp da CEAMI não está conectado. O teste foi bloqueado para evitar que a mensagem fique presa na fila e seja enviada depois.',
          connection: {
            state: connection.state,
            httpStatus: connection.httpStatus,
          },
        },
        { status: 409 },
      );
    }

    const result = await runAutomation(service, automationId, {
      mode: 'manual',
      force: true,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (error) {
    const publicError = publicErrorMessage(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
