import { describe, expect, it } from 'vitest';
import { deserialize, serialize, validateState } from '../../../src/save';
import { Content, PathItem } from '../../../src/sim/map';
import { TICKS_PER_HOUR as HOUR_TICKS } from '../../../src/data/tuning/core';
import { makeTestWorld, runTicks, stateHash } from '../../helpers/world';
import { T, groundPath, must, reason } from './helpers';

describe('path items on elevated paths (Phase 4 §4.2, §5; master R22)', () => {
  it('buildPathItem with level puts the item on that elevated footpath', () => {
    const w = makeTestWorld();
    must(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath', z: 12 });
    const p = w.state.elevatedPaths[0]!;
    const i = T(w, 20, 20);
    must(w, { type: 'buildPathItem', x: 20, y: 20, itemType: 'bin', level: p.id });
    expect(w.state.map.pathItem[i]).toBe(PathItem.Bin);
    expect(w.state.map.pathItemLevel[i]).toBe(p.id);
    // One item per tile column: the ground path below cannot take another.
    groundPath(w, 20, 20);
    expect(reason(w, { type: 'buildPathItem', x: 20, y: 20, itemType: 'bench' })).toBe('Tile already has an item');
    must(w, { type: 'removePathItem', x: 20, y: 20 });
    expect(w.state.map.pathItemLevel[i]).toBe(0);
    must(w, { type: 'buildPathItem', x: 20, y: 20, itemType: 'bench' });
    expect(w.state.map.pathItemLevel[i]).toBe(0);
  });

  it('needs an elevated footpath with that id on that tile', () => {
    const w = makeTestWorld();
    must(w, { type: 'buildPath', x: 20, y: 20, kind: 'queue', z: 12 });
    must(w, { type: 'buildPath', x: 21, y: 20, kind: 'footpath', z: 12 });
    const [queue, foot] = w.state.elevatedPaths;
    expect(reason(w, { type: 'buildPathItem', x: 20, y: 20, itemType: 'bin', level: queue!.id })).toBe('Needs a footpath');
    expect(reason(w, { type: 'buildPathItem', x: 20, y: 20, itemType: 'bin', level: foot!.id })).toBe('Needs a footpath');
    expect(reason(w, { type: 'buildPathItem', x: 20, y: 20, itemType: 'bin', level: 9999 })).toBe('Needs a footpath');
    expect(reason(w, { type: 'buildPathItem', x: 20, y: 20, itemType: 'bin' })).toBe('Needs a footpath');
  });

  it('removing or converting the elevated path removes its item; the ground path keeps its own', () => {
    const w = makeTestWorld();
    must(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath', z: 12 });
    const p = w.state.elevatedPaths[0]!;
    const i = T(w, 20, 20);
    must(w, { type: 'buildPathItem', x: 20, y: 20, itemType: 'bench', level: p.id });
    // Demolishing the ground path below (Build 1 command) leaves the elevated item alone.
    groundPath(w, 20, 20);
    must(w, { type: 'demolish', x: 20, y: 20, z: 8 });
    expect(w.state.map.pathItem[i]).toBe(PathItem.Bench);
    must(w, { type: 'buildPath', x: 20, y: 20, kind: 'queue', z: 12 });
    expect(w.state.map.pathItem[i]).toBe(PathItem.None);
    expect(w.state.map.pathItemLevel[i]).toBe(0);
    must(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath', z: 12 });
    must(w, { type: 'buildPathItem', x: 20, y: 20, itemType: 'bin', level: p.id });
    must(w, { type: 'demolish', x: 20, y: 20, z: 12 });
    expect(w.state.map.pathItem[i]).toBe(PathItem.None);
    expect(w.state.map.pathItemLevel[i]).toBe(0);
  });

  it('the hourly orphan sweep keeps items and litter on elevated footpaths', () => {
    const w = makeTestWorld();
    must(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath', z: 12 });
    const p = w.state.elevatedPaths[0]!;
    const i = T(w, 20, 20);
    must(w, { type: 'buildPathItem', x: 20, y: 20, itemType: 'bin', level: p.id });
    w.state.map.litter[i] = 4;
    w.state.map.litter[T(w, 25, 25)] = 4; // grass: swept away
    runTicks(w, HOUR_TICKS + 1);
    expect(w.state.map.pathItem[i]).toBe(PathItem.Bin);
    expect(w.state.map.pathItemLevel[i]).toBe(p.id);
    expect(w.state.map.litter[i]).toBe(4);
    expect(w.state.map.litter[T(w, 25, 25)]).toBe(0);
    expect(w.state.map.content[i]).toBe(Content.Empty);
  });
});

describe('elevated paths in saves (Phase 4 §5)', () => {
  it('save and load round-trip with elevated paths, ramps, and an item level', () => {
    const w = makeTestWorld();
    must(w, { type: 'buildPathLine', x0: 20, y0: 20, x1: 24, y1: 20, kind: 'footpath', z: 9, ramp: 'up' });
    must(w, { type: 'buildPath', x: 30, y: 30, kind: 'queue', z: 15 });
    const p = w.state.elevatedPaths[0]!;
    must(w, { type: 'buildPathItem', x: p.x, y: p.y, itemType: 'bin', level: p.id });
    expect(validateState(w.state)).toBeNull();
    const r = deserialize(serialize(w, '0.2.0', '2026-11-09T12:00:00.000Z'));
    if (!r.ok) throw new Error(r.error);
    expect(stateHash(r.world)).toBe(stateHash(w));
    expect(r.world.state.elevatedPaths).toEqual(w.state.elevatedPaths);
  });
});
