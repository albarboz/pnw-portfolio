import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openPage, scrollToY, SECTIONS, topOf } from './helpers';

/** WCAG 2.2 A and AA rules. */
const axe = (page: Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);

/** One line per broken rule and element, so a failure reads without opening the report. */
function summary(violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']) {
  return violations.flatMap((v) => v.nodes.map((n) => `${v.id} (${v.impact}): ${n.target.join(' ')} – ${v.help}`));
}

for (const motion of ['no-preference', 'reduce'] as const) {
  test.describe(`axe, motion ${motion}`, () => {
    test.use({ reducedMotion: motion });

    test('the opening screen', async ({ page }) => {
      await openPage(page);
      expect(summary((await axe(page).analyze()).violations)).toEqual([]);
    });

    for (const heading of SECTIONS) {
      test(`section ${heading.slice(1, -2)}`, async ({ page }) => {
        await openPage(page);
        await scrollToY(page, await topOf(page, heading.replace('-h', '')), 1500);
        expect(summary((await axe(page).include(heading.replace('-h', '')).analyze()).violations)).toEqual([]);
      });
    }
  });
}

test.describe('case study', () => {
  test('opens and closes from the keyboard, with its own address, focus goes back to the row', async ({ page }) => {
    await openPage(page);
    await scrollToY(page, await topOf(page, '#work'), 1500);
    const row = page.locator('[data-projects] a').first();
    await row.focus();
    await page.keyboard.press('Enter');
    const dialog = page.locator('[data-case-study]');
    await expect(dialog).toHaveJSProperty('open', true);
    await expect(page).toHaveURL(/\/work\/[a-z0-9-]+\/$/);
    await page.waitForTimeout(2200); // through the cloud
    await expect(page.locator('#cs-title')).toBeFocused();
    expect(summary((await axe(page).include('[data-case-study]').analyze()).violations)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/$/);
    await expect(dialog).toHaveJSProperty('open', false, { timeout: 5000 });
    await expect(row).toBeFocused();
  });
});
