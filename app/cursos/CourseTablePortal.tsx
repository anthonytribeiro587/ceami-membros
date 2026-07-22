'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import CourseClassTable from './CourseClassTable';

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

function nestedName(value: unknown) {
  if (Array.isArray(value)) return value[0]?.name || '';
  if (value && typeof value === 'object' && 'name' in value) {
    return String((value as { name?: unknown }).name || '');
  }
  return '';
}

export default function CourseTablePortal() {
  const supabase = useMemo(() => createClient(), []);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [classes, setClasses] = useState<CourseClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let currentGrid: HTMLElement | null = null;

    function locateGrid() {
      const grid = document.querySelector<HTMLElement>('.class-grid');
      const panel = grid?.parentElement;

      if (!grid || !panel) {
        if (currentGrid) {
          currentGrid.style.removeProperty('display');
          currentGrid = null;
        }
        setTarget(null);
        return;
      }

      if (currentGrid && currentGrid !== grid) {
        currentGrid.style.removeProperty('display');
      }

      currentGrid = grid;
      grid.style.display = 'none';
      setTarget(panel);
    }

    locateGrid();
    const observer = new MutationObserver(locateGrid);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (currentGrid) currentGrid.style.removeProperty('display');
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadClasses() {
      setLoading(true);
      setError('');

      const { data, error: loadError } = await supabase
        .from('course_classes')
        .select('*, courses(name)')
        .order('created_at', { ascending: false });

      if (!mounted) return;

      if (loadError) {
        setError(loadError.message || 'Não foi possível carregar as turmas.');
        setLoading(false);
        return;
      }

      setClasses(
        ((data || []) as Array<Record<string, unknown>>).map((row) => ({
          id: String(row.id),
          course_id: String(row.course_id),
          name: String(row.name),
          organizer_name: row.organizer_name ? String(row.organizer_name) : null,
          location: row.location ? String(row.location) : null,
          start_date: row.start_date ? String(row.start_date) : null,
          end_date: row.end_date ? String(row.end_date) : null,
          minimum_attendance: Number(row.minimum_attendance || 75),
          status: row.status as CourseClassItem['status'],
          courseName: nestedName(row.courses),
        })),
      );
      setLoading(false);
    }

    void loadClasses();
    return () => {
      mounted = false;
    };
  }, [supabase]);

  function openClass(item: CourseClassItem) {
    const cards = Array.from(document.querySelectorAll<HTMLElement>('.class-card'));
    const card = cards.find((candidate) => {
      const courseName = candidate.querySelector('small')?.textContent?.trim();
      const className = candidate.querySelector('h3')?.textContent?.trim();
      return courseName === item.courseName && className === item.name;
    });

    const button = card?.querySelector<HTMLButtonElement>('button');
    if (button) button.click();
  }

  if (!target) return null;

  return createPortal(
    <div className="course-table-portal">
      {loading && <div className="course-table-loading">Carregando turmas...</div>}
      {error && <div className="course-table-load-error">{error}</div>}
      {!loading && !error && classes.length > 0 && (
        <CourseClassTable classes={classes} onOpen={openClass} />
      )}
    </div>,
    target,
  );
}
