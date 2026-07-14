create extension if not exists "pgcrypto";

create type public.member_status as enum ('ativo', 'acompanhamento', 'afastado', 'transferido', 'inativo');
create type public.user_role as enum ('admin', 'secretaria', 'pastor', 'lider', 'visualizador');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.user_role not null default 'visualizador',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  birth_date date,
  photo_url text,
  address text,
  neighborhood text,
  marital_status text,
  ministry text,
  baptism_date date,
  joined_at date,
  status public.member_status not null default 'ativo',
  notes text,
  whatsapp_consent boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.birthday_messages (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  message text not null,
  channel text not null default 'whatsapp',
  scheduled_for timestamptz,
  sent_at timestamptz,
  status text not null default 'pending',
  external_message_id text,
  error_message text,
  created_at timestamptz not null default now()
);

create index members_full_name_idx on public.members using gin (to_tsvector('portuguese', full_name));
create index members_birth_date_idx on public.members (birth_date);
create index members_status_idx on public.members (status);
create index birthday_messages_status_idx on public.birthday_messages (status, scheduled_for);

alter table public.profiles enable row level security;
alter table public.members enable row level security;
alter table public.birthday_messages enable row level security;

create policy "authenticated users can read members"
on public.members for select to authenticated using (true);

create policy "staff can insert members"
on public.members for insert to authenticated
with check (exists (
  select 1 from public.profiles p
  where p.id = auth.uid() and p.role in ('admin', 'secretaria', 'pastor')
));

create policy "staff can update members"
on public.members for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = auth.uid() and p.role in ('admin', 'secretaria', 'pastor')
));

create policy "admins can delete members"
on public.members for delete to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = auth.uid() and p.role = 'admin'
));

create policy "users can read own profile"
on public.profiles for select to authenticated using (id = auth.uid());

create policy "staff can read birthday messages"
on public.birthday_messages for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = auth.uid() and p.role in ('admin', 'secretaria', 'pastor')
));

create or replace view public.birthdays_this_month as
select
  id,
  full_name,
  phone,
  birth_date,
  ministry,
  extract(day from birth_date)::int as birthday_day
from public.members
where status = 'ativo'
  and birth_date is not null
  and extract(month from birth_date) = extract(month from current_date)
order by extract(day from birth_date), full_name;
