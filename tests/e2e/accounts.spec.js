// Sign-in and sync, run against the Firebase emulators (see firebase.json):
//   npm run emulators          # in one terminal
//   npm run test:e2e           # in another
// Without the emulators these tests are skipped.

import { expect, test } from '@playwright/test';
import { evaluateGuess } from '../../js/game.js';
import { ANSWERS } from '../../js/words.js';
import { guess, openGame, savedGame, tiles, toast } from './helpers.js';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

test.beforeAll(async () => {
  const running = await fetch('http://127.0.0.1:9099/')
    .then((response) => response.ok)
    .catch(() => false);
  test.skip(!running, 'Firebase emulators are not running (npm run emulators)');
});

/**
 * A fresh "device" with its own browser storage, playing against the emulators
 * as the given player. In emulator mode "Sign in with Google" uses a stand-in
 * Google identity instead of Google's sign-in window (see js/cloud/firebase.js).
 */
async function openDevice(browser, email) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const cspErrors = [];
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) cspErrors.push(message.text());
  });
  await page.addInitScript((identity) => {
    sessionStorage.setItem('wordle-clone:emulator-user', JSON.stringify(identity));
  }, { email, name: 'Test Player' });
  await openGame(page, { time: null, path: './?emulators' });
  return { page, context, cspErrors };
}

async function signIn(page) {
  await page.locator('#settings-button').click();
  await page.locator('#sign-in-button').click();
  await expect(page.locator('#account-status')).toHaveText('Your stats and progress are synced.');
  await expect(page.locator('#account-name')).toHaveText('Test Player');
  await page.keyboard.press('Escape');
}

const uniqueEmail = (testInfo) =>
  `player-${testInfo.workerIndex}-${testInfo.repeatEachIndex}-${Date.now()}@example.com`;

const todaysAnswer = (page) =>
  page.evaluate(() => import('./js/puzzle.js').then(({ dailyAnswer, puzzleNumber }) => dailyAnswer(puzzleNumber())));

const wrongWords = (answer) => ANSWERS.filter((word) => word !== answer).slice(0, 2);

test('progress and stats follow the player to another device', async ({ browser }, testInfo) => {
  const email = uniqueEmail(testInfo);
  const phone = await openDevice(browser, email);
  const answer = await todaysAnswer(phone.page);
  const [first, second] = wrongWords(answer);

  await guess(phone.page, first);
  await guess(phone.page, second);
  await signIn(phone.page);

  // A second device picks up the game in progress and finishes it.
  const laptop = await openDevice(browser, email);
  await signIn(laptop.page);
  for (const [row, word] of [first, second].entries()) {
    await expect(tiles(laptop.page, row).first()).toHaveAttribute('data-state', evaluateGuess(word, answer)[0]);
  }
  await guess(laptop.page, answer);
  await expect(laptop.page.locator('#stats-dialog')).toBeVisible();
  await expect(laptop.page.locator('#stat-played')).toHaveText('1');

  // Back on the phone, the finished puzzle and its stats have arrived.
  await expect(async () => {
    await phone.page.reload();
    await expect(phone.page.locator('#stats-dialog')).toBeVisible({ timeout: 2000 });
  }).toPass();
  await expect(phone.page.locator('#result-title')).toHaveText('Impressive!');
  await expect(phone.page.locator('#stat-played')).toHaveText('1');
  await expect(phone.page.locator('#stat-streak')).toHaveText('1');

  expect([...phone.cspErrors, ...laptop.cspErrors]).toEqual([]);
});

test('stats kept on two devices before signing in are added together', async ({ browser }, testInfo) => {
  const email = uniqueEmail(testInfo);
  const playUnlimitedWin = async (page) => {
    await page.locator('.mode-option', { hasText: 'Unlimited' }).click();
    const { answer } = await savedGame(page, 'unlimited');
    await guess(page, answer);
    await expect(page.locator('#stats-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
  };

  const phone = await openDevice(browser, email);
  await playUnlimitedWin(phone.page);
  await signIn(phone.page);

  const laptop = await openDevice(browser, email);
  await playUnlimitedWin(laptop.page);
  await signIn(laptop.page);
  await laptop.page.locator('#stats-button').click();
  await expect(laptop.page.locator('#stats-mode')).toHaveText('Unlimited');
  await expect(laptop.page.locator('#stat-played')).toHaveText('2');
  await expect(laptop.page.locator('#stat-win')).toHaveText('100');
});

test('signing out keeps progress, and deleting the account removes the cloud copy', async ({ browser }, testInfo) => {
  const email = uniqueEmail(testInfo);
  const phone = await openDevice(browser, email);
  const [first] = wrongWords(await todaysAnswer(phone.page));
  await signIn(phone.page);
  await guess(phone.page, first);

  await phone.page.locator('#settings-button').click();
  await phone.page.locator('#sign-out-button').click();
  await expect(toast(phone.page, 'Signed out')).toBeVisible();
  await expect(phone.page.locator('#sign-in-button')).toBeVisible();
  await phone.page.keyboard.press('Escape');
  await expect(tiles(phone.page, 0).first()).toHaveText(first[0]);

  await signIn(phone.page);
  await phone.page.locator('#settings-button').click();
  const deleteButton = phone.page.locator('#delete-account-button');
  await deleteButton.click();
  await expect(deleteButton).toHaveText(/Tap again/);
  await deleteButton.click();
  await expect(toast(phone.page, 'account and cloud data were deleted')).toBeVisible();
  await expect(phone.page.locator('#sign-in-button')).toBeVisible();

  // Signing in again starts a brand-new, empty account.
  const laptop = await openDevice(browser, email);
  await signIn(laptop.page);
  await expect(tiles(laptop.page, 0).first()).toHaveAttribute('data-state', 'empty');
});
