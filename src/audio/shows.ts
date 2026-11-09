/**
 * Show sounds (Phase 6 §4.2 `fw_launch`, `fw_burst`, `light_swoosh`; §4.4). Owner: W4-A. The sounds follow the same
 * cue timeline the show renderer draws (`showTimeline`, W4-C), so picture and sound agree. Reads the state; never
 * writes it.
 *
 * Each running site keeps a cursor (ticks since its `startTick`). A site seen running with its `started` event in the
 * same frame plays every cue from tick 0; a site first seen mid-show (a loaded save, a tab coming back) starts at the
 * current tick, so old cues never play in a burst.
 */
import { getShowSiteDef, type ShowSiteDef } from '../data/catalog';
import { showTimeline, type ShowCue } from '../render/shows/timeline';
import type { ShowSite } from '../sim/shows/types';
import type { SimEvent, World } from '../sim/types';
import type { SfxId, SoundRequest } from './types';

export const SHOW_CUE_SFX: Readonly<Record<ShowCue['kind'], SfxId>> = Object.freeze({ launch: 'fw_launch', burst: 'fw_burst', sweep: 'light_swoosh' });

export type TimelineFn = (site: ShowSite, def: ShowSiteDef) => readonly ShowCue[];

export interface ShowCueTracker {
  /** Requests for the cues passed since the last call. `events` are this frame's sim events. */
  update(world: World, events: readonly SimEvent[]): SoundRequest[];
}

interface Cursor {
  startTick: number;
  /** Last elapsed tick already played. */
  done: number;
}

export function createShowCueTracker(timeline: TimelineFn = showTimeline): ShowCueTracker {
  const cursors = new Map<number, Cursor>();
  return {
    update(world, events) {
      const out: SoundRequest[] = [];
      const s = world.state;
      const startedNow = new Set<number>();
      for (const ev of events) if (ev.type === 'show' && ev.phase === 'started') startedNow.add(ev.siteId);
      const seen = new Set<number>();
      for (const site of s.shows) {
        if (site.status !== 'running' || site.startTick < 0) continue;
        const def = getShowSiteDef(site.defId);
        if (!def) continue;
        seen.add(site.id);
        const elapsed = s.tick - site.startTick;
        let c = cursors.get(site.id);
        if (!c || c.startTick !== site.startTick) {
          c = { startTick: site.startTick, done: startedNow.has(site.id) ? -1 : elapsed };
          cursors.set(site.id, c);
        }
        if (elapsed <= c.done) continue;
        const cx = Math.min(s.map.width - 1, site.x + Math.floor(def.w / 2));
        const cy = Math.min(s.map.height - 1, site.y + Math.floor(def.d / 2));
        const tile = cy * s.map.width + cx;
        for (const cue of timeline(site, def)) {
          if (cue.at > c.done && cue.at <= elapsed) out.push({ id: SHOW_CUE_SFX[cue.kind], place: { tile } });
        }
        c.done = elapsed;
      }
      for (const id of [...cursors.keys()]) if (!seen.has(id)) cursors.delete(id);
      return out;
    },
  };
}
