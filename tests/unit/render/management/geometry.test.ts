import { describe, expect, it } from 'vitest';
import { LITTER_VARIANTS, litterSlot, messSlot, type DecalSlot } from '../../../../src/render/management/litter';
import { staffPosition, type StaffPos } from '../../../../src/render/management/staffPos';
import { pathItemPlacement, type ItemPlacement } from '../../../../src/render/management/pathItemPos';
import { generateMap, tileIndex } from '../../../../src/sim/map';

const slot = (): DecalSlot => ({ u: 0, v: 0, variant: 0, flip: 0 });

describe('litter sub-positions (Phase 3 §4.3: deterministic hash of tile and item index)', () => {
  it('the same tile and item give the same slot, every time', () => {
    const a = litterSlot(1234, 3, slot());
    const b = litterSlot(1234, 3, slot());
    expect(a).toEqual(b);
  });

  it('slots stay inside the tile, away from its edges, with a valid variant', () => {
    const out = slot();
    for (let tile = 0; tile < 400; tile++) {
      for (let k = 0; k < 8; k++) {
        litterSlot(tile, k, out);
        expect(out.u).toBeGreaterThanOrEqual(0.12);
        expect(out.u).toBeLessThanOrEqual(0.88);
        expect(out.v).toBeGreaterThanOrEqual(0.12);
        expect(out.v).toBeLessThanOrEqual(0.88);
        expect(out.variant).toBeGreaterThanOrEqual(0);
        expect(out.variant).toBeLessThan(LITTER_VARIANTS);
        expect(out.flip === 0 || out.flip === 1).toBe(true);
      }
    }
  });

  it('items on one tile spread out, and tiles differ from each other', () => {
    const seen = new Set<string>();
    for (let k = 0; k < 8; k++) {
      const s = litterSlot(500, k, slot());
      seen.add(`${s.u.toFixed(3)},${s.v.toFixed(3)}`);
    }
    expect(seen.size).toBe(8);
    expect(litterSlot(10, 0, slot())).not.toEqual(litterSlot(11, 0, slot()));
  });

  it('mess uses its own hash, near the tile centre', () => {
    const m = messSlot(77, 0, slot());
    expect(m).toEqual(messSlot(77, 0, slot()));
    expect(Math.abs(m.u - 0.5)).toBeLessThanOrEqual(0.2);
    expect(Math.abs(m.v - 0.5)).toBeLessThanOrEqual(0.2);
    expect(m).not.toEqual(litterSlot(77, 0, slot()));
  });

  it('writes into the given record (no allocation in the frame loop)', () => {
    const out = slot();
    expect(litterSlot(1, 1, out)).toBe(out);
  });
});

describe('staff interpolation (like guests: tile → next tile by (progress + alpha) / ticks per tile)', () => {
  const map = generateMap();
  const pos = (): StaffPos => ({ fx: 0, fy: 0, z: 0 });
  const a = tileIndex(map, 10, 10);
  const east = tileIndex(map, 11, 10);
  const south = tileIndex(map, 10, 11);

  it('a standing staff member is at the tile centre', () => {
    const p = staffPosition(map, { tile: a, nextTile: -1, progress: 0 }, 12, 0.7, pos());
    expect(p).toEqual({ fx: 10.5, fy: 10.5, z: map.heights[a] });
  });

  it('a walking staff member moves smoothly toward the next tile', () => {
    expect(staffPosition(map, { tile: a, nextTile: east, progress: 0 }, 12, 0, pos()).fx).toBeCloseTo(10.5);
    expect(staffPosition(map, { tile: a, nextTile: east, progress: 6, }, 12, 0, pos()).fx).toBeCloseTo(11);
    expect(staffPosition(map, { tile: a, nextTile: east, progress: 5 }, 10, 0.5, pos()).fx).toBeCloseTo(11.05);
    const s = staffPosition(map, { tile: a, nextTile: south, progress: 3 }, 12, 0, pos());
    expect(s.fx).toBeCloseTo(10.5);
    expect(s.fy).toBeCloseTo(10.75);
    // Never past the next tile, even with a late frame.
    expect(staffPosition(map, { tile: a, nextTile: east, progress: 12 }, 12, 0.9, pos()).fx).toBeCloseTo(11.5);
  });

  it('is deterministic and interpolates height', () => {
    const m = generateMap();
    m.heights[east] = 12;
    const p1 = staffPosition(m, { tile: a, nextTile: east, progress: 6 }, 12, 0, pos());
    const p2 = staffPosition(m, { tile: a, nextTile: east, progress: 6 }, 12, 0, pos());
    expect(p1).toEqual(p2);
    expect(p1.z).toBeCloseTo(10);
  });
});

describe('path item placement (bench and bin sit at a tile edge without a path join)', () => {
  const place = (mask: number): ItemPlacement => pathItemPlacement(mask, { u: 0, v: 0, alongX: true, side: 0 });
  const N = 1;
  const E = 2;
  const S = 4;
  const W = 8;

  it('a path along x puts the item on the north edge, along x', () => {
    expect(place(E | W)).toEqual({ u: 0.5, v: 0.14, alongX: true, side: 0 });
  });

  it('a path along y puts the item on the west edge, along y', () => {
    expect(place(N | S)).toEqual({ u: 0.14, v: 0.5, alongX: false, side: 3 });
  });

  it('a T junction open to the north uses another free edge', () => {
    const p = place(N | E | W);
    expect(p).toEqual({ u: 0.5, v: 0.86, alongX: true, side: 2 });
  });

  it('a crossroads uses the north-west corner', () => {
    expect(place(N | E | S | W)).toEqual({ u: 0.16, v: 0.16, alongX: true, side: 0 });
  });
});
