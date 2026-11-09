/**
 * The 85-item scenery catalog (Wave 3.0 contract data) checked row by row against the Phase 4 §4.5 tables in the spec,
 * and the theme list against catalog §6.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCENERY, SCENERY_THEMES } from '../../../src/data/catalog';

const SPEC = readFileSync(new URL('../../../docs/superpowers/specs/thrills-and-chills/phase-4-land-scenery-after-dark.md', import.meta.url), 'utf8');
const CATALOG = readFileSync(new URL('../../../docs/superpowers/specs/thrills-and-chills/content-catalog.md', import.meta.url), 'utf8');

interface Row {
  id: string;
  name: string;
  size: string;
  h: number;
  cost: number;
  c: number;
  b: number;
  flags: string;
}

function specRows(): Row[] {
  const start = SPEC.indexOf('### 4.5 Scenery');
  const end = SPEC.indexOf('### 4.6');
  const out: Row[] = [];
  for (const line of SPEC.slice(start, end).split('\n')) {
    const m = /^\| `([a-z_]+)` \| ([^|]+) \| ([^|]+) \| (\d+) \| \$(\d+) \| (\d+) \| (\d+) \| ([^|]+) \|$/.exec(line.trim());
    if (!m) continue;
    out.push({ id: m[1]!, name: m[2]!.trim(), size: m[3]!.trim(), h: Number(m[4]), cost: Number(m[5]), c: Number(m[6]), b: Number(m[7]), flags: m[8]!.trim() });
  }
  return out;
}

describe('scenery catalog matches the spec tables', () => {
  const rows = specRows();

  it('the spec lists 85 items, the catalog has the same ids in the same order', () => {
    expect(rows).toHaveLength(85);
    expect(SCENERY.map((d) => d.id)).toEqual(rows.map((r) => r.id));
  });

  it.each(rows.map((r) => [r.id, r] as const))('%s: name, size, height, cost, Calm, Buzz, flags', (id, r) => {
    const d = SCENERY.find((x) => x.id === id)!;
    expect(d.name).toBe(r.name);
    if (r.size === 'edge') expect([d.edge, d.w, d.d]).toEqual([true, 1, 1]);
    else expect(`${d.w}×${d.d}`).toBe(r.size);
    expect(d.heightM).toBe(r.h);
    expect(d.buildCost).toBe(r.cost * 100);
    expect([d.calm, d.buzz]).toEqual([r.c, r.b]);
    const flags = r.flags === '—' ? [] : r.flags.split(',').map((f) => f.trim());
    expect({ L: d.light, W: d.needsWater, S: d.slopeOk, E: d.edge, P: d.overPath, K: d.spooky }).toEqual({
      L: flags.includes('L'),
      W: flags.includes('W'),
      S: flags.includes('S'),
      E: flags.includes('E'),
      P: flags.includes('P'),
      K: flags.includes('K'),
    });
  });

  it('themes: Base Set and Classic Fair at start, the 5 others from the Scenery research category (catalog §6)', () => {
    expect(SCENERY_THEMES.map((t) => [t.name, t.unlock])).toEqual([
      ['Base Set', 'start'],
      ['Classic Fair', 'start'],
      ['Frost Peaks', 'scenery'],
      ['Volcano Ridge', 'scenery'],
      ['Spooky Hollow', 'scenery'],
      ['Jungle Lagoon', 'scenery'],
      ['Starport', 'scenery'],
    ]);
    for (const t of SCENERY_THEMES.slice(1)) expect(CATALOG).toContain(`| ${t.name} | ${t.unlock === 'start' ? 'start' : 'Scenery'} |`);
  });
});
