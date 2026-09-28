// Picks answers: one shared daily puzzle per day, plus random words for
// unlimited play.

import { ANSWERS } from './words.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// A new daily puzzle starts at midnight US Eastern Time, at the same moment
// for every player wherever they are. New York's time zone follows daylight
// saving time (EDT in summer, EST in winter).
const PUZZLE_TIME_ZONE = 'America/New_York';

// Puzzle #1 was released on this day, in Eastern Time.
const FIRST_PUZZLE_DAY = Date.UTC(2026, 8, 28); // 28 September 2026

// A fixed shuffle keeps the daily order identical for every player without
// making tomorrow's word obvious from the alphabetical list.
const DAILY_ORDER = shuffle([...ANSWERS], mulberry32(0x5eed1e));

const easternClock = new Intl.DateTimeFormat('en-US', {
  timeZone: PUZZLE_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hourCycle: 'h23',
});

/** The date and time on New York's clocks at the moment `time`. */
function easternParts(time) {
  const parts = {};
  for (const { type, value } of easternClock.formatToParts(time)) parts[type] = Number(value);
  return parts;
}

/** The New York calendar date at `time`, as midnight UTC on that date. */
function easternDay(time) {
  const { year, month, day } = easternParts(time);
  return Date.UTC(year, month - 1, day);
}

/** How far New York's clocks are from UTC at `time`, e.g. -4 hours in summer. */
function easternOffset(time) {
  const { year, month, day, hour, minute, second } = easternParts(time);
  return Date.UTC(year, month - 1, day, hour, minute, second) - Math.floor(time / 1000) * 1000;
}

/** The puzzle number at `date`: counted in days on New York's calendar. */
export function puzzleNumber(date = new Date()) {
  const day = easternDay(date.getTime());
  return Math.max(1, Math.round((day - FIRST_PUZZLE_DAY) / MS_PER_DAY) + 1);
}

/** When the next puzzle starts: the coming midnight in New York. */
export function nextPuzzleTime(date = new Date()) {
  const midnight = easternDay(date.getTime()) + MS_PER_DAY;
  // Clocks change at 2am, never at midnight, so the offset a few hours
  // before midnight is right; the second pass confirms it at midnight itself.
  const guess = midnight - easternOffset(midnight);
  return midnight - easternOffset(guess);
}

export function msUntilNextPuzzle(date = new Date()) {
  return nextPuzzleTime(date) - date.getTime();
}

/** The Eastern Time calendar date of puzzle `number`, as midnight UTC on it. */
export function puzzleDate(number) {
  return new Date(FIRST_PUZZLE_DAY + (number - 1) * MS_PER_DAY);
}

export function dailyAnswer(number) {
  return DAILY_ORDER[(number - 1) % DAILY_ORDER.length];
}

/** A random answer, avoiding `exclude` unless every word is excluded. */
export function randomAnswer(exclude = [], random = Math.random) {
  const excluded = new Set(exclude);
  const pool = ANSWERS.filter((word) => !excluded.has(word));
  const words = pool.length > 0 ? pool : ANSWERS;
  return words[Math.floor(random() * words.length)];
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
