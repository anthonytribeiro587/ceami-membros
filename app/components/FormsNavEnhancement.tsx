'use client';

import { useEffect } from 'react';

const CLIPBOARD_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect width="8" height="4" x="8" y="2" rx="1" ry="1"></rect>
  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
  <path d="M9 12h6"></path>
  <path d="M9 16h6"></path>
</svg>`;

export default function FormsNavEnhancement() {
  useEffect(() => {
    function enhance() {
      const nav = document.querySelector('.member-v3-nav');
      if (!nav) return;

      nav.querySelector('a[href="/formularios/pagamentos"]')?.remove();
      document.querySelector('[data-ceami-payments-shortcut]')?.remove();

      // No painel principal, Automações só existe para administrador.
      // Assim não expomos Formulários a perfis comuns.
      const automationsLink = nav.querySelector('a[href="/automacoes"]');
      if (!automationsLink || nav.querySelector('a[href="/formularios"]')) return;

      const link = document.createElement('a');
      link.href = '/formularios';
      link.dataset.ceamiFormsNav = 'true';
      link.innerHTML = `${CLIPBOARD_ICON}<span>Formulários</span>`;
      nav.insertBefore(link, automationsLink);
    }

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { subtree: true, childList: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
