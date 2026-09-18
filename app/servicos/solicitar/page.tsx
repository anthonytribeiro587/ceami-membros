import type { Metadata } from 'next';
import ServiceRequestClient from './ServiceRequestClient';
import './services-public.css';

export const metadata: Metadata = {
  title: 'CEAMI Serviços | Solicitar serviço',
  description: 'Solicite um serviço e conecte-se com prestadores da comunidade CEAMI.',
  robots: { index: false, follow: false },
};

export default function ServiceRequestPage() {
  return <ServiceRequestClient />;
}
