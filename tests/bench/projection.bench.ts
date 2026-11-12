/**
 * Section projection budget (R5, plan ride-work-1 Task 4, decision 5): on desktop the prefix of a 300-piece track
 * ≤ 8 ms (once per built piece) and one candidate ≤ 1 ms (once per ghost change); the phone is about 4× slower.
 * Measured with 4-car and 7-car Steel Coaster trains and an 8-car Inverted Coaster train (review M-2).
 * Run with `npm run bench -- tests/bench/projection.bench.ts`. See tick.bench.ts on bench-mode overhead.
 */
import { test, vi } from 'vitest';

vi.mock('../../src/sim/research/api', () => ({ isUnlocked: () => true }));

import { getTrackTypeDef, type TrackTypeDef } from '../../src/data/track';
import { continueProjection, projectPrefix } from '../../src/sim/rides/track/projection';
import type { TrackRideData } from '../../src/sim/rides/track/types';
import { makeTestWorld } from '../helpers/world';
import { dataOf, EAST, HILLS_300, layPieces, place } from '../unit/track/helpers';

const RUN = { time: 2_000, warmupTime: 300 };

function hills(typeId: string, cars: number): { d: TrackRideData; type: TrackTypeDef } {
  const w = makeTestWorld();
  const id = place(w, typeId, 4, 2, EAST);
  const d = dataOf(w, id);
  return {
    d: { ...d, pieces: layPieces(HILLS_300, 4, 2, d.pieces[0]!.z), trainConfig: { trains: 1, carsPerTrain: cars } },
    type: getTrackTypeDef(typeId) as TrackTypeDef,
  };
}

for (const [typeId, cars] of [['steel_coaster', 4], ['steel_coaster', 7], ['inverted_coaster', 8]] as const) {
  test(`projection: 300-piece track, ${typeId}, ${cars} cars (prefix ≤ 8 ms, candidate ≤ 1 ms)`, async ({ bench }) => {
    const { d, type } = hills(typeId, cars);
    const straight = layPieces([...HILLS_300, 'straight'], 4, 2, d.pieces[0]!.z).at(-1)!;
    const pieces = [...d.pieces, straight];
    const p = await bench(`prefix (${cars} cars)`, () => projectPrefix({ ...d }, type)).run(RUN);
    const prefix = projectPrefix(d, type);
    if (prefix.stall) throw new Error(`the bench train stalls on piece ${prefix.stall.piece + 1}`);
    const c = await bench(`candidate (${cars} cars)`, () => continueProjection(pieces, type, cars, prefix)).run(RUN);
    console.log(
      `[bench] ${typeId} ${cars} cars: prefix mean ${p.latency.mean.toFixed(3)} ms (${prefix.ticks} ticks; budget 8), ` +
        `candidate mean ${c.latency.mean.toFixed(3)} ms (budget 1)`,
    );
  }, 120_000);
}
