/**
 * Title-to-play bridge, part 3 (VITE_ART=real build): "Make the poster real". The goals are pure functions over the
 * sim state (`src/ui/bridge/goals.ts`), worked out live with no save field, so demolishing what a goal counts turns it
 * back off. The poster areas that light are in the cover index (`goals`), checked by the index check; the panel's
 * stored dismissal, its scope (hidden in scenarios with objectives and the tutorial) and its default (collapsed on
 * phones) are plain functions too. The panel's DOM and the thumbnail's pixels are checked in bridge-real.spec.ts.
 */
import { describe, expect, it } from 'vitest';
import COVER from '../../../art-src/title/index.json';
import { executeCommand } from '../../../src/sim/commands';
import { checkCoverIndex, type CoverIndex } from '../../../src/ui/titleScreen/real/layout';
import { CROWD_NEEDED, GOAL_IDS, STALLS_NEEDED, doneCount, goalInScope, goalsDone, goalStartsOpen, isArchScenery, isCoaster, litShapes, readDismissed, storeDismissed, DISMISS_KEY } from '../../../src/ui/bridge/goals';
import { addGuestDirect, makeTestWorld, placeRideDirect, placeStallDirect } from '../../helpers/world';
import type { World } from '../../../src/sim/types';

const none = { wheel: false, coaster: false, stalls: false, arch: false, crowd: false };

function scenery(w: World, defId: string, id = 900): void {
  w.state.scenery.push({ id, defId, x: 30, y: 30, z: 0, rotation: 0, edge: -1, waterLevel: 255 });
}

describe('goalsDone (live from the park)', () => {
  it('an empty park: nothing done, 0 of 5', () => {
    const w = makeTestWorld();
    expect(goalsDone(w.state)).toEqual(none);
    expect(doneCount(goalsDone(w.state))).toBe(0);
    expect(GOAL_IDS).toEqual(['wheel', 'coaster', 'stalls', 'arch', 'crowd']);
  });

  it('big wheel: a big_wheel ride built through the command; demolishing it turns the goal back off', () => {
    const w = makeTestWorld();
    const r = executeCommand(w, { type: 'placeRide', defId: 'big_wheel', x: 26, y: 40, rotation: 0 });
    expect(r.ok).toBe(true);
    expect(goalsDone(w.state)).toEqual({ ...none, wheel: true });
    expect(doneCount(goalsDone(w.state))).toBe(1);
    const ride = w.state.rides.find((x) => x.defId === 'big_wheel');
    expect(ride).toBeDefined();
    const d = executeCommand(w, { type: 'demolish', x: ride?.x ?? 0, y: ride?.y ?? 0 });
    expect(d.ok).toBe(true);
    expect(goalsDone(w.state).wheel).toBe(false);
    // Another flat ride is not the wheel.
    placeRideDirect(w, 'carousel', 10, 10);
    expect(goalsDone(w.state).wheel).toBe(false);
  });

  it('coaster: a finished track ride whose catalogue type is a coaster (gravity drive); not a railway, not a station alone', () => {
    expect(['steel_coaster', 'junior_coaster', 'wooden_coaster', 'spinning_mouse', 'inverted_coaster', 'bobsled_run'].every(isCoaster)).toBe(true);
    expect(['mini_railway', 'ghost_train', 'go_karts', 'log_flume', 'monorail', 'big_wheel', 'nope'].some(isCoaster)).toBe(false);
    const w = makeTestWorld();
    const track = (defId: string, status: 'building' | 'testing' | 'closed' | 'open'): void => {
      const r = placeRideDirect(w, 'carousel', 12 + w.state.rides.length * 6, 20);
      Object.assign(r, { kind: 'track', defId, status });
    };
    track('mini_railway', 'open');
    expect(goalsDone(w.state).coaster).toBe(false);
    track('steel_coaster', 'building');
    expect(goalsDone(w.state).coaster).toBe(false);
    const last = w.state.rides[w.state.rides.length - 1];
    if (last) last.status = 'testing';
    expect(goalsDone(w.state).coaster).toBe(true);
    w.state.rides.pop();
    expect(goalsDone(w.state).coaster).toBe(false);
  });

  it('striped stalls: 3 or more stalls; one fewer turns it off', () => {
    const w = makeTestWorld();
    expect(STALLS_NEEDED).toBe(3);
    placeStallDirect(w, 'snack_shack', 10, 10);
    placeStallDirect(w, 'fizz_stand', 14, 10);
    expect(goalsDone(w.state).stalls).toBe(false);
    placeStallDirect(w, 'info_kiosk', 18, 10);
    expect(goalsDone(w.state).stalls).toBe(true);
    w.state.stalls.pop();
    expect(goalsDone(w.state).stalls).toBe(false);
  });

  it('gate arch: a ticket_arch or any scenery whose id ends in _arch', () => {
    expect(isArchScenery('ticket_arch')).toBe(true);
    expect(isArchScenery('neon_arch')).toBe(true);
    expect(isArchScenery('ice_arch')).toBe(true);
    expect(isArchScenery('archway_tree')).toBe(false);
    expect(isArchScenery('arch')).toBe(false);
    expect(isArchScenery('ticket_arch_sign')).toBe(false);
    const w = makeTestWorld();
    scenery(w, 'oak_tree', 1);
    expect(goalsDone(w.state).arch).toBe(false);
    scenery(w, 'ruin_arch', 2);
    expect(goalsDone(w.state).arch).toBe(true);
    w.state.scenery.pop();
    expect(goalsDone(w.state).arch).toBe(false);
  });

  it('happy crowd: 200 or more guests in the park', () => {
    expect(CROWD_NEEDED).toBe(200);
    const w = makeTestWorld();
    for (let i = 0; i < 199; i++) addGuestDirect(w, 0);
    expect(goalsDone(w.state).crowd).toBe(false);
    addGuestDirect(w, 0);
    expect(goalsDone(w.state).crowd).toBe(true);
    w.state.guests.pop();
    expect(goalsDone(w.state).crowd).toBe(false);
  });
});

describe('the panel’s rules', () => {
  it('scope: sandbox and free play; hidden in scenarios with objectives and in the tutorial', () => {
    expect(goalInScope('freePlay')).toBe(true);
    expect(goalInScope('sandbox')).toBe(true);
    expect(goalInScope('scenario')).toBe(false);
    expect(goalInScope('tutorial')).toBe(false);
  });
  it('open on desktop, a collapsed chip on phones', () => {
    expect(goalStartsOpen('side')).toBe(true);
    expect(goalStartsOpen('bottom')).toBe(false);
  });
  it('dismissal is stored once complete, under its own key (tcreal: in the realistic build), and a broken store is harmless', () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(readDismissed(store)).toBe(false);
    storeDismissed(store);
    expect(m.get(DISMISS_KEY)).toBe('dismissed');
    expect(readDismissed(store)).toBe(true);
    const broken = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } };
    expect(readDismissed(broken)).toBe(false);
    expect(() => storeDismissed(broken)).not.toThrow();
    expect(readDismissed(null)).toBe(false);
  });
  it('litShapes: the shapes of the done goals only, in poster px', () => {
    const idx = checkCoverIndex(COVER) as CoverIndex;
    expect(litShapes(idx, none)).toEqual([]);
    const wheel = litShapes(idx, { ...none, wheel: true });
    expect(wheel).toEqual([{ ellipse: idx.goals?.wheel.ellipse }]);
    expect(litShapes(idx, { ...none, stalls: true, arch: true }).length).toBe(5);
  });
});

describe('poster goal areas in the cover index', () => {
  it('the cover index has an area for each goal, inside the wide file', () => {
    const idx = checkCoverIndex(COVER);
    expect(idx).not.toBeInstanceOf(Error);
    const g = (idx as CoverIndex).goals;
    expect(Object.keys(g ?? {}).sort()).toEqual([...GOAL_IDS].sort());
    // The wheel is an ellipse round the drawn wheel; the stalls light at both sides.
    expect(g?.wheel.ellipse).toBeDefined();
    const stalls = g?.stalls.rect;
    expect(Array.isArray(stalls) && stalls.length).toBe(2);
  });
  it('refuses a missing goal, a goal with no shape and a shape outside the file', () => {
    const base = structuredClone(COVER) as unknown as CoverIndex & { goals: Record<string, unknown> };
    const { crowd: _c, ...missing } = base.goals;
    void _c;
    expect(checkCoverIndex({ ...base, goals: missing })).toBeInstanceOf(Error);
    expect(checkCoverIndex({ ...base, goals: { ...base.goals, crowd: {} } })).toBeInstanceOf(Error);
    expect(checkCoverIndex({ ...base, goals: { ...base.goals, crowd: { rect: { x: 1300, y: 700, w: 200, h: 200 } } } })).toBeInstanceOf(Error);
    expect(checkCoverIndex({ ...base, goals: { ...base.goals, wheel: { ellipse: { cx: 10, cy: 10, rx: 50, ry: 5 } } } })).toBeInstanceOf(Error);
  });
});
