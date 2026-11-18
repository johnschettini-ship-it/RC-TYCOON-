/** Path height control and elevated paths (Phase 4 §4.2, §7). Owner: W3-B. Exact spec text, no final period (master R4). */

/**
 * Elevated path results not given in the spec text (the shared Phase 4 path strings are `TERRAIN_ERR` in
 * `./terrain.ts`: slope, water, below the land, clearance).
 */
export const PATH_ERR = {
  /** Maximum height: ground + 20 m (Phase 4 §4.2, §8 `ELEVATED_PATH_MAX`). */
  tooHigh: 'The path cannot go higher',
  /** Bad command data from a caller (height or ramp out of range). */
  badHeight: 'Unknown path height',
  /** Step builder Undo (`undoPath`) on a path with an arch over it: the arch would go instead. */
  archInWay: 'Remove the arch over this path first',
} as const;

/** UI strings of the path mini-bar (`ui/paths`), keyed for `text()`. */
export const pathStrings: Record<string, string> = {
  'paths.bar': 'Path height',
  'paths.height': 'Height',
  'paths.ground': 'Ground',
  'paths.metres': '{n} m',
  'paths.aboveGround': '+{n} m',
  'paths.raise': 'Raise path',
  'paths.lower': 'Lower path',
  'paths.ramp': 'Ramp',
  'paths.rampFlat': 'Flat',
  'paths.rampUp': 'Up',
  'paths.rampDown': 'Down',
  'paths.err.tooHigh': PATH_ERR.tooHigh,
  'paths.err.archInWay': PATH_ERR.archInWay,
  // Step builder (touch controls spec 2026-11-18 §3).
  'paths.builder': 'Path builder',
  'paths.hint': 'Tap a tile to start',
  'paths.left': 'Turn left',
  'paths.right': 'Turn right',
  'paths.forward': 'Forward',
  'paths.forwardCost': 'Forward, {cost}',
  'paths.forwardReason': 'Forward: {reason}',
  'paths.slopeMenu': 'Height and slope',
  'paths.slopeState': 'Height and slope: {height}, {slope}',
  'paths.costTag': '{cost} · {height}',
  'paths.lineTag': '{count} tiles · {cost}',
  'paths.labelLeft': 'Left',
  'paths.labelForward': 'Forward',
  'paths.labelRight': 'Right',
  'paths.labelSlope': 'Slope',
  'paths.undo': 'Undo',
  'paths.done': 'Done',
  'paths.tipShift': 'Tip: Shift + drag draws a straight line',
  'paths.tipClose': 'Close tip',
  /** Path clarity (spec 2026-11-18 §5): shown once, the first time a ride is placed. */
  'paths.tipChain': 'Guests walk: park entrance → footpath → queue → ride. Build a queue from the glowing entrance, then a footpath to its end',
};
