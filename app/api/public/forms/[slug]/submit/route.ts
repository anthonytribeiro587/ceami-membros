import { NextRequest, NextResponse } from 'next/server';
import {
  consumeRateLimit,
  getServiceClient,
  publicErrorMessage,
  readLimitedJson,
  requestComesFromSameSite,
} from '@/lib/server/security';

type FormField = {
  key: string;
  label: string;
  field_type: 'text' | 'phone' | 'email' | 'textarea' | 'yes_no' | 'select';
  required: boolean;
  options: unknown;
};

type SubmissionBody = {
  answers?: Record<string, unknown>;
  website?: string;
};

function cleanText(value: unknown, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeOptions(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const result: string[] = [];
  for (const raw of value.map((item) => String(item).trim()).filter(Boolean)) {
    const previous = result[result.length - 1];
    if (/^\d{2}\)\s*$/.test(raw) && previous && /R\$\s*\d+\s*$/.test(previous)) {
      result[result.length - 1] = `${previous},${raw}`;
    } else {
      result.push(raw);
    }
  }
  return result;
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
    const body = await readLimitedJson<SubmissionBody>(request, 32_000);

    if (cleanText(body.website, 120)) {
      return NextResponse.json({ ok: true });
    }

    const service = getServiceClient();
    if (!service) {
      return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 });
    }

    const allowed = await consumeRateLimit(request, 'public-form-submit', 60, 8, slug);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Muitas tentativas. Aguarde um instante e tente novamente.' },
        { status: 429 },
      );
    }

    const { data: form, error: formError } = await service
      .from('forms')
      .select('id, active')
      .eq('slug', slug)
      .maybeSingle();

    if (formError || !form || !form.active) {
      return NextResponse.json({ error: 'Formulário indisponível.' }, { status: 404 });
    }

    const { data: fields, error: fieldError } = await service
      .from('form_fields')
      .select('key, label, field_type, required, options')
      .eq('form_id', form.id)
      .order('sort_order', { ascending: true });

    if (fieldError) {
      console.error('Public form field load failed:', fieldError.message);
      return NextResponse.json({ error: 'Não foi possível carregar o formulário.' }, { status: 500 });
    }

    const incoming = body.answers && typeof body.answers === 'object' ? body.answers : {};
    const normalized: Record<string, string> = {};

    for (const field of (fields || []) as FormField[]) {
      const value = cleanText(incoming[field.key], field.field_type === 'textarea' ? 2000 : 500);
      if (field.required && !value) {
        return NextResponse.json(
          { error: `Preencha o campo “${field.label}”.` },
          { status: 400 },
        );
      }

      if (value && field.field_type === 'yes_no' && !['Sim', 'Não'].includes(value)) {
        return NextResponse.json({ error: `Valor inválido em “${field.label}”.` }, { status: 400 });
      }

      if (value && field.field_type === 'select') {
        const options = normalizeOptions(field.options);
        if (options.length && !options.includes(value)) {
          return NextResponse.json({ error: `Selecione uma opção válida em “${field.label}”.` }, { status: 400 });
        }
      }

      normalized[field.key] = value;
    }

    const nameField = (fields || []).find((field: FormField) =>
      ['nome', 'nome_completo', 'name', 'full_name'].includes(field.key),
    ) as FormField | undefined;
    const phoneField = (fields || []).find((field: FormField) => field.field_type === 'phone') as FormField | undefined;

    const { data: inserted, error: insertError } = await service
      .from('form_submissions')
      .insert({
        form_id: form.id,
        respondent_name: nameField ? normalized[nameField.key] || null : null,
        respondent_phone: phoneField ? normalized[phoneField.key] || null : null,
        answers: normalized,
      })
      .select('id')
      .single();

    if (insertError || !inserted?.id) {
      console.error('Public form submission failed:', insertError?.message || 'missing id');
      return NextResponse.json({ error: 'Não foi possível salvar sua inscrição.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, submissionId: inserted.id });
  } catch (error) {
    const publicError = publicErrorMessage(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
