'use client';

import { useEffect } from 'react';

const DETAILS = `Será nos dias 11 e 12 de Setembro/26.

🗓️ 11/09 Sexta
🕐 Horário: das 20 hs as 22 hs
🗓️ 12/09 sábado
🕐 Horário: das 16 hs as 22 hs
☕️ Coffee-break 19 hs

Faça sua inscrição antecipadamente para que possamos reservar seu material.

💰 VALORES DA INSCRIÇÃO
1 - Apostila digital: R$ 10,00
2 - Apostila física: R$ 35,00

Estaremos entregando a Apostila no início do Seminário.

Atenção:
Traga sua Bíblia, caneta e caderno de anotações. 👈📖🖊️📒

Desde já solicitamos que no dia do Seminário coloque seu celular no modo avião ✈️ ou silencioso.

Que Deus abençoe grandemente a todos, esperamos vocês ⛪
Vai ser um tempo de aprendizado e profundidade bíblica, um tempo precioso na Presença do SENHOR 🙌

Comunidade CEAMI ⛪`;

export default function SeminarPublicHotfix() {
  useEffect(() => {
    if (window.location.pathname !== '/f/seminario-apocalipse-2026') return;

    function apply() {
      const box = document.querySelector('.public-form-event-box');
      if (!box) return;

      const paragraph = box.querySelector('p');
      if (paragraph && paragraph.textContent !== DETAILS) paragraph.textContent = DETAILS;

      box.querySelectorAll('strong').forEach((node) => {
        if ((node.textContent || '').toLowerCase().includes('seminário gratuito')) node.remove();
      });
    }

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
