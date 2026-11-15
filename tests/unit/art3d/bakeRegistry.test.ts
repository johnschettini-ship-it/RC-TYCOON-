import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FLAT_RIDES } from '../../../src/data/catalog';
import { REAL_FALLBACK } from '../../../src/render/real/fallbacks';
import { itemSpec } from '../../../tools/art3d/catalog';

// Plain JS build tools without types: import by a computed path so they load as `any`.
/** The baked items the stage 1 reader (Task 7 fallbacks.ts) maps game ids to. */
const REAL_FALLBACK_IDS = ['carousel', 'swing_tower', 'big_wheel', 'snack_shack', 'oak_round', 'pine_tall', 'birch_silver', 'willow', 'shrub_round', 'boulder', 'lamp_globe', 'bunting_pole', 'bench', 'bin', 'steel_coaster'];
const dir = new URL('../../../tools/art3d/', import.meta.url);
const load = (rel: string): Promise<any> => import(/* @vite-ignore */ new URL(rel, dir).href); // eslint-disable-line @typescript-eslint/no-explicit-any

describe('stage 1 bake list', () => {
  it('every item has its module, its files and a bake entry in items/index.js', async () => {
    const { ITEM_LIST, SHARED } = await load('items/registry.js');
    const index = readFileSync(new URL('items/index.js', dir), 'utf8');
    for (const it of ITEM_LIST) {
      for (const f of [...SHARED, it.file, ...(it.deps ?? [])]) expect(existsSync(new URL(f, dir)), `${it.id}: ${f}`).toBe(true);
      expect(index).toMatch(new RegExp(`import ${it.id} from '\\./${it.file.replace('items/', '')}'`));
    }
  });
  it('catalogue items resolve to a footprint and height', async () => {
    const { ITEM_LIST } = await load('items/registry.js');
    for (const it of ITEM_LIST.filter((x: { catalog?: unknown }) => x.catalog)) {
      const s = itemSpec(it.catalog[0], it.catalog[1]);
      expect(s.footprintTiles.every((n) => n >= 1)).toBe(true);
      expect(s.heightM).toBeGreaterThan(0);
    }
  });
  it('bakes every item the stage 1 reader maps to', async () => {
    const { ITEM_LIST } = await load('items/registry.js');
    const ids = new Set(ITEM_LIST.map((x: { id: string }) => x.id));
    for (const id of REAL_FALLBACK_IDS) expect(ids.has(id), id).toBe(true);
  });
});

describe('batch 1 flat rides', () => {
  const BAKED_RIDES = ['carousel', 'swing_tower', 'big_wheel'];
  it('the three baked rides are in the registry and their own baked item (not a stand-in)', async () => {
    const { ITEM_LIST } = await load('items/registry.js');
    const ids = new Set(ITEM_LIST.map((x: { id: string }) => x.id));
    for (const id of BAKED_RIDES) {
      expect(ids.has(id), id).toBe(true);
      expect(REAL_FALLBACK[id], id).toBe(id);
    }
  });
  // Each ride task turns its todo into: in ITEM_LIST, REAL_FALLBACK[id] === id (so not in STAND_INS), has a card frame.
  for (const d of FLAT_RIDES.filter((r) => !BAKED_RIDES.includes(r.id))) it.todo(`${d.id} is baked: ITEM_LIST, BAKED, not a stand-in, card frame`);
});
