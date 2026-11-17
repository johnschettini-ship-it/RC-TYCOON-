/**
 * Starting roster (owner, 2026-11-17): 11 rides that research used to unlock (Spiral Slide, Pendulum Ship, the Wooden
 * Coaster, the Log Flume, ...) start unlocked and left the research order. An old save that names them in
 * `research.current` or `research.unlocked` still loads: research moves on to the next item with its progress, the rides
 * stay buildable, and nothing is announced or listed twice.
 *
 * `save-start-roster.tcsave.json` is the Build 1 `save-v1-rich` fixture with its research state edited to: current
 * Pendulum Ship at 180.5 points, Spiral Slide, Pizza Slice and Rocket Rounds researched, no focus.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FORMER_RESEARCH_IDS, RESEARCH_ORDER } from '../../../src/data/research';
import { MSG } from '../../../src/data/strings/management';
import { deserialize, serialize, validateState } from '../../../src/save';
import { isUnlocked, researchStatus } from '../../../src/sim/research/api';
import { hourlyResearch } from '../../../src/sim/research/update';
import { researchView } from '../../../src/ui/management/research';
import { TICKS_PER_HOUR } from '../../../src/data/tuning/core';
import type { World } from '../../../src/sim/types';
import { START_ROSTER_IDS } from '../../../src/save/migrations/startRoster';

const FIXTURES = join(__dirname, '../../fixtures');
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

function load(json: string): World {
  const r = deserialize(json);
  if (!r.ok) throw new Error(r.error);
  return r.world;
}

/** Runs `hourlyResearch` at the next `hours` hour starts. */
function runHours(w: World, hours: number): void {
  const start = (Math.floor(w.state.tick / TICKS_PER_HOUR) + 1) * TICKS_PER_HOUR;
  for (let h = 0; h < hours; h++) {
    w.state.tick = start + h * TICKS_PER_HOUR;
    hourlyResearch(w);
  }
}

describe('old saves that name the rides that left research', () => {
  it('the frozen load step names the same four rides as the research data', () => {
    expect([...START_ROSTER_IDS].sort()).toEqual([...FORMER_RESEARCH_IDS].sort());
  });

  it('a save researching Pendulum Ship moves on to the next item and keeps its 180.5 points', () => {
    const w = load(read('save-start-roster.tcsave.json'));
    const r = w.state.management.research;
    // No focus: the first item of the order that is not researched (Pizza Slice is).
    expect(r.current).toBe(RESEARCH_ORDER[0]!.id);
    expect(r.current).toBe('ice_cream_cart');
    expect(r.progress).toBe(180.5);
    expect(researchStatus(w).current).toBe('ice_cream_cart');
    expect(validateState(w.state)).toBeNull();
  });

  it('keeps every researched id (nothing lost), lists each name once, and every former item stays buildable', () => {
    const w = load(read('save-start-roster.tcsave.json'));
    expect(w.state.management.research.unlocked).toEqual(['spiral_slide', 'pizza_slice', 'rocket_rounds']);
    const names = researchView(w).unlocked;
    expect(new Set(names).size).toBe(names.length);
    for (const id of FORMER_RESEARCH_IDS) expect(isUnlocked(w, id), id).toBe(true);
    expect(isUnlocked(w, 'pizza_slice')).toBe(true);
  });

  it('research goes on from there: the carried points count, no former ride is announced again', () => {
    const w = load(read('save-start-roster.tcsave.json'));
    const r = w.state.management.research;
    const before = w.state.management.messages.length;
    // Ice Cream Cart costs 150: the 180.5 carried points unlock it at the first hour.
    runHours(w, 1);
    expect(r.unlocked).toContain('ice_cream_cart');
    expect(r.current).toBe('umbrella_stand');
    runHours(w, 400);
    const fresh = w.state.management.messages.slice(before);
    const unlockedIds = fresh.filter((m) => m.textId === MSG.researchRide || m.textId === MSG.researchStall).map((m) => String(m.params?.itemId));
    for (const id of FORMER_RESEARCH_IDS) expect(unlockedIds, id).not.toContain(id);
    expect(new Set(r.unlocked).size).toBe(r.unlocked.length);
    for (const id of FORMER_RESEARCH_IDS) expect(r.current).not.toBe(id);
  });

  it('the Build 1 brand-new park (researching Spiral Slide at 0) starts on the first item of the new order', () => {
    const w = load(read('save-v1-new.tcsave.json'));
    expect(w.state.management.research.current).toBe('ice_cream_cart');
    expect(w.state.management.research.progress).toBe(0);
  });

  it('a save that only lists a former ride as researched loads as written', () => {
    const w = load(read('save-v2.tcsave.json'));
    expect(w.state.management.research.unlocked).toEqual(['spiral_slide']);
    expect(w.state.management.research.current).toBe('ice_cream_cart');
    expect(w.state.management.research.progress).toBe(129);
  });

  for (const id of ['wooden_coaster', 'log_flume', 'kiddie_cars', 'drop_tower']) {
    it(`a save researching ${id} (a former track, water, Build 3 or thrill item) moves on and keeps its points`, () => {
      const raw = JSON.parse(read('save-start-roster.tcsave.json')) as { state: { management: { research: { current: string; progress: number } } } };
      raw.state.management.research.current = id;
      raw.state.management.research.progress = 42;
      const w = load(JSON.stringify(raw));
      expect(w.state.management.research.current).toBe('ice_cream_cart');
      expect(w.state.management.research.progress).toBe(42);
    });
  }

  it('a focused category picks the next focused item, and the save round-trips', () => {
    const raw = JSON.parse(read('save-start-roster.tcsave.json')) as { state: { management: { research: { focus: Record<string, boolean> } } } };
    raw.state.management.research.focus.thrill = true;
    const w = load(JSON.stringify(raw));
    expect(w.state.management.research.current).toBe('thunder_disc');
    expect(w.state.management.research.progress).toBe(180.5);
    const again = load(serialize(w, 'test', '2026-11-17T00:00:00.000Z'));
    expect(again.state.management.research).toEqual(w.state.management.research);
  });
});
