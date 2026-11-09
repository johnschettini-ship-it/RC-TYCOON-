/** Calm and Buzz overlays and legend (Phase 4 §4.6, §7). Owner: W3-E. Exact spec text, no final period (master R4). */
export const fieldStrings: Record<string, string> = {
  // Overlay names (Phase 4 §7: None → Calm → Buzz → Light → Temperament).
  'fields.overlay.none': 'None',
  'fields.overlay.calm': 'Calm',
  'fields.overlay.buzz': 'Buzz',
  'fields.overlay.light': 'Light',
  'fields.overlay.temperament': 'Temperament',
  // Toolbar button and chip row (touch: "Overlay button opens a chip row").
  'fields.overlays': 'Overlays',
  'fields.overlays.long': 'Map overlays',
  'fields.overlays.chips': 'Choose a map overlay',
  'fields.overlays.close': 'Close overlays',
  // Legend (Phase 4 §4.6: "A legend shows the 4 band names and thresholds").
  'fields.legend.label': '{overlay} legend',
  'fields.band.none': 'None',
  'fields.band.low': 'Low',
  'fields.band.medium': 'Medium',
  'fields.band.high': 'High',
  'fields.band.below': '< {max}',
  'fields.band.range': '{min}–{max}',
  'fields.band.atLeast': '≥ {min}',
  'fields.legend.calmHelp': 'Gardens, water, and benches calm Chill guests',
  'fields.legend.buzzHelp': 'Thrill rides excite Thrill guests',
  'fields.legend.lightHelp': 'Unlit paths upset guests at night',
  'fields.legend.temperamentHelp': 'Guest shirts show their temperament',
  'fields.light.dark': 'Dark',
  'fields.light.lit': 'Lit',
  // "Tap or hover on a tile shows the exact value".
  'fields.value': '{overlay} here: {value} ({band})',
  'fields.value.hint': 'Hover over or tap a tile to see its value',
  'fields.value.hintTouch': 'Tap a tile to see its value',
};
