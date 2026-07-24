import { NextRequest, NextResponse } from 'next/server';
import { runDueAutomations } from '@/lib/server/automation-runner';
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
    const results = await runDueAutomations(service);
    return NextResponse.json({ ok: true, results });
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
