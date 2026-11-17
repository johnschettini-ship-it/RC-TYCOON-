/**
 * Phase 4 research (master R10, R23; catalog §9): Log Flume 480, Rapids Raft 540, each scenery theme 240 points,
 * after the 21 Build 1 items. Starting roster (owner, 2026-11-17): the Log Flume starts unlocked and left the order, as
 * did 9 Build 1 rides, so Build 2 is the Rapids Raft and 5 themes after 12 Build 1 items. A researched theme unlocks all of its items; Base Set and Classic Fair start open.
 */
import { describe, expect, it } from 'vitest';
import { PATH_ITEMS, SCENERY, SCENERY_THEMES } from '../../../src/data/catalog';
import { RESEARCH_ORDER, getResearchItem } from '../../../src/data/research';
import { BUILD_MAX_PHASE } from '../../../src/data/tuning/management';
import { executeCommand } from '../../../src/sim/commands';
import { createManagementSlice } from '../../../src/sim/management/types';
import { contentInfo, isUnlocked } from '../../../src/sim/research/api';
import { hourlyResearch, pickNextResearch } from '../../../src/sim/research/update';
import { TICKS_PER_MONTH } from '../../../src/data/tuning/core';
import { makeTestWorld } from '../../helpers/world';
import { RIDES_B_IDS } from '../../helpers/ridesB';
import { RIDES_C_IDS } from '../../helpers/ridesC';

const THEMES = ['frost_peaks', 'volcano_ridge', 'spooky_hollow', 'jungle_lagoon', 'starport'];

describe('Phase 4 research entries', () => {
  it('Build 2 raised the build phase limit to 4 (master R23); Build 3 raises it to 6 (W4-D)', () => {
    expect(BUILD_MAX_PHASE).toBeGreaterThanOrEqual(4);
  });

  it('adds Rapids Raft 540 and 240 per theme after the 12 Build 1 items (the Log Flume starts unlocked)', () => {
    // Build 3 (W4-D) appends 11 more items after these, and new rides batch B 5 (tests/unit/content/research.test.ts).
    expect(RESEARCH_ORDER).toHaveLength(18 + 11 + RIDES_B_IDS.length + RIDES_C_IDS.length);
    const build2 = RESEARCH_ORDER.slice(12, 18);
    expect(build2.map((r) => [r.id, r.category, r.cost])).toEqual([
      ['frost_peaks', 'scenery', 240],
      ['volcano_ridge', 'scenery', 240],
      ['rapids_raft', 'water', 540],
      ['spooky_hollow', 'scenery', 240],
      ['jungle_lagoon', 'scenery', 240],
      ['starport', 'scenery', 240],
    ]);
    expect(build2.reduce((a, r) => a + r.cost, 0)).toBe(540 + 5 * 240);
    expect(RESEARCH_ORDER.slice(0, 12).reduce((a, r) => a + r.cost, 0)).toBe(3510);
    expect(getResearchItem('log_flume')).toBeUndefined();
  });

  it('every research theme of the catalog is an entry with id = theme id, and each entry is known content', () => {
    for (const t of SCENERY_THEMES) {
      if (t.unlock === 'start') expect(getResearchItem(t.id)).toBeUndefined();
      else expect(getResearchItem(t.id)).toMatchObject({ category: 'scenery', cost: 240 });
    }
    for (const r of RESEARCH_ORDER) expect(contentInfo(r.id), r.id).toBeDefined();
  });

  it('the lamp and the Log Flume start unlocked; the Rapids Raft and themes wait for research', () => {
    const w = makeTestWorld();
    expect(PATH_ITEMS.find((p) => p.id === 'lamp')).toMatchObject({ phase: 4, unlock: 'start' });
    expect(isUnlocked(w, 'lamp')).toBe(true);
    expect(isUnlocked(w, 'log_flume')).toBe(true);
    for (const id of ['rapids_raft', ...THEMES]) expect(isUnlocked(w, id), id).toBe(false);
  });
});

describe('theme research unlocks items', () => {
  it('Base Set and Classic Fair items are open at start; theme items open when their theme is researched', () => {
    const w = makeTestWorld();
    for (const d of SCENERY) {
      const start = d.theme === 'base' || d.theme === 'classic_fair';
      expect(isUnlocked(w, d.id), d.id).toBe(start);
    }
    w.state.management.research.unlocked.push('frost_peaks');
    for (const d of SCENERY) {
      expect(isUnlocked(w, d.id), d.id).toBe(d.theme === 'base' || d.theme === 'classic_fair' || d.theme === 'frost_peaks');
    }
  });

  it('placeScenery answers "Not unlocked" until the theme is researched through the hourly research step', () => {
    const w = makeTestWorld();
    const r = w.state.management.research;
    expect(executeCommand(w, { type: 'placeScenery', defId: 'snowman', x: 10, y: 10, rotation: 0, edge: -1 })).toEqual({ ok: false, reason: 'Not unlocked' });
    r.current = 'frost_peaks';
    r.level = 'high';
    r.progress = 238;
    w.state.tick = TICKS_PER_MONTH;
    hourlyResearch(w);
    expect(r.unlocked).toContain('frost_peaks');
    expect(w.events).toContainEqual({ type: 'researchUnlocked', itemId: 'frost_peaks' });
    expect(executeCommand(w, { type: 'placeScenery', defId: 'snowman', x: 10, y: 10, rotation: 0, edge: -1 }).ok).toBe(true);
    expect(executeCommand(w, { type: 'placeScenery', defId: 'lava_rock', x: 12, y: 10, rotation: 0, edge: -1 })).toEqual({ ok: false, reason: 'Not unlocked' });
  });

  it('focusing Scenery picks the first theme; focusing Water picks the Rapids Raft', () => {
    const m = createManagementSlice();
    const r = m.research;
    for (const k of Object.keys(r.focus) as (keyof typeof r.focus)[]) r.focus[k] = false;
    r.focus.scenery = true;
    expect(pickNextResearch(r)).toBe('frost_peaks');
    r.unlocked.push('frost_peaks', 'volcano_ridge');
    expect(pickNextResearch(r)).toBe('spooky_hollow');
    r.focus.scenery = false;
    r.focus.water = true;
    expect(pickNextResearch(r)).toBe('rapids_raft');
  });
});
