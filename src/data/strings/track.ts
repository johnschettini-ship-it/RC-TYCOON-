/**
 * Track strings (phase-2-coasters.md §4.6, §4.7, §4.10, §4.11). Owner: W1-G.
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
  tooHigh: 'Too high for this ride type (max {n} m)',
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
} as const;

/** String table entries (master R5): message and thought ids. */
export const trackStrings: Record<string, string> = {
  'track.testPassed': '{name}: test complete',
  'track.testFailedStop': TRACK_RATING_WARN.testFailedStop,
  'track.testFailedLoop': TRACK_RATING_WARN.testFailedLoop,
  'track.fault': 'Ride closed after a fault. Run a new test',
  airtimeAwesome: 'Floating out of my seat was awesome!',
  neverUpsideDown: 'Upside down? Never again',
};

/** Fill `{key}` placeholders. */
export function fillTrackString(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] === undefined ? `{${k}}` : String(params[k])));
}
