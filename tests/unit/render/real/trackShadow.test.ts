/**
 * Batch 5 Task 4: track shadows in the realistic look. Rails and supports draw baked shadow frames on the ground,
 * shifted by the height they stand above it along one fixed screen vector per metre (`sunShift`); cars draw a live soft
 * ellipse at their ground point, shifted the same way (owner decision D1 a). Placement first: the bake's sun and
 * camera, the anchors, and the draw order.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { install } from '../fakeCanvas';
import { buildRideSlices, carShadowAt, realRailPlacement, realRailShadowPlacement, realSupportPlacement, realSupportShadowPlacement } from '../../../../src/render/track/layer';
import { railShadowPlane, sunShift, SHADOW_PLANE_BELOW_M, SUN_AZ_DEG, SUN_EL_DEG } from '../../../../src/render/real/trackShadow';
import { projectX, projectY, viewFrame } from '../../../../src/render/track/project';
import { setStepPx } from '../../../../src/render/heightStep';
import { REAL_STEP_PX } from '../../../../src/render/artStyle';
import { bakeCamera } from '../../../../tools/art3d/camera';
import { trackGeometry } from '../../../../tools/art3d/bakeNode';
import { buildPerfScene } from '../../../perf/scenes';
import type { ViewRotation } from '../../../../src/render/view';

beforeAll(() => {
  install();
  vi.stubEnv('VITE_ART', 'real');
  setStepPx(REAL_STEP_PX);
});
afterAll(() => {
  vi.unstubAllEnvs();
  setStepPx(8);
});

describe('the sun of the shadows is the bake\'s', () => {
  it('names the bake page\'s sun', () => {
    const src = readFileSync(new URL('../../../../tools/art3d/bakePage.ts', import.meta.url), 'utf8');
    const m = /sun: \{ color: '[^']+', intensity: [\d.]+, el: (\d+), az: (\d+) \}/.exec(src);
    expect([Number(m?.[1]), Number(m?.[2])]).toEqual([SUN_EL_DEG, SUN_AZ_DEG]);
  });

  it('a metre of height moves a shadow by the screen vector the bake camera draws for that sun ray', () => {
    const el = (SUN_EL_DEG * Math.PI) / 180, az = (SUN_AZ_DEG * Math.PI) / 180;
    const cam = bakeCamera(0, 4);
    // the ray from a point 1 m up to the ground (three.js sun direction (cos el cos az, sin el, cos el sin az), y up);
    // the bake stretches models up by heightScale under an unstretched sun, so the ray runs heightScale × cot el
    const run = (cam.heightScale * Math.cos(el)) / Math.sin(el);
    const p = cam.project(-run * Math.cos(az), -run * Math.sin(az), -1);
    const s = sunShift();
    expect(s.x).toBeCloseTo(p.sx / 4, 6);
    expect(s.y).toBeCloseTo(p.sy / 4, 6);
    // from the screen's left: shadows fall right, and down the screen
    expect(s.x).toBeGreaterThan(0);
    expect(s.y).toBeGreaterThan(REAL_STEP_PX * 0.5);
  });
});

describe('rail and support shadows (placement)', () => {
  const world = buildPerfScene('coaster');
  const rideId = world.state.rides.find((r) => r.kind === 'track')!.id;
  const data = world.state.track.rides[String(rideId)]!;

  it('a rail shadow is drawn at the rail\'s anchor, shifted by (shadow plane − ground) per metre; the plane is the bake\'s', () => {
    const geo = trackGeometry(data.typeId);
    let raised = 0;
    for (const rot of [0, 1, 2, 3] as ViewRotation[]) {
      const f = viewFrame(rot, world.state.map.width, world.state.map.height);
      for (const sl of buildRideSlices(world, rideId, f)) {
        const r = realRailPlacement(sl, f);
        const s = realRailShadowPlacement(sl, f);
        const h = railShadowPlane(sl.railMin) - sl.ground;
        expect(s.heading).toBe(r.heading);
        expect(s.ax).toBeCloseTo(r.ax + h * sunShift().x, 9);
        expect(s.ay).toBeCloseTo(r.ay + h * sunShift().y, 9);
        // The bake's plane for this tile: its railMin (piece at height 0) less the same depth.
        const piece = data.pieces[sl.pieceIndex]!;
        const tile = geo.pieces[piece.defId]!.dirs[piece.dir]!.tiles.filter((t) => t.rail)[sl.tile]!;
        expect(sl.railMin - piece.z).toBeCloseTo(tile.railMin, 6);
        if (h > 2) raised++;
      }
    }
    expect(raised).toBeGreaterThan(0);
    expect(SHADOW_PLANE_BELOW_M).toBeGreaterThan(0.57 + 0.3); // under the spine (0.57 m) with room for a steep run-on
  });

  it('each support piece\'s shadow sits at that piece\'s anchor, shifted by its height above the ground', () => {
    let n = 0;
    for (const rot of [0, 1] as ViewRotation[]) {
      const f = viewFrame(rot, world.state.map.width, world.state.map.height);
      for (const sl of buildRideSlices(world, rideId, f)) {
        const su = realSupportPlacement(sl, f);
        const sh = realSupportShadowPlacement(sl, f);
        if (!su) { expect(sh).toBeNull(); continue; }
        expect(sh!.heading).toBe(su.heading);
        expect(sh!.pieces.map((p) => p.part)).toEqual(su.pieces.map((p) => p.part));
        sh!.pieces.forEach((p, i) => {
          const z = su.pieces[i]!.z;
          expect(p.ax).toBeCloseTo(su.ax + (z - sl.ground) * sunShift().x, 9);
          expect(p.ay).toBeCloseTo(su.pieces[i]!.ay + (z - sl.ground) * sunShift().y, 9);
        });
        // the foot stands on the ground: its contact shadow is not shifted
        expect(sh!.pieces[0]!.ax).toBeCloseTo(su.ax, 9);
        n++;
      }
    }
    expect(n).toBeGreaterThan(5);
  });
});

describe('car shadows (owner decision D1 a: a live soft ellipse)', () => {
  it('centred on the car\'s ground point shifted by its height, long axis along the car', () => {
    const f = viewFrame(1, 40, 40);
    const [x, y, z, g, yaw] = [41.3, 22.7, 13, 3, 0.4];
    const e = carShadowAt(x, y, z, g, yaw, 0, 2.6, f);
    expect(e.cx).toBeCloseTo(projectX(x, y, f) + (z - g) * sunShift().x, 9);
    expect(e.cy).toBeCloseTo(projectY(x, y, z, f) + (z - g) * sunShift().y, 9);
    // the long axis is the car's heading on the ground, half the car long
    const ax = projectX(x + Math.cos(yaw) * 1.3, y + Math.sin(yaw) * 1.3, f) - projectX(x, y, f);
    const ay = projectY(x + Math.cos(yaw) * 1.3, y + Math.sin(yaw) * 1.3, 0, f) - projectY(x, y, 0, f);
    expect(e.ax).toBeCloseTo(ax, 9);
    expect(e.ay).toBeCloseTo(ay, 9);
    // a car on the ground: its shadow is under it
    const low = carShadowAt(x, y, g, g, yaw, 0, 2.6, f);
    expect([low.cx, low.cy]).toEqual([projectX(x, y, f), projectY(x, y, g, f)]);
  });

  it('a car pitched up casts a shorter shadow along the track', () => {
    const f = viewFrame(0, 40, 40);
    const flat = carShadowAt(10, 10, 5, 0, 0, 0, 2.6, f);
    const steep = carShadowAt(10, 10, 5, 0, 0, Math.PI / 3, 2.6, f);
    expect(Math.hypot(steep.ax, steep.ay)).toBeLessThan(Math.hypot(flat.ax, flat.ay));
  });
});

describe('the shadow pass draws track shadows (renderer)', () => {
  it('after the ground and before every rail: one rail shadow per slice drawn, one ellipse per car', async () => {
    const { FakeCanvas, make } = await import('../fakeCanvas');
    const { createCanvasRenderer } = await import('../../../../src/render/renderer');
    const { defaultToolState } = await import('../../../../src/render/types');
    const { mapToViewContinuous } = await import('../../../../src/render/view');
    const world = buildPerfScene('coaster');
    const sheet = () => ({ image: new FakeCanvas(64, 64), w: 20, h: 10, ox: 10, oy: 5, scale: 2, sx: 0, sy: 0 });
    const rail = sheet(), railSh = sheet(), sup = sheet(), supSh = sheet(), car = sheet();
    const calls: Record<string, number> = {};
    const n = (k: string) => { calls[k] = (calls[k] ?? 0) + 1; };
    const look = {
      density: () => 2, prepare() {}, dispose() {}, reclaim: () => 0, currentDensity: () => 2, incomplete: () => 0, soft: () => 0, fallbacksUsed: () => [],
      ride: () => undefined, stall: () => undefined, scenery: () => undefined, guest: () => undefined, staff: () => undefined, shadow: () => undefined, groundPiece: () => undefined,
      rail: () => (n('rail'), rail), car: () => (n('car'), car), support: () => sup,
      railPart: (_t: string, _p: string, _i: number, _h: number, part: string) => (n(`railPart:${part}`), part === 'sh' ? railSh : undefined),
      supportShadow: () => (n('supportShadow'), supSh),
    };
    const canvas = make(1600, 1000);
    const r = createCanvasRenderer(canvas as unknown as HTMLCanvasElement, { look: look as never });
    r.resize(1600, 1000, 1);
    const data = world.state.track.rides[Object.keys(world.state.track.rides)[0]!]!;
    const mid = data.pieces[Math.floor(data.pieces.length / 2)]!;
    const p = mapToViewContinuous(mid.x, mid.y, 0, world.state.map.width, world.state.map.height);
    const cam = { centerX: (p.u - p.v) * 32, centerY: (p.u + p.v) * 16 - 64, zoom: 1, rotation: 0 as const };
    r.draw(world, cam, defaultToolState(), 0);
    canvas.reset();
    for (const k of Object.keys(calls)) delete calls[k];
    r.draw(world, cam, defaultToolState(), 0);
    const at = (sp: { image: unknown }) => canvas.draws.map((d, i) => (d.image === sp.image ? i : -1)).filter((i) => i >= 0);
    const shadows = [...at(railSh), ...at(supSh)];
    const solid = [...at(rail), ...at(sup), ...at(car)];
    expect(at(railSh).length).toBeGreaterThan(10);
    expect(at(supSh).length).toBeGreaterThan(0);
    expect(Math.min(...shadows)).toBeGreaterThan(0); // the ground is drawn first
    expect(Math.max(...shadows)).toBeLessThan(Math.min(...solid));
    // one rail shadow per slice drawn, asked once a frame, except where it would fall off the map (2026-11-20: the
    // lift's shadow at the map's top edge here)
    const { newShadowGround, shadowGround } = await import('../../../../src/render/real/groundShadow');
    const G = newShadowGround();
    const f = viewFrame(0, world.state.map.width, world.state.map.height);
    const rideId = world.state.rides.find((x) => x.kind === 'track')!.id;
    const offMap = buildRideSlices(world, rideId, f).filter((sl) => !shadowGround(world.state.map, (sl.x + 0.5) * 4, (sl.y + 0.5) * 4, railShadowPlane(sl.railMin), f, G)).length;
    expect(offMap).toBeGreaterThan(0);
    expect(calls['railPart:sh']).toBe(calls.rail! - offMap);
    expect(at(railSh).length).toBe(at(rail).length - offMap);
    // one soft ellipse (a transformed unit circle) per car drawn
    expect(calls.car).toBeGreaterThan(0);
    expect(canvas.count('transform')).toBe(calls.car);
    expect(canvas.count('createRadialGradient')).toBe(0); // made on the first frame, kept
  });
});

describe('shadows fade at night (review P2)', () => {
  it('full strength by day, faded with the darkness at dusk, none at full night; the rails never fade', async () => {
    const { FakeCanvas, make } = await import('../fakeCanvas');
    const { createCanvasRenderer } = await import('../../../../src/render/renderer');
    const { defaultToolState } = await import('../../../../src/render/types');
    const { mapToViewContinuous } = await import('../../../../src/render/view');
    const { TICKS_PER_HOUR } = await import('../../../../src/data/tuning/core');
    const { MAX_DARKNESS } = await import('../../../../src/data/tuning/night');
    const { darknessAt } = await import('../../../../src/render/lighting/darkness');
    const world = buildPerfScene('coaster');
    world.state.park.afterDark = true;
    const sheet = () => ({ image: new FakeCanvas(64, 64), w: 20, h: 10, ox: 10, oy: 5, scale: 2, sx: 0, sy: 0 });
    const rail = sheet(), railSh = sheet(), sup = sheet(), supSh = sheet(), car = sheet();
    const look = {
      density: () => 2, prepare() {}, dispose() {}, reclaim: () => 0, currentDensity: () => 2, incomplete: () => 0, soft: () => 0, fallbacksUsed: () => [],
      ride: () => undefined, stall: () => undefined, scenery: () => undefined, guest: () => undefined, staff: () => undefined, shadow: () => undefined, groundPiece: () => undefined,
      rail: () => rail, car: () => car, support: () => sup,
      railPart: (_t: string, _p: string, _i: number, _h: number, part: string) => (part === 'sh' ? railSh : undefined),
      supportShadow: () => supSh,
    };
    const canvas = make(1600, 1000);
    const r = createCanvasRenderer(canvas as unknown as HTMLCanvasElement, { look: look as never });
    r.resize(1600, 1000, 1);
    const data = world.state.track.rides[Object.keys(world.state.track.rides)[0]!]!;
    const mid = data.pieces[Math.floor(data.pieces.length / 2)]!;
    const p = mapToViewContinuous(mid.x, mid.y, 0, world.state.map.width, world.state.map.height);
    const cam = { centerX: (p.u - p.v) * 32, centerY: (p.u + p.v) * 16 - 64, zoom: 1, rotation: 0 as const };
    const day = world.state.tick - (world.state.tick % (24 * TICKS_PER_HOUR));
    const at = (hour: number) => {
      world.state.tick = day + hour * TICKS_PER_HOUR;
      r.draw(world, cam, defaultToolState(), 0);
      canvas.reset();
      r.draw(world, cam, defaultToolState(), 0);
      const of = (sp: { image: unknown }) => canvas.draws.filter((d) => d.image === sp.image).map((d) => d.alpha);
      return { shadows: [...of(railSh), ...of(supSh)], solid: [...of(rail), ...of(sup), ...of(car)], ellipses: canvas.count('transform') };
    };
    const noon = at(12);
    expect(noon.shadows.length).toBeGreaterThan(10);
    expect(new Set(noon.shadows)).toEqual(new Set([1]));
    expect(noon.ellipses).toBeGreaterThan(0);
    const dusk = at(20);
    const k = 1 - darknessAt(world.state.tick, true) / MAX_DARKNESS;
    expect(k).toBeGreaterThan(0.3);
    expect(k).toBeLessThan(0.7);
    expect(dusk.shadows.length).toBe(noon.shadows.length);
    for (const a of dusk.shadows) expect(a).toBeCloseTo(k, 6);
    expect(new Set(dusk.solid)).toEqual(new Set([1]));
    const night = at(23);
    expect(night.shadows).toEqual([]);
    expect(night.ellipses).toBe(0);
    expect(night.solid.length).toBeGreaterThan(10);
    expect(new Set(night.solid)).toEqual(new Set([1]));
    // after-dark off: the clock never darkens, shadows stay full
    world.state.park.afterDark = false;
    expect(new Set(at(23).shadows)).toEqual(new Set([1]));
  });
});

describe('the shadow module follows the layer', () => {
  it('names the layer\'s drawable kinds', async () => {
    const src = readFileSync(new URL('../../../../src/render/track/layer.ts', import.meta.url), 'utf8');
    const { SHADOW_SUB_SLICE, SHADOW_SUB_CAR } = await import('../../../../src/render/track/realShadow');
    expect(src).toContain(`const SUB_SLICE = ${SHADOW_SUB_SLICE};`);
    expect(src).toContain(`const SUB_CAR = ${SHADOW_SUB_CAR};`);
  });
});

describe('culling counts the shadow (review P2: a tall lift\'s shadow popped at the screen edge)', () => {
  const world = buildPerfScene('coaster');
  type Cars = { n: number; x: Float64Array; y: Float64Array; z: Float64Array; mapYaw: Float64Array; pitch: Float64Array };
  const collect = async (layer: unknown, view: { x0: number; y0: number; x1: number; y1: number }) => {
    const items: { ref: number; sub: number }[] = [];
    (layer as { collect: (...a: unknown[]) => void }).collect(world, { push: (_k: number, ref: number, sub: number) => items.push({ ref, sub }) }, view, 1, 1, 0, 0, 0, 0);
    return items;
  };

  it('a slice whose rail is off screen but whose shadow is on screen is collected', async () => {
    const { TrackLayer } = await import('../../../../src/render/track/layer');
    const layer = new TrackLayer();
    await collect(layer, { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 });
    const L = layer as unknown as { slices: ReturnType<typeof buildRideSlices>; frameRef: ReturnType<typeof viewFrame> };
    const i = L.slices.reduce((b, sl, k) => (sl.railMin - sl.ground > L.slices[b]!.railMin - L.slices[b]!.ground ? k : b), 0);
    const sl = L.slices[i]!;
    expect(sl.railMin - sl.ground).toBeGreaterThan(8);
    const sh = realRailShadowPlacement(sl, L.frameRef);
    const view = { x0: sh.ax - 1, y0: sh.ay - 1, x1: sh.ax + 1, y1: sh.ay + 1 };
    const b = sl.bounds;
    // the rail's own bounds miss the view
    expect(sl.ax + b.right < view.x0 || sl.ax + b.left > view.x1 || sl.ay + b.bottom < view.y0 || sl.ay + b.top > view.y1).toBe(true);
    const items = await collect(layer, view);
    expect(items).toContainEqual({ ref: i, sub: 0 });
  });

  it('a car whose body is off screen but whose shadow is on screen is collected', async () => {
    const { TrackLayer } = await import('../../../../src/render/track/layer');
    const { CAR_BOUNDS } = await import('../../../../src/render/track/paint');
    const layer = new TrackLayer();
    await collect(layer, { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 });
    const L = layer as unknown as { cars: Cars; frameRef: ReturnType<typeof viewFrame> };
    const map = world.state.map;
    const ground = (k: number) => map.heights[Math.floor(L.cars.y[k]! / 4) * map.width + Math.floor(L.cars.x[k]! / 4)] as number;
    let best = 0;
    for (let k = 0; k < L.cars.n; k++) if (L.cars.z[k]! - ground(k) > L.cars.z[best]! - ground(best)) best = k;
    const [x, y, z] = [L.cars.x[best]!, L.cars.y[best]!, L.cars.z[best]!];
    expect(z - ground(best)).toBeGreaterThan(5);
    const e = carShadowAt(x, y, z, ground(best), L.cars.mapYaw[best]!, L.cars.pitch[best]!, 2, L.frameRef);
    const view = { x0: e.cx - 1, y0: e.cy - 1, x1: e.cx + 1, y1: e.cy + 1 };
    const ax = projectX(x, y, L.frameRef), ay = projectY(x, y, z, L.frameRef);
    expect(ax + CAR_BOUNDS.right < view.x0 || ax + CAR_BOUNDS.left > view.x1 || ay + CAR_BOUNDS.bottom < view.y0 || ay + CAR_BOUNDS.top > view.y1).toBe(true);
    const items = await collect(layer, view);
    const cars = items.filter((it) => it.sub === 2).map((it) => [L.cars.x[it.ref], L.cars.y[it.ref]]);
    expect(cars).toContainEqual([x, y]);
  });
});
