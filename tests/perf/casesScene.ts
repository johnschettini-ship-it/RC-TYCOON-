/**
 * Phase 8b stage 0b test (never merged): the cases park (§6 scope) on the 64 × 64 map. It holds every case the picture
 * store must cover: all 18 flat rides (rows of 5, rotation 2, queue and exit paths), a Steel Coaster with a chain lift,
 * a helix, a drop, medium turns and `corkscrew_right` in colours track 6, supports 9, cars 0 (supports over raised
 * and lowered ground), a ground footpath network, an elevated footpath line at z 10 with a ramp, a 6 × 6 raised
 * plateau with cliffs, a slope band, a pond, and 120 guests. Commands run in setup mode (research content), research
 * is marked unlocked and cash is written in, as `scenes.ts`.
 *
 * Regenerate with `TC_WRITE_SCENES=1 npx vitest run tests/unit/perf/casesScene.test.ts`.
 */
import { FLAT_RIDES, getFlatRideDef } from '../../src/data/catalog/flatRides';
import { RESEARCH_ORDER } from '../../src/data/research';
import { executeCommand, type Command } from '../../src/sim/commands';
import { Content } from '../../src/sim/map';
import { stepTick } from '../../src/sim/tick';
import type { World } from '../../src/sim/types';
import { createWorld } from '../../src/sim/world';
import { addGuestDirect } from '../helpers/world';

/** File name in `tests/perf/`. */
export const CASES_FILE = 'cases-0b.tcsave.json';
/** Camera focus for measures and the projection: map tile at the screen centre. */
export const CASES_FOCUS = { x: 28, y: 28 } as const;

/** Ticks run after the guests are placed (as `scenes.ts`). */
const SETTLE_TICKS = 200;
const GUESTS = 120;

function run(world: World, cmd: Command): number {
  const r = executeCommand(world, cmd, { setup: true });
  if (!r.ok) throw new Error(`${cmd.type}: ${r.reason} ${JSON.stringify(cmd)}`);
  return r.id ?? -1;
}

/** Tiny deterministic generator for placement (independent of the game RNG), as `scenes.ts`. */
function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

const LIFT = ['flat_to_gentle_up', 'gentle_to_steep_up', 'steep_up', 'steep_to_gentle_up', 'gentle_up_to_flat'];
const DROP = ['flat_to_gentle_down', 'gentle_down', 'gentle_to_steep_down', 'steep_to_gentle_down', 'gentle_down_to_flat'];
const times = (n: number, id: string): string[] => Array.from({ length: n }, () => id);
/** Steel Coaster from (4, 2) heading east: footprint x 1 to 18, y 2 to 17; lift to 16 m above the ground. */
const COASTER = [
  'station',
  'station',
  ...LIFT,
  'helix_right_down',
  'turn_medium_right',
  ...DROP,
  'corkscrew_right',
  'brakes',
  'turn_medium_right',
  ...times(11, 'straight'),
  'turn_medium_right',
  ...times(9, 'straight'),
  'turn_medium_right',
];

/** The cases park. */
export function buildCasesScene(): World {
  const world = createWorld({ seed: 6464, parkName: 'Cases Park' });
  world.state.park.cash = 100_000_000;
  world.state.management.research.unlocked = [...new Set([...world.state.management.research.unlocked, ...RESEARCH_ORDER.map((r) => r.id)])];

  // Ground under the coaster, before the track: lowered under the flat back straight (supports 1 to 2 m), raised
  // under the helix and the turn after it (shorter supports there).
  for (const x of [6, 9, 12]) run(world, { type: 'lowerLand', x, y: 16, size: 1 });
  run(world, { type: 'lowerLand', x: 9, y: 16, size: 1 });
  run(world, { type: 'levelLand', x0: 12, y0: 3, x1: 15, y1: 6, targetHeight: 11 });

  // Steel Coaster: chain lift, helix, drop, medium turns, corkscrew; colours not the defaults; open, trains running.
  const coaster = run(world, { type: 'placeStation', typeId: 'steel_coaster', x: 4, y: 2, dir: 1 });
  for (const defId of COASTER) {
    const cmd: Command = { type: 'addTrackPiece', rideId: coaster, defId, chain: LIFT.includes(defId) };
    if (defId === 'brakes') (cmd as { brakeSpeed?: number }).brakeSpeed = 8;
    run(world, cmd);
  }
  run(world, { type: 'setTrackColours', rideId: coaster, track: 6, supports: 9, cars: 0 });
  run(world, { type: 'setTrainConfig', rideId: coaster, trains: 1, carsPerTrain: 4 });
  // Harness as `scenes.ts`: open without gates, so the train runs empty and draws as a full one.
  for (const r of world.state.rides) if (r.id === coaster) r.status = 'open';

  // Land cases in the west half below the coaster: a 6 × 6 plateau with cliffs, a slope band, a pond.
  run(world, { type: 'levelLand', x0: 3, y0: 24, x1: 8, y1: 29, targetHeight: 12 });
  for (let x = 12; x <= 26; x++) run(world, { type: 'raiseCorner', x, y: 26, corner: 0 });
  run(world, { type: 'levelLand', x0: 14, y0: 38, x1: 18, y1: 42, targetHeight: 6 });
  for (const y of [39, 41]) for (const x of [15, 17]) run(world, { type: 'raiseWater', x, y, size: 3 });

  // Footpaths: a spine at x 31 to the entrance stub, row lines for queues (north of each row) and exits (south).
  run(world, { type: 'buildPathLine', x0: 31, y0: 3, x1: 31, y1: 59, kind: 'footpath' });
  const rowY = [6, 18, 30, 42];
  for (const y of rowY) {
    run(world, { type: 'buildPathLine', x0: 31, y0: y - 3, x1: 62, y1: y - 3, kind: 'footpath' });
    run(world, { type: 'buildPathLine', x0: 31, y0: y + 6, x1: 62, y1: y + 6, kind: 'footpath' });
  }
  // 18 flat rides, rows of 5, rotation 2 (front to the north): a 2-tile queue to the line above, an exit path down.
  FLAT_RIDES.forEach((def, k) => {
    const x = 34 + 6 * (k % 5);
    const y = rowY[Math.floor(k / 5)] as number;
    const id = run(world, { type: 'placeRide', defId: def.id, x, y, rotation: 2 });
    const ride = world.state.rides.find((r) => r.id === id);
    const d = getFlatRideDef(def.id);
    if (!ride?.entrance || !ride.exit || !d) throw new Error(`cases: ride ${def.id} has no gates`);
    const w = world.state.map.width;
    const ex = ride.entrance.outside % w;
    run(world, { type: 'buildPathLine', x0: ex, y0: y - 1, x1: ex, y1: y - 2, kind: 'queue' });
    const xx = ride.exit.outside % w;
    const xy = Math.floor(ride.exit.outside / w);
    if (xy < y + 6) run(world, { type: 'buildPathLine', x0: xx, y0: xy, x1: xx, y1: y + 5, kind: 'footpath' });
    run(world, { type: 'setRideOpen', rideId: id, open: true });
  });

  // Elevated footpath line at z 10 (2 m over the ground) and a ramp at its east end.
  run(world, { type: 'buildPathLine', x0: 34, y0: 54, x1: 44, y1: 54, kind: 'footpath', z: 10 });
  run(world, { type: 'buildPath', x: 45, y: 54, kind: 'footpath', z: 10, rampDir: 1 });

  // Guests on footpath tiles (x ≥ 31), entering over 10 ticks, as `scenes.ts`.
  const map = world.state.map;
  const paths: number[] = [];
  for (let i = 0; i < map.content.length; i++) if (map.content[i] === Content.Footpath && i % map.width >= 31) paths.push(i);
  const rnd = lcg(6464);
  for (let k = 0; k < GUESTS; k++) {
    if (k > 0 && k % 12 === 0) stepTick(world);
    addGuestDirect(world, paths[Math.floor(rnd() * paths.length)] as number, {
      temperament: Math.round((rnd() + rnd()) * 50),
      cash: 4000 + Math.floor(rnd() * 8000),
      items: { map: false, umbrella: false, balloon: k % 7 === 0, photo: false },
      nextDecisionTick: world.state.tick + (k % 40),
    });
  }
  for (let t = 0; t < SETTLE_TICKS; t++) stepTick(world);
  return world;
}
