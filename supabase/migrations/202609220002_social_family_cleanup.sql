-- CEAMI Social UX round 2
-- Validação de telefone e exclusão segura de famílias sem histórico.

update public.social_families
set phone = nullif(regexp_replace(phone, '\D', '', 'g'), '')
where phone is not null;

update public.social_families
set phone = null
where phone is not null
  and char_length(phone) not in (10, 11);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'social_families_phone_check'
      and conrelid = 'public.social_families'::regclass
  ) then
    alter table public.social_families
      add constraint social_families_phone_check
      check (phone is null or phone ~ '^[0-9]{10,11}$');
  end if;
end
$$;

create or replace function public.social_delete_family(
  p_family_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_social() then
    raise exception 'Acesso não autorizado ao CEAMI Social.';
  end if;

  if exists (
    select 1
    from public.social_deliveries
    where family_id = p_family_id
  ) then
    raise exception 'Esta família já possui entregas registradas. Para preservar o histórico, ela não pode ser excluída.';
  end if;

  delete from public.social_families
  where id = p_family_id;

  if not found then
    raise exception 'Família não encontrada.';
  end if;

  return true;
end;
$$;

revoke all on function public.social_delete_family(uuid) from public, anon;
grant execute on function public.social_delete_family(uuid) to authenticated;

notify pgrst, 'reload schema';
