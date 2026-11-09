/**
 * Groundskeeper watering plumbing (Phase 4 §4.5, Wave 3.0): with W3-D's garden rules faked, a Groundskeeper with
 * nothing else to do walks to the garden tile, waters for WATERING_TICKS, and hands over to `waterGardensNear`.
 */
import { describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ gardenTile: -1, watered: [] as number[] }));
vi.mock('../../../src/sim/scenery/gardens', () => ({
  gardenNeedsWaterNear: (_w: unknown, tile: number) => tile === fake.gardenTile && fake.watered.length === 0,
  waterGardensNear: (_w: unknown, tile: number) => void fake.watered.push(tile),
}));

import { executeCommand } from '../../../src/sim/commands';
import { tileIndex } from '../../../src/sim/map';
import { WATERING_TICKS } from '../../../src/data/tuning/scenery';
import { makeTestWorld, runTicks } from '../../helpers/world';

describe('groundskeeper watering (Phase 4 §4.5 task order)', () => {
  it('waters a garden after mess, bins, and litter', () => {
    const w = makeTestWorld();
    const r = executeCommand(w, { type: 'buildPathLine', x0: 31, y0: 59, x1: 31, y1: 50, kind: 'footpath' });
    expect(r.ok).toBe(true);
    fake.gardenTile = tileIndex(w.state.map, 31, 52);
    const hired = executeCommand(w, { type: 'hireStaff', staffType: 'groundskeeper' });
    if (!hired.ok) throw new Error(hired.reason);
    const keeper = w.state.staff.members[0]!;
    let sawWatering = false;
    for (let t = 0; t < 2000 && fake.watered.length === 0; t++) {
      runTicks(w, 1);
      if (keeper.state === 'watering') {
        sawWatering = true;
        expect(keeper.task).toBe('water');
        expect(keeper.tile).toBe(fake.gardenTile);
        expect(keeper.stateTicks).toBeLessThanOrEqual(WATERING_TICKS);
      }
    }
    expect(sawWatering).toBe(true);
    expect(fake.watered).toEqual([fake.gardenTile]);
  });
});
