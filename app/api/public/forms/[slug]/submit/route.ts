import { NextRequest, NextResponse } from 'next/server';
import {
  consumeRateLimit,
  getServiceClient,
  publicErrorMessage,
  readLimitedJson,
  requestComesFromSameSite,
} from '@/lib/server/security';
import { sendEvolutionPhoneText } from '@/lib/server/evolution-phone';
import {
  SEMINAR_APOCALIPSE_SLUG,
  seminarChoiceAvailability,
} from '@/lib/seminar-apocalipse';
import {
  parseServiceSettings,
  SERVICE_FORM_SLUG,
} from '@/lib/services';

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
  serviceConsent?: boolean;
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

function requestSummary(
  fields: FormField[],
  answers: Record<string, string>,
) {
  return fields
    .map((field) => {
      const value = cleanText(answers[field.key], field.field_type === 'textarea' ? 1200 : 350);
      return value ? `*${field.label}:* ${value}` : '';
    })
    .filter(Boolean)
    .join('\n');
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
      .select('id, title, active, event_details')
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

    if (slug === SEMINAR_APOCALIPSE_SLUG && normalized.apostila) {
      const availability = seminarChoiceAvailability(normalized.apostila);
      if (!availability.available) {
        return NextResponse.json({ error: availability.message }, { status: 409 });
      }
    }

    const isServiceRequest = slug === SERVICE_FORM_SLUG;
    if (isServiceRequest) {
      if (body.serviceConsent !== true) {
        return NextResponse.json(
          { error: 'Confirme que leu e concorda com as condições antes de enviar.' },
          { status: 400 },
        );
      }
      const acceptedAt = new Date().toISOString();
      normalized.__service_status = 'aberto';
      normalized.__service_created_at = acceptedAt;
      normalized.__service_terms_accepted_at = acceptedAt;
      normalized.__service_terms_version = '1';
    }

    const typedFields = (fields || []) as FormField[];
    const nameField = typedFields.find((field) =>
      ['nome', 'nome_completo', 'name', 'full_name'].includes(field.key),
    );
    const phoneField = typedFields.find((field) => field.field_type === 'phone');

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
      return NextResponse.json({ error: isServiceRequest ? 'Não foi possível salvar sua solicitação.' : 'Não foi possível salvar sua inscrição.' }, { status: 500 });
    }

    if (isServiceRequest) {
      const settings = parseServiceSettings(form.event_details);
      const respondentName = cleanText(
        nameField ? normalized[nameField.key] : '',
        120,
      ) || 'Solicitante';
      const respondentPhone = cleanText(
        phoneField ? normalized[phoneField.key] : '',
        40,
      );
      const protocol = String(inserted.id).slice(0, 8).toUpperCase();
      const summary = requestSummary(typedFields, normalized);

      const adminText = [
        '🛠️ *Nova solicitação de serviço — CEAMI*',
        '',
        `*Protocolo:* ${protocol}`,
        summary,
        '',
        'A solicitação já está disponível no painel CEAMI Serviços.',
      ]
        .filter(Boolean)
        .join('\n');

      const requesterText = [
        `Olá, ${respondentName}! 👋`,
        '',
        'Recebemos sua solicitação de serviço na CEAMI.',
        `*Protocolo:* ${protocol}`,
        '',
        'Seu pedido poderá ser compartilhado com prestadores de serviços da comunidade.',
        '',
        '*Importante:* os serviços são cobrados. Valores, prazos, materiais e demais condições são combinados diretamente entre você e o prestador. A CEAMI apenas facilita o contato e não participa da negociação, pagamento ou execução do serviço.',
      ].join('\n');

      const sends: Promise<unknown>[] = [];
      if (settings.notifyPhone) {
        sends.push(
          sendEvolutionPhoneText({
            phone: settings.notifyPhone,
            text: adminText,
          }).then((result) => {
            if (!result.ok) {
              console.error('Service admin WhatsApp notification failed:', result.errorMessage);
            }
          }),
        );
      }

      if (respondentPhone) {
        sends.push(
          sendEvolutionPhoneText({
            phone: respondentPhone,
            text: requesterText,
          }).then((result) => {
            if (!result.ok) {
              console.error('Service requester WhatsApp confirmation failed:', result.errorMessage);
            }
          }),
        );
      }

      if (sends.length) {
        await Promise.allSettled(sends);
      }
    }

    return NextResponse.json({
      ok: true,
      submissionId: inserted.id,
      serviceRequest: isServiceRequest,
    });
  } catch (error) {
    const publicError = publicErrorMessage(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
