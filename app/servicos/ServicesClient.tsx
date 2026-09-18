'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ClipboardList,
  Copy,
  ExternalLink,
  Eye,
  LoaderCircle,
  MessageCircle,
  Plus,
  Save,
  Search,
  Settings2,
  Trash2,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  DEFAULT_SERVICE_DESCRIPTION,
  defaultServiceSettings,
  parseServiceSettings,
  serializeServiceSettings,
  SERVICE_FORM_SLUG,
  serviceStatusFromAnswers,
  type ServiceRequestStatus,
  type ServiceSettings,
} from '@/lib/services';

type FieldType = 'text' | 'phone' | 'email' | 'textarea' | 'yes_no' | 'select';

type FormRow = {
  id: string;
  title: string;
  slug: string;
  description: string;
  event_details: string;
  active: boolean;
  created_at: string;
};

type FieldRow = {
  id: string;
  form_id: string;
  key: string;
  label: string;
  field_type: FieldType;
  required: boolean;
  placeholder: string;
  options: unknown;
  sort_order: number;
};

type SubmissionRow = {
  id: string;
  form_id: string;
  respondent_name: string | null;
  respondent_phone: string | null;
  answers: Record<string, unknown>;
  created_at: string;
};

type FieldDraft = {
  localId: string;
  key: string;
  label: string;
  field_type: FieldType;
  required: boolean;
  placeholder: string;
  optionsText: string;
};

const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: 'text', label: 'Texto curto' },
  { value: 'phone', label: 'Telefone / WhatsApp' },
  { value: 'email', label: 'E-mail' },
  { value: 'textarea', label: 'Texto longo' },
  { value: 'yes_no', label: 'Sim / Não' },
  { value: 'select', label: 'Lista de opções' },
];

const DEFAULT_FIELDS: Array<Omit<FieldDraft, 'localId'>> = [
  {
    key: 'nome_completo',
    label: 'Nome completo',
    field_type: 'text',
    required: true,
    placeholder: 'Seu nome completo',
    optionsText: '',
  },
  {
    key: 'telefone',
    label: 'Telefone / WhatsApp',
    field_type: 'phone',
    required: true,
    placeholder: '(51) 99999-9999',
    optionsText: '',
  },
  {
    key: 'tipo_servico',
    label: 'Que serviço você precisa?',
    field_type: 'text',
    required: true,
    placeholder: 'Ex.: conserto de telhado, pintura, elétrica...',
    optionsText: '',
  },
  {
    key: 'descricao',
    label: 'Descreva o que precisa ser feito',
    field_type: 'textarea',
    required: true,
    placeholder: 'Conte o problema, urgência e outras informações importantes.',
    optionsText: '',
  },
  {
    key: 'localidade',
    label: 'Bairro / cidade',
    field_type: 'text',
    required: false,
    placeholder: 'Ex.: Centro - Sapucaia do Sul',
    optionsText: '',
  },
];

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function newField(label = 'Novo campo'): FieldDraft {
  return {
    localId: crypto.randomUUID(),
    key: '',
    label,
    field_type: 'text',
    required: false,
    placeholder: '',
    optionsText: '',
  };
}

function optionsToText(value: unknown) {
  return Array.isArray(value) ? value.map(String).join('; ') : '';
}

function parseOptions(value: string) {
  return value
    .split(/[;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function answerText(value: unknown) {
  const text = String(value ?? '').trim();
  return text || 'Não informado';
}

function statusLabel(status: ServiceRequestStatus) {
  if (status === 'concluido') return 'Concluído';
  if (status === 'cancelado') return 'Cancelado';
  return 'Aberto';
}

function digits(value: string | null | undefined) {
  return String(value || '').replace(/\D/g, '');
}

export default function ServicesClient() {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<'form' | 'requests'>('form');
  const [form, setForm] = useState<FormRow | null>(null);
  const [fields, setFields] = useState<FieldDraft[]>([]);
  const [settings, setSettings] = useState<ServiceSettings>(defaultServiceSettings());
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | ServiceRequestStatus>('todos');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function ensureServiceForm() {
    const { data: existing, error: existingError } = await supabase
      .from('forms')
      .select('*')
      .eq('slug', SERVICE_FORM_SLUG)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) return existing as FormRow;

    const initialSettings = defaultServiceSettings();
    const { data: created, error: createError } = await supabase
      .from('forms')
      .insert({
        title: 'Solicite um serviço',
        slug: SERVICE_FORM_SLUG,
        description: DEFAULT_SERVICE_DESCRIPTION,
        event_details: serializeServiceSettings(initialSettings),
        price: null,
        active: true,
      })
      .select('*')
      .single();

    if (createError || !created) throw createError || new Error('Não foi possível criar o formulário.');

    const rows = DEFAULT_FIELDS.map((field, index) => ({
      form_id: created.id,
      key: field.key,
      label: field.label,
      field_type: field.field_type,
      required: field.required,
      placeholder: field.placeholder,
      options: [],
      sort_order: index + 1,
    }));

    const { error: fieldError } = await supabase.from('form_fields').insert(rows);
    if (fieldError) throw fieldError;

    return created as FormRow;
  }

  async function load() {
    setLoading(true);
    setError('');

    try {
      const currentForm = await ensureServiceForm();
      setForm(currentForm);
      setSettings(parseServiceSettings(currentForm.event_details));

      const [fieldsResult, submissionsResult] = await Promise.all([
        supabase
          .from('form_fields')
          .select('*')
          .eq('form_id', currentForm.id)
          .order('sort_order', { ascending: true }),
        supabase
          .from('form_submissions')
          .select('*')
          .eq('form_id', currentForm.id)
          .order('created_at', { ascending: false }),
      ]);

      if (fieldsResult.error) throw fieldsResult.error;
      if (submissionsResult.error) throw submissionsResult.error;

      const loadedFields = ((fieldsResult.data || []) as FieldRow[]).map((field) => ({
        localId: field.id,
        key: field.key,
        label: field.label,
        field_type: field.field_type,
        required: field.required,
        placeholder: field.placeholder || '',
        optionsText: optionsToText(field.options),
      }));

      setFields(
        loadedFields.length
          ? loadedFields
          : DEFAULT_FIELDS.map((field) => ({ ...field, localId: crypto.randomUUID() })),
      );
      setSubmissions((submissionsResult.data || []) as SubmissionRow[]);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Falha ao carregar CEAMI Serviços.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function updateField(localId: string, patch: Partial<FieldDraft>) {
    setFields((current) =>
      current.map((field) => (field.localId === localId ? { ...field, ...patch } : field)),
    );
  }

  function moveField(localId: string, direction: -1 | 1) {
    setFields((current) => {
      const index = current.findIndex((field) => field.localId === localId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeField(localId: string) {
    setFields((current) => current.filter((field) => field.localId !== localId));
  }

  async function saveForm() {
    if (!form || saving) return;

    const cleanFields = fields
      .map((field, index) => {
        const label = field.label.trim();
        const key =
          field.key.trim() ||
          slugify(label) ||
          `campo_${index + 1}`;
        return {
          ...field,
          label,
          key,
        };
      })
      .filter((field) => field.label);

    if (!cleanFields.length) {
      setError('Adicione pelo menos um campo ao formulário.');
      return;
    }

    const keys = cleanFields.map((field) => field.key);
    if (new Set(keys).size !== keys.length) {
      setError('Existem campos duplicados. Renomeie um deles.');
      return;
    }

    setSaving(true);
    setError('');

    const { error: formError } = await supabase
      .from('forms')
      .update({
        title: form.title.trim() || 'Solicite um serviço',
        description: form.description.trim(),
        event_details: serializeServiceSettings(settings),
        active: form.active,
      })
      .eq('id', form.id);

    if (formError) {
      setError(formError.message);
      setSaving(false);
      return;
    }

    const { error: deleteError } = await supabase
      .from('form_fields')
      .delete()
      .eq('form_id', form.id);

    if (deleteError) {
      setError(deleteError.message);
      setSaving(false);
      return;
    }

    const rows = cleanFields.map((field, index) => ({
      form_id: form.id,
      key: field.key,
      label: field.label,
      field_type: field.field_type,
      required: field.required,
      placeholder: field.placeholder,
      options:
        field.field_type === 'select'
          ? parseOptions(field.optionsText)
          : [],
      sort_order: index + 1,
    }));

    const { error: insertError } = await supabase.from('form_fields').insert(rows);
    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setFields(cleanFields);
    setSaving(false);
    setToast('Configurações salvas.');
    await load();
  }

  async function copyPublicLink() {
    const url = `${window.location.origin}/servicos/solicitar`;
    await navigator.clipboard.writeText(url);
    setToast('Link público copiado.');
  }

  async function updateStatus(submissionId: string, status: ServiceRequestStatus) {
    if (updatingStatusId) return;
    setUpdatingStatusId(submissionId);

    const response = await fetch('/api/admin/services/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId, status }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setError(payload.error || 'Não foi possível atualizar o status.');
      setUpdatingStatusId(null);
      return;
    }

    setSubmissions((current) =>
      current.map((submission) =>
        submission.id === submissionId
          ? {
              ...submission,
              answers: {
                ...(submission.answers || {}),
                __service_status: status,
              },
            }
          : submission,
      ),
    );
    setUpdatingStatusId(null);
    setToast(`Solicitação marcada como ${statusLabel(status).toLowerCase()}.`);
  }

  const filteredSubmissions = submissions.filter((submission) => {
    const status = serviceStatusFromAnswers(submission.answers);
    if (statusFilter !== 'todos' && status !== statusFilter) return false;

    if (!query.trim()) return true;
    const haystack = normalize(
      [
        submission.respondent_name,
        submission.respondent_phone,
        ...Object.entries(submission.answers || {})
          .filter(([key]) => !key.startsWith('__'))
          .map(([, value]) => value),
      ].join(' '),
    );
    return haystack.includes(normalize(query));
  });

  const selected = submissions.find((submission) => submission.id === selectedId) || null;
  const selectedStatus = selected ? serviceStatusFromAnswers(selected.answers) : 'aberto';

  const counts = submissions.reduce(
    (acc, submission) => {
      acc[serviceStatusFromAnswers(submission.answers)] += 1;
      return acc;
    },
    { aberto: 0, concluido: 0, cancelado: 0 },
  );

  if (loading) {
    return (
      <main className="services-admin-page services-admin-center">
        <LoaderCircle className="services-spin" />
        <p>Carregando CEAMI Serviços...</p>
      </main>
    );
  }

  if (!form) {
    return (
      <main className="services-admin-page">
        <div className="services-admin-error">
          <XCircle />
          <div>
            <strong>Não foi possível abrir o módulo.</strong>
            <p>{error || 'Tente novamente.'}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="services-admin-page">
      <header className="services-admin-header">
        <div>
          <span>CEAMI MEMBROS</span>
          <h1><Wrench /> Serviços</h1>
          <p>Receba pedidos da comunidade e acompanhe o que já foi atendido.</p>
        </div>
        <div className="services-admin-header-actions">
          <button type="button" onClick={() => void copyPublicLink()}>
            <Copy size={17} />
            Copiar link
          </button>
          <a href="/servicos/solicitar" target="_blank" rel="noreferrer">
            <ExternalLink size={17} />
            Abrir formulário
          </a>
        </div>
      </header>

      <nav className="services-tabs" aria-label="Áreas de Serviços">
        <button
          type="button"
          className={tab === 'form' ? 'active' : ''}
          onClick={() => setTab('form')}
        >
          <Settings2 size={18} />
          Formulário
        </button>
        <button
          type="button"
          className={tab === 'requests' ? 'active' : ''}
          onClick={() => setTab('requests')}
        >
          <ClipboardList size={18} />
          Serviços solicitados
          <span>{counts.aberto}</span>
        </button>
      </nav>

      {error && (
        <div className="services-admin-error compact">
          <XCircle size={19} />
          <span>{error}</span>
          <button type="button" onClick={() => setError('')}><X size={16} /></button>
        </div>
      )}

      {tab === 'form' ? (
        <section className="services-form-layout">
          <div className="services-panel">
            <div className="services-panel-heading">
              <div>
                <span>CONFIGURAÇÃO</span>
                <h2>Formulário público</h2>
                <p>Edite os textos e os campos sem precisar alterar o código.</p>
              </div>
              <label className="services-switch">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, active: event.target.checked } : current,
                    )
                  }
                />
                <span />
                {form.active ? 'Publicado' : 'Pausado'}
              </label>
            </div>

            <div className="services-settings-grid">
              <label>
                <span>Título</span>
                <input
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, title: event.target.value } : current,
                    )
                  }
                />
              </label>
              <label className="wide">
                <span>Texto de apresentação</span>
                <textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, description: event.target.value } : current,
                    )
                  }
                />
              </label>
              <label>
                <span>WhatsApp que recebe novas solicitações</span>
                <input
                  inputMode="tel"
                  placeholder="(51) 99999-9999"
                  value={settings.notifyPhone}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      notifyPhone: event.target.value,
                    }))
                  }
                />
                <small>Por enquanto pode ser o seu número. Depois trocamos pelo grupo.</small>
              </label>
              <label className="wide">
                <span>Aviso de responsabilidade</span>
                <textarea
                  className="tall"
                  value={settings.disclaimer}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      disclaimer: event.target.value,
                    }))
                  }
                />
                <small>Esse texto aparece antes do botão de envio e exige confirmação.</small>
              </label>
            </div>
          </div>

          <div className="services-panel">
            <div className="services-panel-heading">
              <div>
                <span>CAMPOS</span>
                <h2>O que será perguntado</h2>
                <p>Adicione, remova, ordene e escolha quais campos são obrigatórios.</p>
              </div>
              <button
                type="button"
                className="services-add-field"
                onClick={() => setFields((current) => [...current, newField()])}
              >
                <Plus size={17} />
                Adicionar campo
              </button>
            </div>

            <div className="services-fields-editor">
              {fields.map((field, index) => (
                <article className="services-field-editor" key={field.localId}>
                  <div className="services-field-order">
                    <strong>{index + 1}</strong>
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveField(field.localId, -1)}
                      aria-label="Mover campo para cima"
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      type="button"
                      disabled={index === fields.length - 1}
                      onClick={() => moveField(field.localId, 1)}
                      aria-label="Mover campo para baixo"
                    >
                      <ArrowDown size={15} />
                    </button>
                  </div>

                  <div className="services-field-editor-main">
                    <div className="services-field-editor-grid">
                      <label className="wide">
                        <span>Pergunta / rótulo</span>
                        <input
                          value={field.label}
                          onChange={(event) =>
                            updateField(field.localId, { label: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        <span>Tipo</span>
                        <select
                          value={field.field_type}
                          onChange={(event) =>
                            updateField(field.localId, {
                              field_type: event.target.value as FieldType,
                            })
                          }
                        >
                          {FIELD_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="wide">
                        <span>Texto de exemplo</span>
                        <input
                          value={field.placeholder}
                          onChange={(event) =>
                            updateField(field.localId, { placeholder: event.target.value })
                          }
                        />
                      </label>
                      {field.field_type === 'select' && (
                        <label className="wide">
                          <span>Opções</span>
                          <textarea
                            value={field.optionsText}
                            placeholder="Elétrica; Pintura; Construção; Limpeza; Outro"
                            onChange={(event) =>
                              updateField(field.localId, { optionsText: event.target.value })
                            }
                          />
                          <small>Separe as opções por ponto e vírgula ou por linha.</small>
                        </label>
                      )}
                    </div>

                    <div className="services-field-editor-footer">
                      <label className="services-required">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(event) =>
                            updateField(field.localId, { required: event.target.checked })
                          }
                        />
                        Campo obrigatório
                      </label>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => removeField(field.localId)}
                      >
                        <Trash2 size={16} />
                        Remover
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="services-save-bar">
            <div>
              <strong>Link público</strong>
              <code>/servicos/solicitar</code>
            </div>
            <button type="button" disabled={saving} onClick={() => void saveForm()}>
              {saving ? <LoaderCircle className="services-spin" size={18} /> : <Save size={18} />}
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </section>
      ) : (
        <section className="services-requests-section">
          <div className="services-summary">
            <div>
              <span>Abertos</span>
              <strong>{counts.aberto}</strong>
            </div>
            <div>
              <span>Concluídos</span>
              <strong>{counts.concluido}</strong>
            </div>
            <div>
              <span>Total</span>
              <strong>{submissions.length}</strong>
            </div>
          </div>

          <div className="services-request-toolbar">
            <label>
              <Search size={17} />
              <input
                placeholder="Buscar por nome, telefone ou serviço..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div>
              {([
                ['todos', 'Todos'],
                ['aberto', 'Abertos'],
                ['concluido', 'Concluídos'],
                ['cancelado', 'Cancelados'],
              ] as const).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={statusFilter === value ? 'active' : ''}
                  onClick={() => setStatusFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filteredSubmissions.length ? (
            <div className="services-request-list">
              {filteredSubmissions.map((submission) => {
                const status = serviceStatusFromAnswers(submission.answers);
                const phone = submission.respondent_phone || '';
                const phoneDigits = digits(phone);
                const serviceName =
                  String(submission.answers?.tipo_servico || '').trim() ||
                  Object.entries(submission.answers || {})
                    .filter(([key, value]) => !key.startsWith('__') && String(value || '').trim())
                    .map(([, value]) => String(value))
                    .find((value) => value !== submission.respondent_name && value !== phone) ||
                  'Solicitação de serviço';
                const protocol = submission.id.slice(0, 8).toUpperCase();

                return (
                  <article className="services-request-card" key={submission.id}>
                    <div className="services-request-status-col">
                      <span className={`services-status ${status}`}>{statusLabel(status)}</span>
                      <small>{protocol}</small>
                    </div>

                    <div className="services-request-main">
                      <div>
                        <h3>{submission.respondent_name || 'Solicitante'}</h3>
                        <span>{phone || 'Telefone não informado'}</span>
                      </div>
                      <strong>{serviceName}</strong>
                      <p>{new Date(submission.created_at).toLocaleString('pt-BR')}</p>
                    </div>

                    <div className="services-request-actions">
                      {phoneDigits && (
                        <a
                          href={`https://wa.me/${phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MessageCircle size={16} />
                          WhatsApp
                        </a>
                      )}
                      <button type="button" onClick={() => setSelectedId(submission.id)}>
                        <Eye size={16} />
                        Ver detalhes
                      </button>
                      {status !== 'concluido' ? (
                        <button
                          type="button"
                          className="complete"
                          disabled={updatingStatusId === submission.id}
                          onClick={() => void updateStatus(submission.id, 'concluido')}
                        >
                          <CheckCircle2 size={16} />
                          Concluir
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={updatingStatusId === submission.id}
                          onClick={() => void updateStatus(submission.id, 'aberto')}
                        >
                          Reabrir
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="services-empty">
              <Search size={34} />
              <h3>Nenhuma solicitação encontrada</h3>
              <p>Quando alguém preencher o formulário, o pedido aparecerá aqui.</p>
            </div>
          )}
        </section>
      )}

      {selected && (
        <div
          className="services-modal-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setSelectedId(null);
          }}
        >
          <section className="services-modal" role="dialog" aria-modal="true">
            <header>
              <div>
                <span className={`services-status ${selectedStatus}`}>
                  {statusLabel(selectedStatus)}
                </span>
                <h2>{selected.respondent_name || 'Solicitação de serviço'}</h2>
                <p>Protocolo {selected.id.slice(0, 8).toUpperCase()}</p>
              </div>
              <button type="button" onClick={() => setSelectedId(null)} aria-label="Fechar">
                <X />
              </button>
            </header>

            <div className="services-modal-grid">
              {fields.map((field) => (
                <div key={field.localId}>
                  <span>{field.label}</span>
                  <strong>{answerText(selected.answers?.[field.key])}</strong>
                </div>
              ))}
            </div>

            <footer>
              {selectedStatus !== 'cancelado' && (
                <button
                  type="button"
                  className="danger"
                  disabled={updatingStatusId === selected.id}
                  onClick={() => void updateStatus(selected.id, 'cancelado')}
                >
                  <XCircle size={17} />
                  Cancelar solicitação
                </button>
              )}
              {selectedStatus !== 'concluido' && (
                <button
                  type="button"
                  className="complete"
                  disabled={updatingStatusId === selected.id}
                  onClick={() => void updateStatus(selected.id, 'concluido')}
                >
                  <CheckCircle2 size={17} />
                  Marcar como concluído
                </button>
              )}
              {selectedStatus !== 'aberto' && (
                <button
                  type="button"
                  disabled={updatingStatusId === selected.id}
                  onClick={() => void updateStatus(selected.id, 'aberto')}
                >
                  Reabrir
                </button>
              )}
            </footer>
          </section>
        </div>
      )}

      {toast && <div className="services-toast">{toast}</div>}
    </main>
  );
}
