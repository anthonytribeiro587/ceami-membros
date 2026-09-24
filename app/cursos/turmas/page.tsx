import type { Metadata } from 'next';
import CoursesWorkspace from '../CoursesWorkspace';

export const metadata: Metadata = { title: 'Turmas | CEAMI Cursos' };

export default function CoursesClassesPage() {
  return <CoursesWorkspace initialArea="classes" />;
}
