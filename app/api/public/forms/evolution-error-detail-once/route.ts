import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TOKEN = 'e3v0err9x2';
const TARGET_IDS = new Set(['3EB0FEE881B8B4D0BCB700', '3EB0E84889593934F0D036']);
const JID = '555195092781@s.whatsapp.net';

function cfg() {
  return {
    apiUrl: String(process.env.EVOLUTION_API_URL || '').replace(/\/$/, ''),
    apiKey: String(process.env.EVOLUTION_API_KEY || ''),
    instance: String(process.env.EVOLUTION_INSTANCE || ''),
  };
}

function compact(record: any) {
  return {
    id: String(record?.key?.id || ''),
    remoteJid: String(record?.key?.remoteJid || ''),
    status: String(record?.status || record?.messageStatus || ''),
    messageType: String(record?.messageType || ''),
    messageStubType: record?.messageStubType ?? null,
    messageStubParameters: record?.messageStubParameters ?? null,
    participant: record?.participant || record?.key?.participant || null,
    remoteJidAlt: record?.key?.remoteJidAlt || record?.remoteJidAlt || null,
    source: record?.source || null,
    error: record?.error || null,
    updates: Array.isArray(record?.MessageUpdate)
      ? record.MessageUpdate.slice(-10).map((u: any) => ({
          status: u?.status ?? null,
          error: u?.error ?? null,
          messageStubType: u?.messageStubType ?? null,
          messageStubParameters: u?.messageStubParameters ?? null,
          remoteJid: u?.remoteJid ?? null,
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

  const response = await fetch(`${apiUrl}/chat/findMessages/${encodeURIComponent(instance)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({ where: { key: { remoteJid: JID } }, page: 1 }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });

  const raw = await response.text();
  let payload: any = {};
  try { payload = JSON.parse(raw); } catch {}
  const records = payload?.messages?.records || payload?.records || payload?.messages || [];
  const list = Array.isArray(records) ? records : [];
  const findings = list.filter((r: any) => TARGET_IDS.has(String(r?.key?.id || ''))).map(compact);

  return NextResponse.json({ httpStatus: response.status, instance, findings }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
