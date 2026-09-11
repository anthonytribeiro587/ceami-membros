'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import { SEMINAR_APOCALIPSE_SLUG } from '@/lib/seminar-apocalipse';

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export default function SeminarFileTrackingShortcut() {
  const supabase = useMemo(() => createClient(), []);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;
    let checking = false;

    function clearMount() {
      document.querySelector<HTMLElement>('[data-ceami-file-tracking-shortcut="true"]')?.remove();
      setMountNode(null);
    }

    async function detect() {
      if (stopped || checking) return;
      const responses = document.querySelector<HTMLElement>('.forms-responses');
      if (!responses) {
        clearMount();
        return;
      }

      checking = true;
      try {
        let isSeminar = false;
        const formId = responses.dataset.formId || '';

        if (formId) {
          const { data } = await supabase.from('forms').select('slug').eq('id', formId).maybeSingle();
          isSeminar = data?.slug === SEMINAR_APOCALIPSE_SLUG;
        }

        if (!isSeminar) {
          const text = normalize(responses.textContent || '');
          isSeminar = text.includes('inscricoes recebidas') && text.includes('seminario de estudo do apocalipse');
        }

        if (stopped) return;
        if (!isSeminar) {
          clearMount();
          return;
        }

        let mount = responses.querySelector<HTMLElement>(':scope > [data-ceami-file-tracking-shortcut="true"]');
        if (!mount) {
          mount = document.createElement('div');
          mount.dataset.ceamiFileTrackingShortcut = 'true';
          responses.prepend(mount);
        }
        setMountNode(mount);
      } finally {
        checking = false;
      }
    }

    function schedule() {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void detect(), 80);
    }

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      observer.disconnect();
      document.querySelector<HTMLElement>('[data-ceami-file-tracking-shortcut="true"]')?.remove();
    };
  }, [supabase]);

  if (!mountNode) return null;

  return createPortal(
    <div className="forms-files-shortcut-wrap">
      <Link href="/formularios/envios-arquivos" className="forms-files-shortcut">
        <span className="forms-files-shortcut-copy">
          <strong>Acompanhar envio de arquivos</strong>
          <small>Apostila PDF, pendentes e histórico de entregas</small>
        </span>
        <span aria-hidden="true" className="forms-files-shortcut-arrow">›</span>
      </Link>
      <style>{`
        .forms-files-shortcut-wrap{width:100%;margin:0 0 14px;padding:0;box-sizing:border-box}
        .forms-files-shortcut{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:54px;padding:11px 14px;border-radius:13px;border:1px solid #d7c7ad;background:#fffaf3;color:#5b3d1e;text-decoration:none;box-sizing:border-box}
        .forms-files-shortcut-copy{display:grid;gap:2px;min-width:0}
        .forms-files-shortcut-copy strong{font-size:13px;font-weight:900;line-height:1.2}
        .forms-files-shortcut-copy small{color:#7b6b5b;font-size:11px;font-weight:700;line-height:1.2}
        .forms-files-shortcut-arrow{flex:0 0 auto;font-size:20px;font-weight:900}
        @media (max-width:720px){.forms-files-shortcut{min-height:48px;padding:10px 12px}.forms-files-shortcut-copy strong{font-size:12px}.forms-files-shortcut-copy small{font-size:10px}.forms-files-shortcut-arrow{font-size:18px}}
      `}</style>
    </div>,
    mountNode,
  );
}
