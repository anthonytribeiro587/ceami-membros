create table if not exists public.member_update_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  proposed_data jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  source text not null default 'public_lookup',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_notes text
);

create unique index if not exists member_update_requests_one_pending_per_member
  on public.member_update_requests(member_id)
  where status = 'pending';

create index if not exists member_update_requests_status_created_idx
  on public.member_update_requests(status, created_at desc);

alter table public.member_update_requests enable row level security;

-- O público nunca acessa esta tabela diretamente. As solicitações são criadas
-- somente pela rota do servidor usando a service role.
revoke all on public.member_update_requests from anon;
revoke all on public.member_update_requests from authenticated;

grant select, update on public.member_update_requests to authenticated;

create policy "admins can review member update requests"
on public.member_update_requests
for all
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  )
);
