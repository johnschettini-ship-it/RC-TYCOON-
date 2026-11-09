/**
 * Hourly scenery upkeep (Phase 4 §4.5), run at every hour start (tick order: after the rating, before the Calm and
 * Buzz refresh). Owner: W3-D.
 *
 * - Gardens (`needsWater`) drain 3 per game hour, 5 when the weather is hot, never below 0.
 * - Rain waters every garden: at each hour start while it rains (rain or storm) every garden is set to 255. The first
 *   such hour is the moment rain starts (weather changes fall on hour starts), so this needs no saved "rain started"
 *   flag and gives the same result after a load.
 * - An item that crosses the wilt line (64), either way, calls `markFieldsDirty` for its tiles.
 * - "These flowers look sad" (rare): each guest within GARDEN_REACH of a wilted garden thinks it with chance
 *   FLOWERS_SAD_CHANCE per hour (the seeded RNG is drawn only for such guests, so parks without wilted gardens draw
 *   nothing). Guests in ascending id order; the thought repeat window (one game day) applies.
 */
import { getSceneryDef } from '../../data/catalog';
import { FLOWERS_SAD_CHANCE, GARDEN_DRAIN, GARDEN_DRAIN_HOT, GARDEN_REACH, GARDEN_WATER_MAX, GARDEN_WILT_BELOW } from '../../data/tuning/scenery';
import { addThought, THOUGHT } from '../guests/thoughts';
import { rngChance } from '../rng';
import type { World } from '../types';
import { setWaterLevel } from './gardens';
import { itemTiles } from './index';

/** Scratch mask of tiles near a wilted garden, reused between hours (derived, never saved). */
const sadMasks = new WeakMap<World, Uint8Array>();

export function hourlyScenery(world: World): void {
  const s = world.state;
  if (s.scenery.length === 0) return;
  const weather = s.management.weather.current;
  const raining = weather === 'rain' || weather === 'storm';
  const drain = weather === 'hot' ? GARDEN_DRAIN_HOT : GARDEN_DRAIN;
  let wilted = 0;
  for (const item of s.scenery) {
    const def = getSceneryDef(item.defId);
    if (!def || !def.needsWater) continue;
    const level = raining ? GARDEN_WATER_MAX : Math.max(0, item.waterLevel - drain);
    if (level !== item.waterLevel) setWaterLevel(world, item, def, level);
    if (item.waterLevel < GARDEN_WILT_BELOW) wilted++;
  }
  if (wilted > 0 && s.guests.length > 0) sadThoughts(world);
}

function sadThoughts(world: World): void {
  const s = world.state;
  const map = s.map;
  const n = map.width * map.height;
  let mask = sadMasks.get(world);
  if (!mask || mask.length !== n) {
    mask = new Uint8Array(n);
    sadMasks.set(world, mask);
  } else {
    mask.fill(0);
  }
  for (const item of s.scenery) {
    const def = getSceneryDef(item.defId);
    if (!def || !def.needsWater || item.waterLevel >= GARDEN_WILT_BELOW) continue;
    for (const t of itemTiles(map, item, def)) {
      const tx = t % map.width;
      const ty = (t - tx) / map.width;
      for (let y = Math.max(0, ty - GARDEN_REACH); y <= Math.min(map.height - 1, ty + GARDEN_REACH); y++) {
        for (let x = Math.max(0, tx - GARDEN_REACH); x <= Math.min(map.width - 1, tx + GARDEN_REACH); x++) mask[y * map.width + x] = 1;
      }
    }
  }
  for (const g of s.guests) {
    if (g.state === 'riding' || g.tile < 0 || g.tile >= n || mask[g.tile] !== 1) continue;
    if (rngChance(s, FLOWERS_SAD_CHANCE)) addThought(world, g, THOUGHT.flowersSad);
  }
}
