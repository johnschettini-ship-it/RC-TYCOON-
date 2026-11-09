import { describe, expect, it } from 'vitest';
import { guestStrings } from '../../../src/data/strings/guests';
import { text } from '../../../src/data/strings/en';
import { THOUGHT, addThought } from '../../../src/sim/guests/thoughts';
import { THOUGHT_MAX, THOUGHT_REPEAT_TICKS } from '../../../src/data/tuning/guests';
import { addGuestDirect, makeTestWorld } from '../../helpers/world';

describe('guest thought strings (master R4, R5)', () => {
  it('has text for every thought id and no final period', () => {
    for (const id of Object.values(THOUGHT)) {
      expect(guestStrings[id], id).toBeTypeOf('string');
      expect(guestStrings[id]?.endsWith('.'), id).toBe(false);
    }
  });

  it('matches the Phase 1 texts exactly', () => {
    expect(text(THOUGHT.hungry)).toBe('I am hungry');
    expect(text(THOUGHT.thirsty)).toBe('I am thirsty');
    expect(text(THOUGHT.needRestroom)).toBe('I need a restroom');
    expect(text(THOUGHT.tired)).toBe('I am tired');
    expect(text(THOUGHT.sick)).toBe('I feel a bit sick');
    expect(text(THOUGHT.lost)).toBe('I am lost');
    expect(text(THOUGHT.amazing)).toBe('That was amazing!');
    expect(text(THOUGHT.nice)).toBe('That was nice');
    expect(text(THOUGHT.tame)).toBe('That was a bit tame');
    expect(text(THOUGHT.tooIntense)).toBe('That looks too intense for me');
    expect(text(THOUGHT.rideTooExpensive)).toBe('That ride costs too much');
    expect(text(THOUGHT.snackTooExpensive)).toBe('Too expensive for a snack');
    expect(text(THOUGHT.drinkTooExpensive)).toBe('Too expensive for a drink');
    expect(text(THOUGHT.queueTooLong)).toBe('That queue is far too long');
    expect(text(THOUGHT.waitedTooLong)).toBe('I waited too long');
    expect(text(THOUGHT.goHome)).toBe('Time to go home');
    expect(text(THOUGHT.greatPark)).toBe('What a great park!');
  });

  it('matches the Phase 2 and Phase 3 texts', () => {
    expect(text('airtimeAwesome')).toBe('Floating out of my seat was awesome!');
    expect(text('neverUpsideDown')).toBe('Upside down? Never again');
    expect(text(THOUGHT.lostNeedMap)).toBe('I am lost. I need a map');
    expect(text(THOUGHT.chillWeekend)).toBe('Chill Weekend sounds perfect');
    expect(text(THOUGHT.thrillWeekend)).toBe('Thrill Weekend? Count me in!');
    expect(text(THOUGHT.tooCold)).toBe('Brr, it is cold');
    expect(Object.keys(guestStrings)).toHaveLength(17 + 2 + 24 + 2 + 1);
  });

  it('matches the Phase 4 texts', () => {
    expect(text(THOUGHT.flowersSad)).toBe('These flowers look sad');
    expect(text(THOUGHT.pathTooDark)).toBe('This path is too dark');
  });
});

describe('addThought (master R5)', () => {
  it('keeps the newest 5 thoughts as ids with the tick', () => {
    const w = makeTestWorld();
    const g = addGuestDirect(w, w.state.map.entranceTile);
    const ids = [THOUGHT.hungry, THOUGHT.thirsty, THOUGHT.tired, THOUGHT.sick, THOUGHT.lost, THOUGHT.nice];
    for (const id of ids) addThought(w, g, id);
    expect(g.thoughts).toHaveLength(THOUGHT_MAX);
    expect(g.thoughts.map((t) => t.id)).toEqual(ids.slice(1));
    expect(g.thoughts[0]).toEqual({ id: THOUGHT.thirsty, tick: w.state.tick });
  });

  it('stores params when given', () => {
    const w = makeTestWorld();
    const g = addGuestDirect(w, w.state.map.entranceTile);
    addThought(w, g, THOUGHT.nice, { ride: 'Carousel' });
    expect(g.thoughts[0]).toEqual({ id: THOUGHT.nice, tick: w.state.tick, params: { ride: 'Carousel' } });
  });

  it('shows the same thought at most once per 1,200 ticks', () => {
    const w = makeTestWorld();
    const g = addGuestDirect(w, w.state.map.entranceTile);
    const t0 = w.state.tick;
    expect(addThought(w, g, THOUGHT.hungry)).toBe(true);
    w.state.tick = t0 + THOUGHT_REPEAT_TICKS - 1;
    expect(addThought(w, g, THOUGHT.hungry)).toBe(false);
    expect(g.thoughts).toHaveLength(1);
    w.state.tick = t0 + THOUGHT_REPEAT_TICKS;
    expect(addThought(w, g, THOUGHT.hungry)).toBe(true);
    expect(g.thoughts.map((t) => t.tick)).toEqual([t0, t0 + THOUGHT_REPEAT_TICKS]);
  });

  it('prunes expired cooldowns so the record stays small', () => {
    const w = makeTestWorld();
    const g = addGuestDirect(w, w.state.map.entranceTile);
    addThought(w, g, THOUGHT.hungry);
    w.state.tick += THOUGHT_REPEAT_TICKS;
    addThought(w, g, THOUGHT.thirsty);
    expect(Object.keys(g.thoughtCooldowns)).toEqual([THOUGHT.thirsty]);
  });
});
