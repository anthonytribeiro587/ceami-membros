'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Cake,
  CheckCircle2,
  Clock3,
  MessageCircle,
  RefreshCw,
  Send,
  Workflow,
} from 'lucide-react';

type AutomationType = 'birthday' | 'reading_plan' | 'custom';
type RunType = 'automatic' | 'manual' | 'simulation';

type HistoryItem = {
  id: string;
  automationId: string;
  automationName: string;
  automationType: AutomationType;
  title: string;
  sendDate: string | null;
  groupId: string;
  groupName: string;
  runType: RunType;
  message: string;
  status: string;
  errorMessage: string;
  createdAt: string | null;
};

type HistoryResponse = { history?: HistoryItem[]; error?: string; details?: string };
type HistoryFilter = 'all' | 'automatic' | 'manual' | 'failed';

function formatDate(value: string | null) {
  if (!value) return 'Data não informada';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsed);
}

function isSuccess(status: string) {
  return status === 'sent' || status === 'queued';
}

function runLabel(type: RunType) {
  if (type === 'automatic') return 'Automática';
  if (type === 'simulation') return 'Simulação';
  return 'Manual';
}

function statusLabel(status: string) {
  if (isSuccess(status)) return 'Enviada';
  if (status === 'skipped') return 'Sem envio';
  if (status === 'processing') return 'Processando';
  return 'Falhou';
}

function automationLabel(type: AutomationType) {
  if (type === 'birthday') return 'Aniversários';
  if (type === 'reading_plan') return 'Plano de leitura';
  return 'Mensagem programada';
}

function AutomationIcon({ type }: { type: AutomationType }) {
  if (type === 'birthday') return <Cake />;
  if (type === 'reading_plan') return <BookOpen />;
  return <MessageCircle />;
}

export default function BirthdayHistory() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    void loadHistory();
  }, []);

  async function loadHistory() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/messages/history', { cache: 'no-store' });
      const payload = (await response.json()) as HistoryResponse;
      if (!response.ok) {
        setError(payload.details || payload.error || 'Não foi possível carregar o histórico.');
        return;
      }
      setItems(payload.history || []);
    } catch {
      setError('Não foi possível consultar o histórico agora.');
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (filter === 'automatic') return items.filter((item) => item.runType === 'automatic');
    if (filter === 'manual') return items.filter((item) => item.runType !== 'automatic');
    if (filter === 'failed') return items.filter((item) => item.status === 'failed');
    return items;
  }, [filter, items]);

  const sentCount = items.filter((item) => isSuccess(item.status)).length;
  const automaticCount = items.filter(
    (item) => item.runType === 'automatic' && isSuccess(item.status),
  ).length;
  const failedCount = items.filter((item) => item.status === 'failed').length;

  return (
    <div className="message-history">
      <div className="message-history-head">
        <div>
          <h2>Histórico de mensagens</h2>
          <p>Aniversários, plano de leitura e demais automações em um só lugar.</p>
        </div>
        <div className="message-history-actions">
          <button type="button" onClick={() => void loadHistory()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            Atualizar
          </button>
          <Link href="/automacoes">
            <Workflow size={16} />
            Abrir automações
          </Link>
        </div>
      </div>

      <div className="message-history-stats">
        <article>
          <CheckCircle2 />
          <div>
            <small>Enviadas</small>
            <strong>{sentCount}</strong>
          </div>
        </article>
        <article>
          <Send />
          <div>
            <small>Automáticas</small>
            <strong>{automaticCount}</strong>
          </div>
        </article>
        <article className={failedCount ? 'has-error' : ''}>
          <AlertTriangle />
          <div>
            <small>Falhas</small>
            <strong>{failedCount}</strong>
          </div>
        </article>
      </div>

      <div className="message-history-filters" aria-label="Filtrar mensagens">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
          Todas
        </button>
        <button
          className={filter === 'automatic' ? 'active' : ''}
          onClick={() => setFilter('automatic')}
        >
          Automáticas
        </button>
        <button
          className={filter === 'manual' ? 'active' : ''}
          onClick={() => setFilter('manual')}
        >
          Manuais e testes
        </button>
        <button
          className={filter === 'failed' ? 'active' : ''}
          onClick={() => setFilter('failed')}
        >
          Falhas
        </button>
      </div>

      {loading && <div className="message-history-state">Carregando histórico...</div>}

      {!loading && error && (
        <div className="message-history-state error-state">
          <AlertTriangle />
          <strong>Não foi possível carregar o histórico</strong>
          <span>{error}</span>
          <button onClick={() => void loadHistory()}>Tentar novamente</button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="message-history-state">
          <MessageCircle />
          <strong>Nenhuma mensagem neste filtro</strong>
          <span>Os próximos envios aparecerão aqui automaticamente.</span>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="message-history-list">
          {filtered.map((item) => {
            const success = isSuccess(item.status);
            const skipped = item.status === 'skipped';
            const open = expanded === item.id;
            return (
              <article
                className={`message-history-card ${success ? 'sent' : skipped ? 'skipped' : 'failed'}`}
                key={item.id}
              >
                <button
                  type="button"
                  className="message-history-card-main"
                  onClick={() => setExpanded(open ? null : item.id)}
                >
                  <div className="message-history-icon">
                    {success ? (
                      <CheckCircle2 />
                    ) : skipped ? (
                      <Clock3 />
                    ) : (
                      <AlertTriangle />
                    )}
                  </div>
                  <div className="message-history-summary">
                    <div className="message-history-title-row">
                      <strong>{item.title}</strong>
                      <span className={`message-automation-type ${item.automationType}`}>
                        <AutomationIcon type={item.automationType} />
                        {automationLabel(item.automationType)}
                      </span>
                      <span className={`message-type ${item.runType}`}>
                        {runLabel(item.runType)}
                      </span>
                    </div>
                    <span className="message-history-meta">
                      <Clock3 size={14} />
                      {formatDate(item.createdAt)}
                    </span>
                    <span className="message-history-meta">
                      <MessageCircle size={14} />
                      {item.groupName}
                    </span>
                  </div>
                  <span
                    className={`message-status ${success ? 'success' : skipped ? 'neutral' : 'error'}`}
                  >
                    {statusLabel(item.status)}
                  </span>
                </button>

                {open && (
                  <div className="message-history-details">
                    <div className="message-history-text">
                      {item.message ||
                        (skipped
                          ? item.errorMessage || 'A automação foi executada, mas não havia conteúdo para enviar.'
                          : 'Mensagem não armazenada.')}
                    </div>
                    {item.errorMessage && !skipped && (
                      <div className="message-history-error">{item.errorMessage}</div>
                    )}
                    <small>ID do grupo: {item.groupId || 'não informado'}</small>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .message-history{display:grid;gap:15px}.message-history h2{margin:0;font-size:20px}.message-history p{margin:4px 0 0;color:var(--v3-muted);font-size:13px}.message-history-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.message-history-actions{display:flex;gap:8px;flex-wrap:wrap}.message-history-actions button,.message-history-actions a{min-height:38px;border:1px solid var(--v3-line);border-radius:11px;background:#fff;color:var(--v3-navy);padding:0 12px;display:inline-flex;align-items:center;justify-content:center;gap:7px;font-size:12px;font-weight:800;text-decoration:none}.message-history-actions a{background:var(--v3-navy);color:#fff;border-color:var(--v3-navy)}.message-history-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.message-history-stats article{border:1px solid var(--v3-line);background:#f8fafb;border-radius:15px;padding:13px;display:flex;align-items:center;gap:10px}.message-history-stats article>svg{width:36px;height:36px;padding:8px;border-radius:11px;background:#eaf7f0;color:#2c8c5c}.message-history-stats article.has-error>svg{background:#fff0ec;color:#bd4c28}.message-history-stats small,.message-history-stats strong{display:block}.message-history-stats small{color:var(--v3-muted);font-size:11px;font-weight:750}.message-history-stats strong{font-size:20px}.message-history-filters{display:flex;gap:7px;overflow:auto}.message-history-filters button{white-space:nowrap;border:1px solid var(--v3-line);border-radius:999px;background:#fff;color:var(--v3-navy);padding:7px 11px;font-size:11px;font-weight:850}.message-history-filters button.active{background:var(--v3-navy);border-color:var(--v3-navy);color:#fff}.message-history-state{min-height:230px;border:1px dashed var(--v3-line);border-radius:16px;display:grid;place-items:center;align-content:center;text-align:center;gap:8px;color:var(--v3-muted);padding:22px;font-size:13px}.message-history-state>svg{width:40px;height:40px;color:var(--v3-orange)}.message-history-state strong{color:var(--v3-navy)}.message-history-state button{border:0;border-radius:10px;background:var(--v3-orange);color:#fff;padding:9px 12px;font-size:12px;font-weight:850}.message-history-list{display:grid;gap:8px}.message-history-card{border:1px solid var(--v3-line);border-radius:15px;overflow:hidden;background:#fff}.message-history-card.failed{border-color:#f0c1b2}.message-history-card.skipped{border-color:#dce4e7}.message-history-card-main{width:100%;border:0;background:transparent;color:inherit;text-align:left;padding:13px;display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:11px;align-items:center}.message-history-icon{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:#eaf7f0;color:#2c8c5c}.message-history-icon svg{width:18px}.failed .message-history-icon{background:#fff0ec;color:#bd4c28}.skipped .message-history-icon{background:#eef3f4;color:#6b7e87}.message-history-summary{min-width:0;display:grid;gap:3px}.message-history-title-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.message-history-title-row strong{font-size:13px}.message-type,.message-automation-type{border-radius:999px;padding:4px 7px;font-size:9px;font-weight:900;background:#edf2f4;color:#526973}.message-automation-type{display:inline-flex;align-items:center;gap:4px}.message-automation-type svg{width:11px;height:11px}.message-automation-type.reading_plan{background:#edf5fb;color:#245c7c}.message-automation-type.birthday{background:#fff0ea;color:#b94724}.message-type.automatic{background:#eaf7f0;color:#26734c}.message-type.simulation{background:#fff5de;color:#8a6415}.message-history-meta{display:flex;align-items:center;gap:5px;color:var(--v3-muted);font-size:10px}.message-status{padding:5px 8px;border-radius:999px;font-size:9px;font-weight:900}.message-status.success{background:#eaf7f0;color:#26734c}.message-status.error{background:#fff0ec;color:#b94724}.message-status.neutral{background:#edf2f4;color:#5d717a}.message-history-details{border-top:1px solid var(--v3-line);padding:13px;display:grid;gap:9px;background:#f8fafb}.message-history-text{white-space:pre-wrap;line-height:1.5;color:#405a66;font-size:12px}.message-history-error{padding:9px 11px;border-radius:10px;background:#fff0ec;color:#a94022;font-size:11px;font-weight:750}.message-history-details small{color:var(--v3-muted);font-size:10px;word-break:break-all}.spin{animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:700px){.message-history-head{display:grid}.message-history-actions{display:grid;grid-template-columns:1fr 1fr}.message-history-stats{grid-template-columns:1fr 1fr}.message-history-stats article:last-child{grid-column:1/-1}.message-history-card-main{grid-template-columns:38px minmax(0,1fr)}.message-status{grid-column:2;width:max-content}}
      `}</style>
    </div>
  );
}
