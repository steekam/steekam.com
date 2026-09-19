import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import entries from '../src/components/art-game/artwork-data.json' with { type: 'json' };

mkdirSync('review-artifacts', { recursive: true });
const shot = (page, name) => page.screenshot({ path: `review-artifacts/${name}`, fullPage: true });

const startGame = async (page) => {
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('screen-play')).toBeVisible();
};

const finishGame = async (page, correctRounds = entries.length) => {
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const choice = index < correctRounds ? entry.correctChoice : (entry.correctChoice + 1) % entry.choices.length;
    await page.getByTestId(`answer-option-${choice}`).click();
    await page.getByTestId('next-round').click();
  }
  await expect(page.getByTestId('screen-complete')).toBeVisible();
};

test.describe('Horsin’ Around With Art', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects/horsin-around-with-art');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('renders deterministic desktop intro and question', async ({ page }) => {
    await expect(page).toHaveTitle(/Horsin/);
    await expect(page.getByTestId('screen-intro')).toBeVisible();
    await shot(page, 'art-game-desktop-intro.png');
    await startGame(page);
    await expect(page.getByTestId('round-label')).toHaveText('Round 01 / 08');
    await shot(page, 'art-game-desktop-question.png');
  });

  test('locks an answer, reveals the reference, and persists across reload', async ({ page }) => {
    await startGame(page);
    await page.getByTestId('answer-option-1').click();
    await expect(page.getByTestId('reveal-panel')).toBeVisible();
    await expect(page.getByTestId('answer-option-1')).toBeDisabled();
    await expect(page.getByTestId('answer-status')).toContainText('Not this time');
    await shot(page, 'art-game-desktop-reveal.png');
    await page.reload();
    await expect(page.getByTestId('reveal-panel')).toBeVisible();
    await expect(page.getByTestId('answer-status')).toContainText('Not this time');
  });

  test('completes all rounds, fills the wall, and supports replay', async ({ page }) => {
    await startGame(page);
    await finishGame(page);
    const wall = page.getByTestId('gallery-wall');
    await expect(wall.locator('figure')).toHaveCount(8);
    const firstCaption = wall.locator('figure').first().locator('figcaption');
    await expect(firstCaption).toHaveCSS('display', 'flex');
    await expect(firstCaption).toHaveText(/01\s·\sDavid Hockney/);
    await expect(wall.locator('figure').first().locator('img')).toHaveCSS('object-fit', 'contain');
    const captionStyle = await firstCaption.evaluate((element) => getComputedStyle(element).color);
    const [red, green, blue] = captionStyle.match(/\d+/g).map(Number);
    expect((red + green + blue) / 3).toBeGreaterThan(180);
    await shot(page, 'art-game-desktop-gallery.png');
    await page.getByTestId('replay-game').click();
    await expect(page.getByTestId('screen-play')).toBeVisible();
    await expect(page.getByTestId('score')).toHaveText('0');
  });

  test('returns all four curator score bands', async ({ page }) => {
    await startGame(page);
    for (const [score, title] of [[0, 'Todd wandered'], [3, 'Hollywoo gallery'], [5, 'Princess Carolyn'], [7, 'Diane wrote']]) {
      if (score > 0) await page.getByTestId('replay-game').click();
      await finishGame(page, score);
      await expect(page.getByTestId('final-result')).toContainText(title);
    }
  });

  test('shows the missing-image fallback', async ({ page }) => {
    await startGame(page);
    await page.getByTestId('scene-image').evaluate((image) => { image.src = '/images/horsin-around-with-art/missing.svg'; });
    await expect(page.getByTestId('scene-fallback')).toBeVisible();
    await expect(page.getByTestId('scene-image')).toBeHidden();
  });

  test('shows reveal-image fallbacks without losing attribution text', async ({ page }) => {
    await startGame(page);
    await page.getByTestId(`answer-option-${entries[0].correctChoice}`).click();
    await page.getByTestId('reveal-scene-image').evaluate((image) => { image.src = '/images/horsin-around-with-art/missing-scene.svg'; });
    await page.getByTestId('reveal-art-image').evaluate((image) => { image.src = '/images/horsin-around-with-art/missing-art.svg'; });
    await expect(page.getByTestId('reveal-scene-fallback')).toBeVisible();
    await expect(page.getByTestId('reveal-art-fallback')).toBeVisible();
    await expect(page.getByTestId('sources')).toContainText('Christie');
  });

  test('resets malformed persisted state safely', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('steekam-horsin-around-art-v1', JSON.stringify({ started: true, index: 999, score: 999, selected: 999, revealed: true, completed: ['bad', 999] })));
    await page.reload();
    await expect(page.getByTestId('screen-intro')).toBeVisible();
    await expect(page.getByTestId('screen-play')).toBeHidden();
  });

  test('focuses completion result and first answer after replay', async ({ page }) => {
    await startGame(page);
    await finishGame(page);
    await expect(page.getByTestId('final-result')).toBeFocused();
    await page.getByTestId('replay-game').click();
    await expect(page.getByTestId('answer-option-0')).toBeFocused();
  });

  test('supports reduced motion and keyboard-only progression', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.getByTestId('start-game').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('answer-option-0')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('reveal-panel')).toBeVisible();
    await expect(page.getByTestId('next-round')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('round-label')).toHaveText('Round 02 / 08');
    const reducedMotion = await page.evaluate(() => ({
      matches: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      transition: getComputedStyle(document.querySelector('[data-art-game] .art-game__button')).transitionDuration,
    }));
    expect(reducedMotion.matches).toBe(true);
    expect(parseFloat(reducedMotion.transition)).toBeLessThan(0.001);
  });

  test('renders mobile question, reveal, and complete states', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await startGame(page);
    await shot(page, 'art-game-mobile-question.png');
    await page.getByTestId(`answer-option-${entries[0].correctChoice}`).click();
    await shot(page, 'art-game-mobile-reveal.png');
    await page.getByTestId('next-round').click();
    for (let index = 1; index < entries.length; index += 1) {
      await page.getByTestId(`answer-option-${entries[index].correctChoice}`).click();
      await page.getByTestId('next-round').click();
    }
    await expect(page.getByTestId('screen-complete')).toBeVisible();
    await shot(page, 'art-game-mobile-complete.png');
  });

  test('has no page errors or console errors across game and existing routes', async ({ page, request }) => {
    const browserErrors = [];
    page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`); });
    await startGame(page);
    await page.getByTestId(`answer-option-${entries[0].correctChoice}`).click();
    await page.getByTestId('next-round').click();
    for (const route of ['/', '/projects', '/topics', '/a-love-letter-to-react-native-audio-api/']) {
      const response = await request.get(route);
      expect(response.status(), route).toBe(200);
    }
    expect(browserErrors).toEqual([]);
  });
});
