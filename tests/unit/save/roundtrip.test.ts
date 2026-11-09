import { describe, expect, it } from 'vitest';
import { deserialize, SAVE_FORMAT, SCHEMA_VERSION, serialize } from '../../../src/save';
import { addGuestDirect, makeTestWorld, placeFootpath, placeRideDirect, placeStallDirect, runTicks, stateHash } from '../../helpers/world';
import { tileIndex } from '../../../src/sim/map';
import type { World } from '../../../src/sim/types';
import { makeRichWorld } from './fixture';

const SAVED_AT = '2026-11-09T10:15:00.000Z';

function load(json: string): World {
  const r = deserialize(json);
  if (!r.ok) throw new Error(`load failed: ${r.error}`);
  return r.world;
}

describe('serialize', () => {
  it('writes the envelope in the documented order', () => {
    const { world } = makeRichWorld();
    const raw = JSON.parse(serialize(world, '1.2.3', SAVED_AT)) as Record<string, unknown>;
    expect(Object.keys(raw)).toEqual(['format', 'schemaVersion', 'gameVersion', 'savedAt', 'state']);
    expect(raw.format).toBe(SAVE_FORMAT);
    expect(raw.format).toBe('thrills-and-chills-save');
    expect(raw.schemaVersion).toBe(SCHEMA_VERSION);
    expect(raw.schemaVersion).toBe(1);
    expect(raw.gameVersion).toBe('1.2.3');
    expect(raw.savedAt).toBe(SAVED_AT);
  });

  it('encodes typed arrays generically as { $ta, b64 }', () => {
    const { world } = makeRichWorld();
    const raw = JSON.parse(serialize(world, '0.1.0', SAVED_AT)) as {
      state: { map: Record<string, unknown>; staff: { members: Array<{ patrol: unknown }> } };
    };
    expect(raw.state.map.terrain).toEqual({ $ta: 'Uint8Array', b64: expect.any(String) as unknown });
    expect(raw.state.map.contentRef).toEqual({ $ta: 'Int32Array', b64: expect.any(String) as unknown });
    expect(raw.state.staff.members[0]?.patrol).toEqual({ $ta: 'Uint8Array', b64: expect.any(String) as unknown });
    expect(raw.state.staff.members[1]?.patrol).toBeNull();
  });

  it('does not save events', () => {
    const { world } = makeRichWorld();
    expect(world.events.length).toBeGreaterThan(0);
    const json = serialize(world, '0.1.0', SAVED_AT);
    expect(json).not.toContain('guestsChanged');
    expect(json).not.toContain('"events"');
  });

  it('does not change the world', () => {
    const { world } = makeRichWorld();
    const before = stateHash(world);
    serialize(world, '0.1.0', SAVED_AT);
    expect(stateHash(world)).toBe(before);
    expect(world.events).toHaveLength(2);
  });
});

describe('round trip', () => {
  it('loads a world with rides, stalls, guests, staff, track data, and non-zero map layers deep-equal', () => {
    const { world } = makeRichWorld();
    const loaded = load(serialize(world, '0.1.0', SAVED_AT));
    expect(loaded.state).toStrictEqual(world.state);
    expect(loaded.state.map.contentRef).toBeInstanceOf(Int32Array);
    expect(loaded.state.map.litter).toBeInstanceOf(Uint8Array);
    expect(loaded.state.staff.members[0]?.patrol).toBeInstanceOf(Uint8Array);
  });

  it('keeps the state hash', () => {
    const { world } = makeRichWorld();
    const loaded = load(serialize(world, '0.1.0', SAVED_AT));
    expect(stateHash(loaded)).toBe(stateHash(world));
  });

  it('round-trips a new park exactly', () => {
    const world = makeTestWorld(7, 'Brand New');
    const loaded = load(serialize(world, '0.1.0', SAVED_AT));
    expect(loaded.state).toStrictEqual(world.state);
  });

  it('a second save of the loaded world is byte-identical', () => {
    const { world } = makeRichWorld();
    const first = serialize(world, '0.1.0', SAVED_AT);
    expect(serialize(load(first), '0.1.0', SAVED_AT)).toBe(first);
  });

  it('returns a fresh world with no events and no shared objects, so derived caches rebuild', () => {
    const { world } = makeRichWorld();
    const loaded = load(serialize(world, '0.1.0', SAVED_AT));
    expect(loaded).not.toBe(world);
    expect(loaded.events).toEqual([]);
    expect(loaded.state.map).not.toBe(world.state.map);
    expect(loaded.state.map.content.buffer).not.toBe(world.state.map.content.buffer);
    expect(loaded.state.rides[0]).not.toBe(world.state.rides[0]);
  });

  it('save and load mid-game, then play on: same hash as without the save', () => {
    const build = (): World => {
      const w = makeTestWorld(99, 'Replay Park');
      for (let y = 40; y <= 62; y++) placeFootpath(w, 31, y);
      placeRideDirect(w, 'carousel', 32, 44, 3);
      placeStallDirect(w, 'snack_shack', 30, 50, 1);
      addGuestDirect(w, tileIndex(w.state.map, 31, 55));
      addGuestDirect(w, tileIndex(w.state.map, 31, 58));
      return w;
    };
    const a = build();
    runTicks(a, 300);
    const b = load(serialize(a, '0.1.0', SAVED_AT));
    runTicks(a, 300);
    runTicks(b, 300);
    expect(stateHash(b)).toBe(stateHash(a));
  });
});
