import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/server/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (
    process.env.VERCEL_ENV !== 'preview' ||
    process.env.VERCEL_GIT_COMMIT_REF !== 'fix/safe-pdf-and-automation-toggle'
  ) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const service = getServiceClient();
  if (!service) {
    return NextResponse.json({ error: 'Service unavailable.' }, { status: 503 });
  }

  const { data, error } = await service
    .from('automations')
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq('enabled', true)
    .select('id,name,enabled');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, paused: data || [] },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
