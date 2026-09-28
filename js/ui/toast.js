// Short-lived messages shown over the board (and over any open dialog).

import { announce } from './a11y.js';

const MAX_TOASTS = 3;
const toaster = document.getElementById('toaster');
// The toaster is a popover so it can sit in the top layer above modal dialogs.
const usePopover = typeof toaster.showPopover === 'function';

function bringToFront() {
  if (!usePopover) return;
  if (toaster.matches(':popover-open')) toaster.hidePopover();
  toaster.showPopover();
}

function removeToast(toast) {
  toast.remove();
  if (usePopover && toaster.childElementCount === 0 && toaster.matches(':popover-open')) {
    toaster.hidePopover();
  }
}

/**
 * Shows `message` for `duration` ms. It is also announced to screen readers
 * unless `silent` is set because the caller announces something fuller.
 */
export function showToast(message, { duration = 1400, silent = false } = {}) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toaster.prepend(toast);
  while (toaster.childElementCount > MAX_TOASTS) removeToast(toaster.lastElementChild);
  bringToFront();
  if (!silent) announce(message);

  setTimeout(() => {
    toast.dataset.leaving = '';
    setTimeout(() => removeToast(toast), 300);
  }, duration);
}

export function clearToasts() {
  for (const toast of [...toaster.children]) removeToast(toast);
}
