import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUiRole } from '@/lib/server/current-profile';
import {
  consumeRateLimit,
  getServiceClient,
  requestComesFromSameSite,
} from '@/lib/server/security';
import {
  SEMINAR_APOCALIPSE_SLUG,
  seminarMaterialKind,
} from '@/lib/seminar-apocalipse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function answersOf(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function paymentStatus(answers: Record<string, unknown>) {
  const payment = answers.__payment;
  return payment && typeof payment === 'object' && !Array.isArray(payment)
    ? String((payment as Record<string, unknown>).status || '')
    : '';
}

function normalizePhone(value: unknown) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length > 11) digits = digits.replace(/^0+/, '');
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

function materialLabel(value: unknown) {
  const kind = seminarMaterialKind(value);
  if (kind === 'physical') return 'Física';
  if (kind === 'pdf') return 'PDF';
  return '';
}

function deliveryOf(answers: Record<string, unknown>) {
  const value = answers.__seminar_pdf_delivery;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isDelivered(answers: Record<string, unknown>) {
  return String(deliveryOf(answers)?.status || '') === 'sent';
}

function sourceLabel(delivery: Record<string, unknown> | null) {
  if (!delivery) return '';
  if (String(delivery.source || '') === 'manual') return 'Manual';
  const provider = String(delivery.provider_status || '').toUpperCase();
  if (['SERVER_ACK', 'DELIVERY_ACK', 'READ', 'READ_ACK', 'PLAYED'].includes(provider)) {
    return 'Automático confirmado';
  }
  return 'Registro anterior';
}

function respondentName(row: { respondent_name?: unknown; answers?: unknown }) {
  const answers = answersOf(row.answers);
  return String(row.respondent_name || answers.nome_completo || 'Não informado').trim();
}

function comparableName(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

function manualDelivery(answers: Record<string, unknown>, phone: string, sentAt: string) {
  return {
    ...answers,
    __seminar_pdf_delivery: {
      status: 'sent',
      source: 'manual',
      sent_at: sentAt,
      phone,
      message_id: 'manual',
      provider_status: 'MANUAL',
    },
  };
}

async function getSeminarFormId() {
  const service = getServiceClient();
  if (!service) return { service: null, formId: '' };
  const { data: form } = await service
    .from('forms')
    .select('id')
    .eq('slug', SEMINAR_APOCALIPSE_SLUG)
    .maybeSingle();
  return { service, formId: String(form?.id || '') };
}

async function authorize(request: NextRequest, limitKey: string, limit: number) {
  if (!requestComesFromSameSite(request)) {
    return NextResponse.json({ error: 'Origem não autorizada.' }, { status: 403 });
  }
  if ((await getCurrentUiRole()) !== 'admin') {
    return NextResponse.json({ error: 'Acesso restrito ao administrador.' }, { status: 403 });
  }
  if (!(await consumeRateLimit(request, limitKey, 60, limit))) {
    return NextResponse.json({ error: 'Aguarde um pouco e tente novamente.' }, { status: 429 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  const denied = await authorize(request, 'seminar_pdf_delivery_history', 30);
  if (denied) return denied;

  const { service, formId } = await getSeminarFormId();
  if (!service) {
    return NextResponse.json({ error: 'Serviço temporariamente indisponível.' }, { status: 503 });
  }
  if (!formId) {
    return NextResponse.json({ error: 'Formulário do seminário não encontrado.' }, { status: 404 });
  }

  const { data, error } = await service
    .from('form_submissions')
    .select('id, respondent_name, respondent_phone, answers, created_at')
    .eq('form_id', formId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'Não foi possível carregar o histórico.' }, { status: 500 });
  }

  const pending: Array<Record<string, unknown>> = [];
  const delivered: Array<Record<string, unknown>> = [];

  for (const row of data || []) {
    const answers = answersOf(row.answers);
    const material = materialLabel(answers.apostila);
    if (paymentStatus(answers) !== 'paid' || !material) continue;

    const phone = normalizePhone(
      row.respondent_phone || answers.telefone || answers.whatsapp || answers.celular || '',
    );
    const base = {
      id: String(row.id),
      name: respondentName(row),
      phone,
      material,
      createdAt: row.created_at || null,
    };

    if (!isDelivered(answers)) {
      pending.push(base);
      continue;
    }

    const delivery = deliveryOf(answers);
    delivered.push({
      ...base,
      sentAt: delivery?.sent_at || null,
      source: sourceLabel(delivery),
      providerStatus: String(delivery?.provider_status || ''),
      messageId: String(delivery?.message_id || ''),
    });
  }

  pending.sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { sensitivity: 'base' }),
  );
  delivered.sort((a, b) => {
    const ta = Date.parse(String(a.sentAt || a.createdAt || '')) || 0;
    const tb = Date.parse(String(b.sentAt || b.createdAt || '')) || 0;
    return tb - ta;
  });

  return NextResponse.json(
    {
      ok: true,
      summary: { pending: pending.length, delivered: delivered.length },
      pending,
      delivered,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: NextRequest) {
  const denied = await authorize(request, 'seminar_pdf_delivery_manual_mark', 40);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as {
    submissionId?: string;
    throughName?: string;
  };
  const submissionId = String(body.submissionId || '').trim();
  const throughName = String(body.throughName || '').trim();

  if (!submissionId && !throughName) {
    return NextResponse.json({ error: 'Inscrição ou faixa não informada.' }, { status: 400 });
  }

  const { service, formId } = await getSeminarFormId();
  if (!service) {
    return NextResponse.json({ error: 'Serviço temporariamente indisponível.' }, { status: 503 });
  }
  if (!formId) {
    return NextResponse.json({ error: 'Formulário do seminário não encontrado.' }, { status: 404 });
  }

  if (throughName) {
    const { data: rows, error } = await service
      .from('form_submissions')
      .select('id, respondent_name, respondent_phone, answers, created_at')
      .eq('form_id', formId);

    if (error) {
      return NextResponse.json({ error: 'Não foi possível carregar as inscrições.' }, { status: 500 });
    }

    const eligible = (rows || [])
      .filter((row) => {
        const answers = answersOf(row.answers);
        return paymentStatus(answers) === 'paid' && Boolean(materialLabel(answers.apostila));
      })
      .sort((a, b) => respondentName(a).localeCompare(respondentName(b), 'pt-BR', { sensitivity: 'base' }));

    const targetKey = comparableName(throughName);
    let matches = eligible.filter((row) => comparableName(respondentName(row)) === targetKey);
    if (matches.length === 0) {
      matches = eligible.filter((row) => comparableName(respondentName(row)).startsWith(`${targetKey} `));
    }
    if (matches.length === 0) {
      return NextResponse.json(
        { error: `Não encontrei "${throughName}" entre as inscrições aptas.` },
        { status: 404 },
      );
    }
    if (matches.length > 1) {
      return NextResponse.json(
        {
          error: `Encontrei mais de uma pessoa começando por "${throughName}". Marque individualmente para evitar erro.`,
          matches: matches.map((row) => respondentName(row)),
        },
        { status: 409 },
      );
    }

    const targetId = String(matches[0].id);
    const targetIndex = eligible.findIndex((row) => String(row.id) === targetId);
    const inRange = eligible.slice(0, targetIndex + 1);
    const pendingInRange = inRange.filter((row) => !isDelivered(answersOf(row.answers)));
    const sentAt = new Date().toISOString();
    const marked: string[] = [];

    for (const row of pendingInRange) {
      const answers = answersOf(row.answers);
      const phone = normalizePhone(
        row.respondent_phone || answers.telefone || answers.whatsapp || answers.celular || '',
      );
      const { error: updateError } = await service
        .from('form_submissions')
        .update({ answers: manualDelivery(answers, phone, sentAt) })
        .eq('id', row.id)
        .eq('form_id', formId);

      if (updateError) {
        return NextResponse.json(
          {
            error: `Falha ao registrar ${respondentName(row)}. ${marked.length} registro(s) anterior(es) foram salvos.`,
            marked: marked.length,
            markedNames: marked,
          },
          { status: 500 },
        );
      }
      marked.push(respondentName(row));
    }

    return NextResponse.json({
      ok: true,
      bulkMarked: true,
      throughName: respondentName(matches[0]),
      marked: marked.length,
      markedNames: marked,
      alreadyDeliveredInRange: inRange.length - pendingInRange.length,
    });
  }

  const { data: row, error } = await service
    .from('form_submissions')
    .select('id, respondent_name, respondent_phone, answers')
    .eq('id', submissionId)
    .eq('form_id', formId)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: 'Inscrição não encontrada.' }, { status: 404 });
  }

  const answers = answersOf(row.answers);
  const material = materialLabel(answers.apostila);
  if (paymentStatus(answers) !== 'paid' || !material) {
    return NextResponse.json({ error: 'Esta inscrição não está apta ao envio da apostila.' }, { status: 422 });
  }

  if (isDelivered(answers)) {
    return NextResponse.json({ ok: true, alreadyMarked: true });
  }

  const phone = normalizePhone(
    row.respondent_phone || answers.telefone || answers.whatsapp || answers.celular || '',
  );
  const now = new Date().toISOString();

  const { error: updateError } = await service
    .from('form_submissions')
    .update({ answers: manualDelivery(answers, phone, now) })
    .eq('id', submissionId)
    .eq('form_id', formId);

  if (updateError) {
    return NextResponse.json({ error: 'Não foi possível registrar o envio manual.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    delivered: {
      id: submissionId,
      name: respondentName(row),
      phone,
      material,
      sentAt: now,
      source: 'Manual',
      providerStatus: 'MANUAL',
      messageId: 'manual',
    },
  });
}
