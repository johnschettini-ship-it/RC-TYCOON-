/**
 * Loop SFX recipes (Phase 6 §4.2): `coaster_chain`, `coaster_rumble`, `rain`, `crowd`. Owner: W4-A. They play until
 * stopped; the engine sets their level (the voice gain) and position from `loopTargets` (`../loops.ts`).
 */
import { CHAIN_CLICK_MS, CROWD_AM_MAX_HZ, CROWD_AM_MIN_HZ, LOOP_GLIDE_S, RUMBLE_CUTOFF_MIN_HZ, SFX_PEAK } from '../../data/tuning/audio';
import { chainClickTimes } from '../loops';
import { filterNode, gainNode, noiseNode, oscNode, Sources, type Recipe } from './kit';

/** 5 ms high-pass noise clicks; rate = lift speed × 4 per metre (`tune`), scheduled ahead (`schedule`). */
export const coasterChain: Recipe = ({ ctx, out, t, noise }) => {
  const src = new Sources();
  const hp = filterNode(ctx, 'highpass', 1800);
  const g = gainNode(ctx, 0.8 * SFX_PEAK);
  hp.connect(g).connect(out);
  let rate = 0;
  let next = t;
  let stopped = Infinity;
  return {
    end: Infinity,
    stop(at) {
      stopped = Math.min(stopped, at);
      src.stopAll(at);
    },
    tune(value) {
      rate = value > 0 ? value : 0;
    },
    schedule(now, until) {
      if (next < now) next = now;
      const last = Math.min(until, stopped);
      for (const at of chainClickTimes(next, last, rate)) {
        const b = ctx.createBufferSource();
        b.buffer = noise.click;
        b.start(at);
        b.stop(at + CHAIN_CLICK_MS / 1000);
        b.connect(hp);
        src.add(b);
        next = at + 1 / rate;
      }
      // Forget finished clicks so a long lift does not keep thousands of nodes.
      if (src.list.length > 64) src.list.splice(0, src.list.length - 64);
    },
  };
};

/** Brown noise; low-pass 150–600 Hz (`tune`) and gain (voice level) mapped to speed. */
export const coasterRumble: Recipe = (env) => {
  const { ctx, out, t } = env;
  const src = new Sources();
  const n = noiseNode(src, env, 'brown', t, Infinity);
  const lp = filterNode(ctx, 'lowpass', RUMBLE_CUTOFF_MIN_HZ, 0.9);
  const g = gainNode(ctx, 1.2 * SFX_PEAK);
  n.connect(lp).connect(g).connect(out);
  return {
    end: Infinity,
    stop: (at) => src.stopAll(at),
    tune(value, at) {
      lp.frequency.setTargetAtTime(value, at, LOOP_GLIDE_S);
    },
  };
};

/** Pink noise, high-pass 400 Hz, low-pass 6 kHz; gain (voice level) = intensity. */
export const rain: Recipe = (env) => {
  const { ctx, out, t } = env;
  const src = new Sources();
  const n = noiseNode(src, env, 'pink', t, Infinity);
  const g = gainNode(ctx, 0.6 * SFX_PEAK);
  n.connect(filterNode(ctx, 'highpass', 400)).connect(filterNode(ctx, 'lowpass', 6000)).connect(g).connect(out);
  return { end: Infinity, stop: (at) => src.stopAll(at) };
};

/** Band noise 300–3,000 Hz, amplitude modulation 0.3–0.7 Hz (audio RNG); gain (voice level) = log of visible guests. */
export const crowd: Recipe = (env) => {
  const { ctx, out, t, rng } = env;
  const src = new Sources();
  const n = noiseNode(src, env, 'pink', t, Infinity);
  const am = gainNode(ctx, 0.65);
  const lfoA = oscNode(src, ctx, 'sine', rng.range(CROWD_AM_MIN_HZ, CROWD_AM_MAX_HZ), t, Infinity);
  const lfoB = oscNode(src, ctx, 'sine', rng.range(CROWD_AM_MIN_HZ, CROWD_AM_MAX_HZ), t, Infinity);
  const depthA = gainNode(ctx, 0.2);
  const depthB = gainNode(ctx, 0.15);
  lfoA.connect(depthA).connect(am.gain);
  lfoB.connect(depthB).connect(am.gain);
  const g = gainNode(ctx, 0.5 * SFX_PEAK);
  n.connect(filterNode(ctx, 'highpass', 300)).connect(filterNode(ctx, 'lowpass', 3000)).connect(am).connect(g).connect(out);
  return { end: Infinity, stop: (at) => src.stopAll(at) };
};
