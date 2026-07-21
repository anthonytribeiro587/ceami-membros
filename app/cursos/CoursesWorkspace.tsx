'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Check,
  ClipboardCheck,
  Clock3,
  Copy,
  GraduationCap,
  MapPin,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';

type Course = {
  id: string;
  name: string;
  description: string | null;
  default_lesson_count: number | null;
  default_minimum_attendance: number;
  status: 'active' | 'inactive';
};

type CourseClass = {
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

type MemberOption = {
  id: string;
  full_name: string;
  phone: string | null;
};

type Enrollment = {
  id: string;
  member_id: string;
  status: 'enrolled' | 'completed' | 'withdrawn';
  member: MemberOption;
};

type Lesson = {
  id: string;
  class_id: string;
  lesson_number: number;
  title: string;
  starts_at: string;
  ends_at: string | null;
  status: 'scheduled' | 'completed' | 'rescheduled' | 'cancelled';
  notes: string | null;
  checkin_token: string;
  checkin_enabled: boolean;
  checkin_open_at: string | null;
  checkin_close_at: string | null;
};

type AttendanceStatus = 'present' | 'late' | 'absent' | 'justified';

type Attendance = {
  id?: string;
  lesson_id: string;
  member_id: string;
  status: AttendanceStatus;
  source: 'manual' | 'qr';
  checked_in_at: string | null;
};

type Tab = 'students' | 'lessons' | 'frequency';

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Presente',
  late: 'Atrasado',
  absent: 'Falta',
  justified: 'Justificada',
};

function nestedName(value: unknown) {
  if (Array.isArray(value)) return value[0]?.name || '';
  if (value && typeof value === 'object' && 'name' in value) {
    return String((value as { name?: unknown }).name || '');
  }
  return '';
}

function formatDate(value: string | null) {
  if (!value) return 'Não informado';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(
    new Date(`${value}T12:00:00`),
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function toIso(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

function classStatusLabel(status: CourseClass['status']) {
  if (status === 'planned') return 'Planejada';
  if (status === 'open') return 'Em andamento';
  if (status === 'completed') return 'Concluída';
  return 'Cancelada';
}

function lessonStatusLabel(status: Lesson['status']) {
  if (status === 'scheduled') return 'Agendada';
  if (status === 'completed') return 'Realizada';
  if (status === 'rescheduled') return 'Remarcada';
  return 'Cancelada';
}

export default function CoursesWorkspace() {
  const supabase = useMemo(() => createClient(), []);
  const [courses, setCourses] = useState<Course[]>([]);
  const [classes, setClasses] = useState<CourseClass[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [selectedClass, setSelectedClass] = useState<CourseClass | null>(null);
  const [role, setRole] = useState('visualizador');
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [courseModal, setCourseModal] = useState(false);
  const [classModal, setClassModal] = useState(false);

  const canManage = ['admin', 'secretaria', 'pastor', 'lider'].includes(role);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function load() {
    setLoading(true);
    setError('');

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError('Sessão não encontrada. Entre novamente no painel.');
      setLoading(false);
      return;
    }

    setUserId(user.id);

    const [profileResult, courseResult, classResult, memberResult] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
      supabase.from('courses').select('*').order('name'),
      supabase
        .from('course_classes')
        .select('*, courses(name)')
        .order('created_at', { ascending: false }),
      supabase.from('members').select('id, full_name, phone').order('full_name'),
    ]);

    if (courseResult.error || classResult.error || memberResult.error) {
      setError(
        courseResult.error?.message ||
          classResult.error?.message ||
          memberResult.error?.message ||
          'Não foi possível carregar os cursos.',
      );
      setLoading(false);
      return;
    }

    setRole(profileResult.data?.role || 'visualizador');
    setCourses((courseResult.data || []) as Course[]);
    setClasses(
      ((classResult.data || []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        course_id: String(row.course_id),
        name: String(row.name),
        organizer_name: row.organizer_name ? String(row.organizer_name) : null,
        location: row.location ? String(row.location) : null,
        start_date: row.start_date ? String(row.start_date) : null,
        end_date: row.end_date ? String(row.end_date) : null,
        minimum_attendance: Number(row.minimum_attendance || 75),
        status: row.status as CourseClass['status'],
        courseName: nestedName(row.courses),
      })),
    );
    setMembers((memberResult.data || []) as MemberOption[]);
    setLoading(false);
  }

  async function refreshClasses() {
    const { data, error: refreshError } = await supabase
      .from('course_classes')
      .select('*, courses(name)')
      .order('created_at', { ascending: false });

    if (refreshError) return setError(refreshError.message);

    const normalized = ((data || []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      course_id: String(row.course_id),
      name: String(row.name),
      organizer_name: row.organizer_name ? String(row.organizer_name) : null,
      location: row.location ? String(row.location) : null,
      start_date: row.start_date ? String(row.start_date) : null,
      end_date: row.end_date ? String(row.end_date) : null,
      minimum_attendance: Number(row.minimum_attendance || 75),
      status: row.status as CourseClass['status'],
      courseName: nestedName(row.courses),
    }));

    setClasses(normalized);
    if (selectedClass) {
      setSelectedClass(normalized.find((item) => item.id === selectedClass.id) || null);
    }
  }

  if (selectedClass && userId) {
    return (
      <ClassWorkspace
        classInfo={selectedClass}
        members={members}
        userId={userId}
        canManage={canManage}
        onBack={() => setSelectedClass(null)}
        onChanged={async (message) => {
          await refreshClasses();
          setToast(message);
        }}
      />
    );
  }

  return (
    <main className="courses-page">
      <header className="courses-topbar">
        <div>
          <Link href="/" className="courses-back">
            <ArrowLeft size={18} /> CEAMI Membros
          </Link>
          <span>GESTÃO DE FORMAÇÃO</span>
          <h1>Cursos e presença</h1>
          <p>Organize turmas, aulas, alunos, chamada manual e check-in por QR Code.</p>
        </div>
        <div className="courses-actions">
          <button type="button" className="secondary" onClick={() => void load()}>
            <RefreshCw size={17} /> Atualizar
          </button>
          {canManage && (
            <>
              <button type="button" className="secondary" onClick={() => setCourseModal(true)}>
                <BookOpen size={17} /> Novo curso
              </button>
              <button type="button" className="primary" onClick={() => setClassModal(true)}>
                <Plus size={17} /> Nova turma
              </button>
            </>
          )}
        </div>
      </header>

      {loading && <section className="courses-panel">Carregando cursos...</section>}
      {error && <section className="courses-error">{error}</section>}

      {!loading && !error && (
        <>
          <section className="courses-metrics">
            <article>
              <BookOpen />
              <div><small>Cursos</small><strong>{courses.length}</strong></div>
            </article>
            <article>
              <GraduationCap />
              <div><small>Turmas ativas</small><strong>{classes.filter((item) => item.status === 'open').length}</strong></div>
            </article>
            <article>
              <Users />
              <div><small>Membros disponíveis</small><strong>{members.length}</strong></div>
            </article>
          </section>

          <section className="courses-panel">
            <div className="courses-panel-head">
              <div>
                <h2>Turmas</h2>
                <p>Abra uma turma para adicionar alunos, criar aulas e registrar presenças.</p>
              </div>
            </div>

            {classes.length ? (
              <div className="class-grid">
                {classes.map((item) => (
                  <article className="class-card" key={item.id}>
                    <div className="class-card-head">
                      <span className={`status-pill ${item.status}`}>{classStatusLabel(item.status)}</span>
                      <GraduationCap size={22} />
                    </div>
                    <small>{item.courseName}</small>
                    <h3>{item.name}</h3>
                    <div className="class-meta">
                      <span><CalendarDays size={16} />{formatDate(item.start_date)} até {formatDate(item.end_date)}</span>
                      {item.location && <span><MapPin size={16} />{item.location}</span>}
                      {item.organizer_name && <span><Users size={16} />{item.organizer_name}</span>}
                    </div>
                    <button type="button" onClick={() => setSelectedClass(item)}>Abrir turma</button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="courses-empty">
                <GraduationCap size={36} />
                <h3>Nenhuma turma cadastrada</h3>
                <p>Cadastre um curso e depois abra a primeira turma.</p>
              </div>
            )}
          </section>
        </>
      )}

      {courseModal && userId && (
        <CourseModal
          userId={userId}
          onClose={() => setCourseModal(false)}
          onSaved={async () => {
            setCourseModal(false);
            await load();
            setToast('Curso criado');
          }}
        />
      )}

      {classModal && userId && (
        <ClassModal
          courses={courses}
          userId={userId}
          onClose={() => setClassModal(false)}
          onSaved={async () => {
            setClassModal(false);
            await load();
            setToast('Turma criada');
          }}
        />
      )}

      {toast && <div className="courses-toast"><Check size={17} />{toast}</div>}
    </main>
  );
}

function CourseModal({
  userId,
  onClose,
  onSaved,
}: {
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [lessonCount, setLessonCount] = useState('');
  const [minimumAttendance, setMinimumAttendance] = useState('75');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!name.trim()) return setError('Informe o nome do curso.');
    setSaving(true);
    setError('');

    const { error: saveError } = await supabase.from('courses').insert({
      name: name.trim(),
      description: description.trim() || null,
      default_lesson_count: lessonCount ? Number(lessonCount) : null,
      default_minimum_attendance: Number(minimumAttendance || 75),
      created_by: userId,
    });

    setSaving(false);
    if (saveError) return setError(saveError.message);
    onSaved();
  }

  return (
    <Modal title="Novo curso" subtitle="Cadastre o conteúdo base que poderá ter várias turmas." onClose={onClose}>
      <Field label="Nome do curso"><input value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <Field label="Descrição"><textarea value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
      <div className="form-grid two">
        <Field label="Quantidade prevista de aulas"><input type="number" min="1" value={lessonCount} onChange={(event) => setLessonCount(event.target.value)} /></Field>
        <Field label="Presença mínima (%)"><input type="number" min="0" max="100" value={minimumAttendance} onChange={(event) => setMinimumAttendance(event.target.value)} /></Field>
      </div>
      {error && <p className="form-error">{error}</p>}
      <ModalActions onClose={onClose} onSave={() => void save()} saving={saving} />
    </Modal>
  );
}

function ClassModal({
  courses,
  userId,
  onClose,
  onSaved,
}: {
  courses: Course[];
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [courseId, setCourseId] = useState(courses[0]?.id || '');
  const [name, setName] = useState('');
  const [organizer, setOrganizer] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [minimumAttendance, setMinimumAttendance] = useState('75');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!courseId) return setError('Cadastre ou selecione um curso.');
    if (!name.trim()) return setError('Informe o nome da turma.');
    setSaving(true);
    setError('');

    const { error: saveError } = await supabase.from('course_classes').insert({
      course_id: courseId,
      name: name.trim(),
      organizer_name: organizer.trim() || null,
      location: location.trim() || null,
      start_date: startDate || null,
      end_date: endDate || null,
      minimum_attendance: Number(minimumAttendance || 75),
      status: 'planned',
      created_by: userId,
    });

    setSaving(false);
    if (saveError) return setError(saveError.message);
    onSaved();
  }

  return (
    <Modal title="Nova turma" subtitle="Abra uma edição específica de um curso." onClose={onClose}>
      <Field label="Curso">
        <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
          <option value="">Selecione</option>
          {courses.map((course) => <option value={course.id} key={course.id}>{course.name}</option>)}
        </select>
      </Field>
      <Field label="Nome da turma"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Turma 2026/2" /></Field>
      <div className="form-grid two">
        <Field label="Organizador ou professor"><input value={organizer} onChange={(event) => setOrganizer(event.target.value)} /></Field>
        <Field label="Local"><input value={location} onChange={(event) => setLocation(event.target.value)} /></Field>
      </div>
      <div className="form-grid three">
        <Field label="Início"><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></Field>
        <Field label="Término previsto"><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></Field>
        <Field label="Presença mínima (%)"><input type="number" min="0" max="100" value={minimumAttendance} onChange={(event) => setMinimumAttendance(event.target.value)} /></Field>
      </div>
      {error && <p className="form-error">{error}</p>}
      <ModalActions onClose={onClose} onSave={() => void save()} saving={saving} />
    </Modal>
  );
}

function ClassWorkspace({
  classInfo,
  members,
  userId,
  canManage,
  onBack,
  onChanged,
}: {
  classInfo: CourseClass;
  members: MemberOption[];
  userId: string;
  canManage: boolean;
  onBack: () => void;
  onChanged: (message: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>('lessons');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [lessonModal, setLessonModal] = useState(false);
  const [studentsModal, setStudentsModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void loadClassData();
  }, [classInfo.id]);

  async function loadClassData() {
    setLoading(true);
    setError('');

    const [lessonResult, enrollmentResult] = await Promise.all([
      supabase.from('course_lessons').select('*').eq('class_id', classInfo.id).order('lesson_number'),
      supabase
        .from('course_enrollments')
        .select('id, member_id, status, members(id, full_name, phone)')
        .eq('class_id', classInfo.id)
        .order('enrolled_at'),
    ]);

    if (lessonResult.error || enrollmentResult.error) {
      setError(lessonResult.error?.message || enrollmentResult.error?.message || 'Não foi possível carregar a turma.');
      setLoading(false);
      return;
    }

    const loadedLessons = (lessonResult.data || []) as Lesson[];
    setLessons(loadedLessons);
    setEnrollments(
      ((enrollmentResult.data || []) as Array<Record<string, unknown>>).map((row) => {
        const rawMember = Array.isArray(row.members) ? row.members[0] : row.members;
        const member = rawMember as MemberOption;
        return {
          id: String(row.id),
          member_id: String(row.member_id),
          status: row.status as Enrollment['status'],
          member,
        };
      }),
    );

    if (loadedLessons.length) {
      const { data: attendanceRows, error: attendanceError } = await supabase
        .from('course_attendance')
        .select('id, lesson_id, member_id, status, source, checked_in_at')
        .in('lesson_id', loadedLessons.map((lesson) => lesson.id));
      if (attendanceError) setError(attendanceError.message);
      setAttendance((attendanceRows || []) as Attendance[]);
    } else {
      setAttendance([]);
    }

    setLoading(false);
  }

  async function removeEnrollment(enrollment: Enrollment) {
    if (!window.confirm(`Remover ${enrollment.member.full_name} desta turma?`)) return;
    const { error: removeError } = await supabase.from('course_enrollments').delete().eq('id', enrollment.id);
    if (removeError) return setError(removeError.message);
    await loadClassData();
  }

  async function setClassStatus(status: CourseClass['status']) {
    const { error: statusError } = await supabase
      .from('course_classes')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', classInfo.id);
    if (statusError) return setError(statusError.message);
    await onChanged('Situação da turma atualizada');
  }

  const completedLessons = lessons.filter((lesson) => lesson.status === 'completed');
  const nextLesson = lessons.find((lesson) => lesson.status === 'scheduled' && new Date(lesson.starts_at).getTime() >= Date.now());

  if (selectedLesson) {
    return (
      <LessonAttendance
        lesson={selectedLesson}
        classInfo={classInfo}
        enrollments={enrollments.filter((item) => item.status === 'enrolled')}
        attendance={attendance.filter((item) => item.lesson_id === selectedLesson.id)}
        userId={userId}
        canManage={canManage}
        onBack={() => setSelectedLesson(null)}
        onChanged={async (message) => {
          await loadClassData();
          const refreshed = lessons.find((item) => item.id === selectedLesson.id);
          if (refreshed) setSelectedLesson(refreshed);
          await onChanged(message);
        }}
      />
    );
  }

  return (
    <main className="courses-page class-workspace">
      <header className="courses-topbar">
        <div>
          <button type="button" className="courses-back button-link" onClick={onBack}><ArrowLeft size={18} />Voltar às turmas</button>
          <span>{classInfo.courseName}</span>
          <h1>{classInfo.name}</h1>
          <p>{classInfo.organizer_name || 'Organizador não informado'} {classInfo.location ? `· ${classInfo.location}` : ''}</p>
        </div>
        {canManage && (
          <div className="courses-actions">
            <select value={classInfo.status} onChange={(event) => void setClassStatus(event.target.value as CourseClass['status'])}>
              <option value="planned">Planejada</option>
              <option value="open">Em andamento</option>
              <option value="completed">Concluída</option>
              <option value="cancelled">Cancelada</option>
            </select>
            <button type="button" className="secondary" onClick={() => setStudentsModal(true)}><UserPlus size={17} />Adicionar alunos</button>
            <button type="button" className="primary" onClick={() => setLessonModal(true)}><Plus size={17} />Nova aula</button>
          </div>
        )}
      </header>

      <section className="courses-metrics">
        <article><Users /><div><small>Alunos ativos</small><strong>{enrollments.filter((item) => item.status === 'enrolled').length}</strong></div></article>
        <article><ClipboardCheck /><div><small>Aulas realizadas</small><strong>{completedLessons.length}</strong></div></article>
        <article><CalendarDays /><div><small>Próxima aula</small><strong className="metric-date">{nextLesson ? formatDateTime(nextLesson.starts_at) : 'Não definida'}</strong></div></article>
      </section>

      <div className="course-tabs">
        <button type="button" className={tab === 'lessons' ? 'active' : ''} onClick={() => setTab('lessons')}>Aulas</button>
        <button type="button" className={tab === 'students' ? 'active' : ''} onClick={() => setTab('students')}>Alunos</button>
        <button type="button" className={tab === 'frequency' ? 'active' : ''} onClick={() => setTab('frequency')}>Frequência</button>
      </div>

      {loading && <section className="courses-panel">Carregando turma...</section>}
      {error && <section className="courses-error">{error}</section>}

      {!loading && tab === 'lessons' && (
        <section className="courses-panel">
          <div className="courses-panel-head"><div><h2>Aulas da turma</h2><p>Cada aula possui sua própria chamada e QR Code.</p></div></div>
          {lessons.length ? (
            <div className="lesson-list">
              {lessons.map((lesson) => {
                const lessonAttendance = attendance.filter((item) => item.lesson_id === lesson.id);
                const presentCount = lessonAttendance.filter((item) => item.status === 'present' || item.status === 'late').length;
                return (
                  <article className="lesson-row" key={lesson.id}>
                    <div className="lesson-number">{lesson.lesson_number}</div>
                    <div className="lesson-main">
                      <div><strong>{lesson.title}</strong><span className={`status-pill ${lesson.status}`}>{lessonStatusLabel(lesson.status)}</span></div>
                      <p><Clock3 size={15} />{formatDateTime(lesson.starts_at)} {lesson.checkin_enabled ? '· Check-in aberto' : ''}</p>
                    </div>
                    <div className="lesson-count"><strong>{presentCount}</strong><small>presentes</small></div>
                    <button type="button" onClick={() => setSelectedLesson(lesson)}>Abrir chamada</button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="courses-empty"><CalendarDays size={34} /><h3>Nenhuma aula criada</h3><p>O organizador pode criar as aulas individualmente conforme o curso avançar.</p></div>
          )}
        </section>
      )}

      {!loading && tab === 'students' && (
        <section className="courses-panel">
          <div className="courses-panel-head"><div><h2>Alunos inscritos</h2><p>{enrollments.length} pessoas vinculadas à turma.</p></div></div>
          <div className="student-list">
            {enrollments.map((item) => (
              <article key={item.id}>
                <div className="student-avatar">{item.member.full_name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div>
                <div><strong>{item.member.full_name}</strong><span>{item.member.phone || 'Sem telefone cadastrado'}</span></div>
                <span className={`status-pill ${item.status}`}>{item.status === 'enrolled' ? 'Matriculado' : item.status === 'completed' ? 'Concluiu' : 'Desistente'}</span>
                {canManage && <button type="button" className="icon-danger" onClick={() => void removeEnrollment(item)} aria-label="Remover aluno"><Trash2 size={17} /></button>}
              </article>
            ))}
          </div>
        </section>
      )}

      {!loading && tab === 'frequency' && (
        <FrequencyReport
          lessons={completedLessons}
          enrollments={enrollments.filter((item) => item.status !== 'withdrawn')}
          attendance={attendance}
          minimum={classInfo.minimum_attendance}
        />
      )}

      {lessonModal && (
        <LessonModal
          classId={classInfo.id}
          nextNumber={Math.max(0, ...lessons.map((item) => item.lesson_number)) + 1}
          userId={userId}
          onClose={() => setLessonModal(false)}
          onSaved={async () => {
            setLessonModal(false);
            await loadClassData();
            await onChanged('Aula criada');
          }}
        />
      )}

      {studentsModal && (
        <StudentsModal
          classId={classInfo.id}
          members={members}
          enrolledIds={new Set(enrollments.map((item) => item.member_id))}
          userId={userId}
          onClose={() => setStudentsModal(false)}
          onSaved={async () => {
            setStudentsModal(false);
            await loadClassData();
            await onChanged('Alunos adicionados');
          }}
        />
      )}
    </main>
  );
}

function LessonModal({
  classId,
  nextNumber,
  userId,
  onClose,
  onSaved,
}: {
  classId: string;
  nextNumber: number;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('19:30');
  const [endTime, setEndTime] = useState('21:00');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!title.trim() || !date || !startTime) return setError('Informe título, data e horário.');
    setSaving(true);
    setError('');

    const { error: saveError } = await supabase.from('course_lessons').insert({
      class_id: classId,
      lesson_number: nextNumber,
      title: title.trim(),
      starts_at: toIso(date, startTime),
      ends_at: endTime ? toIso(date, endTime) : null,
      notes: notes.trim() || null,
      created_by: userId,
    });

    setSaving(false);
    if (saveError) return setError(saveError.message);
    onSaved();
  }

  return (
    <Modal title={`Nova aula ${nextNumber}`} subtitle="Crie a aula e depois abra a chamada ou o QR Code." onClose={onClose}>
      <Field label="Tema da aula"><input value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
      <div className="form-grid three">
        <Field label="Data"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        <Field label="Início"><input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></Field>
        <Field label="Término"><input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></Field>
      </div>
      <Field label="Observações"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
      {error && <p className="form-error">{error}</p>}
      <ModalActions onClose={onClose} onSave={() => void save()} saving={saving} />
    </Modal>
  );
}

function StudentsModal({
  classId,
  members,
  enrolledIds,
  userId,
  onClose,
  onSaved,
}: {
  classId: string;
  members: MemberOption[];
  enrolledIds: Set<string>;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const available = members.filter((member) => {
    if (enrolledIds.has(member.id)) return false;
    return `${member.full_name} ${member.phone || ''}`.toLowerCase().includes(query.toLowerCase());
  });

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    if (!selected.size) return setError('Selecione pelo menos um aluno.');
    setSaving(true);
    setError('');

    const { error: saveError } = await supabase.from('course_enrollments').insert(
      Array.from(selected).map((memberId) => ({
        class_id: classId,
        member_id: memberId,
        enrolled_by: userId,
      })),
    );

    setSaving(false);
    if (saveError) return setError(saveError.message);
    onSaved();
  }

  return (
    <Modal title="Adicionar alunos" subtitle="Selecione os membros já cadastrados no CEAMI Membros." onClose={onClose} wide>
      <div className="modal-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome ou telefone" /></div>
      <div className="member-picker">
        {available.map((member) => (
          <label key={member.id} className={selected.has(member.id) ? 'selected' : ''}>
            <input type="checkbox" checked={selected.has(member.id)} onChange={() => toggle(member.id)} />
            <span><strong>{member.full_name}</strong><small>{member.phone || 'Sem telefone'}</small></span>
            {selected.has(member.id) && <Check size={18} />}
          </label>
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}
      <ModalActions onClose={onClose} onSave={() => void save()} saving={saving} saveLabel={`Adicionar ${selected.size || ''}`.trim()} />
    </Modal>
  );
}

function LessonAttendance({
  lesson,
  classInfo,
  enrollments,
  attendance,
  userId,
  canManage,
  onBack,
  onChanged,
}: {
  lesson: Lesson;
  classInfo: CourseClass;
  enrollments: Enrollment[];
  attendance: Attendance[];
  userId: string;
  canManage: boolean;
  onBack: () => void;
  onChanged: (message: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const attendanceMap = useMemo(
    () => new Map(attendance.map((item) => [item.member_id, item])),
    [attendance],
  );

  const visible = enrollments.filter((item) =>
    `${item.member.full_name} ${item.member.phone || ''}`.toLowerCase().includes(query.toLowerCase()),
  );

  const presentCount = attendance.filter((item) => item.status === 'present' || item.status === 'late').length;
  const pendingCount = Math.max(0, enrollments.length - attendance.length);
  const checkinUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/checkin/${lesson.checkin_token}`;
  const qrImage = checkinUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=12&data=${encodeURIComponent(checkinUrl)}`
    : '';

  async function setAttendance(memberId: string, status: AttendanceStatus) {
    setWorking(true);
    setError('');
    const now = new Date().toISOString();
    const { error: saveError } = await supabase.from('course_attendance').upsert(
      {
        lesson_id: lesson.id,
        member_id: memberId,
        status,
        source: 'manual',
        checked_in_at: status === 'present' || status === 'late' ? now : null,
        recorded_by: userId,
        updated_at: now,
      },
      { onConflict: 'lesson_id,member_id' },
    );
    setWorking(false);
    if (saveError) return setError(saveError.message);
    await onChanged('Presença atualizada');
  }

  async function markAllPresent() {
    if (!enrollments.length) return;
    setWorking(true);
    const now = new Date().toISOString();
    const { error: saveError } = await supabase.from('course_attendance').upsert(
      enrollments.map((item) => ({
        lesson_id: lesson.id,
        member_id: item.member_id,
        status: 'present',
        source: 'manual',
        checked_in_at: now,
        recorded_by: userId,
        updated_at: now,
      })),
      { onConflict: 'lesson_id,member_id' },
    );
    setWorking(false);
    if (saveError) return setError(saveError.message);
    await onChanged('Todos foram marcados como presentes');
  }

  async function openCheckin() {
    setWorking(true);
    const now = new Date();
    const end = lesson.ends_at ? new Date(lesson.ends_at) : new Date(now.getTime() + 3 * 60 * 60 * 1000);
    end.setMinutes(end.getMinutes() + 30);

    const { error: saveError } = await supabase
      .from('course_lessons')
      .update({
        checkin_enabled: true,
        checkin_open_at: now.toISOString(),
        checkin_close_at: end.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', lesson.id);
    setWorking(false);
    if (saveError) return setError(saveError.message);
    setQrOpen(true);
    await onChanged('Check-in aberto');
  }

  async function closeCheckin() {
    setWorking(true);
    const { error: saveError } = await supabase
      .from('course_lessons')
      .update({ checkin_enabled: false, updated_at: new Date().toISOString() })
      .eq('id', lesson.id);
    setWorking(false);
    if (saveError) return setError(saveError.message);
    setQrOpen(false);
    await onChanged('Check-in encerrado');
  }

  async function regenerateToken() {
    if (!window.confirm('Gerar um novo QR invalida imediatamente o link anterior. Continuar?')) return;
    const token = crypto.randomUUID();
    const { error: saveError } = await supabase
      .from('course_lessons')
      .update({ checkin_token: token, updated_at: new Date().toISOString() })
      .eq('id', lesson.id);
    if (saveError) return setError(saveError.message);
    await onChanged('Novo QR Code gerado');
  }

  async function completeLesson() {
    if (!window.confirm('Encerrar esta aula e marcar os alunos pendentes como falta?')) return;
    setWorking(true);
    const now = new Date().toISOString();
    const missing = enrollments.filter((item) => !attendanceMap.has(item.member_id));

    if (missing.length) {
      const { error: missingError } = await supabase.from('course_attendance').upsert(
        missing.map((item) => ({
          lesson_id: lesson.id,
          member_id: item.member_id,
          status: 'absent',
          source: 'manual',
          checked_in_at: null,
          recorded_by: userId,
          updated_at: now,
        })),
        { onConflict: 'lesson_id,member_id' },
      );
      if (missingError) {
        setWorking(false);
        return setError(missingError.message);
      }
    }

    const { error: lessonError } = await supabase
      .from('course_lessons')
      .update({ status: 'completed', checkin_enabled: false, updated_at: now })
      .eq('id', lesson.id);
    setWorking(false);
    if (lessonError) return setError(lessonError.message);
    await onChanged('Aula encerrada');
  }

  function printAttendanceSheet() {
    const rows = enrollments.map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.member.full_name)}</td><td>${escapeHtml(item.member.phone || '')}</td><td class="signature"></td></tr>`).join('');
    openPrintWindow(`
      <h1>${escapeHtml(classInfo.courseName)}</h1>
      <h2>${escapeHtml(classInfo.name)} — Aula ${lesson.lesson_number}: ${escapeHtml(lesson.title)}</h2>
      <p>${escapeHtml(formatDateTime(lesson.starts_at))}${classInfo.location ? ` · ${escapeHtml(classInfo.location)}` : ''}</p>
      <table><thead><tr><th>#</th><th>Aluno</th><th>Telefone</th><th>Assinatura</th></tr></thead><tbody>${rows}</tbody></table>
    `, 'Lista de presença');
  }

  function printQr() {
    openPrintWindow(`
      <div class="qr-sheet">
        <h1>${escapeHtml(classInfo.courseName)}</h1>
        <h2>${escapeHtml(classInfo.name)}</h2>
        <p>Aula ${lesson.lesson_number}: ${escapeHtml(lesson.title)}</p>
        <img src="${qrImage}" alt="QR Code da aula" />
        <strong>Escaneie e informe o telefone usado na inscrição.</strong>
        <small>O QR funciona somente enquanto o organizador mantiver o check-in aberto.</small>
      </div>
    `, 'QR Code de check-in');
  }

  return (
    <main className="courses-page lesson-attendance-page">
      <header className="courses-topbar">
        <div>
          <button type="button" className="courses-back button-link" onClick={onBack}><ArrowLeft size={18} />Voltar à turma</button>
          <span>{classInfo.courseName} · {classInfo.name}</span>
          <h1>Aula {lesson.lesson_number}: {lesson.title}</h1>
          <p>{formatDateTime(lesson.starts_at)} {classInfo.location ? `· ${classInfo.location}` : ''}</p>
        </div>
        {canManage && (
          <div className="courses-actions">
            <button type="button" className="secondary" onClick={printAttendanceSheet}><Printer size={17} />Imprimir lista</button>
            {lesson.checkin_enabled ? (
              <>
                <button type="button" className="secondary" onClick={() => setQrOpen(true)}><QrCode size={17} />Exibir QR</button>
                <button type="button" className="danger" disabled={working} onClick={() => void closeCheckin()}>Encerrar check-in</button>
              </>
            ) : lesson.status !== 'completed' ? (
              <button type="button" className="primary" disabled={working} onClick={() => void openCheckin()}><QrCode size={17} />Abrir check-in</button>
            ) : null}
          </div>
        )}
      </header>

      <section className="courses-metrics">
        <article><Users /><div><small>Matriculados</small><strong>{enrollments.length}</strong></div></article>
        <article><Check /><div><small>Presentes</small><strong>{presentCount}</strong></div></article>
        <article><Clock3 /><div><small>Pendentes</small><strong>{pendingCount}</strong></div></article>
      </section>

      {error && <section className="courses-error">{error}</section>}

      <section className="courses-panel">
        <div className="attendance-toolbar">
          <div className="modal-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar aluno" /></div>
          {canManage && lesson.status !== 'completed' && <button type="button" className="secondary" disabled={working} onClick={() => void markAllPresent()}>Marcar todos presentes</button>}
        </div>

        <div className="attendance-list">
          {visible.map((item) => {
            const current = attendanceMap.get(item.member_id);
            return (
              <article key={item.member_id}>
                <div className="student-avatar">{item.member.full_name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div>
                <div className="attendance-person"><strong>{item.member.full_name}</strong><span>{item.member.phone || 'Sem telefone'}{current?.source === 'qr' ? ' · Check-in por QR' : ''}</span></div>
                <div className="attendance-statuses">
                  {(Object.keys(STATUS_LABELS) as AttendanceStatus[]).map((status) => (
                    <button
                      type="button"
                      key={status}
                      disabled={!canManage || working || lesson.status === 'completed'}
                      className={current?.status === status ? `active ${status}` : ''}
                      onClick={() => void setAttendance(item.member_id, status)}
                    >
                      {STATUS_LABELS[status]}
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>

        {canManage && lesson.status !== 'completed' && (
          <div className="lesson-footer-actions">
            <button type="button" className="primary" disabled={working} onClick={() => void completeLesson()}>Encerrar aula e consolidar chamada</button>
          </div>
        )}
      </section>

      {qrOpen && (
        <Modal title="QR Code da aula" subtitle="Mostre presencialmente. Evite enviar no grupo para não permitir check-in fora do local." onClose={() => setQrOpen(false)}>
          <div className="qr-preview">
            {qrImage && <img src={qrImage} alt="QR Code para check-in da aula" />}
            <p>{checkinUrl}</p>
          </div>
          <div className="qr-actions">
            <button type="button" className="secondary" onClick={() => void navigator.clipboard.writeText(checkinUrl)}><Copy size={17} />Copiar link</button>
            <button type="button" className="secondary" onClick={printQr}><Printer size={17} />Imprimir QR</button>
            <button type="button" className="secondary" onClick={() => void regenerateToken()}><RefreshCw size={17} />Gerar novo</button>
          </div>
        </Modal>
      )}
    </main>
  );
}

function FrequencyReport({
  lessons,
  enrollments,
  attendance,
  minimum,
}: {
  lessons: Lesson[];
  enrollments: Enrollment[];
  attendance: Attendance[];
  minimum: number;
}) {
  const lessonIds = new Set(lessons.map((lesson) => lesson.id));

  return (
    <section className="courses-panel">
      <div className="courses-panel-head"><div><h2>Relatório de frequência</h2><p>Baseado apenas nas aulas marcadas como realizadas. Presença mínima: {minimum}%.</p></div></div>
      <div className="frequency-table">
        <div className="frequency-head"><span>Aluno</span><span>Presenças</span><span>Frequência</span><span>Situação</span></div>
        {enrollments.map((item) => {
          const records = attendance.filter((record) => record.member_id === item.member_id && lessonIds.has(record.lesson_id));
          const presents = records.filter((record) => record.status === 'present' || record.status === 'late').length;
          const percentage = lessons.length ? Math.round((presents / lessons.length) * 100) : 0;
          const approved = lessons.length > 0 && percentage >= minimum;
          return (
            <div className="frequency-row" key={item.member_id}>
              <strong>{item.member.full_name}</strong>
              <span>{presents} de {lessons.length}</span>
              <span>{percentage}%</span>
              <span className={`status-pill ${approved ? 'completed' : 'planned'}`}>{lessons.length ? (approved ? 'Regular' : 'Abaixo do mínimo') : 'Sem aulas realizadas'}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="course-modal-overlay">
      <section className={`course-modal ${wide ? 'wide' : ''}`}>
        <header><div><h2>{title}</h2><p>{subtitle}</p></div><button type="button" onClick={onClose}><X /></button></header>
        <div className="course-modal-body">{children}</div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="course-field"><span>{label}</span>{children}</label>;
}

function ModalActions({
  onClose,
  onSave,
  saving,
  saveLabel = 'Salvar',
}: {
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  saveLabel?: string;
}) {
  return (
    <div className="course-modal-actions">
      <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
      <button type="button" className="primary" disabled={saving} onClick={onSave}>{saving ? 'Salvando...' : saveLabel}</button>
    </div>
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character] || character);
}

function openPrintWindow(content: string, title: string) {
  const popup = window.open('', '_blank', 'width=900,height=700');
  if (!popup) return;
  popup.document.write(`<!doctype html><html lang="pt-BR"><head><title>${escapeHtml(title)}</title><style>
    body{font-family:Arial,sans-serif;color:#17221d;padding:30px}h1{margin:0 0 6px}h2{margin:0 0 8px;font-size:20px}p{color:#58665f;margin-bottom:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccd5d0;padding:10px;text-align:left}.signature{height:36px}.qr-sheet{text-align:center;display:grid;justify-items:center;gap:12px}.qr-sheet img{width:360px;max-width:90vw}.qr-sheet small{max-width:520px;color:#58665f}@media print{body{padding:0}}
  </style></head><body>${content}<script>window.onload=()=>window.print();</script></body></html>`);
  popup.document.close();
}
