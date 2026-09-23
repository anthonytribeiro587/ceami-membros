-- CEAMI Social: volta ao modelo de conta criada manualmente no Supabase.
-- Novos usuários não recebem acesso automático ao Social.

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
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop function if exists public.social_access_profiles();
drop function if exists public.social_set_user_access(uuid, boolean);

notify pgrst, 'reload schema';
