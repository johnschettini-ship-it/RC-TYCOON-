/**
 * Phase 6 piece physics (phase-6-polish.md §4.5; phase-2 §4.7, §4.9): energy conservation through a helix without
 * friction, the corkscrew's minimum entry speed (10 m/s), and the G formulas on banked pieces that also curve
 * vertically.
 */
import { describe, expect, it } from 'vitest';
import { getTrackTypeDef, type TrackTypeDef } from '../../../src/data/track';
import { CORKSCREW_MIN_ENTRY, G } from '../../../src/data/tuning/track';
import { pieceExitJoint } from '../../../src/sim/rides/track/geometry';
import { buildLayout, sampleAt } from '../../../src/sim/rides/track/layout';
import { gForces, newTrain, stepTrain, type StepContext, type StepResult } from '../../../src/sim/rides/track/physics';
import type { TrackPieceInstance, TrainState } from '../../../src/sim/rides/track/types';

function lay(ids: string[]): TrackPieceInstance[] {
  const out: TrackPieceInstance[] = [];
  let x = 10;
  let y = 30;
  let z = 20;
  let dir: 0 | 1 | 2 | 3 = 0;
  for (const id of ids) {
    const piece: TrackPieceInstance = { defId: id, x, y, z, dir, chain: false, brakeSpeed: null, cost: 0 };
    out.push(piece);
    const j = pieceExitJoint(piece);
    x = j.x;
    y = j.y;
    z = j.z;
    dir = j.dir;
  }
  return out;
}

function typeOf(id: string, frictionless = false): TrackTypeDef {
  const t = getTrackTypeDef(id) as TrackTypeDef;
  return frictionless ? { ...t, physics: { ...t.physics, mu: 0, cd: 0 } } : t;
}

function ctxFor(pieces: TrackPieceInstance[], type: TrackTypeDef): StepContext {
  return { layout: buildLayout(pieces), type, pieces, trainLenMm: type.vehicle.carLengthMm, cars: 1, carLenMm: type.vehicle.carLengthMm, laps: 1000, holdFrontMm: null, leader: null, slowFactor: 1 };
}

/** A running train with its centre at `s` (mm), far from the station stop. */
function trainAt(s: number, vMs: number): TrainState {
  const t = newTrain(1, s, 1, 4);
  t.v = Math.round(vMs * 1000);
  t.state = 'running';
  t.dist = 200_000;
  return t;
}

function runTo(ctx: StepContext, t: TrainState, sEnd: number): StepResult | null {
  for (let i = 0; i < 20_000; i++) {
    const r = stepTrain(ctx, t);
    if (r.stall) return r;
    if (t.s >= sEnd) return null;
  }
  throw new Error('did not get there');
}

describe('helix physics', () => {
  for (const [id, dz] of [['helix_right_down', -4], ['helix_left_down', -4], ['helix_right_up', 4], ['helix_left_up', 4]] as const) {
    it(`${id}: energy is conserved without friction (error < 0.5%)`, () => {
      const pieces = lay(['station', 'straight', 'straight', id, 'straight', 'straight', 'straight']);
      const ctx = ctxFor(pieces, typeOf('steel_coaster', true));
      const L = ctx.layout;
      const t = trainAt((L.startMm[2] as number) + 1000, 12);
      expect(runTo(ctx, t, (L.startMm[4] as number) + 1000)).toBeNull();
      const v1 = t.v / 1000;
      const expected = 12 * 12 - 2 * G * dz;
      expect(Math.abs(v1 * v1 - expected) / expected).toBeLessThan(0.005);
    });
  }

  it('the Bobsled Run, the Steel and the Inverted Coaster ride it; lateral G stays moderate thanks to the bank', () => {
    const pieces = lay(['station', 'straight', 'helix_right_down', 'straight']);
    const L = buildLayout(pieces);
    const mid = (L.startMm[2] as number) + 21_000;
    const sm = sampleAt(L, mid);
    const v = 9;
    const g = gForces(sm.cosT, sm.sinB, sm.cosB, v, sm.kv, sm.kh);
    // Unbanked, v²/(g·R) would be 1.72 G sideways; banked 35° it is under 1.
    expect(g.gl).toBeLessThan(1);
    expect(g.gv).toBeGreaterThan(1);
  });
});

describe('corkscrew physics', () => {
  const course = (): TrackPieceInstance[] => lay(['station', 'straight', 'straight', 'corkscrew_right', 'straight', 'straight']);

  it(`a train entering below ${CORKSCREW_MIN_ENTRY} m/s stops the test on the corkscrew (kind "corkscrew")`, () => {
    const ctx = ctxFor(course(), typeOf('steel_coaster', true));
    const L = ctx.layout;
    const t = trainAt((L.startMm[2] as number) + 1000, CORKSCREW_MIN_ENTRY - 0.5);
    const r = runTo(ctx, t, (L.startMm[4] as number) + 1000);
    expect(r?.stall).toBe('corkscrew');
    expect(r?.pieceIndex).toBe(3);
  });

  it('at 10 m/s and above the train rolls through upside down with the riders pressed into their seats', () => {
    // Just over the minimum where it enters (friction takes a little on the 0.3 m before it), then faster.
    for (const v0 of [CORKSCREW_MIN_ENTRY + 0.05, 14, 20]) {
      const ctx = ctxFor(course(), typeOf('inverted_coaster'));
      const L = ctx.layout;
      const t = trainAt((L.startMm[3] as number) - 300, v0);
      let minGv = Infinity;
      let inverted = false;
      for (let i = 0; i < 5000 && t.s < (L.startMm[4] as number); i++) {
        const r = stepTrain(ctx, t);
        expect(r.stall).toBeNull();
        const sm = sampleAt(L, t.s);
        if (sm.cosB < -0.9) inverted = true;
        minGv = Math.min(minGv, gForces(sm.cosT, sm.sinB, sm.cosB, t.v / 1000, sm.kv, sm.kh).gv);
      }
      expect(inverted).toBe(true);
      expect(minGv, `entry ${v0}`).toBeGreaterThan(0);
    }
  });

  it('the corkscrew changes no height: the speed after it equals the speed before it without friction', () => {
    const ctx = ctxFor(course(), typeOf('steel_coaster', true));
    const L = ctx.layout;
    const t = trainAt((L.startMm[2] as number) + 1000, 15);
    expect(runTo(ctx, t, (L.startMm[4] as number) + 2000)).toBeNull();
    expect(Math.abs(t.v - 15_000)).toBeLessThan(75);
  });
});

describe('G formulas (phase-2 §4.9) on banked pieces', () => {
  it('lateral G projects the vertical curvature when the track banks (and is unchanged unbanked)', () => {
    const b = (35 * Math.PI) / 180;
    // Unbanked: the Phase 2 formula exactly.
    expect(gForces(1, 0, 1, 10, 0.1, 0.2).gl).toBeCloseTo(Math.abs(100 * 0.2) / G, 12);
    // Banked with vertical curvature: |v²κh cosβ − (g cosθ + v²κv) sinβ| / g.
    const want = Math.abs(100 * 0.2 * Math.cos(b) - (G + 100 * 0.1) * Math.sin(b)) / G;
    expect(gForces(1, Math.sin(b), Math.cos(b), 10, 0.1, 0.2).gl).toBeCloseTo(want, 12);
  });

  it('curvature toward the riders gives the loop-top formula when upside down by roll', () => {
    const v = 12;
    const k = 0.15;
    // Rolled 180°, curvature toward the riders: κv = k cos β = −k, κh = k sin β = 0.
    const g = gForces(1, 0, -1, v, -k, 0);
    expect(g.gv).toBeCloseTo(-1 + (v * v * k) / G, 12);
    expect(g.gl).toBeCloseTo(0, 12);
  });
});
