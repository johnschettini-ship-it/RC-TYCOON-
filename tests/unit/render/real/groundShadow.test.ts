/**
 * Track shadows on slopes (2026-11-20, realistic look): a shadow used to be drawn as if the ground were flat at the
 * caster's tile height, so on a hillside it floated or sank. `shadowGround` samples the ground where the sun ray from a
 * point lands (the game's own surface, `surfaceHeight`) and fits a plane there; a shadow drawn on a horizontal plane
 * (the baked rail and support shadows, the car ellipse) is then moved and skewed onto that plane.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { surfaceHeight } from '../../../../src/render/iso';
import { setStepPx } from '../../../../src/render/heightStep';
import { REAL_STEP_PX } from '../../../../src/render/artStyle';
import { newShadowGround, shadowDrop, shadowGround, skewedShadowTransform } from '../../../../src/render/real/groundShadow';
import { railShadowPlane, sunShift } from '../../../../src/render/real/trackShadow';
import { buildRideSlices, realRailShadowPlacement } from '../../../../src/render/track/layer';
import { projectX, projectY, viewFrame } from '../../../../src/render/track/project';
import { TILE_M } from '../../../../src/data/tuning/track';
import { tileIndex, type MapState } from '../../../../src/sim/map';
import { makeTestWorld } from '../../../helpers/world';
import { buildR1 } from '../../track/helpers';

beforeAll(() => {
  vi.stubEnv('VITE_ART', 'real');
  setStepPx(REAL_STEP_PX);
});
afterAll(() => {
  vi.unstubAllEnvs();
  setStepPx(8);
});

/** A map whose ground rises 1 m per tile toward +x over columns 16..23 (slope mask E + S), flat at 16 m after. */
function rampMap(): MapState {
  const w = makeTestWorld();
  const m = w.state.map;
  for (let y = 0; y < m.height; y++) {
    for (let x = 16; x < m.width; x++) {
      const i = tileIndex(m, x, y);
      const k = Math.min(x - 16, 8);
      m.heights[i] = 8 + k;
      m.slope[i] = k < 8 ? 6 : 0;
    }
  }
  return m;
}

const ground = (m: MapState, x: number, y: number): number => surfaceHeight(m, x / TILE_M, y / TILE_M);

/** The exact sun-ray hit of point (x, y, z): march down the ray until it meets the ground. */
function exactHit(m: MapState, x: number, y: number, z: number, rx: number, ry: number): { x: number; y: number; z: number } {
  let lo = 0;
  let hi = 40;
  for (let i = 0; i < 80; i++) {
    const s = (lo + hi) / 2;
    if (z - s > ground(m, x + s * rx, y + s * ry)) lo = s;
    else hi = s;
  }
  return { x: x + lo * rx, y: y + lo * ry, z: z - lo };
}

describe('shadows on the ground under them', () => {
  for (const rot of [0, 1, 2, 3]) {
    it(`view turn ${rot}: a point's shadow lands on the sampled ground height on a slope`, () => {
      const m = rampMap();
      const f = viewFrame(rot, m.width, m.height);
      const G = newShadowGround();
      // 12 m up over the middle of the ramp (ground ~12 m), on and off tile centres
      for (const [x, y] of [[78, 90], [80.7, 101.3], [75.2, 70.4]] as const) {
        const z = 24;
        expect(shadowGround(m, x, y, z, f, G)).toBe(true);
        const s = shadowDrop(G, x, y, z);
        const hx = x + s * G.rx;
        const hy = y + s * G.ry;
        // the hit lies on the ground: its height is the surface's there
        expect(z - s).toBeCloseTo(ground(m, hx, hy), 6);
        // ... and agrees with marching the ray
        const e = exactHit(m, x, y, z, G.rx, G.ry);
        expect(hx).toBeCloseTo(e.x, 4);
        expect(hy).toBeCloseTo(e.y, 4);
        // drawn where the hit projects: the point's screen position moved by s metres along the sun shift
        const sh = sunShift();
        expect(projectX(x, y, f) + s * sh.x).toBeCloseTo(projectX(hx, hy, f), 6);
        expect(projectY(x, y, z, f) + s * sh.y).toBeCloseTo(projectY(hx, hy, z - s, f), 6);
        // the shadow runs shorter on ground that rises toward it than flat ground would make it (z − g at the foot)
        expect(Math.abs(s - (z - ground(m, x, y)))).toBeGreaterThan(0.05);
      }
    });
  }

  it('the skew carries a whole flat-plane shadow onto the slope: every point of it lands on the ground', () => {
    const m = rampMap();
    const f = viewFrame(0, m.width, m.height);
    const G = newShadowGround();
    const [cx, cy, P] = [78, 90, 22];
    expect(shadowGround(m, cx, cy, P, f, G)).toBe(true);
    const s0 = shadowDrop(G, cx, cy, P);
    const S0x = projectX(cx, cy, f);
    const S0y = projectY(cx, cy, P, f);
    const sh = sunShift();
    // device transform at zoom 2 with an offset: maps the plane shadow's device px onto the ground's
    const scale = 2, offX = 37, offY = -11;
    const t = skewedShadowTransform(G, s0, S0x, S0y, scale, offX, offY);
    for (const [dx, dy] of [[1.2, 0.4], [-1.5, 1.1], [0.3, -1.8]] as const) {
      const px = cx + dx, py = cy + dy;
      // that plane point's device px, and where the transform sends it
      const Dx = projectX(px, py, f) * scale + offX;
      const Dy = projectY(px, py, P, f) * scale + offY;
      const ox = t.a * Dx + t.c * Dy + t.e;
      const oy = t.b * Dx + t.d * Dy + t.f;
      // the exact hit of the ray through that plane point, in device px
      const e = exactHit(m, px, py, P, G.rx, G.ry);
      expect(ox).toBeCloseTo(projectX(e.x, e.y, f) * scale + offX, 2);
      expect(oy).toBeCloseTo(projectY(e.x, e.y, e.z, f) * scale + offY, 2);
    }
    // the reference point moves by exactly s0 along the shift
    const D0x = S0x * scale + offX, D0y = S0y * scale + offY;
    expect(t.a * D0x + t.c * D0y + t.e).toBeCloseTo(D0x + s0 * sh.x * scale, 6);
    expect(t.b * D0x + t.d * D0y + t.f).toBeCloseTo(D0y + s0 * sh.y * scale, 6);
  });

  it('flat ground is unchanged: no skew, and the drop is the height over the ground, as the rail placement shifts it', () => {
    const w = makeTestWorld();
    const id = buildR1(w);
    const m = w.state.map;
    for (const rot of [0, 1, 2, 3]) {
      const f = viewFrame(rot, m.width, m.height);
      const G = newShadowGround();
      for (const sl of buildRideSlices(w, id, f)) {
        const cx = (sl.x + 0.5) * TILE_M, cy = (sl.y + 0.5) * TILE_M;
        const P = railShadowPlane(sl.railMin);
        if (!shadowGround(m, cx, cy, P, f, G)) continue;
        expect(G.kx).toBe(0);
        expect(G.ky).toBe(0);
        expect(shadowDrop(G, cx, cy, P)).toBeCloseTo(P - sl.ground, 9);
        const old = realRailShadowPlacement(sl, f);
        const sh = sunShift();
        const s0 = shadowDrop(G, cx, cy, P);
        const rp = { ax: old.ax - (P - sl.ground) * sh.x, ay: old.ay - (P - sl.ground) * sh.y };
        expect(rp.ax + s0 * sh.x).toBeCloseTo(old.ax, 9);
        expect(rp.ay + s0 * sh.y).toBeCloseTo(old.ay, 9);
      }
    }
  });

  it('a shadow whose ground point is off the map is not drawn', () => {
    const m = rampMap();
    const f = viewFrame(0, m.width, m.height);
    const G = newShadowGround();
    // the sun's run on the map: aim at the edge it points to, high up (off the map) and just over the ground (on it)
    expect(shadowGround(m, 128, 128, 20, f, G)).toBe(true);
    const W = m.width * TILE_M;
    const H = m.height * TILE_M;
    const ex = Math.abs(G.rx) >= Math.abs(G.ry);
    const x = ex ? (G.rx > 0 ? W - 0.5 : 0.5) : 128;
    const y = ex ? 128 : G.ry > 0 ? H - 0.5 : 0.5;
    const g = ground(m, x, y);
    expect(shadowGround(m, x, y, g + 40, f, G)).toBe(false);
    expect(shadowGround(m, x, y, g + 0.2, f, G)).toBe(true);
  });
});
