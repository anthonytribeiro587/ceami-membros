import type { Metadata } from 'next';
import AccessManagementClient from './AccessManagementClient';
import './access.css';
import '../ceami-saas.css';

export const metadata: Metadata = {
  title: 'Acessos dos aplicativos',
  description: 'Permissões dos módulos da plataforma CEAMI.',
};

export default function AccessManagementPage() {
  return <AccessManagementClient />;
}
