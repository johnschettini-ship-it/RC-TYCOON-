/**
 * `registerOffline` (Phase 6 §4.10): off in dev; registers `sw.js` with the base path as scope; a waiting worker
 * shows "Update ready"; Reload sends SKIP_WAITING and reloads when the new worker takes over; Later hides the toast;
 * the Offline play setting unregisters the worker (and drops its caches) when turned off.
 */
import { describe, expect, it } from 'vitest';
import { createOfflineController, type OfflineEnv } from '../../../src/offline';
import { autosaveBeforeReload } from '../../../src/ui/offline/reload';
import { Game } from '../../../src/game';
import { makeTestWorld } from '../../helpers/world';

type Listener = () => void;

class FakeEvents {
  private map = new Map<string, Listener[]>();
  addEventListener(type: string, fn: Listener): void {
    this.map.set(type, [...(this.map.get(type) ?? []), fn]);
  }
  emit(type: string): void {
    for (const fn of this.map.get(type) ?? []) fn();
  }
}

class FakeWorker extends FakeEvents {
  state = 'installing';
  readonly messages: unknown[] = [];
  postMessage(m: unknown): void {
    this.messages.push(m);
  }
  setState(s: string): void {
    this.state = s;
    this.emit('statechange');
  }
}

class FakeRegistration extends FakeEvents {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  active: FakeWorker | null = null;
  updates = 0;
  unregistered = false;
  constructor(readonly scope: string) {
    super();
  }
  async update(): Promise<void> {
    this.updates++;
  }
  async unregister(): Promise<boolean> {
    this.unregistered = true;
    return true;
  }
}

class FakeContainer extends FakeEvents {
  controller: FakeWorker | null = null;
  reg: FakeRegistration | null = null;
  registered: Array<{ url: string; options: unknown }> = [];
  async register(url: string, options: { scope: string }): Promise<FakeRegistration> {
    this.registered.push({ url, options });
    this.reg ??= new FakeRegistration(new URL(options.scope, 'https://example.test/RC-TYCOON-/').href);
    return this.reg;
  }
  async getRegistration(): Promise<FakeRegistration | undefined> {
    return this.reg ?? undefined;
  }
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function setup(opts: { dev?: boolean; offlinePlay?: boolean; controlled?: boolean; noSw?: boolean } = {}) {
  const game = new Game(makeTestWorld());
  if (opts.offlinePlay === false) game.settings.set('offlinePlay', false);
  const sw = new FakeContainer();
  if (opts.controlled) sw.controller = new FakeWorker();
  const deleted: string[] = [];
  let reloads = 0;
  const visible: Listener[] = [];
  const timers: Listener[] = [];
  const env: OfflineEnv = {
    dev: opts.dev ?? false,
    base: './',
    pageUrl: 'https://example.test/RC-TYCOON-/',
    serviceWorker: opts.noSw ? null : (sw as unknown as OfflineEnv['serviceWorker']),
    caches: { keys: async () => ['tc-a', 'tc-b', 'other'], delete: async (n: string) => (deleted.push(n), true) },
    reload: () => reloads++,
    onVisible: (cb) => visible.push(cb),
    every: (_ms, cb) => timers.push(cb),
    whenLoaded: (cb) => cb(),
    timeout: () => undefined,
  };
  const ctl = createOfflineController(game, env);
  return { game, sw, ctl, deleted, reloads: () => reloads, visible, timers };
}

describe('registration', () => {
  it('registers sw.js with the base path as scope, bypassing the HTTP cache for the worker', async () => {
    const { sw } = setup();
    await flush();
    expect(sw.registered).toEqual([{ url: './sw.js', options: { scope: './', updateViaCache: 'none' } }]);
  });

  it('is off in dev and without service workers', async () => {
    const dev = setup({ dev: true });
    await flush();
    expect(dev.sw.registered).toEqual([]);
    const none = setup({ noSw: true });
    await flush();
    expect(none.ctl.state().updateReady).toBe(false);
  });

  it('does not register while Offline play is off', async () => {
    const { sw } = setup({ offlinePlay: false });
    await flush();
    expect(sw.registered).toEqual([]);
  });

  it('checks for a new build when the tab becomes visible and on a timer', async () => {
    const { sw, visible, timers } = setup();
    await flush();
    for (const v of visible) v();
    for (const t of timers) t();
    await flush();
    expect(sw.reg?.updates).toBe(2);
  });
});

describe('update flow', () => {
  it('a worker that finishes installing while a page is controlled makes "Update ready"', async () => {
    const { sw, ctl } = setup({ controlled: true });
    await flush();
    expect(ctl.state().updateReady).toBe(false);
    const w = new FakeWorker();
    const reg = sw.reg as FakeRegistration;
    reg.installing = w;
    reg.emit('updatefound');
    w.setState('installed');
    reg.waiting = w;
    expect(ctl.state().updateReady).toBe(true);
  });

  it('a worker already waiting at start shows the toast too', async () => {
    const game = setup({ controlled: true });
    // Re-run with a waiting worker present before registration resolves.
    game.sw.reg = new FakeRegistration('https://example.test/RC-TYCOON-/');
    game.sw.reg.waiting = new FakeWorker();
    const again = createOfflineController(game.game, {
      dev: false,
      base: './',
      pageUrl: 'https://example.test/RC-TYCOON-/',
      serviceWorker: game.sw as unknown as OfflineEnv['serviceWorker'],
      caches: null,
      reload: () => undefined,
      onVisible: () => undefined,
      every: () => undefined,
      whenLoaded: (cb) => cb(),
    });
    await flush();
    expect(again.state().updateReady).toBe(true);
  });

  it('the first install (no controller yet) is not an update', async () => {
    const { sw, ctl, reloads } = setup();
    await flush();
    const w = new FakeWorker();
    const reg = sw.reg as FakeRegistration;
    reg.installing = w;
    reg.emit('updatefound');
    w.setState('installed');
    sw.emit('controllerchange');
    expect(ctl.state().updateReady).toBe(false);
    expect(reloads()).toBe(0);
  });

  it('Reload asks the waiting worker to take over, then reloads once it does', async () => {
    const { sw, ctl, reloads } = setup({ controlled: true });
    await flush();
    const w = new FakeWorker();
    (sw.reg as FakeRegistration).waiting = w;
    ctl.applyUpdate();
    expect(w.messages).toEqual([{ type: 'SKIP_WAITING' }]);
    expect(reloads()).toBe(0);
    sw.emit('controllerchange');
    sw.emit('controllerchange');
    expect(reloads()).toBe(1);
  });

  it('Reload without a waiting worker reloads at once', async () => {
    const { ctl, reloads } = setup({ controlled: true });
    await flush();
    ctl.applyUpdate();
    expect(reloads()).toBe(1);
  });

  it('another tab taking the update makes this tab show "Update ready" (it still runs the old code)', async () => {
    const { sw, ctl, reloads } = setup({ controlled: true });
    await flush();
    sw.emit('controllerchange');
    expect(ctl.state().updateReady).toBe(true);
    expect(reloads()).toBe(0);
  });

  it('Later hides the toast until a newer build is waiting', async () => {
    const { sw, ctl } = setup({ controlled: true });
    await flush();
    const reg = sw.reg as FakeRegistration;
    const w1 = new FakeWorker();
    reg.installing = w1;
    reg.emit('updatefound');
    w1.setState('installed');
    reg.waiting = w1;
    ctl.later();
    expect(ctl.state().updateReady).toBe(false);
    const w2 = new FakeWorker();
    reg.installing = w2;
    reg.emit('updatefound');
    w2.setState('installed');
    reg.waiting = w2;
    expect(ctl.state().updateReady).toBe(true);
  });
});

describe('Offline play setting', () => {
  it('turning it off unregisters the worker and deletes the tc-* caches; on registers again', async () => {
    const { game, sw, deleted, ctl } = setup({ controlled: true });
    await flush();
    const reg = sw.reg as FakeRegistration;
    reg.waiting = new FakeWorker();
    game.settings.set('offlinePlay', false);
    await flush();
    expect(reg.unregistered).toBe(true);
    expect(deleted.sort()).toEqual(['tc-a', 'tc-b']);
    expect(ctl.state().updateReady).toBe(false);
    sw.reg = null;
    game.settings.set('offlinePlay', true);
    await flush();
    expect(sw.registered).toHaveLength(2);
  });
});

describe('autosave before the reload (Phase 6 §4.10)', () => {
  const backend = (error: string | null = null) => {
    const saved: string[] = [];
    return { saved, save: (slot: string) => (saved.push(slot), error) };
  };

  it('saves a park with changes to the autosave slot', () => {
    const game = new Game(makeTestWorld());
    game.dirty = true;
    const b = backend();
    expect(autosaveBeforeReload(game, b, false)).toEqual({ ok: true });
    expect(b.saved).toEqual(['auto']);
  });

  it('skips the save when nothing changed or the title screen is open (the park was left)', () => {
    const game = new Game(makeTestWorld());
    const b = backend();
    expect(autosaveBeforeReload(game, b, false)).toEqual({ ok: true });
    game.dirty = true;
    expect(autosaveBeforeReload(game, b, true)).toEqual({ ok: true });
    expect(b.saved).toEqual([]);
  });

  it('reports a failed save so the reload does not lose the park', () => {
    const game = new Game(makeTestWorld());
    game.dirty = true;
    expect(autosaveBeforeReload(game, backend('Storage is full'), false)).toEqual({ ok: false, error: 'Storage is full' });
    expect(autosaveBeforeReload(game, { save: () => { throw new Error('blocked'); } }, false)).toEqual({ ok: false, error: 'blocked' });
  });
});
