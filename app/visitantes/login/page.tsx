import { redirect } from 'next/navigation';

export default function VisitantesLoginLegacyPage() {
  redirect('/login?next=/acolhimentos');
}
