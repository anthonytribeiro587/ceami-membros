'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { ArrowRight, CheckCircle2, Search, ShieldCheck, UserPlus } from 'lucide-react';
import './consultar.css';

type Result = 'idle' | 'loading' | 'found' | 'not-found' | 'error';

export default function ConsultarCadastroPage() {
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [result, setResult] = useState<Result>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult('loading');
    setMessage('');

    try {
      const response = await fetch('/api/public/check-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, birthDate }),
      });

      const data = await response.json();
      if (!response.ok) {
        setResult('error');
        setMessage(data.error || 'Não foi possível consultar agora.');
        return;
      }

      setResult(data.found ? 'found' : 'not-found');
    } catch {
      setResult('error');
      setMessage('Não foi possível consultar agora. Tente novamente em instantes.');
    }
  }

  function reset() {
    setResult('idle');
    setMessage('');
  }

  return (
    <main className="lookup-page">
      <section className="lookup-card">
        <header className="lookup-brand">
          <div className="lookup-symbol">CE</div>
          <div>
            <strong>CEAMI</strong>
            <span>Comunidade Evangélica Amigo Mais Que Irmão</span>
          </div>
        </header>

        {result === 'idle' || result === 'loading' || result === 'error' ? (
          <>
            <div className="lookup-intro">
              <span>CONSULTA DE CADASTRO</span>
              <h1>Veja se seus dados já estão cadastrados</h1>
              <p>
                Informe seu nome completo e sua data de nascimento. Por segurança,
                nenhum dado pessoal será exibido.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="lookup-form">
              <label>
                <span>Nome completo</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Digite seu nome completo"
                  autoComplete="name"
                  required
                />
              </label>

              <label>
                <span>Data de nascimento</span>
                <input
                  value={birthDate}
                  onChange={(event) => setBirthDate(event.target.value)}
                  type="date"
                  autoComplete="bday"
                  required
                />
              </label>

              {result === 'error' && <div className="lookup-error">{message}</div>}

              <button type="submit" disabled={result === 'loading'}>
                <Search size={19} />
                {result === 'loading' ? 'Consultando...' : 'Consultar cadastro'}
              </button>
            </form>

            <div className="privacy-note">
              <ShieldCheck size={18} />
              <span>A consulta apenas confirma se o cadastro existe.</span>
            </div>
          </>
        ) : null}

        {result === 'found' && (
          <section className="lookup-result success">
            <CheckCircle2 />
            <span>CADASTRO LOCALIZADO</span>
            <h1>Está tudo certo!</h1>
            <p>Seu cadastro já consta na base de membros da CEAMI.</p>
            <button type="button" onClick={reset} className="secondary-action">
              Fazer outra consulta
            </button>
          </section>
        )}

        {result === 'not-found' && (
          <section className="lookup-result pending">
            <UserPlus />
            <span>CADASTRO NÃO LOCALIZADO</span>
            <h1>Vamos fazer seu cadastro?</h1>
            <p>
              Pode ser que seus dados ainda não estejam no sistema ou tenham sido
              registrados de outra forma.
            </p>
            <Link href="/integra" className="primary-link">
              Preencher ficha do Integra <ArrowRight size={19} />
            </Link>
            <button type="button" onClick={reset} className="secondary-action">
              Conferir os dados novamente
            </button>
          </section>
        )}
      </section>
    </main>
  );
}
