import { describe, expect, it } from 'vitest';
import { TRACK_PIECES, TRACK_TYPES, getTrackPieceDef, type TrackBank, type TrackSlope } from '../../../src/data/track';
import {
  bankAngle,
  entryJointLocal,
  exitJointLocal,
  pieceExitJoint,
  pieceStatic,
  pieceWorldTiles,
  piecesForEnd,
  slopePitch,
  TRACK_DX,
  TRACK_DY,
} from '../../../src/sim/rides/track/geometry';
import type { TrackPieceInstance } from '../../../src/sim/rides/track/types';
import type { Dir } from '../../../src/sim/map';

/** Table lengths (m) from phase-2 §4.2. */
const TABLE_LENGTH: Record<string, number> = {
  station: 4.0, straight: 4.0, gentle_up: 4.47, gentle_down: 4.47, steep_up: 7.21, steep_down: 7.21,
  flat_to_gentle_up: 4.12, gentle_up_to_flat: 4.12, flat_to_gentle_down: 4.12, gentle_down_to_flat: 4.12,
  gentle_to_steep_up: 5.66, steep_to_gentle_up: 5.66, gentle_to_steep_down: 5.66, steep_to_gentle_down: 5.66,
  turn_small_left: 3.14, turn_small_right: 3.14, turn_medium_left: 15.71, turn_medium_right: 15.71,
  bank_left_in: 4.0, bank_left_out: 4.0, bank_right_in: 4.0, bank_right_out: 4.0,
  banked_turn_medium_left: 15.71, banked_turn_medium_right: 15.71, brakes: 4.0, block_brake: 4.0,
  vertical_loop_left: 50.27, vertical_loop_right: 50.27, spooky_tunnel: 4.0,
};

describe('piece table (phase-2 §4.2)', () => {
  it('has all 29 pieces in table order with the listed costs', () => {
    expect(TRACK_PIECES).toHaveLength(29);
    TRACK_PIECES.forEach((p, i) => expect(p.num).toBe(i + 1));
    expect(getTrackPieceDef('station')?.cost).toBe(6000);
    expect(getTrackPieceDef('turn_medium_right')?.cost).toBe(12000);
    expect(getTrackPieceDef('vertical_loop_left')?.cost).toBe(90000);
    const chainable = TRACK_PIECES.filter((p) => p.chainable).map((p) => p.num);
    expect(chainable).toEqual([2, 3, 5, 7, 8, 11, 12]);
  });

  for (const def of TRACK_PIECES) {
    describe(def.id, () => {
      const st = pieceStatic(def.id);
      const sm = st.samples;
      const last = sm.n - 1;

      it('starts at the entry joint with the entry pitch and bank', () => {
        const e = entryJointLocal();
        expect(sm.x[0]).toBeCloseTo(e.x, 12);
        expect(sm.y[0]).toBeCloseTo(e.y, 12);
        expect(sm.h[0]).toBe(0);
        expect(Math.sin(sm.theta[0] as number)).toBeCloseTo(Math.sin(slopePitch(def.entry.slope)), 9);
        expect(sm.theta[0]).toBeCloseTo(slopePitch(def.entry.slope), 9);
        expect(Math.asin(sm.sinB[0] as number)).toBeCloseTo(bankAngle(def.entry.bank), 6);
      });

      it('ends at the exit joint within 1e-9 m with the exit pitch and bank', () => {
        const x = exitJointLocal(def);
        expect(Math.abs((sm.x[last] as number) - x.x)).toBeLessThan(1e-9);
        expect(Math.abs((sm.y[last] as number) - x.y)).toBeLessThan(1e-9);
        expect(Math.abs((sm.h[last] as number) - def.exit.dz)).toBeLessThan(1e-9);
        const th = sm.theta[last] as number;
        expect(Math.sin(th)).toBeCloseTo(Math.sin(slopePitch(def.exit.slope)), 6);
        expect(Math.cos(th)).toBeCloseTo(Math.cos(slopePitch(def.exit.slope)), 6);
        expect(Math.asin(sm.sinB[last] as number)).toBeCloseTo(bankAngle(def.exit.bank), 6);
      });

      it('has samples every 0.25 m and the table length within 0.01 m', () => {
        expect(sm.s[0]).toBe(0);
        for (let k = 1; k < sm.n; k++) {
          const ds = (sm.s[k] as number) - (sm.s[k - 1] as number);
          expect(ds).toBeGreaterThan(0);
          expect(ds).toBeLessThanOrEqual(0.25 + 1e-12);
        }
        expect(sm.s[last]).toBeCloseTo(def.lengthMm / 1000, 12);
        expect(Math.abs((sm.s[last] as number) - (TABLE_LENGTH[def.id] as number))).toBeLessThan(0.01);
      });

      it('keeps every sample inside the listed tiles', () => {
        const listed = new Set(def.tiles.map(([x, y]) => `${x},${y}`));
        for (let k = 0; k < sm.n; k++) {
          const x = sm.x[k] as number;
          const y = sm.y[k] as number;
          // A point on a tile edge belongs to both neighbours; accept either.
          const xs = [Math.floor(x / 4 - 1e-9), Math.floor(x / 4 + 1e-9)];
          const ys = [Math.floor(y / 4 - 1e-9), Math.floor(y / 4 + 1e-9)];
          const inside = xs.some((tx) => ys.some((ty) => listed.has(`${tx},${ty}`)));
          const onExit = k === last; // the exit joint lies on the edge to the next tile
          expect(inside || onExit).toBe(true);
        }
        st.tileInfo.forEach((t, i) => expect([t.lx, t.ly]).toEqual(def.tiles[i]));
      });

      it('covers the listed rail height range', () => {
        let lo = Infinity;
        let hi = -Infinity;
        for (let k = 0; k < sm.n; k++) {
          lo = Math.min(lo, sm.h[k] as number);
          hi = Math.max(hi, sm.h[k] as number);
        }
        expect(Math.floor(lo + 1e-9) + 0).toBe(def.railMin);
        expect(Math.ceil(hi - 1e-9) + 0).toBe(def.railMax);
      });
    });
  }

  it('gentle 2 m per tile, steep 6 m per tile, bank 35° (master R17)', () => {
    expect(Math.tan(slopePitch('G+'))).toBeCloseTo(0.5, 12);
    expect(Math.tan(slopePitch('X-'))).toBeCloseTo(-1.5, 12);
    expect(bankAngle('right')).toBeCloseTo((35 * Math.PI) / 180, 12);
    expect(bankAngle('left')).toBeCloseTo((-35 * Math.PI) / 180, 12);
  });

  it('vertical loop climbs 16 m with quarter radii 12, 4, 4, 12 and counts as 1 inversion', () => {
    const st = pieceStatic('vertical_loop_right');
    const sm = st.samples;
    let top = 0;
    for (let k = 0; k < sm.n; k++) if ((sm.h[k] as number) > (sm.h[top] as number)) top = k;
    expect(sm.h[top]).toBeGreaterThan(15.99);
    expect(sm.kv[top]).toBeCloseTo(1 / 4, 12);
    expect(sm.kv[1]).toBeCloseTo(1 / 12, 12);
    expect(getTrackPieceDef('vertical_loop_right')?.inversions).toBe(1);
  });
});

describe('placement rotation', () => {
  const rot = (x: number, y: number, d: number): [number, number] => {
    switch (d) {
      case 0: return [x, y];
      case 1: return [-y, x];
      case 2: return [-x, -y];
      default: return [y, -x];
    }
  };

  for (const def of TRACK_PIECES) {
    it(`${def.id} occupies the rotated tiles and exits at the rotated joint in all 4 directions`, () => {
      for (let d = 0; d < 4; d++) {
        const piece: TrackPieceInstance = { defId: def.id, x: 20, y: 20, z: 10, dir: d as Dir, chain: false, brakeSpeed: null, cost: 0 };
        const world = pieceWorldTiles(piece).map((t) => `${t.x},${t.y}`).sort();
        const expected = def.tiles.map(([lx, ly]) => { const [rx, ry] = rot(lx, ly, d); return `${20 + rx},${20 + ry}`; }).sort();
        expect(world).toEqual(expected);
        const j = pieceExitJoint(piece);
        const [ex, ey] = rot(def.exit.dx, def.exit.dy, d);
        expect([j.x, j.y, j.z]).toEqual([20 + ex, 20 + ey, 10 + def.exit.dz]);
        expect(j.dir).toBe((d + def.exit.turn + 4) % 4);
        expect([j.slope, j.bank]).toEqual([def.exit.slope, def.exit.bank]);
      }
    });
  }

  it('uses the phase-2 direction convention: 0 = +x, 1 = +y, 2 = −x, 3 = −y', () => {
    expect([...TRACK_DX]).toEqual([1, 0, -1, 0]);
    expect([...TRACK_DY]).toEqual([0, 1, 0, -1]);
  });
});

describe('palette (pieces that fit an end state)', () => {
  const slopes: TrackSlope[] = ['F', 'G+', 'G-', 'X+', 'X-'];
  const banks: TrackBank[] = ['none', 'left', 'right'];
  for (const type of TRACK_TYPES) {
    it(`${type.id}: group and slope/bank rules`, () => {
      for (const slope of slopes) {
        for (const bank of banks) {
          const got = piecesForEnd(type.id, slope, bank).map((p) => p.id).sort();
          const expected = TRACK_PIECES.filter(
            (p) => type.groups.includes(p.group) && p.entry.slope === slope && p.entry.bank === bank && p.id !== 'station',
          ).map((p) => p.id).sort();
          expect(got).toEqual(expected);
        }
      }
    });
  }

  it('steel coaster on a flat unbanked end offers turns, loops, brakes; junior gets no steep or loop', () => {
    const steel = piecesForEnd('steel_coaster', 'F', 'none').map((p) => p.id);
    expect(steel).toContain('vertical_loop_left');
    expect(steel).toContain('block_brake');
    const junior = piecesForEnd('junior_coaster', 'G+', 'none').map((p) => p.id);
    expect(junior).toEqual(['gentle_up', 'gentle_up_to_flat']);
    const mouse = piecesForEnd('spinning_mouse', 'F', 'none').map((p) => p.id);
    expect(mouse).not.toContain('turn_medium_left');
    expect(piecesForEnd('ghost_train', 'F', 'none').map((p) => p.id)).toContain('spooky_tunnel');
  });
});
