import { expect, test } from '@playwright/test';
import { openPage } from './helpers';

/**
 * Screenshot baselines, for the views that come out the same on every run: the page without JavaScript, the
 * printed page and a case study, still. (The fog, film and drops are random or timed by design, so the scrolled
 * page isn't compared; page.spec.ts attaches screenshots of it to the report instead.)
 * After an intended change, refresh the baselines: `npx playwright test visual --update-snapshots`.
 */
const SAME = { maxDiffPixelRatio: 0.01, animations: 'disabled' } as const;

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('reads as one plain page', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('no-js.png', { ...SAME, fullPage: true });
  });
});

test('printed, it is a one-page CV', async ({ page }) => {
  await openPage(page, '?quality=0');
  await page.emulateMedia({ media: 'print' });
  await expect(page).toHaveScreenshot('print.png', { ...SAME, fullPage: true });
});

test.describe('a case study', () => {
  test.use({ reducedMotion: 'reduce' });
  test('opened at its own address', async ({ page }) => {
    await page.goto('work/trail-run-tracker/?quality=0');
    await expect(page.locator('[data-case-study]')).toHaveAttribute('open', '');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('[data-cs="image"]')).toHaveJSProperty('complete', true);
    await expect(page).toHaveScreenshot('case-study.png', SAME);
  });
});
