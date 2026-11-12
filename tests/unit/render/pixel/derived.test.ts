/** Phase 8 stage 0 prototype (never merged): tests of the derived-colour memo. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { noteDerived, noteMixed, startDerivedMemo, stopDerivedMemo } from '../../../../src/render/pixel/derived';
import { shade } from '../../../../src/render/palette';
import { mixHex } from '../../../../src/render/scenery/art/kit';
import { clearSurfaceArt, installSurfaceArt } from '../../../../src/render/pixel/surfaceArt';

// Phase 8b: the stage 0 branches run through the tool hook.
beforeEach(installSurfaceArt);
afterEach(clearSurfaceArt);

describe('derived-colour memo (§6.5)', () => {
  it('records only between start and stop; shade output does not change', () => {
    const out = shade('#3d9be0', 0.7);
    noteDerived('#000001', '#000002', 2);
    startDerivedMemo();
    expect(shade('#3d9be0', 0.7)).toBe(out);
    noteMixed('#aaaaaa', '#ffffff', '#555555', 0.5);
    expect(stopDerivedMemo()).toEqual([
      { out, base: '#3d9be0', f: 0.7 },
      { out: '#aaaaaa', a: '#ffffff', b: '#555555', t: 0.5 },
    ]);
    expect(stopDerivedMemo()).toEqual([]);
  });
  it('mixHex records its output while the memo runs', () => {
    startDerivedMemo();
    const out = mixHex('#ffffff', '#000000', 0.5);
    expect(stopDerivedMemo()).toEqual([{ out, a: '#ffffff', b: '#000000', t: 0.5 }]);
  });
});
