'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SEMINAR_APOCALIPSE_SLUG } from '@/lib/seminar-apocalipse';

export default function SeminarFileTrackingShortcut() {
  const supabase = useMemo(() => createClient(), []);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;
    let checking = false;

    async function detect() {
      if (stopped || checking) return;
      const formId = document.querySelector<HTMLElement>('.forms-responses')?.dataset.formId || '';
      if (!formId) {
        setVisible(false);
        return;
      }

      checking = true;
      try {
        const { data } = await supabase.from('forms').select('slug').eq('id', formId).maybeSingle();
        if (!stopped) setVisible(data?.slug === SEMINAR_APOCALIPSE_SLUG);
      } finally {
        checking = false;
      }
    }

    function schedule() {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void detect(), 100);
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

  if (!visible) return null;

  return (
    <div className="forms-files-shortcut-wrap">
      <Link href="/formularios/envios-arquivos" className="forms-files-shortcut">
        <span className="forms-files-shortcut-copy">
          <strong>Acompanhar envio de arquivos</strong>
          <small>Apostila PDF, pendentes e histórico de entregas</small>
        </span>
        <span aria-hidden="true" className="forms-files-shortcut-arrow">›</span>
      </Link>

      <style>{`
        .forms-files-shortcut-wrap {
          width: min(100%, 1180px);
          margin: 0 auto 12px;
          padding: 0 12px;
          box-sizing: border-box;
        }
        .forms-files-shortcut {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          width: 100%;
          min-height: 56px;
          padding: 11px 14px;
          border-radius: 14px;
          border: 1px solid #d7c7ad;
          background: #fffaf3;
          color: #5b3d1e;
          text-decoration: none;
          box-sizing: border-box;
        }
        .forms-files-shortcut-copy {
          display: grid;
          gap: 2px;
          min-width: 0;
        }
        .forms-files-shortcut-copy strong {
          font-size: 13px;
          font-weight: 900;
          line-height: 1.2;
        }
        .forms-files-shortcut-copy small {
          color: #7b6b5b;
          font-size: 11px;
          font-weight: 700;
          line-height: 1.2;
        }
        .forms-files-shortcut-arrow {
          flex: 0 0 auto;
          font-size: 20px;
          font-weight: 900;
        }
        @media (max-width: 720px) {
          .forms-files-shortcut-wrap {
            width: auto;
            margin: 8px 12px 14px 72px;
            padding: 0;
          }
          .forms-files-shortcut {
            min-height: 46px;
            padding: 9px 12px;
            border-radius: 12px;
          }
          .forms-files-shortcut-copy strong {
            font-size: 12px;
          }
          .forms-files-shortcut-copy small {
            display: none;
          }
          .forms-files-shortcut-arrow {
            font-size: 18px;
          }
        }
      `}</style>
    </div>
  );
}
