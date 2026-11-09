/**
 * Service worker cache rules (Phase 6 §4.10, §9): cache `tc-<buildId>`; install precaches `index.html` and every
 * hashed asset; activate deletes every other `tc-*` cache; hashed assets cache first; `index.html` network first
 * with a cache fallback; a new build replaces the old cache and never serves stale code once online.
 */
import { describe, expect, it } from 'vitest';
import { SCOPE, buildFiles, FakeCacheStorage, FakeNetwork, loadServiceWorker } from './swHarness';

const A = ['assets/index-aaa111.js', 'assets/index-aaa222.css'];
const B = ['assets/index-bbb111.js', 'assets/index-bbb222.css'];

function setup(buildId = 'a1', assets = A): { net: FakeNetwork; caches: FakeCacheStorage; sw: ReturnType<typeof loadServiceWorker> } {
  const net = new FakeNetwork();
  net.files = buildFiles(buildId, assets);
  const caches = new FakeCacheStorage();
  return { net, caches, sw: loadServiceWorker(buildId, net, caches) };
}

const text = async (r: Response | null): Promise<string | null> => (r ? await r.text() : null);

describe('install', () => {
  it('precaches index.html, every hashed asset, and the static files into tc-<buildId>', async () => {
    const { net, caches, sw } = setup();
    await sw.install();
    expect(await caches.keys()).toEqual(['tc-a1']);
    const cached = (await (await caches.open('tc-a1')).keys()).map((k) => k.url).sort();
    expect(cached).toEqual([SCOPE, ...A.map((a) => SCOPE + a), SCOPE + 'icons/icon.svg', SCOPE + 'manifest.webmanifest'].sort());
    // The manifest is never cached and is read past the HTTP cache; precached files skip the HTTP cache too.
    const manifestCall = net.calls.find((c) => c.url.endsWith('sw-manifest.json'));
    expect(manifestCall?.init?.cache).toBe('no-store');
    for (const c of net.calls.filter((x) => !x.url.endsWith('sw-manifest.json'))) expect(c.init?.cache, c.url).toBe('reload');
  });

  it('fails without a cache when the manifest belongs to another build', async () => {
    const { net, caches, sw } = setup('a1');
    net.files.set('sw-manifest.json', JSON.stringify({ format: 'thrills-and-chills-sw-manifest', buildId: 'zz', assets: A, files: [] }));
    await expect(sw.install()).rejects.toThrow(/build/);
    expect(await caches.keys()).toEqual([]);
  });

  it('fails and removes the partial cache when an asset cannot be fetched', async () => {
    const { net, caches, sw } = setup();
    net.files.delete(A[1] as string);
    await expect(sw.install()).rejects.toThrow();
    expect(await caches.keys()).toEqual([]);
  });

  it('does not skip waiting on its own (a new worker waits for the Update ready toast)', async () => {
    const { sw } = setup();
    await sw.install();
    expect(sw.skipWaiting.calls).toBe(0);
    sw.message({ type: 'SKIP_WAITING' });
    expect(sw.skipWaiting.calls).toBe(1);
    sw.message({ type: 'other' });
    sw.message(null);
    expect(sw.skipWaiting.calls).toBe(1);
  });
});

describe('activate', () => {
  it('deletes every other tc-* cache and keeps caches of other apps', async () => {
    const { caches, sw } = setup('a2');
    await caches.open('tc-a1');
    await caches.open('tc-old');
    await caches.open('other-app');
    await sw.install();
    await sw.activate();
    expect((await caches.keys()).sort()).toEqual(['other-app', 'tc-a2']);
  });
});

describe('fetch', () => {
  it('serves hashed assets from the cache first', async () => {
    const { net, sw } = setup();
    await sw.install();
    await sw.activate();
    net.calls.length = 0;
    expect(await text(await sw.request(A[0] as string))).toBe(`/* ${A[0]} of a1 */`);
    expect(net.calls).toEqual([]);
  });

  it('fetches an asset that is not cached from the network and does not add it', async () => {
    const { net, caches, sw } = setup();
    await sw.install();
    net.files.set('assets/late-ccc.js', 'late');
    expect(await text(await sw.request('assets/late-ccc.js'))).toBe('late');
    expect(await (await caches.open('tc-a1')).match(SCOPE + 'assets/late-ccc.js')).toBeUndefined();
  });

  it('loads index.html from the network first, revalidating past the HTTP cache', async () => {
    const { net, sw } = setup();
    await sw.install();
    net.files.set('index.html', 'fresh index');
    net.calls.length = 0;
    expect(await text(await sw.request(SCOPE, { mode: 'navigate' }))).toBe('fresh index');
    expect(net.calls[0]?.init?.cache).toBe('no-cache');
  });

  it('falls back to the cached index.html offline, for any page in the scope', async () => {
    const { net, sw } = setup();
    await sw.install();
    net.offline = true;
    expect(await text(await sw.request(SCOPE, { mode: 'navigate' }))).toContain('<title>a1</title>');
    expect(await text(await sw.request(SCOPE + 'index.html?x=1', { mode: 'navigate' }))).toContain('<title>a1</title>');
    expect(await text(await sw.request(A[0] as string))).toBe(`/* ${A[0]} of a1 */`);
  });

  it('leaves other requests to the browser: non-GET, other origins, outside the scope, the manifest, the worker', async () => {
    const { sw } = setup();
    await sw.install();
    expect(await sw.request(A[0] as string, { method: 'POST' })).toBeNull();
    expect(await sw.request('https://elsewhere.test/x.js')).toBeNull();
    expect(await sw.request('https://example.test/other/x.js')).toBeNull();
    expect(await sw.request('sw-manifest.json')).toBeNull();
    expect(await sw.request('sw.js')).toBeNull();
  });
});

describe('a new build (never stale code)', () => {
  it('replaces the old cache; the new index and assets are served, the old ones are gone', async () => {
    const caches = new FakeCacheStorage();
    const net = new FakeNetwork();
    net.files = buildFiles('a1', A);
    const swA = loadServiceWorker('a1', net, caches);
    await swA.install();
    await swA.activate();

    // Build B is deployed. While A is still active and online, navigation gets B's index from the network.
    net.files = buildFiles('b1', B);
    expect(await text(await swA.request(SCOPE, { mode: 'navigate' }))).toContain('<title>b1</title>');
    // B's assets are not in A's cache: they come from the network, never a stale copy.
    expect(await text(await swA.request(B[0] as string))).toBe(`/* ${B[0]} of b1 */`);

    // B installs next to A (waiting), then activates after Reload.
    const swB = loadServiceWorker('b1', net, caches);
    await swB.install();
    expect((await caches.keys()).sort()).toEqual(['tc-a1', 'tc-b1']);
    await swB.activate();
    expect(await caches.keys()).toEqual(['tc-b1']);

    net.offline = true;
    expect(await text(await swB.request(SCOPE, { mode: 'navigate' }))).toContain('<title>b1</title>');
    expect(await text(await swB.request(B[1] as string))).toBe(`/* ${B[1]} of b1 */`);
    await expect(swB.request(A[0] as string)).rejects.toThrow();
  });
});
