import CeamiPortal from './components/CeamiPortal';
import { getCurrentCeamiAccess } from '@/lib/server/current-profile';

export default async function Page() {
  const access = await getCurrentCeamiAccess();
  return (
    <CeamiPortal
      modules={access?.modules || []}
      isAdmin={access?.role === 'admin'}
      fullName={access?.fullName || ''}
    />
  );
}
