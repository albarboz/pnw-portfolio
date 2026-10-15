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

test.describe('case study pages', () => {
  test('a project address opens its case study; Next and Back walk the projects; Close lands on the trail', async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await page.goto('/work/ridgeline-weather-dashboard/');
    const dialog = page.locator('[data-case-study]');
    await expect(dialog).toHaveJSProperty('open', true);
    await expect(page.locator('#cs-title')).toContainText('Ridgeline weather dashboard');
    await expect(page).toHaveTitle(/^Ridgeline weather dashboard · /);
    await expect(page.locator('[data-cs="image"]')).toHaveJSProperty('complete', true);
    expect(await page.locator('[data-cs="image"]').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

    await page.locator('[data-cs="next"]').click();
    await expect(page).toHaveURL(/\/work\/trail-run-tracker\/$/);
    await expect(page.locator('#cs-title')).toContainText('Trail run tracker', { timeout: 5000 });
    await page.goBack();
    await expect(page.locator('#cs-title')).toContainText('Ridgeline weather dashboard', { timeout: 5000 });

    await page.locator('[data-cs="close"]').click();
    await expect(dialog).toHaveJSProperty('open', false, { timeout: 5000 });
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('[data-scene="descent"] h1')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the built page for a project previews as that project', async ({ request }) => {
    const html = await (await request.get('/work/trail-run-tracker/')).text();
    expect(html).toContain('<title>Trail run tracker · ');
    expect(html).toMatch(/<meta property="og:url" content="[^"]*\/work\/trail-run-tracker\/"/);
    expect(html).toContain('<base href="../../" />');
  });

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('opens at once, without the cloud', async ({ page }) => {
      await openPage(page);
      await page.locator('[data-projects] a').first().click();
      await expect(page.locator('[data-cs="page"]')).toHaveCSS('opacity', '1');
      await expect(page.locator('[data-cs="veil"]')).toHaveCSS('opacity', '0');
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-case-study]')).toHaveJSProperty('open', false);
    });
  });
});
