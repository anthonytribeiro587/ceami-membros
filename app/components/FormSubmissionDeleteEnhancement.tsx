'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

function normalize(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function digits(value: string) {
  return value.replace(/\D/g, '');
}

export default function FormSubmissionDeleteEnhancement() {
  useEffect(() => {
    if (!window.location.pathname.startsWith('/formularios')) return;

    const supabase = createClient();
    let busy = false;

    function removeDeleteFromViewResponses() {
      document.querySelectorAll('.forms-response-modal [data-ceami-delete-submission]')
        .forEach((node) => node.remove());
    }

    function enhanceEditDialogs() {
      removeDeleteFromViewResponses();

      const dialogs = Array.from(document.querySelectorAll('.ceami-edit-modal[role="dialog"]')) as HTMLElement[];
      for (const dialog of dialogs) {
        if (dialog.querySelector('[data-ceami-delete-submission]')) continue;

        const title = normalize(dialog.querySelector('h3')?.textContent || '');
        if (!title.includes('editar inscri')) continue;

        const inputs = Array.from(dialog.querySelectorAll('input')) as HTMLInputElement[];
        const nameInput = inputs.find((input) => /nome/i.test(input.placeholder || input.name || input.getAttribute('aria-label') || '')) || inputs[0];
        const phoneInput = inputs.find((input) => /telefone|whatsapp/i.test(input.placeholder || input.name || input.getAttribute('aria-label') || '')) || inputs[1];
        if (!nameInput?.value?.trim()) continue;

        const footer = dialog.querySelector('footer');
        if (!footer) continue;

        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('data-ceami-delete-submission', 'true');
        button.className = 'ceami-submission-delete-button';
        button.innerHTML = '<span aria-hidden="true">🗑️</span> Excluir inscrição';

        button.addEventListener('click', async () => {
          if (busy) return;

          const name = nameInput.value.trim();
          const phone = phoneInput?.value?.trim() || '';
          if (!window.confirm(`Excluir definitivamente a inscrição de ${name}?\n\nEssa ação não pode ser desfeita.`)) return;

          busy = true;
          button.disabled = true;
          button.textContent = 'Excluindo...';

          try {
            const { data, error } = await supabase
              .from('form_submissions')
              .select('id, respondent_name, respondent_phone, answers, created_at')
              .order('created_at', { ascending: false })
              .limit(500);
            if (error) throw error;

            const nameMatches = (data || []).filter((row: any) =>
              normalize(String(row.respondent_name || row.answers?.nome_completo || '')) === normalize(name),
            );

            const phoneDigits = digits(phone);
            const matches = phoneDigits
              ? nameMatches.filter((row: any) => digits(String(row.respondent_phone || row.answers?.telefone || '')) === phoneDigits)
              : nameMatches;

            if (matches.length !== 1) {
              throw new Error(
                matches.length
                  ? 'Há mais de uma inscrição com estes dados. Não foi feita nenhuma exclusão.'
                  : 'Não foi possível localizar esta inscrição no banco.',
              );
            }

            const { error: deleteError } = await supabase
              .from('form_submissions')
              .delete()
              .eq('id', matches[0].id);
            if (deleteError) throw deleteError;

            window.alert('Inscrição excluída com sucesso.');
            window.location.reload();
          } catch (error) {
            console.error(error);
            window.alert(error instanceof Error ? error.message : 'Não foi possível excluir a inscrição.');
            button.disabled = false;
            button.innerHTML = '<span aria-hidden="true">🗑️</span> Excluir inscrição';
            busy = false;
          }
        });

        footer.insertBefore(button, footer.firstChild);
      }
    }

    const style = document.createElement('style');
    style.dataset.ceamiDeleteSubmissionStyle = 'true';
    style.textContent = `
      .ceami-edit-modal footer .ceami-submission-delete-button{
        margin-right:auto;
        min-height:42px;
        border:1px solid #e3b5af;
        background:#fff5f3;
        color:#9c3429;
        border-radius:10px;
        padding:0 14px;
        font-weight:900;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:7px;
        cursor:pointer;
      }
      .ceami-edit-modal footer .ceami-submission-delete-button:hover{background:#fde8e5}
      .ceami-edit-modal footer .ceami-submission-delete-button:disabled{opacity:.6;cursor:wait}
      @media(max-width:700px){
        .ceami-edit-modal footer{grid-template-columns:1fr 1fr!important}
        .ceami-edit-modal footer .ceami-submission-delete-button{grid-column:1/-1;width:100%;margin-right:0}
      }
    `;
    document.head.appendChild(style);

    removeDeleteFromViewResponses();
    enhanceEditDialogs();
    const observer = new MutationObserver(() => {
      removeDeleteFromViewResponses();
      enhanceEditDialogs();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      style.remove();
      document.querySelectorAll('[data-ceami-delete-submission]').forEach((node) => node.remove());
    };
  }, []);

  return null;
}
