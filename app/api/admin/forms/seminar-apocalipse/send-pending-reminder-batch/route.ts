import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUiRole } from '@/lib/server/current-profile';
import { getEvolutionConnectionState } from '@/lib/server/evolution-guard';
import { evolutionConfigured, getEvolutionConfig } from '@/lib/server/evolution';
import { waitForEvolutionMessageDelivery } from '@/lib/server/evolution-message-delivery';
import {
  consumeRateLimit,
  getServiceClient,
  requestComesFromSameSite,
} from '@/lib/server/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SLUG = 'seminario-apocalipse-2026';
const EVOLUTION_SEND_DELAY_MS = 5_000;
const MESSAGE =
  'Olá, vi que você fez sua inscrição para Simpósio Apocalipse e ainda não efetuou o pagamento.\n\nVocê pode efetuar hoje lá no curso. Estaremos a partir das 18:30h para check-in.';

type ProviderEnvelope = {
  id: string;
  remoteJid: string;
  status: string;
};

function text(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function paymentStatus(answers: Record<string, unknown>) {
  const payment = answers.__payment;
  if (!payment || typeof payment !== 'object' || Array.isArray(payment)) return 'pending';
  const status = String((payment as Record<string, unknown>).status || '');
  return status === 'paid' || status === 'exempt' ? status : 'pending';
}

function amountDue(value: unknown) {
  const normalized = text(value);
  if (!normalized || normalized === 'nao' || normalized.includes('sem custo') || normalized.includes('gratuit')) return 0;
  if (normalized.includes('pdf') || normalized.includes('digital')) return 10;
  if (normalized.includes('fisic') || normalized === 'sim') return 35;
  return 0;
}

function reminderSent(answers: Record<string, unknown>) {
  const reminder = answers.__seminar_pending_reminder;
  return Boolean(
    reminder &&
      typeof reminder === 'object' &&
      !Array.isArray(reminder) &&
      String((reminder as Record<string, unknown>).status || '') === 'sent',
  );
}

function phone(value: unknown) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length > 11) digits = digits.replace(/^0+/, '');
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

function validPhone(value: unknown) {
  const digits = phone(value);
  const national = digits.startsWith('55') ? digits.slice(2) : '';
  return (
    national.length === 11 &&
    Number(national.slice(0, 2)) >= 11 &&
    Number(national.slice(0, 2)) <= 99 &&
    national.slice(2).startsWith('9')
  );
}

function envelope(payload: unknown): ProviderEnvelope {
  const root = (payload || {}) as Record<string, unknown>;
  const response =
    root.response && typeof root.response === 'object'
      ? (root.response as Record<string, unknown>)
      : root;
  const message =
    response.message && typeof response.message === 'object'
      ? (response.message as Record<string, unknown>)
      : null;
  const data =
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
    data?.key && typeof data.key === 'object'
      ? (data.key as Record<string, unknown>)
      : null;
  const key = responseKey || messageKey || dataKey || {};

  return {
    id: String(key.id || ''),
    remoteJid: String(key.remoteJid || ''),
    status: String(response.status || message?.status || data?.status || root.status || 'UNKNOWN').toUpperCase(),
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

async function sendText(number: string) {
  const config = getEvolutionConfig();
  const response = await fetch(
    `${config.apiUrl}/message/sendText/${encodeURIComponent(config.instance)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.apiKey,
      },
      body: JSON.stringify({
        number,
        text: MESSAGE,
        delay: EVOLUTION_SEND_DELAY_MS,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    },
  );

  const raw = await response.text();
  let payload: unknown = { raw: raw.slice(0, 500) };
  try {
    payload = JSON.parse(raw);
  } catch {}

  const result = envelope(payload);
  const rejected = ['ERROR', 'FAILED', 'CANCELED', 'CANCELLED'].includes(result.status);
  const destinationConfirmed =
    !result.remoteJid || acceptedJids(number).has(result.remoteJid);

  return {
    ok: response.ok && Boolean(result.id) && destinationConfirmed && !rejected,
    id: result.id,
    remoteJid: result.remoteJid,
    status: result.status,
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

  if (!(await consumeRateLimit(request, 'seminar_pending_reminder', 60, 6))) {
    return NextResponse.json(
      { error: 'Aguarde alguns segundos antes do próximo envio.' },
      { status: 429 },
    );
  }

  const connection = await getEvolutionConnectionState();
  if (!connection.open) {
    return NextResponse.json(
      { error: `A Evolution não está conectada (${connection.state}).`, disconnected: true },
      { status: 409 },
    );
  }

  const config = getEvolutionConfig();
  if (!evolutionConfigured(config)) {
    return NextResponse.json({ error: 'Evolution API não configurada.' }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as { id?: string; ids?: string[] };
  const id = String(body.id || body.ids?.[0] || '').trim();
  if (!id) {
    return NextResponse.json({ error: 'Destinatário não informado.' }, { status: 400 });
  }

  const service = getServiceClient();
  if (!service) {
    return NextResponse.json({ error: 'Serviço temporariamente indisponível.' }, { status: 503 });
  }

  const { data: form } = await service.from('forms').select('id').eq('slug', SLUG).maybeSingle();
  if (!form) {
    return NextResponse.json({ error: 'Formulário não encontrado.' }, { status: 404 });
  }

  const { data: row, error } = await service
    .from('form_submissions')
    .select('id, respondent_name, respondent_phone, answers')
    .eq('id', id)
    .eq('form_id', form.id)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: 'Inscrição não encontrada.' }, { status: 404 });
  }

  const answers =
    row.answers && typeof row.answers === 'object' && !Array.isArray(row.answers)
      ? (row.answers as Record<string, unknown>)
      : {};

  if (paymentStatus(answers) !== 'pending' || amountDue(answers.apostila) <= 0) {
    return NextResponse.json(
      { error: 'Esta inscrição não está mais pendente de pagamento.' },
      { status: 409 },
    );
  }

  if (reminderSent(answers)) {
    return NextResponse.json({ ok: true, sent: 0, alreadySent: true, sentIds: [String(row.id)] });
  }

  const number = phone(
    row.respondent_phone || answers.telefone || answers.whatsapp || answers.celular || '',
  );
  if (!validPhone(number)) {
    return NextResponse.json(
      { error: `O telefone de ${String(row.respondent_name || 'sem nome')} precisa de revisão.` },
      { status: 422 },
    );
  }

  try {
    const result = await sendText(number);
    if (!result.ok) {
      return NextResponse.json(
        { error: `A Evolution recusou a mensagem (HTTP ${result.httpStatus}).` },
        { status: 502 },
      );
    }

    const delivery = await waitForEvolutionMessageDelivery({
      messageId: result.id,
      remoteJid: result.remoteJid || `${number}@s.whatsapp.net`,
      initialStatus: result.status,
      maxWaitMs: 15_000,
      intervalMs: 2_000,
    });

    if (delivery.failed || !delivery.confirmed) {
      return NextResponse.json(
        {
          error: delivery.failed
            ? `O WhatsApp devolveu ${delivery.status}. A mensagem não foi registrada como enviada.`
            : `A mensagem ficou em ${delivery.status} sem confirmação. O processo foi interrompido.`,
        },
        { status: 502 },
      );
    }

    const nextAnswers = {
      ...answers,
      __seminar_pending_reminder: {
        status: 'sent',
        sent_at: new Date().toISOString(),
        phone: number,
        message_id: result.id,
        provider_status: delivery.status,
        text: MESSAGE,
      },
    };

    const { error: updateError } = await service
      .from('form_submissions')
      .update({ answers: nextAnswers })
      .eq('id', row.id);

    if (updateError) {
      return NextResponse.json(
        {
          error:
            'A mensagem foi confirmada pelo WhatsApp, mas não foi possível registrar o envio. O processo foi interrompido para evitar duplicidade.',
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        sent: 1,
        sentIds: [String(row.id)],
        providerStatus: delivery.status,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (sendError) {
    console.error('Seminar pending reminder send failed', {
      submissionId: String(row.id),
      message: String(sendError),
    });
    const afterFailure = await getEvolutionConnectionState();
    return NextResponse.json(
      {
        error: afterFailure.open
          ? 'O envio falhou e foi interrompido antes de avançar para outra pessoa.'
          : `A Evolution desconectou durante o envio (${afterFailure.state}).`,
        disconnected: !afterFailure.open,
      },
      { status: afterFailure.open ? 502 : 409 },
    );
  }
}
