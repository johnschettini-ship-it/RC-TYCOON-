/**
 * The Frost and Spark mascots removed from the park (Task 24, owner decision 2026-11-12): no statue, costume or guest
 * thought of them in the catalogue, and an older save that holds them loads with the documented replacements
 * (`src/save/migrations/retired.ts`): a Frost or Spark statue becomes a Robot Statue, a performer in the Frost or Spark
 * costume wears Boo, and a stored Frost or Spark thought (with its repeat cooldown) is dropped. Everything else is equal.
 */
import { describe, expect, it } from 'vitest';
import { COSTUMES } from '../../../src/data/catalog/people';
import { SCENERY, getSceneryDef } from '../../../src/data/catalog';
import { en } from '../../../src/data/strings/en';
import { deserialize, serialize, validateState } from '../../../src/save';
import { RETIRED_COSTUME, RETIRED_STATUE, RETIRED_THOUGHTS } from '../../../src/save/migrations/retired';
import { THOUGHT } from '../../../src/sim/guests/thoughts';
import { allocId } from '../../../src/sim/ids';
import { Content, tileIndex } from '../../../src/sim/map';
import type { World } from '../../../src/sim/types';
import { makeRichWorld } from './fixture';

/** Raw JSON surgery. */
type Raw = any;

describe('the catalogue has no Frost or Spark item (Task 24)', () => {
  it('no Frost or Spark statue in the scenery catalogue', () => {
    const ids = SCENERY.map((d) => d.id);
    expect(ids).not.toContain('statue_frost');
    expect(ids).not.toContain('statue_spark');
    expect(SCENERY.filter((d) => /\b(Frost|Spark)\b/.test(d.name)).map((d) => d.id)).toEqual([]);
  });

  it('no Frost or Spark performer costume; Boo stays', () => {
    expect(COSTUMES.map((c) => c.id)).toEqual(['boo']);
    expect(en['costume.frost']).toBeUndefined();
    expect(en['costume.spark']).toBeUndefined();
  });

  it('no guest thought about Frost or Spark', () => {
    const ids: string[] = Object.values(THOUGHT);
    expect(ids).not.toContain('frostCute');
    expect(ids).not.toContain('sparkAwesome');
    expect(en.frostCute).toBeUndefined();
    expect(en.sparkAwesome).toBeUndefined();
  });

  it('the replacements exist: a 1 × 1 statue of the same height in the catalogue, and the Boo costume', () => {
    const def = getSceneryDef(RETIRED_STATUE.replacement);
    expect(def?.id).toBe('statue_robot');
    expect([def?.w, def?.d, def?.heightM]).toEqual([1, 1, 4]);
    expect(Object.keys(RETIRED_STATUE.ids).sort()).toEqual(['statue_frost', 'statue_spark']);
    expect(COSTUMES.some((c) => c.id === RETIRED_COSTUME.replacement)).toBe(true);
    expect([...RETIRED_THOUGHTS].sort()).toEqual(['frostCute', 'sparkAwesome']);
  });
});

/** The rich save fixture with a Frost and a Spark statue, a Spark and a Frost performer, and mascot thoughts. */
function oldSave(): { json: string; world: World; frost: number; spark: number } {
  const { world } = makeRichWorld();
  const s = world.state;
  const map = s.map;
  // A Robot Statue (valid today); the save text below gives it the retired id.
  const put = (x: number, y: number): number => {
    const id = allocId(s);
    s.scenery.push({ id, defId: 'statue_robot', x, y, z: map.heights[tileIndex(map, x, y)] as number, rotation: 2, edge: -1, waterLevel: 255 });
    map.content[tileIndex(map, x, y)] = Content.Scenery;
    map.contentRef[tileIndex(map, x, y)] = id;
    return id;
  };
  const frost = put(50, 50);
  const spark = put(52, 50);
  const g = s.guests[0]!;
  g.thoughts.push({ id: 'performerFun', tick: s.tick - 3 }, { id: 'sparkAwesome', tick: s.tick - 2 }, { id: 'frostCute', tick: s.tick - 1 });
  g.thoughtCooldowns.performerFun = s.tick - 3;
  g.thoughtCooldowns.sparkAwesome = s.tick - 2;
  g.thoughtCooldowns.frostCute = s.tick - 1;
  expect(validateState(s)).toBeNull();
  const raw: Raw = JSON.parse(serialize(world, '3.0.0', '2026-11-12T10:00:00.000Z'));
  // What a Build 3 save holds (the names are no longer in this build's catalogue).
  for (const sc of raw.state.scenery) {
    if (sc.id === frost) sc.defId = 'statue_frost';
    if (sc.id === spark) sc.defId = 'statue_spark';
  }
  const performers = raw.state.staff.members.filter((m: Raw) => m.type === 'performer');
  expect(performers.length).toBeGreaterThan(0);
  performers[0].costume = 'spark';
  return { json: JSON.stringify(raw), world, frost, spark };
}

describe('an older save with the mascots loads with the replacements (Task 24 save migration)', () => {
  it('a Frost or Spark statue becomes a Robot Statue at the same place; a Spark performer wears Boo; mascot thoughts are dropped', () => {
    const { json, frost, spark } = oldSave();
    const r = deserialize(json);
    if (!r.ok) throw new Error(r.error);
    const s = r.world.state;
    for (const id of [frost, spark]) {
      const sc = s.scenery.find((x) => x.id === id)!;
      expect(sc.defId).toBe('statue_robot');
    }
    const performer = s.staff.members.find((m) => m.type === 'performer')!;
    expect(performer.costume).toBe('boo');
    const g = s.guests[0]!;
    expect(g.thoughts.map((t) => t.id)).toEqual(['thinking.hungry', 'thinking.ridePrice', 'performerFun']);
    expect(Object.keys(g.thoughtCooldowns)).not.toContain('sparkAwesome');
    expect(Object.keys(g.thoughtCooldowns)).not.toContain('frostCute');
    expect(g.thoughtCooldowns.performerFun).toBeDefined();
    expect(validateState(s)).toBeNull();
  });

  it('everything else is equal: only the documented fields change', () => {
    const { json } = oldSave();
    const before: Raw = JSON.parse(json).state;
    const r = deserialize(json);
    if (!r.ok) throw new Error(r.error);
    const after: Raw = JSON.parse(serialize(r.world, '3.0.0', '2026-11-12T10:00:00.000Z')).state;
    // Apply the documented replacements to the old state by hand; the rest must be equal, byte for byte.
    for (const sc of before.scenery) if (sc.defId === 'statue_frost' || sc.defId === 'statue_spark') sc.defId = 'statue_robot';
    for (const m of before.staff.members) if (m.costume === 'frost' || m.costume === 'spark') m.costume = 'boo';
    for (const g of before.guests) {
      g.thoughts = g.thoughts.filter((t: Raw) => t.id !== 'frostCute' && t.id !== 'sparkAwesome');
      delete g.thoughtCooldowns.frostCute;
      delete g.thoughtCooldowns.sparkAwesome;
    }
    expect(after).toEqual(before);
  });

  it('a save without mascot items loads unchanged, and the save version stays 3', () => {
    const { world } = makeRichWorld();
    const json = serialize(world, '3.0.0', '2026-11-12T10:00:00.000Z');
    expect(JSON.parse(json).schemaVersion).toBe(3);
    const r = deserialize(json);
    if (!r.ok) throw new Error(r.error);
    expect(serialize(r.world, '3.0.0', '2026-11-12T10:00:00.000Z')).toBe(json);
  });

  it('a Frost costume becomes Boo too; other values of the costume stay checked (an unknown costume is a damaged save)', () => {
    const raw: Raw = JSON.parse(oldSave().json);
    raw.state.staff.members.find((m: Raw) => m.type === 'performer').costume = 'frost';
    const r = deserialize(JSON.stringify(raw));
    if (!r.ok) throw new Error(r.error);
    expect(r.world.state.staff.members.find((m) => m.type === 'performer')!.costume).toBe('boo');
    raw.state.staff.members.find((m: Raw) => m.type === 'performer').costume = 'yeti';
    const bad = deserialize(JSON.stringify(raw));
    expect(bad.ok).toBe(false);
  });

  it('an unknown statue id is still a damaged save (only the two retired ids are replaced)', () => {
    const raw: Raw = JSON.parse(oldSave().json);
    raw.state.scenery[0].defId = 'statue_unicorn';
    const r = deserialize(JSON.stringify(raw));
    expect(r.ok).toBe(false);
  });
});
