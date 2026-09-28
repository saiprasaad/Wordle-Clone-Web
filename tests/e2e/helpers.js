import { expect } from '@playwright/test';
import { evaluateGuess } from '../../js/game.js';
import { dailyAnswer } from '../../js/puzzle.js';
import { ANSWERS } from '../../js/words.js';

// Noon on 5 October 2026 in the test time zone (America/New_York) is puzzle #8.
export const TODAY = new Date('2026-10-05T12:00:00-04:00');
export const TODAY_PUZZLE = 8;
export const TODAY_ANSWER = dailyAnswer(TODAY_PUZZLE);

/**
 * Opens the game at a fixed date (or the real one when `time` is null),
 * skipping the first-visit help by default. Presses Play on the welcome
 * screen unless `play` is false.
 */
export async function openGame(page, { seenHelp = true, time = TODAY, path = './', play = true } = {}) {
  if (time) await page.clock.setFixedTime(time);
  if (seenHelp) {
    await page.addInitScript(() => localStorage.setItem('wordle-clone:seen-help', 'true'));
  }
  await page.goto(path);
  await expect(page.locator('#board .tile')).toHaveCount(30);
  if (play) await startPlaying(page);
}

/** Leaves the welcome screen with its main button: Play, Continue or See stats. */
export async function startPlaying(page) {
  await page.locator('#splash-primary').click();
  await expect(page.locator('#splash')).toBeHidden();
}

export async function guess(page, word) {
  await page.keyboard.type(word);
  await page.keyboard.press('Enter');
}

export function tiles(page, row) {
  return page.locator('#board .row').nth(row).locator('.tile');
}

/** Asserts that `row` shows `word` scored against `answer`. */
export async function expectScoredRow(page, row, word, answer) {
  const states = evaluateGuess(word, answer);
  const cells = tiles(page, row);
  for (let i = 0; i < word.length; i++) {
    await expect(cells.nth(i)).toHaveText(word[i]);
    await expect(cells.nth(i)).toHaveAttribute('data-state', states[i]);
  }
}

/** Valid answer words other than `answer`, for deliberately wrong guesses. */
export function wrongWords(answer, count, filter = () => true) {
  return ANSWERS.filter((word) => word !== answer && filter(word)).slice(0, count);
}

export function toast(page, text) {
  return page.locator('#toaster .toast', { hasText: text });
}

export async function savedGame(page, mode) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), `wordle-clone:game:${mode}`);
}
