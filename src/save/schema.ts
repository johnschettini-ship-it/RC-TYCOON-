/**
 * Structural check of a loaded schema 3 GameState: every field present with the right type, no unknown fields,
 * map layers of the right kind and size, tile indices inside the map. Owner: integrator.
 *
 * Each validator carries its value type, and `obj<T>` needs a validator for every key of T, so adding or
 * changing a field in a state type without updating its validator is a compile error.
 * Build 2 and Build 3 slices have their validators in `slices/*.ts`, owned by the card that owns the slice.
 * The frozen checks for the migrations are `v1/schema.ts` (1 → 2) and `v2/schema.ts` (2 → 3).
 */
import { Content, type Dir, type MapState } from '../sim/map';
import type { GameState } from '../sim/types';
import type { Modifiers, ParkState } from '../sim/park/types';
import type { DestKey, Guest, GuestItems, GuestStateName, Needs, Thought } from '../sim/guests/types';
import type { FlatCyclePhase, Gate, Ride, RideStats, RideStatus } from '../sim/rides/types';
import type { Stall } from '../sim/stalls/types';
import { LEDGER_CATEGORIES, type EconomyState, type LedgerMonth } from '../sim/economy/types';
import type { BenchSitter, Staff, StaffSlice, StaffStateName, StaffTask } from '../sim/staff/types';
import type { ManagementSlice, Message, MessageCategory, ResearchLevel } from '../sim/management/types';
import type { Costume, ResearchCategory, StaffType, WeatherKey } from '../data/catalog/types';
import {
  arr,
  bool,
  byte,
  checkStateWith,
  every,
  exactRecord,
  int,
  layer,
  literal,
  makeMapCheck,
  nullable,
  num,
  obj,
  oneOf,
  optional,
  record,
  str,
  tile,
  tileOrNone,
  typed,
  when,
  type V,
} from './validate';
import { trackShape } from './slices/track';
import { elevatedPathsShape } from './slices/elevatedPaths';
import { sceneryListShape } from './slices/scenery';
import { monthMetricsShape, scenarioShape } from './slices/scenario';
import { showsShape } from './slices/shows';

export { isRecord, MAX_TILES } from './validate';

// ---- Enumerations (each list must name every member) ----

const DIRS = every<Dir>()([0, 1, 2, 3]);
const RIDE_STATUSES = every<RideStatus>()(['building', 'testing', 'closed', 'open', 'broken', 'inspecting', 'stormHold']);
const CYCLE_PHASES = every<FlatCyclePhase>()(['waiting', 'loading', 'running', 'unloading']);
const GUEST_STATES = every<GuestStateName>()(['arriving', 'walking', 'queueing', 'riding', 'buying', 'sitting', 'leaving', 'watchingShow']);
const STAFF_TYPES = every<StaffType>()(['groundskeeper', 'mechanic', 'security', 'performer']);
const STAFF_STATES = every<StaffStateName>()(['walking', 'sweeping', 'cleaning', 'emptying', 'inspecting', 'fixing', 'performing', 'watering']);
const STAFF_TASKS = every<StaffTask>()(['none', 'wander', 'toPatrol', 'sweep', 'mess', 'bin', 'water', 'fix', 'inspect', 'roam', 'perform']);
const COSTUMES = every<Costume>()(['frost', 'spark', 'boo']);
const RESEARCH_LEVELS = every<ResearchLevel>()(['none', 'low', 'medium', 'high']);
const RESEARCH_CATEGORIES = every<ResearchCategory>()(['gentle', 'thrill', 'coasters', 'shops', 'water', 'scenery']);
const MESSAGE_CATEGORIES = every<MessageCategory>()(['breakdown', 'research', 'weather', 'finance', 'staff', 'marketing', 'park']);
const WEATHER_KEYS = every<WeatherKey>()(['sunny', 'cloudy', 'rain', 'storm', 'hot', 'cold']);

const dir = oneOf(DIRS);
const rideStatus = oneOf(RIDE_STATUSES);
const weather = oneOf(WEATHER_KEYS);

const DEST_RE = /^(?:(?:ride|stall|show):(?:0|[1-9]\d*)|exit)$/;
const destKey: V<DestKey> = when((v) => typeof v === 'string' && DEST_RE.test(v));

const params = optional(record<string | number>(when((v) => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))));

// ---- Map ----

const CONTENT_CODES = new Set<number>(Object.values(Content));

const mapShape = obj<MapState>({
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
  pathItemLevel: layer('Int32Array'),
  entranceTile: tile,
});

/** Checks the map and sets `ctx.tiles`. Must run before anything that holds tile indices. */
export const mapCheck: V<MapState> = makeMapCheck(mapShape, CONTENT_CODES);

// ---- Slices ----

const parkShape = obj<ParkState>({
  name: str,
  cash: int,
  entranceFee: int,
  open: bool,
  rating: num,
  turnedAway: int,
  recentLeavers: arr(num),
  arrivalCarry: num,
  guestsArrivedTotal: int,
  afterDark: bool,
  landPrice: int,
  rightsPrice: int,
});

const modifiersShape = obj<Modifiers>({
  arrivals: num,
  priceTolerance: num,
  happinessDecay: num,
  researchSpeed: num,
  breakdownChance: num,
  loanInterest: num,
  ratingBonus: num,
});

const gate = obj<Gate>({ gate: tile, outside: tileOrNone });

const rideShape = obj<Ride>({
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
  stats: nullable(obj<RideStats>({ excitement: num, intensity: num, nausea: num })),
  queue: arr(int),
  riders: arr(int),
  cycle: obj<Ride['cycle']>({ phase: oneOf(CYCLE_PHASES), ticks: int }),
  totals: obj<Ride['totals']>({ riders: int, income: int, ridersThisMonth: int, incomeThisMonth: int }),
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

const stallShape = obj<Stall>({
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
  totals: obj<Stall['totals']>({ sales: int, income: int, salesThisMonth: int, incomeThisMonth: int }),
  builtTick: int,
  hoursThisMonth: int,
  totalBuildCost: int,
});

const guestShape = obj<Guest>({
  id: int,
  tile: tileOrNone,
  z: byte,
  nextTile: tileOrNone,
  progress: num,
  dir,
  lane: int,
  state: oneOf(GUEST_STATES),
  stateTicks: int,
  target: nullable(destKey),
  cash: int,
  needs: obj<Needs>({ hunger: num, thirst: num, bladder: num, energy: num, happiness: num, nausea: num }),
  temperament: num,
  thoughts: arr(obj<Thought>({ id: str, tick: int, params })),
  thoughtCooldowns: record(int),
  ridden: record(int),
  spent: int,
  items: obj<GuestItems>({ map: bool, umbrella: bool, balloon: bool, photo: bool }),
  nextDecisionTick: int,
  lostSinceTick: int,
  noRideStreak: int,
  seat: nullable(obj<NonNullable<Guest['seat']>>({ rideId: int, trainId: int, car: int, seat: int })),
  activityId: int,
  trashTimer: int,
  withdrawals: int,
  lostSteps: int,
  bestDistance: int,
  lostTarget: nullable(destKey),
  wetUntilTick: int,
  showTarget: int,
});

const economyShape = obj<EconomyState>({
  ledger: arr(obj<LedgerMonth>({ monthIndex: int, lines: exactRecord(LEDGER_CATEGORIES, int) })),
});

const staffShape = obj<StaffSlice>({
  members: arr(
    obj<Staff>({
      id: int,
      type: oneOf(STAFF_TYPES),
      name: str,
      tile: tileOrNone,
      z: byte,
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
  benchSitters: arr(obj<BenchSitter>({ guestId: int, tile: tileOrNone, untilTick: int })),
  recentFixes: arr(obj<StaffSlice['recentFixes'][number]>({ rideId: int, tick: int })),
  repairNoticeDay: int,
});

type Research = ManagementSlice['research'];

const managementShape = obj<ManagementSlice>({
  research: obj<Research>({
    level: oneOf(RESEARCH_LEVELS),
    focus: exactRecord(RESEARCH_CATEGORIES, bool),
    current: nullable(str),
    progress: num,
    unlocked: arr(str),
    hoursThisMonth: int,
    completeNotified: bool,
  }),
  campaigns: arr(obj<ManagementSlice['campaigns'][number]>({ type: str, targetId: int, endTick: int })),
  loan: obj<ManagementSlice['loan']>({ balance: int }),
  weather: obj<ManagementSlice['weather']>({ current: weather, next: weather, nextChangeTick: int }),
  parkValue: int,
  messages: arr(
    obj<Message>({
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

export const gameStateShape = obj<GameState>({
  schemaVersion: literal(3),
  seed: int,
  rng: int,
  tick: int,
  nextId: int,
  map: mapCheck,
  park: parkShape,
  modifiers: modifiersShape,
  rides: arr(rideShape),
  stalls: arr(stallShape),
  guests: arr(guestShape),
  economy: economyShape,
  track: trackShape,
  staff: staffShape,
  management: managementShape,
  elevatedPaths: elevatedPathsShape,
  scenery: sceneryListShape,
  scenario: scenarioShape,
  monthMetrics: monthMetricsShape,
  shows: showsShape,
});

/** Null when `raw` has the full schema 3 GameState structure, else a short reason. */
export function checkStructure(raw: unknown): string | null {
  return checkStateWith(raw, mapCheck, gameStateShape);
}

