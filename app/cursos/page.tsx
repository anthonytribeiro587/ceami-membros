import CoursesWorkspace from './CoursesWorkspace';
import CoursePortalSession from './CoursePortalSession';
import CourseDeletionControls from './CourseDeletionControls';
import QrCodeReliability from './QrCodeReliability';
import CourseTablePortal from './CourseTablePortal';
import './courses.css';
import './course-table.css';
import './course-deletion.css';

export default function CoursesPage() {
  return (
    <>
      <CoursesWorkspace />
      <CourseTablePortal />
      <CoursePortalSession />
      <CourseDeletionControls />
      <QrCodeReliability />
    </>
  );
}
