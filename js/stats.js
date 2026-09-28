// Player statistics. Each game mode keeps its own record.

import { MAX_GUESSES } from './game.js';

export function emptyStats() {
  return {
    played: 0,
    won: 0,
    currentStreak: 0,
    maxStreak: 0,
    distribution: Array(MAX_GUESSES).fill(0),
    // Daily mode only: the last puzzle recorded and the last one won, used to
    // ignore repeats and to break a streak when a day is missed.
    lastPuzzle: null,
    lastWonPuzzle: null,
  };
}

/** Fills in defaults so stats saved by older versions (or corrupted) stay usable. */
export function normalizeStats(saved) {
  const stats = { ...emptyStats(), ...(saved && typeof saved === 'object' ? saved : {}) };
  if (!Array.isArray(stats.distribution) || stats.distribution.length !== MAX_GUESSES) {
    stats.distribution = emptyStats().distribution;
  }
  return stats;
}

/**
 * Returns new stats with a finished game added. `puzzle` is the daily puzzle
 * number, or null in unlimited mode where any win extends the streak.
 */
export function recordGame(stats, { won, guessCount, puzzle = null }) {
  if (puzzle !== null && stats.lastPuzzle === puzzle) return stats;

  const next = { ...stats, distribution: [...stats.distribution], played: stats.played + 1 };
  if (puzzle !== null) next.lastPuzzle = puzzle;
  if (won) {
    const continuesStreak = puzzle === null || stats.lastWonPuzzle === puzzle - 1;
    next.won += 1;
    next.distribution[guessCount - 1] += 1;
    next.currentStreak = continuesStreak ? stats.currentStreak + 1 : 1;
    next.maxStreak = Math.max(stats.maxStreak, next.currentStreak);
    if (puzzle !== null) next.lastWonPuzzle = puzzle;
  } else {
    next.currentStreak = 0;
  }
  return next;
}

/** The streak to display: a daily streak lapses once a puzzle is skipped. */
export function currentStreak(stats, todaysPuzzle = null) {
  if (todaysPuzzle === null) return stats.currentStreak;
  return stats.lastWonPuzzle !== null && stats.lastWonPuzzle >= todaysPuzzle - 1
    ? stats.currentStreak
    : 0;
}

export function winPercentage(stats) {
  return stats.played === 0 ? 0 : Math.round((stats.won / stats.played) * 100);
}
