import { describe, expect, it } from 'vitest';
import { Game } from '../../../src/game';
import { InputController } from '../../../src/input/controller';
import type { GesturePointerEvent } from '../../../src/input/gestures';
import { centerOnMap, centerOnTile, rotateView, tileCentreWorld } from '../../../src/input/camera';
import { worldToScreen } from '../../../src/render/camera';
import { pickTile } from '../../../src/render/iso';
import type { ViewRotation } from '../../../src/render/view';
import { tileIndex } from '../../../src/sim/map';
import type { Command } from '../../../src/sim/commands/types';
import { addGuestDirect, makeTestWorld, placeFootpath, runTicks, stateHash } from '../../helpers/world';

const VW = 800;
const VH = 600;

function setup(): {
  game: Game;
  ctl: InputController;
  cmds: Command[];
  at: (x: number, y: number) => { x: number; y: number };
  ev: (e: Partial<GesturePointerEvent> & Pick<GesturePointerEvent, 'type'>) => void;
} {
  const game = new Game(makeTestWorld());
  centerOnMap(game.camera, game.world.state.map);
  const cmds: Command[] = [];
  game.onCommand((c) => cmds.push(c));
  const ctl = new InputController(game, { viewport: () => ({ width: VW, height: VH }) });
  /** Screen point at the centre of map tile (x, y) in the current view rotation. */
  const at = (x: number, y: number): { x: number; y: number } => {
    const map = game.world.state.map;
    const w = tileCentreWorld(map, tileIndex(map, x, y), game.camera.rotation);
    return worldToScreen(game.camera, w.sx, w.sy, VW, VH);
  };
  const ev = (e: Partial<GesturePointerEvent> & Pick<GesturePointerEvent, 'type'>): void =>
    ctl.pointer({ id: 1, x: 0, y: 0, t: 0, pointerType: 'mouse', button: 0, ...e });
  return { game, ctl, cmds, at, ev };
}

function centreTile(game: Game): number | null {
  const c = game.camera;
  return pickTile(game.world.state.map, c.centerX, c.centerY, c.rotation);
}

describe('view rotation input (Phase 4 §4.8)', () => {
  it('] and [ turn the view and keep the centre tile', () => {
    const { game, ctl } = setup();
    centerOnTile(game.camera, game.world.state.map, tileIndex(game.world.state.map, 20, 37));
    const start = centreTile(game);
    expect(start).toBe(tileIndex(game.world.state.map, 20, 37));
    const seen: ViewRotation[] = [];
    for (const key of [']', ']', ']', ']', '[', '[']) {
      expect(ctl.keyDown(key)).toBe(true);
      seen.push(game.camera.rotation);
      expect(centreTile(game)).toBe(start);
    }
    expect(seen).toEqual([1, 2, 3, 0, 3, 2]);
  });

  it('keeps the centre tile on a hill (the picked ground height is the pivot)', () => {
    const { game } = setup();
    const map = game.world.state.map;
    for (let y = 25; y < 35; y++) for (let x = 25; x < 35; x++) map.heights[tileIndex(map, x, y)] = 14;
    const t = tileIndex(map, 29, 31);
    centerOnTile(game.camera, map, t);
    expect(centreTile(game)).toBe(t);
    for (let k = 0; k < 4; k++) {
      rotateView(game.camera, map, 1);
      expect(centreTile(game)).toBe(t);
    }
  });

  it('a click picks the map tile through the inverse table in every rotation', () => {
    const { game, ctl, at, ev } = setup();
    game.tool.tool = 'inspect';
    const map = game.world.state.map;
    for (let r = 0; r < 4; r++) {
      for (const [x, y] of [
        [31, 30],
        [28, 33],
        [35, 29],
      ] as const) {
        const p = at(x, y);
        ev({ type: 'down', ...p, t: r * 1000 });
        ev({ type: 'up', ...p, t: r * 1000 + 40 });
        expect(game.tool.selectedTile).toBe(tileIndex(map, x, y));
      }
      ctl.keyDown(']');
    }
  });

  it('a footpath drag builds along the map axis under the pointer in a turned view', () => {
    const { game, ctl, cmds, at, ev } = setup();
    ctl.keyDown(']');
    ctl.keyDown(']');
    game.tool.tool = 'footpath';
    ctl.update(0);
    const a = at(30, 30);
    const b = at(26, 30);
    ev({ type: 'down', ...a });
    ev({ type: 'move', ...b, t: 50 });
    ev({ type: 'up', ...b, t: 80 });
    expect(cmds).toEqual([{ type: 'buildPathLine', x0: 30, y0: 30, x1: 26, y1: 30, kind: 'footpath' }]);
  });

  it('the tool rotation is in view terms; the ghost and the command store (viewRotation − r) mod 4', () => {
    for (const r of [0, 1, 2, 3] as const) {
      const { game, ctl, cmds, at, ev } = setup();
      for (let k = 0; k < r; k++) ctl.keyDown(']');
      expect(game.camera.rotation).toBe(r);
      game.tool.tool = 'placeStall';
      game.tool.defId = 'snack_shack';
      game.tool.rotation = 2; // service side toward the viewer (view south)
      ctl.update(0);
      const p = at(30, 30);
      ev({ type: 'move', ...p });
      ctl.update(16);
      expect(game.tool.ghost?.rotation).toBe((2 - r + 4) % 4);
      ev({ type: 'down', ...p, t: 100 });
      ev({ type: 'up', ...p, t: 140 });
      const placed = cmds.find((c) => c.type === 'placeStall');
      expect(placed).toMatchObject({ type: 'placeStall', x: 30, y: 30, rotation: (2 - r + 4) % 4 });
    }
  });
});

describe('determinism (Phase 4 §9.3): view rotation is UI state', () => {
  it('rotating the view between ticks leaves the state hash unchanged', () => {
    const make = (): Game => {
      const game = new Game(makeTestWorld(4242));
      const map = game.world.state.map;
      for (let x = 20; x <= 40; x++) placeFootpath(game.world, x, 50);
      for (let k = 0; k < 30; k++) addGuestDirect(game.world, tileIndex(map, 20 + (k % 20), 50));
      game.world.state.park.open = true;
      return game;
    };
    const a = make();
    const b = make();
    const ctl = new InputController(b, { viewport: () => ({ width: VW, height: VH }) });
    centerOnMap(b.camera, b.world.state.map);
    for (let k = 0; k < 39; k++) {
      runTicks(a.world, 25);
      runTicks(b.world, 25);
      ctl.keyDown(k % 3 === 0 ? '[' : ']');
      ctl.update(k * 16);
    }
    expect(b.camera.rotation).not.toBe(0);
    expect(stateHash(b.world)).toBe(stateHash(a.world));
  });
});
