// Picks answers: one shared daily puzzle per calendar day, plus random words
// for unlimited play.

import { ANSWERS } from './words.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Puzzle #1 was released on this day. Puzzles change at local midnight, so
// everyone plays the same word on the same calendar date.
const FIRST_PUZZLE_DAY = Date.UTC(2026, 8, 28); // 28 September 2026

// A fixed shuffle keeps the daily order identical for every player without
// making tomorrow's word obvious from the alphabetical list.
const DAILY_ORDER = shuffle([...ANSWERS], mulberry32(0x5eed1e));

/** The puzzle number for the calendar date of `date` in the player's time zone. */
export function puzzleNumber(date = new Date()) {
  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(1, Math.round((day - FIRST_PUZZLE_DAY) / MS_PER_DAY) + 1);
}

export function dailyAnswer(number) {
  return DAILY_ORDER[(number - 1) % DAILY_ORDER.length];
}

/** Milliseconds until the next local midnight, when a new puzzle starts. */
export function msUntilNextPuzzle(date = new Date()) {
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return midnight.getTime() - date.getTime();
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
