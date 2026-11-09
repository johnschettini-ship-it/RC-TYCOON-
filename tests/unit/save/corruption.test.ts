/** Review Focus 3: corrupted or foreign save files are rejected with the exact message, never thrown, never half-loaded. */
import { describe, expect, it } from 'vitest';
import { deserialize, serialize } from '../../../src/save';
import { encodeTypedArray } from '../../../src/save/typedArrays';
import { stateHash } from '../../helpers/world';
import { makeRichWorld, type RichWorld } from './fixture';

const NOT_A_SAVE = 'This file is not a Thrills & Chills save';
const UNREADABLE = 'This save could not be read';
const NEWER = 'This save comes from a newer version of the game';
const damaged = (reason: string): string => `This save is damaged: ${reason}`;

/** Raw JSON surgery. */
type Raw = any;

function fixture(): RichWorld & { json: string } {
  const rich = makeRichWorld();
  return { ...rich, json: serialize(rich.world, '0.1.0', '2026-11-09T10:15:00.000Z') };
}

function corrupt(json: string, edit: (raw: Raw) => void): string {
  const raw = JSON.parse(json) as Raw;
  edit(raw);
  return JSON.stringify(raw);
}

function rejects(json: string): string {
  let result: ReturnType<typeof deserialize> | undefined;
  expect(() => {
    result = deserialize(json);
  }).not.toThrow();
  if (!result || result.ok) throw new Error('expected the save to be rejected');
  return result.error;
}

describe('rejects each corruption class (Review Focus 3)', () => {
  const { world, json } = fixture();
  const tiles = world.state.map.width * world.state.map.height;

  const cases: Array<[string, () => string, string]> = [
    ['truncated JSON', () => json.slice(0, Math.floor(json.length / 2)), UNREADABLE],
    ['empty file', () => '', UNREADABLE],
    ['wrong format', () => corrupt(json, (r) => (r.format = 'some-other-game')), NOT_A_SAVE],
    ['no format', () => corrupt(json, (r) => delete r.format), NOT_A_SAVE],
    ['valid JSON that is not an object', () => '[1, 2, 3]', NOT_A_SAVE],
    ['future schemaVersion', () => corrupt(json, (r) => (r.schemaVersion = 2)), NEWER],
    ['missing schemaVersion', () => corrupt(json, (r) => delete r.schemaVersion), damaged('missing field schemaVersion')],
    ['schemaVersion 0', () => corrupt(json, (r) => (r.schemaVersion = 0)), damaged('bad value at schemaVersion')],
    ['missing state', () => corrupt(json, (r) => delete r.state), damaged('missing field state')],
    ['state version differs from the envelope', () => corrupt(json, (r) => (r.state.schemaVersion = 7)), damaged('the version numbers do not match')],
    ['missing field', () => corrupt(json, (r) => delete r.state.park.name), damaged('missing field park.name')],
    ['missing nested field', () => corrupt(json, (r) => delete r.state.guests[2].needs.thirst), damaged('missing field guests[2].needs.thirst')],
    ['missing top-level slice', () => corrupt(json, (r) => delete r.state.management), damaged('missing field management')],
    ['wrong field type', () => corrupt(json, (r) => (r.state.park.cash = '1000')), damaged('bad value at park.cash')],
    ['fractional money', () => corrupt(json, (r) => (r.state.park.cash = 10.5)), damaged('bad value at park.cash')],
    ['non-integer tick', () => corrupt(json, (r) => (r.state.tick = 1.5)), damaged('bad value at tick')],
    ['non-integer nextId', () => corrupt(json, (r) => (r.state.nextId = null)), damaged('bad value at nextId')],
    ['non-integer rng', () => corrupt(json, (r) => (r.state.rng = 0.25)), damaged('bad value at rng')],
    ['unknown field', () => corrupt(json, (r) => (r.state.park.cheat = true)), damaged('unknown field park.cheat')],
    ['unknown enum value', () => corrupt(json, (r) => (r.state.guests[0].state = 'flying')), damaged('bad value at guests[0].state')],
    ['bad guest target', () => corrupt(json, (r) => (r.state.guests[0].target = 'moon')), damaged('bad value at guests[0].target')],
    ['missing ledger category', () => corrupt(json, (r) => delete r.state.economy.ledger[0].lines.wages), damaged('missing field economy.ledger[0].lines.wages')],
    ['wrong typed-array length', () => corrupt(json, (r) => (r.state.map.terrain = encodeTypedArray(new Uint8Array(tiles - 1)))), damaged('wrong size at map.terrain')],
    ['wrong typed-array kind', () => corrupt(json, (r) => (r.state.map.contentRef = encodeTypedArray(new Uint8Array(tiles)))), damaged('wrong data type at map.contentRef')],
    ['map layer as a plain array', () => corrupt(json, (r) => (r.state.map.litter = [0, 1, 2])), damaged('wrong data type at map.litter')],
    ['patrol of the wrong kind', () => corrupt(json, (r) => (r.state.staff.members[0].patrol = encodeTypedArray(new Int32Array(4)))), damaged('wrong data type at staff.members[0].patrol')],
    ['unreadable base64', () => corrupt(json, (r) => (r.state.map.water.b64 = 'not base64!')), damaged('unreadable data at map.water')],
    ['unknown typed-array kind', () => corrupt(json, (r) => (r.state.map.water.$ta = 'BigInt64Array')), damaged('unknown data type at map.water')],
    ['zero map size', () => corrupt(json, (r) => (r.state.map.width = 0)), damaged('bad map size')],
    ['map size that does not match its layers', () => corrupt(json, (r) => (r.state.map.width = 32)), damaged('wrong size at map.terrain')],
    ['unknown content code', () => corrupt(json, (r) => (r.state.map.content = encodeTypedArray(new Uint8Array(tiles).fill(99)))), damaged('bad value at map.content[0]')],
    ['tile index outside the map', () => corrupt(json, (r) => (r.state.guests[0].tile = tiles)), damaged('bad value at guests[0].tile')],
    ['entrance outside the map', () => corrupt(json, (r) => (r.state.map.entranceTile = -1)), damaged('bad value at map.entranceTile')],
  ];

  for (const [name, make, message] of cases) {
    it(name, () => {
      expect(rejects(make())).toBe(message);
    });
  }

  it('the current game is unchanged after every rejected load', () => {
    const before = stateHash(world);
    for (const [, make] of cases) rejects(make());
    expect(stateHash(world)).toBe(before);
  });
});

describe('rejects ids out of order or out of range', () => {
  const { world, json } = fixture();
  const firstGuest = world.state.guests[0]!.id;

  it('unsorted ids', () => {
    const bad = corrupt(json, (r) => {
      const g = r.state.guests;
      [g[0], g[1]] = [g[1], g[0]];
    });
    expect(rejects(bad)).toBe(damaged('guests are not sorted by id'));
  });

  it('duplicate id inside one list', () => {
    const bad = corrupt(json, (r) => (r.state.guests[1].id = r.state.guests[0].id));
    expect(rejects(bad)).toBe(damaged(`id ${firstGuest} is used twice`));
  });

  it('the same id in two lists', () => {
    const bad = corrupt(json, (r) => (r.state.staff.members[0].id = r.state.rides[0].id));
    expect(rejects(bad)).toBe(damaged(`id ${world.state.rides[0]!.id} is used twice`));
  });

  it('an id at or above nextId', () => {
    const bad = corrupt(json, (r) => (r.state.nextId = r.state.guests[r.state.guests.length - 1].id));
    expect(rejects(bad)).toBe(damaged(`id ${world.state.guests.at(-1)!.id} is not below nextId`));
  });

  it('id 0', () => {
    const bad = corrupt(json, (r) => (r.state.rides[0].id = 0));
    expect(rejects(bad)).toBe(damaged('bad id 0'));
  });
});

describe('rejects dangling references', () => {
  const rich = fixture();
  const { world, json, ride, track, stallId } = rich;
  const s = world.state;
  const missing = 999_999;
  const gate = ride.entrance!.gate;
  const guestIndex = (id: number): number => s.guests.findIndex((g) => g.id === id);
  const staffIndex = (id: number): number => s.staff.members.findIndex((m) => m.id === id);
  const rideIndex = (id: number): number => s.rides.findIndex((r) => r.id === id);
  const stallIndex = (id: number): number => s.stalls.findIndex((x) => x.id === id);

  const cases: Array<[string, (r: Raw) => void, string]> = [
    [
      'dangling contentRef',
      (r) => {
        const refs = new Int32Array(s.map.contentRef);
        refs[gate] = missing;
        r.state.map.contentRef = encodeTypedArray(refs);
      },
      `map tile ${gate} points to a missing ride or stall`,
    ],
    [
      'contentRef to a guest',
      (r) => {
        const refs = new Int32Array(s.map.contentRef);
        refs[gate] = rich.queuer;
        r.state.map.contentRef = encodeTypedArray(refs);
      },
      `map tile ${gate} points to a missing ride or stall`,
    ],
    ['dangling queue guest id', (r) => r.state.rides[rideIndex(ride.id)].queue.push(missing), `ride ${ride.id} queue lists a missing guest`],
    ['dangling rider', (r) => (r.state.rides[rideIndex(ride.id)].riders = [missing]), `ride ${ride.id} lists a missing rider`],
    ['missing mechanic', (r) => (r.state.rides[rideIndex(ride.id)].assignedMechanicId = missing), `ride ${ride.id} has a missing mechanic`],
    ['mechanic id of a guest', (r) => (r.state.rides[rideIndex(ride.id)].assignedMechanicId = rich.queuer), `ride ${ride.id} has a missing mechanic`],
    ['unknown flat ride type', (r) => (r.state.rides[rideIndex(ride.id)].defId = 'teacups_of_doom'), `ride ${ride.id} has an unknown type`],
    ['unknown stall type', (r) => (r.state.stalls[stallIndex(stallId)].defId = 'nope'), `stall ${stallId} has an unknown type`],
    ['stall serving a missing guest', (r) => (r.state.stalls[stallIndex(stallId)].servingGuest = missing), `stall ${stallId} serves a missing guest`],
    ['guest activity at a missing ride', (r) => (r.state.guests[guestIndex(rich.queuer)].activityId = missing), `guest ${rich.queuer} is busy at a missing ride or stall`],
    ['guest seat on a missing ride', (r) => (r.state.guests[guestIndex(rich.seated)].seat.rideId = missing), `guest ${rich.seated} has a seat on a missing ride`],
    ['track data without a ride', (r) => (r.state.track.rides[String(missing)] = r.state.track.rides[String(track.id)]), `track data ${missing} has no matching track ride`],
    ['track data keyed by a flat ride', (r) => (r.state.track.rides[String(ride.id)] = r.state.track.rides[String(track.id)]), `track data ${ride.id} has no matching track ride`],
    ['track data with the wrong ride id', (r) => (r.state.track.rides[String(track.id)].rideId = ride.id), `track data ${track.id} has the wrong ride id`],
    ['track ride without track data', (r) => delete r.state.track.rides[String(track.id)], `track ride ${track.id} has no track data`],
    ['unknown track type', (r) => (r.state.track.rides[String(track.id)].typeId = 'hyper_mega'), `track ride ${track.id} has an unknown type`],
    ['train seat with a missing guest', (r) => (r.state.track.rides[String(track.id)].trains[0].seats[0] = missing), `track ride ${track.id} seats a missing guest`],
    [
      'train seat with a guest who is not riding it',
      (r) => (r.state.track.rides[String(track.id)].trains[0].seats[0] = rich.queuer),
      `track ride ${track.id} seats guest ${rich.queuer} who is not on it`,
    ],
    ['staff target ride missing', (r) => (r.state.staff.members[staffIndex(rich.mechanic)].targetRideId = missing), `staff ${rich.mechanic} targets a missing ride`],
    ['pending breakdown of a missing ride', (r) => r.state.staff.pendingBreakdowns.push(missing), 'a pending breakdown points to a missing ride'],
  ];

  for (const [name, edit, reason] of cases) {
    it(name, () => {
      expect(rejects(corrupt(json, edit))).toBe(damaged(reason));
    });
  }

  it('the unmodified fixture loads, so each case above fails only for its own edit', () => {
    const r = deserialize(json);
    expect(r.ok).toBe(true);
  });
});
