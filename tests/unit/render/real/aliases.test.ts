import { describe, expect, it } from 'vitest';
import { aliasItemMap, ALIAS_SOURCES, withAliasSets } from '../../../../src/render/real/aliases';
import { setKey, type RealIndex, type RealSetEntry } from '../../../../src/render/real/indexFormat';
import { createRealLook } from '../../../../src/render/real/look';
import { SetManager, type Decoded, type SetIO } from '../../../../src/render/real/setManager';
import { FLAT_RIDES } from '../../../../src/data/catalog/flatRides';

const F = { sheet: 'carousel-0.webp', sx: 0, sy: 0, w: 4, h: 4, ox: 0, oy: 0 };

function index(): RealIndex {
  const sets: RealSetEntry[] = [];
  for (const d of [2, 4] as const) {
    for (const item of ALIAS_SOURCES) {
      sets.push({ key: setKey('ride', item, d, 'all'), kind: 'ride', item, density: d, rot: 'all', sheets: [{ file: `${item}-${d}.webp`, w: 4, h: 4 }], frames: { [`${item}:f0:occ0`]: { ...F, sheet: `${item}-${d}.webp` } } });
      sets.push({ key: setKey('shadow', item, d, 'all'), kind: 'shadow', item, density: d, rot: 'all', sheets: [{ file: `${item}-s${d}.webp`, w: 4, h: 4 }], frames: { [item]: { ...F, sheet: `${item}-s${d}.webp` } } });
    }
    sets.push({ key: setKey('stall', 'snack_shack', d, 0), kind: 'stall', item: 'snack_shack', density: d, rot: 0, sheets: [{ file: `s-${d}.webp`, w: 4, h: 4 }], frames: { snack_shack: { ...F, sheet: `s-${d}.webp` } } });
  }
  return { format: 'real/1', pxPerMetreZoom1: 11.31, stepPxPerMetre: 9.8, densities: [2, 4], sets, bytes: { compressed: 0, decodedByDensity: { '2': 0, '4': 0 } } };
}

describe('alias sets for the scale park (round 3 item 7)', () => {
  it('maps every flat ride type to its own alias of a baked ride, in turn', () => {
    const ids = FLAT_RIDES.map((d) => d.id);
    expect(ids).toHaveLength(18);
    const m = aliasItemMap(ids);
    expect(new Set(Object.values(m)).size).toBe(18);
    expect(m.carousel).toBe('carousel@carousel');
    expect(m.big_wheel).toBe('swing_tower@big_wheel');
    expect(m[ids[2]!]).toBe(`big_wheel@${ids[2]}`);
  });

  it('adds distinct set keys for each alias pointing at the same files, frames re-keyed; nothing else changes', () => {
    const base = index();
    const m = aliasItemMap(['bumper_cars', 'drop_tower']);
    const ix = withAliasSets(base, m);
    expect(ix.sets.slice(0, base.sets.length)).toEqual(base.sets);
    const extra = ix.sets.slice(base.sets.length);
    // carousel@bumper_cars and swing_tower@drop_tower: ride and shadow at densities 2 and 4.
    expect(extra.map((e) => e.key).sort()).toEqual([
      'ride:carousel@bumper_cars:d2:rall', 'ride:carousel@bumper_cars:d4:rall', 'ride:swing_tower@drop_tower:d2:rall', 'ride:swing_tower@drop_tower:d4:rall',
      'shadow:carousel@bumper_cars:d2:rall', 'shadow:carousel@bumper_cars:d4:rall', 'shadow:swing_tower@drop_tower:d2:rall', 'shadow:swing_tower@drop_tower:d4:rall',
    ]);
    const r = ix.sets.find((e) => e.key === 'ride:carousel@bumper_cars:d2:rall')!;
    expect(r.sheets).toEqual(base.sets.find((e) => e.key === 'ride:carousel:d2:rall')!.sheets);
    expect(Object.keys(r.frames)).toEqual(['carousel@bumper_cars:f0:occ0']);
    expect(Object.keys(ix.sets.find((e) => e.key === 'shadow:carousel@bumper_cars:d2:rall')!.frames)).toEqual(['carousel@bumper_cars']);
    expect(ix.bytes).toEqual(base.bytes);
  });

  it('the look draws a game ride from its alias only while the map is set; each alias decodes on its own, the file read once', async () => {
    const m = aliasItemMap(['bumper_cars', 'drop_tower', 'teacup_twirl', 'carousel']);
    const ix = withAliasSets(index(), m);
    const reads: string[] = [];
    const io: SetIO = {
      read: async (f) => { reads.push(f); return new Blob([f]); },
      decode: async () => ({ image: { width: 4, height: 4 } as unknown as CanvasImageSource, bytes: 64, close() {} } as Decoded),
    };
    const sets = new SetManager(ix, io, 1e9, () => undefined);
    const look = createRealLook(ix, sets);
    look.setItemMap!(m);
    // bumper_cars and carousel both copy the carousel: two alias sets, one file.
    const want = [setKey('ride', 'carousel@bumper_cars', 2, 'all'), setKey('ride', 'carousel@carousel', 2, 'all')];
    sets.beginFrame(1);
    sets.want(want, 'now');
    sets.endFrame();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    sets.beginFrame(2);
    sets.want(want, 'now');
    sets.endFrame();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(want.map((k) => sets.state(k))).toEqual(['ready', 'ready']);
    expect(reads.filter((f) => f === 'carousel-2.webp')).toHaveLength(1);
    expect(sets.residentBytes()).toBe(128);
    sets.beginFrame(3);
    look.prepare({ state: { rides: [], stalls: [], scenery: [], staff: { members: [] }, map: { pathItem: new Uint8Array(0), heights: [], width: 1, height: 1 }, track: { rides: {} } } } as never, 0, { x0: 0, y0: 0, x1: 1, y1: 1 }, 1, 1);
    expect(look.ride('bumper_cars', 0, 0, 0)).toBeTruthy();
    expect(look.ride('carousel', 0, 0, 0)).toBeTruthy();
    // The map off: bumper_cars is today's art again (not baked), the carousel its own baked set.
    look.setItemMap!(null);
    expect(look.ride('bumper_cars', 0, 0, 0)).toBeUndefined();
    expect(look.ride('carousel', 0, 0, 0)).toBeNull();
  });
});
