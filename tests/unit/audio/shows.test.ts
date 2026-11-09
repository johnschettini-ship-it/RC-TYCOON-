/** Show sounds follow W4-C's show timeline: `fw_launch`, `fw_burst`, `light_swoosh` (Phase 6 §4.2, §4.4). W4-A. */
import { describe, expect, it } from 'vitest';
import { createShowCueTracker, SHOW_CUE_SFX } from '../../../src/audio/shows';
import type { ShowCue } from '../../../src/render/shows/timeline';
import type { ShowSite } from '../../../src/sim/shows/types';
import { defaultShowSchedule } from '../../../src/sim/shows/types';
import type { SimEvent } from '../../../src/sim/types';
import { makeTestWorld, stateHash } from '../../helpers/world';

function site(id: number, defId: string, x: number, y: number, startTick: number, status: ShowSite['status'] = 'running'): ShowSite {
  return {
    id,
    defId,
    x,
    y,
    rotation: 0,
    schedule: defaultShowSchedule(),
    status,
    nextShowTick: -1,
    startTick,
    lastWatchers: 0,
    totals: { shows: 0, cost: 0, watchers: 0 },
    totalBuildCost: 0,
    builtTick: 0,
  };
}

const CUES: readonly ShowCue[] = [
  { at: 0, kind: 'launch' },
  { at: 4, kind: 'burst' },
  { at: 4, kind: 'sweep' },
  { at: 10, kind: 'launch' },
  { at: 30, kind: 'burst' },
];
const timeline = (): readonly ShowCue[] => CUES;
const started = (siteId: number): SimEvent => ({ type: 'show', siteId, phase: 'started', watchers: 0 });

describe('show cue tracker', () => {
  it('maps launch / burst / sweep to fw_launch / fw_burst / light_swoosh', () => {
    expect(SHOW_CUE_SFX).toEqual({ launch: 'fw_launch', burst: 'fw_burst', sweep: 'light_swoosh' });
  });

  it('a show that started this frame plays every cue up to now, then only the new ones, at the site centre', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    w.state.tick = 1_000;
    w.state.shows.push(site(5, 'fireworks_launcher', 20, 30, 996));
    const tr = createShowCueTracker(timeline);
    const centre = 30 * map.width + 20;
    expect(tr.update(w, [started(5)])).toEqual([
      { id: 'fw_launch', place: { tile: centre } },
      { id: 'fw_burst', place: { tile: centre } },
      { id: 'light_swoosh', place: { tile: centre } },
    ]);
    expect(tr.update(w, [])).toEqual([]);
    w.state.tick = 1_010;
    expect(tr.update(w, [])).toEqual([{ id: 'fw_launch', place: { tile: centre } }]);
    w.state.tick = 1_100;
    expect(tr.update(w, [])).toEqual([{ id: 'fw_burst', place: { tile: centre } }]);
  });

  it('a 2 × 2 site plays from the middle of its footprint', () => {
    const w = makeTestWorld();
    w.state.tick = 500;
    w.state.shows.push(site(7, 'lightshow_tower', 10, 12, 500));
    const tr = createShowCueTracker(timeline);
    expect(tr.update(w, [started(7)])[0]?.place).toEqual({ tile: 13 * w.state.map.width + 11 });
  });

  it('a show already running when first seen (a loaded save) skips the cues already past', () => {
    const w = makeTestWorld();
    w.state.tick = 1_005;
    w.state.shows.push(site(5, 'fireworks_launcher', 20, 30, 996));
    const tr = createShowCueTracker(timeline);
    expect(tr.update(w, [])).toEqual([]);
    w.state.tick = 1_006;
    expect(tr.update(w, []).map((r) => r.id)).toEqual(['fw_launch']);
  });

  it('a new show at the same site starts over; idle, done, and announced sites are silent', () => {
    const w = makeTestWorld();
    w.state.tick = 2_000;
    const s = site(5, 'fireworks_launcher', 20, 30, 2_000, 'announced');
    w.state.shows.push(s);
    const tr = createShowCueTracker(timeline);
    expect(tr.update(w, [])).toEqual([]);
    s.status = 'running';
    expect(tr.update(w, [started(5)]).map((r) => r.id)).toEqual(['fw_launch']);
    s.status = 'done';
    w.state.tick = 2_050;
    expect(tr.update(w, [])).toEqual([]);
    s.status = 'running';
    s.startTick = 3_000;
    w.state.tick = 3_000;
    expect(tr.update(w, [started(5)]).map((r) => r.id)).toEqual(['fw_launch']);
  });

  it('an unknown show site definition is ignored and the state is never changed', () => {
    const w = makeTestWorld();
    w.state.tick = 10;
    w.state.shows.push(site(1, 'no_such_site', 2, 2, 10));
    const before = stateHash(w);
    expect(createShowCueTracker(timeline).update(w, [started(1)])).toEqual([]);
    expect(stateHash(w)).toBe(before);
  });
});
