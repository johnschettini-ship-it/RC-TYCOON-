/**
 * Locked preview cards (owner, 2026-11-17): after the unlocked cards, the Rides and Stalls decks show the next items
 * research will unlock, greyed, in research order, at most 6 per deck. A tap opens the Research panel with the item's
 * category in focus and never holds the card for building. The item research is on now shows its progress.
 */
import { describe, expect, it } from 'vitest';
import { getScenarioDef, type ScenarioDef } from '../../../src/data/scenarios';
import { RESEARCH_ORDER } from '../../../src/data/research';
import { contentInfo } from '../../../src/sim/research/api';
import { createScenarioWorld } from '../../../src/sim/scenario/start';
import { defaultToolState } from '../../../src/render/types';
import type { PanelKind, UiContext } from '../../../src/ui/context';
import { LOCKED_CARDS_MAX, handSignature, lockedCardLabel, lockedCards, rideCards, stallCards } from '../../../src/ui/decks/model';
import { pressLockedCard } from '../../../src/ui/decks/toolCards';
import { makeTestWorld } from '../../helpers/world';

const isRide = (id: string): boolean => ['flatRide', 'trackRide'].includes(contentInfo(id)?.kind ?? '');
const isStall = (id: string): boolean => contentInfo(id)?.kind === 'stall';

describe('locked preview cards: which and in what order', () => {
  it('a new park: the Rides deck shows 22 unlocked cards, then the next 6 research rides in research order', () => {
    const w = makeTestWorld();
    expect(rideCards(w)).toHaveLength(22);
    const locked = lockedCards(w, 'rides');
    expect(LOCKED_CARDS_MAX).toBe(6);
    expect(locked.map((c) => c.id)).toEqual(RESEARCH_ORDER.map((r) => r.id).filter(isRide).slice(0, 6));
    expect(locked.map((c) => c.id)).toEqual(['thunder_disc', 'go_karts', 'ghost_train', 'haunted_manor', 'flip_arm', 'rapids_raft']);
    expect(locked.map((c) => c.kind)).toEqual(['flat', 'track', 'track', 'flat', 'flat', 'track']);
    expect(locked.find((c) => c.id === 'thunder_disc')).toMatchObject({ zone: 'thrill', category: 'thrill', name: 'Thunder Disc' });
    // No unlocked card is shown locked too.
    const open = new Set(rideCards(w).map((c) => c.id));
    for (const c of locked) expect(open.has(c.id), c.id).toBe(false);
  });

  it('the Stalls deck shows the next 6 research stalls; Phase 6 stalls come after the Build 1 ones', () => {
    const w = makeTestWorld();
    const locked = lockedCards(w, 'stalls');
    expect(locked.map((c) => c.id)).toEqual(RESEARCH_ORDER.map((r) => r.id).filter(isStall).slice(0, 6));
    expect(locked.every((c) => c.kind === 'stall')).toBe(true);
    const open = new Set(stallCards(w).map((c) => c.id));
    for (const c of locked) expect(open.has(c.id), c.id).toBe(false);
  });

  it('the other decks have no locked cards', () => {
    const w = makeTestWorld();
    for (const deck of ['paths', 'scenery', 'manage'] as const) expect(lockedCards(w, deck)).toEqual([]);
  });

  it('caps at 6 and moves on as research unlocks; researched items leave the locked cards', () => {
    const w = makeTestWorld();
    w.state.management.research.unlocked.push('thunder_disc', 'go_karts');
    const ids = lockedCards(w, 'rides').map((c) => c.id);
    expect(ids).toEqual(['ghost_train', 'haunted_manor', 'flip_arm', 'rapids_raft', 'magic_carpet', 'merry_mill']);
    // The last research rides: fewer than 6 left.
    // (17 research rides with new rides batch B; the first 14 researched leave 3.)
    w.state.management.research.unlocked.push(...RESEARCH_ORDER.map((r) => r.id).filter(isRide).slice(0, 14));
    expect(lockedCards(w, 'rides').map((c) => c.id)).toEqual(['monorail', 'inverted_coaster', 'loop_swing']);
  });

  it('follows the order research will take: the current item first, then the focused categories', () => {
    const w = makeTestWorld();
    const r = w.state.management.research;
    for (const k of Object.keys(r.focus) as (keyof typeof r.focus)[]) r.focus[k] = k === 'coasters';
    r.current = 'ghost_train';
    expect(lockedCards(w, 'rides').map((c) => c.id)).toEqual(['ghost_train', 'bobsled_run', 'inverted_coaster', 'thunder_disc', 'go_karts', 'haunted_manor']);
  });

  it('the item research is on now is marked current with its progress; the others are not', () => {
    const w = makeTestWorld();
    const r = w.state.management.research;
    r.current = 'thunder_disc';
    r.progress = 175;
    const locked = lockedCards(w, 'rides');
    expect(locked[0]).toMatchObject({ id: 'thunder_disc', current: true, percent: 50 });
    for (const c of locked.slice(1)) expect(c.current, c.id).toBe(false);
    // Research is on a stall: no ride card is current.
    r.current = 'ice_cream_cart';
    r.progress = 30;
    expect(lockedCards(w, 'rides').some((c) => c.current)).toBe(false);
    expect(lockedCards(w, 'stalls')[0]).toMatchObject({ id: 'ice_cream_cart', current: true, percent: 20 });
  });

  it('the hand signature changes when the locked cards change (an unlock, a new current item)', () => {
    const w = makeTestWorld();
    const a = handSignature(w);
    w.state.management.research.current = 'flip_arm';
    const b = handSignature(w);
    expect(b).not.toBe(a);
    w.state.management.research.unlocked.push('flip_arm');
    expect(handSignature(w)).not.toBe(b);
  });
});

describe('scenarios and sandbox', () => {
  it('a sandbox with all items unlocked shows no locked cards', () => {
    const w = makeTestWorld();
    // `scenarioContentRule` reads only this option of a sandbox run.
    w.state.scenario = { kind: 'sandbox', options: { allUnlocked: true } } as unknown as typeof w.state.scenario;
    expect(lockedCards(w, 'rides')).toEqual([]);
    expect(lockedCards(w, 'stalls')).toEqual([]);
  });

  it('a scenario that allows no research shows no locked cards', () => {
    const w = createScenarioWorld('meadow_start', 'standard')!;
    const live = getScenarioDef('meadow_start')!;
    const original = live.research;
    (live as { research: ScenarioDef['research'] }).research = { unlocked: [], allowed: [] };
    try {
      expect(lockedCards(w, 'rides')).toEqual([]);
      expect(lockedCards(w, 'stalls')).toEqual([]);
    } finally {
      (live as { research: ScenarioDef['research'] }).research = original;
    }
  });

  it('a scenario that unlocks an item at start does not show it locked', () => {
    const w = createScenarioWorld('spooky_hollow', 'standard')!;
    const ids = lockedCards(w, 'rides').map((c) => c.id);
    expect(ids).not.toContain('haunted_manor');
    expect(ids).not.toContain('ghost_train');
    expect(ids[0]).toBe('thunder_disc');
  });
});

describe('the locked card itself', () => {
  it('its accessible name is "<name>, locked, unlocks with research"', () => {
    expect(lockedCardLabel('Thunder Disc')).toBe('Thunder Disc, locked, unlocks with research');
  });

  /** A context that records the panels it opens and the focus it moves. */
  const setup = () => {
    const opened: PanelKind[] = [];
    const focused: string[] = [];
    const toasts: string[] = [];
    const tool = defaultToolState();
    const ctx = {
      game: { tool },
      activePanel: () => (opened.length ? { kind: opened[opened.length - 1], id: null } : null),
      openPanel: (k: PanelKind) => opened.push(k),
      closePanel: () => undefined,
      toast: (m: string) => toasts.push(m),
      root: {
        querySelector: (sel: string) => ({
          focus: () => focused.push(sel),
          scrollIntoView: () => undefined,
        }),
      },
    } as unknown as UiContext;
    return { ctx, tool, opened, focused, toasts };
  };

  it('a press opens the Research panel with the item category in focus, and never holds the card', () => {
    const { ctx, tool, opened, focused } = setup();
    const before = { ...tool };
    const w = makeTestWorld();
    const spec = lockedCards(w, 'rides').find((c) => c.id === 'go_karts')!;
    pressLockedCard(ctx, spec);
    expect(opened).toEqual(['research']);
    expect(focused).toEqual(['[data-testid="research-focus-thrill"]']);
    expect(tool.tool).toBe(before.tool);
    expect(tool.defId).toBeNull();
    expect(tool).toEqual(before);
  });

  it('a press with the Research panel open keeps it open (no toggle) and still focuses the category', () => {
    const { ctx, opened, focused } = setup();
    opened.push('research');
    const spec = lockedCards(makeTestWorld(), 'stalls')[0]!;
    pressLockedCard(ctx, spec);
    expect(opened).toEqual(['research']);
    expect(focused).toEqual(['[data-testid="research-focus-shops"]']);
  });
});
