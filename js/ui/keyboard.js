// The on-screen keyboard.

import { STATE_LABELS } from './a11y.js';

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const BACKSPACE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8.5L2 12z"/><path d="M11.5 9.5l5 5m0-5l-5 5"/></svg>';

export function createKeyboard(element, onKey) {
  const letterKeys = new Map();

  function makeKey(key, { text = '', icon = '', label = '', wide = false }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = wide ? 'key key-wide' : 'key';
    button.dataset.key = key;
    if (icon) button.innerHTML = icon;
    else button.textContent = text;
    if (label) button.setAttribute('aria-label', label);
    return button;
  }

  function spacer() {
    const div = document.createElement('div');
    div.className = 'key-spacer';
    return div;
  }

  ROWS.forEach((letters, r) => {
    const row = document.createElement('div');
    row.className = 'keyboard-row';
    if (r === 1) row.append(spacer());
    if (r === 2) row.append(makeKey('enter', { text: 'Enter', wide: true }));
    for (const letter of letters) {
      const button = makeKey(letter, { text: letter.toUpperCase() });
      letterKeys.set(letter, button);
      row.append(button);
    }
    if (r === 2) {
      row.append(makeKey('backspace', { icon: BACKSPACE_ICON, label: 'Backspace', wide: true }));
    }
    if (r === 1) row.append(spacer());
    element.append(row);
  });

  element.addEventListener('click', (event) => {
    const button = event.target.closest('[data-key]');
    if (button) onKey(button.dataset.key);
  });
  // Clicking a key must not move focus onto it, or the physical Enter key
  // would press that key again instead of submitting the guess.
  element.addEventListener('mousedown', (event) => event.preventDefault());
  // iOS Safari only shows :active press feedback when a touch listener exists.
  element.addEventListener('touchstart', () => {}, { passive: true });

  return {
    /** Colors each letter with the best state revealed so far. */
    update(states) {
      for (const [letter, button] of letterKeys) {
        const state = states[letter];
        if (state) button.dataset.state = state;
        else delete button.dataset.state;
        const label = letter.toUpperCase();
        button.setAttribute('aria-label', state ? `${label}, ${STATE_LABELS[state]}` : label);
      }
    },
  };
}
