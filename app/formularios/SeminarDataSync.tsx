'use client';

import { useEffect } from 'react';

export default function SeminarDataSync() {
  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const response = await fetch('/api/admin/forms/normalize-seminar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const payload = await response.json().catch(() => ({})) as { changed?: boolean };
        if (!active || !response.ok || !payload.changed) return;

        // Recarrega uma única vez para a lista, filtros e detalhes passarem a usar
        // os valores canônicos Física/PDF/Sem custo que acabaram de ser gravados.
        if (sessionStorage.getItem('ceami-seminar-normalized') !== '1') {
          sessionStorage.setItem('ceami-seminar-normalized', '1');
          window.location.reload();
        }
      } catch {
        // A tela de formulários continua utilizável mesmo se a normalização falhar.
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return null;
}
