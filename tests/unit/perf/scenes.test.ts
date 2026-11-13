/**
 * Phase 6 §4.6 benchmark scenes (W4-E): the three saves in `tests/perf/` load through the real save path, are
 * schema 3, and hold the parks the spec names. `TC_WRITE_SCENES=1` regenerates them from `tests/perf/scenes.ts`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deserialize, GAME_VERSION, serialize, validateState } from '../../../src/save';
import { canOpenTrackRide } from '../../../src/sim/rides/track/api';
import { getLayout } from '../../../src/sim/rides/track/layout';
import { stepTick } from '../../../src/sim/tick';
import { buildPerfScene, PERF_SCENES, SCENE_SAVED_AT } from '../../perf/scenes';

const DIR = join(__dirname, '../../perf');
const write = !!process.env.TC_WRITE_SCENES;

describe('perf scenes (Phase 6 §4.6)', () => {
  it.runIf(write)('regenerates the scene saves', { timeout: 600_000 }, () => {
    // `TC_WRITE_SCENES=coaster` regenerates one scene; `1` regenerates all.
    for (const scene of PERF_SCENES.filter((x) => process.env.TC_WRITE_SCENES === '1' || process.env.TC_WRITE_SCENES === x.id)) {
      const world = buildPerfScene(scene.id);
      expect(validateState(world.state)).toBeNull();
      writeFileSync(join(DIR, scene.file), serialize(world, GAME_VERSION, SCENE_SAVED_AT));
    }
  });

  for (const scene of PERF_SCENES) {
    it(`${scene.id}: loads, validates, and holds the spec park`, { timeout: 60_000 }, () => {
      const r = deserialize(readFileSync(join(DIR, scene.file), 'utf8'));
      if (!r.ok) throw new Error(r.error);
      const s = r.world.state;
      expect(s.schemaVersion).toBe(3);
      expect(s.map.width).toBe(scene.mapSize);
      expect(s.map.height).toBe(scene.mapSize);
      // Guests may leave or ride, but the crowd stays within 5% of the spec count when saved.
      expect(s.guests.length).toBeGreaterThanOrEqual(scene.guests * 0.95);
      expect(s.guests.length).toBeLessThanOrEqual(scene.guests);
      expect(s.rides.filter((x) => x.kind === 'track' && x.status === 'open')).toHaveLength(scene.trackRides);
      expect(s.rides.filter((x) => x.kind === 'flat' && x.status === 'open')).toHaveLength(scene.flatRides);
      expect(s.shows).toHaveLength(scene.shows);
      // The park runs on from the save.
      for (let k = 0; k < 20; k++) stepTick(r.world);
      expect(validateState(r.world.state)).toBeNull();
    });
  }

  it('coaster: the steel coaster can open, has a lift, two curves, and 600 guests', { timeout: 60_000 }, () => {
    const info = PERF_SCENES.find((x) => x.id === 'coaster');
    expect(info).toBeDefined();
    const r = deserialize(readFileSync(join(DIR, info!.file), 'utf8'));
    if (!r.ok) throw new Error(r.error);
    const s = r.world.state;
    expect(s.guests.length).toBeGreaterThanOrEqual(570);
    expect(s.guests.length).toBeLessThanOrEqual(600);
    const ride = s.rides.find((x) => x.defId === 'steel_coaster');
    expect(ride).toBeDefined();
    expect(canOpenTrackRide(r.world, ride!)).toBeNull();
    const data = s.track.rides[String(ride!.id)]!;
    expect(data.circuitClosed).toBe(true);
    expect(data.trainConfig).toMatchObject({ trains: 2, carsPerTrain: 4 });
    expect(data.pieces.some((p) => p.chain)).toBe(true);
    expect(data.pieces.filter((p) => p.defId.startsWith('turn_')).length).toBeGreaterThanOrEqual(2);
    expect(s.rides.some((x) => x.defId === 'carousel')).toBe(true);
    expect(s.stalls.some((x) => x.defId === 'snack_shack')).toBe(true);
    // Lift and drop: crest 32 m over ground 8 m is a 24 m drop (steel pieces step in pairs, so 25 m is not reachable).
    const zs = data.pieces.map((p) => p.z);
    expect(Math.max(...zs) - Math.min(...zs)).toBe(24);
    expect(s.scenery.length).toBeGreaterThanOrEqual(20);
    expect(getLayout(data).lengthMm).toBeGreaterThan(0);
  });
});
