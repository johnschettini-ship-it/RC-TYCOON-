/** World factory. Owner: integrator. */
import { START_CASH, START_ENTRANCE_FEE, START_TICK } from '../data/tuning/core';
import { newLedgerMonth } from './economy/ledger';
import { generateMap } from './map';
import { createManagementSlice } from './management/types';
import { neutralModifiers } from './park/types';
import { createStaffSlice } from './staff/types';
import { createTrackSlice } from './rides/track/types';
import { monthIndexOf } from './time';
import type { GameState, World } from './types';

export interface NewWorldOptions {
  seed: number;
  parkName: string;
  mapSize?: number;
}

export function createGameState(opts: NewWorldOptions): GameState {
  const size = opts.mapSize;
  return {
    schemaVersion: 1,
    seed: opts.seed >>> 0,
    rng: opts.seed >>> 0,
    tick: START_TICK,
    nextId: 1,
    map: size === undefined ? generateMap() : generateMap({ width: size, height: size }),
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
    },
    modifiers: neutralModifiers(),
    rides: [],
    stalls: [],
    guests: [],
    economy: { ledger: [newLedgerMonth(monthIndexOf(START_TICK))] },
    track: createTrackSlice(),
    staff: createStaffSlice(),
    management: createManagementSlice(),
  };
}

export function createWorld(opts: NewWorldOptions): World {
  return { state: createGameState(opts), events: [] };
}
