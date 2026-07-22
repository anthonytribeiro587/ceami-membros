import CoursesWorkspace from './CoursesWorkspace';
import CoursePortalSession from './CoursePortalSession';
import CourseDeletionControls from './CourseDeletionControls';
import QrCodeReliability from './QrCodeReliability';
import './courses.css';
import './course-deletion.css';

export default function CoursesPage() {
  return (
    <>
      <CoursesWorkspace />
      <CoursePortalSession />
      <CourseDeletionControls />
      <QrCodeReliability />
    </>
  );
}
