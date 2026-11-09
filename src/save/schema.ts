/**
 * Structural check of a loaded GameState: every field present with the right type, no unknown fields,
 * map layers of the right kind and size, tile indices inside the map.
 *
 * Each validator carries its value type, and `obj<T>` needs a validator for every key of T, so adding or
 * changing a field in a state type without updating this file is a compile error.
 */
import { Content, type Dir, type MapState } from '../sim/map';
import type { GameState } from '../sim/types';
import type { Modifiers, ParkState } from '../sim/park/types';
import type { DestKey, Guest, GuestItems, GuestStateName, Needs, Thought } from '../sim/guests/types';
import type { FlatCyclePhase, Gate, Ride, RideStats, RideStatus } from '../sim/rides/types';
import type { Stall } from '../sim/stalls/types';
import { LEDGER_CATEGORIES, type EconomyState, type LedgerMonth } from '../sim/economy/types';
import type { TestResult, TrackDir, TrackPieceInstance, TrackRideData, TrackSlice, TrainState } from '../sim/rides/track/types';
import type { BenchSitter, Staff, StaffSlice, StaffStateName, StaffTask } from '../sim/staff/types';
import type { ManagementSlice, Message, MessageCategory, ResearchLevel } from '../sim/management/types';
import type { Costume, ResearchCategory, StaffType, WeatherKey } from '../data/catalog/types';
import { childPath, typedArrayKind, type TypedArrayKind } from './typedArrays';

export interface Ctx {
  /** Tiles on the map (width × height), known once the map passed its check. */
  tiles: number;
}

type Problem = 'missing' | 'bad' | 'unknown' | 'kind' | 'size' | 'mapSize';

/** A failed check. Keys are collected innermost first while the failure bubbles up; the path is built only then. */
export interface Fail {
  problem: Problem;
  keys: Array<string | number>;
}

const MESSAGES: Record<Problem, (path: string) => string> = {
  missing: (p) => `missing field ${p}`,
  bad: (p) => `bad value at ${p}`,
  unknown: (p) => `unknown field ${p}`,
  kind: (p) => `wrong data type at ${p}`,
  size: (p) => `wrong size at ${p}`,
  mapSize: () => 'bad map size',
};

export function describeFail(f: Fail): string {
  let path = '';
  for (let i = f.keys.length - 1; i >= 0; i--) path = childPath(path, f.keys[i] as string | number);
  return MESSAGES[f.problem](path);
}

const fail = (problem: Problem, ...keysInnermostFirst: Array<string | number>): Fail => ({ problem, keys: keysInnermostFirst });

function under(f: Fail | null, key: string | number): Fail | null {
  if (f) f.keys.push(key);
  return f;
}

/** Returns null when the value is fine, else a failure. The phantom keeps validators typed (invariant in T). */
export interface V<T> {
  (value: unknown, ctx: Ctx): Fail | null;
  readonly __type?: (t: T) => T;
}

type Shape<T> = { [K in keyof Required<T>]: V<T[K]> };

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

export function isRecord(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v) || ArrayBuffer.isView(v)) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

function check<T>(fn: (value: unknown, ctx: Ctx) => Fail | null): V<T> {
  return fn as V<T>;
}

/** A validator from a predicate: fails with "bad value". */
function when<T>(ok: (value: unknown, ctx: Ctx) => boolean): V<T> {
  return check((v, ctx) => (ok(v, ctx) ? null : fail('bad')));
}

// ---- Primitives ----

export const str: V<string> = when((v) => typeof v === 'string');
export const bool: V<boolean> = when((v) => typeof v === 'boolean');
/** Any finite number. */
export const num: V<number> = when((v) => typeof v === 'number' && Number.isFinite(v));
/** A safe integer (ids, ticks, counts, money in cents). */
export const int: V<number> = when((v) => typeof v === 'number' && Number.isSafeInteger(v));
/** A tile index on the map, or −1 for none. */
export const tileOrNone: V<number> = when((v, ctx) => typeof v === 'number' && Number.isInteger(v) && v >= -1 && v < ctx.tiles);
/** A tile index on the map. */
export const tile: V<number> = when((v, ctx) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < ctx.tiles);

export function literal<const T extends string | number>(value: T): V<T> {
  return when((v) => v === value);
}

export function oneOf<const T extends string | number>(values: readonly T[]): V<T> {
  const set = new Set<unknown>(values);
  return when((v) => set.has(v));
}

/**
 * A runtime list that must name every member of the union U. A missing member is a compile error.
 * Usage: `every<RideStatus>()(['building', …])`.
 */
export function every<U extends string | number>() {
  return <const L extends readonly U[]>(list: L & ([Exclude<U, L[number]>] extends [never] ? unknown : { missing: Exclude<U, L[number]> })): L => list;
}

// ---- Combinators ----

export function nullable<T>(inner: V<T>): V<T | null> {
  return check((v, ctx) => (v === null ? null : inner(v, ctx)));
}

/** For optional properties (`key?: T`): the key may be absent. */
export function optional<T>(inner: V<T>): V<T | undefined> {
  return check((v, ctx) => (v === undefined ? null : inner(v, ctx)));
}

export function arr<T>(item: V<T>): V<T[]> {
  return check((v, ctx) => {
    if (!Array.isArray(v)) return fail('bad');
    for (let i = 0; i < v.length; i++) {
      const e = item(v[i], ctx);
      if (e) return under(e, i);
    }
    return null;
  });
}

/** A plain object with any keys and values of one type. */
export function record<T>(value: V<T>): V<Record<string, T>> {
  return check((v, ctx) => {
    if (!isRecord(v)) return fail('bad');
    for (const k in v) {
      const e = value(v[k], ctx);
      if (e) return under(e, k);
    }
    return null;
  });
}

/** A plain object with exactly the listed keys. */
export function exactRecord<K extends string, T>(keys: readonly K[], value: V<T>): V<Record<K, T>> {
  const allowed = new Set<string>(keys);
  return check((v, ctx) => {
    if (!isRecord(v)) return fail('bad');
    for (const k of keys) {
      if (!hasOwn(v, k)) return fail('missing', k);
      const e = value(v[k], ctx);
      if (e) return under(e, k);
    }
    for (const k in v) if (!allowed.has(k)) return fail('unknown', k);
    return null;
  });
}

/** An object with exactly the fields of T. Optional fields (validated by `optional`) may be absent. */
export function obj<T>(shape: Shape<T>): V<T> {
  const keys = Object.keys(shape);
  const fields = keys.map((k) => (shape as unknown as Record<string, V<unknown>>)[k] as V<unknown>);
  const allowed = new Set(keys);
  return check((v, ctx) => {
    if (!isRecord(v)) return fail('bad');
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i] as string;
      const present = hasOwn(v, k);
      const e = (fields[i] as V<unknown>)(present ? v[k] : undefined, ctx);
      if (e) return present ? under(e, k) : fail('missing', k);
    }
    for (const k in v) if (!allowed.has(k)) return fail('unknown', k);
    return null;
  });
}

type KindToArray = {
  Int8Array: Int8Array;
  Uint8Array: Uint8Array;
  Uint8ClampedArray: Uint8ClampedArray;
  Int16Array: Int16Array;
  Uint16Array: Uint16Array;
  Int32Array: Int32Array;
  Uint32Array: Uint32Array;
  Float32Array: Float32Array;
  Float64Array: Float64Array;
};

/** A typed array of one kind, any length. */
export function typed<K extends TypedArrayKind>(kind: K): V<KindToArray[K]> {
  return check((v) => (typedArrayKind(v) === kind ? null : fail('kind')));
}

/** A map layer: a typed array of one kind with one entry per tile. */
export function layer<K extends TypedArrayKind>(kind: K): V<KindToArray[K]> {
  return check((v, ctx) => {
    if (typedArrayKind(v) !== kind) return fail('kind');
    return (v as KindToArray[K]).length === ctx.tiles ? null : fail('size');
  });
}

// ---- Enumerations (each list must name every member) ----

const DIRS = every<Dir>()([0, 1, 2, 3]);
const RIDE_STATUSES = every<RideStatus>()(['building', 'testing', 'closed', 'open', 'broken', 'inspecting', 'stormHold']);
const CYCLE_PHASES = every<FlatCyclePhase>()(['waiting', 'loading', 'running', 'unloading']);
const GUEST_STATES = every<GuestStateName>()(['arriving', 'walking', 'queueing', 'riding', 'buying', 'sitting', 'leaving']);
const TRAIN_STATES = every<TrainState['state']>()(['loading', 'running', 'held', 'unloading', 'waiting']);
const TRACK_DIRS = every<TrackDir>()([0, 1, 2, 3]);
const TEST_FAIL_KINDS = every<NonNullable<TestResult['failKind']>>()(['stop', 'loop']);
const STAFF_TYPES = every<StaffType>()(['groundskeeper', 'mechanic', 'security', 'performer']);
const STAFF_STATES = every<StaffStateName>()(['walking', 'sweeping', 'cleaning', 'emptying', 'inspecting', 'fixing', 'performing']);
const STAFF_TASKS = every<StaffTask>()(['none', 'wander', 'toPatrol', 'sweep', 'mess', 'bin', 'fix', 'inspect', 'roam', 'perform']);
const COSTUMES = every<Costume>()(['frost', 'spark', 'boo']);
const RESEARCH_LEVELS = every<ResearchLevel>()(['none', 'low', 'medium', 'high']);
const RESEARCH_CATEGORIES = every<ResearchCategory>()(['gentle', 'thrill', 'coasters', 'shops', 'water', 'scenery']);
const MESSAGE_CATEGORIES = every<MessageCategory>()(['breakdown', 'research', 'weather', 'finance', 'staff', 'marketing', 'park']);
const WEATHER_KEYS = every<WeatherKey>()(['sunny', 'cloudy', 'rain', 'storm', 'hot', 'cold']);

const dir = oneOf(DIRS);
const rideStatus = oneOf(RIDE_STATUSES);
const weather = oneOf(WEATHER_KEYS);

const DEST_RE = /^(?:(?:ride|stall):(?:0|[1-9]\d*)|exit)$/;
const destKey: V<DestKey> = when((v) => typeof v === 'string' && DEST_RE.test(v));

const params = optional(record<string | number>(when((v) => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))));

// ---- Map ----

/** Largest map the loader accepts (tiles). Far above any planned map (256 × 256 in Phase 4). */
export const MAX_TILES = 4096 * 4096;
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
  entranceTile: tile,
});

/** Checks the map and sets `ctx.tiles`. Must run before anything that holds tile indices. */
export const mapCheck: V<MapState> = check((v, ctx) => {
  if (!isRecord(v)) return fail('bad');
  for (const k of ['width', 'height']) if (!hasOwn(v, k)) return fail('missing', k);
  const w = v.width;
  const h = v.height;
  if (typeof w !== 'number' || typeof h !== 'number' || !Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w * h > MAX_TILES) {
    return fail('mapSize');
  }
  ctx.tiles = w * h;
  const e = mapShape(v, ctx);
  if (e) return e;
  const map = v as unknown as MapState;
  for (let i = 0; i < ctx.tiles; i++) {
    if (!CONTENT_CODES.has(map.content[i] as number)) return fail('bad', i, 'content');
    if ((map.contentRef[i] as number) < -1) return fail('bad', i, 'contentRef');
  }
  return null;
});

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
  items: obj<GuestItems>({ map: bool, umbrella: bool, balloon: bool }),
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
});

const economyShape = obj<EconomyState>({
  ledger: arr(obj<LedgerMonth>({ monthIndex: int, lines: exactRecord(LEDGER_CATEGORIES, int) })),
});

// Track rides (Phase 2 §5). Positions and speeds are integer mm and mm/s; G values and ratings integer hundredths.
const trackPieceShape = obj<TrackPieceInstance>({
  defId: str,
  x: int,
  y: int,
  z: int,
  dir: oneOf(TRACK_DIRS),
  chain: bool,
  brakeSpeed: nullable(int),
  cost: int,
});

const trainShape = obj<TrainState>({
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

const testResultShape = obj<TestResult>({
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
  chart: obj<TestResult['chart']>({ every: int, speedCms: arr(int), gv: arr(int), gl: arr(int) }),
});

const trackRideShape = obj<TrackRideData>({
  rideId: int,
  typeId: str,
  pieces: arr(trackPieceShape),
  circuitClosed: bool,
  trainConfig: obj<TrackRideData['trainConfig']>({ trains: int, carsPerTrain: int }),
  operation: obj<TrackRideData['operation']>({ minDwellTicks: int, maxDwellTicks: int, laps: int }),
  trains: arr(trainShape),
  test: nullable(testResultShape),
  colours: obj<TrackRideData['colours']>({ track: int, supports: int, cars: int }),
  openedOnce: bool,
  testRun: nullable(obj<NonNullable<TrackRideData['testRun']>>({ ticksLeft: int, result: testResultShape })),
  lastDispatchTick: int,
  bestLapTicks: nullable(int),
});

const trackShape = obj<TrackSlice>({ rides: record(trackRideShape) });

const staffShape = obj<StaffSlice>({
  members: arr(
    obj<Staff>({
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
  schemaVersion: literal(1),
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
});

/** Null when `raw` has the full GameState structure, else a short reason. */
export function checkStructure(raw: unknown): string | null {
  const ctx: Ctx = { tiles: 0 };
  if (!isRecord(raw)) return 'bad value at state';
  // The map goes first: tile checks elsewhere need its size.
  if (!hasOwn(raw, 'map')) return describeFail(fail('missing', 'map'));
  const e = under(mapCheck(raw.map, ctx), 'map') ?? gameStateShape(raw, ctx);
  return e ? describeFail(e) : null;
}
