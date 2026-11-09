import { describe, expect, it } from 'vitest';
import { buildOccupancy } from '../../../src/sim/rides/track/placement';
import { clearanceBlock, lowestAbove, markOccupancyDirty, occupantReason, occupantsAt } from '../../../src/sim/occupancy';
import { Content } from '../../../src/sim/map';
import { makeTestWorld, makeTrackRideDataDirect, placeRideDirect, trackPiecesDirect } from '../../helpers/world';
import { T, elevated, groundPath, reason, setLand } from './helpers';
import type { World } from '../../../src/sim/types';

/** A steel coaster whose 3 station pieces run along +x from (x, 44) with rails at `z` (high above the land). */
function highTrack(w: World, x: number, z: number): number {
  const ride = placeRideDirect(w, 'carousel', x, 40);
  for (let i = 0; i < w.state.map.contentRef.length; i++) {
    if (w.state.map.contentRef[i] === ride.id) {
      w.state.map.content[i] = Content.Empty;
      w.state.map.contentRef[i] = -1;
    }
  }
  ride.kind = 'track';
  ride.defId = 'steel_coaster';
  makeTrackRideDataDirect(w, ride, { pieces: trackPiecesDirect(x, 44, z, 0, ['station', 'station', 'station']) });
  markOccupancyDirty(w);
  return ride.id;
}

describe('occupancy list (master 6.3, Phase 4 §4.2)', () => {
  it('lists ground paths, elevated paths, and track envelopes, lowest first', () => {
    const w = makeTestWorld();
    const i = groundPath(w, 20, 44);
    const p = elevated(w, 20, 44, 11);
    const rideId = highTrack(w, 20, 20);
    const env = buildOccupancy(w).get(i)![0]!;
    expect(occupantsAt(w, i)).toEqual([
      { kind: 'groundPath', id: -1, zMin: 8, zMax: 11 },
      { kind: 'elevatedPath', id: p.id, zMin: 11, zMax: 14 },
      { kind: 'track', id: rideId, zMin: env.railMin - 1, zMax: env.railMax + 3 },
    ]);
    expect(occupantsAt(w, T(w, 5, 5))).toEqual([]);
    expect(occupantsAt(w, -1)).toEqual([]);
  });

  it('a ramp keeps 3 m of headroom above its high edge', () => {
    const w = makeTestWorld();
    const i = setLand(w, 20, 20, 8, 0b0011);
    groundPath(w, 20, 20);
    const p = elevated(w, 21, 20, 12, 'footpath', 1);
    expect(occupantsAt(w, i)[0]).toEqual({ kind: 'groundPath', id: -1, zMin: 8, zMax: 12 });
    expect(occupantsAt(w, T(w, 21, 20))[0]).toEqual({ kind: 'elevatedPath', id: p.id, zMin: 12, zMax: 16 });
  });

  it('clearanceBlock finds the first overlap and can ignore one object; lowestAbove gives the next zMin', () => {
    const w = makeTestWorld();
    const i = groundPath(w, 20, 20);
    const p = elevated(w, 20, 20, 14);
    expect(clearanceBlock(w, i, 11, 14)).toBeNull();
    expect(clearanceBlock(w, i, 10, 12)?.kind).toBe('groundPath');
    expect(clearanceBlock(w, i, 13, 15)?.id).toBe(p.id);
    expect(clearanceBlock(w, i, 13, 15, p.id)).toBeNull();
    // The ground path is never ignored by an id.
    expect(clearanceBlock(w, i, 8, 9, -1)?.kind).toBe('groundPath');
    expect(lowestAbove(w, i, 9)).toBe(14);
    expect(lowestAbove(w, i, 8)).toBe(8);
    expect(lowestAbove(w, i, 15)).toBeNull();
  });

  it('elevated paths respect track envelopes', () => {
    const w = makeTestWorld();
    highTrack(w, 20, 20);
    const env = buildOccupancy(w).get(T(w, 21, 44))![0]!;
    const top = env.railMin - 1; // envelope bottom
    expect(reason(w, { type: 'buildPath', x: 21, y: 44, kind: 'footpath', z: top - 2 })).toBe('Not enough clearance under an object');
    expect(reason(w, { type: 'buildPath', x: 21, y: 44, kind: 'footpath', z: top - 3 })).toBeNull();
  });

  it('follows changes: new elevated paths are seen at once; ground paths are read from the map', () => {
    const w = makeTestWorld();
    const i = T(w, 30, 30);
    expect(occupantsAt(w, i)).toEqual([]);
    elevated(w, 30, 30, 12);
    expect(occupantsAt(w, i)).toHaveLength(1);
    w.state.map.content[i] = Content.Queue;
    expect(occupantsAt(w, i).map((o) => o.kind)).toEqual(['groundPath', 'elevatedPath']);
  });

  it('gives the §4.1 reason strings', () => {
    expect(occupantReason({ kind: 'groundPath', id: -1, zMin: 0, zMax: 3 })).toBe('A path is in the way');
    expect(occupantReason({ kind: 'track', id: 1, zMin: 0, zMax: 3 })).toBe('A track is in the way');
    expect(occupantReason({ kind: 'scenery', id: 1, zMin: 0, zMax: 3 })).toBe('Scenery is in the way');
    expect(occupantReason({ kind: 'elevatedPath', id: 1, zMin: 0, zMax: 3 })).toBe('Not enough clearance under an object');
  });
});
