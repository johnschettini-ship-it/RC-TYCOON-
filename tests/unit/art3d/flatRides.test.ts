import { describe, expect, it } from 'vitest';
import { FLAT_RIDES, getFlatRideDef } from '../../../src/data/catalog';
import { gateIndex } from '../../../src/data/catalog/flatRides';
import { rideAnimation, rideFrameFor } from '../../../src/render/anim';
import { keyAt, periodOk, pictureOf, type Keys } from './frameHelpers';

// Plain JS build tool without types: import by a computed path so it loads as `any`.
const dir = new URL('../../../tools/art3d/', import.meta.url);
const load = (rel: string): Promise<any> => import(/* @vite-ignore */ new URL(rel, dir).href); // eslint-disable-line @typescript-eslint/no-explicit-any

describe('NON_ROUND', () => {
  it('is exactly the rides with a front, and all of them are flat rides', async () => {
    const { NON_ROUND } = await load('items/flatRides.js');
    expect([...NON_ROUND].sort()).toEqual(['bumper_cars', 'big_wheel', 'drop_tower', 'haunted_manor', 'magic_carpet', 'mirror_maze', 'observation_tower', 'pendulum_ship', 'spiral_slide', 'thunder_disc', 'flip_arm'].sort());
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
