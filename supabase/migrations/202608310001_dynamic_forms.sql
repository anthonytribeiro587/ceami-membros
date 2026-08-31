create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text not null default '',
  event_details text not null default '',
  price numeric(10,2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.form_fields (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  key text not null,
  label text not null,
  field_type text not null default 'text' check (field_type in ('text', 'phone', 'email', 'textarea', 'yes_no', 'select')),
  required boolean not null default false,
  placeholder text not null default '',
  options jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (form_id, key)
);

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  respondent_name text,
  respondent_phone text,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists form_fields_form_sort_idx on public.form_fields(form_id, sort_order);
create index if not exists form_submissions_form_created_idx on public.form_submissions(form_id, created_at desc);

create or replace function public.touch_forms_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists forms_touch_updated_at on public.forms;
create trigger forms_touch_updated_at
before update on public.forms
for each row execute procedure public.touch_forms_updated_at();

alter table public.forms enable row level security;
alter table public.form_fields enable row level security;
alter table public.form_submissions enable row level security;

drop policy if exists forms_public_select on public.forms;
create policy forms_public_select
on public.forms
for select
to anon, authenticated
using (active = true or public.is_ceami_admin());

drop policy if exists forms_admin_insert on public.forms;
create policy forms_admin_insert
on public.forms
for insert
to authenticated
with check (public.is_ceami_admin());

drop policy if exists forms_admin_update on public.forms;
create policy forms_admin_update
on public.forms
for update
to authenticated
using (public.is_ceami_admin())
with check (public.is_ceami_admin());

drop policy if exists forms_admin_delete on public.forms;
create policy forms_admin_delete
on public.forms
for delete
to authenticated
using (public.is_ceami_admin());

drop policy if exists form_fields_public_select on public.form_fields;
create policy form_fields_public_select
on public.form_fields
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.forms f
    where f.id = form_fields.form_id
      and (f.active = true or public.is_ceami_admin())
  )
);

drop policy if exists form_fields_admin_insert on public.form_fields;
create policy form_fields_admin_insert
on public.form_fields
for insert
to authenticated
with check (public.is_ceami_admin());

drop policy if exists form_fields_admin_update on public.form_fields;
create policy form_fields_admin_update
on public.form_fields
for update
to authenticated
using (public.is_ceami_admin())
with check (public.is_ceami_admin());

drop policy if exists form_fields_admin_delete on public.form_fields;
create policy form_fields_admin_delete
on public.form_fields
for delete
to authenticated
using (public.is_ceami_admin());

drop policy if exists form_submissions_admin_select on public.form_submissions;
create policy form_submissions_admin_select
on public.form_submissions
for select
to authenticated
using (public.is_ceami_admin());

drop policy if exists form_submissions_admin_delete on public.form_submissions;
create policy form_submissions_admin_delete
on public.form_submissions
for delete
to authenticated
using (public.is_ceami_admin());

-- O envio público é feito exclusivamente pela API do app usando service role.
revoke insert, update, delete on public.form_submissions from anon;

do $$
declare
  v_form_id uuid;
begin
  insert into public.forms (title, slug, description, event_details, price, active)
  values (
    'Seminário de Estudo do Apocalipse',
    'seminario-apocalipse-2026',
    'Fim dos Tempos 🔥 — com o pastor Filipe D. A. R. Barbosa',
    E'11/09/2026 (sexta) — 20h às 22h\n12/09/2026 (sábado) — 16h às 22h\nCoffee-break às 19h\n\nA apostila será entregue no início do Seminário.\nTraga sua Bíblia, caneta e caderno de anotações.\nNo dia do Seminário, coloque seu celular no modo avião ou silencioso.',
    35.00,
    true
  )
  on conflict (slug) do update set
    title = excluded.title,
    description = excluded.description,
    event_details = excluded.event_details,
    price = excluded.price,
    active = excluded.active
  returning id into v_form_id;

  if v_form_id is null then
    select id into v_form_id from public.forms where slug = 'seminario-apocalipse-2026';
  end if;

  insert into public.form_fields (form_id, key, label, field_type, required, placeholder, sort_order)
  values
    (v_form_id, 'nome_completo', 'Nome completo', 'text', true, 'Seu nome completo', 1),
    (v_form_id, 'telefone', 'Telefone / WhatsApp', 'phone', true, '(51) 99999-9999', 2),
    (v_form_id, 'apostila', 'Vai querer apostila?', 'yes_no', true, '', 3)
  on conflict (form_id, key) do update set
    label = excluded.label,
    field_type = excluded.field_type,
    required = excluded.required,
    placeholder = excluded.placeholder,
    sort_order = excluded.sort_order;
end $$;

notify pgrst, 'reload schema';
