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
      <div className="forms-files-shortcut-wrap">
        <Link href="/formularios/envios-arquivos" className="forms-files-shortcut">
          <span className="forms-files-shortcut-copy">
            <strong>Acompanhar envio de arquivos</strong>
            <small>Apostila PDF, pendentes e histórico de entregas</small>
          </span>
          <span aria-hidden="true" className="forms-files-shortcut-arrow">›</span>
        </Link>
      </div>

      <FormulariosClient />
      <InlinePaymentsEnhancement />
      <EditSubmissionEnhancement />
      <SeminarDataSync />
      <ResponseSortEnhancement />
      <SeminarPrintReport />
      <MobileFormsCompactEnhancement />

      <style>{`
        .forms-files-shortcut-wrap {
          width: min(100%, 1180px);
          margin: 0 auto 12px;
          padding: 0 12px;
          box-sizing: border-box;
        }
        .forms-files-shortcut {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          width: 100%;
          min-height: 56px;
          padding: 11px 14px;
          border-radius: 14px;
          border: 1px solid #d7c7ad;
          background: #fffaf3;
          color: #5b3d1e;
          text-decoration: none;
          box-sizing: border-box;
        }
        .forms-files-shortcut-copy {
          display: grid;
          gap: 2px;
          min-width: 0;
        }
        .forms-files-shortcut-copy strong {
          font-size: 13px;
          font-weight: 900;
          line-height: 1.2;
        }
        .forms-files-shortcut-copy small {
          color: #7b6b5b;
          font-size: 11px;
          font-weight: 700;
          line-height: 1.2;
        }
        .forms-files-shortcut-arrow {
          flex: 0 0 auto;
          font-size: 20px;
          font-weight: 900;
        }
        @media (max-width: 720px) {
          .forms-files-shortcut-wrap {
            width: auto;
            margin: 8px 12px 18px 72px;
            padding: 0;
          }
          .forms-files-shortcut {
            min-height: 46px;
            padding: 9px 12px;
            border-radius: 12px;
          }
          .forms-files-shortcut-copy strong {
            font-size: 12px;
          }
          .forms-files-shortcut-copy small {
            display: none;
          }
          .forms-files-shortcut-arrow {
            font-size: 18px;
          }
        }
      `}</style>
    </AdminRouteShell>
  );
}
