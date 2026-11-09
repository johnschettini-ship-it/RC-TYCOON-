/**
 * Phase 3 content art: every new flat ride and stall dispatches to its own drawing (not the generic
 * fallback), stays inside its art bounds, is deterministic, and the rides animate with `ride.cycle`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FLAT_RIDES, STALLS } from '../../../../src/data/catalog';
import { ANGLE_FRAMES, rideFrameFor } from '../../../../src/render/anim';
import { CONTENT_RIDE_ART, CONTENT_STALL_ART } from '../../../../src/render/sprites/content';
import { drawRideArt, rideArtBounds, type RideArtState } from '../../../../src/render/sprites/rides';
import { drawStallArt, stallArtBounds } from '../../../../src/render/sprites/stalls';
import type { Dir } from '../../../../src/sim/map';
import { Recorder } from './recorder';

const RIDES = FLAT_RIDES.filter((d) => d.phase === 3);
const STALL_IDS = STALLS.filter((d) => d.phase === 3).map((d) => d.id);
const ROTATIONS: Dir[] = [0, 1, 2, 3];
/** Stroke widths and round caps reach a little past the recorded points. */
const TOLERANCE = 3;

function rideOps(id: string, st: RideArtState): Recorder {
  const def = RIDES.find((d) => d.id === id);
  if (!def) throw new Error(id);
  const rec = new Recorder();
  drawRideArt(rec.ctx(), id, def.w, def.d, st);
  return rec;
}

function stallOps(id: string, rotation: Dir): Recorder {
  const rec = new Recorder();
  drawStallArt(rec.ctx(), id, rotation);
  return rec;
}

const state = (rotation: Dir, angle = 0, occupancy = 0): RideArtState => ({ rotation, angle, swing: 0, occupancy });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Phase 3 flat ride art', () => {
  it('has its own art for each of the 10 research rides', () => {
    expect(RIDES).toHaveLength(10);
    for (const d of RIDES) expect(CONTENT_RIDE_ART[d.id], d.id).toBeDefined();
  });

  it.each(RIDES.map((d) => d.id))('%s dispatches to its own art, not the fallback', (id) => {
    const art = CONTENT_RIDE_ART[id];
    if (!art) throw new Error(id);
    const spy = vi.spyOn(art, 'draw');
    rideOps(id, state(0, 0.25, 2));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('each ride draws something different from every other ride', () => {
    const logs = RIDES.map((d) => rideOps(d.id, state(0, 0.3, 4)).ops.join(';'));
    expect(new Set(logs).size).toBe(RIDES.length);
  });

  it.each(RIDES.map((d) => d.id))('%s: finite bounds that hold every drawn point, for every rotation and frame', (id) => {
    const def = RIDES.find((d) => d.id === id);
    if (!def) throw new Error(id);
    for (const rot of ROTATIONS) {
      const b = rideArtBounds(id, def.w, def.d, rot);
      for (const v of [b.left, b.right, b.top, b.bottom]) expect(Number.isFinite(v)).toBe(true);
      expect(b.right).toBeGreaterThan(b.left);
      expect(b.bottom).toBeGreaterThan(b.top);
      for (let f = 0; f < ANGLE_FRAMES; f += 3) {
        for (const occ of [0, 4]) {
          const rec = rideOps(id, state(rot, f / ANGLE_FRAMES, occ));
          expect(rec.nonFinite, `${id} rot ${rot} frame ${f}`).toBe(0);
          expect(rec.transforms).toBe(0);
          expect(rec.fills).toBeGreaterThan(10);
          const e = rec.extent;
          const where = `${id} rot ${rot} frame ${f} occ ${occ}: ${JSON.stringify(e)} vs ${JSON.stringify(b)}`;
          expect(e.left, where).toBeGreaterThanOrEqual(b.left - TOLERANCE);
          expect(e.right, where).toBeLessThanOrEqual(b.right + TOLERANCE);
          expect(e.top, where).toBeGreaterThanOrEqual(b.top - TOLERANCE);
          expect(e.bottom, where).toBeLessThanOrEqual(b.bottom + TOLERANCE);
        }
      }
    }
  });

  it.each(RIDES.map((d) => d.id))('%s is deterministic and animates with the cycle', (id) => {
    const a = rideOps(id, state(1, 0.4, 3)).ops.join(';');
    expect(rideOps(id, state(1, 0.4, 3)).ops.join(';')).toBe(a);
    expect(rideOps(id, state(1, 0.2, 3)).ops.join(';')).not.toBe(a);
  });

  it('a running ride gives changing sprite frames; a waiting ride shows frame angle 0', () => {
    for (const def of RIDES) {
      const frames = new Set<number>();
      for (let t = 0; t < def.cycleTicks; t += 5) {
        frames.add(rideFrameFor({ defId: def.id, cycle: { phase: 'running', ticks: t }, riders: [1] }, def) & 31);
      }
      expect(frames.size, def.id).toBeGreaterThan(8);
      expect(rideFrameFor({ defId: def.id, cycle: { phase: 'waiting', ticks: 0 }, riders: [] }, def) & 31).toBe(0);
    }
  });

  it('walk-through attractions hide their riders (Phase 3 §4.11)', () => {
    for (const id of ['mirror_maze', 'haunted_manor']) {
      expect(rideOps(id, state(0, 0.3, 0)).ops.join(';'), id).toBe(rideOps(id, state(0, 0.3, 4)).ops.join(';'));
    }
    for (const id of ['bumper_cars', 'pendulum_ship', 'drop_tower']) {
      expect(rideOps(id, state(0, 0.3, 0)).ops.join(';'), id).not.toBe(rideOps(id, state(0, 0.3, 4)).ops.join(';'));
    }
  });
});

describe('Phase 3 stall art', () => {
  it('has its own art for each of the 8 new stalls and facilities', () => {
    expect(STALL_IDS).toHaveLength(8);
    for (const id of STALL_IDS) expect(CONTENT_STALL_ART[id], id).toBeDefined();
  });

  it.each(STALL_IDS)('%s dispatches to its own art, not the generic stall', (id) => {
    const art = CONTENT_STALL_ART[id];
    if (!art) throw new Error(id);
    const spy = vi.spyOn(art, 'draw');
    stallOps(id, 2);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('each stall looks different from the others and from the Phase 1 stall of its kind', () => {
    const logs = STALL_IDS.map((id) => stallOps(id, 2).ops.join(';'));
    expect(new Set(logs).size).toBe(STALL_IDS.length);
    for (const phase1 of ['snack_shack', 'fizz_stand', 'restrooms']) expect(logs).not.toContain(stallOps(phase1, 2).ops.join(';'));
  });

  it.each(STALL_IDS)('%s: finite bounds that hold every drawn point, for every rotation; deterministic', (id) => {
    const b = stallArtBounds();
    for (const rot of ROTATIONS) {
      const rec = stallOps(id, rot);
      expect(rec.nonFinite).toBe(0);
      expect(rec.transforms).toBe(0);
      expect(rec.fills).toBeGreaterThan(8);
      const e = rec.extent;
      const where = `${id} rot ${rot}: ${JSON.stringify(e)}`;
      expect(e.left, where).toBeGreaterThanOrEqual(b.left - TOLERANCE);
      expect(e.right, where).toBeLessThanOrEqual(b.right + TOLERANCE);
      expect(e.top, where).toBeGreaterThanOrEqual(b.top - TOLERANCE);
      expect(e.bottom, where).toBeLessThanOrEqual(b.bottom + TOLERANCE);
      expect(stallOps(id, rot).ops).toEqual(rec.ops);
    }
    // The service side moves with the rotation.
    expect(stallOps(id, 1).ops.join(';')).not.toBe(stallOps(id, 2).ops.join(';'));
  });
});
