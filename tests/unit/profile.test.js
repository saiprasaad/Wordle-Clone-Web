import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeProfiles, readProfile, sameProfile, stableStringify } from '../../js/profile.js';
import { emptyDailyRecord, emptyUnlimitedRecord, recordDaily, recordUnlimited } from '../../js/stats.js';

function profile({ settings, daily, unlimited, dailyGame = null, unlimitedGame = null } = {}) {
  return {
    schema: 1,
    settings: settings ?? { hardMode: false, highContrast: false, at: 0 },
    daily: daily ?? emptyDailyRecord(),
    unlimited: unlimited ?? emptyUnlimitedRecord(),
    games: { daily: dailyGame, unlimited: unlimitedGame },
  };
}

const dailyGame = (puzzle, guesses, at, answer = 'crane') => ({
  puzzle,
  answer,
  guesses,
  hardMode: false,
  gaveUp: false,
  at,
});
const unlimitedGame = (answer, guesses, at, gaveUp = false) => ({
  puzzle: null,
  answer,
  guesses,
  hardMode: false,
  gaveUp,
  at,
});

function assertMerge(a, b, check) {
  const merged = mergeProfiles(a, b);
  assert.ok(sameProfile(merged, mergeProfiles(b, a)), 'merge order must not matter');
  assert.ok(sameProfile(mergeProfiles(merged, merged), merged), 'merging again changes nothing');
  check(merged);
}

test('settings follow the most recent change', () => {
  const phone = profile({ settings: { hardMode: true, highContrast: false, at: 50 } });
  const laptop = profile({ settings: { hardMode: false, highContrast: true, at: 10 } });
  assertMerge(phone, laptop, (merged) => assert.deepEqual(merged.settings, phone.settings));
});

test('a daily game in progress continues wherever it has more guesses', () => {
  const phone = profile({ dailyGame: dailyGame(4, ['slate', 'pious'], 20) });
  const laptop = profile({ dailyGame: dailyGame(4, ['slate'], 30) });
  assertMerge(phone, laptop, (merged) => assert.deepEqual(merged.games.daily.guesses, ['slate', 'pious']));
});

test('a finished daily game beats one still in progress, and a newer puzzle beats both', () => {
  const finished = profile({ dailyGame: dailyGame(4, ['slate', 'crane'], 10) });
  const playing = profile({ dailyGame: dailyGame(4, ['slate', 'pious', 'dough'], 20) });
  assertMerge(finished, playing, (merged) => assert.equal(merged.games.daily.guesses.at(-1), 'crane'));
  const tomorrow = profile({ dailyGame: dailyGame(5, [], 0, 'dough') });
  assertMerge(finished, tomorrow, (merged) => assert.equal(merged.games.daily.puzzle, 5));
});

test('an unlimited round in progress beats a word dealt but not started', () => {
  const phone = profile({ unlimitedGame: unlimitedGame('crane', ['slate'], 10) });
  const laptop = profile({ unlimitedGame: unlimitedGame('dough', [], 99) });
  assertMerge(phone, laptop, (merged) => assert.equal(merged.games.unlimited.answer, 'crane'));
  const finished = profile({ unlimitedGame: unlimitedGame('crane', ['slate'], 10, true) });
  assertMerge(finished, laptop, (merged) => assert.equal(merged.games.unlimited.answer, 'dough'));
});

test('stats from both devices are kept', () => {
  const phone = profile({
    daily: recordDaily(emptyDailyRecord(), 3, { won: true, guesses: 4, hardMode: false, at: 5 }),
    unlimited: recordUnlimited(emptyUnlimitedRecord(), 'phone', { won: true, guesses: 2, at: 5 }),
  });
  const laptop = profile({
    daily: recordDaily(emptyDailyRecord(), 4, { won: true, guesses: 3, hardMode: false, at: 9 }),
    unlimited: recordUnlimited(emptyUnlimitedRecord(), 'laptop', { won: false, guesses: 6, at: 9 }),
  });
  assertMerge(phone, laptop, (merged) => {
    assert.deepEqual(Object.keys(merged.daily.results), ['3', '4']);
    assert.deepEqual(Object.keys(merged.unlimited.devices).sort(), ['laptop', 'phone']);
  });
});

test('reading a profile from the cloud drops invalid games and fields', () => {
  const read = readProfile(
    {
      settings: { hardMode: 'yes', highContrast: true, at: -3 },
      games: {
        daily: { puzzle: 2, answer: 'zzzzz', guesses: [] },
        unlimited: { answer: 'crane', guesses: ['crane', 'slate'] },
      },
      extra: 'ignored',
    },
    { device: 'phone' },
  );
  assert.deepEqual(read.settings, { hardMode: false, highContrast: true, at: 0 });
  assert.equal(read.games.daily, null);
  assert.equal(read.games.unlimited, null);
  assert.equal('extra' in read, false);
});

test('stableStringify ignores key order', () => {
  assert.equal(stableStringify({ b: 1, a: [{ d: 2, c: 3 }] }), stableStringify({ a: [{ c: 3, d: 2 }], b: 1 }));
});
