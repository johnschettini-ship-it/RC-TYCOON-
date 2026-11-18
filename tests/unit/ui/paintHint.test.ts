// tests/unit/ui/paintHint.test.ts — the drag tools' hint follows the Drag paints toggle (touch controls follow-up).
import { describe, expect, it } from 'vitest';
import { text } from '../../../src/data/strings/en';
import { dragHint } from '../../../src/ui/paintToggle';

describe('dragHint', () => {
  it('off: one finger moves the map, then the tool\'s own tap hint', () => {
    expect(dragHint(false, text('ui.patrol.tapPaint'))).toBe('One finger moves the map · Tap to paint');
    expect(dragHint(false, text('landUi.hint.touch'))).toBe('One finger moves the map · Tap a tile, then Raise or Lower');
  });

  it('on: a drag paints and two fingers move the map', () => {
    expect(dragHint(true, 'ignored')).toBe('Drag to paint · Two fingers move the map');
  });

  it('the toggle is named Drag paints, with On and Off', () => {
    expect([text('ui.dragPaints'), text('ui.toggleOn'), text('ui.toggleOff')]).toEqual(['Drag paints', 'On', 'Off']);
  });
});
