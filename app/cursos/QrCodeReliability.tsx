'use client';

import { Copy, Printer, QrCode, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';

type LessonQr = {
  id: string;
  lesson_number: number;
  title: string;
  starts_at: string;
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

function isFutureLesson(lesson: LessonQr) {
  return new Date(lesson.starts_at).getTime() > Date.now();
}

export default function QrCodeReliability() {
  const supabase = useMemo(() => createClient(), []);
  const [actionTarget, setActionTarget] = useState<Element | null>(null);
  const [lesson, setLesson] = useState<LessonQr | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
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

    function syncFutureLessonGuard(currentLesson: LessonQr) {
      const finishButton = document.querySelector('.lesson-footer-actions button') as HTMLButtonElement | null;
      if (!finishButton) return;

      const guarded = finishButton.dataset.ceamiFutureGuard === 'true';
      const shouldGuard = isFutureLesson(currentLesson) && currentLesson.status !== 'completed';

      if (shouldGuard) {
        finishButton.disabled = true;
        finishButton.dataset.ceamiFutureGuard = 'true';
        finishButton.title = 'A aula só pode ser encerrada na data agendada ou depois dela.';
        return;
      }

      if (guarded) {
        finishButton.disabled = false;
        delete finishButton.dataset.ceamiFutureGuard;
        finishButton.removeAttribute('title');
      }
    }

    async function locateLesson() {
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

      const lessonMatch = heading.match(/^Aula\s+(\d+)\s*:/i);
      const separatorIndex = context.indexOf('·');
      if (!lessonMatch || separatorIndex < 0) return;

      const lessonNumber = Number(lessonMatch[1]);
      const courseName = context.slice(0, separatorIndex).trim();
      const className = context.slice(separatorIndex + 1).trim();
      const signature = `${courseName}|${className}|${lessonNumber}`;

      const nativeQrControl = Array.from(
        actions.querySelectorAll('button:not([data-ceami-qr-reliability="true"])'),
      ).some((button) => /qr|check-in/i.test(button.textContent || ''));

      setActionTarget((current) => {
        const next = nativeQrControl ? null : actions;
        return current === next ? current : next;
      });

      if (lastSignature.current === signature && lesson) {
        syncFutureLessonGuard(lesson);
        return;
      }
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
        .select('id, lesson_number, title, starts_at, checkin_token, checkin_enabled, status')
        .eq('class_id', matchedClass.id)
        .eq('lesson_number', lessonNumber)
        .maybeSingle();

      if (!cancelled && !lessonError && lessonRow) {
        const loadedLesson = lessonRow as LessonQr;
        setLesson(loadedLesson);
        syncFutureLessonGuard(loadedLesson);
      }
    }

    const scheduleLocate = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void locateLesson(), 120);
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

  async function reopenFutureLesson() {
    if (!lesson || !isFutureLesson(lesson) || lesson.status !== 'completed') return;
    if (!window.confirm('Reabrir esta aula e apagar as presenças registradas durante o teste?')) return;

    setBusy(true);
    setActionError('');

    const { error: attendanceError } = await supabase
      .from('course_attendance')
      .delete()
      .eq('lesson_id', lesson.id);

    if (attendanceError) {
      setBusy(false);
      setActionError(attendanceError.message);
      return;
    }

    const { error: lessonError } = await supabase
      .from('course_lessons')
      .update({
        status: 'scheduled',
        checkin_enabled: false,
        checkin_open_at: null,
        checkin_close_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lesson.id);

    setBusy(false);
    if (lessonError) {
      setActionError(lessonError.message);
      return;
    }

    window.location.reload();
  }

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
            setActionError('');
            setModalOpen(true);
          }}
        >
          <QrCode size={17} />Visualizar QR
        </button>,
        actionTarget,
      )
    : null;

  const lessonIsFuture = Boolean(lesson && isFutureLesson(lesson));

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
                  {lesson.status === 'completed' && lessonIsFuture
                    ? 'Esta aula foi encerrada antes da data agendada. Reabra a aula para voltar ao estado correto.'
                    : lesson.status === 'completed'
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
              {actionError && <p className="form-error">{actionError}</p>}
              <div className="qr-actions">
                {lesson.status === 'completed' && lessonIsFuture && (
                  <button type="button" className="secondary" disabled={busy} onClick={() => void reopenFutureLesson()}>
                    <RotateCcw size={17} />{busy ? 'Reabrindo...' : 'Reabrir e limpar chamada'}
                  </button>
                )}
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
