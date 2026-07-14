create table if not exists public.birthday_automation_settings (
  id text primary key default 'default',
  enabled boolean not null default true,
  send_time time not null default '14:20:00',
  timezone text not null default 'America/Sao_Paulo',
  group_id text not null default '120363427208796760@g.us',
  test_mode boolean not null default true,
  test_member_id uuid references public.members(id) on delete set null,
  last_sent_date date,
  last_sent_at timestamptz,
  last_status text,
  last_error text,
  updated_at timestamptz not null default now()
);

insert into public.birthday_automation_settings (
  id, enabled, send_time, timezone, group_id, test_mode, test_member_id
)
values (
  'default',
  true,
  '14:20:00',
  'America/Sao_Paulo',
  '120363427208796760@g.us',
  true,
  (select id from public.members where lower(full_name) like 'anthony thiago%' order by full_name limit 1)
)
on conflict (id) do update set
  enabled = true,
  send_time = '14:20:00',
  timezone = 'America/Sao_Paulo',
  group_id = excluded.group_id,
  test_mode = true,
  test_member_id = coalesce(public.birthday_automation_settings.test_member_id, excluded.test_member_id),
  last_sent_date = null,
  updated_at = now();

alter table public.birthday_automation_settings enable row level security;

drop policy if exists birthday_settings_select on public.birthday_automation_settings;
create policy birthday_settings_select
on public.birthday_automation_settings
for select to authenticated
using (true);

drop policy if exists birthday_settings_update on public.birthday_automation_settings;
create policy birthday_settings_update
on public.birthday_automation_settings
for update to authenticated
using (true)
with check (true);

notify pgrst, 'reload schema';

select * from public.birthday_automation_settings;
