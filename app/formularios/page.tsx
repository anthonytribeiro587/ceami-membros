import Link from 'next/link';
import AdminRouteShell from '@/app/components/AdminRouteShell';
import { getCurrentUiRole } from '@/lib/server/current-profile';
import FormulariosClient from './FormulariosClient';
import InlinePaymentsEnhancement from './InlinePaymentsEnhancement';
import EditSubmissionEnhancement from './EditSubmissionEnhancement';
import SeminarDataSync from './SeminarDataSync';
import ResponseSortEnhancement from './ResponseSortEnhancement';
import SeminarPrintReport from './SeminarPrintReport';
import MobileFormsCompactEnhancement from './MobileFormsCompactEnhancement';
import './formularios.css';

export default async function FormulariosPage() {
  const role = await getCurrentUiRole();
  return (
    <AdminRouteShell initialRole={role}>
      <div
        style={{
          width: 'min(100%, 1180px)',
          margin: '0 auto 12px',
          padding: '0 12px',
          boxSizing: 'border-box',
        }}
      >
        <Link
          href="/formularios/envios-arquivos"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            width: '100%',
            padding: '13px 15px',
            borderRadius: 14,
            border: '1px solid #d7c7ad',
            background: '#fffaf3',
            color: '#5b3d1e',
            fontWeight: 900,
            textDecoration: 'none',
            boxSizing: 'border-box',
          }}
        >
          <span style={{ display: 'grid', gap: 2 }}>
            <span>Acompanhar envio de arquivos</span>
            <small style={{ color: '#7b6b5b', fontSize: 11, fontWeight: 700 }}>
              Apostila PDF, pendentes e histórico de entregas
            </small>
          </span>
          <span aria-hidden="true" style={{ fontSize: 20 }}>›</span>
        </Link>
      </div>
      <FormulariosClient />
      <InlinePaymentsEnhancement />
      <EditSubmissionEnhancement />
      <SeminarDataSync />
      <ResponseSortEnhancement />
      <SeminarPrintReport />
      <MobileFormsCompactEnhancement />
    </AdminRouteShell>
  );
}
