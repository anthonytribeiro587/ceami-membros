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
  whatsappExists: boolean | null;
};

type PreflightPayload = {
  error?: string;
  summary?: {
    total: number;
    confirmed: number;
    warnings: number;
    invalid: number;
    whatsappChecked: boolean;
    readyForBulk: boolean;
  };
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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [activeFormId, setActiveFormId] = useState('');
  const [sending, setSending] = useState(false);
  const [checkingRecipients, setCheckingRecipients] = useState(false);
  const [preflight, setPreflight] = useState<PreflightPayload | null>(null);
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
        return;
      }
      if (formId === activeFormId) return;

      checking = true;
      try {
        const { data } = await supabase.from('forms').select('id, slug').eq('id', formId).maybeSingle();
        if (stopped) return;
        const nextFormId = data?.slug === SEMINAR_APOCALIPSE_SLUG ? formId : '';
        setActiveFormId(nextFormId);
        setPreflight(null);
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
      const response = await fetch('/api/admin/forms/seminar-apocalipse/preflight', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({})) as PreflightPayload;
      if (!response.ok) {
        setNoticeType('error');
        setNotice(payload.error || 'Não foi possível conferir os números.');
        return;
      }
      setPreflight(payload);
    } finally {
      setCheckingRecipients(false);
    }
  }

  async function sendFile(file: File) {
    setNotice('');
    if (file.type !== 'application/pdf') {
      setNoticeType('error');
      setNotice('Selecione um arquivo PDF.');
      return;
    }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      setNoticeType('error');
      setNotice('O PDF deve ter no máximo 8 MB.');
      return;
    }

    const confirmed = window.confirm(
      `Enviar SOMENTE para o número de teste (51) 99509-2781?\n\nArquivo: ${file.name}\n\nNenhum participante receberá este teste.`,
    );
    if (!confirmed) return;

    setSending(true);
    try {
      const body = new FormData();
      body.append('file', file, file.name);
      const response = await fetch('/api/admin/forms/seminar-apocalipse/send-pdf-test', {
        method: 'POST',
        body,
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; destination?: string };
      if (!response.ok) {
        setNoticeType('error');
        setNotice(payload.error || 'Não foi possível enviar o PDF.');
        return;
      }
      setNoticeType('ok');
      setNotice(`Teste enviado para ${payload.destination || '(51) 99509-2781'}. Confira o WhatsApp antes de liberar o envio geral.`);
    } finally {
      setSending(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const summary = preflight?.summary;
  const recipients = preflight?.recipients || [];

  return (
    <section className="ceami-seminar-pdf-test" aria-label="Controle protegido da apostila em PDF">
      <div className="ceami-seminar-pdf-test-head">
        <div>
          <strong>Controle protegido da apostila PDF</strong>
          <span>Antes de qualquer envio geral, confira a lista de pagos e os números de WhatsApp.</span>
        </div>
        <div className="ceami-seminar-pdf-actions">
          <button type="button" className="secondary" disabled={checkingRecipients} onClick={() => void checkRecipients()}>
            {checkingRecipients ? 'Conferindo...' : 'Conferir pagos e números'}
          </button>
          <button type="button" disabled={sending} onClick={() => inputRef.current?.click()}>
            {sending ? 'Enviando teste...' : 'Testar PDF no meu número'}
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void sendFile(file);
        }}
      />

      {summary && (
        <div className="ceami-preflight">
          <div className="ceami-preflight-summary">
            <span><b>{summary.total}</b> pagos com PDF</span>
            <span className="good"><b>{summary.confirmed}</b> corretos</span>
            <span className="warn"><b>{summary.warnings}</b> revisar</span>
            <span className="bad"><b>{summary.invalid}</b> inválidos</span>
          </div>
          <div className={summary.readyForBulk ? 'ceami-preflight-banner ready' : 'ceami-preflight-banner blocked'}>
            {summary.readyForBulk
              ? `Lista pronta para envio. ${summary.whatsappChecked ? 'Os números também foram confirmados pela Evolution/WhatsApp.' : 'Os números passaram na validação de formato.'}`
              : 'Envio geral deve permanecer bloqueado até revisar todos os números com aviso ou erro.'}
          </div>

          <div className="ceami-preflight-table-wrap">
            <table className="ceami-preflight-table">
              <thead>
                <tr><th>Nome</th><th>Número informado</th><th>Número para envio</th><th>Situação</th></tr>
              </thead>
              <tbody>
                {recipients.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.originalPhone || '—'}</td>
                    <td>{item.normalizedPhone ? formatPhone(item.normalizedPhone) : '—'}</td>
                    <td>
                      <span className={`ceami-phone-status ${item.status}`}>
                        {item.status === 'confirmed' ? '✓ Correto' : item.status === 'warning' ? '⚠ Revisar' : '✕ Inválido'}
                      </span>
                      <small>{item.reason}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {notice && <p className={noticeType}>{notice}</p>}
      <style>{`
        .ceami-seminar-pdf-test{margin:14px 0 0;padding:14px 15px;border:1px solid #e4d7c3;border-radius:14px;background:#fffaf3;display:grid;gap:12px}.ceami-seminar-pdf-test-head{display:flex;justify-content:space-between;gap:14px;align-items:center}.ceami-seminar-pdf-test-head>div:first-child{display:grid;gap:3px}.ceami-seminar-pdf-test strong{color:#5b3d1e;font-size:13px}.ceami-seminar-pdf-test span{color:#7b6b5b;font-size:11px;line-height:1.4}.ceami-seminar-pdf-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.ceami-seminar-pdf-test button{border:0;border-radius:10px;background:#64431f;color:#fff;font-weight:900;padding:10px 13px;cursor:pointer}.ceami-seminar-pdf-test button.secondary{background:#fff;border:1px solid #cdb995;color:#69471f}.ceami-seminar-pdf-test button:disabled{opacity:.6;cursor:wait}.ceami-seminar-pdf-test p{margin:0;padding:9px 10px;border-radius:9px;font-size:12px;font-weight:800}.ceami-seminar-pdf-test p.ok{background:#edf8ef;color:#2f6f3d}.ceami-seminar-pdf-test p.error{background:#fff0ef;color:#9a3830}.ceami-preflight{display:grid;gap:10px}.ceami-preflight-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.ceami-preflight-summary span{padding:10px;border-radius:10px;background:#fff;border:1px solid #eadfce;font-size:12px}.ceami-preflight-summary b{display:block;font-size:18px;color:#3f3328}.ceami-preflight-summary .good{background:#f0f8f1;color:#2f6f3d}.ceami-preflight-summary .warn{background:#fff8e7;color:#8a6414}.ceami-preflight-summary .bad{background:#fff0ef;color:#9a3830}.ceami-preflight-banner{padding:10px 12px;border-radius:10px;font-size:12px;font-weight:800}.ceami-preflight-banner.ready{background:#edf8ef;color:#2f6f3d}.ceami-preflight-banner.blocked{background:#fff3e8;color:#8a4f14}.ceami-preflight-table-wrap{overflow:auto;border:1px solid #e5d9c7;border-radius:12px;background:#fff}.ceami-preflight-table{width:100%;border-collapse:collapse;min-width:760px}.ceami-preflight-table th,.ceami-preflight-table td{padding:10px 11px;border-bottom:1px solid #eee5d9;text-align:left;vertical-align:top;font-size:12px}.ceami-preflight-table th{background:#f8f2e9;color:#5f5144;font-size:11px;text-transform:uppercase}.ceami-preflight-table td strong{font-size:12px;color:#2f2924}.ceami-preflight-table td small{display:block;margin-top:4px;color:#7e7369;max-width:320px}.ceami-phone-status{display:inline-flex!important;width:max-content;padding:4px 7px;border-radius:999px;font-weight:900!important}.ceami-phone-status.confirmed{background:#edf8ef;color:#2f6f3d!important}.ceami-phone-status.warning{background:#fff7df;color:#8a6414!important}.ceami-phone-status.invalid{background:#fff0ef;color:#9a3830!important}@media(max-width:700px){.ceami-seminar-pdf-test-head{display:grid}.ceami-seminar-pdf-actions{display:grid;justify-content:stretch}.ceami-seminar-pdf-test button{width:100%}.ceami-preflight-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
      `}</style>
    </section>
  );
}
