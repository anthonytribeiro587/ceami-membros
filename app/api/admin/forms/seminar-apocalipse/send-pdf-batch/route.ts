import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUiRole } from '@/lib/server/current-profile';
import { getEvolutionConnectionState } from '@/lib/server/evolution-guard';
import { evolutionConfigured, getEvolutionConfig } from '@/lib/server/evolution';
import {
  consumeRateLimit,
  getServiceClient,
  requestComesFromSameSite,
} from '@/lib/server/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SLUG = 'seminario-apocalipse-2026';
const MAX_BATCH = 1;
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const FILE_NAME = 'O FIM PERTENCE A CRISTO.pdf';
const EVOLUTION_SEND_DELAY_MS = 10_000;

type ProviderEnvelope = {
  id: string;
  remoteJid: string;
  status: string;
};

function txt(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function material(value: unknown) {
  const normalized = txt(value);
  if (normalized.includes('pdf') || normalized.includes('digital')) return 'PDF';
  if (normalized.includes('fisic')) return 'Física';
  return '';
}

function pay(answers: Record<string, unknown>) {
  const payment = answers.__payment;
  return payment && typeof payment === 'object' && !Array.isArray(payment)
    ? String((payment as Record<string, unknown>).status || '')
    : '';
}

function delivered(answers: Record<string, unknown>) {
  const delivery = answers.__seminar_pdf_delivery;
  return Boolean(
    delivery &&
      typeof delivery === 'object' &&
      !Array.isArray(delivery) &&
      String((delivery as Record<string, unknown>).status || '') === 'sent',
  );
}

function phone(value: unknown) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length > 11) digits = digits.replace(/^0+/, '');
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

function valid(value: unknown) {
  const digits = phone(value);
  const national = digits.startsWith('55') ? digits.slice(2) : '';
  return (
    national.length === 11 &&
    Number(national.slice(0, 2)) >= 11 &&
    Number(national.slice(0, 2)) <= 99 &&
    national.slice(2).startsWith('9')
  );
}

function env(payload: unknown): ProviderEnvelope {
  const root = (payload || {}) as Record<string, unknown>;
  const response =
    root.response && typeof root.response === 'object'
      ? (root.response as Record<string, unknown>)
      : root;
  const message =
    response.message && typeof response.message === 'object'
      ? (response.message as Record<string, unknown>)
      : null;
  const dataNode =
    root.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>)
      : null;
  const responseKey =
    response.key && typeof response.key === 'object'
      ? (response.key as Record<string, unknown>)
      : null;
  const messageKey =
    message?.key && typeof message.key === 'object'
      ? (message.key as Record<string, unknown>)
      : null;
  const dataKey =
    dataNode?.key && typeof dataNode.key === 'object'
      ? (dataNode.key as Record<string, unknown>)
      : null;
  const key = responseKey || messageKey || dataKey || {};

  return {
    id: String(key.id || ''),
    remoteJid: String(key.remoteJid || ''),
    status: String(response.status || message?.status || dataNode?.status || root.status || 'UNKNOWN')
      .toUpperCase(),
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

function providerRows(payload: unknown) {
  const root = payload as Record<string, unknown> | null;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(root?.data)) return root!.data as unknown[];
  if (Array.isArray(root?.response)) return root!.response as unknown[];
  return [] as unknown[];
}

async function verifyWhatsappNumber(number: string) {
  const config = getEvolutionConfig();
  try {
    const response = await fetch(
      `${config.apiUrl}/chat/whatsappNumbers/${encodeURIComponent(config.instance)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: config.apiKey,
        },
        body: JSON.stringify({ numbers: [number] }),
        cache: 'no-store',
        signal: AbortSignal.timeout(12_000),
      },
    );

    const raw = await response.text();
    let payload: unknown = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { raw: raw.slice(0, 300) };
    }

    if (!response.ok) {
      return {
        ok: false,
        exists: false,
        reason: `A Evolution não conseguiu validar o destinatário (HTTP ${response.status}).`,
      };
    }

    const variants = acceptedPhoneVariants(number);
    for (const item of providerRows(payload)) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const candidate = phone(row.number || row.jid || row.remoteJid || '');
      if (!variants.has(candidate)) continue;
      const exists =
        row.exists === true ||
        row.exists === 'true' ||
        row.isWhatsapp === true ||
        row.registered === true;
      return {
        ok: true,
        exists,
        reason: exists
          ? 'Número confirmado no WhatsApp.'
          : 'A Evolution não confirmou este número como cadastrado no WhatsApp.',
      };
    }

    return {
      ok: false,
      exists: false,
      reason: 'A Evolution não retornou uma confirmação válida para este destinatário.',
    };
  } catch (error) {
    return {
      ok: false,
      exists: false,
      reason:
        error instanceof Error
          ? `Falha ao validar o destinatário: ${error.message}`
          : 'Falha ao validar o destinatário.',
    };
  }
}

async function send(number: string, media: string) {
  const config = getEvolutionConfig();
  const response = await fetch(
    `${config.apiUrl}/message/sendMedia/${encodeURIComponent(config.instance)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.apiKey,
      },
      body: JSON.stringify({
        number,
        mediatype: 'document',
        mimetype: 'application/pdf',
        caption: 'Olá! Segue a apostila digital do Seminário O Fim Pertence a Cristo. 🙏',
        media,
        fileName: FILE_NAME,
        delay: EVOLUTION_SEND_DELAY_MS,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(45_000),
    },
  );

  const raw = await response.text();
  let payload: unknown = { raw: raw.slice(0, 500) };
  try {
    payload = JSON.parse(raw);
  } catch {}

  const envelope = env(payload);
  const rejected = ['ERROR', 'FAILED', 'CANCELED', 'CANCELLED'].includes(envelope.status);
  const destinationConfirmed =
    !envelope.remoteJid || acceptedJids(number).has(envelope.remoteJid);
  const ok =
    response.ok &&
    Boolean(envelope.id) &&
    destinationConfirmed &&
    !rejected;

  if (!ok) {
    console.error('Seminar real PDF rejected by Evolution', {
      httpStatus: response.status,
      providerStatus: envelope.status,
      remoteJid: envelope.remoteJid,
      hasMessageId: Boolean(envelope.id),
      numberTail: number.slice(-4),
      providerBody: raw.slice(0, 300),
    });
  }

  return {
    ok,
    id: envelope.id,
    status: envelope.status,
    httpStatus: response.status,
  };
}

export async function POST(request: NextRequest) {
  if (!requestComesFromSameSite(request)) {
    return NextResponse.json({ error: 'Origem não autorizada.' }, { status: 403 });
  }
  if ((await getCurrentUiRole()) !== 'admin') {
    return NextResponse.json({ error: 'Acesso restrito ao administrador.' }, { status: 403 });
  }
  if (!(await consumeRateLimit(request, 'seminar_pdf_real_batch', 60, 6))) {
    return NextResponse.json(
      { error: 'Aguarde um pouco antes do próximo envio.' },
      { status: 429 },
    );
  }

  const connection = await getEvolutionConnectionState();
  if (!connection.open) {
    return NextResponse.json(
      {
        error: `A Evolution não está conectada (${connection.state}). Reconecte antes de continuar.`,
        disconnected: true,
      },
      { status: 409 },
    );
  }

  const config = getEvolutionConfig();
  if (!evolutionConfigured(config)) {
    return NextResponse.json({ error: 'Evolution API não configurada.' }, { status: 503 });
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File) || file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Selecione o PDF do seminário.' }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: 'O PDF deve ter no máximo 8 MB.' }, { status: 400 });
  }

  const service = getServiceClient();
  if (!service) {
    return NextResponse.json({ error: 'Serviço temporariamente indisponível.' }, { status: 503 });
  }

  const { data: form } = await service.from('forms').select('id').eq('slug', SLUG).maybeSingle();
  if (!form) {
    return NextResponse.json({ error: 'Formulário não encontrado.' }, { status: 404 });
  }

  const { data, error } = await service
    .from('form_submissions')
    .select('id, respondent_name, respondent_phone, answers, created_at')
    .eq('form_id', form.id)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: 'Não foi possível carregar as inscrições.' },
      { status: 500 },
    );
  }

  const eligible = (data || []).filter((row) => {
    const answers =
      row.answers && typeof row.answers === 'object' && !Array.isArray(row.answers)
        ? (row.answers as Record<string, unknown>)
        : {};
    return pay(answers) === 'paid' && Boolean(material(answers.apostila)) && !delivered(answers);
  });

  const batch = eligible.slice(0, MAX_BATCH);
  if (!batch.length) {
    return NextResponse.json({ ok: true, sent: 0, remaining: 0, done: true, sentIds: [] });
  }

  const media = Buffer.from(await file.arrayBuffer()).toString('base64');
  const row = batch[0];
  const answers =
    row.answers && typeof row.answers === 'object' && !Array.isArray(row.answers)
      ? (row.answers as Record<string, unknown>)
      : {};
  const number = phone(
    row.respondent_phone || answers.telefone || answers.whatsapp || answers.celular || '',
  );

  if (!valid(number)) {
    return NextResponse.json(
      {
        error: `O próximo destinatário (${String(row.respondent_name || 'sem nome')}) precisa de revisão no telefone.`,
        review: { id: String(row.id), name: String(row.respondent_name || 'Sem nome') },
      },
      { status: 422 },
    );
  }

  const live = await getEvolutionConnectionState();
  if (!live.open) {
    return NextResponse.json(
      {
        error: `A Evolution caiu antes do próximo envio (${live.state}). Reconecte antes de continuar.`,
        disconnected: true,
      },
      { status: 409 },
    );
  }

  const verification = await verifyWhatsappNumber(number);
  if (!verification.ok || !verification.exists) {
    console.error('Seminar PDF recipient verification blocked send', {
      submissionId: String(row.id),
      numberTail: number.slice(-4),
      reason: verification.reason,
    });
    return NextResponse.json(
      {
        error: `${verification.reason} O envio foi interrompido antes de mandar o PDF.`,
        review: { id: String(row.id), name: String(row.respondent_name || 'Sem nome') },
      },
      { status: 422 },
    );
  }

  try {
    const result = await send(number, media);
    if (!result.ok) {
      const afterFailure = await getEvolutionConnectionState();
      if (!afterFailure.open) {
        return NextResponse.json(
          {
            error: `A Evolution desconectou durante o envio (${afterFailure.state}). Os PDFs já registrados não serão repetidos quando você continuar.`,
            disconnected: true,
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        {
          error: `A Evolution recusou o próximo destinatário (HTTP ${result.httpStatus}). O envio parou sem avançar para os demais.`,
          review: { id: String(row.id), name: String(row.respondent_name || 'Sem nome') },
        },
        { status: 422 },
      );
    }

    const nextAnswers = {
      ...answers,
      __seminar_pdf_delivery: {
        status: 'sent',
        sent_at: new Date().toISOString(),
        phone: number,
        message_id: result.id,
        provider_status: result.status,
      },
    };

    const { error: updateError } = await service
      .from('form_submissions')
      .update({ answers: nextAnswers })
      .eq('id', row.id);

    if (updateError) {
      console.error('Seminar PDF delivery tracking failed', {
        submissionId: String(row.id),
        messageId: result.id,
      });
      return NextResponse.json(
        {
          error:
            'O PDF foi aceito pela Evolution, mas não foi possível registrar a entrega. O envio foi interrompido para evitar duplicidade.',
        },
        { status: 500 },
      );
    }

    const remaining = Math.max(0, eligible.length - 1);
    return NextResponse.json(
      {
        ok: true,
        sent: 1,
        sentIds: [String(row.id)],
        remaining,
        done: remaining === 0,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Seminar real PDF send failed', {
      submissionId: String(row.id),
      message: String(error),
    });
    const afterFailure = await getEvolutionConnectionState();
    return NextResponse.json(
      {
        error: afterFailure.open
          ? 'O envio falhou e foi interrompido antes de avançar para outra pessoa.'
          : `A Evolution desconectou durante o envio (${afterFailure.state}). Reconecte antes de continuar.`,
        disconnected: !afterFailure.open,
      },
      { status: afterFailure.open ? 502 : 409 },
    );
  }
}
