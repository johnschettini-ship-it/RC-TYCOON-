/**
 * Phase 6 track pieces (phase-6-polish.md §4.5, catalog §8): corkscrew (left, right; Steel, Inverted; 3 tiles straight,
 * height change 0, 1 inversion, min entry 10 m/s, ×3) and helix (left/right × up/down; Steel, Inverted, Bobsled; 3 × 3,
 * 360°, ±4 m, ×5). Same table rules as the Phase 2 pieces (phase-2 §9.1): entry and exit states, footprint, sample
 * tables, rotation, and which types get which pieces.
 */
import { describe, expect, it } from 'vitest';
import { ALL_TRACK_PIECES, EXTRA_PIECES, getTrackPieceDef, getTrackTypeDef, TRACK_PIECES, WATER_PIECES } from '../../../src/data/track';
import {
  bankAngle,
  entryJointLocal,
  exitJointLocal,
  pieceExitJoint,
  pieceStatic,
  pieceWorldTiles,
  piecesForEnd,
  slopePitch,
} from '../../../src/sim/rides/track/geometry';
import type { TrackDir, TrackPieceInstance } from '../../../src/sim/rides/track/types';
import { CORKSCREW_KAPPA } from '../../../src/data/tuning/track';

const STRAIGHT_CENTS = getTrackPieceDef('straight')!.cost;
const CORKSCREWS = ['corkscrew_left', 'corkscrew_right'];
const HELIXES = ['helix_left_up', 'helix_left_down', 'helix_right_up', 'helix_right_down'];

describe('Phase 6 piece table (catalog §8)', () => {
  it('adds 6 pieces after the rail and water pieces, numbered on', () => {
    expect(EXTRA_PIECES.map((p) => p.id)).toEqual([...CORKSCREWS, ...HELIXES]);
    expect(ALL_TRACK_PIECES).toHaveLength(TRACK_PIECES.length + WATER_PIECES.length + 6);
    EXTRA_PIECES.forEach((p, i) => expect(p.num).toBe(TRACK_PIECES.length + WATER_PIECES.length + 1 + i));
    for (const p of EXTRA_PIECES) expect([p.set, p.water, p.chainable]).toEqual(['rail', null, false]);
  });

  it('corkscrew: 3 tiles straight, height change 0, 1 inversion, min entry 10 m/s, 3 × the straight piece cost', () => {
    for (const id of CORKSCREWS) {
      const d = getTrackPieceDef(id)!;
      expect(d.group).toBe('Cs');
      expect(d.tiles).toEqual([[0, 0], [1, 0], [2, 0]]);
      expect(d.exit).toEqual({ dx: 3, dy: 0, dz: 0, turn: 0, slope: 'F', bank: 'none' });
      expect(d.entry).toEqual({ slope: 'F', bank: 'none' });
      expect(d.inversions).toBe(1);
      expect(d.minEntryMms).toBe(10_000);
      expect(d.cost).toBe(3 * STRAIGHT_CENTS);
      expect(d.turnKind).toBeNull();
    }
  });

  it('helix: 3 × 3, a 360° turn, ±4 m, no inversion, 5 × the straight piece cost', () => {
    for (const id of HELIXES) {
      const d = getTrackPieceDef(id)!;
      const left = id.includes('left');
      const up = id.endsWith('_up');
      expect(d.group).toBe('Hx');
      expect(d.tiles).toHaveLength(9);
      for (const [x, y] of d.tiles) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(2);
        expect(left ? y <= 0 && y >= -2 : y >= 0 && y <= 2).toBe(true);
      }
      expect(d.exit).toEqual({ dx: 3, dy: 0, dz: up ? 4 : -4, turn: 0, slope: 'F', bank: 'none' });
      expect([d.railMin, d.railMax]).toEqual(up ? [0, 4] : [-4, 0]);
      expect(d.inversions).toBe(0);
      expect(d.minEntryMms).toBe(0);
      expect(d.cost).toBe(5 * STRAIGHT_CENTS);
      expect(d.turnKind).toBe('medium');
    }
  });

  it('older pieces need no entry speed', () => {
    for (const p of [...TRACK_PIECES, ...WATER_PIECES]) expect(p.minEntryMms, p.id).toBe(0);
  });
});

for (const id of [...CORKSCREWS, ...HELIXES]) {
  describe(`${id} sample table`, () => {
    const def = getTrackPieceDef(id)!;
    const st = pieceStatic(id);
    const sm = st.samples;
    const last = sm.n - 1;

    it('starts at the entry joint flat and unbanked and ends at the exit joint within 1e-9 m', () => {
      const e = entryJointLocal();
      expect(sm.x[0]).toBeCloseTo(e.x, 12);
      expect(sm.y[0]).toBeCloseTo(e.y, 12);
      expect(sm.h[0]).toBe(0);
      expect(sm.theta[0]).toBeCloseTo(slopePitch('F'), 9);
      expect(Math.asin(sm.sinB[0]!)).toBeCloseTo(bankAngle('none'), 6);
      const x = exitJointLocal(def);
      expect(Math.abs(sm.x[last]! - x.x)).toBeLessThan(1e-9);
      expect(Math.abs(sm.y[last]! - x.y)).toBeLessThan(1e-9);
      expect(Math.abs(sm.h[last]! - def.exit.dz)).toBeLessThan(1e-9);
      expect(sm.theta[last]).toBeCloseTo(0, 6);
      expect(sm.sinB[last]).toBeCloseTo(0, 6);
      expect(sm.cosB[last]).toBeCloseTo(1, 6);
    });

    it('has a sample every 0.25 m up to the table length', () => {
      expect(sm.s[0]).toBe(0);
      for (let k = 1; k < sm.n; k++) {
        const ds = sm.s[k]! - sm.s[k - 1]!;
        expect(ds).toBeGreaterThan(0);
        expect(ds).toBeLessThanOrEqual(0.25 + 1e-12);
      }
      expect(sm.s[last]).toBeCloseTo(def.lengthMm / 1000, 12);
    });

    it('keeps every sample inside its tiles and covers its rail range', () => {
      const listed = new Set(def.tiles.map(([x, y]) => `${x},${y}`));
      let lo = Infinity;
      let hi = -Infinity;
      for (let k = 0; k < sm.n; k++) {
        const xs = [Math.floor(sm.x[k]! / 4 - 1e-9), Math.floor(sm.x[k]! / 4 + 1e-9)];
        const ys = [Math.floor(sm.y[k]! / 4 - 1e-9), Math.floor(sm.y[k]! / 4 + 1e-9)];
        expect(xs.some((tx) => ys.some((ty) => listed.has(`${tx},${ty}`))) || k === last).toBe(true);
        lo = Math.min(lo, sm.h[k]!);
        hi = Math.max(hi, sm.h[k]!);
      }
      expect(Math.floor(lo + 1e-9) + 0).toBe(def.railMin);
      expect(Math.ceil(hi - 1e-9) + 0).toBe(def.railMax);
      // Rail on every tile; the helix circles its centre tile (reserved only, like a medium turn's corners).
      expect(st.railOrder).toHaveLength(def.tiles.length === 9 ? 8 : 3);
      if (def.tiles.length === 9) expect(st.tileInfo.find((t) => t.lx === 1 && Math.abs(t.ly) === 1)?.rail).toBe(false);
    });

    it('gravity does exactly the work of the height change', () => {
      let work = 0;
      for (let k = 0; k < last; k++) work += ((sm.sinT[k]! + sm.sinT[k + 1]!) / 2) * (sm.s[k + 1]! - sm.s[k]!);
      expect(work).toBeCloseTo(def.exit.dz, 3);
    });

    it('rotates into 4 directions with the rotated tiles and exit joint', () => {
      const rot = (x: number, y: number, d: number): [number, number] => (d === 0 ? [x, y] : d === 1 ? [-y, x] : d === 2 ? [-x, -y] : [y, -x]);
      for (let d = 0; d < 4; d++) {
        const piece: TrackPieceInstance = { defId: id, x: 20, y: 20, z: 10, dir: d as TrackDir, chain: false, brakeSpeed: null, cost: 0 };
        const got = pieceWorldTiles(piece).map((t) => `${t.x},${t.y}`).sort();
        const want = def.tiles.map(([lx, ly]) => { const [rx, ry] = rot(lx, ly, d); return `${20 + rx},${20 + ry}`; }).sort();
        expect(got).toEqual(want);
        const j = pieceExitJoint(piece);
        const [ex, ey] = rot(3, 0, d);
        expect([j.x, j.y, j.z, j.dir]).toEqual([20 + ex, 20 + ey, 10 + def.exit.dz, d]);
      }
    });
  });
}

describe('corkscrew shape', () => {
  it('rolls a full turn: upside down in the middle, the rail rolling around the riders toward the named side', () => {
    for (const id of CORKSCREWS) {
      const sm = pieceStatic(id).samples;
      const mid = Math.floor((sm.n - 1) / 2);
      expect(sm.cosB[mid]).toBeLessThan(-0.99);
      const quarter = Math.round((sm.n - 1) / 4);
      // Rolling right: a quarter of the way the car leans right (bank > 0) and the rail swings out to the left.
      const right = id.endsWith('right');
      expect(Math.sign(sm.sinB[quarter]!)).toBe(right ? 1 : -1);
      expect(Math.sign(sm.y[quarter]! - 2)).toBe(right ? -1 : 1);
      // Height change 0: the rail climbs over the riders and comes back down.
      let top = 0;
      for (let k = 0; k < sm.n; k++) top = Math.max(top, sm.h[k]!);
      expect(top).toBeGreaterThan(2.5);
      expect(top).toBeLessThan(4);
    }
  });

  it('the curvature toward the riders is positive and largest at the top (κ rule)', () => {
    const sm = pieceStatic('corkscrew_right').samples;
    const mid = Math.floor((sm.n - 1) / 2);
    for (let k = 0; k < sm.n; k++) {
      const kc = sm.kv[k]! * sm.cosB[k]! + sm.kh[k]! * sm.sinB[k]!;
      expect(kc).toBeGreaterThanOrEqual(-1e-12);
      expect(kc).toBeLessThanOrEqual(CORKSCREW_KAPPA + 1e-12);
    }
    expect(sm.kv[mid]! * sm.cosB[mid]!).toBeCloseTo(CORKSCREW_KAPPA, 4);
    expect(sm.kh[0]).toBe(0);
  });
});

describe('helix shape', () => {
  it('turns 360° on a constant radius, banked 35° toward the inside, and climbs or descends 4 m smoothly', () => {
    for (const id of HELIXES) {
      const sm = pieceStatic(id).samples;
      const left = id.includes('left');
      const last = sm.n - 1;
      expect(sm.yaw[last]).toBeCloseTo(left ? -2 * Math.PI : 2 * Math.PI, 6);
      const mid = Math.floor(last / 2);
      expect(Math.abs(sm.kh[mid]!)).toBeCloseTo(1 / 4.8, 9);
      expect(Math.sign(sm.kh[mid]!)).toBe(left ? -1 : 1);
      expect(Math.asin(sm.sinB[mid]!)).toBeCloseTo(bankAngle(left ? 'left' : 'right'), 6);
      // Heights move one way only.
      const up = id.endsWith('_up');
      for (let k = 1; k < sm.n; k++) {
        const dh = sm.h[k]! - sm.h[k - 1]!;
        expect(up ? dh >= -1e-12 : dh <= 1e-12).toBe(true);
      }
    }
  });
});

describe('which types get which pieces (catalog §2, §8)', () => {
  const ids = (typeId: string, slope: 'F' | 'G+' | 'X+' = 'F'): string[] => piecesForEnd(typeId, slope, 'none').map((p) => p.id);

  it('Steel and Inverted build the corkscrew and the helix; Bobsled only the helix', () => {
    for (const t of ['steel_coaster', 'inverted_coaster']) {
      for (const id of [...CORKSCREWS, ...HELIXES]) expect(ids(t), `${t} ${id}`).toContain(id);
    }
    for (const id of HELIXES) expect(ids('bobsled_run')).toContain(id);
    for (const id of CORKSCREWS) expect(ids('bobsled_run')).not.toContain(id);
  });

  it('no other type builds a Phase 6 piece', () => {
    for (const t of ['junior_coaster', 'mini_railway', 'wooden_coaster', 'spinning_mouse', 'ghost_train', 'go_karts', 'log_flume', 'rapids_raft', 'monorail']) {
      for (const id of [...CORKSCREWS, ...HELIXES]) expect(ids(t), `${t} ${id}`).not.toContain(id);
    }
  });

  it('the Inverted Coaster builds the whole Steel set plus the corkscrew and the helix', () => {
    const steel = getTrackTypeDef('steel_coaster')!.groups;
    const inverted = getTrackTypeDef('inverted_coaster')!.groups;
    for (const g of steel) expect(inverted).toContain(g);
    expect(inverted).toContain('Cs');
    expect(inverted).toContain('Hx');
  });

  it('Bobsled Run: no loop, no unbanked turns, no steep climbs; gentle and steep down, banked turns, helix', () => {
    const t = getTrackTypeDef('bobsled_run')!;
    expect(t.groups).not.toContain('L');
    expect(t.groups).not.toContain('Ts');
    expect(t.groups).not.toContain('Tm');
    expect(ids('bobsled_run')).not.toContain('vertical_loop_left');
    expect(ids('bobsled_run')).toContain('flat_to_gentle_down');
    expect(ids('bobsled_run')).toContain('bank_left_in');
    expect(piecesForEnd('bobsled_run', 'F', 'left').map((p) => p.id)).toContain('banked_turn_medium_left');
    expect(piecesForEnd('bobsled_run', 'G-', 'none').map((p) => p.id)).toContain('gentle_to_steep_down');
    expect(piecesForEnd('bobsled_run', 'G+', 'none').map((p) => p.id)).not.toContain('gentle_to_steep_up');
    expect(piecesForEnd('bobsled_run', 'X+', 'none')).toEqual([]);
  });

  it('Monorail: flat, gentle slopes, and turns only (no steep pieces, no loop, no banking)', () => {
    const t = getTrackTypeDef('monorail')!;
    expect([...t.groups].sort()).toEqual(['G', 'S', 'St', 'Tm', 'Ts']);
    const all = new Set([...ids('monorail'), ...ids('monorail', 'G+')]);
    for (const id of all) expect(['S', 'St', 'G', 'Ts', 'Tm']).toContain(getTrackPieceDef(id)!.group);
    expect(piecesForEnd('monorail', 'G+', 'none').map((p) => p.id)).not.toContain('gentle_to_steep_up');
  });
});
