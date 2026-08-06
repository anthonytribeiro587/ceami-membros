'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Clock3, History, RefreshCw } from 'lucide-react';

type MemberData = Record<string, unknown>;

type HistoryEntry = {
  id: string;
  member_id: string;
  proposed_data: Record<string, unknown>;
  status: string;
  source: string | null;
  updated_at: string | null;
  member: MemberData | null;
};

type ChangeEntry = {
  key: string;
  before: unknown;
  after: unknown;
  hasBefore: boolean;
};

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
  ministry: 'Ministérios',
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

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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

function historyDate(value: string | null) {
  if (!value) return 'Horário não informado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Horário não informado';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

function getChanges(payload: Record<string, unknown>): ChangeEntry[] {
  const before = asObject(payload.before);
  const after = asObject(payload.after);

  if (Object.keys(after).length) {
    return Object.entries(after)
      .filter(([key]) => FIELD_LABELS[key])
      .map(([key, value]) => ({ key, before: before[key], after: value, hasBefore: key in before }));
  }

  return Object.entries(payload)
    .filter(([key]) => FIELD_LABELS[key])
    .map(([key, value]) => ({ key, before: undefined, after: value, hasBefore: false }));
}

function ensurePortalHost() {
  const headings = Array.from(document.querySelectorAll('.member-v3-panel h2'));
  const heading = headings.find(item => item.textContent?.trim() === 'Consulta de cadastro');
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

export default function PendingMemberUpdates() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    function syncHost() {
      const next = ensurePortalHost();
      setHost(current => current === next ? current : next);
    }

    syncHost();
    const observer = new MutationObserver(syncHost);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await fetch('/api/admin/member-update-requests', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o histórico de alterações.');
      setHistory(Array.isArray(data.history) ? data.history : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar o histórico de alterações.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!host) return;
    void loadHistory();
  }, [host, loadHistory]);

  const totalChanges = useMemo(
    () => history.reduce((total, item) => total + getChanges(item.proposed_data || {}).length, 0),
    [history],
  );

  if (!host) return null;

  return createPortal(
    <section className="member-v3-panel" style={{ marginTop: 18 }}>
      <div className="member-v3-panel-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 5, flexWrap: 'wrap' }}>
            <History size={21} />
            <h2 style={{ margin: 0 }}>Histórico de alterações</h2>
            {history.length > 0 && (
              <span style={{ minWidth: 25, height: 25, padding: '0 8px', borderRadius: 999, background: '#eef5f7', color: '#073f57', display: 'inline-grid', placeItems: 'center', fontSize: 12, fontWeight: 900 }}>
                {history.length}
              </span>
            )}
          </div>
          <p style={{ margin: 0 }}>As alterações feitas pelos membros na página de consulta são salvas automaticamente. Aqui fica o registro do que mudou.</p>
        </div>
        <button type="button" className="member-v3-primary" disabled={loading} onClick={() => void loadHistory()}>
          <RefreshCw size={17} />{loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {loadError && (
        <div style={{ marginTop: 16, padding: '14px', borderRadius: 13, background: '#fff0ee', color: '#a83b2c' }}>{loadError}</div>
      )}

      {!loadError && (
        <div style={{ marginTop: 18, display: 'grid', gap: 14 }}>
          {loading && !history.length ? (
            <div style={{ padding: '24px 4px', color: '#6d7f88' }}>Carregando histórico...</div>
          ) : history.length === 0 ? (
            <div style={{ padding: '22px', border: '1px solid #e3eaed', borderRadius: 18, background: '#f8fafb', display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ width: 42, height: 42, borderRadius: 13, background: '#e9f8ef', color: '#25844b', display: 'grid', placeItems: 'center', flexShrink: 0 }}><CheckCircle2 size={21} /></span>
              <div><strong style={{ display: 'block' }}>Nenhuma alteração registrada</strong><span style={{ color: '#6d7f88', fontSize: 13 }}>Quando um membro atualizar seus dados pela consulta, o registro aparecerá aqui.</span></div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', color: '#6d7f88', fontSize: 12 }}>
                <span><strong style={{ color: '#073f57' }}>{history.length}</strong> {history.length === 1 ? 'atualização registrada' : 'atualizações registradas'}</span>
                <span><strong style={{ color: '#073f57' }}>{totalChanges}</strong> {totalChanges === 1 ? 'campo alterado' : 'campos alterados'}</span>
              </div>

              {history.map(item => {
                const memberName = text(item.member?.full_name) || 'Membro não localizado';
                const entries = getChanges(item.proposed_data || {});
                if (!entries.length) return null;

                return (
                  <article key={item.id} style={{ border: '1px solid #dfe7ea', borderRadius: 18, overflow: 'hidden', background: '#fff' }}>
                    <header style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', background: '#fafcfc', borderBottom: '1px solid #e6ecee' }}>
                      <div>
                        <strong style={{ display: 'block', fontSize: 16 }}>{memberName}</strong>
                        <span style={{ marginTop: 4, color: '#6d7f88', fontSize: 12, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <Clock3 size={13} />Atualizado em {historyDate(item.updated_at)}
                        </span>
                      </div>
                      <span style={{ padding: '6px 9px', borderRadius: 999, background: '#e9f8ef', color: '#237246', fontSize: 11, fontWeight: 850 }}>
                        Salvo automaticamente · {entries.length} {entries.length === 1 ? 'campo' : 'campos'}
                      </span>
                    </header>

                    <div style={{ padding: '4px 18px 8px', display: 'grid', gap: 0 }}>
                      {entries.map(entry => (
                        <div key={entry.key} style={{ padding: '12px 0', borderBottom: '1px solid #edf1f2' }}>
                          <span style={{ display: 'block', color: '#6d7f88', fontSize: 12, marginBottom: 8 }}>{FIELD_LABELS[entry.key]}</span>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 9 }}>
                            <div style={{ minWidth: 0, padding: '9px 11px', borderRadius: 11, background: '#f7f9fa' }}>
                              <small style={{ display: 'block', color: '#95a3a9', marginBottom: 3 }}>Antes</small>
                              <strong style={{ display: 'block', fontSize: 12.5, overflowWrap: 'anywhere' }}>{entry.hasBefore ? formatValue(entry.key, entry.before) : 'Registro anterior não disponível'}</strong>
                            </div>
                            <div style={{ minWidth: 0, padding: '9px 11px', borderRadius: 11, background: '#eef8f2' }}>
                              <small style={{ display: 'block', color: '#438260', marginBottom: 3 }}>Depois</small>
                              <strong style={{ display: 'block', fontSize: 12.5, color: '#195a36', overflowWrap: 'anywhere' }}>{formatValue(entry.key, entry.after)}</strong>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
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
