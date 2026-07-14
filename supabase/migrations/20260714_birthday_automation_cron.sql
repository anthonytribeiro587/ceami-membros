create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table public.birthday_messages add column if not exists group_id text;
alter table public.birthday_messages add column if not exists group_name text;
alter table public.birthday_messages add column if not exists message_type text default 'automatic';
alter table public.birthday_messages add column if not exists member_ids uuid[];
alter table public.birthday_messages add column if not exists member_names text[];
alter table public.birthday_messages add column if not exists message text;
alter table public.birthday_messages add column if not exists provider_response jsonb;
alter table public.birthday_messages add column if not exists error_message text;
alter table public.birthday_messages alter column member_id drop not null;

do $$
declare current_job bigint;
begin
  select jobid into current_job
  from cron.job
  where jobname = 'ceami-birthday-automation';

  if current_job is not null then
    perform cron.unschedule(current_job);
  end if;
end
$$;

select cron.schedule(
  'ceami-birthday-automation',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://ceami-membros.vercel.app/api/birthdays/automatic',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 50000
    );
  $job$
);

select jobid, jobname, schedule, active
from cron.job
where jobname = 'ceami-birthday-automation';
