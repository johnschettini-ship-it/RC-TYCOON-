import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * Offline play (Phase 6 §4.10, §9 "offline reload loads the game"). The preview build registers `sw.js`; once it is
 * active, the network goes away (for the page and for the worker) and a reload must still start the game from the
 * `tc-<buildId>` cache.
 */

async function workerReady(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    const w = reg.active;
    if (w && w.state !== 'activated') await new Promise<void>((r) => w.addEventListener('statechange', () => w.state === 'activated' && r()));
    return reg.scope;
  });
}

async function workerNetworkFails(context: BrowserContext): Promise<boolean> {
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  return sw.evaluate(() =>
    fetch('sw-manifest.json', { cache: 'no-store' })
      .then(() => false)
      .catch(() => true),
  );
}

test('the build precaches itself under tc-<buildId> and lists every hashed asset', async ({ page }) => {
  await page.goto('/');
  const scope = await workerReady(page);
  expect(new URL(scope).pathname).toBe('/');
  const manifest = (await (await page.request.get('/sw-manifest.json')).json()) as { buildId: string; assets: string[] };
  const cached = await page.evaluate(async (name) => {
    const cache = await caches.open(name);
    return (await cache.keys()).map((r) => new URL(r.url).pathname);
  }, `tc-${manifest.buildId}`);
  expect(await page.evaluate(() => caches.keys())).toEqual([`tc-${manifest.buildId}`]);
  expect(cached).toContain('/');
  for (const a of manifest.assets) expect(cached).toContain(`/${a}`);
  // The page loads exactly the hashed assets the manifest lists.
  const html = await (await page.request.get('/')).text();
  for (const m of html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)) expect(manifest.assets).toContain(m[1]);
});

test('offline reload loads the game', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#game')).toHaveAttribute('data-zoom', /\d/);
  await workerReady(page);

  await context.setOffline(true);
  try {
    // The worker's own network is gone too, so the page below can only come from the cache.
    expect(await workerNetworkFails(context)).toBe(true);
    await page.reload();
    await expect(page.locator('#game')).toHaveAttribute('data-zoom', /\d/);
    await expect(page.getByTestId('title-new')).toBeVisible();
    // A new park starts and runs offline.
    await page.getByTestId('title-new').click();
    await page.getByTestId('title-start').click();
    await expect(page.locator('.title-screen')).toBeHidden();
    await expect(page.getByTestId('hud-date')).toHaveText(/\d\d:\d\d/);
  } finally {
    await context.setOffline(false);
  }
  expect(errors).toEqual([]);
});

test('turning Offline play off unregisters the worker and drops its cache', async ({ page }) => {
  await page.goto('/');
  await workerReady(page);
  await page.evaluate(() => (window as unknown as { __tc: { settings: { set(k: string, v: unknown): boolean } } }).__tc.settings.set('offlinePlay', false));
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('tc-')).length)).toBe(0);
});
