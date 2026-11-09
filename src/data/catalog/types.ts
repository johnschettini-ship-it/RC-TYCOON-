/** Content definition types. Values come from docs/superpowers/specs/thrills-and-chills/content-catalog.md. */
export type RideTag = 'thrill' | 'family' | 'chill';
export type ResearchCategory = 'gentle' | 'thrill' | 'coasters' | 'shops' | 'water' | 'scenery';
export type Unlock = 'start' | ResearchCategory;
export type Phase = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Catalog flags (master rule R11). */
export interface ContentFlags {
  covered: boolean;
  spooky: boolean;
  tall: boolean;
}

/** Ratings are integer hundredths (0–1000). Money is integer cents. Times are ticks. */
export interface FlatRideDef {
  id: string;
  name: string;
  phase: Phase;
  unlock: Unlock;
  tag: RideTag;
  flags: ContentFlags;
  /** Footprint width along the front edge (tiles). */
  w: number;
  /** Footprint depth (tiles). */
  d: number;
  excitement: number;
  intensity: number;
  nausea: number;
  capacity: number;
  cycleTicks: number;
  buildCost: number;
  runningCostMonthly: number;
  defaultPrice: number;
}

export type TrackDrive = 'gravity' | 'powered' | 'guestDriven' | 'waterChannel' | 'waterCurrent';

export interface TrackRideDef {
  id: string;
  name: string;
  phase: Phase;
  unlock: Unlock;
  tag: RideTag;
  flags: ContentFlags;
  drive: TrackDrive;
  seatsPerCar: number;
  carsMin: number;
  carsMax: number;
  maxTrains: number;
  maxHeightM: number;
  /** Powered drive speed in mm/s (powered rides), or the max speed for guest-driven karts. */
  driveSpeedMms: number | null;
  /** Minimum speed for guest-driven karts in mm/s. */
  driveSpeedMinMms: number | null;
  defaultPrice: number;
}

export type StallKind = 'food' | 'drink' | 'toilet' | 'souvenir' | 'info' | 'facility';
export type NeedKey = 'hunger' | 'thirst' | 'bladder' | 'energy' | 'happiness' | 'nausea';
export type WeatherKey = 'sunny' | 'cloudy' | 'rain' | 'storm' | 'hot' | 'cold';
/** Phase 6 §4.5, §5: the Photo Booth gives a `photo`. */
export type GuestItem = 'balloon' | 'umbrella' | 'map' | 'photo';

export interface StallEffects {
  /** Signed change to a need (0–255 scale), or 'reset' to set it to 0. */
  needs: Partial<Record<NeedKey, number | 'reset'>>;
  gives: GuestItem | null;
  /** Cash machine: guest with cash below `belowCents` withdraws an amount in [minCents, maxCents]. */
  withdraw: { belowCents: number; minCents: number; maxCents: number } | null;
}

export interface StallDef {
  id: string;
  name: string;
  phase: Phase;
  unlock: Unlock;
  kind: StallKind;
  buildCost: number;
  runningCostMonthly: number;
  defaultPrice: number;
  stockCost: number;
  effects: StallEffects;
  weatherFactors: Partial<Record<WeatherKey, number>>;
}

export interface PathItemDef {
  id: 'bench' | 'bin' | 'lamp';
  name: string;
  phase: Phase;
  unlock: Unlock;
  buildCost: number;
}

export type StaffType = 'groundskeeper' | 'mechanic' | 'security' | 'performer';
export type Costume = 'frost' | 'spark' | 'boo';

export interface StaffDef {
  id: StaffType;
  name: string;
  hireCost: number;
  wageMonthly: number;
  ticksPerTile: number;
}

export interface CostumeDef {
  id: Costume;
  mascot: string;
  bonus: number;
  /** Temperament range that gets the bonus; null for Boo (night/spooky rule, Phase 4). */
  temperament: { min: number; max: number } | null;
}

/** Scenery themes (Phase 4 §4.5, catalog §6). `base` is the unthemed start set. */
export type SceneryThemeId = 'base' | 'classic_fair' | 'frost_peaks' | 'volcano_ridge' | 'spooky_hollow' | 'jungle_lagoon' | 'starport';

export interface SceneryTheme {
  id: SceneryThemeId;
  name: string;
  /** `start`, or the research category that unlocks the whole theme (research id = theme id, 240 points). */
  unlock: Unlock;
}

/** One scenery item (Phase 4 §4.5 tables). Money is integer cents; `heightM` is metres (height steps). */
export interface SceneryDef {
  id: string;
  name: string;
  theme: SceneryThemeId;
  /** Footprint in tiles at rotation 0 (2 × 1 items swap sides at rotation 1 and 3). Edge items: 1 × 1. */
  w: number;
  d: number;
  heightM: number;
  buildCost: number;
  /** Calm and Buzz strength `s` (Phase 4 §4.6). */
  calm: number;
  buzz: number;
  /** Flag E: goes on one tile edge, not the centre slot. */
  edge: boolean;
  /** Flag L: light source at night (scenery only; rides and stalls always light, master R11). */
  light: boolean;
  /** Flag W: a garden with a water level that drains and wilts. */
  needsWater: boolean;
  /** Flag S: may stand on a sloped tile. */
  slopeOk: boolean;
  /** Flag P: an arch over a flat ground footpath; guests walk under it. */
  overPath: boolean;
  /** Flag K: spooky (After Dark spooky-ride bonus within 6 tiles). */
  spooky: boolean;
}

/**
 * After Dark show site (Phase 6 §4.4–4.5, catalog §3). Money in cents; `showTicks` at 20 ticks per second.
 * A show site is a building (`Content.Building`, `contentRef` = its id) with no gates; its viewing tiles are the
 * footpaths within `radius` tiles (W4-C).
 */
export interface ShowSiteDef {
  id: 'lightshow_tower' | 'fireworks_launcher';
  name: string;
  phase: Phase;
  unlock: Unlock;
  /** Footprint (tiles); both sites are square, so rotation does not change the extent. */
  w: number;
  d: number;
  buildCost: number;
  runningCostMonthly: number;
  /** Charged to the `shows` ledger line at each show start. */
  costPerShow: number;
  /** Viewing radius in tiles, measured from the footprint centre. */
  radius: number;
  showTicks: number;
}
