/**
 * Migration 1 → 2 (Phase 4 §5.1, §9.1; Phase 5 §9 "Build 1 fixture save migrates to freePlay"), and on to schema 3
 * (Phase 6 §5: "A Build 1 save runs 1 → 2 → 3"; the 2 → 3 step itself: `migrate-v2.test.ts`).
 * The fixtures in tests/fixtures/ were written by the Build 1 code at commit 33ac3b5, before any Build 2 change.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deserialize, serialize, validateState } from '../../../src/save';
import { decodeTypedArrays, encodeTypedArray } from '../../../src/save/typedArrays';
import type { World } from '../../../src/sim/types';
import { runTicks, stateHash } from '../../helpers/world';

const FIXTURES = join(__dirname, '../../fixtures');
const NAMES = ['save-v1.tcsave.json', 'save-v1-new.tcsave.json', 'save-v1-rich.tcsave.json'] as const;
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

/** Raw JSON surgery. */
type Raw = any;

function load(json: string): World {
  const r = deserialize(json);
  if (!r.ok) throw new Error(r.error);
  return r.world;
}

/** The fixture's state with typed arrays decoded, exactly as Build 1 wrote it. */
function v1State(name: string): Raw {
  const raw = JSON.parse(read(name)) as Raw;
  expect(decodeTypedArrays(raw.state)).toBeNull();
  return raw.state;
}

function edit(json: string, fn: (raw: Raw) => void): string {
  const raw = JSON.parse(json) as Raw;
  fn(raw);
  return JSON.stringify(raw);
}

const NEW_TOP = ['elevatedPaths', 'scenery', 'scenario', 'monthMetrics', 'shows'];

describe('migration 1 → 2 on the Build 1 fixtures', () => {
  for (const name of NAMES) {
    describe(name, () => {
      it('is a schema 1 save', () => {
        const raw = JSON.parse(read(name)) as Raw;
        expect(raw.schemaVersion).toBe(1);
        expect(raw.state.schemaVersion).toBe(1);
      });

      it('loads, upgrades through schema 2 to schema 3, and passes the schema 3 checks', () => {
        const s = load(read(name)).state;
        expect(s.schemaVersion).toBe(3);
        expect(validateState(s)).toBeNull();
      });

      it('sets the documented new values (steps 3, 4, 4a)', () => {
        const s = load(read(name)).state;
        expect(s.park.afterDark).toBe(false);
        expect(s.park.landPrice).toBe(15_000);
        expect(s.park.rightsPrice).toBe(6_000);
        expect(s.elevatedPaths).toEqual([]);
        expect(s.scenery).toEqual([]);
        expect(s.map.pathItemLevel).toBeInstanceOf(Int32Array);
        expect(s.map.pathItemLevel.length).toBe(s.map.width * s.map.height);
        expect(s.map.pathItemLevel.every((v) => v === 0)).toBe(true);
        for (const g of s.guests) {
          expect(g.z).toBe(g.tile >= 0 ? s.map.heights[g.tile] : 8);
          expect(g.wetUntilTick).toBe(-1);
        }
        for (const m of s.staff.members) expect(m.z).toBe(m.tile >= 0 ? s.map.heights[m.tile] : 8);
        expect(s.scenario).toEqual({ kind: 'freePlay', awards: { active: [], history: [] } });
        // 2 → 3 (Phase 6 §5).
        expect(s.shows).toEqual([]);
        for (const g of s.guests) {
          expect(g.showTarget).toBe(-1);
          expect(g.items.photo).toBe(false);
        }
        expect(s.monthMetrics).toEqual({
          monthIndex: Math.floor(s.tick / 3600),
          daySamples: [],
          nightSamples: [],
          thoughtGuests: {},
          guestsSeen: [],
          queueWaitTicks: 0,
          queueWaits: 0,
          brokenRides: [],
        });
      });

      it('keeps every Build 1 value: heights, owned, and water unchanged (step 2), nothing else touched', () => {
        const before = v1State(name);
        const after = load(read(name)).state as unknown as Raw;
        // Drop exactly the fields the migration adds; the rest must be equal, typed arrays included.
        const stripped = { ...after, schemaVersion: 1 };
        for (const k of NEW_TOP) delete stripped[k];
        stripped.park = { ...after.park };
        for (const k of ['afterDark', 'landPrice', 'rightsPrice']) delete stripped.park[k];
        stripped.map = { ...after.map };
        delete stripped.map.pathItemLevel;
        stripped.guests = after.guests.map((g: Raw) => {
          const { z: _z, wetUntilTick: _w, showTarget: _s, ...rest } = g;
          const { photo: _p, ...items } = rest.items;
          return { ...rest, items };
        });
        stripped.staff = { ...after.staff, members: after.staff.members.map(({ z: _z, ...rest }: Raw) => rest) };
        expect(stripped).toEqual(before);
        expect(after.map.heights).toEqual(before.map.heights);
        expect(after.map.owned).toEqual(before.map.owned);
        expect(after.map.water).toEqual(before.map.water);
      });

      it('saves again as schema 3 and round-trips', () => {
        const w = load(read(name));
        const again = load(serialize(w, '0.2.0', '2026-11-09T12:00:00.000Z'));
        expect(stateHash(again)).toBe(stateHash(w));
      });
    });
  }

  // A full game month of play: allow for slow or busy CI machines.
  it('the played Build 1 park keeps playing for a game month (Phase 4 §10)', { timeout: 60_000 }, () => {
    const a = load(read('save-v1.tcsave.json'));
    const b = load(read('save-v1.tcsave.json'));
    expect(a.state.guests.length).toBeGreaterThan(100);
    const monthBefore = Math.floor(a.state.tick / 3600);
    runTicks(a, 3600);
    runTicks(b, 3600);
    expect(Math.floor(a.state.tick / 3600)).toBe(monthBefore + 1);
    expect(validateState(a.state)).toBeNull();
    expect(a.state.guests.length).toBeGreaterThan(0);
    expect(a.state.park.afterDark).toBe(false);
    // Deterministic after the upgrade.
    expect(stateHash(a)).toBe(stateHash(b));
  });

  it('the brand-new Build 1 park keeps playing', () => {
    const w = load(read('save-v1-new.tcsave.json'));
    runTicks(w, 1200);
    expect(validateState(w.state)).toBeNull();
  });
});

describe('migration 1 → 2 rejects bad Build 1 saves (Phase 4 §5.1 steps 1 and 6, Review Focus 3)', () => {
  const json = read('save-v1.tcsave.json');
  const damaged = (reason: string): string => `This save is damaged: ${reason}`;
  const reject = (bad: string): string => {
    const r = deserialize(bad);
    if (r.ok) throw new Error('expected the save to be rejected');
    return r.error;
  };

  it('a missing Build 1 field fails the schema 1 check with the usual load error', () => {
    expect(reject(edit(json, (r) => delete r.state.park.name))).toBe(damaged('missing field park.name'));
    expect(reject(edit(json, (r) => delete r.state.guests[3].needs.thirst))).toBe(damaged('missing field guests[3].needs.thirst'));
  });

  it('a Build 2 field inside a schema 1 save is unknown to the schema 1 check', () => {
    expect(reject(edit(json, (r) => (r.state.park.afterDark = true)))).toBe(damaged('unknown field park.afterDark'));
    expect(reject(edit(json, (r) => (r.state.scenery = [])))).toBe(damaged('unknown field scenery'));
    expect(reject(edit(json, (r) => (r.state.guests[0].z = 8)))).toBe(damaged('unknown field guests[0].z'));
  });

  it('a Build 2 enum value inside a schema 1 save is rejected', () => {
    expect(reject(edit(json, (r) => (r.state.staff.members[0].state = 'watering')))).toBe(damaged('bad value at staff.members[0].state'));
  });

  it('wrong layer sizes and kinds are rejected before the upgrade', () => {
    const tiles = 64 * 64;
    expect(reject(edit(json, (r) => (r.state.map.terrain = encodeTypedArray(new Uint8Array(tiles - 1)))))).toBe(damaged('wrong size at map.terrain'));
    expect(reject(edit(json, (r) => (r.state.map.contentRef = encodeTypedArray(new Uint8Array(tiles)))))).toBe(damaged('wrong data type at map.contentRef'));
  });

  it('a dangling reference in a Build 1 save is a damaged save, found after the upgrade', () => {
    const bad = edit(json, (r) => (r.state.rides[0].queue = [999_999]));
    expect(reject(bad)).toMatch(/^This save is damaged: ride \d+ queue lists a missing guest$/);
  });

  it('a schema 4 save is from a newer version', () => {
    expect(reject(edit(json, (r) => (r.schemaVersion = 4)))).toBe('This save comes from a newer version of the game');
  });

  it('an envelope and state version mismatch is damaged', () => {
    expect(reject(edit(json, (r) => (r.state.schemaVersion = 2)))).toBe(damaged('the version numbers do not match'));
  });
});
