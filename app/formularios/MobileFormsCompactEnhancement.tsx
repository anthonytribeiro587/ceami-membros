'use client';

import { useEffect } from 'react';

const MOBILE_MAX = 720;
const SMALL_MAX = 480;

function directItems(target: HTMLElement) {
  return Array.from(target.children).filter((child): child is HTMLElement => child instanceof HTMLElement && !child.classList.contains('ceami-mobile-pager'));
}

function pageSize() {
  return window.innerWidth <= SMALL_MAX ? 6 : 8;
}

function pagerAnchor(target: HTMLElement) {
  if (target.tagName === 'TBODY') {
    return target.closest<HTMLElement>('.ceami-pdf-table-wrap, .ceami-preflight-table-wrap') || target.parentElement || target;
  }
  return target;
}

function ensurePager(target: HTMLElement, total: number, size: number) {
  const anchor = pagerAnchor(target);
  let pager = anchor.nextElementSibling as HTMLElement | null;
  if (!pager?.classList.contains('ceami-mobile-pager')) {
    pager = document.createElement('div');
    pager.className = 'ceami-mobile-pager';
    pager.innerHTML = `
      <button type="button" data-dir="prev" aria-label="Página anterior">‹</button>
      <span></span>
      <button type="button" data-dir="next" aria-label="Próxima página">›</button>
    `;
    anchor.insertAdjacentElement('afterend', pager);

    pager.querySelector<HTMLButtonElement>('[data-dir="prev"]')?.addEventListener('click', () => {
      const page = Math.max(0, Number(target.dataset.mobilePage || '0') - 1);
      target.dataset.mobilePage = String(page);
      applyTarget(target);
      anchor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    pager.querySelector<HTMLButtonElement>('[data-dir="next"]')?.addEventListener('click', () => {
      const maxPage = Math.max(0, Math.ceil(directItems(target).length / pageSize()) - 1);
      const page = Math.min(maxPage, Number(target.dataset.mobilePage || '0') + 1);
      target.dataset.mobilePage = String(page);
      applyTarget(target);
      anchor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(pages - 1, Math.max(0, Number(target.dataset.mobilePage || '0')));
  const first = total ? current * size + 1 : 0;
  const last = Math.min(total, (current + 1) * size);
  const label = pager.querySelector('span');
  if (label) label.textContent = `${first}–${last} de ${total}`;

  const prev = pager.querySelector<HTMLButtonElement>('[data-dir="prev"]');
  const next = pager.querySelector<HTMLButtonElement>('[data-dir="next"]');
  if (prev) prev.disabled = current <= 0;
  if (next) next.disabled = current >= pages - 1;
  pager.style.display = total > size ? 'flex' : 'none';
}

function cleanupTarget(target: HTMLElement) {
  for (const item of directItems(target)) item.style.removeProperty('display');
  const anchor = pagerAnchor(target);
  const pager = anchor.nextElementSibling as HTMLElement | null;
  if (pager?.classList.contains('ceami-mobile-pager')) pager.remove();
  delete target.dataset.mobilePage;
}

function applyTarget(target: HTMLElement) {
  if (window.innerWidth > MOBILE_MAX) {
    cleanupTarget(target);
    return;
  }

  const items = directItems(target);
  const size = pageSize();
  const maxPage = Math.max(0, Math.ceil(items.length / size) - 1);
  const current = Math.min(maxPage, Math.max(0, Number(target.dataset.mobilePage || '0')));
  target.dataset.mobilePage = String(current);
  const start = current * size;
  const end = start + size;

  items.forEach((item, index) => {
    item.style.display = index >= start && index < end ? '' : 'none';
  });

  ensurePager(target, items.length, size);
}

function applyAll() {
  const selectors = [
    '.forms-response-list',
    '.ceami-pdf-table tbody',
    '.ceami-preflight-table tbody',
  ];
  for (const selector of selectors) {
    document.querySelectorAll<HTMLElement>(selector).forEach(applyTarget);
  }
}

export default function MobileFormsCompactEnhancement() {
  useEffect(() => {
    let timer: number | null = null;
    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(applyAll, 80);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);

    return () => {
      if (timer) window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      document.querySelectorAll<HTMLElement>('.forms-response-list, .ceami-pdf-table tbody, .ceami-preflight-table tbody').forEach(cleanupTarget);
    };
  }, []);

  return (
    <style>{`
      .ceami-mobile-pager{display:none;align-items:center;justify-content:center;gap:10px;margin:8px 0 2px;padding:7px 8px;border:1px solid #e5ded3;border-radius:10px;background:#fff}
      .ceami-mobile-pager span{font-size:12px;font-weight:800;color:#675d52;min-width:78px;text-align:center}
      .ceami-mobile-pager button{width:38px;height:34px;padding:0!important;border:1px solid #d8cec0!important;border-radius:8px!important;background:#fff!important;color:#5a4937!important;font-size:22px!important;line-height:1!important}
      .ceami-mobile-pager button:disabled{opacity:.35!important}

      @media(max-width:720px){
        .forms-admin-page{overflow-x:hidden}
        .forms-responses{padding-left:10px!important;padding-right:10px!important}
        .forms-response-toolbar{gap:8px!important}
        .forms-response-search{min-width:0!important;width:100%!important}
        .forms-response-filter{min-width:0!important;flex:1 1 46%!important}
        .forms-response-list{gap:9px!important}
        .forms-response-list>*{margin-top:0!important;margin-bottom:0!important}
        .forms-response-result-head{position:sticky;top:0;z-index:3;background:rgba(255,255,255,.96);padding:7px 2px}

        .ceami-pdf-history,.ceami-seminar-pdf-test{padding:11px!important;border-radius:12px!important}
        .ceami-pdf-history-head,.ceami-seminar-pdf-test-head{gap:8px!important}
        .ceami-pdf-history-head span,.ceami-seminar-pdf-test-head span{line-height:1.35}
        .ceami-pdf-tabs{display:grid!important;grid-template-columns:1fr 1fr!important;width:100%}
        .ceami-pdf-tabs button{width:100%!important;padding:9px 6px!important;font-size:11px!important}

        .ceami-pdf-table-wrap,.ceami-preflight-table-wrap{overflow:visible!important;border:0!important;background:transparent!important}
        .ceami-pdf-table,.ceami-preflight-table{min-width:0!important;width:100%!important;border-collapse:separate!important}
        .ceami-pdf-table thead,.ceami-preflight-table thead{display:none!important}
        .ceami-pdf-table tbody,.ceami-preflight-table tbody{display:grid!important;gap:8px!important;width:100%!important}
        .ceami-pdf-table tr,.ceami-preflight-table tr{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;gap:5px 8px!important;padding:10px!important;border:1px solid #e7e0d6!important;border-radius:11px!important;background:#fff!important;box-shadow:0 1px 2px rgba(0,0,0,.03)}
        .ceami-pdf-table td,.ceami-preflight-table td{display:block!important;min-width:0!important;padding:2px!important;border:0!important;font-size:11px!important;line-height:1.3!important;overflow-wrap:anywhere}
        .ceami-pdf-table td:first-child,.ceami-preflight-table td:first-child{grid-column:1/-1!important;font-size:12px!important;padding-bottom:4px!important;border-bottom:1px solid #f1ece5!important}
        .ceami-pdf-table td:last-child,.ceami-preflight-table td:last-child{grid-column:1/-1!important;padding-top:5px!important}
        .ceami-pdf-row-actions{display:grid!important;grid-template-columns:1fr 1fr!important;gap:6px!important}
        .ceami-pdf-row-actions button{width:100%!important;padding:9px 5px!important;font-size:11px!important}
        .ceami-simple-status,.ceami-pdf-source{max-width:100%;white-space:normal!important}
        .ceami-mobile-pager{display:flex}
      }

      @media(max-width:480px){
        .forms-response-filter{flex-basis:100%!important}
        .ceami-pdf-table tr,.ceami-preflight-table tr{grid-template-columns:1fr!important}
        .ceami-pdf-table td,.ceami-preflight-table td,.ceami-pdf-table td:first-child,.ceami-preflight-table td:first-child,.ceami-pdf-table td:last-child,.ceami-preflight-table td:last-child{grid-column:1!important}
        .ceami-pdf-row-actions{grid-template-columns:1fr!important}
      }
    `}</style>
  );
}
