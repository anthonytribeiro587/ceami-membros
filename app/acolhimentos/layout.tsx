import type { Metadata, Viewport } from 'next';
import '../visitantes/visitantes.css';
import '../ceami-saas.css';

export const metadata: Metadata = {
  title: 'CEAMI Acolhimentos',
  description: 'Recepção, registro e acompanhamento de visitantes da CEAMI.',
};

export const viewport: Viewport = {
  themeColor: '#0b4f8d',
};

export default function AcolhimentosLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
