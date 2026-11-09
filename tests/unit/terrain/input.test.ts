import { describe, expect, it } from 'vitest';
import { Game } from '../../../src/game';
import { InputController } from '../../../src/input/controller';
import type { GesturePointerEvent, PointerKind } from '../../../src/input/gestures';
import { centerOnMap } from '../../../src/input/camera';
import { landPickCorner } from '../../../src/input/land';
import { worldToScreen } from '../../../src/render/camera';
import { tileToScreen } from '../../../src/render/iso';
import { landToolOf, noteLandPointerDown, noteLandPointerUp, pressLandButton, queueLandAction, releaseLandButton } from '../../../src/render/terrainTools/toolState';
import { LAND_REPEAT_MS, TERRAIN_STEP_COST, TERRAIN_TILE_FEE, WATER_STEP_COST } from '../../../src/data/tuning/terrain';
import { Terrain, tileIndex } from '../../../src/sim/map';
import type { Command } from '../../../src/sim/commands/types';
import { setTileCorners } from '../../../src/sim/terrain/normalize';
import { makeTestWorld, placeFootpath } from '../../helpers/world';

const VW = 800;
const VH = 600;
const FLAT_RAISE = TERRAIN_TILE_FEE + 4 * TERRAIN_STEP_COST;

function setup(tool: 'land' | 'water' = 'land') {
  const game = new Game(makeTestWorld());
  centerOnMap(game.camera, game.world.state.map);
  const cmds: Command[] = [];
  game.onCommand((c) => cmds.push(c));
  // The browser glue writes the canvas size into the side table.
  landToolOf(game.tool).viewW = VW;
  landToolOf(game.tool).viewH = VH;
  const ctl = new InputController(game, { viewport: () => ({ width: VW, height: VH }) });
  game.tool.tool = tool;
  ctl.update(0);
  const map = game.world.state.map;
  /** Screen point at (x + fx, y + fy) of tile (x, y) on its ground. */
  const at = (x: number, y: number, fx = 0.5, fy = 0.5): { x: number; y: number } => {
    const w = tileToScreen(x + fx, y + fy, map.heights[tileIndex(map, x, y)] ?? 0);
    return worldToScreen(game.camera, w.sx, w.sy, VW, VH);
  };
  let t = 0;
  let id = 1;
  /** Pointer event, with the browser glue's capture-phase bookkeeping for downs and ups. */
  const ev = (e: Partial<GesturePointerEvent> & Pick<GesturePointerEvent, 'type'>): void => {
    const full: GesturePointerEvent = { id, x: 0, y: 0, t, pointerType: 'mouse', button: 0, ...e };
    if (full.type === 'down') noteLandPointerDown(game.tool, full.pointerType, full.button, full.shift === true);
    if (full.type === 'up' || full.type === 'cancel') noteLandPointerUp(game.tool);
    ctl.pointer(full);
  };
  const click = (p: { x: number; y: number }, opts: { pointerType?: PointerKind; shift?: boolean } = {}): void => {
    id++;
    t += 10;
    ev({ type: 'down', ...p, pointerType: opts.pointerType ?? 'mouse', shift: opts.shift });
    t += 10;
    ev({ type: 'up', ...p, pointerType: opts.pointerType ?? 'mouse' });
  };
  const hover = (p: { x: number; y: number }): void => ev({ type: 'move', ...p });
  const frame = (ms: number): void => {
    t = ms;
    ctl.update(ms);
  };
  return { game, ctl, cmds, map, at, ev, click, hover, frame };
}

describe('Land tool with a mouse (Phase 4 §7)', () => {
  it('the brush ghost follows the cursor with its cost', () => {
    const { game, map, at, hover, frame } = setup();
    game.tool.land.size = 3;
    hover(at(20, 20));
    frame(16);
    const b = game.tool.brush;
    expect(b).not.toBeNull();
    expect(b?.tiles).toHaveLength(9);
    expect(b?.tiles).toContain(tileIndex(map, 21, 21));
    expect(b?.cost).toBe(9 * FLAT_RAISE);
    expect(b?.valid).toBe(true);
    expect(b?.reason).toBeNull();
  });

  it('the ghost turns invalid with the reason when every tile is blocked', () => {
    const { game, at, hover, frame } = setup();
    placeFootpath(game.world, 20, 20);
    hover(at(20, 20));
    frame(16);
    expect(game.tool.brush).toMatchObject({ valid: false, reason: 'A path is in the way' });
  });

  it('a click applies the mode at the cursor; Shift-click does the opposite', () => {
    const { game, cmds, map, at, hover, click, frame } = setup();
    game.tool.land.size = 3;
    hover(at(20, 20));
    click(at(20, 20));
    expect(cmds).toEqual([{ type: 'raiseLand', x: 20, y: 20, size: 3 }]);
    expect(map.heights[tileIndex(map, 21, 21)]).toBe(9);
    frame(20);
    click(at(30, 30), { shift: true });
    expect(cmds[1]).toEqual({ type: 'lowerLand', x: 30, y: 30, size: 3 });
    game.tool.land.mode = 'lower';
    click(at(40, 40));
    expect(cmds[2]).toEqual({ type: 'lowerLand', x: 40, y: 40, size: 3 });
  });

  it('holding the button repeats every 300 ms and the release does not apply again', () => {
    const { game, cmds, map, at, hover, ev, frame } = setup();
    hover(at(20, 20));
    ev({ type: 'down', ...at(20, 20) });
    frame(1000);
    expect(cmds).toHaveLength(1);
    frame(1000 + LAND_REPEAT_MS - 1);
    expect(cmds).toHaveLength(1);
    frame(1000 + LAND_REPEAT_MS);
    expect(cmds).toHaveLength(2);
    frame(1000 + 2 * LAND_REPEAT_MS);
    expect(cmds).toHaveLength(3);
    ev({ type: 'up', ...at(20, 20) });
    frame(1000 + 5 * LAND_REPEAT_MS);
    expect(cmds).toHaveLength(3);
    expect(map.heights[tileIndex(map, 20, 20)]).toBe(11);
    expect(game.tool.land.mode).toBe('raise');
  });

  it('a held drag keeps applying under the cursor (brush stroke)', () => {
    const { cmds, at, hover, ev, frame } = setup();
    hover(at(20, 20));
    ev({ type: 'down', ...at(20, 20) });
    frame(100);
    ev({ type: 'move', ...at(24, 20) });
    frame(100 + LAND_REPEAT_MS);
    ev({ type: 'up', ...at(24, 20) });
    expect(cmds).toEqual([
      { type: 'raiseLand', x: 20, y: 20, size: 1 },
      { type: 'raiseLand', x: 24, y: 20, size: 1 },
    ]);
  });

  it('smooth and paint modes send their commands', () => {
    const { game, cmds, at, hover, click } = setup();
    game.tool.land.mode = 'smooth';
    game.tool.land.size = 5;
    hover(at(20, 20));
    click(at(20, 20));
    game.tool.land.mode = 'paint';
    game.tool.land.paint = Terrain.Snow;
    click(at(21, 20));
    expect(cmds).toEqual([
      { type: 'smoothLand', x: 20, y: 20, size: 5 },
      { type: 'paintTerrain', x: 21, y: 20, size: 5, terrain: Terrain.Snow },
    ]);
  });

  it('corner mode marks the nearest corner under the cursor and raises it', () => {
    const { game, cmds, at, hover, click, frame } = setup();
    game.tool.land.mode = 'corner';
    hover(at(20, 20, 0.2, 0.2));
    frame(16);
    expect(game.tool.land.corner).toBe(0);
    expect(game.tool.brush?.corner).toEqual({ x: 20, y: 20 });
    hover(at(20, 20, 0.8, 0.9));
    frame(32);
    expect(game.tool.land.corner).toBe(2);
    expect(game.tool.brush?.corner).toEqual({ x: 21, y: 21 });
    expect(game.tool.brush?.tiles).toHaveLength(4);
    expect(game.tool.brush?.cost).toBe(4 * (TERRAIN_TILE_FEE + TERRAIN_STEP_COST));
    click(at(20, 20, 0.8, 0.9));
    click(at(20, 20, 0.9, 0.2), { shift: true });
    expect(cmds).toEqual([
      { type: 'raiseCorner', x: 20, y: 20, corner: 2 },
      { type: 'lowerCorner', x: 20, y: 20, corner: 1 },
    ]);
  });

  it('level mode: drag a rectangle, release levels at the first tile’s lowest corner', () => {
    const { game, cmds, map, at, hover, ev, frame } = setup();
    game.tool.land.mode = 'level';
    setTileCorners(map, tileIndex(map, 20, 20), [10, 11, 11, 10]);
    hover(at(20, 20));
    ev({ type: 'down', ...at(20, 20) });
    ev({ type: 'move', ...at(22, 21) });
    frame(16);
    expect(game.tool.land.levelTarget).toBe(10);
    expect(game.tool.brush?.tiles).toHaveLength(6);
    ev({ type: 'up', ...at(22, 21) });
    expect(cmds).toEqual([{ type: 'levelLand', x0: 20, y0: 20, x1: 22, y1: 21, targetHeight: 10 }]);
    expect(map.heights[tileIndex(map, 22, 21)]).toBe(10);
  });
});

describe('Land tool with touch (Phase 4 §7)', () => {
  it('a tap moves the ghost; each Raise tap applies once at the ghost', () => {
    const { game, cmds, map, at, click, frame } = setup();
    click(at(20, 20), { pointerType: 'touch' });
    expect(cmds).toEqual([]);
    frame(16);
    expect(game.tool.brush?.tiles).toEqual([tileIndex(map, 20, 20)]);
    queueLandAction(game.tool, 'raise');
    frame(32);
    queueLandAction(game.tool, 'raise');
    frame(48);
    expect(cmds).toEqual([
      { type: 'raiseLand', x: 20, y: 20, size: 1 },
      { type: 'raiseLand', x: 20, y: 20, size: 1 },
    ]);
    expect(map.heights[tileIndex(map, 20, 20)]).toBe(10);
    queueLandAction(game.tool, 'lower');
    frame(64);
    expect(cmds[2]).toEqual({ type: 'lowerLand', x: 20, y: 20, size: 1 });
  });

  it('two quick taps between frames both apply', () => {
    const { game, cmds, map, at, click, frame } = setup();
    click(at(20, 20), { pointerType: 'touch' });
    pressLandButton(game.tool, 'raise');
    releaseLandButton(game.tool);
    pressLandButton(game.tool, 'raise');
    releaseLandButton(game.tool);
    frame(16);
    frame(16 + 2 * LAND_REPEAT_MS);
    expect(cmds).toHaveLength(2);
    expect(map.heights[tileIndex(map, 20, 20)]).toBe(10);
  });

  it('press and hold on Raise repeats every 300 ms until release', () => {
    const { game, cmds, at, click, frame } = setup();
    click(at(20, 20), { pointerType: 'touch' });
    pressLandButton(game.tool, 'raise');
    frame(500);
    frame(500 + LAND_REPEAT_MS);
    frame(500 + 2 * LAND_REPEAT_MS);
    releaseLandButton(game.tool);
    frame(500 + 4 * LAND_REPEAT_MS);
    expect(cmds).toHaveLength(3);
  });

  it('corner mode: the tap marks the corner before Raise or Lower', () => {
    const { game, cmds, at, click, frame } = setup();
    game.tool.land.mode = 'corner';
    click(at(20, 20, 0.15, 0.85), { pointerType: 'touch' });
    frame(16);
    expect(game.tool.land.corner).toBe(3);
    queueLandAction(game.tool, 'lower');
    frame(32);
    expect(cmds).toEqual([{ type: 'lowerCorner', x: 20, y: 20, corner: 3 }]);
  });

  it('one-finger drag pans in brush modes', () => {
    const { game, cmds, at, ev } = setup();
    const cam = { ...game.camera };
    noteLandPointerDown(game.tool, 'touch', 0, false);
    ev({ type: 'down', ...at(20, 20), pointerType: 'touch' });
    ev({ type: 'move', x: at(20, 20).x + 60, y: at(20, 20).y, pointerType: 'touch' });
    ev({ type: 'up', x: at(20, 20).x + 60, y: at(20, 20).y, pointerType: 'touch' });
    expect(game.camera.centerX).not.toBe(cam.centerX);
    expect(cmds).toEqual([]);
  });

  it('level: drag a rectangle, change the target with + and −, then Confirm', () => {
    const { game, cmds, at, ev, frame } = setup();
    game.tool.land.mode = 'level';
    ev({ type: 'down', ...at(20, 20), pointerType: 'touch' });
    ev({ type: 'move', ...at(23, 22), pointerType: 'touch' });
    ev({ type: 'up', ...at(23, 22), pointerType: 'touch' });
    expect(cmds).toEqual([]);
    expect(landToolOf(game.tool).rectPending).toBe(true);
    expect(game.tool.land.levelTarget).toBe(8);
    queueLandAction(game.tool, 'raise');
    frame(16);
    queueLandAction(game.tool, 'raise');
    frame(32);
    queueLandAction(game.tool, 'lower');
    frame(48);
    expect(game.tool.land.levelTarget).toBe(9);
    frame(64);
    expect(game.tool.brush?.tiles).toHaveLength(12);
    expect(game.tool.brush?.cost).toBe(12 * FLAT_RAISE);
    queueLandAction(game.tool, 'confirm');
    frame(80);
    expect(cmds).toEqual([{ type: 'levelLand', x0: 20, y0: 20, x1: 23, y1: 22, targetHeight: 9 }]);
    expect(landToolOf(game.tool).rectPending).toBe(false);
  });

  it('a second finger cancels the level drag: nothing is built', () => {
    const { game, cmds, at, ev } = setup();
    game.tool.land.mode = 'level';
    ev({ type: 'down', ...at(20, 20), pointerType: 'touch', id: 1 });
    ev({ type: 'move', ...at(23, 22), pointerType: 'touch', id: 1 });
    ev({ type: 'down', ...at(25, 25), pointerType: 'touch', id: 2 });
    ev({ type: 'up', ...at(23, 22), pointerType: 'touch', id: 1 });
    ev({ type: 'up', ...at(25, 25), pointerType: 'touch', id: 2 });
    queueLandAction(game.tool, 'confirm');
    expect(cmds).toEqual([]);
    expect(landToolOf(game.tool).rectStart).toBe(-1);
  });
});

describe('Water tool (Phase 4 §7)', () => {
  it('click raises water; the Lower mode lowers it; Shift-click does the opposite', () => {
    const { game, cmds, map, at, hover, click } = setup('water');
    game.tool.land.size = 3;
    hover(at(20, 20));
    click(at(20, 20));
    expect(cmds).toEqual([{ type: 'raiseWater', x: 20, y: 20, size: 3 }]);
    expect(map.water[tileIndex(map, 20, 20)]).toBe(9);
    landToolOf(game.tool).waterMode = 'lower';
    click(at(20, 20));
    click(at(20, 20), { shift: true });
    expect(cmds.slice(1)).toEqual([
      { type: 'lowerWater', x: 20, y: 20, size: 3 },
      { type: 'raiseWater', x: 20, y: 20, size: 3 },
    ]);
  });

  it('the ghost shows the water cost', () => {
    const { game, at, hover, frame } = setup('water');
    game.tool.land.size = 5;
    hover(at(20, 20));
    frame(16);
    expect(game.tool.brush?.cost).toBe(25 * WATER_STEP_COST);
  });
});

describe('keyboard', () => {
  it('Page Up raises and Page Down lowers at the ghost (the screen centre before any pointer input)', () => {
    const { game, ctl, cmds, map } = setup();
    expect(ctl.keyDown('PageUp')).toBe(true);
    ctl.update(16);
    expect(ctl.keyDown('PageDown')).toBe(true);
    ctl.update(32);
    expect(cmds).toHaveLength(2);
    expect(cmds[0]?.type).toBe('raiseLand');
    expect(cmds[1]?.type).toBe('lowerLand');
    const c = cmds[0] as { x: number; y: number };
    expect(c.x).toBe(Math.floor(map.width / 2));
    expect(c.y).toBe(Math.floor(map.height / 2));
    expect(game.tool.brush).not.toBeNull();
  });
});

describe('tool switching', () => {
  it('leaving the tool clears the ghost and any rectangle', () => {
    const { game, ctl, at, hover, frame } = setup();
    hover(at(20, 20));
    frame(16);
    expect(game.tool.brush).not.toBeNull();
    ctl.setTool('inspect');
    expect(game.tool.brush).toBeNull();
    expect(landToolOf(game.tool).anchor).toBe(-1);
  });
});

describe('corner picking', () => {
  it('picks the quadrant of the tile in map terms for every view rotation', () => {
    const map = makeTestWorld().state.map;
    // Rotation 0: the N corner of (10, 10) is the top of its diamond.
    expect(landPickCorner(map, tileIndex(map, 10, 10), 10.2, 10.1, 0)).toBe(0);
    expect(landPickCorner(map, tileIndex(map, 10, 10), 10.9, 10.1, 0)).toBe(1);
    expect(landPickCorner(map, tileIndex(map, 10, 10), 10.9, 10.8, 0)).toBe(2);
    expect(landPickCorner(map, tileIndex(map, 10, 10), 10.1, 10.8, 0)).toBe(3);
    // Rotation 1: view (u, v) = (H − fy, fx). Map point (10.2, 10.1) is at view (53.9, 10.2).
    expect(landPickCorner(map, tileIndex(map, 10, 10), 53.9, 10.2, 1)).toBe(0);
    // Rotation 2: view (W − fx, H − fy).
    expect(landPickCorner(map, tileIndex(map, 10, 10), 64 - 10.9, 64 - 10.8, 2)).toBe(2);
    // Rotation 3: view (fy, W − fx).
    expect(landPickCorner(map, tileIndex(map, 10, 10), 10.8, 64 - 10.1, 3)).toBe(3);
  });
});
