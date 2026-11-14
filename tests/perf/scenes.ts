/**
 * Phase 6 §4.6 benchmark scenes (W4-E): four fixed parks saved as schema 3 saves next to this file.
 *
 * - `build1`: the master §10 Build 1 scene on the 64 × 64 map: 10 Mini Railway loops with 2 trains each (west half),
 *   a footpath grid with 14 flat rides, 4 stalls, bins, and benches (east half), 8 staff, and 2,000 guests.
 * - `build2`: the master §10 Build 2 scene on a 128 × 128 map: a footpath grid every 8 tiles, 24 flat rides with
 *   queues, 24 stalls, raised plateaus, a pond, painted ground, 60 scenery items, 2 show sites, 12 staff, and
 *   3,000 guests.
 * - `phone`: the master §10 phone scene: the `build1` park with 800 guests.
 *
 * Every guest is a real guest (needs, temperament, decisions), so a perf run measures real ticks. The track rides
 * are a test harness: they are set open without gates (no queue path can reach a station inside its loop), so
 * their trains run empty; they draw the same as full trains. The 2 show sites of `build2` are placed with W4-C's
 * `placeShowSite` and run every evening.
 *
 * Regenerate the files with `TC_WRITE_SCENES=1 npx vitest run tests/unit/perf/scenes.test.ts`.
 */
import { executeCommand, type Command } from '../../src/sim/commands';
import { Content } from '../../src/sim/map';
import { createWorld } from '../../src/sim/world';
import { stepTick } from '../../src/sim/tick';
import type { World } from '../../src/sim/types';
import type { StaffType } from '../../src/data/catalog/types';
import { canOpenTrackRide } from '../../src/sim/rides/track/api';
import { addGuestDirect } from '../helpers/world';
import { SCALE_SCENE, type PerfSceneId } from './sceneInfo';
import { FLAT_RIDES } from '../../src/data/catalog/flatRides';

export { PERF_SCENES, SCALE_SCENE, SCENE_SAVED_AT, type PerfSceneId, type PerfSceneInfo } from './sceneInfo';

/** Ticks run after the guests are placed, so they are spread over states before the save. */
const SETTLE_TICKS = 200;

function run(world: World, cmd: Command): number {
  const r = executeCommand(world, cmd, { setup: true });
  if (!r.ok) throw new Error(`${cmd.type}: ${r.reason} ${JSON.stringify(cmd)}`);
  return r.id ?? -1;
}

/** Tiny deterministic generator for placement (independent of the game RNG). */
function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

function hire(world: World, staff: Partial<Record<StaffType, number>>): void {
  for (const [type, n] of Object.entries(staff) as [StaffType, number][]) {
    for (let k = 0; k < n; k++) run(world, { type: 'hireStaff', staffType: type });
  }
}

/** Guests on random footpath tiles (x ≥ `minX`) with varied needs, entering over 10 ticks like arrivals do. */
function addGuests(world: World, count: number, seed: number, minX = 0): void {
  const map = world.state.map;
  const rnd = lcg(seed);
  const paths: number[] = [];
  for (let i = 0; i < map.content.length; i++) if (map.content[i] === Content.Footpath && i % map.width >= minX) paths.push(i);
  const perWave = Math.ceil(count / 10);
  for (let k = 0; k < count; k++) {
    if (k > 0 && k % perWave === 0) stepTick(world);
    addGuestDirect(world, paths[Math.floor(rnd() * paths.length)] as number, {
      temperament: Math.round((rnd() + rnd()) * 50),
      cash: 4000 + Math.floor(rnd() * 8000),
      needs: {
        hunger: Math.floor(rnd() * 200),
        thirst: Math.floor(rnd() * 200),
        bladder: Math.floor(rnd() * 180),
        energy: 120 + Math.floor(rnd() * 135),
        happiness: 140 + Math.floor(rnd() * 100),
        nausea: Math.floor(rnd() * 60),
      },
      items: { map: false, umbrella: false, balloon: k % 7 === 0, photo: false },
      nextDecisionTick: world.state.tick + (k % 40),
    });
  }
}

/** The Build 1 park (64 × 64) with `guests` guests. */
function buildBuild1(guests: number): World {
  const world = createWorld({ seed: 4242, parkName: 'Perf Park' });
  world.state.park.cash = 100_000_000;
  // 10 Mini Railway loops: a 2-tile station heading east and four medium turns (footprint x − 3 … x + 6, y … y + 8).
  const loop = ['station', 'straight', 'straight', 'turn_medium_right', 'straight', 'straight', 'straight', 'turn_medium_right',
    'straight', 'straight', 'straight', 'straight', 'turn_medium_right', 'straight', 'straight', 'straight', 'turn_medium_right'];
  const trackIds: number[] = [];
  for (const sx of [5, 16]) {
    for (const sy of [2, 13, 24, 35, 46]) {
      const id = run(world, { type: 'placeStation', typeId: 'mini_railway', x: sx, y: sy, dir: 1 });
      for (const defId of loop) run(world, { type: 'addTrackPiece', rideId: id, defId });
      run(world, { type: 'setTrainConfig', rideId: id, trains: 2, carsPerTrain: 3 });
      trackIds.push(id);
    }
  }
  // Harness: open without gates (see the file comment).
  for (const r of world.state.rides) if (trackIds.includes(r.id)) r.status = 'open';
  // Footpath grid in the east half (lines every 6 tiles), joined to the entrance stub at (31, 60).
  const xs = [26, 32, 38, 44, 50, 56];
  const ys = [2, 8, 14, 20, 26, 32, 38, 44, 50, 56];
  for (const y of ys) run(world, { type: 'buildPathLine', x0: 26, y0: y, x1: 56, y1: y, kind: 'footpath' });
  for (const x of xs) run(world, { type: 'buildPathLine', x0: x, y0: 2, x1: x, y1: 56, kind: 'footpath' });
  run(world, { type: 'buildPathLine', x0: 31, y0: 57, x1: 31, y1: 59, kind: 'footpath' });
  // 14 flat rides (exit on the north line, a 2-tile queue to the south line) and 4 stalls serving a west line. The
  // track loops have no gates, so these rides keep the crowd in the park (with 4, guests went home within a minute).
  const rides = ['carousel', 'teacup_twirl', 'big_wheel', 'swing_tower'];
  const cells: Array<[number, number]> = [];
  for (const x of xs.slice(1, 5)) cells.push([x, 26]);
  for (const y of [8, 44]) for (const x of xs.slice(0, 5)) cells.push([x, y]);
  cells.forEach(([x, y], k) => {
    const id = run(world, { type: 'placeRide', defId: rides[k % rides.length] as string, x: x + 2, y: y + 1, rotation: 0 });
    run(world, { type: 'buildPathLine', x0: x + 3, y0: y + 4, x1: x + 3, y1: y + 5, kind: 'queue' });
    run(world, { type: 'setRideOpen', rideId: id, open: true });
  });
  ['snack_shack', 'fizz_stand', 'restrooms', 'snack_shack'].forEach((defId, k) => {
    run(world, { type: 'placeStall', defId, x: (xs[1 + k] as number) + 1, y: 39, rotation: 3 });
  });
  for (const y of ys) {
    for (let x = 29; x < 56; x += 6) run(world, { type: 'buildPathItem', x, y, itemType: (x + y) % 12 === 1 ? 'bench' : 'bin' });
  }
  hire(world, { groundskeeper: 3, mechanic: 2, security: 2, performer: 1 });
  addGuests(world, guests, 777, 26);
  for (let k = 0; k < SETTLE_TICKS; k++) stepTick(world);
  return world;
}

/** The Build 2 park (128 × 128). */
function buildBuild2(): World {
  const world = createWorld({ seed: 9090, parkName: 'Big Perf Park', mapSize: 128 });
  world.state.park.cash = 500_000_000;
  const N = 128;
  // Footpath grid every 8 tiles, joined to the entrance stub at (31, 124).
  const lines: number[] = [];
  for (let v = 8; v <= 120; v += 8) lines.push(v);
  for (const v of lines) {
    run(world, { type: 'buildPathLine', x0: 8, y0: v, x1: 120, y1: v, kind: 'footpath' });
    run(world, { type: 'buildPathLine', x0: v, y0: 8, x1: v, y1: 120, kind: 'footpath' });
  }
  run(world, { type: 'buildPathLine', x0: 31, y0: 121, x1: 31, y1: N - 4, kind: 'footpath' });
  // Cells (L, M) = the grid line coordinates at their north-west corner; 14 × 14 cells.
  const cells: Array<[number, number]> = [];
  for (const m of lines.slice(0, -1)) for (const l of lines.slice(0, -1)) cells.push([l, m]);
  const rnd = lcg(31337);
  const rideIds = ['carousel', 'teacup_twirl', 'big_wheel', 'swing_tower'];
  const stallIds = ['snack_shack', 'fizz_stand', 'restrooms', 'balloon_stand'];
  // 24 rides with a 4-tile queue to the south line, and a stall in the same cell serving the west line.
  let k = 0;
  for (let i = 0; i < cells.length && k < 24; i += 7) {
    const [l, m] = cells[i] as [number, number];
    const id = run(world, { type: 'placeRide', defId: rideIds[k % rideIds.length] as string, x: l + 2, y: m + 1, rotation: 0 });
    run(world, { type: 'buildPathLine', x0: l + 3, y0: m + 4, x1: l + 3, y1: m + 7, kind: 'queue' });
    run(world, { type: 'setRideOpen', rideId: id, open: true });
    run(world, { type: 'placeStall', defId: stallIds[k % stallIds.length] as string, x: l + 1, y: m + 5, rotation: 3 });
    k++;
  }
  // Plateaus (cliffs to the paths around them), a pond, and painted ground in other cells.
  for (const i of [3, 17, 45, 66, 101, 150, 172]) {
    const [l, m] = cells[i] as [number, number];
    run(world, { type: 'levelLand', x0: l + 2, y0: m + 2, x1: l + 6, y1: m + 6, targetHeight: 10 + (i % 3) });
  }
  for (const i of [24, 120]) {
    const [l, m] = cells[i] as [number, number];
    run(world, { type: 'levelLand', x0: l + 2, y0: m + 2, x1: l + 6, y1: m + 6, targetHeight: 6 });
    for (const y of [m + 3, m + 5]) for (const x of [l + 3, l + 5]) run(world, { type: 'raiseWater', x, y, size: 3 });
  }
  for (const i of [10, 60, 130]) {
    const [l, m] = cells[i] as [number, number];
    run(world, { type: 'paintTerrain', x: l + 4, y: m + 4, size: 5, terrain: i === 60 ? 1 : 2 });
  }
  // 60 scenery items (trees, shrubs, flower beds, tents) in free cells.
  const items = ['oak_round', 'pine_tall', 'birch_silver', 'willow', 'shrub_round', 'boulder', 'lamp_globe', 'bunting_pole'];
  let placed = 0;
  for (let i = 1; i < cells.length && placed < 60; i += 3) {
    const [l, m] = cells[i] as [number, number];
    const x = l + 1 + Math.floor(rnd() * 6);
    const y = m + 1 + Math.floor(rnd() * 6);
    const r = executeCommand(world, { type: 'placeScenery', defId: items[placed % items.length] as string, x, y, rotation: 0, edge: -1 }, { setup: true });
    if (r.ok) placed++;
  }
  // 2 show sites (W4-C's placeShowSite), shows every evening: the Lightshow at 21:00, the Fireworks at 22:30.
  const sites: Array<[string, number, number, number, 0 | 30]> = [
    ['lightshow_tower', 74, 98, 21, 0],
    ['fireworks_launcher', 77, 101, 22, 30],
  ];
  for (const [defId, x, y, hour, minute] of sites) {
    const id = run(world, { type: 'placeShowSite', defId, x, y, rotation: 0 });
    run(world, { type: 'setShowSchedule', id, hour, minute, everyNDays: 1 });
    run(world, { type: 'setShowEnabled', id, enabled: true });
  }
  hire(world, { groundskeeper: 5, mechanic: 3, security: 2, performer: 2 });
  addGuests(world, 3_000, 4711);
  for (let t = 0; t < SETTLE_TICKS; t++) stepTick(world);
  return world;
}

/**
 * The coaster test park (stage 1 realistic art test): the 64 × 64 map, one Steel Coaster (a 24 m lift and drop:
 * station, chain lift, steep drop, three curves, supports, 2 trains × 4 cars), a carousel, a snack shack, 20
 * scenery items, and 600 guests; the camera focuses on the coaster. The coaster is built with the real track
 * path (gates, test run) and `canOpenTrackRide` returns null.
 */
/**
 * The coaster circuit: R1's block-brake layout with a taller lift and drop. Rail heights step by 1, 2, 4 and 6 m in
 * pairs (up then back to flat), so a lift is always an even number of metres: 24 m is the closest to the brief's
 * 25 m. The drop mirrors the lift, 24 m from the 32 m crest to the 8 m ground. The west leg gains 2 straights and the north leg
 * 2, to close the circuit round the 2 tiles the lift and the drop each gained.
 */
const COASTER_PIECES: Array<string | { id: string; chain?: boolean; brakeSpeed?: number }> = [
  'station', 'station',
  ...['flat_to_gentle_up', 'gentle_up', 'gentle_to_steep_up', 'steep_up', 'steep_up', 'steep_to_gentle_up', 'gentle_up_to_flat'].map((id) => ({ id, chain: true })),
  'block_brake', { id: 'straight', chain: true }, 'turn_medium_right',
  'flat_to_gentle_down', 'gentle_down', 'gentle_to_steep_down', 'steep_down', 'steep_down', 'steep_to_gentle_down', 'gentle_down_to_flat',
  { id: 'brakes', brakeSpeed: 8 }, 'turn_medium_right',
  'straight', 'straight', 'straight', 'straight', 'block_brake',
  { id: 'flat_to_gentle_up', chain: true }, { id: 'gentle_up_to_flat', chain: true }, 'flat_to_gentle_down', 'gentle_down_to_flat',
  'straight', 'straight', 'straight', 'turn_medium_right', 'block_brake',
  { id: 'flat_to_gentle_up', chain: true }, { id: 'gentle_up_to_flat', chain: true }, 'flat_to_gentle_down', 'gentle_down_to_flat',
  'straight', 'straight', 'straight', 'turn_medium_right',
];

function buildCoaster(): World {
  const world = createWorld({ seed: 5150, parkName: 'Coaster Perf Park' });
  world.state.park.cash = 100_000_000;
  // Paths first so the drop's support skips its tile over the footpath (span rule), as in the R1 park.
  run(world, { type: 'buildPathLine', x0: 31, y0: 59, x1: 31, y1: 6, kind: 'footpath' });
  run(world, { type: 'buildPathLine', x0: 30, y0: 6, x1: 5, y1: 6, kind: 'footpath' });
  run(world, { type: 'buildPathLine', x0: 6, y0: 4, x1: 6, y1: 5, kind: 'footpath' });
  run(world, { type: 'buildPathLine', x0: 4, y0: 4, x1: 4, y1: 6, kind: 'queue' });
  const id = run(world, { type: 'placeStation', typeId: 'steel_coaster', x: 4, y: 2, dir: 1 });
  for (const spec of COASTER_PIECES) {
    const p = typeof spec === 'string' ? { id: spec } : spec;
    run(world, { type: 'addTrackPiece', rideId: id, defId: p.id, chain: p.chain, brakeSpeed: p.brakeSpeed });
  }
  run(world, { type: 'setTrainConfig', rideId: id, trains: 2, carsPerTrain: 4 });
  run(world, { type: 'placeTrackGate', rideId: id, kind: 'entrance', x: 4, y: 3 });
  run(world, { type: 'placeTrackGate', rideId: id, kind: 'exit', x: 6, y: 3 });
  run(world, { type: 'startTestRun', rideId: id });
  const data = world.state.track.rides[String(id)];
  if (!data) throw new Error('coaster has no track data');
  const testTicks = (data.testRun?.ticksLeft ?? 0) + 1;
  for (let k = 0; k < testTicks; k++) stepTick(world);
  const ride = world.state.rides.find((r) => r.id === id);
  const why = ride ? canOpenTrackRide(world, ride) : 'no ride';
  if (why !== null) throw new Error(`coaster cannot open: ${why}`);
  run(world, { type: 'setRideOpen', rideId: id, open: true });
  // A carousel and a snack shack on the main path, 20 scenery items in free east-side tiles.
  run(world, { type: 'buildPathLine', x0: 32, y0: 30, x1: 44, y1: 30, kind: 'footpath' });
  const car = run(world, { type: 'placeRide', defId: 'carousel', x: 38, y: 24, rotation: 0 });
  run(world, { type: 'buildPathLine', x0: 39, y0: 27, x1: 39, y1: 29, kind: 'queue' });
  run(world, { type: 'setRideOpen', rideId: car, open: true });
  run(world, { type: 'placeStall', defId: 'snack_shack', x: 32, y: 20, rotation: 3 });
  const items = ['oak_round', 'pine_tall', 'birch_silver', 'willow', 'shrub_round', 'boulder', 'lamp_globe', 'bunting_pole'];
  const rnd = lcg(2468);
  let placed = 0;
  for (let tries = 0; tries < 400 && placed < 20; tries++) {
    const x = 34 + Math.floor(rnd() * 24);
    const y = 8 + Math.floor(rnd() * 44);
    const r = executeCommand(world, { type: 'placeScenery', defId: items[placed % items.length] as string, x, y, rotation: 0, edge: -1 }, { setup: true });
    if (r.ok) placed++;
  }
  if (placed < 20) throw new Error(`only ${placed} scenery items placed`);
  hire(world, { groundskeeper: 2, mechanic: 1 });
  addGuests(world, 600, 909);
  for (let k = 0; k < SETTLE_TICKS; k++) stepTick(world);
  return world;
}

/**
 * The scale park (stage 1 round 3 item 7): the Build 2 grid on the 128 × 128 map, every flat ride type twice (36
 * rides with queues, open), 18 stalls, benches and bins along the paths, 5,000 scenery items of the 8 baked scenery
 * kinds in every turn, 12 staff and 3,000 guests.
 */
function buildScale(): World {
  const world = createWorld({ seed: 6060, parkName: 'Scale Park', mapSize: 128 });
  world.state.park.cash = 900_000_000;
  const N = 128;
  const lines: number[] = [];
  for (let v = 8; v <= 120; v += 8) lines.push(v);
  for (const v of lines) {
    run(world, { type: 'buildPathLine', x0: 8, y0: v, x1: 120, y1: v, kind: 'footpath' });
    run(world, { type: 'buildPathLine', x0: v, y0: 8, x1: v, y1: 120, kind: 'footpath' });
  }
  run(world, { type: 'buildPathLine', x0: 31, y0: 121, x1: 31, y1: N - 4, kind: 'footpath' });
  const cells: Array<[number, number]> = [];
  for (const m of lines.slice(0, -1)) for (const l of lines.slice(0, -1)) cells.push([l, m]);
  // 36 rides: every flat ride type twice, spread over the grid (a 7 × 7 cell holds the largest, 4 × 5, with a queue).
  const types = FLAT_RIDES.map((d) => d.id);
  if (types.length !== SCALE_SCENE.rideTypes) throw new Error(`expected ${SCALE_SCENE.rideTypes} flat ride types, found ${types.length}`);
  const stallIds = ['snack_shack', 'fizz_stand', 'restrooms', 'balloon_stand'];
  let k = 0;
  for (let i = 0; i < cells.length && k < types.length * 2; i += 5) {
    const [l, m] = cells[i] as [number, number];
    const id = run(world, { type: 'placeRide', defId: types[k % types.length] as string, x: l + 2, y: m + 1, rotation: 0 });
    run(world, { type: 'buildPathLine', x0: l + 3, y0: m + 6, x1: l + 3, y1: m + 7, kind: 'queue' });
    const opened = executeCommand(world, { type: 'setRideOpen', rideId: id, open: true }, { setup: true });
    if (!opened.ok) throw new Error(`scale: ${types[k % types.length]} cannot open: ${opened.reason}`);
    if (k % 2 === 0) run(world, { type: 'placeStall', defId: stallIds[(k / 2) % stallIds.length] as string, x: l + 1, y: m + 6, rotation: 3 });
    k++;
  }
  if (k < types.length * 2) throw new Error(`scale: only ${k} rides placed`);
  // Benches and bins every 4 tiles along the east-west lines.
  for (const y of lines) for (let x = 10; x < 120; x += 4) executeCommand(world, { type: 'buildPathItem', x, y, itemType: x % 8 === 2 ? 'bench' : 'bin' }, { setup: true });
  // 5,000 scenery items of the baked kinds, in every turn, on free tiles of the cells.
  const items = ['oak_round', 'pine_tall', 'birch_silver', 'willow', 'shrub_round', 'boulder', 'lamp_globe', 'bunting_pole'];
  const rnd = lcg(60606);
  let placed = 0;
  for (let tries = 0; tries < 60_000 && placed < SCALE_SCENE.scenery; tries++) {
    const [l, m] = cells[Math.floor(rnd() * cells.length)] as [number, number];
    const x = l + 1 + Math.floor(rnd() * 7);
    const y = m + 1 + Math.floor(rnd() * 7);
    const r = executeCommand(world, { type: 'placeScenery', defId: items[placed % items.length] as string, x, y, rotation: (placed % 4) as 0 | 1 | 2 | 3, edge: -1 }, { setup: true });
    if (r.ok) placed++;
  }
  if (placed < SCALE_SCENE.scenery) throw new Error(`scale: only ${placed} scenery items placed`);
  hire(world, { groundskeeper: 5, mechanic: 3, security: 2, performer: 2 });
  addGuests(world, SCALE_SCENE.guests, 6161);
  for (let t = 0; t < SETTLE_TICKS; t++) stepTick(world);
  return world;
}

export function buildPerfScene(id: PerfSceneId | 'scale'): World {
  if (id === 'scale') return buildScale();
  if (id === 'coaster') return buildCoaster();
  if (id === 'build2') return buildBuild2();
  return buildBuild1(id === 'phone' ? 800 : 2_000);
}
