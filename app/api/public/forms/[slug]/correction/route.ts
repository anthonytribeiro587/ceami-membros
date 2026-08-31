import { NextRequest, NextResponse } from 'next/server';
import {
  consumeRateLimit,
  getServiceClient,
  publicErrorMessage,
  readLimitedJson,
  requestComesFromSameSite,
} from '@/lib/server/security';

type CorrectionBody = {
  submissionId?: unknown;
  message?: unknown;
};

function cleanText(value: unknown, max = 600) {
  return String(value ?? '').trim().slice(0, max);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  if (!requestComesFromSameSite(request)) {
    return NextResponse.json({ error: 'Origem inválida.' }, { status: 403 });
  }

  try {
    const { slug } = await context.params;
    const body = await readLimitedJson<CorrectionBody>(request, 8_000);
    const submissionId = cleanText(body.submissionId, 80);
    const message = cleanText(body.message, 600);

    if (!submissionId || !message) {
      return NextResponse.json({ error: 'Explique o que precisa ser corrigido.' }, { status: 400 });
    }

    const service = getServiceClient();
    if (!service) {
      return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 });
    }

    const allowed = await consumeRateLimit(request, 'public-form-correction', 600, 4, submissionId);
    if (!allowed) {
      return NextResponse.json({ error: 'Aguarde um pouco antes de enviar outra solicitação.' }, { status: 429 });
    }

    const { data: form } = await service
      .from('forms')
      .select('id, active')
      .eq('slug', slug)
      .maybeSingle();

    if (!form?.id || !form.active) {
      return NextResponse.json({ error: 'Formulário indisponível.' }, { status: 404 });
    }

    const { data: submission, error: submissionError } = await service
      .from('form_submissions')
      .select('id, form_id, answers')
      .eq('id', submissionId)
      .eq('form_id', form.id)
      .maybeSingle();

    if (submissionError || !submission) {
      return NextResponse.json({ error: 'Não foi possível localizar sua inscrição.' }, { status: 404 });
    }

    const answers = submission.answers && typeof submission.answers === 'object' && !Array.isArray(submission.answers)
      ? (submission.answers as Record<string, unknown>)
      : {};

    const correction = {
      status: 'open',
      message,
      requestedAt: new Date().toISOString(),
    };

    const { error: updateError } = await service
      .from('form_submissions')
      .update({ answers: { ...answers, __correction_request: correction } })
      .eq('id', submission.id);

    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Public form correction request failed:', error);
    const publicError = publicErrorMessage(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
