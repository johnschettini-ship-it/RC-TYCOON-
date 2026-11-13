/**
 * Classic-ops guard (kill rule S6): today's look never changes while the realistic look is built. Hashes the
 * recorded draw ops of a fixed set of rides, a stall, scenery and guests against a golden file.
 * Regenerate deliberately with TC_WRITE_CLASSIC_OPS=1 (only when the classic look is meant to change).
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getFlatRideDef } from '../../../../src/data/catalog';
import { SHIRT_COLOURS } from '../../../../src/render/palette';
import { drawSceneryArt } from '../../../../src/render/scenery/art';
import { drawGuestArt } from '../../../../src/render/sprites/props';
import { drawRideArt } from '../../../../src/render/sprites/rides';
import { drawStallArt } from '../../../../src/render/sprites/stalls';
import type { Dir } from '../../../../src/sim/map';
import { Recorder } from '../content/recorder';

const GOLDEN = join(dirname(fileURLToPath(import.meta.url)), 'classic-ops.json');
const DIRS: Dir[] = [0, 1, 2, 3];
const RIDES = ['carousel', 'big_wheel', 'swing_tower', 'teacup_twirl'];
const SCENERY = ['oak_round', 'pine_tall', 'birch_silver', 'willow', 'shrub_round', 'boulder', 'lamp_globe', 'bunting_pole'];

function hash(rec: Recorder): string {
  return createHash('sha256').update(JSON.stringify(rec.ops)).digest('hex');
}

function compute(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of RIDES) {
    const def = getFlatRideDef(id);
    if (!def) throw new Error(id);
    for (const rotation of DIRS) {
      const rec = new Recorder();
      drawRideArt(rec.ctx(), id, def.w, def.d, { rotation, angle: 0, swing: 0, occupancy: 0 });
      out[`ride:${id}:r${rotation}`] = hash(rec);
    }
  }
  for (const rotation of DIRS) {
    const rec = new Recorder();
    drawStallArt(rec.ctx(), 'snack_shack', rotation);
    out[`stall:snack_shack:r${rotation}`] = hash(rec);
  }
  for (const id of SCENERY) {
    for (const facing of DIRS) {
      const rec = new Recorder();
      drawSceneryArt(rec.ctx(), id, { facing, ex: 1, ey: 1, wilted: false, part: 0, edge: -1 });
      out[`scenery:${id}:f${facing}`] = hash(rec);
    }
  }
  SHIRT_COLOURS.forEach((shirt, colour) => {
    for (let walk = 0; walk < 4; walk++) {
      for (const facing of DIRS) {
        const rec = new Recorder();
        drawGuestArt(rec.ctx(), { shirt, skin: '#f0c8a0', hair: '#402010', facing, walk, ring: null });
        out[`guest:c${colour}:w${walk}:f${facing}`] = hash(rec);
      }
    }
  });
  return out;
}

describe('classic ops guard (S6)', () => {
  const actual = compute();
  if (process.env.TC_WRITE_CLASSIC_OPS === '1') {
    writeFileSync(GOLDEN, `${JSON.stringify(actual, null, 2)}\n`);
  }

  it('covers 12 shirt colours x 4 walks x 4 facings of guests', () => {
    expect(SHIRT_COLOURS).toHaveLength(12);
    expect(Object.keys(actual).filter((k) => k.startsWith('guest:'))).toHaveLength(192);
  });

  it("draws exactly today's ops for every guarded sprite", () => {
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<string, string>;
    expect(actual).toEqual(golden);
  });
});
