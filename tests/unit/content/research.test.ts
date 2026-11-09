/**
 * Build 3 research (catalog §9, master R25): the 12 Phase 6 items after the Build 2 items, with the provisional
 * Wave 4.0 costs (4,200 points), each in its catalog category. Raising `BUILD_MAX_PHASE` to 6 makes them
 * researchable in every park; research unlocks each one.
 */
import { describe, expect, it } from 'vitest';
import { FLAT_RIDES, SHOW_SITES, STALLS, TRACK_RIDES } from '../../../src/data/catalog';
import { RESEARCH_ORDER, getResearchItem } from '../../../src/data/research';
import { BUILD_MAX_PHASE } from '../../../src/data/tuning/management';
import { TICKS_PER_MONTH } from '../../../src/data/tuning/core';
import { contentInfo, isUnlocked } from '../../../src/sim/research/api';
import { hourlyResearch, pickNextResearch } from '../../../src/sim/research/update';
import { makeTestWorld } from '../../helpers/world';

/** Card W4-D (open question 1, master R25): provisional costs by category. */
const BUILD3: Record<string, [string, number]> = {
  kiddie_cars: ['gentle', 150],
  merry_mill: ['gentle', 250],
  monorail: ['gentle', 450],
  magic_carpet: ['thrill', 400],
  gyro_globe: ['thrill', 550],
  bobsled_run: ['coasters', 500],
  inverted_coaster: ['coasters', 650],
  smoothie_bar: ['shops', 180],
  noodle_bar: ['shops', 220],
  photo_booth: ['shops', 200],
  lightshow_tower: ['scenery', 300],
  fireworks_launcher: ['scenery', 350],
};

const PHASE6 = [...FLAT_RIDES, ...TRACK_RIDES, ...STALLS, ...SHOW_SITES].filter((d) => d.phase === 6);

describe('Build 3 research entries (catalog §9, master R25)', () => {
  it('Build 3 raises the build phase limit to 6', () => {
    expect(BUILD_MAX_PHASE).toBe(6);
  });

  it('appends the 12 Phase 6 items after the 28 Build 1 and Build 2 items: 4,200 points', () => {
    expect(RESEARCH_ORDER).toHaveLength(28 + 12);
    const build3 = RESEARCH_ORDER.slice(28);
    expect(new Set(build3.map((r) => r.id))).toEqual(new Set(Object.keys(BUILD3)));
    for (const r of build3) expect([r.category, r.cost], r.id).toEqual(BUILD3[r.id]);
    expect(build3.reduce((a, r) => a + r.cost, 0)).toBe(4200);
    // The Build 1 and Build 2 entries keep their place.
    expect(RESEARCH_ORDER.slice(0, 28).reduce((a, r) => a + r.cost, 0)).toBe(6460 + 2220);
  });

  it('covers every Phase 6 catalog item, each in its catalog category', () => {
    expect(PHASE6).toHaveLength(12);
    for (const d of PHASE6) {
      const item = getResearchItem(d.id);
      expect(item, d.id).toBeDefined();
      expect(item?.category, d.id).toBe(d.unlock);
      expect(contentInfo(d.id)?.phase).toBe(6);
    }
  });

  it('every Phase 6 item is locked at start and opens once researched (each category)', () => {
    const w = makeTestWorld();
    for (const d of PHASE6) expect(isUnlocked(w, d.id), d.id).toBe(false);
    for (const d of PHASE6) {
      w.state.management.research.unlocked.push(d.id);
      expect(isUnlocked(w, d.id), d.id).toBe(true);
    }
  });

  it('the hourly research step unlocks a Build 3 item of the focused category', () => {
    const w = makeTestWorld();
    const r = w.state.management.research;
    // Everything before the Build 3 items is done; focus Shops.
    r.unlocked = RESEARCH_ORDER.slice(0, 28).map((i) => i.id);
    for (const k of Object.keys(r.focus) as (keyof typeof r.focus)[]) r.focus[k] = k === 'shops';
    r.current = pickNextResearch(r);
    expect(r.current).toBe(RESEARCH_ORDER.find((i) => i.category === 'shops' && !r.unlocked.includes(i.id))?.id);
    const cost = getResearchItem(r.current as string)!.cost;
    r.level = 'high';
    r.progress = cost - 1;
    w.state.tick = TICKS_PER_MONTH;
    const id = r.current as string;
    hourlyResearch(w);
    expect(r.unlocked).toContain(id);
    expect(isUnlocked(w, id)).toBe(true);
    expect(w.events).toContainEqual({ type: 'researchUnlocked', itemId: id });
  });

  it('the default order reaches every Build 3 item', () => {
    const w = makeTestWorld();
    const r = w.state.management.research;
    r.unlocked = [];
    const seen: string[] = [];
    for (let k = 0; k < RESEARCH_ORDER.length; k++) {
      const next = pickNextResearch(r);
      if (next === null) break;
      seen.push(next);
      r.unlocked.push(next);
    }
    expect(pickNextResearch(r)).toBeNull();
    for (const id of Object.keys(BUILD3)) expect(seen).toContain(id);
  });
});
