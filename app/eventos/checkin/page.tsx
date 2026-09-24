import type { Metadata } from 'next';
import CheckinClient from './CheckinClient';
import CeamiModuleShell from '@/app/components/CeamiModuleShell';
import './checkin.css';

export const metadata: Metadata = {
  title: 'Check-in | CEAMI Eventos',
  description: 'Validação e check-in de ingressos dos eventos CEAMI.',
};

export default function EventCheckinPage() {
  return (
    <CeamiModuleShell moduleKey="events">
      <CheckinClient />
    </CeamiModuleShell>
  );
}
