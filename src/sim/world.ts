/** World factory. Owner: integrator. New games are schema 3 (Build 3). */
import { START_CASH, START_ENTRANCE_FEE, START_TICK } from '../data/tuning/core';
import { LAND_PRICE, RIGHTS_PRICE } from '../data/tuning/land';
import { newLedgerMonth } from './economy/ledger';
import { generateFreePlayMap } from './land/layout';
import { generateMap, type MapState } from './map';
import { createManagementSlice } from './management/types';
import { neutralModifiers } from './park/types';
import { emptyMonthMetrics, freePlayScenario } from './scenario/types';
import { createStaffSlice } from './staff/types';
import { createTrackSlice } from './rides/track/types';
import { monthIndexOf } from './time';
import type { GameState, World } from './types';

/**
 * Map layouts for a free-play park:
 * - `classic` (default): the Build 1 layout — every tile owned except the outer ring, entrance at x = 31 on the south
 *   edge. Tests and Build 1 flows use it.
 * - `freePlay`: the Phase 4 §4.9 New Park layout (owned centre square, a ring for sale, 4 unowned outer tiles),
 *   built by `generateFreePlayMap` (W3-G).
 */
export type MapLayout = 'classic' | 'freePlay';

export interface NewWorldOptions {
  seed: number;
  parkName: string;
  /** Square map size in tiles. Default 64 (`classic`) or 96 (`freePlay`, W3-G). */
  mapSize?: number;
  layout?: MapLayout;
}

function newMap(opts: NewWorldOptions): MapState {
  if (opts.layout === 'freePlay') return generateFreePlayMap(opts.mapSize);
  const size = opts.mapSize;
  return size === undefined ? generateMap() : generateMap({ width: size, height: size });
}

export function createGameState(opts: NewWorldOptions): GameState {
  return {
    schemaVersion: 3,
    seed: opts.seed >>> 0,
    rng: opts.seed >>> 0,
    tick: START_TICK,
    nextId: 1,
    map: newMap(opts),
    park: {
      name: opts.parkName,
      cash: START_CASH,
      entranceFee: START_ENTRANCE_FEE,
      open: false,
      rating: 0,
      turnedAway: 0,
      recentLeavers: [],
      arrivalCarry: 0,
      guestsArrivedTotal: 0,
      afterDark: true,
      landPrice: LAND_PRICE,
      rightsPrice: RIGHTS_PRICE,
    },
    modifiers: neutralModifiers(),
    rides: [],
    stalls: [],
    guests: [],
    economy: { ledger: [newLedgerMonth(monthIndexOf(START_TICK))] },
    track: createTrackSlice(),
    staff: createStaffSlice(),
    management: createManagementSlice(),
    elevatedPaths: [],
    scenery: [],
    scenario: freePlayScenario(),
    monthMetrics: emptyMonthMetrics(monthIndexOf(START_TICK)),
    shows: [],
  };
}

export function createWorld(opts: NewWorldOptions): World {
  return { state: createGameState(opts), events: [] };
}
