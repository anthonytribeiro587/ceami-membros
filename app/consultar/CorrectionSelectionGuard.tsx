'use client';

import { useEffect } from 'react';

type ControlSnapshot = {
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  value: string;
  checked?: boolean;
};

export default function CorrectionSelectionGuard() {
  useEffect(() => {
    let openedFromUnselected = false;
    let restoring = false;
    let controlSnapshot: ControlSnapshot[] = [];

    function captureModalValues() {
      controlSnapshot = Array.from(
        document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          '.correction-modal-body input, .correction-modal-body select, .correction-modal-body textarea',
        ),
      ).map(element => ({
        element,
        value: element.value,
        checked: element instanceof HTMLInputElement ? element.checked : undefined,
      }));
    }

    function restoreModalValues() {
      for (const snapshot of controlSnapshot) {
        snapshot.element.value = snapshot.value;
        if (snapshot.element instanceof HTMLInputElement && snapshot.checked !== undefined) {
          snapshot.element.checked = snapshot.checked;
        }
        snapshot.element.dispatchEvent(new Event('input', { bubbles: true }));
        snapshot.element.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    function prepareModal(event: Event) {
      if (restoring) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const summaryButton = target.closest('.summary-card button');
      if (summaryButton) {
        const card = summaryButton.closest('.summary-card');
        openedFromUnselected = !card?.classList.contains('selected');
        window.requestAnimationFrame(() => {
          const leftButton = document.querySelector<HTMLButtonElement>('.correction-modal .remove-correction');
          if (leftButton && openedFromUnselected) leftButton.textContent = 'Cancelar';
          captureModalValues();
        });
        return;
      }

      if (target.closest('.selected-corrections button')) {
        openedFromUnselected = false;
        window.requestAnimationFrame(captureModalValues);
        return;
      }

      if (target.closest('.confirm-correction')) {
        openedFromUnselected = false;
        controlSnapshot = [];
      }
    }

    function cancelUnconfirmedSelection(event: Event) {
      if (restoring || !openedFromUnselected) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const clickedBackdrop = target.classList.contains('correction-modal-backdrop');
      const clickedClose = Boolean(target.closest('.correction-modal > header button'));
      if (!clickedBackdrop && !clickedClose) return;

      const removeButton = document.querySelector<HTMLButtonElement>('.correction-modal .remove-correction');
      if (!removeButton) return;

      event.preventDefault();
      event.stopPropagation();
      if ('stopImmediatePropagation' in event) event.stopImmediatePropagation();

      restoring = true;
      restoreModalValues();
      removeButton.click();
      openedFromUnselected = false;
      controlSnapshot = [];
      window.setTimeout(() => {
        restoring = false;
      }, 0);
    }

    document.addEventListener('click', prepareModal, true);
    document.addEventListener('mousedown', cancelUnconfirmedSelection, true);
    document.addEventListener('click', cancelUnconfirmedSelection, true);

    return () => {
      document.removeEventListener('click', prepareModal, true);
      document.removeEventListener('mousedown', cancelUnconfirmedSelection, true);
      document.removeEventListener('click', cancelUnconfirmedSelection, true);
    };
  }, []);

  return null;
}
