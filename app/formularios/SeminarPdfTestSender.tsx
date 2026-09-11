'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SEMINAR_APOCALIPSE_SLUG } from '@/lib/seminar-apocalipse';

const MAX_FILE_BYTES = 8 * 1024 * 1024;

type Recipient = {
  id: string;
  name: string;
  originalPhone: string;
  normalizedPhone: string;
  status: 'confirmed' | 'warning' | 'invalid';
  reason: string;
};

type PreflightPayload = {
  error?: string;
  summary?: { total: number; confirmed: number; warnings: number; invalid: number; readyForBulk: boolean };
  recipients?: Recipient[];
};

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  const national = digits.startsWith('55') ? digits.slice(2) : digits;
  if (national.length === 11) return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
  if (national.length === 10) return `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
  return value || '—';
}

export default function SeminarPdfTestSender() {
  const supabase = useMemo(() => createClient(), []);
  const singleInputRef = useRef<HTMLInputElement | null>(null);
  const mirrorInputRef = useRef<HTMLInputElement | null>(null);
  const [activeFormId, setActiveFormId] = useState('');
  const [sendingSingle, setSendingSingle] = useState(false);
  const [sendingMirror, setSendingMirror] = useState(false);
  const [checkingRecipients, setCheckingRecipients] = useState(false);
  const [preflight, setPreflight] = useState<PreflightPayload | null>(null);
  const [showOnlyReview, setShowOnlyReview] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState<'ok' | 'error'>('ok');

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;
    let checking = false;

    async function detect() {
      if (stopped || checking) return;
      const responses = document.querySelector<HTMLElement>('.forms-responses');
      const formId = responses?.dataset.formId || '';
      if (!formId) {
        setActiveFormId('');
        setPreflight(null);
        setShowOnlyReview(false);
        return;
      }
      if (formId === activeFormId) return;
      checking = true;
      try {
        const { data } = await supabase.from('forms').select('id, slug').eq('id', formId).maybeSingle();
        if (stopped) return;
        setActiveFormId(data?.slug === SEMINAR_APOCALIPSE_SLUG ? formId : '');
        setPreflight(null);
        setShowOnlyReview(false);
      } finally {
        checking = false;
      }
    }

    function schedule() {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void detect(), 120);
    }

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [activeFormId, supabase]);

  if (!activeFormId) return null;

  async function checkRecipients() {
    setCheckingRecipients(true);
    setNotice('');
    try {
      const response = await fetch('/api/admin/forms/seminar-apocalipse/preflight', { method: 'GET', cache: 'no-store' });
      const payload = await response.json().catch(() => ({})) as PreflightPayload;
      if (!response.ok) {
        setNoticeType('error');
        setNotice(payload.error || 'Não foi possível preparar o envio.');
        return;
      }
      setPreflight(payload);
      const pendingReview = (payload.summary?.warnings || 0) + (payload.summary?.invalid || 0);
      setShowOnlyReview(pendingReview > 0);
    } finally {
      setCheckingRecipients(false);
    }
  }

  function validatePdf(file: File) {
    if (file.type !== 'application/pdf') return 'Selecione um arquivo PDF.';
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) return 'O PDF deve ter no máximo 8 MB.';
    return '';
  }

  async function sendSingleTest(file: File) {
    const error = validatePdf(file);
    if (error) {
      setNoticeType('error');
      setNotice(error);
      return;
    }
    if (!window.confirm(`Enviar este PDF somente para (51) 99509-2781?\n\nArquivo: ${file.name}`)) return;

    setSendingSingle(true);
    setNotice('');
    try {
      const body = new FormData();
      body.append('file', file, file.name);
      const response = await fetch('/api/admin/forms/seminar-apocalipse/send-pdf-test', { method: 'POST', body });
      const payload = await response.json().catch(() => ({})) as { error?: string; destination?: string };
      if (!response.ok) {
        setNoticeType('error');
        setNotice(payload.error || 'Não foi possível enviar o teste.');
        return;
      }
      setNoticeType('ok');
      setNotice(`Teste individual enviado para ${payload.destination || '(51) 99509-2781'}.`);
    } finally {
      setSendingSingle(false);
      if (singleInputRef.current) singleInputRef.current.value = '';
    }
  }

  async function sendMirrorTest(file: File) {
    const error = validatePdf(file);
    if (error) {
      setNoticeType('error');
      setNotice(error);
      return;
    }

    const total = preflight?.summary?.total || 0;
    if (!preflight?.summary?.readyForBulk) {
      setNoticeType('error');
      setNotice('Clique em “Preparar envio” e revise os números antes do teste geral.');
      return;
    }

    const confirmed = window.confirm(
      `TESTE GERAL ESPELHO\n\nO sistema vai simular ${total} envio(s), mas TODAS as cópias irão somente para (51) 99509-2781.\n\nNenhum inscrito receberá nada.\n\nContinuar?`,
    );
    if (!confirmed) return;

    setSendingMirror(true);
    setNotice('');
    try {
      const body = new FormData();
      body.append('file', file, file.name);
      const response = await fetch('/api/admin/forms/seminar-apocalipse/send-bulk-mirror-test', { method: 'POST', body });
      const payload = await response.json().catch(() => ({})) as { error?: string; sent?: number; total?: number; destination?: string };
      if (!response.ok) {
        setNoticeType('error');
        setNotice(payload.error || 'O teste geral não foi concluído.');
        return;
      }
      setNoticeType('ok');
      setNotice(`Teste geral concluído: ${payload.sent}/${payload.total} cópias enviadas somente para ${payload.destination || '(51) 99509-2781'}. Nenhum inscrito recebeu.`);
    } finally {
      setSendingMirror(false);
      if (mirrorInputRef.current) mirrorInputRef.current.value = '';
    }
  }

  const summary = preflight?.summary;
  const recipients = preflight?.recipients || [];
  const reviewCount = (summary?.warnings || 0) + (summary?.invalid || 0);
  const visibleRecipients = showOnlyReview
    ? recipients.filter((item) => item.status !== 'confirmed')
    : recipients;

  return (
    <section className="ceami-seminar-pdf-test" aria-label="Envio da apostila em PDF">
      <div className="ceami-seminar-pdf-test-head">
        <div>
          <strong>Envio da apostila PDF</strong>
          <span>Prepare a lista, confira rapidamente e depois faça o teste geral no seu próprio número.</span>
        </div>
        <div className="ceami-seminar-pdf-actions">
          <button type="button" className="secondary" disabled={checkingRecipients} onClick={() => void checkRecipients()}>
            {checkingRecipients ? 'Preparando...' : 'Preparar envio'}
          </button>
          <button type="button" className="secondary" disabled={sendingSingle} onClick={() => singleInputRef.current?.click()}>
            {sendingSingle ? 'Enviando...' : 'Teste individual'}
          </button>
          <button type="button" disabled={sendingMirror || !summary?.readyForBulk} onClick={() => mirrorInputRef.current?.click()}>
            {sendingMirror ? 'Testando envio geral...' : `Testar envio geral${summary?.readyForBulk ? ` (${summary.total})` : ''}`}
          </button>
        </div>
      </div>

      <input ref={singleInputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void sendSingleTest(file); }} />
      <input ref={mirrorInputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void sendMirrorTest(file); }} />

      {summary && (
        <div className="ceami-preflight">
          <div className={summary.readyForBulk ? 'ceami-ready-line ok' : 'ceami-ready-line review'}>
            <strong>{summary.total} pagos com PDF</strong>
            <span>{summary.readyForBulk ? '✓ Todos prontos para o teste' : `⚠ ${reviewCount} número(s) para revisar`}</span>
          </div>

          {reviewCount > 0 && (
            <div className="ceami-recipient-filters" role="group" aria-label="Filtro da lista de destinatários">
              <button
                type="button"
                className={!showOnlyReview ? 'active' : ''}
                onClick={() => setShowOnlyReview(false)}
              >
                Todos ({summary.total})
              </button>
              <button
                type="button"
                className={showOnlyReview ? 'active review' : 'review'}
                onClick={() => setShowOnlyReview(true)}
              >
                Só revisar ({reviewCount})
              </button>
            </div>
          )}

          <div className="ceami-preflight-table-wrap">
            <table className="ceami-preflight-table">
              <thead><tr><th>Nome</th><th>WhatsApp</th><th>Status</th></tr></thead>
              <tbody>
                {visibleRecipients.map((item) => {
                  const ok = item.status === 'confirmed';
                  return (
                    <tr key={item.id}>
                      <td><strong>{item.name}</strong></td>
                      <td>{formatPhone(item.normalizedPhone || item.originalPhone)}</td>
                      <td>
                        <span className={`ceami-simple-status ${ok ? 'ok' : 'review'}`}>{ok ? '✓ OK' : '⚠ Revisar'}</span>
                        {!ok && <small>{item.reason}</small>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {notice && <p className={noticeType}>{notice}</p>}
      <style>{`
        .ceami-seminar-pdf-test{margin:14px 0 0;padding:14px 15px;border:1px solid #e4d7c3;border-radius:14px;background:#fffaf3;display:grid;gap:12px}.ceami-seminar-pdf-test-head{display:flex;justify-content:space-between;gap:14px;align-items:center}.ceami-seminar-pdf-test-head>div:first-child{display:grid;gap:3px}.ceami-seminar-pdf-test strong{color:#5b3d1e;font-size:13px}.ceami-seminar-pdf-test span{color:#7b6b5b;font-size:11px;line-height:1.4}.ceami-seminar-pdf-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.ceami-seminar-pdf-test button{border:0;border-radius:10px;background:#64431f;color:#fff;font-weight:900;padding:10px 13px;cursor:pointer}.ceami-seminar-pdf-test button.secondary{background:#fff;border:1px solid #cdb995;color:#69471f}.ceami-seminar-pdf-test button:disabled{opacity:.5;cursor:not-allowed}.ceami-seminar-pdf-test p{margin:0;padding:9px 10px;border-radius:9px;font-size:12px;font-weight:800}.ceami-seminar-pdf-test p.ok{background:#edf8ef;color:#2f6f3d}.ceami-seminar-pdf-test p.error{background:#fff0ef;color:#9a3830}.ceami-preflight{display:grid;gap:10px}.ceami-ready-line{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px 12px;border-radius:10px}.ceami-ready-line.ok{background:#edf8ef}.ceami-ready-line.review{background:#fff3e8}.ceami-ready-line.ok span{color:#2f6f3d}.ceami-ready-line.review span{color:#8a4f14}.ceami-recipient-filters{display:flex;gap:7px;flex-wrap:wrap}.ceami-recipient-filters button{background:#fff!important;color:#6b5a49!important;border:1px solid #dacbb6!important;padding:7px 10px!important;font-size:11px}.ceami-recipient-filters button.active{background:#64431f!important;color:#fff!important;border-color:#64431f!important}.ceami-recipient-filters button.active.review{background:#a15f14!important;border-color:#a15f14!important}.ceami-preflight-table-wrap{overflow:auto;border:1px solid #e5d9c7;border-radius:12px;background:#fff}.ceami-preflight-table{width:100%;border-collapse:collapse;min-width:520px}.ceami-preflight-table th,.ceami-preflight-table td{padding:10px 11px;border-bottom:1px solid #eee5d9;text-align:left;vertical-align:top;font-size:12px}.ceami-preflight-table th{background:#f8f2e9;color:#5f5144;font-size:11px;text-transform:uppercase}.ceami-preflight-table td strong{font-size:12px;color:#2f2924}.ceami-preflight-table td small{display:block;margin-top:4px;color:#7e7369}.ceami-simple-status{display:inline-flex!important;width:max-content;padding:4px 7px;border-radius:999px;font-weight:900!important}.ceami-simple-status.ok{background:#edf8ef;color:#2f6f3d!important}.ceami-simple-status.review{background:#fff7df;color:#8a6414!important}@media(max-width:700px){.ceami-seminar-pdf-test-head{display:grid}.ceami-seminar-pdf-actions{display:grid;justify-content:stretch}.ceami-seminar-pdf-test button{width:100%}.ceami-ready-line{align-items:flex-start;flex-direction:column}.ceami-recipient-filters{display:grid;grid-template-columns:1fr 1fr}.ceami-recipient-filters button{width:100%}}
      `}</style>
    </section>
  );
}
