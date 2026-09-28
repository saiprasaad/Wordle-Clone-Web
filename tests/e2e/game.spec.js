import { expect, test } from '@playwright/test';
import { evaluateGuess, hardModeViolation } from '../../js/game.js';
import { ANSWERS } from '../../js/words.js';
import {
  TODAY_ANSWER,
  TODAY_PUZZLE,
  expectScoredRow,
  guess,
  openGame,
  savedGame,
  startPlaying,
  tiles,
  toast,
  wrongWords,
} from './helpers.js';

// Animations are skipped so guesses can be typed back to back.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

const [FIRST_WRONG, SECOND_WRONG] = wrongWords(TODAY_ANSWER, 2);

const modeOption = (page, name) => page.locator('.mode-option', { hasText: name });

test('wins the daily puzzle with the physical keyboard', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('#puzzle-number')).toHaveText(`#${TODAY_PUZZLE}`);

  await guess(page, FIRST_WRONG);
  await expectScoredRow(page, 0, FIRST_WRONG, TODAY_ANSWER);
  const firstLetterState = evaluateGuess(FIRST_WRONG, TODAY_ANSWER)[0];
  await expect(page.locator(`#keyboard [data-key="${FIRST_WRONG[0]}"]`)).toHaveAttribute(
    'data-state',
    firstLetterState,
  );

  await guess(page, TODAY_ANSWER);
  await expectScoredRow(page, 1, TODAY_ANSWER, TODAY_ANSWER);
  await expect(toast(page, 'Brilliant')).toBeVisible();

  const stats = page.locator('#stats-dialog');
  await expect(stats).toBeVisible();
  await expect(stats.locator('#result-title')).toHaveText('Brilliant!');
  await expect(stats.locator('#answer-tiles')).toHaveText(TODAY_ANSWER.toUpperCase());
  await expect(stats.locator('#stat-played')).toHaveText('1');
  await expect(stats.locator('#stat-win')).toHaveText('100');
  await expect(stats.locator('#stat-streak')).toHaveText('1');
  await expect(stats.locator('.distribution-bar[data-highlight]')).toHaveCount(1);
  await expect(stats.locator('.distribution li').nth(1).locator('[data-highlight]')).toHaveCount(1);
  await expect(stats.locator('#countdown-time')).toHaveText('12:00:00');
});

test('shares a spoiler-free grid to the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openGame(page);
  await guess(page, FIRST_WRONG);
  await guess(page, TODAY_ANSWER);
  await page.locator('#share-button').click();
  await expect(toast(page, 'Copied results to clipboard')).toBeVisible();

  const text = await page.evaluate(() => navigator.clipboard.readText());
  const lines = text.split('\n');
  expect(lines[0]).toBe(`Voila #${TODAY_PUZZLE} 2/6`);
  expect(lines[3]).toBe('🟩🟩🟩🟩🟩');
  expect(text).not.toContain(TODAY_ANSWER);
  expect(lines.at(-1)).toBe('http://localhost:4173/');
});

test('rejects short and unknown words', async ({ page }) => {
  await openGame(page);
  await guess(page, 'cra');
  await expect(toast(page, 'Needs five letters')).toBeVisible();

  await guess(page, 'zq');
  await expect(toast(page, 'Not a word we know')).toBeVisible();
  await expect(tiles(page, 0).nth(4)).toHaveText('q');
  await expect(tiles(page, 0).first()).toHaveAttribute('data-state', 'tbd');

  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(tiles(page, 0).nth(3)).toHaveAttribute('data-state', 'empty');
  expect(await savedGame(page, 'daily')).toBeNull();
});

test('reveals the answer after six misses and records the loss', async ({ page }) => {
  await openGame(page);
  for (const word of wrongWords(TODAY_ANSWER, 6)) await guess(page, word);

  await expect(toast(page, TODAY_ANSWER.toUpperCase())).toBeVisible();
  const stats = page.locator('#stats-dialog');
  await expect(stats).toBeVisible();
  await expect(stats.locator('#result-title')).toHaveText('The word was');
  await expect(stats.locator('#answer-tiles')).toHaveText(TODAY_ANSWER.toUpperCase());
  await expect(stats.locator('#stat-played')).toHaveText('1');
  await expect(stats.locator('#stat-win')).toHaveText('0');
  await expect(stats.locator('#stat-streak')).toHaveText('0');
});

test('keeps progress after a reload and reopens the result', async ({ page }) => {
  await openGame(page);
  await guess(page, FIRST_WRONG);
  await guess(page, SECOND_WRONG);
  await page.keyboard.type('ab');
  await page.reload();
  await startPlaying(page);

  await expectScoredRow(page, 0, FIRST_WRONG, TODAY_ANSWER);
  await expectScoredRow(page, 1, SECOND_WRONG, TODAY_ANSWER);
  await expect(tiles(page, 2).first()).toHaveAttribute('data-state', 'empty');

  await guess(page, TODAY_ANSWER);
  await expect(page.locator('#stats-dialog')).toBeVisible();
  await page.reload();
  // A finished daily puzzle offers its result from the welcome screen.
  await expect(page.locator('#splash-primary')).toHaveText('See stats');
  await startPlaying(page);
  await expect(page.locator('#stats-dialog')).toBeVisible();
  await expect(page.locator('#result-title')).toHaveText('Excellent!');
});

test('the on-screen keyboard types, deletes and submits', async ({ page }) => {
  await openGame(page);
  const key = (name) => page.locator(`#keyboard [data-key="${name}"]`);
  for (const letter of `${FIRST_WRONG.slice(0, 4)}x`) await key(letter).click();
  await key('backspace').click();
  await key(FIRST_WRONG[4]).click();
  await key('enter').click();
  await expectScoredRow(page, 0, FIRST_WRONG, TODAY_ANSWER);
});

test('Enter still submits after using a dialog with the mouse', async ({ page }) => {
  await openGame(page);
  await page.keyboard.type(FIRST_WRONG);
  await page.locator('#stats-button').click();
  await expect(page.locator('#stats-dialog')).toBeVisible();
  await page.locator('#stats-dialog [data-close]').click();
  await expect(page.locator('#stats-dialog')).toBeHidden();

  await page.keyboard.press('Enter');
  await expectScoredRow(page, 0, FIRST_WRONG, TODAY_ANSWER);
  await expect(page.locator('#stats-dialog')).toBeHidden();
});

test('dialogs close with Escape and with a click on the backdrop', async ({ page }) => {
  await openGame(page);
  await page.locator('#help-button').click();
  await expect(page.locator('#help-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#help-dialog')).toBeHidden();

  await page.locator('#settings-button').click();
  await expect(page.locator('#settings-dialog')).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(page.locator('#settings-dialog')).toBeHidden();
});

test('keyboard users get focus back on the button that opened a dialog', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('Tab');
  await expect(page.locator('#help-button')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#help-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#help-button')).toBeFocused();
});

test('hard mode makes revealed hints mandatory', async ({ page }) => {
  await openGame(page);
  await page.locator('#settings-button').click();
  await page.locator('label:has(#hard-mode)').click();
  await expect(page.locator('#hard-mode')).toBeChecked();
  await page.keyboard.press('Escape');

  const opener = ANSWERS.find(
    (word) => word !== TODAY_ANSWER && evaluateGuess(word, TODAY_ANSWER).includes('correct'),
  );
  const cheat = ANSWERS.find(
    (word) => word !== TODAY_ANSWER && hardModeViolation(word, [opener], TODAY_ANSWER) !== null,
  );
  await guess(page, opener);
  await guess(page, cheat);
  await expect(toast(page, hardModeViolation(cheat, [opener], TODAY_ANSWER))).toBeVisible();
  await expect(tiles(page, 1).first()).toHaveAttribute('data-state', 'tbd');

  for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace');
  await guess(page, TODAY_ANSWER);
  await expect(page.locator('#stats-dialog')).toBeVisible();

  await page.locator('#stats-dialog [data-close]').click();
  const context = page.context();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('#stats-button').click();
  await page.locator('#share-button').click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text.split('\n')[0]).toBe(`Voila #${TODAY_PUZZLE} 2/6*`);
});

test('hard mode cannot be switched on partway through a round', async ({ page }) => {
  await openGame(page);
  await guess(page, FIRST_WRONG);
  await page.locator('#settings-button').click();
  await page.locator('label:has(#hard-mode)').click();
  await expect(toast(page, 'Turn on Hard Mode before your first guess')).toBeVisible();
  await expect(page.locator('#hard-mode')).not.toBeChecked();
});

test('unlimited mode serves new words and allows giving up', async ({ page }) => {
  await openGame(page);
  await modeOption(page, 'Unlimited').click();
  await expect(page.locator('#new-word-button')).toBeVisible();

  await guess(page, FIRST_WRONG);
  const { answer } = await savedGame(page, 'unlimited');
  expect(answer).not.toBe(TODAY_ANSWER);
  if (answer !== FIRST_WRONG) await guess(page, answer);

  const stats = page.locator('#stats-dialog');
  await expect(stats).toBeVisible();
  await expect(stats.locator('#stats-mode')).toHaveText('Unlimited');
  await expect(stats.locator('#countdown')).toBeHidden();
  await stats.locator('#play-button').click();
  await expect(stats).toBeHidden();
  await expect(tiles(page, 0).first()).toHaveAttribute('data-state', 'empty');

  // Give up: the first press arms the button, the second reveals the word.
  await guess(page, FIRST_WRONG);
  const second = await savedGame(page, 'unlimited');
  expect(second.answer).not.toBe(answer);
  test.skip(second.answer === FIRST_WRONG, 'Random word matched the guess');
  await page.locator('#new-word-button').click();
  await expect(toast(page, 'Press again to give up')).toBeVisible();
  await page.locator('#new-word-button').click();
  await expect(stats).toBeVisible();
  await expect(stats.locator('#result-title')).toHaveText('The word was');
  await expect(stats.locator('#answer-tiles')).toHaveText(second.answer.toUpperCase());
  await expect(stats.locator('#stat-played')).toHaveText('2');
  await expect(stats.locator('#stat-win')).toHaveText('50');
});

test('each mode keeps its own board and typed letters', async ({ page }) => {
  await openGame(page);
  await guess(page, FIRST_WRONG);
  await page.keyboard.type('ab');
  await modeOption(page, 'Unlimited').click();
  await expect(tiles(page, 0).first()).toHaveAttribute('data-state', 'empty');

  await modeOption(page, 'Daily').click();
  await expectScoredRow(page, 0, FIRST_WRONG, TODAY_ANSWER);
  await expect(tiles(page, 1).nth(1)).toHaveText('b');
});

test('shows the help on the first visit only', async ({ page }) => {
  await openGame(page, { seenHelp: false });
  await expect(page.locator('#help-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await startPlaying(page);
  await expect(page.locator('#help-dialog')).toBeHidden();
});

test('theme settings apply at once and persist', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openGame(page);
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-theme', 'light');

  await page.locator('#settings-button').click();
  await page.locator('label:has(#dark-theme)').click();
  await page.locator('label:has(#high-contrast)').click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(root).toHaveAttribute('data-contrast', 'high');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#121213');

  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(root).toHaveAttribute('data-contrast', 'high');
});

test('follows the system color scheme until the player picks one', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openGame(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('screen readers hear each scored guess', async ({ page }) => {
  await openGame(page);
  await guess(page, FIRST_WRONG);
  const states = evaluateGuess(FIRST_WRONG, TODAY_ANSWER);
  const labels = { correct: 'correct', present: 'in the word, wrong spot', absent: 'not in the word' };
  await expect(tiles(page, 0).first()).toHaveAttribute(
    'aria-label',
    `1st letter, ${FIRST_WRONG[0].toUpperCase()}, ${labels[states[0]]}`,
  );
  await expect(page.locator('body > [data-announcer]')).toContainText(
    `${FIRST_WRONG.toUpperCase()}: ${FIRST_WRONG[0].toUpperCase()} ${labels[states[0]]}`,
  );
});

test('other open tabs stay in sync', async ({ page, context }) => {
  await openGame(page);
  const other = await context.newPage();
  await openGame(other);
  await guess(page, FIRST_WRONG);
  await expectScoredRow(other, 0, FIRST_WRONG, TODAY_ANSWER);
});

test('moves on to the next puzzle at midnight', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-05T23:59:30-04:00') });
  await openGame(page, { time: null, play: false });
  await expect(page.locator('#splash-number')).toHaveText(`No. ${TODAY_PUZZLE}`);
  await page.clock.fastForward('01:00');
  await expect(page.locator('#splash-number')).toHaveText(`No. ${TODAY_PUZZLE + 1}`);
  await expect(page.locator('#splash-date')).toHaveText('October 6, 2026');
  await startPlaying(page);
  await expect(page.locator('#puzzle-number')).toHaveText(`#${TODAY_PUZZLE + 1}`);
});

test('works offline after the first visit', async ({ page, context }) => {
  await openGame(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await startPlaying(page);
  await guess(page, FIRST_WRONG);
  await expectScoredRow(page, 0, FIRST_WRONG, TODAY_ANSWER);
  // The definition lookup fails quietly and leaves a dictionary link.
  await guess(page, TODAY_ANSWER);
  await expect(page.locator('#definition a')).toHaveText(/Wiktionary/);
});

test.describe('welcome screen', () => {
  test("introduces today's puzzle and holds the game until Play", async ({ page }) => {
    await openGame(page, { play: false });
    await expect(page.locator('#splash-message')).toHaveText(/^Find the hidden five-/);
    await expect(page.locator('#splash-date')).toHaveText('October 5, 2026');
    await expect(page.locator('#splash-number')).toHaveText(`No. ${TODAY_PUZZLE}`);
    // No sign-in in local copies without the emulators, and nothing else to offer yet.
    await expect(page.locator('#splash-secondary')).toBeHidden();

    await page.keyboard.type('abc');
    await page.keyboard.press('Enter');
    await expect(page.locator('#splash')).toBeHidden();
    await expect(tiles(page, 0).first()).toHaveAttribute('data-state', 'empty');
    await guess(page, FIRST_WRONG);
    await expectScoredRow(page, 0, FIRST_WRONG, TODAY_ANSWER);
  });

  test('picks up a puzzle in progress', async ({ page }) => {
    await openGame(page);
    await guess(page, FIRST_WRONG);
    await page.reload();
    await expect(page.locator('#splash-message')).toHaveText("1 guess down, 5 to go. You've got this.");
    await expect(page.locator('#splash-primary')).toHaveText('Continue');
    await startPlaying(page);
    await expectScoredRow(page, 0, FIRST_WRONG, TODAY_ANSWER);
  });

  test('offers Unlimited once the daily puzzle is done', async ({ page }) => {
    await openGame(page);
    for (const word of wrongWords(TODAY_ANSWER, 6)) await guess(page, word);
    await expect(page.locator('#stats-dialog')).toBeVisible();
    await page.reload();
    await expect(page.locator('#splash-message')).toHaveText('Not this time. A new word arrives at midnight.');
    await expect(page.locator('#splash-primary')).toHaveText('See stats');

    await page.locator('#splash-secondary', { hasText: 'Play Unlimited' }).click();
    await expect(page.locator('#splash')).toBeHidden();
    await expect(page.locator('#mode-switch input[value="unlimited"]')).toBeChecked();
    await expect(page.locator('#new-word-button')).toBeVisible();
  });

  test('explains the rules without leaving', async ({ page }) => {
    await openGame(page, { seenHelp: false, play: false });
    await page.locator('#splash-help').click();
    await expect(page.locator('#help-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#splash')).toBeVisible();
    // Having read the rules, the player isn't shown them again.
    await startPlaying(page);
    await expect(page.locator('#help-dialog')).toBeHidden();
  });
});

test.describe('with animations', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test('ignores typing while a guess is being revealed', async ({ page }) => {
    await openGame(page);
    await guess(page, FIRST_WRONG);
    await expect(page.locator('#mode-switch input').first()).toBeDisabled();
    await page.keyboard.type('abc');
    await expectScoredRow(page, 0, FIRST_WRONG, TODAY_ANSWER);
    await expect(page.locator('#mode-switch input').first()).toBeEnabled();
    await expect(tiles(page, 1).first()).toHaveAttribute('data-state', 'empty');
    await page.keyboard.type('abc');
    await expect(tiles(page, 1).nth(2)).toHaveText('c');
  });
});
