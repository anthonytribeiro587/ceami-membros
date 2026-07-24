import AdminRouteShell from '../components/AdminRouteShell';
import CoursesWorkspace from './CoursesWorkspace';
import CoursePortalSession from './CoursePortalSession';
import CourseDeletionControls from './CourseDeletionControls';
import QrCodeReliability from './QrCodeReliability';
import CourseTablePortal from './CourseTablePortal';
import { getCurrentUiRole } from '@/lib/server/current-profile';
import './courses.css';
import './course-table.css';
import './course-table-portal.css';
import './course-deletion.css';

export default async function CoursesPage() {
  const role = await getCurrentUiRole();

  return (
    <AdminRouteShell initialRole={role}>
      <CoursesWorkspace />
      <CourseTablePortal />
      <CoursePortalSession />
      <CourseDeletionControls />
      <QrCodeReliability />
    </AdminRouteShell>
  );
}
