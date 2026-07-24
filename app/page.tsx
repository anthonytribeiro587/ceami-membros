import MemberAppV3 from './MemberAppV3';
import { getCurrentUiRole } from '@/lib/server/current-profile';

export default async function Page() {
  const role = await getCurrentUiRole();
  return <MemberAppV3 initialIsAdmin={role === 'admin'} />;
}
