import { expect, type Page, type TestInfo } from '@playwright/test';

/** Console errors and uncaught exceptions from the page, collected from the moment this is called. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`page: ${err.message}`));
  page.on('requestfailed', (req) => {
    // a request the page dropped itself (a film swapped, a decoder closed) isn't an error
    if (req.failure()?.errorText !== 'net::ERR_ABORTED') errors.push(`request: ${req.url()} ${req.failure()?.errorText}`);
  });
  return errors;
}

/** Opens the page and waits for the hero to be drawn. */
export async function openPage(page: Page, query = '') {
  await page.goto(`/${query}`);
  await expect(page.locator('[data-scene="descent"] h1')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** Wider than the screen: the page would scroll sideways. */
export async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.scrollingElement ?? document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
}

/** Product of the opacities of `selector` and all its ancestors: how visible it really is. */
export async function shownOpacity(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) => {
    let o = 1;
    for (let e: Element | null = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
    return o;
  });
}

/** Native scroll to `y` (Lenis follows native scrolls), then a moment for scrubbed tweens and reveals to settle. */
export async function scrollToY(page: Page, y: number, settle = 600) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
  await page.waitForTimeout(settle);
}

/** Scroll position at which `selector`'s top reaches the top of the screen. */
export async function topOf(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
}

/**
 * Scrolls the whole page in steps of `step` screen heights, checking at every stop that nothing sticks out
 * sideways, and attaches a screenshot every `shotEvery` stops to the report.
 */
export async function scrollWholePage(page: Page, info: TestInfo, { step = 0.5, shotEvery = 4 } = {}) {
  const { height, vh } = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    vh: window.innerHeight,
  }));
  const stops = Math.ceil((height - vh) / (vh * step));
  for (let i = 0; i <= stops; i++) {
    const y = Math.min(i * vh * step, height - vh);
    await scrollToY(page, y, 350);
    expect(await horizontalOverflow(page), `sideways overflow at y=${Math.round(y)}`).toBeLessThanOrEqual(0);
    if (i % shotEvery === 0 || i === stops) {
      await info.attach(`scroll ${String(i).padStart(3, '0')} (y=${Math.round(y)})`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    }
  }
}

/** The sections, by heading id, in page order. */
export const SECTIONS = ['#about-h', '#work-h', '#contact-h'];
