import { describe, expect, it } from 'vitest';
import { KIND_PATH_ITEM, KIND_STAFF, ManagementLayer, type DrawSink } from '../../../../src/render/management/layer';
import { SpriteBank } from '../../../../src/render/sprites/bank';
import { decodeStaffFrame, staffFrame } from '../../../../src/render/sprites/staff';
import { binFillLevel, pathItemFrame } from '../../../../src/render/sprites/litter';
import type { GuestPos } from '../../../../src/render/guestPos';
import { executeCommand } from '../../../../src/sim/commands';
import { sitOnBench } from '../../../../src/sim/litter/benches';
import { tileIndex } from '../../../../src/sim/map';
import { addGuestDirect, makeTestWorld, placeFootpath } from '../../../helpers/world';

interface Entry {
  kind: number;
  ref: number;
  sub: number;
  ax: number;
  ay: number;
  depth: number;
  layer: number;
}

function sink(): DrawSink & { entries: Entry[] } {
  const entries: Entry[] = [];
  return {
    entries,
    push(kind, ref, sub, ax, ay, _skey, depth, _z, layer) {
      entries.push({ kind, ref, sub, ax, ay, depth, layer });
    },
  };
}

const HUGE = { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 };

function layer(): ManagementLayer {
  const l = new ManagementLayer(new SpriteBank(), () => {});
  l.begin(1, 0, 0, 1, 1, HUGE);
  return l;
}

describe('management render layer (collection, no canvas)', () => {
  it('pushes one staff entry per member with its interpolated position and costume frame', () => {
    const world = makeTestWorld();
    executeCommand(world, { type: 'hireStaff', staffType: 'performer' });
    const m = world.state.staff.members[0]!;
    executeCommand(world, { type: 'setCostume', staffId: m.id, costume: 'spark' });
    const map = world.state.map;
    m.tile = tileIndex(map, 10, 10);
    m.nextTile = tileIndex(map, 11, 10);
    m.progress = 7;
    const s = sink();
    layer().collect(world, 0, s);
    const staff = s.entries.filter((e) => e.kind === KIND_STAFF);
    expect(staff).toHaveLength(1);
    const e = staff[0]!;
    // 7 of 14 ticks: halfway to (11, 10).
    expect(e.depth).toBeCloseTo(11 + 10.5);
    expect(e.sub & 3).toBe(1);
    expect(decodeStaffFrame(e.sub >> 2)).toMatchObject({ type: 3, costume: 2 });
    expect(staffFrame(3, 2, 1, 0)).toBe(3 | (2 << 2) | (1 << 4));
  });

  it('pushes path items with their bin fill level and broken flag', () => {
    const world = makeTestWorld();
    const map = world.state.map;
    world.state.park.cash = 1_000_000;
    for (let x = 10; x <= 14; x++) placeFootpath(world, x, 20);
    executeCommand(world, { type: 'buildPathItem', x: 11, y: 20, itemType: 'bin' });
    executeCommand(world, { type: 'buildPathItem', x: 13, y: 20, itemType: 'bench' });
    map.binFill[tileIndex(map, 11, 20)] = 24;
    map.pathItemFlags[tileIndex(map, 13, 20)] = 1;
    const s = sink();
    layer().collect(world, 0, s);
    const items = s.entries.filter((e) => e.kind === KIND_PATH_ITEM);
    expect(items.map((e) => e.ref)).toEqual([tileIndex(map, 11, 20), tileIndex(map, 13, 20)]);
    // Path along x: items stand on the north edge (side 0).
    expect(items[0]!.sub).toBe(pathItemFrame(2, 0, 3, false));
    expect(items[1]!.sub).toBe(pathItemFrame(1, 0, 0, true));
    expect(binFillLevel(0, 24)).toBe(0);
    expect(binFillLevel(10, 24)).toBe(1);
    expect(binFillLevel(17, 24)).toBe(2);
    expect(binFillLevel(24, 24)).toBe(3);
  });

  it('seats bench sitters on the bench, two seats apart, facing away from the backrest', () => {
    const world = makeTestWorld();
    const map = world.state.map;
    world.state.park.cash = 1_000_000;
    for (let x = 10; x <= 14; x++) placeFootpath(world, x, 20);
    executeCommand(world, { type: 'buildPathItem', x: 12, y: 20, itemType: 'bench' });
    const t = tileIndex(map, 12, 20);
    const a = addGuestDirect(world, t);
    const b = addGuestDirect(world, t);
    sitOnBench(world, a, t);
    sitOnBench(world, b, t);
    const l = layer();
    l.collect(world, 0, sink());
    const pa: GuestPos = { fx: 0, fy: 0, z: 0, tile: -1 };
    const pb: GuestPos = { fx: 0, fy: 0, z: 0, tile: -1 };
    expect(l.sitter(0, pa)).toBe(2);
    expect(l.sitter(1, pb)).toBe(2);
    expect(Math.floor(pa.fx)).toBe(12);
    expect(Math.floor(pa.fy)).toBe(20);
    expect(pa.fy).toBeLessThan(20.3);
    expect(Math.abs(pa.fx - pb.fx)).toBeCloseTo(0.2);
    // A guest that is not sitting has no seat.
    world.state.staff.benchSitters = [];
    l.begin(1, 0, 0, 1, 1, HUGE);
    l.collect(world, 0, sink());
    expect(l.sitter(0, pa)).toBe(-1);
  });
});
