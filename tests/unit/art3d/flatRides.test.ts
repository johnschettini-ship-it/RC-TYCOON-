import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FLAT_RIDES, getFlatRideDef } from '../../../src/data/catalog';
import { coarseRideFrame, decodeRideFrame, rideFrameFor } from '../../../src/render/anim';
import type { Ride } from '../../../src/sim/rides/types';
import { keyAt, periodOk, pictureOf, type Keys } from './frameHelpers';

// Plain JS build tool without types: import by a computed path so it loads as `any`.
const dir = new URL('../../../tools/art3d/', import.meta.url);
const load = (rel: string): Promise<any> => import(/* @vite-ignore */ new URL(rel, dir).href); // eslint-disable-line @typescript-eslint/no-explicit-any

describe('NON_ROUND', () => {
  it('is exactly the rides with a front, and all of them are flat rides', async () => {
    const { NON_ROUND } = await load('items/flatRides.js');
    expect([...NON_ROUND].sort()).toEqual(['bumper_cars', 'big_wheel', 'drop_tower', 'haunted_manor', 'magic_carpet', 'mirror_maze', 'observation_tower', 'pendulum_ship', 'spiral_slide', 'thunder_disc', 'merry_mill'].sort());
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
});
