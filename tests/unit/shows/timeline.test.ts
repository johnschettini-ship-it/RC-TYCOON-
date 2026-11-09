/**
 * Show timeline and effects (Phase 6 §4.4 rendering): same input → same cues, the particle cap, the sweep speed, and
 * the reduced-motion variants (still beams that pulse, glow circles instead of bursts). Owner: W4-C.
 */
import { describe, expect, it } from 'vitest';
import { FIREWORK_BURST_MAX, FIREWORK_BURST_MIN, LIGHTSHOW_BEAMS, MAX_FIREWORK_PARTICLES } from '../../../src/data/tuning/shows';
import { beamAngle, drawFireworks, drawLightshow, emptyFxStats, particlesAt, pulseAlpha, sweepOffset, type FxCtx } from '../../../src/render/shows/fx';
import { SHOW_PALETTES } from '../../../src/render/shows/palette';
import { buildShowPlan, showPlan, showTimeline, SWEEP_TICKS } from '../../../src/render/shows/timeline';
import { defaultShowSchedule, type ShowSite } from '../../../src/sim/shows/types';
import { defOf } from './helpers';

function site(id: number, defId: 'lightshow_tower' | 'fireworks_launcher', startTick: number): ShowSite {
  return {
    id,
    defId,
    x: 10,
    y: 10,
    rotation: 0,
    schedule: defaultShowSchedule(),
    status: 'running',
    nextShowTick: startTick,
    startTick,
    lastWatchers: 0,
    totals: { shows: 1, cost: 0, watchers: 0 },
    totalBuildCost: 0,
    builtTick: 0,
  };
}

/** A recording 2D context: counts fills, rects, and strokes, and keeps the paths' first points. */
class FakeCtx implements FxCtx {
  globalCompositeOperation = 'source-over';
  globalAlpha = 1;
  fillStyle: unknown = '#000';
  strokeStyle: unknown = '#000';
  lineWidth = 1;
  fills = 0;
  rects = 0;
  strokes = 0;
  arcs = 0;
  firstPoints: Array<[number, number]> = [];
  private started = false;
  composites = new Set<string>();
  save(): void {}
  restore(): void {}
  beginPath(): void {
    this.started = true;
  }
  moveTo(x: number, y: number): void {
    if (this.started) this.firstPoints.push([x, y]);
    this.started = false;
  }
  lineTo(): void {}
  closePath(): void {}
  arc(): void {
    this.arcs++;
  }
  fill(): void {
    this.fills++;
    this.composites.add(this.globalCompositeOperation);
  }
  stroke(): void {
    this.strokes++;
  }
  fillRect(): void {
    this.rects++;
    this.composites.add(this.globalCompositeOperation);
  }
  createLinearGradient(): { addColorStop(): void } {
    return { addColorStop() {} };
  }
  createRadialGradient(): { addColorStop(): void } {
    return { addColorStop() {} };
  }
}

describe('showTimeline (shared by the picture and the sound)', () => {
  it('same input → same cues; another show start → other cues; no show yet → none', () => {
    const fw = defOf('fireworks_launcher');
    const a = buildShowPlan(site(7, 'fireworks_launcher', 1050), fw);
    const b = buildShowPlan(site(7, 'fireworks_launcher', 1050), fw);
    expect(b.cues).toEqual(a.cues);
    expect(b.rockets).toEqual(a.rockets);
    expect(showTimeline(site(7, 'fireworks_launcher', 1050), fw)).toEqual(a.cues);
    expect(buildShowPlan(site(7, 'fireworks_launcher', 2250), fw).cues).not.toEqual(a.cues);
    expect(buildShowPlan(site(8, 'fireworks_launcher', 1050), fw).cues).not.toEqual(a.cues);
    expect(showTimeline(site(7, 'fireworks_launcher', -1), fw)).toEqual([]);
  });

  it('the memo returns the same plan object for the same show', () => {
    const ls = defOf('lightshow_tower');
    expect(showPlan(site(3, 'lightshow_tower', 900), ls)).toBe(showPlan(site(3, 'lightshow_tower', 900), ls));
  });

  it('Lightshow: a sweep cue every 2 s (60° at 30° per second) through the show', () => {
    const ls = defOf('lightshow_tower');
    expect(SWEEP_TICKS).toBe(40);
    const cues = showTimeline(site(1, 'lightshow_tower', 1050), ls);
    expect(cues.map((c) => c.at)).toEqual([0, 40, 80, 120, 160, 200, 240, 280]);
    expect(cues.every((c) => c.kind === 'sweep')).toBe(true);
  });

  it('Fireworks: a launch and a later burst per rocket, ascending, inside the show; bursts of 40–80; sparks gone by the end', () => {
    const fw = defOf('fireworks_launcher');
    for (const start of [1050, 2250, 3500, 7777]) {
      const plan = buildShowPlan(site(5, 'fireworks_launcher', start), fw);
      expect(plan.rockets.length).toBeGreaterThan(8);
      const cues = plan.cues;
      expect(cues.filter((c) => c.kind === 'launch')).toHaveLength(plan.rockets.length);
      expect(cues.filter((c) => c.kind === 'burst')).toHaveLength(plan.rockets.length);
      for (let i = 1; i < cues.length; i++) expect(cues[i]!.at).toBeGreaterThanOrEqual(cues[i - 1]!.at);
      for (const k of plan.rockets) {
        expect(k.launchAt).toBeGreaterThanOrEqual(0);
        expect(k.burstAt).toBeGreaterThan(k.launchAt);
        expect(k.burstAt + k.life).toBeLessThan(fw.showTicks);
        expect(k.count).toBeGreaterThanOrEqual(FIREWORK_BURST_MIN);
        expect(k.count).toBeLessThanOrEqual(FIREWORK_BURST_MAX);
      }
      // A finale: the last fifth of the show launches more often than the first.
      const launches = cues.filter((c) => c.kind === 'launch').map((c) => c.at);
      const early = launches.filter((t) => t < fw.showTicks / 3).length;
      const late = launches.filter((t) => t >= fw.showTicks - 180).length;
      expect(late).toBeGreaterThan(early);
    }
  });

  it('never more than 600 particles in the sky at once', () => {
    const fw = defOf('fireworks_launcher');
    for (let start = 1000; start < 1400; start += 37) {
      const plan = buildShowPlan(site(9, 'fireworks_launcher', start), fw);
      for (let t = 0; t < fw.showTicks; t++) expect(particlesAt(plan, t)).toBeLessThanOrEqual(MAX_FIREWORK_PARTICLES);
    }
  });
});

describe('Lightshow beams', () => {
  it('sweep at 30° per second between −30° and +30°, odd beams the other way', () => {
    expect(sweepOffset(0)).toBe(-30);
    expect(sweepOffset(20) - sweepOffset(0)).toBe(30);
    expect(sweepOffset(40)).toBe(30);
    expect(sweepOffset(60)).toBe(0);
    expect(sweepOffset(80)).toBe(-30);
    for (let t = 0; t < 300; t += 3) {
      expect(Math.abs(sweepOffset(t))).toBeLessThanOrEqual(30);
      expect(beamAngle(0, t, false) - beamAngle(0, 0, false)).toBeCloseTo(-(beamAngle(1, t, false) - beamAngle(1, 0, false)), 9);
    }
  });

  it('draw 6 beams with `lighter`; reduced motion keeps them still and pulses slowly', () => {
    const ls = defOf('lightshow_tower');
    const plan = buildShowPlan(site(2, 'lightshow_tower', 1050), ls);
    const palette = SHOW_PALETTES.classic_fair;
    const at = (t: number, reduced: boolean): Array<[number, number]> => {
      const ctx = new FakeCtx();
      const stats = emptyFxStats();
      expect(drawLightshow(ctx, plan, palette, t, 500, 400, 1, reduced, stats)).toBe(LIGHTSHOW_BEAMS);
      expect(stats.beams).toBe(LIGHTSHOW_BEAMS);
      expect([...ctx.composites]).toEqual(['lighter']);
      return ctx.firstPoints;
    };
    // Normal: the beams move.
    expect(at(10, false)).not.toEqual(at(30, false));
    // Reduced motion: the same geometry at any time.
    expect(at(10, true)).toEqual(at(130, true));
    for (let k = 0; k < LIGHTSHOW_BEAMS; k++) expect(beamAngle(k, 17, true)).toBe(beamAngle(k, 211, true));
    expect(pulseAlpha(0)).not.toBeCloseTo(pulseAlpha(40), 3);
    expect(pulseAlpha(0)).toBeCloseTo(pulseAlpha(160), 9);
    // Nothing outside the show.
    const stats = emptyFxStats();
    expect(drawLightshow(new FakeCtx(), plan, palette, ls.showTicks, 0, 0, 1, false, stats)).toBe(0);
    expect(drawLightshow(new FakeCtx(), plan, palette, -1, 0, 0, 1, false, stats)).toBe(0);
  });
});

describe('Fireworks drawing', () => {
  const fw = defOf('fireworks_launcher');
  const plan = buildShowPlan(site(4, 'fireworks_launcher', 1050), fw);
  const palette = SHOW_PALETTES.starport;

  /** A show time with a burst in the air. */
  const burstTime = (plan.rockets[1]!.burstAt as number) + 8;

  it('rockets, flashes, and particles; positions depend only on the show time', () => {
    const run = (t: number): { stats: ReturnType<typeof emptyFxStats>; rects: number } => {
      const ctx = new FakeCtx();
      const stats = emptyFxStats();
      drawFireworks(ctx, plan, palette, t, 300, 300, 1, false, stats);
      return { stats, rects: ctx.rects };
    };
    const a = run(burstTime);
    expect(a.stats.particles).toBeGreaterThanOrEqual(FIREWORK_BURST_MIN);
    expect(a.stats.glows).toBe(0);
    expect(a.rects).toBeGreaterThanOrEqual(a.stats.particles);
    expect(run(burstTime)).toEqual(a);
    const launch = plan.rockets[0]!.launchAt + 3;
    expect(run(launch).stats.rockets).toBeGreaterThan(0);
  });

  it('the per-frame cap is shared by every launcher in the frame', () => {
    const stats = emptyFxStats();
    stats.particles = MAX_FIREWORK_PARTICLES - 10;
    drawFireworks(new FakeCtx(), plan, palette, burstTime, 0, 0, 1, false, stats);
    expect(stats.particles).toBe(MAX_FIREWORK_PARTICLES);
  });

  it('reduced motion: soft glow circles at the burst points, no rockets and no particles, all show long', () => {
    let glows = 0;
    for (let t = 0; t < fw.showTicks + 60; t++) {
      const stats = emptyFxStats();
      drawFireworks(new FakeCtx(), plan, palette, t, 0, 0, 1, true, stats);
      expect(stats.particles).toBe(0);
      expect(stats.rockets).toBe(0);
      expect(stats.flashes).toBe(0);
      glows += stats.glows;
    }
    expect(glows).toBeGreaterThan(plan.rockets.length * 20);
  });
});
