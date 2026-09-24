'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  LoaderCircle,
  Search,
  TicketCheck,
  UsersRound,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type EventRow = {
  id: string;
  title: string;
  capacity: number | null;
  event_start_at: string | null;
};

type LookupResult = {
  ticket: {
    code: string;
    checkedInAt: string | null;
    createdAt: string;
  };
  event: {
    id: string;
    title: string;
    price: number | null;
    capacity: number | null;
    event_start_at: string | null;
    event_location: string;
  };
  attendee: {
    id: string;
    respondent_name: string | null;
    respondent_phone: string | null;
    created_at: string;
  };
  paymentStatus: 'free' | 'paid' | 'exempt' | 'pending';
};

function paymentLabel(status: LookupResult['paymentStatus']) {
  if (status === 'paid') return 'Pago';
  if (status === 'exempt') return 'Isento';
  if (status === 'free') return 'Sem custo';
  return 'Pagamento pendente';
}

export default function CheckinClient() {
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventId, setEventId] = useState('');
  const [code, setCode] = useState('');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [stats, setStats] = useState({ total: 0, checked: 0 });

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase
        .from('forms')
        .select('id, title, capacity, event_start_at')
        .eq('ticketing_enabled', true)
        .order('created_at', { ascending: false });

      if (!active) return;
      const rows = (data || []) as EventRow[];
      setEvents(rows);

      const params = new URLSearchParams(window.location.search);
      const requested = params.get('evento') || '';
      const initial = rows.some((event) => event.id === requested) ? requested : rows[0]?.id || '';
      setEventId(initial);
    })();

    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (!eventId) {
      setStats({ total: 0, checked: 0 });
      return;
    }

    let active = true;
    void (async () => {
      const [totalResult, checkedResult] = await Promise.all([
        supabase
          .from('event_tickets')
          .select('id', { count: 'exact', head: true })
          .eq('form_id', eventId),
        supabase
          .from('event_tickets')
          .select('id', { count: 'exact', head: true })
          .eq('form_id', eventId)
          .not('checked_in_at', 'is', null),
      ]);

      if (active) {
        setStats({
          total: totalResult.count || 0,
          checked: checkedResult.count || 0,
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [eventId, supabase, success]);

  async function lookup(event?: FormEvent) {
    event?.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;

    setLoading(true);
    setError('');
    setSuccess('');
    setResult(null);

    const params = new URLSearchParams({ code: normalized });
    if (eventId) params.set('eventId', eventId);
    const response = await fetch(`/api/admin/events/checkin?${params.toString()}`);
    const payload = await response.json().catch(() => ({}));

    setLoading(false);
    if (!response.ok) {
      setError(payload.error || 'Ingresso não encontrado.');
      inputRef.current?.focus();
      return;
    }

    setResult(payload as LookupResult);
  }

  async function confirm(allowPending = false) {
    if (!result || checking) return;
    setChecking(true);
    setError('');

    const response = await fetch('/api/admin/events/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketCode: result.ticket.code,
        eventId: eventId || result.event.id,
        allowPending,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    setChecking(false);

    if (!response.ok) {
      if (payload.code === 'PAYMENT_PENDING' && !allowPending) {
        setError('PAYMENT_PENDING');
      } else {
        setError(payload.error || 'Não foi possível confirmar o check-in.');
      }
      return;
    }

    setSuccess(`Check-in confirmado para ${payload.attendee}.`);
    setResult((current) => current ? {
      ...current,
      ticket: { ...current.ticket, checkedInAt: payload.checkedInAt },
    } : current);
  }

  function nextTicket() {
    setCode('');
    setResult(null);
    setError('');
    setSuccess('');
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  const selectedEvent = events.find((event) => event.id === eventId);

  return (
    <main className="checkin-page">
      <header className="checkin-header">
        <Link href="/eventos"><ArrowLeft size={16} /> Eventos</Link>
        <span>CEAMI EVENTOS</span>
        <h1><TicketCheck /> Check-in</h1>
        <p>Digite ou leia o código do ingresso para validar a entrada.</p>
      </header>

      <section className="checkin-event">
        <label>
          <span>Evento</span>
          <select value={eventId} onChange={(event) => { setEventId(event.target.value); nextTicket(); }}>
            {events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
          </select>
        </label>
        <div className="checkin-stats">
          <div><UsersRound size={18} /><span>Ingressos<strong>{stats.total}{selectedEvent?.capacity ? ` / ${selectedEvent.capacity}` : ''}</strong></span></div>
          <div><CheckCircle2 size={18} /><span>Check-ins<strong>{stats.checked}</strong></span></div>
        </div>
      </section>

      <form className="checkin-search" onSubmit={lookup}>
        <label>
          <span>Código do ingresso</span>
          <div>
            <Search size={19} />
            <input
              ref={inputRef}
              autoFocus
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="CEAMI-XXXXXXXX"
              autoComplete="off"
            />
          </div>
        </label>
        <button disabled={loading || !code.trim()}>
          {loading ? <LoaderCircle className="checkin-spin" /> : <Search size={18} />}
          {loading ? 'Consultando...' : 'Consultar'}
        </button>
      </form>

      {error && error !== 'PAYMENT_PENDING' && (
        <div className="checkin-alert danger"><AlertTriangle /><div><strong>Não validado</strong><span>{error}</span></div></div>
      )}

      {result && (
        <section className={`checkin-ticket ${result.ticket.checkedInAt ? 'checked' : ''}`}>
          <div className="checkin-ticket-top">
            <div>
              <span>INGRESSO</span>
              <strong>{result.ticket.code}</strong>
            </div>
            <div className={`checkin-payment ${result.paymentStatus}`}>{paymentLabel(result.paymentStatus)}</div>
          </div>

          <div className="checkin-attendee">
            <span>Participante</span>
            <h2>{result.attendee.respondent_name || 'Nome não informado'}</h2>
            <p>{result.event.title}</p>
          </div>

          {result.ticket.checkedInAt ? (
            <div className="checkin-alert success">
              <CheckCircle2 />
              <div>
                <strong>Check-in já realizado</strong>
                <span>{new Date(result.ticket.checkedInAt).toLocaleString('pt-BR')}</span>
              </div>
            </div>
          ) : error === 'PAYMENT_PENDING' ? (
            <div className="checkin-pending">
              <div className="checkin-alert warning">
                <AlertTriangle />
                <div>
                  <strong>Pagamento pendente</strong>
                  <span>Confirme o pagamento no painel ou libere a entrada manualmente.</span>
                </div>
              </div>
              <div className="checkin-actions">
                <button type="button" className="secondary" onClick={nextTicket}>Cancelar</button>
                <button type="button" onClick={() => void confirm(true)} disabled={checking}>
                  {checking ? <LoaderCircle className="checkin-spin" /> : <CheckCircle2 />}
                  Liberar mesmo assim
                </button>
              </div>
            </div>
          ) : (
            <div className="checkin-actions">
              <button type="button" className="secondary" onClick={nextTicket}>Outro ingresso</button>
              <button type="button" onClick={() => void confirm(false)} disabled={checking}>
                {checking ? <LoaderCircle className="checkin-spin" /> : <CheckCircle2 />}
                {checking ? 'Confirmando...' : 'Confirmar check-in'}
              </button>
            </div>
          )}

          {success && <div className="checkin-alert success"><CheckCircle2 /><div><strong>Entrada liberada</strong><span>{success}</span></div></div>}
        </section>
      )}
    </main>
  );
}
