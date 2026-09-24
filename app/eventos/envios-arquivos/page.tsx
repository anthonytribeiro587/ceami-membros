import Link from 'next/link';
import { getServiceClient } from '@/lib/server/security';
import { SEMINAR_APOCALIPSE_SLUG } from '@/lib/seminar-apocalipse';
import SeminarPdfTestSender from '@/app/formularios/SeminarPdfTestSender';
import SeminarPendingPaymentSender from '@/app/formularios/SeminarPendingPaymentSender';
import SeminarPdfDeliveryHistory from '@/app/formularios/SeminarPdfDeliveryHistory';
import MobileFormsCompactEnhancement from '@/app/formularios/MobileFormsCompactEnhancement';

export default async function EnviosArquivosPage() {
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
    <main
      style={{
        width: 'min(100%, 1080px)',
        margin: '0 auto',
        padding: '28px 12px 92px',
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
          href="/eventos"
          style={{
            width: 'max-content',
            color: '#6a4b2c',
            fontSize: 12,
            fontWeight: 800,
            textDecoration: 'none',
          }}
        >
          ‹ Voltar para CEAMI Eventos
        </Link>
        <div style={{ display: 'grid', gap: 4 }}>
          <span style={{ color: '#8d7357', fontSize: 10, fontWeight: 900, letterSpacing: '.12em' }}>
            CEAMI EVENTOS
          </span>
          <h1 style={{ margin: 0, fontSize: 21, color: '#3e3226' }}>
            Acompanhar envio de arquivos
          </h1>
          <p style={{ margin: 0, color: '#75695d', fontSize: 12, lineHeight: 1.45 }}>
            Envie materiais, avise inscrições pendentes de pagamento e consulte o histórico de entregas.
          </p>
        </div>
      </header>

      {formId ? (
        <>
          <div className="forms-responses" data-form-id={formId} aria-hidden="true" style={{ display: 'none' }} />
          <SeminarPdfTestSender />
          <SeminarPendingPaymentSender />
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
          Não foi possível localizar o evento do Seminário do Apocalipse.
        </section>
      )}
    </main>
  );
}
