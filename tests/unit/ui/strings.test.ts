import { describe, expect, it } from 'vitest';
import { uiStrings } from '../../../src/data/strings/ui';
import { text } from '../../../src/data/strings/en';

describe('UI strings (master R4)', () => {
  it('every key starts with ui. and no message ends with a period', () => {
    for (const [k, v] of Object.entries(uiStrings)) {
      expect(k.startsWith('ui.'), k).toBe(true);
      expect(v.trim().length, k).toBeGreaterThan(0);
      expect(/\.$/.test(v), `${k}: "${v}"`).toBe(false);
    }
  });

  it('spec strings are exact', () => {
    expect(text('ui.ride.entranceQueue')).toBe('The entrance needs a queue path');
    expect(text('ui.ride.exitPath')).toBe('The exit needs a footpath');
    expect(text('ui.stall.facePath')).toBe('This stall must face a footpath');
    expect(text('ui.ghost.noCash')).toBe('Not enough cash');
    expect(text('ui.title.newPark')).toBe('New Park');
    expect(text('ui.menu.quit')).toBe('Quit to title');
  });

  it('are reachable through the shared string table with params', () => {
    expect(text('ui.slot.label', { n: 2 })).toBe('Slot 2');
  });
});
