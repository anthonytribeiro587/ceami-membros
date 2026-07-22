-- Administração de acessos e manutenção de segurança.

create or replace function public.set_profile_access(
  p_profile_id uuid,
  p_is_active boolean,
  p_role public.user_role default 'visualizador',
  p_course_only boolean default false
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

  if p_profile_id = auth.uid() and coalesce(p_is_active, false) = false then
    raise exception 'O administrador não pode desativar a própria conta.';
  end if;

  update public.profiles
  set is_active = coalesce(p_is_active, false),
      role = case
        when coalesce(p_course_only, false) then 'lider'::public.user_role
        else coalesce(p_role, 'visualizador'::public.user_role)
      end,
      course_only = coalesce(p_course_only, false),
      updated_at = now()
  where id = p_profile_id;

  if not found then
    raise exception 'Perfil não encontrado.';
  end if;
end;
$$;

revoke all on function public.set_profile_access(uuid, boolean, public.user_role, boolean) from public;
grant execute on function public.set_profile_access(uuid, boolean, public.user_role, boolean) to authenticated;

create index if not exists profiles_active_role_idx
  on public.profiles (is_active, role, course_only);

create index if not exists audit_log_entity_created_idx
  on public.audit_log (entity_type, entity_id, created_at desc);

create index if not exists api_rate_limits_updated_idx
  on public.api_rate_limits (updated_at);

-- Remove chaves de rate limit antigas para impedir crescimento indefinido.
do $$
declare
  v_job_id bigint;
begin
  if to_regclass('cron.job') is null then
    return;
  end if;

  select jobid into v_job_id
  from cron.job
  where jobname = 'ceami-rate-limit-cleanup';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'ceami-rate-limit-cleanup',
    '17 3 * * *',
    $job$
      delete from public.api_rate_limits
      where updated_at < now() - interval '2 days';
    $job$
  );
end;
$$;

notify pgrst, 'reload schema';
