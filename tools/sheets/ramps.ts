/** Phase 8b stage 0b test (never merged): colour roles (track, supports, car), swap and ghost tables, shadow pictures. */
import { surfaceArt } from '../../src/render/artHook';
import { INK_SLOT, RAMPS, SLOT_NAMES, slotIndex, slotOf, slotRules } from '../../src/render/pixel/palette';
import type { CasterMask } from '../../src/render/pixel/shadows';
import { shade } from '../../src/render/palette';
import { TRACK_PALETTE } from '../../src/render/track/colours';
import type { Picture } from './picture';

export type Role = 'track' | 'supports' | 'car';

/** Colours the tool paints for each role; no literal under `src/render/` equals them (the ramps test greps). */
export const SENTINEL = { track: '#7f7f81', supports: '#7f817f', car: '#817f7f' } as const;

const ROLE_RAMP: Readonly<Record<Role, 'rt' | 'rs' | 'rc'>> = { track: 'rt', supports: 'rs', car: 'rc' };
/** Tone of a sentinel itself; one tone per factor 1.18 of `shade`. */
const BASE_TONE = 3;
const TONE_STEP = 1.18;
const TONES = 6;

const clampTone = (t: number): number => Math.max(1, Math.min(TONES, t));

/**
 * Runs `fn` with a colour rule in front of `slotOf`: a sentinel resolves to tone 3 of its role ramp; `shade(c, f)` of a
 * role colour `c` (seen through the derived memo, `noteDerived` of the tool hook) to tone
 * `clamp(tone(c) − round(ln f / ln 1.18), 1, 6)` (f > 0, not #ffffff or #000000, first record wins); every other colour as `slotOf`. Needs `installSurfaceArt()`.
 */
export function withRoles<T>(fn: () => T): T {
  const on = surfaceArt.on;
  if (!on) throw new Error('withRoles: install the tool hook first (installSurfaceArt)');
  const roles = new Map<string, { ramp: string; tone: number }>();
  for (const r of Object.keys(SENTINEL) as Role[]) roles.set(SENTINEL[r], { ramp: ROLE_RAMP[r], tone: BASE_TONE });
  const key = (css: string): string => css.trim().toLowerCase();
  const prevFront = slotRules.front;
  surfaceArt.on = {
    ...on,
    noteDerived(out, hex, f) {
      on.noteDerived(out, hex, f);
      // Record a role colour only for f > 0, never over a colour already known, and never for a saturated shade
      // (#ffffff or #000000 stays an ordinary colour). Darker faces (f 0.45 to 0.55 of cars and ties) clamp to tone 6.
      const base = roles.get(key(hex));
      const o = key(out);
      if (!base || !(f > 0) || roles.has(o) || o === '#ffffff' || o === '#000000') return;
      roles.set(o, { ramp: base.ramp, tone: clampTone(base.tone - Math.round(Math.log(f) / Math.log(TONE_STEP))) });
    },
  };
  slotRules.front = (css) => {
    const r = roles.get(key(css));
    return r ? slotIndex(`${r.ramp}${r.tone}`) : -1;
  };
  try {
    return fn();
  } finally {
    surfaceArt.on = on;
    slotRules.front = prevFront;
  }
}

/** Identity table over all slots. */
function identity(): Uint8Array {
  return Uint8Array.from(SLOT_NAMES, (_, i) => i);
}

/** Identity except the 6 slots of the role's ramp: tone `t` → `slotOf(shade(TRACK_PALETTE[colour], 1.18 ** (3 − t)))`. */
export function swapTable(role: Role, colour: number): Uint8Array {
  const base = TRACK_PALETTE[colour];
  if (base === undefined) throw new Error(`swapTable: no track palette colour ${colour}`);
  const t = identity();
  for (let tone = 1; tone <= TONES; tone++) t[slotIndex(`${ROLE_RAMP[role]}${tone}`)] = slotOf(shade(base, TONE_STEP ** (BASE_TONE - tone)));
  return t;
}

/** HSL lightness of a slot colour. */
function lightness(slot: number): number {
  const name = SLOT_NAMES[slot] as string;
  const ramp = name.replace(/\d+$/, '') as keyof typeof RAMPS;
  const hex = RAMPS[ramp][Number(name.slice(ramp.length)) - 1] as string;
  const v = parseInt(hex.slice(1), 16);
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
}

/** Ghost table (phase-8 spec §6.3): `q` tones (valid) or `u` (invalid) by HSL `L` ≥ 0.75 / 0.5 / 0.25 / else; 0 stays 0; ink → tone 4. */
export function ghostTable(valid: boolean): Uint8Array {
  const ramp = valid ? 'q' : 'u';
  const t = new Uint8Array(SLOT_NAMES.length);
  for (let s = 1; s < t.length; s++) {
    const l = lightness(s);
    const tone = s === INK_SLOT ? 4 : l >= 0.75 ? 1 : l >= 0.5 ? 2 : l >= 0.25 ? 3 : 4;
    t[s] = slotIndex(`${ramp}${tone}`);
  }
  return t;
}

/** The slot of every shadow picture pixel. */
export const SHADOW_SLOT: number = slotIndex('i1');

/** Half of a caster mask as a checkerboard: `SHADOW_SLOT` where the mask is 1 and `(x + y + phase)` is even; anchor `(cx, cy)`. */
export function shadowPicture(m: CasterMask, phase: 0 | 1): Picture {
  const slots = new Uint8Array(m.w * m.h);
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const k = y * m.w + x;
      if (m.bits[k] === 1 && ((x + y + phase) & 1) === 0) slots[k] = SHADOW_SLOT;
    }
  }
  return { w: m.w, h: m.h, ox: m.cx, oy: m.cy, slots };
}
