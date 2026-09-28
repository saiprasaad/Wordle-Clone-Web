import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateGuess,
  gameStatus,
  hardModeViolation,
  isAnswerWord,
  isValidWord,
  letterStates,
} from '../../js/game.js';

const C = 'correct';
const P = 'present';
const A = 'absent';

test('evaluateGuess marks exact, misplaced and missing letters', () => {
  assert.deepEqual(evaluateGuess('crane', 'crane'), [C, C, C, C, C]);
  assert.deepEqual(evaluateGuess('stomp', 'crane'), [A, A, A, A, A]);
  assert.deepEqual(evaluateGuess('react', 'crane'), [P, P, C, P, A]);
});

test('evaluateGuess never counts a duplicate letter more often than the answer has it', () => {
  // One E and one D in the answer: only the first E is present.
  assert.deepEqual(evaluateGuess('speed', 'abide'), [A, A, P, A, P]);
  // The only R is matched exactly, so the other Rs are absent.
  assert.deepEqual(evaluateGuess('error', 'crane'), [P, C, A, A, A]);
  // Exact matches claim letters before misplaced ones do.
  assert.deepEqual(evaluateGuess('lolly', 'hello'), [A, P, C, C, A]);
  // Both Es in the answer are found, the third E is not.
  assert.deepEqual(evaluateGuess('eerie', 'sheep'), [P, P, A, A, A]);
});

test('gameStatus detects wins and losses', () => {
  assert.equal(gameStatus([], 'crane'), 'playing');
  assert.equal(gameStatus(['slate', 'crane'], 'crane'), 'won');
  assert.equal(gameStatus(['a', 'b', 'c', 'd', 'e'], 'crane'), 'playing');
  assert.equal(gameStatus(['a', 'b', 'c', 'd', 'e', 'f'], 'crane'), 'lost');
  assert.equal(gameStatus(['a', 'b', 'c', 'd', 'e', 'crane'], 'crane'), 'won');
});

test('letterStates keeps the best state seen for each letter', () => {
  assert.deepEqual(letterStates(['error'], 'crane'), { e: P, r: C, o: A });
  // R upgrades from present to correct; a later absent duplicate never downgrades it.
  assert.deepEqual(letterStates(['react', 'error'], 'crane'), {
    r: C,
    e: P,
    a: C,
    c: P,
    t: A,
    o: A,
  });
});

test('hardModeViolation requires green letters to stay in place', () => {
  assert.equal(hardModeViolation('sword', ['brine'], 'crane'), 'Put R in the 2nd spot');
  assert.equal(hardModeViolation('crane', ['brine'], 'crane'), null);
});

test('hardModeViolation requires revealed letters to be reused', () => {
  assert.equal(hardModeViolation('blank', ['react'], 'crane'), 'Use R in your guess');
  assert.equal(hardModeViolation('acres', ['react'], 'crane'), 'Put A in the 3rd spot');
  assert.equal(hardModeViolation('chart', ['react'], 'crane'), 'Use E in your guess');
  assert.equal(hardModeViolation('spare', ['react'], 'crane'), 'Use C in your guess');
  assert.equal(hardModeViolation('crane', ['react'], 'crane'), null);
});

test('hardModeViolation counts duplicate letters that were revealed', () => {
  assert.equal(hardModeViolation('elbow', ['eerie'], 'sheep'), 'Use E twice in your guess');
  assert.equal(hardModeViolation('tepee', ['eerie'], 'sheep'), null);
});

test('hardModeViolation allows reusing letters known to be absent', () => {
  assert.equal(hardModeViolation('stomp', ['stomp'], 'crane'), null);
});

test('word validation accepts dictionary words only', () => {
  assert.equal(isValidWord('crane'), true);
  assert.equal(isValidWord('tares'), true);
  assert.equal(isValidWord('xxxxx'), false);
  assert.equal(isValidWord('CRANE'), false);
  assert.equal(isAnswerWord('crane'), true);
  assert.equal(isAnswerWord('tares'), false);
});
