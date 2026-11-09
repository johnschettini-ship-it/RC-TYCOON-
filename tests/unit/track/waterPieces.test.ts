/** Water piece sets (Phase 4 §4.4): table, geometry, palette. Owner: W3-C. */
import { describe, expect, it } from 'vitest';
import {
  ALL_TRACK_PIECES,
  ALL_TRACK_TYPES,
  TRACK_PIECES,
  WATER_PIECES,
  WATER_TRACK_TYPES,
  getTrackPieceDef,
  getTrackTypeDef,
} from '../../../src/data/track';
import { FLUME_K, FLUME_V_CURRENT, RAPIDS_K, RAPIDS_V_CURRENT, V_LIFT, V_STATION_CONVEYOR } from '../../../src/data/tuning/track';
import { entryJointLocal, exitJointLocal, pieceExitJoint, pieceStatic, pieceWorldTiles, piecesForEnd, slopePitch } from '../../../src/sim/rides/track/geometry';
import type { TrackDir, TrackPieceInstance } from '../../../src/sim/rides/track/types';

/** Phase 4 §4.4 table rows: piece id(s), geometry, drive. `_l` / `_r` rows hold two ids. */
const TABLE: Array<{ ids: string[]; geometry: string; drive: string }> = [
  { ids: ['flume_station'], geometry: 'straight', drive: 'conveyor' },
  { ids: ['flume_straight'], geometry: 'straight', drive: 'current' },
  { ids: ['flume_turn_small_l', 'flume_turn_small_r'], geometry: 'small turn', drive: 'current' },
  { ids: ['flume_turn_medium_l', 'flume_turn_medium_r'], geometry: 'medium turn', drive: 'current' },
  { ids: ['flume_slope_down'], geometry: 'gentle down', drive: 'current' },
  { ids: ['flume_drop'], geometry: 'steep down', drive: 'gravity' },
  { ids: ['flume_lift'], geometry: 'gentle up', drive: 'conveyor' },
  { ids: ['flume_splashdown'], geometry: 'straight 2', drive: 'splash' },
  { ids: ['rapids_station'], geometry: 'straight', drive: 'conveyor' },
  { ids: ['rapids_straight'], geometry: 'straight', drive: 'current' },
  { ids: ['rapids_turn_small_l', 'rapids_turn_small_r'], geometry: 'small turn', drive: 'current' },
  { ids: ['rapids_turn_medium_l', 'rapids_turn_medium_r'], geometry: 'medium turn', drive: 'current' },
  { ids: ['rapids_slope_down'], geometry: 'gentle down', drive: 'current' },
  { ids: ['rapids_waterfall'], geometry: 'steep down', drive: 'gravity' },
  { ids: ['rapids_rough'], geometry: 'straight', drive: 'current' },
  { ids: ['rapids_whirlpool'], geometry: 'straight', drive: 'whirlpool' },
  { ids: ['rapids_lift'], geometry: 'gentle up', drive: 'conveyor' },
];

/** Expected exit (dx, dy, dz, turn), length (m), and tile count per geometry name (Phase 2 numbers, master R17). */
const GEOMETRY: Record<string, { exit: [number, number, number, number]; length: number; tiles: number; turns?: 'left' | 'right' }> = {
  straight: { exit: [1, 0, 0, 0], length: 4.0, tiles: 1 },
  'straight 2': { exit: [2, 0, 0, 0], length: 8.0, tiles: 2 },
  'gentle down': { exit: [1, 0, -2, 0], length: 4.47, tiles: 1 },
  'gentle up': { exit: [1, 0, 2, 0], length: 4.47, tiles: 1 },
  'steep down': { exit: [1, 0, -6, 0], length: 7.21, tiles: 1 },
  'small turn': { exit: [0, 1, 0, 1], length: 3.14, tiles: 1 },
  'medium turn': { exit: [2, 3, 0, 1], length: 15.71, tiles: 9 },
};

describe('water piece table (Phase 4 §4.4)', () => {
  it('has the 17 table rows as 21 piece ids, flume first, after the 29 rail pieces', () => {
    expect(TABLE).toHaveLength(17);
    const ids = TABLE.flatMap((r) => r.ids);
    expect(WATER_PIECES.map((p) => p.id)).toEqual(ids);
    expect(TRACK_PIECES).toHaveLength(29);
    expect(ALL_TRACK_PIECES).toHaveLength(29 + 21);
    WATER_PIECES.forEach((p, i) => expect(p.num).toBe(30 + i));
    for (const id of ids) expect(getTrackPieceDef(id)?.id).toBe(id);
  });

  it('every row has its geometry, drive, flat joints, and its set', () => {
    for (const row of TABLE) {
      const g = GEOMETRY[row.geometry]!;
      for (const id of row.ids) {
        const def = getTrackPieceDef(id)!;
        const left = id.endsWith('_l');
        expect([def.exit.dx, def.exit.dy * (left ? -1 : 1), def.exit.dz, def.exit.turn * (left ? -1 : 1)]).toEqual(g.exit);
        expect(Math.abs(def.lengthMm / 1000 - g.length)).toBeLessThan(0.01);
        expect(def.tiles).toHaveLength(g.tiles);
        expect(def.water?.drive).toBe(row.drive);
        expect(def.entry).toEqual({ slope: 'F', bank: 'none' });
        expect([def.exit.slope, def.exit.bank]).toEqual(['F', 'none']);
        expect(def.set).toBe(id.startsWith('flume') ? 'flume' : 'rapids');
        expect(def.chainable).toBe(false);
        expect(def.inversions).toBe(0);
      }
    }
  });

  it('conveyors run at 1.5 m/s in stations and 2.0 m/s on lifts; splashdown and waterfall get riders wet', () => {
    for (const p of WATER_PIECES) {
      if (p.water?.drive !== 'conveyor') expect(p.water?.conveyorMms).toBe(0);
    }
    expect(getTrackPieceDef('flume_station')?.water?.conveyorMms).toBe(V_STATION_CONVEYOR * 1000);
    expect(getTrackPieceDef('rapids_station')?.water?.conveyorMms).toBe(1500);
    expect(getTrackPieceDef('flume_lift')?.water?.conveyorMms).toBe(V_LIFT * 1000);
    expect(getTrackPieceDef('rapids_lift')?.water?.conveyorMms).toBe(2000);
    const wet = WATER_PIECES.filter((p) => p.water?.wetsRiders).map((p) => p.id);
    expect(wet).toEqual(['flume_splashdown', 'rapids_waterfall']);
    expect(getTrackPieceDef('flume_station')?.special).toBe('station');
    expect(getTrackPieceDef('rapids_station')?.special).toBe('station');
    expect(getTrackPieceDef('rapids_rough')?.special).toBe('rough');
    expect(getTrackPieceDef('rapids_whirlpool')?.special).toBe('whirlpool');
    for (const p of TRACK_PIECES) expect([p.set, p.water]).toEqual(['rail', null]);
  });

  for (const def of WATER_PIECES) {
    describe(def.id, () => {
      const sm = pieceStatic(def.id).samples;
      const last = sm.n - 1;

      it('starts on the entry joint and ends on the exit joint (within 1e-9 m)', () => {
        const e = entryJointLocal();
        expect(sm.x[0]).toBeCloseTo(e.x, 12);
        expect(sm.y[0]).toBeCloseTo(e.y, 12);
        expect(sm.h[0]).toBe(0);
        const x = exitJointLocal(def);
        expect(Math.abs((sm.x[last] as number) - x.x)).toBeLessThan(1e-9);
        expect(Math.abs((sm.y[last] as number) - x.y)).toBeLessThan(1e-9);
        expect(Math.abs((sm.h[last] as number) - def.exit.dz)).toBeLessThan(1e-9);
        expect(sm.s[last]).toBeCloseTo(def.lengthMm / 1000, 12);
      });

      it('keeps every sample inside its tiles and covers its rail range', () => {
        const listed = new Set(def.tiles.map(([x, y]) => `${x},${y}`));
        let lo = Infinity;
        let hi = -Infinity;
        for (let k = 0; k < sm.n; k++) {
          const xs = [Math.floor((sm.x[k] as number) / 4 - 1e-9), Math.floor((sm.x[k] as number) / 4 + 1e-9)];
          const ys = [Math.floor((sm.y[k] as number) / 4 - 1e-9), Math.floor((sm.y[k] as number) / 4 + 1e-9)];
          expect(xs.some((tx) => ys.some((ty) => listed.has(`${tx},${ty}`))) || k === last).toBe(true);
          lo = Math.min(lo, sm.h[k] as number);
          hi = Math.max(hi, sm.h[k] as number);
        }
        expect(Math.floor(lo + 1e-9) + 0).toBe(def.railMin);
        expect(Math.ceil(hi - 1e-9) + 0).toBe(def.railMax);
        // Samples follow the channel: neighbours are one sample step apart in space.
        for (let k = 1; k < sm.n; k++) {
          const d = Math.hypot((sm.x[k] as number) - (sm.x[k - 1] as number), (sm.y[k] as number) - (sm.y[k - 1] as number), (sm.h[k] as number) - (sm.h[k - 1] as number));
          // (The table length is rounded to the mm, so the spacing may be off by that share.)
          expect(d).toBeLessThanOrEqual(0.25 * 1.0001);
        }
      });

      it('slopes keep the gentle or steep pitch and do the exact work of their height change', () => {
        let work = 0;
        for (let k = 0; k < last; k++) work += ((sm.sinT[k] as number) + (sm.sinT[k + 1] as number)) / 2 * ((sm.s[k + 1] as number) - (sm.s[k] as number));
        expect(work).toBeCloseTo(def.exit.dz, 6);
        if (def.geometry.kind === 'ramp') {
          const pitch = slopePitch(def.geometry.slope);
          expect(Math.tan(pitch)).toBeCloseTo(def.exit.dz / 4, 9);
          for (let k = 0; k < sm.n; k++) expect(sm.theta[k]).toBeCloseTo(pitch, 12);
          expect(sm.kv[1]).toBe(0);
        }
      });

      it('rotates into 4 directions with the rotated tiles and exit joint', () => {
        for (let d = 0; d < 4; d++) {
          const piece: TrackPieceInstance = { defId: def.id, x: 20, y: 20, z: 10, dir: d as TrackDir, chain: false, brakeSpeed: null, cost: 0 };
          expect(pieceWorldTiles(piece)).toHaveLength(def.tiles.length);
          const j = pieceExitJoint(piece);
          expect(j.z).toBe(10 + def.exit.dz);
          expect(j.dir).toBe((d + def.exit.turn + 4) % 4);
        }
      });
    });
  }
});

describe('water track types (catalog §2, Phase 4 §8)', () => {
  it('Log Flume and Rapids Raft use the water current drive, their set, and the catalog vehicle numbers', () => {
    expect(WATER_TRACK_TYPES.map((t) => t.id)).toEqual(['log_flume', 'rapids_raft']);
    expect(ALL_TRACK_TYPES).toHaveLength(9);
    const flume = getTrackTypeDef('log_flume')!;
    const rapids = getTrackTypeDef('rapids_raft')!;
    expect([flume.drive, flume.medium, flume.pieceSet, flume.stationPiece]).toEqual(['waterCurrent', 'water', 'flume', 'flume_station']);
    expect([rapids.drive, rapids.medium, rapids.pieceSet, rapids.stationPiece]).toEqual(['waterCurrent', 'water', 'rapids', 'rapids_station']);
    expect(flume.water).toEqual({ currentMms: FLUME_V_CURRENT * 1000, k: FLUME_K });
    expect(rapids.water).toEqual({ currentMms: RAPIDS_V_CURRENT * 1000, k: RAPIDS_K });
    expect([flume.vehicle.seatsPerCar, flume.vehicle.carsMax, flume.vehicle.maxTrains, flume.maxHeightM]).toEqual([4, 1, 6, 20]);
    expect([rapids.vehicle.seatsPerCar, rapids.vehicle.carsMax, rapids.vehicle.maxTrains, rapids.maxHeightM]).toEqual([8, 1, 8, 10]);
    // One boat per station tile: a boat is one 4 m car.
    expect(flume.vehicle.carLengthMm).toBe(4000);
    expect(rapids.vehicle.carLengthMm).toBe(4000);
    for (const t of ALL_TRACK_TYPES.slice(0, 7)) expect([t.pieceSet, t.stationPiece, t.water]).toEqual(['rail', 'station', null]);
  });

  it('the palette offers only the pieces of the type set (water features in the Special group)', () => {
    const flume = piecesForEnd('log_flume', 'F', 'none').map((p) => p.id);
    expect(flume).toEqual(WATER_PIECES.filter((p) => p.set === 'flume' && p.special !== 'station').map((p) => p.id));
    expect(piecesForEnd('log_flume', 'F', 'none', true).map((p) => p.id)).toContain('flume_station');
    expect(piecesForEnd('log_flume', 'F', 'none', true).map((p) => p.id)).not.toContain('station');
    const rapids = piecesForEnd('rapids_raft', 'F', 'none').map((p) => p.id);
    expect(rapids).toContain('rapids_whirlpool');
    expect(rapids.every((id) => id.startsWith('rapids_'))).toBe(true);
    expect(piecesForEnd('log_flume', 'G-', 'none')).toEqual([]);
    // Rail types never see water pieces.
    for (const t of ALL_TRACK_TYPES.slice(0, 7)) {
      expect(piecesForEnd(t.id, 'F', 'none', true).every((p) => p.set === 'rail')).toBe(true);
    }
  });
});
