// The 6×5 grid of tiles, with its animations.

import { MAX_GUESSES, WORD_LENGTH, evaluateGuess } from '../game.js';
import { STATE_LABELS, prefersReducedMotion } from './a11y.js';

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];
const FLIP_MS = 480;
const FLIP_STAGGER_MS = 260;
const BOUNCE_MS = 900;
const BOUNCE_STAGGER_MS = 90;

/** Resolves once the animation ends; skipped entirely for reduced motion. */
function animate(element, keyframes, options) {
  if (prefersReducedMotion()) return Promise.resolve();
  return element.animate(keyframes, options).finished.catch(() => {});
}

export function createBoard(element) {
  const rows = Array.from({ length: MAX_GUESSES }, (_, r) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', `Row ${r + 1}`);
    const tiles = Array.from({ length: WORD_LENGTH }, () => {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.setAttribute('role', 'img');
      tile.setAttribute('aria-roledescription', 'tile');
      row.append(tile);
      return tile;
    });
    element.append(row);
    return { row, tiles };
  });

  function setTile(tile, index, letter = '', state = letter ? 'tbd' : 'empty') {
    tile.textContent = letter;
    tile.dataset.state = state;
    const description = letter
      ? `${letter.toUpperCase()}${STATE_LABELS[state] ? `, ${STATE_LABELS[state]}` : ''}`
      : 'empty';
    tile.setAttribute('aria-label', `${ORDINALS[index]} letter, ${description}`);
  }

  return {
    /** Draws a game at rest: scored guesses, the row being typed, then empty rows. */
    render(guesses, answer, input) {
      rows.forEach(({ tiles }, r) => {
        const guess = guesses[r];
        const evaluation = guess ? evaluateGuess(guess, answer) : null;
        tiles.forEach((tile, c) => {
          if (guess) setTile(tile, c, guess[c], evaluation[c]);
          else setTile(tile, c, r === guesses.length ? input[c] : '');
        });
      });
    },

    setInput(rowIndex, input) {
      rows[rowIndex].tiles.forEach((tile, c) => setTile(tile, c, input[c]));
    },

    pop(rowIndex, column) {
      animate(
        rows[rowIndex].tiles[column],
        [{ transform: 'scale(0.8)', opacity: 0 }, { transform: 'scale(1.1)', opacity: 1, offset: 0.4 }, { transform: 'scale(1)' }],
        { duration: 110, easing: 'ease-out' },
      );
    },

    shake(rowIndex) {
      animate(
        rows[rowIndex].row,
        [0, -1, 2, -4, 4, -4, 4, -4, 2, -1, 0].map((x) => ({ transform: `translateX(${x}px)` })),
        { duration: 600 },
      );
    },

    /** Flips each tile in turn, switching its color while it is edge-on. */
    reveal(rowIndex, guess, evaluation) {
      return Promise.all(
        rows[rowIndex].tiles.map(async (tile, c) => {
          const flipIn = prefersReducedMotion()
            ? null
            : tile.animate([{ transform: 'rotateX(0)' }, { transform: 'rotateX(-90deg)' }], {
                duration: FLIP_MS / 2,
                delay: c * FLIP_STAGGER_MS,
                easing: 'ease-in',
                fill: 'forwards',
              });
          await flipIn?.finished.catch(() => {});
          setTile(tile, c, guess[c], evaluation[c]);
          const flipOut = animate(tile, [{ transform: 'rotateX(-90deg)' }, { transform: 'rotateX(0)' }], {
            duration: FLIP_MS / 2,
            easing: 'ease-out',
          });
          flipIn?.cancel();
          await flipOut;
        }),
      );
    },

    bounce(rowIndex) {
      const offsets = [
        { transform: 'translateY(0)' },
        { transform: 'translateY(-30px)', offset: 0.4 },
        { transform: 'translateY(5px)', offset: 0.5 },
        { transform: 'translateY(-15px)', offset: 0.6 },
        { transform: 'translateY(2px)', offset: 0.8 },
        { transform: 'translateY(0)' },
      ];
      return Promise.all(
        rows[rowIndex].tiles.map((tile, c) =>
          animate(tile, offsets, { duration: BOUNCE_MS, delay: c * BOUNCE_STAGGER_MS, easing: 'ease-out' }),
        ),
      );
    },
  };
}
