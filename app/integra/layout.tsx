import type { Metadata } from 'next';
import './integra.css';
import './review.css';

export const metadata: Metadata = {
  title: 'Integra CEAMI',
  description: 'Ficha dos novos membros da CEAMI. Preencha seus dados para participar do Integra.',
  openGraph: {
    title: 'Integra CEAMI',
    description: 'Ficha dos novos membros da CEAMI.',
    url: '/integra',
    type: 'website',
    locale: 'pt_BR',
    images: [
      {
        url: '/brand/og-integra.svg',
        width: 1200,
        height: 630,
        alt: 'Integra CEAMI — ficha dos novos membros',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Integra CEAMI',
    description: 'Ficha dos novos membros da CEAMI.',
    images: ['/brand/og-integra.svg'],
  },
};

export default function IntegraLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
