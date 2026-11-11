import { describe, expect, it } from 'vitest';
import { Game } from '../../../src/game';
import type { LoadResult, SlotId, SlotInfo } from '../../../src/save';
import type { World } from '../../../src/sim/types';
import { SaveActions, type SaveBackend } from '../../../src/ui/saves';
import { makeTestWorld } from '../../helpers/world';

class FakeBackend implements SaveBackend {
  saved: Array<[SlotId, World]> = [];
  saveError: string | null = null;
  loadResult: LoadResult = { ok: false, error: 'This save comes from a newer version of the game' };
  infos: SlotInfo[] = [];
  save(slot: SlotId, world: World): string | null {
    if (this.saveError) return this.saveError;
    this.saved.push([slot, world]);
    return null;
  }
  load(_slot: SlotId): LoadResult {
    return this.loadResult;
  }
  list(): SlotInfo[] {
    return this.infos;
  }
}

function setup(): { game: Game; backend: FakeBackend; notes: Array<[string, string]>; actions: SaveActions } {
  const game = new Game(makeTestWorld());
  const backend = new FakeBackend();
  const notes: Array<[string, string]> = [];
  const actions = new SaveActions(game, backend, (m, k) => notes.push([m, k]));
  return { game, backend, notes, actions };
}

describe('save actions (Phase 1 §4.7)', () => {
  it('autosaves on the monthEnded event only', () => {
    const { game, backend, actions } = setup();
    actions.autosave([{ type: 'guestsChanged' }]);
    expect(backend.saved).toEqual([]);
    actions.autosave([{ type: 'guestsChanged' }, { type: 'monthEnded', monthIndex: 0 }]);
    expect(backend.saved).toEqual([['auto', game.world]]);
  });

  it('an autosave error shows as a toast', () => {
    const { backend, notes, actions } = setup();
    backend.saveError = 'Not implemented yet';
    actions.autosave([{ type: 'monthEnded', monthIndex: 3 }]);
    expect(notes).toEqual([['Autosave failed: Not implemented yet', 'warning']]);
  });

  it('saving to a slot clears the unsaved-changes flag; an error keeps it and shows the error', () => {
    const { game, backend, notes, actions } = setup();
    game.dirty = true;
    backend.saveError = 'Storage is full';
    expect(actions.save('2')).toBe(false);
    expect(game.dirty).toBe(true);
    backend.saveError = null;
    expect(actions.save('2')).toBe(true);
    expect(game.dirty).toBe(false);
    expect(notes).toEqual([['Storage is full', 'error'], ['Park saved to slot 2', 'info']]);
  });

  it('a failed load keeps the current game and shows the error', () => {
    const { game, notes, actions } = setup();
    const before = game.world;
    expect(actions.load('1')).toBe(false);
    expect(game.world).toBe(before);
    expect(notes).toEqual([['This save comes from a newer version of the game', 'error']]);
  });

  it('a good load replaces the world (paused)', () => {
    const { game, backend, actions } = setup();
    const next = makeTestWorld(99, 'Loaded Park');
    backend.loadResult = { ok: true, world: next };
    game.setSpeed(2);
    expect(actions.load('auto')).toBe(true);
    expect(game.world).toBe(next);
    expect(game.speed).toBe(0);
  });

  it('knows whether an autosave exists and lists the 3 manual slots', () => {
    const { backend, actions } = setup();
    expect(actions.hasAutosave()).toBe(false);
    backend.infos = [
      { slot: 'auto', parkName: 'A', savedAt: 'x', gameDate: 'Mar · Year 1 · 09:00', gameDateShort: 'Mar · Year 1' },
      { slot: '2', parkName: 'B', savedAt: 'y', gameDate: 'Apr · Year 1 · 10:00', gameDateShort: 'Apr · Year 1' },
    ];
    expect(actions.hasAutosave()).toBe(true);
    expect(actions.slots().map((s) => [s.slot, s.info?.parkName ?? null])).toEqual([['1', null], ['2', 'B'], ['3', null]]);
  });

  it('a backend that throws is reported, never crashes the UI', () => {
    const { notes, actions } = setup();
    const throwing = new SaveActions(new Game(makeTestWorld()), {
      save: () => {
        throw new Error('Not implemented yet');
      },
      load: () => {
        throw new Error('Boom');
      },
      list: () => {
        throw new Error('Nope');
      },
    }, (m, k) => notes.push([m, k]));
    expect(throwing.save('1')).toBe(false);
    expect(throwing.load('1')).toBe(false);
    expect(throwing.hasAutosave()).toBe(false);
    expect(notes).toEqual([['Not implemented yet', 'error'], ['Boom', 'error']]);
    void actions;
  });
});
