import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUiRole } from '@/lib/server/current-profile';
import {
  getServiceClient,
  publicErrorMessage,
  readLimitedJson,
  requestComesFromSameSite,
} from '@/lib/server/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PaymentStatus = 'pending' | 'paid' | 'exempt';
type PaymentMethod = 'pix' | 'cash' | 'card' | 'other';

type PaymentBody = {
  submissionId?: unknown;
  status?: unknown;
  method?: unknown;
  amount?: unknown;
};

const VALID_STATUS = new Set<PaymentStatus>(['pending', 'paid', 'exempt']);
const VALID_METHOD = new Set<PaymentMethod>(['pix', 'cash', 'card', 'other']);

function cleanAmount(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(number) || number < 0 || number > 999999.99) return null;
  return Math.round(number * 100) / 100;
}

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function bookletPrice(answers: Record<string, unknown>) {
  const choice = normalize(answers.apostila);
  if (choice.includes('fisica') || choice === 'sim') return 35;
  if (choice.includes('pdf')) return 10;
  return 0;
}

export async function PATCH(request: NextRequest) {
  if (!requestComesFromSameSite(request)) {
    return NextResponse.json({ error: 'Origem da solicitação não autorizada.' }, { status: 403 });
  }

  const role = await getCurrentUiRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Acesso restrito ao administrador.' }, { status: 403 });
  }

  const service = getServiceClient();
  if (!service) {
    return NextResponse.json({ error: 'Serviço temporariamente indisponível.' }, { status: 503 });
  }

  try {
    const body = await readLimitedJson<PaymentBody>(request, 8_000);
    const submissionId = String(body.submissionId ?? '').trim();
    const status = String(body.status ?? '').trim() as PaymentStatus;
    const methodText = String(body.method ?? '').trim() as PaymentMethod;

    if (!submissionId || !VALID_STATUS.has(status)) {
      return NextResponse.json({ error: 'Dados de pagamento inválidos.' }, { status: 400 });
    }

    if (status === 'paid' && !VALID_METHOD.has(methodText)) {
      return NextResponse.json({ error: 'Selecione a forma de pagamento.' }, { status: 400 });
    }

    const { data: submission, error: submissionError } = await service
      .from('form_submissions')
      .select('id, form_id, answers')
      .eq('id', submissionId)
      .maybeSingle();

    if (submissionError || !submission) {
      return NextResponse.json({ error: 'Inscrição não encontrada.' }, { status: 404 });
    }

    const { data: form } = await service
      .from('forms')
      .select('slug, price')
      .eq('id', submission.form_id)
      .maybeSingle();

    const previousAnswers = submission.answers && typeof submission.answers === 'object' && !Array.isArray(submission.answers)
      ? (submission.answers as Record<string, unknown>)
      : {};

    const expectedAmount = form?.slug === 'seminario-apocalipse-2026'
      ? bookletPrice(previousAnswers)
      : (form?.price == null ? 0 : Number(form.price));

    if (status === 'paid' && expectedAmount <= 0) {
      return NextResponse.json({ error: 'Esta inscrição não possui cobrança.' }, { status: 400 });
    }

    const amount = status === 'paid'
      ? cleanAmount(body.amount) ?? expectedAmount
      : status === 'exempt'
        ? 0
        : null;

    const payment = status === 'pending'
      ? {
          status: 'pending' as const,
          method: null,
          amount: null,
          confirmedAt: null,
          confirmedBy: null,
        }
      : {
          status,
          method: status === 'paid' ? methodText : null,
          amount,
          confirmedAt: new Date().toISOString(),
          confirmedBy: 'Administrador',
        };

    const { error: updateError } = await service
      .from('form_submissions')
      .update({ answers: { ...previousAnswers, __payment: payment } })
      .eq('id', submissionId);

    if (updateError) throw new Error(updateError.message);

    return NextResponse.json(
      { ok: true, payment },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Inline form payment update failed:', error);
    const publicError = publicErrorMessage(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
