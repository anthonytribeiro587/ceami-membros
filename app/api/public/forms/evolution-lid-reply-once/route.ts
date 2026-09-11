import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TOKEN = 'lidreply-51-2026';
const TARGET_LID = '162848030339322@lid';
const TEST_TEXT = 'Teste CEAMI via LID ✅';

function cfg() {
  return {
    apiUrl: String(process.env.EVOLUTION_API_URL || '').replace(/\/$/, ''),
    apiKey: String(process.env.EVOLUTION_API_KEY || ''),
    instance: String(process.env.EVOLUTION_INSTANCE || ''),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('token') !== TOKEN) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { apiUrl, apiKey, instance } = cfg();
  if (!apiUrl || !apiKey || !instance) {
    return NextResponse.json({ error: 'Evolution env not configured' }, { status: 503 });
  }

  const sendResponse = await fetch(`${apiUrl}/message/sendText/${encodeURIComponent(instance)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({ number: TARGET_LID, text: TEST_TEXT }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });

  const sendRaw = await sendResponse.text();
  let sendPayload: any = {};
  try { sendPayload = JSON.parse(sendRaw); } catch {}

  const key = sendPayload?.key || sendPayload?.response?.key || sendPayload?.data?.key || {};
  const messageId = String(key?.id || '');
  const initialRemoteJid = String(key?.remoteJid || '');
  const initialStatus = String(sendPayload?.status || sendPayload?.response?.status || sendPayload?.data?.status || '');

  await sleep(5000);

  let finalStatus = '';
  let updates: any[] = [];
  let matchedRemoteJid = '';

  if (messageId) {
    const findResponse = await fetch(`${apiUrl}/chat/findMessages/${encodeURIComponent(instance)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ where: { key: { remoteJid: TARGET_LID } }, page: 1 }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });

    const findRaw = await findResponse.text();
    let findPayload: any = {};
    try { findPayload = JSON.parse(findRaw); } catch {}
    const records = findPayload?.messages?.records || findPayload?.records || findPayload?.messages || [];
    const list = Array.isArray(records) ? records : [];
    const match = list.find((r: any) => String(r?.key?.id || '') === messageId);
    if (match) {
      matchedRemoteJid = String(match?.key?.remoteJid || '');
      finalStatus = String(match?.status || match?.messageStatus || '');
      updates = Array.isArray(match?.MessageUpdate)
        ? match.MessageUpdate.slice(-10).map((u: any) => ({
            status: String(u?.status || ''),
            remoteJid: String(u?.remoteJid || ''),
          }))
        : [];
    }
  }

  return NextResponse.json({
    httpStatus: sendResponse.status,
    instance,
    targetLid: TARGET_LID,
    messageId,
    initialRemoteJid,
    initialStatus,
    finalStatus,
    matchedRemoteJid,
    updates,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
