import AutomacoesClient from './AutomacoesClient';
import AutomationTogglePersistence from './AutomationTogglePersistence';
import { getCurrentUiRole } from '@/lib/server/current-profile';
import './automacoes.css';

export default async function AutomacoesPage() {
  const role = await getCurrentUiRole();
  return (
    <>
      <AutomacoesClient initialRole={role} />
      <AutomationTogglePersistence />
    </>
  );
}
