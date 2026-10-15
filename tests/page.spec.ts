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

  // Locking the page for a case study once left Safari's sticky stage stuck to the body: back on the trail, the
  // film hung a screen off with the landing photo showing above it (fixed with overflow-x: clip in base.css).
  test('stays on screen after a case study closes', async ({ page }) => {
    await openPage(page, '?quality=0');
    const stageTop = () =>
      page.locator('[data-scene="run"] [data-stage]').evaluate((el) => Math.round(el.getBoundingClientRect().top));
    const spot = (await topOf(page, '#about')) - (await page.evaluate(() => innerHeight)) * 0.6;
    await scrollToY(page, spot, 1500);
    expect(await stageTop()).toBe(0);

    const row = page.locator('[data-projects] a').first();
    await row.scrollIntoViewIfNeeded();
    await row.click();
    await expect(page.locator('#cs-title')).not.toBeEmpty();
    await page.locator('[data-cs="close"]').click();
    await expect(page.locator('[data-case-study]')).toHaveJSProperty('open', false, { timeout: 5000 });

    await scrollToY(page, spot, 1500);
    expect(await stageTop()).toBe(0);
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
    await page.goto('/work/wagecheck/');
    const dialog = page.locator('[data-case-study]');
    await expect(dialog).toHaveJSProperty('open', true);
    await expect(page.locator('#cs-title')).toContainText('WageCheck');
    await expect(page).toHaveTitle(/^WageCheck · /);
    await expect(page.locator('[data-cs="image"]')).toHaveJSProperty('complete', true);
    expect(await page.locator('[data-cs="image"]').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

    await page.locator('[data-cs="next"]').click();
    await expect(page).toHaveURL(/\/work\/salon-nadia\/$/);
    await expect(page.locator('#cs-title')).toContainText('Salon Nadia', { timeout: 5000 });
    await page.goBack();
    await expect(page.locator('#cs-title')).toContainText('WageCheck', { timeout: 5000 });

    await page.locator('[data-cs="close"]').click();
    await expect(dialog).toHaveJSProperty('open', false, { timeout: 5000 });
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('[data-scene="descent"] h1')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the built page for a project previews as that project', async ({ request }) => {
    const html = await (await request.get('/work/salon-nadia/')).text();
    expect(html).toContain('<title>Salon Nadia · ');
    expect(html).toMatch(/<meta property="og:url" content="[^"]*\/work\/salon-nadia\/"/);
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
