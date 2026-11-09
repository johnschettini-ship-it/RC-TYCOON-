import { describe, expect, it } from 'vitest';
import { getTrackTypeDef, type TrackTypeDef } from '../../../src/data/track';
import { G, GAP_RULE_MM, STATION_SPEED } from '../../../src/data/tuning/track';
import { gForces, newTrain, stepTrain, type StepContext } from '../../../src/sim/rides/track/physics';
import { buildLayout, sampleAt } from '../../../src/sim/rides/track/layout';
import { pieceExitJoint } from '../../../src/sim/rides/track/geometry';
import type { TrackPieceInstance, TrainState } from '../../../src/sim/rides/track/types';

/** Lay pieces end to end from (10, 10), dir 0, z 8 (no world checks). */
function lay(specs: (string | { id: string; chain?: boolean; brakeSpeed?: number })[]): TrackPieceInstance[] {
  const out: TrackPieceInstance[] = [];
  let x = 10;
  let y = 10;
  let z = 8;
  let dir: 0 | 1 | 2 | 3 = 0;
  for (const sp of specs) {
    const p = typeof sp === 'string' ? { id: sp } : sp;
    const piece: TrackPieceInstance = { defId: p.id, x, y, z, dir, chain: p.chain === true, brakeSpeed: p.id === 'brakes' ? (p.brakeSpeed ?? 6) : null, cost: 0 };
    out.push(piece);
    const j = pieceExitJoint(piece);
    x = j.x; y = j.y; z = j.z; dir = j.dir;
  }
  return out;
}

function frictionless(id = 'steel_coaster'): TrackTypeDef {
  const t = getTrackTypeDef(id) as TrackTypeDef;
  return { ...t, physics: { ...t.physics, mu: 0, cd: 0 } };
}

function ctxFor(pieces: TrackPieceInstance[], type: TrackTypeDef, cars = 1): StepContext {
  const layout = buildLayout(pieces);
  return { layout, type, pieces, trainLenMm: cars * type.vehicle.carLengthMm, laps: 1000, holdFrontMm: null, leader: null, slowFactor: 1 };
}

function runUntil(ctx: StepContext, t: TrainState, pred: (t: TrainState) => boolean, max = 20_000): number {
  for (let i = 0; i < max; i++) {
    const r = stepTrain(ctx, t);
    if (r.stall) throw new Error(`stalled on piece ${r.pieceIndex + 1}`);
    if (pred(t)) return i + 1;
  }
  throw new Error('did not reach the condition');
}

const UP = (id: string) => ({ id, chain: true });

describe('gravity physics (phase-2 §4.7)', () => {
  // Station, lift to 22 m, straight top, 22 m descent back to ground, long flat run.
  const climb = [UP('flat_to_gentle_up'), UP('gentle_to_steep_up'), UP('steep_up'), UP('steep_up'), UP('steep_to_gentle_up'), UP('gentle_up_to_flat')];
  const descent = ['flat_to_gentle_down', 'gentle_to_steep_down', 'steep_down', 'steep_down', 'steep_to_gentle_down', 'gentle_down_to_flat'];
  const course = lay(['station', 'straight', ...climb, 'straight', 'straight', ...descent, 'straight', 'straight', 'straight', 'straight']);

  it('conserves energy with friction off (error < 0.5%)', () => {
    const ctx = ctxFor(course, frictionless());
    const L = ctx.layout;
    const topStart = L.startMm[8] as number; // first straight at the top
    const bottom = L.startMm[16] as number; // first flat straight after the descent
    const t = newTrain(1, topStart + 1000, 2, 4);
    t.v = 3000;
    t.state = 'running';
    t.dist = 100_000; // far from the station stop
    const v0 = t.v / 1000;
    runUntil(ctx, t, (tr) => tr.s >= bottom + 1000);
    const v1 = t.v / 1000;
    const expected = v0 * v0 + 2 * G * 22;
    expect(Math.abs(v1 * v1 - expected) / expected).toBeLessThan(0.005);
  });

  it('a steep drop of 18 m gives v² = 2·g·h minus losses within 1%', () => {
    const type = getTrackTypeDef('steel_coaster') as TrackTypeDef;
    const pieces = lay([
      'station', 'straight',
      UP('flat_to_gentle_up'), UP('gentle_up'), UP('gentle_to_steep_up'), UP('steep_up'), UP('steep_to_gentle_up'), UP('gentle_up_to_flat'), UP('straight'),
      'flat_to_gentle_down', 'gentle_down', 'gentle_to_steep_down', 'steep_down', 'steep_to_gentle_down', 'gentle_down_to_flat',
      ...Array(8).fill('straight'),
    ]);
    const ctx = ctxFor(pieces, type, 4);
    const L = ctx.layout;
    const start = L.startMm[9] as number; // crest: start of the 18 m descent
    const end = L.startMm[15] as number; // bottom of the descent
    const v0 = 2;
    // Reference: the same forces integrated with a 100× finer step (test only).
    let s = start / 1000;
    let v = v0;
    const mu = type.physics.mu;
    const cd = type.physics.cd;
    const dt = 0.0005;
    for (let i = 0; i < 2_000_000 && s * 1000 < end; i++) {
      const smp = sampleAt(L, s * 1000);
      const a = -G * smp.sinT - (mu * G * Math.abs(smp.cosT) + cd * v * v);
      v += a * dt;
      s += v * dt;
    }
    const t = newTrain(1, start, 4, 4);
    t.v = v0 * 1000;
    t.state = 'running';
    t.dist = 50_000;
    runUntil(ctx, t, (tr) => tr.s >= end);
    const got = t.v / 1000;
    expect(Math.abs(got * got - v * v) / (v * v)).toBeLessThan(0.01);
    const lossless = v0 * v0 + 2 * G * 18;
    expect(got * got).toBeLessThan(lossless);
    expect(got * got).toBeGreaterThan(lossless * 0.9);
  });

  it('a chain lift pulls the train up at chain speed (3.0 m/s steel)', () => {
    const type = getTrackTypeDef('steel_coaster') as TrackTypeDef;
    const pieces = lay(['station', 'straight', UP('flat_to_gentle_up'), UP('gentle_to_steep_up'), ...Array(4).fill(UP('steep_up')), UP('steep_to_gentle_up'), UP('gentle_up_to_flat'), 'straight']);
    const ctx = ctxFor(pieces, type, 4);
    const L = ctx.layout;
    const t = newTrain(1, (L.startMm[2] as number) + 10, 4, 4);
    t.v = 500;
    t.state = 'running';
    t.dist = 50_000;
    let maxV = 0;
    let minLate = Infinity;
    runUntil(ctx, t, (tr) => {
      maxV = Math.max(maxV, tr.v);
      if (tr.s > (L.startMm[5] as number)) minLate = Math.min(minLate, tr.v);
      return tr.s >= (L.startMm[9] as number) - 100;
    });
    expect(maxV).toBeLessThanOrEqual(3000);
    expect(minLate).toBe(3000);
    expect(getTrackTypeDef('junior_coaster')?.physics.chainSpeedMms).toBe(2000);
  });

  it('brakes trim to their target speed', () => {
    const type = frictionless();
    const pieces = lay(['station', 'straight', { id: 'brakes', brakeSpeed: 5 }, 'straight', 'straight']);
    const ctx = ctxFor(pieces, type, 4);
    const L = ctx.layout;
    const t = newTrain(1, (L.startMm[1] as number) + 500, 4, 4);
    t.v = 15_000;
    t.state = 'running';
    t.dist = 50_000;
    runUntil(ctx, t, (tr) => tr.s >= (L.startMm[3] as number) + 100);
    expect(t.v).toBe(5_000);
  });

  it('a block brake trims to 2.0 m/s and raises a slow train to 2.0 m/s', () => {
    const type = frictionless();
    const pieces = lay(['station', 'straight', 'block_brake', 'straight', 'straight']);
    const ctx = ctxFor(pieces, type, 4);
    const L = ctx.layout;
    for (const v0 of [9_000, 600]) {
      const t = newTrain(1, (L.startMm[1] as number) + 2000, 4, 4);
      t.v = v0;
      t.state = 'running';
      t.dist = 50_000;
      runUntil(ctx, t, (tr) => tr.s >= (L.startMm[3] as number) + 50);
      expect(t.v).toBe(STATION_SPEED * 1000);
    }
  });

  it('holds a train at a block brake exit when the next block is occupied, then releases to 2.0 m/s', () => {
    const type = getTrackTypeDef('steel_coaster') as TrackTypeDef;
    const pieces = lay(['station', 'straight', 'straight', 'block_brake', 'straight']);
    const ctx = ctxFor(pieces, type, 4);
    const L = ctx.layout;
    const exit = L.startMm[4] as number;
    const t = newTrain(1, (L.startMm[1] as number) + 500, 4, 4);
    t.v = 6_000;
    t.state = 'running';
    t.dist = 50_000;
    const half = 5_000;
    for (let i = 0; i < 400; i++) {
      ctx.holdFrontMm = exit - (t.s + half);
      stepTrain(ctx, t);
    }
    expect(t.v).toBe(0);
    expect(t.s + half).toBe(exit);
    ctx.holdFrontMm = null;
    t.release = true;
    runUntil(ctx, t, (tr) => tr.v >= 2000);
    expect(t.v).toBe(2000);
  });

  it('a lift without a chain stalls', () => {
    const type = getTrackTypeDef('steel_coaster') as TrackTypeDef;
    const pieces = lay(['station', 'straight', 'flat_to_gentle_up', 'gentle_up', 'gentle_up', 'gentle_up', 'gentle_up_to_flat']);
    const ctx = ctxFor(pieces, type, 4);
    const t = newTrain(1, (ctx.layout.startMm[1] as number) + 1000, 4, 4);
    t.v = 3_000;
    t.state = 'running';
    t.dist = 50_000;
    let stall = null as null | { kind: string; piece: number };
    for (let i = 0; i < 2000 && !stall; i++) {
      const r = stepTrain(ctx, t);
      if (r.stall) stall = { kind: r.stall, piece: r.pieceIndex };
    }
    expect(stall?.kind).toBe('stop');
    expect(stall?.piece).toBeGreaterThanOrEqual(2);
  });
});

describe('G formulas (phase-2 §4.9)', () => {
  it('flat turn: Gl = v²/(g·R)', () => {
    const v = 8;
    const { gv, gl } = gForces(1, 0, 1, v, 0, 1 / 10);
    expect(gl).toBeCloseTo((v * v) / (G * 10), 12);
    expect(gv).toBeCloseTo(1, 12);
  });

  it('loop top: Gv = −1 + v²/(g·4)', () => {
    const v = 7;
    const { gv } = gForces(-1, 0, 1, v, 1 / 4, 0);
    expect(gv).toBeCloseTo(-1 + (v * v) / (G * 4), 12);
  });

  it('a banked turn at the balance speed has no lateral G', () => {
    const sinB = Math.sin((35 * Math.PI) / 180);
    const cosB = Math.cos((35 * Math.PI) / 180);
    const v = Math.sqrt(G * 10 * Math.tan((35 * Math.PI) / 180));
    const { gl, gv } = gForces(1, sinB, cosB, v, 0, 1 / 10);
    expect(gl).toBeCloseTo(0, 9);
    expect(gv).toBeCloseTo(1 / cosB, 9);
  });
});

describe('powered and guest-driven drives', () => {
  it('powered speed reaches the target and slows for corners', () => {
    const type = getTrackTypeDef('mini_railway') as TrackTypeDef;
    const pieces = lay(['station', ...Array(8).fill('straight'), 'turn_small_right', 'straight']);
    const ctx = ctxFor(pieces, type, 2);
    const L = ctx.layout;
    const t = newTrain(1, (L.startMm[1] as number) + 100, 2, 6);
    t.state = 'running';
    t.dist = 50_000;
    runUntil(ctx, t, (tr) => tr.s >= (L.startMm[8] as number));
    expect(t.v).toBe(5_000);
    runUntil(ctx, t, (tr) => tr.s >= (L.startMm[9] as number) + 2_500);
    expect(t.v).toBe(3_000);
  });

  it('guest-driven speed follows the temperament target', () => {
    const type = getTrackTypeDef('go_karts') as TrackTypeDef;
    const pieces = lay(['station', ...Array(10).fill('straight')]);
    const ctx = ctxFor(pieces, type, 1);
    const t = newTrain(1, (ctx.layout.startMm[1] as number) + 100, 1, 1);
    t.state = 'running';
    t.dist = 50_000;
    t.driveMms = 6_000 + 3_000 * 0.8;
    runUntil(ctx, t, (tr) => tr.s >= (ctx.layout.startMm[9] as number));
    expect(t.v).toBe(8_400);
  });

  it('the gap rule keeps ≥ 3 m to the tail of the vehicle ahead', () => {
    const type = getTrackTypeDef('go_karts') as TrackTypeDef;
    const pieces = lay(['station', ...Array(14).fill('straight')]);
    const ctx = ctxFor(pieces, type, 1);
    const lead = newTrain(1, (ctx.layout.startMm[4] as number), 1, 1);
    lead.state = 'running';
    lead.v = 2_000;
    lead.dist = 50_000;
    const tail = newTrain(2, (ctx.layout.startMm[1] as number), 1, 1);
    tail.state = 'running';
    tail.v = 9_000;
    tail.dist = 50_000;
    tail.driveMms = 9_000;
    let minGap = Infinity;
    for (let i = 0; i < 300; i++) {
      const leaderTail = lead.s - 1_000;
      ctx.leader = { gapMm: leaderTail - (tail.s + 1_000), vMms: lead.v };
      stepTrain(ctx, tail);
      // leader moves at a constant 2 m/s
      lead.s += 100;
      minGap = Math.min(minGap, lead.s - 1_000 - (tail.s + 1_000));
    }
    expect(minGap).toBeGreaterThanOrEqual(GAP_RULE_MM);
    expect(Math.abs(tail.v - 2_000)).toBeLessThanOrEqual(150);
  });
});
