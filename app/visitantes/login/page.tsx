'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { HeartHandshake, LockKeyhole, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import './visitantes-login.css';

export default function VisitantesLoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState('ceamiacolhimento@ceamirs.com.br');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('acesso') === 'negado') {
      void supabase.auth.signOut();
      setError('Este acesso não está liberado para o CEAMI Visitantes.');
    } else if (params.get('acesso') === 'aguardando-aprovacao') {
      void supabase.auth.signOut();
      setError('Esta conta ainda não foi liberada pela administração da CEAMI.');
    }
  }, [supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError || !data.user) {
      setError('E-mail ou senha incorretos.');
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, visitors_only, is_active')
      .eq('id', data.user.id)
      .maybeSingle();

    const allowed = profile?.is_active === true && (profile.role === 'admin' || profile.visitors_only === true);
    if (profileError || !allowed) {
      await supabase.auth.signOut();
      setError('Este usuário não possui acesso ao CEAMI Visitantes.');
      setLoading(false);
      return;
    }

    router.replace('/visitantes');
    router.refresh();
  }

  return (
    <main className="visitors-login-page">
      <section className="visitors-login-card">
        <div className="visitors-login-brand">
          <img src="/brand/ceami-icon.svg?v=official-2" alt="CEAMI" />
          <div><strong>CEAMI</strong><span>Visitantes</span></div>
        </div>

        <div className="visitors-login-copy">
          <div className="visitors-login-icon"><HeartHandshake /></div>
          <span>ACESSO DO ACOLHIMENTO</span>
          <h1>Bem-vindo ao CEAMI Visitantes</h1>
          <p>Registre visitas, acompanhe retornos e cuide dos contatos do grupo de acolhimento.</p>
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
          {error && <p className="visitors-login-error">{error}</p>}
          <button type="submit" disabled={loading}>{loading ? 'Entrando...' : 'Entrar no CEAMI Visitantes'}</button>
        </form>

        <small>Acesso exclusivo para a equipe autorizada de acolhimento.</small>
        <Link className="visitors-login-back" href="/login">Voltar ao CEAMI Membros</Link>
      </section>
    </main>
  );
}
