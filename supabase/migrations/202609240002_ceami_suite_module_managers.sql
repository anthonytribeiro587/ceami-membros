-- CEAMI Suite: permissões de gestores de Eventos/Serviços e sincronização legada.
-- Data: 2026-09-24

create or replace function private.can_manage_form(p_form_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.forms f
    where f.id = p_form_id
      and (
        (f.slug = 'solicitar-servico' and private.has_ceami_module_access('services', true))
        or
        (f.slug <> 'solicitar-servico' and private.has_ceami_module_access('events', true))
      )
  );
$$;

create or replace function private.can_manage_form_slug(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_slug = 'solicitar-servico'
      then private.has_ceami_module_access('services', true)
    else private.has_ceami_module_access('events', true)
  end;
$$;

revoke all on function private.can_manage_form(uuid) from public, anon;
revoke all on function private.can_manage_form_slug(text) from public, anon;
grant execute on function private.can_manage_form(uuid) to authenticated;
grant execute on function private.can_manage_form_slug(text) to authenticated;

-- Forms: o formulário de Serviços pertence ao módulo Serviços; os demais ao Eventos.
drop policy if exists "forms_admin_insert" on public.forms;
drop policy if exists "forms_admin_update" on public.forms;
drop policy if exists "forms_admin_delete" on public.forms;
drop policy if exists "forms_public_select" on public.forms;
drop policy if exists "forms_manager_select" on public.forms;

create policy "forms_public_select"
on public.forms
for select
to anon, authenticated
using (active = true);

create policy "forms_manager_select"
on public.forms
for select
to authenticated
using (private.can_manage_form_slug(slug));

create policy "forms_manager_insert"
on public.forms
for insert
to authenticated
with check (private.can_manage_form_slug(slug));

create policy "forms_manager_update"
on public.forms
for update
to authenticated
using (private.can_manage_form_slug(slug))
with check (private.can_manage_form_slug(slug));

create policy "forms_manager_delete"
on public.forms
for delete
to authenticated
using (private.can_manage_form_slug(slug));

-- Campos dos formulários.
drop policy if exists "form_fields_admin_insert" on public.form_fields;
drop policy if exists "form_fields_admin_update" on public.form_fields;
drop policy if exists "form_fields_admin_delete" on public.form_fields;
drop policy if exists "form_fields_public_select" on public.form_fields;
drop policy if exists "form_fields_manager_select" on public.form_fields;

create policy "form_fields_public_select"
on public.form_fields
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.forms f
    where f.id = form_fields.form_id
      and f.active = true
  )
);

create policy "form_fields_manager_select"
on public.form_fields
for select
to authenticated
using (private.can_manage_form(form_id));

create policy "form_fields_manager_insert"
on public.form_fields
for insert
to authenticated
with check (private.can_manage_form(form_id));

create policy "form_fields_manager_update"
on public.form_fields
for update
to authenticated
using (private.can_manage_form(form_id))
with check (private.can_manage_form(form_id));

create policy "form_fields_manager_delete"
on public.form_fields
for delete
to authenticated
using (private.can_manage_form(form_id));

-- Inscrições/solicitações: acesso administrativo segue o módulo dono do form.
drop policy if exists "form_submissions_admin_select" on public.form_submissions;
drop policy if exists "form_submissions_admin_update" on public.form_submissions;
drop policy if exists "form_submissions_admin_delete" on public.form_submissions;

create policy "form_submissions_manager_select"
on public.form_submissions
for select
to authenticated
using (private.can_manage_form(form_id));

create policy "form_submissions_manager_update"
on public.form_submissions
for update
to authenticated
using (private.can_manage_form(form_id))
with check (private.can_manage_form(form_id));

create policy "form_submissions_manager_delete"
on public.form_submissions
for delete
to authenticated
using (private.can_manage_form(form_id));

-- Perfis aprovados para o painel geral passam a ter Membros explicitamente.
create or replace function public.set_profile_access(
  p_profile_id uuid,
  p_is_active boolean,
  p_role public.user_role default 'visualizador'::public.user_role,
  p_course_only boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_database_admin boolean := session_user in ('postgres', 'supabase_admin');
  v_role public.user_role := coalesce(p_role, 'visualizador'::public.user_role);
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
        else v_role
      end,
      course_only = coalesce(p_course_only, false),
      social_only = false,
      updated_at = now()
  where id = p_profile_id;

  if not found then
    raise exception 'Perfil não encontrado.';
  end if;

  if coalesce(p_is_active, false) = false or coalesce(p_course_only, false) = true then
    update public.profile_module_access
    set can_access = false, updated_at = now()
    where profile_id = p_profile_id;
  else
    insert into public.profile_module_access (
      profile_id, module_key, access_level, can_access, updated_at
    )
    values (
      p_profile_id,
      'members',
      case when v_role::text in ('admin', 'secretaria', 'pastor') then 'manager' else 'viewer' end,
      true,
      now()
    )
    on conflict (profile_id, module_key)
    do update set
      access_level = excluded.access_level,
      can_access = true,
      updated_at = now();
  end if;
end;
$$;

-- Compatibilidade: a função antiga do Social passa também a alimentar a nova matriz.
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

  insert into public.profile_module_access (
    profile_id, module_key, access_level, can_access, updated_at
  )
  values (
    p_profile_id, 'social', 'manager', coalesce(p_enabled, false), now()
  )
  on conflict (profile_id, module_key)
  do update set
    access_level = 'manager',
    can_access = excluded.can_access,
    updated_at = now();
end;
$$;

create or replace function public.social_actor_profiles()
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name
  from public.profiles p
  where public.can_manage_social()
    and p.is_active = true
    and (
      p.role::text = 'admin'
      or exists (
        select 1
        from public.profile_module_access a
        where a.profile_id = p.id
          and a.module_key = 'social'
          and a.can_access = true
          and a.access_level = 'manager'
      )
    )
  order by p.full_name;
$$;
