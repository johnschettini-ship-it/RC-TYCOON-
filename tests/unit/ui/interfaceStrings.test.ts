import { describe, expect, it } from 'vitest';
import { interfaceStrings } from '../../../src/data/strings/interface';
import { text } from '../../../src/data/strings/en';

describe('interface strings (Phase 7 §9)', () => {
  it('every key starts with ui. and no text ends with a period', () => {
    expect(Object.keys(interfaceStrings)).toHaveLength(35);
    for (const [k, v] of Object.entries(interfaceStrings)) {
      expect(k.startsWith('ui.'), k).toBe(true);
      expect(/\.$/.test(v), `${k}: "${v}"`).toBe(false);
    }
  });
  it('spec texts are exact and take params', () => {
    expect(text('ui.mood.thrill')).toBe('The park leans to Thrill');
    expect(text('ui.tip.cashLow')).toBe('Cash is below zero. Look at Finance');
    expect(text('ui.deck.cards', { deck: 'Rides' })).toBe('Rides cards');
    expect(text('ui.tip.showZone', { zone: 'Chill' })).toBe('Show Chill rides');
    expect(text('ui.details.sizeValue', { w: 3, d: 3 })).toBe('3 × 3 tiles');
  });
});
