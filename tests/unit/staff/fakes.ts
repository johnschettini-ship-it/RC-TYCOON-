/**
 * Test fakes for other workstreams' stubs (W1-H tests only).
 * Use from a test file with:
 *   vi.mock('../../../src/sim/pathing', async () => (await import('./fakes')).fakePathing());
 */
import { vi } from 'vitest';
import { Content } from '../../../src/sim/map';
import type { World } from '../../../src/sim/types';

/** Staff and guests may walk on footpath and queue tiles (Phase 3 §4.1). */
export function fakeIsWalkable(world: World, tile: number): boolean {
  const c = world.state.map.content[tile];
  return c === Content.Footpath || c === Content.Queue;
}

export function fakePathing() {
  return {
    isWalkable: (world: World, tile: number) => fakeIsWalkable(world, tile),
    markNetworkDirty: () => {},
    nextStep: () => null,
    distanceTo: () => null,
    queueOwner: () => null,
  };
}

export interface NotifyCall {
  category: string;
  textId: string;
  opts: { params?: Record<string, string | number>; tile?: number; entityId?: number };
}

export const notifyLog: NotifyCall[] = [];

export function fakeNotifications() {
  return {
    notify: (_world: World, category: string, textId: string, opts: NotifyCall['opts'] = {}) => {
      notifyLog.push({ category, textId, opts });
    },
    pruneMessages: () => {},
  };
}

export const stopRideSpy = vi.fn();
export const forgetDestinationSpy = vi.fn();

export function fakeFlatApi() {
  return {
    stopRide: (world: World, ride: { riders: number[]; cycle: { phase: string; ticks: number } }) => {
      stopRideSpy(world, ride);
      // W1-E contract: unload every rider and end the cycle.
      ride.riders = [];
      ride.cycle = { phase: 'waiting', ticks: 0 };
    },
  };
}

/** Footpath line helper: inclusive, axis-aligned. */
export function pathLine(world: World, x0: number, y0: number, x1: number, y1: number): number[] {
  const map = world.state.map;
  const out: number[] = [];
  const dx = Math.sign(x1 - x0);
  const dy = Math.sign(y1 - y0);
  let x = x0;
  let y = y0;
  for (;;) {
    const i = y * map.width + x;
    map.content[i] = Content.Footpath;
    out.push(i);
    if (x === x1 && y === y1) break;
    x += dx;
    y += dy;
  }
  return out;
}
