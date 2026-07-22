import type { Metadata } from 'next';
import './globals.css';
import './ceami.css';
import './modal-fixes.css';
import './mobile-fixes.css';
import './brand.css';
import './course-entry.css';
import './member-v3.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://ceami-membros.vercel.app'),
  title: {
    default: 'CEAMI Membros',
    template: '%s | CEAMI Membros',
  },
  description: 'Cadastro de membros, atualização de dados e aniversários automáticos da CEAMI.',
  applicationName: 'CEAMI Membros',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
  icons: {
    icon: [{ url: '/brand/ceami-icon.svg?v=official-2', type: 'image/svg+xml' }],
    shortcut: '/brand/ceami-icon.svg?v=official-2',
    apple: '/brand/ceami-icon.svg?v=official-2',
  },
  openGraph: {
    title: 'CEAMI Membros',
    description: 'Cadastro de membros e aniversários automáticos da comunidade CEAMI.',
    type: 'website',
    locale: 'pt_BR',
    images: [{ url: '/brand/og-ceami-membros.svg', width: 1200, height: 630, alt: 'CEAMI Membros' }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <footer className="site-footer">
          <span>CEAMI Membros</span>
          <span aria-hidden="true">•</span>
          <a href="/privacidade">Privacidade</a>
          <span aria-hidden="true">•</span>
          <a href="https://nextlead-lp.vercel.app/" target="_blank" rel="noreferrer">
            Desenvolvido por <strong>NextLead</strong>
          </a>
        </footer>
      </body>
    </html>
  );
}
