/**
 * Loop targets read from the state (Phase 6 §4.2): `coaster_chain` (trains on a lift), `coaster_rumble` (moving coaster
 * trains, at most 4), `rain` (weather intensity), `crowd` (log of the guests on screen); thunder timing; chain click
 * times. Owner: W4-A. Pure: it reads `GameState` (and the derived track layout cache) and never writes it.
 */
import {
  CHAIN_CLICKS_PER_M,
  CROWD_FULL_GUESTS,
  MAX_CHAIN_LOOPS,
  MAX_RUMBLE_LOOPS,
  RAIN_INTENSITY,
  RUMBLE_CUTOFF_MAX_HZ,
  RUMBLE_CUTOFF_MIN_HZ,
  RUMBLE_FULL_SPEED_MS,
  RUMBLE_MIN_SPEED_MS,
  THUNDER_GAP_MAX_MS,
  THUNDER_GAP_MIN_MS,
} from '../data/tuning/audio';
import { GROUND_LEVEL } from '../data/tuning/core';
import { getTrackRideDef, type WeatherKey } from '../data/catalog';
import { viewToMapContinuous } from '../render/view';
import { getLayout, newSamplePoint, pieceIndexAt, poseAt, wrapMm } from '../sim/rides/track/layout';
import { mixAt, worldPx } from './mix';
import type { AudioRng } from './rng';
import type { Listener } from './types';

/** A listener that also knows the viewport height (CSS px). Without it the height is taken as 9 / 16 of the width. */
export interface ScreenListener extends Listener {
  viewportHeight?: number;
}

export function viewportHeightOf(l: ScreenListener): number {
  return l.viewportHeight !== undefined && l.viewportHeight > 0 ? l.viewportHeight : Math.round((l.viewportWidth * 9) / 16);
}

/** Is continuous map point (fx, fy) at height z (steps) inside the viewport? */
export function onScreen(l: ScreenListener, fx: number, fy: number, z: number): boolean {
  const p = worldPx(l, fx, fy, z);
  const cam = l.camera;
  const px = (p.sx - cam.centerX) * cam.zoom + l.viewportWidth / 2;
  const py = (p.sy - cam.centerY) * cam.zoom + viewportHeightOf(l) / 2;
  return px >= 0 && px < l.viewportWidth && py >= 0 && py < viewportHeightOf(l);
}

/** Guests whose tile centre is on screen. */
export function countGuestsOnScreen(l: ScreenListener): number {
  const map = l.world.state.map;
  let n = 0;
  for (const g of l.world.state.guests) {
    if (g.tile < 0) continue;
    const x = g.tile % map.width;
    const y = (g.tile - x) / map.width;
    if (onScreen(l, x + 0.5, y + 0.5, g.z)) n++;
  }
  return n;
}

/** The visible map tiles (inclusive rectangle, clamped to the map), measured on the ground plane. */
export interface ViewTileRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function viewTiles(l: ScreenListener): ViewTileRect {
  const map = l.world.state.map;
  const cam = l.camera;
  const w = l.viewportWidth;
  const h = viewportHeightOf(l);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [px, py] of [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ] as const) {
    const sx = cam.centerX + (px - w / 2) / cam.zoom;
    const sy = cam.centerY + (py - h / 2) / cam.zoom + GROUND_LEVEL * 8;
    const a = sx / 32;
    const b = sy / 16;
    const m = viewToMapContinuous((a + b) / 2, (b - a) / 2, cam.rotation, map.width, map.height);
    x0 = Math.min(x0, m.x);
    y0 = Math.min(y0, m.y);
    x1 = Math.max(x1, m.x);
    y1 = Math.max(y1, m.y);
  }
  const clamp = (v: number, max: number): number => Math.max(0, Math.min(max, Math.floor(v)));
  return { x0: clamp(x0, map.width - 1), y0: clamp(y0, map.height - 1), x1: clamp(x1, map.width - 1), y1: clamp(y1, map.height - 1) };
}

/** `rain` gain = weather intensity (rain 0.6, storm 1). */
export function rainIntensity(weather: WeatherKey): number {
  return weather === 'rain' ? RAIN_INTENSITY.rain : weather === 'storm' ? RAIN_INTENSITY.storm : 0;
}

/** `crowd` gain = ln(1 + n) / ln(1 + 400), capped at 1. */
export function crowdGain(guestsOnScreen: number): number {
  if (!(guestsOnScreen > 0)) return 0;
  return Math.min(1, Math.log1p(guestsOnScreen) / Math.log1p(CROWD_FULL_GUESTS));
}

/** Gap to the next thunder clap in a storm (ms), from the audio RNG. */
export function nextThunderGapMs(rng: AudioRng): number {
  return rng.range(THUNDER_GAP_MIN_MS, THUNDER_GAP_MAX_MS);
}

/** Audio-clock times (s) of chain clicks from `next` (inclusive) up to `until` (exclusive) at `rate` clicks per second. */
export function chainClickTimes(next: number, until: number, rate: number): number[] {
  if (!(rate > 0) || !(next < until)) return [];
  const step = 1 / rate;
  const out: number[] = [];
  for (let k = 0; ; k++) {
    const t = next + k * step;
    if (t >= until) break;
    out.push(t);
  }
  return out;
}

export interface ChainTarget {
  /** `rideId:trainId`. */
  key: string;
  /** Clicks per second (lift speed in m/s × 4). */
  rate: number;
  gain: number;
  pan: number;
}

export interface RumbleTarget {
  key: string;
  /** Falloff × speed level, 0–1. */
  gain: number;
  pan: number;
  /** Low-pass cutoff (Hz), 150–600 from speed. */
  cutoff: number;
}

export interface LoopTargets {
  /** The loudest chain lifts (at most `MAX_CHAIN_LOOPS`), loudest first. */
  chains: ChainTarget[];
  /** The loudest moving coaster trains (at most 4), loudest first. */
  rumbles: RumbleTarget[];
  /** `rain` gain 0–1. */
  rain: number;
  /** `crowd` gain 0–1. */
  crowd: number;
  /** A storm: random thunder. */
  storm: boolean;
}

const sp = newSamplePoint();

function byGain<T extends { gain: number; key: string }>(a: T, b: T): number {
  return b.gain - a.gain || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

/** Everything the loops should do for this view of the state. */
export function loopTargets(l: ScreenListener): LoopTargets {
  const s = l.world.state;
  const chains: ChainTarget[] = [];
  const rumbles: RumbleTarget[] = [];
  for (const ride of s.rides) {
    if (ride.kind !== 'track') continue;
    const data = s.track.rides[String(ride.id)];
    if (!data || data.trains.length === 0 || data.pieces.length === 0) continue;
    const coaster = getTrackRideDef(data.typeId)?.drive === 'gravity';
    const layout = getLayout(data);
    if (layout.lengthMm <= 0) continue;
    for (const tr of data.trains) {
      if (tr.state !== 'running' || tr.parked || !(tr.v > 0)) continue;
      const speed = tr.v / 1000;
      const ws = wrapMm(layout, tr.s);
      const onChain = layout.pieces[pieceIndexAt(layout, ws)]?.chain === true;
      if (!onChain && !(coaster && speed >= RUMBLE_MIN_SPEED_MS)) continue;
      const pose = poseAt(layout, ws, sp);
      const m = mixAt(l, pose.x / 4, pose.y / 4, pose.z);
      if (!m) continue;
      const key = `${ride.id}:${tr.id}`;
      if (onChain) chains.push({ key, rate: speed * CHAIN_CLICKS_PER_M, gain: m.gain, pan: m.pan });
      if (coaster && speed >= RUMBLE_MIN_SPEED_MS) {
        const level = Math.min(1, speed / RUMBLE_FULL_SPEED_MS);
        rumbles.push({ key, gain: m.gain * level, pan: m.pan, cutoff: RUMBLE_CUTOFF_MIN_HZ + (RUMBLE_CUTOFF_MAX_HZ - RUMBLE_CUTOFF_MIN_HZ) * level });
      }
    }
  }
  chains.sort(byGain);
  rumbles.sort(byGain);
  const weather = s.management.weather.current;
  return {
    chains: chains.slice(0, MAX_CHAIN_LOOPS),
    rumbles: rumbles.slice(0, MAX_RUMBLE_LOOPS),
    rain: rainIntensity(weather),
    crowd: crowdGain(countGuestsOnScreen(l)),
    storm: weather === 'storm',
  };
}
