import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUiRole } from '@/lib/server/current-profile';
import { getEvolutionConnectionState } from '@/lib/server/evolution-guard';
import { evolutionConfigured, getEvolutionConfig } from '@/lib/server/evolution';
import { consumeRateLimit, requestComesFromSameSite } from '@/lib/server/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TEST_PHONE = '5551995092781';
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const EXPECTED_FILE_NAME = 'O FIM PERTENCE A CRISTO.pdf';

function readEnvelope(payload: unknown) {
  const data = (payload || {}) as Record<string, unknown>;
  const response = data.response && typeof data.response === 'object'
    ? (data.response as Record<string, unknown>)
    : data;
  const key = response.key && typeof response.key === 'object'
    ? (response.key as Record<string, unknown>)
    : {};
  return {
    id: String(key.id || ''),
    remoteJid: String(key.remoteJid || ''),
    status: String(response.status || data.status || 'UNKNOWN').toUpperCase(),
  };
}

export async function POST(request: NextRequest) {
  if (!requestComesFromSameSite(request)) {
    return NextResponse.json({ error: 'Origem da solicitação não autorizada.' }, { status: 403 });
  }

  const role = await getCurrentUiRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Acesso restrito ao administrador.' }, { status: 403 });
  }

  const allowed = await consumeRateLimit(request, 'seminar_pdf_test', 300, 2);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Limite de testes atingido. Aguarde alguns minutos antes de tentar novamente.' },
      { status: 429 },
    );
  }

  const connection = await getEvolutionConnectionState();
  if (!connection.open) {
    return NextResponse.json(
      { error: 'O WhatsApp da CEAMI não está conectado. O envio foi bloqueado.' },
      { status: 409 },
    );
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Selecione o PDF do seminário.' }, { status: 400 });
  }

  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Somente arquivos PDF são aceitos.' }, { status: 400 });
  }

  if (file.size <= 0 || file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: 'O PDF deve ter no máximo 8 MB.' }, { status: 400 });
  }

  // Para o teste, o destinatário não vem do navegador: fica fixo no servidor.
  // Isso impede que esta rota seja usada para enviar arquivos a números arbitrários.
  const config = getEvolutionConfig();
  if (!evolutionConfigured(config)) {
    return NextResponse.json({ error: 'Evolution API não configurada.' }, { status: 503 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const media = buffer.toString('base64');

  try {
    const response = await fetch(
      `${config.apiUrl}/message/sendMedia/${encodeURIComponent(config.instance)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: config.apiKey,
        },
        body: JSON.stringify({
          number: TEST_PHONE,
          mediatype: 'document',
          mimetype: 'application/pdf',
          caption: 'Olá! Segue a apostila digital do Seminário O Fim Pertence a Cristo. 🙏',
          media,
          fileName: EXPECTED_FILE_NAME,
          delay: 1200,
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(45_000),
      },
    );

    const text = await response.text();
    let payload: unknown = { raw: text.slice(0, 1200) };
    try { payload = JSON.parse(text) as unknown; } catch { /* mantém resposta sanitizada */ }

    const envelope = readEnvelope(payload);
    const expectedJid = `${TEST_PHONE}@s.whatsapp.net`;
    const accepted = response.ok && Boolean(envelope.id) && (!envelope.remoteJid || envelope.remoteJid === expectedJid);

    if (!accepted) {
      console.error('Seminar PDF test rejected by Evolution', {
        httpStatus: response.status,
        providerStatus: envelope.status,
        remoteJid: envelope.remoteJid,
      });
      return NextResponse.json(
        { error: `A Evolution não confirmou o envio. Status HTTP ${response.status}.` },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      destination: '(51) 99509-2781',
      messageId: envelope.id,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Seminar PDF test send failed', error);
    return NextResponse.json({ error: 'Falha ao enviar o PDF pelo WhatsApp.' }, { status: 502 });
  }
}
