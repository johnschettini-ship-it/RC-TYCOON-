// tests/unit/paths/undoRefund.test.ts — step builder Undo refunds the full price of tiles it built this session; any
// other path keeps today's demolish rule (0%).
import { describe, expect, it } from 'vitest';
import { executeCommand } from '../../../src/sim/commands';
import { currentLedger } from '../../../src/sim/economy/ledger';
import { tileIndex, Content } from '../../../src/sim/map';
import { makeTestWorld } from '../../helpers/world';

function setup() {
  const world = makeTestWorld();
  const map = world.state.map;
  const ground = map.heights[tileIndex(map, 30, 30)] as number;
  return { world, map, ground, cash: () => world.state.park.cash, refunds: () => currentLedger(world).lines.demolitionRefunds };
}

describe('undoPath (touch controls follow-up: Undo refunds)', () => {
  it('a ground tile the builder built comes back for its full price, in the demolition refunds line', () => {
    const { world, map, cash, refunds } = setup();
    expect(executeCommand(world, { type: 'buildPathLine', x0: 30, y0: 30, x1: 31, y1: 30, kind: 'queue', undoable: true }).ok).toBe(true);
    const c0 = cash();
    const r0 = refunds();
    const r = executeCommand(world, { type: 'undoPath', x: 31, y: 30 });
    expect(r).toMatchObject({ ok: true, cost: -1200 });
    expect(cash()).toBe(c0 + 1200);
    expect(refunds()).toBe(r0 + 1200);
    expect(map.content[tileIndex(map, 31, 30)]).toBe(Content.Empty);
    expect(map.content[tileIndex(map, 30, 30)]).toBe(Content.Queue);
    // Once only: the tile is gone, and a second undo finds nothing.
    expect(executeCommand(world, { type: 'undoPath', x: 31, y: 30 }).ok).toBe(false);
    expect(cash()).toBe(c0 + 1200);
  });

  it('an elevated builder tile refunds its price with the supports', () => {
    const { world, ground, cash } = setup();
    const z = ground + 3;
    expect(executeCommand(world, { type: 'buildPath', x: 30, y: 30, kind: 'footpath', z, rampDir: 1, undoable: true }).ok).toBe(true);
    const c0 = cash();
    expect(executeCommand(world, { type: 'undoPath', x: 30, y: 30, z }).ok).toBe(true);
    // $10 + 3 m of support at $2.
    expect(cash()).toBe(c0 + 1600);
    expect(world.state.elevatedPaths).toHaveLength(0);
  });

  it('a path not built by the builder keeps today\'s rule: removed, nothing refunded', () => {
    const { world, map, cash } = setup();
    expect(executeCommand(world, { type: 'buildPathLine', x0: 30, y0: 30, x1: 30, y1: 30, kind: 'footpath' }).ok).toBe(true);
    const c0 = cash();
    expect(executeCommand(world, { type: 'undoPath', x: 30, y: 30 })).toMatchObject({ ok: true, cost: 0 });
    expect(cash()).toBe(c0);
    expect(map.content[tileIndex(map, 30, 30)]).toBe(Content.Empty);
  });

  it('a builder tile demolished and rebuilt another way is no longer refundable', () => {
    const { world, cash } = setup();
    executeCommand(world, { type: 'buildPathLine', x0: 30, y0: 30, x1: 30, y1: 30, kind: 'footpath', undoable: true });
    executeCommand(world, { type: 'demolish', x: 30, y: 30 });
    executeCommand(world, { type: 'buildPathLine', x0: 30, y0: 30, x1: 30, y1: 30, kind: 'footpath' });
    const c0 = cash();
    executeCommand(world, { type: 'undoPath', x: 30, y: 30 });
    expect(cash()).toBe(c0);
  });

  it('a conversion (footpath to queue) is not a refundable new tile', () => {
    const { world, cash } = setup();
    executeCommand(world, { type: 'buildPathLine', x0: 30, y0: 30, x1: 30, y1: 30, kind: 'footpath' });
    executeCommand(world, { type: 'buildPathLine', x0: 30, y0: 30, x1: 30, y1: 30, kind: 'queue', undoable: true });
    const c0 = cash();
    executeCommand(world, { type: 'undoPath', x: 30, y: 30 });
    expect(cash()).toBe(c0);
  });

  it('another world (a load) starts with nothing refundable', () => {
    const { world } = setup();
    executeCommand(world, { type: 'buildPathLine', x0: 30, y0: 30, x1: 30, y1: 30, kind: 'footpath', undoable: true });
    const other = makeTestWorld();
    executeCommand(other, { type: 'buildPathLine', x0: 30, y0: 30, x1: 30, y1: 30, kind: 'footpath' });
    const c0 = other.state.park.cash;
    executeCommand(other, { type: 'undoPath', x: 30, y: 30 });
    expect(other.state.park.cash).toBe(c0);
  });
});

describe('undoPath: only cash actually charged comes back (review P2)', () => {
  it('a builder tile built as setup (free) refunds nothing', () => {
    const { world, cash } = setup();
    executeCommand(world, { type: 'buildPathLine', x0: 30, y0: 30, x1: 30, y1: 30, kind: 'footpath', undoable: true }, { setup: true });
    const c0 = cash();
    executeCommand(world, { type: 'undoPath', x: 30, y: 30 });
    expect(cash()).toBe(c0);
  });

  it('a builder tile built with unlimited money (free) refunds nothing', () => {
    const { world, refunds } = setup();
    (world.state as unknown as { scenario: unknown }).scenario = { ...world.state.scenario, kind: 'sandbox', options: { unlimitedMoney: true } };
    executeCommand(world, { type: 'buildPathLine', x0: 30, y0: 30, x1: 30, y1: 30, kind: 'footpath', undoable: true });
    const r0 = refunds();
    executeCommand(world, { type: 'undoPath', x: 30, y: 30 });
    expect(refunds()).toBe(r0);
  });

  it('an arch over the builder tile: undoPath fails with the reason and removes nothing', () => {
    const { world, map, cash } = setup();
    executeCommand(world, { type: 'buildPathLine', x0: 30, y0: 30, x1: 30, y1: 30, kind: 'footpath', undoable: true });
    expect(executeCommand(world, { type: 'placeScenery', defId: 'ticket_arch', x: 30, y: 30, rotation: 0, edge: -1 }).ok).toBe(true);
    const c0 = cash();
    const n = world.state.scenery.length;
    expect(executeCommand(world, { type: 'undoPath', x: 30, y: 30 })).toEqual({ ok: false, reason: 'Remove the arch over this path first' });
    expect(world.state.scenery.length).toBe(n);
    expect(map.content[tileIndex(map, 30, 30)]).toBe(Content.Footpath);
    expect(cash()).toBe(c0);
  });
});
