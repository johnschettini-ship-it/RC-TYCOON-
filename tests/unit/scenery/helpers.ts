/** Shared scenery test helpers (W3-D). Not a test file. */
import { executeCommand, type CommandResult } from '../../../src/sim/commands';
import type { Dir } from '../../../src/sim/map';
import type { SceneryEdge } from '../../../src/sim/scenery/types';
import type { World } from '../../../src/sim/types';
import { makeTestWorld } from '../../helpers/world';

/** A test world with every scenery theme researched. */
export function sceneryWorld(seed = 12345): World {
  const w = makeTestWorld(seed);
  w.state.management.research.unlocked.push('frost_peaks', 'volcano_ridge', 'spooky_hollow', 'jungle_lagoon', 'starport');
  return w;
}

export function place(world: World, defId: string, x: number, y: number, rotation: Dir = 0, edge: SceneryEdge = -1, setup = false): CommandResult {
  return executeCommand(world, { type: 'placeScenery', defId, x, y, rotation, edge }, { setup });
}

export function placeOk(world: World, defId: string, x: number, y: number, rotation: Dir = 0, edge: SceneryEdge = -1): number {
  const r = place(world, defId, x, y, rotation, edge);
  if (!r.ok) throw new Error(`${defId} at ${x},${y}: ${r.reason}`);
  if (r.id === undefined) throw new Error('no id');
  return r.id;
}

export function reasonOf(r: CommandResult): string | null {
  return r.ok ? null : r.reason;
}
