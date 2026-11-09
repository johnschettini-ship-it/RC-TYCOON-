/**
 * Track tool input routing (phase-2 §7.2–7.3): map gestures and keys reach the builder through the real
 * `InputController`; pans and pinches still move the camera and never add pieces.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../../../../src/game';
import { centerOnMap } from '../../../../src/input/camera';
import { InputController } from '../../../../src/input/controller';
import type { GesturePointerEvent } from '../../../../src/input/gestures';
import { followBox, isTrackKey } from '../../../../src/input/track';
import { worldToScreen } from '../../../../src/render/camera';
import { tileToScreen } from '../../../../src/render/iso';
import { trackToolOf } from '../../../../src/render/track/toolState';
import type { Command } from '../../../../src/sim/commands/types';
import { tileIndex } from '../../../../src/sim/map';
import { enterPieces, selectPiece, startStation } from '../../../../src/ui/track/builder';
import { makeTestWorld } from '../../../helpers/world';
import { dataOf, EAST, place } from '../../track/helpers';

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
  const at = (x: number, y: number): { x: number; y: number } => {
    const w = tileToScreen(x + 0.5, y + 0.5, game.world.state.map.heights[0] ?? 0);
    return worldToScreen(game.camera, w.sx, w.sy, VW, VH);
  };
  const ev = (e: Partial<GesturePointerEvent> & Pick<GesturePointerEvent, 'type'>): void =>
    ctl.pointer({ id: 1, x: 0, y: 0, t: 0, pointerType: 'touch', button: 0, ...e });
  return { game, ctl, cmds, at, ev };
}

describe('track tool gestures', () => {
  it('before any pointer input the station ghost sits clear of the builder panel', () => {
    const { game, ctl } = setup();
    startStation(game, 'steel_coaster');
    ctl.update(0);
    const g = trackToolOf(game.tool).stationGhost;
    expect(g).not.toBeNull();
    const b = followBox(VW);
    const p = worldToScreen(game.camera, tileToScreen(g!.x + 0.5, g!.y + 0.5, 8).sx, tileToScreen(g!.x + 0.5, g!.y + 0.5, 8).sy, VW, VH);
    expect(Math.abs(p.x - b.tx * VW)).toBeLessThan(40);
    expect(Math.abs(p.y - b.ty * VH)).toBeLessThan(40);
    // The generic hover highlight and ghost stay off in the track tool.
    expect(game.tool.ghost).toBeNull();
    expect(game.tool.hoverTile).toBeNull();
  });

  it('a touch tap moves the station ghost; a mouse click places it', () => {
    const { game, ctl, cmds, at, ev } = setup();
    startStation(game, 'steel_coaster');
    ctl.update(0);
    const p = at(20, 20);
    ev({ type: 'down', ...p, t: 10 });
    ev({ type: 'up', ...p, t: 60 });
    expect(cmds).toEqual([]);
    expect(trackToolOf(game.tool).stationGhost).toMatchObject({ x: 20, y: 20 });
    expect(trackToolOf(game.tool).touch).toBe(true);
    const q = at(24, 30);
    ev({ type: 'move', ...q, pointerType: 'mouse', t: 100 });
    expect(trackToolOf(game.tool).stationGhost).toMatchObject({ x: 24, y: 30 });
    ev({ type: 'down', ...q, pointerType: 'mouse', t: 120 });
    ev({ type: 'up', ...q, pointerType: 'mouse', t: 160 });
    expect(cmds[0]).toEqual({ type: 'placeStation', typeId: 'steel_coaster', x: 24, y: 30, dir: 1 });
    expect(trackToolOf(game.tool).phase).toBe('pieces');
  });

  it('a pinch while the builder is open zooms and adds no piece; a one-finger drag pans', () => {
    const { game, ctl, cmds, at, ev } = setup();
    const id = place(game.world, 'steel_coaster', 30, 30, EAST);
    enterPieces(game, id);
    selectPiece(game, 'straight');
    ctl.update(0);
    const ghost = trackToolOf(game.tool).pieceGhost!;
    const g = at(ghost.piece.x, ghost.piece.y);
    const zoom0 = game.camera.zoom;
    ev({ type: 'down', id: 1, x: g.x - 40, y: g.y, t: 0 });
    ev({ type: 'down', id: 2, x: g.x + 40, y: g.y, t: 5 });
    ev({ type: 'move', id: 1, x: g.x - 90, y: g.y, t: 30 });
    ev({ type: 'move', id: 2, x: g.x + 90, y: g.y, t: 30 });
    ev({ type: 'up', id: 1, x: g.x - 90, y: g.y, t: 60 });
    ev({ type: 'up', id: 2, x: g.x + 90, y: g.y, t: 60 });
    expect(game.camera.zoom).toBeGreaterThan(zoom0);
    const cx = game.camera.centerX;
    ev({ type: 'down', id: 3, x: 300, y: 300, t: 100 });
    ev({ type: 'move', id: 3, x: 360, y: 300, t: 130 });
    ev({ type: 'up', id: 3, x: 360, y: 300, t: 160 });
    expect(game.camera.centerX).not.toBe(cx);
    expect(cmds).toEqual([]);
    expect(dataOf(game.world, id).pieces).toHaveLength(1);
  });
});

describe('track tool keys (§7.2)', () => {
  it('Enter builds, Backspace undoes, 1–5 pick groups (not game speed), C toggles chain, Esc leaves', () => {
    const { game, ctl, cmds } = setup();
    const id = place(game.world, 'steel_coaster', 30, 30, EAST);
    enterPieces(game, id);
    selectPiece(game, 'straight');
    for (const k of ['Enter', 'Backspace', 'c', 'C', '1', '5', 'Escape', 'r']) expect(isTrackKey(k)).toBe(true);
    expect(isTrackKey('w')).toBe(false);
    expect(ctl.keyDown('Enter')).toBe(true);
    expect(cmds.at(-1)).toEqual({ type: 'addTrackPiece', rideId: id, defId: 'straight' });
    expect(ctl.keyDown('Backspace')).toBe(true);
    expect(cmds.at(-1)).toEqual({ type: 'removeLastTrackPiece', rideId: id });
    expect(game.tool.tool).toBe('track');
    const speed = game.speed;
    ctl.keyDown('3');
    expect(trackToolOf(game.tool).group).toBe('turns');
    expect(game.speed).toBe(speed);
    ctl.keyDown('c');
    expect(trackToolOf(game.tool).chain).toBe(true);
    ctl.keyDown('Escape');
    expect(game.tool.tool).toBe('inspect');
    expect(dataOf(game.world, id).pieces).toHaveLength(1);
    // Outside the builder the keys do their usual jobs again.
    ctl.keyDown('3');
    expect(game.speed).toBe(4);
  });

  it('R rotates the station ghost; the builder resets when another tool is picked', () => {
    const { game, ctl } = setup();
    startStation(game, 'steel_coaster');
    ctl.update(0);
    ctl.keyDown('r');
    expect(game.tool.rotation).toBe(2);
    ctl.update(16);
    expect(trackToolOf(game.tool).stationGhost?.dir).toBe(2);
    ctl.setTool('footpath');
    ctl.update(32);
    expect(trackToolOf(game.tool).phase).toBe('idle');
  });

  it('follow keeps the track end in view as pieces are added', () => {
    const { game, ctl } = setup();
    const map = game.world.state.map;
    const id = place(game.world, 'steel_coaster', 5, 5, EAST);
    // Look far away from the station.
    const far = tileToScreen(50, 50, 8);
    game.camera.centerX = far.sx;
    game.camera.centerY = far.sy;
    enterPieces(game, id);
    ctl.update(0);
    const end = tileToScreen(6.5, 5.5, 8);
    const s = worldToScreen(game.camera, end.sx, end.sy, VW, VH);
    expect(s.x).toBeGreaterThan(0);
    expect(s.x).toBeLessThan(VW);
    expect(s.y).toBeGreaterThan(0);
    expect(s.y).toBeLessThan(VH);
    expect(tileIndex(map, 5, 5)).toBeGreaterThan(0);
  });
});
