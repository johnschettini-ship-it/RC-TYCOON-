/** Falloff, pan, distance, and volume math (Phase 6 §4.1, §8). W4-A. */
import { describe, expect, it } from 'vitest';
import { busGains, falloffGain, falloffRadius, mixAt, mixAtTile, panFor, volumeGain } from '../../../src/audio/mix';
import type { Listener } from '../../../src/audio/types';
import type { Camera } from '../../../src/render/types';
import { mapToView } from '../../../src/render/view';
import type { Dir } from '../../../src/sim/map';
import type { World } from '../../../src/sim/types';
import { makeTestWorld } from '../../helpers/world';

/** Camera centred on the middle of tile (x, y) at its ground height, as the e2e helper `centerOn` does. */
function cameraOn(world: World, x: number, y: number, zoom = 1, rotation: Dir = 0): Camera {
  const map = world.state.map;
  const h = map.heights[y * map.width + x] ?? 0;
  const v = mapToView(x, y, rotation, map.width, map.height);
  return { centerX: (v.u - v.v) * 32, centerY: (v.u + v.v + 1) * 16 - h * 8, zoom, rotation };
}

function listenerOn(world: World, x: number, y: number, zoom = 1, rotation: Dir = 0, width = 1280): Listener {
  return { camera: cameraOn(world, x, y, zoom, rotation), viewportWidth: width, world };
}

describe('falloff (Phase 6 §4.1)', () => {
  it('R = 24 / zoom tiles', () => {
    expect(falloffRadius(1)).toBe(24);
    expect(falloffRadius(2)).toBe(12);
    expect(falloffRadius(0.25)).toBe(96);
  });

  it('gain = (max(0, 1 − d / R))²', () => {
    expect(falloffGain(0, 1)).toBe(1);
    expect(falloffGain(12, 1)).toBeCloseTo(0.25, 10);
    expect(falloffGain(18, 1)).toBeCloseTo(0.0625, 10);
    expect(falloffGain(6, 2)).toBeCloseTo(0.25, 10);
    expect(falloffGain(48, 0.25)).toBeCloseTo(0.25, 10);
  });

  it('is silent at d ≥ R', () => {
    expect(falloffGain(24, 1)).toBe(0);
    expect(falloffGain(30, 1)).toBe(0);
    expect(falloffGain(12, 2)).toBe(0);
    expect(falloffGain(96, 0.25)).toBe(0);
  });
});

describe('pan (Phase 6 §4.1)', () => {
  it('= clamp(dxScreen / (viewportWidth / 2), −1, 1) × 0.6', () => {
    expect(panFor(0, 1000)).toBe(0);
    expect(panFor(250, 1000)).toBeCloseTo(0.3, 10);
    expect(panFor(-500, 1000)).toBeCloseTo(-0.6, 10);
  });

  it('clamps to ±0.6 off screen and is centred with no viewport', () => {
    expect(panFor(5_000, 1000)).toBeCloseTo(0.6, 10);
    expect(panFor(-5_000, 1000)).toBeCloseTo(-0.6, 10);
    expect(panFor(10, 0)).toBe(0);
  });
});

describe('a world sound from the camera centre', () => {
  const world = makeTestWorld();

  it('a sound on the centre tile is full and centred', () => {
    const m = mixAtTile(listenerOn(world, 30, 30), 30 * world.state.map.width + 30);
    expect(m).not.toBeNull();
    expect(m?.gain).toBeCloseTo(1, 10);
    expect(m?.pan).toBeCloseTo(0, 10);
  });

  it('12 tiles along +x at zoom 1: d = 12 → gain 0.25, pan right by 384 px of 640', () => {
    const m = mixAtTile(listenerOn(world, 30, 30), 30 * world.state.map.width + 42);
    expect(m?.distance).toBeCloseTo(12, 10);
    expect(m?.gain).toBeCloseTo(0.25, 10);
    expect(m?.pan).toBeCloseTo((384 / 640) * 0.6, 10);
  });

  it('the same sound is silent at zoom 2 (R = 12) and louder at zoom 0.5 (R = 48)', () => {
    const tile = 30 * world.state.map.width + 42;
    expect(mixAtTile(listenerOn(world, 30, 30, 2), tile)).toBeNull();
    expect(mixAtTile(listenerOn(world, 30, 30, 0.5), tile)?.gain).toBeCloseTo(0.75 ** 2, 10);
  });

  it('pan follows the view rotation (the same tile is on the left after a half turn)', () => {
    const m = mixAtTile(listenerOn(world, 30, 30, 1, 2), 30 * world.state.map.width + 42);
    expect(m?.gain).toBeCloseTo(0.25, 10);
    expect(m?.pan).toBeCloseTo(-(384 / 640) * 0.6, 10);
  });

  it('continuous map points work too (trains between tiles)', () => {
    const map = world.state.map;
    const z = map.heights[30 * map.width + 30] ?? 0;
    const m = mixAt(listenerOn(world, 30, 30), 30.5 + 6, 30.5, z);
    expect(m?.distance).toBeCloseTo(6, 10);
  });

  it('a tile off the map is not placed', () => {
    expect(mixAtTile(listenerOn(world, 30, 30), -1)).toBeNull();
    expect(mixAtTile(listenerOn(world, 30, 30), world.state.map.width * world.state.map.height)).toBeNull();
  });
});

describe('volumes (Phase 6 §4.9 audio settings)', () => {
  it('a 0–100 volume becomes (v / 100)²', () => {
    expect(volumeGain(100)).toBe(1);
    expect(volumeGain(50)).toBeCloseTo(0.25, 10);
    expect(volumeGain(0)).toBe(0);
    expect(volumeGain(150)).toBe(1);
    expect(volumeGain(-5)).toBe(0);
  });

  it('bus and master gains come from the settings; mute silences the master', () => {
    const v = { master: 80, music: 50, sfx: 80, ambience: 60, ui: 70, muted: false };
    expect(busGains(v)).toEqual({ master: volumeGain(80), music: volumeGain(50), sfx: volumeGain(80), ambience: volumeGain(60), ui: volumeGain(70) });
    expect(busGains({ ...v, muted: true }).master).toBe(0);
    expect(busGains({ ...v, muted: true }).sfx).toBe(volumeGain(80));
  });
});
