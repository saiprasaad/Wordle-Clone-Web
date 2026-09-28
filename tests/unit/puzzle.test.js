import { test } from 'node:test';
import assert from 'node:assert/strict';

// Daily puzzles follow the player's local calendar, so pin a time zone with
// daylight saving time to exercise the awkward days.
process.env.TZ = 'America/New_York';

const { dailyAnswer, msUntilNextPuzzle, puzzleNumber, randomAnswer } = await import(
  '../../js/puzzle.js'
);
const { ANSWERS } = await import('../../js/words.js');

const HOUR = 60 * 60 * 1000;

test('puzzle numbers start at 1 on launch day and follow local dates', () => {
  assert.equal(puzzleNumber(new Date(2026, 8, 28, 0, 0)), 1);
  assert.equal(puzzleNumber(new Date(2026, 8, 28, 23, 59)), 1);
  assert.equal(puzzleNumber(new Date(2026, 8, 29, 0, 0)), 2);
  assert.equal(puzzleNumber(new Date(2027, 8, 28, 12, 0)), 366);
});

test('puzzle numbers never drop below 1 for clocks set before launch', () => {
  assert.equal(puzzleNumber(new Date(2020, 0, 1)), 1);
});

test('puzzle numbers advance by exactly one across daylight saving changes', () => {
  // DST starts 14 March 2027 and ends 7 November 2027 in New York.
  for (const [month, day] of [
    [2, 13],
    [10, 6],
  ]) {
    const before = puzzleNumber(new Date(2027, month, day, 12));
    assert.equal(puzzleNumber(new Date(2027, month, day + 1, 0, 30)), before + 1);
    assert.equal(puzzleNumber(new Date(2027, month, day + 1, 23, 30)), before + 1);
    assert.equal(puzzleNumber(new Date(2027, month, day + 2, 0, 30)), before + 2);
  }
});

test('daily answers are stable and use every answer once per cycle', () => {
  assert.equal(dailyAnswer(1), dailyAnswer(1));
  const cycle = new Set();
  for (let n = 1; n <= ANSWERS.length; n++) cycle.add(dailyAnswer(n));
  assert.equal(cycle.size, ANSWERS.length);
  assert.equal(dailyAnswer(ANSWERS.length + 1), dailyAnswer(1));
});

test('the daily order is shuffled rather than alphabetical', () => {
  const firstWeek = Array.from({ length: 7 }, (_, i) => dailyAnswer(i + 1));
  assert.notDeepEqual(firstWeek, ANSWERS.slice(0, 7));
});

test('msUntilNextPuzzle counts down to local midnight, including 23 and 25 hour days', () => {
  assert.equal(msUntilNextPuzzle(new Date(2026, 9, 1, 23, 0)), HOUR);
  assert.equal(msUntilNextPuzzle(new Date(2026, 9, 1, 0, 0)), 24 * HOUR);
  assert.equal(msUntilNextPuzzle(new Date(2027, 2, 14, 0, 0)), 23 * HOUR);
  assert.equal(msUntilNextPuzzle(new Date(2027, 10, 7, 0, 0)), 25 * HOUR);
});

test('randomAnswer skips excluded words', () => {
  const [first, second] = ANSWERS;
  assert.equal(randomAnswer([], () => 0), first);
  assert.equal(randomAnswer([first], () => 0), second);
  assert.ok(ANSWERS.includes(randomAnswer([], () => 0.999999)));
});

test('randomAnswer still returns a word when everything is excluded', () => {
  assert.equal(randomAnswer(ANSWERS, () => 0), ANSWERS[0]);
});
