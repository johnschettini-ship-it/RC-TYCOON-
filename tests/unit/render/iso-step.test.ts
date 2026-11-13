import { describe, expect, it } from 'vitest';
import { setStepPx, tileToScreen } from '../../../src/render/iso';
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
});
