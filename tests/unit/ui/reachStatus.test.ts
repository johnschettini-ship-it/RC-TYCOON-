/** Path clarity (spec 2026-11-18 §2–3): the ride reach status line and Show me. */
import { describe, expect, it } from 'vitest';
import { markNetworkDirty } from '../../../src/sim/pathing';
import { tileIndex } from '../../../src/sim/map';
import { defaultToolState } from '../../../src/render/types';
import { reachLine, showMe, SHOW_ME_MS, type ShowMeHost } from '../../../src/ui/rides/reachStatus';
import { rideWarnings } from '../../../src/ui/info';
import { en } from '../../../src/data/strings/en';
import type { World } from '../../../src/sim/types';
import { makeTestWorld, placeFootpath, placeQueue, placeRideDirect } from '../../helpers/world';

function road(world: World, x: number, y: number): void {
  const map = world.state.map;
  const ex = map.entranceTile % map.width;
  const ey = Math.floor(map.entranceTile / map.width);
  for (let yy = y; yy < ey; yy++) if (map.content[tileIndex(map, ex, yy)] === 0) placeFootpath(world, ex, yy);
  for (let xx = Math.min(x, ex); xx <= Math.max(x, ex); xx++) placeFootpath(world, xx, y);
  markNetworkDirty(world);
}

describe('reach status line', () => {
  it('the spec strings', () => {
    expect(en['ride.reach.noQueue']).toBe('No queue at the entrance');
    expect(en['ride.reach.noFootpath']).toBe('No footpath reaches the queue');
    expect(en['ride.reach.closed']).toBe('The ride is closed');
    expect(en['ride.reach.ok']).toBe('Guests can reach this ride');
    expect(en['ride.reach.showMe']).toBe('Show me');
  });

  it('each status in turn, with Show me only for a missing queue or footpath; it follows the paths as they are built', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 10, 10, 0);
    ride.status = 'closed';
    expect(reachLine(w, ride.id)).toMatchObject({ status: 'noQueue', text: 'No queue at the entrance', showMe: true, tile: ride.entrance!.outside });
    placeQueue(w, 11, 13);
    const end = placeQueue(w, 11, 14);
    markNetworkDirty(w);
    expect(reachLine(w, ride.id)).toMatchObject({ status: 'noFootpath', text: 'No footpath reaches the queue', showMe: true, tile: end });
    road(w, 11, 15);
    expect(reachLine(w, ride.id)).toMatchObject({ status: 'closed', text: 'The ride is closed', showMe: false });
    ride.status = 'open';
    expect(reachLine(w, ride.id)).toMatchObject({ status: 'ok', text: 'Guests can reach this ride', showMe: false });
  });

  it('no line for a ride with no entrance (a track ride being built)', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 10, 10, 0);
    ride.entrance = null;
    expect(reachLine(w, ride.id)).toBeNull();
  });

  it('Show me closes the panel, shows the tile and pulses it for 3 s', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 10, 10, 0);
    const calls: string[] = [];
    const tool = defaultToolState();
    const host: ShowMeHost = {
      game: { tool },
      closePanel: () => calls.push('close'),
      showMapPlace: (t) => calls.push(`show ${t}`),
    };
    const line = reachLine(w, ride.id)!;
    showMe(host, line, 1000);
    expect(calls).toEqual(['close', `show ${ride.entrance!.outside}`]);
    expect(SHOW_ME_MS).toBe(3000);
    expect(tool.pathFocus).toEqual({ tile: ride.entrance!.outside, z: line.z, until: 4000 });
  });

  it('the panel warnings no longer repeat the entrance queue (the status line says it)', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 10, 10, 0);
    expect(rideWarnings(w, ride)).toEqual(['The exit needs a footpath']);
    expect(en['ui.ride.entranceQueue']).toBeUndefined();
  });
});
