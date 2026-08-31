'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Church, FileText, LoaderCircle, MessageSquareWarning } from 'lucide-react';
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
const SEMINAR_BOOKLET_OPTIONS = [
  { value: 'Sim — Física (R$ 35,00)', title: 'Sim — Apostila física', detail: 'R$ 35,00' },
  { value: 'Sim — PDF (R$ 10,00)', title: 'Sim — PDF / e-book', detail: 'R$ 10,00' },
  { value: 'Não — Sem custo', title: 'Não quero apostila', detail: 'Sem custo' },
] as const;

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function optionsFrom(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

export default function PublicFormClient({ slug }: { slug: string }) {
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
      loaded.form_fields = [...(loaded.form_fields || [])].sort((a, b) => a.sort_order - b.sort_order);
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
  const bookletChoice = answers.apostila || '';
  const bookletPrice = bookletChoice.includes('Física') ? 35 : bookletChoice.includes('PDF') ? 10 : 0;

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
          {isSeminar && bookletPrice > 0 ? (
            <p>
              O seminário é <strong>gratuito</strong>. Sua escolha de material foi registrada em <strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(bookletPrice)}</strong>. Após o pagamento da apostila, envie o comprovante para a equipe da CEAMI confirmar no sistema.
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
                    placeholder="Ex.: marquei PDF, mas quero apostila física."
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

        {isSeminar ? (
          <div className="public-form-event-box">
            <p>{`11/09/2026 (sexta) — 20h às 22h\n12/09/2026 (sábado) — 16h às 22h\nCoffee-break às 19h\n\nA participação no seminário é gratuita. O valor é somente para quem optar pela apostila.\nApostila física: R$ 35,00 • PDF/e-book: R$ 10,00 • Sem apostila: sem custo.\n\nTraga sua Bíblia, caneta e caderno de anotações.\nNo dia do Seminário, coloque seu celular no modo avião ou silencioso.`}</p>
            <strong>Seminário gratuito</strong>
          </div>
        ) : (form.event_details || form.price !== null) ? (
          <div className="public-form-event-box">
            {form.event_details && <p>{form.event_details}</p>}
            {form.price !== null && (
              <strong>Valor: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(form.price))}</strong>
            )}
          </div>
        ) : null}

        <form onSubmit={submit}>
          <div className="public-form-fields">
            {(form.form_fields || []).map((field) => {
              const value = answers[field.key] || '';
              const isSeminarBooklet = isSeminar && field.key === 'apostila';

              if (isSeminarBooklet) {
                return (
                  <fieldset className="public-form-field public-form-choice public-form-booklet-choice" key={field.id}>
                    <legend>{field.label}{field.required && <em>*</em>}</legend>
                    <div>
                      {SEMINAR_BOOKLET_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={value === option.value ? 'active' : ''}
                          onClick={() => setAnswer(field.key, option.value)}
                        >
                          <FileText size={17} />
                          <span><b>{option.title}</b><small>{option.detail}</small></span>
                        </button>
                      ))}
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
                      {['Sim', 'Não'].map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={value === option ? 'active' : ''}
                          onClick={() => setAnswer(field.key, option)}
                        >
                          {option}
                        </button>
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
                    <select required={field.required} value={value} onChange={(e) => setAnswer(field.key, e.target.value)}>
                      <option value="">Selecione</option>
                      {optionsFrom(field.options).map((option) => <option key={option}>{option}</option>)}
                    </select>
                  </label>
                );
              }

              if (field.field_type === 'textarea') {
                return (
                  <label className="public-form-field" key={field.id}>
                    <span>{field.label}{field.required && <em>*</em>}</span>
                    <textarea required={field.required} placeholder={field.placeholder || undefined} value={value} onChange={(e) => setAnswer(field.key, e.target.value)} />
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
                    onChange={(e) => setAnswer(field.key, field.field_type === 'phone' ? formatPhone(e.target.value) : e.target.value)}
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
