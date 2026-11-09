/** Web Audio engine wiring with a fake `AudioContext` (Phase 6 §4.1, §9). W4-A. */
import { describe, expect, it } from 'vitest';
import { createAudioEngine, type EngineOptions } from '../../../src/audio/engine';
import { busGains, volumeGain } from '../../../src/audio/mix';
import type { AudioVolumes, Listener } from '../../../src/audio/types';
import { HIDE_RAMP_MS, MAX_SFX_VOICES } from '../../../src/data/tuning/audio';
import type { World } from '../../../src/sim/types';
import { addGuestDirect, makeTestWorld, runTicks } from '../../helpers/world';
import { buildCoasterPark } from '../../integration/scenario';
import { getLayout, pieceIndexAt, poseAt, wrapMm } from '../../../src/sim/rides/track/layout';
import { CHAIN_CLICKS_PER_M } from '../../../src/data/tuning/audio';
import { asAudioContext, FakeAudioContext, FakeGain, type FakeNode, FakePanner } from './fakeAudio';

function listenerOn(world: World, x: number, y: number, zoom = 1): Listener & { viewportHeight: number } {
  const map = world.state.map;
  const h = map.heights[y * map.width + x] ?? 0;
  return { camera: { centerX: (x - y) * 32, centerY: (x + y + 1) * 16 - h * 8, zoom, rotation: 0 }, viewportWidth: 1280, viewportHeight: 720, world };
}

interface Timers {
  pending: { fn: () => void; ms: number; id: number }[];
  opts: Pick<EngineOptions, 'setTimer' | 'clearTimer'>;
  flush(): void;
}

function fakeTimers(): Timers {
  let next = 1;
  const t: Timers = {
    pending: [],
    opts: {
      setTimer: (fn, ms) => {
        const id = next++;
        t.pending.push({ fn, ms, id });
        return id;
      },
      clearTimer: (h) => {
        t.pending = t.pending.filter((p) => p.id !== h);
      },
    },
    flush() {
      const ps = t.pending;
      t.pending = [];
      for (const p of ps) p.fn();
    },
  };
  return t;
}

function setup(state: 'suspended' | 'running' = 'suspended') {
  const fake = new FakeAudioContext({ state });
  const timers = fakeTimers();
  const engine = createAudioEngine({ createContext: () => asAudioContext(fake), seed: 11, ...timers.opts });
  return { fake, engine, timers };
}

const world = makeTestWorld();
const centre = listenerOn(world, 30, 30);
const tileAt = (x: number, y: number): number => y * world.state.map.width + x;
const DEFAULTS: AudioVolumes = { master: 80, music: 50, sfx: 80, ambience: 60, ui: 70, muted: false };

describe('before the first gesture', () => {
  it('is silent: no context, state `none`, no music host, play and update do nothing', () => {
    let made = 0;
    const engine = createAudioEngine({
      createContext: () => {
        made++;
        return asAudioContext(new FakeAudioContext());
      },
    });
    expect(engine.state()).toBe('none');
    engine.play([{ id: 'ui_click', place: null }], centre);
    engine.update(centre, 100);
    engine.setVolumes(DEFAULTS);
    engine.setHidden(true);
    engine.setHidden(false);
    expect(made).toBe(0);
    expect(engine.musicHost()).toBeNull();
    expect(engine.graph()).toBeNull();
  });

  it('a browser without Web Audio stays `none` and never throws', () => {
    const engine = createAudioEngine({
      createContext: () => {
        throw new Error('no AudioContext');
      },
    });
    expect(() => engine.unlock()).not.toThrow();
    expect(engine.state()).toBe('none');
  });
});

describe('unlock and the graph', () => {
  it('the first unlock creates the context once and resumes it (state `running`)', () => {
    const { fake, engine } = setup();
    engine.unlock();
    engine.unlock();
    expect(engine.state()).toBe('running');
    expect(fake.resumeCalls).toBe(1);
    expect(fake.ofKind('compressor')).toHaveLength(1);
  });

  it('sources → bus gain (ui, sfx, ambience, music) → master gain → compressor → output', () => {
    const { fake, engine } = setup();
    engine.unlock();
    const g = engine.graph();
    if (!g) throw new Error('no graph');
    const master = g.master as unknown as FakeGain;
    const comp = g.compressor as unknown as FakeNode;
    expect(master.outputs).toEqual([comp]);
    expect(comp.outputs).toEqual([fake.destination]);
    for (const bus of ['ui', 'sfx', 'ambience', 'music'] as const) {
      expect((g.buses[bus] as unknown as FakeGain).outputs).toEqual([master]);
    }
    const host = engine.musicHost();
    expect(host?.ctx).toBe(fake as unknown);
    expect(host?.output).toBe(g.buses.music);
  });

  it('volumes and mute come from the settings: bus and master gains', () => {
    const { fake, engine } = setup();
    engine.setVolumes({ ...DEFAULTS, master: 50, sfx: 20 });
    engine.unlock();
    const g = engine.graph();
    if (!g) throw new Error('no graph');
    const at = (n: unknown, t: number): number => (n as FakeGain).gain.at(t);
    expect(at(g.master, 0)).toBeCloseTo(volumeGain(50), 6);
    expect(at(g.buses.sfx, 0)).toBeCloseTo(volumeGain(20), 6);
    expect(at(g.buses.music, 0)).toBeCloseTo(volumeGain(50), 6);
    fake.currentTime = 1;
    engine.setVolumes({ ...DEFAULTS, muted: true });
    expect(at(g.master, 2)).toBeCloseTo(0, 4);
    expect(at(g.buses.ui, 2)).toBeCloseTo(busGains(DEFAULTS).ui, 4);
    engine.setVolumes(DEFAULTS);
    expect(at(g.master, 3)).toBeCloseTo(busGains(DEFAULTS).master, 4);
  });
});

describe('hidden tab', () => {
  it('ramps the master to 0 in 100 ms, then suspends; visible resumes and ramps back', () => {
    const { fake, engine, timers } = setup();
    engine.setVolumes(DEFAULTS);
    engine.unlock();
    const master = engine.graph()?.master as unknown as FakeGain;
    fake.currentTime = 5;
    engine.setHidden(true);
    expect(master.gain.at(5)).toBeCloseTo(volumeGain(80), 6);
    expect(master.gain.at(5 + HIDE_RAMP_MS / 2000)).toBeCloseTo(volumeGain(80) / 2, 6);
    expect(master.gain.at(5 + HIDE_RAMP_MS / 1000)).toBeCloseTo(0, 6);
    expect(fake.suspendCalls).toBe(0);
    expect(timers.pending.map((p) => p.ms)).toEqual([HIDE_RAMP_MS]);
    timers.flush();
    expect(fake.suspendCalls).toBe(1);
    expect(engine.state()).toBe('suspended');
    // Hidden: nothing plays.
    const n = fake.nodes.length;
    engine.play([{ id: 'ui_click', place: null }], centre);
    expect(fake.nodes.length).toBe(n);
    fake.currentTime = 5.1;
    engine.setHidden(false);
    expect(engine.state()).toBe('running');
    expect(master.gain.at(5.1)).toBeCloseTo(0, 6);
    expect(master.gain.at(5.1 + HIDE_RAMP_MS / 1000)).toBeCloseTo(volumeGain(80), 6);
  });

  it('coming back before the ramp ends cancels the suspend', () => {
    const { fake, engine, timers } = setup();
    engine.unlock();
    engine.setHidden(true);
    engine.setHidden(false);
    expect(timers.pending).toEqual([]);
    expect(fake.suspendCalls).toBe(0);
  });

  it('an unlock while hidden does not resume (the tab is quiet)', () => {
    const { fake, engine } = setup();
    engine.setHidden(true);
    engine.unlock();
    expect(fake.resumeCalls).toBe(0);
    expect((engine.graph()?.master as unknown as FakeGain).gain.at(0)).toBe(0);
  });
});

describe('one-shots: cooldown, voices, falloff, pan', () => {
  it('the same id plays at most once per 60 ms; other ids are free', () => {
    const { fake, engine } = setup();
    engine.unlock();
    fake.currentTime = 1;
    engine.play([{ id: 'cash_in', place: null }], centre);
    fake.currentTime = 1.03;
    engine.play([{ id: 'cash_in', place: null }, { id: 'ride_bell', place: null }], centre);
    fake.currentTime = 1.06;
    engine.play([{ id: 'cash_in', place: null }], centre);
    expect(engine.debug().played.map((p) => p.id)).toEqual(['cash_in', 'ride_bell', 'cash_in']);
  });

  it('a batch keeps the loudest request of each id', () => {
    const { fake, engine } = setup();
    engine.unlock();
    fake.currentTime = 1;
    engine.play(
      [
        { id: 'cash_in', place: { tile: tileAt(40, 30) } },
        { id: 'cash_in', place: { tile: tileAt(31, 30) } },
      ],
      centre,
    );
    const played = engine.debug().played;
    expect(played).toHaveLength(1);
    expect(played[0]?.gain).toBeCloseTo((1 - 1 / 24) ** 2, 6);
  });

  it('world sounds get falloff gain and stereo pan; out of range they do not play', () => {
    const { fake, engine } = setup();
    engine.unlock();
    fake.currentTime = 1;
    const mark = fake.nodes.length;
    engine.play([{ id: 'splash', place: { tile: tileAt(42, 30) } }], centre);
    const panner = fake.nodes.slice(mark).find((n): n is FakePanner => n instanceof FakePanner);
    expect(panner?.pan.at(1)).toBeCloseTo((384 / 640) * 0.6, 6);
    expect(engine.debug().played[0]?.gain).toBeCloseTo(0.25, 6);
    fake.currentTime = 2;
    engine.play([{ id: 'splash', place: { tile: tileAt(60, 30) } }], centre);
    expect(engine.debug().played).toHaveLength(1);
    // UI sounds have no panner.
    const mark2 = fake.nodes.length;
    engine.play([{ id: 'ui_open', place: null }], centre);
    expect(fake.nodes.slice(mark2).some((n) => n instanceof FakePanner)).toBe(false);
  });
});

describe('voice stealing in the engine', () => {
  it('a full pool of priority 3 voices: a priority 1 sound is dropped, a priority 3 sound steals the oldest', () => {
    const { fake, engine } = setup();
    engine.unlock();
    // Thunder lasts 2.5 s (priority 3); play 24 of them 61 ms apart.
    for (let i = 0; i < MAX_SFX_VOICES; i++) {
      fake.currentTime = 1 + i * 0.061;
      engine.play([{ id: 'thunder', place: null }], centre);
    }
    expect(engine.debug().voices).toBe(MAX_SFX_VOICES);
    const firstStart = engine.debug().slots[0]?.startMs;
    fake.currentTime = 2.5;
    engine.play([{ id: 'cash_in', place: null }], centre);
    expect(engine.debug().played.at(-1)?.id).toBe('thunder');
    expect(engine.debug().dropped.at(-1)).toBe('cash_in');
    engine.play([{ id: 'splash', place: null }], centre);
    expect(engine.debug().played.at(-1)?.id).toBe('splash');
    expect(engine.debug().voices).toBe(MAX_SFX_VOICES);
    expect(engine.debug().slots.some((s) => s.startMs === firstStart)).toBe(false);
  });

  it('voices free up when their sounds end', () => {
    const { fake, engine } = setup();
    engine.unlock();
    fake.currentTime = 1;
    engine.play([{ id: 'ui_click', place: null }, { id: 'thunder', place: null }], centre);
    expect(engine.debug().voices).toBe(2);
    fake.currentTime = 1.5;
    engine.update(centre, 1_500);
    expect(engine.debug().voices).toBe(1);
    fake.currentTime = 4;
    engine.update(centre, 4_000);
    expect(engine.debug().voices).toBe(0);
  });
});

describe('loops from the state', () => {
  it('rain follows the weather on the ambience bus; storms add thunder from the audio RNG', () => {
    const { fake, engine } = setup();
    engine.unlock();
    const w = makeTestWorld();
    w.state.management.weather.current = 'rain';
    const l = listenerOn(w, 30, 30);
    fake.currentTime = 1;
    engine.update(l, 1_000);
    expect(engine.debug().loops.rain).toBeCloseTo(0.6, 6);
    const amb = engine.graph()?.buses.ambience as unknown as FakeNode;
    const rainSrc = fake.sources().find((s) => s.kind === 'bufferSource' && (s as unknown as { loop: boolean }).loop && fake.reaches(s, amb));
    expect(rainSrc).toBeDefined();
    w.state.management.weather.current = 'storm';
    let thunders = 0;
    for (let i = 1; i <= 600; i++) {
      fake.currentTime = 1 + i * 0.1;
      engine.update(l, 1_000 + i * 100);
    }
    thunders = engine.debug().played.filter((p) => p.id === 'thunder').length;
    // 60 s of storm with 6–20 s gaps: 2 to 10 claps.
    expect(thunders).toBeGreaterThanOrEqual(2);
    expect(thunders).toBeLessThanOrEqual(10);
    expect(engine.debug().loops.rain).toBe(1);
    w.state.management.weather.current = 'sunny';
    fake.currentTime = 100;
    engine.update(l, 100_000);
    expect(engine.debug().loops.rain).toBe(0);
  });

  it('the crowd loop follows the guests on screen', () => {
    const { fake, engine } = setup();
    engine.unlock();
    const w = makeTestWorld();
    for (let i = 0; i < 30; i++) addGuestDirect(w, 30 * w.state.map.width + 30);
    fake.currentTime = 1;
    engine.update(listenerOn(w, 30, 30), 1_000);
    expect(engine.debug().loops.crowd).toBeGreaterThan(0.4);
    fake.currentTime = 2;
    engine.update(listenerOn(w, 2, 90), 2_000);
    expect(engine.debug().loops.crowd).toBe(0);
  });

  it('loops refresh at most every 100 ms', () => {
    const { fake, engine } = setup();
    engine.unlock();
    const w = makeTestWorld();
    fake.currentTime = 1;
    engine.update(listenerOn(w, 30, 30), 1_000);
    w.state.management.weather.current = 'rain';
    engine.update(listenerOn(w, 30, 30), 1_050);
    expect(engine.debug().loops.rain).toBe(0);
    engine.update(listenerOn(w, 30, 30), 1_100);
    expect(engine.debug().loops.rain).toBeCloseTo(0.6, 6);
  });
});

describe('coaster loops in the engine', () => {
  it('a train on the lift clicks at lift speed × 4 per metre and takes a voice; the loop stops when the view leaves', () => {
    const { world, rideId } = buildCoasterPark(2026);
    const data = world.state.track.rides[String(rideId)];
    if (!data) throw new Error('no data');
    let at: { fx: number; fy: number; v: number } | null = null;
    for (let t = 0; t < 20_000 && !at; t++) {
      runTicks(world, 1);
      const layout = getLayout(data);
      for (const tr of data.trains) {
        if (tr.state !== 'running' || tr.parked || tr.v <= 0) continue;
        if (!layout.pieces[pieceIndexAt(layout, wrapMm(layout, tr.s))]?.chain) continue;
        const p = poseAt(layout, tr.s);
        at = { fx: p.x / 4, fy: p.y / 4, v: tr.v };
      }
    }
    if (!at) throw new Error('no train on the lift');
    const { fake, engine } = setup();
    engine.unlock();
    fake.currentTime = 1;
    const mark = fake.nodes.length;
    engine.update(listenerOn(world, Math.floor(at.fx), Math.floor(at.fy)), 1_000);
    expect(engine.debug().loops.chains).toBe(1);
    expect(engine.debug().slots.some((s) => s.id === 'coaster_chain' && s.endMs === Infinity)).toBe(true);
    const rate = (at.v / 1000) * CHAIN_CLICKS_PER_M;
    const clicks = fake.nodes
      .slice(mark)
      .filter((n): n is FakeNode & { startTime: number; startDuration?: number } => n.kind === 'bufferSource' && (n as unknown as { loop: boolean }).loop === false && (n as unknown as { startTime: number | null }).startTime !== null && (n as unknown as { startTime: number }).startTime >= 1)
      .map((n) => n.startTime)
      .sort((a, b) => a - b);
    expect(clicks.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < clicks.length; i++) expect((clicks[i] as number) - (clicks[i - 1] as number)).toBeCloseTo(1 / rate, 6);
    for (const c of clicks) expect(c).toBeLessThan(1.1 + 1e-9);
    // Move the view far away: the loop fades out and frees its voice.
    fake.currentTime = 2;
    const map = world.state.map;
    engine.update(listenerOn(world, map.width - 2, map.height - 2, 2), 2_000);
    expect(engine.debug().loops.chains).toBe(0);
    expect(engine.debug().slots.some((s) => s.id === 'coaster_chain')).toBe(false);
  });
});
