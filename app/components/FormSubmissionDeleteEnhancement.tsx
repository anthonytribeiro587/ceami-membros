'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function FormSubmissionDeleteEnhancement() {
  useEffect(() => {
    if (!window.location.pathname.startsWith('/formularios')) return;

    const supabase = createClient();
    let busy = false;
    let currentSubmissionId = '';

    function rememberSelectedSubmission(event: Event) {
      const target = event.target as Element | null;
      const button = target?.closest('[data-ceami-edit-submission]') as HTMLElement | null;
      if (!button) return;
      currentSubmissionId = button.dataset.ceamiEditSubmission || '';
    }

    document.addEventListener('click', rememberSelectedSubmission, true);

    function removeDeleteFromViewResponses() {
      document.querySelectorAll('.forms-response-modal [data-ceami-delete-submission]')
        .forEach((node) => node.remove());
    }

    function enhanceEditDialogs() {
      removeDeleteFromViewResponses();

      const dialogs = Array.from(document.querySelectorAll('.ceami-edit-modal[role="dialog"]')) as HTMLElement[];
      for (const dialog of dialogs) {
        if (dialog.querySelector('[data-ceami-delete-submission]')) continue;

        const title = (dialog.querySelector('h3')?.textContent || '').toLowerCase();
        if (!title.includes('editar inscri')) continue;

        const inputs = Array.from(dialog.querySelectorAll('input')) as HTMLInputElement[];
        const nameInput = inputs[0];
        if (!nameInput?.value?.trim() || !currentSubmissionId) continue;

        const footer = dialog.querySelector('footer');
        if (!footer) continue;

        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('data-ceami-delete-submission', 'true');
        button.className = 'ceami-submission-delete-button';
        button.innerHTML = '<span aria-hidden="true">🗑</span><span>Excluir inscrição</span>';

        button.addEventListener('click', async () => {
          if (busy) return;

          const name = nameInput.value.trim();
          const submissionId = currentSubmissionId;
          if (!submissionId) {
            window.alert('Não foi possível identificar esta inscrição. Feche e abra “Editar inscrição” novamente.');
            return;
          }

          if (!window.confirm(`Excluir definitivamente a inscrição de ${name}?\n\nEssa ação não pode ser desfeita.`)) return;

          busy = true;
          button.disabled = true;
          button.textContent = 'Excluindo...';

          try {
            const { error } = await supabase
              .from('form_submissions')
              .delete()
              .eq('id', submissionId);
            if (error) throw error;

            window.alert('Inscrição excluída com sucesso.');
            window.location.reload();
          } catch (error) {
            console.error(error);
            window.alert(error instanceof Error ? error.message : 'Não foi possível excluir a inscrição.');
            button.disabled = false;
            button.innerHTML = '<span aria-hidden="true">🗑</span><span>Excluir inscrição</span>';
            busy = false;
          }
        });

        footer.insertBefore(button, footer.firstChild);
      }
    }

    const style = document.createElement('style');
    style.dataset.ceamiDeleteSubmissionStyle = 'true';
    style.textContent = `
      .ceami-edit-modal footer{
        display:flex!important;
        align-items:center!important;
        justify-content:flex-end!important;
        gap:8px!important;
      }
      .ceami-edit-modal footer>button{
        height:42px!important;
        min-height:42px!important;
        box-sizing:border-box!important;
        display:inline-flex!important;
        align-items:center!important;
        justify-content:center!important;
        line-height:1!important;
      }
      .ceami-edit-modal footer .ceami-submission-delete-button{
        margin-right:auto!important;
        border:1px solid #e3b5af;
        background:#fff5f3;
        color:#9c3429;
        border-radius:10px;
        padding:0 14px;
        font-weight:900;
        gap:7px;
        cursor:pointer;
        white-space:nowrap;
      }
      .ceami-edit-modal footer .ceami-submission-delete-button:hover{background:#fde8e5}
      .ceami-edit-modal footer .ceami-submission-delete-button:disabled{opacity:.6;cursor:wait}
      @media(max-width:700px){
        .ceami-edit-modal footer{
          display:grid!important;
          grid-template-columns:1fr 1fr!important;
          align-items:stretch!important;
        }
        .ceami-edit-modal footer .ceami-submission-delete-button{
          grid-column:1/-1!important;
          width:100%!important;
          margin-right:0!important;
        }
        .ceami-edit-modal footer .cancel,.ceami-edit-modal footer .save{width:100%!important}
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
      document.removeEventListener('click', rememberSelectedSubmission, true);
      style.remove();
      document.querySelectorAll('[data-ceami-delete-submission]').forEach((node) => node.remove());
    };
  }, []);

  return null;
}
