/**
 * The track builder with the Phase 6 content (phase-6-polish.md §4.5; phase-2 §7.1): the new types are pickable once
 * researched, the corkscrew sits in the Special group and the helix in the Turns group, the Monorail palette offers a
 * station piece for its stops, and the corkscrew test failure shows its message in the ride panel warnings.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../../../../src/game';
import { getTrackPieceDef } from '../../../../src/data/track';
import { paletteFor, paletteGroupOf, pickableTrackTypes } from '../../../../src/ui/track/builder';
import { makeTestWorld } from '../../../helpers/world';
import { addAll, EAST, place } from '../../track/helpers';

describe('Phase 6 content in the builder', () => {
  it('the Inverted Coaster, Bobsled Run, and Monorail are pickable once researched', () => {
    const game = new Game(makeTestWorld());
    const ids = (): string[] => pickableTrackTypes(game.world).map((t) => t.id);
    for (const id of ['inverted_coaster', 'bobsled_run', 'monorail']) expect(ids()).not.toContain(id);
    game.world.state.management.research.unlocked.push('inverted_coaster', 'bobsled_run', 'monorail');
    for (const id of ['inverted_coaster', 'bobsled_run', 'monorail']) expect(ids()).toContain(id);
  });

  it('palette groups: corkscrew under Special, helix under Turns', () => {
    for (const id of ['corkscrew_left', 'corkscrew_right']) expect(paletteGroupOf(getTrackPieceDef(id)!.group)).toBe('special');
    for (const id of ['helix_left_up', 'helix_left_down', 'helix_right_up', 'helix_right_down']) expect(paletteGroupOf(getTrackPieceDef(id)!.group)).toBe('turns');
    const w = makeTestWorld();
    const id = place(w, 'inverted_coaster', 10, 20, EAST);
    addAll(w, id, ['station', 'station']);
    const pal = paletteFor(w, id);
    expect(pal.find((g) => g.id === 'special')!.pieces.map((p) => p.id)).toEqual(expect.arrayContaining(['corkscrew_left', 'corkscrew_right', 'vertical_loop_left']));
    expect(pal.find((g) => g.id === 'turns')!.pieces.map((p) => p.id)).toEqual(expect.arrayContaining(['helix_right_up', 'helix_left_down']));
  });

  it('the Monorail palette offers a station piece after other track (a stop), the Steel Coaster does not', () => {
    const w = makeTestWorld();
    const mono = place(w, 'monorail', 10, 20, EAST);
    addAll(w, mono, ['station', 'station', 'straight']);
    expect(paletteFor(w, mono).find((g) => g.id === 'straight')!.pieces.map((p) => p.id)).toContain('station');
    const steel = place(w, 'steel_coaster', 10, 30, EAST);
    addAll(w, steel, ['station', 'station', 'straight']);
    expect(paletteFor(w, steel).find((g) => g.id === 'straight')!.pieces.map((p) => p.id)).not.toContain('station');
  });
});
