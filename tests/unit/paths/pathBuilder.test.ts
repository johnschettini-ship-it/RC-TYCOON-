// tests/unit/paths/pathBuilder.test.ts — touch controls spec 2026-11-18 §3: the path step builder.
import { describe, expect, it } from 'vitest';
import { Game } from '../../../src/game';
import { centerOnMap } from '../../../src/input/camera';
import { InputController } from '../../../src/input/controller';
import type { GesturePointerEvent } from '../../../src/input/gestures';
import { canUndoStep, nextStep, pathBuilderOf, startAt, stepPath, tapAt, undoStep } from '../../../src/input/pathBuilder';
import { worldToScreen } from '../../../src/render/camera';
import { tileToScreen } from '../../../src/render/iso';
import { previewPathCommand } from '../../../src/sim/commands/build/paths';
import type { Command } from '../../../src/sim/commands/types';
import { Content, tileIndex } from '../../../src/sim/map';
import { makeTestWorld, placeFootpath } from '../../helpers/world';

function setup(tool: 'footpath' | 'queue' = 'footpath') {
  const game = new Game(makeTestWorld());
  centerOnMap(game.camera, game.world.state.map);
  const cmds: Command[] = [];
  game.onCommand((c) => cmds.push(c));
  const ctl = new InputController(game, { viewport: () => ({ width: 800, height: 600 }) });
  game.tool.tool = tool;
  ctl.update(0);
  const map = game.world.state.map;
  const T = (x: number, y: number): number => tileIndex(map, x, y);
  const ground = map.heights[T(30, 30)] as number;
  return { game, ctl, cmds, map, T, ground };
}

describe('path step builder: start and steps', () => {
  it('a tap sets the start and builds nothing; the ghost is the start tile with the command\'s cost', () => {
    const { game, cmds, T } = setup();
    startAt(game, T(30, 30), 1);
    expect(cmds).toEqual([]);
    expect(game.tool.drag?.tiles).toEqual([T(30, 30)]);
    const want = previewPathCommand(game.world, { type: 'buildPathLine', x0: 30, y0: 30, x1: 30, y1: 30, kind: 'footpath' });
    expect(want.ok && want.cost).toBe(game.tool.drag?.cost);
    expect(game.tool.drag?.cost).toBe(1000);
    expect(game.tool.drag?.reason).toBeNull();
  });

  it('Forward builds the start first, then one tile ahead per press', () => {
    const { game, cmds, map, T } = setup();
    startAt(game, T(30, 30), 1);
    expect(stepPath(game)?.ok).toBe(true);
    expect(cmds).toEqual([{ type: 'buildPathLine', x0: 30, y0: 30, x1: 30, y1: 30, kind: 'footpath' }]);
    expect(game.tool.drag?.tiles).toEqual([T(31, 30)]);
    expect(stepPath(game)?.ok).toBe(true);
    expect(cmds[1]).toEqual({ type: 'buildPathLine', x0: 31, y0: 30, x1: 31, y1: 30, kind: 'footpath' });
    expect(map.content[T(31, 30)]).toBe(Content.Footpath);
    expect(game.tool.drag?.tiles).toEqual([T(32, 30)]);
    expect(game.tool.drag?.cost).toBe(1000);
  });

  it('Left and Right turn the heading (map terms: right is clockwise)', () => {
    const { game, cmds, T } = setup();
    startAt(game, T(30, 30), 1);
    stepPath(game);
    stepPath(game);
    stepPath(game, 'right');
    expect(cmds[2]).toMatchObject({ x0: 31, y0: 31 });
    stepPath(game, 'left');
    expect(cmds[3]).toMatchObject({ x0: 32, y0: 31 });
    expect(pathBuilderOf(game.tool).dir).toBe(1);
  });

  it('a tap next to an unbuilt start builds both with one two-tile buildPathLine', () => {
    const { game, cmds, T } = setup();
    startAt(game, T(30, 30), 1);
    tapAt(game, T(30, 31));
    expect(cmds).toEqual([{ type: 'buildPathLine', x0: 30, y0: 30, x1: 30, y1: 31, kind: 'footpath' }]);
    expect(pathBuilderOf(game.tool).end).toBe(T(30, 31));
    expect(pathBuilderOf(game.tool).dir).toBe(2);
  });

  it('a tap on a 4-neighbour of the end builds it; a diagonal or far tap moves the start', () => {
    const { game, cmds, T } = setup();
    startAt(game, T(30, 30), 1);
    stepPath(game);
    stepPath(game);
    tapAt(game, T(31, 29));
    expect(cmds[2]).toEqual({ type: 'buildPathLine', x0: 31, y0: 29, x1: 31, y1: 29, kind: 'footpath' });
    expect(pathBuilderOf(game.tool).dir).toBe(0);
    tapAt(game, T(32, 28));
    expect(cmds).toHaveLength(3);
    expect(pathBuilderOf(game.tool).end).toBe(T(32, 28));
    tapAt(game, T(40, 40));
    expect(cmds).toHaveLength(3);
    expect(pathBuilderOf(game.tool).end).toBe(T(40, 40));
  });

  it('a tap through the controller drives the builder (no build on the first tap)', () => {
    const { game, ctl, cmds, map } = setup('queue');
    const at = (x: number, y: number): { x: number; y: number } => {
      const w = tileToScreen(x + 0.5, y + 0.5, map.heights[0] ?? 0);
      return worldToScreen(game.camera, w.sx, w.sy, 800, 600);
    };
    const tap = (p: { x: number; y: number }, t: number): void => {
      const e: GesturePointerEvent = { type: 'down', id: 1, ...p, t, pointerType: 'touch', button: 0 };
      ctl.pointer(e);
      ctl.pointer({ ...e, type: 'up', t: t + 30 });
    };
    tap(at(12, 40), 0);
    expect(cmds).toEqual([]);
    tap(at(13, 40), 100);
    expect(cmds).toEqual([{ type: 'buildPathLine', x0: 12, y0: 40, x1: 13, y1: 40, kind: 'queue' }]);
  });

  it('a start on an existing path counts as built: the first step adds one tile; the heading points away from it', () => {
    const { game, cmds, T } = setup();
    placeFootpath(game.world, 30, 30);
    placeFootpath(game.world, 29, 30);
    startAt(game, T(30, 30));
    expect(pathBuilderOf(game.tool).dir).toBe(1);
    expect(game.tool.drag?.tiles).toEqual([T(31, 30)]);
    stepPath(game);
    expect(cmds).toEqual([{ type: 'buildPathLine', x0: 31, y0: 30, x1: 31, y1: 30, kind: 'footpath' }]);
  });

  it('switching footpath ↔ queue keeps the end; the next step is a queue', () => {
    const { game, ctl, cmds, T } = setup();
    startAt(game, T(30, 30), 1);
    stepPath(game);
    game.tool.tool = 'queue';
    ctl.update(16);
    expect(pathBuilderOf(game.tool).end).toBe(T(30, 30));
    stepPath(game);
    expect(cmds[1]).toMatchObject({ kind: 'queue', x0: 31 });
    game.tool.tool = 'inspect';
    ctl.update(32);
    expect(pathBuilderOf(game.tool).end).toBe(-1);
  });

  it('a new world drops the start', () => {
    const { game, T } = setup();
    startAt(game, T(30, 30), 1);
    game.setWorld(makeTestWorld(7));
    expect(nextStep(game)).toBeNull();
  });
});

describe('path step builder: failures and Undo', () => {
  it('a step the command refuses (no cash) changes nothing: no end move, no history; the ghost shows the reason', () => {
    const { game, T } = setup();
    startAt(game, T(30, 30), 1);
    game.world.state.park.cash = 0;
    const s = pathBuilderOf(game.tool);
    const r = stepPath(game);
    expect(r?.ok).toBe(false);
    expect(s.end).toBe(T(30, 30));
    expect(canUndoStep(game)).toBe(false);
    game.tool.drag = null;
    nextStep(game);
    expect(nextStep(game)?.reason).toBe('Not enough cash');
  });

  it('a step off the map has no command and says why', () => {
    const { game, map, T } = setup();
    placeFootpath(game.world, map.width - 1, 30);
    startAt(game, T(map.width - 1, 30), 1);
    expect(nextStep(game)).toMatchObject({ cmd: null, reason: 'Outside the park' });
    expect(stepPath(game)).toBeNull();
  });

  it('Undo demolishes only the tiles the last step added and puts the end back', () => {
    const { game, cmds, map, T } = setup();
    placeFootpath(game.world, 32, 30);
    startAt(game, T(30, 30), 1);
    tapAt(game, T(31, 30)); // 30 and 31 in one line
    stepPath(game); // 32 was there already
    stepPath(game); // 33
    expect(undoStep(game)).toBe(true);
    expect(cmds.at(-1)).toEqual({ type: 'demolish', x: 33, y: 30 });
    expect(pathBuilderOf(game.tool).end).toBe(T(32, 30));
    const n = cmds.length;
    expect(undoStep(game)).toBe(true);
    expect(cmds.length).toBe(n);
    expect(map.content[T(32, 30)]).toBe(Content.Footpath);
    expect(undoStep(game)).toBe(true);
    expect(map.content[T(30, 30)]).toBe(Content.Empty);
    expect(map.content[T(31, 30)]).toBe(Content.Empty);
    expect(pathBuilderOf(game.tool).started).toBe(false);
    expect(undoStep(game)).toBe(false);
  });
});

describe('path step builder: heights and slopes', () => {
  it('elevated flat steps send buildPathLine at z; up and down steps send buildPath with the ramp and move z', () => {
    const { game, cmds, T, ground } = setup();
    const z = ground + 3;
    game.tool.pathHeight = { z, ramp: 'flat' };
    startAt(game, T(30, 30), 1);
    expect(tapAt(game, T(31, 30))?.ok).toBe(true);
    expect(cmds[0]).toEqual({ type: 'buildPathLine', x0: 30, y0: 30, x1: 31, y1: 30, kind: 'footpath', z, ramp: 'flat' });
    game.tool.pathHeight.ramp = 'up';
    expect(game.tool.drag?.stepDir).toBe(1);
    expect(stepPath(game)?.ok).toBe(true);
    expect(cmds[1]).toEqual({ type: 'buildPath', x: 32, y: 30, kind: 'footpath', z, rampDir: 1 });
    expect(game.tool.pathHeight.z).toBe(z + 1);
    game.tool.pathHeight.ramp = 'down';
    expect(stepPath(game)?.ok).toBe(true);
    expect(cmds[2]).toEqual({ type: 'buildPath', x: 33, y: 30, kind: 'footpath', z, rampDir: 3 });
    expect(game.tool.pathHeight.z).toBe(z);
    game.tool.pathHeight.ramp = 'flat';
    expect(stepPath(game)?.ok).toBe(true);
    expect(cmds[3]).toMatchObject({ type: 'buildPathLine', x0: 34, z });
    const decks = game.world.state.elevatedPaths.map((p) => [p.x, p.z, p.rampDir]);
    expect(decks).toEqual([
      [30, z, -1],
      [31, z, -1],
      [32, z, 1],
      [33, z, 3],
      [34, z, -1],
    ]);
  });

  it('Undo of an up step demolishes that deck at its height and puts z back', () => {
    const { game, cmds, T, ground } = setup();
    const z = ground + 3;
    game.tool.pathHeight = { z, ramp: 'up' };
    startAt(game, T(30, 30), 1);
    stepPath(game);
    expect(cmds[0]).toEqual({ type: 'buildPath', x: 30, y: 30, kind: 'footpath', z, rampDir: 1 });
    expect(game.tool.pathHeight.z).toBe(z + 1);
    stepPath(game);
    expect(game.tool.pathHeight.z).toBe(z + 2);
    undoStep(game);
    expect(cmds.at(-1)).toEqual({ type: 'demolish', x: 31, y: 30, z: z + 1 });
    expect(game.tool.pathHeight.z).toBe(z + 1);
  });
});
