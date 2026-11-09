import { describe, expect, it } from 'vitest';
import { KEY_BINDINGS, KEY_PAN_SPEED_PX, keyAction, keyboardPan, type PanDir } from '../../../src/input/keyboard';

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
