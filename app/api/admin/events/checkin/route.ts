import { NextRequest, NextResponse } from 'next/server';
import {
  getCurrentCeamiAccess,
  hasCurrentModuleAccess,
} from '@/lib/server/current-profile';
import {
  getServiceClient,
  readLimitedJson,
  requestComesFromSameSite,
} from '@/lib/server/security';

type CheckinBody = {
  ticketCode?: unknown;
  eventId?: unknown;
  allowPending?: unknown;
};

function cleanTicketCode(value: unknown) {
  return String(value || '').trim().toUpperCase().slice(0, 32);
}

function cleanId(value: unknown) {
  const text = String(value || '').trim();
  return /^[0-9a-f-]{36}$/i.test(text) ? text : '';
}

function paymentStatus(answers: unknown, price: unknown) {
  const due = Number(price) || 0;
  if (due <= 0) return 'free' as const;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return 'pending' as const;
  const raw = (answers as Record<string, unknown>).__payment;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'pending' as const;
  const status = String((raw as Record<string, unknown>).status || '');
  if (status === 'paid') return 'paid' as const;
  if (status === 'exempt') return 'exempt' as const;
  return 'pending' as const;
}

async function loadTicket(service: NonNullable<ReturnType<typeof getServiceClient>>, code: string) {
  const { data: ticket, error: ticketError } = await service
    .from('event_tickets')
    .select('id, form_id, submission_id, ticket_code, checked_in_at, checked_in_by, created_at')
    .eq('ticket_code', code)
    .maybeSingle();

  if (ticketError || !ticket) return null;

  const [{ data: form }, { data: submission }] = await Promise.all([
    service
      .from('forms')
      .select('id, title, price, capacity, event_start_at, event_location, ticketing_enabled')
      .eq('id', ticket.form_id)
      .maybeSingle(),
    service
      .from('form_submissions')
      .select('id, respondent_name, respondent_phone, answers, created_at')
      .eq('id', ticket.submission_id)
      .maybeSingle(),
  ]);

  if (!form || !submission) return null;

  return {
    ticket,
    form,
    submission,
    payment: paymentStatus(submission.answers, form.price),
  };
}

export async function GET(request: NextRequest) {
  if (!requestComesFromSameSite(request)) {
    return NextResponse.json({ error: 'Origem da solicitação não autorizada.' }, { status: 403 });
  }

  if (!(await hasCurrentModuleAccess('events', true))) {
    return NextResponse.json({ error: 'Acesso restrito ao CEAMI Eventos.' }, { status: 403 });
  }

  const code = cleanTicketCode(request.nextUrl.searchParams.get('code'));
  const eventId = cleanId(request.nextUrl.searchParams.get('eventId'));

  if (!code) {
    return NextResponse.json({ error: 'Informe o código do ingresso.' }, { status: 400 });
  }

  const service = getServiceClient();
  if (!service) {
    return NextResponse.json({ error: 'Serviço temporariamente indisponível.' }, { status: 503 });
  }

  const loaded = await loadTicket(service, code);
  if (!loaded) {
    return NextResponse.json({ error: 'Ingresso não encontrado.' }, { status: 404 });
  }

  if (eventId && loaded.form.id !== eventId) {
    return NextResponse.json({ error: 'Este ingresso pertence a outro evento.' }, { status: 409 });
  }

  return NextResponse.json({
    ticket: {
      code: loaded.ticket.ticket_code,
      checkedInAt: loaded.ticket.checked_in_at,
      createdAt: loaded.ticket.created_at,
    },
    event: loaded.form,
    attendee: loaded.submission,
    paymentStatus: loaded.payment,
  });
}

export async function POST(request: NextRequest) {
  if (!requestComesFromSameSite(request)) {
    return NextResponse.json({ error: 'Origem da solicitação não autorizada.' }, { status: 403 });
  }

  if (!(await hasCurrentModuleAccess('events', true))) {
    return NextResponse.json({ error: 'Acesso restrito ao CEAMI Eventos.' }, { status: 403 });
  }

  const body = await readLimitedJson<CheckinBody>(request, 4_000);
  const code = cleanTicketCode(body.ticketCode);
  const eventId = cleanId(body.eventId);
  const allowPending = body.allowPending === true;

  if (!code) {
    return NextResponse.json({ error: 'Informe o código do ingresso.' }, { status: 400 });
  }

  const service = getServiceClient();
  if (!service) {
    return NextResponse.json({ error: 'Serviço temporariamente indisponível.' }, { status: 503 });
  }

  const loaded = await loadTicket(service, code);
  if (!loaded) {
    return NextResponse.json({ error: 'Ingresso não encontrado.' }, { status: 404 });
  }

  if (eventId && loaded.form.id !== eventId) {
    return NextResponse.json({ error: 'Este ingresso pertence a outro evento.' }, { status: 409 });
  }

  if (loaded.ticket.checked_in_at) {
    return NextResponse.json(
      {
        error: 'Este ingresso já realizou check-in.',
        code: 'ALREADY_CHECKED_IN',
        checkedInAt: loaded.ticket.checked_in_at,
      },
      { status: 409 },
    );
  }

  if (loaded.payment === 'pending' && !allowPending) {
    return NextResponse.json(
      {
        error: 'O pagamento deste ingresso ainda está pendente.',
        code: 'PAYMENT_PENDING',
      },
      { status: 409 },
    );
  }

  const access = await getCurrentCeamiAccess();
  const checkedInAt = new Date().toISOString();

  const { data: updated, error } = await service
    .from('event_tickets')
    .update({
      checked_in_at: checkedInAt,
      checked_in_by: access?.profileId || null,
    })
    .eq('id', loaded.ticket.id)
    .is('checked_in_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Event check-in failed:', error.message);
    return NextResponse.json({ error: 'Não foi possível confirmar o check-in.' }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json(
      { error: 'Este ingresso já realizou check-in.', code: 'ALREADY_CHECKED_IN' },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    checkedInAt,
    attendee: loaded.submission.respondent_name || 'Participante',
    event: loaded.form.title,
  });
}
