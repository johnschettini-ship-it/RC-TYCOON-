/** Loops from the state: chain lifts, rumbles, rain, crowd; thunder timing; chain click scheduling (Phase 6 §4.2). W4-A. */
import { describe, expect, it } from 'vitest';
import { chainClickTimes, countGuestsOnScreen, crowdGain, loopTargets, nextThunderGapMs, rainIntensity, viewTiles } from '../../../src/audio/loops';
import { createAudioRng } from '../../../src/audio/rng';
import type { Listener } from '../../../src/audio/types';
import { CHAIN_CLICKS_PER_M, CROWD_FULL_GUESTS, MAX_CHAIN_LOOPS, MAX_RUMBLE_LOOPS, THUNDER_GAP_MAX_MS, THUNDER_GAP_MIN_MS } from '../../../src/data/tuning/audio';
import { mapToView } from '../../../src/render/view';
import { getLayout, pieceIndexAt, poseAt, wrapMm } from '../../../src/sim/rides/track/layout';
import type { World } from '../../../src/sim/types';
import { addGuestDirect, makeTestWorld, runTicks, stateHash } from '../../helpers/world';
import { buildCoasterPark } from '../../integration/scenario';

function listenerAt(world: World, fx: number, fy: number, zoom = 1, width = 1280, height = 720): Listener & { viewportHeight: number } {
  const map = world.state.map;
  const v = mapToView(Math.floor(fx), Math.floor(fy), 0, map.width, map.height);
  const z = map.heights[Math.floor(fy) * map.width + Math.floor(fx)] ?? 0;
  return { camera: { centerX: (v.u - v.v) * 32, centerY: (v.u + v.v + 1) * 16 - z * 8, zoom, rotation: 0 }, viewportWidth: width, viewportHeight: height, world };
}

describe('rain and crowd levels', () => {
  it('rain gain = intensity: rain 0.6, storm 1, otherwise 0', () => {
    expect(rainIntensity('rain')).toBe(0.6);
    expect(rainIntensity('storm')).toBe(1);
    for (const w of ['sunny', 'cloudy', 'hot', 'cold'] as const) expect(rainIntensity(w)).toBe(0);
  });

  it('crowd gain grows with the log of the guests on screen and caps at 1', () => {
    expect(crowdGain(0)).toBe(0);
    expect(crowdGain(10)).toBeCloseTo(Math.log(11) / Math.log(1 + CROWD_FULL_GUESTS), 10);
    expect(crowdGain(100)).toBeGreaterThan(crowdGain(10));
    expect(crowdGain(100) - crowdGain(10)).toBeLessThan(crowdGain(10));
    expect(crowdGain(CROWD_FULL_GUESTS)).toBeCloseTo(1, 10);
    expect(crowdGain(5_000)).toBe(1);
  });

  it('counts only the guests on screen', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    for (let i = 0; i < 5; i++) addGuestDirect(w, 30 * map.width + 30 + i);
    for (let i = 0; i < 3; i++) addGuestDirect(w, 2 * map.width + 2 + i);
    expect(countGuestsOnScreen(listenerAt(w, 30, 30))).toBe(5);
    expect(countGuestsOnScreen(listenerAt(w, 3, 2))).toBe(3);
    // Zoomed out far enough, all of them.
    expect(countGuestsOnScreen(listenerAt(w, 16, 16, 0.25))).toBe(8);
  });

  it('the view tile rectangle holds the camera centre and grows when zooming out', () => {
    const w = makeTestWorld();
    const a = viewTiles(listenerAt(w, 30, 30, 1));
    const b = viewTiles(listenerAt(w, 30, 30, 0.5));
    expect(a.x0).toBeLessThanOrEqual(30);
    expect(a.x1).toBeGreaterThanOrEqual(30);
    expect(a.y0).toBeLessThanOrEqual(30);
    expect(a.y1).toBeGreaterThanOrEqual(30);
    expect(b.x1 - b.x0).toBeGreaterThan(a.x1 - a.x0);
    expect(b.x0).toBeGreaterThanOrEqual(0);
    expect(b.x1).toBeLessThan(w.state.map.width);
  });
});

describe('thunder and chain timing', () => {
  it('thunder gaps are 6–20 s from the audio RNG, the same for the same seed', () => {
    const a = createAudioRng(9);
    const b = createAudioRng(9);
    for (let i = 0; i < 50; i++) {
      const g = nextThunderGapMs(a);
      expect(g).toBeGreaterThanOrEqual(THUNDER_GAP_MIN_MS);
      expect(g).toBeLessThan(THUNDER_GAP_MAX_MS);
      expect(nextThunderGapMs(b)).toBe(g);
    }
  });

  it('chain clicks are spaced 1 / rate apart up to the lookahead end', () => {
    const times = chainClickTimes(1, 1.1, 40);
    expect(times).toHaveLength(4);
    [1, 1.025, 1.05, 1.075].forEach((t, i) => expect(times[i]).toBeCloseTo(t, 9));
    expect(chainClickTimes(1, 1.1, 0)).toEqual([]);
    expect(chainClickTimes(1.2, 1.1, 40)).toEqual([]);
  });
});

/** Run the R1 coaster park until a train with speed climbs a chain piece. */
function coasterOnLift(): { world: World; rideId: number; fx: number; fy: number; v: number } {
  const { world, rideId } = buildCoasterPark(2026);
  const data = world.state.track.rides[String(rideId)];
  if (!data) throw new Error('no track data');
  for (let t = 0; t < 20_000; t++) {
    runTicks(world, 1);
    const layout = getLayout(data);
    for (const tr of data.trains) {
      if (tr.state !== 'running' || tr.parked || tr.v <= 0) continue;
      const piece = layout.pieces[pieceIndexAt(layout, wrapMm(layout, tr.s))];
      if (piece?.chain) {
        const p = poseAt(layout, tr.s);
        return { world, rideId, fx: p.x / 4, fy: p.y / 4, v: tr.v };
      }
    }
  }
  throw new Error('no train reached the lift');
}

describe('coaster loops from the state', () => {
  const lift = coasterOnLift();

  it('a train on a chain lift clicks at lift speed × 4 per metre, placed at the train', () => {
    const t = loopTargets(listenerAt(lift.world, lift.fx, lift.fy));
    expect(t.chains.length).toBeGreaterThanOrEqual(1);
    expect(t.chains.length).toBeLessThanOrEqual(MAX_CHAIN_LOOPS);
    const c = t.chains[0];
    expect(c?.rate).toBeCloseTo((lift.v / 1000) * CHAIN_CLICKS_PER_M, 6);
    expect(c?.key).toMatch(new RegExp(`^${lift.rideId}:`));
    expect(c?.gain).toBeGreaterThan(0.5);
  });

  it('moving coaster trains rumble (at most 4), with cutoff 150–600 Hz and gain from speed', () => {
    const t = loopTargets(listenerAt(lift.world, lift.fx, lift.fy));
    expect(t.rumbles.length).toBeGreaterThanOrEqual(1);
    expect(t.rumbles.length).toBeLessThanOrEqual(MAX_RUMBLE_LOOPS);
    for (const r of t.rumbles) {
      expect(r.cutoff).toBeGreaterThanOrEqual(150);
      expect(r.cutoff).toBeLessThanOrEqual(600);
      expect(r.gain).toBeGreaterThan(0);
      expect(r.gain).toBeLessThanOrEqual(1);
    }
  });

  it('nothing coaster-related is heard from far away', () => {
    const map = lift.world.state.map;
    const t = loopTargets(listenerAt(lift.world, map.width - 2, map.height - 2, 2));
    expect(t.chains).toEqual([]);
    expect(t.rumbles).toEqual([]);
  });

  it('reading loops never changes the state', () => {
    const before = stateHash(lift.world);
    for (let i = 0; i < 10; i++) loopTargets(listenerAt(lift.world, lift.fx + i, lift.fy));
    expect(stateHash(lift.world)).toBe(before);
  });

  it('weather and guests feed rain and crowd', () => {
    const w = makeTestWorld();
    w.state.management.weather.current = 'storm';
    for (let i = 0; i < 20; i++) addGuestDirect(w, 30 * w.state.map.width + 30);
    const t = loopTargets(listenerAt(w, 30, 30));
    expect(t.rain).toBe(1);
    expect(t.storm).toBe(true);
    expect(t.crowd).toBeCloseTo(crowdGain(20), 10);
    w.state.management.weather.current = 'sunny';
    expect(loopTargets(listenerAt(w, 30, 30)).storm).toBe(false);
  });
});

describe('many trains: only the loudest 4 rumble', () => {
  it('keeps the top 4 by gain', () => {
    const lift = coasterOnLift();
    const data = lift.world.state.track.rides[String(lift.rideId)];
    if (!data) throw new Error('no data');
    const base = data.trains[0];
    if (!base) throw new Error('no train');
    const layout = getLayout(data);
    // Fake 6 fast trains spread around the circuit (read-only use: positions only).
    data.trains = Array.from({ length: 6 }, (_, i) => ({ ...base, id: i + 1, s: (layout.lengthMm * i) / 6, v: 15_000, state: 'running' as const, parked: false }));
    const t = loopTargets(listenerAt(lift.world, lift.fx, lift.fy, 0.5));
    expect(t.rumbles).toHaveLength(MAX_RUMBLE_LOOPS);
    const gains = t.rumbles.map((r) => r.gain);
    expect([...gains].sort((a, b) => b - a)).toEqual(gains);
  });
});
