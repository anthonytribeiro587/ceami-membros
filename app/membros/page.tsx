import MemberAppV3 from '../MemberAppV3';
import '../ceami-saas.css';
import { getCurrentUiRole } from '@/lib/server/current-profile';

export const metadata = {
  title: 'CEAMI Membros',
  description: 'Gestão de membros, ministérios, aniversários e comunicação da CEAMI.',
};

export default async function MembrosPage() {
  const role = await getCurrentUiRole();
  return <MemberAppV3 initialIsAdmin={role === 'admin'} />;
}
