import { describe, expect, it } from 'vitest';
import { hourlyResearch, pickNextResearch } from '../../../src/sim/research/update';
import { isUnlocked, researchStatus } from '../../../src/sim/research/api';
import { executeCommand } from '../../../src/sim/commands';
import { currentLedger } from '../../../src/sim/economy/ledger';
import { createManagementSlice, type ResearchLevel } from '../../../src/sim/management/types';
import { FORMER_RESEARCH_IDS, RESEARCH_ORDER } from '../../../src/data/research';
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
  it('lists the 12 Build 1 items with the spec costs (3,510 points): the 21 of the spec less the 9 start rides', () => {
    // Build 2 (W3-D) appends the Phase 4 items after these (tests/unit/scenery/research.test.ts).
    const build1 = RESEARCH_ORDER.slice(0, 12);
    expect(build1).toHaveLength(12);
    // Spiral Slide 150, Rocket Rounds 200, Pendulum Ship 250, Bumper Cars 250, Mirror Maze 250, Spinning Mouse 450,
    // Observation Tower 350, Drop Tower 450, Wooden Coaster 600 start unlocked now.
    expect(build1.reduce((a, r) => a + r.cost, 0)).toBe(6460 - (150 + 200 + 250 + 250 + 250 + 450 + 350 + 450 + 600));
    expect(build1.map((r) => [r.id, r.cost])).toEqual([
      ['ice_cream_cart', 150],
      ['umbrella_stand', 180],
      ['first_aid', 200],
      ['cocoa_hut', 180],
      ['pizza_slice', 220],
      ['thunder_disc', 350],
      ['balloon_stand', 180],
      ['go_karts', 400],
      ['ghost_train', 400],
      ['cash_machine', 250],
      ['haunted_manor', 450],
      ['flip_arm', 550],
    ]);
  });

  it('covers exactly the Phase 3 research items of the catalog, each in its catalog category', () => {
    const catalog = [...FLAT_RIDES, ...TRACK_RIDES, ...STALLS].filter((d) => d.phase === 3 && d.unlock !== 'start');
    const build1 = RESEARCH_ORDER.slice(0, 12);
    expect(new Set(build1.map((r) => r.id))).toEqual(new Set(catalog.map((d) => d.id)));
    for (const item of build1) expect(catalog.find((d) => d.id === item.id)?.unlock).toBe(item.category);
  });

  it('a new game starts at medium with the first item in progress', () => {
    const m = createManagementSlice();
    expect(m.research.level).toBe('medium');
    expect(m.research.current).toBe('ice_cream_cart');
    expect(m.research.progress).toBe(0);
  });
});

describe('starting roster (owner, 2026-11-17)', () => {
  it('the research order no longer holds the 11 rides that start unlocked; their catalogue unlock is start', () => {
    expect([...FORMER_RESEARCH_IDS].sort()).toEqual(
      ['spiral_slide', 'rocket_rounds', 'pendulum_ship', 'bumper_cars', 'kiddie_cars', 'mirror_maze', 'observation_tower', 'drop_tower', 'wooden_coaster', 'spinning_mouse', 'log_flume'].sort(),
    );
    for (const id of FORMER_RESEARCH_IDS) {
      expect(RESEARCH_ORDER.some((r) => r.id === id), id).toBe(false);
      expect([...FLAT_RIDES, ...TRACK_RIDES].find((d) => d.id === id)?.unlock, id).toBe('start');
    }
  });

  it('a new free play park offers 23 rides at the start (16 flat incl. the 4 new family rides, 7 track incl. the Mine Train); 21 rides wait for research (5 of new rides batch B, 4 of batch C)', () => {
    const w = makeTestWorld();
    const flat = FLAT_RIDES.filter((d) => isUnlocked(w, d.id)).map((d) => d.id);
    const track = TRACK_RIDES.filter((d) => isUnlocked(w, d.id)).map((d) => d.id);
    expect(flat.sort()).toEqual(
      ['carousel', 'big_wheel', 'swing_tower', 'teacup_twirl', 'spiral_slide', 'rocket_rounds', 'pendulum_ship', 'bumper_cars', 'kiddie_cars', 'mirror_maze', 'observation_tower', 'drop_tower', 'dodgem_boats', 'mini_pirate_ship', 'balloon_wheel', 'frog_hopper'].sort(),
    );
    expect(track.sort()).toEqual(['steel_coaster', 'junior_coaster', 'mini_railway', 'wooden_coaster', 'spinning_mouse', 'log_flume', 'mine_train'].sort());
    const researched = RESEARCH_ORDER.filter((r) => FLAT_RIDES.some((d) => d.id === r.id) || TRACK_RIDES.some((d) => d.id === r.id)).map((r) => r.id);
    // The research rides keep their relative order; new rides batch B's 5 are inserted by cost among the Build 3 ones.
    expect(researched).toEqual(['thunder_disc', 'go_karts', 'ghost_train', 'haunted_manor', 'flip_arm', 'rapids_raft', 'magic_carpet', 'merry_mill',
      'station_show', 'chair_swing_twist', 'bobsled_run', 'gyro_globe', 'launch_coaster', 'spin_wheel_drop', 'water_coaster', 'carousel_deluxe', 'sky_ride', 'monorail', 'inverted_coaster', 'loop_swing', 'flying_coaster']);
    for (const id of researched) expect(isUnlocked(w, id), id).toBe(false);
  });

  it('research never picks or announces a start ride', () => {
    const w = makeTestWorld();
    w.state.management.research.level = 'high';
    runHours(w, TICKS_PER_MONTH, 24 * 60);
    const r = w.state.management.research;
    for (const id of FORMER_RESEARCH_IDS) expect(r.unlocked, id).not.toContain(id);
    const announced = w.state.management.messages.map((m) => String(m.params?.itemId ?? ''));
    for (const id of FORMER_RESEARCH_IDS) expect(announced, id).not.toContain(id);
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
    r.current = 'thunder_disc';
    r.progress = 348;
    runHours(w, TICKS_PER_MONTH, 1);
    expect(r.unlocked).toEqual(['thunder_disc']);
    expect(r.current).toBe('ice_cream_cart');
    expect(r.progress).toBe(2);
    expect(w.events).toContainEqual({ type: 'researchUnlocked', itemId: 'thunder_disc' });
    expect(w.state.management.messages).toEqual([
      expect.objectContaining({ category: 'research', textId: MSG.researchRide, params: { itemId: 'thunder_disc', name: 'Thunder Disc' }, entityId: -1, tile: -1 }),
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
    r.progress = 150 + 180 + 200 - 3 + 1;
    runHours(w, TICKS_PER_MONTH, 1);
    expect(r.unlocked).toEqual(['ice_cream_cart', 'umbrella_stand', 'first_aid']);
    expect(r.progress).toBe(1);
  });
});

describe('research item choice and focus', () => {
  it('picks the first remaining item of a focused category, else the first remaining item', () => {
    const m = createManagementSlice();
    const r = m.research;
    for (const k of Object.keys(r.focus) as (keyof typeof r.focus)[]) r.focus[k] = false;
    expect(pickNextResearch(r)).toBe('ice_cream_cart');
    r.focus.thrill = true;
    expect(pickNextResearch(r)).toBe('thunder_disc');
    r.focus.coasters = true;
    expect(pickNextResearch(r)).toBe('thunder_disc');
    r.focus.thrill = false;
    // The Wooden Coaster and Spinning Mouse start unlocked: Build 3's Bobsled Run is the first Coasters item.
    expect(pickNextResearch(r)).toBe('bobsled_run');
    // Every Coasters item researched (new rides batch C adds its coasters to the category).
    r.unlocked.push(...RESEARCH_ORDER.filter((i) => i.category === 'coasters').map((i) => i.id));
    expect(pickNextResearch(r)).toBe('ice_cream_cart');
  });

  it('focus decides the next item after an unlock but never resets the current one', () => {
    const w = makeTestWorld();
    const r = w.state.management.research;
    expect(executeCommand(w, { type: 'setResearchFocus', category: 'gentle', on: false })).toEqual({ ok: true, cost: 0, warnings: [] });
    expect(executeCommand(w, { type: 'setResearchFocus', category: 'shops', on: false }).ok).toBe(true);
    expect(executeCommand(w, { type: 'setResearchFocus', category: 'coasters', on: false }).ok).toBe(true);
    r.progress = 100;
    expect(r.current).toBe('ice_cream_cart');
    expect(r.progress).toBe(100);
    r.progress = 147;
    runHours(w, TICKS_PER_MONTH, 1);
    expect(r.unlocked).toEqual(['ice_cream_cart']);
    expect(r.current).toBe('thunder_disc');
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
    // The last item of the default order (new rides batch C: the Flying Coaster, late, 700 points).
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
    expect(w.state.management.messages.at(-2)?.params).toEqual({ itemId: 'flying_coaster', name: 'Flying Coaster' });
  });
});

describe('six months at medium (Phase 3 §9.2)', () => {
  // The starting roster (owner, 2026-11-17) changed the first 6 items: 1,280 points now (1,130 before).
  it('6 × 216 = 1,296 points unlock exactly items 1–6', () => {
    const w = makeTestWorld();
    runTicks(w, 6 * TICKS_PER_MONTH);
    const r = w.state.management.research;
    expect(r.unlocked).toEqual(RESEARCH_ORDER.slice(0, 6).map((i) => i.id));
    expect(r.current).toBe('balloon_stand');
    expect(r.progress).toBe(1296 - 1280);
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
    for (const id of ['rapids_raft', 'no_such_thing']) expect(isUnlocked(w, id)).toBe(false);
    // The starting roster (owner, 2026-11-17): the Log Flume starts unlocked.
    expect(isUnlocked(w, 'log_flume')).toBe(true);
    expect(PATH_ITEMS.find((p) => p.id === 'lamp')?.phase).toBe(4);
    expect(isUnlocked(w, 'lamp')).toBe(true);
    w.state.management.research.unlocked.push('thunder_disc', 'ghost_train', 'cocoa_hut');
    expect(isUnlocked(w, 'thunder_disc')).toBe(true);
    expect(isUnlocked(w, 'ghost_train')).toBe(true);
    expect(isUnlocked(w, 'cocoa_hut')).toBe(true);
    expect(isUnlocked(w, 'flip_arm')).toBe(false);
  });
});

describe('researchStatus (Office panel)', () => {
  it('reports the current item, progress, cost, and hours left', () => {
    const w = makeTestWorld();
    w.state.management.research.progress = 30;
    expect(researchStatus(w)).toEqual({ current: 'ice_cream_cart', name: 'Ice Cream Cart', category: 'shops', progress: 30, cost: 150, pointsPerHour: 3, hoursLeft: 40 });
    w.state.management.research.level = 'none';
    expect(researchStatus(w).hoursLeft).toBeNull();
  });
});
