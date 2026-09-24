import type { Metadata } from 'next';
import CoursesWorkspace from '../CoursesWorkspace';

export const metadata: Metadata = { title: 'Formados | CEAMI Cursos' };

export default function CoursesGraduatesPage() {
  return <CoursesWorkspace initialArea="graduates" />;
}
