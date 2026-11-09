import { describe, expect, it } from 'vitest';
import { trackRideTiles } from '../../../../src/render/track/selection';
import { executeCommand } from '../../../../src/sim/commands';
import { Content, tileIndex } from '../../../../src/sim/map';
import { pieceWorldTiles } from '../../../../src/sim/rides/track/geometry';
import { makeTestWorld, placeFootpath, placeQueue, placeRideDirect } from '../../../helpers/world';
import { add, buildR1, dataOf, EAST, expectOk, place, rideOf } from '../../track/helpers';

describe('selected track ride outline (station, track, and gate tiles)', () => {
  it('covers every piece tile and both gates, each once, and nothing else', () => {
    const w = makeTestWorld();
    placeQueue(w, 5, 4);
    placeFootpath(w, 6, 4);
    const id = buildR1(w);
    expectOk(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'entrance', x: 5, y: 3 }, { setup: true }));
    expectOk(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'exit', x: 6, y: 3 }, { setup: true }));
    const ride = rideOf(w, id);
    const map = w.state.map;
    const tiles = trackRideTiles(w, ride);
    const expected = new Set<number>();
    for (const p of dataOf(w, id).pieces) for (const t of pieceWorldTiles(p)) expected.add(tileIndex(map, t.x, t.y));
    expected.add(tileIndex(map, 5, 3));
    expected.add(tileIndex(map, 6, 3));
    expect(new Set(tiles)).toEqual(expected);
    expect(tiles.length).toBe(expected.size);
    // Every ground tile the ride owns is outlined (the station and track on the ground, the gate buildings).
    for (let i = 0; i < map.content.length; i++) {
      const c = map.content[i];
      if (map.contentRef[i] === id && (c === Content.Track || c === Content.Building)) expect(tiles).toContain(i);
    }
  });

  it('is cached until a piece or a gate changes', () => {
    const w = makeTestWorld();
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    const ride = rideOf(w, id);
    const a = trackRideTiles(w, ride);
    expect(trackRideTiles(w, ride)).toBe(a);
    expectOk(add(w, id, 'straight'));
    const b = trackRideTiles(w, ride);
    expect(b).not.toBe(a);
    expect(b.length).toBeGreaterThan(a.length);
    expect(trackRideTiles(w, ride)).toBe(b);
  });

  it('is empty for a flat ride', () => {
    const w = makeTestWorld();
    expect(trackRideTiles(w, placeRideDirect(w, 'carousel', 10, 10, 0))).toEqual([]);
  });
});
