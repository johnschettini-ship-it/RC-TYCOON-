import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FLAT_RIDES, getFlatRideDef } from '../../../src/data/catalog';
import { gateIndex } from '../../../src/data/catalog/flatRides';
import { coarseRideFrame, decodeRideFrame, rideAnimation, rideFrameFor } from '../../../src/render/anim';
import type { Ride } from '../../../src/sim/rides/types';
import { d2FloorOk, keyAt, keysAt, periodOk, pictureOf, type Keys } from './frameHelpers';

// Plain JS build tool without types: import by a computed path so it loads as `any`.
const dir = new URL('../../../tools/art3d/', import.meta.url);
const load = (rel: string): Promise<any> => import(/* @vite-ignore */ new URL(rel, dir).href); // eslint-disable-line @typescript-eslint/no-explicit-any

describe('NON_ROUND', () => {
  it('names flat rides only', async () => {
    const { NON_ROUND } = await load('items/flatRides.js');
    const ids = new Set(FLAT_RIDES.map((d) => d.id));
    for (const id of NON_ROUND) expect(ids.has(id), id).toBe(true);
  });
  // The list is what the bake turns by: each ride module bakes one set per view turn exactly when it has a front.
  for (const { id } of FLAT_RIDES) {
    it(`${id}: its module bakes rots [0, 1, 2, 3] if it is in NON_ROUND, else one 'all' set`, async () => {
      const { NON_ROUND } = await load('items/flatRides.js');
      const src = readFileSync(new URL(`items/${id}.js`, dir), 'utf8');
      const rots = [...src.matchAll(/rots: (\[0, 1, 2, 3\]|'all')/g)].map((m) => m[1]);
      expect(rots, `${id}: one bakeObject call`).toHaveLength(1);
      expect(rots[0], id).toBe(NON_ROUND.includes(id) ? '[0, 1, 2, 3]' : "'all'");
    });
  }
});

describe('cycleKeys', () => {
  const pick = (a: number, full: boolean) => `p${a}${full ? 'f' : 'e'}`;
  it('period 32 bakes 16 slots x 2 occupancies and lists all 64 frame keys once', async () => {
    const { cycleKeys } = await load('items/flatRides.js');
    const m: Keys = cycleKeys('x', { period: 32 }, pick);
    expect(m.size).toBe(32);
    expect([...m.values()].reduce((n, e) => n + e.keys.length, 0)).toBe(32 * 2);
    periodOk(m, 'x', 32);
    periodOk(m, 'x', 32, true);
  });
  it('a shorter period folds slots: period 8 bakes 4 slots x 2', async () => {
    const { cycleKeys } = await load('items/flatRides.js');
    const m: Keys = cycleKeys('x', { period: 8 }, pick);
    expect(m.size).toBe(8);
    periodOk(m, 'x', 8);
    expect(pictureOf(m, keyAt('x', 10, false))).toBe(pictureOf(m, keyAt('x', 2, false)));
  });
  it('walkThrough bakes one occupancy state', async () => {
    const { cycleKeys } = await load('items/flatRides.js');
    const m: Keys = cycleKeys('x', { period: 4, walkThrough: true }, pick);
    expect(m.size).toBe(2);
    expect(pictureOf(m, keyAt('x', 0, true))).toBe(pictureOf(m, keyAt('x', 0, false)));
  });
  it('rejects a period that does not divide 32', async () => {
    const { cycleKeys } = await load('items/flatRides.js');
    for (const p of [0, 1, 3, 6, 34]) expect(() => cycleKeys('x', { period: p }, pick), String(p)).toThrow(/period/);
  });
});

describe('timeKeys', () => {
  const pick = (t: number, full: boolean) => `t${t}${full ? 'f' : 'e'}`;
  it('bakes 16 time steps x 2 occupancies and wraps slot 32 to step 0', async () => {
    const { timeKeys } = await load('items/flatRides.js');
    const m: Keys = timeKeys('x', {}, pick);
    expect(m.size).toBe(32);
    periodOk(m, 'x', 32);
    expect(pictureOf(m, keyAt('x', 30, false))).toBe('t15e');
  });
  it('walkThrough bakes one occupancy state', async () => {
    const { timeKeys } = await load('items/flatRides.js');
    const m: Keys = timeKeys('x', { walkThrough: true }, pick);
    expect(m.size).toBe(16);
    expect(pictureOf(m, keyAt('x', 6, true))).toBe(pictureOf(m, keyAt('x', 6, false)));
  });
});

const SPINNERS_PERIODS: Record<string, number> = { teacup_twirl: 16, rocket_rounds: 16, kiddie_cars: 16, merry_mill: 8 };

// Task 2 (Spinners): each module folds its frames by PERIOD angle slots with cycleKeys and the pick `${slot}:${occ}`.
describe('spinner periods', () => {
  const SPINNERS = SPINNERS_PERIODS;
  const pick = (a: number, full: boolean) => `${a}:${full ? 1 : 0}`;
  for (const [id, period] of Object.entries(SPINNERS)) {
    it(`${id} folds by ${period} slots: slot 32 shows slot 0, pictures advance in order`, async () => {
      const src = readFileSync(new URL(`items/${id}.js`, dir), 'utf8');
      expect(src).toMatch(/export const PERIOD = [A-Z]+\.period;/);
      expect(src).toMatch(new RegExp(`cycleKeys\\('${id}', \\{ period: PERIOD \\}, \\(a, full\\) => \`\\$\\{a\\}:\\$\\{full \\? 1 : 0\\}\`\\)`));
      const { cycleKeys } = await load('items/flatRides.js');
      const m: Keys = cycleKeys(id, { period }, pick);
      expect(m.size).toBe(period);
      periodOk(m, id, period);
      periodOk(m, id, period, true);
    });
    it(`${id}: a whole run in the game steps its pictures forward one at a time and ends where it started`, async () => {
      const { cycleKeys } = await load('items/flatRides.js');
      const m: Keys = cycleKeys(id, { period }, pick);
      const def = getFlatRideDef(id)!;
      const n = period / 2;
      let last = -1;
      for (let t = 0; t <= def.cycleTicks; t++) {
        const f = coarseRideFrame(rideFrameFor({ defId: id, cycle: { phase: 'running', ticks: t } as Ride['cycle'], riders: [] }, def));
        const id0 = pictureOf(m, keyAt(id, decodeRideFrame(f).angle, false)) as string;
        const k = Number(id0.split(':')[0]) / 2;
        if (last >= 0) expect([0, 1], `tick ${t}`).toContain((k - last + n) % n);
        last = k;
      }
      expect(last).toBe(0);
    });
  }
});

// The fold is only right if the model really repeats: the moving parts' placements at a + period / 32 are those at a
// turned by the ride's symmetry (180 degrees for the round spinners, which bake one set for every view turn; none for
// the mill, which bakes per view turn), part for part with the same design. The bake modules pose from these functions.
describe('spinner poses repeat with their period', () => {
  type Part = { design: string; x: number; y: number; z: number; yaw: number };
  const wrap = (v: number) => ((v % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  const RIDES: Record<string, [string, string]> = {
    teacup_twirl: ['TEACUP', 'teacupParts'], rocket_rounds: ['ROCKET', 'rocketParts'],
    kiddie_cars: ['KIDDIE', 'kiddieParts'], merry_mill: ['MILL', 'millParts'],
  };
  for (const [id, [cfgName, partsName]] of Object.entries(RIDES)) {
    it(`${id}: the state one period on is the state turned by its symmetry`, async () => {
      const mod = await load('items/spinnerMotion.js');
      const cfg = mod[cfgName];
      expect(cfg.period, 'the module and the period table agree').toBe(SPINNERS_PERIODS[id]);
      const parts = mod[partsName] as (a: number) => Part[];
      for (let slot = 0; slot < 32; slot += 1) {
        const a = slot / 32;
        const now = parts(a).map((p) => ({ ...p, ...mod.rotY(p, cfg.symmetry), yaw: p.yaw + cfg.symmetry }));
        const later = parts(a + cfg.period / 32);
        expect(later.length).toBe(now.length);
        for (const p of later) {
          const q = now.find((o: Part) => o.design === p.design && Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z) < 1e-9);
          expect(q, `${id} slot ${slot}: ${p.design} at (${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}) has no match`).toBeDefined();
          expect(Math.abs(wrap(q!.yaw - p.yaw)), `${id} slot ${slot}: ${p.design} yaw`).toBeLessThan(1e-9);
        }
      }
    });
  }
  it('the check is not vacuous: half the period does not repeat for the round ones', async () => {
    const mod = await load('items/spinnerMotion.js');
    const a = 1 / 32;
    const now: Part[] = mod.teacupParts(a).map((p: Part) => ({ ...p, ...mod.rotY(p, Math.PI) }));
    const later: Part[] = mod.teacupParts(a + 8 / 32);
    expect(later.every((p) => now.some((o) => o.design === p.design && Math.hypot(o.x - p.x, o.z - p.z) < 1e-6))).toBe(false);
  });
});

// Task 4 (Towers): observation_tower, drop_tower, gyro_globe, spiral_slide. Each picture depends only on the angle
// slot (the fraction of the current turn); the game turns REVOLUTIONS[defId] ?? 2 whole turns per run, so a run
// starts and ends on slot 0 (rest) and every cycle here is one turn (the lift, the drop, the gimbal) or divides it.
describe('tower rides (Task 4)', () => {
  const TOWERS = ['observation_tower', 'drop_tower', 'gyro_globe', 'spiral_slide'];
  // Today's look, for the comparison: wave() (sprites/content/kit.ts) and dropProfile() (thrillRides.ts).
  const wave = (t: number) => 0.5 - 0.5 * Math.cos(2 * Math.PI * t);
  const def = (id: string) => FLAT_RIDES.find((d) => d.id === id)!;

  it('the game turns these rides whole turns per run, so a run starts and ends at rest (slot 0)', async () => {
    const { rideAnimation, rideFrameFor, decodeRideFrame } = await import('../../../src/render/anim');
    for (const id of TOWERS) {
      const d = def(id);
      const end = rideAnimation(id, { phase: 'running', ticks: d.cycleTicks }, d.cycleTicks).turn;
      expect(end, id).toBe(2); // REVOLUTIONS default: no entry for these rides in anim.ts
      for (const ticks of [0, d.cycleTicks]) {
        const f = rideFrameFor({ defId: id, cycle: { phase: 'running', ticks }, riders: [] } as never, d);
        expect(decodeRideFrame(f).angle, `${id} at ${ticks}`).toBe(0);
      }
    }
  });

  it('every slot of a whole run maps to a baked picture, slot 32 wraps to slot 0, and turns 1 and 2 match', async () => {
    const { towerKeys } = await load('items/towerMotion.js');
    const { rideFrameFor, coarseRideFrame, decodeRideFrame } = await import('../../../src/render/anim');
    for (const id of TOWERS) {
      const m: Keys = towerKeys(id);
      const d = def(id);
      for (const full of [false, true]) {
        expect(pictureOf(m, keyAt(id, 0, full)), id).toBe(pictureOf(m, keyAt(id, 32 & 31, full)));
        // Walk a run tick by tick (both the desktop and the phone frame): every frame has a picture.
        for (let t = 0; t <= d.cycleTicks; t += Math.max(1, Math.floor(d.cycleTicks / 400))) {
          const f = rideFrameFor({ defId: id, cycle: { phase: 'running', ticks: t }, riders: full ? Array(d.capacity).fill(0) : [] } as never, d);
          for (const g of [f, coarseRideFrame(f)]) expect(pictureOf(m, keyAt(id, decodeRideFrame(g).angle, full)), `${id} tick ${t}`).toBeDefined();
        }
      }
    }
  });

  it('an empty tower ride is never running in the game, so every empty slot shows the ride at rest', async () => {
    const { towerKeys } = await load('items/towerMotion.js');
    for (const id of TOWERS) {
      const m: Keys = towerKeys(id);
      for (let a = 0; a < 32; a++) expect(pictureOf(m, keyAt(id, a, false)), `${id} slot ${a}`).toBe('rest');
      expect(m.get('rest')!.keys[0], id).toBe(keyAt(id, 0, false)); // posed at slot 0
    }
    // The sim side of that: an open ride with nobody queueing never starts a run.
    const { makeTestWorld, placeRideDirect } = await import('../../helpers/world');
    const { updateFlatRides } = await import('../../../src/sim/rides/flat/update');
    for (const id of TOWERS) {
      const world = makeTestWorld();
      const ride = placeRideDirect(world, id, 10, 10);
      ride.status = 'open';
      for (let i = 0; i < 3 * def(id).cycleTicks; i++) {
        updateFlatRides(world);
        world.state.tick++;
        expect(ride.cycle.phase, id).not.toBe('running');
      }
    }
  });

  it('gyro_globe: period 32 (axes at 1x/2x/3x repeat only after a whole turn), 16 pictures full', async () => {
    const { towerKeys, gyroAngles } = await load('items/towerMotion.js');
    const m: Keys = towerKeys('gyro_globe');
    expect(m.size).toBe(16 + 1);
    periodOk(m, 'gyro_globe', 32, true);
    // No shorter period exists: half a turn leaves the outer ring at 180 degrees and the pod at 540.
    const [a, b, c] = gyroAngles(16);
    expect([a, b, c].map((x: number) => +(x / Math.PI).toFixed(6))).toEqual([1, 2, 3]);
  });

  it('spiral_slide: riders a quarter apart in two looks, one slide length per turn: period 16', async () => {
    const { towerKeys, slideAt, SLIDE_PERIOD } = await load('items/towerMotion.js');
    const m: Keys = towerKeys('spiral_slide');
    expect(SLIDE_PERIOD).toBe(16);
    expect(m.size).toBe(8 + 1);
    periodOk(m, 'spiral_slide', 16, true);
    // Half a turn later rider i stands where rider i + 2 (same look) stood: the picture really repeats.
    for (let s = 0; s < 32; s += 2) for (let i = 0; i < 4; i++) expect(slideAt((i + 2) % 4, s)).toBeCloseTo(slideAt(i, (s + 16) % 32), 9);
  });

  it('observation_tower and drop_tower: 16 time steps per turn matching today\'s lift and drop, same height shares a picture', async () => {
    const { towerKeys, liftShare, dropShare, heightStep, HEIGHT_Q, DROP_SNAP } = await load('items/towerMotion.js');
    const { dropProfile } = await import('../../../src/render/sprites/content/thrillRides');
    for (let t = 0; t < 16; t++) {
      // the angle slot 2t is turn fraction 2t / 32 = t / 16 in today's look
      expect(liftShare(t), `lift ${t}`).toBeCloseTo(wave(t / 16), 9);
      expect(dropShare(t), `drop ${t}`).toBeCloseTo(dropProfile(t / 16), 9);
    }
    for (const [id, share] of [['observation_tower', liftShare], ['drop_tower', dropShare]] as const) {
      const m: Keys = towerKeys(id);
      for (let a = 0; a < 32; a++) {
        // the picture for slot a is the one baked at that slot's height (odd slots show the even slot below)
        const step = (a & ~1) >> 1;
        expect(pictureOf(m, keyAt(id, a, true)), `${id} slot ${a}`).toBe(`h${heightStep(id, step)}`);
        expect(Math.abs(heightStep(id, step) / HEIGHT_Q - share(step))).toBeLessThanOrEqual(id === 'drop_tower' ? DROP_SNAP : 0.5 / HEIGHT_Q);
      }
      expect(pictureOf(m, keyAt(id, 0, true)), `${id} starts at the bottom`).toBe('h0');
      expect(m.get('h0')!.keys[0], id).toBe(keyAt(id, 0, true)); // posed at slot 0
    }
    expect(towerKeys('observation_tower').size).toBe(9 + 1); // rises and falls the same way: steps t and 16 - t
    expect(towerKeys('drop_tower').size).toBe(11 + 1); // bottom, top held, the ends snapped (DROP_SNAP: size rule)
    expect(DROP_SNAP).toBeLessThanOrEqual(0.05); // at most 1 m of the 19.9 m travel
  });

  it('the 2 x 2 towers\' entrances and exits sit on the sim\'s gate tiles: column floor((w - 1) / 2), front row (+z) and back row', async () => {
    const { TOWER_GATES, SLIDE_RUNOUT } = await load('items/towerMotion.js');
    const TILE = 4;
    const ids = ['observation_tower', 'drop_tower', 'spiral_slide'];
    expect(Object.keys(TOWER_GATES).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      const d = def(id);
      const colX = (gateIndex(d.w) + 0.5) * TILE - (d.w * TILE) / 2; // model x of the gate column's centre
      const half = (d.d * TILE) / 2;
      const { entrance, exit } = TOWER_GATES[id];
      expect(entrance[0], `${id} entrance x`).toBe(colX);
      expect(exit[0], `${id} exit x`).toBe(colX);
      expect(entrance[1], `${id} entrance on the front row`).toBeGreaterThan(half - TILE);
      expect(entrance[1], id).toBeLessThan(half);
      expect(exit[1], `${id} exit on the back row`).toBeLessThan(-half + TILE);
      expect(exit[1], id).toBeGreaterThan(-half);
      // each model builds its openings from the table, not from its own numbers
      const src = readFileSync(new URL(`items/${id}.js`, dir), 'utf8');
      expect(src, id).toContain(`TOWER_GATES.${id}`);
    }
    expect(TOWER_GATES.drop_tower.entrance[0]).toBe(-2);
    // the slide's run-out ends past the landing, towards -x, still on the exit tile (column 0: x in (-4, 0))
    const [lx] = TOWER_GATES.spiral_slide.exit;
    expect(SLIDE_RUNOUT).toBeGreaterThan(0);
    expect(lx - SLIDE_RUNOUT).toBeGreaterThan(-def('spiral_slide').w * TILE / 2 + 0.5);
    expect(readFileSync(new URL('items/spiral_slide.js', dir), 'utf8')).toMatch(/gx - SLIDE_RUNOUT/);
  });
});

// Task 3 (swingers): the bake follows today's motion, which reads st.angle = slot / 32 (one motion cycle per 32 angle
// slots), and the game turns REVOLUTIONS (default 2, anim.ts unchanged) per run: 2 cycles per run, as today.
describe('swingers (pendulum_ship, magic_carpet, flip_arm)', () => {
  const RIDES = ['pendulum_ship', 'magic_carpet', 'flip_arm'];
  it('run 2 cycles per run (no REVOLUTIONS entry), so a 32-slot cycle plays twice, as today', () => {
    for (const id of RIDES) {
      const def = getFlatRideDef(id)!;
      expect(rideAnimation(id, { phase: 'running', ticks: def.cycleTicks }, def.cycleTicks).turn, id).toBe(2);
    }
  });
  it('the game frame of every tick of a run has a baked picture, and the run ends on the loading picture', async () => {
    const { shipKeys, carpetKeys, flipKeys } = await load('items/swingers.js');
    const maps: Record<string, Keys> = { pendulum_ship: shipKeys(), magic_carpet: carpetKeys(), flip_arm: flipKeys() };
    for (const id of RIDES) {
      const def = getFlatRideDef(id)!;
      const at = (ticks: number) => rideFrameFor({ defId: id, cycle: { phase: 'running', ticks }, riders: [] }, def) & 31;
      for (let t = 0; t <= def.cycleTicks; t++) expect(pictureOf(maps[id]!, keyAt(id, at(t) & ~1, false)), `${id} tick ${t}`).toBeDefined();
      expect(pictureOf(maps[id]!, keyAt(id, at(def.cycleTicks), false)), id).toBe(pictureOf(maps[id]!, keyAt(id, 0, false)));
    }
  });
  const DEG = Math.PI / 180;
  it('pendulum_ship: 7 swing poses x 2; every slot shows a pose within 4 degrees of today\'s swing, slot 32 wraps to 0, neighbours one pose apart', async () => {
    const { shipKeys, shipLevel, shipPose, shipTheta, SHIP_SWING } = await load('items/swingers.js');
    const m: Keys = shipKeys();
    expect(m.size).toBe(14);
    for (const full of [false, true]) {
      for (let a = 0; a <= 32; a++) {
        const id = pictureOf(m, keyAt('pendulum_ship', a % 32, full));
        expect(id!.endsWith(full ? ':1' : ':0')).toBe(true);
        // today: SHIP_SWING * sin(TAU * st.angle), st.angle = (even slot) / 32
        const today = SHIP_SWING * Math.sin((Math.PI * 2 * ((a % 32) & ~1)) / 32);
        expect(Math.abs(shipTheta(Number(id!.split(':')[0])) - today), `slot ${a}`).toBeLessThan(4 * DEG);
        expect(Math.sign(shipTheta(Number(id!.split(':')[0]))), `slot ${a} side`).toBe(Math.sign(Math.round(today * 1e9)));
      }
    }
    for (let t = 0; t < 16; t++) expect(Math.abs(shipPose(shipLevel(t + 1)) - shipPose(shipLevel(t))), `step ${t}`).toBeLessThanOrEqual(1);
    expect(pictureOf(m, keyAt('pendulum_ship', 0, false))).toBe('0:0');
  });
  it('magic_carpet: 8 evenly spaced positions x 2 in order (period 32); each slot shows today\'s arm angle or the one 22.5 degrees before', async () => {
    const { carpetKeys, carpetPhi } = await load('items/swingers.js');
    const m: Keys = carpetKeys();
    expect(m.size).toBe(16);
    periodOk(m, 'magic_carpet', 32);
    periodOk(m, 'magic_carpet', 32, true);
    for (let a = 0; a < 32; a++) {
      const lag = (Math.PI * 2 * (a & ~1)) / 32 - carpetPhi(Number(pictureOf(m, keyAt('magic_carpet', a, true))!.split(':')[0]));
      expect(lag, `slot ${a}`).toBeGreaterThanOrEqual(-1e-9);
      expect(lag, `slot ${a}`).toBeLessThanOrEqual(22.5 * DEG + 1e-9);
    }
  });
  it('flip_arm: 8 arm angles x 2 in order (period 32); each slot shows today\'s arm angle or the one 22.5 degrees before', async () => {
    const { flipKeys, flipPhi } = await load('items/swingers.js');
    const m: Keys = flipKeys();
    expect(m.size).toBe(16);
    periodOk(m, 'flip_arm', 32);
    periodOk(m, 'flip_arm', 32, true);
    for (let a = 0; a < 32; a++) {
      const lag = (Math.PI * 2 * (a & ~1)) / 32 - flipPhi(Number(pictureOf(m, keyAt('flip_arm', a, false))!.split(':')[0]));
      expect(lag, `slot ${a}`).toBeGreaterThanOrEqual(-1e-9);
      expect(lag, `slot ${a}`).toBeLessThanOrEqual(22.5 * DEG + 1e-9);
    }
  });
  it('entrance and exit gates sit on the sim\'s gate tiles: column floor((w - 1) / 2), front row (+z) and back row', async () => {
    const { GATES } = await load('items/swingers.js');
    for (const id of RIDES) {
      const def = getFlatRideDef(id)!;
      const TILE = 4;
      const colX = (gateIndex(def.w) + 0.5) * TILE - (def.w * TILE) / 2; // model x of the gate column's centre
      const half = (def.d * TILE) / 2;
      const { entrance, exit } = GATES[id];
      expect(entrance[0], `${id} entrance x`).toBe(colX);
      expect(exit[0], `${id} exit x`).toBe(colX);
      expect(entrance[1], `${id} entrance on the front row`).toBeGreaterThan(half - TILE);
      expect(entrance[1], id).toBeLessThan(half);
      expect(exit[1], `${id} exit on the back row`).toBeLessThan(-half + TILE);
      expect(exit[1], id).toBeGreaterThan(-half);
    }
    expect(GATES.magic_carpet.entrance[0]).toBe(-2);
  });
});

// Task 5 (buildings and arenas): bumper_cars, thunder_disc (time steps), mirror_maze, haunted_manor (walk-throughs).
describe('Task 5 ride frames', () => {
  const RIDES: [string, string, number][] = [['bumper_cars', 'bumperKeys', 32], ['thunder_disc', 'thunderKeys', 32], ['mirror_maze', 'mirrorKeys', 8], ['haunted_manor', 'manorKeys', 8]];
  for (const [id, fn, period] of RIDES) {
    it(`${id}: slot 32 wraps to slot 0, frames run in order (period ${period})`, async () => {
      const keys = await load('items/arenaKeys.js');
      const m: Keys = keys[fn]();
      periodOk(m, id, period, true);
      periodOk(m, id, period, false);
    });
  }

  it('bumper_cars and thunder_disc: a whole run (REVOLUTIONS) plays the time cycle a whole number of times, never backwards', async () => {
    const keys = await load('items/arenaKeys.js');
    const { rideFrameFor } = await import('../../../src/render/anim');
    const { getFlatRideDef } = await import('../../../src/data/catalog');
    for (const [id, fn, pics] of [['bumper_cars', 'bumperKeys', keys.BUMPER_PICS], ['thunder_disc', 'thunderKeys', keys.THUNDER_PICS]] as const) {
      const def = getFlatRideDef(id);
      if (!def) throw new Error(id);
      const m: Keys = keys[fn]();
      const at = (ticks: number): number => {
        const f = rideFrameFor({ defId: id, cycle: { phase: 'running', ticks }, riders: [1] as never }, def);
        const id2 = pictureOf(m, keyAt(id, f & 31, true));
        return Number((id2 as string).slice(1));
      };
      // rest (start and end of a run) shows step 0
      expect(at(0), id).toBe(0);
      expect(at(def.cycleTicks), id).toBe(0);
      let wraps = 0;
      let last = 0;
      for (let t = 1; t <= def.cycleTicks; t++) {
        const s = at(t);
        if (s < last) { wraps++; expect(last, `${id} tick ${t}: only the last step wraps`).toBe(pics - 1); expect(s).toBe(0); }
        else expect(s - last, `${id} tick ${t}: no skipped picture`).toBeLessThanOrEqual(1);
        last = s;
      }
      // REVOLUTIONS[id] ?? 2 (anim.ts): the ride ends where it started after exactly that many cycles
      expect(wraps, id).toBe(2);
      // the empty ride is one rest picture
      const empty = new Set<string>();
      for (let a = 0; a < 32; a++) empty.add(pictureOf(m, keyAt(id, a, false)) as string);
      expect([...empty], id).toEqual(['rest']);
    }
  });

  it('each model\'s entrance and exit opening sits on the sim\'s gate column (gateIndex, flatRideGates)', async () => {
    const { GATE_X } = await load('items/arenaKeys.js');
    const { gateIndex } = await import('../../../src/data/catalog/flatRides');
    const { getFlatRideDef } = await import('../../../src/data/catalog');
    const TILE_M = 4;
    for (const [id] of RIDES) {
      const def = getFlatRideDef(id);
      if (!def) throw new Error(id);
      // model x: footprint centre = 0, front edge along x at rotation 0 (src/sim/footprint.ts footprintTile)
      expect(GATE_X[id], id).toBe((gateIndex(def.w) + 0.5) * TILE_M - (def.w * TILE_M) / 2);
    }
    expect(GATE_X.bumper_cars).toBe(-2);
    expect(GATE_X.mirror_maze).toBe(0);
  });

  it('walk-throughs bake 4 light steps and one occupancy state', async () => {
    const keys = await load('items/arenaKeys.js');
    for (const fn of ['mirrorKeys', 'manorKeys']) {
      const m: Keys = keys[fn]();
      expect(m.size, fn).toBe(keys.LIGHT_STEPS);
    }
  });

  it('every Task 5 ride is baked: registry, card, BAKED, not a stand-in, rots [0,1,2,3] (NON_ROUND)', async () => {
    const { ITEM_LIST, CARD_ITEMS } = await load('items/registry.js');
    const { NON_ROUND } = await load('items/flatRides.js');
    const { REAL_FALLBACK } = await import('../../../src/render/real/fallbacks');
    for (const [id] of RIDES) {
      expect(ITEM_LIST.some((x: { id: string }) => x.id === id), id).toBe(true);
      expect(CARD_ITEMS.some((x: { id: string; kind: string }) => x.id === id && x.kind === 'ride'), id).toBe(true);
      expect(REAL_FALLBACK[id], id).toBe(id);
      expect(NON_ROUND, id).toContain(id);
    }
  });
});

// Owner decision 2026-11-15 (the `rides` bench scene did not fit 128 MiB): density 2, the far zooms, draws each ride from
// fewer pictures (flatRides.js withD2). Density 4 keeps every picture. The reader looks up the same frame key at both
// densities, so each density's table must map every game frame, and the density-2 one must never step backwards.
describe('density 2: fewer pictures, the same frames', () => {
  const pick = (a: number, full: boolean) => `${a}:${full ? 1 : 0}`;
  /** Every flat ride's frame keys (both densities), from the pure modules the bake modules use. */
  async function rideMaps(): Promise<Record<string, Keys>> {
    const fr = await load('items/flatRides.js');
    const tm = await load('items/towerMotion.js');
    const sw = await load('items/swingers.js');
    const ar = await load('items/arenaKeys.js');
    const sp = await load('items/spinnerMotion.js');
    const out: Record<string, Keys> = {
      carousel: fr.carouselKeys(), swing_tower: fr.swingTowerKeys(4), big_wheel: fr.bigWheelKeys(),
      pendulum_ship: sw.shipKeys(), magic_carpet: sw.carpetKeys(), flip_arm: sw.flipKeys(),
      bumper_cars: ar.bumperKeys(), thunder_disc: ar.thunderKeys(), mirror_maze: ar.mirrorKeys(), haunted_manor: ar.manorKeys(),
    };
    for (const id of ['observation_tower', 'drop_tower', 'gyro_globe', 'spiral_slide']) out[id] = tm.towerKeys(id);
    for (const [id, c] of [['teacup_twirl', sp.TEACUP], ['rocket_rounds', sp.ROCKET], ['kiddie_cars', sp.KIDDIE], ['merry_mill', sp.MILL]] as const) {
      out[id] = fr.cycleD2(id, fr.cycleKeys(id, { period: c.period }, pick), { period: c.period }, pick, c.d2Step);
    }
    return out;
  }
  /** Density-2 step in angle slots per ride (carousel: see its own test) and the pictures each density holds. */
  const PLAN: Record<string, { step: number; d4: number; d2: number; walkThrough?: boolean }> = {
    swing_tower: { step: 2, d4: 20, d2: 7 }, big_wheel: { step: 2, d4: 8, d2: 5 },
    observation_tower: { step: 4, d4: 10, d2: 6 }, drop_tower: { step: 4, d4: 12, d2: 8 },
    gyro_globe: { step: 2, d4: 17, d2: 17 }, spiral_slide: { step: 4, d4: 9, d2: 5 },
    pendulum_ship: { step: 4, d4: 14, d2: 6 }, magic_carpet: { step: 8, d4: 16, d2: 5 }, flip_arm: { step: 8, d4: 16, d2: 5 },
    bumper_cars: { step: 8, d4: 9, d2: 5 }, thunder_disc: { step: 8, d4: 9, d2: 5 },
    mirror_maze: { step: 2, d4: 4, d2: 4, walkThrough: true }, haunted_manor: { step: 2, d4: 4, d2: 4, walkThrough: true },
    teacup_twirl: { step: 4, d4: 16, d2: 5 }, rocket_rounds: { step: 4, d4: 16, d2: 5 }, kiddie_cars: { step: 4, d4: 16, d2: 5 },
    merry_mill: { step: 2, d4: 8, d2: 5 }, carousel: { step: 0, d4: 32, d2: 9 },
  };
  const used = (m: Keys, d: 2 | 4) => [...m.entries()].filter(([, e]) => (d === 2 ? e.keys2 ?? e.keys : e.keys).length > 0).map(([id]) => id);

  it('the plan covers every flat ride', () => {
    expect(Object.keys(PLAN).sort()).toEqual(FLAT_RIDES.map((d) => d.id).sort());
  });

  it('withD2 lists every frame key once at density 2 and names only the ride\'s own pictures', async () => {
    const { withD2, cycleKeys, cycleD2, timeKeys, timeD2 } = await load('items/flatRides.js');
    const m: Keys = withD2('x', cycleKeys('x', { period: 8 }, pick), [0], () => '0:0');
    expect(keysAt(m, 2).sort()).toEqual(keysAt(m, 4).sort());
    expect(m.get('0:0')!.keys2).toHaveLength(64);
    expect(() => withD2('x', cycleKeys('x', { period: 8 }, pick), [0], () => 'nope')).toThrow(/not one of the ride's pictures/);
    expect(() => cycleD2('x', cycleKeys('x', { period: 8, walkThrough: true }, pick), { period: 8, walkThrough: true }, pick, 4)).toThrow(/walk-through/);
    // timeD2 floors time steps: step 4 of 16 at density 2 shows the picture of step 4, steps 5 to 7 too.
    const tpick = (t: number, full: boolean) => `t${t}${full ? 'f' : 'e'}`;
    const t: Keys = timeD2('x', timeKeys('x', {}, tpick), tpick, 4);
    for (let a = 0; a < 32; a++) {
      expect(pictureOf(t, keyAt('x', a, true), 2), `slot ${a}`).toBe(`t${Math.floor((a >> 1) / 4) * 4}f`);
      expect(pictureOf(t, keyAt('x', a, false), 2), `slot ${a}`).toBe('t0e');
    }
  });

  it('d2Api lists a ride picture under keys at density 4 and keys2 at density 2, and leaves other sets alone', async () => {
    const { d2Api } = await load('items/flatRides.js');
    const added: [string, string[], number[]][] = [];
    const B = { densities: [2, 4], set: (kind: string) => ({ add: (keys: string[], shot: Record<number, unknown>) => added.push([kind, keys, Object.keys(shot).map(Number)]) }) };
    const a = { keys: ['a'], keys2: ['a', 'b'] };
    const b = { keys: ['b'], keys2: [] };
    const c = { keys: ['c'] };
    const api = d2Api(B, [a, b, c]);
    const ride = api.set('ride', 'x', 0);
    for (const p of [a, b, c]) ride.add(p.keys, { 2: 'p2', 4: 'p4' });
    api.set('shadow', 'x', 0).add(['x'], { 2: 's2', 4: 's4' });
    expect(added).toEqual([
      ['ride', ['a'], [4]], ['ride', ['a', 'b'], [2]],
      ['ride', ['b'], [4]],
      ['ride', ['c'], [4]], ['ride', ['c'], [2]],
      ['shadow', ['x'], [2, 4]],
    ]);
    expect(() => ride.add(['a'], { 2: 'p2' })).toThrow(/not one of the pictures/);
  });

  for (const [id, p] of Object.entries(PLAN)) {
    if (id === 'carousel') continue;
    it(`${id}: density 4 keeps its ${p.d4} pictures; density 2 shows ${p.d2} of them, the frame floored to ${p.step} slots${p.walkThrough ? '' : ', empty at rest'}`, async () => {
      const m = (await rideMaps())[id]!;
      expect(used(m, 4), id).toHaveLength(p.d4);
      expect(used(m, 2), id).toHaveLength(p.d2);
      d2FloorOk(m, id, p.step, { walkThrough: p.walkThrough, swings: id === 'swing_tower' ? [0, 1, 2, 3, 4] : [0], swingFloor: id === 'swing_tower' });
    });
  }

  it('carousel: density 2 shows the step floored to an even one (9 degrees), so each game step still turns it forwards', async () => {
    const { carouselStep, CAROUSEL } = await load('items/flatRides.js');
    const m = (await rideMaps()).carousel!;
    expect(used(m, 4)).toHaveLength(32);
    expect(used(m, 2)).toHaveLength(9);
    // The slot itself is not floored (every even slot has its own, floored, step): the same keys, empty at rest.
    expect(keysAt(m, 2).sort()).toEqual(keysAt(m, 4).sort());
    for (let a = 0; a < 32; a++) expect(pictureOf(m, keyAt('carousel', a, false), 2), `slot ${a}`).toBe('0:0');
    const DEG = Math.PI / 180;
    let last = -Infinity;
    for (let a = 0; a <= 64; a += 2) {
      const id = pictureOf(m, keyAt('carousel', a % 32, true), 2)!;
      const step = Number(id.split(':')[0]);
      expect(step, `slot ${a}`).toBe(carouselStep(a % 32) & ~1);
      // the shown angle, unwrapped: today's angle floored to 9 degrees (never ahead of it, at most 9 degrees behind)
      const today = (a / 32) * 2 * Math.PI;
      const shown = Math.floor(today / CAROUSEL.period) * CAROUSEL.period + (step * CAROUSEL.period) / CAROUSEL.steps;
      expect(today - shown, `slot ${a}`).toBeGreaterThanOrEqual(-1e-9);
      expect(today - shown, `slot ${a}`).toBeLessThan(9 * DEG);
      if (a > 0) {
        expect(shown - last, `slot ${a}: forwards`).toBeGreaterThan(0);
        expect(shown - last, `slot ${a}: under half the period`).toBeLessThan(CAROUSEL.period / 2);
      }
      last = shown;
    }
  });

  it('a whole run, tick by tick, desktop and phone frames: every frame has a picture at both densities, density 2 never steps back', async () => {
    const maps = await rideMaps();
    for (const d of FLAT_RIDES) {
      const m = maps[d.id]!;
      const p = PLAN[d.id]!;
      const riders = Array(d.capacity).fill(0);
      let lastSlot = 0;
      for (let t = 0; t <= d.cycleTicks; t++) {
        const f = rideFrameFor({ defId: d.id, cycle: { phase: 'running', ticks: t } as Ride['cycle'], riders } as never, d);
        for (const g of [f, coarseRideFrame(f)]) {
          const { angle, swing } = decodeRideFrame(g);
          const key = keyAt(d.id, angle, !p.walkThrough, swing);
          expect(pictureOf(m, key, 4), `${d.id} tick ${t} d4`).toBeDefined();
          expect(pictureOf(m, key, 2), `${d.id} tick ${t} d2`).toBeDefined();
        }
        // The density-2 picture comes from the slot floored to the step: it follows the slot, which only moves
        // forwards and wraps to 0 at the end of a turn.
        const slot = decodeRideFrame(f).angle;
        if (slot < lastSlot) expect(lastSlot, `${d.id} tick ${t}: wraps only at the end of a turn`).toBeGreaterThanOrEqual(28);
        lastSlot = slot;
      }
      const end = rideFrameFor({ defId: d.id, cycle: { phase: 'running', ticks: d.cycleTicks } as Ride['cycle'], riders } as never, d);
      const { angle, swing } = decodeRideFrame(end);
      expect(pictureOf(m, keyAt(d.id, angle, !p.walkThrough, swing), 2), `${d.id}: a run ends on its start picture`).toBe(pictureOf(m, keyAt(d.id, 0, !p.walkThrough), 2));
    }
  });

  it('an empty flat ride never runs in the game, so its density-2 rest picture is all an empty frame needs', async () => {
    const { makeTestWorld, placeRideDirect } = await import('../../helpers/world');
    const { updateFlatRides } = await import('../../../src/sim/rides/flat/update');
    for (const d of FLAT_RIDES) {
      const world = makeTestWorld();
      const ride = placeRideDirect(world, d.id, 10, 10);
      ride.status = 'open';
      for (let i = 0; i < 3 * d.cycleTicks; i++) {
        updateFlatRides(world);
        world.state.tick++;
        expect(ride.cycle.phase, d.id).not.toBe('running');
      }
    }
  });

  it('each ride module bakes its density-2 keys: d2Api, keys2 on every picture (walk-throughs list every picture at both)', () => {
    for (const { id } of FLAT_RIDES) {
      const src = readFileSync(new URL(`items/${id}.js`, dir), 'utf8');
      if (PLAN[id]!.walkThrough) {
        expect(src, id).not.toContain('d2Api');
        continue;
      }
      expect(src, id).toContain('bakeObject(d2Api(B, pictures), {');
      expect(src, id).toMatch(/keys2: gr?\.keys2/);
    }
    // the spinners' density-2 step is the one the test above checks
    const spin = readFileSync(new URL('items/teacup_twirl.js', dir), 'utf8');
    expect(spin).toContain("cycleD2('teacup_twirl', groups, { period: PERIOD }, (a, full) => `${a}:${full ? 1 : 0}`, TEACUP.d2Step);");
  });
});
