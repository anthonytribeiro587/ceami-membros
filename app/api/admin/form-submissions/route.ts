import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUiRole } from '@/lib/server/current-profile';
import {
  getServiceClient,
  publicErrorMessage,
  readLimitedJson,
  requestComesFromSameSite,
} from '@/lib/server/security';

type FieldType = 'text' | 'phone' | 'email' | 'textarea' | 'yes_no' | 'select';

type FormField = {
  key: string;
  label: string;
  field_type: FieldType;
  required: boolean;
  options: unknown;
};

type EditBody = {
  submissionId?: unknown;
  answers?: Record<string, unknown>;
};

const SEMINAR_SLUG = 'seminario-apocalipse-2026';
const SEMINAR_BOOKLET_OPTIONS = [
  'Sim — Física (R$ 35,00)',
  'Sim — PDF (R$ 10,00)',
  'Não — Sem custo',
] as const;

function cleanText(value: unknown, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function optionsFrom(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
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
    const body = await readLimitedJson<EditBody>(request, 32_000);
    const submissionId = cleanText(body.submissionId, 80);
    const incoming = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)
      ? body.answers
      : {};

    if (!submissionId) {
      return NextResponse.json({ error: 'Inscrição inválida.' }, { status: 400 });
    }

    const { data: submission, error: submissionError } = await service
      .from('form_submissions')
      .select('id, form_id, respondent_name, respondent_phone, answers')
      .eq('id', submissionId)
      .maybeSingle();

    if (submissionError || !submission) {
      return NextResponse.json({ error: 'Inscrição não encontrada.' }, { status: 404 });
    }

    const { data: form, error: formError } = await service
      .from('forms')
      .select('id, slug')
      .eq('id', submission.form_id)
      .maybeSingle();

    if (formError || !form) {
      return NextResponse.json({ error: 'Formulário não encontrado.' }, { status: 404 });
    }

    const { data: fields, error: fieldsError } = await service
      .from('form_fields')
      .select('key, label, field_type, required, options')
      .eq('form_id', form.id)
      .order('sort_order', { ascending: true });

    if (fieldsError) throw new Error(fieldsError.message);

    const normalized: Record<string, string> = {};
    const changedFields: string[] = [];
    const previousAnswers = submission.answers && typeof submission.answers === 'object' && !Array.isArray(submission.answers)
      ? (submission.answers as Record<string, unknown>)
      : {};

    for (const field of (fields || []) as FormField[]) {
      const max = field.field_type === 'textarea' ? 2000 : 500;
      const value = cleanText(incoming[field.key], max);

      if (field.required && !value) {
        return NextResponse.json({ error: `Preencha o campo “${field.label}”.` }, { status: 400 });
      }

      const isSeminarBooklet = form.slug === SEMINAR_SLUG && field.key === 'apostila';
      if (value && isSeminarBooklet && !SEMINAR_BOOKLET_OPTIONS.includes(value as typeof SEMINAR_BOOKLET_OPTIONS[number])) {
        return NextResponse.json({ error: 'Selecione uma opção de apostila válida.' }, { status: 400 });
      }

      if (value && !isSeminarBooklet && field.field_type === 'yes_no' && !['Sim', 'Não'].includes(value)) {
        return NextResponse.json({ error: `Valor inválido em “${field.label}”.` }, { status: 400 });
      }

      if (value && !isSeminarBooklet && field.field_type === 'select') {
        const options = optionsFrom(field.options);
        if (options.length && !options.includes(value)) {
          return NextResponse.json({ error: `Valor inválido em “${field.label}”.` }, { status: 400 });
        }
      }

      normalized[field.key] = value;
      if (String(previousAnswers[field.key] ?? '') !== value) changedFields.push(field.key);
    }

    const nameField = (fields || []).find((field: FormField) =>
      ['nome', 'nome_completo', 'name', 'full_name'].includes(field.key),
    ) as FormField | undefined;
    const phoneField = (fields || []).find((field: FormField) => field.field_type === 'phone') as FormField | undefined;

    const previousHistory = Array.isArray(previousAnswers.__edit_history)
      ? previousAnswers.__edit_history.slice(-19)
      : [];
    const correction = previousAnswers.__correction_request && typeof previousAnswers.__correction_request === 'object' && !Array.isArray(previousAnswers.__correction_request)
      ? (previousAnswers.__correction_request as Record<string, unknown>)
      : null;

    const metadata = Object.fromEntries(
      Object.entries(previousAnswers).filter(([key]) => key.startsWith('__')),
    );

    const nextAnswers: Record<string, unknown> = {
      ...normalized,
      ...metadata,
      __edit_history: [
        ...previousHistory,
        {
          editedAt: new Date().toISOString(),
          editedBy: 'Administrador',
          changedFields,
        },
      ],
    };

    if (correction && correction.status === 'open') {
      nextAnswers.__correction_request = {
        ...correction,
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
        resolvedBy: 'Administrador',
      };
    }

    const { data: updated, error: updateError } = await service
      .from('form_submissions')
      .update({
        respondent_name: nameField ? normalized[nameField.key] || null : submission.respondent_name,
        respondent_phone: phoneField ? normalized[phoneField.key] || null : submission.respondent_phone,
        answers: nextAnswers,
      })
      .eq('id', submissionId)
      .select('id, form_id, respondent_name, respondent_phone, answers, created_at')
      .single();

    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({ ok: true, submission: updated }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Form submission edit failed:', error);
    const publicError = publicErrorMessage(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
