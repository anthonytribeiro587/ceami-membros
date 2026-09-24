import type { Metadata } from 'next';
import ServicesClient from '../ServicesClient';
import CeamiModuleShell from '@/app/components/CeamiModuleShell';
import '../services.css';
import '../../ceami-saas.css';
import '../services-v2.css';

export const metadata: Metadata = { title: 'Solicitações | CEAMI Serviços' };

export default function ServiceRequestsPage() {
  return (
    <CeamiModuleShell moduleKey="services">
      <ServicesClient initialTab="requests" hideFlow />
    </CeamiModuleShell>
  );
}
