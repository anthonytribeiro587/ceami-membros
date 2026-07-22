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
revoke all on function public.set_course_only_role() from public, anon, authenticated;
revoke all on function public.log_course_attendance_change() from public, anon, authenticated;

notify pgrst, 'reload schema';
