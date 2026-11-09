/**
 * Edge items block movement across their edge (Phase 4 §4.5) — `edgeBlocked` belongs to W3-D, so this test
 * replaces it with a fake that blocks one shared edge (from either side, as the contract says).
 */
import { describe, expect, it, vi } from 'vitest';

const blocked = new Set<string>();
vi.mock('../../../src/sim/scenery/api', async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    edgeBlocked: (_w: unknown, tile: number, dir: number) => blocked.has(`${tile}:${dir}`),
  };
});

import { distanceTo, markNetworkDirty, staffDistanceTo } from '../../../src/sim/pathing';
import { linkedNode } from '../../../src/sim/paths/nodes';
import { makeTestWorld, placeStallDirect } from '../../helpers/world';
import { T, elevated, groundPath } from './helpers';

function block(a: number, dirFromA: number, b: number): void {
  blocked.add(`${a}:${dirFromA}`);
  blocked.add(`${b}:${(dirFromA + 2) % 4}`);
}

describe('edge scenery blocks a path link (Phase 4 §4.2, §4.5)', () => {
  it('no link under an edge item; the route goes around it', () => {
    blocked.clear();
    const w = makeTestWorld();
    // A 2 × 3 block of path: (20..21, 20..22).
    for (let y = 20; y <= 22; y++) for (let x = 20; x <= 21; x++) groundPath(w, x, y);
    const a = T(w, 20, 21);
    const b = T(w, 21, 21);
    expect(staffDistanceTo(w, a, b)).toBe(1);
    block(a, 1, b);
    markNetworkDirty(w);
    expect(linkedNode(w, a, 1)).toBe(-1);
    expect(linkedNode(w, b, 3)).toBe(-1);
    expect(staffDistanceTo(w, a, b)).toBe(3);
    // Guests too: a stall served from b.
    const stall = placeStallDirect(w, 'snack_shack', 22, 21, 3); // service side W → (21, 21)
    markNetworkDirty(w);
    expect(distanceTo(w, a, `stall:${stall.id}`)).toBe(3);
    blocked.clear();
  });

  it('an edge item stands on the ground: it does not block a path high above it', () => {
    blocked.clear();
    const w = makeTestWorld();
    const a = T(w, 20, 20);
    const b = T(w, 21, 20);
    elevated(w, 20, 20, 15);
    elevated(w, 21, 20, 15);
    block(a, 1, b);
    markNetworkDirty(w);
    expect(staffDistanceTo(w, a, b)).toBe(1);
    blocked.clear();
  });
});
