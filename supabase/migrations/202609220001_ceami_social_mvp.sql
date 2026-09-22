-- CEAMI Social MVP
-- Área isolada no mesmo Supabase do CEAMI Membros.
-- O acesso social_only não concede acesso aos módulos gerais da igreja.

create extension if not exists "pgcrypto";

-- 1. Acesso isolado ao CEAMI Social
alter table public.profiles
  add column if not exists social_only boolean not null default false;

comment on column public.profiles.social_only is
  'Quando verdadeiro, o usuário acessa somente o CEAMI Social. Administradores continuam com acesso geral.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_single_restricted_portal_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_single_restricted_portal_check
      check (not (coalesce(course_only, false) and coalesce(social_only, false)));
  end if;
end
$$;

create or replace function public.can_manage_social()
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
      and p.is_active = true
      and (p.role::text = 'admin' or p.social_only = true)
  );
$$;

revoke all on function public.can_manage_social() from public, anon;
grant execute on function public.can_manage_social() to authenticated;

-- Usuários exclusivos do Social não podem consultar dados do painel geral
-- por API direta, mesmo que tentem contornar a navegação.
create or replace function public.is_active_ceami_user()
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
      and p.is_active = true
      and (p.social_only = false or p.role::text = 'admin')
  );
$$;

revoke all on function public.is_active_ceami_user() from public;
grant execute on function public.is_active_ceami_user() to authenticated;

create or replace function public.set_social_portal_access(
  p_profile_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ceami_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  update public.profiles
  set social_only = coalesce(p_enabled, false),
      course_only = case when coalesce(p_enabled, false) then false else course_only end,
      role = case
        when role::text = 'admin' then role
        when coalesce(p_enabled, false) then 'visualizador'::public.user_role
        else role
      end,
      updated_at = now()
  where id = p_profile_id;

  if not found then
    raise exception 'Perfil não encontrado.';
  end if;
end;
$$;

revoke all on function public.set_social_portal_access(uuid, boolean) from public, anon;
grant execute on function public.set_social_portal_access(uuid, boolean) to authenticated;

-- O Social precisa apenas do nome de quem registrou cada movimentação.
create or replace function public.social_actor_profiles()
returns table (
  id uuid,
  full_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name
  from public.profiles p
  where public.can_manage_social()
    and p.is_active = true
    and (p.role::text = 'admin' or p.social_only = true)
  order by p.full_name;
$$;

revoke all on function public.social_actor_profiles() from public, anon;
grant execute on function public.social_actor_profiles() to authenticated;

create or replace function public.set_course_portal_access(
  p_profile_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ceami_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  update public.profiles
  set course_only = coalesce(p_enabled, false),
      social_only = case when coalesce(p_enabled, false) then false else social_only end,
      updated_at = now()
  where id = p_profile_id;

  if not found then
    raise exception 'Perfil não encontrado.';
  end if;
end;
$$;

revoke all on function public.set_course_portal_access(uuid, boolean) from public, anon;
grant execute on function public.set_course_portal_access(uuid, boolean) to authenticated;

create or replace function public.set_profile_access(
  p_profile_id uuid,
  p_is_active boolean,
  p_role public.user_role default 'visualizador',
  p_course_only boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_database_admin boolean := session_user in ('postgres', 'supabase_admin');
begin
  if not public.is_ceami_admin() and not v_database_admin then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  if auth.uid() is not null
     and p_profile_id = auth.uid()
     and coalesce(p_is_active, false) = false then
    raise exception 'O administrador não pode desativar a própria conta.';
  end if;

  update public.profiles
  set is_active = coalesce(p_is_active, false),
      role = case
        when coalesce(p_course_only, false) then 'lider'::public.user_role
        else coalesce(p_role, 'visualizador'::public.user_role)
      end,
      course_only = coalesce(p_course_only, false),
      social_only = false,
      updated_at = now()
  where id = p_profile_id;

  if not found then
    raise exception 'Perfil não encontrado.';
  end if;
end;
$$;

revoke all on function public.set_profile_access(uuid, boolean, public.user_role, boolean) from public;
grant execute on function public.set_profile_access(uuid, boolean, public.user_role, boolean) to authenticated;

-- 2. Estrutura do estoque e da assistência social
create table if not exists public.social_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  package_label text not null default '',
  unit_label text not null default 'unidades',
  category text not null default 'alimentos'
    check (category in ('alimentos', 'higiene', 'limpeza', 'roupas', 'outros')),
  min_stock integer not null default 0 check (min_stock >= 0),
  tracks_expiry boolean not null default true,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists social_products_name_package_unique
  on public.social_products (lower(name), lower(package_label));

create table if not exists public.social_donations (
  id uuid primary key default gen_random_uuid(),
  donor_name text,
  note text,
  received_on date not null default current_date,
  created_by uuid not null references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.social_donation_items (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references public.social_donations(id) on delete restrict,
  product_id uuid not null references public.social_products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  expires_on date,
  created_at timestamptz not null default now()
);

create table if not exists public.social_stock_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.social_products(id) on delete restrict,
  donation_id uuid references public.social_donations(id) on delete set null,
  quantity_received integer not null check (quantity_received > 0),
  quantity_available integer not null check (quantity_available >= 0 and quantity_available <= quantity_received),
  expires_on date,
  note text,
  created_by uuid not null references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists social_stock_batches_fefo_idx
  on public.social_stock_batches (product_id, expires_on asc nulls last, created_at asc)
  where quantity_available > 0;

create table if not exists public.social_basket_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists social_basket_templates_one_default
  on public.social_basket_templates (is_default)
  where is_default = true and is_active = true;

create table if not exists public.social_basket_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.social_basket_templates(id) on delete cascade,
  product_id uuid not null references public.social_products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (template_id, product_id)
);

create table if not exists public.social_basket_assemblies (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.social_basket_templates(id) on delete restrict,
  quantity_prepared integer not null check (quantity_prepared > 0),
  quantity_available integer not null check (quantity_available >= 0 and quantity_available <= quantity_prepared),
  created_by uuid not null references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists social_basket_assemblies_available_idx
  on public.social_basket_assemblies (created_at asc)
  where quantity_available > 0;

create table if not exists public.social_families (
  id uuid primary key default gen_random_uuid(),
  responsible_name text not null check (length(btrim(responsible_name)) between 2 and 160),
  phone text,
  neighborhood text,
  household_size integer not null default 1 check (household_size between 1 and 50),
  notes text,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists social_families_active_name_idx
  on public.social_families (is_active, responsible_name);

create table if not exists public.social_deliveries (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.social_families(id) on delete restrict,
  quantity_baskets integer not null check (quantity_baskets > 0),
  note text,
  delivered_on date not null default current_date,
  created_by uuid not null references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists social_deliveries_family_date_idx
  on public.social_deliveries (family_id, delivered_on desc);

create table if not exists public.social_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.social_products(id) on delete restrict,
  movement_type text not null
    check (movement_type in ('donation', 'basket_prepare', 'adjustment', 'expired')),
  quantity_delta integer not null check (quantity_delta <> 0),
  reference_type text,
  reference_id uuid,
  note text,
  created_by uuid not null references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists social_inventory_movements_product_idx
  on public.social_inventory_movements (product_id, created_at desc);

-- 3. RLS: o Social é invisível para quem não possui acesso.
alter table public.social_products enable row level security;
alter table public.social_donations enable row level security;
alter table public.social_donation_items enable row level security;
alter table public.social_stock_batches enable row level security;
alter table public.social_basket_templates enable row level security;
alter table public.social_basket_template_items enable row level security;
alter table public.social_basket_assemblies enable row level security;
alter table public.social_families enable row level security;
alter table public.social_deliveries enable row level security;
alter table public.social_inventory_movements enable row level security;

drop policy if exists "social read products" on public.social_products;
create policy "social read products" on public.social_products
for select to authenticated using (public.can_manage_social());

drop policy if exists "social create products" on public.social_products;
create policy "social create products" on public.social_products
for insert to authenticated with check (public.can_manage_social());

drop policy if exists "social update products" on public.social_products;
create policy "social update products" on public.social_products
for update to authenticated using (public.can_manage_social()) with check (public.can_manage_social());

drop policy if exists "social read donations" on public.social_donations;
create policy "social read donations" on public.social_donations
for select to authenticated using (public.can_manage_social());

drop policy if exists "social read donation items" on public.social_donation_items;
create policy "social read donation items" on public.social_donation_items
for select to authenticated using (public.can_manage_social());

drop policy if exists "social read stock batches" on public.social_stock_batches;
create policy "social read stock batches" on public.social_stock_batches
for select to authenticated using (public.can_manage_social());

drop policy if exists "social read basket templates" on public.social_basket_templates;
create policy "social read basket templates" on public.social_basket_templates
for select to authenticated using (public.can_manage_social());

drop policy if exists "social update basket templates" on public.social_basket_templates;
create policy "social update basket templates" on public.social_basket_templates
for update to authenticated using (public.can_manage_social()) with check (public.can_manage_social());

drop policy if exists "social read basket template items" on public.social_basket_template_items;
create policy "social read basket template items" on public.social_basket_template_items
for select to authenticated using (public.can_manage_social());

drop policy if exists "social read basket assemblies" on public.social_basket_assemblies;
create policy "social read basket assemblies" on public.social_basket_assemblies
for select to authenticated using (public.can_manage_social());

drop policy if exists "social read families" on public.social_families;
create policy "social read families" on public.social_families
for select to authenticated using (public.can_manage_social());

drop policy if exists "social create families" on public.social_families;
create policy "social create families" on public.social_families
for insert to authenticated with check (public.can_manage_social());

drop policy if exists "social update families" on public.social_families;
create policy "social update families" on public.social_families
for update to authenticated using (public.can_manage_social()) with check (public.can_manage_social());

drop policy if exists "social read deliveries" on public.social_deliveries;
create policy "social read deliveries" on public.social_deliveries
for select to authenticated using (public.can_manage_social());

drop policy if exists "social read movements" on public.social_inventory_movements;
create policy "social read movements" on public.social_inventory_movements
for select to authenticated using (public.can_manage_social());

-- 4. Funções transacionais. Movimentações históricas nunca são apagadas.
create or replace function public.social_take_stock(
  p_product_id uuid,
  p_quantity integer,
  p_movement_type text,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer := p_quantity;
  v_take integer;
  v_batch record;
begin
  if not public.can_manage_social() then
    raise exception 'Acesso não autorizado ao CEAMI Social.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade inválida.';
  end if;

  if p_movement_type not in ('basket_prepare', 'adjustment', 'expired') then
    raise exception 'Tipo de movimentação inválido.';
  end if;

  for v_batch in
    select id, quantity_available
    from public.social_stock_batches
    where product_id = p_product_id
      and quantity_available > 0
    order by expires_on asc nulls last, created_at asc
    for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining, v_batch.quantity_available);

    update public.social_stock_batches
    set quantity_available = quantity_available - v_take
    where id = v_batch.id;

    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    raise exception 'Estoque insuficiente para concluir a operação.';
  end if;

  insert into public.social_inventory_movements (
    product_id, movement_type, quantity_delta,
    reference_type, reference_id, note, created_by
  )
  values (
    p_product_id, p_movement_type, -p_quantity,
    p_reference_type, p_reference_id, p_note, auth.uid()
  );
end;
$$;

revoke all on function public.social_take_stock(uuid, integer, text, text, uuid, text) from public, anon, authenticated;

create or replace function public.social_set_default_basket_items(
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
begin
  if not public.can_manage_social() then
    raise exception 'Acesso não autorizado ao CEAMI Social.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A cesta precisa ter pelo menos um item.';
  end if;

  select id into v_template_id
  from public.social_basket_templates
  where is_default = true and is_active = true
  order by created_at
  limit 1
  for update;

  if v_template_id is null then
    raise exception 'Cesta básica padrão não encontrada.';
  end if;

  delete from public.social_basket_template_items
  where template_id = v_template_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item->>'product_id')::uuid;
      v_quantity := (v_item->>'quantity')::integer;
    exception when others then
      raise exception 'Item da cesta inválido.';
    end;

    if v_quantity is null or v_quantity <= 0 or v_quantity > 100 then
      raise exception 'Quantidade inválida na composição da cesta.';
    end if;

    if not exists (
      select 1 from public.social_products
      where id = v_product_id and is_active = true
    ) then
      raise exception 'Produto inválido ou inativo na cesta.';
    end if;

    insert into public.social_basket_template_items (template_id, product_id, quantity)
    values (v_template_id, v_product_id, v_quantity);
  end loop;
end;
$$;

revoke all on function public.social_set_default_basket_items(jsonb) from public, anon;
grant execute on function public.social_set_default_basket_items(jsonb) to authenticated;

create or replace function public.social_register_donation(
  p_items jsonb,
  p_donor_name text default null,
  p_note text default null,
  p_received_on date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_donation_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_expires_on date;
begin
  if not public.can_manage_social() then
    raise exception 'Acesso não autorizado ao CEAMI Social.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe pelo menos um item.';
  end if;

  insert into public.social_donations (donor_name, note, received_on, created_by)
  values (nullif(btrim(p_donor_name), ''), nullif(btrim(p_note), ''), coalesce(p_received_on, current_date), auth.uid())
  returning id into v_donation_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item->>'product_id')::uuid;
      v_quantity := (v_item->>'quantity')::integer;
      v_expires_on := nullif(v_item->>'expires_on', '')::date;
    exception when others then
      raise exception 'Item de doação inválido.';
    end;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantidade inválida na doação.';
    end if;

    if v_expires_on is not null and v_expires_on < current_date then
      raise exception 'A validade informada já passou. Não adicione o item ao estoque.';
    end if;

    if not exists (
      select 1 from public.social_products
      where id = v_product_id and is_active = true
    ) then
      raise exception 'Produto inválido ou inativo.';
    end if;

    insert into public.social_donation_items (donation_id, product_id, quantity, expires_on)
    values (v_donation_id, v_product_id, v_quantity, v_expires_on);

    insert into public.social_stock_batches (
      product_id, donation_id, quantity_received, quantity_available,
      expires_on, note, created_by
    )
    values (
      v_product_id, v_donation_id, v_quantity, v_quantity,
      v_expires_on, nullif(btrim(p_note), ''), auth.uid()
    );

    insert into public.social_inventory_movements (
      product_id, movement_type, quantity_delta,
      reference_type, reference_id, note, created_by
    )
    values (
      v_product_id, 'donation', v_quantity,
      'donation', v_donation_id, nullif(btrim(p_note), ''), auth.uid()
    );
  end loop;

  return v_donation_id;
end;
$$;

revoke all on function public.social_register_donation(jsonb, text, text, date) from public, anon;
grant execute on function public.social_register_donation(jsonb, text, text, date) to authenticated;

create or replace function public.social_prepare_baskets(
  p_quantity integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template_id uuid;
  v_assembly_id uuid;
  v_item record;
  v_available integer;
  v_needed integer;
begin
  if not public.can_manage_social() then
    raise exception 'Acesso não autorizado ao CEAMI Social.';
  end if;

  if p_quantity is null or p_quantity <= 0 or p_quantity > 500 then
    raise exception 'Quantidade de cestas inválida.';
  end if;

  select id into v_template_id
  from public.social_basket_templates
  where is_default = true and is_active = true
  order by created_at
  limit 1;

  if v_template_id is null then
    raise exception 'Configure a cesta básica padrão antes de montar cestas.';
  end if;

  if not exists (
    select 1 from public.social_basket_template_items
    where template_id = v_template_id
  ) then
    raise exception 'A cesta padrão não possui itens.';
  end if;

  for v_item in
    select product_id, quantity
    from public.social_basket_template_items
    where template_id = v_template_id
    order by created_at
  loop
    select coalesce(sum(quantity_available), 0)::integer
      into v_available
    from public.social_stock_batches
    where product_id = v_item.product_id;

    v_needed := v_item.quantity * p_quantity;
    if v_available < v_needed then
      raise exception 'Estoque insuficiente para montar % cesta(s).', p_quantity;
    end if;
  end loop;

  insert into public.social_basket_assemblies (
    template_id, quantity_prepared, quantity_available, created_by
  )
  values (v_template_id, p_quantity, p_quantity, auth.uid())
  returning id into v_assembly_id;

  for v_item in
    select product_id, quantity
    from public.social_basket_template_items
    where template_id = v_template_id
    order by created_at
  loop
    perform public.social_take_stock(
      v_item.product_id,
      v_item.quantity * p_quantity,
      'basket_prepare',
      'basket_assembly',
      v_assembly_id,
      format('Montagem de %s cesta(s)', p_quantity)
    );
  end loop;

  return v_assembly_id;
end;
$$;

revoke all on function public.social_prepare_baskets(integer) from public, anon;
grant execute on function public.social_prepare_baskets(integer) to authenticated;

create or replace function public.social_deliver_baskets(
  p_family_id uuid,
  p_quantity integer,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer := p_quantity;
  v_take integer;
  v_assembly record;
  v_delivery_id uuid;
begin
  if not public.can_manage_social() then
    raise exception 'Acesso não autorizado ao CEAMI Social.';
  end if;

  if p_quantity is null or p_quantity <= 0 or p_quantity > 100 then
    raise exception 'Quantidade de cestas inválida.';
  end if;

  if not exists (
    select 1 from public.social_families
    where id = p_family_id and is_active = true
  ) then
    raise exception 'Família não encontrada ou arquivada.';
  end if;

  for v_assembly in
    select id, quantity_available
    from public.social_basket_assemblies
    where quantity_available > 0
    order by created_at asc
    for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining, v_assembly.quantity_available);

    update public.social_basket_assemblies
    set quantity_available = quantity_available - v_take
    where id = v_assembly.id;

    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    raise exception 'Não há cestas prontas suficientes para esta entrega.';
  end if;

  insert into public.social_deliveries (
    family_id, quantity_baskets, note, delivered_on, created_by
  )
  values (
    p_family_id, p_quantity, nullif(btrim(p_note), ''), current_date, auth.uid()
  )
  returning id into v_delivery_id;

  return v_delivery_id;
end;
$$;

revoke all on function public.social_deliver_baskets(uuid, integer, text) from public, anon;
grant execute on function public.social_deliver_baskets(uuid, integer, text) to authenticated;

create or replace function public.social_adjust_stock(
  p_product_id uuid,
  p_quantity_delta integer,
  p_note text,
  p_expires_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movement_id uuid;
begin
  if not public.can_manage_social() then
    raise exception 'Acesso não autorizado ao CEAMI Social.';
  end if;

  if p_quantity_delta is null or p_quantity_delta = 0 or abs(p_quantity_delta) > 10000 then
    raise exception 'Quantidade de ajuste inválida.';
  end if;

  if nullif(btrim(p_note), '') is null then
    raise exception 'Informe o motivo do ajuste.';
  end if;

  if not exists (
    select 1 from public.social_products
    where id = p_product_id and is_active = true
  ) then
    raise exception 'Produto inválido ou inativo.';
  end if;

  if p_quantity_delta > 0 then
    insert into public.social_stock_batches (
      product_id, quantity_received, quantity_available,
      expires_on, note, created_by
    )
    values (
      p_product_id, p_quantity_delta, p_quantity_delta,
      p_expires_on, btrim(p_note), auth.uid()
    );

    insert into public.social_inventory_movements (
      product_id, movement_type, quantity_delta, note, created_by
    )
    values (
      p_product_id, 'adjustment', p_quantity_delta, btrim(p_note), auth.uid()
    )
    returning id into v_movement_id;
  else
    perform public.social_take_stock(
      p_product_id,
      abs(p_quantity_delta),
      'adjustment',
      'manual_adjustment',
      null,
      btrim(p_note)
    );

    select id into v_movement_id
    from public.social_inventory_movements
    where created_by = auth.uid()
      and product_id = p_product_id
      and movement_type = 'adjustment'
    order by created_at desc
    limit 1;
  end if;

  return v_movement_id;
end;
$$;

revoke all on function public.social_adjust_stock(uuid, integer, text, date) from public, anon;
grant execute on function public.social_adjust_stock(uuid, integer, text, date) to authenticated;

-- 5. Dados iniciais para facilitar o primeiro uso.
insert into public.social_products (name, package_label, unit_label, category, min_stock, tracks_expiry, created_by)
select seed.name, seed.package_label, seed.unit_label, seed.category, seed.min_stock, true, null
from (
  values
    ('Arroz', '5 kg', 'pacotes', 'alimentos', 10),
    ('Feijão', '1 kg', 'pacotes', 'alimentos', 15),
    ('Óleo', '900 ml', 'unidades', 'alimentos', 10),
    ('Macarrão', '500 g', 'pacotes', 'alimentos', 12),
    ('Açúcar', '1 kg', 'pacotes', 'alimentos', 8),
    ('Café', '500 g', 'pacotes', 'alimentos', 8),
    ('Leite', '1 L', 'caixas', 'alimentos', 10)
) as seed(name, package_label, unit_label, category, min_stock)
where not exists (
  select 1
  from public.social_products p
  where lower(p.name) = lower(seed.name)
    and lower(p.package_label) = lower(seed.package_label)
);

insert into public.social_basket_templates (name, is_default, is_active, created_by)
select 'Cesta básica padrão', true, true, null
where not exists (
  select 1 from public.social_basket_templates
  where is_default = true and is_active = true
);

insert into public.social_basket_template_items (template_id, product_id, quantity)
select t.id, p.id, seed.quantity
from public.social_basket_templates t
join (
  values
    ('Arroz', '5 kg', 1),
    ('Feijão', '1 kg', 2),
    ('Óleo', '900 ml', 1),
    ('Macarrão', '500 g', 2),
    ('Açúcar', '1 kg', 1)
) as seed(name, package_label, quantity) on true
join public.social_products p
  on lower(p.name) = lower(seed.name)
 and lower(p.package_label) = lower(seed.package_label)
where t.is_default = true
  and t.is_active = true
  and not exists (
    select 1
    from public.social_basket_template_items i
    where i.template_id = t.id
      and i.product_id = p.id
  );

-- 6. Auditoria estrutural em cadastros editáveis.
drop trigger if exists social_products_audit_trigger on public.social_products;
create trigger social_products_audit_trigger
after insert or update on public.social_products
for each row execute function public.write_ceami_audit_log();

drop trigger if exists social_families_audit_trigger on public.social_families;
create trigger social_families_audit_trigger
after insert or update on public.social_families
for each row execute function public.write_ceami_audit_log();

notify pgrst, 'reload schema';
