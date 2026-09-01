'use client';

import { useEffect } from 'react';

const SORT_KEY = 'ceami-form-responses-sort';

type SortMode = 'newest' | 'oldest' | 'name-asc' | 'name-desc';

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parsePtBrDate(value: string) {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4}),\s*(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return 0;
  const [, day, month, year, hour, minute, second] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)).getTime();
}

export default function ResponseSortEnhancement() {
  useEffect(() => {
    if (!window.location.pathname.startsWith('/formularios')) return;

    let mode = (window.localStorage.getItem(SORT_KEY) as SortMode | null) || 'newest';
    let scheduled = 0;
    let sorting = false;

    function sortCards() {
      if (sorting) return;
      const list = document.querySelector('.forms-response-list');
      if (!list) return;

      const cards = Array.from(list.querySelectorAll<HTMLElement>('.forms-response-card'));
      if (cards.length < 2) return;

      sorting = true;
      cards.sort((a, b) => {
        const nameA = normalize(a.querySelector('.forms-response-name-row h3')?.textContent || '');
        const nameB = normalize(b.querySelector('.forms-response-name-row h3')?.textContent || '');
        const dateA = parsePtBrDate(a.querySelector('time')?.textContent || '');
        const dateB = parsePtBrDate(b.querySelector('time')?.textContent || '');

        if (mode === 'name-asc') return nameA.localeCompare(nameB, 'pt-BR');
        if (mode === 'name-desc') return nameB.localeCompare(nameA, 'pt-BR');
        if (mode === 'oldest') return dateA - dateB;
        return dateB - dateA;
      });

      for (const card of cards) list.appendChild(card);
      sorting = false;
    }

    function enhance() {
      const toolbar = document.querySelector('.forms-response-toolbar');
      if (!toolbar) return;

      let wrapper = toolbar.querySelector<HTMLElement>('[data-ceami-response-sort]');
      if (!wrapper) {
        wrapper = document.createElement('label');
        wrapper.dataset.ceamiResponseSort = 'true';
        wrapper.className = 'forms-response-filter ceami-response-sort';
        wrapper.innerHTML = `
          <span>Ordenar por</span>
          <select aria-label="Ordenar inscrições">
            <option value="newest">Mais recentes</option>
            <option value="oldest">Mais antigas</option>
            <option value="name-asc">Nome A–Z</option>
            <option value="name-desc">Nome Z–A</option>
          </select>
        `;
        const select = wrapper.querySelector('select') as HTMLSelectElement;
        select.value = mode;
        select.addEventListener('change', () => {
          mode = select.value as SortMode;
          window.localStorage.setItem(SORT_KEY, mode);
          sortCards();
        });
        toolbar.appendChild(wrapper);
      }

      sortCards();
    }

    const style = document.createElement('style');
    style.dataset.ceamiResponseSortStyle = 'true';
    style.textContent = `
      .ceami-response-sort{min-width:170px}
      .ceami-response-sort select{min-width:170px}
      @media(max-width:700px){.ceami-response-sort,.ceami-response-sort select{width:100%;min-width:0}}
    `;
    document.head.appendChild(style);

    const schedule = () => {
      if (scheduled) cancelAnimationFrame(scheduled);
      scheduled = requestAnimationFrame(enhance);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (scheduled) cancelAnimationFrame(scheduled);
      observer.disconnect();
      style.remove();
      document.querySelectorAll('[data-ceami-response-sort]').forEach((node) => node.remove());
    };
  }, []);

  return null;
}
