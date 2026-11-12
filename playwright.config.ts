import { defineConfig, devices } from '@playwright/test';

const chromiumPath = process.env.PW_CHROMIUM_PATH;
/** Preview port. Parallel agents set PW_PORT so their servers do not collide. */
const port = Number(process.env.PW_PORT ?? 4173);
const launchOptions = chromiumPath ? { executablePath: chromiumPath } : {};
/** Phase 8b stage 0b test (never merged): `TC_APP=1` serves the app output (`dist-app`, art sheets) instead of the website. */
const app = process.env.TC_APP === '1';
const command = app
  ? `npx tsc --noEmit && npx vite build --mode app --outDir dist-app && npx vite preview --outDir dist-app --port ${port} --strictPort`
  : `npm run build && npx vite preview --port ${port} --strictPort`;

export default defineConfig({
  testDir: 'tests/e2e',
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${port}`, trace: 'off' },
  webServer: {
    command,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: app ? 1_800_000 : 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, launchOptions } },
    { name: 'phone', use: { ...devices['Pixel 7'], launchOptions } },
    // Phase 8b stage 0b test (fix round 1, M2): the tablet profile only for app runs (or `TC_TABLET`).
    ...(app || process.env.TC_TABLET
      ? [{ name: 'tablet', use: { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, launchOptions } }]
      : []),
  ],
});
