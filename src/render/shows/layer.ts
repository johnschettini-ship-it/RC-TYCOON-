/**
 * Show site rendering (Phase 6 §4.4 "Rendering (render only, not sim)"). Owner: W4-C. Neutral stub: draws nothing.
 *
 * Contract: show site sprites as depth-sorted slices (`LAYER_KIND.showSite`, 4 view rotations); in
 * `drawAfterObjects` (after the After Dark light pass) the Lightshow (6 beams from the tower top, `lighter`, theme
 * palette colours, 30° per second sweep) and Fireworks (rockets, bursts of 40–80 particles with gravity and fade,
 * at most 600 particles, render RNG seeded by `(site.id, site.startTick)` so replays look the same); reduced motion
 * (`displayPrefs().reducedMotion`): still, slowly pulsing beams and soft glow circles instead of bursts; the
 * placement ghost (`tool.ghost.kind === 'showSite'`) in `drawOverlay`.
 */
import { LAYER_KIND, type WorldLayer } from '../layers';

export function createShowLayer(): WorldLayer {
  return { name: 'shows', kinds: [LAYER_KIND.showSite] };
}
