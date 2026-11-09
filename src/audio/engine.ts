/**
 * Web Audio engine (Phase 6 §4.1). Owner: W4-A. Silent until the first `unlock` (a user gesture); never writes state.
 *
 * Graph: sources → voice gain (falloff) → `StereoPannerNode` (world sounds) → bus gain (`ui`, `sfx`, `ambience`,
 * `music`) → master gain → `DynamicsCompressorNode` → destination. 24 SFX voices with stealing of the oldest voice of
 * lower or equal priority (none → the new sound does not play); 60 ms same-id cooldown; falloff
 * `(max(0, 1 − d / R))²` with `R = 24 / zoom` tiles and pan `clamp(dxScreen / (width / 2), −1, 1) × 0.6`
 * (`./mix.ts`); hidden tab: master ramps to 0 in 100 ms, then the context suspends; visible: resume and ramp back.
 * Loops (`coaster_chain`, `coaster_rumble`, `rain`, `crowd`) and storm thunder follow the state (`./loops.ts`).
 * `createContext` and the timers are injectable so unit tests use a fake `AudioContext` (Node has none).
 */
import {
  AUDIO_SEED,
  CHAIN_LOOKAHEAD_MS,
  HIDE_RAMP_MS,
  LOOP_GLIDE_S,
  LOOP_UPDATE_MS,
  MAX_SFX_VOICES,
  PLAYED_LOG_MAX,
  SFX_COOLDOWN_MS,
  STEAL_FADE_S,
  VOLUME_DEFAULTS,
  VOLUME_GLIDE_S,
} from '../data/tuning/audio';
import { loopTargets, nextThunderGapMs, type LoopTargets, type ScreenListener } from './loops';
import { busGains, mixAtTile } from './mix';
import { createAudioRng } from './rng';
import { createNoiseBank, RECIPES, type NoiseBank, type SfxVoice } from './sfx';
import { BUSES, sfxInfo, type AudioEngine, type AudioVolumes, type Bus, type Listener, type MusicHost, type SfxId, type SfxInfo, type SoundRequest } from './types';
import { VoicePool, Cooldown } from './voices';

export interface EngineOptions {
  /** Makes the `AudioContext` on the first unlock (default: `new AudioContext()`). */
  createContext?: () => AudioContext;
  /** Seed of the audio RNG (noise, thunder timing, cheer voices); never the sim RNG. */
  seed?: number;
  /** Timer for the hidden-tab suspend (default `setTimeout` / `clearTimeout`). */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface EngineGraph {
  master: GainNode;
  compressor: DynamicsCompressorNode;
  buses: Record<Bus, GainNode>;
}

export interface PlayedSound {
  id: SfxId;
  /** Audio-clock start (s). */
  at: number;
  gain: number;
  pan: number;
}

export interface EngineDebug {
  /** The last played one-shots and loop starts, newest last. */
  played: readonly PlayedSound[];
  /** One-shots refused for want of a voice, newest last. */
  dropped: readonly SfxId[];
  voices: number;
  slots: readonly { id: SfxId; priority: number; startMs: number; endMs: number }[];
  loops: { chains: number; rumbles: number; rain: number; crowd: number };
  hidden: boolean;
  volumes: AudioVolumes;
}

/** The engine with its test and debug views (`window.__tcAudio`). */
export interface WebAudioEngine extends AudioEngine {
  graph(): EngineGraph | null;
  debug(): EngineDebug;
}

/** A sound's nodes as the engine owns them. */
interface Live {
  id: SfxId;
  voice: SfxVoice;
  gain: GainNode;
  panner: StereoPannerNode | null;
  /** Chain and rumble loops: their key, so a stolen loop leaves its map. */
  loopKey: string | null;
}

interface PooledLoop {
  live: Live;
  slotKey: number;
}

/** Disconnect a voice this long after its end (s), so a release is never cut. */
const TAIL_S = 0.05;

function defaultContext(): AudioContext {
  const w = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const C = w.AudioContext ?? w.webkitAudioContext;
  if (!C) throw new Error('Web Audio is not available');
  return new C({ latencyHint: 'interactive' });
}

export function createAudioEngine(opts: EngineOptions = {}): WebAudioEngine {
  const makeContext = opts.createContext ?? defaultContext;
  const setTimer = opts.setTimer ?? ((fn: () => void, ms: number): unknown => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h: unknown): void => clearTimeout(h as ReturnType<typeof setTimeout>));
  const rng = createAudioRng(opts.seed ?? AUDIO_SEED);

  let ctx: AudioContext | null = null;
  let graph: EngineGraph | null = null;
  let noise: NoiseBank | null = null;
  let volumes: AudioVolumes = { ...VOLUME_DEFAULTS, muted: false };
  let hidden = false;
  let suspendTimer: unknown = null;
  let suspendedByHide = false;

  const pool = new VoicePool<Live>(MAX_SFX_VOICES);
  const cooldown = new Cooldown(SFX_COOLDOWN_MS);
  const dying: { atMs: number; live: Live }[] = [];
  const chains = new Map<string, PooledLoop>();
  const rumbles = new Map<string, PooledLoop>();
  let rainLive: Live | null = null;
  let crowdLive: Live | null = null;
  let rainLevel = 0;
  let crowdLevel = 0;
  let lastLoopMs: number | null = null;
  let nextThunder: number | null = null;
  const played: PlayedSound[] = [];
  const dropped: SfxId[] = [];

  const ready = (): boolean => ctx !== null && graph !== null && noise !== null && ctx.state === 'running' && !hidden;

  function log<T>(list: T[], item: T): void {
    list.push(item);
    if (list.length > PLAYED_LOG_MAX) list.splice(0, list.length - PLAYED_LOG_MAX);
  }

  function setLevel(p: AudioParam, v: number, now: number, immediate: boolean): void {
    if (immediate) {
      p.cancelScheduledValues(now);
      p.value = v;
      p.setValueAtTime(v, now);
    } else {
      p.setTargetAtTime(v, now, VOLUME_GLIDE_S);
    }
  }

  function applyVolumes(immediate: boolean): void {
    if (!ctx || !graph) return;
    const now = ctx.currentTime;
    const gains = busGains(volumes);
    for (const b of BUSES) setLevel(graph.buses[b].gain, gains[b], now, immediate);
    if (!hidden) setLevel(graph.master.gain, gains.master, now, immediate);
    else if (immediate) setLevel(graph.master.gain, 0, now, true);
  }

  function buildGraph(c: AudioContext): EngineGraph {
    const compressor = c.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    const master = c.createGain();
    master.connect(compressor);
    compressor.connect(c.destination);
    const buses = {} as Record<Bus, GainNode>;
    for (const b of BUSES) {
      const g = c.createGain();
      g.connect(master);
      buses[b] = g;
    }
    return { master, compressor, buses };
  }

  /** iOS: a silent one-sample buffer started inside the gesture opens the audio session. */
  function kick(c: AudioContext): void {
    try {
      const b = c.createBufferSource();
      b.buffer = c.createBuffer(1, 1, c.sampleRate);
      b.connect(c.destination);
      b.start(0);
    } catch {
      // Not needed where it fails.
    }
  }

  function makeLive(id: SfxId, bus: Bus, gain: number, pan: number, placed: boolean, param: number, now: number, loopKey: string | null): Live {
    const c = ctx as AudioContext;
    const g = graph as EngineGraph;
    const vg = c.createGain();
    vg.gain.value = gain;
    let panner: StereoPannerNode | null = null;
    if (placed && typeof c.createStereoPanner === 'function') {
      panner = c.createStereoPanner();
      panner.pan.value = pan;
      vg.connect(panner);
      panner.connect(g.buses[bus]);
    } else {
      vg.connect(g.buses[bus]);
    }
    try {
      const voice = RECIPES[id]({ ctx: c, out: vg, t: now, param, rng, noise: noise as NoiseBank });
      return { id, voice, gain: vg, panner, loopKey };
    } catch (e) {
      vg.disconnect();
      panner?.disconnect();
      throw e;
    }
  }

  function dispose(live: Live): void {
    live.gain.disconnect();
    live.panner?.disconnect();
  }

  function kill(live: Live, now: number, fadeS = STEAL_FADE_S): void {
    live.gain.gain.cancelScheduledValues(now);
    live.gain.gain.setTargetAtTime(0, now, fadeS);
    live.voice.stop(now + 3 * fadeS);
    dying.push({ atMs: (now + 3 * fadeS + TAIL_S) * 1000, live });
    if (live.loopKey !== null) (live.id === 'coaster_chain' ? chains : rumbles).delete(live.loopKey);
  }

  function reap(nowMs: number): void {
    for (const s of pool.reap(nowMs)) dispose(s.data);
    for (let i = dying.length - 1; i >= 0; i--) {
      const d = dying[i] as { atMs: number; live: Live };
      if (d.atMs <= nowMs) {
        dispose(d.live);
        dying.splice(i, 1);
      }
    }
  }

  function startOneShot(id: SfxId, info: SfxInfo, gain: number, pan: number, placed: boolean, param: number, now: number): void {
    const nowMs = now * 1000;
    if (!cooldown.ready(id, nowMs)) return;
    const r = pool.acquire(id, info.priority ?? 0, nowMs, (now + (info.lengthMs ?? 0) / 1000 + TAIL_S) * 1000, null as unknown as Live);
    if (!r) {
      log(dropped, id);
      return;
    }
    if (r.stolen) kill(r.stolen.data, now);
    cooldown.mark(id, nowMs);
    let live: Live;
    try {
      live = makeLive(id, info.bus, gain, pan, placed, param, now, null);
    } catch {
      pool.release(r.slot.key);
      return;
    }
    r.slot.data = live;
    r.slot.endMs = (live.voice.end + TAIL_S) * 1000;
    log(played, { id, at: now, gain, pan });
  }

  function syncPooled(map: Map<string, PooledLoop>, id: SfxId, wants: readonly { key: string; gain: number; pan: number; tune: number }[], now: number): void {
    const keep = new Set(wants.map((w) => w.key));
    for (const [key, e] of map) {
      if (keep.has(key)) continue;
      map.delete(key);
      pool.release(e.slotKey);
      e.live.loopKey = null;
      kill(e.live, now, LOOP_GLIDE_S);
    }
    const info = sfxInfo(id);
    const gains = busGains(volumes);
    for (const w of wants) {
      let e = map.get(w.key);
      if (!e) {
        if (gains[info.bus] <= 0 || gains.master <= 0) continue;
        const r = pool.acquire(id, info.priority ?? 0, now * 1000, Infinity, null as unknown as Live);
        if (!r) continue;
        if (r.stolen) kill(r.stolen.data, now);
        let live: Live;
        try {
          live = makeLive(id, info.bus, 0, w.pan, true, 0, now, w.key);
        } catch {
          pool.release(r.slot.key);
          continue;
        }
        r.slot.data = live;
        e = { live, slotKey: r.slot.key };
        map.set(w.key, e);
        log(played, { id, at: now, gain: w.gain, pan: w.pan });
      }
      e.live.gain.gain.setTargetAtTime(w.gain, now, LOOP_GLIDE_S);
      e.live.panner?.pan.setTargetAtTime(w.pan, now, LOOP_GLIDE_S);
      e.live.voice.tune?.(w.tune, now);
    }
  }

  function syncAmbient(live: Live | null, id: SfxId, level: number, now: number): Live | null {
    if (level > 0) {
      const l = live ?? makeLive(id, sfxInfo(id).bus, 0, 0, false, 0, now, null);
      l.gain.gain.setTargetAtTime(level, now, LOOP_GLIDE_S);
      return l;
    }
    if (live) kill(live, now, LOOP_GLIDE_S);
    return null;
  }

  function applyLoops(t: LoopTargets, now: number): void {
    syncPooled(chains, 'coaster_chain', t.chains.map((c) => ({ key: c.key, gain: c.gain, pan: c.pan, tune: c.rate })), now);
    syncPooled(rumbles, 'coaster_rumble', t.rumbles.map((r) => ({ key: r.key, gain: r.gain, pan: r.pan, tune: r.cutoff })), now);
    rainLive = syncAmbient(rainLive, 'rain', t.rain, now);
    crowdLive = syncAmbient(crowdLive, 'crowd', t.crowd, now);
    rainLevel = t.rain;
    crowdLevel = t.crowd;
  }

  function thunderStep(storm: boolean, now: number): void {
    if (!storm) {
      nextThunder = null;
      return;
    }
    if (nextThunder === null) {
      nextThunder = now + nextThunderGapMs(rng) / 1000;
      return;
    }
    if (now < nextThunder) return;
    nextThunder = now + nextThunderGapMs(rng) / 1000;
    const info = sfxInfo('thunder');
    const gains = busGains(volumes);
    if (gains[info.bus] > 0 && gains.master > 0) startOneShot('thunder', info, 1, 0, false, 0, now);
  }

  return {
    unlock() {
      if (!ctx) {
        let c: AudioContext;
        try {
          c = makeContext();
        } catch {
          return;
        }
        ctx = c;
        graph = buildGraph(c);
        noise = createNoiseBank(c, rng);
        applyVolumes(true);
        kick(c);
        if (hidden && c.state === 'running') {
          suspendedByHide = true;
          void c.suspend().catch(() => undefined);
        }
      }
      if (!hidden && ctx.state !== 'running' && ctx.state !== 'closed') {
        void ctx.resume().catch(() => undefined);
      }
    },

    state() {
      if (!ctx) return 'none';
      const s = ctx.state;
      return s === 'running' || s === 'closed' ? s : 'suspended';
    },

    setVolumes(v) {
      volumes = { ...v };
      applyVolumes(false);
    },

    play(requests: readonly SoundRequest[], listener: Listener) {
      if (!ready()) return;
      const now = (ctx as AudioContext).currentTime;
      reap(now * 1000);
      const gains = busGains(volumes);
      if (gains.master <= 0) return;
      // One per id per batch (the cooldown would block the rest): the loudest.
      const best = new Map<SfxId, { info: SfxInfo; gain: number; pan: number; placed: boolean; param: number }>();
      for (const req of requests) {
        const info = sfxInfo(req.id);
        if (!info || info.loop || gains[info.bus] <= 0) continue;
        let gain = 1;
        let pan = 0;
        if (req.place) {
          const m = mixAtTile(listener, req.place.tile);
          if (!m) continue;
          gain = m.gain;
          pan = m.pan;
        }
        const prev = best.get(req.id);
        if (!prev || gain > prev.gain) best.set(req.id, { info, gain, pan, placed: req.place !== null, param: req.param ?? 0 });
      }
      for (const [id, b] of best) startOneShot(id, b.info, b.gain, b.pan, b.placed, b.param, now);
    },

    update(listener: Listener, nowMs: number) {
      if (!ready()) return;
      const now = (ctx as AudioContext).currentTime;
      reap(now * 1000);
      if (lastLoopMs === null || nowMs - lastLoopMs >= LOOP_UPDATE_MS || nowMs < lastLoopMs) {
        lastLoopMs = nowMs;
        const t = loopTargets(listener as ScreenListener);
        applyLoops(t, now);
        thunderStep(t.storm, now);
      }
      for (const e of chains.values()) e.live.voice.schedule?.(now, now + CHAIN_LOOKAHEAD_MS / 1000);
    },

    setHidden(h: boolean) {
      if (h === hidden) return;
      hidden = h;
      if (!ctx || !graph) return;
      const c = ctx;
      const now = c.currentTime;
      const p = graph.master.gain;
      const target = busGains(volumes).master;
      if (suspendTimer !== null) {
        clearTimer(suspendTimer);
        suspendTimer = null;
      }
      if (h) {
        p.cancelScheduledValues(now);
        p.setValueAtTime(target, now);
        p.linearRampToValueAtTime(0, now + HIDE_RAMP_MS / 1000);
        suspendTimer = setTimer(() => {
          suspendTimer = null;
          if (hidden && c.state === 'running') {
            suspendedByHide = true;
            void c.suspend().catch(() => undefined);
          }
        }, HIDE_RAMP_MS);
      } else {
        const from = suspendedByHide ? 0 : Math.max(0, Math.min(target, p.value));
        suspendedByHide = false;
        if (c.state !== 'running' && c.state !== 'closed') void c.resume().catch(() => undefined);
        p.cancelScheduledValues(now);
        p.setValueAtTime(from, now);
        p.linearRampToValueAtTime(target, now + HIDE_RAMP_MS / 1000);
      }
    },

    musicHost(): MusicHost | null {
      return ctx && graph ? { ctx, output: graph.buses.music } : null;
    },

    graph: () => graph,

    debug(): EngineDebug {
      return {
        played: [...played],
        dropped: [...dropped],
        voices: pool.size,
        slots: pool.active().map((s) => ({ id: s.id, priority: s.priority, startMs: s.startMs, endMs: s.endMs })),
        loops: { chains: chains.size, rumbles: rumbles.size, rain: rainLevel, crowd: crowdLevel },
        hidden,
        volumes: { ...volumes },
      };
    },
  };
}
