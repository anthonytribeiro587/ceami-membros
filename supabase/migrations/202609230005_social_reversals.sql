-- CEAMI Social: estornos auditáveis e rastreio exato de saídas de estoque.

create table if not exists public.social_reversals (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('donation','assembly','delivery','movement')),
  entity_id uuid not null,
  reason text not null check (nullif(btrim(reason), '') is not null),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id)
);

alter table public.social_reversals enable row level security;

drop policy if exists "social read reversals" on public.social_reversals;
create policy "social read reversals" on public.social_reversals
for select to authenticated using (public.can_manage_social());

grant select on public.social_reversals to authenticated;

create table if not exists public.social_stock_consumptions (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references public.social_inventory_movements(id) on delete restrict,
  batch_id uuid not null references public.social_stock_batches(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (movement_id, batch_id)
);

alter table public.social_stock_consumptions enable row level security;

drop policy if exists "social read stock consumptions" on public.social_stock_consumptions;
create policy "social read stock consumptions" on public.social_stock_consumptions
for select to authenticated using (public.can_manage_social());

grant select on public.social_stock_consumptions to authenticated;

create table if not exists public.social_delivery_basket_sources (
  delivery_id uuid not null references public.social_deliveries(id) on delete restrict,
  assembly_id uuid not null references public.social_basket_assemblies(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  primary key (delivery_id, assembly_id)
);

alter table public.social_delivery_basket_sources enable row level security;

drop policy if exists "social read basket delivery sources" on public.social_delivery_basket_sources;
create policy "social read basket delivery sources" on public.social_delivery_basket_sources
for select to authenticated using (public.can_manage_social());

grant select on public.social_delivery_basket_sources to authenticated;

alter table public.social_stock_batches
  add column if not exists source_movement_id uuid references public.social_inventory_movements(id) on delete restrict;

create index if not exists social_stock_batches_source_movement_idx
  on public.social_stock_batches(source_movement_id)
  where source_movement_id is not null;

alter table public.social_inventory_movements
  drop constraint if exists social_inventory_movements_movement_type_check;

alter table public.social_inventory_movements
  add constraint social_inventory_movements_movement_type_check
  check (movement_type in ('donation', 'basket_prepare', 'adjustment', 'expired', 'direct_delivery', 'reversal'));

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
  v_movement_id uuid;
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

  insert into public.social_inventory_movements (
    product_id, movement_type, quantity_delta,
    reference_type, reference_id, note, created_by
  )
  values (
    p_product_id, p_movement_type, -p_quantity,
    p_reference_type, p_reference_id, p_note, auth.uid()
  )
  returning id into v_movement_id;

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

    insert into public.social_stock_consumptions (movement_id, batch_id, quantity)
    values (v_movement_id, v_batch.id, v_take);

    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    raise exception 'Estoque insuficiente para concluir a operação.';
  end if;
end;
$$;

revoke all on function public.social_take_stock(uuid, integer, text, text, uuid, text) from public, anon, authenticated;

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
    insert into public.social_inventory_movements (
      product_id, movement_type, quantity_delta,
      reference_type, note, created_by
    )
    values (
      p_product_id, 'adjustment', p_quantity_delta,
      'manual_adjustment', btrim(p_note), auth.uid()
    )
    returning id into v_movement_id;

    update public.social_inventory_movements
    set reference_id = v_movement_id
    where id = v_movement_id;

    insert into public.social_stock_batches (
      product_id, quantity_received, quantity_available,
      expires_on, note, created_by, source_movement_id
    )
    values (
      p_product_id, p_quantity_delta, p_quantity_delta,
      p_expires_on, btrim(p_note), auth.uid(), v_movement_id
    );
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
      and quantity_delta = p_quantity_delta
    order by created_at desc
    limit 1;

    update public.social_inventory_movements
    set reference_id = v_movement_id
    where id = v_movement_id;
  end if;

  return v_movement_id;
end;
$$;

revoke all on function public.social_adjust_stock(uuid, integer, text, date) from public, anon;
grant execute on function public.social_adjust_stock(uuid, integer, text, date) to authenticated;

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
    and not exists (
      select 1 from public.social_reversals r
      where r.entity_type = 'delivery' and r.entity_id = d.id
    )
  order by d.delivered_on desc, d.created_at desc
  limit 1;

  if found and not coalesce(p_confirm_recent, false) then
    raise exception 'ATENDIMENTO_RECENTE: esta família recebeu atendimento em %. Confirme para registrar outra entrega.', to_char(v_recent.delivered_on, 'DD/MM/YYYY');
  end if;

  insert into public.social_deliveries (
    family_id, delivery_type, quantity_baskets, note, delivered_on, created_by
  )
  values (
    p_family_id, 'basket', p_quantity, nullif(btrim(p_note), ''), current_date, auth.uid()
  )
  returning id into v_delivery_id;

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

    insert into public.social_delivery_basket_sources (delivery_id, assembly_id, quantity)
    values (v_delivery_id, v_assembly.id, v_take);

    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    raise exception 'Não há cestas prontas suficientes para esta entrega.';
  end if;

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
    and not exists (
      select 1 from public.social_reversals r
      where r.entity_type = 'delivery' and r.entity_id = d.id
    )
  order by d.delivered_on desc, d.created_at desc
  limit 1;

  if found and not coalesce(p_confirm_recent, false) then
    raise exception 'ATENDIMENTO_RECENTE: esta família recebeu atendimento em %. Confirme para registrar outra entrega.', to_char(v_recent.delivered_on, 'DD/MM/YYYY');
  end if;

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

create or replace function public.social_restore_negative_movement(
  p_movement_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movement public.social_inventory_movements%rowtype;
  v_consumed integer;
  v_row record;
begin
  select * into v_movement
  from public.social_inventory_movements
  where id = p_movement_id
  for update;

  if not found then
    raise exception 'Movimentação não encontrada.';
  end if;

  if v_movement.quantity_delta >= 0 then
    raise exception 'Essa movimentação não representa uma saída de estoque.';
  end if;

  select coalesce(sum(quantity), 0)::integer
  into v_consumed
  from public.social_stock_consumptions
  where movement_id = p_movement_id;

  if v_consumed <> abs(v_movement.quantity_delta) then
    raise exception 'Este registro é anterior ao rastreio de lotes e não pode ser estornado automaticamente com segurança.';
  end if;

  for v_row in
    select c.batch_id, c.quantity
    from public.social_stock_consumptions c
    where c.movement_id = p_movement_id
    order by c.created_at
  loop
    update public.social_stock_batches
    set quantity_available = quantity_available + v_row.quantity
    where id = v_row.batch_id
      and quantity_available + v_row.quantity <= quantity_received;

    if not found then
      raise exception 'Não foi possível restaurar o lote original sem ultrapassar a quantidade recebida.';
    end if;
  end loop;

  insert into public.social_inventory_movements (
    product_id, movement_type, quantity_delta,
    reference_type, reference_id, note, created_by
  )
  values (
    v_movement.product_id, 'reversal', abs(v_movement.quantity_delta),
    'movement_reversal', p_movement_id,
    format('Estorno: %s', btrim(p_reason)), auth.uid()
  );
end;
$$;

revoke all on function public.social_restore_negative_movement(uuid, text) from public, anon, authenticated;

create or replace function public.social_reverse_activity(
  p_entity_type text,
  p_entity_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reversal_id uuid;
  v_delivery public.social_deliveries%rowtype;
  v_assembly public.social_basket_assemblies%rowtype;
  v_movement public.social_inventory_movements%rowtype;
  v_remaining integer;
  v_take integer;
  v_row record;
  v_total integer;
begin
  if not public.can_manage_social() then
    raise exception 'Acesso não autorizado ao CEAMI Social.';
  end if;

  if p_entity_type not in ('donation','assembly','delivery','movement') then
    raise exception 'Tipo de registro inválido para estorno.';
  end if;

  if nullif(btrim(p_reason), '') is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Informe o motivo do estorno.';
  end if;

  if exists (
    select 1 from public.social_reversals
    where entity_type = p_entity_type and entity_id = p_entity_id
  ) then
    raise exception 'Este registro já foi estornado.';
  end if;

  if p_entity_type = 'donation' then
    if not exists (
      select 1 from public.social_donations
      where id = p_entity_id
      for update
    ) then
      raise exception 'Doação não encontrada.';
    end if;

    if exists (
      select 1
      from public.social_stock_batches
      where donation_id = p_entity_id
        and quantity_available <> quantity_received
    ) then
      raise exception 'Esta doação já teve itens consumidos. Estorne primeiro as saídas relacionadas.';
    end if;

    update public.social_stock_batches
    set quantity_available = 0
    where donation_id = p_entity_id;

    for v_row in
      select product_id, sum(quantity)::integer as quantity
      from public.social_donation_items
      where donation_id = p_entity_id
      group by product_id
    loop
      insert into public.social_inventory_movements (
        product_id, movement_type, quantity_delta,
        reference_type, reference_id, note, created_by
      )
      values (
        v_row.product_id, 'reversal', -v_row.quantity,
        'donation_reversal', p_entity_id,
        format('Estorno de doação: %s', btrim(p_reason)), auth.uid()
      );
    end loop;

  elsif p_entity_type = 'assembly' then
    select * into v_assembly
    from public.social_basket_assemblies
    where id = p_entity_id
    for update;

    if not found then
      raise exception 'Montagem de cestas não encontrada.';
    end if;

    if v_assembly.quantity_available <> v_assembly.quantity_prepared then
      raise exception 'Parte dessas cestas já foi entregue. Estorne primeiro as entregas relacionadas.';
    end if;

    if not exists (
      select 1 from public.social_inventory_movements
      where movement_type = 'basket_prepare'
        and reference_type = 'basket_assembly'
        and reference_id = p_entity_id
    ) then
      raise exception 'Não foram encontradas as saídas de estoque dessa montagem.';
    end if;

    for v_row in
      select id
      from public.social_inventory_movements
      where movement_type = 'basket_prepare'
        and reference_type = 'basket_assembly'
        and reference_id = p_entity_id
      order by created_at
    loop
      perform public.social_restore_negative_movement(v_row.id, p_reason);
    end loop;

    update public.social_basket_assemblies
    set quantity_available = 0
    where id = p_entity_id;

  elsif p_entity_type = 'delivery' then
    select * into v_delivery
    from public.social_deliveries
    where id = p_entity_id
    for update;

    if not found then
      raise exception 'Entrega não encontrada.';
    end if;

    if v_delivery.delivery_type = 'basket' then
      if exists (
        select 1 from public.social_delivery_basket_sources
        where delivery_id = p_entity_id
      ) then
        for v_row in
          select assembly_id, quantity
          from public.social_delivery_basket_sources
          where delivery_id = p_entity_id
          order by created_at
        loop
          update public.social_basket_assemblies
          set quantity_available = quantity_available + v_row.quantity
          where id = v_row.assembly_id
            and quantity_available + v_row.quantity <= quantity_prepared;

          if not found then
            raise exception 'Não foi possível devolver a cesta à montagem original.';
          end if;
        end loop;
      else
        -- Compatibilidade com entregas registradas antes do rastreio da origem.
        v_remaining := coalesce(v_delivery.quantity_baskets, 0);

        for v_row in
          select id, quantity_prepared, quantity_available
          from public.social_basket_assemblies
          where quantity_available < quantity_prepared
          order by created_at asc
          for update
        loop
          exit when v_remaining <= 0;
          v_take := least(v_remaining, v_row.quantity_prepared - v_row.quantity_available);

          update public.social_basket_assemblies
          set quantity_available = quantity_available + v_take
          where id = v_row.id;

          v_remaining := v_remaining - v_take;
        end loop;

        if v_remaining > 0 then
          raise exception 'Não foi possível localizar espaço suficiente nas cestas montadas para restaurar esta entrega antiga.';
        end if;
      end if;

    else
      if not exists (
        select 1 from public.social_inventory_movements
        where movement_type = 'direct_delivery'
          and reference_type = 'delivery'
          and reference_id = p_entity_id
      ) then
        raise exception 'Não foram encontradas as saídas de estoque desta entrega avulsa.';
      end if;

      for v_row in
        select id
        from public.social_inventory_movements
        where movement_type = 'direct_delivery'
          and reference_type = 'delivery'
          and reference_id = p_entity_id
        order by created_at
      loop
        perform public.social_restore_negative_movement(v_row.id, p_reason);
      end loop;
    end if;

  elsif p_entity_type = 'movement' then
    select * into v_movement
    from public.social_inventory_movements
    where id = p_entity_id
    for update;

    if not found then
      raise exception 'Movimentação não encontrada.';
    end if;

    if v_movement.movement_type <> 'adjustment' then
      raise exception 'Somente ajustes manuais podem ser estornados por esta opção.';
    end if;

    if v_movement.quantity_delta < 0 then
      perform public.social_restore_negative_movement(v_movement.id, p_reason);
    else
      select coalesce(sum(quantity_received), 0)::integer
      into v_total
      from public.social_stock_batches
      where source_movement_id = v_movement.id;

      if v_total <> v_movement.quantity_delta then
        raise exception 'Este ajuste é anterior ao rastreio de origem e não pode ser estornado automaticamente com segurança.';
      end if;

      if exists (
        select 1 from public.social_stock_batches
        where source_movement_id = v_movement.id
          and quantity_available <> quantity_received
      ) then
        raise exception 'Parte deste ajuste já foi consumida. Estorne primeiro as saídas relacionadas.';
      end if;

      update public.social_stock_batches
      set quantity_available = 0
      where source_movement_id = v_movement.id;

      insert into public.social_inventory_movements (
        product_id, movement_type, quantity_delta,
        reference_type, reference_id, note, created_by
      )
      values (
        v_movement.product_id, 'reversal', -v_movement.quantity_delta,
        'movement_reversal', v_movement.id,
        format('Estorno de ajuste: %s', btrim(p_reason)), auth.uid()
      );
    end if;
  end if;

  insert into public.social_reversals (
    entity_type, entity_id, reason, created_by
  )
  values (
    p_entity_type, p_entity_id, btrim(p_reason), auth.uid()
  )
  returning id into v_reversal_id;

  return v_reversal_id;
end;
$$;

revoke all on function public.social_reverse_activity(text, uuid, text) from public, anon;
grant execute on function public.social_reverse_activity(text, uuid, text) to authenticated;

notify pgrst, 'reload schema';
