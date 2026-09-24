import type { Metadata } from 'next';
import CheckinClient from './CheckinClient';
import './checkin.css';

export const metadata: Metadata = {
  title: 'Check-in | CEAMI Eventos',
  description: 'Validação e check-in de ingressos dos eventos CEAMI.',
};

export default function EventCheckinPage() {
  return <CheckinClient />;
}
