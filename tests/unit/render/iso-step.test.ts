import { describe, expect, it } from 'vitest';
import { setStepPx, tileToScreen } from '../../../src/render/iso';
import { viewAffine, viewPointSY, viewTileSY } from '../../../src/render/view';
import { isoY } from '../../../src/render/track/project';

describe('per-look height step', () => {
  it('classic step is 8', () => expect(tileToScreen(0, 0, 1).sy).toBe(-8));
  it('setStepPx changes every projection', () => {
    setStepPx(9.8);
    try {
      expect(tileToScreen(0, 0, 1).sy).toBeCloseTo(-9.8);
      expect(isoY(0, 0, 1)).toBeCloseTo(-9.8);
    } finally {
      setStepPx(8);
    }
  });
  it('view.ts projections follow setStepPx', () => {
    const a = viewAffine(0, 8, 8);
    expect(viewTileSY(a, 0, 0, 2)).toBe(-16);
    expect(viewPointSY(a, 0, 0, 2)).toBe(-16);
    setStepPx(9.8);
    try {
      expect(viewTileSY(a, 0, 0, 2)).toBeCloseTo(-19.6);
      expect(viewPointSY(a, 0, 0, 2)).toBeCloseTo(-19.6);
    } finally {
      setStepPx(8);
    }
  });
});
