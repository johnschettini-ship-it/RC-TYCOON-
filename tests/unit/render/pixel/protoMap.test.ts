/** Phase 8 stage 0 prototype (never merged): the scene's objects resolve every colour through the colour map (spec §6.4, §6.5, §11.3). */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { install } from '../fakeCanvas';
import { getFlatRideDef } from '../../../../src/data/catalog/flatRides';
import type { Dir } from '../../../../src/sim/map';
import { COLOUR_MAP } from '../../../../src/render/pixel/colourMap';
import { startDerivedMemo, stopDerivedMemo, type DerivedRecord } from '../../../../src/render/pixel/derived';
import { paletteStats } from '../../../../src/render/pixel/palette';
import { setArtStyle } from '../../../../src/render/pixel/style';
import { LITTER_VARIANTS } from '../../../../src/render/management/litter';
import { scenerySpriteKey, ScenerySprites } from '../../../../src/render/scenery/sprites';
import { DECAL_MESS, decalSpriteKey, guestSpriteKey, pathItemSpriteKey, SpriteBank } from '../../../../src/render/sprites/bank';
import { ITEM_BENCH, ITEM_LAMP, pathItemFrame } from '../../../../src/render/sprites/litter';

beforeAll(() => install());
afterEach(() => setArtStyle('classic'));

/** The 6 scenery items of §11.2 item 5. */
const SCENERY_IDS = ['oak_round', 'pine_tall', 'birch_silver', 'shrub_round', 'bed_mixed', 'fountain_garden'] as const;
const DIRS: readonly Dir[] = [0, 1, 2, 3];

/** One line per missed colour: the records that made it, or `literal` when none did. */
function describeMiss(m: string, recs: readonly DerivedRecord[]): string {
  const lines = recs
    .filter((r) => r.out === m)
    .map((r) => ('base' in r ? `${m} <- shade(${r.base}, ${r.f})` : `${m} <- mix(${r.a}, ${r.b}, ${r.t})`));
  return lines.length > 0 ? [...new Set(lines)].join('\n') : `${m} <- literal`;
}

/** Builds every sprite of the scene's objects (§11.2) at bucket 0.5. */
function buildScene(): void {
  const bank = new SpriteBank();
  const scen = new ScenerySprites();
  for (const id of ['carousel', 'big_wheel']) {
    const def = getFlatRideDef(id);
    if (!def) throw new Error(`no ride ${id}`);
    for (const rot of DIRS) for (const frame of [0, 16]) bank.ride(id, def.w, def.d, rot, frame, 0.5);
  }
  for (const rot of DIRS) bank.stall('snack_shack', rot, 0, 0.5);
  for (const id of SCENERY_IDS) {
    for (const f of DIRS) {
      if (!scen.get(scenerySpriteKey(id, f, 0, 0.5), id, f, 0, 0.5)) throw new Error(`no scenery ${id}`);
    }
  }
  for (const code of [ITEM_BENCH, ITEM_LAMP]) {
    for (const side of DIRS) {
      const frame = pathItemFrame(code, side, 0, false);
      bank.pathItem(pathItemSpriteKey(frame, 0.5), frame, 0.5);
    }
  }
  const decals = [...Array.from({ length: LITTER_VARIANTS }, (_, k) => k), DECAL_MESS, DECAL_MESS + 1];
  for (const frame of decals) for (const flip of [0, 1]) bank.decal(decalSpriteKey(frame, flip, 0.5), frame, flip, 0.5);
  for (const dir of DIRS) bank.fence(dir, 0.5);
  for (const part of [0, 1] as const) for (const outer of [-1, 0, 1, 2, 3] as const) bank.entrance(part, outer, 0.5);
  for (let colour = 0; colour < 12; colour++) {
    for (let look = 0; look < 4; look++) {
      for (let walk = 0; walk < 3; walk++) {
        const frame = colour | (walk << 4) | (look << 6);
        for (const facing of [0, 1] as const) {
          bank.beginFrame();
          bank.guest(guestSpriteKey(facing, frame, 0.5), facing, frame, 0.5);
        }
      }
    }
  }
}

describe('scene colour map (stage 0)', () => {
  it('the scene objects resolve every colour through the map (no miss)', () => {
    setArtStyle('pixel');
    paletteStats.misses = 0;
    paletteStats.missed.clear();
    let recs: readonly DerivedRecord[] = [];
    startDerivedMemo();
    try {
      buildScene();
    } finally {
      recs = stopDerivedMemo();
    }
    const missed = [...paletteStats.missed].sort();
    if (missed.length > 0) console.log(missed.map((m) => describeMiss(m, recs)).join('\n'));
    expect(missed).toEqual([]);
    expect(paletteStats.misses).toBe(0);
  });

  it('keys stay sorted; no entry is i3 or a signal slot', () => {
    const keys = Object.keys(COLOUR_MAP);
    expect(keys).toEqual([...keys].sort());
    for (const k of keys) expect(k).toBe(k.toLowerCase());
    for (const v of Object.values(COLOUR_MAP)) {
      expect(v).not.toBe('i3');
      expect(['x', 'y', 'q', 'u']).not.toContain(v.replace(/\d+$/, ''));
    }
  });
});
