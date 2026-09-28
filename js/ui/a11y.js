// Shared accessibility helpers.

import { ABSENT, CORRECT, PRESENT } from '../game.js';

/** How tile and key states are described to screen readers. */
export const STATE_LABELS = {
  [CORRECT]: 'correct',
  [PRESENT]: 'in the word, wrong spot',
  [ABSENT]: 'not in the word',
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

export function prefersReducedMotion() {
  return reducedMotion.matches;
}

/** A spoken summary of a scored guess, e.g. "CRANE: C correct, R not in the word, …". */
export function describeGuess(guess, evaluation) {
  const letters = [...guess].map((letter, i) => `${letter.toUpperCase()} ${STATE_LABELS[evaluation[i]]}`);
  return `${guess.toUpperCase()}: ${letters.join(', ')}.`;
}

/**
 * Speaks a message through a polite live region. Content outside an open modal
 * dialog is inert and would stay silent, so the dialog's own region is used then.
 */
export function announce(message) {
  const region =
    document.querySelector('dialog[open] [data-announcer]') ??
    document.querySelector('body > [data-announcer]');
  if (!region) return;
  region.textContent = '';
  // Setting the text in a later frame makes repeated messages announce again.
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}
