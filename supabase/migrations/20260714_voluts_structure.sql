-- Importação do relatório Voluts de 14/07/2026
create extension if not exists pgcrypto;

alter table public.members add column if not exists gender text;
alter table public.members add column if not exists source text;
alter table public.members add column if not exists normalized_name text generated always as (lower(regexp_replace(trim(full_name), '\s+', ' ', 'g'))) stored;

create unique index if not exists members_name_birth_unique
on public.members (normalized_name, birth_date)
where birth_date is not null;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.ministry_areas (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique(department_id, name)
);
create table if not exists public.ministry_functions (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.ministry_areas(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique(area_id, name)
);
create table if not exists public.member_functions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  function_id uuid not null references public.ministry_functions(id) on delete cascade,
  last_schedule_date date,
  active boolean not null default true,
  source text not null default 'voluts',
  created_at timestamptz not null default now(),
  unique(member_id, function_id)
);

alter table public.departments enable row level security;
alter table public.ministry_areas enable row level security;
alter table public.ministry_functions enable row level security;
alter table public.member_functions enable row level security;

drop policy if exists "authenticated read departments" on public.departments;
create policy "authenticated read departments" on public.departments for select to authenticated using (true);
drop policy if exists "authenticated read areas" on public.ministry_areas;
create policy "authenticated read areas" on public.ministry_areas for select to authenticated using (true);
drop policy if exists "authenticated read functions" on public.ministry_functions;
create policy "authenticated read functions" on public.ministry_functions for select to authenticated using (true);
drop policy if exists "authenticated read member functions" on public.member_functions;
create policy "authenticated read member functions" on public.member_functions for select to authenticated using (true);

-- Estrutura encontrada no relatório
insert into public.departments(name) values ('Aconselhamento') on conflict (name) do nothing;
insert into public.departments(name) values ('Apoio') on conflict (name) do nothing;
insert into public.departments(name) values ('Ceami worship') on conflict (name) do nothing;
insert into public.departments(name) values ('Comunicação') on conflict (name) do nothing;
insert into public.departments(name) values ('Dança') on conflict (name) do nothing;
insert into public.departments(name) values ('Diaconato') on conflict (name) do nothing;
insert into public.departments(name) values ('Intercessão') on conflict (name) do nothing;
insert into public.departments(name) values ('Kids') on conflict (name) do nothing;
insert into public.departments(name) values ('Liderança') on conflict (name) do nothing;
insert into public.departments(name) values ('Mídia') on conflict (name) do nothing;
insert into public.departments(name) values ('Obreiros') on conflict (name) do nothing;
insert into public.departments(name) values ('Projeção') on conflict (name) do nothing;
insert into public.departments(name) values ('Recepção') on conflict (name) do nothing;
insert into public.departments(name) values ('Recepção HUIOS') on conflict (name) do nothing;
insert into public.departments(name) values ('Sonoplastia') on conflict (name) do nothing;

-- As áreas e funções completas são criadas pelos arquivos de seed gerados a partir do Excel.
