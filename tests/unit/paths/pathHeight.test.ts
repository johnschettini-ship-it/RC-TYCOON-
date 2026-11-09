import { describe, expect, it } from 'vitest';
import { changePathHeight, nextRampMode, pathCommandHeight, pathHeightRange } from '../../../src/input/pathHeight';
import { defaultToolState } from '../../../src/render/types';
import { executeCommand } from '../../../src/sim/commands';
import { makeTestWorld } from '../../helpers/world';
import { T, setLand } from './helpers';

describe('path height control (Phase 4 §7: Page Up / Page Down, + / −, ramp toggle)', () => {
  it('ground paths send the Build 1 command; a height adds z and the ramp', () => {
    const tool = defaultToolState();
    expect(pathCommandHeight(tool)).toEqual({});
    tool.pathHeight.z = 12;
    tool.pathHeight.ramp = 'up';
    expect(pathCommandHeight(tool)).toEqual({ z: 12, ramp: 'up' });
  });

  it('raising from the ground starts at the lowest legal height over the pointer tile; lowering below returns to ground', () => {
    const w = makeTestWorld();
    const tool = defaultToolState();
    tool.hoverTile = T(w, 20, 20);
    changePathHeight(tool, w, -1);
    expect(tool.pathHeight.z).toBeNull();
    changePathHeight(tool, w, 1);
    expect(tool.pathHeight.z).toBe(9);
    changePathHeight(tool, w, 1);
    expect(tool.pathHeight.z).toBe(10);
    changePathHeight(tool, w, -1);
    changePathHeight(tool, w, -1);
    expect(tool.pathHeight.z).toBeNull();
    // Over a slope the lowest legal height is one more.
    setLand(w, 21, 20, 8, 0b0011);
    tool.hoverTile = T(w, 21, 20);
    changePathHeight(tool, w, 1);
    expect(tool.pathHeight.z).toBe(10);
  });

  it('stops at ground + 20 m, and every height it offers builds', () => {
    const w = makeTestWorld();
    const tool = defaultToolState();
    tool.hoverTile = T(w, 20, 20);
    expect(pathHeightRange(w, T(w, 20, 20))).toEqual({ min: 9, max: 28 });
    for (let k = 0; k < 40; k++) changePathHeight(tool, w, 1);
    expect(tool.pathHeight.z).toBe(28);
    const r = executeCommand(w, { type: 'buildPathLine', x0: 20, y0: 20, x1: 20, y1: 20, kind: 'footpath', ...pathCommandHeight(tool) });
    expect(r.ok).toBe(true);
  });

  it('the ramp toggle cycles flat → up → down', () => {
    expect(nextRampMode('flat')).toBe('up');
    expect(nextRampMode('up')).toBe('down');
    expect(nextRampMode('down')).toBe('flat');
  });
});
