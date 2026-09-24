import type { Metadata } from 'next';
import AdminMemberEnhancements from './components/AdminMemberEnhancements';
import PendingMemberUpdates from './components/PendingMemberUpdates';
import QrCodeRepair from './components/QrCodeRepair';
import MemberDetailsPolish from './components/MemberDetailsPolish';
import FormsNavEnhancement from './components/FormsNavEnhancement';
import SeminarPublicHotfix from './components/SeminarPublicHotfix';
import FormSubmissionDeleteEnhancement from './components/FormSubmissionDeleteEnhancement';
import CeamiAppSwitcher from './components/CeamiAppSwitcher';
import './globals.css';
import './ceami.css';
import './modal-fixes.css';
import './mobile-fixes.css';
import './brand.css';
import './course-entry.css';
import './member-v3.css';
import './member-details-polish.css';
import './ceami-suite.css';
import './ceami-saas.css';
import './integra/privacy-consent.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://ceami-membros.vercel.app'),
  title: {
    default: 'CEAMI',
    template: '%s | CEAMI',
  },
  description: 'Plataforma integrada da CEAMI para membros, ação social, eventos e serviços.',
  applicationName: 'CEAMI',
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
    title: 'CEAMI',
    description: 'Plataforma integrada de gestão da comunidade CEAMI.',
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
        <CeamiAppSwitcher />
        <AdminMemberEnhancements />
        <PendingMemberUpdates />
        <QrCodeRepair />
        <MemberDetailsPolish />
        <FormsNavEnhancement />
        <SeminarPublicHotfix />
        <FormSubmissionDeleteEnhancement />
        <footer className="site-footer">
          <span>CEAMI</span>
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
