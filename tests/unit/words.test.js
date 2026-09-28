import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED, ANSWERS } from '../../js/words.js';

for (const [name, list] of [
  ['ANSWERS', ANSWERS],
  ['ALLOWED', ALLOWED],
]) {
  test(`${name} holds unique, sorted, five-letter lowercase words`, () => {
    assert.ok(list.length > 1000);
    const malformed = list.filter((word) => !/^[a-z]{5}$/.test(word));
    assert.deepEqual(malformed, []);
    assert.deepEqual(list, [...new Set(list)].sort());
  });
}

test('answers and extra allowed guesses do not overlap', () => {
  const answers = new Set(ANSWERS);
  assert.deepEqual(
    ALLOWED.filter((word) => answers.has(word)),
    [],
  );
});

test('answers exclude words removed during curation', () => {
  // Plurals, past tenses, slang contractions and offensive words.
  const removed = ['tapes', 'baked', 'teeth', 'gonna', 'lynch', 'slave', 'whore'];
  assert.deepEqual(
    removed.filter((word) => ANSWERS.includes(word)),
    [],
  );
});
