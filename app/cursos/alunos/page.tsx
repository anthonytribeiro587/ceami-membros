import type { Metadata } from 'next';
import CoursesWorkspace from '../CoursesWorkspace';

export const metadata: Metadata = { title: 'Alunos | CEAMI Cursos' };

export default function CoursesStudentsPage() {
  return <CoursesWorkspace initialArea="students" />;
}
