import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN = 'ownercheck0911';

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('token') !== TOKEN) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const apiUrl = String(process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  const apiKey = String(process.env.EVOLUTION_API_KEY || '');
  const instance = String(process.env.EVOLUTION_INSTANCE || '');
  if (!apiUrl || !apiKey || !instance) {
    return NextResponse.json({ error: 'Evolution env not configured' }, { status: 503 });
  }

  const response = await fetch(`${apiUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`, {
    headers: { apikey: apiKey },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  const raw = await response.text();
  let payload: any = null;
  try { payload = JSON.parse(raw); } catch {}
  const item = Array.isArray(payload) ? payload[0] : payload;

  return NextResponse.json({
    httpStatus: response.status,
    instance,
    ownerJid: item?.ownerJid || item?.owner || item?.instance?.ownerJid || null,
    connectionStatus: item?.connectionStatus || item?.status || item?.instance?.status || null,
    integration: item?.integration || item?.instance?.integration || null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
