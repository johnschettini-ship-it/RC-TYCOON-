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

/** A new worker for the same scope, standing in for a new deploy (the preview server serves one fixed `sw.js`). */
async function newWorker(page: Page, tag: string): Promise<void> {
  await page.evaluate((t) => navigator.serviceWorker.register(`sw.js?e2e=${t}`, { scope: './' }).then(() => undefined), tag);
}

test('a waiting worker shows Update ready; Later hides it; Reload autosaves and hands over', async ({ page }) => {
  // Replacing the cache per build is covered with a fake cache API in tests/unit/offline/sw.test.ts; this checks the
  // browser side: the waiting worker, the toast, the autosave, and the takeover.
  await page.goto('/');
  await workerReady(page);
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await page.getByTestId('title-new').click();
  await page.getByTestId('title-start').click();
  await expect(page.locator('.title-screen')).toBeHidden();
  await expect(page.getByTestId('hud-date')).toHaveText(/\d\d:\d\d/);

  const toast = page.getByTestId('update-toast');
  await expect(toast).toBeHidden();
  await newWorker(page, 'one');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('Update ready');
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.scriptURL ?? '')).toContain('e2e=one');

  // Later: hidden until a newer build is waiting.
  await page.getByTestId('update-later').click();
  await expect(toast).toBeHidden();
  await newWorker(page, 'two');
  await expect(toast).toBeVisible();

  // Reload: the park with changes goes to the autosave slot, then the waiting worker takes over and the page reloads.
  expect(await page.evaluate(() => localStorage.getItem('tc.save.auto'))).toBeNull();
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.scriptURL ?? '')).toContain('e2e=two');
  const reloaded = page.waitForEvent('load');
  await page.getByTestId('update-reload').click();
  await reloaded;
  expect(await page.evaluate(() => localStorage.getItem('tc.save.auto'))).not.toBeNull();
  expect(await page.evaluate(() => (navigator.serviceWorker.controller as ServiceWorker | null)?.scriptURL ?? '')).toContain('e2e=two');
  await expect(page.getByTestId('title-continue')).toBeVisible();
});
