// Core rules of the game. Pure functions with no DOM access, shared by the UI
// and the unit tests.

import { ANSWERS, ALLOWED } from './words.js';

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

export const CORRECT = 'correct';
export const PRESENT = 'present';
export const ABSENT = 'absent';

const VALID_WORDS = new Set([...ANSWERS, ...ALLOWED]);
const ANSWER_WORDS = new Set(ANSWERS);

export function isValidWord(word) {
  return VALID_WORDS.has(word);
}

export function isAnswerWord(word) {
  return ANSWER_WORDS.has(word);
}

/**
 * Scores a guess against the answer. Exact matches are marked first; a letter
 * elsewhere in the guess is only marked present while unmatched copies of it
 * remain in the answer, so duplicate letters are never over-counted.
 */
export function evaluateGuess(guess, answer) {
  const result = Array(WORD_LENGTH).fill(ABSENT);
  const unmatched = {};
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === answer[i]) {
      result[i] = CORRECT;
    } else {
      unmatched[answer[i]] = (unmatched[answer[i]] ?? 0) + 1;
    }
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] !== CORRECT && unmatched[guess[i]] > 0) {
      result[i] = PRESENT;
      unmatched[guess[i]] -= 1;
    }
  }
  return result;
}

export function gameStatus(guesses, answer) {
  if (guesses.includes(answer)) return 'won';
  if (guesses.length >= MAX_GUESSES) return 'lost';
  return 'playing';
}

const RANK = { [ABSENT]: 1, [PRESENT]: 2, [CORRECT]: 3 };

/** The most informative state revealed for each letter, for the keyboard. */
export function letterStates(guesses, answer) {
  const states = {};
  for (const guess of guesses) {
    evaluateGuess(guess, answer).forEach((state, i) => {
      const letter = guess[i];
      if (!states[letter] || RANK[state] > RANK[states[letter]]) states[letter] = state;
    });
  }
  return states;
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];

/**
 * Hard mode: every revealed hint must be reused. Green letters must stay in
 * place, and each guess must contain at least as many copies of a letter as
 * any earlier guess revealed. Returns a message for the first broken rule, or
 * null when the guess is allowed.
 */
export function hardModeViolation(guess, previousGuesses, answer) {
  const required = {};
  for (const previous of previousGuesses) {
    const evaluation = evaluateGuess(previous, answer);
    const revealed = {};
    for (let i = 0; i < WORD_LENGTH; i++) {
      const letter = previous[i];
      if (evaluation[i] === CORRECT && guess[i] !== letter) {
        return `${ORDINALS[i]} letter must be ${letter.toUpperCase()}`;
      }
      if (evaluation[i] !== ABSENT) revealed[letter] = (revealed[letter] ?? 0) + 1;
    }
    for (const [letter, count] of Object.entries(revealed)) {
      required[letter] = Math.max(required[letter] ?? 0, count);
    }
  }
  for (const [letter, count] of Object.entries(required)) {
    const used = [...guess].filter((l) => l === letter).length;
    if (used < count) {
      const times = count === 1 ? '' : count === 2 ? ' twice' : ` ${count} times`;
      return `Guess must contain ${letter.toUpperCase()}${times}`;
    }
  }
  return null;
}
