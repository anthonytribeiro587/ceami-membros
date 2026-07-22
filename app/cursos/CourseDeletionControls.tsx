'use client';

import { Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';

type Course = { id: string; name: string };
type CourseClass = { id: string; name: string; course_id: string; courses: { name?: string } | Array<{ name?: string }> | null };

function courseName(value: CourseClass['courses']) {
  if (Array.isArray(value)) return value[0]?.name || 'Curso';
  return value?.name || 'Curso';
}

export default function CourseDeletionControls() {
  const supabase = useMemo(() => createClient(), []);
  const [target, setTarget] = useState<Element | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [open, setOpen] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [classes, setClasses] = useState<CourseClass[]>([]);
  const [classId, setClassId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const locate = () => setTarget(document.querySelector('.courses-actions'));
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    void initialize();
  }, []);

  async function initialize() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    const allowed = ['admin', 'secretaria', 'pastor', 'lider'].includes(profile?.role || '');
    setCanManage(allowed);
    if (allowed) await loadOptions();
  }

  async function loadOptions() {
    const [courseResult, classResult] = await Promise.all([
      supabase.from('courses').select('id, name').order('name'),
      supabase.from('course_classes').select('id, name, course_id, courses(name)').order('created_at', { ascending: false }),
    ]);
    if (courseResult.error || classResult.error) {
      setError(courseResult.error?.message || classResult.error?.message || 'Não foi possível carregar os registros.');
      return;
    }
    setCourses((courseResult.data || []) as Course[]);
    setClasses((classResult.data || []) as unknown as CourseClass[]);
  }

  async function deleteClass() {
    const selected = classes.find((item) => item.id === classId);
    if (!selected) return setError('Selecione uma turma.');
    const confirmation = window.prompt(`Para apagar a turma e todo o histórico de aulas e presenças, digite exatamente:\n${selected.name}`);
    if (confirmation !== selected.name) return;
    setBusy(true);
    setError('');
    const { error: deleteError } = await supabase.from('course_classes').delete().eq('id', selected.id);
    setBusy(false);
    if (deleteError) return setError(deleteError.message);
    window.location.reload();
  }

  async function deleteCourse() {
    const selected = courses.find((item) => item.id === courseId);
    if (!selected) return setError('Selecione um curso.');
    const linkedClasses = classes.filter((item) => item.course_id === selected.id);
    if (linkedClasses.length) {
      return setError(`Este curso possui ${linkedClasses.length} turma(s). Apague as turmas antes de apagar o curso.`);
    }
    const confirmation = window.prompt(`Para apagar o curso, digite exatamente:\n${selected.name}`);
    if (confirmation !== selected.name) return;
    setBusy(true);
    setError('');
    const { error: deleteError } = await supabase.from('courses').delete().eq('id', selected.id);
    setBusy(false);
    if (deleteError) return setError(deleteError.message);
    window.location.reload();
  }

  if (!canManage || !target) return null;

  return (
    <>
      {createPortal(
        <button type="button" className="course-delete-trigger" onClick={() => { setOpen(true); setError(''); void loadOptions(); }}>
          <Trash2 size={17} /> Excluir
        </button>,
        target,
      )}

      {open && createPortal(
        <div className="course-delete-overlay">
          <section className="course-delete-modal" role="dialog" aria-modal="true" aria-labelledby="course-delete-title">
            <header>
              <div><small>ÁREA DE EXCLUSÃO</small><h2 id="course-delete-title">Apagar curso ou turma</h2><p>As exclusões são permanentes e exigem a digitação do nome.</p></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar"><X /></button>
            </header>

            <div className="course-delete-body">
              <article>
                <h3>Apagar turma</h3>
                <p>Remove a turma, alunos matriculados, aulas, chamadas e presenças vinculadas.</p>
                <select value={classId} onChange={(event) => setClassId(event.target.value)}>
                  <option value="">Selecione uma turma</option>
                  {classes.map((item) => <option value={item.id} key={item.id}>{courseName(item.courses)} — {item.name}</option>)}
                </select>
                <button type="button" disabled={busy || !classId} onClick={() => void deleteClass()}><Trash2 size={17} />Apagar turma</button>
              </article>

              <article>
                <h3>Apagar curso</h3>
                <p>O curso só pode ser apagado depois que todas as suas turmas forem removidas.</p>
                <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
                  <option value="">Selecione um curso</option>
                  {courses.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                </select>
                <button type="button" disabled={busy || !courseId} onClick={() => void deleteCourse()}><Trash2 size={17} />Apagar curso</button>
              </article>

              {error && <p className="course-delete-error">{error}</p>}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
