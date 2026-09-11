import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TOKEN = 's7d2m4k9q1';
const TARGET_MESSAGE_IDS = new Set([
  '3EB0FEE881B8B4D0BCB700',
  '3EB0E84889593934F0D036',
]);
const JIDS = [
  '555195092781@s.whatsapp.net',
  '5551995092781@s.whatsapp.net',
];

function cfg() {
  return {
    apiUrl: String(process.env.EVOLUTION_API_URL || '').replace(/\/$/, ''),
    apiKey: String(process.env.EVOLUTION_API_KEY || ''),
    instance: String(process.env.EVOLUTION_INSTANCE || ''),
  };
}

function summarizeRecord(record: any) {
  const key = record?.key || {};
  return {
    id: String(key?.id || ''),
    remoteJid: String(key?.remoteJid || ''),
    fromMe: Boolean(key?.fromMe),
    status: String(record?.status || record?.messageStatus || record?.MessageUpdate?.at?.(-1)?.status || ''),
    messageType: String(record?.messageType || ''),
    timestamp: record?.messageTimestamp || null,
    updates: Array.isArray(record?.MessageUpdate)
      ? record.MessageUpdate.slice(-5).map((u: any) => ({
          status: String(u?.status || ''),
          date: u?.date || u?.createdAt || null,
          remoteJid: String(u?.remoteJid || ''),
        }))
      : [],
  };
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('token') !== TOKEN) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { apiUrl, apiKey, instance } = cfg();
  if (!apiUrl || !apiKey || !instance) {
    return NextResponse.json({ error: 'Evolution env not configured' }, { status: 503 });
  }

  const findings: any[] = [];
  const probes: any[] = [];

  for (const remoteJid of JIDS) {
    try {
      const response = await fetch(`${apiUrl}/chat/findMessages/${encodeURIComponent(instance)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify({
          where: { key: { remoteJid } },
          page: 1,
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      });

      const raw = await response.text();
      let payload: any = {};
      try { payload = JSON.parse(raw); } catch {}

      const records = payload?.messages?.records || payload?.records || payload?.messages || [];
      const list = Array.isArray(records) ? records : [];
      probes.push({ remoteJid, httpStatus: response.status, count: list.length, rawShape: Object.keys(payload || {}).slice(0, 8) });

      for (const record of list) {
        const id = String(record?.key?.id || '');
        if (TARGET_MESSAGE_IDS.has(id)) findings.push(summarizeRecord(record));
      }
    } catch (error) {
      probes.push({ remoteJid, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  const stateResponse = await fetch(`${apiUrl}/instance/connectionState/${encodeURIComponent(instance)}`, {
    headers: { apikey: apiKey },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  const stateText = stateResponse ? await stateResponse.text() : '';
  let statePayload: any = {};
  try { statePayload = JSON.parse(stateText); } catch {}

  return NextResponse.json({
    ok: true,
    instance,
    state: String(statePayload?.instance?.state || statePayload?.state || 'unknown').toLowerCase(),
    probes,
    findings,
    targetMessageIds: [...TARGET_MESSAGE_IDS],
  }, { headers: { 'Cache-Control': 'no-store' } });
}
