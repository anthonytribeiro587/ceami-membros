import type { Metadata } from 'next';
import CoursesWorkspace from './CoursesWorkspace';

export const metadata: Metadata = {
  title: 'CEAMI Cursos',
  description: 'Controle de turmas, aulas, frequência e check-in dos cursos da CEAMI.',
};

export default function CoursesPage() {
  return <CoursesWorkspace initialArea="overview" />;
}
