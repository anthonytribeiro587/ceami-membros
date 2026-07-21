'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CheckCircle2, Clock3, MapPin, Phone, ShieldCheck } from 'lucide-react';

type LessonInfo = {
  courseName: string;
  className: string;
  lessonNumber: number;
  lessonTitle: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  checkinOpen: boolean;
  message: string;
};

type SuccessData = {
  memberName: string;
  alreadyCheckedIn: boolean;
  checkedInAt: string | null;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatTime(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date(value));
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export default function CheckinClient({ token }: { token: string }) {
  const [lesson, setLesson] = useState<LessonInfo | null>(null);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<SuccessData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(`/api/public/course-checkin?token=${encodeURIComponent(token)}`, {
          cache: 'no-store',
        });
        const payload = (await response.json()) as LessonInfo & { error?: string };

        if (!response.ok) throw new Error(payload.error || 'Não foi possível abrir o check-in.');
        if (!cancelled) setLesson(payload);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Não foi possível abrir o check-in.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/public/course-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, phone }),
      });
      const payload = (await response.json()) as SuccessData & { error?: string };

      if (!response.ok) throw new Error(payload.error || 'Não foi possível registrar sua presença.');
      setSuccess(payload);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Não foi possível registrar sua presença.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="course-checkin-page">
      <section className="course-checkin-card">
        <div className="course-checkin-brand">
          <div>CE</div>
          <span>
            <strong>CEAMI</strong>
            <small>Presença em cursos</small>
          </span>
        </div>

        {loading && <p className="course-checkin-state">Carregando aula...</p>}

        {!loading && lesson && (
          <>
            <header className="course-checkin-header">
              <span>CHECK-IN DA AULA</span>
              <h1>{lesson.courseName}</h1>
              <p>{lesson.className}</p>
            </header>

            <div className="course-checkin-lesson">
              <strong>
                Aula {lesson.lessonNumber} — {lesson.lessonTitle}
              </strong>
              <span>
                <Clock3 size={17} />
                {formatDateTime(lesson.startsAt)}
                {lesson.endsAt ? ` até ${formatTime(lesson.endsAt)}` : ''}
              </span>
              {lesson.location && (
                <span>
                  <MapPin size={17} />
                  {lesson.location}
                </span>
              )}
            </div>

            {success ? (
              <section className="course-checkin-success" aria-live="polite">
                <CheckCircle2 size={42} />
                <h2>Presença confirmada</h2>
                <p>
                  {success.memberName}, seu check-in foi {success.alreadyCheckedIn ? 'confirmado novamente' : 'registrado'}.
                </p>
                {success.checkedInAt && (
                  <small>Horário registrado: {formatTime(success.checkedInAt)}</small>
                )}
              </section>
            ) : lesson.checkinOpen ? (
              <form onSubmit={submit} className="course-checkin-form">
                <label htmlFor="checkin-phone">Telefone cadastrado</label>
                <div>
                  <Phone size={18} />
                  <input
                    id="checkin-phone"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) => setPhone(formatPhone(event.target.value))}
                    placeholder="(51) 99999-9999"
                    required
                  />
                </div>
                <p>Use o mesmo telefone informado na inscrição da turma.</p>
                <button type="submit" disabled={submitting}>
                  {submitting ? 'Confirmando...' : 'Confirmar presença'}
                </button>
              </form>
            ) : (
              <section className="course-checkin-closed">
                <Clock3 size={34} />
                <h2>Check-in indisponível</h2>
                <p>{lesson.message}</p>
              </section>
            )}
          </>
        )}

        {error && <p className="course-checkin-error" aria-live="polite">{error}</p>}

        <footer className="course-checkin-footer">
          <ShieldCheck size={16} />
          O telefone é utilizado somente para localizar sua inscrição nesta turma.
        </footer>
      </section>
    </main>
  );
}
