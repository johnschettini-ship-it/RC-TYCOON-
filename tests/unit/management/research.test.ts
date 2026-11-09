import { describe, expect, it } from 'vitest';
import { hourlyResearch, pickNextResearch } from '../../../src/sim/research/update';
import { isUnlocked, researchStatus } from '../../../src/sim/research/api';
import { executeCommand } from '../../../src/sim/commands';
import { currentLedger } from '../../../src/sim/economy/ledger';
import { createManagementSlice, type ResearchLevel } from '../../../src/sim/management/types';
import { RESEARCH_ORDER } from '../../../src/data/research';
import { RESEARCH_BUDGET_MONTHLY, RESEARCH_POINTS_PER_HOUR } from '../../../src/data/tuning/management';
import { MSG } from '../../../src/data/strings/management';
import { FLAT_RIDES, PATH_ITEMS, STALLS, TRACK_RIDES } from '../../../src/data/catalog';
import { TICKS_PER_HOUR, TICKS_PER_MONTH, START_TICK } from '../../../src/data/tuning/core';
import { makeTestWorld, runTicks } from '../../helpers/world';
import type { World } from '../../../src/sim/types';

/** Run `hourlyResearch` at every hour start from `fromTick` (inclusive) for `hours` hours. */
function runHours(w: World, fromTick: number, hours: number): void {
  for (let h = 0; h < hours; h++) {
    w.state.tick = fromTick + h * TICKS_PER_HOUR;
    hourlyResearch(w);
  }
}

function researchLine(w: World, monthIndex: number): number {
  return w.state.economy.ledger.find((l) => l.monthIndex === monthIndex)?.lines.research ?? 0;
}

describe('research order (Phase 3 §4.6, catalog §9)', () => {
  it('lists all 21 Build 1 items with the spec costs (6,460 points)', () => {
    // Build 2 (W3-D) appends the Phase 4 items after these (tests/unit/scenery/research.test.ts).
    const build1 = RESEARCH_ORDER.slice(0, 21);
    expect(build1).toHaveLength(21);
    expect(build1.reduce((a, r) => a + r.cost, 0)).toBe(6460);
    expect(RESEARCH_ORDER.slice(0, 7).map((r) => [r.id, r.cost])).toEqual([
      ['spiral_slide', 150],
      ['ice_cream_cart', 150],
      ['umbrella_stand', 180],
      ['rocket_rounds', 200],
      ['pendulum_ship', 250],
      ['first_aid', 200],
      ['bumper_cars', 250],
    ]);
  });

  it('covers exactly the Phase 3 research items of the catalog, each in its catalog category', () => {
    const catalog = [...FLAT_RIDES, ...TRACK_RIDES, ...STALLS].filter((d) => d.phase === 3 && d.unlock !== 'start');
    const build1 = RESEARCH_ORDER.slice(0, 21);
    expect(new Set(build1.map((r) => r.id))).toEqual(new Set(catalog.map((d) => d.id)));
    for (const item of build1) expect(catalog.find((d) => d.id === item.id)?.unlock).toBe(item.category);
  });

  it('a new game starts at medium with the first item in progress', () => {
    const m = createManagementSlice();
    expect(m.research.level).toBe('medium');
    expect(m.research.current).toBe('spiral_slide');
    expect(m.research.progress).toBe(0);
  });
});

describe('research points', () => {
  it('adds the level points each hour, times modifiers.researchSpeed', () => {
    expect(RESEARCH_POINTS_PER_HOUR).toEqual({ none: 0, low: 2, medium: 3, high: 4 });
    for (const level of ['none', 'low', 'medium', 'high'] as ResearchLevel[]) {
      const w = makeTestWorld();
      w.state.management.research.level = level;
      runHours(w, TICKS_PER_MONTH, 10);
      expect(w.state.management.research.progress).toBe(10 * RESEARCH_POINTS_PER_HOUR[level]);
    }
    const w = makeTestWorld();
    w.state.modifiers.researchSpeed = 1.5;
    runHours(w, TICKS_PER_MONTH, 4);
    expect(w.state.management.research.progress).toBe(18);
  });

  it('unlocks at progress ≥ cost, carries the surplus, emits the event and a research message', () => {
    const w = makeTestWorld();
    const r = w.state.management.research;
    r.level = 'high';
    r.progress = 148;
    runHours(w, TICKS_PER_MONTH, 1);
    expect(r.unlocked).toEqual(['spiral_slide']);
    expect(r.current).toBe('ice_cream_cart');
    expect(r.progress).toBe(2);
    expect(w.events).toContainEqual({ type: 'researchUnlocked', itemId: 'spiral_slide' });
    expect(w.state.management.messages).toEqual([
      expect.objectContaining({ category: 'research', textId: MSG.researchRide, params: { itemId: 'spiral_slide', name: 'Spiral Slide' }, entityId: -1, tile: -1 }),
    ]);
    // Stall and track ride messages use their own texts.
    r.progress = 149;
    runHours(w, TICKS_PER_MONTH + TICKS_PER_HOUR, 1);
    expect(w.state.management.messages[1]).toMatchObject({ textId: MSG.researchStall, params: { itemId: 'ice_cream_cart', name: 'Ice Cream Cart' } });
  });

  it('a show site unlock says "New show available"', () => {
    const w = makeTestWorld();
    const r = w.state.management.research;
    r.current = 'lightshow_tower';
    r.level = 'high';
    r.progress = 299;
    runHours(w, TICKS_PER_MONTH, 1);
    expect(r.unlocked).toContain('lightshow_tower');
    const msg = w.state.management.messages.find((m) => m.params?.itemId === 'lightshow_tower');
    expect(msg?.textId).toBe(MSG.researchShow);
  });

  it('a scenery theme unlock says "New scenery available"', () => {
    const w = makeTestWorld();
    const r = w.state.management.research;
    r.current = 'frost_peaks';
    r.level = 'high';
    r.progress = 239;
    runHours(w, TICKS_PER_MONTH, 1);
    expect(r.unlocked).toContain('frost_peaks');
    const msg = w.state.management.messages.find((m) => m.params?.itemId === 'frost_peaks');
    expect(msg?.textId).toBe(MSG.researchScenery);
  });

  it('unlocks several items in one hour when the surplus covers them', () => {
    const w = makeTestWorld();
    const r = w.state.management.research;
    r.progress = 150 + 150 + 180 - 3 + 1;
    runHours(w, TICKS_PER_MONTH, 1);
    expect(r.unlocked).toEqual(['spiral_slide', 'ice_cream_cart', 'umbrella_stand']);
    expect(r.progress).toBe(1);
  });
});

describe('research item choice and focus', () => {
  it('picks the first remaining item of a focused category, else the first remaining item', () => {
    const m = createManagementSlice();
    const r = m.research;
    for (const k of Object.keys(r.focus) as (keyof typeof r.focus)[]) r.focus[k] = false;
    expect(pickNextResearch(r)).toBe('spiral_slide');
    r.focus.thrill = true;
    expect(pickNextResearch(r)).toBe('pendulum_ship');
    r.focus.coasters = true;
    expect(pickNextResearch(r)).toBe('pendulum_ship');
    r.focus.thrill = false;
    expect(pickNextResearch(r)).toBe('spinning_mouse');
    // Build 3 (W4-D, BUILD_MAX_PHASE 6) adds the Bobsled Run and the Inverted Coaster to the Coasters category.
    r.unlocked.push('spinning_mouse', 'wooden_coaster', 'bobsled_run', 'inverted_coaster');
    expect(pickNextResearch(r)).toBe('spiral_slide');
  });

  it('focus decides the next item after an unlock but never resets the current one', () => {
    const w = makeTestWorld();
    const r = w.state.management.research;
    expect(executeCommand(w, { type: 'setResearchFocus', category: 'gentle', on: false })).toEqual({ ok: true, cost: 0, warnings: [] });
    expect(executeCommand(w, { type: 'setResearchFocus', category: 'shops', on: false }).ok).toBe(true);
    expect(executeCommand(w, { type: 'setResearchFocus', category: 'coasters', on: false }).ok).toBe(true);
    r.progress = 100;
    expect(r.current).toBe('spiral_slide');
    expect(r.progress).toBe(100);
    r.progress = 147;
    runHours(w, TICKS_PER_MONTH, 1);
    expect(r.unlocked).toEqual(['spiral_slide']);
    expect(r.current).toBe('pendulum_ship');
  });

  it('rejects an unknown category', () => {
    const w = makeTestWorld();
    const r = executeCommand(w, { type: 'setResearchFocus', category: 'rockets' as never, on: true });
    expect(r).toEqual({ ok: false, reason: 'Unknown category' });
  });
});

describe('research budget (hourly charge rule)', () => {
  it('a full month at each level costs exactly the monthly budget', () => {
    expect(RESEARCH_BUDGET_MONTHLY).toEqual({ none: 0, low: 20_000, medium: 40_000, high: 60_000 });
    for (const level of ['none', 'low', 'medium', 'high'] as ResearchLevel[]) {
      const w = makeTestWorld();
      w.state.management.research.level = level;
      runHours(w, TICKS_PER_MONTH, 72);
      expect(researchLine(w, 1) + RESEARCH_BUDGET_MONTHLY[level]).toBe(0);
    }
  });

  it('a full month through the tick pipeline is exact, and a partial month charges full hours only', () => {
    const w = makeTestWorld();
    runTicks(w, 2 * TICKS_PER_MONTH - START_TICK);
    // Month 0 starts at 09:00: hours 9–71 = 63 hours, no remainder.
    expect(researchLine(w, 0)).toBe(-63 * Math.floor(40_000 / 72));
    expect(researchLine(w, 1)).toBe(-40_000);
  });

  it('a level change mid-month restarts the count, so no remainder is charged', () => {
    const w = makeTestWorld();
    runHours(w, TICKS_PER_MONTH, 10);
    w.state.tick += 1;
    expect(executeCommand(w, { type: 'setResearchBudget', level: 'high' })).toEqual({ ok: true, cost: 0, warnings: [] });
    for (let h = 10; h < 72; h++) {
      w.state.tick = TICKS_PER_MONTH + h * TICKS_PER_HOUR;
      hourlyResearch(w);
    }
    expect(researchLine(w, 1)).toBe(-(10 * Math.floor(40_000 / 72) + 62 * Math.floor(60_000 / 72)));
  });

  it('setting the same level keeps the count', () => {
    const w = makeTestWorld();
    runHours(w, TICKS_PER_MONTH, 10);
    executeCommand(w, { type: 'setResearchBudget', level: 'medium' });
    for (let h = 10; h < 72; h++) {
      w.state.tick = TICKS_PER_MONTH + h * TICKS_PER_HOUR;
      hourlyResearch(w);
    }
    expect(researchLine(w, 1)).toBe(-40_000);
  });
});

describe('research completion', () => {
  it('shows "All research is complete" once, then stops charges and points', () => {
    const w = makeTestWorld();
    const r = w.state.management.research;
    r.level = 'high';
    // The last item of the default order (Build 3: the Inverted Coaster, 650 points).
    const last = RESEARCH_ORDER[RESEARCH_ORDER.length - 1]!;
    r.unlocked = RESEARCH_ORDER.slice(0, -1).map((i) => i.id);
    r.current = last.id;
    r.progress = last.cost - 1;
    runHours(w, TICKS_PER_MONTH, 1);
    expect(r.current).toBeNull();
    expect(r.unlocked).toHaveLength(RESEARCH_ORDER.length);
    expect(r.completeNotified).toBe(true);
    const cash = w.state.park.cash;
    runHours(w, TICKS_PER_MONTH + TICKS_PER_HOUR, 30);
    expect(w.state.park.cash).toBe(cash);
    const done = w.state.management.messages.filter((m) => m.textId === MSG.researchComplete);
    expect(done).toHaveLength(1);
    expect(done[0]?.category).toBe('research');
    expect(w.state.management.messages.at(-2)?.params).toEqual({ itemId: 'inverted_coaster', name: 'Inverted Coaster' });
  });
});

describe('six months at medium (Phase 3 §9.2)', () => {
  it('6 × 216 = 1,296 points unlock exactly items 1–6', () => {
    const w = makeTestWorld();
    runTicks(w, 6 * TICKS_PER_MONTH);
    const r = w.state.management.research;
    expect(r.unlocked).toEqual(RESEARCH_ORDER.slice(0, 6).map((i) => i.id));
    expect(r.current).toBe('bumper_cars');
    expect(r.progress).toBe(1296 - 1130);
    expect(currentLedger(w).monthIndex).toBe(6);
  });
});

describe('isUnlocked', () => {
  it('start items and Phase 1–2 content are unlocked; research items only after unlock; Phase 4 open in Build 2 (master R23)', () => {
    const w = makeTestWorld();
    for (const id of ['carousel', 'big_wheel', 'steel_coaster', 'junior_coaster', 'mini_railway', 'snack_shack', 'restrooms', 'info_kiosk', 'bench', 'bin']) {
      expect(isUnlocked(w, id)).toBe(true);
    }
    for (const id of ['groundskeeper', 'mechanic', 'security', 'performer']) expect(isUnlocked(w, id)).toBe(true);
    for (const item of RESEARCH_ORDER) expect(isUnlocked(w, item.id)).toBe(false);
    // Build 2 raises BUILD_MAX_PHASE to 4: the lamp starts unlocked, water rides wait for research.
    for (const id of ['log_flume', 'rapids_raft', 'no_such_thing']) expect(isUnlocked(w, id)).toBe(false);
    expect(PATH_ITEMS.find((p) => p.id === 'lamp')?.phase).toBe(4);
    expect(isUnlocked(w, 'lamp')).toBe(true);
    w.state.management.research.unlocked.push('drop_tower', 'ghost_train', 'cocoa_hut');
    expect(isUnlocked(w, 'drop_tower')).toBe(true);
    expect(isUnlocked(w, 'ghost_train')).toBe(true);
    expect(isUnlocked(w, 'cocoa_hut')).toBe(true);
    expect(isUnlocked(w, 'flip_arm')).toBe(false);
  });
});

describe('researchStatus (Office panel)', () => {
  it('reports the current item, progress, cost, and hours left', () => {
    const w = makeTestWorld();
    w.state.management.research.progress = 30;
    expect(researchStatus(w)).toEqual({ current: 'spiral_slide', name: 'Spiral Slide', category: 'gentle', progress: 30, cost: 150, pointsPerHour: 3, hoursLeft: 40 });
    w.state.management.research.level = 'none';
    expect(researchStatus(w).hoursLeft).toBeNull();
  });
});
