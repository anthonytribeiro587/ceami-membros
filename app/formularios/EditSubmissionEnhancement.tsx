'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, LoaderCircle, Pencil, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type FieldType = 'text' | 'phone' | 'email' | 'textarea' | 'yes_no' | 'select';

type FormLite = {
  id: string;
  title: string;
  slug: string;
};

type FieldLite = {
  id: string;
  key: string;
  label: string;
  field_type: FieldType;
  required: boolean;
  placeholder: string | null;
  options: unknown;
  sort_order: number;
};

type SubmissionLite = {
  id: string;
  form_id: string;
  respondent_name: string | null;
  respondent_phone: string | null;
  answers: Record<string, unknown> | null;
  created_at: string;
};

type EditorState = {
  form: FormLite;
  fields: FieldLite[];
  submission: SubmissionLite;
  correctionMessage: string;
};

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function digits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '');
}

function formatPhone(value: string) {
  const numbers = value.replace(/\D/g, '').slice(0, 11);
  if (numbers.length <= 2) return numbers;
  if (numbers.length <= 6) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
  if (numbers.length <= 10) return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 6)}-${numbers.slice(6)}`;
  return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
}

function optionsFrom(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const result: string[] = [];
  for (const raw of value.map((item) => String(item).trim()).filter(Boolean)) {
    const previous = result[result.length - 1];
    if (/^\d{2}\)\s*$/.test(raw) && previous && /R\$\s*\d+\s*$/.test(previous)) {
      result[result.length - 1] = `${previous},${raw}`;
    } else {
      result.push(raw);
    }
  }
  return result;
}

function correctionFromAnswers(answers: Record<string, unknown> | null | undefined) {
  const raw = answers?.__correction_request;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  if (data.status !== 'open') return null;
  return {
    message: String(data.message ?? '').trim(),
    requestedAt: typeof data.requestedAt === 'string' ? data.requestedAt : null,
  };
}

export default function EditSubmissionEnhancement() {
  const supabase = useMemo(() => createClient(), []);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!editor) return;
    const values: Record<string, string> = {};
    for (const field of editor.fields) {
      values[field.key] = String(editor.submission.answers?.[field.key] ?? '');
    }
    setAnswers(values);
  }, [editor]);

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;
    let loading = false;
    let cachedTitle = '';
    let cachedForm: FormLite | null = null;
    let cachedFields: FieldLite[] = [];
    let cachedSubmissions: SubmissionLite[] = [];

    function schedule() {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void enhance(), 120);
    }

    function maybeReopenResponses() {
      const title = sessionStorage.getItem('ceami-reopen-responses-title');
      if (!title || document.querySelector('.forms-responses')) return;
      const cards = Array.from(document.querySelectorAll('.forms-card'));
      const card = cards.find((item) => item.querySelector('h2')?.textContent?.trim() === title);
      const button = card?.querySelector<HTMLButtonElement>('button.responses-primary');
      if (button) {
        sessionStorage.removeItem('ceami-reopen-responses-title');
        button.click();
      }
    }

    function clearInjected(root: ParentNode = document) {
      root.querySelectorAll('[data-ceami-edit-submission], [data-ceami-correction-badge]')
        .forEach((node) => node.remove());
    }

    function matchSubmission(card: Element, submissions: SubmissionLite[], used: Set<string>) {
      const cardName = normalize(card.querySelector('.forms-response-name-row h3')?.textContent);
      const cardPhone = digits(card.querySelector('.forms-response-name-row > div > span')?.textContent);
      const cardTime = card.querySelector('time')?.textContent?.trim() || '';

      const exact = submissions.find((submission) => {
        if (used.has(submission.id)) return false;
        return normalize(submission.respondent_name) === cardName
          && (!cardPhone || digits(submission.respondent_phone) === cardPhone)
          && new Date(submission.created_at).toLocaleString('pt-BR') === cardTime;
      });
      if (exact) return exact;

      return submissions.find((submission) => {
        if (used.has(submission.id)) return false;
        return normalize(submission.respondent_name) === cardName
          && (!cardPhone || digits(submission.respondent_phone) === cardPhone);
      }) || null;
    }

    function decorate(form: FormLite, fields: FieldLite[], submissions: SubmissionLite[]) {
      const cards = Array.from(document.querySelectorAll('.forms-response-card'));
      const used = new Set<string>();

      for (const card of cards) {
        const submission = matchSubmission(card, submissions, used);
        if (!submission) continue;
        used.add(submission.id);

        const person = card.querySelector('.forms-response-person');
        const actions = card.querySelector('.forms-response-actions');
        if (!person || !actions) continue;

        const correction = correctionFromAnswers(submission.answers);
        if (correction && !person.querySelector('[data-ceami-correction-badge]')) {
          const badge = document.createElement('div');
          badge.dataset.ceamiCorrectionBadge = submission.id;
          badge.className = 'ceami-correction-badge';
          badge.innerHTML = '<span>!</span><strong>Correção solicitada</strong>';
          const tags = person.querySelector('.forms-response-tags');
          if (tags) person.insertBefore(badge, tags);
          else person.appendChild(badge);
        }

        if (!actions.querySelector('[data-ceami-edit-submission]')) {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.ceamiEditSubmission = submission.id;
          button.className = correction ? 'ceami-edit-submission attention' : 'ceami-edit-submission';
          button.innerHTML = correction
            ? '<span>✎</span> Corrigir inscrição'
            : '<span>✎</span> Editar inscrição';
          button.addEventListener('click', () => {
            setEditor({
              form,
              fields,
              submission,
              correctionMessage: correction?.message || '',
            });
          });
          actions.appendChild(button);
        }
      }
    }

    async function enhance() {
      if (stopped || loading) return;
      maybeReopenResponses();

      const responses = document.querySelector('.forms-responses');
      const title = responses?.querySelector('.forms-responses-head h2')?.textContent?.trim() || '';
      if (!responses || !title) return;

      const allDecorated = Array.from(responses.querySelectorAll('.forms-response-card'))
        .every((card) => Boolean(card.querySelector('[data-ceami-edit-submission]')));
      if (title === cachedTitle && cachedForm && allDecorated) return;

      loading = true;
      try {
        if (title !== cachedTitle || !cachedForm) {
          const { data: formData } = await supabase
            .from('forms')
            .select('id, title, slug')
            .eq('title', title)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!formData || stopped) return;

          cachedForm = formData as FormLite;
          cachedTitle = title;

          const [{ data: fieldData }, { data: submissionData }] = await Promise.all([
            supabase
              .from('form_fields')
              .select('id, key, label, field_type, required, placeholder, options, sort_order')
              .eq('form_id', cachedForm.id)
              .order('sort_order', { ascending: true }),
            supabase
              .from('form_submissions')
              .select('id, form_id, respondent_name, respondent_phone, answers, created_at')
              .eq('form_id', cachedForm.id)
              .order('created_at', { ascending: false }),
          ]);
          cachedFields = (fieldData || []) as FieldLite[];
          cachedSubmissions = (submissionData || []) as SubmissionLite[];
        }

        clearInjected(responses);
        if (cachedForm) decorate(cachedForm, cachedFields, cachedSubmissions);
      } finally {
        loading = false;
      }
    }

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      observer.disconnect();
      clearInjected();
    };
  }, [supabase]);

  function setAnswer(key: string, value: string) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!editor || saving) return;
    setSaving(true);
    try {
      const response = await fetch('/api/admin/form-submissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: editor.submission.id, answers }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setNotice(payload.error || 'Não foi possível salvar a inscrição.');
        return;
      }

      sessionStorage.setItem('ceami-reopen-responses-title', editor.form.title);
      setNotice('Inscrição atualizada. Recarregando os dados...');
      window.setTimeout(() => window.location.reload(), 350);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <style>{`
        .forms-response-actions .ceami-edit-submission{border-color:#d9d0c5;background:#fff;color:#55483c;font-weight:800}.forms-response-actions .ceami-edit-submission.attention{border-color:#edc27b;background:#fff7e8;color:#8a5a10}.ceami-correction-badge{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11px;color:#975f0b}.ceami-correction-badge>span{width:17px;height:17px;border-radius:50%;display:grid;place-items:center;background:#ffe7b6;color:#8a5606;font-weight:900}.ceami-correction-badge strong{font-weight:900}.ceami-edit-modal-overlay{position:fixed;inset:0;z-index:2000;background:rgba(39,31,24,.54);display:grid;place-items:center;padding:18px}.ceami-edit-modal{width:min(620px,100%);max-height:calc(100vh - 36px);overflow:auto;background:#fff;border-radius:18px;box-shadow:0 25px 70px rgba(0,0,0,.25)}.ceami-edit-modal header{position:sticky;top:0;z-index:2;background:#fff;padding:19px 21px;border-bottom:1px solid #eee7df;display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.ceami-edit-modal header>div{display:flex;gap:11px}.ceami-edit-modal header svg{color:#7a5428}.ceami-edit-modal h3{margin:0 0 4px;font-size:21px}.ceami-edit-modal header p{margin:0;color:#776d63;font-size:12px}.ceami-edit-modal header>button{width:36px;height:36px;border:1px solid #ded6cc;border-radius:9px;background:#fff;display:grid;place-items:center}.ceami-edit-correction{margin:16px 20px 0;border:1px solid #f0cf91;background:#fff8e9;border-radius:12px;padding:12px 13px;display:flex;gap:9px;align-items:flex-start;color:#754a09}.ceami-edit-correction svg{flex:0 0 auto;margin-top:1px}.ceami-edit-correction div{display:grid;gap:3px}.ceami-edit-correction strong{font-size:12px}.ceami-edit-correction span{font-size:12px;line-height:1.45}.ceami-edit-fields{padding:18px 20px;display:grid;gap:13px}.ceami-edit-field{display:grid;gap:6px}.ceami-edit-field>span{font-size:11px;font-weight:900;color:#665b51}.ceami-edit-field em{font-style:normal;color:#b44d3b}.ceami-edit-field input,.ceami-edit-field select,.ceami-edit-field textarea{width:100%;border:1px solid #ddd4ca;border-radius:10px;background:#fff;font:inherit;color:#2b251f;outline:none}.ceami-edit-field input,.ceami-edit-field select{height:44px;padding:0 11px}.ceami-edit-field textarea{min-height:105px;padding:11px;resize:vertical}.ceami-edit-field input:focus,.ceami-edit-field select:focus,.ceami-edit-field textarea:focus{border-color:#a87a42;box-shadow:0 0 0 3px rgba(168,122,66,.1)}.ceami-edit-modal footer{position:sticky;bottom:0;background:#fff;border-top:1px solid #eee7df;padding:14px 20px 18px;display:flex;justify-content:flex-end;gap:8px}.ceami-edit-modal footer button{min-height:42px;border-radius:10px;padding:0 14px;font-weight:900}.ceami-edit-modal .cancel{border:1px solid #ddd4ca;background:#fff;color:#574c42}.ceami-edit-modal .save{border:0;background:#70491b;color:#fff;display:inline-flex;align-items:center;gap:7px}.ceami-edit-modal .save:disabled{opacity:.6}.ceami-edit-notice{position:fixed;right:22px;bottom:22px;z-index:2200;background:#2e2823;color:#fff;border-radius:11px;padding:12px 15px;font-size:13px;font-weight:800;box-shadow:0 12px 34px rgba(0,0,0,.2)}@media(max-width:700px){.forms-response-actions .ceami-edit-submission{grid-column:1/-1}.ceami-edit-modal-overlay{padding:0;align-items:end}.ceami-edit-modal{width:100%;max-height:92vh;border-radius:18px 18px 0 0}.ceami-edit-modal footer{display:grid;grid-template-columns:1fr 1fr}.ceami-edit-modal footer button{width:100%;justify-content:center}.ceami-edit-notice{left:12px;right:12px;bottom:82px;text-align:center}}
      `}</style>

      {editor && (
        <div className="ceami-edit-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setEditor(null); }}>
          <section className="ceami-edit-modal" role="dialog" aria-modal="true" aria-label="Editar inscrição">
            <header>
              <div>
                <Pencil size={24} />
                <div>
                  <h3>Editar inscrição</h3>
                  <p>{editor.submission.respondent_name || 'Inscrição'} • alterações feitas pelo administrativo</p>
                </div>
              </div>
              <button type="button" onClick={() => setEditor(null)} aria-label="Fechar"><X size={18} /></button>
            </header>

            {editor.correctionMessage && (
              <div className="ceami-edit-correction">
                <AlertTriangle size={18} />
                <div>
                  <strong>Participante solicitou uma correção</strong>
                  <span>{editor.correctionMessage}</span>
                </div>
              </div>
            )}

            <div className="ceami-edit-fields">
              {editor.fields.map((field) => {
                const value = answers[field.key] || '';
                const choices = field.field_type === 'yes_no'
                  ? ['Sim', 'Não']
                  : field.field_type === 'select'
                    ? optionsFrom(field.options)
                    : [];

                if (choices.length) {
                  return (
                    <label className="ceami-edit-field" key={field.id}>
                      <span>{field.label}{field.required && <em> *</em>}</span>
                      <select required={field.required} value={value} onChange={(event) => setAnswer(field.key, event.target.value)}>
                        <option value="">Selecione</option>
                        {choices.map((option) => <option value={option} key={option}>{option}</option>)}
                      </select>
                    </label>
                  );
                }

                if (field.field_type === 'textarea') {
                  return (
                    <label className="ceami-edit-field" key={field.id}>
                      <span>{field.label}{field.required && <em> *</em>}</span>
                      <textarea required={field.required} value={value} onChange={(event) => setAnswer(field.key, event.target.value)} />
                    </label>
                  );
                }

                return (
                  <label className="ceami-edit-field" key={field.id}>
                    <span>{field.label}{field.required && <em> *</em>}</span>
                    <input
                      type={field.field_type === 'email' ? 'email' : 'text'}
                      inputMode={field.field_type === 'phone' ? 'tel' : undefined}
                      required={field.required}
                      value={value}
                      onChange={(event) => setAnswer(field.key, field.field_type === 'phone' ? formatPhone(event.target.value) : event.target.value)}
                    />
                  </label>
                );
              })}
            </div>

            <footer>
              <button className="cancel" type="button" onClick={() => setEditor(null)}>Cancelar</button>
              <button className="save" type="button" disabled={saving} onClick={() => void save()}>
                {saving ? <LoaderCircle className="forms-spin" size={17} /> : <Check size={17} />}
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </footer>
          </section>
        </div>
      )}

      {notice && <div className="ceami-edit-notice">{notice}</div>}
    </>
  );
}
