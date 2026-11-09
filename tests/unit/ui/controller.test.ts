import { describe, expect, it } from 'vitest';
import { Game } from '../../../src/game';
import { InputController, type UiIntent } from '../../../src/input/controller';
import type { GesturePointerEvent } from '../../../src/input/gestures';
import { centerOnMap } from '../../../src/input/camera';
import { screenToWorld, worldToScreen } from '../../../src/render/camera';
import { tileToScreen } from '../../../src/render/iso';
import { tileIndex } from '../../../src/sim/map';
import type { Command } from '../../../src/sim/commands/types';
import { addGuestDirect, makeTestWorld, placeFootpath, placeRideDirect } from '../../helpers/world';

const VW = 800;
const VH = 600;

function setup(): {
  game: Game;
  ctl: InputController;
  cmds: Command[];
  intents: UiIntent[];
  at: (x: number, y: number) => { x: number; y: number };
  ev: (e: Partial<GesturePointerEvent> & Pick<GesturePointerEvent, 'type'>) => void;
} {
  const game = new Game(makeTestWorld());
  centerOnMap(game.camera, game.world.state.map);
  const cmds: Command[] = [];
  const intents: UiIntent[] = [];
  game.onCommand((c) => cmds.push(c));
  const ctl = new InputController(game, { viewport: () => ({ width: VW, height: VH }), onIntent: (i) => intents.push(i) });
  /** Screen point at the centre of tile (x, y). */
  const at = (x: number, y: number): { x: number; y: number } => {
    const w = tileToScreen(x + 0.5, y + 0.5, game.world.state.map.heights[0] ?? 0);
    return worldToScreen(game.camera, w.sx, w.sy, VW, VH);
  };
  const ev = (e: Partial<GesturePointerEvent> & Pick<GesturePointerEvent, 'type'>): void =>
    ctl.pointer({ id: 1, x: 0, y: 0, t: 0, pointerType: 'touch', button: 0, ...e });
  return { game, ctl, cmds, intents, at, ev };
}

describe('footpath and queue tools', () => {
  it('a drag shows ghost tiles and cost, then builds the line on release via buildPathLine', () => {
    const { game, ctl, cmds, at, ev } = setup();
    game.tool.tool = 'footpath';
    ctl.update(0);
    const a = at(30, 30);
    const b = at(34, 31);
    ev({ type: 'down', ...a });
    ev({ type: 'move', ...b, t: 50 });
    expect(game.tool.drag?.tiles.length).toBe(5);
    expect(game.tool.drag?.cost).toBe(5000);
    expect(game.tool.drag?.startTile).toBe(tileIndex(game.world.state.map, 30, 30));
    expect(game.tool.drag?.endTile).toBe(tileIndex(game.world.state.map, 34, 30));
    expect(cmds).toEqual([]);
    ev({ type: 'up', ...b, t: 80 });
    expect(cmds).toEqual([{ type: 'buildPathLine', x0: 30, y0: 30, x1: 34, y1: 30, kind: 'footpath' }]);
    expect(game.tool.drag).toBeNull();
  });

  it('a tap builds one tile', () => {
    const { game, ctl, cmds, at, ev } = setup();
    game.tool.tool = 'queue';
    ctl.update(0);
    const a = at(12, 40);
    ev({ type: 'down', ...a });
    ev({ type: 'up', ...a, t: 50 });
    expect(cmds).toEqual([{ type: 'buildPathLine', x0: 12, y0: 40, x1: 12, y1: 40, kind: 'queue' }]);
  });

  it('second finger cancels build drag: nothing gets built and a pinch zooms (Review Focus 4)', () => {
    const { game, ctl, cmds, at, ev } = setup();
    game.tool.tool = 'footpath';
    ctl.update(0);
    const a = at(30, 30);
    const b = at(36, 30);
    ev({ type: 'down', id: 1, ...a });
    ev({ type: 'move', id: 1, ...b, t: 30 });
    expect(game.tool.drag).not.toBeNull();
    const zoom0 = game.camera.zoom;
    ev({ type: 'down', id: 2, x: b.x + 100, y: b.y, t: 40 });
    expect(game.tool.drag).toBeNull();
    ev({ type: 'move', id: 2, x: b.x + 200, y: b.y, t: 60 });
    expect(game.camera.zoom).toBeGreaterThan(zoom0);
    ev({ type: 'up', id: 1, ...b, t: 80 });
    ev({ type: 'up', id: 2, x: b.x + 200, y: b.y, t: 90 });
    expect(cmds).toEqual([]);
    expect(game.tool.drag).toBeNull();
  });

  it('switching tool mid-drag cancels the drag and builds nothing', () => {
    const { game, ctl, cmds, at, ev } = setup();
    game.tool.tool = 'footpath';
    ctl.update(0);
    ev({ type: 'down', ...at(20, 20) });
    ev({ type: 'move', ...at(25, 20), t: 30 });
    ctl.keyDown('Escape');
    expect(game.tool.tool).toBe('inspect');
    expect(game.tool.drag).toBeNull();
    ev({ type: 'up', ...at(25, 20), t: 60 });
    expect(cmds).toEqual([]);
  });
});

describe('inspect tool', () => {
  it('a tap selects the tile and opens the ride on it', () => {
    const { game, at, ev } = setup();
    const ride = placeRideDirect(game.world, 'carousel', 10, 10, 0);
    ev({ type: 'down', ...at(11, 11) });
    ev({ type: 'up', ...at(11, 11), t: 40 });
    expect(game.tool.selectedTile).toBe(tileIndex(game.world.state.map, 11, 11));
    expect(game.tool.selectedEntity).toEqual({ kind: 'ride', id: ride.id });
    ev({ type: 'down', ...at(40, 40), t: 100 });
    ev({ type: 'up', ...at(40, 40), t: 140 });
    expect(game.tool.selectedEntity).toBeNull();
  });

  it('a long press (500 ms) opens a guest panel', () => {
    const { game, ctl, at, ev } = setup();
    const tile = placeFootpath(game.world, 25, 25);
    const guest = addGuestDirect(game.world, tile);
    ev({ type: 'down', ...at(25, 25), t: 1000 });
    ctl.update(1499);
    expect(game.tool.selectedEntity).toBeNull();
    ctl.update(1500);
    expect(game.tool.selectedEntity).toEqual({ kind: 'guest', id: guest.id });
  });

  it('a one-finger drag pans the map with the finger', () => {
    const { game, ev } = setup();
    const x0 = game.camera.centerX;
    const y0 = game.camera.centerY;
    ev({ type: 'down', x: 400, y: 300 });
    ev({ type: 'move', x: 440, y: 290, t: 20 });
    expect(game.camera.centerX).toBeCloseTo(x0 - 40, 6);
    expect(game.camera.centerY).toBeCloseTo(y0 + 10, 6);
  });

  it('mouse hover highlights the tile under the cursor; leaving clears it', () => {
    const { game, ctl, at, ev } = setup();
    ev({ type: 'move', pointerType: 'mouse', ...at(7, 9) });
    expect(game.tool.hoverTile).toBe(tileIndex(game.world.state.map, 7, 9));
    ctl.hoverOut();
    expect(game.tool.hoverTile).toBeNull();
  });
});

describe('place ride and stall tools', () => {
  it('desktop click places the ride at the ghost origin with the current rotation', () => {
    const { game, ctl, cmds, at, ev } = setup();
    game.tool.tool = 'placeRide';
    game.tool.defId = 'carousel';
    ctl.keyDown('r');
    ev({ type: 'move', pointerType: 'mouse', ...at(20, 20) });
    ctl.update(0);
    expect(game.tool.ghost).toMatchObject({ kind: 'ride', defId: 'carousel', tile: tileIndex(game.world.state.map, 19, 19), rotation: 1, valid: true });
    ev({ type: 'down', pointerType: 'mouse', ...at(20, 20), t: 10 });
    ev({ type: 'up', pointerType: 'mouse', ...at(20, 20), t: 30 });
    expect(cmds).toEqual([{ type: 'placeRide', defId: 'carousel', x: 19, y: 19, rotation: 1 }]);
  });

  it('touch tap moves the ghost and places nothing', () => {
    const { game, ctl, cmds, at, ev } = setup();
    game.tool.tool = 'placeStall';
    game.tool.defId = 'snack_shack';
    game.tool.rotation = 2;
    ctl.update(0);
    // Without a hover tile the ghost starts at the screen centre.
    expect(game.tool.ghost).not.toBeNull();
    ev({ type: 'down', ...at(15, 16) });
    ev({ type: 'up', ...at(15, 16), t: 30 });
    expect(game.tool.ghost?.tile).toBe(tileIndex(game.world.state.map, 15, 16));
    expect(game.tool.ghost?.rotation).toBe(2);
    expect(cmds).toEqual([]);
  });

  it('leaving the place tool removes the ghost', () => {
    const { game, ctl } = setup();
    game.tool.tool = 'placeRide';
    game.tool.defId = 'carousel';
    ctl.update(0);
    expect(game.tool.ghost).not.toBeNull();
    game.tool.tool = 'inspect';
    ctl.update(16);
    expect(game.tool.ghost).toBeNull();
  });
});

describe('demolish tool', () => {
  it('a tap demolishes the tile', () => {
    const { game, cmds, at, ev } = setup();
    game.tool.tool = 'demolish';
    ev({ type: 'down', ...at(31, 62) });
    ev({ type: 'up', ...at(31, 62), t: 30 });
    expect(cmds).toEqual([{ type: 'demolish', x: 31, y: 62 }]);
  });
});

describe('keyboard', () => {
  it('Space pauses and resumes the last speed; 1/2/3 pick 1×/2×/4×', () => {
    const { game, ctl } = setup();
    expect(ctl.keyDown('3')).toBe(true);
    expect(game.speed).toBe(4);
    ctl.keyDown(' ');
    expect(game.speed).toBe(0);
    ctl.keyDown(' ');
    expect(game.speed).toBe(4);
    ctl.keyDown('1');
    expect(game.speed).toBe(1);
  });

  it('P, Q, Delete pick tools; Esc cancels the tool, then closes the panel; F opens finance', () => {
    const { game, ctl, intents } = setup();
    ctl.keyDown('p');
    expect(game.tool.tool).toBe('footpath');
    ctl.keyDown('Q');
    expect(game.tool.tool).toBe('queue');
    ctl.keyDown('Delete');
    expect(game.tool.tool).toBe('demolish');
    ctl.keyDown('Escape');
    expect(game.tool.tool).toBe('inspect');
    expect(intents).toEqual([]);
    ctl.keyDown('Escape');
    ctl.keyDown('f');
    expect(intents).toEqual(['closePanel', 'finance']);
    expect(ctl.keyDown('x')).toBe(false);
  });

  it('arrow keys pan 600 px per second divided by zoom while held', () => {
    const { game, ctl } = setup();
    game.camera.zoom = 2;
    const x0 = game.camera.centerX;
    ctl.update(1000);
    ctl.keyDown('ArrowRight');
    ctl.update(1100);
    expect(game.camera.centerX).toBeCloseTo(x0 + 30, 6);
    ctl.keyUp('ArrowRight');
    ctl.update(1200);
    expect(game.camera.centerX).toBeCloseTo(x0 + 30, 6);
  });

  it('+ and − zoom toward the screen centre', () => {
    const { game, ctl } = setup();
    const c0 = { x: game.camera.centerX, y: game.camera.centerY };
    ctl.keyDown('+');
    expect(game.camera.zoom).toBeCloseTo(1.15, 6);
    ctl.keyDown('-');
    ctl.keyDown('-');
    expect(game.camera.zoom).toBeCloseTo(1 / 1.15, 6);
    expect(game.camera.centerX).toBeCloseTo(c0.x, 6);
    expect(game.camera.centerY).toBeCloseTo(c0.y, 6);
  });
});

describe('wheel', () => {
  it('zooms ×1.15 per notch keeping the world point under the cursor fixed', () => {
    const { game, ctl } = setup();
    const before = screenToWorld(game.camera, 200, 150, VW, VH);
    ctl.wheel(200, 150, -100, 0);
    expect(game.camera.zoom).toBeCloseTo(1.15, 6);
    const after = screenToWorld(game.camera, 200, 150, VW, VH);
    expect(Math.abs(after.x - before.x) * game.camera.zoom).toBeLessThan(0.5);
    expect(Math.abs(after.y - before.y) * game.camera.zoom).toBeLessThan(0.5);
  });
});
