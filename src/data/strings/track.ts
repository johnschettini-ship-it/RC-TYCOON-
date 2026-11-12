/**
 * Track strings (phase-2-coasters.md §4.6, §4.7, §4.10). Owner: W1-G.
 * Master R4: no final period. `{n}` and `{name}` are filled in by `fillTrackString`.
 */

/** Command reasons (exact §4.6 strings). */
export const TRACK_ERR = {
  notEnoughCash: 'Not enough cash',
  outsidePark: 'Outside the park',
  mustStartWithStation: 'Track must start with a station',
  stationOnGround: 'Station must be on the ground',
  doesNotFit: 'Piece does not fit the track end',
  typeCannotUse: 'This ride type cannot use this piece',
  hitsPath: 'Track hits a path',
  hitsBuilding: 'Track hits a ride or building',
  hitsOwnTrack: 'Track hits its own track',
  hitsOtherTrack: 'Track hits another track',
  belowGround: 'Track cannot go below ground',
  tooHigh: 'Climbs too high for this ride type (max {n} m above the station)',
  noSupports: 'Too many tiles without supports',
  tooLong: 'Track is too long (max 300 pieces)',
  gateBesideStation: 'Gate must be beside the station',
  tileNotEmpty: 'Tile is not empty',
  circuitNotComplete: 'Circuit is not complete',
  needGates: 'Place an entrance and an exit',
  runTestFirst: 'Run a test first',
  stationTooShort: 'Station is too short for this train. Needs {n} tiles',
  tooManyTrains: 'Too many trains for the block brakes. Add a block brake or remove a train',
  closeFirst: 'Close the ride first',
  mustBeEmpty: 'Ride must be empty to edit the track',
  waitForTest: 'Wait for the test to finish',
  // Cases the §4.6 table does not cover.
  noRide: 'Ride not found',
  unknownType: 'Unknown ride type',
  notResearched: 'This ride type is not available yet',
  unknownPiece: 'Unknown track piece',
  circuitAlreadyComplete: 'The circuit is already complete',
  firstStation: 'The first station piece cannot be removed',
  noSuchPiece: 'No such track piece',
  brakeSpeedRange: 'Brake speed must be 2 to 20 m/s',
  carsRange: 'This ride type takes {min} to {max} cars per train',
  trainsRange: 'This ride type takes 1 to {n} trains',
  operationRange: 'Value out of range',
  colourRange: 'Unknown colour',
  // Phase 6 (W4-D): the Monorail takes up to 4 stations (master R26: the extra ones are stops).
  tooManyStations: 'This ride takes at most {n} stations',
  // R7 (owner 2026-11-12): a passed test whose strongest car passed a hard safety limit (open refusal and warning).
  unsafePosG: 'Too strong for riders: {g} G on piece {n} (limit {limit} G)',
  unsafeNegG: 'Lifts riders too hard: {g} G on piece {n} (limit {limit} G)',
  unsafeLat: 'Too hard sideways: {g} G on piece {n} (limit {limit} G)',
  // R7 (Task 5): a piece whose projected section passes a hard safety limit cannot be built. `{g}` and `{limit}` have
  // two decimals (`formatSafetyG`), so a refusal never reads as equal to the limit.
  pieceUnsafePosG: 'Over the safety limit: {g} G (max {limit} G)',
  pieceUnsafeNegG: 'Over the safety limit: {g} G (min {limit} G)',
  pieceUnsafeLat: 'Over the safety limit: {g} G sideways (max {limit} G)',
} as const;

/** Command warnings (Phase 1 §4.1 strings, reused for track gates). */
export const TRACK_WARN = {
  entranceNeedsQueue: 'The entrance needs a queue path',
  exitNeedsFootpath: 'The exit needs a footpath',
  circuitComplete: 'Circuit complete!',
} as const;

/** Ride panel and test toast warnings (§4.10). */
export const TRACK_RATING_WARN = {
  veryIntense: 'Very intense: most guests will not ride',
  nauseating: 'Guests may feel sick after this ride',
  dull: 'This ride is dull',
  penalty: 'G-forces are too strong. Guests enjoy this ride less',
  testFailedStop: 'Test failed: train stops on piece {n} ({name})',
  testFailedLoop: 'Test failed: train is too slow for the loop on piece {n}',
  // Phase 6 §4.5 (W4-D): a corkscrew needs an entry speed of at least 10 m/s.
  testFailedCorkscrew: 'Test failed: train is too slow for the corkscrew on piece {n}',
} as const;

/**
 * String table entries (master R5): message ids. The §4.11 thoughts (`airtimeAwesome`, `neverUpsideDown`) live with
 * every other guest thought in `guests.ts` (`THOUGHT` ids).
 */
export const trackStrings: Record<string, string> = {
  'track.testPassed': '{name}: test complete',
  'track.testFailedStop': TRACK_RATING_WARN.testFailedStop,
  'track.testFailedLoop': TRACK_RATING_WARN.testFailedLoop,
  'track.testFailedCorkscrew': TRACK_RATING_WARN.testFailedCorkscrew,
  'track.fault': 'Ride closed after a fault. Run a new test',
  // R7: a passed test whose strongest car passed a hard limit. The same texts as the Open refusals, with their own
  // parameters (`{g}`, `{n}`, `{limit}`), so the message line is translated as a whole.
  'track.testUnsafePosG': `Test: ${TRACK_ERR.unsafePosG}`,
  'track.testUnsafeNegG': `Test: ${TRACK_ERR.unsafeNegG}`,
  'track.testUnsafeLat': `Test: ${TRACK_ERR.unsafeLat}`,
};

/** Fill `{key}` placeholders. */
export function fillTrackString(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] === undefined ? `{${k}}` : String(params[k])));
}
