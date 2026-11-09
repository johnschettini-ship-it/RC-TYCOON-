import { defineConfig, devices } from '@playwright/test';

const chromiumPath = process.env.PW_CHROMIUM_PATH;
/** Preview port. Parallel agents set PW_PORT so their servers do not collide. */
const port = Number(process.env.PW_PORT ?? 4173);
const launchOptions = chromiumPath ? { executablePath: chromiumPath } : {};

export default defineConfig({
  testDir: 'tests/e2e',
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${port}`, trace: 'off' },
  webServer: {
    command: `npm run build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, launchOptions } },
    { name: 'phone', use: { ...devices['Pixel 7'], launchOptions } },
  ],
});
