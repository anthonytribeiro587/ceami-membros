'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SEMINAR_APOCALIPSE_SLUG } from '@/lib/seminar-apocalipse';

type Recipient = {
  id: string;
  name: string;
  originalPhone: string;
  normalizedPhone: string;
  status: 'confirmed' | 'warning' | 'invalid';
  reason: string;
  material: string;
};

type Payload = {
  error?: string;
  summary?: {
    total: number;
    alreadySent?: number;
    confirmed: number;
    warnings: number;
    invalid: number;
    ready: boolean;
  };
  recipients?: Recipient[];
};

const SEND_PAUSE_MS = 5_000;
const MESSAGE =
  'Olá, vi que você fez sua inscrição para Simpósio Apocalipse e ainda não efetuou o pagamento.\n\nVocê pode efetuar hoje lá no curso. Estaremos a partir das 18:30h para check-in.';

function fmt(value: string) {
  const digits = value.replace(/\D/g, '');
  const national = digits.startsWith('55') ? digits.slice(2) : digits;
  if (national.length === 11) return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
  if (national.length === 10) return `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
  return value || '—';
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function SeminarPendingPaymentSender() {
  const supabase = useMemo(() => createClient(), []);
  const pauseRef = useRef(false);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [paused, setPaused] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [sentIds, setSentIds] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [progress, setProgress] = useState('');

  useEffect(() => {
    let stop = false;
    let timer: number | null = null;
    let busy = false;

    async function detect() {
      if (stop || busy) return;
      const id = document.querySelector<HTMLElement>('.forms-responses')?.dataset.formId || '';
      if (!id) {
        setActive(false);
        return;
      }
      busy = true;
      try {
        const { data: form } = await supabase.from('forms').select('slug').eq('id', id).maybeSingle();
        if (!stop) setActive(form?.slug === SEMINAR_APOCALIPSE_SLUG);
      } finally {
        busy = false;
      }
    }

    function schedule() {
      if (timer) clearTimeout(timer);
      timer = window.setTimeout(() => void detect(), 120);
    }

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [supabase]);

  if (!active) return null;

  async function review() {
    setLoading(true);
    setNotice('');
    setProgress('');
    try {
      const response = await fetch('/api/admin/forms/seminar-apocalipse/pending-preflight', {
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as Payload;
      if (!response.ok) {
        setNotice(payload.error || 'Não foi possível revisar os pendentes.');
        return;
      }
      setData(payload);
      setSentIds([]);
      setReviewOnly(((payload.summary?.warnings || 0) + (payload.summary?.invalid || 0)) > 0);
    } finally {
      setLoading(false);
    }
  }

  function togglePause() {
    const next = !pauseRef.current;
    pauseRef.current = next;
    setPaused(next);
    setNotice(next ? 'Pausa solicitada. O envio atual termina e o próximo não começa.' : 'Envio retomado.');
  }

  async function waitIfPaused(remaining: number) {
    while (pauseRef.current) {
      setProgress(`Envio pausado · ${remaining} restante(s).`);
      await wait(400);
    }
  }

  async function sendAll() {
    const recipients = data?.recipients || [];
    const summary = data?.summary;
    if (!summary?.ready) return;

    const eligible = recipients.filter((item) => item.status === 'confirmed' && !sentIds.includes(item.id));
    if (!eligible.length) {
      setNotice('Todos os pendentes revisados já receberam o aviso.');
      return;
    }

    const confirmed = window.confirm(
      `ENVIAR AVISO PARA PENDENTES\n\n${MESSAGE}\n\nDestinatários: ${eligible.length}\nEnvio: 1 pessoa por vez, com 5 segundos entre cada mensagem.\nOs envios confirmados ficam registrados para não repetir.\n\nContinuar?`,
    );
    if (!confirmed) return;

    pauseRef.current = false;
    setPaused(false);
    setSending(true);
    setNotice('');
    setProgress('Iniciando envio...');

    let sentTotal = 0;
    let completedIds = [...sentIds];

    try {
      for (let index = 0; index < eligible.length; index += 1) {
        const recipient = eligible[index];
        await waitIfPaused(eligible.length - index);
        setProgress(`Enviando ${index + 1}/${eligible.length} · ${recipient.name}`);

        const response = await fetch('/api/admin/forms/seminar-apocalipse/send-pending-reminder-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: recipient.id }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          sent?: number;
          sentIds?: string[];
          alreadySent?: boolean;
        };

        if (!response.ok) {
          setNotice(payload.error || `O envio para ${recipient.name} não foi concluído.`);
          setProgress(`Processo interrompido em ${recipient.name}. Os anteriores ficaram registrados.`);
          return;
        }

        const confirmedIds = Array.isArray(payload.sentIds) ? payload.sentIds : [recipient.id];
        completedIds = [...new Set([...completedIds, ...confirmedIds])];
        setSentIds(completedIds);
        if (!payload.alreadySent) sentTotal += payload.sent || 0;

        const remaining = eligible.length - index - 1;
        setProgress(`✓ ${recipient.name} · ${remaining} restante(s).`);
        if (remaining > 0) {
          await waitIfPaused(remaining);
          await wait(SEND_PAUSE_MS);
        }
      }

      setNotice(`Concluído: ${sentTotal} aviso(s) de pagamento enviado(s) e registrado(s).`);
      setProgress('Envio concluído.');
      await review();
    } finally {
      pauseRef.current = false;
      setPaused(false);
      setSending(false);
    }
  }

  const summary = data?.summary;
  const all = data?.recipients || [];
  const reviewCount = (summary?.warnings || 0) + (summary?.invalid || 0);
  const visible = reviewOnly ? all.filter((item) => item.status !== 'confirmed') : all;
  const remaining = all.filter((item) => item.status === 'confirmed' && !sentIds.includes(item.id)).length;

  return (
    <section className="ceami-pending-box">
      <div className="ceami-pending-head">
        <div>
          <strong>Aviso para inscrições não pagas</strong>
          <span>Revise os números e envie 1 por vez, com pausa de 5s. Cada envio confirmado fica bloqueado contra repetição.</span>
        </div>
        <div className="ceami-pending-actions">
          <button className="secondary" onClick={() => void review()} disabled={loading || sending}>
            {loading ? 'Revisando...' : 'Revisar pendentes'}
          </button>
          {sending && (
            <button className="pause" onClick={togglePause}>
              {paused ? '▶ Continuar' : '⏸ Pausar'}
            </button>
          )}
          <button onClick={() => void sendAll()} disabled={sending || !summary?.ready || remaining === 0}>
            {sending ? (paused ? 'Envio pausado' : 'Enviando...') : `Enviar avisos${summary?.ready ? ` (${remaining})` : ''}`}
          </button>
        </div>
      </div>

      <div className="message-preview">
        <strong>Mensagem:</strong>
        <span>{MESSAGE}</span>
      </div>

      {summary && (
        <>
          <div className={summary.ready ? 'pending-status ok' : 'pending-status review'}>
            <strong>{summary.total} pendente(s) para avisar</strong>
            <span>
              {(summary.alreadySent || 0) > 0 ? `✓ ${summary.alreadySent} já avisado(s) · ` : ''}
              {summary.ready ? 'lista pronta para envio' : `⚠ ${reviewCount} número(s) para revisar`}
            </span>
          </div>

          {reviewCount > 0 && (
            <div className="pending-filters">
              <button className={!reviewOnly ? 'active' : ''} onClick={() => setReviewOnly(false)}>
                Todos ({summary.total})
              </button>
              <button className={reviewOnly ? 'active warn' : 'warn'} onClick={() => setReviewOnly(true)}>
                Só revisar ({reviewCount})
              </button>
            </div>
          )}

          <div className="pending-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>WhatsApp</th>
                  <th>Material</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.name}</strong></td>
                    <td>{fmt(item.normalizedPhone || item.originalPhone)}</td>
                    <td>{item.material}</td>
                    <td>
                      <span className={`badge ${item.status === 'confirmed' ? 'ok' : 'review'}`}>
                        {sentIds.includes(item.id)
                          ? '✓ Aviso enviado'
                          : item.status === 'confirmed'
                            ? '✓ OK'
                            : '⚠ Revisar'}
                      </span>
                      {item.status !== 'confirmed' && <small>{item.reason}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {progress && <p className="progress">{progress}</p>}
      {notice && <p>{notice}</p>}

      <style>{`
        .ceami-pending-box{margin:12px 0 0;padding:14px 15px;border:1px solid #ead8c2;border-radius:14px;background:#fff8ef;display:grid;gap:10px}
        .ceami-pending-head{display:flex;justify-content:space-between;gap:12px;align-items:center}
        .ceami-pending-head>div:first-child{display:grid;gap:3px}
        .ceami-pending-box strong{color:#5b3d1e;font-size:13px}
        .ceami-pending-box span{font-size:11px;color:#786a5d;white-space:pre-line}
        .ceami-pending-actions{display:flex;gap:8px;flex-wrap:wrap}
        .ceami-pending-box button{border:0;border-radius:10px;background:#8a551f;color:white;font-weight:900;padding:10px 12px}
        .ceami-pending-box button.secondary{background:white;color:#70491f;border:1px solid #d7bf9e}
        .ceami-pending-box button.pause{background:#b56a17}
        .ceami-pending-box button:disabled{opacity:.45}
        .message-preview{display:grid;gap:5px;padding:10px 12px;border-radius:10px;background:#fff;border:1px solid #eadfce}
        .message-preview span{font-size:12px;line-height:1.45;color:#604b36}
        .pending-status{display:flex;justify-content:space-between;gap:8px;padding:10px 12px;border-radius:10px}
        .pending-status.ok{background:#edf8ef}.pending-status.review{background:#fff1df}
        .pending-status.ok span{color:#2f6f3d}.pending-status.review span{color:#9a5d16}
        .pending-filters{display:flex;gap:7px}
        .pending-filters button{background:white;color:#6b5a49;border:1px solid #dacbb6;padding:7px 10px;font-size:11px}
        .pending-filters button.active{background:#64431f;color:white}.pending-filters button.active.warn{background:#a15f14}
        .pending-table-wrap{overflow:auto;border:1px solid #eadfce;border-radius:12px;background:white}
        .pending-table-wrap table{width:100%;border-collapse:collapse;min-width:620px}
        .pending-table-wrap th,.pending-table-wrap td{padding:9px 10px;border-bottom:1px solid #eee5d9;text-align:left;font-size:12px;vertical-align:top}
        .pending-table-wrap th{background:#faf4ec;font-size:11px;color:#5f5144}
        .pending-table-wrap small{display:block;margin-top:4px;color:#7e7369}
        .badge{display:inline-flex!important;padding:4px 7px;border-radius:999px;font-weight:900!important}
        .badge.ok{background:#edf8ef;color:#2f6f3d!important}.badge.review{background:#fff7df;color:#8a6414!important}
        .ceami-pending-box p{margin:0;background:#f6efe5;padding:8px 10px;border-radius:9px;font-size:12px;font-weight:800;color:#604b36}
        .ceami-pending-box p.progress{background:#eef5fb;color:#31566f}
        @media(max-width:700px){.ceami-pending-head{display:grid}.ceami-pending-actions{display:grid;grid-template-columns:1fr 1fr;position:sticky;top:10px;z-index:17;padding:8px;background:rgba(255,248,239,.96);border:1px solid #ead8c2;border-radius:12px;box-shadow:0 6px 18px rgba(60,42,20,.12);backdrop-filter:blur(8px)}.ceami-pending-actions button{width:100%;font-size:11px;padding:9px 7px}.ceami-pending-actions button.pause{grid-column:1/-1}.pending-status{flex-direction:column;align-items:flex-start}.pending-filters{display:grid;grid-template-columns:1fr 1fr}.pending-filters button{width:100%}}
      `}</style>
    </section>
  );
}
