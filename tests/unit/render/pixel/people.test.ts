/** Phase 8 stage 0 prototype (never merged): the guest stamps (spec §8.2, §8.3). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INK_SLOT, slotIndex } from '../../../../src/render/pixel/palette';
import {
  GUEST_BACK,
  GUEST_BACK_STEP_1,
  GUEST_BACK_STEP_2,
  GUEST_FRONT,
  GUEST_STEP_1,
  GUEST_STEP_2,
  drawGuestPixel,
} from '../../../../src/render/pixel/sprites/people';
import { stamp, type Stamp } from '../../../../src/render/pixel/stamp';
import { PixelSurface } from '../../../../src/render/pixel/surface';
import { drawGuestArt, type GuestLook } from '../../../../src/render/sprites/props';
import { Recorder } from '../content/recorder';
import { clearSurfaceArt, installSurfaceArt } from '../../../../src/render/pixel/surfaceArt';

// Phase 8b: the stage 0 branches run through the tool hook.
beforeEach(installSurfaceArt);
afterEach(clearSurfaceArt);

const B = { left: -16, right: 16, top: -32, bottom: 8 };
const MAP = { H: '#3b2a20', S: '#f3e0be', T: '#e8503a', P: '#2f3b55' };
const look = (o: Partial<GuestLook> = {}): GuestLook => ({ shirt: MAP.T, skin: MAP.S, hair: MAP.H, facing: 2, walk: 0, ring: null, ...o });

function stamped(s: Stamp): PixelSurface {
  const p = new PixelSurface(B);
  stamp(p, s, 0, 0, MAP);
  p.finish();
  return p;
}

function guest(g: GuestLook): PixelSurface {
  const p = new PixelSurface(B);
  drawGuestPixel(p, g);
  p.finish();
  return p;
}

/** Every non-`o` letter has no transparent 4-neighbour (the outline is closed). */
function closed(s: Stamp): boolean {
  const at = (x: number, y: number): string => s.rows[y]?.[x] ?? '.';
  for (let y = 0; y < s.rows.length; y++) {
    const row = s.rows[y] as string;
    for (let x = 0; x < row.length; x++) {
      const c = row[x] as string;
      if (c === '.' || c === ' ' || c === 'o') continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const n = at(x + dx, y + dy);
        if (n === '.' || n === ' ') return false;
      }
    }
  }
  return true;
}

const FRAMES = [GUEST_FRONT, GUEST_BACK, GUEST_STEP_1, GUEST_STEP_2, GUEST_BACK_STEP_1, GUEST_BACK_STEP_2];

describe('guest stamps (§8.3)', () => {
  it('the draft rows', () => {
    expect(GUEST_FRONT.rows).toEqual(['..ooo..', '.oHHHo.', 'oHHHHHo', 'oHSSSHo', '.oSSSo.', 'oTTTTTo', 'oTTTTTo', 'oSTTTSo', '.oTTTo.', '.oPPPo.', '.oPoPo.', '.oo.oo.']);
    expect(GUEST_BACK.rows).toEqual(['..ooo..', '.oHHHo.', 'oHHHHHo', 'oHHHHHo', '.oHHHo.', 'oTTTTTo', 'oTTTTTo', 'oSTTTSo', '.oTTTo.', '.oPPPo.', '.oPoPo.', '.oo.oo.']);
  });

  it('the step rows change only the last two rows, and the outline stays closed', () => {
    for (const [step, base] of [
      [GUEST_STEP_1, GUEST_FRONT],
      [GUEST_STEP_2, GUEST_FRONT],
      [GUEST_BACK_STEP_1, GUEST_BACK],
      [GUEST_BACK_STEP_2, GUEST_BACK],
    ] as const) {
      expect(step.rows.slice(0, 10)).toEqual(base.rows.slice(0, 10));
      expect(step.rows.slice(10)).not.toEqual(base.rows.slice(10));
      expect(step.rows).toHaveLength(12);
    }
    for (const f of FRAMES) expect(closed(f)).toBe(true);
    // Step 1 shortens the left leg (column 2), step 2 the right leg (column 4).
    expect(GUEST_STEP_1.rows[10]?.[2]).not.toBe('P');
    expect(GUEST_STEP_1.rows[10]?.[4]).toBe('P');
    expect(GUEST_STEP_2.rows[10]?.[2]).toBe('P');
    expect(GUEST_STEP_2.rows[10]?.[4]).not.toBe('P');
  });

  it('the 6 frames differ', () => {
    const hashes = FRAMES.map((f) => stamped(f).hash());
    expect(new Set(hashes).size).toBe(6);
  });

  it('a walking guest that faces N shows the back of the head', () => {
    expect(guest(look({ facing: 0, walk: 1 })).hash()).toBe(stamped(GUEST_BACK_STEP_1).hash());
    expect(guest(look({ facing: 3, walk: 2 })).hash()).toBe(stamped(GUEST_BACK_STEP_2).hash());
    expect(guest(look({ facing: 1, walk: 1 })).hash()).toBe(stamped(GUEST_STEP_1).hash());
    expect(guest(look({ facing: 2, walk: 0 })).hash()).toBe(stamped(GUEST_FRONT).hash());
    expect(guest(look({ facing: 0, walk: 3 })).hash()).toBe(stamped(GUEST_BACK).hash());
  });

  it('the shirt letter takes the shirt colour', () => {
    const s = guest(look({ shirt: '#e8503a' }));
    // GUEST_FRONT row 5 is 'oTTTTTo': column 3 is a T letter. Left column x − 2 × 3 = −6 world, so art column ox − 3.
    expect(s.pixel(s.ox - 3 + 3, s.oy - 11 + 5)).toBe(slotIndex('o4'));
    expect(s.pixel(s.ox - 3, s.oy - 11 + 5)).toBe(INK_SLOT);
  });

  it('drawGuestArt on a surface is the twin; on a recorder it is Classic', () => {
    const a = new PixelSurface(B);
    drawGuestArt(a as never, look({ facing: 0, walk: 2 }));
    a.finish();
    expect(a.hash()).toBe(guest(look({ facing: 0, walk: 2 })).hash());
    const r = new Recorder();
    drawGuestArt(r.ctx(), look());
    expect(r.ops.some((o) => o.startsWith('ellipse('))).toBe(true);
  });
});
