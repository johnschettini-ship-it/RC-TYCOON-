/**
 * Show timeline (Phase 6 §4.4 rendering, §4.2 `fw_launch`, `fw_burst`, `light_swoosh`). Owner: W4-C. Render only,
 * never sim state. The renderer (`./layer.ts`, `./fx.ts`) and the audio module (W4-A) read the same plan, so sound
 * and picture agree; the plan comes from a render RNG seeded by `(site.id, site.startTick)`, so a replay looks and
 * sounds the same. Times are ticks after `site.startTick` (0 … `def.showTicks − 1`).
 *
 * - Lightshow: one `sweep` cue every `SWEEP_TICKS` (the beams turn round at 30° per second and change colour).
 * - Fireworks: rockets every 14–30 ticks (a pair 30% of the time), a faster finale, each a `launch` cue and a `burst`
 *   cue `flight` ticks later; bursts of 40–80 particles that fade out before the show ends. Bursts never put more than
 *   `MAX_FIREWORK_PARTICLES` particles in the sky at once (a burst that would is left out).
 */
import type { ShowSiteDef } from '../../data/catalog';
import {
  FIREWORK_BURST_MAX,
  FIREWORK_BURST_MIN,
  LIGHTSHOW_SWEEP_DEG_PER_S,
  MAX_FIREWORK_PARTICLES,
} from '../../data/tuning/shows';
import { TICKS_PER_SECOND } from '../../data/tuning/core';
import type { ShowSite } from '../../sim/shows/types';
import { renderRng, rint, rnext, rrange, showSeed } from './rng';

export interface ShowCue {
  /** Ticks after `site.startTick` (0 … `def.showTicks − 1`). */
  at: number;
  kind: 'launch' | 'burst' | 'sweep';
}

/** Half a sweep: the beams turn 60° (−30° → +30°) at 30° per second. */
export const SWEEP_DEG = 60;
export const SWEEP_TICKS = Math.round((SWEEP_DEG / LIGHTSHOW_SWEEP_DEG_PER_S) * TICKS_PER_SECOND);

/** Fireworks finale: the last ticks before the closing gap launch faster. */
export const FINALE_TICKS = 110;
/** Rocket flight and burst life (ticks). */
export const FLIGHT_MIN = 18;
export const FLIGHT_MAX = 24;
export const LIFE_MIN = 36;
export const LIFE_MAX = 50;

export interface Rocket {
  launchAt: number;
  burstAt: number;
  /** Burst point offset from the launcher mouth, world px (screen x; up is negative y). */
  dx: number;
  rise: number;
  /** Particles in the burst (40–80). */
  count: number;
  /** Ticks the burst particles live. */
  life: number;
  /** Particle launch speed, world px per tick. */
  speed: number;
  /** Palette indices (taken modulo the palette length). */
  colour: number;
  colour2: number;
  /** Per-burst particle seed. */
  seed: number;
}

export interface ShowPlan {
  siteId: number;
  startTick: number;
  defId: string;
  length: number;
  cues: readonly ShowCue[];
  /** Fireworks only. Ascending `launchAt`. */
  rockets: readonly Rocket[];
  /** Lightshow only: palette start index and step per sweep. */
  colourStart: number;
  colourStep: number;
}

function planLightshow(plan: ShowPlan, seed: number): void {
  const r = renderRng(seed);
  plan.colourStart = rint(r, 0, 7);
  plan.colourStep = rint(r, 1, 3);
  const cues: ShowCue[] = [];
  for (let at = 0; at < plan.length; at += SWEEP_TICKS) cues.push({ at, kind: 'sweep' });
  plan.cues = cues;
}

/** Particles alive at tick `t` from the rockets so far. */
function aliveAt(rockets: readonly Rocket[], t0: number, t1: number): number {
  let n = 0;
  for (const k of rockets) if (k.burstAt < t1 && t0 < k.burstAt + k.life) n += k.count;
  return n;
}

function planFireworks(plan: ShowPlan, seed: number): void {
  const r = renderRng(seed);
  const L = plan.length;
  const rockets: Rocket[] = [];
  let t = rint(r, 4, 10);
  for (;;) {
    const finale = t >= L - FINALE_TICKS - LIFE_MAX;
    const flight = rint(r, FLIGHT_MIN, FLIGHT_MAX);
    const life = rint(r, LIFE_MIN, LIFE_MAX);
    if (t + 2 + flight + life > L - 1) break;
    const pair = rnext(r) < (finale ? 0.55 : 0.3);
    for (let k = 0; k < (pair ? 2 : 1); k++) {
      const launchAt = t + k * 2;
      const burstAt = launchAt + flight;
      let count = rint(r, FIREWORK_BURST_MIN, FIREWORK_BURST_MAX);
      const rocket: Rocket = {
        launchAt,
        burstAt,
        dx: Math.round(rrange(r, -70, 70)),
        rise: Math.round(rrange(r, 130, 220)),
        count,
        life,
        speed: rrange(r, 1.4, 2.4),
        colour: rint(r, 0, 7),
        colour2: rint(r, 0, 7),
        seed: (rnext(r) * 4294967296) >>> 0,
      };
      // Keep the sky under the particle cap: trim the burst, or leave it out below the minimum size.
      const room = MAX_FIREWORK_PARTICLES - aliveAt(rockets, burstAt, burstAt + life);
      if (room < FIREWORK_BURST_MIN) continue;
      if (count > room) count = room;
      rocket.count = count;
      rockets.push(rocket);
    }
    t += finale ? rint(r, 4, 8) : rint(r, 14, 30);
  }
  const cues: ShowCue[] = [];
  for (const k of rockets) {
    cues.push({ at: k.launchAt, kind: 'launch' });
    cues.push({ at: k.burstAt, kind: 'burst' });
  }
  // Stable sort: ties keep launch-before-burst order of the rockets.
  cues.sort((a, b) => a.at - b.at);
  plan.cues = cues;
  plan.rockets = rockets;
}

/** The plan of the current or last show of `site` (pure; no show yet → an empty plan). */
export function buildShowPlan(site: Pick<ShowSite, 'id' | 'startTick' | 'defId'>, def: ShowSiteDef): ShowPlan {
  const plan: ShowPlan = { siteId: site.id, startTick: site.startTick, defId: def.id, length: def.showTicks, cues: [], rockets: [], colourStart: 0, colourStep: 1 };
  if (site.startTick < 0) return plan;
  const seed = showSeed(site.id, site.startTick);
  if (def.id === 'fireworks_launcher') planFireworks(plan, seed);
  else planLightshow(plan, seed);
  return plan;
}

/** A few recent plans (one per running site), so the frame loop and the audio do not rebuild them. */
const recent: ShowPlan[] = [];
const RECENT_MAX = 16;

/** Memoized `buildShowPlan`. */
export function showPlan(site: Pick<ShowSite, 'id' | 'startTick' | 'defId'>, def: ShowSiteDef): ShowPlan {
  for (const p of recent) if (p.siteId === site.id && p.startTick === site.startTick && p.defId === def.id) return p;
  const p = buildShowPlan(site, def);
  recent.unshift(p);
  if (recent.length > RECENT_MAX) recent.length = RECENT_MAX;
  return p;
}

/** Every cue of the current or last show of `site`, ascending by `at`. Pure; same input → same cues. */
export function showTimeline(site: ShowSite, def: ShowSiteDef): readonly ShowCue[] {
  return showPlan(site, def).cues;
}
