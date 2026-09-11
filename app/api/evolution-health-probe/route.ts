import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const apiUrl = process.env.EVOLUTION_API_URL || '';
  const apiKey = process.env.EVOLUTION_API_KEY || '';
  const instance = process.env.EVOLUTION_INSTANCE || '';

  if (!apiUrl || !apiKey || !instance) {
    return NextResponse.json({ ok: false, error: 'Evolution env not configured' }, { status: 503 });
  }

  const started = Date.now();
  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, '')}/instance/connectionState/${encodeURIComponent(instance)}`, {
      headers: { apikey: apiKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });

    const elapsedMs = Date.now() - started;
    const text = await response.text();
    let payload: unknown = text;
    try { payload = JSON.parse(text); } catch {}

    return NextResponse.json({
      ok: response.ok,
      httpStatus: response.status,
      elapsedMs,
      instance,
      payload,
    }, { status: response.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      elapsedMs: Date.now() - started,
      instance,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 502 });
  }
}
