import { describe, expect, it } from 'vitest';
import { FLAT_RIDES } from '../../../src/data/catalog';
import { keyAt, periodOk, pictureOf, type Keys } from './frameHelpers';

// Plain JS build tool without types: import by a computed path so it loads as `any`.
const dir = new URL('../../../tools/art3d/', import.meta.url);
const load = (rel: string): Promise<any> => import(/* @vite-ignore */ new URL(rel, dir).href); // eslint-disable-line @typescript-eslint/no-explicit-any

describe('NON_ROUND', () => {
  it('is exactly the rides with a front, and all of them are flat rides', async () => {
    const { NON_ROUND } = await load('items/flatRides.js');
    expect([...NON_ROUND].sort()).toEqual(['bumper_cars', 'big_wheel', 'drop_tower', 'haunted_manor', 'magic_carpet', 'mirror_maze', 'observation_tower', 'pendulum_ship', 'spiral_slide', 'thunder_disc'].sort());
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
