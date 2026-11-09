/**
 * Gathering, watching, happiness, the `greatShow` thought, and demolish while in use (Phase 6 §4.4; master R6;
 * Review Focus 1). Owner: W4-C.
 */
import { describe, expect, it } from 'vitest';
import { SHOW_GATHER_DISTANCE, SHOW_HAPPY_CAP, SHOW_WATCH_CHANCE, SHOW_WATCH_MATCH_BONUS } from '../../../src/data/tuning/shows';
import { validateState } from '../../../src/save';
import { executeCommand } from '../../../src/sim/commands';
import { tileIndex } from '../../../src/sim/map';
import { distanceTo, markNetworkDirty } from '../../../src/sim/pathing';
import { rngNext } from '../../../src/sim/rng';
import { showMatches, viewingTiles, watchGain } from '../../../src/sim/shows/api';
import { updateWatchingShow } from '../../../src/sim/shows/guests';
import { gatherWatchers } from '../../../src/sim/shows/update';
import { THOUGHT } from '../../../src/sim/guests/thoughts';
import type { Guest } from '../../../src/sim/guests/types';
import type { World } from '../../../src/sim/types';
import { addGuestDirect, placeFootpath, runTicks, stateHash } from '../../helpers/world';
import { at, defOf, placeSite, runTo, scheduleSite, showWorld } from './helpers';

/** The show world with the row at y = 40 stretched east to x = 61 (distances up to 24 from the viewing tiles). */
function longRowWorld(): World {
  const w = showWorld();
  for (let x = 53; x <= 61; x++) placeFootpath(w, x, 40);
  markNetworkDirty(w);
  return w;
}

const STILL = { nextDecisionTick: 1e9 } as const;

describe('viewing tiles (footpaths within the show radius)', () => {
  it('are the footpath tiles within the radius of the footprint centre, ascending', () => {
    const w = showWorld();
    const site = placeSite(w, 'lightshow_tower', 30, 36);
    const map = w.state.map;
    const expected: number[] = [];
    for (let x = 24; x <= 37; x++) expected.push(tileIndex(map, x, 40));
    for (let y = 41; y <= 44; y++) expected.push(tileIndex(map, 31, y));
    expect([...viewingTiles(w, site.id)]).toEqual(expected.sort((a, b) => a - b));
    expect(viewingTiles(w, site.id + 1000)).toEqual([]);
  });

  it('the Fireworks Launcher sees 12 tiles around its single tile', () => {
    const w = showWorld();
    const site = placeSite(w, 'fireworks_launcher', 31, 30);
    const map = w.state.map;
    // Centre (31.5, 30.5); row y = 40 is 10 tiles away, so |dx| ≤ 6.6 → x 25–37.
    const row = viewingTiles(w, site.id).filter((t) => t >= tileIndex(map, 0, 40) && t < tileIndex(map, 0, 41));
    expect(row[0]).toBe(tileIndex(map, 25, 40));
    expect(row.at(-1)).toBe(tileIndex(map, 37, 40));
  });
});

describe('gathering at the announcement (Phase 6 §4.4 Gathering)', () => {
  function eligibleWorld(): { w: World; site: ReturnType<typeof placeSite>; near: Guest[]; out: Guest[] } {
    const w = longRowWorld();
    const site = placeSite(w, 'lightshow_tower', 30, 36);
    const map = w.state.map;
    const row = (x: number): number => tileIndex(map, x, 40);
    expect(distanceTo(w, row(37 + SHOW_GATHER_DISTANCE), `show:${site.id}`)).toBe(SHOW_GATHER_DISTANCE);
    const near = [
      addGuestDirect(w, row(40), { ...STILL, temperament: 50 }),
      addGuestDirect(w, row(37 + SHOW_GATHER_DISTANCE), { ...STILL, temperament: 50, needs: { hunger: 40, thirst: 40, bladder: 20, energy: 40, happiness: 180, nausea: 0 } }),
      addGuestDirect(w, row(30), { ...STILL, temperament: 10 }),
      addGuestDirect(w, row(12), { ...STILL, temperament: 90 }),
    ];
    const out = [
      addGuestDirect(w, row(38 + SHOW_GATHER_DISTANCE), { ...STILL }),
      addGuestDirect(w, row(33), { ...STILL, needs: { hunger: 40, thirst: 40, bladder: 20, energy: 39, happiness: 180, nausea: 0 } }),
      addGuestDirect(w, row(34), { ...STILL, state: 'queueing' }),
      addGuestDirect(w, row(35), { ...STILL, state: 'buying' }),
      addGuestDirect(w, row(36), { ...STILL, state: 'sitting' }),
      addGuestDirect(w, row(29), { ...STILL, state: 'leaving', target: 'exit' }),
      addGuestDirect(w, row(28), { ...STILL, showTarget: site.id, target: `show:${site.id}` }),
      // Off the network (no route): no walking distance.
      addGuestDirect(w, tileIndex(map, 5, 5), { ...STILL }),
    ];
    return { w, site, near, out };
  }

  it('only walking guests with energy ≥ 40 within 20 tiles of walking distance draw, in id order, chance 0.5 (+0.2 matching)', () => {
    const { w, site, near, out } = eligibleWorld();
    const replica = { rng: w.state.rng };
    const expected = near.filter((g) => rngNext(replica) < SHOW_WATCH_CHANCE + (showMatches('lightshow_tower', g.temperament) ? SHOW_WATCH_MATCH_BONUS : 0)).map((g) => g.id);
    const n = gatherWatchers(w, site, defOf('lightshow_tower'));
    // One RNG draw per eligible guest, none for the others.
    expect(w.state.rng).toBe(replica.rng);
    expect(n).toBe(expected.length);
    expect(w.state.guests.filter((g) => g.showTarget === site.id && !out.includes(g)).map((g) => g.id)).toEqual(expected);
    for (const g of w.state.guests) {
      if (!expected.includes(g.id)) continue;
      expect(g.target).toBe(`show:${site.id}`);
    }
    for (const g of out.slice(0, 6)) expect(g.showTarget).toBe(-1);
  });

  it('is deterministic: the same world gathers the same guests', () => {
    const a = eligibleWorld();
    const b = eligibleWorld();
    gatherWatchers(a.w, a.site, defOf('lightshow_tower'));
    gatherWatchers(b.w, b.site, defOf('lightshow_tower'));
    expect(stateHash(a.w)).toBe(stateHash(b.w));
  });

  it('temperament groups (master R6): Chill matches the Lightshow, Thrill the Fireworks', () => {
    expect(showMatches('lightshow_tower', 35)).toBe(true);
    expect(showMatches('lightshow_tower', 36)).toBe(false);
    expect(showMatches('lightshow_tower', 80)).toBe(false);
    expect(showMatches('fireworks_launcher', 65)).toBe(true);
    expect(showMatches('fireworks_launcher', 64)).toBe(false);
    expect(showMatches('fireworks_launcher', 10)).toBe(false);
  });

  it('over many guests the shares follow the chances: about 0.5, and 0.7 for the matching group', () => {
    const w = longRowWorld();
    const site = placeSite(w, 'fireworks_launcher', 31, 36);
    const map = w.state.map;
    const thrill: Guest[] = [];
    const family: Guest[] = [];
    for (let k = 0; k < 2000; k++) {
      const tile = tileIndex(map, 20 + (k % 30), 40);
      (k % 2 === 0 ? thrill : family).push(addGuestDirect(w, tile, { ...STILL, temperament: k % 2 === 0 ? 80 : 50 }));
    }
    gatherWatchers(w, site, defOf('fireworks_launcher'));
    const share = (list: Guest[]): number => list.filter((g) => g.showTarget === site.id).length / list.length;
    expect(share(thrill)).toBeGreaterThan(0.65);
    expect(share(thrill)).toBeLessThan(0.75);
    expect(share(family)).toBeGreaterThan(0.45);
    expect(share(family)).toBeLessThan(0.55);
  });
});

describe('watching (Phase 6 §4.4 Effect)', () => {
  it('watch gain: +1 per second, ×1.3 floored for a matching group, never above +40', () => {
    expect([0, 1, 2, 3, 10, 15, 20].map((s) => watchGain(s, false))).toEqual([0, 1, 2, 3, 10, 15, 20]);
    expect([0, 1, 2, 3, 10, 15, 20].map((s) => watchGain(s, true))).toEqual([0, 1, 2, 3, 13, 19, 26]);
    expect(watchGain(40, false)).toBe(SHOW_HAPPY_CAP);
    expect(watchGain(60, false)).toBe(SHOW_HAPPY_CAP);
    expect(watchGain(30, true)).toBe(39);
    expect(watchGain(31, true)).toBe(SHOW_HAPPY_CAP);
    expect(watchGain(100, true)).toBe(SHOW_HAPPY_CAP);
  });

  function watchFor(defId: 'lightshow_tower' | 'fireworks_launcher', temperament: number, ticks: number): number {
    const w = showWorld();
    const site = placeSite(w, defId, 30, 36);
    site.status = 'running';
    site.startTick = w.state.tick;
    const tile = viewingTiles(w, site.id)[0] as number;
    const g = addGuestDirect(w, tile, { state: 'watchingShow', showTarget: site.id, target: `show:${site.id}`, temperament, needs: { hunger: 0, thirst: 0, bladder: 0, energy: 200, happiness: 100, nausea: 0 } });
    for (let e = 1; e <= ticks; e++) {
      w.state.tick = site.startTick + e;
      updateWatchingShow(w, g);
    }
    expect(g.state).toBe('watchingShow');
    return g.needs.happiness - 100;
  }

  it('a whole show gives +15 (Lightshow, 300 ticks) and +20 (Fireworks, 400 ticks); ×1.3 for the matching group', () => {
    expect(watchFor('lightshow_tower', 50, defOf('lightshow_tower').showTicks)).toBe(15);
    expect(watchFor('lightshow_tower', 20, defOf('lightshow_tower').showTicks)).toBe(19);
    expect(watchFor('lightshow_tower', 90, defOf('lightshow_tower').showTicks)).toBe(15);
    expect(watchFor('fireworks_launcher', 50, defOf('fireworks_launcher').showTicks)).toBe(20);
    expect(watchFor('fireworks_launcher', 70, defOf('fireworks_launcher').showTicks)).toBe(26);
  });

  it('the happiness cap holds per show however long a watcher stands there', () => {
    expect(watchFor('lightshow_tower', 50, 2000)).toBe(SHOW_HAPPY_CAP);
    expect(watchFor('fireworks_launcher', 90, 2000)).toBe(SHOW_HAPPY_CAP);
  });

  it('a watcher waits still while the show is only announced; nothing is gained before the start', () => {
    const w = showWorld();
    const site = placeSite(w, 'lightshow_tower', 30, 36);
    site.status = 'announced';
    const tile = viewingTiles(w, site.id)[0] as number;
    const g = addGuestDirect(w, tile, { state: 'watchingShow', showTarget: site.id, target: `show:${site.id}`, nextTile: tile + 1, progress: 3 });
    const before = g.needs.happiness;
    for (let k = 0; k < 40; k++) {
      w.state.tick += 1;
      updateWatchingShow(w, g);
    }
    expect(g.state).toBe('watchingShow');
    expect(g.nextTile).toBe(-1);
    expect(g.needs.happiness).toBe(before);
  });
});

describe('a whole show night', () => {
  function nightWithWatchers(): { w: World; site: ReturnType<typeof placeSite>; guests: Guest[] } {
    const w = showWorld(7);
    const site = placeSite(w, 'lightshow_tower', 30, 36);
    scheduleSite(w, site, 21, 0, 1);
    const map = w.state.map;
    const guests: Guest[] = [];
    for (let k = 0; k < 40; k++) guests.push(addGuestDirect(w, tileIndex(map, 14 + k, 40), { ...STILL, temperament: (k * 37) % 100 }));
    return { w, site, guests };
  }

  it('gathered guests walk to the viewing tiles, watch, think "What a great show!", and walk on', () => {
    const { w, site, guests } = nightWithWatchers();
    // The guests wander without deciding until the announcement (they would leave a park with no rides).
    runTo(w, at(0, 20) + 1);
    const gathered = guests.filter((g) => g.showTarget === site.id);
    expect(gathered.length).toBeGreaterThan(5);
    runTo(w, at(0, 21) + 1);
    const view = new Set(viewingTiles(w, site.id));
    const watching = w.state.guests.filter((g) => g.state === 'watchingShow');
    expect(watching.length).toBeGreaterThan(0);
    for (const g of watching) {
      expect(g.showTarget).toBe(site.id);
      expect(view.has(g.tile)).toBe(true);
    }
    runTo(w, at(0, 21) + defOf('lightshow_tower').showTicks + 1);
    expect(site.status).toBe('done');
    // Late arrivals join during the show; every watcher at the end counts.
    expect(site.lastWatchers).toBeGreaterThanOrEqual(watching.length);
    expect(site.lastWatchers).toBeLessThanOrEqual(gathered.length);
    expect(site.totals.watchers).toBe(site.lastWatchers);
    const thinkers = w.state.guests.filter((g) => g.thoughts.some((t) => t.id === THOUGHT.greatShow));
    expect(thinkers.length).toBe(site.lastWatchers);
    for (const g of w.state.guests) {
      expect(g.showTarget).toBe(-1);
      expect(g.state).not.toBe('watchingShow');
    }
    expect(validateState(w.state)).toBeNull();
  });

  it('walkers keep their show target through decisions (the show hook) until they arrive', () => {
    const { w, site } = nightWithWatchers();
    runTo(w, at(0, 20) + 1);
    const walkers = w.state.guests.filter((g) => g.showTarget === site.id && g.state === 'walking');
    expect(walkers.length).toBeGreaterThan(0);
    runTicks(w, 20);
    for (const g of walkers) {
      expect(g.showTarget).toBe(site.id);
      expect(g.target).toBe(`show:${site.id}`);
    }
  });

  it('demolish while in use (Review Focus 1): watchers and walkers re-plan at once, no dangling target', () => {
    const { w, site } = nightWithWatchers();
    runTo(w, at(0, 21) + 40);
    const involved = w.state.guests.filter((g) => g.showTarget === site.id);
    expect(involved.some((g) => g.state === 'watchingShow')).toBe(true);
    expect(executeCommand(w, { type: 'demolish', x: 30, y: 36 }).ok).toBe(true);
    for (const g of involved) {
      expect(g.showTarget).toBe(-1);
      expect(g.state).toBe('walking');
      expect(g.target).toBeNull();
    }
    expect(validateState(w.state)).toBeNull();
    runTicks(w, 30);
    for (const g of w.state.guests) {
      expect(g.target === `show:${site.id}`).toBe(false);
      expect(g.state).not.toBe('watchingShow');
    }
    expect(validateState(w.state)).toBeNull();
  });

  it('a footpath demolished under a watcher sends it back onto the network', () => {
    const { w, site } = nightWithWatchers();
    runTo(w, at(0, 21) + 40);
    const g = w.state.guests.find((x) => x.state === 'watchingShow');
    expect(g).toBeDefined();
    const map = w.state.map;
    const tile = (g as Guest).tile;
    executeCommand(w, { type: 'demolish', x: tile % map.width, y: Math.floor(tile / map.width) });
    runTicks(w, 1);
    expect((g as Guest).state).toBe('walking');
    expect((g as Guest).showTarget).toBe(-1);
    void site;
  });
});
