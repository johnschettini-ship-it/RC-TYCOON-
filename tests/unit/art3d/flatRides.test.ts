import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FLAT_RIDES, getFlatRideDef } from '../../../src/data/catalog';
import { gateIndex } from '../../../src/data/catalog/flatRides';
import { coarseRideFrame, decodeRideFrame, rideAnimation, rideFrameFor } from '../../../src/render/anim';
import type { Ride } from '../../../src/sim/rides/types';
import { keyAt, periodOk, pictureOf, type Keys } from './frameHelpers';

// Plain JS build tool without types: import by a computed path so it loads as `any`.
const dir = new URL('../../../tools/art3d/', import.meta.url);
const load = (rel: string): Promise<any> => import(/* @vite-ignore */ new URL(rel, dir).href); // eslint-disable-line @typescript-eslint/no-explicit-any

describe('NON_ROUND', () => {
  it('is exactly the rides with a front, and all of them are flat rides', async () => {
    const { NON_ROUND } = await load('items/flatRides.js');
    expect([...NON_ROUND].sort()).toEqual(['bumper_cars', 'big_wheel', 'drop_tower', 'haunted_manor', 'magic_carpet', 'mirror_maze', 'observation_tower', 'pendulum_ship', 'spiral_slide', 'thunder_disc', 'merry_mill', 'flip_arm'].sort());
    const ids = new Set(FLAT_RIDES.map((d) => d.id));
    for (const id of NON_ROUND) expect(ids.has(id), id).toBe(true);
  });
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
      const { NON_ROUND } = await load('items/flatRides.js');
      if (NON_ROUND.includes(id)) expect(src, 'a front: one set per view turn').toMatch(/rots: \[0, 1, 2, 3\]/);
      else expect(src, 'round: one set for every view turn').toMatch(/rots: 'all'/);
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
