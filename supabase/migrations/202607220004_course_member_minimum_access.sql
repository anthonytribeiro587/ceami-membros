-- Contas exclusivas de Cursos recebem apenas nome e telefone dos membros.

create or replace function public.get_course_member_options()
returns table (
  id uuid,
  full_name text,
  phone text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_manage_courses() then
    raise exception 'Acesso não autorizado ao módulo de Cursos.';
  end if;

  return query
  select m.id, m.full_name, m.phone
  from public.members m
  where m.status::text <> 'inativo'
  order by m.full_name;
end;
$$;

revoke all on function public.get_course_member_options() from public, anon;
grant execute on function public.get_course_member_options() to authenticated;

-- O painel geral continua consultando a tabela conforme o perfil, mas contas
-- course_only não conseguem abrir a ficha completa nem consultar colunas sensíveis.
drop policy if exists "active users can read members" on public.members;
drop policy if exists "active general users can read members" on public.members;
create policy "active general users can read members"
on public.members for select to authenticated
using (
  public.is_active_ceami_user()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.course_only = false
  )
);

notify pgrst, 'reload schema';
