'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import './teste-aniversario.css';

type Birthday = { id: string; name: string };

type PreviewResponse = {
  date: string;
  displayDate: string;
  birthdays: Birthday[];
  configuration: {
    apiUrl: string;
    instance: string;
    groupId: string;
    apiKeyConfigured: boolean;
  };
  error?: string;
};

type SendResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  names?: string[];
  historySaved?: boolean;
  historyError?: string | null;
};

export default function TesteAniversarioPage() {
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [sending, setSending] = useState<'simulation' | 'today' | null>(null);
  const [testName, setTestName] = useState('Anthony Thiago');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sentMessage, setSentMessage] = useState('');

  useEffect(() => {
    void loadPreview();
  }, []);

  async function loadPreview() {
    setLoadingPreview(true);
    setError('');

    try {
      const response = await fetch('/api/birthdays/test', { cache: 'no-store' });
      const data = (await response.json()) as PreviewResponse;

      if (!response.ok) {
        setError(data.error || 'Não foi possível carregar o teste.');
        return;
      }

      setPreview(data);
    } catch {
      setError('Não foi possível carregar o teste agora.');
    } finally {
      setLoadingPreview(false);
    }
  }

  async function send(mode: 'simulation' | 'today', event?: FormEvent) {
    event?.preventDefault();
    setSending(mode);
    setError('');
    setSuccess('');
    setSentMessage('');

    try {
      const response = await fetch('/api/birthdays/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, testName }),
      });

      const data = (await response.json()) as SendResponse;

      if (!response.ok) {
        setError(data.error || 'Não foi possível enviar a mensagem.');
        return;
      }

      setSuccess(
        mode === 'simulation'
          ? 'Mensagem de simulação enviada para o grupo de teste.'
          : 'Mensagem dos aniversariantes de hoje enviada para o grupo.',
      );
      setSentMessage(data.message || '');

      if (data.historySaved === false) {
        setError(`A mensagem foi enviada, mas o histórico não foi salvo: ${data.historyError || 'erro desconhecido'}`);
      }
    } catch {
      setError('Não foi possível concluir o envio.');
    } finally {
      setSending(null);
    }
  }

  return (
    <main className="birthday-test-page">
      <div className="birthday-test-shell">
        <header className="birthday-test-top">
          <div className="birthday-test-brand">
            <div className="birthday-test-symbol">CE</div>
            <div>
              <strong>CEAMI Membros</strong>
              <span>Teste da automação de aniversários</span>
            </div>
          </div>
          <Link href="/" className="birthday-test-back">
            Voltar ao painel
          </Link>
        </header>

        <section className="birthday-test-card">
          <h1>Envio para o grupo fictício</h1>
          <p>
            Esta tela usa a instância NextLead somente para validar o envio. O disparo diário ainda não está ativado.
          </p>

          {loadingPreview && <p>Carregando configuração...</p>}

          {preview && (
            <div className="birthday-status-grid">
              <div className="birthday-status">
                <small>Instância</small>
                <strong>{preview.configuration.instance}</strong>
              </div>
              <div className="birthday-status">
                <small>Grupo de teste</small>
                <strong>{preview.configuration.groupId}</strong>
              </div>
              <div className="birthday-status">
                <small>Chave da Evolution</small>
                <strong>{preview.configuration.apiKeyConfigured ? 'Configurada' : 'Não configurada'}</strong>
              </div>
            </div>
          )}

          {preview && !preview.configuration.apiKeyConfigured && (
            <div className="birthday-warning">
              Cadastre EVOLUTION_API_KEY na Vercel antes de apertar os botões de envio.
            </div>
          )}
        </section>

        <section className="birthday-test-card">
          <h2>Aniversariantes de hoje</h2>
          <p>{preview ? `Data considerada: ${preview.displayDate}` : 'Consultando o Supabase...'}</p>

          {preview && preview.birthdays.length > 0 ? (
            <ul className="birthday-list">
              {preview.birthdays.map((birthday) => (
                <li key={birthday.id}>{birthday.name}</li>
              ))}
            </ul>
          ) : (
            preview && <p>Nenhum aniversariante cadastrado para hoje.</p>
          )}
        </section>

        <section className="birthday-test-card">
          <h2>Disparar teste</h2>
          <form className="birthday-actions" onSubmit={(event) => void send('simulation', event)}>
            <label className="birthday-field">
              <span>Nome usado na mensagem simulada</span>
              <input value={testName} onChange={(event) => setTestName(event.target.value)} />
            </label>

            <div className="birthday-button-row">
              <button
                type="submit"
                className="birthday-button primary"
                disabled={sending !== null || !preview?.configuration.apiKeyConfigured}
              >
                {sending === 'simulation' ? 'Enviando...' : 'Enviar simulação agora'}
              </button>

              <button
                type="button"
                className="birthday-button secondary"
                onClick={() => void send('today')}
                disabled={
                  sending !== null ||
                  !preview?.configuration.apiKeyConfigured ||
                  !preview?.birthdays.length
                }
              >
                {sending === 'today' ? 'Enviando...' : 'Enviar aniversariantes de hoje'}
              </button>
            </div>
          </form>

          {success && <div className="birthday-success">{success}</div>}
          {error && <div className="birthday-error">{error}</div>}
          {sentMessage && <div className="birthday-result">{sentMessage}</div>}
        </section>
      </div>
    </main>
  );
}
