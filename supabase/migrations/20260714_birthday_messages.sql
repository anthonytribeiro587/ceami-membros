create extension if not exists pgcrypto;

create table if not exists public.birthday_messages (
  id uuid primary key default gen_random_uuid(),
  send_date date not null,
  group_id text not null,
  group_name text,
  message_type text not null check (message_type in ('simulation', 'today', 'automatic')),
  member_ids uuid[] not null default '{}',
  member_names text[] not null default '{}',
  message text not null,
  status text not null check (status in ('sent', 'failed')),
  provider_response jsonb,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists birthday_messages_unique_sent
  on public.birthday_messages (send_date, group_id, message_type)
  where status = 'sent' and message_type in ('today', 'automatic');

create index if not exists birthday_messages_created_at_idx
  on public.birthday_messages (created_at desc);

alter table public.birthday_messages enable row level security;

comment on table public.birthday_messages is
  'Histórico de mensagens de aniversário enviadas aos grupos da igreja.';
