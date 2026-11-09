/**
 * FROZEN: the schema 1 (Build 1, commit 33ac3b5) structure check, used only by the 1 → 2 migration
 * (Phase 4 §5.1 step 1). Never edit this file: Build 1 saves exist in the wild and must keep loading.
 * Shapes are untyped on purpose (`objLoose`), so changes to the live state types never change this check.
 */
import {
  arr,
  bool,
  checkStateWith,
  exactRecord,
  int,
  layer,
  literal,
  makeMapCheck,
  nullable,
  num,
  objLoose,
  oneOf,
  optional,
  record,
  str,
  tile,
  tileOrNone,
  typed,
  when,
  type Check,
} from '../validate';

const LEDGER_CATEGORIES_V1 = [
  'construction',
  'demolitionRefunds',
  'rideRunning',
  'stallRunning',
  'stock',
  'entranceTickets',
  'rideTickets',
  'stallSales',
  'wages',
  'staffHiring',
  'research',
  'marketing',
  'loanInterest',
  'loan',
  'repairs',
  'landPurchase',
  'shows',
] as const;

// ---- Enumerations (Build 1 members, frozen) ----

const DIRS = [0, 1, 2, 3] as const;
const RIDE_STATUSES = ['building', 'testing', 'closed', 'open', 'broken', 'inspecting', 'stormHold'] as const;
const CYCLE_PHASES = ['waiting', 'loading', 'running', 'unloading'] as const;
const GUEST_STATES = ['arriving', 'walking', 'queueing', 'riding', 'buying', 'sitting', 'leaving'] as const;
const TRAIN_STATES = ['loading', 'running', 'held', 'unloading', 'waiting'] as const;
const TRACK_DIRS = [0, 1, 2, 3] as const;
const TEST_FAIL_KINDS = ['stop', 'loop'] as const;
const STAFF_TYPES = ['groundskeeper', 'mechanic', 'security', 'performer'] as const;
const STAFF_STATES = ['walking', 'sweeping', 'cleaning', 'emptying', 'inspecting', 'fixing', 'performing'] as const;
const STAFF_TASKS = ['none', 'wander', 'toPatrol', 'sweep', 'mess', 'bin', 'fix', 'inspect', 'roam', 'perform'] as const;
const COSTUMES = ['frost', 'spark', 'boo'] as const;
const RESEARCH_LEVELS = ['none', 'low', 'medium', 'high'] as const;
const RESEARCH_CATEGORIES = ['gentle', 'thrill', 'coasters', 'shops', 'water', 'scenery'] as const;
const MESSAGE_CATEGORIES = ['breakdown', 'research', 'weather', 'finance', 'staff', 'marketing', 'park'] as const;
const WEATHER_KEYS = ['sunny', 'cloudy', 'rain', 'storm', 'hot', 'cold'] as const;

const dir = oneOf(DIRS);
const rideStatus = oneOf(RIDE_STATUSES);
const weather = oneOf(WEATHER_KEYS);

const DEST_RE = /^(?:(?:ride|stall):(?:0|[1-9]\d*)|exit)$/;
const destKey: Check = when((v) => typeof v === 'string' && DEST_RE.test(v));

const params = optional(record<string | number>(when((v) => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))));

// ---- Map ----

/** Build 1 content codes: Empty 0, Footpath 1, Queue 2, Building 3, Track 4, ParkEntrance 5, Scenery 6. */
const CONTENT_CODES_V1: ReadonlySet<number> = new Set([0, 1, 2, 3, 4, 5, 6]);

const mapShape = objLoose({
  width: int,
  height: int,
  terrain: layer('Uint8Array'),
  heights: layer('Uint8Array'),
  slope: layer('Uint8Array'),
  water: layer('Uint8Array'),
  content: layer('Uint8Array'),
  contentRef: layer('Int32Array'),
  owned: layer('Uint8Array'),
  pathItem: layer('Uint8Array'),
  pathItemFlags: layer('Uint8Array'),
  binFill: layer('Uint8Array'),
  litter: layer('Uint8Array'),
  mess: layer('Uint8Array'),
  entranceTile: tile,
});

const mapCheckV1 = makeMapCheck(mapShape, CONTENT_CODES_V1);

// ---- Slices ----

const parkShape = objLoose({
  name: str,
  cash: int,
  entranceFee: int,
  open: bool,
  rating: num,
  turnedAway: int,
  recentLeavers: arr(num),
  arrivalCarry: num,
  guestsArrivedTotal: int,
});

const modifiersShape = objLoose({
  arrivals: num,
  priceTolerance: num,
  happinessDecay: num,
  researchSpeed: num,
  breakdownChance: num,
  loanInterest: num,
  ratingBonus: num,
});

const gate = objLoose({ gate: tile, outside: tileOrNone });

const rideShape = objLoose({
  id: int,
  kind: oneOf(['flat', 'track'] as const),
  defId: str,
  name: str,
  x: int,
  y: int,
  rotation: dir,
  status: rideStatus,
  price: int,
  entrance: nullable(gate),
  exit: nullable(gate),
  stats: nullable(objLoose({ excitement: num, intensity: num, nausea: num })),
  queue: arr(int),
  riders: arr(int),
  cycle: objLoose({ phase: oneOf(CYCLE_PHASES), ticks: int }),
  totals: objLoose({ riders: int, income: int, ridersThisMonth: int, incomeThisMonth: int }),
  builtTick: int,
  hoursThisMonth: int,
  reliability: num,
  lastInspectionTick: int,
  inspectionIntervalTicks: int,
  breakdownType: nullable(str),
  statusBeforeBreakdown: nullable(rideStatus),
  breakdownsThisMonth: int,
  lastBreakdownTick: int,
  assignedMechanicId: nullable(int),
  totalBuildCost: int,
});

const stallShape = objLoose({
  id: int,
  defId: str,
  name: str,
  x: int,
  y: int,
  rotation: dir,
  serviceTile: tileOrNone,
  price: int,
  open: bool,
  servingGuest: int,
  totals: objLoose({ sales: int, income: int, salesThisMonth: int, incomeThisMonth: int }),
  builtTick: int,
  hoursThisMonth: int,
  totalBuildCost: int,
});

const guestShape = objLoose({
  id: int,
  tile: tileOrNone,
  nextTile: tileOrNone,
  progress: num,
  dir,
  lane: int,
  state: oneOf(GUEST_STATES),
  stateTicks: int,
  target: nullable(destKey),
  cash: int,
  needs: objLoose({ hunger: num, thirst: num, bladder: num, energy: num, happiness: num, nausea: num }),
  temperament: num,
  thoughts: arr(objLoose({ id: str, tick: int, params })),
  thoughtCooldowns: record(int),
  ridden: record(int),
  spent: int,
  items: objLoose({ map: bool, umbrella: bool, balloon: bool }),
  nextDecisionTick: int,
  lostSinceTick: int,
  noRideStreak: int,
  seat: nullable(objLoose({ rideId: int, trainId: int, car: int, seat: int })),
  activityId: int,
  trashTimer: int,
  withdrawals: int,
  lostSteps: int,
  bestDistance: int,
  lostTarget: nullable(destKey),
});

const economyShape = objLoose({
  ledger: arr(objLoose({ monthIndex: int, lines: exactRecord(LEDGER_CATEGORIES_V1, int) })),
});

// Track rides (Phase 2 §5). Positions and speeds are integer mm and mm/s; G values and ratings integer hundredths.
const trackPieceShape = objLoose({
  defId: str,
  x: int,
  y: int,
  z: int,
  dir: oneOf(TRACK_DIRS),
  chain: bool,
  brakeSpeed: nullable(int),
  cost: int,
});

const trainShape = objLoose({
  id: int,
  s: int,
  v: int,
  state: oneOf(TRAIN_STATES),
  dwellTicks: int,
  lap: int,
  seats: arr(int),
  dist: int,
  parked: bool,
  release: bool,
  driveMms: int,
  lapStartTick: int,
});

const testResultShape = objLoose({
  passed: bool,
  failPiece: nullable(int),
  failKind: nullable(oneOf(TEST_FAIL_KINDS)),
  ticks: int,
  vMaxMms: int,
  vAvgMms: int,
  rideTimeTicks: int,
  lengthMm: int,
  drops: int,
  dropMaxMm: int,
  posGMax: int,
  vertGMin: int,
  airtimeTicks: int,
  latMax: int,
  inversions: int,
  highestM: int,
  turnPieces: int,
  smallTurns: int,
  spookyTunnels: int,
  laps: int,
  excitement: int,
  intensity: int,
  nausea: int,
  penalty: bool,
  chart: objLoose({ every: int, speedCms: arr(int), gv: arr(int), gl: arr(int) }),
});

const trackRideShape = objLoose({
  rideId: int,
  typeId: str,
  pieces: arr(trackPieceShape),
  circuitClosed: bool,
  trainConfig: objLoose({ trains: int, carsPerTrain: int }),
  operation: objLoose({ minDwellTicks: int, maxDwellTicks: int, laps: int }),
  trains: arr(trainShape),
  test: nullable(testResultShape),
  colours: objLoose({ track: int, supports: int, cars: int }),
  openedOnce: bool,
  testRun: nullable(objLoose({ ticksLeft: int, result: testResultShape })),
  lastDispatchTick: int,
  bestLapTicks: nullable(int),
});

const trackShape = objLoose({ rides: record(trackRideShape) });

const staffShape = objLoose({
  members: arr(
    objLoose({
      id: int,
      type: oneOf(STAFF_TYPES),
      name: str,
      tile: tileOrNone,
      nextTile: tileOrNone,
      progress: num,
      dir,
      state: oneOf(STAFF_STATES),
      stateTicks: int,
      targetTile: tileOrNone,
      targetRideId: int,
      patrol: nullable(typed('Uint8Array')),
      costume: nullable(oneOf(COSTUMES)),
      hiredTick: int,
      hoursThisMonth: int,
      task: oneOf(STAFF_TASKS),
      route: arr(int),
      prevTile: tileOrNone,
      nextRecheckTick: int,
      fixRideId: int,
      savedRideStatus: nullable(rideStatus),
      walkTicksLeft: int,
    }),
  ),
  pendingBreakdowns: arr(int),
  autoRepair: bool,
  benchSitters: arr(objLoose({ guestId: int, tile: tileOrNone, untilTick: int })),
  recentFixes: arr(objLoose({ rideId: int, tick: int })),
  repairNoticeDay: int,
});

const managementShape = objLoose({
  research: objLoose({
    level: oneOf(RESEARCH_LEVELS),
    focus: exactRecord(RESEARCH_CATEGORIES, bool),
    current: nullable(str),
    progress: num,
    unlocked: arr(str),
    hoursThisMonth: int,
    completeNotified: bool,
  }),
  campaigns: arr(objLoose({ type: str, targetId: int, endTick: int })),
  loan: objLoose({ balance: int }),
  weather: objLoose({ current: weather, next: weather, nextChangeTick: int }),
  parkValue: int,
  messages: arr(
    objLoose({
      id: int,
      tick: int,
      category: oneOf(MESSAGE_CATEGORIES),
      textId: str,
      params,
      tile: tileOrNone,
      entityId: int,
    }),
  ),
  nextMessageId: int,
  messagesReadUpTo: int,
});

const gameStateShapeV1 = objLoose({
  schemaVersion: literal(1),
  seed: int,
  rng: int,
  tick: int,
  nextId: int,
  map: mapCheckV1,
  park: parkShape,
  modifiers: modifiersShape,
  rides: arr(rideShape),
  stalls: arr(stallShape),
  guests: arr(guestShape),
  economy: economyShape,
  track: trackShape,
  staff: staffShape,
  management: managementShape,
});

/**
 * Step 1 of the 1 → 2 migration (Phase 4 §5.1): null when `raw` has the full schema 1 (Build 1) structure,
 * else a short reason. Reference integrity is checked on the migrated state by the live checks.
 */
export function checkStructureV1(raw: unknown): string | null {
  return checkStateWith(raw, mapCheckV1, gameStateShapeV1);
}
