import type { Metadata, Viewport } from 'next';
import './visitantes.css';

export const metadata: Metadata = {
  title: 'CEAMI Visitantes',
  description: 'Acolhimento e acompanhamento de visitantes da CEAMI.',
};

export const viewport: Viewport = {
  themeColor: '#0b4f8d',
};

export default function VisitantesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
