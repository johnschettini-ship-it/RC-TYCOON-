/**
 * Owner: W1-H. Staff, litter, vandalism, and breakdown strings (master R4: no final period; R5: ids).
 * Thought ids start with `thought.`, message ids with `msg.`.
 */

/** Guest thought ids (Phase 3 §4.16, the ones this workstream raises). */
export const STAFF_THOUGHTS = Object.freeze({
  pathFilthy: 'thought.pathFilthy',
  cleanPark: 'thought.cleanPark',
  brokenBench: 'thought.brokenBench',
  brokenBin: 'thought.brokenBin',
  brokenLamp: 'thought.brokenLamp',
  rideBrokeDown: 'thought.rideBrokeDown',
  stuck: 'thought.stuck',
  feelAwful: 'thought.feelAwful',
  performerFun: 'thought.performerFun',
  frostCute: 'thought.frostCute',
  sparkAwesome: 'thought.sparkAwesome',
});

/** Message-log ids (Phase 3 §4.14). */
export const STAFF_MESSAGES = Object.freeze({
  breakdown: 'msg.breakdown',
  noMechanic: 'msg.noMechanic',
  repairNoCash: 'msg.repairNoCash',
});

/** Command failure reasons (Phase 3 §6). Commands return these exact texts. */
export const STAFF_ERRORS = Object.freeze({
  notEnoughCash: 'Not enough cash',
  staffLimit: 'Staff limit reached',
  staffNotFound: 'Staff member not found',
  outsidePark: 'Tile is outside the park',
  onlyPerformers: 'Only Performers wear costumes',
  rideNotFound: 'Ride not found',
  needsFootpath: 'Needs a footpath',
  tileHasItem: 'Tile already has an item',
  notUnlocked: 'Not unlocked',
  noItem: 'No item here',
  notBroken: 'Item is not broken',
  nothingToRepair: 'Nothing to repair',
});

export const staffStrings: Record<string, string> = {
  // Thoughts
  'thought.pathFilthy': 'This path is filthy',
  'thought.cleanPark': 'Nice clean park!',
  'thought.brokenBench': 'Someone broke that bench',
  'thought.brokenBin': 'Someone broke that bin',
  'thought.brokenLamp': 'Someone broke that lamp',
  'thought.rideBrokeDown': 'The ride broke down. Typical!',
  'thought.stuck': 'We are stuck!',
  'thought.feelAwful': 'I feel awful',
  'thought.performerFun': 'That performer is fun!',
  'thought.frostCute': 'Frost is so cute!',
  'thought.sparkAwesome': 'Spark is awesome!',
  // Messages
  'msg.breakdown': '{ride} has broken down',
  'msg.noMechanic': 'No mechanic is available',
  'msg.repairNoCash': 'Not enough cash to repair broken path items',
  // Staff panel
  'staff.patrolNotConnected': 'Patrol area is not connected',
  'staff.status.walking': 'Walking',
  'staff.status.sweeping': 'Sweeping litter',
  'staff.status.cleaning': 'Cleaning up a mess',
  'staff.status.emptying': 'Emptying a bin',
  'staff.status.inspecting': 'Inspecting {ride}',
  'staff.status.fixing': 'Fixing {ride}',
  'staff.status.goingToFix': 'Heading to fix {ride}',
  'staff.status.performing': 'Performing',
  // Breakdown types (ride panel)
  'breakdown.stopped': 'Stopped',
  'breakdown.train_stalled': 'Train stalled',
  'breakdown.gate_stuck': 'Gate stuck',
  'breakdown.slow_running': 'Running slowly',
  // Costumes
  'costume.frost': 'Frost',
  'costume.spark': 'Spark',
  'costume.boo': 'Boo',
};
