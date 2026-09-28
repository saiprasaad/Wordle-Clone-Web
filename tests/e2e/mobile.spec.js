import { expect, test } from '@playwright/test';
import { TODAY_ANSWER, TODAY_PUZZLE, expectScoredRow, openGame, wrongWords } from './helpers.js';

// Animations are skipped so guesses can be typed back to back.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

const [WRONG] = wrongWords(TODAY_ANSWER, 1);

async function tapWord(page, word) {
  for (const letter of word) await page.locator(`#keyboard [data-key="${letter}"]`).tap();
  await page.locator('#keyboard [data-key="enter"]').tap();
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 412, height: 915 },
]) {
  test(`fits a ${viewport.width}×${viewport.height} screen without scrolling`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openGame(page);
    const fits = await page.evaluate(() => {
      const root = document.documentElement;
      const keyboard = document.getElementById('keyboard').getBoundingClientRect();
      const board = document.getElementById('board').getBoundingClientRect();
      const tile = document.querySelector('#board .tile').getBoundingClientRect();
      return {
        horizontalScroll: root.scrollWidth > root.clientWidth,
        keyboardVisible: keyboard.bottom <= window.innerHeight + 0.5,
        boardAboveKeyboard: board.bottom <= keyboard.top,
        squareTiles: Math.abs(tile.width - tile.height) < 2,
        tileSize: tile.width,
      };
    });
    expect(fits).toMatchObject({
      horizontalScroll: false,
      keyboardVisible: true,
      boardAboveKeyboard: true,
      squareTiles: true,
    });
    expect(fits.tileSize).toBeGreaterThan(30);
  });
}

test('the welcome screen fits a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openGame(page, { play: false });
  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const content = document.querySelector('.splash-content').getBoundingClientRect();
    const play = document.getElementById('splash-primary').getBoundingClientRect();
    return {
      horizontalScroll: root.scrollWidth > root.clientWidth,
      fitsWidth: content.left >= 0 && content.right <= window.innerWidth,
      playVisible: play.bottom <= window.innerHeight,
    };
  });
  expect(layout).toEqual({ horizontalScroll: false, fitsWidth: true, playVisible: true });
  await page.locator('#splash-primary').tap();
  await expect(page.locator('#splash')).toBeHidden();
});

test('puts the board beside the keyboard on a sideways phone', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await openGame(page);
  const layout = await page.evaluate(() => {
    const board = document.getElementById('board').getBoundingClientRect();
    const keyboard = document.getElementById('keyboard').getBoundingClientRect();
    const tile = document.querySelector('#board .tile').getBoundingClientRect();
    return {
      sideBySide: board.right <= keyboard.left,
      fitsHeight: board.bottom <= window.innerHeight && keyboard.bottom <= window.innerHeight,
      tileSize: tile.width,
    };
  });
  expect(layout).toMatchObject({ sideBySide: true, fitsHeight: true });
  expect(layout.tileSize).toBeGreaterThan(36);
});

test('plays by tapping the on-screen keyboard', async ({ page }) => {
  await openGame(page);
  await tapWord(page, WRONG);
  await expectScoredRow(page, 0, WRONG, TODAY_ANSWER);
});

test('shares through the native share sheet on touch screens', async ({ page }) => {
  await page.addInitScript(() => {
    window.sharedText = null;
    navigator.share = async ({ text }) => {
      window.sharedText = text;
    };
  });
  await openGame(page);
  await tapWord(page, TODAY_ANSWER);
  await page.locator('#share-button').tap();
  await expect.poll(() => page.evaluate(() => window.sharedText)).toContain(
    `Wordle Clone #${TODAY_PUZZLE} 1/6`,
  );
});
