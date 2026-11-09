import { describe, expect, it } from 'vitest';
import { KEY_BINDINGS, KEY_PAN_SPEED_PX, keyAction, keyboardPan, type PanDir } from '../../../src/input/keyboard';
import { EDGE_SCROLL_PX, EDGE_SCROLL_SPEED_PX, edgeScrollDir } from '../../../src/input/edgeScroll';
import { Game } from '../../../src/game';
import { InputController } from '../../../src/input/controller';
import { centerOnMap } from '../../../src/input/camera';
import { makeTestWorld } from '../../helpers/world';

describe('keyboard map (Phase 0 §4.10, Phase 1 §7)', () => {
  const table: Array<[string, ReturnType<typeof keyAction>]> = [
    ['ArrowUp', { kind: 'pan', dir: 'up' }],
    ['ArrowDown', { kind: 'pan', dir: 'down' }],
    ['ArrowLeft', { kind: 'pan', dir: 'left' }],
    ['ArrowRight', { kind: 'pan', dir: 'right' }],
    ['w', { kind: 'pan', dir: 'up' }],
    ['W', { kind: 'pan', dir: 'up' }],
    ['a', { kind: 'pan', dir: 'left' }],
    ['s', { kind: 'pan', dir: 'down' }],
    ['d', { kind: 'pan', dir: 'right' }],
    ['+', { kind: 'zoom', dir: 'in' }],
    ['=', { kind: 'zoom', dir: 'in' }],
    ['-', { kind: 'zoom', dir: 'out' }],
    ['−', { kind: 'zoom', dir: 'out' }],
    [' ', { kind: 'togglePause' }],
    ['1', { kind: 'speed', speed: 1 }],
    ['2', { kind: 'speed', speed: 2 }],
    ['3', { kind: 'speed', speed: 4 }],
    ['p', { kind: 'tool', tool: 'footpath' }],
    ['P', { kind: 'tool', tool: 'footpath' }],
    ['q', { kind: 'tool', tool: 'queue' }],
    ['Q', { kind: 'tool', tool: 'queue' }],
    ['r', { kind: 'rotate' }],
    ['R', { kind: 'rotate' }],
    ['Delete', { kind: 'tool', tool: 'demolish' }],
    ['Escape', { kind: 'cancel' }],
    ['f', { kind: 'finance' }],
    ['F', { kind: 'finance' }],
  ];

  it.each(table)('%j maps to the spec action', (key, action) => {
    expect(keyAction(key)).toEqual(action);
  });

  it('unbound keys map to nothing', () => {
    expect(keyAction('x')).toBeNull();
    expect(keyAction('Enter')).toBeNull();
    expect(keyAction('4')).toBeNull();
  });

  it('no key is bound twice', () => {
    const keys = KEY_BINDINGS.flatMap((b) => b.keys);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('keyboard pan speed (600 screen px per second, scaled by 1 / zoom)', () => {
  const held = (...d: PanDir[]): Set<PanDir> => new Set(d);

  it('pans 600 world px per second at zoom 1', () => {
    expect(KEY_PAN_SPEED_PX).toBe(600);
    expect(keyboardPan(held('right'), 1000, 1)).toEqual({ dx: 600, dy: 0 });
    expect(keyboardPan(held('up'), 500, 1)).toEqual({ dx: 0, dy: -300 });
  });

  it('scales with 1 / zoom', () => {
    expect(keyboardPan(held('left'), 1000, 2)).toEqual({ dx: -300, dy: 0 });
    expect(keyboardPan(held('down'), 1000, 0.5)).toEqual({ dx: 0, dy: 1200 });
  });

  it('opposite keys cancel and nothing held means no movement', () => {
    expect(keyboardPan(held('left', 'right'), 1000, 1)).toEqual({ dx: 0, dy: 0 });
    expect(keyboardPan(held(), 1000, 1)).toEqual({ dx: 0, dy: 0 });
  });
});

describe('pan speed and edge scrolling (Phase 6 §4.9 Controls)', () => {
  const held = (...d: PanDir[]): Set<PanDir> => new Set(d);

  it('the pan speed setting scales keyboard panning (50–200%)', () => {
    expect(keyboardPan(held('right'), 1000, 1, 2)).toEqual({ dx: 1200, dy: 0 });
    expect(keyboardPan(held('up'), 1000, 1, 0.5)).toEqual({ dx: 0, dy: -300 });
  });

  it('the mouse within 16 px of a canvas edge scrolls toward that edge; corners scroll both ways', () => {
    expect(EDGE_SCROLL_PX).toBe(16);
    expect(edgeScrollDir(400, 300, 800, 600)).toEqual({ dx: 0, dy: 0 });
    expect(edgeScrollDir(3, 300, 800, 600)).toEqual({ dx: -1, dy: 0 });
    expect(edgeScrollDir(799, 300, 800, 600)).toEqual({ dx: 1, dy: 0 });
    expect(edgeScrollDir(400, 15, 800, 600)).toEqual({ dx: 0, dy: -1 });
    expect(edgeScrollDir(400, 16, 800, 600)).toEqual({ dx: 0, dy: 0 });
    expect(edgeScrollDir(799, 599, 800, 600)).toEqual({ dx: 1, dy: 1 });
    // Outside the canvas: no scrolling.
    expect(edgeScrollDir(-5, 300, 800, 600)).toEqual({ dx: 0, dy: 0 });
  });

  it('the controller edge-scrolls only with the setting on and a mouse near the edge', () => {
    const game = new Game(makeTestWorld());
    centerOnMap(game.camera, game.world.state.map);
    const ctl = new InputController(game, { viewport: () => ({ width: 800, height: 600 }) });
    ctl.update(0);
    ctl.pointer({ type: 'move', id: 1, x: 795, y: 300, t: 0, pointerType: 'mouse', button: 0 });
    const x0 = game.camera.centerX;
    ctl.update(100);
    expect(game.camera.centerX).toBe(x0);
    game.settings.set('edgeScrolling', true);
    ctl.update(200);
    expect(game.camera.centerX).toBeCloseTo(x0 + (EDGE_SCROLL_SPEED_PX * 100) / 1000);
    game.settings.set('panSpeed', 200);
    const x1 = game.camera.centerX;
    ctl.update(300);
    expect(game.camera.centerX).toBeCloseTo(x1 + (EDGE_SCROLL_SPEED_PX * 2 * 100) / 1000);
    ctl.hoverOut();
    const x2 = game.camera.centerX;
    ctl.update(400);
    expect(game.camera.centerX).toBe(x2);
  });
});
