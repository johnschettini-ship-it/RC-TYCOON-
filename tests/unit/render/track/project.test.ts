/** Track render math (phase-2 §4.13, master 6.4): projection, depth keys, supports, and car pose interpolation. */
import { describe, expect, it } from 'vitest';
import { packDepth, Layer, tileDepth } from '../../../../src/render/depth';
import { tileToScreen } from '../../../../src/render/iso';
import {
  carCentreMm,
  carPoseAt,
  interpolatedS,
  newCarPose,
  pitchStep,
  projectX,
  projectY,
  sliceSortKey,
  supportHeight,
  tileDepthView,
  trackFrame,
  viewFrame,
  viewX,
  viewY,
  viewYaw,
  yawStep,
} from '../../../../src/render/track/project';
import { executeCommand } from '../../../../src/sim/commands';
import { pieceWorldSamples, trainCarPoses } from '../../../../src/sim/rides/track/api';
import { getLayout, newSamplePoint } from '../../../../src/sim/rides/track/layout';
import type { TrackDir, TrackPieceInstance } from '../../../../src/sim/rides/track/types';
import { makeTestWorld, runTicks } from '../../../helpers/world';
import { buildR1, dataOf } from '../../track/helpers';

const piece = (defId: string, dir: TrackDir, x = 10, y = 10, z = 8): TrackPieceInstance => ({ defId, x, y, z, dir, chain: false, brakeSpeed: null, cost: 0 });

describe('piece sample → screen projection', () => {
  const f0 = viewFrame(0, 64, 64);

  it('rotation 0 equals the master iso formula (tileToScreen) for world metres', () => {
    for (const [wx, wy, wz] of [[0, 0, 0], [40, 8, 8], [13.5, 77.25, 23.75]] as const) {
      const t = tileToScreen(wx / 4, wy / 4, wz);
      expect(projectX(wx, wy, f0)).toBeCloseTo(t.sx, 9);
      expect(projectY(wx, wy, wz, f0)).toBeCloseTo(t.sy, 9);
    }
  });

  it('a straight piece in each of the 4 track directions runs from its entry joint to its exit joint on screen', () => {
    // Entry joint: the middle of the entry tile's back edge; exit joint: the middle of its front edge.
    const joints: Record<TrackDir, [[number, number], [number, number]]> = {
      0: [[10, 10.5], [11, 10.5]],
      1: [[10.5, 10], [10.5, 11]],
      2: [[11, 10.5], [10, 10.5]],
      3: [[10.5, 11], [10.5, 10]],
    };
    for (const dir of [0, 1, 2, 3] as TrackDir[]) {
      const s = pieceWorldSamples(piece('straight', dir));
      const [a, b] = joints[dir];
      const first = tileToScreen(a[0], a[1], 8);
      const last = tileToScreen(b[0], b[1], 8);
      expect(projectX(s.x[0]!, s.y[0]!, f0)).toBeCloseTo(first.sx, 9);
      expect(projectY(s.x[0]!, s.y[0]!, s.z[0]!, f0)).toBeCloseTo(first.sy, 9);
      expect(projectX(s.x[s.n - 1]!, s.y[s.n - 1]!, f0)).toBeCloseTo(last.sx, 9);
      expect(projectY(s.x[s.n - 1]!, s.y[s.n - 1]!, s.z[s.n - 1]!, f0)).toBeCloseTo(last.sy, 9);
    }
  });

  it('a steep slope climbs 6 m = 48 px on screen in every direction', () => {
    for (const dir of [0, 1, 2, 3] as TrackDir[]) {
      const s = pieceWorldSamples(piece('steep_up', dir));
      const dy = projectY(s.x[s.n - 1]!, s.y[s.n - 1]!, s.z[s.n - 1]!, f0) - projectY(s.x[s.n - 1]!, s.y[s.n - 1]!, s.z[0]!, f0);
      expect(dy).toBeCloseTo(-48, 9);
    }
  });

  it('view rotations turn the map before projecting; four turns are the identity', () => {
    const f1 = viewFrame(1, 64, 32);
    const f2 = viewFrame(2, 64, 32);
    const f3 = viewFrame(3, 64, 32);
    // Map corners map onto corners.
    expect([viewX(0, 0, f1), viewY(0, 0, f1)]).toEqual([128, 0]);
    expect([viewX(0, 0, f2), viewY(0, 0, f2)]).toEqual([256, 128]);
    expect([viewX(0, 0, f3), viewY(0, 0, f3)]).toEqual([0, 256]);
    // Rotating a point four times by quarter turns of a square map returns it.
    const sq = viewFrame(1, 32, 32);
    let x = 13;
    let y = 47;
    for (let k = 0; k < 4; k++) {
      const nx = viewX(x, y, sq);
      const ny = viewY(x, y, sq);
      x = nx;
      y = ny;
    }
    expect([x, y]).toEqual([13, 47]);
    expect(viewYaw(0, f1)).toBeCloseTo(Math.PI / 2, 12);
    expect(viewFrame(5, 64, 64).rot).toBe(1);
    expect(viewFrame(-1, 64, 64).rot).toBe(3);
  });
});

describe('slice depth keys (§4.13: (x + y, railMin, layer))', () => {
  const f0 = viewFrame(0, 64, 64);

  it('rotation 0 matches the renderer tile depth and packed key', () => {
    expect(tileDepthView(5, 2, f0)).toBeCloseTo(tileDepth(5, 2), 12);
    expect(sliceSortKey(5, 2, 24, f0)).toBe(packDepth(tileDepth(5, 2), 24, Layer.Object));
  });

  it('nearer tiles sort later; on one tile a higher rail sorts later; layers break ties', () => {
    expect(sliceSortKey(5, 3, 8, f0)).toBeGreaterThan(sliceSortKey(5, 2, 30, f0));
    expect(sliceSortKey(5, 2, 24, f0)).toBeGreaterThan(sliceSortKey(5, 2, 8, f0));
    expect(sliceSortKey(5, 2, 8, f0, Layer.Guest)).toBeGreaterThan(sliceSortKey(5, 2, 8, f0, Layer.Object));
    // A rotated view reverses the order along the turned axis.
    const f2 = viewFrame(2, 64, 64);
    expect(sliceSortKey(5, 3, 8, f2)).toBeLessThan(sliceSortKey(5, 2, 8, f2));
  });
});

describe('support heights', () => {
  it('a support runs from the ground to the underside of the rail', () => {
    expect(supportHeight(24, 8, 0.5)).toBe(15.5);
    expect(supportHeight(8, 8, 0.5)).toBe(0);
    expect(supportHeight(9, 8, 0.25)).toBe(0.75);
  });
});

describe('track frame vectors', () => {
  it('flat track: up is +z, right is +y when heading +x; a right bank lowers the right rail', () => {
    const fr = new Float64Array(9);
    trackFrame(0, 0, 0, 1, fr);
    expect(Array.from(fr).map((v) => Math.round(v * 1e9) / 1e9 + 0)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const b = (35 * Math.PI) / 180;
    trackFrame(0, 0, Math.sin(b), Math.cos(b), fr);
    expect(fr[5]).toBeCloseTo(-Math.sin(b), 12);
    expect(fr[8]).toBeCloseTo(Math.cos(b), 12);
    // Straight up the loop wall: up points back toward the loop centre (−x).
    trackFrame(0, Math.PI / 2, 0, 1, fr);
    expect(fr[6]).toBeCloseTo(-1, 12);
    expect(fr[8]).toBeCloseTo(0, 12);
  });

  it('car sprite steps: 16 yaw steps and 24 pitch steps, wrapping', () => {
    expect(yawStep(0)).toBe(0);
    expect(yawStep(Math.PI / 2)).toBe(4);
    expect(yawStep(-Math.PI / 2)).toBe(12);
    expect(yawStep(Math.PI * 2)).toBe(0);
    expect(pitchStep(0.4636)).toBe(2);
    expect(pitchStep(Math.PI)).toBe(12);
    expect(pitchStep(-0.98)).toBe(20);
  });
});

describe('car pose interpolation', () => {
  it('interpolatedS moves by v · dt · alpha and wraps at the circuit length', () => {
    expect(interpolatedS(1000, 10_000, 0, 50_000)).toBe(1000);
    expect(interpolatedS(1000, 10_000, 0.5, 50_000)).toBe(1250);
    expect(interpolatedS(49_900, 10_000, 1, 50_000)).toBe(400);
    expect(interpolatedS(1000, 10_000, 3, 50_000)).toBe(1500);
    expect(interpolatedS(5, 0, 0.5, 0)).toBe(0);
    expect(carCentreMm(10_000, 4, 0, 2500)).toBe(13_750);
    expect(carCentreMm(10_000, 4, 3, 2500)).toBe(6250);
  });

  it('matches the track API car poses at alpha 0 and moves along the track between ticks', () => {
    const w = makeTestWorld();
    const id = buildR1(w);
    executeCommand(w, { type: 'startTestRun', rideId: id });
    runTicks(w, 300);
    const data = dataOf(w, id);
    const layout = getLayout(data);
    const t = data.trains[0]!;
    expect(t.v).toBeGreaterThan(0);
    const api = trainCarPoses(w, id)[0]!;
    const sp = newSamplePoint();
    const pose = newCarPose();
    const cars = api.cars.length;
    for (let k = 0; k < cars; k++) {
      carPoseAt(layout, carCentreMm(interpolatedS(t.s, t.v, 0, layout.lengthMm), cars, k, 2500), sp, pose);
      const ref = api.cars[k]!;
      expect(pose.x).toBeCloseTo(ref.x, 9);
      expect(pose.y).toBeCloseTo(ref.y, 9);
      expect(pose.z).toBeCloseTo(ref.z, 9);
      expect(pose.yaw).toBeCloseTo(ref.yaw, 9);
      expect(pose.pitch).toBeCloseTo(ref.pitch, 9);
    }
    // Half a tick later the front car has moved about v · 0.025 s along the track.
    const a = { ...carPoseAt(layout, carCentreMm(interpolatedS(t.s, t.v, 0, layout.lengthMm), cars, 0, 2500), sp, pose) };
    const b = { ...carPoseAt(layout, carCentreMm(interpolatedS(t.s, t.v, 0.5, layout.lengthMm), cars, 0, 2500), sp, newCarPose()) };
    const moved = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    expect(moved).toBeCloseTo((t.v / 1000) * 0.025, 2);
  });
});
