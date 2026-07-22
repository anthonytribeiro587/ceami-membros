'use client';

import { Copy, Printer, QrCode, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';

type LessonQr = {
  id: string;
  lesson_number: number;
  title: string;
  checkin_token: string;
  checkin_enabled: boolean;
  status: 'scheduled' | 'completed' | 'rescheduled' | 'cancelled';
};

type ClassRow = {
  id: string;
  name: string;
  courses: { name?: string } | Array<{ name?: string }> | null;
};

function nestedCourseName(value: ClassRow['courses']) {
  if (Array.isArray(value)) return value[0]?.name || '';
  return value?.name || '';
}

export default function QrCodeReliability() {
  const supabase = useMemo(() => createClient(), []);
  const [actionTarget, setActionTarget] = useState<Element | null>(null);
  const [lesson, setLesson] = useState<LessonQr | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const lastSignature = useRef('');

  const checkinUrl = lesson && typeof window !== 'undefined'
    ? `${window.location.origin}/checkin/${lesson.checkin_token}`
    : '';
  const internalQrUrl = checkinUrl ? `/api/qr?data=${encodeURIComponent(checkinUrl)}` : '';

  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    function repairExistingModal() {
      const preview = document.querySelector('.qr-preview');
      if (!preview) return;

      const link = preview.querySelector('p')?.textContent?.trim() || '';
      if (!/^https?:\/\//i.test(link) || !link.includes('/checkin/')) return;

      const src = `/api/qr?data=${encodeURIComponent(link)}`;
      let image = preview.querySelector('img');

      if (!image) {
        image = document.createElement('img');
        image.alt = 'QR Code para check-in da aula';
        preview.prepend(image);
      }

      if (image.getAttribute('src') !== src) image.setAttribute('src', src);
    }

    async function locateCompletedLesson() {
      repairExistingModal();

      const page = document.querySelector('.lesson-attendance-page');
      const header = page?.querySelector('.courses-topbar');
      const actions = header?.querySelector('.courses-actions');
      const heading = header?.querySelector('h1')?.textContent?.trim() || '';
      const context = header?.querySelector('div:first-child > span')?.textContent?.trim() || '';

      if (!page || !header || !actions || !heading || !context) {
        setActionTarget((current) => (current ? null : current));
        setLesson((current) => (current ? null : current));
        lastSignature.current = '';
        return;
      }

      const nativeQrControl = Array.from(
        actions.querySelectorAll('button:not([data-ceami-qr-reliability="true"])'),
      ).some((button) => /qr|check-in/i.test(button.textContent || ''));

      if (nativeQrControl) {
        setActionTarget((current) => (current ? null : current));
        return;
      }

      const lessonMatch = heading.match(/^Aula\s+(\d+)\s*:/i);
      const separatorIndex = context.indexOf('·');
      if (!lessonMatch || separatorIndex < 0) return;

      const lessonNumber = Number(lessonMatch[1]);
      const courseName = context.slice(0, separatorIndex).trim();
      const className = context.slice(separatorIndex + 1).trim();
      const signature = `${courseName}|${className}|${lessonNumber}`;

      setActionTarget((current) => (current === actions ? current : actions));
      if (lastSignature.current === signature && lesson) return;
      lastSignature.current = signature;

      const { data: classRows, error: classError } = await supabase
        .from('course_classes')
        .select('id, name, courses(name)')
        .eq('name', className);

      if (cancelled || classError) return;

      const matchedClass = ((classRows || []) as unknown as ClassRow[]).find(
        (item) => nestedCourseName(item.courses).trim() === courseName,
      );
      if (!matchedClass) return;

      const { data: lessonRow, error: lessonError } = await supabase
        .from('course_lessons')
        .select('id, lesson_number, title, checkin_token, checkin_enabled, status')
        .eq('class_id', matchedClass.id)
        .eq('lesson_number', lessonNumber)
        .maybeSingle();

      if (!cancelled && !lessonError && lessonRow) setLesson(lessonRow as LessonQr);
    }

    const scheduleLocate = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void locateCompletedLesson(), 120);
    };

    scheduleLocate();
    const observer = new MutationObserver((mutations) => {
      const onlyOwnQrMutation = mutations.every((mutation) =>
        Array.from(mutation.addedNodes).concat(Array.from(mutation.removedNodes)).every((node) =>
          node instanceof Element &&
          (node.matches('[data-ceami-qr-reliability="true"]') ||
            Boolean(node.closest('[data-ceami-qr-reliability="true"]'))),
        ),
      );

      if (!onlyOwnQrMutation) scheduleLocate();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [supabase, lesson]);

  function printQr() {
    if (!internalQrUrl || !checkinUrl) return;
    const popup = window.open('', '_blank', 'width=720,height=820');
    if (!popup) return;

    popup.document.write(`<!doctype html><html lang="pt-BR"><head><title>QR Code da aula</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:32px;color:#173746}img{width:420px;max-width:100%;display:block;margin:24px auto}p{overflow-wrap:anywhere;color:#60737c}@media print{button{display:none}}</style></head><body><h1>Check-in da aula</h1><img src="${internalQrUrl}" alt="QR Code"><p>${checkinUrl}</p><button onclick="window.print()">Imprimir</button></body></html>`);
    popup.document.close();
  }

  const injectedButton = actionTarget && lesson
    ? createPortal(
        <button
          type="button"
          className="secondary"
          data-ceami-qr-reliability="true"
          onClick={() => {
            setImageFailed(false);
            setModalOpen(true);
          }}
        >
          <QrCode size={17} />Visualizar QR
        </button>,
        actionTarget,
      )
    : null;

  const modal = modalOpen && lesson && typeof document !== 'undefined'
    ? createPortal(
        <div className="course-modal-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setModalOpen(false);
        }}>
          <section className="course-modal" role="dialog" aria-modal="true" aria-label="QR Code da aula">
            <header>
              <div>
                <h2>QR Code da aula</h2>
                <p>
                  {lesson.status === 'completed'
                    ? 'Esta aula já foi encerrada. O QR está disponível para consulta, mas não aceita novos check-ins.'
                    : 'Mostre o QR presencialmente para os alunos.'}
                </p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} aria-label="Fechar"><X /></button>
            </header>
            <div className="course-modal-body">
              <div className="qr-preview">
                {!imageFailed && internalQrUrl && (
                  <img src={internalQrUrl} alt="QR Code para check-in da aula" onError={() => setImageFailed(true)} />
                )}
                {imageFailed && (
                  <p className="form-error">Não foi possível carregar a imagem do QR. Use “Copiar link” enquanto tentamos novamente.</p>
                )}
                <p>{checkinUrl}</p>
              </div>
              <div className="qr-actions">
                <button type="button" className="secondary" onClick={() => void navigator.clipboard.writeText(checkinUrl)}>
                  <Copy size={17} />Copiar link
                </button>
                <button type="button" className="secondary" onClick={printQr}>
                  <Printer size={17} />Imprimir QR
                </button>
              </div>
            </div>
          </section>
        </div>,
        document.body,
      )
    : null;

  return <>{injectedButton}{modal}</>;
}
