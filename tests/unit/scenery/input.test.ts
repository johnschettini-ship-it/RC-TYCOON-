/**
 * Scenery tool input (Phase 4 §7): the ghost follows hover (mouse) or tap (touch); click places, Shift-click and
 * Repeat keep the tool; touch places with Confirm; rotation in view terms becomes the map rotation; edge items take
 * the edge from the rotation; remove mode refunds 50%.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../../../src/game';
import { sceneryGhostOf } from '../../../src/render/scenery/ghost';
import { mapToView } from '../../../src/render/view';
import { InputController } from '../../../src/input/controller';
import {
  chooseSceneryItem,
  confirmScenery,
  noteShift,
  rotateScenery,
  sceneryInput,
  sceneryOrigin,
  sceneryRouter,
  setSceneryRemoveMode,
} from '../../../src/input/scenery';
import type { GestureAction } from '../../../src/input/gestures';
import { Content, tileIndex, type Dir } from '../../../src/sim/map';
import { edgeBlocked } from '../../../src/sim/scenery/api';
import { sceneryWorld } from './helpers';

/** A game with a fake picker: screen point (x, y) is tile (x, y). */
function setup(): { game: Game; at: (x: number, y: number) => number | null } {
  const game = new Game(sceneryWorld());
  const map = game.world.state.map;
  const at = (x: number, y: number): number | null => (x >= 0 && y >= 0 && x < map.width && y < map.height ? tileIndex(map, x, y) : null);
  return { game, at };
}

function gesture(game: Game, at: (x: number, y: number) => number | null, a: GestureAction): boolean {
  return sceneryRouter.gesture!(game, a, at);
}

describe('sceneryOrigin', () => {
  it('puts the footprint\'s view-origin tile on the anchor in every view rotation', () => {
    const map = { width: 64, height: 48 };
    for (const r of [0, 1, 2, 3] as Dir[]) {
      for (const rot of [0, 1, 2, 3] as Dir[]) {
        for (const [w, d] of [[1, 1], [2, 2], [2, 1]] as const) {
          const anchor = tileIndex(map, 20, 15);
          const o = sceneryOrigin(map, anchor, w, d, rot, r);
          const mx = rot % 2 ? d : w;
          const my = rot % 2 ? w : d;
          let u = Infinity;
          let v = Infinity;
          for (let dy = 0; dy < my; dy++) {
            for (let dx = 0; dx < mx; dx++) {
              const p = mapToView(o.x + dx, o.y + dy, r, map.width, map.height);
              u = Math.min(u, p.u);
              v = Math.min(v, p.v);
            }
          }
          expect([u, v]).toEqual(Object.values(mapToView(20, 15, r, map.width, map.height)));
        }
      }
    }
  });
});

describe('mouse', () => {
  it('hover shows a green ghost; a red one carries the command reason', () => {
    const { game, at } = setup();
    chooseSceneryItem(game, 'oak_round');
    expect(game.tool.tool).toBe('scenery');
    expect(gesture(game, at, { type: 'hover', x: 10, y: 10 })).toBe(true);
    expect(sceneryGhostOf(game.tool)).toMatchObject({ mode: 'place', defId: 'oak_round', x: 10, y: 10, valid: true, reason: null, cost: 4_000 });
    gesture(game, at, { type: 'hover', x: 0, y: 10 });
    expect(sceneryGhostOf(game.tool)).toMatchObject({ valid: false, reason: 'Outside the park' });
  });

  it('a click places; without Repeat or Shift the tool ends; Shift-click and Repeat keep it', () => {
    const { game, at } = setup();
    chooseSceneryItem(game, 'boulder');
    gesture(game, at, { type: 'tap', x: 12, y: 12, pointerType: 'mouse' });
    expect(game.world.state.scenery).toHaveLength(1);
    expect(game.tool.tool).toBe('inspect');

    chooseSceneryItem(game, 'boulder');
    noteShift(game.tool, true);
    gesture(game, at, { type: 'tap', x: 14, y: 12, pointerType: 'mouse' });
    expect(game.tool.tool).toBe('scenery');
    noteShift(game.tool, false);
    game.tool.scenery.repeat = true;
    gesture(game, at, { type: 'tap', x: 16, y: 12, pointerType: 'mouse' });
    expect(game.tool.tool).toBe('scenery');
    expect(game.world.state.scenery.map((s) => s.x)).toEqual([12, 14, 16]);
  });

  it('a click on a bad tile sends the command and keeps the tool (the toast shows the reason)', () => {
    const { game, at } = setup();
    chooseSceneryItem(game, 'oak_round');
    gesture(game, at, { type: 'tap', x: 0, y: 0, pointerType: 'mouse' });
    expect(game.world.state.scenery).toEqual([]);
    expect(game.tool.tool).toBe('scenery');
  });

  it('Enter confirms', () => {
    const { game, at } = setup();
    chooseSceneryItem(game, 'shrub_round');
    gesture(game, at, { type: 'hover', x: 9, y: 9 });
    expect(sceneryRouter.keyDown!(game, 'Enter')).toBe(true);
    expect(game.world.state.scenery).toHaveLength(1);
    expect(sceneryRouter.keyDown!(game, 'x')).toBe(false);
  });
});

describe('touch', () => {
  it('a tap moves the ghost; Confirm places; Repeat keeps the tool', () => {
    const { game, at } = setup();
    chooseSceneryItem(game, 'statue_frost');
    game.tool.scenery.repeat = true;
    gesture(game, at, { type: 'tap', x: 20, y: 20, pointerType: 'touch' });
    expect(game.world.state.scenery).toEqual([]);
    expect(sceneryGhostOf(game.tool)).toMatchObject({ x: 20, y: 20, valid: true });
    expect(sceneryInput(game.tool).pointer).toBe('touch');
    const r = confirmScenery(game);
    expect(r?.ok).toBe(true);
    expect(game.world.state.scenery).toHaveLength(1);
    expect(game.tool.tool).toBe('scenery');
  });

  it('before any tap there is no ghost and Confirm does nothing', () => {
    const { game } = setup();
    sceneryInput(game.tool).pointer = 'touch';
    chooseSceneryItem(game, 'oak_round');
    sceneryRouter.enter!(game);
    expect(sceneryGhostOf(game.tool)).toBeNull();
    expect(confirmScenery(game)).toBeNull();
  });
});

describe('rotation', () => {
  it('the view-terms rotation becomes the map rotation: (viewRotation − r) mod 4', () => {
    const { game, at } = setup();
    game.camera.rotation = 1;
    chooseSceneryItem(game, 'statue_robot');
    game.tool.scenery.repeat = true;
    gesture(game, at, { type: 'tap', x: 20, y: 20, pointerType: 'mouse' });
    expect(game.world.state.scenery[0]?.rotation).toBe(3);
    rotateScenery(game);
    expect(game.tool.rotation).toBe(1);
    gesture(game, at, { type: 'tap', x: 22, y: 20, pointerType: 'mouse' });
    expect(game.world.state.scenery[1]?.rotation).toBe(0);
  });

  it('edge items take their edge from the rotation', () => {
    const { game, at } = setup();
    const map = game.world.state.map;
    map.content[tileIndex(map, 20, 20)] = Content.Footpath;
    chooseSceneryItem(game, 'hedge_low');
    game.tool.scenery.repeat = true;
    rotateScenery(game);
    gesture(game, at, { type: 'tap', x: 20, y: 20, pointerType: 'mouse' });
    expect(game.world.state.scenery[0]).toMatchObject({ edge: 1, x: 20, y: 20 });
    expect(game.tool.scenery.edge).toBe(1);
    expect(edgeBlocked(game.world, tileIndex(map, 21, 20), 3)).toBe(true);
  });
});

describe('remove mode', () => {
  it('removes the centre item first, then edge items, for the 50% refund', () => {
    const { game, at } = setup();
    const w = game.world;
    chooseSceneryItem(game, 'hedge_low');
    game.tool.scenery.repeat = true;
    gesture(game, at, { type: 'tap', x: 10, y: 10, pointerType: 'mouse' });
    chooseSceneryItem(game, 'bed_tulip');
    game.tool.scenery.repeat = true;
    gesture(game, at, { type: 'tap', x: 10, y: 10, pointerType: 'mouse' });
    expect(w.state.scenery.map((s) => s.defId)).toEqual(['hedge_low', 'bed_tulip']);
    setSceneryRemoveMode(game, true);
    gesture(game, at, { type: 'hover', x: 10, y: 10 });
    expect(sceneryGhostOf(game.tool)).toMatchObject({ mode: 'remove', defId: 'bed_tulip', cost: 1_250 });
    const cash = w.state.park.cash;
    gesture(game, at, { type: 'tap', x: 10, y: 10, pointerType: 'mouse' });
    expect(w.state.park.cash).toBe(cash + 1_250);
    gesture(game, at, { type: 'tap', x: 10, y: 10, pointerType: 'mouse' });
    expect(w.state.scenery).toEqual([]);
    gesture(game, at, { type: 'hover', x: 10, y: 10 });
    expect(sceneryGhostOf(game.tool)).toMatchObject({ mode: 'remove', targetId: -1, valid: false, reason: 'Nothing to remove' });
  });
});

describe('through the input controller', () => {
  it('the router gets map gestures before the controller; leaving the tool clears the ghost', () => {
    const { game } = setup();
    const ctl = new InputController(game, { viewport: () => ({ width: 800, height: 600 }) });
    chooseSceneryItem(game, 'oak_round');
    ctl.update(0);
    sceneryInput(game.tool).anchor = tileIndex(game.world.state.map, 30, 30);
    ctl.update(16);
    expect(sceneryGhostOf(game.tool)?.x).toBe(30);
    // The Build 1 controller does not clear the scenery ghost on its own refresh.
    expect(sceneryGhostOf(game.tool)).not.toBeNull();
    expect(ctl.keyDown('Escape')).toBe(true);
    ctl.update(32);
    expect(game.tool.tool).toBe('inspect');
    expect(sceneryGhostOf(game.tool)).toBeNull();
  });
});
