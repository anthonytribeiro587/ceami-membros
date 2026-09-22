import type { Metadata, Viewport } from 'next';
import './social.css';

export const metadata: Metadata = {
  title: 'CEAMI Social',
  description: 'Gestão de doações, estoque, cestas e famílias do CEAMI Social.',
  applicationName: 'CEAMI Social',
  manifest: '/social-manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#0a3b75',
};

export default function SocialLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
