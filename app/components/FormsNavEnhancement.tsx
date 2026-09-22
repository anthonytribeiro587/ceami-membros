'use client';

import { useEffect } from 'react';

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export default function FormsNavEnhancement() {
  useEffect(() => {
    function enhance() {
      document.querySelector('.member-v3-nav a[href="/formularios/pagamentos"]')?.remove();
      document.querySelector('[data-ceami-payments-shortcut]')?.remove();

      const responseTitle = document.querySelector('.forms-responses-head h2')?.textContent?.trim() || '';
      const isSeminar = responseTitle === 'Seminário de Estudo do Apocalipse';

      document.querySelectorAll('.forms-response-metrics article').forEach((article) => {
        const label = normalize(article.querySelector('span')?.textContent);
        if (label.includes('querem apostila') || label.includes('sem apostila')) {
          (article as HTMLElement).style.display = isSeminar ? 'none' : '';
        }
      });

      // O seminário começou com a pergunta antiga Sim/Não. As inscrições antigas
      // preservam esse valor bruto no banco, mas a interface atual já exibe a
      // interpretação correta (Física/PDF/Sem apostila) logo abaixo. Evitamos
      // mostrar as duas informações ao mesmo tempo.
      document.querySelectorAll('.forms-response-card .forms-response-tags > span').forEach((tag) => {
        const label = normalize(tag.querySelector('b')?.textContent);
        if (isSeminar && label.includes('vai querer apostila')) {
          (tag as HTMLElement).style.display = 'none';
        } else {
          (tag as HTMLElement).style.display = '';
        }
      });
    }

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { subtree: true, childList: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
