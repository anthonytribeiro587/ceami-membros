'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function AccountSecurityClient() {
  const supabase = useMemo(() => createClient(), []);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let active = true;

    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active || !data.user) return;

      setEmail(data.user.email || '');

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', data.user.id)
        .maybeSingle();

      if (!active) return;
      setFullName(String(profile?.full_name || ''));
      setLoadingProfile(false);
    })();

    return () => {
      active = false;
    };
  }, [supabase]);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!email) {
      setError('Não foi possível identificar o e-mail desta conta.');
      return;
    }

    if (newPassword.length < 10) {
      setError('A nova senha precisa ter pelo menos 10 caracteres.');
      return;
    }

    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setError('Use pelo menos uma letra e um número na nova senha.');
      return;
    }

    if (newPassword !== confirmation) {
      setError('A confirmação não corresponde à nova senha.');
      return;
    }

    if (currentPassword === newPassword) {
      setError('Escolha uma senha diferente da atual.');
      return;
    }

    setSaving(true);

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (verifyError) {
      setError('A senha atual está incorreta.');
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      setError(
        updateError.message.toLowerCase().includes('password')
          ? 'A nova senha não atende aos requisitos de segurança. Escolha uma senha mais forte.'
          : 'Não foi possível alterar a senha agora.',
      );
      setSaving(false);
      return;
    }

    // Mantém esta sessão e revoga os outros refresh tokens da conta.
    await supabase.auth.signOut({ scope: 'others' });

    setCurrentPassword('');
    setNewPassword('');
    setConfirmation('');
    setSuccess('Senha alterada. As outras sessões desta conta foram encerradas.');
    setSaving(false);
  }

  return (
    <main className="account-page">
      <section className="account-shell">
        <div className="account-toolbar">
          <Link href="/?selecionar=1" className="account-back">
            <ArrowLeft size={16} /> Aplicativos
          </Link>
          <div id="ceami-app-switcher-slot" className="ceami-app-switcher-slot" />
        </div>

        <header className="account-header">
          <span>CONTA CEAMI</span>
          <h1><KeyRound /> Minha conta</h1>
          <p>Atualize sua senha pessoal sem precisar pedir uma nova senha à administração.</p>
        </header>

        <section className="account-profile">
          <div className="account-avatar"><UserRound /></div>
          <div>
            <small>Usuário</small>
            <strong>{loadingProfile ? 'Carregando...' : fullName || 'Conta CEAMI'}</strong>
            <span><Mail size={14} /> {email || 'E-mail da conta'}</span>
          </div>
        </section>

        <section className="account-security-card">
          <div className="account-security-title">
            <div><ShieldCheck /></div>
            <div>
              <span>SEGURANÇA</span>
              <h2>Alterar senha</h2>
              <p>Informe a senha atual antes de criar uma nova.</p>
            </div>
          </div>

          <form onSubmit={changePassword}>
            <label>
              <span>Senha atual</span>
              <div><LockKeyhole size={18} /><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></div>
            </label>
            <label>
              <span>Nova senha</span>
              <div><KeyRound size={18} /><input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={10} /></div>
              <small>Mínimo de 10 caracteres, com letras e números. Evite reutilizar senhas.</small>
            </label>
            <label>
              <span>Confirmar nova senha</span>
              <div><KeyRound size={18} /><input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required minLength={10} /></div>
            </label>

            {error && <div className="account-message error">{error}</div>}
            {success && <div className="account-message success"><CheckCircle2 size={17} /> {success}</div>}

            <button type="submit" disabled={saving}>
              {saving ? <LoaderCircle className="account-spin" size={18} /> : <ShieldCheck size={18} />}
              {saving ? 'Alterando...' : 'Alterar minha senha'}
            </button>
          </form>
        </section>

        <p className="account-security-note">
          A senha pertence somente ao usuário. A administração não precisa saber qual senha você escolheu.
        </p>
      </section>
    </main>
  );
}
