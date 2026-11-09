/** Settings that change input and UI behaviour (Phase 6 §4.9): long-press time, confirm demolish, autosave. */
import { describe, expect, it } from 'vitest';
import { Game } from '../../../src/game';
import { InputController } from '../../../src/input/controller';
import { centerOnMap } from '../../../src/input/camera';
import type { Command } from '../../../src/sim/commands/types';
import { makeTestWorld, placeFootpath } from '../../helpers/world';
import { worldToScreen } from '../../../src/render/camera';
import { tileToScreen } from '../../../src/render/iso';
import { Content } from '../../../src/sim/map';
import { SaveActions, type SaveBackend } from '../../../src/ui/saves';
import type { SimEvent } from '../../../src/sim/types';

const VW = 800;
const VH = 600;

function setup(confirm?: (cmd: Command) => boolean): { game: Game; ctl: InputController; at: (x: number, y: number) => { x: number; y: number } } {
  const game = new Game(makeTestWorld());
  centerOnMap(game.camera, game.world.state.map);
  const ctl = new InputController(game, { viewport: () => ({ width: VW, height: VH }), confirm });
  ctl.update(0);
  const at = (x: number, y: number): { x: number; y: number } => {
    const w = tileToScreen(x + 0.5, y + 0.5, game.world.state.map.heights[0] ?? 0);
    return worldToScreen(game.camera, w.sx, w.sy, VW, VH);
  };
  return { game, ctl, at };
}

describe('long-press time from Settings → Controls', () => {
  it('a touch press opens Inspect after the setting\'s time (700 ms), not the default 500 ms', () => {
    const { game, ctl, at } = setup();
    game.settings.set('longPressMs', 700);
    const p = at(30, 30);
    ctl.pointer({ type: 'down', id: 1, ...p, t: 0, pointerType: 'touch', button: 0 });
    ctl.update(600);
    expect(game.tool.selectedTile).toBeNull();
    ctl.update(700);
    expect(game.tool.selectedTile).toBe(30 * game.world.state.map.width + 30);
  });
});

describe('Confirm demolish', () => {
  it('off: a demolish tap removes at once; on: the command waits for the player', () => {
    const asked: Command[] = [];
    const { game, ctl, at } = setup((cmd) => {
      asked.push(cmd);
      return true;
    });
    const map = game.world.state.map;
    const a = placeFootpath(game.world, 30, 30);
    const b = placeFootpath(game.world, 31, 30);
    game.tool.tool = 'demolish';
    ctl.update(10);
    const tap = (x: number, y: number, t: number): void => {
      const p = at(x, y);
      ctl.pointer({ type: 'down', id: 1, ...p, t, pointerType: 'mouse', button: 0 });
      ctl.pointer({ type: 'up', id: 1, ...p, t: t + 20, pointerType: 'mouse', button: 0 });
    };
    tap(30, 30, 100);
    expect(map.content[a]).toBe(Content.Empty);
    expect(asked).toEqual([]);
    game.settings.set('confirmDemolish', true);
    tap(31, 30, 300);
    expect(map.content[b]).toBe(Content.Footpath);
    expect(asked).toEqual([{ type: 'demolish', x: 31, y: 30 }]);
    // The UI dispatches it on yes.
    game.dispatch(asked[0] as Command);
    expect(map.content[b]).toBe(Content.Empty);
  });
});

describe('Autosave setting', () => {
  it('writes the autosave at a month end only while the setting is on', () => {
    const game = new Game(makeTestWorld());
    const saved: string[] = [];
    const backend: SaveBackend = {
      save: (slot) => {
        saved.push(slot);
        return null;
      },
      load: () => ({ ok: false, error: 'none' }),
      list: () => [],
    };
    const actions = new SaveActions(game, backend, () => {});
    const monthEnd: SimEvent[] = [{ type: 'monthEnded', monthIndex: 0 }];
    actions.autosave(monthEnd);
    expect(saved).toEqual(['auto']);
    game.settings.set('autosave', false);
    actions.autosave(monthEnd);
    expect(saved).toEqual(['auto']);
  });
});
