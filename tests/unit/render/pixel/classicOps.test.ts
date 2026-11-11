/** Phase 8 stage 0 prototype (never merged): Classic op lists of the scene's objects, for kill rule 6. */
// This file imports nothing under src/render/pixel/: the same file runs on the base commit.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Recorder } from '../content/recorder';
import { drawRideArt } from '../../../../src/render/sprites/rides';
import { drawStallArt } from '../../../../src/render/sprites/stalls';
import { drawSceneryArt } from '../../../../src/render/scenery/art/index';
import { drawPathItemArt, ITEM_BENCH, ITEM_LAMP } from '../../../../src/render/sprites/litter';
import { drawGuestArt } from '../../../../src/render/sprites/props';
import { rgbCss, SHIRT_COLOURS, tintStepRgb } from '../../../../src/render/palette';
import { HAIR_COLOURS, SKIN_TONES } from '../../../../src/render/sprites/shapes';
import type { Dir } from '../../../../src/sim/map';

const OUT = process.env.TC_PROTO_OUT;
const DIRS: readonly Dir[] = [0, 1, 2, 3];
const ANGLES: readonly number[] = [0, 0.3];
const SCENERY: readonly string[] = ['oak_round', 'pine_tall', 'birch_silver', 'shrub_round', 'bed_mixed', 'fountain_garden'];

/** FNV-1a 32 bit over the UTF-16 code units, as 8 lower-case hex digits. */
const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
};
/** One recorder per call, in order. */
const lists = (calls: Array<(r: Recorder) => void>): string[][] =>
  calls.map((c) => {
    const r = new Recorder();
    c(r);
    return r.ops;
  });
const write = (name: string, ls: string[][]): void => {
  for (const l of ls) expect(l.length, name).toBeGreaterThan(0);
  const ops = ls.reduce((n, l) => n + l.length, 0);
  writeFileSync(
    join(OUT as string, `classic-ops-${name}.json`),
    JSON.stringify({ name, ops, hash: fnv(ls.map((l) => l.join('\n')).join('\n--\n')) }) + '\n',
  );
};

describe.skipIf(!OUT)('Classic op lists (kill rule 6)', () => {
  it('writes the 12 files', () => {
    mkdirSync(OUT as string, { recursive: true });
    // Rides: for angle of [0, 0.3], for rotation of [0, 1, 2, 3], occupancy 2.
    for (const id of ['carousel', 'big_wheel']) {
      const calls: Array<(r: Recorder) => void> = [];
      for (const angle of ANGLES)
        for (const rotation of DIRS)
          calls.push((r) => drawRideArt(r.ctx(), id, 3, 3, { rotation, angle, swing: 0, occupancy: 2 }));
      write(id, lists(calls));
    }
    // Stall: rotation 0 to 3.
    write('snack_shack', lists(DIRS.map((rot) => (r: Recorder) => drawStallArt(r.ctx(), 'snack_shack', rot))));
    // Scenery: facing 0 to 3, not wilted, whole, centre item, footprint 1 x 1.
    for (const id of SCENERY)
      write(
        id,
        lists(
          DIRS.map(
            (facing) => (r: Recorder) => drawSceneryArt(r.ctx(), id, { facing, ex: 1, ey: 1, wilted: false, part: 0, edge: -1 }),
          ),
        ),
      );
    // Path items: side 0 to 3, fill 0, not broken.
    write('bench', lists(DIRS.map((side) => (r: Recorder) => drawPathItemArt(r.ctx(), ITEM_BENCH, side, 0, false))));
    write('lamp', lists(DIRS.map((side) => (r: Recorder) => drawPathItemArt(r.ctx(), ITEM_LAMP, side, 0, false))));
    // Guest: facing 0 to 3 x walk 0 to 3 without a ring, then one case with a ring at step 8 (notched).
    const look = { shirt: SHIRT_COLOURS[0] as string, skin: SKIN_TONES[0] as string, hair: HAIR_COLOURS[0] as string };
    const guestCalls: Array<(r: Recorder) => void> = [];
    for (const facing of DIRS)
      for (let walk = 0; walk < 4; walk++)
        guestCalls.push((r) => drawGuestArt(r.ctx(), { ...look, facing, walk, ring: null, ringStep: -1 }));
    guestCalls.push((r) =>
      drawGuestArt(r.ctx(), { ...look, facing: 0, walk: 0, ring: rgbCss(tintStepRgb(8)), ringStep: 8 }),
    );
    write('guest', lists(guestCalls));
  });
});
