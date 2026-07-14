do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'birthday_messages'
      and column_name = 'member_id'
  ) then
    alter table public.birthday_messages
      alter column member_id drop not null;
  end if;
end
$$;

notify pgrst, 'reload schema';
