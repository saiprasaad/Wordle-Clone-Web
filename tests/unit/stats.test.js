import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyDailyRecord,
  emptyUnlimitedRecord,
  mergeDaily,
  mergeUnlimited,
  readDailyRecord,
  readUnlimitedRecord,
  recordDaily,
  recordUnlimited,
  summarizeDaily,
  summarizeUnlimited,
  winPercentage,
} from '../../js/stats.js';

const win = (guesses, at = 1) => ({ won: true, guesses, hardMode: false, at });
const loss = (at = 1) => ({ won: false, guesses: 6, hardMode: false, at });

function dailyWith(entries) {
  return entries.reduce((record, [puzzle, result]) => recordDaily(record, puzzle, result), emptyDailyRecord());
}

test('daily totals count each puzzle once', () => {
  let record = dailyWith([
    [1, win(3)],
    [2, win(3)],
    [3, loss()],
  ]);
  record = recordDaily(record, 3, win(1));
  const summary = summarizeDaily(record, 3);
  assert.deepEqual(
    { played: summary.played, won: summary.won, distribution: summary.distribution },
    { played: 3, won: 2, distribution: [0, 0, 2, 0, 0, 0] },
  );
  assert.equal(winPercentage(summary), 67);
});

test('the daily streak survives an unplayed today but not a missed day', () => {
  const record = dailyWith([
    [8, win(4)],
    [9, win(2)],
    [10, win(5)],
  ]);
  assert.equal(summarizeDaily(record, 10).currentStreak, 3);
  assert.equal(summarizeDaily(record, 11).currentStreak, 3);
  assert.equal(summarizeDaily(record, 12).currentStreak, 0);
  assert.equal(summarizeDaily(record, 12).maxStreak, 3);
});

test('a loss or a gap ends a daily streak', () => {
  const record = dailyWith([
    [1, win(2)],
    [2, win(2)],
    [3, loss()],
    [4, win(3)],
    [6, win(3)],
    [7, win(3)],
  ]);
  const summary = summarizeDaily(record, 7);
  assert.equal(summary.currentStreak, 2);
  assert.equal(summary.maxStreak, 2);
});

test('winPercentage handles no games played', () => {
  assert.equal(winPercentage(summarizeDaily(emptyDailyRecord(), 1)), 0);
});

test('merging daily records unions puzzles and keeps the earlier finish', () => {
  const phone = dailyWith([
    [1, win(4, 100)],
    [2, win(3, 500)],
  ]);
  const laptop = dailyWith([
    [2, loss(400)],
    [3, win(2, 900)],
  ]);
  const merged = mergeDaily(phone, laptop);
  assert.deepEqual(merged, mergeDaily(laptop, phone));
  assert.deepEqual(Object.keys(merged.results), ['1', '2', '3']);
  assert.equal(merged.results[2].won, false);
  assert.equal(summarizeDaily(merged, 3).played, 3);
});

test('unlimited tallies add up across devices', () => {
  let record = emptyUnlimitedRecord();
  record = recordUnlimited(record, 'phone', { won: true, guesses: 3, at: 10 });
  record = recordUnlimited(record, 'phone', { won: true, guesses: 4, at: 20 });
  record = recordUnlimited(record, 'laptop', { won: false, guesses: 6, at: 15 });
  const summary = summarizeUnlimited(record);
  assert.equal(summary.played, 3);
  assert.equal(summary.won, 2);
  assert.deepEqual(summary.distribution, [0, 0, 1, 1, 0, 0]);
  // The phone was played last, and its streak is two wins.
  assert.equal(summary.currentStreak, 2);
  assert.equal(summary.maxStreak, 2);
});

test('merging unlimited records keeps the larger tally for each device', () => {
  const older = recordUnlimited(emptyUnlimitedRecord(), 'phone', { won: true, guesses: 3, at: 10 });
  const newer = recordUnlimited(older, 'phone', { won: true, guesses: 2, at: 20 });
  const laptop = recordUnlimited(emptyUnlimitedRecord(), 'laptop', { won: true, guesses: 5, at: 30 });
  const merged = mergeUnlimited(mergeUnlimited(older, laptop), newer);
  assert.deepEqual(merged, mergeUnlimited(newer, mergeUnlimited(laptop, older)));
  assert.equal(summarizeUnlimited(merged).played, 3);
});

test('totals saved by the previous version become a legacy tally', () => {
  const saved = {
    played: 4,
    won: 3,
    currentStreak: 2,
    maxStreak: 2,
    distribution: [0, 1, 1, 1, 0, 0],
    lastPuzzle: 9,
    lastWonPuzzle: 9,
  };
  const record = readDailyRecord(saved, { device: 'phone' });
  const summary = summarizeDaily(record, 10);
  assert.deepEqual(
    { played: summary.played, won: summary.won, current: summary.currentStreak, max: summary.maxStreak },
    { played: 4, won: 3, current: 2, max: 2 },
  );
  // Winning the next puzzle continues the migrated streak.
  const next = summarizeDaily(recordDaily(record, 10, win(3)), 10);
  assert.equal(next.currentStreak, 3);
  assert.equal(next.maxStreak, 3);
});

test('migration keeps the last saved puzzle as a real result', () => {
  const saved = {
    played: 2,
    won: 2,
    currentStreak: 2,
    maxStreak: 2,
    distribution: [0, 0, 1, 1, 0, 0],
    lastPuzzle: 5,
    lastWonPuzzle: 5,
  };
  const lastResult = { puzzle: 5, won: true, guesses: 4, hardMode: false, at: 0 };
  const record = readDailyRecord(saved, { device: 'phone', lastResult });
  assert.deepEqual(Object.keys(record.results), ['5']);
  assert.equal(record.legacy.phone.played, 1);
  const summary = summarizeDaily(record, 5);
  assert.equal(summary.played, 2);
  assert.equal(summary.currentStreak, 2);
  assert.deepEqual(summary.distribution, [0, 0, 1, 1, 0, 0]);
});

test('unlimited totals from the previous version move into this device tally', () => {
  const saved = { played: 3, won: 2, currentStreak: 1, maxStreak: 2, distribution: [0, 1, 1, 0, 0, 0] };
  const summary = summarizeUnlimited(readUnlimitedRecord(saved, { device: 'phone' }));
  assert.deepEqual(
    { played: summary.played, won: summary.won, current: summary.currentStreak, max: summary.maxStreak },
    { played: 3, won: 2, current: 1, max: 2 },
  );
});

test('reading records drops malformed entries', () => {
  const record = readDailyRecord({
    results: { 3: win(2), 0: win(2), x: win(2), 4: { won: 'yes' }, 5: { won: true, guesses: 9 } },
    legacy: { phone: { played: 2, won: 5 } },
  });
  assert.deepEqual(Object.keys(record.results), ['3']);
  assert.deepEqual(record.legacy, {});
  assert.deepEqual(readUnlimitedRecord('garbage'), emptyUnlimitedRecord());
  assert.deepEqual(readDailyRecord(null), emptyDailyRecord());
});
