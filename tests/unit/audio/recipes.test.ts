/** Every SFX recipe builds on a fake context with its Phase 6 §4.2 length and bus. W4-A. */
import { describe, expect, it } from 'vitest';
import { createAudioEngine } from '../../../src/audio/engine';
import { brownNoise, pinkNoise, whiteNoise } from '../../../src/audio/sfx/noise';
import { RECIPES } from '../../../src/audio/sfx';
import { createAudioRng } from '../../../src/audio/rng';
import { SFX, type SfxId } from '../../../src/audio/types';
import { makeTestWorld } from '../../helpers/world';
import { asAudioContext, FakeAudioContext, FakeBufferSource, FakeNode, FakeOscillator, type FakeSource } from './fakeAudio';

const world = makeTestWorld();
const listener = { camera: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 as const }, viewportWidth: 1280, world };

function unlocked(): { fake: FakeAudioContext; engine: ReturnType<typeof createAudioEngine> } {
  const fake = new FakeAudioContext();
  const engine = createAudioEngine({ createContext: () => asAudioContext(fake), seed: 7 });
  engine.unlock();
  fake.currentTime = 10;
  return { fake, engine };
}

/** Sources created after `mark` (the nodes of one sound). */
function newSources(fake: FakeAudioContext, mark: number): FakeSource[] {
  return fake.nodes.slice(mark).filter((n): n is FakeSource => 'startTime' in n);
}

describe('the 20 recipes', () => {
  it('there is a recipe for every SFX id', () => {
    for (const s of SFX) expect(typeof RECIPES[s.id]).toBe('function');
    expect(Object.keys(RECIPES).sort()).toEqual(SFX.map((s) => s.id).sort());
  });

  const oneShots = SFX.filter((s) => !s.loop);
  it.each(oneShots.map((s) => [s.id, s.bus, s.lengthMs] as const))('%s: plays on the %s bus and lasts %d ms', (id, bus, lengthMs) => {
    const { fake, engine } = unlocked();
    const mark = fake.nodes.length;
    engine.play([{ id: id as SfxId, place: null, param: id === 'coaster_cheer' ? 20 : 1 }], listener);
    const srcs = newSources(fake, mark);
    expect(srcs.length).toBeGreaterThan(0);
    // Every source starts at or after now and is silent by the table length.
    const t0 = 10;
    const end = t0 + (lengthMs as number) / 1000;
    for (const s of srcs) {
      expect(s.startTime).not.toBeNull();
      expect(s.startTime as number).toBeGreaterThanOrEqual(t0 - 1e-9);
      expect(s.endTime).toBeLessThanOrEqual(end + 1e-9);
    }
    // The longest source ends at the table length (± 5 ms).
    expect(Math.max(...srcs.map((s) => s.endTime))).toBeGreaterThan(end - 0.005 - 1e-9);
    // Its output reaches the right bus, and not another one.
    const g = engine.graph();
    if (!g) throw new Error('no graph');
    const busNode = g.buses[bus] as unknown as FakeNode;
    for (const s of srcs) expect(fake.reaches(s, busNode)).toBe(true);
    for (const other of ['ui', 'sfx', 'ambience', 'music'] as const) {
      if (other === bus) continue;
      for (const s of srcs) expect(fake.reaches(s, g.buses[other] as unknown as FakeNode)).toBe(false);
    }
    expect(engine.debug().played.at(-1)?.id).toBe(id);
  });

  it('ui_click: sine 1,200 → 800 Hz, peak 0.3 after 2 ms', () => {
    const { fake, engine } = unlocked();
    const mark = fake.nodes.length;
    engine.play([{ id: 'ui_click', place: null }], listener);
    const osc = fake.nodes.slice(mark).find((n): n is FakeOscillator => n instanceof FakeOscillator);
    expect(osc?.type).toBe('sine');
    expect(osc?.frequency.at(10)).toBeCloseTo(1200, 6);
    expect(osc?.frequency.at(10.045)).toBeCloseTo(800, 6);
    const env = osc?.outputs[0] as unknown as { params: Record<string, { at(t: number): number }> };
    expect(env.params.gain?.at(10.002)).toBeCloseTo(0.3, 6);
  });

  it('award goes up for a positive award and down for a negative one', () => {
    const notes = (param: number): number[] => {
      const { fake, engine } = unlocked();
      const mark = fake.nodes.length;
      engine.play([{ id: 'award', place: null, param }], listener);
      const osc = fake.nodes.slice(mark).find((n): n is FakeOscillator => n instanceof FakeOscillator);
      if (!osc) throw new Error('no oscillator');
      expect(osc.type).toBe('triangle');
      return [0.01, 0.16, 0.31, 0.46].map((d) => osc.frequency.at(10 + d));
    };
    const up = notes(1);
    const down = notes(-1);
    for (let i = 1; i < 4; i++) {
      expect(up[i] as number).toBeGreaterThan(up[i - 1] as number);
      expect(down[i] as number).toBeLessThan(down[i - 1] as number);
    }
  });

  it('coaster_cheer uses 3–6 detuned saw voices from the audio RNG', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const fake = new FakeAudioContext();
      const engine = createAudioEngine({ createContext: () => asAudioContext(fake), seed });
      engine.unlock();
      fake.currentTime = 5;
      const mark = fake.nodes.length;
      engine.play([{ id: 'coaster_cheer', place: null, param: 15 }], listener);
      const saws = fake.nodes.slice(mark).filter((n): n is FakeOscillator => n instanceof FakeOscillator && n.type === 'sawtooth');
      expect(saws.length).toBeGreaterThanOrEqual(3);
      expect(saws.length).toBeLessThanOrEqual(6);
      expect(new Set(saws.map((s) => s.detune.value)).size).toBe(saws.length);
    }
  });

  it('fw_burst crackles with 2 ms clicks inside its 1.3 s', () => {
    const { fake, engine } = unlocked();
    const mark = fake.nodes.length;
    engine.play([{ id: 'fw_burst', place: null }], listener);
    const clicks = fake.nodes.slice(mark).filter((n): n is FakeBufferSource => n instanceof FakeBufferSource && n.startDuration === 0.002);
    expect(clicks.length).toBeGreaterThanOrEqual(10);
    for (const c of clicks) expect(c.endTime).toBeLessThanOrEqual(11.3 + 1e-9);
  });
});

describe('noise', () => {
  it('white, pink, and brown noise are in [−1, 1] and the same for the same seed', () => {
    for (const make of [whiteNoise, pinkNoise, brownNoise]) {
      const a = make(4_000, createAudioRng(3));
      const b = make(4_000, createAudioRng(3));
      expect(Array.from(a)).toEqual(Array.from(b));
      for (const x of a) expect(Math.abs(x)).toBeLessThanOrEqual(1);
      expect(a.some((x) => x !== 0)).toBe(true);
    }
  });

  it('brown noise is darker than pink, pink darker than white (smaller sample-to-sample steps)', () => {
    const roughness = (xs: Float32Array): number => {
      let d = 0;
      let e = 0;
      for (let i = 1; i < xs.length; i++) {
        d += Math.abs((xs[i] as number) - (xs[i - 1] as number));
        e += Math.abs(xs[i] as number);
      }
      return d / e;
    };
    const w = roughness(whiteNoise(20_000, createAudioRng(1)));
    const p = roughness(pinkNoise(20_000, createAudioRng(1)));
    const b = roughness(brownNoise(20_000, createAudioRng(1)));
    expect(p).toBeLessThan(w);
    expect(b).toBeLessThan(p);
  });
});
