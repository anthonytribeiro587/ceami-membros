'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LockKeyhole, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import './login.css';

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '';
  return value;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const supabase = createClient();

    if (params.get('acesso') === 'aguardando-aprovacao') {
      void supabase.auth.signOut();
      setError('Esta conta ainda não foi aprovada pela administração da CEAMI.');
      return;
    }

    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active || !data.user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_active')
        .eq('id', data.user.id)
        .maybeSingle();

      if (!active || !profile?.is_active) return;

      const nextPath = safeNextPath(params.get('next'));
      router.replace(nextPath || '/');
      router.refresh();
    })();

    return () => {
      active = false;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError || !data.user) {
      setError('E-mail ou senha incorretos.');
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_active')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError || !profile?.is_active) {
      await supabase.auth.signOut();
      setError('Esta conta ainda não foi aprovada pela administração da CEAMI.');
      setLoading(false);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const nextPath = safeNextPath(params.get('next'));

    router.replace(nextPath || '/');

    router.refresh();
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <div>CE</div>
          <span>
            <strong>CEAMI</strong>
            <small>Central de aplicativos</small>
          </span>
        </div>

        <div className="login-copy">
          <span>ACESSO ÚNICO</span>
          <h1>Entre na plataforma CEAMI</h1>
          <p>Use uma única conta para acessar todos os módulos liberados para você.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <label>
            <span>E-mail</span>
            <div>
              <Mail size={18} />
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
            </div>
          </label>
          <label>
            <span>Senha</span>
            <div>
              <LockKeyhole size={18} />
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
            </div>
          </label>
          {error && <p className="login-error">{error}</p>}
          <button disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
        </form>

        <small className="login-note">
          Depois do login, a CEAMI mostra somente os aplicativos permitidos para sua conta.
        </small>
      </section>
    </main>
  );
}
