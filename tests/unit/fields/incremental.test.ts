/**
 * Incremental Calm and Buzz updates (Phase 4 §4.6, §9.1): after 1,000 random seeded operations the incremental
 * fields equal a full rebuild, the derived fields are rebuilt after a load, and they never enter the save.
 */
import { describe, expect, it } from 'vitest';
import { getSceneryDef, SCENERY } from '../../../src/data/catalog';
import { buzzAt, calmAt, markFieldsDirty } from '../../../src/sim/fields/api';
import { displayFieldValue, fieldsRaw, rebuildFieldsRaw } from '../../../src/sim/fields/store';
import { executeCommand } from '../../../src/sim/commands';
import { LITTER_CALM_PENALTY, MESS_CALM_PENALTY } from '../../../src/data/tuning/fields';
import { PathItem, type Dir } from '../../../src/sim/map';
import type { RideStatus } from '../../../src/sim/rides/types';
import type { SceneryEdge } from '../../../src/sim/scenery/types';
import type { World } from '../../../src/sim/types';
import { deserialize, serialize } from '../../../src/save';
import { makeTestWorld, placeRideDirect, runTicks, stateHash } from '../../helpers/world';
import { buildPhase1Park } from '../../integration/scenario';
import { addSceneryDirect, removeSceneryDirect, testRng, trackRideDirect } from './helpers';

const FLAT_IDS = ['carousel', 'big_wheel', 'swing_tower', 'teacup_twirl', 'flip_arm', 'drop_tower', 'pendulum_ship', 'mirror_maze'];
const TRACK_IDS = ['steel_coaster', 'junior_coaster', 'mini_railway', 'wooden_coaster', 'go_karts'];
const STATUSES: RideStatus[] = ['open', 'open', 'closed', 'broken', 'inspecting', 'stormHold', 'testing', 'building'];

function firstMismatch(a: Uint16Array, b: Uint16Array): number {
  if (a.length !== b.length) return -2;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
  return -1;
}

/** The fields the game reads now equal a full rebuild from the current state (raw and read values). */
function expectMatchesRebuild(w: World, label: string): void {
  const inc = fieldsRaw(w);
  const full = rebuildFieldsRaw(w);
  const mc = firstMismatch(inc.calm, full.calm);
  const mb = firstMismatch(inc.buzz, full.buzz);
  if (mc !== -1) expect(`${label}: calm differs at tile ${mc}: ${inc.calm[mc]} vs ${full.calm[mc]}`).toBe('');
  if (mb !== -1) expect(`${label}: buzz differs at tile ${mb}: ${inc.buzz[mb]} vs ${full.buzz[mb]}`).toBe('');
}

describe('incremental fields equal a full rebuild', () => {
  it('after 1,000 random seeded operations', () => {
    const w = makeTestWorld(99);
    const s = w.state;
    const map = s.map;
    const rnd = testRng(20261109);
    const int = (lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1));
    const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)] as T;
    const n = map.width * map.height;
    const counts: Record<string, number> = {};
    expectMatchesRebuild(w, 'start');
    for (let op = 0; op < 1_000; op++) {
      const kind = pick(['addScenery', 'addScenery', 'removeScenery', 'water', 'wet', 'height', 'bench', 'rideStatus', 'addRide', 'removeRide', 'litter', 'tick'] as const);
      counts[kind] = (counts[kind] ?? 0) + 1;
      switch (kind) {
        case 'addScenery': {
          const def = pick(SCENERY);
          const edge: SceneryEdge = def.edge ? (int(0, 3) as Dir) : -1;
          addSceneryDirect(w, def.id, int(0, map.width - 2), int(0, map.height - 2), {
            rotation: int(0, 3) as Dir,
            edge,
            waterLevel: def.needsWater ? int(0, 255) : 255,
          });
          break;
        }
        case 'removeScenery':
          if (s.scenery.length > 0) removeSceneryDirect(w, pick(s.scenery).id);
          break;
        case 'water': {
          // Gardens drain and are watered (W3-D marks the fields when an item crosses the wilt line).
          const gardens = s.scenery.filter((g) => getSceneryDef(g.defId)?.needsWater === true);
          if (gardens.length === 0) break;
          const g = pick(gardens);
          g.waterLevel = int(0, 255);
          markFieldsDirty(w, g.y * map.width + g.x);
          break;
        }
        case 'wet': {
          const i = int(0, n - 1);
          map.water[i] = pick([0, map.heights[i] as number, (map.heights[i] as number) + int(1, 3)]);
          markFieldsDirty(w, i);
          break;
        }
        case 'height': {
          const i = int(0, n - 1);
          map.heights[i] = Math.max(0, (map.heights[i] as number) + pick([-1, 1]));
          markFieldsDirty(w, i);
          break;
        }
        case 'bench': {
          const i = int(0, n - 1);
          map.pathItem[i] = pick([PathItem.None, PathItem.Bench, PathItem.Bench, PathItem.Bin, PathItem.Lamp]);
          // No mark: Build 1 path item commands do not call markFieldsDirty; the next tick finds the change.
          s.tick += 1;
          break;
        }
        case 'rideStatus': {
          // Ride status changes without a command hook: the fields module diffs them at the next tick.
          if (s.rides.length === 0) break;
          pick(s.rides).status = pick(STATUSES);
          s.tick += 1;
          break;
        }
        case 'addRide': {
          if (rnd() < 0.6) placeRideDirect(w, pick(FLAT_IDS), int(0, map.width - 5), int(0, map.height - 5), int(0, 3) as Dir).status = pick(STATUSES);
          else trackRideDirect(w, pick(TRACK_IDS), int(2, map.width - 8), int(2, map.height - 8), pick(STATUSES));
          s.tick += 1;
          break;
        }
        case 'removeRide': {
          if (s.rides.length === 0) break;
          const k = int(0, s.rides.length - 1);
          const [gone] = s.rides.splice(k, 1);
          delete s.track.rides[String(gone!.id)];
          s.tick += 1;
          break;
        }
        case 'litter': {
          const i = int(0, n - 1);
          map.litter[i] = int(0, 4);
          map.mess[i] = int(0, 2);
          break;
        }
        case 'tick':
          s.tick += 1;
          break;
      }
      expectMatchesRebuild(w, `op ${op} (${kind})`);
    }
    // Every operation kind ran many times, and the park ended up busy.
    for (const k of ['addScenery', 'removeScenery', 'water', 'wet', 'height', 'bench', 'rideStatus', 'addRide', 'removeRide', 'litter']) {
      expect(counts[k] ?? 0, k).toBeGreaterThan(40);
    }
    expect(s.scenery.length).toBeGreaterThan(50);
    // Read values follow the raw fields with the local penalties.
    const raw = fieldsRaw(w);
    for (let i = 0; i < n; i++) {
      const want = Math.min(255, Math.max(0, (raw.calm[i] as number) - LITTER_CALM_PENALTY * (map.litter[i] as number) - MESS_CALM_PENALTY * (map.mess[i] as number)));
      if (calmAt(w, i) !== want) expect(`calm read at ${i}`).toBe(`${want}`);
      if (buzzAt(w, i) !== Math.min(255, raw.buzz[i] as number)) expect(`buzz read at ${i}`).toBe('');
    }
  });

  it('a ride status change is seen at the next tick even after an outside read between ticks', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'flip_arm', 20, 20, 0);
    const tile = w.state.map.width * 25 + 21;
    expect(buzzAt(w, tile)).toBe(0);
    ride.status = 'open';
    // Same tick, no mark: the stale value is kept until the tick ends (deterministic sync points).
    expect(buzzAt(w, tile)).toBe(0);
    w.state.tick += 1;
    expect(buzzAt(w, tile)).toBeGreaterThan(0);
    // A mark makes the next read sync at once.
    ride.status = 'closed';
    markFieldsDirty(w, tile);
    expect(buzzAt(w, tile)).toBe(0);
  });
});

describe('derived data (Phase 4 §5)', () => {
  it('is never saved, and a loaded park rebuilds the same fields', () => {
    const w = makeTestWorld(5);
    addSceneryDirect(w, 'fountain_carved', 20, 20);
    addSceneryDirect(w, 'tent_red', 30, 30);
    addSceneryDirect(w, 'bed_tulip', 24, 20, { waterLevel: 10 });
    placeRideDirect(w, 'flip_arm', 40, 40, 0).status = 'open';
    const before = fieldsRaw(w);
    const json = serialize(w, 'test', '2026-11-09T00:00:00.000Z');
    expect(json).not.toMatch(/calm|buzz/i);
    const loaded = deserialize(json);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const after = fieldsRaw(loaded.world);
    expect(firstMismatch(before.calm, after.calm)).toBe(-1);
    expect(firstMismatch(before.buzz, after.buzz)).toBe(-1);
    expect(stateHash(loaded.world)).toBe(stateHash(w));
  });

  it('a replaced state (load into the same World object) is rebuilt, not diffed', () => {
    const a = makeTestWorld(1);
    addSceneryDirect(a, 'willow', 10, 10);
    const b = makeTestWorld(2);
    addSceneryDirect(b, 'willow', 40, 40);
    expect(calmAt(a, 10 * 64 + 10)).toBe(16);
    a.state = b.state;
    expect(calmAt(a, 10 * 64 + 10)).toBe(0);
    expect(calmAt(a, 40 * 64 + 40)).toBe(16);
  });
});

describe('determinism with derived fields (master 5.4)', () => {
  it('save and load between ticks, after a display read and a ride closed by command: the same game follows', () => {
    const w = makeTestWorld(31);
    const park = buildPhase1Park(w);
    // A garden and a bench along the loop, so Calm and Buzz both reach guests.
    addSceneryDirect(w, 'fountain_carved', 30, 50);
    addSceneryDirect(w, 'bed_tulip', 22, 55, { waterLevel: 70 });
    w.state.map.pathItem[59 * 64 + 30] = PathItem.Bench;
    runTicks(w, 2_000);
    expect(w.state.guests.length).toBeGreaterThan(10);
    // The renderer reads the fields between ticks; then the player closes a ride (no field mark) and saves.
    displayFieldValue(w, 'buzz', 50 * 64 + 35);
    expect(executeCommand(w, { type: 'setRideOpen', rideId: park.swingTower, open: false }).ok).toBe(true);
    const loaded = deserialize(serialize(w, 'test', '2026-11-09T00:00:00.000Z'));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    runTicks(w, 700);
    runTicks(loaded.world, 700);
    expect(stateHash(loaded.world)).toBe(stateHash(w));
  });
});
