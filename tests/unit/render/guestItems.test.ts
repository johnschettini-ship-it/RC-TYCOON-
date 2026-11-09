/**
 * Guest items art (Build 1 polish, Phase 3 §4.9–4.10): a balloon above a guest holding one, and an open
 * umbrella over a guest holding one in rain or storms. Items live in the guest sprite frame, so the art is
 * cached like any other guest sprite and costs nothing per frame.
 */
import { describe, expect, it } from 'vitest';
import { GUEST_BALLOON, GUEST_UMBRELLA, guestFrame, guestSpriteKey } from '../../../src/render/sprites/bank';
import { drawGuestArt, GUEST_BOUNDS, GUEST_ITEM_BOUNDS, ITEM_COLOURS, type GuestLook } from '../../../src/render/sprites/props';
import { FRAME_SPAN, spriteKey } from '../../../src/render/spriteCache';
import type { Dir } from '../../../src/sim/map';
import { Recorder } from './content/recorder';

const FACINGS: Dir[] = [0, 1, 2, 3];
/** Stroke widths reach a little past the recorded points. */
const TOLERANCE = 1;

function draw(look: Partial<GuestLook>): Recorder {
  const rec = new Recorder();
  drawGuestArt(rec.ctx(), { shirt: '#ff0000', skin: '#f0c8a0', hair: '#402010', facing: 2, walk: 0, ring: null, ...look });
  return rec;
}

describe('guest item frames', () => {
  it('add a balloon bit and an umbrella bit to the guest frame, inside the frame span', () => {
    const base = guestFrame(11, 2, 3, true);
    expect(guestFrame(11, 2, 3, true, GUEST_BALLOON)).toBe(base | GUEST_BALLOON);
    expect(guestFrame(11, 2, 3, true, GUEST_UMBRELLA)).toBe(base | GUEST_UMBRELLA);
    const both = guestFrame(15, 3, 3, true, GUEST_BALLOON | GUEST_UMBRELLA);
    expect(both).toBeLessThan(FRAME_SPAN);
    // Unknown item bits are ignored, so no other part of the frame changes.
    expect(guestFrame(11, 2, 3, true, 1 << 11)).toBe(base);
    const keys = new Set([0, GUEST_BALLOON, GUEST_UMBRELLA, GUEST_BALLOON | GUEST_UMBRELLA].map((i) => guestSpriteKey(1, guestFrame(4, 1, 2, false, i), 1)));
    expect(keys.size).toBe(4);
    expect(guestSpriteKey(1, guestFrame(4, 1, 2, false, GUEST_BALLOON), 1)).toBe(spriteKey('guest', 1, guestFrame(4, 1, 2, false, GUEST_BALLOON), 1));
  });
});

describe('guest item art', () => {
  it('a plain guest stays inside GUEST_BOUNDS', () => {
    for (const facing of FACINGS) {
      for (const walk of [0, 1, 2]) {
        const e = draw({ facing, walk }).extent;
        expect(e.top).toBeGreaterThanOrEqual(GUEST_BOUNDS.top);
        expect(e.left).toBeGreaterThanOrEqual(GUEST_BOUNDS.left);
        expect(e.right).toBeLessThanOrEqual(GUEST_BOUNDS.right);
      }
    }
  });

  it('a balloon floats above the head and an umbrella spreads over it, inside GUEST_ITEM_BOUNDS', () => {
    for (const facing of FACINGS) {
      for (const walk of [0, 1, 2]) {
        const plain = draw({ facing, walk });
        const balloon = draw({ facing, walk, balloon: ITEM_COLOURS[0] });
        const umbrella = draw({ facing, walk, umbrella: ITEM_COLOURS[2] });
        expect(balloon.extent.top).toBeLessThan(plain.extent.top - 10);
        expect(umbrella.extent.top).toBeLessThan(plain.extent.top);
        expect(umbrella.extent.right - umbrella.extent.left).toBeGreaterThan(plain.extent.right - plain.extent.left + 8);
        for (const rec of [balloon, umbrella, draw({ facing, walk, balloon: '#123456', umbrella: '#654321' })]) {
          const e = rec.extent;
          expect(rec.nonFinite).toBe(0);
          expect(rec.transforms).toBe(0);
          expect(e.top).toBeGreaterThanOrEqual(GUEST_ITEM_BOUNDS.top + TOLERANCE);
          expect(e.left).toBeGreaterThanOrEqual(GUEST_ITEM_BOUNDS.left + TOLERANCE);
          expect(e.right).toBeLessThanOrEqual(GUEST_ITEM_BOUNDS.right - TOLERANCE);
          expect(e.bottom).toBeLessThanOrEqual(GUEST_ITEM_BOUNDS.bottom);
        }
        expect(balloon.ops.join(';')).toContain(`fillStyle=${ITEM_COLOURS[0]}`);
        expect(umbrella.ops.join(';')).toContain(`fillStyle=${ITEM_COLOURS[2]}`);
      }
    }
  });

  it('is deterministic: the same look draws the same calls', () => {
    const look = { facing: 1 as Dir, walk: 2, balloon: ITEM_COLOURS[3], umbrella: ITEM_COLOURS[4] };
    expect(draw(look).ops).toEqual(draw(look).ops);
  });
});
