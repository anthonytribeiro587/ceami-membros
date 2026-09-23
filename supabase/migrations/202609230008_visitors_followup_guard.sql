-- CEAMI Visitantes: reforço de consentimento no acompanhamento.

create or replace function public.visitor_register_followup(
  p_visitor_id uuid,
  p_outcome text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_consent boolean;
begin
  if not public.can_manage_visitors() then
    raise exception 'Acesso restrito ao CEAMI Visitantes.';
  end if;

  if p_outcome not in ('contatado','sem_resposta','observacao') then
    raise exception 'Resultado inválido.';
  end if;

  select contact_consent
  into v_consent
  from public.visitors
  where id = p_visitor_id and status = 'ativo';

  if not found then
    raise exception 'Visitante não encontrado.';
  end if;

  if p_outcome in ('contatado','sem_resposta') and not coalesce(v_consent,false) then
    raise exception 'Este visitante não autorizou contato.';
  end if;

  insert into public.visitor_followups (
    visitor_id, outcome, note, created_by
  )
  values (
    p_visitor_id, p_outcome,
    nullif(btrim(coalesce(p_note,'')), ''),
    auth.uid()
  )
  returning id into v_id;

  if p_outcome in ('contatado','sem_resposta') then
    update public.visitors
    set followup_status = p_outcome, updated_at = now()
    where id = p_visitor_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.visitor_register_followup(uuid,text,text) from public, anon;
grant execute on function public.visitor_register_followup(uuid,text,text) to authenticated;

notify pgrst, 'reload schema';
