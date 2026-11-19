/**
 * One tip, once (path clarity spec 2026-11-18 §5): the first time a ride is placed (a flat ride, or a track ride's
 * entrance), the path builder row shows "Guests walk: park entrance → footpath → queue → ride. Build a queue from the
 * glowing entrance, then a footpath to its end. Dimmed paths are not connected to the park entrance" with Close, as
 * long as some ride is still missing its queue or its footpath (there is a glow to look at). Placing a ride with its card opens the queue tool at the
 * entrance, so the tip shows at once, next to the glows it talks about; a ride placed another way keeps it waiting
 * until a path tool opens. It is marked seen in storage when it first shows (its own key, like `tc.tip.shiftDrag`; no
 * saved or settings field), stays until Close or until the path tool closes, and never comes back. Not in the
 * tutorial (it teaches the same), not while tips are off (Settings).
 */
import { text } from '../../data/strings/en';
import type { Command } from '../../sim/commands/types';
import { pathMarks } from '../../sim/pathing/reach';
import type { World } from '../../sim/types';
import { h } from '../dom';
import { icon } from '../icons';

export const CHAIN_TIP_KEY = 'tc.tip.pathChain';

export interface ChainTipInput {
  pathToolOn: boolean;
  tutorial: boolean;
  tipsOn: boolean;
  /** Some ride has no queue or no footpath to its queue right now (`pathMarks`), so there is a glow to point at. */
  needed: () => boolean;
}

/** True for a command that places a ride's entrance: a flat ride, or a track ride's entrance gate. */
export function armsChainTip(cmd: Command, result: { ok: boolean }): boolean {
  if (!result.ok) return false;
  return cmd.type === 'placeRide' || (cmd.type === 'placeTrackGate' && cmd.kind === 'entrance');
}

/**
 * The tip's state: armed by a ride placed outside the tutorial with tips on; 'showing' from its first show (a path tool
 * on and a ride still missing its queue or footpath) until Close or the tool closes; then done. Loading or starting
 * another park disarms it (a showing tip ends).
 */
export function createChainTipModel(store: { get(): boolean; set(): void }): {
  arm(i: Pick<ChainTipInput, 'tutorial' | 'tipsOn'>): void;
  reset(): void;
  close(): void;
  step(i: ChainTipInput): boolean;
} {
  let armed = false;
  let state: 'waiting' | 'showing' | 'done' = store.get() ? 'done' : 'waiting';
  return {
    arm(i) {
      if (!i.tutorial && i.tipsOn) armed = true;
    },
    reset() {
      armed = false;
      if (state === 'showing') state = 'done';
    },
    close() {
      state = 'done';
    },
    step(i) {
      if (state === 'waiting' && armed && i.pathToolOn && !i.tutorial && i.tipsOn && i.needed()) {
        state = 'showing';
        store.set();
      } else if (state === 'showing' && !i.pathToolOn) state = 'done';
      return state === 'showing';
    },
  };
}

const storage = {
  get(): boolean {
    try {
      return window.localStorage.getItem(CHAIN_TIP_KEY) === '1';
    } catch {
      return false;
    }
  },
  set(): void {
    try {
      window.localStorage.setItem(CHAIN_TIP_KEY, '1');
    } catch {
      // Blocked storage: the tip shows once per page load instead.
    }
  },
};

export interface ChainTipHost {
  onCommand(cb: (cmd: Command, result: { ok: boolean }) => void): void;
  onWorldChanged(cb: () => void): void;
  settings: { get(key: 'mascotTips'): boolean };
  world: World;
}

export function createChainTip(game: ChainTipHost): { el: HTMLElement; showing(): boolean; update(pathToolOn: boolean): void } {
  const model = createChainTipModel(storage);
  const tutorial = (): boolean => game.world.state.scenario.kind === 'tutorial';
  game.onCommand((cmd, result) => {
    if (armsChainTip(cmd, result)) model.arm({ tutorial: tutorial(), tipsOn: game.settings.get('mascotTips') });
  });
  game.onWorldChanged(() => model.reset());
  let visible = false;
  const close = h(
    'button',
    { type: 'button', class: 'icon-btn path-tip-close', 'data-testid': 'chain-tip-close', 'aria-label': text('paths.tipClose'), onclick: () => model.close() },
    icon('cross'),
  );
  const el = h('div', { class: 'path-tip chain-tip', 'data-testid': 'chain-tip', role: 'note', hidden: true }, h('span', { class: 'status-detail', text: text('paths.tipChain') }), close);
  return {
    el,
    showing: () => visible,
    update(pathToolOn) {
      visible = model.step({
        pathToolOn,
        tutorial: tutorial(),
        tipsOn: game.settings.get('mascotTips'),
        needed: () => {
          const m = pathMarks(game.world);
          return m.entrances.length + m.queueEnds.length > 0;
        },
      });
      if (el.hidden === visible) el.hidden = !visible;
    },
  };
}
