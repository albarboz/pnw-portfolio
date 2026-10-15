import { defineConfig, devices } from '@playwright/test';

/**
 * The Done checklist as tests (tests/): the built site, scrolled top to bottom at desktop and phone width, with and
 * without reduced motion, at quality 0 and 2; console errors, horizontal scroll, keyboard and axe checks.
 * `npm test` builds first; `npx playwright test` reuses the last build. Screenshots land in the HTML report
 * (`npx playwright show-report`).
 *
 * Runs in the installed Chrome, one at a time: the 3D in software WebGL is heavy. The `iphone` project runs the
 * scroll and film tests in Playwright's WebKit too.
 * Headless Chrome inherits the OS's Reduce Motion, so every project sets the preference itself.
 */
export default defineConfig({
  testDir: 'tests',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    reducedMotion: 'no-preference',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { channel: 'chrome', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
    {
      name: 'phone',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', channel: 'chrome', viewport: { width: 375, height: 812 } },
    },
    // Every iPhone browser runs WebKit, so the scroll and the film also run in Playwright's WebKit as an iPhone
    // (`npx playwright install webkit` once). Only those tests: the rest is engine-neutral.
    {
      name: 'iphone',
      use: { ...devices['iPhone 13'] },
      grep: /scrolls the whole page|the film|reduced motion/,
      testMatch: 'page.spec.ts',
    },
  ],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
  },
});
