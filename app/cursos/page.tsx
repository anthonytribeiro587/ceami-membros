import type { Metadata } from 'next';
import CoursesWorkspace from './CoursesWorkspace';
import CourseDeletionControls from './CourseDeletionControls';
import QrCodeReliability from './QrCodeReliability';
import CourseTablePortal from './CourseTablePortal';
import './courses.css';
import './course-table.css';
import './course-table-portal.css';
import './course-deletion.css';
import '../ceami-saas.css';

export const metadata: Metadata = {
  title: 'CEAMI Cursos',
  description: 'Controle de turmas, aulas, frequência e check-in dos cursos da CEAMI.',
};

export default function CoursesPage() {
  return (
    <>
      <CoursesWorkspace />
      <CourseTablePortal />
      <CourseDeletionControls />
      <QrCodeReliability />
    </>
  );
}
