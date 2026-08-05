'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, CheckCircle2, Clock3, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';

type MemberData = Record<string, unknown>;

type PendingRequest = {
  id: string;
  member_id: string;
  proposed_data: Record<string, unknown>;
  status: string;
  source: string | null;
  updated_at: string | null;
  member: MemberData | null;
};

type Feedback = { type: 'success' | 'error'; message: string } | null;

const FIELD_LABELS: Record<string, string> = {
  birth_date: 'Data de nascimento',
  phone: 'WhatsApp',
  email: 'E-mail',
  address: 'Endereço',
  neighborhood: 'Bairro',
  city: 'Cidade',
  marital_status: 'Estado civil',
  spouse_name: 'Cônjuge',
  has_children: 'Tem filhos',
  children_names: 'Filhos',
  water_baptized: 'Batizado nas águas',
  holy_spirit_baptized: 'Batizado no Espírito Santo',
  fundamentos_fe: 'Fundamentos da Fé',
  talents: 'Talentos e habilidades',
  ministry: 'Ministério',
  notes: 'Observações',
};

const BOOLEAN_FIELDS = new Set([
  'has_children',
  'water_baptized',
  'holy_spirit_baptized',
  'fundamentos_fe',
]);

const DATE_FIELDS = new Set(['birth_date']);

function text(value: unknown) {
  return String(value ?? '').trim();
}

function formatDate(value: unknown) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw || 'Não informado';
  const [year, month, day] = raw.split('-');
  return `${day}/${month}/${year}`;
}

function formatValue(key: string, value: unknown) {
  if (BOOLEAN_FIELDS.has(key)) {
    if (value === true) return 'Sim';
    if (value === false) return 'Não';
    return 'Não informado';
  }
  if (DATE_FIELDS.has(key)) return formatDate(value);
  const result = text(value);
  return result || 'Não informado';
}

function requestDate(value: string | null) {
  if (!value) return 'Horário não informado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Horário não informado';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

function ensurePortalHost() {
  const headings = Array.from(document.querySelectorAll('.member-v3-panel h2'));
  const heading = headings.find((item) => item.textContent?.trim() === 'Consulta de cadastro');
  const panel = heading?.closest('.member-v3-panel');
  if (!panel) return null;

  const dashboard = panel.parentElement;
  if (!dashboard) return null;

  let host = dashboard.querySelector('[data-ceami-pending-updates-host]') as HTMLElement | null;
  if (!host) {
    host = document.createElement('div');
    host.dataset.ceamiPendingUpdatesHost = 'true';
    panel.insertAdjacentElement('afterend', host);
  }
  return host;
}

function updateTabBadge(count: number) {
  const buttons = Array.from(document.querySelectorAll('button'));
  const tab = buttons.find((button) => button.textContent?.includes('Consulta de cadastro'));
  if (!tab) return;

  let badge = tab.querySelector('[data-ceami-pending-badge]') as HTMLElement | null;
  if (!count) {
    badge?.remove();
    return;
  }

  if (!badge) {
    badge = document.createElement('span');
    badge.dataset.ceamiPendingBadge = 'true';
    badge.style.minWidth = '22px';
    badge.style.height = '22px';
    badge.style.padding = '0 6px';
    badge.style.borderRadius = '999px';
    badge.style.display = 'inline-grid';
    badge.style.placeItems = 'center';
    badge.style.background = '#ef5a25';
    badge.style.color = '#fff';
    badge.style.fontSize = '11px';
    badge.style.fontWeight = '900';
    tab.appendChild(badge);
  }
  badge.textContent = String(count);
}

export default function PendingMemberUpdates() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [processingId, setProcessingId] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    function syncHost() {
      const next = ensurePortalHost();
      setHost((current) => (current === next ? current : next));
    }

    syncHost();
    const observer = new MutationObserver(syncHost);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await fetch('/api/admin/member-update-requests', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar as alterações pendentes.');
      const next = Array.isArray(data.requests) ? data.requests : [];
      setRequests(next);
      updateTabBadge(next.length);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar as alterações pendentes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!host) return;
    void loadRequests();
  }, [host, loadRequests]);

  useEffect(() => {
    updateTabBadge(requests.length);
  }, [requests.length]);

  const totalChanges = useMemo(
    () => requests.reduce((total, item) => total + Object.keys(item.proposed_data || {}).length, 0),
    [requests],
  );

  async function review(item: PendingRequest, action: 'approve' | 'reject') {
    const memberName = text(item.member?.full_name) || 'este membro';
    const confirmed = window.confirm(
      action === 'approve'
        ? `Aprovar as alterações solicitadas por ${memberName}?\n\nOs dados serão gravados no cadastro oficial.`
        : `Rejeitar as alterações solicitadas por ${memberName}?\n\nO cadastro atual será mantido sem mudanças.`,
    );
    if (!confirmed) return;

    setProcessingId(item.id);
    setFeedback(null);
    try {
      const response = await fetch('/api/admin/member-update-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível analisar a solicitação.');

      setRequests((current) => current.filter((request) => request.id !== item.id));
      setFeedback({
        type: 'success',
        message: action === 'approve'
          ? `Alterações de ${memberName} aprovadas e salvas.`
          : `Solicitação de ${memberName} rejeitada.`,
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Não foi possível analisar a solicitação.',
      });
    } finally {
      setProcessingId('');
    }
  }

  if (!host) return null;

  return createPortal(
    <section className="member-v3-panel" style={{ marginTop: 18 }}>
      <div className="member-v3-panel-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 5 }}>
            <ShieldCheck size={21} />
            <h2 style={{ margin: 0 }}>Alterações pendentes</h2>
            {requests.length > 0 && (
              <span style={{ minWidth: 25, height: 25, padding: '0 8px', borderRadius: 999, background: '#fff0ea', color: '#c94618', display: 'inline-grid', placeItems: 'center', fontSize: 12, fontWeight: 900 }}>
                {requests.length}
              </span>
            )}
          </div>
          <p style={{ margin: 0 }}>Solicitações enviadas pelos membros através da página de consulta. Confira o antes e o depois antes de aprovar.</p>
        </div>
        <button type="button" className="member-v3-primary" disabled={loading} onClick={() => void loadRequests()}>
          <RefreshCw size={17} />{loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {feedback && (
        <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 13, background: feedback.type === 'success' ? '#e9f8ef' : '#fff0ee', color: feedback.type === 'success' ? '#176c3a' : '#a83b2c', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
          {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          {feedback.message}
        </div>
      )}

      {loadError && (
        <div style={{ marginTop: 16, padding: '14px', borderRadius: 13, background: '#fff0ee', color: '#a83b2c' }}>{loadError}</div>
      )}

      {!loadError && (
        <div style={{ marginTop: 18, display: 'grid', gap: 14 }}>
          {loading && !requests.length ? (
            <div style={{ padding: '24px 4px', color: '#6d7f88' }}>Carregando solicitações...</div>
          ) : requests.length === 0 ? (
            <div style={{ padding: '22px', border: '1px solid #e3eaed', borderRadius: 18, background: '#f8fafb', display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ width: 42, height: 42, borderRadius: 13, background: '#e9f8ef', color: '#25844b', display: 'grid', placeItems: 'center' }}><Check size={21} /></span>
              <div><strong style={{ display: 'block' }}>Tudo revisado</strong><span style={{ color: '#6d7f88', fontSize: 13 }}>Não há alterações de cadastro aguardando aprovação.</span></div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', color: '#6d7f88', fontSize: 12 }}>
                <span><strong style={{ color: '#073f57' }}>{requests.length}</strong> {requests.length === 1 ? 'solicitação pendente' : 'solicitações pendentes'}</span>
                <span><strong style={{ color: '#073f57' }}>{totalChanges}</strong> {totalChanges === 1 ? 'campo para revisar' : 'campos para revisar'}</span>
              </div>

              {requests.map((item) => {
                const memberName = text(item.member?.full_name) || 'Membro não localizado';
                const entries = Object.entries(item.proposed_data || {}).filter(([key]) => FIELD_LABELS[key]);
                return (
                  <article key={item.id} style={{ border: '1px solid #dfe7ea', borderRadius: 18, overflow: 'hidden', background: '#fff' }}>
                    <header style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', background: '#fafcfc', borderBottom: '1px solid #e6ecee' }}>
                      <div>
                        <strong style={{ display: 'block', fontSize: 16 }}>{memberName}</strong>
                        <span style={{ marginTop: 4, color: '#6d7f88', fontSize: 12, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <Clock3 size={13} />Solicitado em {requestDate(item.updated_at)}
                        </span>
                      </div>
                      <span style={{ padding: '6px 9px', borderRadius: 999, background: '#fff0ea', color: '#c94618', fontSize: 11, fontWeight: 850 }}>
                        {entries.length} {entries.length === 1 ? 'alteração' : 'alterações'}
                      </span>
                    </header>

                    <div style={{ padding: '4px 18px 8px' }}>
                      {entries.map(([key, proposed]) => {
                        const current = item.member?.[key];
                        return (
                          <div key={key} style={{ display: 'grid', gridTemplateColumns: 'minmax(130px, .75fr) 1fr 28px 1fr', gap: 10, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #edf1f2' }}>
                            <span style={{ color: '#6d7f88', fontSize: 12 }}>{FIELD_LABELS[key]}</span>
                            <div style={{ minWidth: 0 }}><small style={{ display: 'block', color: '#95a3a9', marginBottom: 3 }}>Atual</small><strong style={{ display: 'block', fontSize: 12.5, overflowWrap: 'anywhere' }}>{formatValue(key, current)}</strong></div>
                            <span aria-hidden="true" style={{ color: '#b0bbc0', textAlign: 'center' }}>→</span>
                            <div style={{ minWidth: 0, padding: '7px 9px', borderRadius: 10, background: '#fff7f3' }}><small style={{ display: 'block', color: '#c66a48', marginBottom: 3 }}>Solicitado</small><strong style={{ display: 'block', fontSize: 12.5, color: '#7e351d', overflowWrap: 'anywhere' }}>{formatValue(key, proposed)}</strong></div>
                          </div>
                        );
                      })}
                    </div>

                    <footer style={{ padding: '14px 18px 16px', display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        disabled={Boolean(processingId)}
                        onClick={() => void review(item, 'reject')}
                        style={{ border: '1px solid #e0e7e9', background: '#fff', color: '#8a4a3b', borderRadius: 12, padding: '10px 14px', fontWeight: 800, cursor: 'pointer' }}
                      >
                        {processingId === item.id ? 'Processando...' : 'Rejeitar'}
                      </button>
                      <button
                        type="button"
                        className="member-v3-primary"
                        disabled={Boolean(processingId)}
                        onClick={() => void review(item, 'approve')}
                      >
                        <Check size={17} />{processingId === item.id ? 'Processando...' : 'Aprovar alterações'}
                      </button>
                    </footer>
                  </article>
                );
              })}
            </>
          )}
        </div>
      )}
    </section>,
    host,
  );
}
