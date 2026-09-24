import type { Metadata } from 'next';
import AccountSecurityClient from './AccountSecurityClient';
import '../ceami-saas.css';
import './conta.css';

export const metadata: Metadata = {
  title: 'Minha conta',
  description: 'Segurança e senha da conta CEAMI.',
};

export default function AccountPage() {
  return <AccountSecurityClient />;
}
