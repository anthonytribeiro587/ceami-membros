create or replace function public.is_ceami_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_ceami_admin() to authenticated;

alter table public.birthday_automation_settings enable row level security;
alter table public.birthday_messages enable row level security;

drop policy if exists birthday_settings_select on public.birthday_automation_settings;
drop policy if exists birthday_settings_update on public.birthday_automation_settings;
drop policy if exists birthday_settings_admin_select on public.birthday_automation_settings;
drop policy if exists birthday_settings_admin_update on public.birthday_automation_settings;
create policy birthday_settings_admin_select on public.birthday_automation_settings for select to authenticated using (public.is_ceami_admin());
create policy birthday_settings_admin_update on public.birthday_automation_settings for update to authenticated using (public.is_ceami_admin()) with check (public.is_ceami_admin());

drop policy if exists birthday_messages_admin_select on public.birthday_messages;
create policy birthday_messages_admin_select on public.birthday_messages for select to authenticated using (public.is_ceami_admin());

notify pgrst, 'reload schema';
