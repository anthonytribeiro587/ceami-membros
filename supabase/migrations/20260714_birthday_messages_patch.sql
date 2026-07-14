create extension if not exists pgcrypto;

create table if not exists public.birthday_messages (
  id uuid primary key default gen_random_uuid()
);

alter table public.birthday_messages
  add column if not exists send_date date,
  add column if not exists group_id text,
  add column if not exists group_name text,
  add column if not exists message_type text,
  add column if not exists member_ids uuid[],
  add column if not exists member_names text[],
  add column if not exists message text,
  add column if not exists status text,
  add column if not exists provider_response jsonb,
  add column if not exists error_message text,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz;

update public.birthday_messages
set
  send_date = coalesce(send_date, current_date),
  group_id = coalesce(nullif(group_id, ''), 'legacy'),
  message_type = coalesce(nullif(message_type, ''), 'simulation'),
  member_ids = coalesce(member_ids, '{}'::uuid[]),
  member_names = coalesce(member_names, '{}'::text[]),
  message = coalesce(message, ''),
  status = coalesce(nullif(status, ''), 'sent'),
  created_at = coalesce(created_at, now())
where
  send_date is null
  or group_id is null
  or message_type is null
  or member_ids is null
  or member_names is null
  or message is null
  or status is null
  or created_at is null;

alter table public.birthday_messages
  alter column send_date set default current_date,
  alter column send_date set not null,
  alter column group_id set not null,
  alter column message_type set default 'simulation',
  alter column message_type set not null,
  alter column member_ids set default '{}'::uuid[],
  alter column member_ids set not null,
  alter column member_names set default '{}'::text[],
  alter column member_names set not null,
  alter column message set default '',
  alter column message set not null,
  alter column status set default 'sent',
  alter column status set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

create unique index if not exists birthday_messages_unique_sent
  on public.birthday_messages (send_date, group_id, message_type)
  where status = 'sent' and message_type in ('today', 'automatic');

create index if not exists birthday_messages_created_at_idx
  on public.birthday_messages (created_at desc);

alter table public.birthday_messages enable row level security;

notify pgrst, 'reload schema';
