/*
 * Thrills & Chills service worker (Phase 6 §4.10). Hand-written, no dependency. Owner: W4-G.
 *
 * - Cache `tc-<buildId>`. The build step (`scripts/sw-manifest-plugin.ts`) stamps the build id below, so every
 *   build has different worker bytes and the browser finds the update.
 * - Install precaches the page (`index.html`, by its scope URL), every hashed asset, and the static files listed in
 *   `sw-manifest.json`, read past the HTTP cache. A manifest of another build fails the install.
 * - A new worker waits until the page asks it to take over (the "Update ready" toast → Reload sends SKIP_WAITING).
 * - Activate deletes every other `tc-*` cache.
 * - Fetch: page loads are network first (revalidated, never a stale HTTP copy), with the cached page as the offline
 *   fallback; precached files are cache first; everything else goes to the network untouched.
 * - Saves live in localStorage and are never cached.
 */
'use strict';

var BUILD_ID = '__TC_BUILD_ID__';
var CACHE_PREFIX = 'tc-';
var CACHE = CACHE_PREFIX + BUILD_ID;
var SCOPE = self.registration.scope;
var MANIFEST_URL = new URL('sw-manifest.json', SCOPE).href;
var WORKER_URL = new URL('sw.js', SCOPE).href;
// Build files never vary by request headers; servers that send `Vary: Origin` would otherwise miss module scripts.
var MATCH = { ignoreVary: true };

function stripQuery(url) {
  var u = new URL(url);
  u.search = '';
  u.hash = '';
  return u.href;
}

async function precache() {
  var res = await fetch(MANIFEST_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('sw-manifest.json: HTTP ' + res.status);
  var manifest = await res.json();
  if (!manifest || manifest.buildId !== BUILD_ID) throw new Error('sw-manifest.json belongs to another build');
  var urls = [SCOPE]
    .concat(manifest.assets || [], manifest.files || [])
    .map(function (path) {
      return new URL(path, SCOPE).href;
    });
  var cache = await caches.open(CACHE);
  try {
    await Promise.all(
      urls.map(async function (url) {
        var r = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
        if (!r.ok) throw new Error(url + ': HTTP ' + r.status);
        await cache.put(url, r);
      }),
    );
  } catch (e) {
    // All or nothing, like Cache.addAll: a half-filled cache is never used.
    await caches.delete(CACHE);
    throw e;
  }
}

async function removeOldCaches() {
  var names = await caches.keys();
  await Promise.all(
    names
      .filter(function (n) {
        return n.indexOf(CACHE_PREFIX) === 0 && n !== CACHE;
      })
      .map(function (n) {
        return caches.delete(n);
      }),
  );
}

async function networkFirstPage(request) {
  try {
    return await fetch(request, { cache: 'no-cache' });
  } catch (e) {
    var cache = await caches.open(CACHE);
    var page = await cache.match(SCOPE, MATCH);
    if (page) return page;
    throw e;
  }
}

async function cacheFirst(request) {
  var cache = await caches.open(CACHE);
  var hit = await cache.match(request, MATCH);
  return hit || fetch(request);
}

self.addEventListener('install', function (event) {
  event.waitUntil(precache());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(removeOldCaches());
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = stripQuery(request.url);
  if (url.indexOf(SCOPE) !== 0) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
    return;
  }
  if (url === MANIFEST_URL || url === WORKER_URL) return;
  event.respondWith(cacheFirst(request));
});
