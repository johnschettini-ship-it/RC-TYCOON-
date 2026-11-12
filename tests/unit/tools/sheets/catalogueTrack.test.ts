/** Phase 8b stage 0b test (never merged): the catalogue of track pictures and elevated paths. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_TRACK_PIECES, ALL_TRACK_TYPES } from '../../../../src/data/track';
import { GATE_ROOFS, K_CAR, K_GATE, K_RAIL, K_SUPPORT, gateKey } from '../../../../src/render/pixel/app/keys';
import { INK_SLOT, SLOT_NAMES, slotIndex, slotOf } from '../../../../src/render/pixel/palette';
import { clearSurfaceArt, installSurfaceArt } from '../../../../src/render/pixel/surfaceArt';
import { samplesOf, type SliceRec } from '../../../../src/render/track/layer';
import { pitchStep, rollStep, viewFrame, yawStep } from '../../../../src/render/track/project';
import { pieceStatic } from '../../../../src/sim/rides/track/geometry';
import type { TrackPieceInstance } from '../../../../src/sim/rides/track/types';
import { elevatedSpecs } from '../../../../tools/sheets/catalogue/elevated';
import { linearCrossings, onePieceSlices, piecesOf, poseWalk, railPicture, rollCrossing, supportPicture, trackSpecs, trackSwappable } from '../../../../tools/sheets/catalogue/track';
import type { PictureSpec } from '../../../../tools/sheets/catalogue/types';
import type { Picture } from '../../../../tools/sheets/picture';
import { SENTINEL } from '../../../../tools/sheets/ramps';

beforeEach(installSurfaceArt);
afterEach(clearSurfaceArt);

const specs = trackSpecs();
const rampOf = (slot: number): string => (SLOT_NAMES[slot] as string).replace(/\d+$/, '');
const piece = (defId: string, z: number, dir: 0 | 1 | 2 | 3 = 0): TrackPieceInstance => ({ defId, x: 16, y: 16, z, dir, chain: false, brakeSpeed: null, cost: 0 });

/** Fixed (not role) colours of rails: ties, the go-kart road and kerbs, water, troughs, tunnel boxes, beams, brakes. */
const FIXED_RAIL_HEX = [
  '#434b57',
  '#6b4a2b',
  '#7a5634',
  '#5b4a6e',
  '#3f9fd8',
  '#2b78b8',
  '#9fd8f5',
  '#f2fbff',
  '#eaf5fb',
  '#2b2f36',
  '#2b3440',
  '#c9ccd2',
  '#a2946f',
  '#ddd0b2',
  '#b8a988',
  '#f2c230',
  '#4a505a',
  '#f4f4f4',
  '#f08a24',
  '#30353d',
  '#46d160',
  '#4a3a73',
  '#2d2347',
  '#160f24',
  '#e8f6ff',
];

/**
 * Pixels of a role picture (`a`, painted with the sentinel) that are no role-ramp slot where the same paint with a plain
 * blue (`b`) differs: a role colour that left its ramp (controller repair 3; a translucent fill over a role pixel can be
 * snapped out of the ramp by `nearestInFamily`).
 */
const body = { rails: 0, supports: 0 };
function offRole(a: Picture, b: Picture, ramp: string, part: 'rails' | 'supports'): Array<{ k: number; slot: string; twin: string }> {
  expect([a.w, a.h, a.ox, a.oy]).toEqual([b.w, b.h, b.ox, b.oy]);
  const out: Array<{ k: number; slot: string; twin: string }> = [];
  for (let k = 0; k < a.slots.length; k++) {
    const s = a.slots[k] as number;
    if (s === b.slots[k] || s === 0 || s === INK_SLOT) continue;
    body[part]++;
    if (rampOf(s) !== ramp) out.push({ k, slot: SLOT_NAMES[s] as string, twin: SLOT_NAMES[b.slots[k] as number] as string });
  }
  return out;
}

const BLUE = '#3d9be0';

describe('catalogue of track pictures', () => {
  it('rail pictures of one piece at two heights are the same picture', () => {
    const f = viewFrame(1, 64, 64);
    for (const id of ['straight', 'gentle_up', 'turn_medium_left']) {
      const a = onePieceSlices('steel_coaster', piece(id, 4), f);
      const b = onePieceSlices('steel_coaster', piece(id, 7), f);
      expect(a.length).toBeGreaterThan(0);
      expect(b.length).toBe(a.length);
      a.forEach((sa, i) => {
        const pa = railPicture(sa, f, 4);
        const pb = railPicture(b[i] as SliceRec, f, 7);
        expect([pa.w, pa.h, pa.ox, pa.oy]).toEqual([pb.w, pb.h, pb.ox, pb.oy]);
        expect(Array.from(pa.slots)).toEqual(Array.from(pb.slots));
      });
    }
  });

  it('rail pictures hold only rt slots, ink and transparent', () => {
    const fixed = new Set(FIXED_RAIL_HEX.map((h) => slotOf(h)));
    const rails = specs.filter((s) => s.kind === K_RAIL);
    const stride = Math.floor(rails.length / 20);
    const extra = new Map<string, number>();
    for (let i = 0; i < 20; i++) {
      const s = rails[i * stride] as PictureSpec;
      const p = s.paint();
      expect(p.slots.length, s.group).toBeGreaterThan(0);
      for (const v of p.slots) {
        if (v === 0 || v === INK_SLOT || rampOf(v) === 'rt' || fixed.has(v)) continue;
        const name = `${s.group}:${SLOT_NAMES[v]}`;
        extra.set(name, (extra.get(name) ?? 0) + 1);
      }
    }
    expect(Object.fromEntries(extra)).toEqual({});
  });

  it('role colours stay in their ramps on rails and supports (controller repair 3)', () => {
    let total = 0;
    const found: string[] = [];
    // Rails: every track type and every piece it builds, view 0.
    const f = viewFrame(0, 64, 64);
    for (const type of ALL_TRACK_TYPES) {
      for (const def of piecesOf(type)) {
        for (const sl of onePieceSlices(type.id, piece(def.id, 4), f)) {
          const a = railPicture(sl, f, 4);
          const b = railPicture({ ...sl, colours: { track: BLUE, supports: BLUE, cars: BLUE } }, f, 4);
          const off = offRole(a, b, 'rt', 'rails');
          total += off.length;
          for (const o of off.slice(0, 2)) found.push(`${type.id}/${def.id}: ${o.slot} (blue twin ${o.twin})`);
        }
      }
    }
    // Supports: every style, view, part. `supportPicture` paints the sentinel; the twin paints blue.
    for (const style of ['arm', 'lattice', 'pillar', 'round'] as const) {
      for (const view of [0, 1, 2, 3]) {
        for (const part of [0, 1, 2] as const) {
          const a = supportPicture(style, view, part);
          const b = supportPicture(style, view, part, BLUE);
          const off = offRole(a, b, 'rs', 'supports');
          total += off.length;
          for (const o of off.slice(0, 2)) found.push(`support ${style}/${view}/${part}: ${o.slot} (blue twin ${o.twin})`);
        }
      }
    }
    expect(body.rails).toBeGreaterThan(1000);
    expect(body.supports).toBeGreaterThan(100);
    console.log(`[catalogueTrack] role pixels outside their ramp: ${total} (role pixels compared: rails ${body.rails}, supports ${body.supports})${found.length ? `\n  ${found.join('\n  ')}` : ''}`);
    expect(total).toBe(0);
  });

  it('the pose walk finds the corkscrew rolls', () => {
    const { poses } = poseWalk();
    console.log(`[catalogueTrack] pose set size ${poses.length}`);
    expect(poses.length).toBeGreaterThan(16);
    expect(poses.some((p) => p.roll !== 0)).toBe(true);
    // corkscrew_right alone rolls; every sample pose of it, in all 4 views, is in the walk (fix round 1, M3).
    const set = new Set(poses.map((p) => (p.yaw * 24 + p.pitch) * 16 + p.roll));
    const s = samplesOf(piece('corkscrew_right', 8));
    let rolls = 0;
    for (let i = 0; i < s.n; i++) {
      const y = yawStep(s.yaw[i] as number);
      const p = pitchStep(s.pitch[i] as number);
      const r = rollStep(s.bankSin[i] as number, s.bankCos[i] as number);
      if (r !== 0) rolls++;
      for (let k = 0; k < 4; k++) expect(set.has((((y + 4 * k) & 15) * 24 + p) * 16 + r), `sample ${i} view ${k}`).toBe(true);
    }
    expect(rolls).toBeGreaterThan(0);
  });

  it('every pose between samples (5 mm steps, as sampleAt interpolates) is in the walk (fix round 1, I1)', () => {
    const { poses, spinPoses } = poseWalk();
    const set = new Set(poses.map((p) => (p.yaw * 24 + p.pitch) * 16 + p.roll));
    const pairs = new Set(spinPoses.map((p) => p.pitch * 16 + p.roll));
    const missing: string[] = [];
    let checked = 0;
    for (const def of ALL_TRACK_PIECES) {
      const sm = pieceStatic(def.id).samples;
      const lengthMm = Math.round((sm.s[sm.n - 1] as number) * 1000);
      for (let u = 0; u < lengthMm; u += 5) {
        // The interpolation of `sampleAt` (src/sim/rides/track/layout.ts) within one piece.
        const um = u / 1000;
        let k = Math.floor(u / 250);
        if (k > sm.n - 2) k = sm.n - 2;
        if (k < 0) k = 0;
        const s0 = sm.s[k] as number;
        const s1 = sm.s[k + 1] as number;
        let f = s1 > s0 ? (um - s0) / (s1 - s0) : 0;
        if (f < 0) f = 0;
        else if (f > 1) f = 1;
        const lerp = (a: Float64Array): number => (a[k] as number) + ((a[k + 1] as number) - (a[k] as number)) * f;
        const p = pitchStep(lerp(sm.theta));
        const r = rollStep(lerp(sm.sinB), lerp(sm.cosB));
        if (!pairs.has(p * 16 + r)) missing.push(`${def.id} u ${u}: spin pair (${p}, ${r})`);
        for (let view = 0; view < 4; view++) {
          const y = yawStep(lerp(sm.yaw) + (view * Math.PI) / 2);
          checked++;
          if (!set.has((y * 24 + p) * 16 + r)) missing.push(`${def.id} u ${u} view ${view}: (${y}, ${p}, ${r})`);
        }
      }
    }
    console.log(`[catalogueTrack] poses checked ${checked}; walk ${poses.length} poses, ${spinPoses.length} spin poses`);
    expect(missing.slice(0, 10)).toEqual([]);
  });

  it('crossing formulas on constructed segments (fix round 1, I1)', () => {
    // sB 0 → 1, cB 1 → 0: the bank angle crosses π/4 at t = 0.5; the opposite ray (π/4 + π) is never crossed.
    expect(rollCrossing(0, 1, 1, 0, Math.PI / 4)).toBeCloseTo(0.5, 12);
    expect(rollCrossing(0, 1, 1, 0, Math.PI / 4 + Math.PI)).toBeNull();
    expect(rollCrossing(0, 1, 0, 1, Math.PI / 4)).toBeNull();
    // A boundary the roll step sees: (0 + 0.5) × 2π / 16; rollStep changes from 0 to 1 there.
    const phi = Math.PI / 16;
    const t = rollCrossing(0, 1, Math.sin(phi * 3), Math.cos(phi * 3), phi) as number;
    const at = (u: number): number => rollStep(Math.sin(phi * 3) * u, 1 + (Math.cos(phi * 3) - 1) * u);
    expect(at(t - 1e-9)).toBe(0);
    expect(at(t + 1e-9)).toBe(1);
    // Linear yaw 0 → 2π × 1.25 / 16 crosses the 16-step boundary at 0.5 / 1.25 = 0.4 only.
    const c = linearCrossings(0, (Math.PI * 2 * 1.25) / 16, 16);
    expect(c.length).toBe(1);
    expect(c[0]).toBeCloseTo(0.4, 12);
    expect(linearCrossings(1, 1, 16)).toEqual([]);
  });

  it('gate booths carry their real roofs, not a swap (fix round 1, I2)', () => {
    const gates = specs.filter((s) => s.kind === K_GATE);
    expect(gates.map((g) => g.key)).toEqual([0, 1, 2, 3].map((i) => gateKey(i)));
    gates.forEach((g, i) => {
      const roof = slotOf(GATE_ROOFS[i] as string);
      const p = g.paint();
      expect([...p.slots].includes(roof), `gate ${i} roof ${GATE_ROOFS[i]}`).toBe(true);
      expect([...p.slots].some((v) => rampOf(v) === 'rt'), `gate ${i}`).toBe(false);
    });
    expect(trackSwappable('gate')).toBe(0);
  });

  it('car pictures of the same pose and different colours do not exist (one picture, swapped)', () => {
    const cars = specs.filter((s) => s.kind === K_CAR);
    expect(cars.length).toBeGreaterThan(0);
    expect(new Set(cars.map((s) => s.key)).size).toBe(cars.length);
    // Any spec key appears once per kind in the whole pack.
    for (const kind of [K_RAIL, K_SUPPORT]) {
      const ks = specs.filter((s) => s.kind === kind).map((s) => s.key);
      expect(new Set(ks).size).toBe(ks.length);
    }
    // A car paint uses the car ramp for the body.
    const p = (cars[0] as PictureSpec).paint();
    expect([...p.slots].some((v) => rampOf(v) === 'rc')).toBe(true);
    expect(SENTINEL.car).toBe('#817f7f');
    expect(slotIndex('rc3')).toBeGreaterThan(0);
  });

  it('deck pieces: 10 decks and 4 posts', () => expect(elevatedSpecs().length).toBe(14));
});
