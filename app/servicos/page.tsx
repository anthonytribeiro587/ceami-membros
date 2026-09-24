import type { Metadata } from 'next';
import ServicesOverviewClient from './ServicesOverviewClient';
import CeamiModuleShell from '@/app/components/CeamiModuleShell';
import './services.css';
import '../ceami-saas.css';
import './services-v2.css';

export const metadata: Metadata = {
  title: 'CEAMI Serviços',
  description: 'Solicitações e acompanhamento de serviços da comunidade CEAMI.',
};

export default function ServicesPage() {
  return (
    <CeamiModuleShell moduleKey="services">
      <ServicesOverviewClient />
    </CeamiModuleShell>
  );
}
