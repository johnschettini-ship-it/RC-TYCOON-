import { describe, expect, it } from 'vitest';
import { LAYOUT_BREAKPOINT_PX, LOW_HEIGHT_PX, SHEET_FRACTIONS, isLowScreen, nextSheetHeight, pillFields, snapSheet, toolbarPlacement } from '../../../src/ui/layout';

describe('layout breakpoint (Phase 0 §4.11)', () => {
  it('toolbar sits at the bottom below 900 CSS px and on the left from 900 px', () => {
    expect(LAYOUT_BREAKPOINT_PX).toBe(900);
    expect(toolbarPlacement(412, 915)).toBe('bottom');
    expect(toolbarPlacement(899, 800)).toBe('bottom');
    expect(toolbarPlacement(899.5, 800)).toBe('bottom');
    expect(toolbarPlacement(900, 800)).toBe('side');
    expect(toolbarPlacement(1280, 800)).toBe('side');
  });
});

describe('low layout (Task 19: a phone held sideways)', () => {
  it('a window is low when it is lower than 500 px and wider than high', () => {
    expect(LOW_HEIGHT_PX).toBe(500);
    for (const [w, h] of [[844, 390], [667, 375], [932, 430], [1280, 480]] as const) expect(isLowScreen(w, h), `${w} × ${h}`).toBe(true);
    for (const [w, h] of [[390, 844], [412, 915], [768, 1024], [1280, 800], [1280, 500], [500, 500]] as const) expect(isLowScreen(w, h), `${w} × ${h}`).toBe(false);
  });

  it('a low window has the bottom toolbar at every width, also from 900 px', () => {
    expect(toolbarPlacement(932, 430)).toBe('bottom');
    expect(toolbarPlacement(1280, 480)).toBe('bottom');
    expect(toolbarPlacement(844, 390)).toBe('bottom');
    expect(toolbarPlacement(1280, 800)).toBe('side');
  });
});

describe('bottom sheet heights (Phase 1 §7: drag handle, 3 heights)', () => {
  const vh = 1000;

  it('snaps to the nearest of the three heights', () => {
    expect(snapSheet(SHEET_FRACTIONS.peek * vh + 20, vh)).toBe('peek');
    expect(snapSheet(SHEET_FRACTIONS.half * vh - 30, vh)).toBe('half');
    expect(snapSheet(vh, vh)).toBe('full');
  });

  it('closes when dragged well below the lowest height', () => {
    expect(snapSheet(SHEET_FRACTIONS.peek * vh * 0.4, vh)).toBe('closed');
  });

  it('a tap on the handle cycles peek → half → full → peek', () => {
    expect(nextSheetHeight('peek')).toBe('half');
    expect(nextSheetHeight('half')).toBe('full');
    expect(nextSheetHeight('full')).toBe('peek');
  });
});

describe('status pill fields (Phase 7 §4.2)', () => {
  it('status pill fields by layout and text scale', () => {
    expect(pillFields('side', 100)).toEqual(['name', 'cash', 'guests', 'rating']);
    expect(pillFields('side', 175)).toEqual(['name', 'cash', 'guests', 'rating']);
    expect(pillFields('bottom', 100)).toEqual(['cash', 'guests', 'rating']);
    expect(pillFields('bottom', 125)).toEqual(['cash', 'guests', 'rating']);
    expect(pillFields('bottom', 150)).toEqual(['cash']);
    expect(pillFields('bottom', 175)).toEqual(['cash']);
  });

  it('the compact top row of the upright phone (Task 21) shows cash and guests, no rating', () => {
    expect(pillFields('bottom', 100, true)).toEqual(['cash', 'guests']);
    expect(pillFields('bottom', 125, true)).toEqual(['cash', 'guests']);
    expect(pillFields('bottom', 150, true)).toEqual(['cash']);
    expect(pillFields('bottom', 175, true)).toEqual(['cash']);
    expect(pillFields('side', 100, true)).toEqual(['name', 'cash', 'guests', 'rating']);
  });
});
