/**
 * Scenario definition format (Phase 5 §4.1). Owner: W3-H. Definitions are JSON-compatible data
 * (no functions, no `undefined`). Heights are relative to `map.baseHeight` unless a field says "absolute" (master R19).
 */
import type { TerrainName } from './terrainNames';

export type { TerrainName };
export type Climate = 'temperate' | 'cold' | 'hot' | 'coastal';
export type Difficulty = 'relaxed' | 'standard' | 'tough';
export type AfterDarkRule = 'off' | 'on' | 'forced';
export type TerrainStyle = 'flat' | 'rollingHills' | 'mountains' | 'islands' | 'riverValley';
export type Side = 'N' | 'E' | 'S' | 'W';

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Circle {
  cx: number;
  cy: number;
  radius: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * A command object run in setup mode (`executeCommand(world, cmd, { setup: true })`). Checked by the generator.
 * Height fields `z` and `targetHeight` are relative to `baseHeight` here (master R19); the generator adds it.
 */
export interface PrebuiltCommand {
  type: string;
  [field: string]: string | number | boolean | number[] | null;
}

/**
 * Map features (Phase 5 §4.1 table). Terrain features (`raise` … `sea`) are applied in list order at step 3 of the
 * generator; content features (`scatterScenery` … `startGuests`, `brokenPathItems`) in list order at step 8.
 *
 * Coordinates: `rect` is in tiles (inclusive). Circle centres (`cx`, `cy`), cliff and river points are tile corners
 * (vertex coordinates: corner (x, y) is the N corner of tile (x, y)). Distances are Euclidean, in tiles.
 * - `raise` / `lower` with `falloff: 0` move whole tiles (a cliff edge, master R18); with `falloff > 0` they move
 *   corners with a linear falloff outside the area.
 * - `flatten` sets the tiles flat at `height`; the slope pass ramps the land around it but never moves it.
 * - `cone`: `peak` is the rim height; inside `craterRadius` the floor is `CRATER_DEPTH` steps below the rim.
 * - `cliff`: raises the tiles on the left of the line from `from` to `to` (north is up), within the segment's span.
 * - `lake` / `sea` surfaces are relative heights; `river` water stands `depth − 1` steps above its bed.
 * - `rideCondition.reliability` is a percentage (0–100); `open: true` opens the ride after setting its condition.
 * - `brokenPathItems`: the path items on these tiles start broken (Fading Fairground's broken benches).
 */
export type Feature =
  | { kind: 'raise' | 'lower'; area: { rect: Rect } | { circle: Circle }; by: number; falloff: number }
  | { kind: 'flatten'; rect: Rect; height: number }
  | { kind: 'cone'; cx: number; cy: number; radius: number; peak: number; craterRadius: number }
  | { kind: 'cliff'; from: Point; to: Point; height: number }
  | { kind: 'lake'; cx: number; cy: number; radius: number; surface: number }
  | { kind: 'river'; points: Point[]; width: number; depth: number }
  | { kind: 'sea'; edge: Side; depthTiles: number; surface: number }
  | { kind: 'scatterScenery'; rect: Rect; defIds: string[]; density: number }
  | { kind: 'prebuilt'; commands: PrebuiltCommand[] }
  | { kind: 'rideCondition'; rideIndex: number; ageMonths: number; reliability: number; open?: boolean }
  | { kind: 'litter'; rect: Rect; density: number }
  | { kind: 'startGuests'; count: number; happiness: number }
  | { kind: 'brokenPathItems'; points: Point[] };

export type FeatureKind = Feature['kind'];

export interface TerrainRule {
  minHeight?: number;
  maxHeight?: number;
  nearWater?: number;
  terrain: TerrainName;
}

export interface MapGenSpec {
  width: number;
  height: number;
  seed: number;
  /** Steps; 8 = master ground level (R2). */
  baseHeight: number;
  noise: { amplitude: number; scale: number; octaves: number };
  /** 0 = no sea or lakes from noise. */
  waterLevel: number;
  terrainRules: TerrainRule[];
  features: Feature[];
  /** owned → 1, forSale → 2, rightsForSale → 4; other tiles 0 (master 6.3). */
  park: { owned: Rect[]; forSale: Rect[]; rightsForSale: Rect[]; entrance: { x: number; y: number; side: Side } };
}

/** Goal types (Phase 5 §4.3). Money in cents, ratings 0–1000, excitement and intensity in hundredths. */
export type Objective =
  | { type: 'guestsInPark'; count: number; minRating?: number }
  | { type: 'parkRatingHeld'; rating: number; months: number }
  | { type: 'parkValue'; value: number }
  | { type: 'monthlyRideIncome'; amount: number; months: number }
  | { type: 'monthlyProfit'; amount: number; months: number }
  | { type: 'coasterExcitement'; count: number; minExcitement: number; maxIntensity?: number; types?: string[] }
  | { type: 'ridesOpen'; count: number; tag?: 'thrill' | 'family' | 'chill'; flag?: 'covered' | 'spooky' | 'tall'; defIds?: string[] }
  | { type: 'repayLoan' }
  | { type: 'temperamentBalance'; minGuests: number; minShare: number; minHappiness: number; months: number }
  | { type: 'afterDarkHappiness'; minGuests: number; minHappiness: number; months: number };

export type ObjectiveType = Objective['type'];

export interface ScenarioDef {
  id: string;
  /** Bump when goals or the map change. */
  defVersion: number;
  /** English name until the Phase 6 string table. */
  nameKey: string;
  description: string;
  stars: 1 | 2 | 3 | 4 | 5;
  map: MapGenSpec;
  start: { cash: number; loan: number; maxLoan: number; entranceFee: number; parkName: string };
  /** defIds available at start (besides `start` items) and defIds that can ever appear. */
  research: { unlocked: string[] | 'all'; allowed: string[] | 'all' };
  climate: Climate;
  afterDark: AfterDarkRule;
  /** All must be met at the same month end. */
  objectives: Objective[];
  timeLimitMonths: number | null;
}
