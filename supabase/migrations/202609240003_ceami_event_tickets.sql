-- CEAMI Eventos: ingressos, capacidade e check-in.
-- Data: 2026-09-24

alter table public.forms
  add column if not exists ticketing_enabled boolean not null default false,
  add column if not exists capacity integer,
  add column if not exists event_start_at timestamptz,
  add column if not exists event_location text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'forms_capacity_positive'
      and conrelid = 'public.forms'::regclass
  ) then
    alter table public.forms
      add constraint forms_capacity_positive
      check (capacity is null or capacity > 0);
  end if;
end
$$;

create table if not exists public.event_tickets (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  submission_id uuid not null unique references public.form_submissions(id) on delete cascade,
  ticket_code text not null unique,
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists event_tickets_form_id_idx
  on public.event_tickets(form_id);

create index if not exists event_tickets_checkin_idx
  on public.event_tickets(form_id, checked_in_at);

alter table public.event_tickets enable row level security;

revoke all on public.event_tickets from anon;
revoke all on public.event_tickets from authenticated;
grant select on public.event_tickets to authenticated;

drop policy if exists "event managers read tickets" on public.event_tickets;
create policy "event managers read tickets"
on public.event_tickets
for select
to authenticated
using (private.can_manage_form(form_id));

create or replace function public.create_ticketed_event_submission(
  p_form_id uuid,
  p_respondent_name text,
  p_respondent_phone text,
  p_answers jsonb
)
returns table (
  submission_id uuid,
  ticket_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_form record;
  v_count integer;
  v_submission_id uuid;
  v_ticket_code text;
begin
  select id, active, ticketing_enabled, capacity
    into v_form
  from public.forms
  where id = p_form_id
  for update;

  if not found or v_form.active is not true or v_form.ticketing_enabled is not true then
    raise exception 'EVENT_NOT_AVAILABLE';
  end if;

  if v_form.capacity is not null then
    select count(*)
      into v_count
    from public.event_tickets
    where form_id = p_form_id;

    if v_count >= v_form.capacity then
      raise exception 'EVENT_CAPACITY_REACHED';
    end if;
  end if;

  insert into public.form_submissions (
    form_id,
    respondent_name,
    respondent_phone,
    answers
  )
  values (
    p_form_id,
    nullif(trim(coalesce(p_respondent_name, '')), ''),
    nullif(trim(coalesce(p_respondent_phone, '')), ''),
    coalesce(p_answers, '{}'::jsonb)
  )
  returning id into v_submission_id;

  v_ticket_code := 'CEAMI-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.event_tickets (
    form_id,
    submission_id,
    ticket_code
  )
  values (
    p_form_id,
    v_submission_id,
    v_ticket_code
  );

  return query
  select v_submission_id, v_ticket_code;
end;
$$;

revoke all on function public.create_ticketed_event_submission(uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_ticketed_event_submission(uuid, text, text, jsonb)
  to service_role;

comment on table public.event_tickets is
  'Ingressos emitidos para eventos CEAMI com controle de capacidade e check-in.';
