import type { Metadata } from 'next';
import ServicesClient from '../ServicesClient';
import CeamiModuleShell from '@/app/components/CeamiModuleShell';
import '../services.css';
import '../../ceami-saas.css';
import '../services-v2.css';

export const metadata: Metadata = { title: 'Formulário público | CEAMI Serviços' };

export default function ServiceFormAdminPage() {
  return (
    <CeamiModuleShell moduleKey="services">
      <ServicesClient initialTab="setup" formOnly />
    </CeamiModuleShell>
  );
}
