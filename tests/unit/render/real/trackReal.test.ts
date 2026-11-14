/**
 * Task 9b: the track layer's realistic rails and supports follow the bake's contract (tools/art3d/items/steel_coaster.js):
 * rails keyed by the piece's heading in the view and anchored at the piece's entry height; supports stacked from
 * `foot`, 1 m `seg`s and a `top` whose saddle meets the rail spine.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { install } from '../fakeCanvas';
import { buildRideSlices, realRailPlacement, realSupportPlacement } from '../../../../src/render/track/layer';
import { supportStack, SUPPORT_TOP_BELOW_RAIL, SUPPORT_TOP_HEIGHT } from '../../../../src/render/real/supportStack';
import { projectX, projectY, viewFrame, type ViewFrame } from '../../../../src/render/track/project';
import { TILE_M } from '../../../../src/data/tuning/track';
import { buildPerfScene } from '../../../perf/scenes';
import type { ViewRotation } from '../../../../src/render/view';

beforeAll(() => {
  install();
  vi.stubEnv('VITE_ART', 'real');
});
afterAll(() => vi.unstubAllEnvs());

/** Spine of the baked steel rail (steel_coaster.js railModel: box centred 0.42 m under the rail line, 0.3 m tall). */
const SPINE_BOTTOM_BELOW_RAIL = 0.42 + 0.15;
const SPINE_TOP_BELOW_RAIL = 0.42 - 0.15;

function frameFor(world: ReturnType<typeof buildPerfScene>, rot: ViewRotation): ViewFrame {
  const m = world.state.map;
  return viewFrame(rot, m.width, m.height);
}

describe('realistic rails (Task 9b)', () => {
  it('heading = (piece.dir + view turn) mod 4, anchored at the tile centre at the piece\'s entry height', () => {
    const world = buildPerfScene('coaster');
    const rideId = world.state.rides.find((r) => r.kind === 'track')!.id;
    const data = world.state.track.rides[String(rideId)]!;
    let raised = 0;
    const headings = new Set<number>();
    for (const rot of [0, 1, 2, 3] as ViewRotation[]) {
      const f = frameFor(world, rot);
      const slices = buildRideSlices(world, rideId, f);
      expect(slices.length).toBeGreaterThan(20);
      for (const sl of slices) {
        const piece = data.pieces[sl.pieceIndex]!;
        const p = realRailPlacement(sl, f);
        expect(p.heading).toBe((piece.dir + rot) % 4);
        headings.add(p.heading);
        const cx = (sl.x + 0.5) * TILE_M;
        const cy = (sl.y + 0.5) * TILE_M;
        expect(p.ax).toBeCloseTo(projectX(cx, cy, f), 9);
        expect(p.ay).toBeCloseTo(projectY(cx, cy, piece.z, f), 9);
        if (piece.z > 0) raised++;
      }
    }
    // The scene's coaster runs every way and above the ground: the old anchor (height 0, view turn) was wrong for it.
    expect(headings.size).toBe(4);
    expect(raised).toBeGreaterThan(0);
  });
});

describe('support stacking (Task 9b)', () => {
  it('the top piece\'s saddle meets the rail spine', () => {
    const postTop = -SUPPORT_TOP_BELOW_RAIL + SUPPORT_TOP_HEIGHT;
    expect(postTop).toBeGreaterThanOrEqual(-SPINE_BOTTOM_BELOW_RAIL);
    expect(postTop).toBeLessThanOrEqual(-SPINE_BOTTOM_BELOW_RAIL + 0.1);
    expect(postTop).toBeLessThan(-SPINE_TOP_BELOW_RAIL);
  });

  it('foot on the ground, 1 m segments without gaps or overshoot, top under the rail', () => {
    const ground = 8;
    const rail = 14.3;
    const st = supportStack(rail, ground);
    expect(st[0]).toEqual({ part: 'foot', z: ground });
    expect(st[st.length - 1]).toEqual({ part: 'top', z: rail - SUPPORT_TOP_BELOW_RAIL });
    const segs = st.filter((p) => p.part === 'seg').map((p) => p.z);
    const top = rail - SUPPORT_TOP_BELOW_RAIL;
    // Segment i at i m above the ground; the last one ends (1.1 m drawn) just under the top plate (0.22 m).
    expect(segs[0]).toBe(ground);
    for (let i = 1; i < segs.length; i++) expect(segs[i]! - segs[i - 1]!).toBeLessThanOrEqual(1);
    for (let i = 0; i < segs.length - 1; i++) expect(segs[i]).toBe(ground + i);
    expect(segs[segs.length - 1]! + 1).toBeCloseTo(top, 9);
    expect(segs.length).toBe(Math.ceil(top - ground));
    // Drawn bottom-up: foot, segments, top.
    expect(st.map((p) => p.part)).toEqual(['foot', ...segs.map(() => 'seg'), 'top']);
  });

  it('a whole number of metres stacks exactly, and a short column keeps foot and top', () => {
    const exact = supportStack(8 + 3 + SUPPORT_TOP_BELOW_RAIL, 8).filter((p) => p.part === 'seg').map((p) => p.z);
    expect(exact).toEqual([8, 9, 10]);
    const short = supportStack(8 + 0.6 + SUPPORT_TOP_BELOW_RAIL, 8);
    expect(short.map((p) => p.part)).toEqual(['foot', 'seg', 'top']);
    expect(short[1]!.z).toBe(8);
    // Rail too low for a column: the saddle sits on the ground.
    expect(supportStack(8.5, 8)).toEqual([{ part: 'top', z: 8 }]);
  });

  it('the saddle heading follows the track in the view, and the stack stands at the support point', () => {
    const world = buildPerfScene('coaster');
    const rideId = world.state.rides.find((r) => r.kind === 'track')!.id;
    let n = 0;
    for (const rot of [0, 1] as ViewRotation[]) {
      const f = frameFor(world, rot);
      for (const sl of buildRideSlices(world, rideId, f)) {
        if (!sl.support) continue;
        const p = realSupportPlacement(sl, f)!;
        const yaw = sl.support.yaw + (rot * Math.PI) / 2;
        expect(p.heading).toBe((((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4));
        expect(p.ax).toBeCloseTo(projectX(sl.support.wx, sl.support.wy, f), 9);
        // Each piece's anchor y: the support point at the piece's height.
        for (const piece of p.pieces) expect(piece.ay).toBeCloseTo(projectY(sl.support.wx, sl.support.wy, piece.z, f), 9);
        expect(p.pieces[0]!.z).toBe(sl.ground);
        n++;
      }
    }
    expect(n).toBeGreaterThan(5);
  });
});

describe('bake and reader agree on the support and spine sizes', () => {
  it('steel_coaster.js builds the spine, plate and post the reader assumes, and names the reader\'s constant', () => {
    const src = readFileSync(new URL('../../../../tools/art3d/items/steel_coaster.js', import.meta.url), 'utf8');
    expect(src).toContain('boxProfile(0, -0.42, 0.26, 0.3)'); // spine: 0.27-0.57 m under the rail line
    expect(src).toContain('new THREE.BoxGeometry(0.3, 0.22, 1.3)'); // plate 0.22 m
    expect(src).toContain('new THREE.CylinderGeometry(0.12, 0.12, 0.45, 12)'); // post 0.45 m
    expect(0.22 + 0.45).toBeCloseTo(SUPPORT_TOP_HEIGHT, 9);
    expect(src).toContain(`SUPPORT_TOP_BELOW_RAIL = ${SUPPORT_TOP_BELOW_RAIL} m`);
  });
});
