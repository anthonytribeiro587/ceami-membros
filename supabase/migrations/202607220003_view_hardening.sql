-- Views no schema public devem respeitar as políticas das tabelas-base.

do $$
begin
  if to_regclass('public.birthdays_this_month') is not null then
    execute 'alter view public.birthdays_this_month set (security_invoker = true)';
    execute 'revoke all on public.birthdays_this_month from public, anon';
    execute 'grant select on public.birthdays_this_month to authenticated';
  end if;
end;
$$;

-- Funções de gatilho não precisam ser executáveis por clientes.
-- As verificações tornam a migration segura mesmo quando uma instalação antiga
-- possui nomes diferentes ou ainda não criou um dos gatilhos.
do $$
begin
  if to_regprocedure('public.enforce_course_only_profile_role()') is not null then
    execute 'revoke all on function public.enforce_course_only_profile_role() from public, anon, authenticated';
  end if;

  if to_regprocedure('public.log_course_attendance_change()') is not null then
    execute 'revoke all on function public.log_course_attendance_change() from public, anon, authenticated';
  end if;
end;
$$;

notify pgrst, 'reload schema';
