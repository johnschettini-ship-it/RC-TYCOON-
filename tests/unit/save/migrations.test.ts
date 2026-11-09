import { describe, expect, it } from 'vitest';
import { migrations, serialize, type Migrations } from '../../../src/save';
import { deserializeWith } from '../../../src/save/codec';
import { MigrationError } from '../../../src/save/migrations';
import { makeTestWorld } from '../../helpers/world';

const UPGRADE = 'This save could not be upgraded';

/** A current save relabelled as version `v`, so fake migration tables can run on it. */
function asVersion(v: number): string {
  const raw = JSON.parse(serialize(makeTestWorld(1, 'Old Park'), '0.0.9', '2026-01-01T00:00:00.000Z')) as {
    schemaVersion: number;
    state: { schemaVersion: number };
  };
  raw.schemaVersion = v;
  raw.state.schemaVersion = v;
  return JSON.stringify(raw);
}

describe('migrations (master §7)', () => {
  it('the table has exactly the 1 → 2 step (Build 1 → Build 2)', () => {
    expect(Object.keys(migrations)).toEqual(['1']);
  });

  it('runs every migration from the save version up, in order, on decoded state', () => {
    const calls: number[] = [];
    const table: Migrations = {
      1: (raw) => {
        calls.push(1);
        const s = raw as { schemaVersion: number; park: { name: string }; map: { terrain: unknown } };
        expect(s.map.terrain).toBeInstanceOf(Uint8Array);
        s.park.name += ' (2)';
        s.schemaVersion = 2;
        return s;
      },
      2: (raw) => {
        calls.push(2);
        const s = raw as { park: { name: string } };
        return { ...s, schemaVersion: 2, park: { ...s.park, name: `${s.park.name} (3)` } };
      },
    };
    const r = deserializeWith(asVersion(1), { schemaVersion: 3, migrations: table });
    expect(calls).toEqual([1, 2]);
    expect(r.ok && r.world.state.park.name).toBe('Old Park (2) (3)');
  });

  it('a migrated state that fails the structure checks could not be upgraded (Phase 4 §5.1 step 6)', () => {
    const table: Migrations = { 1: (raw) => ({ ...(raw as object), schemaVersion: 2, park: null }) };
    expect(deserializeWith(asVersion(1), { schemaVersion: 2, migrations: table })).toEqual({ ok: false, error: UPGRADE });
  });

  it('a migrated state with a dangling reference is a damaged save', () => {
    const table: Migrations = {
      1: (raw) => {
        const s = raw as { schemaVersion: number; map: { contentRef: Int32Array } };
        s.schemaVersion = 2;
        s.map.contentRef[5] = 999;
        return s;
      },
    };
    expect(deserializeWith(asVersion(1), { schemaVersion: 2, migrations: table })).toEqual({
      ok: false,
      error: 'This save is damaged: map tile 5 points to a missing ride, stall, or scenery',
    });
  });

  it('a migration that throws gives the upgrade error and no throw', () => {
    const table: Migrations = {
      1: () => {
        throw new Error('boom');
      },
    };
    expect(deserializeWith(asVersion(1), { schemaVersion: 2, migrations: table })).toEqual({ ok: false, error: UPGRADE });
  });

  it('a MigrationError carries its own message', () => {
    const table: Migrations = {
      1: () => {
        throw new MigrationError('This save is damaged: bad value at park.cash');
      },
    };
    expect(deserializeWith(asVersion(1), { schemaVersion: 2, migrations: table })).toEqual({
      ok: false,
      error: 'This save is damaged: bad value at park.cash',
    });
  });

  it('a missing migration step is reported', () => {
    expect(deserializeWith(asVersion(1), { schemaVersion: 3, migrations: { 1: (raw) => raw } })).toEqual({
      ok: false,
      error: 'This save comes from an older version that this game cannot load',
    });
  });
});
