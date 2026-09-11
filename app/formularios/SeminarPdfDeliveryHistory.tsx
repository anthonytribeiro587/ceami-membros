'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SEMINAR_APOCALIPSE_SLUG } from '@/lib/seminar-apocalipse';

type DeliveryRow = {
  id: string;
  name: string;
  phone: string;
  material: 'PDF' | 'Física' | string;
  createdAt?: string | null;
  sentAt?: string | null;
  source?: string;
  providerStatus?: string;
  messageId?: string;
};

type Payload = {
  error?: string;
  summary?: { pending: number; delivered: number };
  pending?: DeliveryRow[];
  delivered?: DeliveryRow[];
};

const WHATSAPP_TEXT = 'Olá! Segue a apostila digital do Seminário O Fim Pertence a Cristo. 🙏';

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  const national = digits.startsWith('55') ? digits.slice(2) : digits;
  if (national.length === 11) {
    return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
  }
  if (national.length === 10) {
    return `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
  }
  return value || '—';
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export default function SeminarPdfDeliveryHistory() {
  const supabase = useMemo(() => createClient(), []);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [markingId, setMarkingId] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState<'ok' | 'error'>('ok');

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;

    async function detect() {
      const formId = document.querySelector<HTMLElement>('.forms-responses')?.dataset.formId || '';
      if (!formId) {
        if (!stopped) setActive(false);
        return;
      }
      const { data } = await supabase.from('forms').select('slug').eq('id', formId).maybeSingle();
      if (stopped) return;
      setActive(data?.slug === SEMINAR_APOCALIPSE_SLUG);
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
  }, [supabase]);

  useEffect(() => {
    if (!active) {
      setPayload(null);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  async function load() {
    setLoading(true);
    setNotice('');
    try {
      const response = await fetch('/api/admin/forms/seminar-apocalipse/pdf-delivery-history', {
        cache: 'no-store',
      });
      const data = (await response.json().catch(() => ({}))) as Payload;
      if (!response.ok) {
        setNoticeType('error');
        setNotice(data.error || 'Não foi possível carregar o histórico de apostilas.');
        return;
      }
      setPayload(data);
    } finally {
      setLoading(false);
    }
  }

  function openWhatsapp(row: DeliveryRow) {
    const number = row.phone.replace(/\D/g, '');
    if (!number) {
      setNoticeType('error');
      setNotice(`O telefone de ${row.name} precisa ser revisado.`);
      return;
    }
    const url = `https://wa.me/${number}?text=${encodeURIComponent(WHATSAPP_TEXT)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function markDelivered(row: DeliveryRow) {
    if (!window.confirm(`Confirmar que o PDF foi enviado manualmente para ${row.name}?\n\nUse este botão somente depois de anexar e enviar a apostila no WhatsApp.`)) {
      return;
    }

    setMarkingId(row.id);
    setNotice('');
    try {
      const response = await fetch('/api/admin/forms/seminar-apocalipse/pdf-delivery-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: row.id }),
      });
      const data = (await response.json().catch(() => ({}))) as Payload;
      if (!response.ok) {
        setNoticeType('error');
        setNotice(data.error || 'Não foi possível registrar o envio manual.');
        return;
      }
      setNoticeType('ok');
      setNotice(`${row.name} foi movido para o histórico de enviados.`);
      await load();
    } finally {
      setMarkingId('');
    }
  }

  if (!active) return null;

  const pending = payload?.pending || [];
  const delivered = payload?.delivered || [];
  const summary = payload?.summary || { pending: pending.length, delivered: delivered.length };
  const rows = tab === 'pending' ? pending : delivered;

  return (
    <section className="ceami-pdf-history">
      <div className="ceami-pdf-history-head">
        <div>
          <strong>Controle de entrega da apostila</strong>
          <span>
            Para quem ainda não recebeu: abra o WhatsApp, anexe o PDF manualmente e só depois marque como enviado.
          </span>
        </div>
        <button className="refresh" onClick={() => void load()} disabled={loading}>
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      <div className="ceami-pdf-tabs">
        <button className={tab === 'pending' ? 'active pending' : ''} onClick={() => setTab('pending')}>
          Não receberam ({summary.pending})
        </button>
        <button className={tab === 'history' ? 'active history' : ''} onClick={() => setTab('history')}>
          Histórico ({summary.delivered})
        </button>
      </div>

      {tab === 'history' && (
        <div className="ceami-pdf-warning">
          Registros antigos podem ter sido gravados antes da validação real do WhatsApp. Os novos envios manuais ficam identificados como “Manual”.
        </div>
      )}

      <div className="ceami-pdf-table-wrap">
        <table className="ceami-pdf-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>WhatsApp</th>
              <th>Material</th>
              {tab === 'pending' ? <th>Ação</th> : <><th>Enviado em</th><th>Registro</th></>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={tab === 'pending' ? 4 : 5} className="empty">
                  {loading ? 'Carregando...' : tab === 'pending' ? 'Ninguém pendente.' : 'Nenhum envio registrado.'}
                </td>
              </tr>
            ) : tab === 'pending' ? (
              pending.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.name}</strong></td>
                  <td>{formatPhone(row.phone)}</td>
                  <td>{row.material}</td>
                  <td>
                    <div className="ceami-pdf-row-actions">
                      <button className="whatsapp" onClick={() => openWhatsapp(row)}>WhatsApp</button>
                      <button
                        className="mark"
                        disabled={markingId === row.id}
                        onClick={() => void markDelivered(row)}
                      >
                        {markingId === row.id ? 'Salvando...' : 'Marcar enviado'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              delivered.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.name}</strong></td>
                  <td>{formatPhone(row.phone)}</td>
                  <td>{row.material}</td>
                  <td>{formatDate(row.sentAt)}</td>
                  <td>
                    <span className={`ceami-pdf-source ${row.source === 'Manual' ? 'manual' : row.source === 'Automático confirmado' ? 'confirmed' : 'legacy'}`}>
                      {row.source || 'Registro anterior'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {notice && <p className={noticeType}>{notice}</p>}

      <style>{`
        .ceami-pdf-history{margin:14px 0 0;padding:14px 15px;border:1px solid #d8ded3;border-radius:14px;background:#fbfdf9;display:grid;gap:11px}
        .ceami-pdf-history-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
        .ceami-pdf-history-head>div{display:grid;gap:3px}
        .ceami-pdf-history-head strong{font-size:13px;color:#38513d}
        .ceami-pdf-history-head span{font-size:11px;color:#657166}
        .ceami-pdf-history button{border:0;border-radius:9px;padding:8px 11px;font-weight:800;cursor:pointer}
        .ceami-pdf-history button:disabled{opacity:.5;cursor:not-allowed}
        .ceami-pdf-history button.refresh{background:#fff;border:1px solid #c9d3c5;color:#47604c}
        .ceami-pdf-tabs{display:flex;gap:7px;flex-wrap:wrap}
        .ceami-pdf-tabs button{background:#fff;border:1px solid #d7ddd4;color:#59645b}
        .ceami-pdf-tabs button.active.pending{background:#fff4e7;border-color:#d8aa6b;color:#8a5416}
        .ceami-pdf-tabs button.active.history{background:#eaf6ec;border-color:#9dc6a4;color:#2f6f3d}
        .ceami-pdf-warning{padding:8px 10px;border-radius:9px;background:#fff6e9;color:#805920;font-size:11px;line-height:1.4}
        .ceami-pdf-table-wrap{overflow:auto;border:1px solid #dfe5dc;border-radius:11px;background:#fff}
        .ceami-pdf-table{width:100%;border-collapse:collapse;min-width:720px}
        .ceami-pdf-table th,.ceami-pdf-table td{padding:9px 10px;border-bottom:1px solid #edf0eb;text-align:left;vertical-align:middle;font-size:12px}
        .ceami-pdf-table th{font-size:11px;color:#59635a;background:#f4f7f2}
        .ceami-pdf-table td strong{color:#354439}
        .ceami-pdf-table td.empty{text-align:center;color:#7a847b;padding:18px}
        .ceami-pdf-row-actions{display:flex;gap:6px;flex-wrap:wrap}
        .ceami-pdf-row-actions .whatsapp{background:#e9f8ed;color:#1f7a39;border:1px solid #b7dfc1}
        .ceami-pdf-row-actions .mark{background:#3f6f48;color:#fff}
        .ceami-pdf-source{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:10px;font-weight:900}
        .ceami-pdf-source.manual{background:#eaf6ec;color:#2f6f3d}
        .ceami-pdf-source.confirmed{background:#e8f3ff;color:#23629a}
        .ceami-pdf-source.legacy{background:#fff2df;color:#8b5a17}
        .ceami-pdf-history p{margin:0;padding:9px 10px;border-radius:9px;font-size:12px;font-weight:800}
        .ceami-pdf-history p.ok{background:#edf8ef;color:#2f6f3d}
        .ceami-pdf-history p.error{background:#fff0ef;color:#9a3830}
        @media(max-width:720px){.ceami-pdf-history-head{align-items:flex-start;flex-direction:column}.ceami-pdf-history-head button.refresh{width:100%}.ceami-pdf-tabs button{flex:1}.ceami-pdf-row-actions{flex-direction:column}.ceami-pdf-row-actions button{width:100%}}
      `}</style>
    </section>
  );
}
