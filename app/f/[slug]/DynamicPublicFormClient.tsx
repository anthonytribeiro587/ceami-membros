'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Church,
  FileText,
  LoaderCircle,
  MessageSquareWarning,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type FieldType = 'text' | 'phone' | 'email' | 'textarea' | 'yes_no' | 'select';

type FormField = {
  id: string;
  key: string;
  label: string;
  field_type: FieldType;
  required: boolean;
  placeholder: string;
  options: unknown;
  sort_order: number;
};

type PublicForm = {
  id: string;
  title: string;
  slug: string;
  description: string;
  event_details: string;
  price: number | null;
  active: boolean;
  form_fields: FormField[] | null;
};

const SEMINAR_SLUG = 'seminario-apocalipse-2026';

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function repairOptions(value: unknown) {
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

function parsePrice(value: unknown) {
  const text = String(value ?? '');
  if (/sem custo|gratuit[oa]/i.test(text)) return 0;
  const match = text.match(/R\$\s*([0-9.]+(?:,[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i);
  if (!match) return 0;
  let raw = match[1];
  if (raw.includes(',') && raw.includes('.')) raw = raw.replace(/\./g, '').replace(',', '.');
  else if (raw.includes(',')) raw = raw.replace(',', '.');
  const number = Number(raw);
  return Number.isFinite(number) ? number : 0;
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function optionPresentation(option: string) {
  const price = parsePrice(option);
  const isFree = /sem custo|gratuit[oa]/i.test(option);
  let title = option
    .replace(/\s*\(?R\$\s*[0-9.]+(?:,[0-9]{1,2})?\)?\s*$/i, '')
    .replace(/\s*[-–—•]?\s*sem custo\s*$/i, '')
    .trim();
  if (!title) title = option;
  return {
    title,
    detail: price > 0 ? money(price) : isFree ? 'Sem custo' : '',
  };
}

export default function DynamicPublicFormClient({ slug }: { slug: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState<PublicForm | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [submissionId, setSubmissionId] = useState('');
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionMessage, setCorrectionMessage] = useState('');
  const [correctionSending, setCorrectionSending] = useState(false);
  const [correctionSent, setCorrectionSent] = useState(false);
  const [correctionError, setCorrectionError] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error: loadError } = await supabase
        .from('forms')
        .select('id, title, slug, description, event_details, price, active, form_fields(id, key, label, field_type, required, placeholder, options, sort_order)')
        .eq('slug', slug)
        .eq('active', true)
        .maybeSingle();

      if (!active) return;
      if (loadError || !data) {
        setError('Este formulário não está disponível no momento.');
        setLoading(false);
        return;
      }

      const loaded = data as unknown as PublicForm;
      loaded.form_fields = [...(loaded.form_fields || [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((field) => ({ ...field, options: repairOptions(field.options) }));
      setForm(loaded);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [slug, supabase]);

  function setAnswer(key: string, value: string) {
    setAnswers((current) => ({ ...current, [key]: value }));
    setError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || sending) return;

    setSending(true);
    setError('');
    const response = await fetch(`/api/public/forms/${encodeURIComponent(form.slug)}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers, website: '' }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; submissionId?: string };

    if (!response.ok) {
      setError(payload.error || 'Não foi possível concluir sua inscrição.');
      setSending(false);
      return;
    }

    setSubmissionId(payload.submissionId || '');
    setSent(true);
    setSending(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function requestCorrection() {
    if (!form || !submissionId || correctionSending) return;
    if (!correctionMessage.trim()) {
      setCorrectionError('Explique rapidamente o que ficou errado.');
      return;
    }

    setCorrectionSending(true);
    setCorrectionError('');
    const response = await fetch(`/api/public/forms/${encodeURIComponent(form.slug)}/correction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId, message: correctionMessage }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    setCorrectionSending(false);

    if (!response.ok) {
      setCorrectionError(payload.error || 'Não foi possível avisar a equipe.');
      return;
    }

    setCorrectionSent(true);
    setCorrectionOpen(false);
  }

  if (loading) {
    return (
      <main className="public-form-page public-form-center">
        <LoaderCircle className="public-form-spin" />
        <p>Carregando formulário...</p>
      </main>
    );
  }

  if (!form) {
    return (
      <main className="public-form-page public-form-center">
        <Church size={42} />
        <h1>Formulário indisponível</h1>
        <p>{error || 'Tente novamente mais tarde.'}</p>
      </main>
    );
  }

  const isSeminar = form.slug === SEMINAR_SLUG;
  const chosenMaterial = answers.apostila || '';
  const chosenPrice = parsePrice(chosenMaterial);

  if (sent) {
    return (
      <main className="public-form-page">
        <header className="public-form-brand">
          <img src="/brand/ceami-icon.svg?v=official-2" alt="CEAMI" />
          <div><strong>CEAMI</strong><span>Comunidade Evangélica Amigo Mais Que Irmão</span></div>
        </header>
        <section className="public-form-card public-form-success">
          <CheckCircle2 size={54} />
          <span>INSCRIÇÃO RECEBIDA</span>
          <h1>Pronto! Sua inscrição foi registrada.</h1>
          {chosenPrice > 0 ? (
            <p>
              Sua escolha foi registrada no valor de <strong>{money(chosenPrice)}</strong>. Após o pagamento, envie o comprovante para a equipe da CEAMI confirmar no sistema.
            </p>
          ) : (
            <p>Obrigado por se inscrever em <strong>{form.title}</strong>. A equipe da CEAMI já poderá visualizar seus dados no painel.</p>
          )}

          {correctionSent ? (
            <div className="public-form-correction-success">
              <CheckCircle2 size={18} />
              <div><strong>Correção sinalizada</strong><span>A equipe da CEAMI verá o aviso junto da sua inscrição.</span></div>
            </div>
          ) : submissionId ? (
            <div className="public-form-correction-box">
              <div className="public-form-correction-title">
                <MessageSquareWarning size={19} />
                <div><strong>Preencheu alguma informação errada?</strong><span>Você pode avisar a equipe agora.</span></div>
              </div>
              {!correctionOpen ? (
                <button type="button" onClick={() => setCorrectionOpen(true)}>Solicitar correção</button>
              ) : (
                <div className="public-form-correction-editor">
                  <textarea
                    value={correctionMessage}
                    onChange={(event) => { setCorrectionMessage(event.target.value); setCorrectionError(''); }}
                    placeholder="Ex.: escolhi a opção errada e preciso alterar."
                    maxLength={600}
                  />
                  {correctionError && <small>{correctionError}</small>}
                  <div>
                    <button type="button" className="secondary" onClick={() => setCorrectionOpen(false)}>Cancelar</button>
                    <button type="button" onClick={() => void requestCorrection()} disabled={correctionSending}>
                      {correctionSending ? <LoaderCircle className="public-form-spin" size={16} /> : null}
                      {correctionSending ? 'Enviando...' : 'Avisar a CEAMI'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </section>
        <style>{`
          .public-form-correction-box,.public-form-correction-success{width:100%;margin-top:22px;border-radius:14px;padding:14px 15px}.public-form-correction-box{border:1px solid #e5d8c8;background:#fbf8f3}.public-form-correction-success{border:1px solid #cfe2d2;background:#edf6ef;color:#376c42;display:flex;gap:9px;align-items:flex-start}.public-form-correction-success div,.public-form-correction-title>div{display:grid;gap:2px}.public-form-correction-success span,.public-form-correction-title span{font-size:12px;color:#70665d}.public-form-correction-title{display:flex;align-items:flex-start;gap:9px}.public-form-correction-title svg{color:#8a5a16}.public-form-correction-box>button,.public-form-correction-editor button{min-height:40px;border:0;border-radius:10px;padding:0 12px;background:#70491b;color:#fff;font-weight:800;display:inline-flex;align-items:center;gap:7px;justify-content:center}.public-form-correction-box>button{margin-top:11px}.public-form-correction-editor{margin-top:11px;display:grid;gap:8px}.public-form-correction-editor textarea{width:100%;min-height:92px;border:1px solid #ddd4c8;border-radius:10px;padding:10px 11px;resize:vertical;font:inherit}.public-form-correction-editor small{color:#9b3c2d}.public-form-correction-editor>div{display:flex;justify-content:flex-end;gap:8px}.public-form-correction-editor button.secondary{background:#fff;color:#5f544a;border:1px solid #ddd4c8}
        `}</style>
      </main>
    );
  }

  return (
    <main className="public-form-page">
      <header className="public-form-brand">
        <img src="/brand/ceami-icon.svg?v=official-2" alt="CEAMI" />
        <div><strong>CEAMI</strong><span>Comunidade Evangélica Amigo Mais Que Irmão</span></div>
      </header>

      <section className="public-form-card">
        <div className="public-form-heading">
          <span>INSCRIÇÃO CEAMI</span>
          <h1>{form.title}</h1>
          {form.description && <p>{form.description}</p>}
        </div>

        {(form.event_details || form.price !== null || isSeminar) && (
          <div className="public-form-event-box">
            {form.event_details && <p>{form.event_details}</p>}
            {isSeminar ? (
              <strong>Seminário gratuito</strong>
            ) : form.price !== null ? (
              <strong>Valor: {money(Number(form.price))}</strong>
            ) : null}
          </div>
        )}

        <form onSubmit={submit}>
          <div className="public-form-fields">
            {(form.form_fields || []).map((field) => {
              const value = answers[field.key] || '';
              const choices = field.field_type === 'yes_no'
                ? ['Sim', 'Não']
                : field.field_type === 'select'
                  ? repairOptions(field.options)
                  : [];
              const cardChoices = field.field_type === 'select' && (field.key === 'apostila' || choices.some((option) => /R\$|sem custo/i.test(option)));

              if (choices.length && cardChoices) {
                return (
                  <fieldset className="public-form-field public-form-choice public-form-booklet-choice" key={field.id}>
                    <legend>{field.label}{field.required && <em>*</em>}</legend>
                    <div>
                      {choices.map((option) => {
                        const presentation = optionPresentation(option);
                        return (
                          <button
                            key={option}
                            type="button"
                            className={value === option ? 'active' : ''}
                            onClick={() => setAnswer(field.key, option)}
                          >
                            <FileText size={17} />
                            <span><b>{presentation.title}</b>{presentation.detail && <small>{presentation.detail}</small>}</span>
                          </button>
                        );
                      })}
                    </div>
                    <input className="public-form-hidden-required" tabIndex={-1} aria-hidden="true" required={field.required} value={value} onChange={() => undefined} />
                  </fieldset>
                );
              }

              if (field.field_type === 'yes_no') {
                return (
                  <fieldset className="public-form-field public-form-choice" key={field.id}>
                    <legend>{field.label}{field.required && <em>*</em>}</legend>
                    <div>
                      {choices.map((option) => (
                        <button key={option} type="button" className={value === option ? 'active' : ''} onClick={() => setAnswer(field.key, option)}>{option}</button>
                      ))}
                    </div>
                    <input className="public-form-hidden-required" tabIndex={-1} aria-hidden="true" required={field.required} value={value} onChange={() => undefined} />
                  </fieldset>
                );
              }

              if (field.field_type === 'select') {
                return (
                  <label className="public-form-field" key={field.id}>
                    <span>{field.label}{field.required && <em>*</em>}</span>
                    <select required={field.required} value={value} onChange={(event) => setAnswer(field.key, event.target.value)}>
                      <option value="">Selecione</option>
                      {choices.map((option) => <option value={option} key={option}>{option}</option>)}
                    </select>
                  </label>
                );
              }

              if (field.field_type === 'textarea') {
                return (
                  <label className="public-form-field" key={field.id}>
                    <span>{field.label}{field.required && <em>*</em>}</span>
                    <textarea required={field.required} placeholder={field.placeholder || undefined} value={value} onChange={(event) => setAnswer(field.key, event.target.value)} />
                  </label>
                );
              }

              return (
                <label className="public-form-field" key={field.id}>
                  <span>{field.label}{field.required && <em>*</em>}</span>
                  <input
                    type={field.field_type === 'email' ? 'email' : 'text'}
                    inputMode={field.field_type === 'phone' ? 'tel' : undefined}
                    autoComplete={field.field_type === 'email' ? 'email' : field.field_type === 'phone' ? 'tel' : undefined}
                    required={field.required}
                    placeholder={field.placeholder || undefined}
                    value={value}
                    onChange={(event) => setAnswer(field.key, field.field_type === 'phone' ? formatPhone(event.target.value) : event.target.value)}
                  />
                </label>
              );
            })}
          </div>

          <input name="website" className="public-form-honeypot" tabIndex={-1} autoComplete="off" />
          {error && <div className="public-form-error">{error}</div>}

          <button className="public-form-submit" type="submit" disabled={sending}>
            {sending ? <><LoaderCircle className="public-form-spin" size={18} />Enviando...</> : <>Confirmar inscrição<ChevronRight size={18} /></>}
          </button>
        </form>
      </section>

      <style>{`
        .public-form-booklet-choice>div{grid-template-columns:1fr!important}.public-form-booklet-choice button{justify-content:flex-start!important;text-align:left;padding:10px 13px;gap:10px;display:flex;align-items:center}.public-form-booklet-choice button>span{display:grid;gap:2px}.public-form-booklet-choice button b{font-size:14px}.public-form-booklet-choice button small{font-size:12px;font-weight:700;color:#8a7660}.public-form-booklet-choice button.active small{color:#704b1e}
      `}</style>

      <p className="public-form-footer">Comunidade CEAMI ⛪</p>
    </main>
  );
}
