import { describe, expect, it } from 'vitest';
import { Game } from '../../../src/game';
import { InputController } from '../../../src/input/controller';
import type { GesturePointerEvent, PointerKind } from '../../../src/input/gestures';
import { centerOnTile, tileCentreWorld } from '../../../src/input/camera';
import { buyLandSelection, cancelBuyLand, confirmBuyLand } from '../../../src/input/landPurchase';
import { worldToScreen } from '../../../src/render/camera';
import { createWorld } from '../../../src/sim/world';
import { Owned, tileIndex } from '../../../src/sim/map';
import type { Command, CommandResult } from '../../../src/sim/commands/types';
import { LAND_PRICE } from '../../../src/data/tuning/land';

const VW = 800;
const VH = 600;
/** 96 × 96 free-play park: owned square 24–71, the ring 4–23 / 72–91 for sale. */
const O = 24;

function setup(pointerType: PointerKind = 'mouse'): {
  game: Game;
  ctl: InputController;
  cmds: Array<{ cmd: Command; result: CommandResult }>;
  at: (x: number, y: number) => { x: number; y: number };
  ev: (e: Partial<GesturePointerEvent> & Pick<GesturePointerEvent, 'type'>) => void;
} {
  const game = new Game(createWorld({ seed: 3, parkName: 'Buy Park', layout: 'freePlay', mapSize: 96 }));
  const map = game.world.state.map;
  centerOnTile(game.camera, map, tileIndex(map, O - 3, O + 3));
  const cmds: Array<{ cmd: Command; result: CommandResult }> = [];
  game.onCommand((cmd, result) => cmds.push({ cmd, result }));
  const ctl = new InputController(game, { viewport: () => ({ width: VW, height: VH }) });
  game.tool.tool = 'buyLand';
  ctl.update(0);
  const at = (x: number, y: number): { x: number; y: number } => {
    const w = tileCentreWorld(map, tileIndex(map, x, y), game.camera.rotation);
    return worldToScreen(game.camera, w.sx, w.sy, VW, VH);
  };
  const ev = (e: Partial<GesturePointerEvent> & Pick<GesturePointerEvent, 'type'>): void =>
    ctl.pointer({ id: 1, x: 0, y: 0, t: 0, pointerType, button: 0, ...e });
  return { game, ctl, cmds, at, ev };
}

function drag(ev: ReturnType<typeof setup>['ev'], a: { x: number; y: number }, b: { x: number; y: number }, end = true): void {
  ev({ type: 'down', ...a, t: 0 });
  ev({ type: 'move', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, t: 30 });
  ev({ type: 'move', ...b, t: 60 });
  if (end) ev({ type: 'up', ...b, t: 90 });
}

describe('Buy Land tool (Phase 4 §7)', () => {
  it('desktop: the drag shows the rectangle and its total; release buys', () => {
    const { game, cmds, at, ev } = setup('mouse');
    const map = game.world.state.map;
    drag(ev, at(O - 4, O), at(O - 2, O + 1), false);
    const b = game.tool.brush;
    expect(b?.tiles.length).toBe(6);
    expect(b?.cost).toBe(6 * LAND_PRICE);
    expect(b?.valid).toBe(true);
    expect(cmds).toEqual([]);
    ev({ type: 'up', ...at(O - 2, O + 1), t: 90 });
    expect(cmds.map((c) => c.cmd)).toEqual([{ type: 'buyLand', x0: O - 4, y0: O, x1: O - 2, y1: O + 1 }]);
    expect(cmds[0]!.result.ok).toBe(true);
    expect(map.owned[tileIndex(map, O - 4, O + 1)]).toBe(Owned.Owned);
    expect(buyLandSelection(game)).toBeNull();
  });

  it('desktop: hovering shows one tile and its price; a click buys it, or says it is not for sale', () => {
    const { game, cmds, at, ev } = setup('mouse');
    ev({ type: 'move', ...at(O - 1, O + 5), t: 0 });
    expect(game.tool.brush?.tiles).toEqual([tileIndex(game.world.state.map, O - 1, O + 5)]);
    expect(game.tool.brush?.cost).toBe(LAND_PRICE);
    const p = at(O - 1, O + 5);
    ev({ type: 'down', ...p, t: 10 });
    ev({ type: 'up', ...p, t: 50 });
    expect(cmds.at(-1)?.cmd).toEqual({ type: 'buyLand', x0: O - 1, y0: O + 5, x1: O - 1, y1: O + 5 });
    expect(cmds.at(-1)?.result.ok).toBe(true);
    // The outer border is not for sale.
    centerOnTile(game.camera, game.world.state.map, tileIndex(game.world.state.map, 6, 6));
    const q = at(2, 6);
    ev({ type: 'down', ...q, t: 100 });
    ev({ type: 'up', ...q, t: 140 });
    expect(cmds.at(-1)?.result).toEqual({ ok: false, reason: 'This land is not for sale' });
  });

  it('touch: the drag keeps the rectangle until Confirm; Cancel drops it', () => {
    const { game, cmds, at, ev } = setup('touch');
    drag(ev, at(O - 3, O + 2), at(O - 1, O + 2));
    expect(cmds).toEqual([]);
    expect(buyLandSelection(game)).toEqual({ x0: O - 3, y0: O + 2, x1: O - 1, y1: O + 2, pending: true });
    expect(game.tool.brush?.cost).toBe(3 * LAND_PRICE);
    cancelBuyLand(game);
    expect(buyLandSelection(game)).toBeNull();
    expect(game.tool.brush).toBeNull();
    drag(ev, at(O - 3, O + 2), at(O - 1, O + 2));
    const r = confirmBuyLand(game);
    expect(r?.ok).toBe(true);
    expect(cmds.map((c) => c.cmd)).toEqual([{ type: 'buyLand', x0: O - 3, y0: O + 2, x1: O - 1, y1: O + 2 }]);
    expect(buyLandSelection(game)).toBeNull();
    // A tap selects one tile for Confirm.
    const p = at(O - 5, O + 7);
    ev({ type: 'down', ...p, t: 500 });
    ev({ type: 'up', ...p, t: 540 });
    expect(buyLandSelection(game)?.pending).toBe(true);
    expect(game.tool.brush?.tiles.length).toBe(1);
  });

  it('touch: a second finger cancels the drag and pinches; nothing is bought (Review Focus 4)', () => {
    const { game, cmds, at, ev } = setup('touch');
    const a = at(O - 4, O);
    const b = at(O - 2, O + 2);
    ev({ type: 'down', id: 1, ...a, t: 0 });
    ev({ type: 'move', id: 1, ...b, t: 30 });
    expect(game.tool.brush).not.toBeNull();
    ev({ type: 'down', id: 2, x: b.x + 80, y: b.y, t: 40 });
    expect(game.tool.brush).toBeNull();
    expect(buyLandSelection(game)).toBeNull();
    ev({ type: 'up', id: 2, x: b.x + 80, y: b.y, t: 60 });
    ev({ type: 'up', id: 1, ...b, t: 70 });
    expect(confirmBuyLand(game)).toBeNull();
    expect(cmds).toEqual([]);
  });

  it('the ghost turns red with the reason: not enough cash, nothing to buy', () => {
    const { game, at, ev } = setup('mouse');
    game.world.state.park.cash = LAND_PRICE - 1;
    ev({ type: 'move', ...at(O - 1, O + 5), t: 0 });
    expect(game.tool.brush).toMatchObject({ valid: false, reason: 'Not enough cash', cost: LAND_PRICE });
    // Enough cash again: the ghost refreshes on the next frame.
    game.world.state.park.cash = LAND_PRICE;
    ev({ type: 'move', ...at(O - 1, O + 5), t: 10 });
    expect(game.tool.brush).toMatchObject({ valid: true, reason: null });
    ev({ type: 'move', ...at(O + 3, O + 3), t: 20 });
    expect(game.tool.brush).toMatchObject({ valid: false, reason: 'Nothing to buy here', cost: 0 });
  });

  it('leaving the tool drops the rectangle; Enter confirms a pending touch rectangle', () => {
    const { game, ctl, cmds, at, ev } = setup('touch');
    drag(ev, at(O - 3, O + 2), at(O - 2, O + 3));
    expect(ctl.keyDown('Enter')).toBe(true);
    expect(cmds.length).toBe(1);
    drag(ev, at(O - 6, O + 2), at(O - 5, O + 3));
    game.tool.tool = 'inspect';
    ctl.update(16);
    expect(game.tool.brush).toBeNull();
    expect(buyLandSelection(game)).toBeNull();
  });

  it('works through the inverse table in a turned view', () => {
    const { game, ctl, cmds, at, ev } = setup('mouse');
    ctl.keyDown(']');
    expect(game.camera.rotation).toBe(1);
    drag(ev, at(O - 4, O + 1), at(O - 3, O + 4));
    expect(cmds.at(-1)?.cmd).toEqual({ type: 'buyLand', x0: O - 4, y0: O + 1, x1: O - 3, y1: O + 4 });
  });
});
