'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  FilePlus2,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type FieldType = 'text' | 'phone' | 'email' | 'textarea' | 'yes_no' | 'select';

type FormRow = {
  id: string;
  title: string;
  slug: string;
  description: string;
  event_details: string;
  price: number | string | null;
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

type FormDraft = {
  id: string | null;
  title: string;
  slug: string;
  description: string;
  eventDetails: string;
  price: string;
  active: boolean;
  fields: FieldDraft[];
};

const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: 'text', label: 'Texto curto' },
  { value: 'phone', label: 'Telefone / WhatsApp' },
  { value: 'email', label: 'E-mail' },
  { value: 'textarea', label: 'Texto longo' },
  { value: 'yes_no', label: 'Sim / Não' },
  { value: 'select', label: 'Lista de opções' },
];

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function fieldKey(value: string, index: number) {
  const base = slugify(value).replace(/-/g, '_');
  return base || `campo_${index + 1}`;
}

function newField(label = ''): FieldDraft {
  return {
    localId: crypto.randomUUID(),
    key: '',
    label,
    field_type: 'text',
    required: true,
    placeholder: '',
    optionsText: '',
  };
}

function blankDraft(): FormDraft {
  return {
    id: null,
    title: '',
    slug: '',
    description: '',
    eventDetails: '',
    price: '',
    active: true,
    fields: [
      { ...newField('Nome completo'), key: 'nome_completo' },
      { ...newField('Telefone / WhatsApp'), key: 'telefone', field_type: 'phone' },
    ],
  };
}

function optionsText(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).join(', ') : '';
}

function csvEscape(value: unknown) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export default function FormulariosClient() {
  const supabase = useMemo(() => createClient(), []);
  const [forms, setForms] = useState<FormRow[]>([]);
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState('');
  const [draft, setDraft] = useState<FormDraft | null>(null);
  const [responsesFormId, setResponsesFormId] = useState<string | null>(null);

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function loadData() {
    setLoading(true);
    setLoadError('');

    const [formsResult, fieldsResult, submissionsResult] = await Promise.all([
      supabase.from('forms').select('*').order('created_at', { ascending: false }),
      supabase.from('form_fields').select('*').order('sort_order', { ascending: true }),
      supabase.from('form_submissions').select('*').order('created_at', { ascending: false }),
    ]);

    if (formsResult.error) {
      setLoadError(
        formsResult.error.code === '42P01'
          ? 'A estrutura de Formulários ainda não foi criada no Supabase. Execute a migration 202608310001_dynamic_forms.sql.'
          : `Não foi possível carregar os formulários: ${formsResult.error.message}`,
      );
      setLoading(false);
      return;
    }

    setForms((formsResult.data || []) as FormRow[]);
    setFields((fieldsResult.data || []) as FieldRow[]);
    setSubmissions((submissionsResult.data || []) as SubmissionRow[]);
    setLoading(false);
  }

  function editForm(form: FormRow) {
    const formFields = fields
      .filter((field) => field.form_id === form.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((field) => ({
        localId: field.id,
        key: field.key,
        label: field.label,
        field_type: field.field_type,
        required: field.required,
        placeholder: field.placeholder || '',
        optionsText: optionsText(field.options),
      }));

    setResponsesFormId(null);
    setDraft({
      id: form.id,
      title: form.title,
      slug: form.slug,
      description: form.description || '',
      eventDetails: form.event_details || '',
      price: form.price == null ? '' : String(form.price),
      active: form.active,
      fields: formFields.length ? formFields : [newField('Nome completo')],
    });
  }

  function updateDraft(patch: Partial<FormDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function updateField(localId: string, patch: Partial<FieldDraft>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            fields: current.fields.map((field) =>
              field.localId === localId ? { ...field, ...patch } : field,
            ),
          }
        : current,
    );
  }

  function removeField(localId: string) {
    setDraft((current) =>
      current && current.fields.length > 1
        ? { ...current, fields: current.fields.filter((field) => field.localId !== localId) }
        : current,
    );
  }

  async function saveForm() {
    if (!draft || saving) return;
    if (!draft.title.trim()) {
      setToast('Informe o nome do formulário');
      return;
    }
    if (!draft.fields.length || draft.fields.some((field) => !field.label.trim())) {
      setToast('Preencha o nome de todos os campos');
      return;
    }

    const resolvedSlug = slugify(draft.slug || draft.title);
    if (!resolvedSlug) {
      setToast('Defina um link válido');
      return;
    }

    setSaving(true);

    const formPayload = {
      title: draft.title.trim(),
      slug: resolvedSlug,
      description: draft.description.trim(),
      event_details: draft.eventDetails.trim(),
      price: draft.price.trim() ? Number(draft.price.replace(',', '.')) : null,
      active: draft.active,
    };

    let formId = draft.id;
    if (formId) {
      const { error } = await supabase.from('forms').update(formPayload).eq('id', formId);
      if (error) {
        setToast(error.code === '23505' ? 'Esse link já está sendo usado' : error.message);
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await supabase.from('forms').insert(formPayload).select('id').single();
      if (error || !data?.id) {
        setToast(error?.code === '23505' ? 'Esse link já está sendo usado' : error?.message || 'Erro ao criar formulário');
        setSaving(false);
        return;
      }
      formId = String(data.id);
    }

    const { error: deleteError } = await supabase.from('form_fields').delete().eq('form_id', formId);
    if (deleteError) {
      setToast(deleteError.message);
      setSaving(false);
      return;
    }

    const fieldPayload = draft.fields.map((field, index) => ({
      form_id: formId,
      key: field.key.trim() || fieldKey(field.label, index),
      label: field.label.trim(),
      field_type: field.field_type,
      required: field.required,
      placeholder: field.placeholder.trim(),
      options: field.field_type === 'select'
        ? field.optionsText.split(',').map((item) => item.trim()).filter(Boolean)
        : [],
      sort_order: index + 1,
    }));

    const duplicateKeys = new Set<string>();
    for (const item of fieldPayload) {
      if (duplicateKeys.has(item.key)) {
        setToast(`Há dois campos com a chave “${item.key}”`);
        setSaving(false);
        return;
      }
      duplicateKeys.add(item.key);
    }

    const { error: fieldError } = await supabase.from('form_fields').insert(fieldPayload);
    if (fieldError) {
      setToast(fieldError.message);
      setSaving(false);
      return;
    }

    setDraft(null);
    setToast('Formulário salvo');
    await loadData();
    setSaving(false);
  }

  async function toggleActive(form: FormRow) {
    const { error } = await supabase.from('forms').update({ active: !form.active }).eq('id', form.id);
    if (error) {
      setToast(error.message);
      return;
    }
    setToast(form.active ? 'Formulário pausado' : 'Formulário publicado');
    await loadData();
  }

  async function copyLink(form: FormRow) {
    const url = `${window.location.origin}/f/${form.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast('Link copiado');
    } catch {
      window.prompt('Copie o link:', url);
    }
  }

  function exportCsv(form: FormRow) {
    const formFields = fields.filter((field) => field.form_id === form.id).sort((a, b) => a.sort_order - b.sort_order);
    const rows = submissions.filter((submission) => submission.form_id === form.id);
    const header = ['Data', ...formFields.map((field) => field.label)].map(csvEscape).join(';');
    const body = rows.map((submission) => [
      new Date(submission.created_at).toLocaleString('pt-BR'),
      ...formFields.map((field) => submission.answers?.[field.key] ?? ''),
    ].map(csvEscape).join(';'));
    const csv = `\uFEFF${[header, ...body].join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${form.slug}-inscricoes.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const responseForm = forms.find((form) => form.id === responsesFormId) || null;
  const responseFields = responseForm
    ? fields.filter((field) => field.form_id === responseForm.id).sort((a, b) => a.sort_order - b.sort_order)
    : [];
  const responseRows = responseForm
    ? submissions.filter((submission) => submission.form_id === responseForm.id)
    : [];

  return (
    <div className="forms-admin-page">
      <header className="forms-admin-header">
        <div>
          <span>CEAMI • FORMULÁRIOS</span>
          <h1>Formulários e inscrições</h1>
          <p>Crie um formulário, gere o link e acompanhe as respostas sem precisar alterar o sistema.</p>
        </div>
        <button type="button" onClick={() => { setResponsesFormId(null); setDraft(blankDraft()); }}>
          <FilePlus2 size={18} /> Novo formulário
        </button>
      </header>

      {loadError && (
        <section className="forms-admin-alert">
          <strong>Falta uma etapa no banco</strong>
          <p>{loadError}</p>
        </section>
      )}

      {loading ? (
        <div className="forms-admin-loading"><LoaderCircle className="forms-spin" />Carregando...</div>
      ) : !loadError && draft ? (
        <section className="forms-builder">
          <div className="forms-builder-top">
            <div>
              <span>{draft.id ? 'EDITANDO FORMULÁRIO' : 'NOVO FORMULÁRIO'}</span>
              <h2>{draft.title || 'Formulário sem título'}</h2>
            </div>
            <button type="button" className="icon" onClick={() => setDraft(null)} aria-label="Fechar"><X /></button>
          </div>

          <div className="forms-builder-grid">
            <label>
              <span>Nome do formulário</span>
              <input value={draft.title} onChange={(e) => updateDraft({ title: e.target.value, slug: draft.id ? draft.slug : slugify(e.target.value) })} placeholder="Ex.: Conferência de Jovens 2026" />
            </label>
            <label>
              <span>Link público</span>
              <div className="forms-slug-input"><b>/f/</b><input value={draft.slug} onChange={(e) => updateDraft({ slug: slugify(e.target.value) })} /></div>
            </label>
            <label className="wide">
              <span>Descrição curta</span>
              <input value={draft.description} onChange={(e) => updateDraft({ description: e.target.value })} placeholder="Uma frase que aparece logo abaixo do título" />
            </label>
            <label className="wide">
              <span>Informações do evento</span>
              <textarea value={draft.eventDetails} onChange={(e) => updateDraft({ eventDetails: e.target.value })} placeholder={'Datas, horários, orientações, local...\nCada linha aparece separada no formulário.'} />
            </label>
            <label>
              <span>Valor (opcional)</span>
              <input inputMode="decimal" value={draft.price} onChange={(e) => updateDraft({ price: e.target.value.replace(/[^0-9,.]/g, '') })} placeholder="35,00" />
            </label>
            <label className="forms-active-toggle">
              <span>Disponibilidade</span>
              <button type="button" className={draft.active ? 'active' : ''} onClick={() => updateDraft({ active: !draft.active })}>
                <i /> {draft.active ? 'Publicado' : 'Pausado'}
              </button>
            </label>
          </div>

          <div className="forms-fields-head">
            <div><h3>Campos do formulário</h3><p>Defina exatamente o que a pessoa precisa responder.</p></div>
            <button type="button" className="secondary" onClick={() => updateDraft({ fields: [...draft.fields, newField()] })}><Plus size={17} />Adicionar campo</button>
          </div>

          <div className="forms-field-list">
            {draft.fields.map((field, index) => (
              <article className="forms-field-card" key={field.localId}>
                <div className="forms-field-number">{index + 1}</div>
                <div className="forms-field-content">
                  <div className="forms-field-main">
                    <label><span>Pergunta / campo</span><input value={field.label} onChange={(e) => updateField(field.localId, { label: e.target.value })} placeholder="Ex.: Vai querer apostila?" /></label>
                    <label><span>Tipo</span><select value={field.field_type} onChange={(e) => updateField(field.localId, { field_type: e.target.value as FieldType })}>{FIELD_TYPES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
                  </div>
                  <div className="forms-field-options">
                    <label><span>Chave interna</span><input value={field.key} onChange={(e) => updateField(field.localId, { key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() })} placeholder={fieldKey(field.label, index)} /></label>
                    {field.field_type === 'select' ? (
                      <label><span>Opções (separadas por vírgula)</span><input value={field.optionsText} onChange={(e) => updateField(field.localId, { optionsText: e.target.value })} placeholder="Opção 1, Opção 2, Opção 3" /></label>
                    ) : (
                      <label><span>Texto de exemplo</span><input value={field.placeholder} onChange={(e) => updateField(field.localId, { placeholder: e.target.value })} placeholder="Opcional" /></label>
                    )}
                  </div>
                  <label className="forms-required"><input type="checkbox" checked={field.required} onChange={(e) => updateField(field.localId, { required: e.target.checked })} />Obrigatório</label>
                </div>
                <button type="button" className="forms-remove-field" onClick={() => removeField(field.localId)} disabled={draft.fields.length <= 1} aria-label="Remover campo"><Trash2 size={17} /></button>
              </article>
            ))}
          </div>

          <footer className="forms-builder-actions">
            <button type="button" className="secondary" onClick={() => setDraft(null)}>Cancelar</button>
            <button type="button" onClick={() => void saveForm()} disabled={saving}>{saving ? <LoaderCircle className="forms-spin" size={18} /> : <Save size={18} />}{saving ? 'Salvando...' : 'Salvar formulário'}</button>
          </footer>
        </section>
      ) : !loadError && responseForm ? (
        <section className="forms-responses">
          <div className="forms-responses-head">
            <div>
              <span>RESPOSTAS</span>
              <h2>{responseForm.title}</h2>
              <p>{responseRows.length} inscrição{responseRows.length === 1 ? '' : 'ões'} recebida{responseRows.length === 1 ? '' : 's'}.</p>
            </div>
            <div>
              <button type="button" className="secondary" onClick={() => exportCsv(responseForm)}><Download size={17} />Exportar CSV</button>
              <button type="button" className="icon" onClick={() => setResponsesFormId(null)} aria-label="Fechar"><X /></button>
            </div>
          </div>

          {responseRows.length ? (
            <div className="forms-table-wrap">
              <table>
                <thead><tr><th>Data</th>{responseFields.map((field) => <th key={field.id}>{field.label}</th>)}</tr></thead>
                <tbody>
                  {responseRows.map((submission) => (
                    <tr key={submission.id}>
                      <td>{new Date(submission.created_at).toLocaleString('pt-BR')}</td>
                      {responseFields.map((field) => <td key={field.id}>{String(submission.answers?.[field.key] ?? '—')}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="forms-empty"><UsersRound /><h3>Nenhuma resposta ainda</h3><p>Assim que alguém preencher o link público, a inscrição aparecerá aqui.</p></div>
          )}
        </section>
      ) : !loadError ? (
        <>
          <section className="forms-summary">
            <div><ClipboardList /><span><strong>{forms.length}</strong> formulários</span></div>
            <div><UsersRound /><span><strong>{submissions.length}</strong> respostas recebidas</span></div>
            <div><span className="forms-status-dot" /><span><strong>{forms.filter((form) => form.active).length}</strong> publicados</span></div>
          </section>

          <section className="forms-list">
            {forms.length ? forms.map((form) => {
              const count = submissions.filter((submission) => submission.form_id === form.id).length;
              return (
                <article className="forms-card" key={form.id}>
                  <div className="forms-card-main">
                    <div className="forms-card-title-row"><span className={form.active ? 'forms-badge active' : 'forms-badge'}>{form.active ? 'Publicado' : 'Pausado'}</span><small>{count} resposta{count === 1 ? '' : 's'}</small></div>
                    <h2>{form.title}</h2>
                    <p>{form.description || 'Sem descrição.'}</p>
                    <code>/f/{form.slug}</code>
                  </div>
                  <div className="forms-card-actions">
                    <button type="button" onClick={() => void copyLink(form)}><Copy size={16} />Copiar link</button>
                    <a href={`/f/${form.slug}`} target="_blank" rel="noreferrer"><ExternalLink size={16} />Abrir</a>
                    <button type="button" onClick={() => { setDraft(null); setResponsesFormId(form.id); }}><UsersRound size={16} />Respostas</button>
                    <button type="button" onClick={() => editForm(form)}><Pencil size={16} />Editar</button>
                    <button type="button" className="secondary" onClick={() => void toggleActive(form)}>{form.active ? 'Pausar' : 'Publicar'}</button>
                  </div>
                </article>
              );
            }) : (
              <div className="forms-empty"><ClipboardList /><h3>Nenhum formulário criado</h3><p>Crie o primeiro e o sistema gera o link público automaticamente.</p><button type="button" onClick={() => setDraft(blankDraft())}><Plus size={17} />Criar formulário</button></div>
            )}
          </section>
        </>
      ) : null}

      {toast && <div className="forms-toast">{toast}</div>}
    </div>
  );
}
