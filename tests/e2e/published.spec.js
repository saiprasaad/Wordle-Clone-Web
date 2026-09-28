// The published game, with accounts switched on. Local copies (localhost) keep
// accounts off, so these tests serve the game under a stand-in domain instead.
// Requests for the Firebase SDK are blocked: the tests never reach Firebase.

import { expect, test } from '@playwright/test';
import { TODAY_ANSWER, guess, openGame, wrongWords } from './helpers.js';

const ORIGIN = 'http://voila.test:4173';

test.use({
  baseURL: `${ORIGIN}/`,
  contextOptions: { reducedMotion: 'reduce' },
  launchOptions: {
    args: [
      `--host-resolver-rules=MAP voila.test 127.0.0.1`,
      // Service workers and crypto.randomUUID need a secure context.
      `--unsafely-treat-insecure-origin-as-secure=${ORIGIN}`,
    ],
  },
});

test('offers sign-in, but only loads Firebase once a player reaches for it', async ({ page }) => {
  const sdkRequests = [];
  await page.route('https://www.gstatic.com/**', (route) => {
    sdkRequests.push(route.request().url());
    return route.abort();
  });

  await openGame(page, { play: false });
  await expect(page.locator('#splash-secondary')).toHaveText('Sign in');

  // Just playing never downloads Firebase.
  await page.locator('#splash-primary').click();
  await guess(page, wrongWords(TODAY_ANSWER, 1)[0]);
  await page.waitForLoadState('networkidle');
  expect(sdkRequests).toEqual([]);

  // Opening Settings gets sign-in ready, so its pop-up can open straight from the tap.
  await page.locator('#settings-button').click();
  await expect(page.locator('#sign-in-button')).toBeVisible();
  await expect.poll(() => sdkRequests.length).toBeGreaterThan(0);
});
