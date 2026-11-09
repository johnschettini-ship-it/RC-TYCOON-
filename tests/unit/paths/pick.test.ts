/** Picking elevated decks on screen (Phase 4 §4.2, §7): the deck drawn under a point, in all 4 view rotations. */
import { describe, expect, it } from 'vitest';
import { pickElevatedPath } from '../../../src/render/elevated/pick';
import { mapToView, type ViewRotation } from '../../../src/render/view';
import { executeCommand } from '../../../src/sim/commands';
import { tileIndex } from '../../../src/sim/map';
import type { ElevatedPath } from '../../../src/sim/paths/types';
import type { World } from '../../../src/sim/types';
import { makeTestWorld } from '../../helpers/world';

function decks(): { w: World; ground: number } {
  const w = makeTestWorld();
  const ground = w.state.map.heights[tileIndex(w.state.map, 20, 20)] as number;
  // A flat deck line 4 steps up, and a ramp rising east from 1 step up.
  expect(executeCommand(w, { type: 'buildPathLine', x0: 20, y0: 20, x1: 22, y1: 20, kind: 'footpath', z: ground + 4 }).ok).toBe(true);
  expect(executeCommand(w, { type: 'buildPathLine', x0: 20, y0: 26, x1: 23, y1: 26, kind: 'queue', z: ground + 1, ramp: 'up' }).ok).toBe(true);
  return { w, ground };
}

/** World-pixel centre of the deck surface of `p` at view rotation `r`. */
function centre(w: World, p: ElevatedPath, r: ViewRotation): { x: number; y: number } {
  const { u, v } = mapToView(p.x, p.y, r, w.state.map.width, w.state.map.height);
  return { x: (u - v) * 32, y: (u + v + 1) * 16 - (p.z + (p.rampDir >= 0 ? 0.5 : 0)) * 8 };
}

describe('pickElevatedPath', () => {
  it('the centre of every deck picks that deck, in every view rotation', () => {
    const { w } = decks();
    for (const r of [0, 1, 2, 3] as const) {
      for (const p of w.state.elevatedPaths) {
        const c = centre(w, p, r);
        expect(pickElevatedPath(w, c.x, c.y, r)?.id, `deck ${p.x},${p.y} r ${r}`).toBe(p.id);
      }
    }
  });

  it('ground away from the decks picks nothing', () => {
    const { w, ground } = decks();
    const { u, v } = mapToView(40, 40, 0, w.state.map.width, w.state.map.height);
    expect(pickElevatedPath(w, (u - v) * 32, (u + v + 1) * 16 - ground * 8, 0)).toBeNull();
    expect(pickElevatedPath(makeTestWorld(), 0, 0, 0)).toBeNull();
  });

  it('where decks overlap on screen, the front one wins, then the higher one', () => {
    const { w, ground } = decks();
    // (21, 21) is one view diagonal in front of (20, 20) (32 px lower on screen); 4 steps higher (32 px up) its deck
    // centre is drawn exactly over the back deck's centre.
    expect(executeCommand(w, { type: 'buildPathLine', x0: 21, y0: 21, x1: 21, y1: 21, kind: 'footpath', z: ground + 8 }).ok).toBe(true);
    const back = w.state.elevatedPaths.find((p) => p.x === 20 && p.y === 20)!;
    const front = w.state.elevatedPaths.find((p) => p.x === 21 && p.y === 21)!;
    const c = centre(w, back, 0);
    expect(centre(w, front, 0)).toEqual(c);
    expect(pickElevatedPath(w, c.x, c.y, 0)?.id).toBe(front.id);
  });
});
