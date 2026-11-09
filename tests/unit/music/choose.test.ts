/** Theme choice from the scenery in view (Phase 6 §4.3 "Theme choice"). Owner: W4-B. */
import { describe, expect, it } from 'vitest';
import { chooseMusic, chooseTheme, viewTilesForCamera, type ViewTiles } from '../../../src/audio/music';
import { getSceneryDef } from '../../../src/data/catalog';
import { GROUND_LEVEL } from '../../../src/data/tuning/core';
import type { Dir } from '../../../src/sim/map';
import type { World } from '../../../src/sim/types';
import type { Camera } from '../../../src/render/types';
import { mapToView } from '../../../src/render/view';
import { makeTestWorld } from '../../helpers/world';

/** Scenery written straight into the slice: theme choice only reads `state.scenery`. */
function put(world: World, defId: string, x: number, y: number, rotation: Dir = 0): void {
  if (!getSceneryDef(defId)) throw new Error(`no scenery ${defId}`);
  const s = world.state;
  const id = 900_000 + s.scenery.length;
  s.scenery.push({ id, defId, x, y, z: GROUND_LEVEL, rotation, edge: -1, waterLevel: 255 });
}

const VIEW: ViewTiles = { x0: 10, y0: 10, x1: 19, y1: 19 };

describe('chooseTheme', () => {
  it('defaults to Classic Fair with no themed scenery in view', () => {
    const w = makeTestWorld();
    expect(chooseTheme(w, VIEW)).toBe('classic_fair');
    put(w, 'oak_round', 12, 12);
    put(w, 'willow', 13, 12);
    expect(chooseTheme(w, VIEW)).toBe('classic_fair');
  });

  it('picks the theme with the most items in view; base items do not count', () => {
    const w = makeTestWorld();
    put(w, 'snowman', 11, 11);
    put(w, 'statue_frost', 12, 11);
    put(w, 'ice_arch', 13, 11);
    put(w, 'steam_vent', 14, 14);
    put(w, 'statue_spark', 15, 14);
    for (let i = 0; i < 5; i++) put(w, 'oak_round', 10 + i, 18);
    expect(chooseTheme(w, VIEW)).toBe('frost_peaks');
    put(w, 'steam_vent', 16, 14);
    put(w, 'steam_vent', 17, 14);
    expect(chooseTheme(w, VIEW)).toBe('volcano_ridge');
  });

  it('counts only items in the view rectangle (inclusive edges)', () => {
    const w = makeTestWorld();
    put(w, 'fog_pot', 10, 10);
    put(w, 'fog_pot', 19, 19);
    for (let i = 0; i < 4; i++) put(w, 'lily_pond', 30 + i, 30);
    put(w, 'lily_pond', 9, 15);
    put(w, 'lily_pond', 20, 15);
    expect(chooseTheme(w, VIEW)).toBe('spooky_hollow');
  });

  it('counts an item whose footprint reaches into the view', () => {
    const w = makeTestWorld();
    // A 2 × 2 Glow Pit at (9, 9) covers (10, 10); a 2 × 1 item turned to 1 × 2 at (20, 18) does not reach (19, …).
    put(w, 'magma_pool', 9, 9);
    put(w, 'rope_bridge_decor', 20, 18, 1);
    expect(chooseTheme(w, VIEW)).toBe('volcano_ridge');
    put(w, 'rope_bridge_decor', 18, 12, 0);
    put(w, 'rope_bridge_decor', 18, 13, 0);
    expect(chooseTheme(w, VIEW)).toBe('jungle_lagoon');
  });

  it('ties go to the theme playing now, else to the first theme in table order', () => {
    const w = makeTestWorld();
    put(w, 'star_beacon', 12, 12);
    put(w, 'star_beacon', 13, 12);
    put(w, 'fog_pot', 12, 13);
    put(w, 'fog_pot', 13, 13);
    expect(chooseTheme(w, VIEW)).toBe('spooky_hollow');
    expect(chooseTheme(w, VIEW, 'starport')).toBe('starport');
    expect(chooseTheme(w, VIEW, 'frost_peaks')).toBe('spooky_hollow');
    put(w, 'bunting_pole', 14, 14);
    put(w, 'bunting_pole', 15, 14);
    expect(chooseTheme(w, VIEW, 'starport')).toBe('starport');
    expect(chooseTheme(w, VIEW)).toBe('classic_fair');
    put(w, 'fog_pot', 14, 13);
    expect(chooseTheme(w, VIEW, 'starport')).toBe('spooky_hollow');
  });

  it('an empty rectangle counts nothing', () => {
    const w = makeTestWorld();
    put(w, 'fog_pot', 12, 12);
    expect(chooseTheme(w, { x0: 5, y0: 5, x1: 4, y1: 4 })).toBe('classic_fair');
  });
});

describe('chooseMusic', () => {
  it('the title screen plays the Title theme by day; in game the theme in view, night with After Dark at night', () => {
    const w = makeTestWorld();
    w.state.park.afterDark = false;
    put(w, 'fog_pot', 12, 12);
    expect(chooseMusic(w, VIEW, true)).toEqual({ theme: 'title', night: false });
    expect(chooseMusic(null, null, false)).toEqual({ theme: 'title', night: false });
    expect(chooseMusic(w, VIEW, false)).toEqual({ theme: 'spooky_hollow', night: false });
    w.state.tick = 21 * 50; // 21:00
    expect(chooseMusic(w, VIEW, false).night).toBe(false);
    w.state.park.afterDark = true;
    expect(chooseMusic(w, VIEW, false)).toEqual({ theme: 'spooky_hollow', night: true });
    expect(chooseMusic(w, VIEW, true)).toEqual({ theme: 'title', night: false });
    w.state.tick = 12 * 50; // noon
    expect(chooseMusic(w, VIEW, false).night).toBe(false);
    put(w, 'star_beacon', 13, 13);
    expect(chooseMusic(w, VIEW, false, 'starport').theme).toBe('starport');
  });
});

describe('viewTilesForCamera', () => {
  /** Camera centred on the middle of map tile (x, y) at ground level. */
  function camOn(world: World, x: number, y: number, zoom: number, rotation: Dir): Camera {
    const map = world.state.map;
    const v = mapToView(x, y, rotation, map.width, map.height);
    const u = v.u + 0.5;
    const vv = v.v + 0.5;
    return { centerX: (u - vv) * 32, centerY: (u + vv) * 16 - GROUND_LEVEL * 8, zoom, rotation };
  }

  it('contains the tile at the screen centre in every view rotation', () => {
    const w = makeTestWorld();
    for (const r of [0, 1, 2, 3] as Dir[]) {
      const t = viewTilesForCamera(camOn(w, 20, 30, 1, r), 800, 600, w.state.map);
      expect(t.x0).toBeLessThanOrEqual(20);
      expect(t.x1).toBeGreaterThanOrEqual(20);
      expect(t.y0).toBeLessThanOrEqual(30);
      expect(t.y1).toBeGreaterThanOrEqual(30);
      // 800 × 600 px at zoom 1 is about 12.5 + 18.75 tiles across the diamond.
      expect(t.x1 - t.x0).toBeLessThan(40);
      expect(t.y1 - t.y0).toBeLessThan(40);
    }
  });

  it('grows when zoomed out and stays inside the map', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    const near = viewTilesForCamera(camOn(w, 32, 32, 2, 0), 800, 600, map);
    const far = viewTilesForCamera(camOn(w, 32, 32, 0.25, 0), 800, 600, map);
    expect(far.x1 - far.x0).toBeGreaterThan(near.x1 - near.x0);
    expect(far).toEqual({ x0: 0, y0: 0, x1: map.width - 1, y1: map.height - 1 });
    const corner = viewTilesForCamera(camOn(w, 0, 0, 1, 0), 800, 600, map);
    expect(corner.x0).toBe(0);
    expect(corner.y0).toBe(0);
  });

  it('feeds chooseTheme: themed items around the screen centre win', () => {
    const w = makeTestWorld();
    put(w, 'planet_globe', 40, 40);
    put(w, 'planet_globe', 41, 40);
    put(w, 'snowman', 5, 5);
    put(w, 'snowman', 6, 5);
    put(w, 'snowman', 7, 5);
    const view = viewTilesForCamera(camOn(w, 40, 40, 1, 2), 800, 600, w.state.map);
    expect(chooseTheme(w, view)).toBe('starport');
  });
});
