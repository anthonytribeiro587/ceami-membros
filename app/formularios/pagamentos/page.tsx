import AdminRouteShell from '@/app/components/AdminRouteShell';
import { getCurrentUiRole } from '@/lib/server/current-profile';
import FormPaymentsClient from './FormPaymentsClient';
import './payments.css';

export default async function FormPaymentsPage() {
  const role = await getCurrentUiRole();
  return (
    <AdminRouteShell initialRole={role}>
      <FormPaymentsClient />
    </AdminRouteShell>
  );
}
