'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, HeartHandshake, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import '../login/social-login.css';
import './social-register.css';

export default function SocialRegisterPage() {
  const supabase = useMemo(() => createClient(), []);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const name = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (name.length < 3) {
      setError('Informe o nome completo.');
      return;
    }

    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          full_name: name,
          signup_portal: 'social',
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message === 'User already registered'
        ? 'Este e-mail já possui cadastro.'
        : 'Não foi possível criar o acesso. Confira os dados e tente novamente.');
      setLoading(false);
      return;
    }

    if (data.session) {
      await supabase.auth.signOut();
    }

    setLoading(false);
    setSuccess(true);
  }

  return (
    <main className="social-login-page">
      <section className="social-login-card social-register-card">
        <div className="social-login-brand">
          <img src="/brand/ceami-icon.svg?v=official-2" alt="CEAMI" />
          <div><strong>CEAMI</strong><span>Social</span></div>
        </div>

        {success ? (
          <div className="social-register-success">
            <div className="social-register-success-icon"><CheckCircle2 /></div>
            <span>CADASTRO RECEBIDO</span>
            <h1>Agora é só aguardar a aprovação</h1>
            <p>Seu acesso foi criado exclusivamente para o CEAMI Social. Um administrador precisa liberar a conta antes do primeiro login.</p>
            <p className="social-register-note">Se você receber um e-mail de confirmação, confirme o endereço antes de tentar entrar.</p>
            <Link className="social-register-primary-link" href="/social/login">Voltar para o login</Link>
          </div>
        ) : (
          <>
            <div className="social-login-copy social-register-copy">
              <div className="social-login-icon"><HeartHandshake /></div>
              <span>NOVO ACESSO DA EQUIPE</span>
              <h1>Criar acesso ao CEAMI Social</h1>
              <p>Use seus próprios dados. Depois do cadastro, a administração libera o acesso somente ao módulo Social.</p>
            </div>

            <form onSubmit={handleSubmit}>
              <label>
                <span>Nome completo</span>
                <div><UserRound size={19} /><input type="text" required autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} /></div>
              </label>
              <label>
                <span>E-mail</span>
                <div><Mail size={19} /><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
              </label>
              <label>
                <span>Senha</span>
                <div><LockKeyhole size={19} /><input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></div>
              </label>
              <label>
                <span>Confirmar senha</span>
                <div><LockKeyhole size={19} /><input type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></div>
              </label>
              {error && <p className="social-login-error">{error}</p>}
              <button type="submit" disabled={loading}>{loading ? 'Criando acesso...' : 'Criar meu acesso'}</button>
            </form>

            <div className="social-register-security">
              <strong>Acesso restrito</strong>
              <span>Este cadastro não libera o CEAMI Membros. A conta só poderá entrar no CEAMI Social após aprovação.</span>
            </div>
            <Link className="social-login-back" href="/social/login">Já tenho cadastro</Link>
          </>
        )}
      </section>
    </main>
  );
}
