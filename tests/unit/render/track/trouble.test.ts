/** R7 (owner 2026-11-12): the trouble place of a selected track ride is outlined on the map (plan ride-work-1 Task 3). */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/sim/research/api', () => ({ isUnlocked: () => true }));

import { trackTroubleTiles } from '../../../../src/render/track/selection';
import { executeCommand } from '../../../../src/sim/commands';
import { inBounds, tileIndex } from '../../../../src/sim/map';
import { pieceWorldTiles } from '../../../../src/sim/rides/track/geometry';
import { updateTrackRides } from '../../../../src/sim/rides/track/update';
import type { World } from '../../../../src/sim/types';
import { makeTestWorld } from '../../../helpers/world';
import { addAll, buildR1, dataOf, EAST, expectOk, place, R1_PIECES, rideOf } from '../../track/helpers';

function publishTest(w: World, id: number): void {
  expectOk(executeCommand(w, { type: 'startTestRun', rideId: id }));
  const n = (dataOf(w, id).testRun?.ticksLeft ?? 0) + 1;
  for (let i = 0; i < n; i++) {
    updateTrackRides(w);
    w.state.tick++;
  }
}

describe('trouble place outline (R7)', () => {
  it('is the stall piece’s tiles for R1 with an unchained lift, the same array on a second call', () => {
    const w = makeTestWorld();
    const id = place(w, 'steel_coaster', 4, 2, EAST);
    addAll(w, id, R1_PIECES.map((p) => (typeof p === 'string' ? p : p.id === 'brakes' ? p : p.id)));
    publishTest(w, id);
    const map = w.state.map;
    const expected = pieceWorldTiles(dataOf(w, id).pieces[3]!).filter((t) => inBounds(map, t.x, t.y)).map((t) => tileIndex(map, t.x, t.y));
    const tiles = trackTroubleTiles(w, rideOf(w, id));
    expect([...tiles]).toEqual([...new Set(expected)]);
    expect(trackTroubleTiles(w, rideOf(w, id))).toBe(tiles);
  });

  it('is empty for R1 passed and for a ride without a test', () => {
    const w = makeTestWorld();
    const id = buildR1(w);
    expect(trackTroubleTiles(w, rideOf(w, id))).toEqual([]);
    publishTest(w, id);
    expect(trackTroubleTiles(w, rideOf(w, id))).toEqual([]);
  });
});
