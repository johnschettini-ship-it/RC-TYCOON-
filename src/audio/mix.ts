/**
 * Mixing math (Phase 6 §4.1): falloff, pan, distance from the camera, volumes. Owner: W4-A. Pure (no Web Audio), so it
 * is unit-tested in Node. Reads the camera and the map; never writes state.
 */
import {
  FALLOFF_TILES_AT_ZOOM_1,
  PAN_WIDTH,
  VOLUME_EXPONENT,
} from '../data/tuning/audio';
import { mapToViewContinuous } from '../render/view';
import type { AudioVolumes, Bus, Listener } from './types';

/** Half a tile in world pixels (zoom 1): 64 × 32 px tiles, 8 px per height step (master 6.4). */
const HALF_W = 32;
const HALF_H = 16;
const STEP_PX = 8;

/** Falloff radius in tiles: `R = 24 / zoom`. */
export function falloffRadius(zoom: number): number {
  return FALLOFF_TILES_AT_ZOOM_1 / (zoom > 0 ? zoom : 1);
}

/** `gain = (max(0, 1 − d / R))²`; 0 when `d ≥ R`. */
export function falloffGain(distanceTiles: number, zoom: number): number {
  const r = falloffRadius(zoom);
  if (!(distanceTiles < r)) return 0;
  const k = 1 - distanceTiles / r;
  return k * k;
}

/** Stereo pan `clamp(dxScreen / (viewportWidth / 2), −1, 1) × 0.6`. */
export function panFor(dxScreen: number, viewportWidth: number): number {
  if (!(viewportWidth > 0)) return 0;
  let p = dxScreen / (viewportWidth / 2);
  if (p > 1) p = 1;
  else if (p < -1) p = -1;
  return p * PAN_WIDTH;
}

export interface Mix {
  /** Falloff gain, 0 < gain ≤ 1. */
  gain: number;
  /** −0.6 … 0.6. */
  pan: number;
  /** Tiles from the camera centre (on the plane at the sound's height). */
  distance: number;
  /** Horizontal offset on screen in CSS px (+ = right). */
  dxScreen: number;
}

/** World pixels (zoom 1, view rotation applied) of continuous map point (fx, fy) at height z (steps). */
export function worldPx(listener: Listener, fx: number, fy: number, z: number): { sx: number; sy: number } {
  const map = listener.world.state.map;
  const v = mapToViewContinuous(fx, fy, listener.camera.rotation, map.width, map.height);
  return { sx: (v.u - v.v) * HALF_W, sy: (v.u + v.v) * HALF_H - z * STEP_PX };
}

/**
 * Falloff and pan of a sound at continuous map point (fx, fy), height z (steps): the distance is the camera's screen
 * offset measured in tiles on the plane at the sound's height. Null when the sound is out of range (`d ≥ R`).
 */
export function mixAt(listener: Listener, fx: number, fy: number, z: number): Mix | null {
  const cam = listener.camera;
  const p = worldPx(listener, fx, fy, z);
  const dx = p.sx - cam.centerX;
  const dy = p.sy - cam.centerY;
  const a = dx / HALF_W;
  const b = dy / HALF_H;
  const du = (a + b) / 2;
  const dv = (b - a) / 2;
  const distance = Math.hypot(du, dv);
  const gain = falloffGain(distance, cam.zoom);
  if (gain <= 0) return null;
  const dxScreen = dx * cam.zoom;
  return { gain, pan: panFor(dxScreen, listener.viewportWidth), distance, dxScreen };
}

/** `mixAt` for the centre of map tile `tile` at its ground height. Null off the map or out of range. */
export function mixAtTile(listener: Listener, tile: number): Mix | null {
  const map = listener.world.state.map;
  if (!Number.isInteger(tile) || tile < 0 || tile >= map.width * map.height) return null;
  const x = tile % map.width;
  const y = (tile - x) / map.width;
  return mixAt(listener, x + 0.5, y + 0.5, map.heights[tile] ?? 0);
}

/** A 0–100 settings volume as a gain: `(v / 100)²`, clamped to 0–1. */
export function volumeGain(v: number): number {
  if (!(v > 0)) return 0;
  if (v >= 100) return 1;
  return (v / 100) ** VOLUME_EXPONENT;
}

export type BusGains = Record<Bus | 'master', number>;

/** Gains of the master and the 4 buses; mute sets the master to 0 (bus levels keep their values). */
export function busGains(v: AudioVolumes): BusGains {
  return {
    master: v.muted ? 0 : volumeGain(v.master),
    music: volumeGain(v.music),
    sfx: volumeGain(v.sfx),
    ambience: volumeGain(v.ambience),
    ui: volumeGain(v.ui),
  };
}
