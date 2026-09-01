'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

function normalize(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export default function FormSubmissionDeleteEnhancement() {
  useEffect(() => {
    if (!window.location.pathname.startsWith('/formularios')) return;

    const supabase = createClient();
    let busy = false;

    async function findSubmission(name: string, sentLabel: string) {
      const { data, error } = await supabase
        .from('form_submissions')
        .select('id, respondent_name, answers, created_at')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      const normalizedName = normalize(name);
      const normalizedSent = normalize(sentLabel.replace(/^enviado em\s*/i, ''));

      return (data || []).find((row: any) => {
        const rowName = row.respondent_name || row.answers?.nome_completo || '';
        const rowDate = new Date(row.created_at).toLocaleString('pt-BR');
        return normalize(String(rowName)) === normalizedName && normalize(rowDate) === normalizedSent;
      }) || null;
    }

    function enhanceModal() {
      const modal = document.querySelector('.forms-response-modal') as HTMLElement | null;
      if (!modal || modal.querySelector('[data-ceami-delete-submission]')) return;

      const title = modal.querySelector('header h3')?.textContent?.trim() || '';
      const sentText = modal.querySelector('header p')?.textContent?.trim() || '';
      if (!title || !sentText.toLowerCase().startsWith('enviado em')) return;

      const actions = document.createElement('div');
      actions.setAttribute('data-ceami-delete-submission', 'true');
      actions.className = 'ceami-submission-delete-actions';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ceami-submission-delete-button';
      button.innerHTML = '<span aria-hidden="true">🗑️</span> Excluir inscrição';

      button.addEventListener('click', async () => {
        if (busy) return;
        const confirmed = window.confirm(
          `Excluir definitivamente a inscrição de ${title}?\n\nEssa ação não pode ser desfeita.`,
        );
        if (!confirmed) return;

        busy = true;
        button.disabled = true;
        button.textContent = 'Excluindo...';

        try {
          const submission = await findSubmission(title, sentText);
          if (!submission) throw new Error('Não foi possível localizar esta inscrição no banco.');

          const { error } = await supabase
            .from('form_submissions')
            .delete()
            .eq('id', submission.id);

          if (error) throw error;

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

      actions.appendChild(button);
      modal.appendChild(actions);
    }

    function enhanceEditDialogs() {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], .forms-response-modal')) as HTMLElement[];
      for (const dialog of dialogs) {
        if (dialog.querySelector('[data-ceami-delete-submission]')) continue;
        const text = normalize(dialog.textContent || '');
        if (!text.includes('editar inscri') || !text.includes('salvar')) continue;

        const nameInput = Array.from(dialog.querySelectorAll('input')).find((input) => {
          const el = input as HTMLInputElement;
          return /nome/i.test(el.name || el.placeholder || el.getAttribute('aria-label') || '');
        }) as HTMLInputElement | undefined;
        const name = nameInput?.value?.trim();
        if (!name) continue;

        const actions = document.createElement('div');
        actions.setAttribute('data-ceami-delete-submission', 'true');
        actions.className = 'ceami-submission-delete-actions';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ceami-submission-delete-button';
        button.innerHTML = '<span aria-hidden="true">🗑️</span> Excluir inscrição';
        button.addEventListener('click', async () => {
          if (busy) return;
          if (!window.confirm(`Excluir definitivamente a inscrição de ${name}?\n\nEssa ação não pode ser desfeita.`)) return;
          busy = true;
          button.disabled = true;
          button.textContent = 'Excluindo...';
          try {
            const { data, error } = await supabase
              .from('form_submissions')
              .select('id, respondent_name, answers, created_at')
              .order('created_at', { ascending: false })
              .limit(500);
            if (error) throw error;
            const matches = (data || []).filter((row: any) => normalize(String(row.respondent_name || row.answers?.nome_completo || '')) === normalize(name));
            if (matches.length !== 1) throw new Error(matches.length ? 'Há mais de uma inscrição com este nome. Abra “Ver respostas” e exclua por lá para evitar apagar a pessoa errada.' : 'Não foi possível localizar esta inscrição.');
            const { error: deleteError } = await supabase.from('form_submissions').delete().eq('id', matches[0].id);
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
        actions.appendChild(button);
        dialog.appendChild(actions);
      }
    }

    const style = document.createElement('style');
    style.dataset.ceamiDeleteSubmissionStyle = 'true';
    style.textContent = `
      .ceami-submission-delete-actions{display:flex;justify-content:flex-start;margin:18px 20px 20px;padding-top:16px;border-top:1px solid #eee5da}
      .ceami-submission-delete-button{min-height:40px;border:1px solid #e4b9b3;background:#fff5f3;color:#9c3429;border-radius:10px;padding:0 14px;font-weight:800;display:inline-flex;align-items:center;gap:7px;cursor:pointer}
      .ceami-submission-delete-button:hover{background:#fdeae7}
      .ceami-submission-delete-button:disabled{opacity:.6;cursor:wait}
      @media(max-width:600px){.ceami-submission-delete-actions{margin:14px 14px 18px}.ceami-submission-delete-button{width:100%;justify-content:center}}
    `;
    document.head.appendChild(style);

    const enhance = () => {
      enhanceModal();
      enhanceEditDialogs();
    };
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      style.remove();
    };
  }, []);

  return null;
}
