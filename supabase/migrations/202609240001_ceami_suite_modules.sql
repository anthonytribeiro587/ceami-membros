-- CEAMI Suite: acesso por modulo sem quebrar os portais legados.
-- Data: 2026-09-24

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.profile_module_access (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  module_key text not null,
  access_level text not null default 'viewer',
  can_access boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, module_key),
  constraint profile_module_access_module_check
    check (module_key in ('members', 'social', 'events', 'services')),
  constraint profile_module_access_level_check
    check (access_level in ('viewer', 'manager'))
);

alter table public.profile_module_access enable row level security;

revoke all on public.profile_module_access from anon;
revoke all on public.profile_module_access from authenticated;
grant select on public.profile_module_access to authenticated;

drop policy if exists "users read own module access" on public.profile_module_access;
create policy "users read own module access"
on public.profile_module_access
for select
to authenticated
using (
  profile_id = (select auth.uid())
  or public.is_ceami_admin()
);

-- Mantem o estado atual durante a transicao.
insert into public.profile_module_access (profile_id, module_key, access_level, can_access)
select
  p.id,
  m.module_key,
  'manager',
  true
from public.profiles p
cross join (
  values ('members'), ('social'), ('events'), ('services')
) as m(module_key)
where p.is_active = true
  and p.role::text = 'admin'
on conflict (profile_id, module_key)
do update set
  access_level = excluded.access_level,
  can_access = excluded.can_access,
  updated_at = now();

insert into public.profile_module_access (profile_id, module_key, access_level, can_access)
select
  p.id,
  'social',
  'manager',
  true
from public.profiles p
where p.is_active = true
  and p.social_only = true
on conflict (profile_id, module_key)
do update set
  access_level = excluded.access_level,
  can_access = excluded.can_access,
  updated_at = now();

insert into public.profile_module_access (profile_id, module_key, access_level, can_access)
select
  p.id,
  'members',
  case
    when p.role::text in ('admin', 'secretaria', 'pastor') then 'manager'
    else 'viewer'
  end,
  true
from public.profiles p
where p.is_active = true
  and p.course_only = false
  and p.social_only = false
  and p.visitors_only = false
on conflict (profile_id, module_key)
do update set
  access_level = excluded.access_level,
  can_access = excluded.can_access,
  updated_at = now();

create or replace function private.has_ceami_module_access(
  p_module_key text,
  p_manage boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    left join public.profile_module_access a
      on a.profile_id = p.id
     and a.module_key = p_module_key
    where p.id = (select auth.uid())
      and p.is_active = true
      and (
        p.role::text = 'admin'
        or (
          a.can_access = true
          and (
            p_manage = false
            or a.access_level = 'manager'
          )
        )
      )
  );
$$;

revoke all on function private.has_ceami_module_access(text, boolean) from public, anon;
grant execute on function private.has_ceami_module_access(text, boolean) to authenticated;

-- Mantemos as assinaturas usadas pelas RLS atuais, mas elas passam a consultar
-- a nova matriz de modulos. Assim o deploy antigo continua compativel.
create or replace function public.can_manage_social()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.has_ceami_module_access('social', true);
$$;

revoke all on function public.can_manage_social() from public, anon;
grant execute on function public.can_manage_social() to authenticated;

create or replace function public.is_active_ceami_user()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.has_ceami_module_access('members', false);
$$;

revoke all on function public.is_active_ceami_user() from public, anon;
grant execute on function public.is_active_ceami_user() to authenticated;

comment on table public.profile_module_access is
  'Permissoes de acesso aos modulos da suite CEAMI. Os flags *_only permanecem apenas para compatibilidade com portais legados.';
