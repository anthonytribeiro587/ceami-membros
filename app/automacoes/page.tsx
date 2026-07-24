'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Cake,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  History,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  Play,
  Plus,
  Save,
  Send,
  Settings2,
  Trash2,
  Workflow,
  X,
} from 'lucide-react';
import './automacoes.css';

type AutomationType = 'birthday' | 'reading_plan' | 'custom';

type Automation = {
  id: string;
  name: string;
  type: AutomationType;
  enabled: boolean;
  sendTime: string;
  timezone: string;
  groupId: string;
  messageTemplate: string;
  lastSentDate: string | null;
  lastSentAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  canDelete: boolean;
};

type HistoryItem = {
  id: string;
  automation_id: string;
  run_type: 'automatic' | 'manual';
  scheduled_date: string;
  status: string;
  message: string | null;
  destination_group_id: string;
  provider_status: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
};

type DashboardData = {
  automations: Automation[];
  today: {
    date: string;
    displayDate: string;
    weekday: string;
    birthdays: Array<{ id: string; name: string }>;
    reading: string;
  };
  tomorrow: { date: string; reading: string };
  history: HistoryItem[];
  evolution: { configured: boolean; instance: string; defaultGroupId: string };
};

type ReadingEntry = { reading_date: string; reference: string };

type Draft = Pick<Automation, 'name' | 'enabled' | 'sendTime' | 'groupId' | 'messageTemplate'>;

const TYPE_INFO: Record<AutomationType, { label: string; description: string }> = {
  birthday: {
    label: 'Aniversários',
    description: 'Celebra automaticamente os aniversariantes cadastrados.',
  },
  reading_plan: {
    label: 'Plano de leitura',
    description: 'Lembra diariamente a leitura bíblica prevista para o dia.',
  },
  custom: {
    label: 'Mensagem programada',
    description: 'Envia uma mensagem fixa no horário definido.',
  },
};

const PLACEHOLDERS: Record<AutomationType, string[]> = {
  birthday: ['{{data}}', '{{dia_semana}}', '{{aniversariantes}}', '{{nomes}}', '{{quantidade}}'],
  reading_plan: ['{{data}}', '{{dia_semana}}', '{{leitura}}', '{{nome_plano}}'],
  custom: ['{{data}}', '{{dia_semana}}', '{{nome_automacao}}'],
};

const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function iconFor(type: AutomationType) {
  if (type === 'birthday') return <Cake />;
  if (type === 'reading_plan') return <BookOpen />;
  return <MessageSquareText />;
}

function statusText(status: string | null) {
  if (status === 'queued') return 'Aceita pela Evolution';
  if (status === 'failed') return 'Falha no último envio';
  if (status === 'skipped') return 'Executada sem envio';
  if (status === 'processing') return 'Em processamento';
  return 'Ainda não executada';
}

function formatDateTime(value: string | null) {
  if (!value) return 'Ainda não executada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

function previewMessage(automation: Automation, data: DashboardData) {
  const birthdayNames = data.today.birthdays.length
    ? data.today.birthdays.map((member) => `• *${member.name}*`).join('\n')
    : '• *Membro de teste*';
  const variables: Record<string, string> = {
    data: data.today.displayDate,
    dia_semana: data.today.weekday,
    aniversariantes: birthdayNames,
    nomes: data.today.birthdays.map((member) => member.name).join(', ') || 'Membro de teste',
    quantidade: String(data.today.birthdays.length || 1),
    leitura: data.today.reading || 'Leitura não cadastrada',
    nome_plano: automation.name,
    nome_automacao: automation.name,
  };

  return Object.entries(variables).reduce(
    (message, [key, value]) => message.replaceAll(`{{${key}}}`, value),
    automation.messageTemplate,
  );
}

function monthFromDate(date: string) {
  return /^2026-\d{2}/.test(date) ? date.slice(0, 7) : '2026-01';
}

export default function AutomacoesPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [selectedId, setSelectedId] = useState('birthdays');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [month, setMonth] = useState('2026-01');
  const [entries, setEntries] = useState<ReadingEntry[]>([]);
  const [readingLoading, setReadingLoading] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ReadingEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/automations', { cache: 'no-store' });
      const payload = (await response.json()) as DashboardData & { error?: string; details?: string };
      if (!response.ok) throw new Error(payload.details || payload.error || 'Não foi possível carregar.');
      setData(payload);

      const requested = new URLSearchParams(window.location.search).get('tab');
      const initial = payload.automations.find((item) => item.id === requested)
        ? requested!
        : payload.automations[0]?.id || 'birthdays';
      setSelectedId((current) =>
        payload.automations.some((item) => item.id === current) ? current : initial,
      );
      setMonth(monthFromDate(payload.today.date));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => data?.automations.find((automation) => automation.id === selectedId) || null,
    [data, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    setDraft({
      name: selected.name,
      enabled: selected.enabled,
      sendTime: selected.sendTime,
      groupId: selected.groupId,
      messageTemplate: selected.messageTemplate,
    });
    setMessage('');
    setError('');
  }, [selected]);

  const loadReadings = useCallback(async (targetMonth: string) => {
    setReadingLoading(true);
    try {
      const response = await fetch(`/api/automations/reading-plan?month=${targetMonth}`, {
        cache: 'no-store',
      });
      const payload = (await response.json()) as { entries?: ReadingEntry[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o plano.');
      setEntries(payload.entries || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar o plano.');
    } finally {
      setReadingLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected?.type === 'reading_plan') void loadReadings(month);
  }, [selected?.type, month, loadReadings]);

  async function saveAutomation() {
    if (!selected || !draft) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/automations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, ...draft }),
      });
      const payload = (await response.json()) as { automation?: Automation; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar.');
      const updatedAutomation = payload.automation;
      setData((current) =>
        current && updatedAutomation
          ? {
              ...current,
              automations: current.automations.map((item) =>
                item.id === updatedAutomation.id ? updatedAutomation : item,
              ),
            }
          : current,
      );
      setMessage('Configuração salva com sucesso.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (!selected) return;
    const confirmed = window.confirm(
      `Enviar uma mensagem de teste de “${selected.name}” para o grupo configurado?`,
    );
    if (!confirmed) return;

    setTesting(true);
    setError('');
    setMessage('');
    try {
      const saveResponse = await fetch('/api/automations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, ...draft }),
      });
      const saved = (await saveResponse.json()) as { automation?: Automation; error?: string };
      if (!saveResponse.ok) {
        throw new Error(saved.error || 'Salve uma configuração válida antes do teste.');
      }
      const savedAutomation = saved.automation;
      if (savedAutomation) {
        setData((current) =>
          current
            ? {
                ...current,
                automations: current.automations.map((item) =>
                  item.id === savedAutomation.id ? savedAutomation : item,
                ),
              }
            : current,
        );
      }

      const response = await fetch('/api/automations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ automationId: selected.id }),
      });
      const payload = (await response.json()) as { error?: string; status?: string };
      if (!response.ok) throw new Error(payload.error || 'O teste falhou.');
      setMessage(
        payload.status === 'queued'
          ? 'Teste aceito pela Evolution. Confira a mensagem no grupo.'
          : 'Teste concluído sem envio.',
      );
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'O teste falhou.');
    } finally {
      setTesting(false);
    }
  }

  async function deleteAutomation() {
    if (!selected?.canDelete) return;
    if (!window.confirm(`Excluir definitivamente a automação “${selected.name}”?`)) return;

    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/automations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível excluir.');
      await load();
      setMessage('Automação excluída.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível excluir.');
    } finally {
      setSaving(false);
    }
  }

  async function saveReadingEntry(reference: string) {
    if (!editingEntry) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/automations/reading-plan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: editingEntry.reading_date, reference }),
      });
      const payload = (await response.json()) as { entry?: ReadingEntry; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível atualizar.');
      const updatedEntry = payload.entry;
      if (updatedEntry) {
        setEntries((current) =>
          current.map((entry) =>
            entry.reading_date === updatedEntry.reading_date ? updatedEntry : entry,
          ),
        );
      }
      setEditingEntry(null);
      setMessage('Leitura atualizada.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível atualizar.');
    } finally {
      setSaving(false);
    }
  }

  function moveMonth(direction: -1 | 1) {
    const [year, monthNumber] = month.split('-').map(Number);
    const next = new Date(Date.UTC(year, monthNumber - 1 + direction, 1));
    if (next.getUTCFullYear() !== 2026) return;
    setMonth(next.toISOString().slice(0, 7));
  }

  if (loading) {
    return (
      <main className="automation-page automation-loading">
        <LoaderCircle className="spin" />
        <strong>Carregando automações...</strong>
      </main>
    );
  }

  if (!data || !selected || !draft) {
    return (
      <main className="automation-page automation-loading">
        <strong>Não foi possível abrir as automações.</strong>
        {error && <p>{error}</p>}
        <button type="button" onClick={() => void load()}>Tentar novamente</button>
      </main>
    );
  }

  const selectedHistory = data.history.filter((item) => item.automation_id === selected.id);
  const currentMonthNumber = Number(month.slice(5, 7));
  const preview = previewMessage({ ...selected, ...draft }, data);

  return (
    <main className="automation-page">
      <header className="automation-topbar">
        <div className="automation-heading">
          <Link href="/" aria-label="Voltar ao painel"><ArrowLeft /></Link>
          <div>
            <span>CEAMI MEMBROS</span>
            <h1>Automações</h1>
            <p>Controle os lembretes enviados pelo WhatsApp da igreja.</p>
          </div>
        </div>
        <button type="button" className="automation-new" onClick={() => setCreateOpen(true)}>
          <Plus /> Nova automação
        </button>
      </header>

      {!data.evolution.configured && (
        <div className="automation-alert error">
          A Evolution não está completamente configurada na Vercel. Os envios ficarão bloqueados.
        </div>
      )}
      {message && <div className="automation-alert success"><Check />{message}</div>}
      {error && <div className="automation-alert error">{error}</div>}

      <section className="automation-summary">
        <article>
          <span><Workflow /></span>
          <div><small>Automações ativas</small><strong>{data.automations.filter((item) => item.enabled).length}</strong></div>
        </article>
        <article>
          <span><Send /></span>
          <div><small>Instância conectada</small><strong>{data.evolution.instance || 'Não configurada'}</strong></div>
        </article>
        <article>
          <span><CalendarDays /></span>
          <div><small>Leitura de hoje</small><strong>{data.today.reading || 'Não cadastrada'}</strong></div>
        </article>
      </section>

      <div className="automation-layout">
        <aside className="automation-list">
          <div className="automation-list-title">
            <span>SUAS AUTOMAÇÕES</span>
            <strong>{data.automations.length}</strong>
          </div>
          {data.automations.map((automation) => (
            <button
              type="button"
              key={automation.id}
              className={automation.id === selected.id ? 'active' : ''}
              onClick={() => setSelectedId(automation.id)}
            >
              <span className="automation-list-icon">{iconFor(automation.type)}</span>
              <span className="automation-list-copy">
                <strong>{automation.name}</strong>
                <small>{automation.sendTime} · {automation.enabled ? 'Ativa' : 'Pausada'}</small>
              </span>
              <i className={automation.enabled ? 'on' : ''} />
            </button>
          ))}
          <button type="button" className="automation-add-card" onClick={() => setCreateOpen(true)}>
            <Plus /> Criar outra automação
          </button>
        </aside>

        <section className="automation-workspace">
          <header className="automation-detail-header">
            <div className="automation-detail-icon">{iconFor(selected.type)}</div>
            <div>
              <span>{TYPE_INFO[selected.type].label.toUpperCase()}</span>
              <h2>{selected.name}</h2>
              <p>{TYPE_INFO[selected.type].description}</p>
            </div>
            <label className={`automation-switch ${draft.enabled ? 'checked' : ''}`}>
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
              />
              <i><span /></i>
              {draft.enabled ? 'Ativa' : 'Pausada'}
            </label>
          </header>

          <div className="automation-status-grid">
            <article>
              <Clock3 />
              <div><small>Horário diário</small><strong>{draft.sendTime}</strong></div>
            </article>
            <article>
              <History />
              <div><small>Última execução</small><strong>{formatDateTime(selected.lastSentAt)}</strong></div>
            </article>
            <article className={selected.lastStatus === 'failed' ? 'failed' : ''}>
              <Bot />
              <div><small>Status</small><strong>{statusText(selected.lastStatus)}</strong></div>
            </article>
          </div>

          <div className="automation-form-grid">
            <section className="automation-card">
              <div className="automation-card-title">
                <Settings2 />
                <div><h3>Configuração</h3><p>Defina horário, destino e conteúdo.</p></div>
              </div>

              <div className="automation-two-fields">
                <label>
                  <span>Nome da automação</span>
                  <input
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                </label>
                <label>
                  <span>Horário de envio</span>
                  <input
                    type="time"
                    value={draft.sendTime}
                    onChange={(event) => setDraft({ ...draft, sendTime: event.target.value })}
                  />
                </label>
              </div>

              <label>
                <span>ID do grupo no WhatsApp</span>
                <input
                  value={draft.groupId}
                  onChange={(event) => setDraft({ ...draft, groupId: event.target.value })}
                  placeholder="120000000000000000@g.us"
                />
                <small>O identificador precisa terminar em @g.us.</small>
              </label>

              <label>
                <span>Mensagem enviada</span>
                <textarea
                  value={draft.messageTemplate}
                  onChange={(event) => setDraft({ ...draft, messageTemplate: event.target.value })}
                  rows={12}
                />
              </label>

              <div className="automation-placeholders">
                <small>Variáveis disponíveis</small>
                <div>
                  {PLACEHOLDERS[selected.type].map((placeholder) => (
                    <button
                      type="button"
                      key={placeholder}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          messageTemplate: `${draft.messageTemplate}${draft.messageTemplate.endsWith(' ') || draft.messageTemplate.endsWith('\n') ? '' : ' '}${placeholder}`,
                        })
                      }
                    >
                      {placeholder}
                    </button>
                  ))}
                </div>
              </div>

              <div className="automation-actions">
                {selected.canDelete && (
                  <button type="button" className="danger" onClick={() => void deleteAutomation()}>
                    <Trash2 /> Excluir
                  </button>
                )}
                <button type="button" className="secondary" disabled={testing} onClick={() => void sendTest()}>
                  {testing ? <LoaderCircle className="spin" /> : <Play />} Enviar teste
                </button>
                <button type="button" className="primary" disabled={saving} onClick={() => void saveAutomation()}>
                  {saving ? <LoaderCircle className="spin" /> : <Save />} Salvar alterações
                </button>
              </div>
            </section>

            <aside className="automation-card automation-preview">
              <div className="automation-card-title">
                <MessageSquareText />
                <div><h3>Prévia da mensagem</h3><p>Exemplo com os dados de hoje.</p></div>
              </div>
              <div className="automation-phone">
                <header><span>Comunidade CEAMI</span><small>WhatsApp</small></header>
                <div><p>{preview}</p><small>{draft.sendTime}</small></div>
              </div>
              {selected.lastError && (
                <div className="automation-last-error">
                  <strong>Último erro</strong>
                  <p>{selected.lastError}</p>
                </div>
              )}
            </aside>
          </div>

          {selected.type === 'reading_plan' && (
            <section className="automation-card automation-calendar-card">
              <div className="automation-calendar-header">
                <div className="automation-card-title">
                  <CalendarDays />
                  <div><h3>Calendário do plano</h3><p>Clique em uma leitura para fazer uma correção.</p></div>
                </div>
                <div className="automation-month-controls">
                  <button type="button" onClick={() => moveMonth(-1)} disabled={month === '2026-01'}><ChevronLeft /></button>
                  <strong>{MONTHS[currentMonthNumber - 1]} de 2026</strong>
                  <button type="button" onClick={() => moveMonth(1)} disabled={month === '2026-12'}><ChevronRight /></button>
                </div>
              </div>
              {readingLoading ? (
                <div className="automation-calendar-loading"><LoaderCircle className="spin" />Carregando plano...</div>
              ) : (
                <ReadingCalendar
                  month={month}
                  entries={entries}
                  today={data.today.date}
                  onEdit={setEditingEntry}
                />
              )}
            </section>
          )}

          <section className="automation-card automation-history-card">
            <div className="automation-card-title">
              <History />
              <div><h3>Histórico de execuções</h3><p>Últimas tentativas desta automação.</p></div>
            </div>
            <div className="automation-history-list">
              {selectedHistory.length ? (
                selectedHistory.slice(0, 15).map((item) => (
                  <article key={item.id}>
                    <span className={`automation-run-status ${item.status}`}>
                      {item.status === 'queued' ? <Check /> : item.status === 'failed' ? <X /> : <Clock3 />}
                    </span>
                    <div>
                      <strong>{item.run_type === 'manual' ? 'Teste manual' : 'Execução automática'}</strong>
                      <small>{formatDateTime(item.created_at)} · {item.destination_group_id}</small>
                      {item.error_message && <p>{item.error_message}</p>}
                    </div>
                    <b>{item.status === 'queued' ? 'Aceita' : item.status === 'failed' ? 'Falhou' : 'Sem envio'}</b>
                  </article>
                ))
              ) : (
                <div className="automation-empty-history">Nenhuma execução registrada ainda.</div>
              )}
            </div>
          </section>
        </section>
      </div>

      {createOpen && (
        <CreateAutomationModal
          defaultGroupId={data.evolution.defaultGroupId || selected.groupId}
          onClose={() => setCreateOpen(false)}
          onCreated={async (automation) => {
            setCreateOpen(false);
            await load();
            setSelectedId(automation.id);
            setMessage('Nova automação criada. Ela começa pausada para revisão.');
          }}
        />
      )}

      {editingEntry && (
        <EditReadingModal
          entry={editingEntry}
          saving={saving}
          onClose={() => setEditingEntry(null)}
          onSave={saveReadingEntry}
        />
      )}
    </main>
  );
}

function ReadingCalendar({ month, entries, today, onEdit }: {
  month: string;
  entries: ReadingEntry[];
  today: string;
  onEdit: (entry: ReadingEntry) => void;
}) {
  const [year, monthNumber] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const byDate = new Map(entries.map((entry) => [entry.reading_date, entry]));
  const cells: Array<ReadingEntry | null> = Array.from({ length: firstWeekday }, () => null);

  for (let day = 1; day <= days; day += 1) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    cells.push(byDate.get(date) || { reading_date: date, reference: 'Não cadastrada' });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="reading-calendar">
      <div className="reading-weekdays">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="reading-grid">
        {cells.map((entry, index) =>
          entry ? (
            <button
              type="button"
              key={entry.reading_date}
              className={entry.reading_date === today ? 'today' : ''}
              onClick={() => onEdit(entry)}
            >
              <span>{Number(entry.reading_date.slice(-2))}</span>
              <strong>{entry.reference}</strong>
              <Pencil />
            </button>
          ) : <i key={`empty-${index}`} />,
        )}
      </div>
    </div>
  );
}

function CreateAutomationModal({ defaultGroupId, onClose, onCreated }: {
  defaultGroupId: string;
  onClose: () => void;
  onCreated: (automation: Automation) => void;
}) {
  const [name, setName] = useState('');
  const [sendTime, setSendTime] = useState('19:00');
  const [groupId, setGroupId] = useState(defaultGroupId);
  const [messageTemplate, setMessageTemplate] = useState('📢 *{{nome_automacao}}*\n\nEscreva aqui a mensagem que será enviada em {{data}}.');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, sendTime, groupId, messageTemplate }),
      });
      const payload = (await response.json()) as { automation?: Automation; error?: string };
      if (!response.ok || !payload.automation) {
        throw new Error(payload.error || 'Não foi possível criar.');
      }
      onCreated(payload.automation);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível criar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="automation-modal-overlay" onMouseDown={onClose}>
      <section className="automation-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span>NOVA AUTOMAÇÃO</span><h2>Mensagem programada</h2><p>Ela será criada pausada para você revisar antes de ativar.</p></div>
          <button type="button" onClick={onClose}><X /></button>
        </header>
        <div className="automation-modal-body">
          <label><span>Nome</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Lembrete do culto" /></label>
          <div className="automation-two-fields">
            <label><span>Horário</span><input type="time" value={sendTime} onChange={(event) => setSendTime(event.target.value)} /></label>
            <label><span>ID do grupo</span><input value={groupId} onChange={(event) => setGroupId(event.target.value)} /></label>
          </div>
          <label><span>Mensagem</span><textarea rows={9} value={messageTemplate} onChange={(event) => setMessageTemplate(event.target.value)} /></label>
          {error && <div className="automation-alert error">{error}</div>}
        </div>
        <footer>
          <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="primary" disabled={saving} onClick={() => void create()}>{saving ? <LoaderCircle className="spin" /> : <Plus />}Criar automação</button>
        </footer>
      </section>
    </div>
  );
}

function EditReadingModal({ entry, saving, onClose, onSave }: {
  entry: ReadingEntry;
  saving: boolean;
  onClose: () => void;
  onSave: (reference: string) => void;
}) {
  const [reference, setReference] = useState(entry.reference === 'Não cadastrada' ? '' : entry.reference);
  const displayDate = entry.reading_date.split('-').reverse().join('/');

  return (
    <div className="automation-modal-overlay" onMouseDown={onClose}>
      <section className="automation-modal small" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span>PLANO DE LEITURA</span><h2>Editar {displayDate}</h2><p>Corrija somente a leitura prevista para esta data.</p></div>
          <button type="button" onClick={onClose}><X /></button>
        </header>
        <div className="automation-modal-body">
          <label><span>Livros e capítulos</span><input autoFocus value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Ex.: Isaías 55 a 57" /></label>
        </div>
        <footer>
          <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="primary" disabled={saving || !reference.trim()} onClick={() => onSave(reference)}>{saving ? <LoaderCircle className="spin" /> : <Save />}Salvar leitura</button>
        </footer>
      </section>
    </div>
  );
}
