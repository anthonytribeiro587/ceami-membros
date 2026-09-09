'use client';

import { useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  SEMINAR_APOCALIPSE_SLUG,
  seminarChoicePrice,
} from '@/lib/seminar-apocalipse';

type SubmissionLite = {
  id: string;
  respondent_name: string | null;
  respondent_phone: string | null;
  answers: Record<string, unknown> | null;
  created_at: string;
};

type PaymentStatus = 'pending' | 'paid' | 'exempt';
type PaymentMethod = 'pix' | 'cash' | 'card' | 'other';

type PaymentMeta = {
  status: PaymentStatus;
  method: PaymentMethod | null;
  amount: number | null;
};

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function paymentFromAnswers(answers: Record<string, unknown> | null | undefined): PaymentMeta {
  const raw = answers?.__payment;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 'pending', method: null, amount: null };
  }

  const data = raw as Record<string, unknown>;
  const status = data.status === 'paid' || data.status === 'exempt' ? data.status : 'pending';
  const method = data.method === 'pix' || data.method === 'cash' || data.method === 'card' || data.method === 'other'
    ? data.method
    : null;
  const parsedAmount = data.amount == null || data.amount === '' ? Number.NaN : Number(data.amount);

  return {
    status,
    method,
    amount: Number.isFinite(parsedAmount) ? parsedAmount : null,
  };
}

function materialLabel(answers: Record<string, unknown> | null | undefined) {
  const raw = String(answers?.apostila ?? '').trim();
  const normalized = normalize(raw);
  if (!raw || normalized === 'nao' || normalized.includes('sem custo') || normalized.includes('sem apostila')) {
    return 'Sem apostila';
  }
  if (normalized.includes('fisic') || normalized === 'sim') return 'Física';
  if (normalized.includes('pdf') || normalized.includes('digital')) return 'PDF';

  return raw
    .replace(/\s*\(?R\$\s*[0-9.]+(?:,[0-9]{1,2})?\)?\s*$/i, '')
    .trim() || raw;
}

function methodLabel(method: PaymentMethod | null) {
  return ({ pix: 'PIX', cash: 'DINHEIRO', card: 'CARTÃO', other: 'OUTRO' } as Record<string, string>)[method || ''] || '';
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value || 0);
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function nameOf(submission: SubmissionLite) {
  return submission.respondent_name
    || String(submission.answers?.nome_completo ?? '').trim()
    || 'Não informado';
}

export default function SeminarPrintReport() {
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;
    let checking = false;

    async function printReport(formId: string) {
      const popup = window.open('', '_blank', 'noopener,noreferrer');
      if (!popup) {
        window.alert('O navegador bloqueou a janela de impressão. Libere pop-ups para este site e tente novamente.');
        return;
      }

      popup.document.write('<!doctype html><html><head><title>Gerando lista...</title></head><body style="font-family:Arial,sans-serif;padding:24px">Gerando lista...</body></html>');
      popup.document.close();

      const [{ data: formData, error: formError }, { data: submissionData, error: submissionError }] = await Promise.all([
        supabase.from('forms').select('id, title, slug').eq('id', formId).maybeSingle(),
        supabase
          .from('form_submissions')
          .select('id, respondent_name, respondent_phone, answers, created_at')
          .eq('form_id', formId)
          .order('created_at', { ascending: true }),
      ]);

      if (formError || submissionError || !formData || formData.slug !== SEMINAR_APOCALIPSE_SLUG) {
        popup.document.open();
        popup.document.write('<!doctype html><html><body style="font-family:Arial,sans-serif;padding:24px"><h2>Não foi possível gerar a lista.</h2><p>Atualize a tela e tente novamente.</p></body></html>');
        popup.document.close();
        return;
      }

      const submissions = ((submissionData || []) as SubmissionLite[])
        .slice()
        .sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'pt-BR', { sensitivity: 'base' }));

      let paidCount = 0;
      let pendingCount = 0;

      const rows = submissions.map((submission, index) => {
        const payment = paymentFromAnswers(submission.answers);
        const due = seminarChoicePrice(submission.answers?.apostila);

        let paymentStatus = 'SEM CUSTO';
        let paymentMethod = '';
        let amount = '—';

        if (due > 0) {
          amount = money(due);
          if (payment.status === 'paid') {
            paidCount += 1;
            paymentStatus = 'PAGO';
            paymentMethod = methodLabel(payment.method);
          } else if (payment.status === 'exempt') {
            paymentStatus = 'ISENTO';
          } else {
            pendingCount += 1;
            paymentStatus = 'PENDENTE';
          }
        }

        return `
          <tr>
            <td class="number">${index + 1}</td>
            <td class="name">${escapeHtml(nameOf(submission))}</td>
            <td>${escapeHtml(materialLabel(submission.answers))}</td>
            <td class="money">${escapeHtml(amount)}</td>
            <td>${escapeHtml(paymentMethod)}</td>
            <td class="status ${paymentStatus.toLowerCase()}">${escapeHtml(paymentStatus)}</td>
            <td class="attendance"></td>
          </tr>
        `;
      }).join('');

      const generatedAt = new Date().toLocaleString('pt-BR');
      const title = `LISTA – ${String(formData.title || 'SEMINÁRIO APOCALIPSE 2026').toUpperCase()}`;

      const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; background: #fff; }
    .sheet { width: 100%; }
    h1 { margin: 0 0 5mm; text-align: center; font-size: 16px; letter-spacing: .25px; color: #7b2d2d; }
    .meta { display: flex; flex-wrap: wrap; gap: 5mm; margin: 0 0 4mm; font-size: 9px; }
    .meta strong { font-size: 10px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8.6px; }
    th, td { border: 1px solid #222; padding: 2.2mm 1.5mm; vertical-align: middle; }
    th { background: #f0f0f0; text-transform: uppercase; font-size: 7.8px; letter-spacing: .2px; }
    td { height: 8mm; }
    .number { width: 5%; text-align: center; }
    .name { width: 29%; font-weight: 600; }
    th:nth-child(3) { width: 13%; }
    th:nth-child(4) { width: 11%; }
    th:nth-child(5) { width: 12%; }
    th:nth-child(6) { width: 14%; }
    th:nth-child(7) { width: 16%; }
    .money { text-align: right; white-space: nowrap; }
    .status { font-weight: 700; text-align: center; }
    .pago { color: #1e5d2b; }
    .pendente { color: #8b4f00; }
    .attendance { min-height: 8mm; }
    .footer { margin-top: 3mm; display: flex; justify-content: space-between; font-size: 7.5px; color: #555; }
    .print-actions { margin: 0 0 5mm; display: flex; justify-content: flex-end; }
    .print-actions button { border: 0; border-radius: 8px; background: #5d3c1e; color: #fff; font-weight: 700; padding: 9px 14px; cursor: pointer; }
    @media print {
      .print-actions { display: none !important; }
      h1 { margin-top: 0; }
    }
  </style>
</head>
<body>
  <main class="sheet">
    <div class="print-actions"><button onclick="window.print()">Imprimir / Salvar em PDF</button></div>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">
      <span>Inscritos: <strong>${submissions.length}</strong></span>
      <span>Pagos: <strong>${paidCount}</strong></span>
      <span>Pendentes: <strong>${pendingCount}</strong></span>
      <span>Gerado em: <strong>${escapeHtml(generatedAt)}</strong></span>
    </div>
    <table>
      <thead>
        <tr>
          <th>Nº</th>
          <th>Nome</th>
          <th>Apostila</th>
          <th>Valor</th>
          <th>F. Pag.</th>
          <th>Pagamento</th>
          <th>Participação</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="7" style="text-align:center">Nenhuma inscrição encontrada.</td></tr>'}</tbody>
    </table>
    <div class="footer"><span>CEAMI Membros</span><span>Lista para controle interno</span></div>
  </main>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 250);
    });
  </script>
</body>
</html>`;

      popup.document.open();
      popup.document.write(html);
      popup.document.close();
    }

    async function enhance() {
      if (stopped || checking) return;
      const responses = document.querySelector<HTMLElement>('.forms-responses');
      if (!responses) return;

      const formId = responses.dataset.formId || '';
      if (!formId) return;

      const actions = responses.querySelector<HTMLElement>('.forms-responses-head > div:last-child');
      if (!actions) return;

      const existing = actions.querySelector<HTMLButtonElement>('[data-ceami-seminar-print]');
      if (existing?.dataset.formId === formId) return;
      existing?.remove();

      checking = true;
      try {
        const { data: formData } = await supabase
          .from('forms')
          .select('id, slug')
          .eq('id', formId)
          .maybeSingle();

        if (stopped || !formData || formData.slug !== SEMINAR_APOCALIPSE_SLUG) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary ceami-seminar-print-button';
        button.dataset.ceamiSeminarPrint = 'true';
        button.dataset.formId = formId;
        button.innerHTML = '<span aria-hidden="true">▣</span> Gerar PDF / Imprimir';
        button.addEventListener('click', () => void printReport(formId));
        actions.prepend(button);
      } finally {
        checking = false;
      }
    }

    function schedule() {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void enhance(), 100);
    }

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      observer.disconnect();
      document.querySelectorAll('[data-ceami-seminar-print]').forEach((node) => node.remove());
    };
  }, [supabase]);

  return (
    <style>{`
      .forms-responses-head .ceami-seminar-print-button{display:inline-flex;align-items:center;gap:7px;border-color:#cdb995;background:#fffaf2;color:#69471f;font-weight:900}
      .forms-responses-head .ceami-seminar-print-button>span{font-size:15px;line-height:1}
      @media(max-width:700px){.forms-responses-head .ceami-seminar-print-button{width:100%;justify-content:center}}
    `}</style>
  );
}
