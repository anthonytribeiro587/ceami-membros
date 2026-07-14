'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import './teste-aniversario.css';

type Birthday = { id: string; name: string; phone: string };
type SimulationMember = { id: string; name: string; phone: string };

type PreviewResponse = {
  date: string;
  displayDate: string;
  birthdays: Birthday[];
  simulationMembers: SimulationMember[];
  configuration: {
    apiUrlConfigured: boolean;
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
  mentioned?: string[];
  historySaved?: boolean;
  historyError?: string | null;
};

function maskPhone(phone: string) {
  if (phone.length < 12) return phone;
  const local = phone.startsWith('55') ? phone.slice(2) : phone;
  const ddd = local.slice(0, 2);
  const start = local.slice(2, -4);
  const end = local.slice(-4);
  return `(${ddd}) ${start}-${end}`;
}

export default function TesteAniversarioPage() {
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [sending, setSending] = useState<'simulation' | 'today' | null>(null);
  const [testMemberId, setTestMemberId] = useState('');
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
      const anthony = data.simulationMembers.find((member) =>
        member.name.toLocaleLowerCase('pt-BR').startsWith('anthony thiago'),
      );
      setTestMemberId(anthony?.id || data.simulationMembers[0]?.id || '');
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
        body: JSON.stringify({ mode, testMemberId }),
      });

      const data = (await response.json()) as SendResponse;

      if (!response.ok) {
        setError(data.error || 'Não foi possível enviar a mensagem.');
        return;
      }

      setSuccess(
        mode === 'simulation'
          ? 'Simulação enviada com a menção do membro selecionado.'
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

  const selectedMember = preview?.simulationMembers.find((member) => member.id === testMemberId);

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
                <small>Evolution</small>
                <strong>
                  {preview.configuration.apiUrlConfigured && preview.configuration.apiKeyConfigured
                    ? 'Configurada'
                    : 'Configuração incompleta'}
                </strong>
              </div>
            </div>
          )}

          {preview && (!preview.configuration.apiKeyConfigured || !preview.configuration.apiUrlConfigured) && (
            <div className="birthday-warning">
              Confira as variáveis da Evolution na Vercel antes de apertar os botões de envio.
            </div>
          )}
        </section>

        <section className="birthday-test-card">
          <h2>Aniversariantes de hoje</h2>
          <p>{preview ? `Data considerada: ${preview.displayDate}` : 'Consultando o Supabase...'}</p>

          {preview && preview.birthdays.length > 0 ? (
            <ul className="birthday-list">
              {preview.birthdays.map((birthday) => (
                <li key={birthday.id}>
                  {birthday.name}
                  {birthday.phone ? <small> • menção disponível</small> : <small> • sem WhatsApp</small>}
                </li>
              ))}
            </ul>
          ) : (
            preview && <p>Nenhum aniversariante cadastrado para hoje.</p>
          )}
        </section>

        <section className="birthday-test-card">
          <h2>Simular aniversário de um membro</h2>
          <p>O sistema usa o nome e o WhatsApp reais do cadastro para criar a menção no grupo.</p>

          <form className="birthday-actions" onSubmit={(event) => void send('simulation', event)}>
            <label className="birthday-field">
              <span>Membro usado na simulação</span>
              <select value={testMemberId} onChange={(event) => setTestMemberId(event.target.value)}>
                <option value="">Selecione um membro</option>
                {preview?.simulationMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} — {maskPhone(member.phone)}
                  </option>
                ))}
              </select>
            </label>

            {selectedMember && (
              <div className="birthday-warning">
                A mensagem mencionará {selectedMember.name} usando @{selectedMember.phone}.
              </div>
            )}

            <div className="birthday-button-row">
              <button
                type="submit"
                className="birthday-button primary"
                disabled={
                  sending !== null ||
                  !testMemberId ||
                  !preview?.configuration.apiKeyConfigured ||
                  !preview?.configuration.apiUrlConfigured
                }
              >
                {sending === 'simulation' ? 'Enviando...' : 'Enviar simulação com menção'}
              </button>

              <button
                type="button"
                className="birthday-button secondary"
                onClick={() => void send('today')}
                disabled={
                  sending !== null ||
                  !preview?.configuration.apiKeyConfigured ||
                  !preview?.configuration.apiUrlConfigured ||
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
