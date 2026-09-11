import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUiRole } from '@/lib/server/current-profile';
import { getEvolutionConnectionState } from '@/lib/server/evolution-guard';
import { evolutionConfigured, getEvolutionConfig } from '@/lib/server/evolution';
import { waitForEvolutionMessageDelivery } from '@/lib/server/evolution-message-delivery';
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
  const nestedMessage = response.message && typeof response.message === 'object'
    ? (response.message as Record<string, unknown>)
    : null;
  const responseKey = response.key && typeof response.key === 'object'
    ? (response.key as Record<string, unknown>)
    : null;
  const messageKey = nestedMessage?.key && typeof nestedMessage.key === 'object'
    ? (nestedMessage.key as Record<string, unknown>)
    : null;
  const dataNode = data.data && typeof data.data === 'object'
    ? (data.data as Record<string, unknown>)
    : null;
  const dataKey = dataNode?.key && typeof dataNode.key === 'object'
    ? (dataNode.key as Record<string, unknown>)
    : null;
  const key = responseKey || messageKey || dataKey || {};

  return {
    id: String(key.id || ''),
    remoteJid: String(key.remoteJid || ''),
    status: String(response.status || nestedMessage?.status || dataNode?.status || data.status || 'UNKNOWN').toUpperCase(),
  };
}

function acceptedBrazilJids(phone: string) {
  const variants = new Set<string>([`${phone}@s.whatsapp.net`]);
  if (phone.startsWith('55') && phone.length === 13 && phone.charAt(4) === '9') {
    variants.add(`${phone.slice(0, 4)}${phone.slice(5)}@s.whatsapp.net`);
  }
  return variants;
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
    const allowedJids = acceptedBrazilJids(TEST_PHONE);
    const rejectedStatus = ['ERROR', 'FAILED', 'CANCELED', 'CANCELLED'].includes(envelope.status);
    const destinationConfirmed = !envelope.remoteJid || allowedJids.has(envelope.remoteJid);
    const accepted = response.ok && Boolean(envelope.id) && destinationConfirmed && !rejectedStatus;

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

    const delivery = await waitForEvolutionMessageDelivery({
      messageId: envelope.id,
      remoteJid: envelope.remoteJid || `${TEST_PHONE}@s.whatsapp.net`,
      initialStatus: envelope.status,
      maxWaitMs: 15_000,
      intervalMs: 2_000,
    });

    if (delivery.failed) {
      console.error('Seminar PDF test failed after Evolution accepted it', {
        messageId: envelope.id,
        finalStatus: delivery.status,
        remoteJid: envelope.remoteJid,
      });
      return NextResponse.json(
        {
          error: `A Evolution aceitou o teste, mas o WhatsApp devolveu ${delivery.status}. Nada foi considerado enviado.`,
          providerStatus: delivery.status,
        },
        { status: 502 },
      );
    }

    if (!delivery.confirmed) {
      return NextResponse.json(
        {
          error: `A Evolution deixou a mensagem em ${delivery.status}. O teste não foi confirmado como entregue e não será mostrado como sucesso.`,
          providerStatus: delivery.status,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      destination: '(51) 99509-2781',
      messageId: envelope.id,
      providerStatus: delivery.status,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Seminar PDF test send failed', error);
    return NextResponse.json({ error: 'Falha ao enviar o PDF pelo WhatsApp.' }, { status: 502 });
  }
}
