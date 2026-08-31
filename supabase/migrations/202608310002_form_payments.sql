alter table public.form_submissions
  add column if not exists payment_status text not null default 'pending',
  add column if not exists payment_method text,
  add column if not exists amount_paid numeric(10,2),
  add column if not exists payment_confirmed_at timestamptz,
  add column if not exists payment_confirmed_by uuid,
  add column if not exists payment_confirmed_by_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'form_submissions_payment_status_check'
  ) then
    alter table public.form_submissions
      add constraint form_submissions_payment_status_check
      check (payment_status in ('pending', 'paid', 'exempt'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'form_submissions_payment_method_check'
  ) then
    alter table public.form_submissions
      add constraint form_submissions_payment_method_check
      check (payment_method is null or payment_method in ('pix', 'cash', 'card', 'other'));
  end if;
end $$;

create index if not exists form_submissions_payment_status_idx
  on public.form_submissions(form_id, payment_status);

create or replace function public.touch_form_submission_payment()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile_name text;
  v_form_price numeric(10,2);
begin
  if new.payment_status is distinct from old.payment_status then
    if new.payment_status in ('paid', 'exempt') then
      new.payment_confirmed_at = now();
      new.payment_confirmed_by = auth.uid();

      select p.full_name
        into v_profile_name
      from public.profiles p
      where p.id = auth.uid();

      new.payment_confirmed_by_name = coalesce(v_profile_name, 'Administrador');

      if new.payment_status = 'paid' then
        if new.amount_paid is null then
          select f.price into v_form_price
          from public.forms f
          where f.id = new.form_id;
          new.amount_paid = v_form_price;
        end if;
      else
        new.amount_paid = 0;
        new.payment_method = null;
      end if;
    else
      new.payment_confirmed_at = null;
      new.payment_confirmed_by = null;
      new.payment_confirmed_by_name = null;
      new.payment_method = null;
      new.amount_paid = null;
    end if;
  elsif new.payment_status = 'paid' and new.payment_confirmed_at is null then
    new.payment_confirmed_at = now();
    new.payment_confirmed_by = auth.uid();

    select p.full_name
      into v_profile_name
    from public.profiles p
    where p.id = auth.uid();

    new.payment_confirmed_by_name = coalesce(v_profile_name, 'Administrador');
  end if;

  return new;
end;
$$;

drop trigger if exists form_submissions_touch_payment on public.form_submissions;
create trigger form_submissions_touch_payment
before update of payment_status, payment_method, amount_paid
on public.form_submissions
for each row
execute procedure public.touch_form_submission_payment();

grant update on public.form_submissions to authenticated;

drop policy if exists form_submissions_admin_update on public.form_submissions;
create policy form_submissions_admin_update
on public.form_submissions
for update
to authenticated
using (public.is_ceami_admin())
with check (public.is_ceami_admin());

notify pgrst, 'reload schema';
