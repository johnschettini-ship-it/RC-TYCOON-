/** Schema 3 validators for the Build 3 fields (Phase 6 §5): strict, exact messages, no defaults. */
import { describe, expect, it } from 'vitest';
import { deserialize, serialize, validateState } from '../../../src/save';
import { allocId } from '../../../src/sim/ids';
import { Content, tileIndex } from '../../../src/sim/map';
import { defaultShowSchedule, type ShowSite } from '../../../src/sim/shows/types';
import type { World } from '../../../src/sim/types';
import { stateHash } from '../../helpers/world';
import { makeRichWorld } from './fixture';

/** Raw JSON surgery. */
type Raw = any;

const damaged = (reason: string): string => `This save is damaged: ${reason}`;

/** The rich fixture plus a Lightshow Tower (2 × 2) and a guest watching it. */
function makeBuild3World(): { world: World; siteId: number } {
  const { world } = makeRichWorld();
  const s = world.state;
  const map = s.map;
  const siteId = allocId(s);
  const site: ShowSite = {
    id: siteId,
    defId: 'lightshow_tower',
    x: 50,
    y: 40,
    rotation: 0,
    schedule: { ...defaultShowSchedule(), enabled: true, minute: 30 },
    status: 'running',
    nextShowTick: 3_000,
    startTick: 2_990,
    lastWatchers: 4,
    totals: { shows: 2, cost: 30_000, watchers: 9 },
    totalBuildCost: 250_000,
    builtTick: 600,
  };
  s.shows.push(site);
  for (const [x, y] of [[50, 40], [51, 40], [50, 41], [51, 41]] as const) {
    map.content[tileIndex(map, x, y)] = Content.Building;
    map.contentRef[tileIndex(map, x, y)] = siteId;
  }
  const g = s.guests[0]!;
  g.state = 'watchingShow';
  g.showTarget = siteId;
  g.target = `show:${siteId}`;
  s.guests[1]!.items.photo = true;
  return { world, siteId };
}

function roundTrip(world: World): World {
  const r = deserialize(serialize(world, '0.3.0', '2026-11-09T10:15:00.000Z'));
  if (!r.ok) throw new Error(r.error);
  return r.world;
}

function edit(world: World, fn: (raw: Raw) => void): string {
  const raw = JSON.parse(serialize(world, '0.3.0', '2026-11-09T10:15:00.000Z')) as Raw;
  fn(raw);
  return JSON.stringify(raw);
}

function reject(json: string): string {
  const r = deserialize(json);
  if (r.ok) throw new Error('expected the save to be rejected');
  return r.error;
}

describe('schema 3 (Phase 6 §5)', () => {
  it('a park with a show site, a watcher, and a photo passes the checks and round-trips exactly', () => {
    const { world } = makeBuild3World();
    expect(validateState(world.state)).toBeNull();
    const back = roundTrip(world);
    expect(back.state.shows).toEqual(world.state.shows);
    expect(back.state.guests[0]!.state).toBe('watchingShow');
    expect(stateHash(back)).toBe(stateHash(world));
  });

  it('every show site field is required, typed, and known', () => {
    const { world } = makeBuild3World();
    expect(reject(edit(world, (r) => delete r.state.shows[0].schedule.enabled))).toBe(damaged('missing field shows[0].schedule.enabled'));
    expect(reject(edit(world, (r) => (r.state.shows[0].schedule.minute = 15)))).toBe(damaged('bad value at shows[0].schedule.minute'));
    expect(reject(edit(world, (r) => (r.state.shows[0].status = 'paused')))).toBe(damaged('bad value at shows[0].status'));
    expect(reject(edit(world, (r) => (r.state.shows[0].totals.cost = 1.5)))).toBe(damaged('bad value at shows[0].totals.cost'));
    expect(reject(edit(world, (r) => (r.state.shows[0].extra = 1)))).toBe(damaged('unknown field shows[0].extra'));
    expect(reject(edit(world, (r) => delete r.state.shows))).toBe(damaged('missing field shows'));
  });

  it('guest showTarget and items.photo are required', () => {
    const { world } = makeBuild3World();
    expect(reject(edit(world, (r) => delete r.state.guests[2].showTarget))).toBe(damaged('missing field guests[2].showTarget'));
    expect(reject(edit(world, (r) => delete r.state.guests[2].items.photo))).toBe(damaged('missing field guests[2].items.photo'));
    expect(reject(edit(world, (r) => (r.state.guests[2].target = 'show:x')))).toBe(damaged('bad value at guests[2].target'));
  });

  it('reference checks: show site types, positions, map tiles, and watchers', () => {
    const { world, siteId } = makeBuild3World();
    expect(reject(edit(world, (r) => (r.state.shows[0].defId = 'laser_dome')))).toBe(damaged(`show site ${siteId} has an unknown type`));
    expect(reject(edit(world, (r) => (r.state.shows[0].x = 64)))).toBe(damaged(`show site ${siteId} is outside the map`));
    const g0 = world.state.guests[0]!.id;
    expect(reject(edit(world, (r) => (r.state.shows = [])))).toMatch(/^This save is damaged: map tile \d+ points to a missing ride, stall, or scenery$/);
    expect(reject(edit(world, (r) => (r.state.guests[0].showTarget = r.state.rides[0].id)))).toBe(damaged(`guest ${g0} heads for a missing show site`));
    expect(reject(edit(world, (r) => (r.state.shows[0].id = r.state.rides[0].id)))).toMatch(/^This save is damaged: id \d+ is used twice$/);
  });
});
