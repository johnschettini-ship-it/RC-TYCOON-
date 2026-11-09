/** Phase 3 §4.10 Info Kiosk and maps: wrong turns, the lost rule, kiosk detours; a map stops both. */
import { describe, expect, it } from 'vitest';
import { LOST_HAPPY, LOST_STEPS, LOST_WRONG_TURN_FACTOR, WRONG_TURN } from '../../../src/data/tuning/facilities';
import { SALE_TICKS } from '../../../src/data/tuning/guests';
import {
  isGuestLost,
  isJunction,
  isWayLost,
  lostDecision,
  trackProgress,
  wrongTurnAtStep,
} from '../../../src/sim/facilities/wayfinding';
import { THOUGHT } from '../../../src/sim/guests/thoughts';
import { updateGuests } from '../../../src/sim/guests/update';
import type { Guest } from '../../../src/sim/guests/types';
import type { World } from '../../../src/sim/types';
import { addGuestDirect, makeTestWorld } from '../../helpers/world';
import { BRANCH_X, facilityPark, MAIN_Y } from './park';
import { nextAtLeast, nextBelow, nextBetween } from './rng';

function setup(): { w: World; p: ReturnType<typeof facilityPark> } {
  const w = makeTestWorld(4242);
  return { w, p: facilityPark(w) };
}

const ids = (g: Guest): string[] => g.thoughts.map((t) => t.id);

/** Walk the guest to `tile` and record one step there. */
function stepAt(w: World, g: Guest, tile: number): void {
  g.tile = tile;
  trackProgress(w, g);
}

describe('junctions', () => {
  it('have 3 or more walkable neighbours', () => {
    const { w, p } = setup();
    expect(isJunction(w, p.main(BRANCH_X))).toBe(true); // W, E, N
    expect(isJunction(w, p.main(31))).toBe(true); // W, E, S (generator stub)
    expect(isJunction(w, p.main(25))).toBe(false);
    expect(isJunction(w, p.t(BRANCH_X, 55))).toBe(false);
  });
});

describe('wrong turns (§4.10)', () => {
  it('on a junction, a roll below WRONG_TURN takes a random non-best walkable neighbour', () => {
    const { w, p } = setup();
    const far = p.stall('restrooms', 50);
    const g = addGuestDirect(w, p.main(BRANCH_X), { target: `stall:${far.id}` });
    nextBelow(w, WRONG_TURN);
    updateGuests(w);
    expect(g.nextTile).not.toBe(p.main(BRANCH_X + 1));
    expect([p.main(BRANCH_X - 1), p.t(BRANCH_X, MAIN_Y - 1)]).toContain(g.nextTile);
    expect(g.progress).toBe(1);
  });

  it('a roll at or above WRONG_TURN keeps the best step', () => {
    const { w, p } = setup();
    const far = p.stall('restrooms', 50);
    const g = addGuestDirect(w, p.main(BRANCH_X), { target: `stall:${far.id}` });
    nextAtLeast(w, WRONG_TURN);
    updateGuests(w);
    expect(g.nextTile).toBe(p.main(BRANCH_X + 1));
  });

  it('a lost guest uses WRONG_TURN × 2', () => {
    const { w, p } = setup();
    const far = p.stall('restrooms', 50);
    const target = `stall:${far.id}` as const;
    const calm = addGuestDirect(w, p.main(BRANCH_X), { target });
    const lost = addGuestDirect(w, p.main(BRANCH_X), { target, lostTarget: target, lostSteps: LOST_STEPS, bestDistance: 2 });
    for (const g of [calm, lost]) {
      g.nextTile = p.main(BRANCH_X + 1);
      g.progress = 1;
      nextBetween(w, WRONG_TURN, WRONG_TURN * LOST_WRONG_TURN_FACTOR);
      wrongTurnAtStep(w, g);
    }
    expect(calm.nextTile).toBe(p.main(BRANCH_X + 1));
    expect(lost.nextTile).not.toBe(p.main(BRANCH_X + 1));
  });

  it('never with a map, and no RNG draw', () => {
    const { w, p } = setup();
    const far = p.stall('restrooms', 50);
    const g = addGuestDirect(w, p.main(BRANCH_X), { target: `stall:${far.id}`, items: { map: true, umbrella: false, balloon: false } });
    nextBelow(w, 0.001);
    const rng = w.state.rng;
    updateGuests(w);
    expect(g.nextTile).toBe(p.main(BRANCH_X + 1));
    expect(w.state.rng).toBe(rng);
  });

  it('never off a junction or without a target, and no RNG draw', () => {
    const { w, p } = setup();
    const far = p.stall('restrooms', 50);
    const g = addGuestDirect(w, p.main(25), { target: `stall:${far.id}` });
    const rng = w.state.rng;
    updateGuests(w);
    expect(g.nextTile).toBe(p.main(26));
    expect(w.state.rng).toBe(rng);
  });
});

describe('the lost rule (§4.10)', () => {
  it(`a guest whose target distance has not improved for ${LOST_STEPS} steps is lost; lost ends when it improves`, () => {
    const { w, p } = setup();
    const far = p.stall('restrooms', 40);
    const g = addGuestDirect(w, p.main(30), { target: `stall:${far.id}` });
    stepAt(w, g, p.main(30)); // baseline: distance 10
    expect(g.bestDistance).toBe(10);
    for (let k = 1; k < LOST_STEPS; k++) stepAt(w, g, k % 2 ? p.main(29) : p.main(30));
    expect(g.lostSteps).toBe(LOST_STEPS - 1);
    expect(isWayLost(g)).toBe(false);
    stepAt(w, g, p.main(29));
    expect(isWayLost(g)).toBe(true);
    expect(isGuestLost(g)).toBe(true);
    stepAt(w, g, p.main(30)); // 10 again: no better than the best
    expect(isWayLost(g)).toBe(true);
    stepAt(w, g, p.main(31)); // 9: better
    expect(isWayLost(g)).toBe(false);
    expect(g.lostSteps).toBe(0);
    expect(g.bestDistance).toBe(9);
  });

  it('a new target starts a new count', () => {
    const { w, p } = setup();
    const a = p.stall('restrooms', 40);
    const b = p.stall('snack_shack', 10);
    const g = addGuestDirect(w, p.main(30), { target: `stall:${a.id}`, lostTarget: `stall:${a.id}`, bestDistance: 3, lostSteps: 50 });
    g.target = `stall:${b.id}`;
    stepAt(w, g, p.main(30));
    expect(g.lostTarget).toBe(`stall:${b.id}`);
    expect(g.bestDistance).toBe(20);
    expect(g.lostSteps).toBe(0);
  });

  it('a map holder is never lost by this rule', () => {
    const { w, p } = setup();
    const far = p.stall('restrooms', 40);
    const g = addGuestDirect(w, p.main(30), { target: `stall:${far.id}`, items: { map: true, umbrella: false, balloon: false } });
    for (let k = 0; k < LOST_STEPS * 3; k++) stepAt(w, g, k % 2 ? p.main(29) : p.main(30));
    expect(g.lostSteps).toBe(0);
    expect(isWayLost(g)).toBe(false);
    expect(isGuestLost(g)).toBe(false);
  });

  it('a guest that is not walking to a target is not counted', () => {
    const { w, p } = setup();
    const g = addGuestDirect(w, p.main(30), { lostSteps: 12, bestDistance: 4, lostTarget: 'exit' });
    stepAt(w, g, p.main(29));
    expect(g.lostSteps).toBe(0);
    expect(g.lostTarget).toBeNull();
    expect(g.bestDistance).toBe(-1);
  });

  it('the Phase 1 no-route rule still counts as lost', () => {
    const { w, p } = setup();
    const g = addGuestDirect(w, p.main(30), { lostSinceTick: w.state.tick });
    expect(isGuestLost(g)).toBe(true);
  });
});

describe('lost guests at a decision (§4.10)', () => {
  function lostGuest(w: World, p: ReturnType<typeof facilityPark>, x: number, targetX: number): Guest {
    const target = p.stall('restrooms', targetX);
    const dest = `stall:${target.id}` as const;
    return addGuestDirect(w, p.main(x), { target: dest, lostTarget: dest, lostSteps: LOST_STEPS, bestDistance: 1 });
  }

  it('think "I am lost. I need a map" and lose 1 happiness per decision', () => {
    const { w, p } = setup();
    const g = lostGuest(w, p, 30, 50);
    const happy = g.needs.happiness;
    expect(lostDecision(w, g)).toBe(false);
    expect(ids(g)).toContain(THOUGHT.lostNeedMap);
    expect(g.needs.happiness).toBe(happy - LOST_HAPPY);
    lostDecision(w, g);
    expect(g.needs.happiness).toBe(happy - 2 * LOST_HAPPY);
  });

  it('target the nearest Info Kiosk when it is closer than the current target', () => {
    const { w, p } = setup();
    const far = p.stall('info_kiosk', 10); // 20 away
    const near = p.stall('info_kiosk', 34); // 4 away
    const g = lostGuest(w, p, 30, 50); // target 20 away
    lostDecision(w, g);
    expect(g.target).toBe(`stall:${near.id}`);
    expect(far.id).not.toBe(near.id);
  });

  it('keep the current target when the kiosk is not closer', () => {
    const { w, p } = setup();
    p.stall('info_kiosk', 10); // 20 away
    const g = lostGuest(w, p, 30, 40); // target 10 away
    const before = g.target;
    lostDecision(w, g);
    expect(g.target).toBe(before);
  });

  it('a lost guest walks to the kiosk, buys a map, and thinks "This map is a lifesaver"', () => {
    const { w, p } = setup();
    const kiosk = p.stall('info_kiosk', 33);
    const g = lostGuest(w, p, 30, 50);
    for (let k = 0; k < 200 && !g.items.map; k++) updateGuests(w);
    expect(g.items.map).toBe(true);
    expect(kiosk.totals.sales).toBe(1);
    expect(ids(g)).toContain(THOUGHT.lostNeedMap);
    expect(ids(g)).toContain(THOUGHT.mapLifesaver);
    expect(isWayLost(g)).toBe(false);
    expect(g.cash).toBe(8000 - kiosk.price);
    expect(g.stateTicks).toBeLessThanOrEqual(SALE_TICKS);
  });

  it('a guest who is not lost does nothing here', () => {
    const { w, p } = setup();
    p.stall('info_kiosk', 31);
    const target = p.stall('restrooms', 50);
    const g = addGuestDirect(w, p.main(30), { target: `stall:${target.id}` });
    const happy = g.needs.happiness;
    lostDecision(w, g);
    expect(g.target).toBe(`stall:${target.id}`);
    expect(g.needs.happiness).toBe(happy);
    expect(g.thoughts).toEqual([]);
  });
});
