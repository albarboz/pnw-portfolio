import { expect, test } from '@playwright/test';
import { openPage, scrollToY, topOf, trackErrors } from './helpers';

/**
 * Coming back: Back from another page restores this one from the browser's back/forward cache (mid-scroll, film and
 * fog as they were), and the keyboard shortcuts.
 * Chrome only: the cache and the shortcuts don't depend on the engine.
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'engine-neutral'));

// Playwright turns the cache off by default (it gets in the way of request interception); the first test needs it.
test.use({ launchOptions: { ignoreDefaultArgs: ['--disable-back-forward-cache'] } });

test.describe('back/forward cache', () => {

  test('Back from another page restores the page as it was', async ({ page }) => {
    const errors = trackErrors(page);
    await openPage(page, '?quality=2');
    await scrollToY(page, await topOf(page, '#about'), 2000); // the film is downloading by now
    const y = await page.evaluate(() => scrollY);
    await page.evaluate(() => addEventListener('pageshow', (e) => ((window as any).restored = e.persisted)));

    await page.goto('/humans.txt');
    // a page restored from the cache fires no load event, so wait only for the navigation
    await page.goBack({ waitUntil: 'commit' });
    await page.waitForFunction(() => document.readyState === 'complete');

    const reasons = await page.evaluate(() =>
      JSON.stringify((performance.getEntriesByType('navigation')[0] as any)?.notRestoredReasons ?? null),
    );
    expect(await page.evaluate(() => (window as any).restored), `not restored: ${reasons}`).toBe(true);
    expect(Math.abs((await page.evaluate(() => scrollY)) - y)).toBeLessThan(2);
    // the text page asks for /favicon.ico (a text file can't name its icon); the site's own is an SVG
    expect(errors.filter((e) => !e.endsWith('/favicon.ico'))).toEqual([]);
  });
});

test.describe('keyboard shortcuts', () => {
  test('? lists them; J and K walk the case studies; they can be turned off', async ({ page }) => {
    const errors = trackErrors(page);
    await openPage(page, '?quality=0');
    const list = page.locator('[data-keys]');

    await page.keyboard.press('?');
    await expect(list).toHaveJSProperty('open', true);
    await page.keyboard.press('Escape');
    await expect(list).toHaveJSProperty('open', false);

    await page.goto('/work/ridgeline-weather-dashboard/?quality=0');
    await expect(page.locator('#cs-title')).toContainText('Ridgeline weather dashboard');
    await page.keyboard.press('j');
    await expect(page).toHaveURL(/\/work\/trail-run-tracker\//);
    await expect(page.locator('#cs-title')).toContainText('Trail run tracker', { timeout: 5000 });
    await page.keyboard.press('k');
    await expect(page.locator('#cs-title')).toContainText('Ridgeline weather dashboard', { timeout: 5000 });

    // off: J does nothing; the footer's button still opens the list to turn them back on
    await page.keyboard.press('?');
    await page.locator('[data-keys-part="toggle"]').click();
    await expect(page.locator('[data-keys-part="toggle"]')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await page.keyboard.press('j');
    await page.waitForTimeout(1500);
    await expect(page.locator('#cs-title')).toContainText('Ridgeline weather dashboard');
    expect(errors).toEqual([]);
  });

  test('G then a letter flies to that section', async ({ page }) => {
    await openPage(page, '?quality=0');
    await page.keyboard.press('g');
    await page.keyboard.press('c');
    await expect(page.locator('#contact-h')).toBeInViewport({ timeout: 20_000 });
  });
});
