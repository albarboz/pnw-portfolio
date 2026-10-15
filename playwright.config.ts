import { defineConfig, devices } from '@playwright/test';

/**
 * The Done checklist as tests (tests/): the built site, scrolled top to bottom at desktop and phone width, with and
 * without reduced motion, at quality 0 and 2; console errors, horizontal scroll, keyboard and axe checks.
 * `npm test` builds first; `npx playwright test` reuses the last build. Screenshots land in the HTML report
 * (`npx playwright show-report`).
 *
 * Runs in the installed Chrome (no browser download), one at a time: the 3D in software WebGL is heavy.
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
    channel: 'chrome',
    reducedMotion: 'no-preference',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
    {
      name: 'phone',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', viewport: { width: 375, height: 812 } },
    },
  ],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
  },
});
