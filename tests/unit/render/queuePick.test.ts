/** Queue clarity review fix 1: a tap hits a queueing guest where it is DRAWN (on the line), not its sim tile. */
import { describe, expect, it } from 'vitest';
import { queueGuestAtWorld, type DrawnQueueGuest } from '../../../src/render/queue';
import { viewAffine, viewPointSX, viewPointSY } from '../../../src/render/view';

const W = 64;
const H = 64;

function at(id: number, fx: number, fy: number, z = 8): DrawnQueueGuest {
  return { id, fx, fy, z, frame: 1 };
}

describe('queueGuestAtWorld', () => {
  it('hits a guest body drawn at the point, the front-most one when two overlap; misses empty ground', () => {
    const guests = new Map<number, DrawnQueueGuest>([
      [1, at(1, 10.5, 10.2)],
      [2, at(2, 10.5, 10.5)],
    ]);
    const va = viewAffine(0, W, H);
    const sx = viewPointSX(va, 10.5, 10.5);
    const sy = viewPointSY(va, 10.5, 10.5, 8);
    expect(queueGuestAtWorld(0, W, H, sx, sy - 10, guests)).toBe(2);
    expect(queueGuestAtWorld(0, W, H, sx + 40, sy, guests)).toBeNull();
    expect(queueGuestAtWorld(0, W, H, sx, sy - 60, guests)).toBeNull();
  });

  it('works in a turned view', () => {
    const guests = new Map<number, DrawnQueueGuest>([[7, at(7, 20.5, 30.5)]]);
    const va = viewAffine(1, W, H);
    expect(queueGuestAtWorld(1, W, H, viewPointSX(va, 20.5, 30.5), viewPointSY(va, 20.5, 30.5, 8) - 5, guests)).toBe(7);
  });
});
