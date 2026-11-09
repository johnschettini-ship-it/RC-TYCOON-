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
export type GuestItem = 'balloon' | 'umbrella' | 'map';

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
