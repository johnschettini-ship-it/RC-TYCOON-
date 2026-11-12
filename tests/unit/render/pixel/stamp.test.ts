/** Phase 8 stage 0 prototype (never merged): the stamp format (spec §8.3). */
import { describe, expect, it } from 'vitest';
import { INK_SLOT } from '../../../../src/render/pixel/palette';
import { GUEST_FRONT } from '../../../../src/render/pixel/sprites/people';
import { stamp, stampSize } from '../../../../src/render/pixel/stamp';
import { PixelSurface } from '../../../../src/render/pixel/surface';
import type { ArtCtx } from '../../../../src/render/sprites/shapes';
import { Recorder } from '../content/recorder';

const GUEST_MAP = { H: '#3b2a20', S: '#f3e0be', T: '#e8503a', P: '#2f3b55' };
const rec = (r: Recorder): ArtCtx => r.ctx() as unknown as ArtCtx;

/** The fillStyle in force at each fillRect of a recorder, with the fillRect op. */
function fills(r: Recorder): Array<{ op: string; style: string }> {
  const out: Array<{ op: string; style: string }> = [];
  let style = '';
  for (const op of r.ops) {
    if (op.startsWith('fillStyle=')) style = op.slice('fillStyle='.length);
    else if (op.startsWith('fillRect(')) out.push({ op, style });
  }
  return out;
}

describe('stamps (§8.3)', () => {
  it('size and bottom-centre anchor (§8.3)', () => {
    expect(stampSize(GUEST_FRONT)).toEqual({ w: 7, h: 12 });
    const r = new Recorder();
    stamp(rec(r), GUEST_FRONT, 0, 0, GUEST_MAP);
    expect(fills(r)[0]).toEqual({ op: 'fillRect(-2.00,-22.00,6.00,2.00)', style: '#2a1a36' });
  });

  it('one fillRect per run of one letter', () => {
    const map = { H: 'g2' };
    const r = new Recorder();
    stamp(rec(r), { rows: ['oHHHHHo'] }, 0, 0, map);
    expect(r.ops.filter((o) => o.startsWith('fillRect(')).length).toBe(3);
  });

  it('mirror swaps the pairs letters, so light stays on the left', () => {
    const r = new Recorder();
    stamp(rec(r), { rows: ['ab'], pairs: ['ab'] }, 0, 0, { a: '#ff0000', b: '#00ff00' }, { mirror: true });
    const f = fills(r);
    expect(f).toHaveLength(2);
    // The left run (world x −2) is the lit colour.
    const left = f.find((e) => e.op.startsWith('fillRect(-2.00,'));
    expect(left?.style).toBe('#ff0000');
    // Without the mirror the left run is `a`, also the lit colour.
    const r2 = new Recorder();
    stamp(rec(r2), { rows: ['ab'], pairs: ['ab'] }, 0, 0, { a: '#ff0000', b: '#00ff00' });
    expect(fills(r2).find((e) => e.op.startsWith('fillRect(-2.00,'))?.style).toBe('#ff0000');
  });

  it('a stamp uses no transform', () => {
    const r = new Recorder();
    stamp(rec(r), GUEST_FRONT, 0, 0, GUEST_MAP, { mirror: true });
    expect(r.transforms).toBe(0);
  });

  it('a stamped guest has no second outline', () => {
    const s = new PixelSurface({ left: -16, right: 16, top: -32, bottom: 8 });
    stamp(s, GUEST_FRONT, 0, 0, GUEST_MAP);
    s.finish();
    const oCount = GUEST_FRONT.rows.join('').split('o').length - 1;
    expect(oCount).toBe(28);
    let ink = 0;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.pixel(x, y) === INK_SLOT) ink++;
    expect(ink).toBe(oCount);
  });
});
