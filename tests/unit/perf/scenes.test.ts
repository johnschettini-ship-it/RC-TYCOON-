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
import { FLAT_RIDES, RIDE_COLOUR_CHOICES } from '../../../src/data/catalog/flatRides';
import { mapPointToWorld, tileCentreWorld } from '../../../src/input/camera';
import { Content } from '../../../src/sim/map';
import type { World } from '../../../src/sim/types';
import { buildPerfScene, PERF_SCENES, SCALE_SCENE, SCENE_SAVED_AT } from '../../perf/scenes';

const DIR = join(__dirname, '../../perf');
const write = !!process.env.TC_WRITE_SCENES;

describe('perf scenes (Phase 6 §4.6)', () => {
  it.runIf(write)('regenerates the scene saves', { timeout: 600_000 }, () => {
    // `TC_WRITE_SCENES=coaster` regenerates one scene; `1` regenerates all.
    for (const scene of [...PERF_SCENES, SCALE_SCENE].filter((x) => process.env.TC_WRITE_SCENES === '1' || process.env.TC_WRITE_SCENES === x.id)) {
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

  it('scale (stage 1 round 3 item 7): 18 flat ride types twice, 5,000 scenery items, 3,000 guests on 128 × 128', { timeout: 60_000 }, () => {
    const r = deserialize(readFileSync(join(DIR, SCALE_SCENE.file), 'utf8'));
    if (!r.ok) throw new Error(r.error);
    const s = r.world.state;
    expect(s.map.width).toBe(128);
    const flat = s.rides.filter((x) => x.kind === 'flat' && x.status === 'open');
    expect(flat).toHaveLength(SCALE_SCENE.flatRides);
    expect(new Set(flat.map((x) => x.defId)).size).toBe(SCALE_SCENE.rideTypes);
    expect(s.scenery.length).toBeGreaterThanOrEqual(SCALE_SCENE.scenery);
    expect(new Set(s.scenery.map((x) => x.rotation)).size).toBe(4);
    expect(s.guests.length).toBeGreaterThanOrEqual(SCALE_SCENE.guests * 0.95);
    expect(s.guests.length).toBeLessThanOrEqual(SCALE_SCENE.guests);
    for (let k = 0; k < 20; k++) stepTick(r.world);
    expect(validateState(r.world.state)).toBeNull();
  });

  /** Rides whose footprint (box of its 4 corners, game projection) is inside / touches the bench's phone view. */
  function inView(world: World, zoom: number, rot: 0 | 1 | 2 | 3): { inside: number; touching: number } {
    const map = world.state.map;
    const f = PERF_SCENES.find((x) => x.id === 'rides')!.focus;
    const c = tileCentreWorld(map, f.y * map.width + f.x, rot);
    const hx = 390 / 2 / zoom;
    const hy = 844 / 2 / zoom;
    let inside = 0;
    let touching = 0;
    for (const r of world.state.rides) {
      const def = FLAT_RIDES.find((d) => d.id === r.defId)!;
      const pts = [[r.x, r.y], [r.x + def.w, r.y], [r.x, r.y + def.d], [r.x + def.w, r.y + def.d]].map(([a, b]) => mapPointToWorld(map, a as number, b as number, 0, rot));
      const minX = Math.min(...pts.map((p) => p.sx));
      const maxX = Math.max(...pts.map((p) => p.sx));
      const minY = Math.min(...pts.map((p) => p.sy));
      const maxY = Math.max(...pts.map((p) => p.sy));
      if (minX >= c.sx - hx && maxX <= c.sx + hx && minY >= c.sy - hy && maxY <= c.sy + hy) inside++;
      if (maxX >= c.sx - hx && minX <= c.sx + hx && maxY >= c.sy - hy && minY <= c.sy + hy) touching++;
    }
    return { inside, touching };
  }

  it('rides (phase 8c batch 1, new rides batch A): each of the 19 flat rides (carousel twice), open, connected, about 300 guests', { timeout: 60_000 }, () => {
    const info = PERF_SCENES.find((x) => x.id === 'rides');
    expect(info).toBeDefined();
    const r = deserialize(readFileSync(join(DIR, info!.file), 'utf8'));
    if (!r.ok) throw new Error(r.error);
    const s = r.world.state;
    const flat = s.rides.filter((x) => x.kind === 'flat');
    // Every flat ride type, plus a second carousel (flat-ride colours: one type twice in two colours).
    expect(new Set(flat.map((x) => x.defId))).toEqual(new Set(FLAT_RIDES.map((d) => d.id)));
    expect(flat.map((x) => x.defId).sort()).toEqual([...FLAT_RIDES.map((d) => d.id), 'carousel'].sort());
    expect(info!.flatRides).toBe(20);
    expect(flat).toHaveLength(20);
    expect(info!.trackRides).toBe(0);
    // Paths: from the park entrance over footpath and queue tiles, every ride's entrance and exit tile is reached.
    const reach = new Set<number>([s.map.entranceTile]);
    const todo = [s.map.entranceTile];
    while (todo.length > 0) {
      const t = todo.pop() as number;
      const x = t % s.map.width;
      for (const n of [x > 0 ? t - 1 : -1, x < s.map.width - 1 ? t + 1 : -1, t - s.map.width, t + s.map.width]) {
        if (n < 0 || n >= s.map.content.length || reach.has(n)) continue;
        if (s.map.content[n] !== Content.Footpath && s.map.content[n] !== Content.Queue) continue;
        reach.add(n);
        todo.push(n);
      }
    }
    for (const ride of flat) {
      const def = FLAT_RIDES.find((d) => d.id === ride.defId)!;
      expect(ride.status, ride.defId).toBe('open');
      expect(ride.x + def.w, ride.defId).toBeLessThanOrEqual(s.map.width);
      expect(ride.y + def.d, ride.defId).toBeLessThanOrEqual(s.map.height);
      expect(ride.entrance, ride.defId).not.toBeNull();
      expect(reach.has(ride.entrance!.outside), `${ride.defId} entrance`).toBe(true);
      expect(reach.has(ride.exit!.outside), `${ride.defId} exit`).toBe(true);
    }
    expect(s.guests.length).toBeGreaterThanOrEqual(285);
    expect(s.guests.length).toBeLessThanOrEqual(300);
  });

  it('rides (flat-ride colours): 6 coloured rides in varied colours, one ride type twice in two colours', { timeout: 60_000 }, () => {
    const r = deserialize(readFileSync(join(DIR, PERF_SCENES.find((x) => x.id === 'rides')!.file), 'utf8'));
    if (!r.ok) throw new Error(r.error);
    const flat = r.world.state.rides.filter((x) => x.kind === 'flat');
    const coloured = flat.filter((x) => x.colour !== undefined && x.colour !== null);
    expect(coloured).toHaveLength(6);
    for (const x of coloured) expect(RIDE_COLOUR_CHOICES, x.defId).toContain(x.colour);
    // Varied: the six use six different colours (every choice once).
    expect(new Set(coloured.map((x) => x.colour)).size).toBe(6);
    // The largest set (carousel) and two the reviews named are coloured.
    for (const id of ['carousel', 'big_wheel', 'haunted_manor']) expect(coloured.some((x) => x.defId === id), id).toBe(true);
    // One type placed twice, in two different colours (two coloured sets of one ride).
    const twice = FLAT_RIDES.map((d) => flat.filter((x) => x.defId === d.id)).filter((g) => g.length > 1);
    expect(twice).toHaveLength(1);
    const pair = twice[0]!;
    expect(pair).toHaveLength(2);
    expect(pair.every((x) => x.colour !== undefined && x.colour !== null)).toBe(true);
    expect(pair[0]!.colour).not.toBe(pair[1]!.colour);
    expect(validateState(r.world.state)).toBeNull();
  });

  it('rides: the bench camera sees the park (zoom 0.5 from the focus, 390 x 844)', { timeout: 60_000 }, () => {
    const r = deserialize(readFileSync(join(DIR, PERF_SCENES.find((x) => x.id === 'rides')!.file), 'utf8'));
    if (!r.ok) throw new Error(r.error);
    // The bench holds zoom 0.5 at rotation 0 (rotation 2 is the same band, turned over): all 20 footprints inside.
    for (const rot of [0, 2] as const) expect(inView(r.world, 0.5, rot), `rot ${rot}`).toEqual({ inside: 20, touching: 20 });
    // Rotations 1 and 3 turn the band across the narrow view: the view cannot hold 18 (it fits 12 tiles of
    // |u-v| there); the measured counts (7 inside, 10 touching) are the floor.
    for (const rot of [1, 3] as const) {
      const v = inView(r.world, 0.5, rot);
      expect(v.inside, `rot ${rot}`).toBeGreaterThanOrEqual(7);
      expect(v.touching, `rot ${rot}`).toBeGreaterThanOrEqual(10);
    }
    // Zoom 2 at the focus (the bench's first and last zoom step): the narrow view sees a strip of the band.
    expect(inView(r.world, 2, 0).touching).toBeGreaterThanOrEqual(6);
  });

  it('rides: the committed save is what buildPerfScene(rides) builds', { timeout: 120_000 }, () => {
    const info = PERF_SCENES.find((x) => x.id === 'rides')!;
    const fresh = serialize(buildPerfScene('rides'), GAME_VERSION, SCENE_SAVED_AT);
    expect(readFileSync(join(DIR, info.file), 'utf8')).toBe(fresh);
  });
});
