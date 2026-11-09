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
};
