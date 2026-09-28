// Player records and the statistics shown from them.
//
// Records are built to merge across devices when a player signs in:
// - Daily puzzles are stored once per puzzle number, so a puzzle finished on
//   two devices counts once and streaks follow the calendar exactly.
// - Unlimited games are tallied per device. A device's tally only grows, so a
//   merge keeps the larger copy and the totals add up across devices.
// - Totals saved before per-puzzle history existed ("legacy") are kept as a
//   tally for the device that saved them and added on top.

import { MAX_GUESSES } from './game.js';

const emptyDistribution = () => Array(MAX_GUESSES).fill(0);

// ---------- Daily puzzles ----------

export function emptyDailyRecord() {
  return { results: {}, legacy: {} };
}

/** Adds a finished puzzle. The first result saved for a puzzle is the one that counts. */
export function recordDaily(record, puzzle, result) {
  if (record.results[puzzle]) return record;
  return { ...record, results: { ...record.results, [puzzle]: result } };
}

export function summarizeDaily(record, today) {
  const totals = tally(Object.values(record.results), Object.values(record.legacy));
  // Today's puzzle may still be unplayed without breaking the streak.
  const currentStreak = winsEndingAt(record, record.results[today] ? today : today - 1);
  let maxStreak = Math.max(0, ...Object.values(record.legacy).map((entry) => entry.maxStreak));
  for (const [key, result] of Object.entries(record.results)) {
    const puzzle = Number(key);
    if (result.won && !record.results[puzzle + 1]?.won) {
      maxStreak = Math.max(maxStreak, winsEndingAt(record, puzzle));
    }
  }
  return { ...totals, currentStreak, maxStreak };
}

/** Wins in a row ending at `puzzle`, continuing into an older legacy streak. */
function winsEndingAt(record, puzzle) {
  let wins = 0;
  let current = puzzle;
  while (record.results[current]?.won) {
    wins += 1;
    current -= 1;
  }
  // A recorded loss ends the run; a gap may be the end of a legacy streak.
  return record.results[current] ? wins : wins + legacyStreakEndingAt(record, current);
}

function legacyStreakEndingAt(record, puzzle) {
  const streaks = Object.values(record.legacy)
    .filter((entry) => entry.streakEnd === puzzle)
    .map((entry) => entry.streak);
  return Math.max(0, ...streaks);
}

export function mergeDaily(a, b) {
  const results = { ...b.results };
  for (const [puzzle, result] of Object.entries(a.results)) {
    const other = results[puzzle];
    // Finished on two devices before they synced: the earlier finish counts.
    if (!other || isEarlier(result, other)) results[puzzle] = result;
  }
  return { results, legacy: mergeTallies(a.legacy, b.legacy) };
}

// ---------- Unlimited games ----------

export function emptyUnlimitedRecord() {
  return { devices: {} };
}

export function recordUnlimited(record, device, { won, guesses, at }) {
  const previous = record.devices[device] ?? emptyTally();
  const distribution = [...previous.distribution];
  if (won) distribution[guesses - 1] += 1;
  const streak = won ? previous.streak + 1 : 0;
  return {
    devices: {
      ...record.devices,
      [device]: {
        played: previous.played + 1,
        won: previous.won + (won ? 1 : 0),
        distribution,
        streak,
        maxStreak: Math.max(previous.maxStreak, streak),
        at,
      },
    },
  };
}

export function summarizeUnlimited(record) {
  const devices = Object.values(record.devices);
  // The current streak lives on whichever device was played most recently.
  const latest = devices.reduce((best, entry) => (!best || entry.at > best.at ? entry : best), null);
  return {
    ...tally([], devices),
    currentStreak: latest?.streak ?? 0,
    maxStreak: Math.max(0, ...devices.map((entry) => entry.maxStreak)),
  };
}

export function mergeUnlimited(a, b) {
  return { devices: mergeTallies(a.devices, b.devices) };
}

// ---------- Shared ----------

export function winPercentage(summary) {
  return summary.played === 0 ? 0 : Math.round((summary.won / summary.played) * 100);
}

function emptyTally() {
  return { played: 0, won: 0, distribution: emptyDistribution(), streak: 0, maxStreak: 0, at: 0 };
}

function tally(results, tallies) {
  const totals = { played: 0, won: 0, distribution: emptyDistribution() };
  for (const result of results) {
    totals.played += 1;
    if (result.won) {
      totals.won += 1;
      totals.distribution[result.guesses - 1] += 1;
    }
  }
  for (const entry of tallies) {
    totals.played += entry.played;
    totals.won += entry.won;
    entry.distribution.forEach((count, i) => {
      totals.distribution[i] += count;
    });
  }
  return totals;
}

/** A device's tally only ever grows, so the copy with more games is the newer one. */
function mergeTallies(a, b) {
  const merged = { ...b };
  for (const [device, entry] of Object.entries(a)) {
    const other = merged[device];
    if (!other || entry.played > other.played || (entry.played === other.played && isNewer(entry, other))) {
      merged[device] = entry;
    }
  }
  return merged;
}

// Ties are broken by content so every device settles on the same copy.
function isEarlier(a, b) {
  return a.at !== b.at ? a.at < b.at : JSON.stringify(a) < JSON.stringify(b);
}

function isNewer(a, b) {
  return (a.at ?? 0) !== (b.at ?? 0) ? (a.at ?? 0) > (b.at ?? 0) : JSON.stringify(a) > JSON.stringify(b);
}

// ---------- Reading saved data ----------

const isCount = (value) => Number.isInteger(value) && value >= 0;
const isTime = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function readDistribution(value) {
  return Array.isArray(value) && value.length === MAX_GUESSES && value.every(isCount)
    ? [...value]
    : emptyDistribution();
}

function readResult(value) {
  if (!value || typeof value.won !== 'boolean') return null;
  if (!Number.isInteger(value.guesses) || value.guesses < 1 || value.guesses > MAX_GUESSES) return null;
  return { won: value.won, guesses: value.guesses, hardMode: value.hardMode === true, at: isTime(value.at) ? value.at : 0 };
}

function readTally(value, extraFields) {
  if (!value || !isCount(value.played) || !isCount(value.won) || value.won > value.played) return null;
  const entry = { played: value.played, won: value.won, distribution: readDistribution(value.distribution) };
  for (const field of extraFields) entry[field] = Number.isInteger(value[field]) ? value[field] : 0;
  if ('at' in entry) entry.at = isTime(value.at) ? value.at : 0;
  return entry;
}

function readMap(value, readEntry, isKey = () => true) {
  const map = {};
  if (!value || typeof value !== 'object') return map;
  for (const [key, entry] of Object.entries(value)) {
    const parsed = isKey(key) ? readEntry(entry) : null;
    if (parsed) map[key] = parsed;
  }
  return map;
}

const isPuzzleKey = (key) => /^[1-9]\d{0,6}$/.test(key);
const isDeviceKey = (key) => /^[\w-]{1,64}$/.test(key);

/**
 * Reads a daily record from storage or the cloud, dropping anything malformed.
 * Totals saved by older versions are converted: see `migrateDailyTotals`.
 */
export function readDailyRecord(value, { device, lastResult = null } = {}) {
  if (value && typeof value.played === 'number') return migrateDailyTotals(value, device, lastResult);
  return {
    results: readMap(value?.results, readResult, isPuzzleKey),
    legacy: readMap(value?.legacy, (entry) => readTally(entry, ['streak', 'streakEnd', 'maxStreak']), isDeviceKey),
  };
}

export function readUnlimitedRecord(value, { device } = {}) {
  if (value && typeof value.played === 'number') {
    const entry = readTally({ ...value, streak: value.currentStreak, at: 0 }, ['streak', 'maxStreak', 'at']);
    return { devices: entry && entry.played > 0 ? { [device]: entry } : {} };
  }
  return {
    devices: readMap(value?.devices, (entry) => readTally(entry, ['streak', 'maxStreak', 'at']), isDeviceKey),
  };
}

/**
 * Converts daily totals saved before per-puzzle history into a legacy tally
 * for this device. The last puzzle played becomes a real result when its
 * finished game is still saved, so it can't be counted again elsewhere.
 */
function migrateDailyTotals(totals, device, lastResult) {
  const legacy = readTally(
    { ...totals, streak: totals.currentStreak, streakEnd: totals.lastWonPuzzle ?? 0 },
    ['streak', 'streakEnd', 'maxStreak'],
  );
  if (!legacy) return emptyDailyRecord();
  const results = {};
  const last = lastResult && readResult(lastResult);
  const consistent =
    last &&
    lastResult.puzzle === totals.lastPuzzle &&
    legacy.played > 0 &&
    (!last.won || (legacy.won > 0 && legacy.distribution[last.guesses - 1] > 0));
  if (consistent) {
    results[lastResult.puzzle] = last;
    legacy.played -= 1;
    if (last.won) {
      legacy.won -= 1;
      legacy.distribution[last.guesses - 1] -= 1;
      if (legacy.streakEnd === lastResult.puzzle && legacy.streak > 0) {
        legacy.streak -= 1;
        legacy.streakEnd -= 1;
      }
    }
  }
  return { results, legacy: legacy.played > 0 ? { [device]: legacy } : {} };
}
