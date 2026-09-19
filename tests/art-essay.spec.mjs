import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import chapters from '../src/components/art-essay/story-data.json' with { type: 'json' };

mkdirSync('review-artifacts', { recursive: true });
const shot = (page, name) => page.screenshot({ path: `review-artifacts/${name}`, fullPage: true });

test.describe('The Art in the Background', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects/horsin-around-with-art');
  });

  test('renders the visual thesis and chapter index', async ({ page }) => {
    await expect(page).toHaveTitle(/The Art in the Background/);
    await expect(page.getByTestId('essay-hero')).toBeVisible();
    await expect(page.getByRole('heading', { name: /The art in the background/i })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Essay chapters' })).toBeVisible();
    await expect(page.locator('[data-testid="essay-hero"] img').first()).toHaveJSProperty('naturalWidth', 1440);
    await shot(page, 'art-essay-desktop-hero.png');
  });

  test('renders five real scene/art pairs and source links', async ({ page }) => {
    await expect(page.locator('[data-chapter]')).toHaveCount(5);
    for (const chapter of chapters) {
      const section = page.locator(`[data-chapter="${chapter.id}"]`);
      await expect(section).toBeVisible();
      await section.scrollIntoViewIfNeeded();
      await expect.poll(() => section.locator('img').first().evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
      await expect.poll(() => section.locator('img').nth(1).evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
      await expect(section.getByRole('heading')).toContainText(chapter.title);
      await expect(section.getByRole('navigation')).toContainText('Sources');
      await expect(section.locator('a[target="_blank"]')).toHaveCount(chapter.sources.length);
    }
    await shot(page, 'art-essay-desktop-chapters.png');
  });

  test('switches to an image-led gallery without eyebrow labels', async ({ page }) => {
    await expect(page.locator('.essay-overline')).toHaveCount(0);
    await page.getByRole('button', { name: 'Gallery' }).click();
    await expect(page.locator('[data-gallery]')).toBeVisible();
    await expect(page.locator('[data-gallery-item]')).toHaveCount(5);
    await expect(page.locator('.essay-chapters')).toBeHidden();
    await expect(page.locator('[data-gallery-item]').first().locator('img')).toHaveCount(2);
    await expect.poll(() => page.locator('[data-gallery-item] img').evaluateAll((images) => images.every((image) => image.naturalWidth > 0))).toBe(true);
    await shot(page, 'art-essay-gallery.png');
    await page.getByRole('button', { name: /Open details for Venus walks into a restaurant/i }).click();
    const dialog = page.locator('[data-art-dialog="botticelli-venus"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /Venus walks into a restaurant/i })).toBeVisible();
    await expect(dialog.locator('img')).toHaveCount(2);
    await page.screenshot({ path: 'review-artifacts/art-essay-gallery-dialog.png', fullPage: false });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('gallery seam responds to pointer movement and backdrop closes the dialog', async ({ page }) => {
    await page.getByRole('button', { name: 'Gallery' }).click();
    const pair = page.locator('[data-seam-pair]').first();
    await pair.scrollIntoViewIfNeeded();
    const before = await pair.evaluate((node) => getComputedStyle(node).getPropertyValue('--gallery-seam'));
    const box = await pair.boundingBox();
    await page.mouse.move(box.x + box.width * .82, box.y + box.height * .5);
    await expect.poll(() => pair.evaluate((node) => getComputedStyle(node).getPropertyValue('--gallery-seam'))).not.toBe(before);
    await page.getByRole('button', { name: /Open details for Venus walks into a restaurant/i }).click();
    const dialog = page.locator('[data-art-dialog="botticelli-venus"]');
    await dialog.click({ position: { x: 4, y: 4 } });
    await expect(dialog).toBeHidden();
  });

  test('crossfades scene into artwork as a chapter moves through the viewport', async ({ page }) => {
    const chapter = page.locator('[data-chapter]').nth(1);
    await chapter.scrollIntoViewIfNeeded();
    const initialReveal = await chapter.evaluate((node) => getComputedStyle(node).getPropertyValue('--reveal'));
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(80);
    const nextReveal = await chapter.evaluate((node) => getComputedStyle(node).getPropertyValue('--reveal'));
    expect(Number(nextReveal)).toBeGreaterThanOrEqual(Number(initialReveal));
    const stickyPosition = await chapter.locator('[data-testid^="chapter-media-"]').evaluate((node) => getComputedStyle(node).position);
    expect(stickyPosition).toBe('sticky');
  });

  test('keeps content available and disables scroll-linked motion when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(page.getByRole('heading', { name: /The painting changes the scene/i })).toBeVisible();
    const motion = await page.locator('[data-chapter]').first().evaluate((node) => ({
      clip: getComputedStyle(node.querySelector('.essay-chapter__art')).clipPath,
      transition: getComputedStyle(node.querySelector('.essay-chapter__art')).transitionDuration,
    }));
    expect(motion.clip).toBe('none');
    expect(parseFloat(motion.transition)).toBeLessThan(0.3);
  });

  test('is usable on mobile and has no console errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole('heading', { name: /The art in the background/i })).toBeVisible();
    await expect(page.locator('[data-chapter]').first().locator('.essay-chapter__media')).toHaveCSS('position', 'relative');
    for (const chapter of chapters) {
      await page.locator(`[data-chapter="${chapter.id}"]`).scrollIntoViewIfNeeded();
      await page.waitForTimeout(40);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'art-essay-mobile.png');
    await page.getByRole('button', { name: 'Gallery' }).click();
    await page.locator('[data-gallery]').scrollIntoViewIfNeeded();
    await shot(page, 'art-essay-gallery-mobile.png');
    for (const route of ['/', '/projects', '/topics', '/a-love-letter-to-react-native-audio-api/']) {
      const response = await page.request.get(route);
      expect(response.status(), route).toBe(200);
    }
    expect(errors).toEqual([]);
  });
});
