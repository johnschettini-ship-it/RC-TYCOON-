/**
 * Map generator, world part (Phase 5 §4.2 steps 7–9). Owner: W3-H.
 * Writes the terrain (steps 1–6, `terrain.ts`), ownership and the park entrance into a fresh map, runs the content
 * features in list order, and validates the result. Problems come back as a list; scenario data must give none.
 *
 * Content features write through the documented contracts: prebuilt commands run through
 * `executeCommand(world, cmd, { setup: true })`; scattered scenery is written as `Scenery` entities in the W3-D data
 * model (centre items mark their footprint `Content.Scenery`); litter, broken path items, ride condition, and start
 * guests change the Build 1 state directly. The generator RNG is its own stream from the map seed, so
 * `GameState.rng` sees only the draws of the systems it calls (guest spawning).
 */
import { getSceneryDef, type SceneryDef } from '../../data/catalog';
import type { Feature, MapGenSpec, PrebuiltCommand, Rect } from '../../data/scenarios/types';
import { TICKS_PER_MONTH } from '../../data/tuning/core';
import { LITTER_TILE_MAX, REL_MAX } from '../../data/tuning/staff';
import { MIN_BUILDABLE_TILES } from '../../data/tuning/scenario';
import { executeCommand, type Command } from '../commands';
import { markFieldsDirty } from '../fields/api';
import { spawnGuest } from '../guests/arrivals';
import { markLightDirty } from '../lighting/api';
import { setBroken } from '../litter/pathItems';
import { Content, generateMap, inBounds, neighbour, Owned, PathItem, tileIndex, type Dir, type MapState } from '../map';
import { allocId } from '../ids';
import { markOccupancyDirty } from '../occupancy';
import { markNetworkDirty } from '../pathing';
import { rngInt, rngPick, type RngHolder } from '../rng';
import { sceneryExtent } from '../scenery/api';
import { cornerHeightsOf, isFlat, isWet } from '../terrain/corners';
import type { World } from '../types';
import { hash4 } from './intmath';
import { generateTerrain, GenerationError } from './terrain';

const SIDE_DIR: Readonly<Record<'N' | 'E' | 'S' | 'W', Dir>> = { N: 0, E: 1, S: 2, W: 3 };
/** Chances are compared in thousandths. */
const PER_MILLE = 1000;

/** A map of the size with nothing on it: no content, nothing owned, no entrance. Other Build 2 arrays start empty. */
export function blankMap(width: number, height: number): MapState {
  const map = generateMap({ width, height });
  map.content.fill(Content.Empty);
  map.contentRef.fill(-1);
  map.owned.fill(Owned.NotOwned);
  map.entranceTile = -1;
  return map;
}

function forRect(map: MapState, r: Rect, fn: (i: number, x: number, y: number) => void): void {
  for (let y = Math.max(0, r.y0); y <= Math.min(map.height - 1, r.y1); y++) {
    for (let x = Math.max(0, r.x0); x <= Math.min(map.width - 1, r.x1); x++) fn(y * map.width + x, x, y);
  }
}

/** The generator's own RNG stream for a map seed. */
export function generatorRng(seed: number): RngHolder {
  return { rng: hash4(seed, 0x5ce7a710, 0x9e37, 8) | 0 };
}

/** Step 7: owned → 1, then land for sale → 2 and construction rights for sale → 4 on tiles not owned. */
function applyOwnership(map: MapState, park: MapGenSpec['park']): void {
  const mark = (rects: readonly Rect[], state: number): void => {
    for (const r of rects) {
      forRect(map, r, (i) => {
        if (state === Owned.Owned || map.owned[i] === Owned.NotOwned) map.owned[i] = state;
      });
    }
  };
  mark(park.owned, Owned.Owned);
  mark(park.forSale, Owned.LandForSale);
  mark(park.rightsForSale, Owned.RightsForSale);
}

/** Prebuilt height fields are relative to the base height (master R19); commands take absolute heights. */
function absoluteCommand(cmd: PrebuiltCommand, base: number): Command {
  const out: Record<string, unknown> = { ...cmd };
  for (const k of ['z', 'targetHeight']) if (typeof out[k] === 'number') out[k] = (out[k] as number) + base;
  return out as unknown as Command;
}

/**
 * A centre scenery item written directly (scatter): every footprint tile in the map, empty, dry, at one height, and
 * flat unless the item is `slopeOk`. Ownership is not needed: scattered items may decorate land outside the park.
 */
export function placeSceneryDirect(world: World, def: SceneryDef, x: number, y: number, rotation: Dir): boolean {
  const s = world.state;
  const map = s.map;
  if (def.edge || def.overPath) return false;
  const { w, d } = sceneryExtent(def, rotation);
  const tiles: number[] = [];
  for (let dy = 0; dy < d; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (!inBounds(map, x + dx, y + dy)) return false;
      tiles.push(tileIndex(map, x + dx, y + dy));
    }
  }
  const z = map.heights[tiles[0] as number] as number;
  for (const t of tiles) {
    if (map.content[t] !== Content.Empty || isWet(map, t) || map.heights[t] !== z) return false;
    if (!def.slopeOk && !isFlat(map, t)) return false;
  }
  const id = allocId(s);
  s.scenery.push({ id, defId: def.id, x, y, z, rotation, edge: -1, waterLevel: 255 });
  for (const t of tiles) {
    map.content[t] = Content.Scenery;
    map.contentRef[t] = id;
    markFieldsDirty(world, t);
    markLightDirty(world, t);
  }
  return true;
}

/** A guest already in the park on `tile` (Phase 5 §4.1 `startGuests`): a normal arrival, moved there, no fee. */
function spawnStartGuest(world: World, tile: number, happiness: number): boolean {
  const park = world.state.park;
  const fee = park.entranceFee;
  park.entranceFee = 0;
  const g = spawnGuest(world);
  park.entranceFee = fee;
  if (!g) return false;
  g.tile = tile;
  g.z = world.state.map.heights[tile] as number;
  g.state = 'walking';
  g.needs.happiness = happiness;
  return true;
}

function runContentFeature(world: World, spec: MapGenSpec, feature: Feature, rng: RngHolder, problems: string[]): void {
  const s = world.state;
  const map = s.map;
  switch (feature.kind) {
    case 'scatterScenery': {
      const defs: SceneryDef[] = [];
      for (const id of feature.defIds) {
        const def = getSceneryDef(id);
        if (!def) problems.push(`scatterScenery: unknown item ${id}`);
        else if (def.edge || def.overPath) problems.push(`scatterScenery: ${id} is not a centre item`);
        else defs.push(def);
      }
      if (defs.length === 0) return;
      const chance = Math.round(feature.density * PER_MILLE);
      forRect(map, feature.rect, (_i, x, y) => {
        if (rngInt(rng, 0, PER_MILLE - 1) >= chance) return;
        const def = rngPick(rng, defs);
        placeSceneryDirect(world, def, x, y, rngInt(rng, 0, 3) as Dir);
      });
      return;
    }
    case 'prebuilt':
      feature.commands.forEach((cmd, k) => {
        const r = executeCommand(world, absoluteCommand(cmd, spec.baseHeight), { setup: true });
        if (!r.ok) problems.push(`prebuilt command ${k + 1} (${cmd.type}) failed: ${r.reason}`);
      });
      return;
    case 'rideCondition': {
      const ride = s.rides[feature.rideIndex];
      if (!ride) {
        problems.push(`rideCondition: there is no ride ${feature.rideIndex}`);
        return;
      }
      ride.builtTick = s.tick - feature.ageMonths * TICKS_PER_MONTH;
      ride.reliability = Math.round((feature.reliability * REL_MAX) / 100);
      if (feature.open) {
        const r = executeCommand(world, { type: 'setRideOpen', rideId: ride.id, open: true }, { setup: true });
        if (!r.ok) problems.push(`rideCondition: ride ${feature.rideIndex} cannot open: ${r.reason}`);
      }
      return;
    }
    case 'litter': {
      const chance = Math.round(feature.density * PER_MILLE);
      forRect(map, feature.rect, (i) => {
        if (map.content[i] !== Content.Footpath) return;
        if (rngInt(rng, 0, PER_MILLE - 1) < chance) map.litter[i] = Math.min(LITTER_TILE_MAX, (map.litter[i] as number) + 1);
      });
      return;
    }
    case 'brokenPathItems':
      for (const p of feature.points) {
        const i = inBounds(map, p.x, p.y) ? tileIndex(map, p.x, p.y) : -1;
        if (i < 0 || map.pathItem[i] === PathItem.None) problems.push(`brokenPathItems: no path item at ${p.x},${p.y}`);
        else setBroken(map, i, true);
      }
      return;
    case 'startGuests': {
      const tiles: number[] = [];
      for (let i = 0; i < map.content.length; i++) {
        if (map.content[i] === Content.Footpath && map.owned[i] === Owned.Owned && !isWet(map, i)) tiles.push(i);
      }
      if (tiles.length === 0) {
        problems.push('startGuests: there is no owned footpath');
        return;
      }
      for (let k = 0; k < feature.count; k++) {
        if (!spawnStartGuest(world, rngPick(rng, tiles), feature.happiness)) problems.push('startGuests: a guest could not arrive');
      }
      return;
    }
    default:
      return; // terrain features ran in steps 3–6
  }
}

/** Do neighbours `a` and `b` (b in direction `dir` of a) meet at the same corner heights along their edge? */
export function edgesMatch(map: MapState, a: number, b: number, dir: Dir): boolean {
  const ca = cornerHeightsOf(map, a);
  const cb = cornerHeightsOf(map, b);
  // Corners [N, E, S, W]: a's edge toward `dir` and b's edge back toward a, in matching order.
  switch (dir) {
    case 0:
      return ca[0] === cb[3] && ca[1] === cb[2];
    case 1:
      return ca[1] === cb[0] && ca[2] === cb[3];
    case 2:
      return ca[3] === cb[0] && ca[2] === cb[1];
    default:
      return ca[0] === cb[1] && ca[3] === cb[2];
  }
}

/**
 * Owned, dry tiles reachable from the park entrance on land: steps between neighbours whose shared edge has the same
 * corner heights (a path could join them; cliffs and water block). Returns the reached tiles in BFS order.
 */
export function landReachableFromEntrance(map: MapState): number[] {
  const start = map.entranceTile;
  if (start < 0) return [];
  const seen = new Uint8Array(map.content.length);
  const out = [start];
  seen[start] = 1;
  for (let k = 0; k < out.length; k++) {
    const a = out[k] as number;
    for (let d = 0; d < 4; d++) {
      const b = neighbour(map, a, d as Dir);
      if (b < 0 || seen[b] || map.owned[b] !== Owned.Owned || isWet(map, b) || !edgesMatch(map, a, b, d as Dir)) continue;
      seen[b] = 1;
      out.push(b);
    }
  }
  return out;
}

/** Step 9: the entrance sits on flat dry land and leads into the park; enough buildable land is reachable from it. */
export function validateGeneratedMap(world: World, spec: MapGenSpec): string[] {
  const problems: string[] = [];
  const map = world.state.map;
  const e = map.entranceTile;
  if (e < 0 || map.content[e] !== Content.ParkEntrance || map.owned[e] !== Owned.Owned) return ['the park entrance is missing'];
  if (!isFlat(map, e) || isWet(map, e)) problems.push('the park entrance needs flat, dry land');
  const out = SIDE_DIR[spec.park.entrance.side];
  const outside = neighbour(map, e, out);
  if (outside >= 0 && map.owned[outside] === Owned.Owned) problems.push('the park entrance must face out of the park');
  const inDir = ((out + 2) % 4) as Dir;
  const inside = neighbour(map, e, inDir);
  if (inside < 0 || map.owned[inside] !== Owned.Owned || isWet(map, inside) || !edgesMatch(map, e, inside, inDir)) {
    problems.push('the park entrance does not lead into the park on land');
  }
  let buildable = 0;
  for (const t of landReachableFromEntrance(map)) if (map.content[t] === Content.Empty && isFlat(map, t)) buildable++;
  if (buildable < MIN_BUILDABLE_TILES) problems.push(`only ${buildable} buildable tiles can be reached from the entrance (at least ${MIN_BUILDABLE_TILES} needed)`);
  return problems;
}

/**
 * Generates `spec` into `world` (Phase 5 §4.2): a new map replaces `state.map`; content features add entities.
 * Returns the problems found (empty when the map is valid). `world.state.tick` should be the start tick.
 */
export function generateWorldMap(world: World, spec: MapGenSpec): string[] {
  let terrain;
  try {
    terrain = generateTerrain(spec);
  } catch (err) {
    if (err instanceof GenerationError) return [err.message];
    throw err;
  }
  const map = blankMap(spec.width, spec.height);
  map.heights.set(terrain.heights);
  map.slope.set(terrain.slope);
  map.water.set(terrain.water);
  map.terrain.set(terrain.terrain);
  world.state.map = map;

  // Step 7: ownership, then the park entrance (owned, in the gap of the border; the fence is derived).
  applyOwnership(map, spec.park);
  const { x, y } = spec.park.entrance;
  if (!inBounds(map, x, y)) return ['the park entrance is outside the map'];
  const e = tileIndex(map, x, y);
  map.owned[e] = Owned.Owned;
  map.content[e] = Content.ParkEntrance;
  map.contentRef[e] = -1;
  map.entranceTile = e;
  markNetworkDirty(world);
  markOccupancyDirty(world);

  // Step 8: content features in list order.
  const problems: string[] = [];
  const rng = generatorRng(spec.seed);
  for (const feature of spec.features) runContentFeature(world, spec, feature, rng, problems);
  markNetworkDirty(world);
  markOccupancyDirty(world);

  // Step 9.
  problems.push(...validateGeneratedMap(world, spec));
  return problems;
}
