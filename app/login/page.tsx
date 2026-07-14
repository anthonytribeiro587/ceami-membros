'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LockKeyhole, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import './login.css';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError('E-mail ou senha incorretos.');
      setLoading(false);
      return;
    }

    router.replace('/');
    router.refresh();
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand"><div>CE</div><span><strong>CEAMI</strong><small>Gestão de membros</small></span></div>
        <div className="login-copy"><span>ACESSO RESTRITO</span><h1>Entre no painel</h1><p>Use o acesso fornecido pela administração da igreja.</p></div>
        <form onSubmit={handleSubmit}>
          <label><span>E-mail</span><div><Mail size={18}/><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" /></div></label>
          <label><span>Senha</span><div><LockKeyhole size={18}/><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password" /></div></label>
          {error && <p className="login-error">{error}</p>}
          <button disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
        </form>
        <small className="login-note">As páginas do Integra e de consulta continuam públicas.</small>
      </section>
    </main>
  );
}
