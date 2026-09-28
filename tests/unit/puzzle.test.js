import { test } from 'node:test';
import assert from 'node:assert/strict';

// Daily puzzles follow US Eastern Time for every player. Run in another time
// zone to show that the device's own zone doesn't matter.
process.env.TZ = 'Asia/Kolkata';

const { dailyAnswer, msUntilNextPuzzle, nextPuzzleTime, puzzleDate, puzzleNumber, randomAnswer } =
  await import('../../js/puzzle.js');
const { ANSWERS } = await import('../../js/words.js');

const HOUR = 60 * 60 * 1000;
const at = (time) => new Date(time);

test('puzzle numbers start at 1 on launch day and follow the date in New York', () => {
  assert.equal(puzzleNumber(at('2026-09-28T00:00:00-04:00')), 1);
  assert.equal(puzzleNumber(at('2026-09-28T23:59:00-04:00')), 1);
  assert.equal(puzzleNumber(at('2026-09-29T00:00:00-04:00')), 2);
  assert.equal(puzzleNumber(at('2027-09-28T12:00:00-04:00')), 366);
});

test('everyone plays the same puzzle at the same moment', () => {
  // 9:30am in India is midnight in New York while daylight saving time is on.
  assert.equal(puzzleNumber(at('2026-09-29T09:29:00+05:30')), 1);
  assert.equal(puzzleNumber(at('2026-09-29T09:30:00+05:30')), 2);
  assert.equal(puzzleNumber(at('2026-09-28T20:00:00-07:00')), 1); // Los Angeles
  assert.equal(puzzleNumber(at('2026-09-28T21:00:00-07:00')), 2);
});

test('puzzle numbers never drop below 1 for clocks set before launch', () => {
  assert.equal(puzzleNumber(at('2020-01-01T00:00:00Z')), 1);
});

test('puzzle numbers advance by exactly one across daylight saving changes', () => {
  // DST starts 14 March 2027 and ends 7 November 2027 in New York.
  for (const [dayBefore, earlyNext, lateNext, dayAfter] of [
    ['2027-03-13T12:00-05:00', '2027-03-14T00:30-05:00', '2027-03-14T23:30-04:00', '2027-03-15T00:30-04:00'],
    ['2027-11-06T12:00-04:00', '2027-11-07T00:30-04:00', '2027-11-07T23:30-05:00', '2027-11-08T00:30-05:00'],
  ]) {
    const before = puzzleNumber(at(dayBefore));
    assert.equal(puzzleNumber(at(earlyNext)), before + 1);
    assert.equal(puzzleNumber(at(lateNext)), before + 1);
    assert.equal(puzzleNumber(at(dayAfter)), before + 2);
  }
});

test('the next puzzle starts at midnight in New York, including 23 and 25 hour days', () => {
  assert.equal(msUntilNextPuzzle(at('2026-10-01T23:00:00-04:00')), HOUR);
  assert.equal(msUntilNextPuzzle(at('2026-10-01T00:00:00-04:00')), 24 * HOUR);
  assert.equal(msUntilNextPuzzle(at('2027-03-14T00:00:00-05:00')), 23 * HOUR);
  assert.equal(msUntilNextPuzzle(at('2027-11-07T00:00:00-04:00')), 25 * HOUR);
  assert.equal(msUntilNextPuzzle(at('2026-09-29T08:30:00+05:30')), HOUR);
  assert.equal(nextPuzzleTime(at('2026-12-01T12:00:00-05:00')), Date.parse('2026-12-02T05:00:00Z'));
});

test('puzzleDate gives each puzzle its Eastern Time calendar date', () => {
  assert.equal(puzzleDate(1).toISOString(), '2026-09-28T00:00:00.000Z');
  assert.equal(puzzleDate(8).toISOString(), '2026-10-05T00:00:00.000Z');
  assert.equal(puzzleDate(366).toISOString(), '2027-09-28T00:00:00.000Z');
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

test('randomAnswer skips excluded words', () => {
  const [first, second] = ANSWERS;
  assert.equal(randomAnswer([], () => 0), first);
  assert.equal(randomAnswer([first], () => 0), second);
  assert.ok(ANSWERS.includes(randomAnswer([], () => 0.999999)));
});

test('randomAnswer still returns a word when everything is excluded', () => {
  assert.equal(randomAnswer(ANSWERS, () => 0), ANSWERS[0]);
});
