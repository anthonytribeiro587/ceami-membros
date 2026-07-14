alter table public.members
  add column if not exists city text,
  add column if not exists zip_code text,
  add column if not exists spouse_name text,
  add column if not exists has_children boolean not null default false,
  add column if not exists children_names text,
  add column if not exists previous_church boolean not null default false,
  add column if not exists previous_church_name text,
  add column if not exists water_baptized boolean not null default false,
  add column if not exists baptism_church text,
  add column if not exists holy_spirit_baptized boolean not null default false,
  add column if not exists fundamentos_fe boolean not null default false,
  add column if not exists fundamentos_fe_date date,
  add column if not exists talents text;

comment on column public.members.fundamentos_fe is 'Indica se concluiu o Curso Fundamentos da Fé';
comment on column public.members.water_baptized is 'Indica batismo nas águas';
comment on column public.members.holy_spirit_baptized is 'Indica batismo no Espírito Santo';
comment on column public.members.children_names is 'Nomes dos filhos, um por linha';
