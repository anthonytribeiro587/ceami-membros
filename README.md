# CEAMI Membros

Aplicação responsiva para cadastro, acompanhamento e celebração dos membros da Comunidade Evangélica Amigo Mais Que Irmão.

## Primeira versão

- Dashboard responsivo para celular e computador
- Lista e busca de membros
- Cadastro rápido em modal
- Indicadores de membros, aniversários e acompanhamentos
- Cartão do aniversariante do dia
- Estrutura inicial do banco Supabase
- Perfis e permissões com Row Level Security
- Tabela preparada para histórico de mensagens automáticas

> A tela atual utiliza dados de demonstração. O schema real já está disponível em `supabase/schema.sql` e será conectado na próxima etapa.

## Tecnologias

- Next.js 15
- React 19
- TypeScript
- Supabase
- Lucide Icons
- Vercel

## Executar localmente

```bash
npm install
npm run dev
```

## Configurar o Supabase

1. Crie um projeto no Supabase.
2. Abra o SQL Editor.
3. Execute o conteúdo de `supabase/schema.sql`.
4. Copie `.env.example` para `.env.local`.
5. Preencha a URL e a chave pública do projeto.

## Próximas entregas

1. Autenticação e controle por perfil
2. CRUD real conectado ao Supabase
3. Página completa de detalhes do membro
4. Importação de membros por planilha
5. Upload de foto
6. Tela de aniversariantes por dia, semana e mês
7. Configuração do texto de parabéns
8. Envio automático pela Evolution API
9. Histórico de mensagens e falhas
10. Exportação de relatórios

## Segurança

Não publique `SUPABASE_SERVICE_ROLE_KEY`, chaves da Evolution API ou outros segredos em variáveis com prefixo `NEXT_PUBLIC_`.
