/**
 * Phase 6 content art (phase-6-polish.md §4.5): Magic Carpet, Kiddie Cars, Merry Mill, Gyro Globe, Noodle Bar,
 * Smoothie Bar, Photo Booth each dispatch to their own drawing (not the generic fallback), stay inside their art bounds
 * in all 4 rotations, are deterministic, animate with the ride cycle, and keep stable sprite cache keys.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FLAT_RIDES, STALLS } from '../../../../src/data/catalog';
import { ANGLE_FRAMES, rideFrameFor } from '../../../../src/render/anim';
import { CONTENT_RIDE_ART, CONTENT_STALL_ART } from '../../../../src/render/sprites/content';
import { drawRideArt, rideArtBounds, type RideArtState } from '../../../../src/render/sprites/rides';
import { drawStallArt, stallArtBounds } from '../../../../src/render/sprites/stalls';
import { defHash, spriteKey } from '../../../../src/render/spriteCache';
import type { Dir } from '../../../../src/sim/map';
import { Recorder } from './recorder';

const RIDES = FLAT_RIDES.filter((d) => d.phase === 6);
const STALL_IDS = STALLS.filter((d) => d.phase === 6).map((d) => d.id);
const ROTATIONS: Dir[] = [0, 1, 2, 3];
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

describe('Phase 6 flat ride art', () => {
  it('has its own art for each of the 4 rides', () => {
    expect(RIDES.map((d) => d.id)).toEqual(['magic_carpet', 'kiddie_cars', 'merry_mill', 'gyro_globe']);
    for (const d of RIDES) expect(CONTENT_RIDE_ART[d.id], d.id).toBeDefined();
  });

  it.each(RIDES.map((d) => d.id))('%s dispatches to its own art, not the fallback', (id) => {
    const art = CONTENT_RIDE_ART[id]!;
    const spy = vi.spyOn(art, 'draw');
    rideOps(id, state(0, 0.25, 2));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('each ride draws something different from every other ride (Phase 3 rides included)', () => {
    const all = FLAT_RIDES.filter((d) => d.phase === 6 || d.phase === 3);
    const logs = all.map((d) => {
      const rec = new Recorder();
      drawRideArt(rec.ctx(), d.id, d.w, d.d, state(0, 0.3, 4));
      return rec.ops.join(';');
    });
    expect(new Set(logs).size).toBe(all.length);
  });

  it.each(RIDES.map((d) => d.id))('%s: finite bounds that hold every drawn point, for every rotation and frame', (id) => {
    const def = RIDES.find((d) => d.id === id)!;
    for (const rot of ROTATIONS) {
      const b = rideArtBounds(id, def.w, def.d, rot);
      for (let f = 0; f < ANGLE_FRAMES; f += 2) {
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

  it.each(RIDES.map((d) => d.id))('%s is deterministic, animates with the cycle, and shows its riders', (id) => {
    const a = rideOps(id, state(1, 0.4, 3)).ops.join(';');
    expect(rideOps(id, state(1, 0.4, 3)).ops.join(';')).toBe(a);
    expect(rideOps(id, state(1, 0.2, 3)).ops.join(';')).not.toBe(a);
    expect(rideOps(id, state(1, 0.4, 0)).ops.join(';')).not.toBe(a);
  });

  it.each(RIDES.map((d) => d.id))('%s looks different in each of the 4 rotations', (id) => {
    const logs = ROTATIONS.map((r) => rideOps(id, state(r, 0.3, 2)).ops.join(';'));
    // Square rides look the same in opposite rotations only if fully symmetric; the gates differ anyway.
    expect(new Set(logs).size).toBeGreaterThanOrEqual(2);
  });

  it('a running ride gives changing sprite frames; a waiting ride shows frame angle 0', () => {
    for (const def of RIDES) {
      const frames = new Set<number>();
      for (let t = 0; t < def.cycleTicks; t += 5) frames.add(rideFrameFor({ defId: def.id, cycle: { phase: 'running', ticks: t }, riders: [1] }, def) & 31);
      expect(frames.size, def.id).toBeGreaterThan(8);
      expect(rideFrameFor({ defId: def.id, cycle: { phase: 'waiting', ticks: 0 }, riders: [] }, def) & 31).toBe(0);
    }
  });
});

describe('Phase 6 stall art', () => {
  it('has its own art for each of the 3 stalls', () => {
    expect(STALL_IDS).toEqual(['noodle_bar', 'smoothie_bar', 'photo_booth']);
    for (const id of STALL_IDS) expect(CONTENT_STALL_ART[id], id).toBeDefined();
  });

  it.each(STALL_IDS)('%s dispatches to its own art, not the generic stall', (id) => {
    const spy = vi.spyOn(CONTENT_STALL_ART[id]!, 'draw');
    stallOps(id, 2);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('each stall looks different from every other stall', () => {
    const ids = STALLS.map((d) => d.id);
    const logs = ids.map((id) => stallOps(id, 2).ops.join(';'));
    expect(new Set(logs).size).toBe(ids.length);
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
    expect(stallOps(id, 1).ops.join(';')).not.toBe(stallOps(id, 2).ops.join(';'));
  });
});

describe('sprite cache keys for the new art', () => {
  const IDS = [...RIDES.map((d) => d.id), ...STALL_IDS];

  it('are stable numbers (FNV-1a of the id), the same across calls', () => {
    // FNV-1a 32-bit of the id, written out so a change to the hash or the ids shows up here.
    const fnv = (s: string): number => {
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return h >>> 0;
    };
    for (const id of IDS) {
      expect(defHash(id)).toBe(fnv(id));
      for (const rot of [0, 1, 2, 3]) {
        const k = spriteKey(id, rot, 37, 1);
        expect(spriteKey(id, rot, 37, 1)).toBe(k);
        expect(Number.isSafeInteger(k)).toBe(true);
      }
    }
  });

  it('never collide with each other or with older content', () => {
    const all = [...FLAT_RIDES.map((d) => d.id), ...STALLS.map((d) => d.id)];
    const keys = new Set<number>();
    for (const id of all) for (const rot of [0, 1, 2, 3]) keys.add(spriteKey(id, rot, 0, 1));
    expect(keys.size).toBe(all.length * 4);
  });
});
