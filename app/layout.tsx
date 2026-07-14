import type { Metadata } from 'next';
import './globals.css';
import './ceami.css';
import './modal-fixes.css';
import './mobile-fixes.css';

export const metadata: Metadata = {
  title: 'CEAMI Membros',
  description: 'Gestão de membros e aniversariantes da CEAMI',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
