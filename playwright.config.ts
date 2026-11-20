import { defineConfig, devices } from '@playwright/test';

const chromiumPath = process.env.PW_CHROMIUM_PATH;
/** Preview port. Parallel agents set PW_PORT so their servers do not collide. */
const port = Number(process.env.PW_PORT ?? 4173);
const launchOptions = chromiumPath ? { executablePath: chromiumPath } : {};
/**
 * The realistic suite (`VITE_ART=real npx playwright test`; how to run it, art included: tests/e2e/README.md) builds the
 * realistic build and copies the baked art (dist-art/real, or REAL_ART_DIR) to dist/art/real before serving it.
 */
const real = process.env.VITE_ART === 'real';
const build = real ? 'npm run build && node scripts/e2e-real-art.mjs dist' : 'npm run build';

export default defineConfig({
  testDir: 'tests/e2e',
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${port}`, trace: 'off' },
  webServer: {
    command: `${build} && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, launchOptions } },
    { name: 'phone', use: { ...devices['Pixel 7'], launchOptions } },
  ],
});
