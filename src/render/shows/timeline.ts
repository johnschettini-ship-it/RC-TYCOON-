/**
 * Show timeline (Phase 6 §4.4 rendering, §4.2 `fw_launch`, `fw_burst`, `light_swoosh`). Owner: W4-C. Render only,
 * never sim state. The renderer (W4-C's layer) and the audio module (W4-A) read the same cues, so sound and picture
 * agree; the cues come from a render RNG seeded by `(site.id, site.startTick)`, so a replay looks and sounds the same.
 * Neutral stub: no cues.
 */
import type { ShowSiteDef } from '../../data/catalog';
import type { ShowSite } from '../../sim/shows/types';

export interface ShowCue {
  /** Ticks after `site.startTick` (0 … `def.showTicks − 1`). */
  at: number;
  kind: 'launch' | 'burst' | 'sweep';
}

/** Every cue of the current or last show of `site`, ascending by `at`. Pure; same input → same cues. */
export function showTimeline(site: ShowSite, def: ShowSiteDef): readonly ShowCue[] {
  void site;
  void def;
  return [];
}
