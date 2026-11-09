/** Phase 4 §4.7 light sources, light map, lit threshold, lit share. Owner: W3-F. */
import { describe, expect, it } from 'vitest';
import { getFlatRideDef, getSceneryDef } from '../../../src/data/catalog';
import { LIGHT_RADIUS, LIT_THRESHOLD } from '../../../src/data/tuning/night';
import { allocId } from '../../../src/sim/ids';
import { isLit, lightAt, litShare, markLightDirty } from '../../../src/sim/lighting/api';
import { computeLightRaw, LightKind, lightRawNow, lightSources, lightVersion, litValue } from '../../../src/sim/lighting/lightMap';
import { stampValue } from '../../../src/sim/lighting/stamps';
import { extent, footprintTiles } from '../../../src/sim/footprint';
import { Content, PathItem, tileIndex, type Dir } from '../../../src/sim/map';
import { rngInt } from '../../../src/sim/rng';
import type { Ride } from '../../../src/sim/rides/types';
import type { Scenery } from '../../../src/sim/scenery/types';
import type { World } from '../../../src/sim/types';
import { makeTestWorld, makeTrackRideDataDirect, placeFootpath, placeQueue, placeRideDirect, placeStallDirect, stateHash } from '../../helpers/world';

function noEntrance(w: World): void {
  const map = w.state.map;
  map.content[map.entranceTile] = Content.Empty;
}

function lampAt(w: World, x: number, y: number): number {
  const i = placeFootpath(w, x, y);
  w.state.map.pathItem[i] = PathItem.Lamp;
  return i;
}

function sceneryDirect(w: World, defId: string, x: number, y: number, rotation: Dir = 0): Scenery {
  const item: Scenery = { id: allocId(w.state), defId, x, y, z: w.state.map.heights[tileIndex(w.state.map, x, y)] as number, rotation, edge: -1, waterLevel: 255 };
  w.state.scenery.push(item);
  markLightDirty(w, tileIndex(w.state.map, x, y));
  return item;
}

function trackRideDirect(w: World, typeId: string, x: number, y: number, rotation: Dir = 1): Ride {
  const ride = placeRideDirect(w, 'carousel', 2, 2, 0);
  // Re-shape the flat helper record into a track ride (station origin, no footprint content).
  const map = w.state.map;
  for (const t of footprintTiles(map, 2, 2, 3, 3, 0) ?? []) {
    map.content[t] = Content.Empty;
    map.contentRef[t] = -1;
  }
  Object.assign(ride, { kind: 'track', defId: typeId, name: typeId, x, y, rotation, entrance: null, exit: null });
  makeTrackRideDataDirect(w, ride);
  return ride;
}

const at = (w: World, x: number, y: number): number => lightAt(w, tileIndex(w.state.map, x, y));

/** Independent reference: every source stamped with the float formula and Math.floor. */
function bruteForce(w: World): Uint16Array {
  const s = w.state;
  const map = s.map;
  const out = new Uint16Array(map.width * map.height);
  const add = (tile: number, r: number): void => {
    const x0 = tile % map.width;
    const y0 = (tile - x0) / map.width;
    for (let y = Math.max(0, y0 - r); y <= Math.min(map.height - 1, y0 + r); y++) {
      for (let x = Math.max(0, x0 - r); x <= Math.min(map.width - 1, x0 + r); x++) {
        const q = (x - x0) ** 2 + (y - y0) ** 2;
        if (q > r * r) continue;
        const j = y * map.width + x;
        out[j] = out[j]! + Math.floor((255 * (r + 1 - Math.sqrt(q))) / (r + 1) + 1e-9);
      }
    }
  };
  for (let i = 0; i < out.length; i++) {
    if (map.pathItem[i] === PathItem.Lamp && (map.pathItemFlags[i]! & 1) === 0) add(i, 3);
  }
  if (map.entranceTile >= 0 && map.content[map.entranceTile] === Content.ParkEntrance) add(map.entranceTile, 4);
  for (const st of s.stalls) if (st.open) add(st.y * map.width + st.x, 1);
  for (const r of s.rides) {
    if (r.status !== 'open') continue;
    if (r.kind === 'flat') {
      const def = getFlatRideDef(r.defId)!;
      for (const t of footprintTiles(map, r.x, r.y, def.w, def.d, r.rotation) ?? []) add(t, 2);
    } else {
      for (const p of s.track.rides[String(r.id)]!.pieces) {
        if (p.defId !== 'station') break;
        add(p.y * map.width + p.x, 2);
      }
    }
  }
  for (const it of s.scenery) {
    const def = getSceneryDef(it.defId)!;
    if (!def.light) continue;
    const { ex, ey } = extent(def.w, def.d, it.rotation);
    for (let y = it.y; y < it.y + ey; y++) for (let x = it.x; x < it.x + ex; x++) add(y * map.width + x, def.w * def.d > 1 ? 3 : 2);
  }
  return out;
}

function bruteShare(w: World, raw: Uint16Array): number {
  const s = w.state;
  let paths = 0;
  let lit = 0;
  for (let i = 0; i < raw.length; i++) {
    if (s.map.content[i] !== Content.Footpath) continue;
    paths++;
    if (raw[i]! >= LIT_THRESHOLD) lit++;
  }
  for (const p of s.elevatedPaths) {
    if (p.kind !== 'footpath') continue;
    paths++;
    if (raw[p.y * s.map.width + p.x]! >= LIT_THRESHOLD) lit++;
  }
  return paths === 0 ? 1 : lit / paths;
}

describe('light sources and radii (Phase 4 §4.7 table)', () => {
  it('a path lamp stamps radius 3 with the Euclidean table', () => {
    const w = makeTestWorld();
    lampAt(w, 10, 10);
    expect(at(w, 10, 10)).toBe(255);
    expect(at(w, 11, 10)).toBe(191);
    expect(at(w, 11, 11)).toBe(164);
    expect(at(w, 12, 11)).toBe(112);
    expect(at(w, 12, 12)).toBe(74);
    expect(at(w, 13, 10)).toBe(63);
    expect(at(w, 13, 11)).toBe(0);
    expect(at(w, 14, 10)).toBe(0);
  });

  it('a broken lamp gives no light (Phase 3 §4.4) and a repaired one shines again', () => {
    const w = makeTestWorld();
    const i = lampAt(w, 10, 10);
    w.state.map.pathItemFlags[i] = 1;
    expect(at(w, 10, 10)).toBe(0);
    w.state.map.pathItemFlags[i] = 0;
    expect(at(w, 10, 10)).toBe(255);
  });

  it('benches and bins give no light; removing a lamp removes its stamp', () => {
    const w = makeTestWorld();
    const i = lampAt(w, 10, 10);
    expect(at(w, 10, 10)).toBe(255);
    w.state.map.pathItem[i] = PathItem.Bench;
    expect(at(w, 10, 10)).toBe(0);
    w.state.map.pathItem[i] = PathItem.Bin;
    expect(at(w, 10, 10)).toBe(0);
  });

  it('the park entrance stamps radius 4', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    const ex = map.entranceTile % map.width;
    const ey = Math.floor(map.entranceTile / map.width);
    expect(at(w, ex, ey)).toBe(255);
    expect(at(w, ex, ey - 3)).toBe(stampValue(4, 9));
    expect(at(w, ex, ey - 4)).toBe(stampValue(4, 16));
    expect(at(w, ex, ey - 5)).toBe(0);
  });

  it('an open flat ride stamps radius 2 from every footprint tile; closed or broken rides are dark', () => {
    const w = makeTestWorld();
    noEntrance(w);
    const ride = placeRideDirect(w, 'carousel', 20, 20, 0);
    expect(at(w, 21, 21)).toBe(0);
    ride.status = 'open';
    const expected = bruteForce(w);
    expect(at(w, 21, 21)).toBe(Math.min(255, expected[tileIndex(w.state.map, 21, 21)]!));
    expect(at(w, 18, 21)).toBe(stampValue(2, 4));
    expect(at(w, 17, 21)).toBe(0);
    ride.status = 'broken';
    expect(at(w, 21, 21)).toBe(0);
    ride.status = 'open';
    expect(at(w, 18, 21)).toBe(stampValue(2, 4));
    ride.status = 'closed';
    expect(at(w, 18, 21)).toBe(0);
  });

  it('an open track ride stamps radius 2 from each station tile', () => {
    const w = makeTestWorld();
    noEntrance(w);
    const ride = trackRideDirect(w, 'ghost_train', 30, 30, 1);
    expect(at(w, 30, 30)).toBe(0);
    ride.status = 'open';
    // Stations at (30..32, 30) heading east.
    expect(at(w, 34, 30)).toBe(stampValue(2, 4));
    expect(at(w, 35, 30)).toBe(0);
    expect(at(w, 28, 30)).toBe(stampValue(2, 4));
    expect(Array.from(computeLightRaw(w))).toEqual(Array.from(bruteForce(w)));
  });

  it('an open stall stamps radius 1; a closed stall is dark', () => {
    const w = makeTestWorld();
    noEntrance(w);
    const st = placeStallDirect(w, 'snack_shack', 40, 40, 2);
    expect(at(w, 40, 40)).toBe(255);
    expect(at(w, 41, 40)).toBe(stampValue(1, 1));
    expect(at(w, 41, 41)).toBe(0);
    st.open = false;
    expect(at(w, 40, 40)).toBe(0);
  });

  it('scenery with flag L: radius 2 for 1×1, radius 3 from every tile of a 2×2; others give no light', () => {
    const w = makeTestWorld();
    noEntrance(w);
    sceneryDirect(w, 'lamp_globe', 10, 10);
    expect(at(w, 10, 10)).toBe(255);
    expect(at(w, 12, 10)).toBe(stampValue(LIGHT_RADIUS.scenery1x1, 4));
    expect(at(w, 13, 10)).toBe(0);
    sceneryDirect(w, 'oak_round', 30, 10);
    expect(at(w, 30, 10)).toBe(0);
    sceneryDirect(w, 'fountain_carved', 40, 40);
    expect(at(w, 44, 40)).toBe(stampValue(3, 9));
    expect(Array.from(computeLightRaw(w))).toEqual(Array.from(bruteForce(w)));
  });

  it('removing a scenery item removes its light', () => {
    const w = makeTestWorld();
    noEntrance(w);
    sceneryDirect(w, 'ghost_lantern', 10, 10);
    expect(at(w, 10, 10)).toBe(255);
    w.state.scenery.length = 0;
    markLightDirty(w, tileIndex(w.state.map, 10, 10));
    expect(at(w, 10, 10)).toBe(0);
  });

  it('stamps are clipped at the map edge', () => {
    const w = makeTestWorld();
    noEntrance(w);
    lampAt(w, 0, 0);
    expect(at(w, 0, 0)).toBe(255);
    expect(at(w, 3, 0)).toBe(63);
    expect(lightAt(w, -1)).toBe(0);
    expect(lightAt(w, 64 * 64)).toBe(0);
  });

  it('sums of stamps read as min(255, raw)', () => {
    const w = makeTestWorld();
    noEntrance(w);
    lampAt(w, 10, 10);
    lampAt(w, 11, 10);
    expect(at(w, 10, 10)).toBe(255);
    expect(computeLightRaw(w)[tileIndex(w.state.map, 10, 10)]).toBe(255 + 191);
  });
});

describe('lit threshold (96)', () => {
  it('a tile is lit when min(255, lightRaw) ≥ 96', () => {
    expect(litValue(95)).toBe(false);
    expect(litValue(LIT_THRESHOLD)).toBe(true);
    const w = makeTestWorld();
    const map = w.state.map;
    const ex = map.entranceTile % map.width;
    const ey = Math.floor(map.entranceTile / map.width);
    // Entrance radius 4: d = 3 → 102 (lit), d² = 10 → 93 (not lit).
    expect(at(w, ex, ey - 3)).toBe(102);
    expect(isLit(w, tileIndex(map, ex, ey - 3))).toBe(true);
    expect(at(w, ex + 1, ey - 3)).toBe(93);
    expect(isLit(w, tileIndex(map, ex + 1, ey - 3))).toBe(false);
  });
});

describe('lit share (footpath tiles)', () => {
  it('is 1 with no footpaths', () => {
    const w = makeTestWorld();
    for (let i = 0; i < w.state.map.content.length; i++) if (w.state.map.content[i] === Content.Footpath) w.state.map.content[i] = Content.Empty;
    expect(litShare(w)).toBe(1);
  });

  it('counts lit footpath tiles over all footpath tiles; queues do not count', () => {
    const w = makeTestWorld();
    // The 3 entrance stub tiles are lit by the entrance.
    expect(litShare(w)).toBe(1);
    placeFootpath(w, 10, 10);
    expect(litShare(w)).toBe(3 / 4);
    placeQueue(w, 10, 11);
    expect(litShare(w)).toBe(3 / 4);
    w.state.map.pathItem[tileIndex(w.state.map, 10, 10)] = PathItem.Lamp;
    expect(litShare(w)).toBe(1);
  });

  it('counts each elevated footpath once', () => {
    const w = makeTestWorld();
    w.state.elevatedPaths.push({ id: allocId(w.state), x: 5, y: 5, z: 12, kind: 'footpath', rampDir: -1 });
    w.state.elevatedPaths.push({ id: allocId(w.state), x: 6, y: 5, z: 12, kind: 'queue', rampDir: -1 });
    expect(litShare(w)).toBe(3 / 4);
    lampAt(w, 5, 6);
    expect(litShare(w)).toBe(5 / 5);
  });
});

describe('incremental updates equal a full rebuild', () => {
  it('after 1,000 seeded random operations', () => {
    const w = makeTestWorld(777);
    const s = w.state;
    const map = s.map;
    const rng = { rng: 4242 };
    const rides: Ride[] = [];
    for (const [x, y] of [[8, 8], [20, 8], [40, 30]] as const) rides.push(placeRideDirect(w, 'carousel', x, y, 0));
    rides.push(trackRideDirect(w, 'ghost_train', 30, 50, 1));
    const stalls = [placeStallDirect(w, 'snack_shack', 50, 10, 2), placeStallDirect(w, 'fizz_stand', 12, 40, 1)];
    const lights = ['lamp_globe', 'fountain_carved', 'oak_round', 'pumpkin_lantern', 'bandstand'];
    for (let op = 0; op < 1000; op++) {
      const kind = rngInt(rng, 0, 7);
      const x = rngInt(rng, 1, 62);
      const y = rngInt(rng, 1, 58);
      const i = tileIndex(map, x, y);
      switch (kind) {
        case 0: // lamp on/off
          if (map.content[i] === Content.Empty || map.content[i] === Content.Footpath) {
            map.content[i] = Content.Footpath;
            map.pathItem[i] = map.pathItem[i] === PathItem.Lamp ? PathItem.None : PathItem.Lamp;
          }
          break;
        case 1: // break or repair
          map.pathItemFlags[i] = (map.pathItemFlags[i]! ^ 1) & 1;
          break;
        case 2: // footpath on/off
          if (map.content[i] === Content.Empty) map.content[i] = Content.Footpath;
          else if (map.content[i] === Content.Footpath) map.content[i] = Content.Empty;
          break;
        case 3: {
          const r = rides[rngInt(rng, 0, rides.length - 1)]!;
          r.status = r.status === 'open' ? (rngInt(rng, 0, 1) ? 'closed' : 'broken') : 'open';
          break;
        }
        case 4: {
          const st = stalls[rngInt(rng, 0, stalls.length - 1)]!;
          st.open = !st.open;
          break;
        }
        case 5:
          if (x < 62 && y < 58) sceneryDirect(w, lights[rngInt(rng, 0, lights.length - 1)]!, x, y);
          break;
        case 6:
          if (s.scenery.length > 0) s.scenery.splice(rngInt(rng, 0, s.scenery.length - 1), 1);
          break;
        default:
          if (rngInt(rng, 0, 1) === 0 || s.elevatedPaths.length === 0) s.elevatedPaths.push({ id: allocId(s), x, y, z: 14, kind: rngInt(rng, 0, 1) ? 'footpath' : 'queue', rampDir: -1 });
          else s.elevatedPaths.splice(rngInt(rng, 0, s.elevatedPaths.length - 1), 1);
      }
      if (op % 50 === 49 || op === 999) {
        const expect255 = bruteForce(w);
        const raw = computeLightRaw(w);
        expect(Array.from(raw)).toEqual(Array.from(expect255));
        // The incremental map (kept since op 0) equals the rebuild tile by tile.
        expect(Array.from(lightRawNow(w))).toEqual(Array.from(raw));
        expect(lightAt(w, i)).toBe(Math.min(255, raw[i]!));
        expect(litShare(w)).toBeCloseTo(bruteShare(w, raw), 12);
      } else {
        // Keep the cache moving between checks (the diff runs at every query).
        lightAt(w, i);
      }
    }
  });
});

describe('derived data (not saved)', () => {
  it('queries never change the state hash', () => {
    const w = makeTestWorld();
    lampAt(w, 10, 10);
    const before = stateHash(w);
    lightAt(w, 0);
    litShare(w);
    lightSources(w);
    expect(stateHash(w)).toBe(before);
  });

  it('a loaded copy (new World, same state) rebuilds the same map', () => {
    const w = makeTestWorld();
    lampAt(w, 10, 10);
    placeStallDirect(w, 'snack_shack', 20, 20, 2);
    const copy: World = { state: structuredClone(w.state), events: [] };
    for (let t = 0; t < 64 * 64; t++) expect(lightAt(copy, t)).toBe(lightAt(w, t));
  });

  it('a replaced map is picked up', () => {
    const w = makeTestWorld();
    lampAt(w, 10, 10);
    expect(at(w, 10, 10)).toBe(255);
    const map = structuredClone(w.state.map);
    map.pathItem.fill(0);
    w.state.map = map;
    expect(at(w, 10, 10)).toBe(0);
  });

  it('a list out of id order (a slice contract break) is rebuilt from nothing, not mis-diffed', () => {
    const w = makeTestWorld();
    noEntrance(w);
    const a = sceneryDirect(w, 'lamp_globe', 10, 10);
    const b = sceneryDirect(w, 'lamp_globe', 20, 20);
    expect(at(w, 10, 10)).toBe(255);
    w.state.scenery.reverse();
    expect(at(w, 10, 10)).toBe(255);
    expect(at(w, 20, 20)).toBe(255);
    w.state.scenery.splice(w.state.scenery.indexOf(a), 1);
    expect(at(w, 10, 10)).toBe(0);
    expect(at(w, 20, 20)).toBe(255);
    expect(w.state.scenery).toEqual([b]);
  });

  it('markLightDirty before any query is harmless', () => {
    const w = makeTestWorld();
    expect(() => markLightDirty(w, 0)).not.toThrow();
  });
});

describe('render source list', () => {
  it('lists the entrance, open rides, open stalls, lit scenery, and lamps, and is rebuilt only after a change', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 20, 20, 0);
    ride.status = 'open';
    placeStallDirect(w, 'snack_shack', 40, 40, 2);
    sceneryDirect(w, 'fountain_carved', 10, 30);
    sceneryDirect(w, 'oak_round', 12, 30);
    lampAt(w, 10, 10);
    const a = lightSources(w);
    const kinds = Array.from(a.kind.subarray(0, a.count));
    expect(kinds).toEqual([LightKind.Entrance, LightKind.Ride, LightKind.Stall, LightKind.Scenery, LightKind.Lamp]);
    // The ride entry covers its 3 × 3 footprint; the 2 × 2 fountain its 4 tiles.
    expect([a.fx[1], a.fy[1], a.ex[1], a.ey[1]]).toEqual([21.5, 21.5, 3, 3]);
    expect([a.fx[3], a.fy[3], a.ex[3], a.ey[3], a.radius[3]]).toEqual([11, 31, 2, 2, 3]);
    expect(a.height[3]).toBe(3);
    const v = lightVersion(w);
    expect(lightSources(w)).toBe(a);
    expect(a.version).toBe(v);
    ride.status = 'closed';
    const b = lightSources(w);
    expect(b.count).toBe(4);
    expect(lightVersion(w)).toBeGreaterThan(v);
  });

  it('a lamp on an elevated path carries the path height', () => {
    const w = makeTestWorld();
    const id = allocId(w.state);
    w.state.elevatedPaths.push({ id, x: 15, y: 15, z: 16, kind: 'footpath', rampDir: -1 });
    const i = tileIndex(w.state.map, 15, 15);
    w.state.map.pathItem[i] = PathItem.Lamp;
    w.state.map.pathItemLevel[i] = id;
    const a = lightSources(w);
    const k = Array.from(a.kind.subarray(0, a.count)).indexOf(LightKind.Lamp);
    expect(a.tile[k]).toBe(i);
    expect(a.z[k]).toBe(16);
  });
});
