-- CEAMI Suite: promover Acolhimentos e Cursos a módulos oficiais.
-- Data: 2026-09-24

alter table public.profile_module_access
  drop constraint if exists profile_module_access_module_check;

alter table public.profile_module_access
  add constraint profile_module_access_module_check
  check (
    module_key = any (
      array[
        'members'::text,
        'social'::text,
        'events'::text,
        'services'::text,
        'welcome'::text,
        'courses'::text
      ]
    )
  );

update public.profiles
set visitors_only = false,
    updated_at = now()
where id = 'e0a0a3c4-4ad6-48f0-9d91-ec8a8ec05920';

insert into public.profile_module_access (
  profile_id, module_key, access_level, can_access, updated_at
)
values (
  'e0a0a3c4-4ad6-48f0-9d91-ec8a8ec05920',
  'welcome',
  'manager',
  true,
  now()
)
on conflict (profile_id, module_key)
do update set
  access_level = 'manager',
  can_access = true,
  updated_at = now();

update public.profiles
set course_only = false,
    is_active = true,
    updated_at = now()
where id = '97224ae6-6117-4b71-80f4-53e85f77e4d8';

insert into public.profile_module_access (
  profile_id, module_key, access_level, can_access, updated_at
)
values (
  '97224ae6-6117-4b71-80f4-53e85f77e4d8',
  'courses',
  'manager',
  true,
  now()
)
on conflict (profile_id, module_key)
do update set
  access_level = 'manager',
  can_access = true,
  updated_at = now();

create or replace function public.can_manage_visitors()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.has_ceami_module_access('welcome', true);
$$;

revoke all on function public.can_manage_visitors() from public, anon;
grant execute on function public.can_manage_visitors() to authenticated;

create or replace function public.can_manage_courses()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.has_ceami_module_access('courses', true);
$$;

revoke all on function public.can_manage_courses() from public, anon;
grant execute on function public.can_manage_courses() to authenticated;

comment on function public.can_manage_visitors() is
  'Compatibilidade das RLS do acolhimento com o módulo CEAMI Acolhimentos.';
comment on function public.can_manage_courses() is
  'Compatibilidade das RLS de cursos com o módulo CEAMI Cursos.';
