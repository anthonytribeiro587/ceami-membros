import { NextResponse } from 'next/server';
import { runAutomation } from '@/lib/server/automation-runner';
import { getServiceClient } from '@/lib/server/security';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const service = getServiceClient();
  if (!service) {
    return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  }

  let body: { force?: boolean; source?: 'automatic' | 'manual' } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {}

  const result = await runAutomation(service, 'birthdays', {
    mode: body.source === 'manual' ? 'manual' : 'automatic',
    force: Boolean(body.force),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || 'Não foi possível enviar.', details: result },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    accepted: result.status === 'queued',
    deliveryStatus: result.status,
    providerStatus: result.providerStatus || '',
    messageId: result.messageId || '',
    message: result.message || '',
    names: Array.isArray(result.metadata?.memberNames)
      ? result.metadata.memberNames
      : [],
    mentioned: [],
    skipped: result.skipped,
    historySaved: true,
    historyError: null,
  });
}
