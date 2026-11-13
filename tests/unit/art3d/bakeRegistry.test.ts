import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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
