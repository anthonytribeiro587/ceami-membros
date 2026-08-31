'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, CircleDollarSign, LoaderCircle, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type PaymentStatus = 'pending' | 'paid' | 'exempt';
type PaymentMethod = 'pix' | 'cash' | 'card' | 'other';

type PaymentMeta = {
  status: PaymentStatus;
  method: PaymentMethod | null;
  amount: number | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
};

type SubmissionLite = {
  id: string;
  respondent_name: string | null;
  respondent_phone: string | null;
  created_at: string;
  answers: Record<string, unknown> | null;
};

type FormLite = {
  id: string;
  title: string;
  price: number | string | null;
};

type EditorState = {
  submissionId: string;
  name: string;
  price: number;
  payment: PaymentMeta;
};

const EMPTY_PAYMENT: PaymentMeta = {
  status: 'pending',
  method: null,
  amount: null,
  confirmedAt: null,
  confirmedBy: null,
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

function paymentFromAnswers(answers: Record<string, unknown> | null | undefined): PaymentMeta {
  const raw = answers?.__payment;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_PAYMENT };
  const data = raw as Record<string, unknown>;
  const status = ['paid', 'exempt'].includes(String(data.status)) ? String(data.status) as PaymentStatus : 'pending';
  const method = ['pix', 'cash', 'card', 'other'].includes(String(data.method)) ? String(data.method) as PaymentMethod : null;
  const amount = Number(data.amount);
  return {
    status,
    method,
    amount: Number.isFinite(amount) ? amount : null,
    confirmedAt: typeof data.confirmedAt === 'string' ? data.confirmedAt : null,
    confirmedBy: typeof data.confirmedBy === 'string' ? data.confirmedBy : null,
  };
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function methodLabel(method: PaymentMethod | null) {
  return ({ pix: 'Pix', cash: 'Dinheiro', card: 'Cartão', other: 'Outro' } as Record<string, string>)[method || ''] || '';
}

function statusLabel(payment: PaymentMeta) {
  if (payment.status === 'paid') return `Pago${payment.method ? ` • ${methodLabel(payment.method)}` : ''}${payment.amount != null ? ` • ${money(payment.amount)}` : ''}`;
  if (payment.status === 'exempt') return 'Isento';
  return 'Pagamento pendente';
}

export default function InlinePaymentsEnhancement() {
  const supabase = useMemo(() => createClient(), []);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [status, setStatus] = useState<PaymentStatus>('paid');
  const [method, setMethod] = useState<PaymentMethod>('pix');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!editor) return;
    const nextStatus = editor.payment.status === 'pending' ? 'paid' : editor.payment.status;
    setStatus(nextStatus);
    setMethod(editor.payment.method || 'pix');
    setAmount(String(editor.payment.amount ?? editor.price ?? 0).replace('.', ','));
  }, [editor]);

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;
    let cachedTitle = '';
    let cachedForm: FormLite | null = null;
    let cachedSubmissions: SubmissionLite[] = [];
    let loading = false;

    function schedule() {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void enhance(), 120);
    }

    function clearInjected(root: ParentNode = document) {
      root.querySelectorAll('[data-ceami-payment-status], [data-ceami-payment-button], [data-ceami-payment-overview]')
        .forEach((node) => node.remove());
    }

    function matchSubmission(card: Element, submissions: SubmissionLite[], used: Set<string>) {
      const cardName = normalize(card.querySelector('.forms-response-name-row h3')?.textContent);
      const cardPhone = digits(card.querySelector('.forms-response-name-row > div > span')?.textContent);
      const cardTime = card.querySelector('time')?.textContent?.trim() || '';

      const exact = submissions.find((submission) => {
        if (used.has(submission.id)) return false;
        const sameName = normalize(submission.respondent_name) === cardName;
        const samePhone = !cardPhone || digits(submission.respondent_phone) === cardPhone;
        const sameTime = new Date(submission.created_at).toLocaleString('pt-BR') === cardTime;
        return sameName && samePhone && sameTime;
      });
      if (exact) return exact;

      return submissions.find((submission) => {
        if (used.has(submission.id)) return false;
        const sameName = normalize(submission.respondent_name) === cardName;
        const samePhone = !cardPhone || digits(submission.respondent_phone) === cardPhone;
        return sameName && samePhone;
      }) || null;
    }

    function renderOverview(form: FormLite, submissions: SubmissionLite[]) {
      const metrics = document.querySelector('.forms-response-metrics');
      if (!metrics || document.querySelector('[data-ceami-payment-overview]')) return;
      const price = Number(form.price) || 0;
      if (price <= 0) return;

      const payments = submissions.map((submission) => paymentFromAnswers(submission.answers));
      const paid = payments.filter((payment) => payment.status === 'paid');
      const exempt = payments.filter((payment) => payment.status === 'exempt').length;
      const pending = payments.filter((payment) => payment.status === 'pending').length;
      const received = paid.reduce((total, payment) => total + (payment.amount ?? price), 0);
      const expected = submissions.length * price;

      const overview = document.createElement('div');
      overview.dataset.ceamiPaymentOverview = 'true';
      overview.className = 'ceami-inline-payment-overview';
      overview.innerHTML = `
        <div><span>Pagamentos</span><strong>${paid.length} pagos</strong></div>
        <div class="pending"><span>Pendentes</span><strong>${pending}</strong></div>
        ${exempt ? `<div><span>Isentos</span><strong>${exempt}</strong></div>` : ''}
        <div class="money"><span>Recebido</span><strong>${money(received)}</strong><small>de ${money(expected)} previsto</small></div>
      `;
      metrics.insertAdjacentElement('afterend', overview);
    }

    function renderCards(form: FormLite, submissions: SubmissionLite[]) {
      const price = Number(form.price) || 0;
      if (price <= 0) return;
      const cards = Array.from(document.querySelectorAll('.forms-response-card'));
      const used = new Set<string>();

      cards.forEach((card) => {
        if (card.querySelector('[data-ceami-payment-button]')) return;
        const submission = matchSubmission(card, submissions, used);
        if (!submission) return;
        used.add(submission.id);

        const payment = paymentFromAnswers(submission.answers);
        const person = card.querySelector('.forms-response-person');
        const actions = card.querySelector('.forms-response-actions');
        const name = submission.respondent_name || card.querySelector('h3')?.textContent?.trim() || 'Inscrição';
        if (!person || !actions) return;

        const badge = document.createElement('div');
        badge.dataset.ceamiPaymentStatus = submission.id;
        badge.className = `ceami-inline-payment-status ${payment.status}`;
        badge.innerHTML = `<span></span><strong>${statusLabel(payment)}</strong>`;
        const tags = person.querySelector('.forms-response-tags');
        if (tags) person.insertBefore(badge, tags);
        else person.appendChild(badge);

        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.ceamiPaymentButton = submission.id;
        button.className = `ceami-inline-payment-button ${payment.status}`;
        button.innerHTML = payment.status === 'pending'
          ? '<span>R$</span> Marcar como pago'
          : payment.status === 'paid'
            ? '<span>✓</span> Editar pagamento'
            : '<span>✓</span> Editar pagamento';
        button.addEventListener('click', () => {
          setEditor({ submissionId: submission.id, name, price, payment });
        });
        actions.appendChild(button);
      });
    }

    function decorate(form: FormLite, submissions: SubmissionLite[], force = false) {
      const responses = document.querySelector('.forms-responses');
      if (!responses) return;
      if (force) clearInjected(responses);
      renderOverview(form, submissions);
      renderCards(form, submissions);
    }

    async function enhance() {
      if (stopped || loading) return;
      const responses = document.querySelector('.forms-responses');
      const title = responses?.querySelector('.forms-responses-head h2')?.textContent?.trim() || '';
      if (!responses || !title) return;

      const allCardsDecorated = Array.from(responses.querySelectorAll('.forms-response-card'))
        .every((card) => Boolean(card.querySelector('[data-ceami-payment-button]')));
      if (title === cachedTitle && cachedForm && allCardsDecorated) return;

      loading = true;
      try {
        if (title !== cachedTitle || !cachedForm) {
          const { data: formData } = await supabase
            .from('forms')
            .select('id, title, price')
            .eq('title', title)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!formData || stopped) return;
          cachedForm = formData as FormLite;
          cachedTitle = title;

          const { data: submissionData } = await supabase
            .from('form_submissions')
            .select('id, respondent_name, respondent_phone, answers, created_at')
            .eq('form_id', cachedForm.id)
            .order('created_at', { ascending: false });
          cachedSubmissions = (submissionData || []) as SubmissionLite[];
        }

        if (cachedForm) decorate(cachedForm, cachedSubmissions);
      } finally {
        loading = false;
      }
    }

    function paymentSaved(event: Event) {
      const custom = event as CustomEvent<{ id: string; payment: PaymentMeta }>;
      const index = cachedSubmissions.findIndex((submission) => submission.id === custom.detail.id);
      if (index >= 0) {
        cachedSubmissions[index] = {
          ...cachedSubmissions[index],
          answers: {
            ...(cachedSubmissions[index].answers || {}),
            __payment: custom.detail.payment,
          },
        };
      }
      if (cachedForm) decorate(cachedForm, cachedSubmissions, true);
    }

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('ceami-inline-payment-saved', paymentSaved);

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener('ceami-inline-payment-saved', paymentSaved);
      clearInjected();
    };
  }, [supabase]);

  async function savePayment() {
    if (!editor || saving) return;
    if (status === 'paid' && !method) return;

    setSaving(true);
    try {
      const response = await fetch('/api/admin/form-payments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: editor.submissionId,
          status,
          method: status === 'paid' ? method : null,
          amount: status === 'paid' ? amount : null,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; payment?: PaymentMeta };
      if (!response.ok || !payload.payment) {
        setNotice(payload.error || 'Não foi possível atualizar o pagamento.');
        return;
      }

      window.dispatchEvent(new CustomEvent('ceami-inline-payment-saved', {
        detail: { id: editor.submissionId, payment: payload.payment },
      }));
      setEditor(null);
      setNotice(status === 'paid' ? 'Pagamento confirmado.' : status === 'exempt' ? 'Inscrição marcada como isenta.' : 'Pagamento voltou para pendente.');
    } finally {
      setSaving(false);
      window.setTimeout(() => setNotice(''), 2600);
    }
  }

  return (
    <>
      <style>{`
        .ceami-inline-payment-overview{display:flex;align-items:stretch;gap:9px;flex-wrap:wrap;margin:-7px 0 18px;padding:11px;border:1px solid #e8dfd4;background:#fbf8f4;border-radius:13px}.ceami-inline-payment-overview>div{min-width:125px;padding:5px 10px;border-right:1px solid #e7ded3;display:grid;gap:2px}.ceami-inline-payment-overview>div:last-child{border-right:0}.ceami-inline-payment-overview span{font-size:10px;color:#81766b;font-weight:700}.ceami-inline-payment-overview strong{font-size:16px;color:#352d25}.ceami-inline-payment-overview .pending strong{color:#96651f}.ceami-inline-payment-overview .money{margin-left:auto;min-width:180px}.ceami-inline-payment-overview small{font-size:10px;color:#91867b}.ceami-inline-payment-status{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11px}.ceami-inline-payment-status>span{width:8px;height:8px;border-radius:50%;background:#d49a35}.ceami-inline-payment-status strong{font-weight:800;color:#8a5c16}.ceami-inline-payment-status.paid>span{background:#4e8c5b}.ceami-inline-payment-status.paid strong{color:#3e754a}.ceami-inline-payment-status.exempt>span{background:#718096}.ceami-inline-payment-status.exempt strong{color:#586575}.forms-response-actions .ceami-inline-payment-button{border-color:#e4cfae;background:#fff8ec;color:#7b531a;font-weight:800}.forms-response-actions .ceami-inline-payment-button.paid{border-color:#c9dfce;background:#edf6ef;color:#376c42}.forms-response-actions .ceami-inline-payment-button.exempt{border-color:#d7dce2;background:#f5f7f9;color:#586575}.ceami-payment-modal-overlay{position:fixed;inset:0;z-index:1900;background:rgba(38,31,25,.52);display:grid;place-items:center;padding:18px}.ceami-payment-modal{width:min(470px,100%);background:#fff;border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.24);overflow:hidden}.ceami-payment-modal header{padding:19px 20px;border-bottom:1px solid #eee7df;display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.ceami-payment-modal header>div{display:flex;gap:11px;align-items:flex-start}.ceami-payment-modal header svg{color:#7a5325}.ceami-payment-modal header h3{margin:0 0 4px;font-size:20px}.ceami-payment-modal header p{margin:0;color:#776d63;font-size:12px}.ceami-payment-modal header>button{width:36px;height:36px;border:1px solid #ddd4ca;background:#fff;border-radius:9px;display:grid;place-items:center}.ceami-payment-body{padding:18px 20px;display:grid;gap:16px}.ceami-payment-status-options{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.ceami-payment-status-options button{min-height:42px;border:1px solid #ded6cc;background:#fff;border-radius:10px;font-weight:800;color:#62574d}.ceami-payment-status-options button.active{border-color:#835a2a;background:#f6ede1;color:#70491b}.ceami-payment-fields{display:grid;grid-template-columns:1fr 1fr;gap:11px}.ceami-payment-fields label{display:grid;gap:6px;font-size:11px;font-weight:800;color:#6e6358}.ceami-payment-fields select,.ceami-payment-fields input{height:43px;border:1px solid #ddd4ca;border-radius:10px;background:#fff;padding:0 11px;font:inherit}.ceami-payment-info{padding:11px 12px;border-radius:10px;background:#f7f4f0;color:#6e645a;font-size:12px;line-height:1.45}.ceami-payment-modal footer{padding:14px 20px 19px;display:flex;justify-content:flex-end;gap:8px}.ceami-payment-modal footer button{min-height:42px;border-radius:10px;padding:0 14px;font-weight:800}.ceami-payment-modal .cancel{border:1px solid #ddd4ca;background:#fff;color:#5c5147}.ceami-payment-modal .save{border:0;background:#70491b;color:#fff;display:inline-flex;align-items:center;gap:7px}.ceami-payment-modal .save:disabled{opacity:.6}.ceami-payment-notice{position:fixed;right:22px;bottom:22px;z-index:2100;background:#2e2823;color:#fff;border-radius:11px;padding:12px 15px;font-size:13px;font-weight:800;box-shadow:0 12px 34px rgba(0,0,0,.2)}@media(max-width:700px){.ceami-inline-payment-overview{display:grid;grid-template-columns:1fr 1fr}.ceami-inline-payment-overview>div{border-right:0;border-bottom:1px solid #e7ded3}.ceami-inline-payment-overview .money{margin-left:0;min-width:0}.forms-response-actions .ceami-inline-payment-button{grid-column:1/-1}.ceami-payment-modal-overlay{padding:0;align-items:end}.ceami-payment-modal{border-radius:18px 18px 0 0}.ceami-payment-fields{grid-template-columns:1fr}.ceami-payment-status-options{grid-template-columns:1fr 1fr 1fr}.ceami-payment-notice{left:12px;right:12px;bottom:82px;text-align:center}}
      `}</style>

      {editor && (
        <div className="ceami-payment-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setEditor(null); }}>
          <section className="ceami-payment-modal" role="dialog" aria-modal="true" aria-label="Pagamento da inscrição">
            <header>
              <div>
                <CircleDollarSign size={25} />
                <div>
                  <h3>Pagamento da inscrição</h3>
                  <p>{editor.name} • Valor do evento: {money(editor.price)}</p>
                </div>
              </div>
              <button type="button" onClick={() => setEditor(null)} aria-label="Fechar"><X size={18} /></button>
            </header>

            <div className="ceami-payment-body">
              <div className="ceami-payment-status-options">
                <button type="button" className={status === 'paid' ? 'active' : ''} onClick={() => setStatus('paid')}>Pago</button>
                <button type="button" className={status === 'pending' ? 'active' : ''} onClick={() => setStatus('pending')}>Pendente</button>
                <button type="button" className={status === 'exempt' ? 'active' : ''} onClick={() => setStatus('exempt')}>Isento</button>
              </div>

              {status === 'paid' ? (
                <div className="ceami-payment-fields">
                  <label>
                    Forma de pagamento
                    <select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
                      <option value="pix">Pix</option>
                      <option value="cash">Dinheiro</option>
                      <option value="card">Cartão</option>
                      <option value="other">Outro</option>
                    </select>
                  </label>
                  <label>
                    Valor recebido
                    <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9,.]/g, ''))} />
                  </label>
                </div>
              ) : (
                <div className="ceami-payment-info">
                  {status === 'pending'
                    ? 'A inscrição continuará registrada, mas ficará sinalizada como pagamento pendente.'
                    : 'Use Isento quando a pessoa não precisar realizar o pagamento.'}
                </div>
              )}
            </div>

            <footer>
              <button type="button" className="cancel" onClick={() => setEditor(null)}>Cancelar</button>
              <button type="button" className="save" disabled={saving} onClick={() => void savePayment()}>
                {saving ? <LoaderCircle className="forms-spin" size={17} /> : <Check size={17} />}
                {saving ? 'Salvando...' : 'Salvar pagamento'}
              </button>
            </footer>
          </section>
        </div>
      )}

      {notice && <div className="ceami-payment-notice">{notice}</div>}
    </>
  );
}
