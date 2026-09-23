-- CEAMI Social: cadastro exclusivo e aprovação de acessos

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_first boolean;
  v_social_signup boolean;
begin
  select not exists (select 1 from public.profiles) into v_is_first;
  v_social_signup := coalesce(new.raw_user_meta_data->>'signup_portal', '') = 'social';

  insert into public.profiles (
    id,
    full_name,
    role,
    is_active,
    course_only,
    social_only
  )
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
    case when v_is_first then 'admin'::public.user_role else 'visualizador'::public.user_role end,
    v_is_first,
    false,
    case when v_is_first then false else v_social_signup end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.social_access_profiles()
returns table (
  id uuid,
  full_name text,
  email text,
  is_active boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ceami_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  return query
  select
    p.id,
    p.full_name,
    u.email::text,
    p.is_active,
    p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.social_only = true
  order by p.is_active asc, p.created_at desc;
end;
$$;

revoke all on function public.social_access_profiles() from public, anon;
grant execute on function public.social_access_profiles() to authenticated;

create or replace function public.social_set_user_access(
  p_profile_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ceami_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  if exists (
    select 1 from public.profiles
    where id = p_profile_id and role::text = 'admin'
  ) then
    raise exception 'Contas administrativas não são gerenciadas por esta tela.';
  end if;

  update public.profiles
  set
    social_only = true,
    course_only = false,
    is_active = coalesce(p_enabled, false),
    role = 'visualizador'::public.user_role,
    updated_at = now()
  where id = p_profile_id
    and social_only = true;

  if not found then
    raise exception 'Cadastro do CEAMI Social não encontrado.';
  end if;
end;
$$;

revoke all on function public.social_set_user_access(uuid, boolean) from public, anon;
grant execute on function public.social_set_user_access(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
