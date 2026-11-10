import { describe, expect, it } from 'vitest';
import { LAYOUT_BREAKPOINT_PX, SHEET_FRACTIONS, nextSheetHeight, pillFields, snapSheet, toolbarPlacement } from '../../../src/ui/layout';

describe('layout breakpoint (Phase 0 §4.11)', () => {
  it('toolbar sits at the bottom below 900 CSS px and on the left from 900 px', () => {
    expect(LAYOUT_BREAKPOINT_PX).toBe(900);
    expect(toolbarPlacement(412)).toBe('bottom');
    expect(toolbarPlacement(899)).toBe('bottom');
    expect(toolbarPlacement(899.5)).toBe('bottom');
    expect(toolbarPlacement(900)).toBe('side');
    expect(toolbarPlacement(1280)).toBe('side');
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
});
