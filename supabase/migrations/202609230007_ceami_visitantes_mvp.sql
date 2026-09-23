-- CEAMI Visitantes MVP
-- Área interna de acolhimento: cadastro de visita, retornos e acompanhamento.

alter table public.profiles
  add column if not exists visitors_only boolean not null default false;

create or replace function public.can_manage_visitors()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_active = true
      and (role = 'admin' or visitors_only = true)
  );
$$;

revoke all on function public.can_manage_visitors() from public, anon;
grant execute on function public.can_manage_visitors() to authenticated, service_role;

create table if not exists public.visitors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(btrim(full_name)) >= 3),
  phone text not null check (phone ~ '^[0-9]{10,11}$'),
  invited_by text,
  notes text,
  contact_consent boolean not null default false,
  followup_status text not null default 'nao_autorizado'
    check (followup_status in ('pendente','contatado','sem_resposta','nao_autorizado')),
  status text not null default 'ativo'
    check (status in ('ativo','arquivado')),
  first_visit_on date not null,
  last_visit_on date not null,
  visit_count integer not null default 1 check (visit_count > 0),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists visitors_phone_active_unique
  on public.visitors(phone)
  where status = 'ativo';

create index if not exists visitors_status_updated_idx on public.visitors(status, updated_at desc);
create index if not exists visitors_followup_idx on public.visitors(followup_status, updated_at desc);
create index if not exists visitors_last_visit_idx on public.visitors(last_visit_on desc);

create table if not exists public.visitor_visits (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.visitors(id) on delete cascade,
  visited_on date not null,
  reported_first_time boolean not null default false,
  notes text,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (visitor_id, visited_on)
);

create index if not exists visitor_visits_visitor_date_idx
  on public.visitor_visits(visitor_id, visited_on desc);

create table if not exists public.visitor_followups (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.visitors(id) on delete cascade,
  outcome text not null check (outcome in ('contatado','sem_resposta','observacao')),
  note text,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists visitor_followups_visitor_date_idx
  on public.visitor_followups(visitor_id, created_at desc);

alter table public.visitors enable row level security;
alter table public.visitor_visits enable row level security;
alter table public.visitor_followups enable row level security;

drop policy if exists "visitors team read" on public.visitors;
create policy "visitors team read" on public.visitors
for select to authenticated using (public.can_manage_visitors());

drop policy if exists "visitors team insert" on public.visitors;
create policy "visitors team insert" on public.visitors
for insert to authenticated with check (public.can_manage_visitors());

drop policy if exists "visitors team update" on public.visitors;
create policy "visitors team update" on public.visitors
for update to authenticated using (public.can_manage_visitors()) with check (public.can_manage_visitors());

drop policy if exists "visitor visits team read" on public.visitor_visits;
create policy "visitor visits team read" on public.visitor_visits
for select to authenticated using (public.can_manage_visitors());

drop policy if exists "visitor visits team insert" on public.visitor_visits;
create policy "visitor visits team insert" on public.visitor_visits
for insert to authenticated with check (public.can_manage_visitors());

drop policy if exists "visitor followups team read" on public.visitor_followups;
create policy "visitor followups team read" on public.visitor_followups
for select to authenticated using (public.can_manage_visitors());

drop policy if exists "visitor followups team insert" on public.visitor_followups;
create policy "visitor followups team insert" on public.visitor_followups
for insert to authenticated with check (public.can_manage_visitors());

grant select, insert, update on public.visitors to authenticated;
grant select, insert on public.visitor_visits to authenticated;
grant select, insert on public.visitor_followups to authenticated;

create or replace function public.visitor_find_by_phone(p_phone text)
returns table (
  id uuid,
  full_name text,
  phone text,
  invited_by text,
  notes text,
  contact_consent boolean,
  followup_status text,
  first_visit_on date,
  last_visit_on date,
  visit_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_visitors() then
    raise exception 'Acesso restrito ao CEAMI Visitantes.';
  end if;

  return query
  select
    v.id, v.full_name, v.phone, v.invited_by, v.notes,
    v.contact_consent, v.followup_status,
    v.first_visit_on, v.last_visit_on, v.visit_count
  from public.visitors v
  where v.phone = regexp_replace(coalesce(p_phone,''), '\D', '', 'g')
    and v.status = 'ativo'
  limit 1;
end;
$$;

revoke all on function public.visitor_find_by_phone(text) from public, anon;
grant execute on function public.visitor_find_by_phone(text) to authenticated;

create or replace function public.visitor_register_visit(
  p_full_name text,
  p_phone text,
  p_reported_first_time boolean,
  p_invited_by text default null,
  p_notes text default null,
  p_contact_consent boolean default false,
  p_visited_on date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
  v_visitor public.visitors%rowtype;
  v_visit_id uuid;
  v_is_new boolean := false;
  v_visit_added boolean := false;
  v_previous_visit date;
begin
  if not public.can_manage_visitors() then
    raise exception 'Acesso restrito ao CEAMI Visitantes.';
  end if;

  if nullif(btrim(p_full_name), '') is null or char_length(btrim(p_full_name)) < 3 then
    raise exception 'Informe o nome do visitante.';
  end if;

  if v_phone !~ '^[0-9]{10,11}$' then
    raise exception 'Informe um WhatsApp válido com DDD.';
  end if;

  if p_visited_on is null or p_visited_on > current_date + 1 then
    raise exception 'Data da visita inválida.';
  end if;

  select *
  into v_visitor
  from public.visitors
  where phone = v_phone and status = 'ativo'
  limit 1
  for update;

  if not found then
    insert into public.visitors (
      full_name, phone, invited_by, notes,
      contact_consent, followup_status,
      first_visit_on, last_visit_on, visit_count,
      created_by
    )
    values (
      btrim(p_full_name),
      v_phone,
      nullif(btrim(coalesce(p_invited_by,'')), ''),
      nullif(btrim(coalesce(p_notes,'')), ''),
      coalesce(p_contact_consent,false),
      case when coalesce(p_contact_consent,false) then 'pendente' else 'nao_autorizado' end,
      p_visited_on, p_visited_on, 1,
      auth.uid()
    )
    returning * into v_visitor;

    insert into public.visitor_visits (
      visitor_id, visited_on, reported_first_time, notes, created_by
    )
    values (
      v_visitor.id, p_visited_on, coalesce(p_reported_first_time,true),
      nullif(btrim(coalesce(p_notes,'')), ''), auth.uid()
    )
    returning id into v_visit_id;

    v_is_new := true;
    v_visit_added := true;
  else
    v_previous_visit := v_visitor.last_visit_on;

    insert into public.visitor_visits (
      visitor_id, visited_on, reported_first_time, notes, created_by
    )
    values (
      v_visitor.id, p_visited_on, coalesce(p_reported_first_time,false),
      nullif(btrim(coalesce(p_notes,'')), ''), auth.uid()
    )
    on conflict (visitor_id, visited_on) do nothing
    returning id into v_visit_id;

    v_visit_added := v_visit_id is not null;

    update public.visitors
    set
      full_name = btrim(p_full_name),
      invited_by = coalesce(nullif(btrim(coalesce(p_invited_by,'')), ''), invited_by),
      notes = coalesce(nullif(btrim(coalesce(p_notes,'')), ''), notes),
      contact_consent = coalesce(p_contact_consent,false),
      followup_status = case
        when coalesce(p_contact_consent,false) and v_visit_added then 'pendente'
        when not coalesce(p_contact_consent,false) then 'nao_autorizado'
        else followup_status
      end,
      last_visit_on = case when v_visit_added then greatest(last_visit_on,p_visited_on) else last_visit_on end,
      visit_count = visit_count + case when v_visit_added then 1 else 0 end,
      updated_at = now()
    where id = v_visitor.id
    returning * into v_visitor;
  end if;

  return jsonb_build_object(
    'visitor_id', v_visitor.id,
    'is_new', v_is_new,
    'visit_added', v_visit_added,
    'visit_count', v_visitor.visit_count,
    'previous_visit_on', v_previous_visit,
    'last_visit_on', v_visitor.last_visit_on,
    'full_name', v_visitor.full_name,
    'phone', v_visitor.phone,
    'contact_consent', v_visitor.contact_consent
  );
end;
$$;

revoke all on function public.visitor_register_visit(text,text,boolean,text,text,boolean,date) from public, anon;
grant execute on function public.visitor_register_visit(text,text,boolean,text,text,boolean,date) to authenticated;

create or replace function public.visitor_register_return(
  p_visitor_id uuid,
  p_visited_on date default current_date
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit_id uuid;
begin
  if not public.can_manage_visitors() then
    raise exception 'Acesso restrito ao CEAMI Visitantes.';
  end if;

  if p_visited_on is null or p_visited_on > current_date + 1 then
    raise exception 'Data inválida.';
  end if;

  insert into public.visitor_visits (
    visitor_id, visited_on, reported_first_time, created_by
  )
  select id, p_visited_on, false, auth.uid()
  from public.visitors
  where id = p_visitor_id and status = 'ativo'
  on conflict (visitor_id, visited_on) do nothing
  returning id into v_visit_id;

  if v_visit_id is null then
    return false;
  end if;

  update public.visitors
  set
    visit_count = visit_count + 1,
    last_visit_on = greatest(last_visit_on,p_visited_on),
    followup_status = case when contact_consent then 'pendente' else 'nao_autorizado' end,
    updated_at = now()
  where id = p_visitor_id;

  return true;
end;
$$;

revoke all on function public.visitor_register_return(uuid,date) from public, anon;
grant execute on function public.visitor_register_return(uuid,date) to authenticated;

create or replace function public.visitor_register_followup(
  p_visitor_id uuid,
  p_outcome text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.can_manage_visitors() then
    raise exception 'Acesso restrito ao CEAMI Visitantes.';
  end if;

  if p_outcome not in ('contatado','sem_resposta','observacao') then
    raise exception 'Resultado inválido.';
  end if;

  if not exists (
    select 1 from public.visitors
    where id = p_visitor_id and status = 'ativo'
  ) then
    raise exception 'Visitante não encontrado.';
  end if;

  insert into public.visitor_followups (
    visitor_id, outcome, note, created_by
  )
  values (
    p_visitor_id, p_outcome,
    nullif(btrim(coalesce(p_note,'')), ''),
    auth.uid()
  )
  returning id into v_id;

  if p_outcome in ('contatado','sem_resposta') then
    update public.visitors
    set followup_status = p_outcome, updated_at = now()
    where id = p_visitor_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.visitor_register_followup(uuid,text,text) from public, anon;
grant execute on function public.visitor_register_followup(uuid,text,text) to authenticated;

notify pgrst, 'reload schema';
