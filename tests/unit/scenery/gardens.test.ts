/**
 * Gardens (Phase 4 §4.5): drain 3 per game hour (5 hot), wilt below 64 (Calm source marked dirty), rain refill,
 * watering below 128 from a path tile, the rare "These flowers look sad" thought, and real Groundskeepers working in
 * the order mess → full bins → litter → gardens.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dirty = vi.hoisted(() => ({ tiles: [] as number[] }));
vi.mock('../../../src/sim/fields/api', async (orig) => {
  const real = await orig<typeof import('../../../src/sim/fields/api')>();
  return { ...real, markFieldsDirty: (_w: unknown, tile: number) => void dirty.tiles.push(tile) };
});

import { BIN_EMPTY_AT } from '../../../src/data/tuning/staff';
import { GARDEN_DRAIN, GARDEN_DRAIN_HOT, GARDEN_WATER_BELOW, GARDEN_WILT_BELOW, WATERING_TICKS } from '../../../src/data/tuning/scenery';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../../../src/data/tuning/core';
import { executeCommand } from '../../../src/sim/commands';
import { THOUGHT } from '../../../src/sim/guests/thoughts';
import { PathItem, tileIndex } from '../../../src/sim/map';
import { findScenery, isWilted } from '../../../src/sim/scenery/api';
import { gardenNeedsWaterNear, waterGardensNear } from '../../../src/sim/scenery/gardens';
import { hourlyScenery } from '../../../src/sim/scenery/update';
import type { StaffTask } from '../../../src/sim/staff/types';
import type { World } from '../../../src/sim/types';
import { addGuestDirect, runTicks, stateHash } from '../../helpers/world';
import { placeOk, sceneryWorld } from './helpers';

beforeEach(() => {
  dirty.tiles = [];
});

function weather(w: World, kind: 'sunny' | 'hot' | 'rain' | 'storm' | 'cold' | 'cloudy'): void {
  w.state.management.weather.current = kind;
}

describe('garden drain and wilting', () => {
  it('drains 3 per game hour, 5 when hot, never below 0; other items keep 255', () => {
    const w = sceneryWorld();
    weather(w, 'sunny');
    const bed = placeOk(w, 'bed_mixed', 10, 10);
    const oak = placeOk(w, 'oak_round', 12, 10);
    hourlyScenery(w);
    expect(findScenery(w, bed)?.waterLevel).toBe(255 - GARDEN_DRAIN);
    expect(GARDEN_DRAIN).toBe(3);
    weather(w, 'hot');
    hourlyScenery(w);
    expect(findScenery(w, bed)?.waterLevel).toBe(255 - 3 - GARDEN_DRAIN_HOT);
    expect(GARDEN_DRAIN_HOT).toBe(5);
    weather(w, 'cold');
    findScenery(w, bed)!.waterLevel = 2;
    hourlyScenery(w);
    expect(findScenery(w, bed)?.waterLevel).toBe(0);
    expect(findScenery(w, oak)?.waterLevel).toBe(255);
  });

  it('wilts below 64 and marks the Calm source dirty once when it crosses the line', () => {
    const w = sceneryWorld();
    weather(w, 'sunny');
    const id = placeOk(w, 'flower_tub', 10, 10);
    const item = findScenery(w, id)!;
    item.waterLevel = GARDEN_WILT_BELOW + 3;
    dirty.tiles = [];
    hourlyScenery(w);
    expect(item.waterLevel).toBe(64);
    expect(isWilted(item)).toBe(false);
    expect(dirty.tiles).toEqual([]);
    hourlyScenery(w);
    expect(item.waterLevel).toBe(61);
    expect(isWilted(item)).toBe(true);
    expect(dirty.tiles).toEqual([tileIndex(w.state.map, 10, 10)]);
    hourlyScenery(w);
    expect(dirty.tiles).toHaveLength(1);
  });

  it('rain and storms refill every garden to 255 (and un-wilt it)', () => {
    const w = sceneryWorld();
    const a = placeOk(w, 'bed_tulip', 10, 10);
    const b = placeOk(w, 'pumpkin_patch', 14, 10);
    findScenery(w, a)!.waterLevel = 10;
    findScenery(w, b)!.waterLevel = 200;
    weather(w, 'rain');
    dirty.tiles = [];
    hourlyScenery(w);
    expect(findScenery(w, a)?.waterLevel).toBe(255);
    expect(findScenery(w, b)?.waterLevel).toBe(255);
    expect(dirty.tiles).toEqual([tileIndex(w.state.map, 10, 10)]);
    findScenery(w, a)!.waterLevel = 30;
    weather(w, 'storm');
    hourlyScenery(w);
    expect(findScenery(w, a)?.waterLevel).toBe(255);
  });

  it('runs at every hour start through the tick pipeline', () => {
    const w = sceneryWorld();
    weather(w, 'cloudy');
    w.state.management.weather.next = 'cloudy';
    w.state.management.weather.nextChangeTick = 10 ** 9;
    const id = placeOk(w, 'bed_mixed', 10, 10);
    const t0 = w.state.tick;
    const toHour = TICKS_PER_HOUR - (t0 % TICKS_PER_HOUR);
    runTicks(w, toHour + 5 * TICKS_PER_HOUR);
    expect(findScenery(w, id)?.waterLevel).toBe(255 - 6 * 3);
  });
});

describe('watering from a path tile', () => {
  it('serves gardens on the 8 neighbouring tiles below 128; watering sets them to 255', () => {
    const w = sceneryWorld();
    const map = w.state.map;
    const path = tileIndex(map, 20, 20);
    const diag = placeOk(w, 'bed_mixed', 21, 21);
    const far = placeOk(w, 'bed_tulip', 22, 20);
    placeOk(w, 'oak_round', 19, 20);
    expect(gardenNeedsWaterNear(w, path)).toBe(false);
    findScenery(w, diag)!.waterLevel = GARDEN_WATER_BELOW;
    expect(gardenNeedsWaterNear(w, path)).toBe(false);
    findScenery(w, diag)!.waterLevel = GARDEN_WATER_BELOW - 1;
    findScenery(w, far)!.waterLevel = 5;
    expect(gardenNeedsWaterNear(w, path)).toBe(true);
    waterGardensNear(w, path);
    expect(findScenery(w, diag)?.waterLevel).toBe(255);
    expect(findScenery(w, far)?.waterLevel).toBe(5);
    expect(gardenNeedsWaterNear(w, path)).toBe(false);
    expect(gardenNeedsWaterNear(w, tileIndex(map, 21, 20))).toBe(true);
    expect(gardenNeedsWaterNear(w, -1)).toBe(false);
  });

  it('watering a wilted garden marks its Calm source dirty', () => {
    const w = sceneryWorld();
    const id = placeOk(w, 'fern_cluster', 21, 20);
    findScenery(w, id)!.waterLevel = 12;
    dirty.tiles = [];
    waterGardensNear(w, tileIndex(w.state.map, 20, 20));
    expect(dirty.tiles).toEqual([tileIndex(w.state.map, 21, 20)]);
  });
});

describe('"These flowers look sad"', () => {
  it('only guests next to a wilted garden think it, rarely, with the seeded RNG; same seed same result', () => {
    const run = (): { near: number; far: number; hash: string } => {
      const w = sceneryWorld(777);
      weather(w, 'sunny');
      const map = w.state.map;
      const id = placeOk(w, 'bed_mixed', 10, 10);
      findScenery(w, id)!.waterLevel = 20;
      const near = addGuestDirect(w, tileIndex(map, 11, 10));
      const far = addGuestDirect(w, tileIndex(map, 30, 30));
      let nearCount = 0;
      let hours = 0;
      for (let d = 0; d < 6; d++) {
        for (let h = 0; h < 24; h++) {
          w.state.tick += TICKS_PER_HOUR;
          findScenery(w, id)!.waterLevel = 20;
          hourlyScenery(w);
          hours++;
        }
        nearCount += near.thoughts.filter((t) => t.id === THOUGHT.flowersSad && t.tick > w.state.tick - TICKS_PER_DAY).length;
      }
      expect(hours).toBe(144);
      return { near: nearCount, far: far.thoughts.filter((t) => t.id === THOUGHT.flowersSad).length, hash: stateHash(w) };
    };
    const a = run();
    expect(a.near).toBeGreaterThan(0);
    expect(a.near).toBeLessThanOrEqual(6); // at most once per game day (master R5)
    expect(a.far).toBe(0);
    expect(run()).toEqual(a);
  });

  it('no wilted garden: no RNG draw', () => {
    const w = sceneryWorld();
    weather(w, 'sunny');
    placeOk(w, 'bed_mixed', 10, 10);
    addGuestDirect(w, tileIndex(w.state.map, 11, 10));
    const rng = w.state.rng;
    hourlyScenery(w);
    expect(w.state.rng).toBe(rng);
  });
});

describe('Groundskeepers water gardens (real staff)', () => {
  /** A footpath line x = 31, y 30–59 (from the entrance stub), a groundskeeper, and nothing else to do. */
  function park(): World {
    const w = sceneryWorld(4242);
    weather(w, 'cloudy');
    w.state.management.weather.next = 'cloudy';
    w.state.management.weather.nextChangeTick = 10 ** 9;
    const r = executeCommand(w, { type: 'buildPathLine', x0: 31, y0: 59, x1: 31, y1: 30, kind: 'footpath' });
    if (!r.ok) throw new Error(r.reason);
    return w;
  }

  it('work in the order mess → full bins → litter → gardens', () => {
    const w = park();
    const map = w.state.map;
    const garden = placeOk(w, 'bed_tulip', 32, 50);
    findScenery(w, garden)!.waterLevel = 40;
    map.mess[tileIndex(map, 31, 52)] = 1;
    const binTile = tileIndex(map, 31, 54);
    map.pathItem[binTile] = PathItem.Bin;
    map.binFill[binTile] = BIN_EMPTY_AT;
    map.litter[tileIndex(map, 31, 56)] = 3;
    const hired = executeCommand(w, { type: 'hireStaff', staffType: 'groundskeeper' });
    if (!hired.ok) throw new Error(hired.reason);
    const keeper = w.state.staff.members[0]!;
    const order: StaffTask[] = [];
    for (let t = 0; t < 4000 && findScenery(w, garden)!.waterLevel < 255; t++) {
      runTicks(w, 1);
      const task = keeper.task;
      if ((task === 'mess' || task === 'bin' || task === 'sweep' || task === 'water') && order[order.length - 1] !== task) order.push(task);
    }
    expect(order).toEqual(['mess', 'bin', 'sweep', 'water']);
    expect(findScenery(w, garden)?.waterLevel).toBe(255);
    expect(map.mess[tileIndex(map, 31, 52)]).toBe(0);
    expect(map.binFill[binTile]).toBe(0);
    expect(map.litter[tileIndex(map, 31, 56)]).toBe(0);
  });

  it('a watering takes WATERING_TICKS (2 s)', () => {
    const w = park();
    const id = placeOk(w, 'bed_mixed', 30, 40);
    findScenery(w, id)!.waterLevel = 100;
    executeCommand(w, { type: 'hireStaff', staffType: 'groundskeeper' });
    const keeper = w.state.staff.members[0]!;
    let watering = 0;
    for (let t = 0; t < 3000 && findScenery(w, id)!.waterLevel !== 255; t++) {
      runTicks(w, 1);
      if (keeper.state === 'watering') watering++;
    }
    expect(WATERING_TICKS).toBe(40);
    expect(watering).toBe(WATERING_TICKS);
  });

  it('gardens in a Groundskeeper\'s patrol area never wilt over 10 hot game days', () => {
    const w = park();
    const map = w.state.map;
    w.state.management.weather.current = 'hot';
    w.state.management.weather.next = 'hot';
    const ids: number[] = [];
    for (let y = 36; y <= 54; y += 2) {
      ids.push(placeOk(w, 'bed_mixed', 30, y));
      ids.push(placeOk(w, 'shrub_flowering', 32, y + 1));
    }
    // Gardens planted over a day, not all in the same tick: their levels start spread out.
    ids.forEach((id, k) => {
      findScenery(w, id)!.waterLevel = 255 - 6 * k;
    });
    const hired = executeCommand(w, { type: 'hireStaff', staffType: 'groundskeeper' });
    if (!hired.ok || hired.id === undefined) throw new Error('hire');
    const patrol: number[] = [];
    for (let y = 34; y <= 57; y++) patrol.push(tileIndex(map, 31, y));
    expect(executeCommand(w, { type: 'editPatrol', staffId: hired.id, add: patrol, remove: [] }).ok).toBe(true);
    let lowest = 255;
    for (let t = 0; t < 10 * TICKS_PER_DAY; t++) {
      runTicks(w, 1);
      if (t % 50 === 0) for (const id of ids) lowest = Math.min(lowest, findScenery(w, id)!.waterLevel);
    }
    expect(lowest).toBeGreaterThanOrEqual(GARDEN_WILT_BELOW);
    for (const id of ids) expect(isWilted(findScenery(w, id)!)).toBe(false);
  }, 60_000);
});
