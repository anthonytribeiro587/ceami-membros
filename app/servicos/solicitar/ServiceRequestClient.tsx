'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  LoaderCircle,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  parseServiceSettings,
  SERVICE_FORM_SLUG,
} from '@/lib/services';

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

type ServiceForm = {
  id: string;
  title: string;
  description: string;
  event_details: string;
  active: boolean;
  form_fields: FormField[] | null;
};

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function optionsArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

export default function ServiceRequestClient() {
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState<ServiceForm | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [protocol, setProtocol] = useState('');

  useEffect(() => {
    let mounted = true;

    void (async () => {
      const { data, error: loadError } = await supabase
        .from('forms')
        .select('id, title, description, event_details, active, form_fields(id, key, label, field_type, required, placeholder, options, sort_order)')
        .eq('slug', SERVICE_FORM_SLUG)
        .eq('active', true)
        .maybeSingle();

      if (!mounted) return;

      if (loadError || !data) {
        setError('As solicitações de serviço não estão disponíveis no momento.');
        setLoading(false);
        return;
      }

      const loaded = data as unknown as ServiceForm;
      loaded.form_fields = [...(loaded.form_fields || [])].sort(
        (a, b) => a.sort_order - b.sort_order,
      );
      setForm(loaded);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  function setAnswer(key: string, value: string) {
    setAnswers((current) => ({ ...current, [key]: value }));
    setError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || sending) return;

    if (!accepted) {
      setError('Confirme que você leu e concorda com as condições antes de enviar.');
      return;
    }

    setSending(true);
    setError('');

    const response = await fetch(
      `/api/public/forms/${encodeURIComponent(SERVICE_FORM_SLUG)}/submit`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, website: '' }),
      },
    );

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      submissionId?: string;
    };

    if (!response.ok) {
      setError(payload.error || 'Não foi possível enviar sua solicitação.');
      setSending(false);
      return;
    }

    setProtocol(String(payload.submissionId || '').slice(0, 8).toUpperCase());
    setSent(true);
    setSending(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (loading) {
    return (
      <main className="services-public-page services-public-center">
        <LoaderCircle className="services-spin" />
        <p>Carregando...</p>
      </main>
    );
  }

  if (!form) {
    return (
      <main className="services-public-page services-public-center">
        <Wrench size={44} />
        <h1>Solicitações indisponíveis</h1>
        <p>{error || 'Tente novamente mais tarde.'}</p>
      </main>
    );
  }

  const settings = parseServiceSettings(form.event_details);

  if (sent) {
    return (
      <main className="services-public-page">
        <header className="services-public-brand">
          <img src="/brand/ceami-icon.svg?v=official-2" alt="CEAMI" />
          <div>
            <strong>CEAMI</strong>
            <span>Serviços</span>
          </div>
        </header>

        <section className="services-public-card services-public-success">
          <CheckCircle2 size={58} />
          <span>SOLICITAÇÃO RECEBIDA</span>
          <h1>Pronto! Seu pedido foi registrado.</h1>
          {protocol && <div className="services-protocol">Protocolo {protocol}</div>}
          <p>
            A CEAMI fará a ponte para que prestadores de serviços da comunidade possam
            entrar em contato com você.
          </p>
          <div className="services-success-note">
            Os serviços são cobrados e toda negociação é feita diretamente entre você
            e o prestador.
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="services-public-page">
      <header className="services-public-brand">
        <img src="/brand/ceami-icon.svg?v=official-2" alt="CEAMI" />
        <div>
          <strong>CEAMI</strong>
          <span>Serviços</span>
        </div>
      </header>

      <section className="services-public-card">
        <div className="services-public-heading">
          <div className="services-public-icon"><Wrench /></div>
          <span>CEAMI SERVIÇOS</span>
          <h1>{form.title || 'Solicite um serviço'}</h1>
          <p>
            {form.description ||
              'Conte o que você precisa e nós facilitamos o contato com prestadores da comunidade.'}
          </p>
        </div>

        <form onSubmit={submit}>
          <div className="services-public-fields">
            {(form.form_fields || []).map((field) => {
              const value = answers[field.key] || '';
              const options =
                field.field_type === 'yes_no'
                  ? ['Sim', 'Não']
                  : field.field_type === 'select'
                    ? optionsArray(field.options)
                    : [];

              if (field.field_type === 'textarea') {
                return (
                  <label className="services-field" key={field.id}>
                    <span>{field.label}{field.required && <em>*</em>}</span>
                    <textarea
                      required={field.required}
                      placeholder={field.placeholder || undefined}
                      value={value}
                      onChange={(event) => setAnswer(field.key, event.target.value)}
                    />
                  </label>
                );
              }

              if (field.field_type === 'select') {
                return (
                  <label className="services-field" key={field.id}>
                    <span>{field.label}{field.required && <em>*</em>}</span>
                    <select
                      required={field.required}
                      value={value}
                      onChange={(event) => setAnswer(field.key, event.target.value)}
                    >
                      <option value="">Selecione</option>
                      {options.map((option) => (
                        <option value={option} key={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                );
              }

              if (field.field_type === 'yes_no') {
                return (
                  <fieldset className="services-field services-choice" key={field.id}>
                    <legend>{field.label}{field.required && <em>*</em>}</legend>
                    <div>
                      {options.map((option) => (
                        <button
                          type="button"
                          key={option}
                          className={value === option ? 'active' : ''}
                          onClick={() => setAnswer(field.key, option)}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                    <input
                      className="services-hidden-required"
                      tabIndex={-1}
                      aria-hidden="true"
                      required={field.required}
                      value={value}
                      onChange={() => undefined}
                    />
                  </fieldset>
                );
              }

              return (
                <label className="services-field" key={field.id}>
                  <span>{field.label}{field.required && <em>*</em>}</span>
                  <input
                    type={field.field_type === 'email' ? 'email' : 'text'}
                    inputMode={field.field_type === 'phone' ? 'tel' : undefined}
                    autoComplete={
                      field.field_type === 'phone'
                        ? 'tel'
                        : field.field_type === 'email'
                          ? 'email'
                          : undefined
                    }
                    required={field.required}
                    placeholder={field.placeholder || undefined}
                    value={value}
                    onChange={(event) =>
                      setAnswer(
                        field.key,
                        field.field_type === 'phone'
                          ? formatPhone(event.target.value)
                          : event.target.value,
                      )
                    }
                  />
                </label>
              );
            })}
          </div>

          <div className="services-disclaimer">
            <ShieldCheck size={21} />
            <div>
              <strong>Antes de enviar</strong>
              <p>{settings.disclaimer}</p>
              <label>
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(event) => {
                    setAccepted(event.target.checked);
                    setError('');
                  }}
                />
                <span>Li e estou de acordo com essas condições.</span>
              </label>
            </div>
          </div>

          <input name="website" className="services-honeypot" tabIndex={-1} autoComplete="off" />

          {error && <div className="services-public-error">{error}</div>}

          <button className="services-public-submit" type="submit" disabled={sending}>
            {sending ? (
              <>
                <LoaderCircle className="services-spin" size={18} />
                Enviando...
              </>
            ) : (
              <>
                Enviar solicitação
                <ChevronRight size={18} />
              </>
            )}
          </button>
        </form>
      </section>

      <p className="services-public-footer">
        Comunidade Evangélica Amigo Mais Que Irmão
      </p>
    </main>
  );
}
