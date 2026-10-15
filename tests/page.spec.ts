import { expect, test } from '@playwright/test';
import { openPage, scrollToY, scrollWholePage, SECTIONS, shownOpacity, topOf, trackErrors } from './helpers';

/** Each section, once scrolled to, is on screen and fully shown. */
async function sectionsRead(page: import('@playwright/test').Page) {
  for (const heading of SECTIONS) {
    const section = heading.replace('-h', '');
    await scrollToY(page, await topOf(page, section), 1500);
    await expect(page.locator(heading), `${heading} on screen`).toBeInViewport();
    expect(await shownOpacity(page, heading), `${heading} shown`).toBeGreaterThan(0.95);
  }
}

// Software WebGL in headless Chrome counts as level 0 on its own, so each level is forced.
for (const level of [2, 0]) {
  test.describe(`quality ${level}`, () => {
    test('scrolls the whole page cleanly', async ({ page }, info) => {
      const errors = trackErrors(page);
      await openPage(page, `?quality=${level}`);
      await scrollWholePage(page, info);
      await sectionsRead(page);
      expect(errors).toEqual([]);
    });
  });
}

test.describe('the film', () => {
  test('quality 2 draws it in WebGL', async ({ page }) => {
    await openPage(page, '?quality=2');
    await scrollToY(page, await topOf(page, '#about'), 2000);
    await expect(page.locator('[data-layer="run-gl"]')).toBeVisible();
    await expect(page.locator('[data-layer="run-video"]')).toBeHidden();
  });

  test('quality 0 plays the plain video', async ({ page }) => {
    await openPage(page, '?quality=0');
    await scrollToY(page, await topOf(page, '#about'), 2000);
    await expect(page.locator('[data-layer="run-gl"]')).toBeHidden();
    await expect(page.locator('[data-layer="run-video"]')).toBeAttached();
    await expect(page.locator('[data-layer="run-video"]')).not.toHaveAttribute('hidden');
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('every section reads as a still layout', async ({ page }, info) => {
    const errors = trackErrors(page);
    await openPage(page);
    await expect(page.locator('[data-layer="run-still"]')).toBeVisible();
    await scrollWholePage(page, info);
    await sectionsRead(page);
    expect(errors).toEqual([]);
  });
});

test('the trail sign flies to Contact', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page);
  await page.locator('[data-sign] a[href="#contact"]').click();
  await expect(page.locator('#contact-h')).toBeInViewport({ timeout: 20_000 });
  expect(errors).toEqual([]);
});
