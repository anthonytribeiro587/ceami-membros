'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BadgeDollarSign,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Download,
  LoaderCircle,
  MessageCircle,
  Search,
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type PaymentStatus = 'pending' | 'paid' | 'exempt';
type PaymentMethod = 'pix' | 'cash' | 'card' | 'other';

type FormRow = {
  id: string;
  title: string;
  slug: string;
  description: string;
  price: number | string | null;
  active: boolean;
};

type SubmissionRow = {
  id: string;
  form_id: string;
  respondent_name: string | null;
  respondent_phone: string | null;
  answers: Record<string, unknown>;
  created_at: string;
  payment_status?: PaymentStatus | null;
  payment_method?: PaymentMethod | null;
  amount_paid?: number | string | null;
  payment_confirmed_at?: string | null;
  payment_confirmed_by_name?: string | null;
};

type PaymentDraft = {
  submissionId: string;
  status: PaymentStatus;
  method: PaymentMethod;
  amount: string;
};

const METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'Pix',
  cash: 'Dinheiro',
  card: 'Cartão',
  other: 'Outro',
};

function money(value: unknown) {
  const number = Number(value || 0);
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number.isFinite(number) ? number : 0);
}

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function display(value: unknown) {
  const text = String(value ?? '').trim();
  return text || 'Não informado';
}

function csvEscape(value: unknown) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function statusOf(submission: SubmissionRow): PaymentStatus {
  return submission.payment_status === 'paid' || submission.payment_status === 'exempt'
    ? submission.payment_status
    : 'pending';
}

function statusLabel(status: PaymentStatus) {
  if (status === 'paid') return 'Pago';
  if (status === 'exempt') return 'Isento';
  return 'Pendente';
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'CE';
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function findAnswer(submission: SubmissionRow, term: string) {
  const entry = Object.entries(submission.answers || {}).find(([key]) => normalize(key).includes(term));
  return entry ? display(entry[1]) : '';
}

export default function FormPaymentsClient() {
  const supabase = useMemo(() => createClient(), []);
  const [forms, setForms] = useState<FormRow[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [selectedFormId, setSelectedFormId] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PaymentStatus>('all');
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function loadData() {
    setLoading(true);
    setError('');
    setSchemaMissing(false);

    const formsResult = await supabase
      .from('forms')
      .select('id, title, slug, description, price, active')
      .not('price', 'is', null)
      .gt('price', 0)
      .order('created_at', { ascending: false });

    if (formsResult.error) {
      setError(formsResult.error.message);
      setLoading(false);
      return;
    }

    const submissionResult = await supabase
      .from('form_submissions')
      .select('id, form_id, respondent_name, respondent_phone, answers, created_at, payment_status, payment_method, amount_paid, payment_confirmed_at, payment_confirmed_by_name')
      .order('created_at', { ascending: false });

    if (submissionResult.error) {
      const missing = submissionResult.error.code === '42703' || normalize(submissionResult.error.message).includes('payment_status');
      setSchemaMissing(missing);
      setError(missing ? '' : submissionResult.error.message);
      setForms((formsResult.data || []) as FormRow[]);
      setLoading(false);
      return;
    }

    const loadedForms = (formsResult.data || []) as FormRow[];
    setForms(loadedForms);
    setSubmissions((submissionResult.data || []) as SubmissionRow[]);
    setSelectedFormId((current) => current || loadedForms[0]?.id || '');
    setLoading(false);
  }

  const selectedForm = forms.find((form) => form.id === selectedFormId) || null;
  const formPrice = Number(selectedForm?.price || 0);
  const formSubmissions = submissions.filter((submission) => submission.form_id === selectedFormId);
  const paidRows = formSubmissions.filter((submission) => statusOf(submission) === 'paid');
  const pendingRows = formSubmissions.filter((submission) => statusOf(submission) === 'pending');
  const exemptRows = formSubmissions.filter((submission) => statusOf(submission) === 'exempt');
  const receivedTotal = paidRows.reduce((sum, submission) => sum + Number(submission.amount_paid ?? formPrice), 0);
  const expectedTotal = formSubmissions.length * formPrice;
  const pendingTotal = pendingRows.length * formPrice;

  const filteredRows = useMemo(() => {
    const needle = normalize(query.trim());
    return formSubmissions.filter((submission) => {
      const status = statusOf(submission);
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (!needle) return true;
      const haystack = normalize([
        submission.respondent_name,
        submission.respondent_phone,
        ...Object.values(submission.answers || {}),
      ].join(' '));
      return haystack.includes(needle);
    });
  }, [formSubmissions, query, statusFilter]);

  function openPayment(submission: SubmissionRow) {
    const status = statusOf(submission);
    setPaymentDraft({
      submissionId: submission.id,
      status,
      method: submission.payment_method || 'pix',
      amount: status === 'paid'
        ? String(submission.amount_paid ?? formPrice).replace('.', ',')
        : String(formPrice).replace('.', ','),
    });
  }

  async function updatePayment(status: PaymentStatus) {
    if (!paymentDraft || saving) return;
    setSaving(true);

    const amount = Number(paymentDraft.amount.replace(',', '.'));
    if (status === 'paid' && (!Number.isFinite(amount) || amount < 0)) {
      setToast('Informe um valor válido');
      setSaving(false);
      return;
    }

    const payload = status === 'paid'
      ? {
          payment_status: 'paid',
          payment_method: paymentDraft.method,
          amount_paid: amount,
        }
      : status === 'exempt'
        ? {
            payment_status: 'exempt',
            payment_method: null,
            amount_paid: 0,
          }
        : {
            payment_status: 'pending',
            payment_method: null,
            amount_paid: null,
          };

    const { data, error: updateError } = await supabase
      .from('form_submissions')
      .update(payload)
      .eq('id', paymentDraft.submissionId)
      .select('id, form_id, respondent_name, respondent_phone, answers, created_at, payment_status, payment_method, amount_paid, payment_confirmed_at, payment_confirmed_by_name')
      .single();

    if (updateError || !data) {
      setToast(updateError?.message || 'Não foi possível atualizar o pagamento');
      setSaving(false);
      return;
    }

    setSubmissions((current) => current.map((submission) => submission.id === data.id ? data as SubmissionRow : submission));
    setPaymentDraft(null);
    setToast(status === 'paid' ? 'Pagamento confirmado' : status === 'exempt' ? 'Inscrição marcada como isenta' : 'Pagamento voltou para pendente');
    setSaving(false);
  }

  function exportPayments() {
    if (!selectedForm) return;
    const header = [
      'Nome',
      'Telefone',
      'Status do pagamento',
      'Valor previsto',
      'Valor pago',
      'Forma',
      'Confirmado em',
      'Confirmado por',
      'Data da inscrição',
      'Respostas',
    ].map(csvEscape).join(';');

    const rows = formSubmissions.map((submission) => {
      const status = statusOf(submission);
      const answers = Object.entries(submission.answers || {}).map(([key, value]) => `${key}: ${display(value)}`).join(' | ');
      return [
        submission.respondent_name || display(submission.answers?.nome_completo),
        submission.respondent_phone || '',
        statusLabel(status),
        formPrice.toFixed(2).replace('.', ','),
        status === 'paid' ? Number(submission.amount_paid ?? formPrice).toFixed(2).replace('.', ',') : '',
        submission.payment_method ? METHOD_LABELS[submission.payment_method] : '',
        submission.payment_confirmed_at ? new Date(submission.payment_confirmed_at).toLocaleString('pt-BR') : '',
        submission.payment_confirmed_by_name || '',
        new Date(submission.created_at).toLocaleString('pt-BR'),
        answers,
      ].map(csvEscape).join(';');
    });

    const blob = new Blob([`\uFEFF${[header, ...rows].join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedForm.slug}-pagamentos.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="payments-loading"><LoaderCircle className="payments-spin" />Carregando pagamentos...</div>;
  }

  if (schemaMissing) {
    return (
      <section className="payments-schema-warning">
        <BadgeDollarSign size={30} />
        <div>
          <strong>Controle de pagamentos pronto no aplicativo</strong>
          <p>Falta aplicar no Supabase a migration <code>202608310002_form_payments.sql</code> para habilitar os status Pago, Pendente e Isento.</p>
        </div>
      </section>
    );
  }

  if (error) {
    return <section className="payments-schema-warning"><div><strong>Não foi possível carregar os pagamentos</strong><p>{error}</p></div></section>;
  }

  return (
    <div className="payments-page">
      <header className="payments-header">
        <div>
          <span>CEAMI • INSCRIÇÕES</span>
          <h1>Controle de pagamentos</h1>
          <p>Recebeu o comprovante no WhatsApp? Localize a pessoa e confirme o pagamento aqui.</p>
        </div>
        {selectedForm && <button type="button" className="payments-export" onClick={exportPayments}><Download size={17} />Exportar pagamentos</button>}
      </header>

      {forms.length > 1 && (
        <label className="payments-form-select">
          <span>Evento / formulário</span>
          <select value={selectedFormId} onChange={(event) => { setSelectedFormId(event.target.value); setStatusFilter('all'); setQuery(''); }}>
            {forms.map((form) => <option value={form.id} key={form.id}>{form.title}</option>)}
          </select>
        </label>
      )}

      {!selectedForm ? (
        <section className="payments-empty">
          <CircleDollarSign />
          <h2>Nenhum formulário com cobrança</h2>
          <p>Quando um formulário tiver valor maior que zero, o controle financeiro aparecerá aqui automaticamente.</p>
        </section>
      ) : (
        <>
          <section className="payments-event-bar">
            <div><span>EVENTO</span><strong>{selectedForm.title}</strong></div>
            <div><span>VALOR POR INSCRIÇÃO</span><strong>{money(formPrice)}</strong></div>
            <div><span>TOTAL PREVISTO</span><strong>{money(expectedTotal)}</strong></div>
          </section>

          <section className="payments-metrics">
            <article><UsersRound /><div><span>Inscritos</span><strong>{formSubmissions.length}</strong></div></article>
            <article className="paid"><CheckCircle2 /><div><span>Pagos</span><strong>{paidRows.length}</strong><small>{money(receivedTotal)} recebido</small></div></article>
            <article className="pending"><Clock3 /><div><span>Pendentes</span><strong>{pendingRows.length}</strong><small>{money(pendingTotal)} a receber</small></div></article>
            <article><ShieldCheck /><div><span>Isentos</span><strong>{exemptRows.length}</strong></div></article>
          </section>

          <section className="payments-tools">
            <label className="payments-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nome, telefone ou resposta..." /></label>
            <div className="payments-status-tabs" aria-label="Filtrar pagamentos">
              <button type="button" className={statusFilter === 'all' ? 'active' : ''} onClick={() => setStatusFilter('all')}>Todos <b>{formSubmissions.length}</b></button>
              <button type="button" className={statusFilter === 'pending' ? 'active' : ''} onClick={() => setStatusFilter('pending')}>Pendentes <b>{pendingRows.length}</b></button>
              <button type="button" className={statusFilter === 'paid' ? 'active' : ''} onClick={() => setStatusFilter('paid')}>Pagos <b>{paidRows.length}</b></button>
              <button type="button" className={statusFilter === 'exempt' ? 'active' : ''} onClick={() => setStatusFilter('exempt')}>Isentos <b>{exemptRows.length}</b></button>
            </div>
          </section>

          <div className="payments-result-count"><strong>{filteredRows.length}</strong> inscrição{filteredRows.length === 1 ? '' : 'ões'} exibida{filteredRows.length === 1 ? '' : 's'}</div>

          {filteredRows.length ? (
            <section className="payments-list">
              {filteredRows.map((submission) => {
                const status = statusOf(submission);
                const name = submission.respondent_name || display(submission.answers?.nome_completo);
                const phone = submission.respondent_phone || '';
                const digits = phone.replace(/\D/g, '');
                const whatsapp = digits.length >= 10 ? (digits.startsWith('55') ? digits : `55${digits}`) : '';
                const apostila = findAnswer(submission, 'apostila');
                return (
                  <article className="payment-person-card" key={submission.id}>
                    <div className="payment-person-avatar">{initials(name)}</div>
                    <div className="payment-person-main">
                      <div className="payment-person-title">
                        <div>
                          <h3>{name}</h3>
                          <p>{phone || 'Telefone não informado'}{apostila ? <><span>•</span>Apostila: <b>{apostila}</b></> : null}</p>
                        </div>
                        <span className={`payment-status ${status}`}>{status === 'paid' && <CheckCircle2 size={15} />}{status === 'pending' && <Clock3 size={15} />}{status === 'exempt' && <ShieldCheck size={15} />}{statusLabel(status)}</span>
                      </div>

                      <div className="payment-person-info">
                        <div><span>Inscrição</span><strong>{new Date(submission.created_at).toLocaleString('pt-BR')}</strong></div>
                        <div><span>Valor</span><strong>{status === 'paid' ? `${money(submission.amount_paid ?? formPrice)} pago` : status === 'exempt' ? 'Isento' : `${money(formPrice)} pendente`}</strong></div>
                        {status === 'paid' && <div><span>Pagamento</span><strong>{submission.payment_method ? METHOD_LABELS[submission.payment_method] : 'Confirmado'}</strong></div>}
                        {status !== 'pending' && submission.payment_confirmed_at && <div><span>Confirmado</span><strong>{new Date(submission.payment_confirmed_at).toLocaleString('pt-BR')}</strong></div>}
                      </div>

                      {status !== 'pending' && submission.payment_confirmed_by_name && <small className="payment-audit">Confirmado por {submission.payment_confirmed_by_name}</small>}
                    </div>
                    <div className="payment-person-actions">
                      {whatsapp && <a href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Olá, ${name}! Tudo bem? Estou entrando em contato sobre sua inscrição em ${selectedForm.title}.`)}`} target="_blank" rel="noreferrer"><MessageCircle size={16} />WhatsApp</a>}
                      <button type="button" className={status === 'pending' ? 'confirm' : ''} onClick={() => openPayment(submission)}>{status === 'pending' ? <><CheckCircle2 size={17} />Confirmar pagamento</> : <><Banknote size={17} />Alterar pagamento</>}</button>
                    </div>
                  </article>
                );
              })}
            </section>
          ) : (
            <section className="payments-empty compact"><Search /><h2>Ninguém encontrado</h2><p>Tente limpar a busca ou mudar o filtro de pagamento.</p></section>
          )}
        </>
      )}

      {paymentDraft && selectedForm && (() => {
        const submission = submissions.find((item) => item.id === paymentDraft.submissionId);
        const name = submission?.respondent_name || display(submission?.answers?.nome_completo);
        return (
          <div className="payment-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setPaymentDraft(null); }}>
            <section className="payment-modal" role="dialog" aria-modal="true" aria-label="Confirmar pagamento">
              <header>
                <div><span>PAGAMENTO DA INSCRIÇÃO</span><h2>{name}</h2><p>{selectedForm.title}</p></div>
                <button type="button" onClick={() => setPaymentDraft(null)} aria-label="Fechar"><X /></button>
              </header>

              <div className="payment-modal-value"><span>Valor da inscrição</span><strong>{money(formPrice)}</strong></div>

              <div className="payment-modal-fields">
                <label><span>Forma de pagamento</span><select value={paymentDraft.method} onChange={(event) => setPaymentDraft((current) => current ? { ...current, method: event.target.value as PaymentMethod } : current)}><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="card">Cartão</option><option value="other">Outro</option></select></label>
                <label><span>Valor recebido</span><div className="payment-amount-input"><b>R$</b><input inputMode="decimal" value={paymentDraft.amount} onChange={(event) => setPaymentDraft((current) => current ? { ...current, amount: event.target.value.replace(/[^0-9,.]/g, '') } : current)} /></div></label>
              </div>

              <div className="payment-modal-note"><ShieldCheck size={17} /><p>Ao confirmar, o sistema registra automaticamente a data, o horário e quem fez a confirmação.</p></div>

              <div className="payment-modal-actions">
                {paymentDraft.status !== 'pending' && <button type="button" className="secondary" disabled={saving} onClick={() => void updatePayment('pending')}>Voltar para pendente</button>}
                <button type="button" className="secondary" disabled={saving} onClick={() => void updatePayment('exempt')}>Marcar isento</button>
                <button type="button" className="primary" disabled={saving} onClick={() => void updatePayment('paid')}>{saving ? <LoaderCircle className="payments-spin" size={18} /> : <CheckCircle2 size={18} />}{saving ? 'Salvando...' : 'Confirmar pagamento'}</button>
              </div>
            </section>
          </div>
        );
      })()}

      {toast && <div className="payments-toast">{toast}</div>}
    </div>
  );
}
