// Builds the spoiler-free emoji grid that players share.

import { CORRECT, PRESENT, MAX_GUESSES, evaluateGuess } from './game.js';

export function shareText({ title, guesses, answer, won, hardMode, highContrast, darkTheme, url }) {
  const squares = {
    [CORRECT]: highContrast ? '🟧' : '🟩',
    [PRESENT]: highContrast ? '🟦' : '🟨',
  };
  const absent = darkTheme ? '⬛' : '⬜';
  const grid = guesses.map((guess) =>
    evaluateGuess(guess, answer).map((state) => squares[state] ?? absent).join(''),
  );
  const score = `${won ? guesses.length : 'X'}/${MAX_GUESSES}${hardMode ? '*' : ''}`;
  const lines = [`${title} ${score}`, '', ...grid];
  if (url) lines.push('', url);
  return lines.join('\n');
}
