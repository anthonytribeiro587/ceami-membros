import type { Metadata } from 'next';
import FormulariosClient from '@/app/formularios/FormulariosClient';
import InlinePaymentsEnhancement from '@/app/formularios/InlinePaymentsEnhancement';
import EditSubmissionEnhancement from '@/app/formularios/EditSubmissionEnhancement';
import SeminarDataSync from '@/app/formularios/SeminarDataSync';
import ResponseSortEnhancement from '@/app/formularios/ResponseSortEnhancement';
import SeminarPrintReport from '@/app/formularios/SeminarPrintReport';
import MobileFormsCompactEnhancement from '@/app/formularios/MobileFormsCompactEnhancement';
import SeminarFileTrackingShortcut from '@/app/formularios/SeminarFileTrackingShortcut';
import '@/app/formularios/formularios.css';

export const metadata: Metadata = {
  title: 'CEAMI Eventos',
  description: 'Gestão de eventos, inscrições, participantes e pagamentos da CEAMI.',
};

export default function EventosPage() {
  return (
    <>
      <SeminarFileTrackingShortcut />
      <FormulariosClient />
      <InlinePaymentsEnhancement />
      <EditSubmissionEnhancement />
      <SeminarDataSync />
      <ResponseSortEnhancement />
      <SeminarPrintReport />
      <MobileFormsCompactEnhancement />
    </>
  );
}
