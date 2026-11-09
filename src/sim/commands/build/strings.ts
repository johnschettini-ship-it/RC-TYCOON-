/** Build command results (Phase 1 §4.1 exact strings; master R4: no final period). Owner: W1-C. */
export const BUILD_STRINGS = {
  notEnoughCash: 'Not enough cash',
  inTheWay: 'Something is in the way',
  notOwned: 'You do not own this land',
  cannotRemoveEntrance: 'You cannot remove the park entrance',
  entranceNeedsQueue: 'The entrance needs a queue path',
  exitNeedsFootpath: 'The exit needs a footpath',
  stallNeedsFootpath: 'This stall must face a footpath',
  /** Not in the spec text: demolish on a tile with nothing to remove. */
  nothingToRemove: 'Nothing to remove',
  /** Phase 3 research lock (same text as `buildPathItem`, Phase 3 §6). */
  notUnlocked: 'Not unlocked',
  /** Not in the spec text: bad command data from a caller. */
  unknownRide: 'Unknown ride',
  unknownStall: 'Unknown stall',
  badRotation: 'Unknown rotation',
} as const;
