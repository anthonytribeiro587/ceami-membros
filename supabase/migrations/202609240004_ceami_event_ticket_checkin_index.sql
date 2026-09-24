-- CEAMI Eventos: índice para auditoria de check-in.
-- Data: 2026-09-24

create index if not exists event_tickets_checked_in_by_idx
  on public.event_tickets(checked_in_by)
  where checked_in_by is not null;
