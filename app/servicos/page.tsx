import type { Metadata } from 'next';
import ServicesClient from './ServicesClient';
import './services.css';
import '../ceami-saas.css';

export const metadata: Metadata = {
  title: 'CEAMI Serviços',
  description: 'Solicitações e acompanhamento de serviços da comunidade CEAMI.',
};

export default function ServicesPage() {
  return <ServicesClient />;
}
