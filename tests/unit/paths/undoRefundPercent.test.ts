// tests/unit/paths/undoRefundPercent.test.ts — undoPath tops the demolish refund up to the price paid, never more (review P2).
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/data/tuning/world', async (orig) => ({ ...(await orig<typeof import('../../../src/data/tuning/world')>()), PATH_REFUND_PERCENT: 50 }));

const { executeCommand } = await import('../../../src/sim/commands');
const { makeTestWorld } = await import('../../helpers/world');

describe('undoPath with a demolish refund share', () => {
  it('refunds the price in total: the demolish share plus the rest', () => {
    const world = makeTestWorld();
    executeCommand(world, { type: 'buildPathLine', x0: 30, y0: 30, x1: 30, y1: 30, kind: 'footpath', undoable: true });
    const c0 = world.state.park.cash;
    const r = executeCommand(world, { type: 'undoPath', x: 30, y: 30 });
    expect(r).toMatchObject({ ok: true, cost: -1000 });
    expect(world.state.park.cash).toBe(c0 + 1000);
  });
});
