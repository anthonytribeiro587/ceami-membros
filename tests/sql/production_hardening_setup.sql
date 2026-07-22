\set ON_ERROR_STOP on

create extension if not exists pgcrypto;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema auth;
create or replace function auth.uid()
returns uuid language sql stable as $$ select null::uuid $$;
create or replace function auth.role()
returns text language sql stable as $$ select 'service_role'::text $$;

create schema cron;
create sequence cron.jobid_seq;
create table cron.job (
  jobid bigint primary key default nextval('cron.jobid_seq'),
  jobname text unique not null,
  schedule text not null,
  command text not null,
  active boolean not null default true
);
create or replace function cron.schedule(p_name text, p_schedule text, p_command text)
returns bigint
language plpgsql
as $$
declare v_id bigint;
begin
  insert into cron.job(jobname, schedule, command)
  values (p_name, p_schedule, p_command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command, active = true
  returning jobid into v_id;
  return v_id;
end;
$$;
create or replace function cron.unschedule(p_jobid bigint)
returns boolean
language plpgsql
as $$
begin
  delete from cron.job where jobid = p_jobid;
  return true;
end;
$$;

create type public.user_role as enum ('admin', 'secretaria', 'pastor', 'lider', 'visualizador');
create type public.member_status as enum ('ativo', 'acompanhamento', 'afastado', 'transferido', 'inativo');
create type public.course_status as enum ('active', 'inactive');
create type public.course_class_status as enum ('planned', 'open', 'completed', 'cancelled');
create type public.course_enrollment_status as enum ('enrolled', 'completed', 'withdrawn');
create type public.course_lesson_status as enum ('scheduled', 'completed', 'rescheduled', 'cancelled');
create type public.course_attendance_status as enum ('present', 'late', 'absent', 'justified');
create type public.course_attendance_source as enum ('manual', 'qr');

create table public.profiles (
  id uuid primary key,
  full_name text not null,
  role public.user_role not null default 'visualizador',
  course_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  birth_date date,
  status public.member_status not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null
);
create table public.ministry_areas (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id),
  name text not null
);
create table public.ministry_functions (
  id uuid primary key default gen_random_uuid(),
  area_id uuid references public.ministry_areas(id),
  name text not null
);
create table public.member_functions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id),
  function_id uuid references public.ministry_functions(id),
  active boolean not null default true
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status public.course_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.course_classes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id),
  name text not null,
  status public.course_class_status not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.course_classes(id),
  member_id uuid not null references public.members(id),
  status public.course_enrollment_status not null default 'enrolled'
);
create table public.course_lessons (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.course_classes(id),
  starts_at timestamptz not null,
  status public.course_lesson_status not null default 'scheduled',
  updated_at timestamptz not null default now()
);
create table public.course_attendance (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.course_lessons(id),
  member_id uuid not null references public.members(id),
  status public.course_attendance_status not null default 'present',
  source public.course_attendance_source not null default 'manual',
  updated_at timestamptz not null default now()
);
create table public.course_attendance_history (
  id bigint generated always as identity primary key,
  attendance_id uuid,
  changed_at timestamptz not null default now()
);

create table public.birthday_automation_settings (
  id text primary key,
  group_id text,
  updated_at timestamptz not null default now()
);
create table public.birthday_messages (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id)
);
create table public.member_update_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id),
  status text not null default 'pending'
);

alter table public.profiles enable row level security;
alter table public.members enable row level security;
alter table public.departments enable row level security;
alter table public.ministry_areas enable row level security;
alter table public.ministry_functions enable row level security;
alter table public.member_functions enable row level security;
alter table public.courses enable row level security;
alter table public.course_classes enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.course_lessons enable row level security;
alter table public.course_attendance enable row level security;
alter table public.course_attendance_history enable row level security;
alter table public.birthday_automation_settings enable row level security;
alter table public.birthday_messages enable row level security;
alter table public.member_update_requests enable row level security;

create or replace function public.handle_new_user()
returns trigger language plpgsql as $$ begin return new; end $$;
create or replace function public.set_course_only_role()
returns trigger language plpgsql as $$ begin return new; end $$;
create or replace function public.log_course_attendance_change()
returns trigger language plpgsql as $$ begin return new; end $$;

create view public.birthdays_this_month as
select id, full_name, birth_date
from public.members
where birth_date is not null;
