import { describe, expect, it } from 'vitest';
import { Game } from '../../../../src/game';
import { InputController } from '../../../../src/input/controller';
import type { GesturePointerEvent } from '../../../../src/input/gestures';
import { centerOnMap } from '../../../../src/input/camera';
import { PatrolStroke, brushTiles, strokeLine } from '../../../../src/input/patrol';
import { worldToScreen } from '../../../../src/render/camera';
import { tileToScreen } from '../../../../src/render/iso';
import { toolOptions } from '../../../../src/render/management/toolOptions';
import { generateMap, tileIndex } from '../../../../src/sim/map';
import type { Command } from '../../../../src/sim/commands/types';
import { makeTestWorld } from '../../../helpers/world';

describe('patrol brush', () => {
  const map = generateMap();

  it('a 1 × 1 brush is the tile itself', () => {
    expect(brushTiles(map, tileIndex(map, 10, 10), 1, 'paint')).toEqual([tileIndex(map, 10, 10)]);
  });

  it('a 3 × 3 brush covers the 9 tiles around the centre, in index order', () => {
    const t = brushTiles(map, tileIndex(map, 10, 10), 3, 'paint');
    expect(t).toHaveLength(9);
    expect(t[0]).toBe(tileIndex(map, 9, 9));
    expect(t[8]).toBe(tileIndex(map, 11, 11));
    expect([...t].sort((a, b) => a - b)).toEqual(t);
  });

  it('paint never includes tiles outside the park (the border ring is not owned)', () => {
    const t = brushTiles(map, tileIndex(map, 1, 1), 5, 'paint');
    // Only x, y in 1..3 are owned: 3 × 3.
    expect(t).toHaveLength(9);
    for (const i of t) expect(map.owned[i]).toBe(1);
  });

  it('erase may cover any tile inside the map, but never leaves it', () => {
    const t = brushTiles(map, tileIndex(map, 0, 0), 3, 'erase');
    expect(t.sort((a, b) => a - b)).toEqual([tileIndex(map, 0, 0), tileIndex(map, 1, 0), tileIndex(map, 0, 1), tileIndex(map, 1, 1)]);
  });
});

describe('patrol stroke line (no gaps on a fast drag)', () => {
  const map = generateMap();
  it('walks every tile between two centres, 4-connected (a painted stroke stays connected)', () => {
    const line = strokeLine(map, tileIndex(map, 5, 5), tileIndex(map, 9, 7));
    expect(line).toEqual([
      tileIndex(map, 5, 5),
      tileIndex(map, 6, 5),
      tileIndex(map, 6, 6),
      tileIndex(map, 7, 6),
      tileIndex(map, 8, 6),
      tileIndex(map, 8, 7),
      tileIndex(map, 9, 7),
    ]);
    for (let k = 1; k < line.length; k++) {
      const a = line[k - 1] as number;
      const b = line[k] as number;
      expect(Math.abs((a % 64) - (b % 64)) + Math.abs(Math.floor(a / 64) - Math.floor(b / 64))).toBe(1);
    }
    expect(strokeLine(map, tileIndex(map, 5, 5), tileIndex(map, 5, 5))).toEqual([tileIndex(map, 5, 5)]);
  });
});

describe('patrol stroke → tile set and one command', () => {
  const map = generateMap();

  it('collects unique tiles and builds one editPatrol command (paint adds, sorted)', () => {
    const s = new PatrolStroke(42, 'paint');
    expect(s.command()).toBeNull();
    expect(s.stamp([30, 10, 20])).toBe(3);
    expect(s.stamp([20, 40])).toBe(1);
    expect(s.tiles).toEqual([30, 10, 20, 40]);
    expect(s.command()).toEqual({ type: 'editPatrol', staffId: 42, add: [10, 20, 30, 40], remove: [] });
  });

  it('erase removes', () => {
    const s = new PatrolStroke(7, 'erase');
    s.stamp(brushTiles(map, tileIndex(map, 10, 10), 1, 'erase'));
    expect(s.command()).toEqual({ type: 'editPatrol', staffId: 7, add: [], remove: [tileIndex(map, 10, 10)] });
  });
});

const VW = 800;
const VH = 600;

function setup(): {
  game: Game;
  ctl: InputController;
  cmds: Command[];
  at: (x: number, y: number) => { x: number; y: number };
  ev: (e: Partial<GesturePointerEvent> & Pick<GesturePointerEvent, 'type'>) => void;
  staffId: number;
} {
  const game = new Game(makeTestWorld());
  centerOnMap(game.camera, game.world.state.map);
  const cmds: Command[] = [];
  game.onCommand((c) => cmds.push(c));
  const hired = game.dispatch({ type: 'hireStaff', staffType: 'groundskeeper' });
  const staffId = hired.ok ? (hired.id as number) : -1;
  cmds.length = 0;
  const ctl = new InputController(game, { viewport: () => ({ width: VW, height: VH }) });
  const at = (x: number, y: number): { x: number; y: number } => {
    const w = tileToScreen(x + 0.5, y + 0.5, game.world.state.map.heights[0] ?? 0);
    return worldToScreen(game.camera, w.sx, w.sy, VW, VH);
  };
  const ev = (e: Partial<GesturePointerEvent> & Pick<GesturePointerEvent, 'type'>): void =>
    ctl.pointer({ id: 1, x: 0, y: 0, t: 0, pointerType: 'touch', button: 0, ...e });
  game.tool.tool = 'patrol';
  toolOptions(game.tool).patrolStaffId = staffId;
  toolOptions(game.tool).patrolMode = 'paint';
  toolOptions(game.tool).brush = 1;
  ctl.update(0);
  return { game, ctl, cmds, at, ev, staffId };
}

describe('patrol tool input (Phase 3 §7.2)', () => {
  it('a one-finger drag paints a ghost stroke and sends one editPatrol at the end', () => {
    const { game, cmds, at, ev, staffId } = setup();
    const map = game.world.state.map;
    ev({ type: 'down', ...at(20, 20) });
    ev({ type: 'move', ...at(22, 20), t: 30 });
    ev({ type: 'move', ...at(24, 20), t: 60 });
    expect(cmds).toEqual([]);
    expect(game.tool.drag?.tiles).toHaveLength(5);
    ev({ type: 'up', ...at(24, 20), t: 90 });
    expect(game.tool.drag).toBeNull();
    expect(cmds).toEqual([
      { type: 'editPatrol', staffId, add: [20, 21, 22, 23, 24].map((x) => tileIndex(map, x, 20)), remove: [] },
    ]);
    expect(game.world.state.staff.members[0]?.patrol).not.toBeNull();
  });

  it('a second finger drops the stroke: nothing is sent and a pinch starts', () => {
    const { game, cmds, at, ev } = setup();
    ev({ type: 'down', ...at(20, 20) });
    ev({ type: 'move', ...at(23, 20), t: 30 });
    expect(game.tool.drag).not.toBeNull();
    ev({ type: 'down', id: 2, ...at(30, 30), t: 40 });
    expect(game.tool.drag).toBeNull();
    ev({ type: 'move', id: 2, ...at(32, 30), t: 50 });
    ev({ type: 'up', id: 2, ...at(32, 30), t: 60 });
    ev({ type: 'up', ...at(23, 20), t: 70 });
    expect(cmds).toEqual([]);
  });

  it('a tap paints one brush stamp', () => {
    const { game, cmds, at, ev, staffId } = setup();
    toolOptions(game.tool).brush = 3;
    ev({ type: 'down', ...at(20, 20) });
    ev({ type: 'up', ...at(20, 20), t: 30 });
    expect(cmds).toHaveLength(1);
    const c = cmds[0] as Extract<Command, { type: 'editPatrol' }>;
    expect(c.staffId).toBe(staffId);
    expect(c.add).toHaveLength(9);
  });

  it('shift + left mouse drag uses the other mode (erase)', () => {
    const { game, cmds, at, ev, staffId } = setup();
    const map = game.world.state.map;
    ev({ type: 'down', pointerType: 'mouse', shift: true, ...at(20, 20) });
    ev({ type: 'move', pointerType: 'mouse', ...at(21, 20), t: 30 });
    ev({ type: 'up', pointerType: 'mouse', ...at(21, 20), t: 60 });
    expect(cmds).toEqual([{ type: 'editPatrol', staffId, add: [], remove: [tileIndex(map, 20, 20), tileIndex(map, 21, 20)] }]);
  });

  it('a right mouse drag pans and never paints', () => {
    const { game, cmds, at, ev } = setup();
    const x0 = game.camera.centerX;
    ev({ type: 'down', pointerType: 'mouse', button: 2, ...at(20, 20) });
    ev({ type: 'move', pointerType: 'mouse', ...at(25, 20), t: 30 });
    ev({ type: 'up', pointerType: 'mouse', ...at(25, 20), t: 60 });
    expect(cmds).toEqual([]);
    expect(game.camera.centerX).not.toBe(x0);
  });

  it('tiles outside the park are never painted', () => {
    const { game, cmds, at, ev } = setup();
    ev({ type: 'down', ...at(0, 5) });
    ev({ type: 'up', ...at(0, 5), t: 30 });
    expect(cmds).toEqual([]);
    expect(game.tool.drag).toBeNull();
  });
});
