/**
 * Paths with the real scenery module (W3-D): edge items block path links (Phase 4 §4.2, §4.5), centre items are in
 * the occupancy list, and demolishing a path under an arch removes the arch first.
 */
import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from '../../../src/sim/commands';
import { Content } from '../../../src/sim/map';
import { clearanceBlock, occupantsAt } from '../../../src/sim/occupancy';
import { distanceTo, staffDistanceTo } from '../../../src/sim/pathing';
import { linkedNode } from '../../../src/sim/paths/nodes';
import { stepTick } from '../../../src/sim/tick';
import type { World } from '../../../src/sim/types';
import { addGuestDirect, makeTestWorld, placeStallDirect } from '../../helpers/world';
import { T, groundPath, reason } from './helpers';

const SETUP = { setup: true };

function setup(w: World, cmd: Command): number {
  const r = executeCommand(w, cmd, SETUP);
  if (!r.ok) throw new Error(`${cmd.type}: ${r.reason}`);
  return r.id ?? -1;
}

describe('scenery and paths (W3-D integration)', () => {
  it('an edge fence on a path tile cuts the link across that edge for guests and staff', () => {
    const w = makeTestWorld();
    for (let y = 20; y <= 22; y++) for (let x = 20; x <= 21; x++) groundPath(w, x, y);
    const a = T(w, 20, 21);
    const b = T(w, 21, 21);
    expect(staffDistanceTo(w, a, b)).toBe(1);
    setup(w, { type: 'placeScenery', defId: 'fence_wood', x: 20, y: 21, rotation: 0, edge: 1 });
    expect(linkedNode(w, a, 1)).toBe(-1);
    expect(linkedNode(w, b, 3)).toBe(-1);
    expect(staffDistanceTo(w, a, b)).toBe(3);
    const stall = placeStallDirect(w, 'snack_shack', 22, 21, 3); // service side W → (21, 21)
    expect(distanceTo(w, a, `stall:${stall.id}`)).toBe(3);
  });

  it('a guest never walks through the fence', () => {
    const w = makeTestWorld();
    for (let x = 20; x <= 24; x++) groundPath(w, x, 30);
    setup(w, { type: 'placeScenery', defId: 'fence_wood', x: 22, y: 30, rotation: 0, edge: 1 });
    const g = addGuestDirect(w, T(w, 20, 30), { nextDecisionTick: 1e9 });
    for (let k = 0; k < 2_000; k++) {
      stepTick(w);
      expect(g.tile === T(w, 23, 30) || g.tile === T(w, 24, 30)).toBe(false);
    }
  });

  it('centre scenery is in the occupancy list: an elevated path must clear a tree', () => {
    const w = makeTestWorld();
    const id = setup(w, { type: 'placeScenery', defId: 'oak_round', x: 30, y: 30, rotation: 0, edge: -1 });
    const i = T(w, 30, 30);
    expect(occupantsAt(w, i)).toEqual([{ kind: 'scenery', id, zMin: 8, zMax: 15 }]);
    expect(clearanceBlock(w, i, 14, 17)?.id).toBe(id);
    expect(reason(w, { type: 'buildPath', x: 30, y: 30, kind: 'footpath', z: 14 })).toBe('Not enough clearance under an object');
    expect(reason(w, { type: 'buildPath', x: 30, y: 30, kind: 'footpath', z: 15 })).toBeNull();
  });

  it('demolishing a path under an arch removes the arch first; the next demolish removes the path', () => {
    const w = makeTestWorld();
    groundPath(w, 15, 15);
    setup(w, { type: 'placeScenery', defId: 'ticket_arch', x: 15, y: 15, rotation: 0, edge: -1 });
    const i = T(w, 15, 15);
    expect(w.state.scenery).toHaveLength(1);
    expect(executeCommand(w, { type: 'demolish', x: 15, y: 15 }).ok).toBe(true);
    expect(w.state.scenery).toHaveLength(0);
    expect(w.state.map.content[i]).toBe(Content.Footpath);
    expect(executeCommand(w, { type: 'demolish', x: 15, y: 15 }).ok).toBe(true);
    expect(w.state.map.content[i]).toBe(Content.Empty);
  });
});
