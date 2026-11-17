/**
 * Flat ride colour, today's look (flat ride colours Task 3). A chosen palette colour paints each ride's main part
 * (the part named in the plan's Task 4 table, shared with the realistic look); Original (`colour` absent or null)
 * draws exactly today's ops. The goldens are hashes of recorded draw ops:
 * - `original:*` were written from the code BEFORE colour support, so they prove Original never changed;
 * - `coloured:carousel:*` pin one coloured ride.
 * Regenerate deliberately with TC_WRITE_RIDE_COLOUR_OPS=original or =coloured.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FLAT_RIDES } from '../../../src/data/catalog/flatRides';
import { SpriteBank } from '../../../src/render/sprites/bank';
import { drawRideArt, type RideArtState } from '../../../src/render/sprites/rides';
import { paletteColour } from '../../../src/render/track/colours';
import type { Dir } from '../../../src/sim/map';
import { Recorder } from './content/recorder';
import { install } from './fakeCanvas';
import { RIDES_B_IDS } from '../../helpers/ridesB';

const GOLDEN = join(dirname(fileURLToPath(import.meta.url)), 'ride-colour-ops.json');
const DIRS: Dir[] = [0, 1, 2, 3];
const STATES: ReadonlyArray<Omit<RideArtState, 'rotation'>> = [
  { angle: 0, swing: 0, occupancy: 0 },
  { angle: 0.3, swing: 0.75, occupancy: 4 },
];
/** Grape (palette 7): not used anywhere in today's ride art, so its presence proves the colour was drawn. */
const GRAPE = paletteColour(7);
const SKY = paletteColour(4);

const RIDE_IDS = FLAT_RIDES.map((d) => d.id);

function record(id: string, st: RideArtState): Recorder {
  const def = FLAT_RIDES.find((d) => d.id === id);
  if (!def) throw new Error(id);
  const rec = new Recorder();
  drawRideArt(rec.ctx(), id, def.w, def.d, st);
  return rec;
}

function hash(rec: Recorder): string {
  return createHash('sha256').update(JSON.stringify(rec.ops)).digest('hex');
}

function compute(colour?: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of RIDE_IDS) {
    for (const rotation of DIRS) {
      STATES.forEach((s, k) => {
        const st: RideArtState = colour === undefined ? { rotation, ...s } : { rotation, ...s, colour };
        out[`${id}:r${rotation}:s${k}`] = hash(record(id, st));
      });
    }
  }
  return out;
}

function colouredCarousel(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rotation of DIRS) {
    out[`coloured:carousel:r${rotation}`] = hash(record('carousel', { rotation, angle: 0.25, swing: 0, occupancy: 2, colour: GRAPE }));
  }
  return out;
}

function usesColour(rec: Recorder, colour: string): boolean {
  return rec.ops.some((op) => op === `fillStyle=${colour}` || op === `strokeStyle=${colour}`);
}

describe('flat ride colour in today’s look', () => {
  // `original` rewrites the Original hashes (only from code whose Original look is meant to change), `coloured` the
  // coloured carousel; the other half is kept.
  const write = process.env.TC_WRITE_RIDE_COLOUR_OPS;
  if (write === 'original' || write === 'coloured') {
    const old = existsSync(GOLDEN) ? (JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<string, string>) : {};
    const golden: Record<string, string> = {};
    for (const [k, v] of Object.entries(old)) if (!k.startsWith(write === 'original' ? 'original:' : 'coloured:')) golden[k] = v;
    if (write === 'original') for (const [k, v] of Object.entries(compute())) golden[`original:${k}`] = v;
    else Object.assign(golden, colouredCarousel());
    writeFileSync(GOLDEN, `${JSON.stringify(golden, null, 2)}\n`);
  }
  const golden = existsSync(GOLDEN) ? (JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<string, string>) : {};

  it('covers all 22 flat rides (batch 1 and new rides batch A) and the new rides of batch B', () => {
    expect(RIDE_IDS).toHaveLength(22 + RIDES_B_IDS.length);
  });

  it('Original (colour absent) draws exactly today’s ops for every ride, rotation and state', () => {
    const want: Record<string, string> = {};
    for (const [k, v] of Object.entries(golden)) if (k.startsWith('original:')) want[k.slice('original:'.length)] = v;
    expect(Object.keys(want)).toHaveLength((22 + RIDES_B_IDS.length) * 4 * STATES.length);
    expect(compute()).toEqual(want);
  });

  it('Original (colour null) draws the same ops as colour absent', () => {
    expect(compute(null)).toEqual(compute());
  });

  for (const id of RIDE_IDS) {
    it(`${id}: a colour paints the main part and changes the picture in every rotation`, () => {
      for (const rotation of DIRS) {
        const st = { rotation, angle: 0, swing: 0, occupancy: 0 };
        const original = record(id, st);
        expect(usesColour(original, GRAPE), `${id} r${rotation}: grape already in Original`).toBe(false);
        const coloured = record(id, { ...st, colour: GRAPE });
        expect(usesColour(coloured, GRAPE), `${id} r${rotation}: grape not drawn`).toBe(true);
        expect(hash(coloured)).not.toBe(hash(original));
        expect(coloured.nonFinite).toBe(0);
        expect(coloured.transforms).toBe(0);
        // Two colours give two pictures.
        expect(hash(record(id, { ...st, colour: SKY }))).not.toBe(hash(coloured));
      }
    });
  }

  it('a colour adds no geometry: every ride draws the same op names in the same order as Original', () => {
    const name = (op: string): string => op.replace(/[=(].*$/, '');
    for (const id of RIDE_IDS) {
      for (const rotation of DIRS) {
        for (const s of STATES) {
          const original = record(id, { rotation, ...s }).ops;
          const coloured = record(id, { rotation, ...s, colour: GRAPE }).ops;
          expect(coloured.length, `${id} r${rotation}`).toBe(original.length);
          expect(coloured.map(name), `${id} r${rotation}`).toEqual(original.map(name));
        }
      }
    }
  });

  it('a coloured carousel draws its golden ops', () => {
    const want: Record<string, string> = {};
    for (const [k, v] of Object.entries(golden)) if (k.startsWith('coloured:')) want[k] = v;
    expect(Object.keys(want)).toHaveLength(4);
    expect(colouredCarousel()).toEqual(want);
  });
});

describe('sprite bank ride colour', () => {
  install();

  it('keeps one sprite per colour: same colour, same sprite; another colour, another sprite', () => {
    const bank = new SpriteBank();
    const a = bank.ride('carousel', 3, 3, 0, 0, 1, GRAPE);
    expect(bank.ride('carousel', 3, 3, 0, 0, 1, GRAPE)).toBe(a);
    const b = bank.ride('carousel', 3, 3, 0, 0, 1, SKY);
    expect(b).not.toBe(a);
    const o = bank.ride('carousel', 3, 3, 0, 0, 1);
    expect(o).not.toBe(a);
    expect(o).not.toBe(b);
  });

  it('Original is the same sprite whether the colour is absent or null', () => {
    const bank = new SpriteBank();
    const o = bank.ride('big_wheel', 3, 3, 1, 0, 1);
    expect(bank.ride('big_wheel', 3, 3, 1, 0, 1, null)).toBe(o);
  });
});
