'use client';

import { useEffect } from 'react';

type AutomationItem = { id: string; name: string; enabled: boolean };
type DashboardPayload = { automations?: AutomationItem[]; error?: string };

export default function AutomationTogglePersistence() {
  useEffect(() => {
    let busy = false;

    async function handleChange(event: Event) {
      const input = event.target as HTMLInputElement | null;
      if (!input?.matches('.automation-switch input[type="checkbox"]') || busy) return;

      const header = input.closest('.automation-detail-header');
      const name = header?.querySelector('h2')?.textContent?.trim() || '';
      const nextEnabled = input.checked;
      const previousEnabled = !nextEnabled;
      if (!name) return;

      busy = true;
      input.disabled = true;

      try {
        const listResponse = await fetch('/api/automations', { cache: 'no-store' });
        const list = (await listResponse.json()) as DashboardPayload;
        if (!listResponse.ok) throw new Error(list.error || 'Não foi possível localizar a automação.');

        const automation = (list.automations || []).find((item) => item.name === name);
        if (!automation) throw new Error('Automação não encontrada.');

        const response = await fetch('/api/automations', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: automation.id, enabled: nextEnabled }),
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(payload.error || 'Não foi possível alterar a automação.');

        window.location.reload();
      } catch (error) {
        input.checked = previousEnabled;
        input.disabled = false;
        busy = false;
        window.alert(
          error instanceof Error
            ? error.message
            : 'Não foi possível alterar o status da automação.',
        );
      }
    }

    document.addEventListener('change', handleChange, true);
    return () => document.removeEventListener('change', handleChange, true);
  }, []);

  return null;
}
