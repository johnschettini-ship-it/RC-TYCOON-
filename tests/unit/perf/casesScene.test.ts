/** Phase 8b stage 0b test (never merged): the cases park save (`tests/perf/cases-0b.tcsave.json`, Task 9). */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deserialize, GAME_VERSION, serialize, validateState } from '../../../src/save';
import { samplesOf } from '../../../src/render/track/layer';
import { buildCasesScene, CASES_FILE } from '../../perf/casesScene';
import { SCENE_SAVED_AT } from '../../perf/sceneInfo';

const FILE = join(__dirname, '../../perf', CASES_FILE);

describe('cases park (stage 0b)', () => {
  it.runIf(!!process.env.TC_WRITE_SCENES)('writes the cases save', { timeout: 600_000 }, () => {
    const world = buildCasesScene();
    expect(validateState(world.state)).toBeNull();
    writeFileSync(FILE, serialize(world, GAME_VERSION, SCENE_SAVED_AT));
  });

  it('the save deserializes and holds every case', { timeout: 60_000 }, () => {
    const r = deserialize(readFileSync(FILE, 'utf8'));
    if (!r.ok) throw new Error(r.error);
    const s = r.world.state;
    expect(s.map.width).toBe(64);
    expect(s.rides.filter((x) => x.kind === 'flat')).toHaveLength(18);
    expect(new Set(s.rides.filter((x) => x.kind === 'flat').map((x) => x.defId)).size).toBe(18);
    const track = s.rides.filter((x) => x.kind === 'track');
    expect(track).toHaveLength(1);
    const data = s.track.rides[String((track[0] as { id: number }).id)];
    expect(data?.typeId).toBe('steel_coaster');
    expect(data?.pieces.some((p) => p.defId === 'corkscrew_right')).toBe(true);
    expect(data?.colours).toEqual({ track: 6, supports: 9, cars: 0 });
    expect(s.elevatedPaths.length).toBeGreaterThanOrEqual(1);
    expect(s.elevatedPaths.some((p) => p.rampDir !== -1)).toBe(true);
    let water = 0;
    for (let i = 0; i < s.map.water.length; i++) if ((s.map.water[i] as number) > (s.map.heights[i] as number)) water++;
    expect(water).toBeGreaterThan(0);
    // Support heights: whole metres of track above the ground under it (sample by sample).
    const heights = new Set<number>();
    for (const p of data?.pieces ?? []) {
      const sm = samplesOf(p);
      for (let k = 0; k < sm.n; k++) {
        const tx = Math.floor((sm.x[k] as number) / 4);
        const ty = Math.floor((sm.y[k] as number) / 4);
        const h = Math.floor((sm.z[k] as number) - (s.map.heights[ty * s.map.width + tx] as number));
        if (h > 0) heights.add(h);
      }
    }
    console.log(`[cases] support heights ${[...heights].sort((a, b) => a - b).join(' ')}; guests ${s.guests.length}; water tiles ${water}`);
    expect(heights.size).toBeGreaterThanOrEqual(3);
    expect(s.guests.length).toBeGreaterThan(100);
    // Fix round 1 (M3): a height spread, at least one cliff edge (a neighbour 2 or more steps apart) and one slope tile.
    const m = s.map;
    let lo = Infinity;
    let hi = -Infinity;
    let cliffs = 0;
    let slopes = 0;
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        const i = y * m.width + x;
        const h = m.heights[i] as number;
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
        if ((m.slope[i] as number) !== 0) slopes++;
        if (x + 1 < m.width && Math.abs(h - (m.heights[i + 1] as number)) >= 2) cliffs++;
        if (y + 1 < m.height && Math.abs(h - (m.heights[i + m.width] as number)) >= 2) cliffs++;
      }
    }
    console.log(`[cases] heights ${lo}..${hi}; cliff edges ${cliffs}; slope tiles ${slopes}`);
    expect(hi - lo).toBeGreaterThanOrEqual(3);
    expect(cliffs).toBeGreaterThanOrEqual(1);
    expect(slopes).toBeGreaterThanOrEqual(1);
  });
});
