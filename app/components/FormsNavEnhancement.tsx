'use client';

import { useEffect } from 'react';

const CLIPBOARD_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect width="8" height="4" x="8" y="2" rx="1" ry="1"></rect>
  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
  <path d="M9 12h6"></path>
  <path d="M9 16h6"></path>
</svg>`;

const MONEY_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect width="20" height="12" x="2" y="6" rx="2"></rect>
  <circle cx="12" cy="12" r="2"></circle>
  <path d="M6 10h.01M18 14h.01"></path>
</svg>`;

export default function FormsNavEnhancement() {
  useEffect(() => {
    function enhance() {
      const nav = document.querySelector('.member-v3-nav');
      if (!nav) return;

      // No painel principal, Automações só existe para administrador.
      // Assim não expomos Formulários e Pagamentos a perfis comuns.
      const automationsLink = nav.querySelector('a[href="/automacoes"]');
      if (!automationsLink) return;

      let formsLink = nav.querySelector('a[href="/formularios"]');
      if (!formsLink) {
        const link = document.createElement('a');
        link.href = '/formularios';
        link.dataset.ceamiFormsNav = 'true';
        link.innerHTML = `${CLIPBOARD_ICON}<span>Formulários</span>`;
        nav.insertBefore(link, automationsLink);
        formsLink = link;
      }

      if (!nav.querySelector('a[href="/formularios/pagamentos"]')) {
        const paymentsLink = document.createElement('a');
        paymentsLink.href = '/formularios/pagamentos';
        paymentsLink.dataset.ceamiPaymentsNav = 'true';
        paymentsLink.innerHTML = `${MONEY_ICON}<span>Pagamentos</span>`;
        if (window.location.pathname.startsWith('/formularios/pagamentos')) {
          paymentsLink.classList.add('active');
          paymentsLink.setAttribute('aria-current', 'page');
        }
        formsLink.insertAdjacentElement('afterend', paymentsLink);
      }

      const header = document.querySelector('.forms-admin-header');
      if (header && !header.querySelector('[data-ceami-payments-shortcut]')) {
        const shortcut = document.createElement('a');
        shortcut.href = '/formularios/pagamentos';
        shortcut.dataset.ceamiPaymentsShortcut = 'true';
        shortcut.innerHTML = `${MONEY_ICON}<span>Pagamentos</span>`;
        shortcut.style.cssText = 'min-height:44px;padding:0 15px;border-radius:12px;border:1px solid #d9d0c5;background:#fff;color:#4b4036;text-decoration:none;display:inline-flex;align-items:center;gap:7px;font-weight:800;white-space:nowrap;';
        const newFormButton = header.querySelector('button');
        if (newFormButton) header.insertBefore(shortcut, newFormButton);
        else header.appendChild(shortcut);
      }
    }

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { subtree: true, childList: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
