'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SEMINAR_APOCALIPSE_SLUG } from '@/lib/seminar-apocalipse';

const MAX_FILE_BYTES = 8 * 1024 * 1024;

export default function SeminarPdfTestSender() {
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [activeFormId, setActiveFormId] = useState('');
  const [sending, setSending] = useState(false);
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
        return;
      }
      if (formId === activeFormId) return;

      checking = true;
      try {
        const { data } = await supabase.from('forms').select('id, slug').eq('id', formId).maybeSingle();
        if (stopped) return;
        setActiveFormId(data?.slug === SEMINAR_APOCALIPSE_SLUG ? formId : '');
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

  return (
    <section className="ceami-seminar-pdf-test" aria-label="Teste protegido da apostila em PDF">
      <div>
        <strong>Teste protegido da apostila PDF</strong>
        <span>Este botão envia somente para (51) 99509-2781. Ele não dispara para os inscritos.</span>
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
      <button type="button" disabled={sending} onClick={() => inputRef.current?.click()}>
        {sending ? 'Enviando teste...' : 'Selecionar PDF e testar no meu número'}
      </button>
      {notice && <p className={noticeType}>{notice}</p>}
      <style>{`
        .ceami-seminar-pdf-test{margin:14px 0 0;padding:14px 15px;border:1px solid #e4d7c3;border-radius:14px;background:#fffaf3;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center}.ceami-seminar-pdf-test>div{display:grid;gap:3px}.ceami-seminar-pdf-test strong{color:#5b3d1e;font-size:13px}.ceami-seminar-pdf-test span{color:#7b6b5b;font-size:11px;line-height:1.4}.ceami-seminar-pdf-test button{border:0;border-radius:10px;background:#64431f;color:#fff;font-weight:900;padding:10px 13px;cursor:pointer}.ceami-seminar-pdf-test button:disabled{opacity:.6;cursor:wait}.ceami-seminar-pdf-test p{grid-column:1/-1;margin:0;padding:9px 10px;border-radius:9px;font-size:12px;font-weight:800}.ceami-seminar-pdf-test p.ok{background:#edf8ef;color:#2f6f3d}.ceami-seminar-pdf-test p.error{background:#fff0ef;color:#9a3830}@media(max-width:700px){.ceami-seminar-pdf-test{grid-template-columns:1fr}.ceami-seminar-pdf-test button{width:100%}}
      `}</style>
    </section>
  );
}
