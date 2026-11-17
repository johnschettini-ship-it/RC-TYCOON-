/**
 * New family flat rides of batch A (docs/superpowers/specs/2026-11-17-new-rides-design.md): Dodgem Boats, Mini Pirate
 * Ship, Balloon Wheel, Frog Hopper each draw their own art in today's look (not the generic fallback), stay inside
 * their art bounds in all 4 rotations and every frame, are deterministic, animate with the ride cycle, show riders,
 * and look different from every other flat ride.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FLAT_RIDES } from '../../../../src/data/catalog';
import { ANGLE_FRAMES, rideFrameFor } from '../../../../src/render/anim';
import { CONTENT_RIDE_ART } from '../../../../src/render/sprites/content';
import { drawRideArt, rideArtBounds, type RideArtState } from '../../../../src/render/sprites/rides';
import type { Dir } from '../../../../src/sim/map';
import { Recorder } from './recorder';

const IDS = ['dodgem_boats', 'mini_pirate_ship', 'balloon_wheel', 'frog_hopper'];
const ROTATIONS: Dir[] = [0, 1, 2, 3];
const TOLERANCE = 3;
const def = (id: string) => FLAT_RIDES.find((d) => d.id === id)!;

function rideOps(id: string, st: RideArtState): Recorder {
  const rec = new Recorder();
  drawRideArt(rec.ctx(), id, def(id).w, def(id).d, st);
  return rec;
}
const state = (rotation: Dir, angle = 0, occupancy = 0): RideArtState => ({ rotation, angle, swing: 0, occupancy });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('new rides batch A: today\'s look', () => {
  it('are start family rides in the catalogue, each with its own art', () => {
    for (const id of IDS) {
      expect(def(id), id).toMatchObject({ unlock: 'start', tag: 'family' });
      expect(CONTENT_RIDE_ART[id], id).toBeDefined();
    }
  });

  it.each(IDS)('%s dispatches to its own art, not the fallback', (id) => {
    const spy = vi.spyOn(CONTENT_RIDE_ART[id]!, 'draw');
    rideOps(id, state(0, 0.25, 2));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('each draws something different from every other flat ride', () => {
    const logs = FLAT_RIDES.map((d) => rideOps(d.id, state(0, 0.3, 4)).ops.join(';'));
    expect(new Set(logs).size).toBe(FLAT_RIDES.length);
  });

  it.each(IDS)('%s: finite bounds that hold every drawn point, for every rotation and frame', (id) => {
    const d = def(id);
    for (const rot of ROTATIONS) {
      const b = rideArtBounds(id, d.w, d.d, rot);
      for (let f = 0; f < ANGLE_FRAMES; f++) {
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

  it.each(IDS)('%s is deterministic, animates with the cycle, and shows its riders', (id) => {
    const a = rideOps(id, state(1, 0.4, 3)).ops.join(';');
    expect(rideOps(id, state(1, 0.4, 3)).ops.join(';')).toBe(a);
    expect(rideOps(id, state(1, 0.2, 3)).ops.join(';')).not.toBe(a);
    expect(rideOps(id, state(1, 0.4, 0)).ops.join(';')).not.toBe(a);
  });

  it.each(IDS)('%s looks different in the rotations', (id) => {
    const logs = ROTATIONS.map((r) => rideOps(id, state(r, 0.3, 2)).ops.join(';'));
    expect(new Set(logs).size).toBeGreaterThanOrEqual(2);
  });

  it('a running ride gives changing sprite frames; a waiting ride shows frame angle 0', () => {
    for (const id of IDS) {
      const d = def(id);
      const frames = new Set<number>();
      for (let t = 0; t < d.cycleTicks; t += 5) frames.add(rideFrameFor({ defId: id, cycle: { phase: 'running', ticks: t }, riders: [1] }, d) & 31);
      expect(frames.size, id).toBeGreaterThan(8);
      expect(rideFrameFor({ defId: id, cycle: { phase: 'waiting', ticks: 0 }, riders: [] }, d) & 31).toBe(0);
    }
  });
});
