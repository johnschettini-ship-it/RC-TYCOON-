// tests/unit/ui/dragPaint.test.ts — touch controls spec 2026-11-18 §1–2: one finger moves the map in every tool;
// the drag tools paint only while their Paint toggle is on, and the toggle resets when the tool closes.
import { describe, expect, it } from 'vitest';
import { Game } from '../../../src/game';
import { centerOnMap } from '../../../src/input/camera';
import { InputController } from '../../../src/input/controller';
import { DRAG_PAINT_TOOLS, dragPaints, setDragPaints } from '../../../src/input/dragPaint';
import type { GesturePointerEvent } from '../../../src/input/gestures';
import { toolOptions } from '../../../src/render/management/toolOptions';
import { landToolOf, noteLandPointerDown, noteLandPointerUp } from '../../../src/render/terrainTools/toolState';
import type { ToolId } from '../../../src/render/types';
import type { Command } from '../../../src/sim/commands/types';
import { makeTestWorld } from '../../helpers/world';

const VW = 800;
const VH = 600;

function setup(tool: ToolId) {
  const game = new Game(makeTestWorld());
  centerOnMap(game.camera, game.world.state.map);
  const cmds: Command[] = [];
  game.onCommand((c) => cmds.push(c));
  landToolOf(game.tool).viewW = VW;
  landToolOf(game.tool).viewH = VH;
  const ctl = new InputController(game, { viewport: () => ({ width: VW, height: VH }) });
  game.tool.tool = tool;
  if (tool === 'patrol') {
    const hired = game.dispatch({ type: 'hireStaff', staffType: 'groundskeeper' });
    expect(hired.ok).toBe(true);
    toolOptions(game.tool).patrolStaffId = game.world.state.staff.members[0]?.id ?? -1;
  }
  ctl.update(0);
  cmds.length = 0;
  const ev = (e: Partial<GesturePointerEvent> & Pick<GesturePointerEvent, 'type'>): void => {
    const full: GesturePointerEvent = { id: 1, x: 0, y: 0, t: 0, pointerType: 'touch', button: 0, ...e };
    if (full.type === 'down') noteLandPointerDown(game.tool, full.pointerType, full.button, full.shift === true);
    if (full.type === 'up') noteLandPointerUp(game.tool);
    ctl.pointer(full);
  };
  /** A drag of 120 px from the screen centre, with frames between the moves. */
  const drag = (pointerType: 'touch' | 'mouse' = 'touch', shift = false): void => {
    ev({ type: 'down', x: 400, y: 300, pointerType, shift });
    for (let k = 1; k <= 4; k++) {
      ev({ type: 'move', x: 400 + 30 * k, y: 300, t: 40 * k, pointerType });
      ctl.update(40 * k);
    }
    ev({ type: 'up', x: 520, y: 300, t: 200, pointerType });
    ctl.update(1000);
  };
  return { game, ctl, cmds, ev, drag };
}

describe('one finger moves the map in every tool (spec §1)', () => {
  const tools: ToolId[] = ['inspect', 'footpath', 'queue', 'demolish', 'patrol', 'land', 'water', 'buyLand', 'scenery', 'pathItem'];
  for (const tool of tools) {
    it(`${tool}: a one-finger drag pans and sends nothing`, () => {
      const { game, cmds, drag } = setup(tool);
      const x0 = game.camera.centerX;
      drag('touch');
      expect(game.camera.centerX).toBeCloseTo(x0 - 120 / game.camera.zoom, 6);
      expect(cmds).toEqual([]);
      expect(game.tool.drag).toBeNull();
    });
  }

  for (const tool of ['footpath', 'patrol', 'land', 'buyLand'] as const) {
    it(`${tool}: a left mouse drag pans too`, () => {
      const { game, cmds, drag } = setup(tool);
      const x0 = game.camera.centerX;
      drag('mouse');
      expect(game.camera.centerX).not.toBe(x0);
      expect(cmds).toEqual([]);
    });
  }

  it('footpath: a Shift + left mouse drag still draws a line (desktop quick drawing)', () => {
    const { game, cmds, drag } = setup('footpath');
    const x0 = game.camera.centerX;
    drag('mouse', true);
    expect(game.camera.centerX).toBe(x0);
    expect(cmds).toHaveLength(1);
    expect(cmds[0]?.type).toBe('buildPathLine');
  });

  it('a touch long press in the path tool selects nothing (no panel over the builder)', () => {
    const { game, ctl, ev } = setup('footpath');
    ev({ type: 'down', x: 400, y: 300, t: 0 });
    ctl.update(900);
    expect(game.tool.selectedEntity).toBeNull();
    expect(game.tool.selectedTile).toBeNull();
  });
});

describe('the Paint toggle (spec §2)', () => {
  it('is off by default, only for the drag tools, and resets when the tool changes', () => {
    const { game, ctl } = setup('land');
    expect(dragPaints(game.tool)).toBe(false);
    setDragPaints(game.tool, true);
    expect(dragPaints(game.tool)).toBe(true);
    game.tool.tool = 'water';
    ctl.update(16);
    expect(dragPaints(game.tool)).toBe(false);
    setDragPaints(game.tool, true);
    game.tool.tool = 'footpath';
    ctl.update(32);
    expect(dragPaints(game.tool)).toBe(false);
    expect([...DRAG_PAINT_TOOLS].sort()).toEqual(['buyLand', 'land', 'patrol', 'water']);
  });

  it('patrol: with the toggle on, the same drag paints one stroke and the camera stays', () => {
    const { game, cmds, drag } = setup('patrol');
    setDragPaints(game.tool, true);
    const x0 = game.camera.centerX;
    drag('touch');
    expect(game.camera.centerX).toBe(x0);
    expect(cmds.map((c) => c.type)).toEqual(['editPatrol']);
  });

  it('land: with the toggle on, a mouse drag is a brush stroke', () => {
    const { game, cmds, drag } = setup('land');
    setDragPaints(game.tool, true);
    drag('mouse');
    expect(cmds.length).toBeGreaterThan(0);
    expect(cmds.every((c) => c.type === 'raiseLand')).toBe(true);
  });

  it('land: a mouse drag that pans applies nothing, even when held past the repeat time', () => {
    const { game, ctl, cmds, ev } = setup('land');
    const x0 = game.camera.centerX;
    ev({ type: 'down', x: 400, y: 300, pointerType: 'mouse' });
    ctl.update(100);
    ev({ type: 'move', x: 460, y: 300, t: 120, pointerType: 'mouse' });
    ctl.update(700);
    ctl.update(1400);
    ev({ type: 'up', x: 460, y: 300, t: 1500, pointerType: 'mouse' });
    ctl.update(1600);
    expect(game.camera.centerX).not.toBe(x0);
    expect(cmds).toEqual([]);
  });

  it('buy land: with the toggle on, a touch drag keeps a rectangle for Confirm', () => {
    const { game, cmds, drag } = setup('buyLand');
    setDragPaints(game.tool, true);
    drag('touch');
    expect(cmds).toEqual([]);
    expect(game.tool.brush?.tiles.length ?? 0).toBeGreaterThan(1);
  });
});
