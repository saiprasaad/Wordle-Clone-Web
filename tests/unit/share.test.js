import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareText } from '../../js/share.js';

const base = {
  title: 'Voila #12',
  guesses: ['react', 'crane'],
  answer: 'crane',
  won: true,
  hardMode: false,
  highContrast: false,
  darkTheme: false,
};

test('shareText renders the score and an emoji grid', () => {
  assert.equal(shareText(base), 'Voila #12 2/6\n\n🟨🟨🟩🟨⬜\n🟩🟩🟩🟩🟩');
});

test('shareText matches the theme and high contrast colours', () => {
  const text = shareText({ ...base, darkTheme: true, highContrast: true });
  assert.equal(text, 'Voila #12 2/6\n\n🟦🟦🟧🟦⬛\n🟧🟧🟧🟧🟧');
});

test('shareText marks losses with X and hard mode with an asterisk', () => {
  const guesses = ['react', 'stomp', 'blink', 'fudge', 'whisk', 'gawky'];
  const text = shareText({ ...base, guesses, won: false, hardMode: true });
  assert.ok(text.startsWith('Voila #12 X/6*\n\n'));
  assert.equal(text.split('\n').length, 2 + guesses.length);
});

test('shareText appends the link when given', () => {
  const text = shareText({ ...base, url: 'https://example.com/wordle/' });
  assert.ok(text.endsWith('\n\nhttps://example.com/wordle/'));
});
