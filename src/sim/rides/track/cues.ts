/**
 * Sound cues from track rides (Phase 6 §4.2, `sim/sound.ts`). Owner: W4-D.
 * - `trainDrop`: a train with riders finishes a drop of more than 10 m (`coaster_cheer`); value = the drop in metres.
 * - `splash`: a boat hits a splashdown (its start) or the pool under a rapids waterfall (its end), riders or not.
 * Both fire when the train's centre passes the point, on any track ride (Build 2 water rides included). The points are
 * derived from the circuit geometry once per layout; cues never change the state.
 */
import { TRAIN_DROP_CUE_M } from '../../../data/tuning/track';
import { TILE_M } from '../../../data/tuning/track';
import { emitSound } from '../../sound';
import type { World } from '../../types';
import type { Ride } from '../types';
import { poseAt, type CircuitLayout } from './layout';
import type { TrainState } from './types';

interface CuePoints {
  /** Circuit position (mm) of the bottom of each drop over the cue height, and its height (whole m). */
  drops: Array<{ at: number; metres: number }>;
  /** Circuit positions (mm) where a boat splashes. */
  splashes: number[];
}

const cache = new WeakMap<CircuitLayout, CuePoints>();

/** Continuous descents of more than TRAIN_DROP_CUE_M (the §4.9 drop rule: a run of falling samples). */
function dropPoints(layout: CircuitLayout): CuePoints['drops'] {
  const out: CuePoints['drops'] = [];
  let prev = NaN;
  let top = NaN;
  let prevAt = 0;
  const close = (): void => {
    if (!Number.isNaN(top)) {
      const d = top - prev;
      if (d > TRAIN_DROP_CUE_M + 1e-9) out.push({ at: prevAt, metres: Math.round(d) });
      top = NaN;
    }
  };
  layout.statics.forEach((st, pi) => {
    const z = layout.pieces[pi]?.z ?? 0;
    const sm = st.samples;
    const start = layout.startMm[pi] as number;
    for (let k = pi === 0 ? 0 : 1; k < sm.n; k++) {
      const h = z + (sm.h[k] as number);
      if (!Number.isNaN(prev)) {
        if (h < prev - 1e-9) {
          if (Number.isNaN(top)) top = prev;
        } else {
          close();
        }
      }
      prev = h;
      prevAt = start + Math.round((sm.s[k] as number) * 1000);
    }
  });
  close();
  return out;
}

export function cuePoints(layout: CircuitLayout): CuePoints {
  let c = cache.get(layout);
  if (!c) {
    const splashes: number[] = [];
    layout.statics.forEach((st, pi) => {
      if (st.def.special === 'splashdown') splashes.push(layout.startMm[pi] as number);
      if (st.def.special === 'waterfall') splashes.push(layout.startMm[pi + 1] as number);
    });
    c = { drops: dropPoints(layout), splashes };
    cache.set(layout, c);
  }
  return c;
}

/** The point `at` (mm) was passed by a centre that moved `moved` mm forward from `from`. */
function passed(layout: CircuitLayout, from: number, moved: number, at: number): boolean {
  if (moved <= 0) return false;
  const L = layout.lengthMm;
  let d = (at - from) % L;
  if (d < 0) d += L;
  if (d === 0) d = L;
  return d <= moved;
}

function tileAt(world: World, layout: CircuitLayout, at: number): number {
  const p = poseAt(layout, at);
  const map = world.state.map;
  const x = Math.floor(p.x / TILE_M);
  const y = Math.floor(p.y / TILE_M);
  return x >= 0 && y >= 0 && x < map.width && y < map.height ? y * map.width + x : -1;
}

/** Emit the cues a train passed this tick: it moved `moved` mm from centre position `from`. */
export function emitTrackCues(world: World, ride: Ride, layout: CircuitLayout, t: TrainState, from: number, moved: number): void {
  if (moved <= 0 || layout.lengthMm <= 0) return;
  const c = cuePoints(layout);
  if (c.drops.length > 0 && t.seats.some((g) => g >= 0)) {
    for (const d of c.drops) if (passed(layout, from, moved, d.at)) emitSound(world, 'trainDrop', tileAt(world, layout, d.at), ride.id, d.metres);
  }
  for (const at of c.splashes) if (passed(layout, from, moved, at)) emitSound(world, 'splash', tileAt(world, layout, at), ride.id);
}
