/** Scenery tool, themes, garden messages (Phase 4 §4.5, §7). Owner: W3-D. Exact spec text, no final period (master R4). */
import { TERRAIN_ERR } from './terrain';

/**
 * Placement and removal reasons. Spec strings (Phase 4 §4.5 rule table) plus the §4.1 block strings shared with
 * terrain (`TERRAIN_ERR`). Strings marked "not in the spec" answer bad command data or rules the spec leaves open.
 */
export const SCENERY_ERR = {
  outsidePark: TERRAIN_ERR.outsidePark,
  onlyRights: TERRAIN_ERR.onlyRights,
  inWater: 'Scenery cannot go in water',
  needsFlat: 'This item needs flat land',
  noClearance: TERRAIN_ERR.noClearance,
  notEnoughCash: TERRAIN_ERR.notEnoughCash,
  entranceInWay: TERRAIN_ERR.entranceInWay,
  pathInWay: TERRAIN_ERR.pathInWay,
  rideOrStallInWay: TERRAIN_ERR.rideOrStallInWay,
  trackInWay: TERRAIN_ERR.trackInWay,
  sceneryInWay: TERRAIN_ERR.sceneryInWay,
  /** Phase 3 research lock text (same as rides, stalls, and path items). */
  notUnlocked: 'Not unlocked',
  /** Not in the spec: an `overPath` item (arch) away from a flat ground footpath. */
  archNeedsPath: 'Arches go over a footpath',
  /** Not in the spec: bad command data. */
  unknownItem: 'Unknown scenery',
  badRotation: 'Unknown rotation',
  badEdge: 'Unknown edge',
  /** Not in the spec: `removeScenery` with an id that is not in the park. */
  nothingToRemove: 'Nothing to remove',
} as const;

/** UI text of the scenery tool (Phase 4 §7). Keys are global string ids (`en.ts`). */
export const sceneryStrings: Record<string, string> = {
  'scenery.tool': 'Scenery',
  'scenery.picker.title': 'Scenery',
  'scenery.picker.themes': 'Scenery themes',
  'scenery.picker.items': 'Items',
  'scenery.picker.close': 'Close scenery picker',
  'scenery.picker.locked': 'Research Scenery to unlock {theme}',
  'scenery.picker.lockedShort': 'Locked',
  'scenery.picker.card': '{name}, {cost}, Calm {calm}, Buzz {buzz}',
  'scenery.picker.calm': 'Calm {n}',
  'scenery.picker.buzz': 'Buzz {n}',
  'scenery.flag.light': 'Light',
  'scenery.flag.water': 'Needs water',
  'scenery.flag.slope': 'Slopes',
  'scenery.flag.edge': 'Edge',
  'scenery.flag.arch': 'Over paths',
  'scenery.flag.spooky': 'Spooky',
  'scenery.status.label': 'Scenery tool',
  'scenery.status.place': '{name} · {cost}',
  'scenery.status.pick': 'Pick an item',
  'scenery.status.remove': 'Remove scenery',
  'scenery.status.removeHint': 'Click scenery to remove it for a 50% refund',
  'scenery.status.removeHintTouch': 'Tap scenery to remove it for a 50% refund',
  'scenery.status.removeTarget': 'Remove {name} · +{refund}',
  'scenery.status.nothing': 'No scenery here',
  'scenery.status.valid': 'Ready to place',
  'scenery.status.hintMouse': 'Click places · Shift-click keeps the tool · R rotates',
  'scenery.status.hintTouch': 'Tap the map, then Confirm',
  'scenery.status.edge': 'Edge: {side}',
  'scenery.edge.0': 'north',
  'scenery.edge.1': 'east',
  'scenery.edge.2': 'south',
  'scenery.edge.3': 'west',
  'scenery.btn.rotate': 'Rotate',
  'scenery.btn.confirm': 'Confirm',
  'scenery.btn.repeat': 'Repeat',
  'scenery.btn.remove': 'Remove',
  'scenery.btn.items': 'Items',
  'scenery.btn.done': 'Done',
};
