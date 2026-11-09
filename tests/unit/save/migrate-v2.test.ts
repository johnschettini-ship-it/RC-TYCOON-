/**
 * Migration 2 → 3 (Phase 6 §5, §9 "migration 2 → 3 with fixture saves"; release checklist §4.11 item 5).
 * `tests/fixtures/save-v2.tcsave.json` was written by the Build 2 code at commit 4ab1b43 (before any Build 3 change):
 * Fading Fairground (Standard) played into month 2 with scenery, a garden, elevated paths, terrain edits, a lamp,
 * staff, and a wet guest. Build 1 fixtures run 1 → 2 → 3 in `migrate-v1.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deserialize, serialize, validateState } from '../../../src/save';
import { decodeTypedArrays, encodeTypedArray } from '../../../src/save/typedArrays';
import { checkStructureV2 } from '../../../src/save/v2/schema';
import { LEDGER_CATEGORIES } from '../../../src/sim/economy/types';
import type { World } from '../../../src/sim/types';
import { runTicks, stateHash } from '../../helpers/world';

const FIXTURES = join(__dirname, '../../fixtures');
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');
const V2 = 'save-v2.tcsave.json';

/** Raw JSON surgery. */
type Raw = any;

function load(json: string): World {
  const r = deserialize(json);
  if (!r.ok) throw new Error(r.error);
  return r.world;
}

/** The fixture's state with typed arrays decoded, exactly as Build 2 wrote it. */
function v2State(): Raw {
  const raw = JSON.parse(read(V2)) as Raw;
  expect(decodeTypedArrays(raw.state)).toBeNull();
  return raw.state;
}

function edit(json: string, fn: (raw: Raw) => void): string {
  const raw = JSON.parse(json) as Raw;
  fn(raw);
  return JSON.stringify(raw);
}

describe('migration 2 → 3 on the Build 2 fixture', () => {
  it('is a schema 2 save of a played Build 2 park', () => {
    const raw = JSON.parse(read(V2)) as Raw;
    expect(raw.schemaVersion).toBe(2);
    expect(raw.state.schemaVersion).toBe(2);
    const s = v2State();
    expect(s.guests.length).toBeGreaterThan(100);
    expect(s.scenery.length).toBeGreaterThan(0);
    expect(s.elevatedPaths.length).toBeGreaterThan(0);
    expect(s.scenario.kind).toBe('scenario');
    expect(s.guests.some((g: Raw) => g.wetUntilTick >= 0)).toBe(true);
  });

  it('the frozen schema 2 check (step 1) accepts it', () => {
    expect(checkStructureV2(v2State())).toBeNull();
  });

  it('loads, upgrades to schema 3, and passes the schema 3 checks', () => {
    const s = load(read(V2)).state;
    expect(s.schemaVersion).toBe(3);
    expect(validateState(s)).toBeNull();
  });

  it('sets the documented new values (steps 2–4)', () => {
    const s = load(read(V2)).state;
    expect(s.shows).toEqual([]);
    for (const g of s.guests) {
      expect(g.showTarget).toBe(-1);
      expect(g.items.photo).toBe(false);
    }
    // Step 3: every ledger month has a `shows` line of 0 (no shows before Build 3).
    expect(s.economy.ledger.length).toBeGreaterThan(1);
    for (const m of s.economy.ledger) {
      expect(Object.keys(m.lines)).toEqual([...LEDGER_CATEGORIES]);
      expect(m.lines.shows).toBe(0);
    }
  });

  it('keeps every Build 2 value: nothing but the new fields changes', () => {
    const before = v2State();
    const after = load(read(V2)).state as unknown as Raw;
    const stripped = { ...after, schemaVersion: 2 };
    delete stripped.shows;
    stripped.guests = after.guests.map((g: Raw) => {
      const { showTarget: _s, ...rest } = g;
      const { photo: _p, ...items } = rest.items;
      return { ...rest, items };
    });
    expect(stripped).toEqual(before);
  });

  it('saves again as schema 3 and round-trips', () => {
    const w = load(read(V2));
    const json = serialize(w, '0.3.0', '2026-11-09T12:00:00.000Z');
    expect((JSON.parse(json) as Raw).schemaVersion).toBe(3);
    const again = load(json);
    expect(stateHash(again)).toBe(stateHash(w));
  });

  // A full game month of play: allow for slow or busy CI machines.
  it('the played Build 2 park keeps playing for a game month, deterministically', { timeout: 60_000 }, () => {
    const a = load(read(V2));
    const b = load(read(V2));
    const monthBefore = Math.floor(a.state.tick / 3600);
    runTicks(a, 3600);
    runTicks(b, 3600);
    expect(Math.floor(a.state.tick / 3600)).toBe(monthBefore + 1);
    expect(validateState(a.state)).toBeNull();
    expect(a.state.guests.length).toBeGreaterThan(0);
    expect(a.state.scenario.kind).toBe('scenario');
    expect(a.state.shows).toEqual([]);
    expect(stateHash(a)).toBe(stateHash(b));
  });
});

describe('migration 2 → 3 rejects bad Build 2 saves (step 1 and 6, Review Focus 3)', () => {
  const json = read(V2);
  const damaged = (reason: string): string => `This save is damaged: ${reason}`;
  const reject = (bad: string): string => {
    const r = deserialize(bad);
    if (r.ok) throw new Error('expected the save to be rejected');
    return r.error;
  };

  it('a missing Build 2 field fails the schema 2 check with the usual load error', () => {
    expect(reject(edit(json, (r) => delete r.state.park.afterDark))).toBe(damaged('missing field park.afterDark'));
    expect(reject(edit(json, (r) => delete r.state.guests[3].wetUntilTick))).toBe(damaged('missing field guests[3].wetUntilTick'));
    expect(reject(edit(json, (r) => delete r.state.scenery[0].waterLevel))).toBe(damaged('missing field scenery[0].waterLevel'));
  });

  it('a Build 3 field inside a schema 2 save is unknown to the schema 2 check', () => {
    expect(reject(edit(json, (r) => (r.state.shows = [])))).toBe(damaged('unknown field shows'));
    expect(reject(edit(json, (r) => (r.state.guests[0].showTarget = -1)))).toBe(damaged('unknown field guests[0].showTarget'));
    expect(reject(edit(json, (r) => (r.state.guests[0].items.photo = false)))).toBe(damaged('unknown field guests[0].items.photo'));
  });

  it('a Build 3 enum value inside a schema 2 save is rejected', () => {
    expect(reject(edit(json, (r) => (r.state.guests[0].state = 'watchingShow')))).toBe(damaged('bad value at guests[0].state'));
    expect(reject(edit(json, (r) => (r.state.guests[0].target = 'show:5')))).toBe(damaged('bad value at guests[0].target'));
  });

  it('wrong layer sizes and kinds are rejected before the upgrade', () => {
    const tiles = 64 * 64;
    expect(reject(edit(json, (r) => (r.state.map.pathItemLevel = encodeTypedArray(new Int32Array(tiles - 1)))))).toBe(
      damaged('wrong size at map.pathItemLevel'),
    );
    expect(reject(edit(json, (r) => (r.state.map.contentRef = encodeTypedArray(new Uint8Array(tiles)))))).toBe(damaged('wrong data type at map.contentRef'));
  });

  it('a dangling reference in a Build 2 save is a damaged save, found after the upgrade', () => {
    const bad = edit(json, (r) => (r.state.rides[0].queue = [999_999]));
    expect(reject(bad)).toMatch(/^This save is damaged: ride \d+ queue lists a missing guest$/);
  });

  it('a schema 4 save is from a newer version', () => {
    expect(reject(edit(json, (r) => (r.schemaVersion = 4)))).toBe('This save comes from a newer version of the game');
  });

  it('an envelope and state version mismatch is damaged', () => {
    expect(reject(edit(json, (r) => (r.state.schemaVersion = 3)))).toBe(damaged('the version numbers do not match'));
  });

  it('truncated or foreign files keep their Build 1 errors', () => {
    expect(reject(json.slice(0, 1000))).toBe('This save could not be read');
    expect(reject(edit(json, (r) => (r.format = 'another-game')))).toBe('This file is not a Thrills & Chills save');
  });
});
