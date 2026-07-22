'use client';

import { BookOpen, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type CourseClassItem = {
  id: string;
  course_id: string;
  name: string;
  organizer_name: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  minimum_attendance: number;
  status: 'planned' | 'open' | 'completed' | 'cancelled';
  courseName: string;
};

type LessonSummary = {
  class_id: string;
  starts_at: string;
  status: 'scheduled' | 'completed' | 'rescheduled' | 'cancelled';
};

type EnrollmentSummary = {
  class_id: string;
  status: 'enrolled' | 'completed' | 'withdrawn';
};

type ClassStats = {
  lessonCount: number;
  memberCount: number;
  nextLesson: string | null;
};

function statusLabel(status: CourseClassItem['status']) {
  if (status === 'planned') return 'Planejada';
  if (status === 'open') return 'Em andamento';
  if (status === 'completed') return 'Concluída';
  return 'Cancelada';
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function buildStats(lessons: LessonSummary[], enrollments: EnrollmentSummary[]) {
  const now = Date.now();
  const result: Record<string, ClassStats> = {};

  for (const lesson of lessons) {
    if (lesson.status === 'cancelled') continue;
    const current = result[lesson.class_id] || {
      lessonCount: 0,
      memberCount: 0,
      nextLesson: null,
    };

    current.lessonCount += 1;
    const lessonTime = new Date(lesson.starts_at).getTime();
    const currentNext = current.nextLesson
      ? new Date(current.nextLesson).getTime()
      : Number.POSITIVE_INFINITY;

    if (lessonTime >= now && lessonTime < currentNext) {
      current.nextLesson = lesson.starts_at;
    }

    result[lesson.class_id] = current;
  }

  for (const enrollment of enrollments) {
    if (enrollment.status === 'withdrawn') continue;
    const current = result[enrollment.class_id] || {
      lessonCount: 0,
      memberCount: 0,
      nextLesson: null,
    };
    current.memberCount += 1;
    result[enrollment.class_id] = current;
  }

  return result;
}

export default function CourseClassTable({
  classes,
  onOpen,
}: {
  classes: CourseClassItem[];
  onOpen: (item: CourseClassItem) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [stats, setStats] = useState<Record<string, ClassStats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadStats() {
      setLoading(true);
      setError('');

      const [lessonResult, enrollmentResult] = await Promise.all([
        supabase
          .from('course_lessons')
          .select('class_id, starts_at, status')
          .order('starts_at', { ascending: true }),
        supabase.from('course_enrollments').select('class_id, status'),
      ]);

      if (!mounted) return;

      if (lessonResult.error || enrollmentResult.error) {
        setError(
          lessonResult.error?.message ||
            enrollmentResult.error?.message ||
            'Não foi possível carregar os indicadores das turmas.',
        );
        setLoading(false);
        return;
      }

      setStats(
        buildStats(
          (lessonResult.data || []) as LessonSummary[],
          (enrollmentResult.data || []) as EnrollmentSummary[],
        ),
      );
      setLoading(false);
    }

    void loadStats();
    return () => {
      mounted = false;
    };
  }, [supabase]);

  return (
    <div className="course-class-table">
      <div className="course-class-table-head" aria-hidden="true">
        <span>Turma</span>
        <span>Aulas</span>
        <span>Membros</span>
        <span>Próxima aula</span>
        <span />
      </div>

      {error && <p className="course-class-table-error">{error}</p>}

      <div className="course-class-table-body">
        {classes.map((item) => {
          const itemStats = stats[item.id];
          return (
            <button
              type="button"
              className="course-class-table-row"
              key={item.id}
              onClick={() => onOpen(item)}
            >
              <span className="course-class-main">
                <span className="course-class-icon"><BookOpen size={20} /></span>
                <span className="course-class-copy">
                  <strong>{item.courseName}</strong>
                  <small>
                    {item.name}
                    <span aria-hidden="true"> · </span>
                    <span className={`course-class-status ${item.status}`}>
                      {statusLabel(item.status)}
                    </span>
                  </small>
                </span>
              </span>

              <span className="course-class-stat">
                <small>Aulas</small>
                <strong>{loading ? '—' : itemStats?.lessonCount || 0}</strong>
              </span>

              <span className="course-class-stat">
                <small>Membros</small>
                <strong>{loading ? '—' : itemStats?.memberCount || 0}</strong>
              </span>

              <span className="course-class-next">
                <small>Próxima aula</small>
                <strong>
                  {loading
                    ? 'Carregando...'
                    : itemStats?.nextLesson
                      ? formatDateTime(itemStats.nextLesson)
                      : 'Não agendada'}
                </strong>
              </span>

              <ChevronRight className="course-class-arrow" size={20} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
