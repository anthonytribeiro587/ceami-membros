-- CEAMI Social: controle de recorrência de atendimento e entregas avulsas.

alter table public.social_deliveries
  add column if not exists delivery_type text not null default 'basket';

alter table public.social_deliveries
  alter column quantity_baskets drop not null;

alter table public.social_deliveries
  drop constraint if exists social_deliveries_quantity_baskets_check;

alter table public.social_deliveries
  drop constraint if exists social_deliveries_delivery_type_check;

alter table public.social_deliveries
  add constraint social_deliveries_delivery_type_check
  check (delivery_type in ('basket', 'avulsa'));

alter table public.social_deliveries
  drop constraint if exists social_deliveries_quantity_by_type_check;

alter table public.social_deliveries
  add constraint social_deliveries_quantity_by_type_check
  check (
    (delivery_type = 'basket' and quantity_baskets is not null and quantity_baskets > 0)
    or
    (delivery_type = 'avulsa' and quantity_baskets is null)
  );

create table if not exists public.social_delivery_items (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.social_deliveries(id) on delete restrict,
  product_id uuid not null references public.social_products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (delivery_id, product_id)
);

alter table public.social_delivery_items enable row level security;

drop policy if exists "social read delivery items" on public.social_delivery_items;
create policy "social read delivery items" on public.social_delivery_items
for select to authenticated using (public.can_manage_social());

alter table public.social_inventory_movements
  drop constraint if exists social_inventory_movements_movement_type_check;

alter table public.social_inventory_movements
  add constraint social_inventory_movements_movement_type_check
  check (movement_type in ('donation', 'basket_prepare', 'adjustment', 'expired', 'direct_delivery'));

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

  if p_movement_type not in ('basket_prepare', 'adjustment', 'expired', 'direct_delivery') then
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

create or replace function public.social_deliver_baskets_controlled(
  p_family_id uuid,
  p_quantity integer,
  p_note text default null,
  p_confirm_recent boolean default false
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
  v_recent record;
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

  select d.delivered_on, d.delivery_type, d.quantity_baskets
  into v_recent
  from public.social_deliveries d
  where d.family_id = p_family_id
    and d.delivered_on between (current_date - 15) and current_date
  order by d.delivered_on desc, d.created_at desc
  limit 1;

  if found and not coalesce(p_confirm_recent, false) then
    raise exception 'ATENDIMENTO_RECENTE: esta família recebeu atendimento em %. Confirme para registrar outra entrega.', to_char(v_recent.delivered_on, 'DD/MM/YYYY');
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
    family_id, delivery_type, quantity_baskets, note, delivered_on, created_by
  )
  values (
    p_family_id, 'basket', p_quantity, nullif(btrim(p_note), ''), current_date, auth.uid()
  )
  returning id into v_delivery_id;

  return v_delivery_id;
end;
$$;

revoke all on function public.social_deliver_baskets_controlled(uuid, integer, text, boolean) from public, anon;
grant execute on function public.social_deliver_baskets_controlled(uuid, integer, text, boolean) to authenticated;

create or replace function public.social_register_direct_delivery(
  p_family_id uuid,
  p_items jsonb,
  p_note text default null,
  p_confirm_recent boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_recent record;
begin
  if not public.can_manage_social() then
    raise exception 'Acesso não autorizado ao CEAMI Social.';
  end if;

  if not exists (
    select 1 from public.social_families
    where id = p_family_id and is_active = true
  ) then
    raise exception 'Família não encontrada ou arquivada.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe pelo menos um item para a entrega avulsa.';
  end if;

  select d.delivered_on, d.delivery_type, d.quantity_baskets
  into v_recent
  from public.social_deliveries d
  where d.family_id = p_family_id
    and d.delivered_on between (current_date - 15) and current_date
  order by d.delivered_on desc, d.created_at desc
  limit 1;

  if found and not coalesce(p_confirm_recent, false) then
    raise exception 'ATENDIMENTO_RECENTE: esta família recebeu atendimento em %. Confirme para registrar outra entrega.', to_char(v_recent.delivered_on, 'DD/MM/YYYY');
  end if;

  -- Valida tudo antes de criar a entrega.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item->>'product_id')::uuid;
      v_quantity := (v_item->>'quantity')::integer;
    exception when others then
      raise exception 'Item da entrega avulsa inválido.';
    end;

    if v_quantity is null or v_quantity <= 0 or v_quantity > 10000 then
      raise exception 'Quantidade inválida na entrega avulsa.';
    end if;

    if not exists (
      select 1 from public.social_products
      where id = v_product_id and is_active = true
    ) then
      raise exception 'Produto inválido ou inativo na entrega avulsa.';
    end if;

    if coalesce((
      select sum(quantity_available)
      from public.social_stock_batches
      where product_id = v_product_id
    ), 0) < v_quantity then
      raise exception 'Estoque insuficiente para um dos itens da entrega avulsa.';
    end if;
  end loop;

  insert into public.social_deliveries (
    family_id, delivery_type, quantity_baskets, note, delivered_on, created_by
  )
  values (
    p_family_id, 'avulsa', null, nullif(btrim(p_note), ''), current_date, auth.uid()
  )
  returning id into v_delivery_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    insert into public.social_delivery_items (delivery_id, product_id, quantity)
    values (v_delivery_id, v_product_id, v_quantity);

    perform public.social_take_stock(
      v_product_id,
      v_quantity,
      'direct_delivery',
      'delivery',
      v_delivery_id,
      coalesce(nullif(btrim(p_note), ''), 'Entrega avulsa')
    );
  end loop;

  return v_delivery_id;
end;
$$;

revoke all on function public.social_register_direct_delivery(uuid, jsonb, text, boolean) from public, anon;
grant execute on function public.social_register_direct_delivery(uuid, jsonb, text, boolean) to authenticated;

notify pgrst, 'reload schema';
