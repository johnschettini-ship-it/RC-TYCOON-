/**
 * Queue clarity colours (spec 2026-11-18: contrast ≥ 4.5:1 on the sign). Sign text #ffffff on #14213d: 15.6:1.
 * Badge "!" #1a1a1a on #ffb020: 10.0:1. The highlight is a cyan wash that differs from every queue and path colour.
 */
export const QUEUE_COLOURS = {
  sign: '#14213d',
  signText: '#ffffff',
  signEdge: 'rgba(255,255,255,0.55)',
  signPost: '#14213d',
  highlight: '#39d0ff',
  highlightFill: 'rgba(57,208,255,0.30)',
  unlinkedFill: 'rgba(255,176,32,0.28)',
  badge: '#ffb020',
  badgeText: '#1a1a1a',
} as const;
