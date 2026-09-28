import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  currentStreak,
  emptyStats,
  normalizeStats,
  recordGame,
  winPercentage,
} from '../../js/stats.js';

test('recordGame counts wins, losses and the guess distribution', () => {
  let stats = emptyStats();
  stats = recordGame(stats, { won: true, guessCount: 3 });
  stats = recordGame(stats, { won: true, guessCount: 3 });
  stats = recordGame(stats, { won: false, guessCount: 6 });
  assert.equal(stats.played, 3);
  assert.equal(stats.won, 2);
  assert.deepEqual(stats.distribution, [0, 0, 2, 0, 0, 0]);
  assert.equal(winPercentage(stats), 67);
});

test('recordGame does not mutate its input', () => {
  const stats = emptyStats();
  recordGame(stats, { won: true, guessCount: 1 });
  assert.deepEqual(stats, emptyStats());
});

test('unlimited streaks grow with each win and reset on a loss', () => {
  let stats = emptyStats();
  for (let i = 0; i < 3; i++) stats = recordGame(stats, { won: true, guessCount: 4 });
  assert.equal(stats.currentStreak, 3);
  stats = recordGame(stats, { won: false, guessCount: 6 });
  assert.equal(stats.currentStreak, 0);
  assert.equal(stats.maxStreak, 3);
  assert.equal(currentStreak(stats), 0);
});

test('daily streaks need consecutive puzzles', () => {
  let stats = emptyStats();
  stats = recordGame(stats, { won: true, guessCount: 2, puzzle: 10 });
  stats = recordGame(stats, { won: true, guessCount: 2, puzzle: 11 });
  assert.equal(stats.currentStreak, 2);
  // Skipping puzzle 12 starts a new streak.
  stats = recordGame(stats, { won: true, guessCount: 2, puzzle: 13 });
  assert.equal(stats.currentStreak, 1);
  assert.equal(stats.maxStreak, 2);
});

test('a daily puzzle is only recorded once', () => {
  let stats = recordGame(emptyStats(), { won: true, guessCount: 2, puzzle: 5 });
  stats = recordGame(stats, { won: false, guessCount: 6, puzzle: 5 });
  assert.equal(stats.played, 1);
  assert.equal(stats.currentStreak, 1);
});

test('the displayed daily streak lapses once a puzzle is missed', () => {
  const stats = recordGame(emptyStats(), { won: true, guessCount: 4, puzzle: 20 });
  assert.equal(currentStreak(stats, 20), 1);
  assert.equal(currentStreak(stats, 21), 1);
  assert.equal(currentStreak(stats, 22), 0);
  assert.equal(currentStreak(emptyStats(), 1), 0);
});

test('normalizeStats repairs missing or corrupted data', () => {
  assert.deepEqual(normalizeStats(null), emptyStats());
  assert.deepEqual(normalizeStats('garbage'), emptyStats());
  const repaired = normalizeStats({ played: 4, distribution: [1, 2] });
  assert.equal(repaired.played, 4);
  assert.deepEqual(repaired.distribution, [0, 0, 0, 0, 0, 0]);
});

test('winPercentage handles no games played', () => {
  assert.equal(winPercentage(emptyStats()), 0);
});
