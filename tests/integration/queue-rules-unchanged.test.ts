/**
 * Queue clarity (spec 2026-11-18): only where queueing guests are DRAWN changes. These golden values were recorded
 * on commit 0372c2b, before any queue clarity code. If a later change moves a queueing guest's simulated tile, the
 * exit it steps off to (`stepOffQueue`), litter, crowding or any other tile reader, these hashes change.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deserialize } from '../../src/save';
import type { World } from '../../src/sim/types';
import { runTicks, stateHash } from '../helpers/world';
import { PHASE1_SEED, runPhase1Game } from './scenario';

const LONG = 120_000;
const V2 = join(__dirname, '../fixtures/save-v2.tcsave.json');

function loadV2(): World {
  const r = deserialize(readFileSync(V2, 'utf8'));
  if (!r.ok) throw new Error(r.error);
  return r.world;
}

/** Top-level state keys a loaded save has at 0372c2b: queue clarity adds no saved field. */
const STATE_KEYS_0372C2B = ['economy','elevatedPaths','guests','management','map','modifiers','monthMetrics','nextId','park','rides','rng','scenario','scenery','schemaVersion','seed','shows','staff','stalls','tick','track'];

describe('queue clarity changes no game rule (golden values from 0372c2b)', () => {
  it('phase 1 game on seed PHASE1_SEED gives the same state as before queue clarity', () => {
    const run = runPhase1Game(PHASE1_SEED);
    expect(run.world.state.rides.map((r) => r.totals.riders)).toEqual([323, 396]);
    expect(run.world.state.park.cash).toBe(1282780);
    expect(stateHash(run.world)).toBe('fa1dc5b5');
  }, LONG);

  it('save-v2 fixture (70 guests queueing) loads and runs 4000 ticks to the same state as before', () => {
    const world = loadV2();
    runTicks(world, 4000);
    expect(world.state.park.cash).toBe(553029);
    expect(stateHash(world)).toBe('7c5bfd3f');
  }, LONG);

  it('save-v2 fixture loads with guests in queues and no new state fields', () => {
    const world = loadV2();
    const queueing = world.state.guests.filter((g) => g.state === 'queueing');
    expect(queueing.length).toBeGreaterThan(0);
    for (const g of queueing) {
      const ride = world.state.rides.find((r) => r.id === g.activityId);
      expect(ride?.queue).toContain(g.id);
    }
    expect(Object.keys(world.state).sort()).toEqual(STATE_KEYS_0372C2B);
  });
});
