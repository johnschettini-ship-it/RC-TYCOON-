/**
 * Player-facing strings of Phase 4 §4.1–4.3 checks (exact spec text, no final period, master R4). Owner: W3-A.
 * Shared: scenery (W3-D) and water rides (W3-C) use the same block strings for the same objects.
 */
export const TERRAIN_ERR = {
  outsidePark: 'Outside the park',
  onlyRights: 'You only have construction rights here',
  entranceInWay: 'The park entrance is in the way',
  pathInWay: 'A path is in the way',
  rideOrStallInWay: 'A ride or stall is in the way',
  trackInWay: 'A track is in the way',
  sceneryInWay: 'Scenery is in the way',
  noClearance: 'Not enough clearance under an object',
  tooHigh: 'The land cannot go higher',
  tooLow: 'The land cannot go lower',
  notEnoughCash: 'Not enough cash',
  /** `{n}` tiles skipped by a brush tool, with the first reason. */
  skipped: '{n} tiles were skipped: {reason}',
  waterTooHigh: 'The water cannot go higher',
  noWater: 'There is no water here',
  /** Paths (W3-B). */
  pathSlope: 'Paths need flat land or an even slope',
  pathInWater: 'Paths cannot go in water',
  pathBelowLand: 'The path is below the land',
  /** Rides and stalls (W3-B in place.ts). */
  landNotFlat: 'The land must be flat here',
  /** Track (W3-C). */
  trackBelowLand: 'The track is below the land',
} as const;
