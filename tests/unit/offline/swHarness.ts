/**
 * Runs the real `public/sw.js` with fake `self`, `caches`, and `fetch` (Phase 6 §9 "SW cache rules with a fake
 * cache API"). The build id is stamped the same way the Vite plugin stamps it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stampServiceWorker } from '../../../scripts/sw-manifest-plugin';

export const SW_SOURCE = readFileSync(resolve(__dirname, '../../../public/sw.js'), 'utf8');
export const SCOPE = 'https://example.test/RC-TYCOON-/';

const keyOf = (req: string | { url: string }): string => new URL(typeof req === 'string' ? req : req.url, SCOPE).href;

export class FakeCache {
  readonly store = new Map<string, Response>();

  /**
   * Like a browser cache with a page whose requests carry an `Origin` header: a response stored with `Vary: Origin`
   * matches only with `ignoreVary` (the preview server and many hosts send it).
   */
  async match(req: string | { url: string }, opts?: { ignoreVary?: boolean }): Promise<Response | undefined> {
    const res = this.store.get(keyOf(req));
    if (!res) return undefined;
    if (res.headers.get('Vary') !== null && opts?.ignoreVary !== true) return undefined;
    return res.clone();
  }

  async put(req: string | { url: string }, res: Response): Promise<void> {
    this.store.set(keyOf(req), res);
  }

  async keys(): Promise<Array<{ url: string }>> {
    return [...this.store.keys()].map((url) => ({ url }));
  }
}

export class FakeCacheStorage {
  readonly caches = new Map<string, FakeCache>();

  async open(name: string): Promise<FakeCache> {
    let c = this.caches.get(name);
    if (!c) {
      c = new FakeCache();
      this.caches.set(name, c);
    }
    return c;
  }

  async has(name: string): Promise<boolean> {
    return this.caches.has(name);
  }

  async keys(): Promise<string[]> {
    return [...this.caches.keys()];
  }

  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name);
  }

  async match(req: string | { url: string }, opts?: { cacheName?: string }): Promise<Response | undefined> {
    const names = opts?.cacheName ? [opts.cacheName] : [...this.caches.keys()];
    for (const n of names) {
      const hit = await this.caches.get(n)?.match(req);
      if (hit) return hit;
    }
    return undefined;
  }
}

export interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

/** A fake network: path (relative to the scope) → body; `offline` makes every fetch fail. */
export class FakeNetwork {
  files = new Map<string, string>();
  offline = false;
  readonly calls: FetchCall[] = [];

  fetch = async (input: string | URL | { url: string }, init?: RequestInit): Promise<Response> => {
    const url = keyOf(typeof input === 'string' ? input : input instanceof URL ? input.href : input);
    this.calls.push({ url, init });
    if (this.offline) throw new TypeError('Failed to fetch');
    const path = url.startsWith(SCOPE) ? url.slice(SCOPE.length).split('?')[0] ?? '' : url;
    const body = this.files.get(path === '' ? 'index.html' : path);
    if (body === undefined) return new Response('not found', { status: 404 });
    return new Response(body, { status: 200, headers: { Vary: 'Origin' } });
  };
}

export interface SwInstance {
  listeners: Map<string, (event: unknown) => void>;
  skipWaiting: { calls: number };
  install(): Promise<void>;
  activate(): Promise<void>;
  /** The response the worker gives, or null when it lets the browser handle the request. */
  request(url: string, opts?: { mode?: string; method?: string }): Promise<Response | null>;
  message(data: unknown): void;
}

export function loadServiceWorker(buildId: string, net: FakeNetwork, caches: FakeCacheStorage): SwInstance {
  const listeners = new Map<string, (event: unknown) => void>();
  const skipWaiting = { calls: 0 };
  const self = {
    registration: { scope: SCOPE },
    location: new URL('sw.js', SCOPE),
    addEventListener(type: string, fn: (event: unknown) => void) {
      listeners.set(type, fn);
    },
    async skipWaiting() {
      skipWaiting.calls++;
    },
  };
  const code = stampServiceWorker(SW_SOURCE, buildId);
  // The worker's globals: everything else (URL, Response, Promise) is the real one.
  new Function('self', 'caches', 'fetch', code)(self, caches, net.fetch);

  const extendable = async (type: string): Promise<void> => {
    const waits: Array<Promise<unknown>> = [];
    listeners.get(type)?.({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  };

  return {
    listeners,
    skipWaiting,
    install: () => extendable('install'),
    activate: () => extendable('activate'),
    async request(url, opts = {}) {
      let response: Promise<Response> | null = null;
      const request = { url: new URL(url, SCOPE).href, mode: opts.mode ?? 'cors', method: opts.method ?? 'GET' };
      listeners.get('fetch')?.({
        request,
        respondWith(p: Promise<Response>) {
          response = p;
        },
      });
      return response === null ? null : await response;
    },
    message(data) {
      listeners.get('message')?.({ data });
    },
  };
}

/** The files of one build: an index that names its hashed assets, the assets, the static files, and the manifest. */
export function buildFiles(buildId: string, assets: string[], statics: string[] = ['icons/icon.svg', 'manifest.webmanifest']): Map<string, string> {
  const files = new Map<string, string>();
  files.set('index.html', `<!doctype html><title>${buildId}</title>${assets.map((a) => `<script src="./${a}"></script>`).join('')}`);
  for (const a of assets) files.set(a, `/* ${a} of ${buildId} */`);
  for (const s of statics) files.set(s, `${s} of ${buildId}`);
  files.set('sw-manifest.json', JSON.stringify({ format: 'thrills-and-chills-sw-manifest', buildId, assets, files: statics }));
  return files;
}
