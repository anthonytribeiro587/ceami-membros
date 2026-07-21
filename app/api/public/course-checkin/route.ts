import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PublicLesson = {
  id: string;
  classId: string;
  lessonNumber: number;
  lessonTitle: string;
  startsAt: string;
  endsAt: string | null;
  lessonStatus: string;
  checkinEnabled: boolean;
  checkinOpenAt: string | null;
  checkinCloseAt: string | null;
  className: string;
  location: string | null;
  courseName: string;
};

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function digits(value: string | null | undefined) {
  return (value || '').replace(/\D/g, '');
}

function comparablePhone(value: string | null | undefined) {
  const normalized = digits(value);
  if (normalized.length < 10) return '';
  return normalized.slice(-11);
}

function checkWindow(lesson: PublicLesson) {
  if (!lesson.checkinEnabled) {
    return { open: false, message: 'O check-in desta aula ainda não foi aberto.' };
  }

  if (lesson.lessonStatus === 'cancelled') {
    return { open: false, message: 'Esta aula foi cancelada.' };
  }

  if (lesson.lessonStatus === 'completed') {
    return { open: false, message: 'O check-in desta aula já foi encerrado.' };
  }

  const now = Date.now();
  const opensAt = lesson.checkinOpenAt ? new Date(lesson.checkinOpenAt).getTime() : null;
  const closesAt = lesson.checkinCloseAt ? new Date(lesson.checkinCloseAt).getTime() : null;

  if (opensAt && now < opensAt) {
    return { open: false, message: 'O check-in ainda não está disponível.' };
  }

  if (closesAt && now > closesAt) {
    return { open: false, message: 'O período de check-in desta aula terminou.' };
  }

  return { open: true, message: '' };
}

async function loadLesson(token: string): Promise<PublicLesson | null> {
  const supabase = serviceClient();
  if (!supabase) throw new Error('Supabase não configurado.');

  const { data: lesson, error: lessonError } = await supabase
    .from('course_lessons')
    .select('id, class_id, lesson_number, title, starts_at, ends_at, status, checkin_enabled, checkin_open_at, checkin_close_at')
    .eq('checkin_token', token)
    .maybeSingle();

  if (lessonError) throw lessonError;
  if (!lesson) return null;

  const { data: classRow, error: classError } = await supabase
    .from('course_classes')
    .select('id, course_id, name, location')
    .eq('id', lesson.class_id)
    .maybeSingle();

  if (classError) throw classError;
  if (!classRow) return null;

  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('name')
    .eq('id', classRow.course_id)
    .maybeSingle();

  if (courseError) throw courseError;
  if (!course) return null;

  return {
    id: lesson.id,
    classId: lesson.class_id,
    lessonNumber: lesson.lesson_number,
    lessonTitle: lesson.title,
    startsAt: lesson.starts_at,
    endsAt: lesson.ends_at,
    lessonStatus: lesson.status,
    checkinEnabled: lesson.checkin_enabled,
    checkinOpenAt: lesson.checkin_open_at,
    checkinCloseAt: lesson.checkin_close_at,
    className: classRow.name,
    location: classRow.location,
    courseName: course.name,
  };
}

function publicPayload(lesson: PublicLesson) {
  const windowState = checkWindow(lesson);
  return {
    courseName: lesson.courseName,
    className: lesson.className,
    lessonNumber: lesson.lessonNumber,
    lessonTitle: lesson.lessonTitle,
    startsAt: lesson.startsAt,
    endsAt: lesson.endsAt,
    location: lesson.location,
    checkinOpen: windowState.open,
    message: windowState.message,
  };
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || '';

  if (!UUID_PATTERN.test(token)) {
    return NextResponse.json({ error: 'Link de check-in inválido.' }, { status: 400 });
  }

  try {
    const lesson = await loadLesson(token);
    if (!lesson) {
      return NextResponse.json({ error: 'Aula não encontrada.' }, { status: 404 });
    }

    return NextResponse.json(publicPayload(lesson), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('course-checkin GET failed', error);
    return NextResponse.json({ error: 'Não foi possível consultar esta aula.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: { token?: string; phone?: string };

  try {
    body = (await request.json()) as { token?: string; phone?: string };
  } catch {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  }

  const token = body.token || '';
  const informedPhone = comparablePhone(body.phone);

  if (!UUID_PATTERN.test(token)) {
    return NextResponse.json({ error: 'Link de check-in inválido.' }, { status: 400 });
  }

  if (!informedPhone) {
    return NextResponse.json({ error: 'Informe um telefone válido com DDD.' }, { status: 400 });
  }

  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Serviço temporariamente indisponível.' }, { status: 503 });
  }

  try {
    const lesson = await loadLesson(token);
    if (!lesson) {
      return NextResponse.json({ error: 'Aula não encontrada.' }, { status: 404 });
    }

    const windowState = checkWindow(lesson);
    if (!windowState.open) {
      return NextResponse.json({ error: windowState.message }, { status: 409 });
    }

    const { data: enrollments, error: enrollmentError } = await supabase
      .from('course_enrollments')
      .select('member_id')
      .eq('class_id', lesson.classId)
      .eq('status', 'enrolled');

    if (enrollmentError) throw enrollmentError;

    const memberIds = (enrollments || []).map((row) => row.member_id);
    if (!memberIds.length) {
      return NextResponse.json({ error: 'Não foi possível confirmar sua inscrição nesta turma.' }, { status: 404 });
    }

    const { data: members, error: memberError } = await supabase
      .from('members')
      .select('id, full_name, phone')
      .in('id', memberIds);

    if (memberError) throw memberError;

    const matches = (members || []).filter(
      (member) => comparablePhone(member.phone) === informedPhone,
    );

    if (matches.length !== 1) {
      return NextResponse.json(
        { error: 'Telefone não localizado entre os alunos desta turma. Procure o organizador.' },
        { status: 404 },
      );
    }

    const member = matches[0];
    const now = new Date().toISOString();

    const { data: existing, error: existingError } = await supabase
      .from('course_attendance')
      .select('status, checked_in_at')
      .eq('lesson_id', lesson.id)
      .eq('member_id', member.id)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing?.status === 'present' || existing?.status === 'late') {
      return NextResponse.json({
        ok: true,
        alreadyCheckedIn: true,
        memberName: member.full_name,
        checkedInAt: existing.checked_in_at,
        lesson: publicPayload(lesson),
      });
    }

    const { error: attendanceError } = await supabase
      .from('course_attendance')
      .upsert(
        {
          lesson_id: lesson.id,
          member_id: member.id,
          status: 'present',
          source: 'qr',
          checked_in_at: now,
          recorded_by: null,
          updated_at: now,
        },
        { onConflict: 'lesson_id,member_id' },
      );

    if (attendanceError) throw attendanceError;

    return NextResponse.json({
      ok: true,
      alreadyCheckedIn: false,
      memberName: member.full_name,
      checkedInAt: now,
      lesson: publicPayload(lesson),
    });
  } catch (error) {
    console.error('course-checkin POST failed', error);
    return NextResponse.json({ error: 'Não foi possível registrar o check-in.' }, { status: 500 });
  }
}
