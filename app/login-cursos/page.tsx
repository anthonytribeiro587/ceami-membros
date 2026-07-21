'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GraduationCap, LockKeyhole, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import '../login/login.css';

export default function CoursesLoginPage() {
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
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError || !data.user) {
      setError('E-mail ou senha incorretos.');
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, course_only')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError) {
      await supabase.auth.signOut();
      setError('O acesso aos cursos ainda não foi configurado para esta conta.');
      setLoading(false);
      return;
    }

    if (profile?.role !== 'admin' && !profile?.course_only) {
      await supabase.auth.signOut();
      setError('Esta conta não possui acesso ao portal de Cursos.');
      setLoading(false);
      return;
    }

    router.replace('/cursos');
    router.refresh();
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <div><GraduationCap size={27} /></div>
          <span><strong>CEAMI</strong><small>Cursos e presença</small></span>
        </div>
        <div className="login-copy">
          <span>ACESSO AOS CURSOS</span>
          <h1>Entre no portal</h1>
          <p>Acesso exclusivo para organizadores, professores e administração.</p>
        </div>
        <form onSubmit={handleSubmit}>
          <label>
            <span>E-mail</span>
            <div><Mail size={18} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></div>
          </label>
          <label>
            <span>Senha</span>
            <div><LockKeyhole size={18} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></div>
          </label>
          {error && <p className="login-error">{error}</p>}
          <button disabled={loading}>{loading ? 'Entrando...' : 'Entrar nos cursos'}</button>
        </form>
        <Link className="login-note" href="/login">Acesso administrativo geral</Link>
      </section>
    </main>
  );
}
