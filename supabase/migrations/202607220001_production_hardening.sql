-- Hardening de produção do CEAMI Membros
-- Execute no Supabase antes de validar o Preview desta branch.

create extension if not exists "pgcrypto";

-- 1. Contas precisam ser aprovadas explicitamente.
alter table public.profiles
  add column if not exists is_active boolean not null default false;

-- Preserva o acesso das contas que já existiam antes desta revisão.
update public.profiles
set is_active = true
where is_active = false;

comment on column public.profiles.is_active is
  'Somente perfis aprovados podem acessar dados internos da CEAMI.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_first boolean;
begin
  select not exists (select 1 from public.profiles) into v_is_first;

  insert into public.profiles (id, full_name, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when v_is_first then 'admin'::public.user_role else 'visualizador'::public.user_role end,
    v_is_first
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

create or replace function public.is_active_ceami_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
  );
$$;

revoke all on function public.is_active_ceami_user() from public;
grant execute on function public.is_active_ceami_user() to authenticated;

create or replace function public.is_ceami_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role::text = 'admin'
  );
$$;

revoke all on function public.is_ceami_admin() from public;
grant execute on function public.is_ceami_admin() to authenticated;

-- Apenas o administrador geral e contas explicitamente marcadas para Cursos
-- podem consultar ou alterar o módulo de formação.
create or replace function public.can_manage_courses()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and (p.role::text = 'admin' or p.course_only = true)
  );
$$;

revoke all on function public.can_manage_courses() from public;
grant execute on function public.can_manage_courses() to authenticated;

-- 2. RLS: nenhuma conta não aprovada lê os dados internos.
drop policy if exists "authenticated users can read members" on public.members;
drop policy if exists "staff can insert members" on public.members;
drop policy if exists "staff can update members" on public.members;
drop policy if exists "admins can delete members" on public.members;

create policy "active users can read members"
on public.members for select to authenticated
using (public.is_active_ceami_user());

create policy "active staff can insert members"
on public.members for insert to authenticated
with check (
  public.is_active_ceami_user()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role::text in ('admin', 'secretaria', 'pastor')
      and p.course_only = false
  )
);

create policy "active staff can update members"
on public.members for update to authenticated
using (
  public.is_active_ceami_user()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role::text in ('admin', 'secretaria', 'pastor')
      and p.course_only = false
  )
)
with check (
  public.is_active_ceami_user()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role::text in ('admin', 'secretaria', 'pastor')
      and p.course_only = false
  )
);

create policy "active admins can delete members"
on public.members for delete to authenticated
using (public.is_ceami_admin());

-- Perfis: o próprio usuário consulta o seu; administradores ativos podem consultar todos.
drop policy if exists "users can read own profile" on public.profiles;
drop policy if exists "active users read own profile" on public.profiles;
create policy "active users read own profile"
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_ceami_admin());

-- Estrutura ministerial visível somente para contas aprovadas.
drop policy if exists "authenticated read departments" on public.departments;
drop policy if exists "authenticated read areas" on public.ministry_areas;
drop policy if exists "authenticated read functions" on public.ministry_functions;
drop policy if exists "authenticated read member functions" on public.member_functions;

create policy "active users read departments"
on public.departments for select to authenticated using (public.is_active_ceami_user());
create policy "active users read ministry areas"
on public.ministry_areas for select to authenticated using (public.is_active_ceami_user());
create policy "active users read ministry functions"
on public.ministry_functions for select to authenticated using (public.is_active_ceami_user());
create policy "active users read member functions"
on public.member_functions for select to authenticated using (public.is_active_ceami_user());

-- Cursos: remove leitura ampla e aplica a permissão específica do portal.
drop policy if exists "authenticated can read courses" on public.courses;
drop policy if exists "course managers can write courses" on public.courses;
drop policy if exists "authenticated can read course classes" on public.course_classes;
drop policy if exists "course managers can write course classes" on public.course_classes;
drop policy if exists "authenticated can read course enrollments" on public.course_enrollments;
drop policy if exists "course managers can write course enrollments" on public.course_enrollments;
drop policy if exists "authenticated can read course lessons" on public.course_lessons;
drop policy if exists "course managers can write course lessons" on public.course_lessons;
drop policy if exists "authenticated can read course attendance" on public.course_attendance;
drop policy if exists "course managers can write course attendance" on public.course_attendance;
drop policy if exists "course managers can read attendance history" on public.course_attendance_history;

create policy "approved course users read courses"
on public.courses for select to authenticated using (public.can_manage_courses());
create policy "approved course users write courses"
on public.courses for all to authenticated
using (public.can_manage_courses()) with check (public.can_manage_courses());

create policy "approved course users read classes"
on public.course_classes for select to authenticated using (public.can_manage_courses());
create policy "approved course users write classes"
on public.course_classes for all to authenticated
using (public.can_manage_courses()) with check (public.can_manage_courses());

create policy "approved course users read enrollments"
on public.course_enrollments for select to authenticated using (public.can_manage_courses());
create policy "approved course users write enrollments"
on public.course_enrollments for all to authenticated
using (public.can_manage_courses()) with check (public.can_manage_courses());

create policy "approved course users read lessons"
on public.course_lessons for select to authenticated using (public.can_manage_courses());
create policy "approved course users write lessons"
on public.course_lessons for all to authenticated
using (public.can_manage_courses()) with check (public.can_manage_courses());

create policy "approved course users read attendance"
on public.course_attendance for select to authenticated using (public.can_manage_courses());
create policy "approved course users write attendance"
on public.course_attendance for all to authenticated
using (public.can_manage_courses()) with check (public.can_manage_courses());

create policy "approved course users read attendance history"
on public.course_attendance_history for select to authenticated
using (public.can_manage_courses());

-- Configurações, histórico de aniversários e solicitações públicas: somente admin ativo.
drop policy if exists birthday_settings_admin_select on public.birthday_automation_settings;
drop policy if exists birthday_settings_admin_update on public.birthday_automation_settings;
create policy birthday_settings_admin_select
on public.birthday_automation_settings for select to authenticated
using (public.is_ceami_admin());
create policy birthday_settings_admin_update
on public.birthday_automation_settings for update to authenticated
using (public.is_ceami_admin()) with check (public.is_ceami_admin());

drop policy if exists birthday_messages_admin_select on public.birthday_messages;
drop policy if exists "staff can read birthday messages" on public.birthday_messages;
create policy birthday_messages_admin_select
on public.birthday_messages for select to authenticated
using (public.is_ceami_admin());

drop policy if exists "admins can review member update requests" on public.member_update_requests;
create policy "active admins can review member update requests"
on public.member_update_requests for all to authenticated
using (public.is_ceami_admin()) with check (public.is_ceami_admin());

-- 3. Segredos internos e rate limiting durável.
create table if not exists public.api_security_secrets (
  name text primary key,
  secret text not null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now()
);

revoke all on public.api_security_secrets from public, anon, authenticated;
grant select, insert, update on public.api_security_secrets to service_role;

insert into public.api_security_secrets (name, secret)
values
  ('public_lookup_signing', encode(gen_random_bytes(32), 'hex')),
  ('birthday_cron', encode(gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

create table if not exists public.api_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);

revoke all on public.api_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.api_rate_limits to service_role;

create or replace function public.consume_api_rate_limit(
  p_key text,
  p_window_seconds integer,
  p_max_requests integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Acesso negado.';
  end if;

  if p_key is null or length(p_key) < 8
     or p_window_seconds < 1 or p_window_seconds > 86400
     or p_max_requests < 1 or p_max_requests > 10000 then
    return false;
  end if;

  insert into public.api_rate_limits (rate_key, window_started_at, request_count, updated_at)
  values (p_key, now(), 1, now())
  on conflict (rate_key) do update
  set window_started_at = case
        when public.api_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
          then now()
        else public.api_rate_limits.window_started_at
      end,
      request_count = case
        when public.api_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
          then 1
        else public.api_rate_limits.request_count + 1
      end,
      updated_at = now()
  returning request_count into v_count;

  return v_count <= p_max_requests;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to service_role;

-- 4. Auditoria sem copiar o conteúdo sensível dos campos.
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  changed_fields text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from public, anon, authenticated;
grant select on public.audit_log to authenticated;
grant usage, select on sequence public.audit_log_id_seq to authenticated;

create policy "active admins read audit log"
on public.audit_log for select to authenticated
using (public.is_ceami_admin());

create or replace function public.write_ceami_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_id text;
  v_fields text[] := '{}';
begin
  if tg_op = 'DELETE' then
    v_entity_id := coalesce(to_jsonb(old)->>'id', 'unknown');
  else
    v_entity_id := coalesce(to_jsonb(new)->>'id', 'unknown');
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(array_agg(n.key order by n.key), '{}')
      into v_fields
    from jsonb_each(to_jsonb(new)) n
    where n.value is distinct from to_jsonb(old)->n.key;
  end if;

  insert into public.audit_log (actor_id, entity_type, entity_id, action, changed_fields)
  values (auth.uid(), tg_table_name, v_entity_id, lower(tg_op), v_fields);

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.write_ceami_audit_log() from public;

drop trigger if exists members_audit_trigger on public.members;
create trigger members_audit_trigger
after insert or update or delete on public.members
for each row execute function public.write_ceami_audit_log();

drop trigger if exists courses_audit_trigger on public.courses;
create trigger courses_audit_trigger
after insert or update or delete on public.courses
for each row execute function public.write_ceami_audit_log();

drop trigger if exists course_classes_audit_trigger on public.course_classes;
create trigger course_classes_audit_trigger
after insert or update or delete on public.course_classes
for each row execute function public.write_ceami_audit_log();

-- 5. Integridade: uma aula futura não pode ser consolidada como realizada.
create or replace function public.prevent_future_lesson_completion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status::text = 'completed'
     and old.status::text <> 'completed'
     and new.starts_at > now() then
    raise exception 'Uma aula futura não pode ser encerrada.';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_future_lesson_completion() from public;

drop trigger if exists prevent_future_lesson_completion_trigger on public.course_lessons;
create trigger prevent_future_lesson_completion_trigger
before update of status on public.course_lessons
for each row execute function public.prevent_future_lesson_completion();

-- 6. Registro de transparência/privacidade para novas fichas.
alter table public.members
  add column if not exists privacy_notice_version text,
  add column if not exists privacy_notice_accepted_at timestamptz,
  add column if not exists privacy_notice_source text;

-- 7. Cron autenticado. O segredo permanece apenas no banco e no comando do pg_cron.
do $$
declare
  v_job_id bigint;
  v_secret text;
  v_command text;
begin
  if to_regclass('cron.job') is null then
    return;
  end if;

  select secret into v_secret
  from public.api_security_secrets
  where name = 'birthday_cron';

  select jobid into v_job_id
  from cron.job
  where jobname = 'ceami-birthday-automation';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  v_command := format(
    $cmd$
      select net.http_post(
        url := 'https://ceami-membros.vercel.app/api/birthdays/automatic',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer %s'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 50000
      );
    $cmd$,
    v_secret
  );

  perform cron.schedule('ceami-birthday-automation', '* * * * *', v_command);
end;
$$;

notify pgrst, 'reload schema';
