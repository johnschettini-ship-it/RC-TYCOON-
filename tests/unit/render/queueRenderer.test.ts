/** Queue clarity in the whole renderer (fake canvas): queueing guests placed on the line; no entrance sign (path clarity). */
import { beforeAll, describe, expect, it } from 'vitest';
import { install, make } from './fakeCanvas';
import { createCanvasRenderer } from '../../../src/render/renderer';
import { defaultToolState } from '../../../src/render/types';
import { mapToViewContinuous } from '../../../src/render/view';
import { terrainClock } from '../../../src/render/terrain';
import { createWorld } from '../../../src/sim/world';
import { markNetworkDirty } from '../../../src/sim/pathing';
import { addGuestDirect, placeQueue, placeRideDirect } from '../../helpers/world';

beforeAll(() => {
  install();
  terrainClock.now = () => 0;
});

describe('queue clarity in the renderer', () => {
  it('places every queueing guest on its line and draws no ride name sign', () => {
    const world = createWorld({ seed: 7, parkName: 'Line Park', mapSize: 24 });
    const map = world.state.map;
    const ride = placeRideDirect(world, 'carousel', 8, 6, 0);
    ride.name = 'Spin Line';
    const e = ride.entrance!;
    const ex = e.outside % map.width;
    const ey = Math.floor(e.outside / map.width);
    for (let y = ey; y < ey + 4; y++) placeQueue(world, ex, y);
    markNetworkDirty(world);
    for (let k = 0; k < 7; k++) {
      const g = addGuestDirect(world, e.outside, { state: 'queueing', activityId: ride.id });
      ride.queue.push(g.id);
    }
    const canvas = make(1200, 800);
    const r = createCanvasRenderer(canvas as unknown as HTMLCanvasElement);
    r.resize(1200, 800, 1);
    const p = mapToViewContinuous(ex + 0.5, ey + 0.5, 0, map.width, map.height);
    r.draw(world, { centerX: (p.u - p.v) * 32, centerY: (p.u + p.v) * 16 - 64, zoom: 1, rotation: 0 }, defaultToolState(), 0);
    expect(canvas.dataset.queueGuests).toBe('7');
    expect(canvas.dataset.queueSigns).toBeUndefined();
  });
});
