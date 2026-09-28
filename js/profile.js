// A player's saved progress as one document, and how two copies of it merge.
// Signed-in players sync it between devices. Pure functions only.

import { MAX_GUESSES, gameStatus, isValidWord } from './game.js';
import { mergeDaily, mergeUnlimited, readDailyRecord, readUnlimitedRecord } from './stats.js';

export const PROFILE_SCHEMA = 1;

/**
 * Combines two copies of a profile. Nothing a player has finished is lost:
 * results and tallies are unioned, and for games in progress the one with the
 * most progress wins. Settings follow the most recent change.
 */
export function mergeProfiles(a, b) {
  return {
    schema: PROFILE_SCHEMA,
    settings: newest(a.settings, b.settings),
    daily: mergeDaily(a.daily, b.daily),
    unlimited: mergeUnlimited(a.unlimited, b.unlimited),
    games: {
      daily: mergeDailyGames(a.games.daily, b.games.daily),
      unlimited: mergeUnlimitedGames(a.games.unlimited, b.games.unlimited),
    },
  };
}

function mergeDailyGames(a, b) {
  if (!a || !b) return a ?? b;
  if (a.puzzle !== b.puzzle) return a.puzzle > b.puzzle ? a : b;
  if (isOver(a) !== isOver(b)) return isOver(a) ? a : b;
  // Both finished: the earlier finish, matching the result that counts.
  if (isOver(a)) return newest(b, a) === a ? b : a;
  if (a.guesses.length !== b.guesses.length) return a.guesses.length > b.guesses.length ? a : b;
  return newest(a, b);
}

function mergeUnlimitedGames(a, b) {
  if (!a || !b) return a ?? b;
  // A round in progress beats a word that was dealt but not started elsewhere.
  if (isStarted(a) !== isStarted(b)) return isStarted(a) ? a : b;
  return newest(a, b);
}

function isOver(game) {
  return game.gaveUp || gameStatus(game.guesses, game.answer) !== 'playing';
}

function isStarted(game) {
  return game.guesses.length > 0 && !isOver(game);
}

/** The more recently changed of two values; ties are broken by content so all devices agree. */
function newest(a, b) {
  if (!a || !b) return a ?? b;
  if ((a.at ?? 0) !== (b.at ?? 0)) return (a.at ?? 0) > (b.at ?? 0) ? a : b;
  return stableStringify(a) >= stableStringify(b) ? a : b;
}

export function sameProfile(a, b) {
  return stableStringify(a) === stableStringify(b);
}

/** JSON with object keys sorted, so equal data always compares equal. */
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

// ---------- Reading saved data ----------

const isTime = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** A saved game, checked because it comes from storage or the network. */
export function readGame(value, { daily }) {
  if (!value || typeof value.answer !== 'string' || !isValidWord(value.answer)) return null;
  const { guesses } = value;
  if (!Array.isArray(guesses) || guesses.length > MAX_GUESSES) return null;
  if (!guesses.every((guess) => typeof guess === 'string' && isValidWord(guess))) return null;
  const winningGuess = guesses.indexOf(value.answer);
  if (winningGuess !== -1 && winningGuess !== guesses.length - 1) return null;
  if (daily && !(Number.isInteger(value.puzzle) && value.puzzle >= 1)) return null;
  return {
    puzzle: daily ? value.puzzle : null,
    answer: value.answer,
    guesses: [...guesses],
    hardMode: value.hardMode === true,
    gaveUp: !daily && value.gaveUp === true,
    at: isTime(value.at) ? value.at : 0,
  };
}

export function readSettings(value) {
  return {
    hardMode: value?.hardMode === true,
    highContrast: value?.highContrast === true,
    at: isTime(value?.at) ? value.at : 0,
  };
}

/** Reads a profile from the cloud, dropping anything malformed. */
export function readProfile(value, { device }) {
  return {
    schema: PROFILE_SCHEMA,
    settings: readSettings(value?.settings),
    daily: readDailyRecord(value?.daily, { device }),
    unlimited: readUnlimitedRecord(value?.unlimited, { device }),
    games: {
      daily: readGame(value?.games?.daily, { daily: true }),
      unlimited: readGame(value?.games?.unlimited, { daily: false }),
    },
  };
}
