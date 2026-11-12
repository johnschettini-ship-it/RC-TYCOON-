/**
 * R5 (owner 2026-11-12): the live meter in the track builder (plan ride-work-1 Task 6). `meterView` turns the piece's
 * projected section into the items the panel shows: top speed, the strongest car's vertical G range and sideways G, or
 * where the train stops. Levels come from the sim's `meterLevel`; G values use the sim's `formatSafetyG` (two decimals),
 * the formatter of the Build and Open refusals.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/sim/research/api', async (orig) => ({ ...(await orig<object>()), isUnlocked: () => true }));

import { previewTrackPiece } from '../../../../src/sim/rides/track/api';
import type { SectionProjection } from '../../../../src/sim/rides/track/projection';
import { formatSafetyG } from '../../../../src/sim/rides/track/safety';
import { meterView, pieceGhostFor } from '../../../../src/ui/track/builder';
import { formatSpeed } from '../../../../src/ui/track/testFormat';
import { makeTestWorld } from '../../../helpers/world';
import { addAll, EAST, place, R1_PIECES } from '../../track/helpers';

const base: SectionProjection = {
  reached: true,
  stallPiece: null,
  stallKind: null,
  vMaxMms: 10_000,
  posGMax: 120,
  vertGMin: 80,
  latMax: 10,
  avg: { posGMax: 110, vertGMin: 90, latMax: 5 },
  breach: null,
};

describe('meterView (R5)', () => {
  it('null gives no items', () => expect(meterView(null)).toEqual([]));

  it('a stall gives one warning item with the piece number', () => {
    expect(meterView({ ...base, reached: false, stallPiece: 3, stallKind: 'stop' })).toEqual([
      { id: 'stops', text: 'Train stops on piece 4', level: 'warn', label: 'Near the limit' },
    ]);
  });

  it('levels follow meterLevel; vertical takes the worse of its two ends', () => {
    const items = meterView({ ...base, vMaxMms: 17_400, posGMax: 452, vertGMin: 20, latMax: 301 });
    expect(items.map((i) => [i.id, i.level])).toEqual([['speed', 'ok'], ['vertical', 'warn'], ['lateral', 'over']]);
    expect(items[0]!.text).toBe(`Top ${formatSpeed(17_400)}`);
    expect(items[2]!.label).toBe('Over the safety limit');
    expect(meterView({ ...base, posGMax: 300, vertGMin: -201 })[1]!.level).toBe('over');
    expect(meterView({ ...base, posGMax: 601, vertGMin: -150 })[1]!.level).toBe('over');
    expect(meterView({ ...base, posGMax: 300, vertGMin: -150 })[1]!.level).toBe('warn');
  });

  it('G values have two decimals, the formatter of the Build and Open refusals', () => {
    const items = meterView({ ...base, posGMax: 601, vertGMin: -35, latMax: 300 });
    expect(items[1]!.text).toBe(`${formatSafetyG(601)} G to ${formatSafetyG(-35)} G`);
    expect(items[1]!.text).toBe('6.01 G to −0.35 G');
    expect(items[2]!.text).toBe('3.00 G sideways');
    // Exactly at the limits: warn, not over.
    expect(meterView({ ...base, posGMax: 600, vertGMin: -200, latMax: 300 }).map((i) => i.level)).toEqual(['ok', 'warn', 'warn']);
  });

  it('pieceGhostFor carries the meter of the preview', () => {
    const w = makeTestWorld();
    const id = place(w, 'steel_coaster', 4, 2, EAST);
    addAll(w, id, R1_PIECES.slice(0, 9));
    const g = pieceGhostFor(w, id, 'straight', false, 6)!;
    expect(g.meter).not.toBeNull();
    expect(g.meter).toEqual(previewTrackPiece(w, id, 'straight').meter);
    // A piece refused before the projection (does not fit) has no meter.
    expect(pieceGhostFor(w, id, 'steep_up', false, 6)!.meter).toBeNull();
  });
});
