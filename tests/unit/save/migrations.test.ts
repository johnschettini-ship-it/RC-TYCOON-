import { describe, expect, it } from 'vitest';
import { migrations, serialize, type Migrations } from '../../../src/save';
import { deserializeWith } from '../../../src/save/codec';
import { makeTestWorld } from '../../helpers/world';

const json = serialize(makeTestWorld(1, 'Old Park'), '0.0.9', '2026-01-01T00:00:00.000Z');

describe('migrations (master §7)', () => {
  it('the table is empty for schema 1', () => {
    expect(Object.keys(migrations)).toEqual([]);
  });

  it('runs every migration from the save version up, in order, on decoded state', () => {
    const calls: number[] = [];
    const table: Migrations = {
      1: (raw) => {
        calls.push(1);
        const s = raw as { park: { name: string }; map: { terrain: unknown } };
        expect(s.map.terrain).toBeInstanceOf(Uint8Array);
        s.park.name += ' (2)';
        return s;
      },
      2: (raw) => {
        calls.push(2);
        const s = raw as { park: { name: string } };
        return { ...s, park: { ...s.park, name: `${s.park.name} (3)` } };
      },
    };
    const r = deserializeWith(json, { schemaVersion: 3, migrations: table });
    expect(calls).toEqual([1, 2]);
    expect(r.ok && r.world.state.park.name).toBe('Old Park (2) (3)');
  });

  it('validates the migrated state', () => {
    const table: Migrations = { 1: (raw) => ({ ...(raw as object), park: null }) };
    expect(deserializeWith(json, { schemaVersion: 2, migrations: table })).toEqual({ ok: false, error: 'This save is damaged: bad value at park' });
  });

  it('a migration that throws gives a damaged error and no throw', () => {
    const table: Migrations = {
      1: () => {
        throw new Error('boom');
      },
    };
    expect(deserializeWith(json, { schemaVersion: 2, migrations: table })).toEqual({
      ok: false,
      error: 'This save is damaged: could not upgrade it from version 1',
    });
  });

  it('a missing migration step is reported', () => {
    expect(deserializeWith(json, { schemaVersion: 3, migrations: { 1: (raw) => raw } })).toEqual({
      ok: false,
      error: 'This save comes from an older version that this game cannot load',
    });
  });
});
