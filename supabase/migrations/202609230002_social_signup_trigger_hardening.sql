-- O trigger de criação de perfil só deve ser executado pelo próprio trigger do Auth.
revoke all on function public.handle_new_user() from public, anon, authenticated;
