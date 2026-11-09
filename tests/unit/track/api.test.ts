import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/research/api', () => ({ isUnlocked: () => true }));

import { executeCommand } from '../../../src/sim/commands';
import { tileIndex } from '../../../src/sim/map';
import { TRACK_ERR } from '../../../src/data/strings/track';
import {
  nextTrackPieces,
  pieceWorldSamples,
  previewTrackPiece,
  trackTileSlices,
  trainSpinFrame,
} from '../../../src/sim/rides/track/api';
import { newTrain } from '../../../src/sim/rides/track/physics';
import { makeTestWorld, placeFootpath, stateHash } from '../../helpers/world';
import { add, buildR1, dataOf, EAST, expectOk, place } from './helpers';

describe('builder helpers', () => {
  it('nextTrackPieces lists only pieces that fit the end and the type', () => {
    const w = makeTestWorld();
    const id = place(w, 'junior_coaster', 10, 10, EAST);
    const ids = nextTrackPieces(w, id).map((p) => p.id);
    expect(ids).toContain('station');
    expect(ids).toContain('flat_to_gentle_up');
    expect(ids).not.toContain('gentle_up');
    expect(ids).not.toContain('vertical_loop_left');
    expectOk(add(w, id, 'straight'));
    expect(nextTrackPieces(w, id).map((p) => p.id)).not.toContain('station');
    expectOk(add(w, id, { id: 'flat_to_gentle_up', chain: true }));
    expect(nextTrackPieces(w, id).map((p) => p.id).sort()).toEqual(['gentle_up', 'gentle_up_to_flat']);
  });

  it('previewTrackPiece gives the same verdict and cost as addTrackPiece without changing state', () => {
    const w = makeTestWorld();
    const id = place(w, 'steel_coaster', 10, 10, EAST, false);
    const h = stateHash(w);
    const p = previewTrackPiece(w, id, 'flat_to_gentle_up', true);
    expect(p).toMatchObject({ ok: true, cost: 6_300, closes: false, heightAboveGround: 1 });
    expect(stateHash(w)).toBe(h);
    expect(previewTrackPiece(w, id, 'flat_to_gentle_down')).toEqual({ ok: false, reason: TRACK_ERR.belowGround });
    const r = expectOk(add(w, id, { id: 'flat_to_gentle_up', chain: true }, false));
    expect(r.cost).toBe(6_300);
  });
});

describe('renderer helpers', () => {
  it('tile slices mark supports under elevated rail and none over a path', () => {
    const w = makeTestWorld();
    placeFootpath(w, 16, 6);
    const id = buildR1(w);
    const slices = trackTileSlices(w, id);
    const at = (x: number, y: number) => slices.filter((s) => s.tile === tileIndex(w.state.map, x, y));
    expect(at(4, 2)[0]).toMatchObject({ railMin: 8, support: false, rail: true });
    expect(at(9, 2)[0]).toMatchObject({ railMin: 13, railMax: 19, support: true });
    expect(at(16, 6)[0]).toMatchObject({ railMin: 19, support: false });
    expect(at(16, 7)[0]?.support).toBe(true);
    // Medium turn: 9 tiles, 5 with rail.
    const turn = slices.filter((s) => s.pieceIndex === 10);
    expect(turn).toHaveLength(9);
    expect(turn.filter((s) => s.rail)).toHaveLength(5);
  });

  it('world samples of consecutive pieces join', () => {
    const w = makeTestWorld();
    const id = buildR1(w);
    const pieces = dataOf(w, id).pieces;
    for (let i = 0; i < pieces.length; i++) {
      const a = pieceWorldSamples(pieces[i]!);
      const b = pieceWorldSamples(pieces[(i + 1) % pieces.length]!);
      expect(Math.abs((a.x[a.n - 1] as number) - (b.x[0] as number))).toBeLessThan(1e-9);
      expect(Math.abs((a.y[a.n - 1] as number) - (b.y[0] as number))).toBeLessThan(1e-9);
      expect(Math.abs((a.z[a.n - 1] as number) - (b.z[0] as number))).toBeLessThan(1e-9);
    }
  });

  it('spin frames cycle with distance', () => {
    const t = newTrain(1, 0, 1, 4);
    t.dist = 750 * 17;
    expect(trainSpinFrame(t)).toBe(1);
  });

  it('a failed setTrackColours or gate command changes nothing', () => {
    const w = makeTestWorld();
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    const h = stateHash(w);
    expect(executeCommand(w, { type: 'setTrackColours', rideId: id, track: -1, supports: 0, cars: 0 }).ok).toBe(false);
    expect(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'exit', x: 30, y: 30 }).ok).toBe(false);
    expect(executeCommand(w, { type: 'startTestRun', rideId: 999 })).toEqual({ ok: false, reason: TRACK_ERR.noRide });
    expect(stateHash(w)).toBe(h);
  });
});
