import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import CorrectionSelectionGuard from './CorrectionSelectionGuard';

export const metadata: Metadata = {
  title: 'Consulta de cadastro',
  description: 'Verifique se você já possui cadastro na CEAMI e confira seus dados com segurança.',
  openGraph: {
    title: 'Consulta de cadastro CEAMI',
    description: 'Verifique se você já possui cadastro na CEAMI e confira seus dados.',
    url: '/consultar',
    type: 'website',
    locale: 'pt_BR',
    images: [
      {
        url: '/brand/og-consulta.svg',
        width: 1200,
        height: 630,
        alt: 'Consulta de cadastro CEAMI',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Consulta de cadastro CEAMI',
    description: 'Verifique se você já possui cadastro na CEAMI.',
    images: ['/brand/og-consulta.svg'],
  },
};

export default function ConsultarLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <><CorrectionSelectionGuard />{children}</>;
}
