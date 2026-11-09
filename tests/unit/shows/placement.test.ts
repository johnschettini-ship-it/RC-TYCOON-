/** `placeShowSite`, `demolish` on a site, and the placement rules (Phase 6 §6, master R14, R15). Owner: W4-C. */
import { describe, expect, it, vi } from 'vitest';

/**
 * Phase 6 content stays locked until W4-D raises `BUILD_MAX_PHASE`; play-mode cash tests turn the lock off for the
 * show sites only (`unlock.on`), so the command's own cash path is what they test.
 */
const unlock = vi.hoisted(() => ({ on: false }));
vi.mock('../../../src/sim/research/api', async (orig) => {
  const real = await orig<typeof import('../../../src/sim/research/api')>();
  return {
    ...real,
    isUnlocked: (world: Parameters<typeof real.isUnlocked>[0], id: string) =>
      (unlock.on && (id === 'lightshow_tower' || id === 'fireworks_launcher')) || real.isUnlocked(world, id),
  };
});

function withUnlocked(fn: () => void): void {
  unlock.on = true;
  try {
    fn();
  } finally {
    unlock.on = false;
  }
}
import { SHOW_ERR } from '../../../src/data/strings/shows';
import { TERRAIN_ERR } from '../../../src/data/strings/terrain';
import { validateState } from '../../../src/save';
import { executeCommand } from '../../../src/sim/commands';
import { distanceTo } from '../../../src/sim/pathing';
import { Content, Owned, tileIndex } from '../../../src/sim/map';
import { allocId } from '../../../src/sim/ids';
import { checkShowPlacement } from '../../../src/sim/shows/placement';
import { findShowSite, showSitesAssetValue, showSiteTiles, viewingTiles } from '../../../src/sim/shows/api';
import { showSiteRefund } from '../../../src/sim/shows/commands';
import { assetValue } from '../../../src/sim/finance/value';
import { TICKS_PER_MONTH } from '../../../src/data/tuning/core';
import { makeTestWorld, placeFootpath, placeRideDirect, stateHash } from '../../helpers/world';
import { defOf, placeSite, showWorld } from './helpers';

const SETUP = { setup: true } as const;
const PLAY = { setup: false } as const;

describe('placeShowSite', () => {
  it('builds a 2 × 2 Lightshow Tower: tiles, id order, default schedule, construction cost', () => {
    const w = makeTestWorld();
    const cash = w.state.park.cash;
    const r = executeCommand(w, { type: 'placeShowSite', defId: 'lightshow_tower', x: 20, y: 20, rotation: 1 }, SETUP);
    expect(r).toEqual({ ok: true, cost: 250_000, warnings: [], id: expect.any(Number) });
    const site = findShowSite(w, (r as { id: number }).id)!;
    expect(site).toMatchObject({
      defId: 'lightshow_tower',
      x: 20,
      y: 20,
      rotation: 1,
      schedule: { hour: 21, minute: 0, everyNDays: 1, enabled: false },
      status: 'idle',
      nextShowTick: -1,
      startTick: -1,
      lastWatchers: 0,
      totals: { shows: 0, cost: 0, watchers: 0 },
      totalBuildCost: 250_000,
      builtTick: w.state.tick,
    });
    const tiles = showSiteTiles(w, site);
    expect(tiles.sort((a, b) => a - b)).toEqual([tileIndex(w.state.map, 20, 20), tileIndex(w.state.map, 21, 20), tileIndex(w.state.map, 20, 21), tileIndex(w.state.map, 21, 21)]);
    for (const t of tiles) {
      expect(w.state.map.content[t]).toBe(Content.Building);
      expect(w.state.map.contentRef[t]).toBe(site.id);
    }
    // Setup mode books nothing.
    expect(w.state.park.cash).toBe(cash);
    expect(validateState(w.state)).toBeNull();
  });

  it('charges the build cost to construction outside setup mode, and allows exact cash (Review Focus 5)', () => {
    withUnlocked(() => {
      const w = makeTestWorld();
      w.state.park.cash = 150_000;
      const before = w.state.economy.ledger.at(-1)!.lines.construction;
      const r = executeCommand(w, { type: 'placeShowSite', defId: 'fireworks_launcher', x: 30, y: 30, rotation: 0 });
      expect(r.ok).toBe(true);
      expect(w.state.park.cash).toBe(0);
      expect(w.state.economy.ledger.at(-1)!.lines.construction - before).toBe(-150_000);
      const again = executeCommand(w, { type: 'placeShowSite', defId: 'fireworks_launcher', x: 33, y: 30, rotation: 0 });
      expect(again).toEqual({ ok: false, reason: 'Not enough cash' });
    });
  });

  it('keeps sites sorted by id', () => {
    const w = makeTestWorld();
    const a = placeSite(w, 'fireworks_launcher', 10, 10);
    const b = placeSite(w, 'lightshow_tower', 12, 10);
    expect(w.state.shows.map((s) => s.id)).toEqual([a.id, b.id]);
    expect(a.id).toBeLessThan(b.id);
  });

  it('is locked outside setup mode while the build phase hides Phase 6 content (W4-D raises it)', () => {
    const w = makeTestWorld();
    const before = stateHash(w);
    expect(executeCommand(w, { type: 'placeShowSite', defId: 'lightshow_tower', x: 20, y: 20, rotation: 0 })).toEqual({ ok: false, reason: 'Not unlocked' });
    expect(stateHash(w)).toBe(before);
  });

  it('rejects bad command data with its string and changes nothing', () => {
    const w = makeTestWorld();
    const before = stateHash(w);
    const bad: Array<[Record<string, unknown>, string]> = [
      [{ defId: 'castle', x: 20, y: 20, rotation: 0 }, SHOW_ERR.unknown],
      [{ defId: 'lightshow_tower', x: 20, y: 20, rotation: 4 }, SHOW_ERR.badRotation],
      [{ defId: 'lightshow_tower', x: 20.5, y: 20, rotation: 0 }, SHOW_ERR.outsidePark],
      [{ defId: 'lightshow_tower', x: 63, y: 20, rotation: 0 }, SHOW_ERR.outsidePark],
      [{ defId: 'lightshow_tower', x: -1, y: 20, rotation: 0 }, SHOW_ERR.outsidePark],
    ];
    for (const [cmd, reason] of bad) {
      expect(executeCommand(w, { type: 'placeShowSite', ...cmd } as never, SETUP), JSON.stringify(cmd)).toEqual({ ok: false, reason });
    }
    expect(stateHash(w)).toBe(before);
  });

  it('every footprint tile must be owned (the Phase 4 land strings)', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    // The outer ring is not owned.
    expect(executeCommand(w, { type: 'placeShowSite', defId: 'lightshow_tower', x: 0, y: 20, rotation: 0 }, SETUP)).toEqual({ ok: false, reason: TERRAIN_ERR.outsidePark });
    map.owned[tileIndex(map, 21, 21)] = Owned.RightsOwned;
    expect(executeCommand(w, { type: 'placeShowSite', defId: 'lightshow_tower', x: 20, y: 20, rotation: 0 }, SETUP)).toEqual({ ok: false, reason: TERRAIN_ERR.onlyRights });
  });

  it('every tile must be empty: path, ride or stall, show site, track, entrance, scenery', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    const place = (x: number, y: number) => executeCommand(w, { type: 'placeShowSite', defId: 'lightshow_tower', x, y, rotation: 0 }, SETUP);
    placeFootpath(w, 11, 11);
    expect(place(10, 10)).toEqual({ ok: false, reason: SHOW_ERR.pathInWay });
    map.content[tileIndex(map, 15, 16)] = Content.Queue;
    expect(place(15, 15)).toEqual({ ok: false, reason: SHOW_ERR.pathInWay });
    placeRideDirect(w, 'carousel', 20, 20);
    expect(place(19, 19)).toEqual({ ok: false, reason: SHOW_ERR.rideOrStallInWay });
    placeSite(w, 'fireworks_launcher', 41, 41);
    expect(place(40, 40)).toEqual({ ok: false, reason: SHOW_ERR.rideOrStallInWay });
    map.content[tileIndex(map, 46, 45)] = Content.Track;
    expect(place(45, 45)).toEqual({ ok: false, reason: SHOW_ERR.trackInWay });
    // The entrance stub path.
    expect(place(30, 61)).toEqual({ ok: false, reason: SHOW_ERR.pathInWay });
    map.content[tileIndex(map, 6, 6)] = Content.Scenery;
    map.contentRef[tileIndex(map, 6, 6)] = allocId(w.state);
    expect(checkShowPlacement(w, { defId: 'lightshow_tower', x: 5, y: 5, rotation: 0 }, SETUP)).toMatchObject({ ok: false, reason: SHOW_ERR.sceneryInWay });
    // The entrance tile itself (the stub north of it is a path).
    const e = map.entranceTile;
    const ex = e % map.width;
    map.owned[tileIndex(map, ex + 1, 63)] = Owned.Owned;
    expect(checkShowPlacement(w, { defId: 'fireworks_launcher', x: ex, y: 63, rotation: 0 }, SETUP)).toMatchObject({ ok: false, reason: SHOW_ERR.entranceInWay });
  });

  it('needs flat land at one height, then dry land', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    const place = () => executeCommand(w, { type: 'placeShowSite', defId: 'lightshow_tower', x: 20, y: 20, rotation: 0 }, SETUP);
    map.slope[tileIndex(map, 21, 21)] = 1;
    expect(place()).toEqual({ ok: false, reason: SHOW_ERR.notFlat });
    map.slope[tileIndex(map, 21, 21)] = 0;
    map.heights[tileIndex(map, 21, 20)] = 9;
    expect(place()).toEqual({ ok: false, reason: SHOW_ERR.notFlat });
    map.heights[tileIndex(map, 21, 20)] = 8;
    map.water[tileIndex(map, 20, 21)] = 9;
    expect(place()).toEqual({ ok: false, reason: SHOW_ERR.inWater });
    expect(SHOW_ERR.inWater).toBe('Show sites cannot go in water');
    map.water[tileIndex(map, 20, 21)] = 0;
    expect(place().ok).toBe(true);
  });

  it('needs clearance: no elevated path over a footprint tile', () => {
    const w = makeTestWorld();
    w.state.elevatedPaths.push({ id: allocId(w.state), x: 21, y: 20, z: 12, kind: 'footpath', rampDir: -1 });
    expect(executeCommand(w, { type: 'placeShowSite', defId: 'lightshow_tower', x: 20, y: 20, rotation: 0 }, SETUP)).toEqual({ ok: false, reason: TERRAIN_ERR.noClearance });
  });

  it('the rule order: ownership before content, content before flatness, flatness before water, all before cash', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    w.state.park.cash = 0;
    map.water[tileIndex(map, 20, 20)] = 9;
    map.slope[tileIndex(map, 21, 20)] = 2;
    placeFootpath(w, 21, 21);
    map.owned[tileIndex(map, 20, 21)] = Owned.NotOwned;
    const req = { defId: 'lightshow_tower', x: 20, y: 20, rotation: 0 } as const;
    // The lock comes first (skipped in setup mode).
    expect(checkShowPlacement(w, req, PLAY)).toMatchObject({ ok: false, reason: SHOW_ERR.notUnlocked });
    withUnlocked(() => {
      const check = () => checkShowPlacement(w, req, PLAY);
      expect(check()).toMatchObject({ ok: false, reason: TERRAIN_ERR.outsidePark });
      map.owned[tileIndex(map, 20, 21)] = Owned.Owned;
      expect(check()).toMatchObject({ ok: false, reason: SHOW_ERR.pathInWay });
      map.content[tileIndex(map, 21, 21)] = Content.Empty;
      expect(check()).toMatchObject({ ok: false, reason: SHOW_ERR.notFlat });
      map.slope[tileIndex(map, 21, 20)] = 0;
      expect(check()).toMatchObject({ ok: false, reason: SHOW_ERR.inWater });
      map.water[tileIndex(map, 20, 20)] = 0;
      expect(check()).toMatchObject({ ok: false, reason: SHOW_ERR.notEnoughCash });
      w.state.park.cash = 250_000;
      expect(check()).toMatchObject({ ok: true, cost: 250_000 });
    });
  });

  it('marks the pathing network dirty: the new site has viewing tiles and a reachable field at once', () => {
    const w = showWorld();
    const entranceSide = tileIndex(w.state.map, 31, 59);
    const site = placeSite(w, 'lightshow_tower', 30, 36);
    expect(viewingTiles(w, site.id).length).toBeGreaterThan(0);
    expect(distanceTo(w, entranceSide, `show:${site.id}`)).not.toBeNull();
  });
});

describe('demolish on a show site (master R15)', () => {
  it('refunds 50% of the build cost to demolitionRefunds and clears every footprint tile', () => {
    const w = makeTestWorld();
    const site = placeSite(w, 'lightshow_tower', 20, 20);
    const tiles = showSiteTiles(w, site);
    const cash = w.state.park.cash;
    const r = executeCommand(w, { type: 'demolish', x: 21, y: 21 });
    expect(r).toEqual({ ok: true, cost: -125_000, warnings: [] });
    expect(w.state.park.cash).toBe(cash + 125_000);
    expect(w.state.economy.ledger.at(-1)!.lines.demolitionRefunds).toBe(125_000);
    expect(w.state.shows).toEqual([]);
    for (const t of tiles) {
      expect(w.state.map.content[t]).toBe(Content.Empty);
      expect(w.state.map.contentRef[t]).toBe(-1);
    }
    expect(showSiteRefund(150_001)).toBe(75_000);
    expect(validateState(w.state)).toBeNull();
  });

  it('setup mode removes without a ledger line', () => {
    const w = makeTestWorld();
    placeSite(w, 'fireworks_launcher', 20, 20);
    const cash = w.state.park.cash;
    expect(executeCommand(w, { type: 'demolish', x: 20, y: 20 }, SETUP)).toEqual({ ok: true, cost: -75_000, warnings: [] });
    expect(w.state.park.cash).toBe(cash);
  });
});

describe('asset value (master R14)', () => {
  it('counts each site by its build cost and age', () => {
    const w = makeTestWorld();
    expect(showSitesAssetValue(w)).toBe(0);
    const a = placeSite(w, 'lightshow_tower', 20, 20);
    placeSite(w, 'fireworks_launcher', 30, 20);
    expect(showSitesAssetValue(w)).toBe(250_000 + 150_000);
    a.builtTick -= 30 * TICKS_PER_MONTH;
    expect(showSitesAssetValue(w)).toBe(assetValue(250_000, 30) + 150_000);
    expect(defOf('lightshow_tower').buildCost).toBe(250_000);
  });
});

