import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TOKEN = 'lid9diag-51-2026';

function cfg() {
  return {
    apiUrl: String(process.env.EVOLUTION_API_URL || '').replace(/\/$/, ''),
    apiKey: String(process.env.EVOLUTION_API_KEY || ''),
    instance: String(process.env.EVOLUTION_INSTANCE || ''),
  };
}

function textOf(record: any) {
  const m = record?.message || {};
  return String(
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.videoMessage?.caption ||
    m?.documentMessage?.caption ||
    '',
  ).slice(0, 120);
}

function compact(record: any) {
  const key = record?.key || {};
  return {
    id: String(key?.id || ''),
    fromMe: Boolean(key?.fromMe),
    remoteJid: String(key?.remoteJid || ''),
    remoteJidAlt: String(key?.remoteJidAlt || record?.remoteJidAlt || ''),
    participant: String(key?.participant || record?.participant || ''),
    participantAlt: String(key?.participantAlt || record?.participantAlt || ''),
    addressingMode: String(key?.addressingMode || record?.addressingMode || ''),
    pushName: String(record?.pushName || ''),
    status: String(record?.status || record?.messageStatus || ''),
    messageType: String(record?.messageType || ''),
    timestamp: record?.messageTimestamp || record?.timestamp || null,
    text: textOf(record),
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
    body: JSON.stringify({ where: {}, page: 1 }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });

  const raw = await response.text();
  let payload: any = {};
  try { payload = JSON.parse(raw); } catch {}
  const records = payload?.messages?.records || payload?.records || payload?.messages || [];
  const list = Array.isArray(records) ? records : [];
  const incoming = list
    .filter((r: any) => r?.key?.fromMe === false)
    .map(compact)
    .slice(0, 20);
  const teste = incoming.filter((r: any) => String(r.text || '').toLowerCase().includes('teste'));

  return NextResponse.json({
    httpStatus: response.status,
    instance,
    count: list.length,
    teste,
    incoming,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
