import { describe, expect, it } from 'vitest';
import { TRACK_RIDES } from '../../../src/data/catalog';
import * as budget from '../../../tools/art3d/trackBudget';
import { TRACK_BENCH_MAX_D4, TRACK_COMPRESSED_MAX, TRACK_COMPRESSED_MAX_BIG, TRACK_SET_MAX_D4, trackBudget, trackTypeOfItem } from '../../../tools/art3d/trackBudget';

const MiB = 1024 * 1024;
const dir = new URL('../../../tools/art3d/', import.meta.url);
const load = (rel: string): Promise<any> => import(/* @vite-ignore */ new URL(rel, dir).href); // eslint-disable-line @typescript-eslint/no-explicit-any

describe('trackBudget (batch 5 size rule)', () => {
  it('6 MB compressed for types with loop, corkscrew or helix pieces, 3 MB for the rest; 8 MiB per set and 32 MiB bench at d4', () => {
    expect([TRACK_COMPRESSED_MAX_BIG, TRACK_COMPRESSED_MAX, TRACK_SET_MAX_D4, TRACK_BENCH_MAX_D4]).toEqual([6_000_000, 3_000_000, 8 * MiB, 32 * MiB]);
    const big = ['steel_coaster', 'inverted_coaster', 'bobsled_run', 'launch_coaster', 'flying_coaster', 'mine_train'];
    for (const r of TRACK_RIDES) {
      const b = trackBudget(r.id);
      expect(b, r.id).toEqual({ compressedMax: big.includes(r.id) ? 6_000_000 : 3_000_000, setMaxD4: 8 * MiB, benchMaxD4: 32 * MiB });
    }
  });

  it('every track ride has a budget and an unknown type throws', () => {
    expect(TRACK_RIDES.length).toBe(17);
    expect(() => trackBudget('no_such_type')).toThrow(/no track type/);
  });

  it('no stage 1 exception remains: the steel coaster bakes every piece on the track kit (Task 3)', async () => {
    const { COASTER_PIECES, TRACK_TYPES } = await load('items/registry.js');
    expect(COASTER_PIECES).toBeUndefined();
    expect(TRACK_TYPES.map((t: { type: string }) => t.type)).toContain('steel_coaster');
    expect('STAGE1_TRACK' in budget).toBe(false);
  });

  it('a set item names its type', () => {
    expect(trackTypeOfItem('steel_coaster~loop')).toBe('steel_coaster');
    expect(trackTypeOfItem('steel_coaster')).toBe('steel_coaster');
  });
});
