-- Cursos, turmas, aulas e presença da CEAMI

create extension if not exists "pgcrypto";

do $$ begin
  create type public.course_status as enum ('active', 'inactive');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.course_class_status as enum ('planned', 'open', 'completed', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.course_lesson_status as enum ('scheduled', 'completed', 'rescheduled', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.course_enrollment_status as enum ('enrolled', 'completed', 'withdrawn');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.course_attendance_status as enum ('present', 'late', 'absent', 'justified');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.course_attendance_source as enum ('manual', 'qr');
exception when duplicate_object then null;
end $$;

create or replace function public.can_manage_courses()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'secretaria', 'pastor', 'lider')
  );
$$;

revoke all on function public.can_manage_courses() from public;
grant execute on function public.can_manage_courses() to authenticated;

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  default_lesson_count integer check (default_lesson_count is null or default_lesson_count > 0),
  default_minimum_attendance integer not null default 75 check (default_minimum_attendance between 0 and 100),
  status public.course_status not null default 'active',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.course_classes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete restrict,
  name text not null,
  organizer_name text,
  location text,
  start_date date,
  end_date date,
  minimum_attendance integer not null default 75 check (minimum_attendance between 0 and 100),
  status public.course_class_status not null default 'planned',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_classes_dates_check check (end_date is null or start_date is null or end_date >= start_date)
);

create table if not exists public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.course_classes(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  status public.course_enrollment_status not null default 'enrolled',
  enrolled_at timestamptz not null default now(),
  enrolled_by uuid references public.profiles(id),
  notes text,
  unique (class_id, member_id)
);

create table if not exists public.course_lessons (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.course_classes(id) on delete cascade,
  lesson_number integer not null check (lesson_number > 0),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status public.course_lesson_status not null default 'scheduled',
  notes text,
  checkin_token uuid not null default gen_random_uuid(),
  checkin_enabled boolean not null default false,
  checkin_open_at timestamptz,
  checkin_close_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, lesson_number),
  unique (checkin_token),
  constraint course_lessons_time_check check (ends_at is null or ends_at >= starts_at),
  constraint course_lessons_checkin_time_check check (
    checkin_close_at is null or checkin_open_at is null or checkin_close_at >= checkin_open_at
  )
);

create table if not exists public.course_attendance (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.course_lessons(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  status public.course_attendance_status not null,
  source public.course_attendance_source not null default 'manual',
  checked_in_at timestamptz,
  note text,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_id, member_id)
);

create table if not exists public.course_attendance_history (
  id bigint generated always as identity primary key,
  attendance_id uuid not null,
  lesson_id uuid not null,
  member_id uuid not null,
  old_status public.course_attendance_status,
  new_status public.course_attendance_status not null,
  source public.course_attendance_source not null,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now()
);

create index if not exists courses_name_idx on public.courses (name);
create index if not exists course_classes_course_idx on public.course_classes (course_id, status);
create index if not exists course_enrollments_class_idx on public.course_enrollments (class_id, status);
create index if not exists course_lessons_class_idx on public.course_lessons (class_id, starts_at);
create index if not exists course_attendance_lesson_idx on public.course_attendance (lesson_id, status);
create index if not exists course_attendance_member_idx on public.course_attendance (member_id);
create index if not exists course_attendance_history_lesson_idx on public.course_attendance_history (lesson_id, changed_at desc);

create or replace function public.log_course_attendance_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.course_attendance_history (
    attendance_id,
    lesson_id,
    member_id,
    old_status,
    new_status,
    source,
    changed_by
  ) values (
    new.id,
    new.lesson_id,
    new.member_id,
    case when tg_op = 'UPDATE' then old.status else null end,
    new.status,
    new.source,
    new.recorded_by
  );
  return new;
end;
$$;

revoke all on function public.log_course_attendance_change() from public;

drop trigger if exists course_attendance_history_trigger on public.course_attendance;
create trigger course_attendance_history_trigger
after insert or update of status on public.course_attendance
for each row execute function public.log_course_attendance_change();

alter table public.courses enable row level security;
alter table public.course_classes enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.course_lessons enable row level security;
alter table public.course_attendance enable row level security;
alter table public.course_attendance_history enable row level security;

drop policy if exists "authenticated can read courses" on public.courses;
create policy "authenticated can read courses"
on public.courses for select to authenticated using (true);

drop policy if exists "course managers can write courses" on public.courses;
create policy "course managers can write courses"
on public.courses for all to authenticated
using (public.can_manage_courses())
with check (public.can_manage_courses());

drop policy if exists "authenticated can read course classes" on public.course_classes;
create policy "authenticated can read course classes"
on public.course_classes for select to authenticated using (true);

drop policy if exists "course managers can write course classes" on public.course_classes;
create policy "course managers can write course classes"
on public.course_classes for all to authenticated
using (public.can_manage_courses())
with check (public.can_manage_courses());

drop policy if exists "authenticated can read course enrollments" on public.course_enrollments;
create policy "authenticated can read course enrollments"
on public.course_enrollments for select to authenticated using (true);

drop policy if exists "course managers can write course enrollments" on public.course_enrollments;
create policy "course managers can write course enrollments"
on public.course_enrollments for all to authenticated
using (public.can_manage_courses())
with check (public.can_manage_courses());

drop policy if exists "authenticated can read course lessons" on public.course_lessons;
create policy "authenticated can read course lessons"
on public.course_lessons for select to authenticated using (true);

drop policy if exists "course managers can write course lessons" on public.course_lessons;
create policy "course managers can write course lessons"
on public.course_lessons for all to authenticated
using (public.can_manage_courses())
with check (public.can_manage_courses());

drop policy if exists "authenticated can read course attendance" on public.course_attendance;
create policy "authenticated can read course attendance"
on public.course_attendance for select to authenticated using (true);

drop policy if exists "course managers can write course attendance" on public.course_attendance;
create policy "course managers can write course attendance"
on public.course_attendance for all to authenticated
using (public.can_manage_courses())
with check (public.can_manage_courses());

drop policy if exists "course managers can read attendance history" on public.course_attendance_history;
create policy "course managers can read attendance history"
on public.course_attendance_history for select to authenticated
using (public.can_manage_courses());

revoke all on public.courses from anon;
revoke all on public.course_classes from anon;
revoke all on public.course_enrollments from anon;
revoke all on public.course_lessons from anon;
revoke all on public.course_attendance from anon;
revoke all on public.course_attendance_history from anon;

grant select, insert, update, delete on public.courses to authenticated;
grant select, insert, update, delete on public.course_classes to authenticated;
grant select, insert, update, delete on public.course_enrollments to authenticated;
grant select, insert, update, delete on public.course_lessons to authenticated;
grant select, insert, update, delete on public.course_attendance to authenticated;
grant select on public.course_attendance_history to authenticated;
grant usage, select on sequence public.course_attendance_history_id_seq to authenticated;
