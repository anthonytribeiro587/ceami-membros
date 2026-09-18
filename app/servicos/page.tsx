import AdminRouteShell from '@/app/components/AdminRouteShell';
import { getCurrentUiRole } from '@/lib/server/current-profile';
import ServicesClient from './ServicesClient';
import './services.css';

export default async function ServicesPage() {
  const role = await getCurrentUiRole();

  return (
    <AdminRouteShell initialRole={role}>
      <ServicesClient />
    </AdminRouteShell>
  );
}
