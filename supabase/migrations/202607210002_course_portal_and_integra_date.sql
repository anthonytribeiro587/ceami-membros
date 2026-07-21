-- Acesso exclusivo ao portal de Cursos e data de participação no Integra

alter table public.profiles
  add column if not exists course_only boolean not null default false;

comment on column public.profiles.course_only is
  'Quando verdadeiro, o usuário acessa somente o módulo de Cursos. Administradores continuam com acesso completo.';

alter table public.members
  add column if not exists integra_date date;

comment on column public.members.integra_date is
  'Data em que a pessoa participou/preencheu o Integra CEAMI.';

update public.members
set integra_date = joined_at
where integra_date is null
  and joined_at is not null;

create index if not exists members_integra_date_idx
  on public.members (integra_date desc);

-- Contas exclusivas de Cursos usam o papel líder para manter as permissões
-- operacionais já existentes do módulo, mas o middleware bloqueia o restante do painel.
create or replace function public.enforce_course_only_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.course_only = true and new.role::text <> 'admin' then
    new.role = 'lider';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_course_only_profile_role() from public;

drop trigger if exists profiles_course_only_role_trigger on public.profiles;
create trigger profiles_course_only_role_trigger
before insert or update of course_only, role on public.profiles
for each row execute function public.enforce_course_only_profile_role();

update public.profiles
set role = 'lider'
where course_only = true
  and role::text <> 'admin';

-- Função administrativa para habilitar ou remover o acesso exclusivo aos Cursos.
create or replace function public.set_course_portal_access(
  p_profile_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role::text = 'admin'
  ) then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  update public.profiles
  set course_only = coalesce(p_enabled, false),
      updated_at = now()
  where id = p_profile_id;

  if not found then
    raise exception 'Perfil não encontrado.';
  end if;
end;
$$;

revoke all on function public.set_course_portal_access(uuid, boolean) from public;
grant execute on function public.set_course_portal_access(uuid, boolean) to authenticated;
