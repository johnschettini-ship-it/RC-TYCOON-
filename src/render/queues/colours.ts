/**
 * Queue clarity colours (spec 2026-11-18). Badge "!" #1a1a1a on #ffb020: 10.0:1. The highlight is a cyan wash that
 * differs from every queue and path colour.
 */
export const QUEUE_COLOURS = {
  highlight: '#39d0ff',
  highlightFill: 'rgba(57,208,255,0.30)',
  unlinkedFill: 'rgba(255,176,32,0.28)',
  badge: '#ffb020',
  badgeText: '#1a1a1a',
} as const;

/**
 * Path clarity colours (spec 2026-11-18 §3–4). Glows use the queue highlight cyan with a white halo so they read on
 * grass, on paths and at night; the Show me ring is gold with a dark halo; cut-off footpaths get a dark wash.
 */
export const PATH_COLOURS = {
  glow: '#39d0ff',
  glowHalo: 'rgba(255,255,255,0.9)',
  dim: 'rgba(20,24,40,0.55)',
  focus: '#ffd23f',
  focusHalo: 'rgba(20,24,40,0.85)',
} as const;
