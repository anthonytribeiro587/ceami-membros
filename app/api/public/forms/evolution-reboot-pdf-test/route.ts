import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TEST_NUMBER = '5551995092781';
const TEST_TOKEN = 'a8f1e3c6b9d2';

function cfg() {
  return {
    apiUrl: String(process.env.EVOLUTION_API_URL || '').replace(/\/$/, ''),
    apiKey: String(process.env.EVOLUTION_API_KEY || ''),
    instance: String(process.env.EVOLUTION_INSTANCE || ''),
  };
}

function variants(number: string) {
  const out = new Set([number]);
  if (number.length === 13 && number.startsWith('55') && number.charAt(4) === '9') out.add(`${number.slice(0, 4)}${number.slice(5)}`);
  if (number.length === 12 && number.startsWith('55')) out.add(`${number.slice(0, 4)}9${number.slice(4)}`);
  return out;
}

async function state() {
  const { apiUrl, apiKey, instance } = cfg();
  const started = Date.now();
  try {
    const r = await fetch(`${apiUrl}/instance/connectionState/${encodeURIComponent(instance)}`, {
      headers: { apikey: apiKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    const raw = await r.text();
    let p: any = {};
    try { p = JSON.parse(raw); } catch {}
    return { ok: r.ok, state: String(p?.instance?.state || p?.state || 'unknown').toLowerCase(), elapsedMs: Date.now() - started };
  } catch (e) {
    return { ok: false, state: 'error', elapsedMs: Date.now() - started, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

function makePdf() {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '<< /Length 69 >>\nstream\nBT /F1 22 Tf 72 720 Td (Teste CEAMI - Evolution API apos reboot) Tj ET\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objs.length; i += 1) {
    offsets.push(Buffer.byteLength(body, 'utf8'));
    body += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const padLine = `% PAD ${'x'.repeat(980)}\n`;
  let padding = '';
  while (Buffer.byteLength(padding, 'utf8') < 1020000) padding += padLine;
  body += padding;
  const xref = Buffer.byteLength(body, 'utf8');
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i += 1) body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'utf8');
}

export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== 'preview' || request.nextUrl.searchParams.get('token') !== TEST_TOKEN) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { apiUrl, apiKey, instance } = cfg();
  if (!apiUrl || !apiKey || !instance) return NextResponse.json({ error: 'Evolution env not configured' }, { status: 503 });

  const before = await state();
  if (!before.ok || before.state !== 'open') return NextResponse.json({ ok: false, before }, { status: 409 });

  const pdf = makePdf();
  const media = pdf.toString('base64');
  const body = JSON.stringify({
    number: TEST_NUMBER,
    mediatype: 'document',
    mimetype: 'application/pdf',
    caption: 'Teste de PDF CEAMI após reinício da Evolution ✅',
    media,
    fileName: 'teste-ceami-evolution.pdf',
    delay: 10000,
  });
  const started = Date.now();

  try {
    const r = await fetch(`${apiUrl}/message/sendMedia/${encodeURIComponent(instance)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(45000),
    });
    const raw = await r.text();
    let p: any = {};
    try { p = JSON.parse(raw); } catch {}
    const key = p?.key || p?.response?.key || p?.response?.message?.key || p?.data?.key || {};
    const status = String(p?.status || p?.response?.status || p?.response?.message?.status || p?.data?.status || 'UNKNOWN').toUpperCase();
    const remoteJid = String(key?.remoteJid || '');
    const id = String(key?.id || '');
    const destinationOk = !remoteJid || [...variants(TEST_NUMBER)].some((n) => `${n}@s.whatsapp.net` === remoteJid);
    const ok = r.ok && Boolean(id) && destinationOk && !['ERROR','FAILED','CANCELED','CANCELLED'].includes(status);
    const after = await state();
    return NextResponse.json({
      ok,
      instance,
      pdfBytes: pdf.length,
      payloadBytes: Buffer.byteLength(body, 'utf8'),
      elapsedMs: Date.now() - started,
      before,
      provider: { httpStatus: r.status, status, id, remoteJid, raw: raw.slice(0, 300) },
      after,
    }, { status: ok ? 200 : 502 });
  } catch (e) {
    const after = await state();
    return NextResponse.json({ ok: false, elapsedMs: Date.now() - started, error: e instanceof Error ? e.message : 'Unknown error', before, after }, { status: 502 });
  }
}
