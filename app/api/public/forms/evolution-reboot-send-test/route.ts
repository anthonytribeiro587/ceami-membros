import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TEST_NUMBER = '5551995092781';
const TEST_TOKEN = 'c7d9f2a4e68b';

function config() {
  return {
    apiUrl: String(process.env.EVOLUTION_API_URL || '').replace(/\/$/, ''),
    apiKey: String(process.env.EVOLUTION_API_KEY || ''),
    instance: String(process.env.EVOLUTION_INSTANCE || ''),
  };
}

function acceptedPhoneVariants(number: string) {
  const variants = new Set([number]);
  if (number.length === 13 && number.startsWith('55') && number.charAt(4) === '9') {
    variants.add(`${number.slice(0, 4)}${number.slice(5)}`);
  }
  if (number.length === 12 && number.startsWith('55')) {
    variants.add(`${number.slice(0, 4)}9${number.slice(4)}`);
  }
  return variants;
}

function acceptedJids(number: string) {
  return new Set([...acceptedPhoneVariants(number)].map((item) => `${item}@s.whatsapp.net`));
}

function envelope(payload: unknown) {
  const root = (payload || {}) as Record<string, unknown>;
  const response = root.response && typeof root.response === 'object'
    ? (root.response as Record<string, unknown>)
    : root;
  const message = response.message && typeof response.message === 'object'
    ? (response.message as Record<string, unknown>)
    : null;
  const data = root.data && typeof root.data === 'object'
    ? (root.data as Record<string, unknown>)
    : null;
  const key = (
    (response.key && typeof response.key === 'object' ? response.key : null) ||
    (message?.key && typeof message.key === 'object' ? message.key : null) ||
    (data?.key && typeof data.key === 'object' ? data.key : null) ||
    {}
  ) as Record<string, unknown>;

  return {
    id: String(key.id || ''),
    remoteJid: String(key.remoteJid || ''),
    status: String(response.status || message?.status || data?.status || root.status || 'UNKNOWN').toUpperCase(),
  };
}

async function connectionState() {
  const { apiUrl, apiKey, instance } = config();
  const started = Date.now();
  try {
    const response = await fetch(`${apiUrl}/instance/connectionState/${encodeURIComponent(instance)}`, {
      headers: { apikey: apiKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    const raw = await response.text();
    let payload: unknown = {};
    try { payload = JSON.parse(raw); } catch { payload = { raw: raw.slice(0, 300) }; }
    const root = payload as Record<string, unknown>;
    const instanceNode = root.instance && typeof root.instance === 'object'
      ? (root.instance as Record<string, unknown>)
      : {};
    return {
      ok: response.ok,
      state: String(instanceNode.state || root.state || 'unknown').toLowerCase(),
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      state: 'error',
      elapsedMs: Date.now() - started,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function buildTestPdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '<< /Length 69 >>\nstream\nBT /F1 22 Tf 72 720 Td (Teste CEAMI - Evolution API apos reboot) Tj ET\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(body, 'utf8'));
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const targetPadding = 1_020_000;
  const padLine = `% PAD ${'x'.repeat(980)}\n`;
  let padding = '';
  while (Buffer.byteLength(padding, 'utf8') < targetPadding) padding += padLine;
  body += padding;

  const xrefOffset = Buffer.byteLength(body, 'utf8');
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, 'utf8');
}

async function parseProviderResponse(response: Response) {
  const raw = await response.text();
  let payload: unknown = { raw: raw.slice(0, 500) };
  try { payload = JSON.parse(raw); } catch {}
  const parsed = envelope(payload);
  const rejected = ['ERROR', 'FAILED', 'CANCELED', 'CANCELLED'].includes(parsed.status);
  const destinationConfirmed = !parsed.remoteJid || acceptedJids(TEST_NUMBER).has(parsed.remoteJid);
  return {
    httpStatus: response.status,
    providerStatus: parsed.status,
    messageId: parsed.id,
    remoteJid: parsed.remoteJid,
    ok: response.ok && Boolean(parsed.id) && destinationConfirmed && !rejected,
    raw: raw.slice(0, 300),
  };
}

export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: 'Preview only' }, { status: 404 });
  }
  if (request.nextUrl.searchParams.get('token') !== TEST_TOKEN) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const action = request.nextUrl.searchParams.get('action');
  if (action !== 'text' && action !== 'pdf') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const { apiUrl, apiKey, instance } = config();
  if (!apiUrl || !apiKey || !instance) {
    return NextResponse.json({ error: 'Evolution env not configured' }, { status: 503 });
  }

  const before = await connectionState();
  if (!before.ok || before.state !== 'open') {
    return NextResponse.json({ ok: false, action, before }, { status: 409 });
  }

  const started = Date.now();
  try {
    let response: Response;
    let payloadBytes = 0;

    if (action === 'text') {
      const body = JSON.stringify({
        number: TEST_NUMBER,
        text: 'Teste CEAMI após reinício da Evolution ✅',
        delay: 3000,
      });
      payloadBytes = Buffer.byteLength(body, 'utf8');
      response = await fetch(`${apiUrl}/message/sendText/${encodeURIComponent(instance)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body,
        cache: 'no-store',
        signal: AbortSignal.timeout(25_000),
      });
    } else {
      const pdf = buildTestPdf();
      const media = pdf.toString('base64');
      const body = JSON.stringify({
        number: TEST_NUMBER,
        mediatype: 'document',
        mimetype: 'application/pdf',
        caption: 'Teste de PDF CEAMI após reinício da Evolution ✅',
        media,
        fileName: 'teste-ceami-evolution.pdf',
        delay: 10_000,
      });
      payloadBytes = Buffer.byteLength(body, 'utf8');
      response = await fetch(`${apiUrl}/message/sendMedia/${encodeURIComponent(instance)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body,
        cache: 'no-store',
        signal: AbortSignal.timeout(45_000),
      });
    }

    const provider = await parseProviderResponse(response);
    const after = provider.ok ? await connectionState() : await connectionState();
    return NextResponse.json({
      ok: provider.ok,
      action,
      instance,
      elapsedMs: Date.now() - started,
      payloadBytes,
      before,
      provider,
      after,
    }, { status: provider.ok ? 200 : 502 });
  } catch (error) {
    const after = await connectionState();
    return NextResponse.json({
      ok: false,
      action,
      elapsedMs: Date.now() - started,
      error: error instanceof Error ? error.message : 'Unknown error',
      before,
      after,
    }, { status: 502 });
  }
}
