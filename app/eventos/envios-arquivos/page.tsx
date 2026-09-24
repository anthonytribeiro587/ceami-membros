import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getServiceClient } from '@/lib/server/security';
import { SEMINAR_APOCALIPSE_SLUG } from '@/lib/seminar-apocalipse';
import SeminarPdfTestSender from '@/app/formularios/SeminarPdfTestSender';
import SeminarPendingPaymentSender from '@/app/formularios/SeminarPendingPaymentSender';
import SeminarPdfDeliveryHistory from '@/app/formularios/SeminarPdfDeliveryHistory';
import MobileFormsCompactEnhancement from '@/app/formularios/MobileFormsCompactEnhancement';
import CeamiModuleShell from '@/app/components/CeamiModuleShell';
import '@/app/formularios/formularios.css';
import '@/app/ceami-saas.css';

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
    <CeamiModuleShell moduleKey="events">
      <main className="events-files-page">
        <header className="events-files-header">
          <Link href="/eventos" className="events-files-back">
            <ArrowLeft size={16} /> Voltar para Eventos
          </Link>
          <span>CEAMI EVENTOS</span>
          <h1>Acompanhar envio de arquivos</h1>
          <p>Envie materiais, avise inscrições pendentes de pagamento e consulte o histórico de entregas.</p>
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
          <section className="events-files-error">
            Não foi possível localizar o evento do Seminário do Apocalipse.
          </section>
        )}
      </main>
    </CeamiModuleShell>
  );
}
