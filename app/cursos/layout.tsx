import type { ReactNode } from 'react';
import CourseDeletionControls from './CourseDeletionControls';
import QrCodeReliability from './QrCodeReliability';
import CourseTablePortal from './CourseTablePortal';
import CeamiModuleShell from '@/app/components/CeamiModuleShell';
import './courses.css';
import './course-table.css';
import './course-table-portal.css';
import './course-deletion.css';
import '../ceami-saas.css';

export default function CoursesLayout({ children }: { children: ReactNode }) {
  return (
    <CeamiModuleShell moduleKey="courses">
      {children}
      <CourseTablePortal />
      <CourseDeletionControls />
      <QrCodeReliability />
    </CeamiModuleShell>
  );
}
