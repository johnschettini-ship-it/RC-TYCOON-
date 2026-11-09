/**
 * Offline play (Phase 6 §4.10). Owner: W4-G. `registerOffline` is called once from `main.ts`.
 *
 * - Off in `npm run dev` (`import.meta.env.DEV`) and where the browser has no service workers.
 * - With Settings → Offline play on (default) it registers `sw.js` (hand-written, `public/sw.js`) with the base path
 *   as scope (`./` resolves to the Pages base path `/RC-TYCOON-/`), after the page has loaded.
 * - A new build: the browser installs the new worker next to the old one, and it waits. The "Update ready" toast
 *   (`src/ui/offline/`) stays until the player picks **Reload** (autosave first, then SKIP_WAITING; the page reloads
 *   when the new worker takes over) or **Later** (hidden until a newer build is waiting). The game checks for a new
 *   build when the tab becomes visible and every hour.
 * - Turning Offline play off unregisters the worker and deletes its `tc-*` caches; turning it on registers again.
 * - Saves stay in `localStorage`, never in the cache.
 */
import type { Game } from '../game';

export interface WorkerLike {
  state: string;
  postMessage(message: unknown): void;
  addEventListener(type: 'statechange', fn: () => void): void;
}

export interface RegistrationLike {
  scope: string;
  installing: WorkerLike | null;
  waiting: WorkerLike | null;
  active?: WorkerLike | null;
  addEventListener(type: 'updatefound', fn: () => void): void;
  update(): Promise<unknown>;
  unregister(): Promise<boolean>;
}

export interface ServiceWorkerLike {
  controller: unknown;
  register(url: string, options: { scope: string; updateViaCache: 'none' }): Promise<RegistrationLike>;
  getRegistration(scope?: string): Promise<RegistrationLike | undefined>;
  addEventListener(type: 'controllerchange', fn: () => void): void;
}

/** Everything the controller needs from the browser (fakes in tests). */
export interface OfflineEnv {
  dev: boolean;
  /** Vite `BASE_URL` (`./`). */
  base: string;
  /** The page URL the base resolves against. */
  pageUrl: string;
  serviceWorker: ServiceWorkerLike | null;
  caches: { keys(): Promise<string[]>; delete(name: string): Promise<boolean> } | null;
  reload(): void;
  onVisible(cb: () => void): void;
  every(ms: number, cb: () => void): void;
  /** Runs `cb` once the page has loaded (registration waits for it, so it never slows the first load). */
  whenLoaded(cb: () => void): void;
  /** One-shot timer; defaults to `setTimeout`. */
  timeout?(ms: number, cb: () => void): void;
}

export interface OfflineState {
  /** Show the "Update ready" toast. */
  updateReady: boolean;
  /** A worker is registered by this page. */
  registered: boolean;
}

export interface OfflineController {
  state(): OfflineState;
  /** Reload into the new build (call after the autosave). */
  applyUpdate(): void;
  /** Hide the toast until a newer build is waiting. */
  later(): void;
}

const UPDATE_CHECK_MS = 60 * 60 * 1000;
/** If the new worker never takes over (it failed), reload anyway after this long. */
const TAKEOVER_TIMEOUT_MS = 3000;
const CACHE_PREFIX = 'tc-';

const ignore = (): void => undefined;

export function createOfflineController(game: Game, env: OfflineEnv): OfflineController {
  const sw = env.serviceWorker;
  let reg: RegistrationLike | null = null;
  let enabled = false;
  /** This page was controlled by a worker (so a later takeover is an update, not the first install). */
  let hadController = (sw?.controller ?? null) !== null;
  let reloading = false;
  /** The worker of a newer build, installed and waiting. */
  let pending: WorkerLike | null = null;
  /** Another tab let the newer build take over; this page still runs the old one. */
  let externalUpdate = false;
  let dismissed: WorkerLike | null = null;
  let dismissedExternal = false;
  let listening = false;
  /** Reload sent SKIP_WAITING and waits for the new worker to take over this page. */
  let waitingForTakeover = false;

  const reload = (): void => {
    if (reloading) return;
    reloading = true;
    waitingForTakeover = false;
    env.reload();
  };

  const watchInstalling = (r: RegistrationLike): void => {
    const w = r.installing;
    if (!w) return;
    // An update only when an older worker exists; the first install is not one.
    const isUpdate = (sw?.controller ?? null) !== null || (r.active ?? null) !== null;
    if (!isUpdate) return;
    w.addEventListener('statechange', () => {
      if (w.state === 'installed') pending = w;
    });
  };

  const listen = (): void => {
    if (listening || !sw) return;
    listening = true;
    sw.addEventListener('controllerchange', () => {
      if (reloading) return;
      if (waitingForTakeover) {
        reload();
        return;
      }
      // Another tab took the update: this page still runs the old build.
      if (hadController && enabled) externalUpdate = true;
      hadController = true;
    });
    const check = (): void => {
      if (enabled && reg) reg.update().catch(ignore);
    };
    env.onVisible(check);
    env.every(UPDATE_CHECK_MS, check);
  };

  const register = (): void => {
    if (!sw || enabled) return;
    enabled = true;
    listen();
    env.whenLoaded(() => {
      if (!enabled) return;
      sw.register(`${env.base}sw.js`, { scope: env.base, updateViaCache: 'none' })
        .then((r) => {
          if (!enabled) return;
          reg = r;
          if (r.waiting && (hadController || (r.active ?? null) !== null)) pending = r.waiting;
          watchInstalling(r);
          r.addEventListener('updatefound', () => watchInstalling(r));
        })
        .catch((e: unknown) => console.warn('Offline play is not available:', e));
    });
  };

  const disable = (): void => {
    enabled = false;
    pending = null;
    externalUpdate = false;
    const known = reg;
    reg = null;
    if (!sw) return;
    const scope = new URL(env.base, env.pageUrl).href;
    const found = known ? Promise.resolve(known) : sw.getRegistration(scope).catch(() => undefined);
    void found
      .then((r) => (r && r.scope === scope ? r.unregister() : false))
      .catch(ignore)
      .then(() => env.caches?.keys())
      .then((names) => Promise.all((names ?? []).filter((n) => n.startsWith(CACHE_PREFIX)).map((n) => env.caches?.delete(n))))
      .catch(ignore);
  };

  if (!env.dev && sw) {
    if (game.settings.get('offlinePlay')) register();
    else disable();
    game.settings.onChange((values, changed) => {
      if (!changed.includes('offlinePlay')) return;
      if (values.offlinePlay) register();
      else disable();
    });
  }

  return {
    state() {
      const fresh = pending !== null && pending !== dismissed;
      return { updateReady: enabled && (fresh || (externalUpdate && !dismissedExternal)), registered: reg !== null };
    },
    applyUpdate() {
      const waiting = reg?.waiting ?? null;
      const controlled = (sw?.controller ?? null) !== null;
      if (waiting && controlled) {
        waitingForTakeover = true;
        waiting.postMessage({ type: 'SKIP_WAITING' });
        (env.timeout ?? ((ms, cb) => setTimeout(cb, ms)))(TAKEOVER_TIMEOUT_MS, () => {
          if (waitingForTakeover) reload();
        });
        return;
      }
      waiting?.postMessage({ type: 'SKIP_WAITING' });
      reload();
    },
    later() {
      dismissed = pending;
      dismissedExternal = externalUpdate;
    },
  };
}

let current: OfflineController | null = null;

/** The controller `registerOffline` made, or null (dev, tests, no service workers). The update toast reads it. */
export function offlineController(): OfflineController | null {
  return current;
}

function browserOfflineEnv(): OfflineEnv {
  return {
    dev: import.meta.env.DEV,
    base: import.meta.env.BASE_URL,
    pageUrl: window.location.href,
    serviceWorker: 'serviceWorker' in navigator ? (navigator.serviceWorker as unknown as ServiceWorkerLike) : null,
    caches: typeof caches === 'undefined' ? null : caches,
    reload: () => window.location.reload(),
    onVisible: (cb) =>
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) cb();
      }),
    every: (ms, cb) => {
      window.setInterval(cb, ms);
    },
    timeout: (ms, cb) => {
      window.setTimeout(cb, ms);
    },
    whenLoaded: (cb) => {
      if (document.readyState === 'complete') cb();
      else window.addEventListener('load', () => cb(), { once: true });
    },
  };
}

export function registerOffline(game: Game): void {
  try {
    current = createOfflineController(game, browserOfflineEnv());
  } catch (e) {
    console.warn('Offline play is not available:', e);
  }
}
