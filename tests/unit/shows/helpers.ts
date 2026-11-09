/** Shared helpers for the After Dark show tests (W4-C). */
import { getShowSiteDef, type ShowSiteDef } from '../../../src/data/catalog';
import { TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_MONTH } from '../../../src/data/tuning/core';
import { executeCommand } from '../../../src/sim/commands';
import { hourlyShare } from '../../../src/sim/economy/ledger';
import { markNetworkDirty } from '../../../src/sim/pathing';
import { findShowSite } from '../../../src/sim/shows/api';
import type { ShowSite } from '../../../src/sim/shows/types';
import { hourOfMonth } from '../../../src/sim/time';
import type { SandboxOptions } from '../../../src/sim/scenario/types';
import type { World } from '../../../src/sim/types';
import { makeTestWorld, placeFootpath, runTicks } from '../../helpers/world';

/** Tick of `hour:minute` on day `day` (day 0 = the first day; a new game starts at 09:00 of day 0). */
export function at(day: number, hour: number, minute = 0): number {
  return day * TICKS_PER_DAY + hour * TICKS_PER_HOUR + (minute * TICKS_PER_HOUR) / 60;
}

export function defOf(id: 'lightshow_tower' | 'fireworks_launcher'): ShowSiteDef {
  const def = getShowSiteDef(id);
  if (!def) throw new Error(id);
  return def;
}

/**
 * A 64 × 64 test park with a footpath T: a row at y = 40 (x 10–52) joined to the entrance stub by a column at x = 31
 * (y 41–59). Show sites go north of the row.
 */
export function showWorld(seed = 4242): World {
  const w = makeTestWorld(seed);
  for (let x = 10; x <= 52; x++) placeFootpath(w, x, 40);
  for (let y = 41; y <= 59; y++) placeFootpath(w, 31, y);
  markNetworkDirty(w);
  return w;
}

/** Place a site with the real command in setup mode (Phase 6 content stays locked until W4-D raises the build phase). */
export function placeSite(w: World, defId: 'lightshow_tower' | 'fireworks_launcher', x: number, y: number): ShowSite {
  const r = executeCommand(w, { type: 'placeShowSite', defId, x, y, rotation: 0 }, { setup: true });
  if (!r.ok || r.id === undefined) throw new Error(r.ok ? 'no id' : r.reason);
  const site = findShowSite(w, r.id);
  if (!site) throw new Error('site missing');
  return site;
}

/** Schedule and turn on a site's shows. */
export function scheduleSite(w: World, site: ShowSite, hour = 21, minute: 0 | 30 = 0, everyNDays = 1): void {
  const a = executeCommand(w, { type: 'setShowSchedule', id: site.id, hour, minute, everyNDays });
  if (!a.ok) throw new Error(a.reason);
  const b = executeCommand(w, { type: 'setShowEnabled', id: site.id, enabled: true });
  if (!b.ok) throw new Error(b.reason);
}

/** Run until `world.state.tick === tick` (that tick not yet stepped). */
export function runTo(w: World, tick: number): void {
  if (tick < w.state.tick) throw new Error(`tick ${tick} is in the past (${w.state.tick})`);
  runTicks(w, tick - w.state.tick);
}

/** The running costs `hourlyShows` books for one site between ticks [from, to) (hour starts only). */
export function runningCharged(monthly: number, builtTick: number, from: number, to: number): number {
  let sum = 0;
  for (let t = Math.ceil(from / TICKS_PER_HOUR) * TICKS_PER_HOUR; t < to; t += TICKS_PER_HOUR) {
    const monthStart = t - (t % TICKS_PER_MONTH);
    sum += hourlyShare(monthly, hourOfMonth(t), builtTick <= monthStart);
  }
  return sum;
}

/** The `shows` ledger line of the current month. */
export function showsLine(w: World): number {
  const ledger = w.state.economy.ledger;
  return ledger[ledger.length - 1]?.lines.shows ?? 0;
}

/** Sum of the `shows` ledger line over every month. */
export function showsTotal(w: World): number {
  return w.state.economy.ledger.reduce((sum, m) => sum + m.lines.shows, 0);
}

/** Turn on the sandbox "Unlimited money" option on a test world. */
export function unlimitedMoney(w: World): void {
  const options: SandboxOptions = {
    mapSize: 64,
    terrainStyle: 'flat',
    seed: 1,
    climate: 'temperate',
    afterDark: true,
    unlimitedMoney: true,
    allUnlocked: false,
    guestsArrive: false,
    breakdowns: true,
    weather: 'normal',
    awards: true,
  };
  const sc = w.state.scenario;
  if (sc.kind !== 'freePlay') throw new Error('free play expected');
  w.state.scenario = { kind: 'sandbox', options, awards: sc.awards };
}
