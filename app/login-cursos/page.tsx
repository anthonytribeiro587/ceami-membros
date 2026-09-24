import { redirect } from 'next/navigation';

export default function CoursesLoginLegacyPage() {
  redirect('/login?next=/cursos');
}
