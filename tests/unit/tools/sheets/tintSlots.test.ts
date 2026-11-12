/** Phase 8b stage 0b test (never merged): shirt and temperament tint colours as palette slots (fix round 1, I4). */
import { afterEach, describe, expect, it } from 'vitest';
import { rgbCss, SHIRT_COLOURS, tintStepRgb, TINT_STEPS } from '../../../../src/render/palette';
import { SLOT_NAMES, slotOf } from '../../../../src/render/pixel/palette';
import { clearSurfaceArt, installSurfaceArt } from '../../../../src/render/pixel/surfaceArt';

describe('shirt and tint slots', () => {
  afterEach(clearSurfaceArt);

  it('names every shirt / tint pair that snaps to one palette slot', () => {
    installSurfaceArt();
    const tints = Array.from({ length: TINT_STEPS }, (_, k) => slotOf(rgbCss(tintStepRgb(k))));
    const shirts = SHIRT_COLOURS.map((c) => slotOf(c));
    const pairs: string[] = [];
    shirts.forEach((s, i) => tints.forEach((t, k) => {
      if (s === t) pairs.push(`shirt ${i} (${SHIRT_COLOURS[i]}) = tint ${k} (${rgbCss(tintStepRgb(k))}) → ${SLOT_NAMES[s]}`);
    }));
    console.log(`[tints] tint slots ${tints.map((t) => SLOT_NAMES[t]).join(' ')}; shirt slots ${shirts.map((t) => SLOT_NAMES[t]).join(' ')}`);
    console.log(`[tints] shared shirt/tint slots: ${pairs.length ? pairs.join('; ') : 'none'}`);
    expect(TINT_STEPS).toBe(9);
    expect(new Set(tints).size).toBe(TINT_STEPS);
  });
});
