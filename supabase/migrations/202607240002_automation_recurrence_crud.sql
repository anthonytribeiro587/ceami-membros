-- Recorrência configurável para automações personalizadas.
-- Mantém Aniversários e Plano de leitura como automações diárias do sistema.

alter table public.automations
  add column if not exists schedule_type text not null default 'daily',
  add column if not exists weekdays smallint[] not null default '{}'::smallint[],
  add column if not exists day_of_month smallint;

update public.automations
set
  schedule_type = 'daily',
  weekdays = '{}'::smallint[],
  day_of_month = null,
  updated_at = now()
where type in ('birthday', 'reading_plan');

update public.automations
set
  schedule_type = coalesce(nullif(schedule_type, ''), 'daily'),
  weekdays = case when schedule_type = 'weekly' then weekdays else '{}'::smallint[] end,
  day_of_month = case when schedule_type = 'monthly' then coalesce(day_of_month, 1) else null end,
  updated_at = now()
where type = 'custom';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'automations_schedule_type_check'
      and conrelid = 'public.automations'::regclass
  ) then
    alter table public.automations
      add constraint automations_schedule_type_check
      check (schedule_type in ('daily', 'weekly', 'monthly'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'automations_weekdays_check'
      and conrelid = 'public.automations'::regclass
  ) then
    alter table public.automations
      add constraint automations_weekdays_check
      check (
        weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
        and cardinality(weekdays) <= 7
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'automations_day_of_month_check'
      and conrelid = 'public.automations'::regclass
  ) then
    alter table public.automations
      add constraint automations_day_of_month_check
      check (day_of_month is null or day_of_month between 1 and 31);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'automations_schedule_configuration_check'
      and conrelid = 'public.automations'::regclass
  ) then
    alter table public.automations
      add constraint automations_schedule_configuration_check
      check (
        (schedule_type = 'daily' and cardinality(weekdays) = 0 and day_of_month is null)
        or (schedule_type = 'weekly' and cardinality(weekdays) >= 1 and day_of_month is null)
        or (schedule_type = 'monthly' and cardinality(weekdays) = 0 and day_of_month is not null)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'automations_system_schedule_check'
      and conrelid = 'public.automations'::regclass
  ) then
    alter table public.automations
      add constraint automations_system_schedule_check
      check (
        type = 'custom'
        or (
          schedule_type = 'daily'
          and cardinality(weekdays) = 0
          and day_of_month is null
        )
      );
  end if;
end
$$;

create index if not exists automations_enabled_schedule_time_idx
  on public.automations (enabled, schedule_type, send_time);
