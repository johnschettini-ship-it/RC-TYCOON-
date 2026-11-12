/** Phase 8b stage 0b test (never merged): reserved ramps, colour roles, swap and ghost tables, shadow pictures. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INK_SLOT, RAMPS, SLOT_NAMES, nearestInFamily, slotIndex, slotOf } from '../../../../src/render/pixel/palette';
import { clearSurfaceArt, installSurfaceArt } from '../../../../src/render/pixel/surfaceArt';
import type { CasterMask } from '../../../../src/render/pixel/shadows';
import { shade } from '../../../../src/render/palette';
import { TRACK_PALETTE } from '../../../../src/render/track/colours';
import { CAR_BOUNDS, paintCar } from '../../../../src/render/track/paint';
import { paintPicture } from '../../../../tools/sheets/picture';
import { SENTINEL, SHADOW_SLOT, ghostTable, shadowPicture, swapTable, withRoles } from '../../../../tools/sheets/ramps';

/** Slot count of the stage 0 palette (`SLOT_NAMES.length` at `phase8-stage0-proto`, slot `u4` was the last). */
const STAGE0_SLOTS = 93;

const rampOf = (slot: number): string => (SLOT_NAMES[slot] as string).replace(/\d+$/, '');
const roleSlots = (r: 'rt' | 'rs' | 'rc'): number[] => [1, 2, 3, 4, 5, 6].map((t) => slotIndex(`${r}${t}`));

/** Every `.ts` file under a folder. */
function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

beforeEach(installSurfaceArt);
afterEach(clearSurfaceArt);

describe('reserved ramps', () => {
  it('the reserved ramps exist and move no stage 0 slot', () => {
    expect(slotIndex('u4')).toBe(STAGE0_SLOTS - 1);
    expect(slotIndex('rt1')).toBeGreaterThan(slotIndex('u4'));
    expect(SLOT_NAMES.length).toBe(STAGE0_SLOTS + 18);
    expect(SLOT_NAMES.length).toBeLessThanOrEqual(256);
    for (const r of ['rt', 'rs', 'rc'] as const) expect(RAMPS[r]).toEqual(RAMPS.n);
  });
  it('the colour rules never return a reserved slot', () => {
    const first = slotIndex('rt1');
    for (const c of RAMPS.n) {
      const rgb = parseInt(c.slice(1), 16);
      expect(nearestInFamily(rgb)).toBeLessThan(first);
      expect(slotOf(c)).toBeLessThan(first);
    }
    for (let v = 0; v < 0x1000000; v += 0x0f0f0f) expect(nearestInFamily(v)).toBeLessThan(first);
  });
  it('no literal under src/render/ equals a sentinel', () => {
    const root = join(__dirname, '../../../../src/render');
    const all = tsFiles(root).map((f) => readFileSync(f, 'utf8').toLowerCase());
    expect(all.length).toBeGreaterThan(50);
    for (const s of Object.values(SENTINEL)) for (const text of all) expect(text.includes(s)).toBe(false);
  });
});

describe('colour roles', () => {
  it('a sentinel is tone 3 of its ramp; a shade of it moves by ln f / ln 1.18; other colours as slotOf', () => {
    withRoles(() => {
      expect(slotOf(SENTINEL.track)).toBe(slotIndex('rt3'));
      expect(slotOf(SENTINEL.supports)).toBe(slotIndex('rs3'));
      expect(slotOf(SENTINEL.car)).toBe(slotIndex('rc3'));
      expect(slotOf(shade(SENTINEL.car, 0.55))).toBe(slotIndex('rc6'));
      expect(slotOf(shade(SENTINEL.car, 1 / 1.18))).toBe(slotIndex('rc4'));
      expect(slotOf(shade(SENTINEL.track, 1.18))).toBe(slotIndex('rt2'));
      expect(slotOf(shade(SENTINEL.track, 1.18 ** 2))).toBe(slotIndex('rt1'));
      // Dark faces past tone 6 (cars 0.5, ties 0.45) clamp to tone 6 and keep swapping.
      expect(slotOf(shade(SENTINEL.track, 0.45))).toBe(slotIndex('rt6'));
      // shade(track, 2) saturates to #ffffff: an ordinary colour (controller repair 1).
      expect(rampOf(slotOf(shade(SENTINEL.track, 2)))).not.toBe('rt');
      expect(slotOf('#3d9be0')).toBe(slotOf('#3d9be0'));
    });
    // Outside withRoles a sentinel is an ordinary colour: never a reserved slot.
    expect(slotOf(SENTINEL.track)).toBeLessThan(slotIndex('rt1'));
  });
  it('a saturating shade (#ffffff, or f = 0) is not recorded as a role colour', () => {
    const white = slotOf('#ffffff');
    const black = slotOf('#000000');
    withRoles(() => {
      expect(shade(SENTINEL.track, 3)).toBe('#ffffff');
      expect(shade(SENTINEL.car, 0)).toBe('#000000');
      expect(slotOf('#ffffff')).toBe(white);
      expect(slotOf('#000000')).toBe(black);
      expect(rampOf(slotOf('#ffffff'))).not.toBe('rt');
    });
  });
  it('withRoles needs the tool hook (the derived memo runs through it)', () => {
    clearSurfaceArt();
    expect(() => withRoles(() => 0)).toThrow();
  });
  it('paint with a sentinel lands in the role ramp', () => {
    const paint = (colour: string) =>
      withRoles(() => paintPicture(CAR_BOUNDS, (c) => paintCar(c, 'coaster', 0, 0, colour, true, 0, 1)));
    const a = paint(SENTINEL.car);
    const b = paint('#3d9be0');
    expect([a.w, a.h, a.ox, a.oy]).toEqual([b.w, b.h, b.ox, b.oy]);
    const rc = new Set(roleSlots('rc'));
    let body = 0;
    for (let k = 0; k < a.slots.length; k++) {
      const s = a.slots[k] as number;
      // A pixel whose slot follows the body colour came from the body.
      if (s === b.slots[k] || s === 0 || s === INK_SLOT) continue;
      body++;
      expect(rc.has(s), `pixel ${k}: slot ${SLOT_NAMES[s]}`).toBe(true);
      expect(rampOf(s)).not.toBe('n');
    }
    expect(body).toBeGreaterThan(20); // 48 of 134 opaque pixels for this pose
    expect([...a.slots].some((s) => rc.has(s))).toBe(true);
  });
});

describe('tables', () => {
  it('swapTable maps rt tones to the colour ramp and leaves others', () => {
    const t = swapTable('track', 0); // cherry
    expect(t[slotIndex('rt3')]).toBe(slotOf(TRACK_PALETTE[0]!));
    expect(t[slotIndex('rt1')]).toBe(slotOf(shade(TRACK_PALETTE[0]!, 1.18 ** 2)));
    expect(t[slotIndex('rt6')]).toBe(slotOf(shade(TRACK_PALETTE[0]!, 1.18 ** -3)));
    expect(t[slotIndex('g2')]).toBe(slotIndex('g2'));
    expect(t[slotIndex('rs3')]).toBe(slotIndex('rs3'));
    expect(t[0]).toBe(0);
    expect(t.length).toBe(SLOT_NAMES.length);
    const changed = [...t].map((v, i) => (v !== i ? i : -1)).filter((i) => i >= 0);
    for (const i of changed) expect(rampOf(i)).toBe('rt');
    const car = swapTable('car', 9);
    expect(car[slotIndex('rc3')]).toBe(slotOf(TRACK_PALETTE[9]!));
    expect(car[slotIndex('rt3')]).toBe(slotIndex('rt3'));
    // A role slot never swaps to a reserved slot.
    const ramps = { track: 'rt', supports: 'rs', car: 'rc' } as const;
    for (const role of ['track', 'supports', 'car'] as const) {
      for (let c = 0; c < 12; c++) {
        const tab = swapTable(role, c);
        for (const s of roleSlots(ramps[role])) expect(tab[s]).toBeLessThan(slotIndex('rt1'));
      }
    }
  });
  it('ghostTable thresholds', () => {
    const valid = ghostTable(true);
    const invalid = ghostTable(false);
    expect(valid[0]).toBe(0);
    expect(invalid[0]).toBe(0);
    expect(valid[slotIndex('n1')]).toBe(slotIndex('q1')); // #f4f1ea, L 0.94
    expect(valid[slotIndex('n4')]).toBe(slotIndex('q2')); // #958d8a, L 0.56
    expect(valid[slotIndex('n6')]).toBe(slotIndex('q3')); // #4d4856, L 0.31
    expect(valid[INK_SLOT]).toBe(slotIndex('q4'));
    expect(valid[slotIndex('i1')]).toBe(slotIndex('q3')); // #6e4470, L 0.35
    expect(invalid[slotIndex('n1')]).toBe(slotIndex('u1'));
    expect(invalid[INK_SLOT]).toBe(slotIndex('u4'));
    const q = new Set([1, 2, 3, 4].map((t) => slotIndex(`q${t}`)));
    for (let s = 1; s < valid.length; s++) expect(q.has(valid[s] as number)).toBe(true);
  });
});

describe('shadow pictures', () => {
  it('shadow pictures are half dithered and the two phases are complementary', () => {
    const m: CasterMask = { w: 10, h: 4, cx: 3, cy: 1, bits: new Uint8Array(40).fill(1) };
    const p0 = shadowPicture(m, 0);
    const p1 = shadowPicture(m, 1);
    for (const p of [p0, p1]) expect([p.w, p.h, p.ox, p.oy]).toEqual([10, 4, 3, 1]);
    const set0 = [...p0.slots].map((s, k) => (s !== 0 ? k : -1)).filter((k) => k >= 0);
    const set1 = [...p1.slots].map((s, k) => (s !== 0 ? k : -1)).filter((k) => k >= 0);
    expect(set0).toHaveLength(20);
    expect(set1).toHaveLength(20);
    expect(set0.filter((k) => set1.includes(k))).toEqual([]);
    for (const p of [p0, p1]) for (const s of p.slots) expect(s === 0 || s === SHADOW_SLOT).toBe(true);
    expect(SHADOW_SLOT).toBe(slotIndex('i1'));
    // Pixels outside the mask stay empty.
    const half: CasterMask = { ...m, bits: new Uint8Array(40).map((_, k) => (k % 10 < 5 ? 1 : 0)) };
    const h0 = shadowPicture(half, 0);
    for (let k = 0; k < 40; k++) if (k % 10 >= 5) expect(h0.slots[k]).toBe(0);
  });
});
