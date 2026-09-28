// Native <dialog> modals: close buttons, backdrop clicks and focus handling.

/**
 * Wires up a dialog. Clicking the backdrop or any [data-close] element closes it.
 * `onClose` runs after it closes.
 */
export function setupDialog(dialog, { onClose } = {}) {
  let pressedOnBackdrop = false;
  let trigger = null;
  let restoreFocus = false;

  // Only close when the press both started and ended on the backdrop, so that
  // selecting text and releasing outside the dialog does not dismiss it.
  dialog.addEventListener('pointerdown', (event) => {
    pressedOnBackdrop = event.target === dialog;
  });
  dialog.addEventListener('click', (event) => {
    if ((event.target === dialog && pressedOnBackdrop) || event.target.closest('[data-close]')) {
      dialog.close();
    }
  });

  dialog.addEventListener('close', () => {
    // Keyboard users get focus back on the control that opened the dialog.
    // After a mouse or touch open, focus is dropped instead so the physical
    // Enter key submits guesses rather than reopening the dialog.
    if (restoreFocus && trigger?.isConnected) trigger.focus();
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    trigger = null;
    onClose?.();
  });

  return {
    open() {
      if (dialog.open) return;
      trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      restoreFocus = Boolean(trigger?.matches(':focus-visible'));
      dialog.showModal();
    },
    close() {
      if (dialog.open) dialog.close();
    },
    get isOpen() {
      return dialog.open;
    },
  };
}

export function isAnyDialogOpen() {
  return document.querySelector('dialog[open]') !== null;
}
