# CEAMI Membros — Checklist de Produção Real

Este checklist deve ser concluído antes do merge da branch `security/producao-real-v1`.

## 1. Banco de dados

Execute no Supabase, nesta ordem:

1. `supabase/migrations/202607220001_production_hardening.sql`
2. `supabase/migrations/202607220002_access_admin_and_maintenance.sql`
3. `supabase/migrations/202607220003_view_hardening.sql`
4. `supabase/migrations/202607220004_course_member_minimum_access.sql`

Confirme:

```sql
select
  to_regclass('public.api_security_secrets') as secrets,
  to_regclass('public.api_rate_limits') as rate_limits,
  to_regclass('public.audit_log') as audit_log,
  to_regprocedure('public.consume_api_rate_limit(text,integer,integer)') as limiter,
  to_regprocedure('public.set_profile_access(uuid,boolean,public.user_role,boolean)') as access_admin,
  to_regprocedure('public.get_course_member_options()') as course_member_options;
```

Todos os campos precisam retornar um objeto, e não `null`.

Confira também se a view pública respeita as políticas das tabelas-base:

```sql
select reloptions
from pg_class
where oid = 'public.birthdays_this_month'::regclass;
```

O resultado deve incluir `security_invoker=true`.

## 2. Supabase Auth

- Desative cadastro público aberto por e-mail, salvo quando houver fluxo formal de convite.
- Exija senha forte.
- Mantenha confirmação de e-mail para novas contas.
- Ative MFA para a conta administrativa principal quando disponível no plano/configuração adotados.
- Revise `Authentication > Users` e remova contas de teste que não serão utilizadas.
- Toda nova conta nasce com `is_active = false` e precisa ser aprovada.

### Aprovar acesso geral

```sql
select public.set_profile_access(
  'UUID_DO_PERFIL',
  true,
  'visualizador'::public.user_role,
  false
);
```

Troque o papel por `secretaria`, `pastor` ou `admin` somente quando necessário.

### Aprovar conta exclusiva de Cursos

```sql
select public.set_profile_access(
  'UUID_DO_PERFIL',
  true,
  'lider'::public.user_role,
  true
);
```

## 3. Variáveis da Vercel

Em **Production**, confira:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `API_RATE_LIMIT_SALT`
- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_INSTANCE=Ceami Igreja`
- `EVOLUTION_GROUP_ID=120363148206200208@g.us`

Regras:

- `SUPABASE_SERVICE_ROLE_KEY`, `API_RATE_LIMIT_SALT` e chaves da Evolution nunca podem ter prefixo `NEXT_PUBLIC_`.
- Gere `API_RATE_LIMIT_SALT` com no mínimo 32 caracteres aleatórios.
- Rotacione a service role e a chave Evolution caso já tenham sido copiadas para chats, prints, documentos ou repositórios.
- Restrinja os segredos aos ambientes que realmente precisam deles.

## 4. Automações de WhatsApp

A migration recria o cron com `Authorization: Bearer <segredo interno>`.

Confirme:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname in ('ceami-automations', 'ceami-rate-limit-cleanup');
```

Teste de segurança:

- abrir `/api/automations/automatic` no navegador deve retornar `401`;
- o cron autenticado deve continuar registrando execução;
- abra `/automacoes`, mantenha cada nova automação pausada e faça um único envio de teste;
- ative aniversários e plano de leitura somente depois de confirmar o grupo e os horários.

## 5. Backups e recuperação

- Confirme a política de backup disponível no plano atual do Supabase.
- Exporte uma cópia do banco antes do lançamento e antes de migrations destrutivas.
- Defina quem pode restaurar o banco e onde a cópia será guardada.
- Faça pelo menos um teste de restauração em projeto separado antes de depender do sistema.

## 6. Privacidade e LGPD

- A liderança da CEAMI deve aprovar o texto de `/privacidade`.
- Defina formalmente quem é o responsável pelo tratamento e o canal para solicitações dos titulares.
- Defina prazo de conservação para membros inativos, solicitações de atualização, logs e histórico de presença.
- Não use dados do sistema para finalidades diferentes das informadas sem nova análise.
- Restrinja acesso conforme função e desligue imediatamente contas de pessoas que deixarem a operação.

## 7. Testes obrigatórios

### Login e permissão

- admin acessa painel geral e Cursos;
- conta exclusiva de Cursos entra por `/login-cursos` e não acessa o painel geral;
- conta não aprovada recebe bloqueio;
- usuário sem permissão não acessa rotas administrativas nem por URL direta;
- botão Sair encerra a sessão.

### Membros e Integra

- novo cadastro válido;
- duplicidade por telefone, e-mail e nome+nascimento;
- excesso de tentativas retorna `429`;
- consulta pública só localiza com nome completo e informação compatível;
- solicitação de correção fica pendente para revisão;
- admin edita membro e a ação aparece em `audit_log`.

### Cursos

- criar curso, turma e aula;
- adicionar aluno;
- chamada manual;
- conta exclusiva de Cursos recebe somente nome e telefone na seleção de alunos;
- QR só aceita check-in perto do horário da aula;
- telefone não matriculado é recusado;
- não é possível encerrar aula futura;
- exclusão de turma e curso exige confirmação e gera auditoria.

### Aniversários

- diagnóstico admin;
- simulação;
- prevenção de envio duplicado;
- destino oficial confere instância e grupo;
- falha da Evolution é registrada sem repetir automaticamente no mesmo dia.

### Dispositivos

- Chrome/Edge desktop;
- Android Chrome;
- iPhone Safari;
- largura de 320 px;
- teclado aberto em formulários e modais;
- impressão do QR e lista de presença.

## 8. Operação após lançamento

- Revise semanalmente usuários ativos e logs de auditoria no primeiro mês.
- Monitore erros 4xx/5xx na Vercel e falhas no histórico de aniversários.
- Crie um procedimento de incidente: bloquear contas, rotacionar chaves, preservar logs e comunicar a liderança.
- Não faça mudanças diretamente na `main`: branch, Preview, validação e squash merge.
