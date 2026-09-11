import AdminRouteShell from '@/app/components/AdminRouteShell';
import { getCurrentUiRole } from '@/lib/server/current-profile';
import FormulariosClient from './FormulariosClient';
import InlinePaymentsEnhancement from './InlinePaymentsEnhancement';
import EditSubmissionEnhancement from './EditSubmissionEnhancement';
import SeminarDataSync from './SeminarDataSync';
import ResponseSortEnhancement from './ResponseSortEnhancement';
import SeminarPrintReport from './SeminarPrintReport';
import SeminarPdfTestSender from './SeminarPdfTestSender';
import SeminarPdfDeliveryHistory from './SeminarPdfDeliveryHistory';
import './formularios.css';

export default async function FormulariosPage() {
  const role = await getCurrentUiRole();
  return (
    <AdminRouteShell initialRole={role}>
      <FormulariosClient />
      <InlinePaymentsEnhancement />
      <EditSubmissionEnhancement />
      <SeminarDataSync />
      <ResponseSortEnhancement />
      <SeminarPrintReport />
      <SeminarPdfTestSender />
      <SeminarPdfDeliveryHistory />
    </AdminRouteShell>
  );
}
