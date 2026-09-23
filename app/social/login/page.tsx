'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { HeartHandshake, LockKeyhole, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import './social-login.css';

export default function SocialLoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('acesso') === 'negado') {
      void supabase.auth.signOut();
      setError('Este acesso não está liberado para o CEAMI Social.');
    } else if (params.get('acesso') === 'aguardando-aprovacao') {
      void supabase.auth.signOut();
      setError('Esta conta ainda não foi aprovada pela administração da CEAMI.');
    }
  }, [supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError || !data.user) {
      setError('E-mail ou senha incorretos.');
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, social_only, is_active')
      .eq('id', data.user.id)
      .maybeSingle();

    const allowed = profile?.is_active === true && (profile.role === 'admin' || profile.social_only === true);
    if (profileError || !allowed) {
      await supabase.auth.signOut();
      setError(profile?.social_only === true && profile?.is_active === false
        ? 'Seu cadastro está aguardando aprovação da administração.'
        : 'Este usuário não possui acesso ao CEAMI Social.');
      setLoading(false);
      return;
    }

    router.replace('/social');
    router.refresh();
  }

  return (
    <main className="social-login-page">
      <section className="social-login-card">
        <div className="social-login-brand">
          <img src="/brand/ceami-icon.svg?v=official-2" alt="CEAMI" />
          <div><strong>CEAMI</strong><span>Social</span></div>
        </div>

        <div className="social-login-copy">
          <div className="social-login-icon"><HeartHandshake /></div>
          <span>ACESSO DA EQUIPE SOCIAL</span>
          <h1>Bem-vindo ao CEAMI Social</h1>
          <p>Entre para registrar doações, acompanhar o estoque e organizar as cestas.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <label>
            <span>E-mail</span>
            <div><Mail size={19} /><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          </label>
          <label>
            <span>Senha</span>
            <div><LockKeyhole size={19} /><input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></div>
          </label>
          {error && <p className="social-login-error">{error}</p>}
          <button type="submit" disabled={loading}>{loading ? 'Entrando...' : 'Entrar no CEAMI Social'}</button>
        </form>

        <small>Acesso exclusivo para pessoas autorizadas pela administração.</small>
        <Link className="social-login-back social-login-register-link" href="/social/cadastro">Criar acesso para a equipe Social</Link>
        <Link className="social-login-back" href="/login">Voltar ao acesso do CEAMI Membros</Link>
      </section>
    </main>
  );
}
