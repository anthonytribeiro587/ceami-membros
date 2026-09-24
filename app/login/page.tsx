'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, LayoutGrid, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
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
      <section className="login-shell">
        <aside className="login-showcase">
          <div className="login-showcase-brand">
            <img src="/brand/ceami-icon.svg?v=official-2" alt="CEAMI" />
            <div><strong>CEAMI</strong><span>Plataforma integrada</span></div>
          </div>

          <div className="login-showcase-copy">
            <span>UM ACESSO. TODA A CEAMI.</span>
            <h1>Entre uma vez.<br />Trabalhe em qualquer módulo.</h1>
            <p>Membros, Social, Eventos, Serviços, Acolhimentos e Cursos compartilham a mesma conta e as permissões do seu perfil.</p>
          </div>

          <div className="login-showcase-points">
            <div><LayoutGrid size={18} /><span><strong>6 aplicativos</strong><small>Uma experiência única</small></span></div>
            <div><ShieldCheck size={18} /><span><strong>Acesso por perfil</strong><small>Você vê somente o que foi liberado</small></span></div>
          </div>
        </aside>

        <section className="login-panel">
          <div className="login-mobile-brand">
            <img src="/brand/ceami-icon.svg?v=official-2" alt="CEAMI" />
            <div><strong>CEAMI</strong><span>Central de aplicativos</span></div>
          </div>

          <div className="login-copy">
            <span>ACESSO À PLATAFORMA</span>
            <h2>Bem-vindo de volta</h2>
            <p>Use sua conta CEAMI para continuar.</p>
          </div>

          <form onSubmit={handleSubmit}>
            <label>
              <span>E-mail</span>
              <div>
                <Mail size={18} />
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="seu@email.com" />
              </div>
            </label>
            <label>
              <span>Senha</span>
              <div>
                <LockKeyhole size={18} />
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" placeholder="Sua senha" />
              </div>
            </label>
            {error && <p className="login-error">{error}</p>}
            <button disabled={loading}>
              <span>{loading ? 'Entrando...' : 'Entrar na CEAMI'}</span>
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          <small className="login-note">
            Após entrar, você verá apenas os aplicativos autorizados para sua conta.
          </small>
        </section>
      </section>
    </main>
  );
}
