/** Schema 2 validators for the Build 2 fields (Phase 4 §5, Phase 5 §5): strict, exact messages, no defaults. */
import { describe, expect, it } from 'vitest';
import { deserialize, serialize, validateState } from '../../../src/save';
import { encodeTypedArray } from '../../../src/save/typedArrays';
import { allocId } from '../../../src/sim/ids';
import { Content, tileIndex } from '../../../src/sim/map';
import type { ScenarioState } from '../../../src/sim/scenario/types';
import type { World } from '../../../src/sim/types';
import { stateHash } from '../../helpers/world';
import { makeRichWorld } from './fixture';

/** Raw JSON surgery. */
type Raw = any;

const damaged = (reason: string): string => `This save is damaged: ${reason}`;

/** The rich fixture plus one of every Build 2 thing: an elevated path with a bench, scenery, samples. */
function makeBuild2World(): { world: World; pathId: number; sceneryId: number } {
  const { world } = makeRichWorld();
  const s = world.state;
  const map = s.map;
  const pathId = allocId(s);
  s.elevatedPaths.push({ id: pathId, x: 10, y: 10, z: 12, kind: 'footpath', rampDir: -1 });
  const benchTile = tileIndex(map, 10, 10);
  map.pathItem[benchTile] = 1;
  map.pathItemLevel[benchTile] = pathId;
  const sceneryId = allocId(s);
  s.scenery.push({ id: sceneryId, defId: 'tent_red', x: 50, y: 50, z: 8, rotation: 1, edge: -1, waterLevel: 255 });
  for (const [x, y] of [[50, 50], [51, 50], [50, 51], [51, 51]] as const) {
    map.content[tileIndex(map, x, y)] = Content.Scenery;
    map.contentRef[tileIndex(map, x, y)] = sceneryId;
  }
  s.scenery.push({ id: allocId(s), defId: 'hedge_low', x: 31, y: 40, z: 8, rotation: 0, edge: 1, waterLevel: 255 });
  s.park.afterDark = false;
  s.guests[0]!.wetUntilTick = 9000;
  s.staff.members[0]!.state = 'watering';
  s.staff.members[0]!.task = 'water';
  const sample = { tick: 600, guests: 12, rating: 512, meanHappiness: 170.5, chill: 3, family: 5, thrill: 4, chillHappiness: 160, familyHappiness: 170, thrillHappiness: 180 };
  s.monthMetrics.daySamples.push(sample);
  s.monthMetrics.nightSamples.push({ ...sample, tick: 1100 });
  s.monthMetrics.thoughtGuests['guest.tooExpensive'] = [3, 7];
  s.monthMetrics.brokenRides.push(s.rides[0]!.id);
  s.scenario = { kind: 'freePlay', awards: { active: ['spotlessPark'], history: [{ monthIndex: 0, id: 'spotlessPark' }] } };
  return { world, pathId, sceneryId };
}

function roundTrip(world: World): World {
  const r = deserialize(serialize(world, '0.2.0', '2026-11-09T10:15:00.000Z'));
  if (!r.ok) throw new Error(r.error);
  return r.world;
}

const SCENARIO_KINDS: ScenarioState[] = [
  { kind: 'freePlay', awards: { active: [], history: [] } },
  {
    kind: 'sandbox',
    options: { mapSize: 128, terrainStyle: 'islands', seed: 42, climate: 'coastal', afterDark: true, unlimitedMoney: true, allUnlocked: true, guestsArrive: false, breakdowns: false, weather: 'alwaysSunny', awards: false },
    awards: { active: ['ripOffPark'], history: [{ monthIndex: 2, id: 'ripOffPark' }] },
  },
  { kind: 'tutorial', stepIndex: 4, skipped: false, done: false },
  {
    kind: 'scenario',
    id: 'meadow_start',
    defVersion: 1,
    difficulty: 'tough',
    status: 'won',
    endReason: null,
    endMonthIndex: 7,
    continued: true,
    progressRecorded: true,
    deadlineMonthIndex: 11,
    objectives: [{ met: true, value: 312, streak: 1 }],
    loseCounters: { bankruptMonths: 1, lowRatingDays: 0 },
    awards: { active: [], history: [] },
  },
];

describe('schema 2: Build 2 fields round-trip', () => {
  it('a world with every Build 2 field validates and round-trips to the same hash', () => {
    const { world } = makeBuild2World();
    expect(validateState(world.state)).toBeNull();
    expect(stateHash(roundTrip(world))).toBe(stateHash(world));
  });

  for (const sc of SCENARIO_KINDS) {
    it(`scenario kind ${sc.kind} round-trips`, () => {
      const { world } = makeBuild2World();
      world.state.scenario = sc;
      expect(validateState(world.state)).toBeNull();
      expect(roundTrip(world).state.scenario).toEqual(sc);
    });
  }
});

describe('schema 2: strict checks on Build 2 fields', () => {
  const built = makeBuild2World();
  const json = serialize(built.world, '0.2.0', '2026-11-09T10:15:00.000Z');
  const tiles = built.world.state.map.width * built.world.state.map.height;
  const corrupt = (fn: (r: Raw) => void): string => {
    const raw = JSON.parse(json) as Raw;
    fn(raw);
    return JSON.stringify(raw);
  };
  const reject = (bad: string): string => {
    const r = deserialize(bad);
    if (r.ok) throw new Error('expected the save to be rejected');
    return r.error;
  };

  const cases: Array<[string, (r: Raw) => void, string]> = [
    ['missing park.afterDark', (r) => delete r.state.park.afterDark, damaged('missing field park.afterDark')],
    ['park.afterDark not a boolean', (r) => (r.state.park.afterDark = 1), damaged('bad value at park.afterDark')],
    ['fractional land price', (r) => (r.state.park.landPrice = 150.5), damaged('bad value at park.landPrice')],
    ['missing rights price', (r) => delete r.state.park.rightsPrice, damaged('missing field park.rightsPrice')],
    ['missing guest z', (r) => delete r.state.guests[1].z, damaged('missing field guests[1].z')],
    ['guest z above 255', (r) => (r.state.guests[1].z = 256), damaged('bad value at guests[1].z')],
    ['missing wetUntilTick', (r) => delete r.state.guests[1].wetUntilTick, damaged('missing field guests[1].wetUntilTick')],
    ['negative staff z', (r) => (r.state.staff.members[1].z = -1), damaged('bad value at staff.members[1].z')],
    ['unknown staff task', (r) => (r.state.staff.members[1].task = 'garden'), damaged('bad value at staff.members[1].task')],
    ['missing pathItemLevel', (r) => delete r.state.map.pathItemLevel, damaged('missing field map.pathItemLevel')],
    ['pathItemLevel of the wrong kind', (r) => (r.state.map.pathItemLevel = encodeTypedArray(new Uint8Array(tiles))), damaged('wrong data type at map.pathItemLevel')],
    ['pathItemLevel of the wrong size', (r) => (r.state.map.pathItemLevel = encodeTypedArray(new Int32Array(tiles - 1))), damaged('wrong size at map.pathItemLevel')],
    ['missing elevatedPaths', (r) => delete r.state.elevatedPaths, damaged('missing field elevatedPaths')],
    ['elevated path ramp direction', (r) => (r.state.elevatedPaths[0].rampDir = 4), damaged('bad value at elevatedPaths[0].rampDir')],
    ['elevated path kind', (r) => (r.state.elevatedPaths[0].kind = 'bridge'), damaged('bad value at elevatedPaths[0].kind')],
    ['elevated path extra field', (r) => (r.state.elevatedPaths[0].supports = 3), damaged('unknown field elevatedPaths[0].supports')],
    ['scenery edge 4', (r) => (r.state.scenery[1].edge = 4), damaged('bad value at scenery[1].edge')],
    ['scenery water level 300', (r) => (r.state.scenery[0].waterLevel = 300), damaged('bad value at scenery[0].waterLevel')],
    ['missing scenery list', (r) => delete r.state.scenery, damaged('missing field scenery')],
    ['missing scenario', (r) => delete r.state.scenario, damaged('missing field scenario')],
    ['scenario without a kind', (r) => delete r.state.scenario.kind, damaged('missing field scenario.kind')],
    ['unknown scenario kind', (r) => (r.state.scenario.kind = 'campaign'), damaged('bad value at scenario.kind')],
    ['free play without awards', (r) => delete r.state.scenario.awards, damaged('missing field scenario.awards')],
    ['unknown award', (r) => (r.state.scenario.awards.active = ['bestRide']), damaged('bad value at scenario.awards.active[0]')],
    ['tutorial field on free play', (r) => (r.state.scenario.stepIndex = 2), damaged('unknown field scenario.stepIndex')],
    ['missing month metrics', (r) => delete r.state.monthMetrics, damaged('missing field monthMetrics')],
    ['bad sample', (r) => (r.state.monthMetrics.daySamples[0].guests = 'many'), damaged('bad value at monthMetrics.daySamples[0].guests')],
    ['thought guests not ids', (r) => (r.state.monthMetrics.thoughtGuests['guest.lost'] = [1.5]), damaged('bad value at monthMetrics.thoughtGuests.guest.lost[0]')],
  ];
  for (const [name, fn, message] of cases) {
    it(name, () => expect(reject(corrupt(fn))).toBe(message));
  }

  it('a sandbox with a bad option is rejected', () => {
    const { world } = makeBuild2World();
    world.state.scenario = SCENARIO_KINDS[1] as ScenarioState;
    const bad = JSON.parse(serialize(world, '0.2.0', 'x')) as Raw;
    bad.state.scenario.options.mapSize = '96';
    expect(reject(JSON.stringify(bad))).toBe(damaged('bad value at scenario.options.mapSize'));
  });

  it('a scenario run without endReason is rejected (null, never absent)', () => {
    const { world } = makeBuild2World();
    world.state.scenario = SCENARIO_KINDS[3] as ScenarioState;
    const bad = JSON.parse(serialize(world, '0.2.0', 'x')) as Raw;
    delete bad.state.scenario.endReason;
    expect(reject(JSON.stringify(bad))).toBe(damaged('missing field scenario.endReason'));
  });
});

describe('schema 2: references of Build 2 entities', () => {
  const built = makeBuild2World();
  const json = serialize(built.world, '0.2.0', '2026-11-09T10:15:00.000Z');
  const corrupt = (fn: (r: Raw) => void): string => {
    const raw = JSON.parse(json) as Raw;
    fn(raw);
    return JSON.stringify(raw);
  };
  const reject = (bad: string): string => {
    const r = deserialize(bad);
    if (r.ok) throw new Error('expected the save to be rejected');
    return r.error;
  };

  it('a path item level must name an elevated path on that tile', () => {
    const tile = tileIndex(built.world.state.map, 10, 10);
    expect(reject(corrupt((r) => (r.state.elevatedPaths[0].x = 11)))).toBe(damaged(`map tile ${tile} has a path item on a missing elevated path`));
  });

  it('elevated paths and scenery inside the map', () => {
    expect(reject(corrupt((r) => (r.state.elevatedPaths[0].x = 64)))).toBe(damaged(`elevated path ${built.pathId} is outside the map`));
    expect(reject(corrupt((r) => (r.state.scenery[0].y = -1)))).toBe(damaged(`scenery ${built.sceneryId} is outside the map`));
  });

  it('scenery has a known type', () => {
    expect(reject(corrupt((r) => (r.state.scenery[0].defId = 'gnome')))).toBe(damaged(`scenery ${built.sceneryId} has an unknown type`));
  });

  it('ids are unique across every entity list, sorted, and below nextId', () => {
    expect(reject(corrupt((r) => (r.state.scenery[0].id = built.pathId)))).toBe(damaged(`id ${built.pathId} is used twice`));
    expect(reject(corrupt((r) => (r.state.elevatedPaths[0].id = r.state.nextId)))).toBe(damaged(`id ${built.world.state.nextId} is not below nextId`));
    expect(reject(corrupt((r) => r.state.scenery.reverse()))).toBe(damaged('scenery are not sorted by id'));
  });

  it('map tiles may point to scenery, never to a missing entity', () => {
    expect(validateState(built.world.state)).toBeNull();
    expect(reject(corrupt((r) => r.state.scenery.splice(0, 1)))).toMatch(/^This save is damaged: map tile \d+ points to a missing ride, stall, or scenery$/);
  });
});
