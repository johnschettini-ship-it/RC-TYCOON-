/**
 * Tutorial (Phase 5 §4.11, §6): the start map, the 16 steps with their guides and checks, the 3 commands, sim checks
 * after commands and every hour, and a scripted run through all 16 steps.
 */
import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR } from '../../../src/data/tuning/core';
import { text } from '../../../src/data/strings/en';
import { validateState } from '../../../src/save';
import { executeCommand, type Command } from '../../../src/sim/commands';
import { drainEvents } from '../../../src/sim/events';
import { Content, Owned, tileIndex } from '../../../src/sim/map';
import { createTutorialWorld, TUTORIAL_CASH } from '../../../src/sim/tutorial/start';
import { footpathTilesFromEntrance, TUTORIAL_STEPS, type TutorialStepId } from '../../../src/sim/tutorial/steps';
import type { TutorialRun } from '../../../src/sim/tutorial/types';
import type { World } from '../../../src/sim/types';
import type { EntityId } from '../../../src/sim/units';
import { addGuestDirect, makeTestWorld, runTicks } from '../../helpers/world';
import { JUNIOR_COASTER, line, must } from '../../integration/scenario';
import { EAST } from '../track/helpers';

const run = (w: World): TutorialRun => {
  if (w.state.scenario.kind !== 'tutorial') throw new Error('tutorial expected');
  return w.state.scenario;
};
const stepId = (w: World): TutorialStepId | undefined => TUTORIAL_STEPS[run(w).stepIndex]?.id;
const stepEvents = (w: World): Array<{ stepIndex: number; done: boolean }> =>
  drainEvents(w).flatMap((e) => (e.type === 'tutorialStep' ? [{ stepIndex: e.stepIndex, done: e.done }] : []));

/** Run ticks until the next hour start has been processed. */
function toNextHour(w: World): void {
  const t = w.state.tick;
  runTicks(w, TICKS_PER_HOUR - (t % TICKS_PER_HOUR) + 1);
}

describe('createTutorialWorld (Phase 5 §4.11)', () => {
  it('48 × 48 flat meadow, owned inside the fence, $30,000, After Dark off, tick 450, step 1', () => {
    const w = createTutorialWorld(5, 'Tutorial Park');
    const s = w.state;
    expect(s.map.width).toBe(48);
    expect(s.map.height).toBe(48);
    expect(s.park.cash).toBe(TUTORIAL_CASH);
    expect(s.park.afterDark).toBe(false);
    expect(s.tick).toBe(450);
    expect(s.scenario).toEqual({ kind: 'tutorial', stepIndex: 0, skipped: false, done: false });
    expect(new Set(s.map.heights)).toEqual(new Set([8]));
    expect(s.map.owned[tileIndex(s.map, 1, 1)]).toBe(Owned.Owned);
    expect(s.map.owned[tileIndex(s.map, 46, 46)]).toBe(Owned.Owned);
    expect(validateState(s)).toBeNull();
  });

  it('the entrance sits in the middle of the south edge with a 3-tile stub', () => {
    const s = createTutorialWorld(5, 'Tutorial Park').state;
    const map = s.map;
    expect(map.entranceTile).toBe(tileIndex(map, 24, 47));
    expect(map.content[map.entranceTile]).toBe(Content.ParkEntrance);
    for (const y of [44, 45, 46]) expect(map.content[tileIndex(map, 24, y)]).toBe(Content.Footpath);
    expect(map.content[tileIndex(map, 31, 47)]).toBe(Content.Empty);
    expect(map.content[tileIndex(map, 31, 46)]).toBe(Content.Empty);
    expect(map.owned[tileIndex(map, 31, 47)]).toBe(Owned.NotOwned);
  });
});

describe('the 16 steps', () => {
  it('follow the spec table: guides and check kinds', () => {
    expect(TUTORIAL_STEPS.map((s) => `${s.guide}:${s.check}`)).toEqual([
      'both:ui',
      'frost:ui',
      'frost:ui',
      'spark:sim',
      'frost:sim',
      'frost:sim',
      'spark:sim',
      'frost:sim',
      'spark:sim',
      'both:ui',
      'spark:sim',
      'frost:sim',
      'spark:sim',
      'frost:sim',
      'both:ui',
      'both:sim',
    ]);
  });

  it('every step has a title and a hint in the string table, with no final period (R4)', () => {
    for (const s of TUTORIAL_STEPS) {
      const title = text(`prog.tutorial.step.${s.id}`);
      expect(title).not.toBe(`prog.tutorial.step.${s.id}`);
      expect(title.endsWith('.')).toBe(false);
    }
    expect(text('prog.tutorial.step.welcome')).toBe('Welcome to Thrills & Chills');
    expect(text('prog.tutorial.step.inspectGuest')).toBe('Inspect a guest. Meet Thrill and Chill guests');
    expect(text('prog.tutorial.step.guests100')).toBe('Reach 100 guests');
  });
});

describe('tutorial commands', () => {
  it('tutorialAdvance finishes the current ui step by id and emits tutorialStep', () => {
    const w = createTutorialWorld(1, 'T');
    expect(executeCommand(w, { type: 'tutorialAdvance', stepId: 'moveView' })).toEqual({ ok: false, reason: text('prog.tutorial.wrongStep') });
    expect(executeCommand(w, { type: 'tutorialAdvance', stepId: 'welcome' }).ok).toBe(true);
    expect(stepId(w)).toBe('moveView');
    expect(stepEvents(w)).toEqual([{ stepIndex: 1, done: false }]);
  });

  it('tutorialAdvance fails on a sim step', () => {
    const w = createTutorialWorld(1, 'T');
    run(w).stepIndex = 3;
    expect(executeCommand(w, { type: 'tutorialAdvance', stepId: 'footpath' }).ok).toBe(false);
    expect(run(w).stepIndex).toBe(3);
  });

  it('tutorialSkipStep marks the current step done, ui or sim', () => {
    const w = createTutorialWorld(1, 'T');
    run(w).stepIndex = 4;
    expect(executeCommand(w, { type: 'tutorialSkipStep' }).ok).toBe(true);
    expect(stepId(w)).toBe('connectCarousel');
    expect(executeCommand(w, { type: 'tutorialSkipStep' }).ok).toBe(true);
    expect(stepId(w)).toBe('openRide');
  });

  it('tutorialSkipAll ends the tutorial; the park plays on and later commands fail', () => {
    const w = createTutorialWorld(1, 'T');
    expect(executeCommand(w, { type: 'tutorialSkipAll' }).ok).toBe(true);
    expect(run(w)).toMatchObject({ skipped: true, done: false, stepIndex: 0 });
    for (const cmd of [{ type: 'tutorialSkipStep' }, { type: 'tutorialSkipAll' }, { type: 'tutorialAdvance', stepId: 'welcome' }] as Command[]) {
      expect(executeCommand(w, cmd)).toEqual({ ok: false, reason: text('prog.tutorial.notRunning') });
    }
    // Free play goes on: building still works and the sim checks stay quiet.
    run(w).stepIndex = 3;
    must(w, { type: 'buildPathLine', x0: 20, y0: 43, x1: 30, y1: 43, kind: 'footpath' });
    expect(run(w).stepIndex).toBe(3);
    runTicks(w, 200);
    expect(validateState(w.state)).toBeNull();
  });

  it('every tutorial command fails outside a tutorial and changes nothing', () => {
    const w = makeTestWorld();
    for (const cmd of [{ type: 'tutorialSkipStep' }, { type: 'tutorialSkipAll' }, { type: 'tutorialAdvance', stepId: 'welcome' }] as Command[]) {
      expect(executeCommand(w, cmd)).toEqual({ ok: false, reason: text('prog.tutorial.notRunning') });
    }
    expect(w.state.scenario.kind).toBe('freePlay');
  });

  it('skipping step 16 finishes the tutorial', () => {
    const w = createTutorialWorld(1, 'T');
    run(w).stepIndex = 15;
    must(w, { type: 'tutorialSkipStep' });
    expect(run(w)).toMatchObject({ stepIndex: 16, done: true });
    expect(stepEvents(w)).toEqual([{ stepIndex: 16, done: true }]);
  });
});

describe('sim checks', () => {
  it('step 4 needs 6 footpath tiles joined to the entrance (the stub counts)', () => {
    const w = createTutorialWorld(1, 'T');
    run(w).stepIndex = 3;
    expect(footpathTilesFromEntrance(w)).toBe(3);
    must(w, { type: 'buildPathLine', x0: 24, y0: 43, x1: 24, y1: 42, kind: 'footpath' });
    expect(footpathTilesFromEntrance(w)).toBe(5);
    expect(stepId(w)).toBe('footpath');
    // A loose path tile does not count.
    must(w, { type: 'buildPath', x: 10, y: 10, kind: 'footpath' });
    expect(stepId(w)).toBe('footpath');
    must(w, { type: 'buildPath', x: 24, y: 41, kind: 'footpath' });
    expect(stepId(w)).toBe('carousel');
  });

  it('step 8 needs each stall reachable from the entrance', () => {
    const w = createTutorialWorld(1, 'T');
    run(w).stepIndex = 7;
    line(w, 20, 43, 28, 43);
    must(w, { type: 'placeStall', defId: 'snack_shack', x: 20, y: 44, rotation: 0 });
    must(w, { type: 'placeStall', defId: 'fizz_stand', x: 22, y: 44, rotation: 0 });
    // Restrooms facing a path that is not joined to the entrance.
    line(w, 5, 10, 8, 10);
    must(w, { type: 'placeStall', defId: 'restrooms', x: 6, y: 11, rotation: 0 });
    expect(stepId(w)).toBe('stalls');
    must(w, { type: 'placeStall', defId: 'restrooms', x: 27, y: 44, rotation: 0 });
    expect(stepId(w)).toBe('openPark');
  });

  it('step 12 passes on a price command or any changed price', () => {
    const w = createTutorialWorld(1, 'T');
    run(w).stepIndex = 11;
    must(w, { type: 'buildPath', x: 24, y: 43, kind: 'footpath' });
    expect(stepId(w)).toBe('changePrice');
    must(w, { type: 'setEntranceFee', fee: w.state.park.entranceFee });
    expect(stepId(w)).toBe('juniorCoaster');
    // A price changed earlier passes the step at once (hour check).
    const w2 = createTutorialWorld(1, 'T');
    w2.state.park.entranceFee += 100;
    run(w2).stepIndex = 11;
    toNextHour(w2);
    expect(stepId(w2)).toBe('juniorCoaster');
  });

  it('steps that are already met chain on after a ui advance', () => {
    const w = createTutorialWorld(1, 'T');
    run(w).stepIndex = 2;
    line(w, 24, 43, 24, 40);
    expect(stepId(w)).toBe('zoom');
    must(w, { type: 'tutorialAdvance', stepId: 'zoom' });
    expect(stepId(w)).toBe('carousel');
    expect(stepEvents(w)).toEqual([
      { stepIndex: 3, done: false },
      { stepIndex: 4, done: false },
    ]);
  });

  it('step 16 completes at an hour start without any command', () => {
    const w = createTutorialWorld(1, 'T');
    run(w).stepIndex = 15;
    const tile = tileIndex(w.state.map, 24, 46);
    for (let i = 0; i < 100; i++) addGuestDirect(w, tile);
    expect(stepId(w)).toBe('guests100');
    toNextHour(w);
    expect(run(w)).toMatchObject({ stepIndex: 16, done: true });
  });
});

describe('scripted tutorial: all 16 steps', () => {
  it('finishes every step through commands, ui advances, and hour checks', () => {
    const w = createTutorialWorld(42, 'Tutorial Park');
    const seen: number[] = [];
    const take = (): void => {
      for (const e of stepEvents(w)) seen.push(e.stepIndex);
    };
    // 1–3: Next, camera, zoom (ui).
    for (const id of ['welcome', 'moveView', 'zoom']) must(w, { type: 'tutorialAdvance', stepId: id });
    expect(stepId(w)).toBe('footpath');
    // 4: a footpath loop joined to the entrance stub (x 17–31, y 32–43).
    line(w, 17, 43, 31, 43);
    expect(stepId(w)).toBe('carousel');
    line(w, 17, 32, 31, 32);
    line(w, 17, 33, 17, 42);
    line(w, 31, 33, 31, 42);
    // 5–7: Carousel inside the loop, queue down to the south row, exit spur up to the north row, open.
    const carousel = must(w, { type: 'placeRide', defId: 'carousel', x: 19, y: 36, rotation: 0 }).id as EntityId;
    expect(stepId(w)).toBe('connectCarousel');
    line(w, 20, 39, 20, 42, 'queue');
    line(w, 20, 33, 20, 35);
    expect(stepId(w)).toBe('openRide');
    must(w, { type: 'setRideOpen', rideId: carousel, open: true });
    expect(stepId(w)).toBe('stalls');
    // 8: three stalls south of the loop, facing it.
    must(w, { type: 'placeStall', defId: 'snack_shack', x: 18, y: 44, rotation: 0 });
    must(w, { type: 'placeStall', defId: 'fizz_stand', x: 21, y: 44, rotation: 0 });
    must(w, { type: 'placeStall', defId: 'restrooms', x: 27, y: 44, rotation: 0 });
    expect(stepId(w)).toBe('openPark');
    // 9–10: open the park; the guest panel (ui).
    must(w, { type: 'setParkOpen', open: true });
    expect(stepId(w)).toBe('inspectGuest');
    must(w, { type: 'tutorialAdvance', stepId: 'inspectGuest' });
    // 11: Swing Tower, connected and open.
    const swing = must(w, { type: 'placeRide', defId: 'swing_tower', x: 27, y: 36, rotation: 0 }).id as EntityId;
    line(w, 28, 39, 28, 42, 'queue');
    line(w, 28, 33, 28, 35);
    expect(stepId(w)).toBe('swingTower');
    must(w, { type: 'setRideOpen', rideId: swing, open: true });
    expect(stepId(w)).toBe('changePrice');
    // 12: a price.
    must(w, { type: 'setRidePrice', rideId: carousel, price: 250 });
    expect(stepId(w)).toBe('juniorCoaster');
    // 13: Junior Coaster (station at (14, 8) heading east), gated on the north side, joined to the loop, tested.
    const sx = 14;
    const sy = 8;
    line(w, sx + 1, sy - 2, 33, sy - 2);
    line(w, 33, sy - 1, 33, 32);
    line(w, 32, 32, 32, 32);
    line(w, sx, sy - 2, sx, sy - 2, 'queue');
    const coaster = must(w, { type: 'placeStation', typeId: 'junior_coaster', x: sx, y: sy, dir: EAST }).id as EntityId;
    for (const spec of JUNIOR_COASTER) {
      const p = typeof spec === 'string' ? { id: spec } : spec;
      must(w, { type: 'addTrackPiece', rideId: coaster, defId: p.id, chain: p.chain, brakeSpeed: p.brakeSpeed });
    }
    must(w, { type: 'placeTrackGate', rideId: coaster, kind: 'entrance', x: sx, y: sy - 1 });
    must(w, { type: 'placeTrackGate', rideId: coaster, kind: 'exit', x: sx + 1, y: sy - 1 });
    must(w, { type: 'startTestRun', rideId: coaster });
    expect(stepId(w)).toBe('juniorCoaster');
    runTicks(w, (w.state.track.rides[String(coaster)]?.testRun?.ticksLeft ?? 0) + 1);
    toNextHour(w);
    expect(w.state.track.rides[String(coaster)]?.test).not.toBeNull();
    expect(stepId(w)).toBe('groundskeeper');
    // 14–15: a Groundskeeper; the finance panel (ui).
    must(w, { type: 'hireStaff', staffType: 'groundskeeper' });
    expect(stepId(w)).toBe('financePanel');
    must(w, { type: 'tutorialAdvance', stepId: 'financePanel' });
    expect(stepId(w)).toBe('guests100');
    take();
    // 16: guests arrive by themselves; top up so the test does not wait for 100 arrivals.
    runTicks(w, 600);
    const tile = tileIndex(w.state.map, 24, 45);
    while (w.state.guests.length < 100) addGuestDirect(w, tile);
    toNextHour(w);
    take();
    expect(run(w)).toEqual({ kind: 'tutorial', stepIndex: 16, skipped: false, done: true });
    expect(seen).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    expect(validateState(w.state)).toBeNull();
    // Finished: further tutorial commands fail.
    expect(executeCommand(w, { type: 'tutorialSkipStep' }).ok).toBe(false);
  });
});
