import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../../../src/game';
import { InputController } from '../../../src/input/controller';
import { centerOnMap, tileCentreWorld } from '../../../src/input/camera';
import { worldToScreen } from '../../../src/render/camera';
import { tileIndex } from '../../../src/sim/map';
import type { Command } from '../../../src/sim/commands/types';
import { Content } from '../../../src/sim/map';
import { makeTestWorld, placeRideDirect } from '../../helpers/world';
import { cursorStep, mapCursor, onShortcutList, resetMapCursor, setCursorInput } from '../../../src/a11y/cursor';
import { a11yKeys } from '../../../src/a11y/keys';
import type { ViewRotation } from '../../../src/render/view';

const VW = 800;
const VH = 600;
const NO = { shift: false, repeat: false };
const SHIFT = { shift: true, repeat: false };

function setup(): { game: Game; ctl: InputController; cmds: Command[]; key: (k: string, mods?: typeof NO) => boolean } {
  const game = new Game(makeTestWorld());
  centerOnMap(game.camera, game.world.state.map);
  const cmds: Command[] = [];
  game.onCommand((c) => cmds.push(c));
  const ctl = new InputController(game, { viewport: () => ({ width: VW, height: VH }) });
  setCursorInput(ctl.cursorInput());
  ctl.update(0);
  const key = (k: string, mods = NO): boolean => a11yKeys.keyDown(game, k, mods);
  return { game, ctl, cmds, key };
}

beforeEach(() => resetMapCursor());
afterEach(() => {
  resetMapCursor();
  setCursorInput(null);
});

describe('cursorStep (arrow keys move one tile in view terms)', () => {
  it('right/left change the view u axis, down/up the view v axis, clamped to the map', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    const t = tileIndex(map, 10, 10);
    expect(cursorStep(map, t, 'right', 0)).toBe(tileIndex(map, 11, 10));
    expect(cursorStep(map, t, 'left', 0)).toBe(tileIndex(map, 9, 10));
    expect(cursorStep(map, t, 'down', 0)).toBe(tileIndex(map, 10, 11));
    expect(cursorStep(map, t, 'up', 0)).toBe(tileIndex(map, 10, 9));
    expect(cursorStep(map, tileIndex(map, 0, 0), 'left', 0)).toBe(tileIndex(map, 0, 0));
    expect(cursorStep(map, tileIndex(map, map.width - 1, 5), 'right', 0)).toBe(tileIndex(map, map.width - 1, 5));
  });

  it('follows the view rotation: "right" always moves the same way on screen', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    const t = tileIndex(map, 20, 20);
    const cam = { centerX: 0, centerY: 0, zoom: 1, rotation: 0 as ViewRotation };
    for (const r of [0, 1, 2, 3] as const) {
      cam.rotation = r;
      const a = tileCentreWorld(map, t, r);
      const b = tileCentreWorld(map, cursorStep(map, t, 'right', r), r);
      // Right = view u + 1 = 32 px right and 16 px down on screen, whatever the rotation.
      expect(b.sx - a.sx).toBeCloseTo(32);
      expect(b.sy - a.sy).toBeCloseTo(16);
    }
  });
});

describe('a11yKeys (Phase 6 §4.7 keyboard play)', () => {
  it('C toggles the map cursor; it starts on the tile at the screen centre; keys of the key map fall through', () => {
    const { game, ctl, key } = setup();
    expect(key('p')).toBe(false);
    expect(key('ArrowUp')).toBe(false);
    expect(key('c')).toBe(true);
    expect(mapCursor.on).toBe(true);
    expect(mapCursor.tile).toBe(ctl.cursorInput().centreTile());
    expect(game.tool.hoverTile).toBe(mapCursor.tile);
    // With the cursor on, Phase 1 shortcuts still reach the key map.
    expect(key('p')).toBe(false);
    expect(key('r')).toBe(false);
    expect(key('C')).toBe(true);
    expect(mapCursor.on).toBe(false);
  });

  it('arrows move the cursor (the hover follows) and keep it on screen', () => {
    const { game, key } = setup();
    key('c');
    const map = game.world.state.map;
    const start = mapCursor.tile;
    expect(key('ArrowRight')).toBe(true);
    expect(mapCursor.tile).toBe(start + 1);
    expect(game.tool.hoverTile).toBe(start + 1);
    expect(key('ArrowDown')).toBe(true);
    expect(mapCursor.tile).toBe(start + 1 + map.width);
    // Walk far away: the camera follows so the cursor tile stays inside the view.
    for (let k = 0; k < 25; k++) key('ArrowRight');
    const p = tileCentreWorld(map, mapCursor.tile, game.camera.rotation);
    const s = worldToScreen(game.camera, p.sx, p.sy, VW, VH);
    expect(s.x).toBeGreaterThan(0);
    expect(s.x).toBeLessThan(VW);
    expect(s.y).toBeGreaterThan(0);
    expect(s.y).toBeLessThan(VH);
  });

  it('Enter acts as a click at the cursor: the footpath tool builds there, Inspect opens the ride', () => {
    const { game, cmds, key } = setup();
    const map = game.world.state.map;
    key('c');
    game.tool.tool = 'footpath';
    const t = mapCursor.tile;
    expect(key('Enter')).toBe(true);
    expect(cmds).toEqual([{ type: 'buildPathLine', x0: t % map.width, y0: Math.floor(t / map.width), x1: t % map.width, y1: Math.floor(t / map.width), kind: 'footpath' }]);
    expect(map.content[t]).toBe(Content.Footpath);
    // Inspect: a ride under the cursor gets selected (the UI opens its panel).
    const x = t % map.width;
    const y = Math.floor(t / map.width);
    const ride = placeRideDirect(game.world, 'carousel', x + 2, y, 0);
    game.tool.tool = 'inspect';
    key('ArrowRight');
    key('ArrowRight');
    key('Enter');
    expect(game.tool.selectedEntity).toEqual({ kind: 'ride', id: ride.id });
  });

  it('Shift + arrows drag a path line from the cursor; letting go of Shift builds it', () => {
    const { game, cmds, key } = setup();
    const map = game.world.state.map;
    game.tool.tool = 'queue';
    key('c');
    const t = mapCursor.tile;
    key('ArrowRight', SHIFT);
    key('ArrowRight', SHIFT);
    key('ArrowRight', SHIFT);
    expect(game.tool.drag?.tiles.length).toBe(4);
    expect(game.tool.drag?.startTile).toBe(t);
    expect(game.tool.drag?.endTile).toBe(t + 3);
    expect(cmds).toEqual([]);
    a11yKeys.keyUp?.(game, 'Shift');
    const x = t % map.width;
    const y = Math.floor(t / map.width);
    expect(cmds).toEqual([{ type: 'buildPathLine', x0: x, y0: y, x1: x + 3, y1: y, kind: 'queue' }]);
    expect(game.tool.drag).toBeNull();
    expect(map.content[t + 3]).toBe(Content.Queue);
  });

  it('Esc cancels a cursor drag (nothing is built); Shift + arrows with a tool that has no drag only move', () => {
    const { game, cmds, key } = setup();
    game.tool.tool = 'footpath';
    key('c');
    key('ArrowDown', SHIFT);
    expect(game.tool.drag).not.toBeNull();
    expect(key('Escape')).toBe(true);
    expect(game.tool.drag).toBeNull();
    a11yKeys.keyUp?.(game, 'Shift');
    expect(cmds).toEqual([]);
    // Next Esc is the key map's (cancel the tool).
    expect(key('Escape')).toBe(false);
    game.tool.tool = 'inspect';
    const t = mapCursor.tile;
    key('ArrowRight', SHIFT);
    expect(game.tool.drag).toBeNull();
    expect(mapCursor.tile).toBe(t + 1);
  });

  it('? asks for the shortcut list', () => {
    const { key } = setup();
    let asked = 0;
    const off = onShortcutList(() => asked++);
    expect(key('?')).toBe(true);
    expect(asked).toBe(1);
    off();
  });

  it('a new world puts the cursor back off', () => {
    const { game, ctl, key } = setup();
    key('c');
    game.setWorld(makeTestWorld(7));
    ctl.worldChanged();
    expect(mapCursor.on).toBe(false);
    expect(mapCursor.tile).toBe(-1);
  });
});
