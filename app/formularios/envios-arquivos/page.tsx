import Link from 'next/link';
import AdminRouteShell from '@/app/components/AdminRouteShell';
import { getCurrentUiRole } from '@/lib/server/current-profile';
import { getServiceClient } from '@/lib/server/security';
import { SEMINAR_APOCALIPSE_SLUG } from '@/lib/seminar-apocalipse';
import SeminarPdfTestSender from '../SeminarPdfTestSender';
import SeminarPdfDeliveryHistory from '../SeminarPdfDeliveryHistory';
import MobileFormsCompactEnhancement from '../MobileFormsCompactEnhancement';

export default async function EnviosArquivosPage() {
  const role = await getCurrentUiRole();
  const service = getServiceClient();

  let formId = '';
  if (service) {
    const { data } = await service
      .from('forms')
      .select('id')
      .eq('slug', SEMINAR_APOCALIPSE_SLUG)
      .maybeSingle();
    formId = String(data?.id || '');
  }

  return (
    <AdminRouteShell initialRole={role}>
      <main
        style={{
          width: 'min(100%, 1080px)',
          margin: '0 auto',
          padding: '12px 12px 92px',
          boxSizing: 'border-box',
        }}
      >
        <header
          style={{
            display: 'grid',
            gap: 10,
            marginBottom: 14,
            padding: '15px 16px',
            borderRadius: 16,
            border: '1px solid #e1d5c4',
            background: '#fffdf9',
          }}
        >
          <Link
            href="/formularios"
            style={{
              width: 'max-content',
              color: '#6a4b2c',
              fontSize: 12,
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            ‹ Voltar para formulários
          </Link>
          <div style={{ display: 'grid', gap: 4 }}>
            <h1 style={{ margin: 0, fontSize: 21, color: '#3e3226' }}>
              Acompanhar envio de arquivos
            </h1>
            <p style={{ margin: 0, color: '#75695d', fontSize: 12, lineHeight: 1.45 }}>
              Área separada para preparar a apostila, abrir o WhatsApp dos pendentes e consultar o histórico de entregas.
            </p>
          </div>
        </header>

        {formId ? (
          <>
            <div
              className="forms-responses"
              data-form-id={formId}
              aria-hidden="true"
              style={{ display: 'none' }}
            />
            <SeminarPdfTestSender />
            <SeminarPdfDeliveryHistory />
            <MobileFormsCompactEnhancement />
          </>
        ) : (
          <section
            style={{
              padding: 16,
              borderRadius: 14,
              border: '1px solid #ead1ce',
              background: '#fff5f3',
              color: '#8c3f37',
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            Não foi possível localizar o formulário do Seminário do Apocalipse.
          </section>
        )}
      </main>
    </AdminRouteShell>
  );
}
