import { describe, expect, it } from 'vitest';
import { addGuestDirect, makeTestWorld, placeFootpath, placeQueue, placeRideDirect, placeStallDirect } from '../../helpers/world';
import { guestTargetLabel, guestThoughtLines, rideWarnings, stallWarnings, temperamentLabel } from '../../../src/ui/info';
import { PARK_NAME_MAX, validateParkName } from '../../../src/ui/names';
import { en } from '../../../src/data/strings/en';

describe('ride and stall warnings (shown until fixed)', () => {
  it('a ride without a queue at the entrance and a footpath at the exit shows both warnings', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 10, 10, 0);
    expect(rideWarnings(w, ride)).toEqual(['The entrance needs a queue path', 'The exit needs a footpath']);
    // Rotation 0: the front faces south; the entrance gate is (11, 12), outside (11, 13); exit outside (11, 9).
    placeQueue(w, 11, 13);
    expect(rideWarnings(w, ride)).toEqual(['The exit needs a footpath']);
    placeFootpath(w, 11, 9);
    expect(rideWarnings(w, ride)).toEqual([]);
  });

  it('a stall must face a footpath', () => {
    const w = makeTestWorld();
    const stall = placeStallDirect(w, 'snack_shack', 20, 20, 2);
    expect(stallWarnings(w, stall)).toEqual(['This stall must face a footpath']);
    placeFootpath(w, 20, 21);
    expect(stallWarnings(w, stall)).toEqual([]);
  });
});

describe('guest panel text', () => {
  it('names the current target', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'big_wheel', 10, 10, 0);
    const stall = placeStallDirect(w, 'fizz_stand', 20, 20, 2);
    const g = addGuestDirect(w, placeFootpath(w, 30, 30));
    expect(guestTargetLabel(w, g)).toBe('Nowhere in particular');
    g.target = `ride:${ride.id}`;
    expect(guestTargetLabel(w, g)).toBe('Big Wheel');
    g.target = `stall:${stall.id}`;
    expect(guestTargetLabel(w, g)).toBe('Fizz Stand');
    g.target = 'exit';
    expect(guestTargetLabel(w, g)).toBe('The park exit');
    g.target = 'ride:9999';
    expect(guestTargetLabel(w, g)).toBe('Nowhere in particular');
  });

  it('shows the last 5 thoughts, newest first, through the string table', () => {
    en['test.thought.a'] = 'I like {ride}';
    const w = makeTestWorld();
    const g = addGuestDirect(w, placeFootpath(w, 30, 30), {
      thoughts: [1, 2, 3, 4, 5, 6].map((n) => ({ id: 'test.thought.a', tick: n, params: { ride: `R${n}` } })),
    });
    expect(guestThoughtLines(g)).toEqual(['I like R6', 'I like R5', 'I like R4', 'I like R3', 'I like R2']);
    delete en['test.thought.a'];
  });

  it('labels temperament with its group', () => {
    expect(temperamentLabel(20)).toBe('20 · Chill');
    expect(temperamentLabel(50)).toBe('50 · Family');
    expect(temperamentLabel(65)).toBe('65 · Thrill');
  });
});

describe('park name (1–32 characters)', () => {
  it('accepts 1 to 32 characters after trimming', () => {
    expect(PARK_NAME_MAX).toBe(32);
    expect(validateParkName('  Fun Land ')).toEqual({ ok: true, name: 'Fun Land' });
    expect(validateParkName('A')).toEqual({ ok: true, name: 'A' });
    expect(validateParkName('x'.repeat(32))).toEqual({ ok: true, name: 'x'.repeat(32) });
  });

  it('rejects empty and too-long names', () => {
    const err = { ok: false, error: 'Enter a name of 1 to 32 characters' };
    expect(validateParkName('')).toEqual(err);
    expect(validateParkName('    ')).toEqual(err);
    expect(validateParkName('x'.repeat(33))).toEqual(err);
  });
});
