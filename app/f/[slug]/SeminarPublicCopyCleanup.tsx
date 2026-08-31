'use client';

import { useEffect } from 'react';

const SEMINAR_SLUG = 'seminario-apocalipse-2026';

export default function SeminarPublicCopyCleanup({ slug }: { slug: string }) {
  useEffect(() => {
    if (slug !== SEMINAR_SLUG) return;

    function cleanup() {
      const paragraph = document.querySelector<HTMLElement>('.public-form-event-box p');
      if (!paragraph) return;

      const current = paragraph.textContent || '';
      const next = current
        .replace(/\s*•\s*Sem apostila:\s*sem custo\.?/gi, '')
        .replace(/\s*Sem apostila:\s*sem custo\.?/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (next !== current.trim()) paragraph.textContent = next;
    }

    cleanup();
    const observer = new MutationObserver(cleanup);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [slug]);

  return null;
}
