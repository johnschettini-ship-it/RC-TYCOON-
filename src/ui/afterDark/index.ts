/**
 * After Dark park setting (Phase 4 §7): the park panel switch with a short help line (disabled with the scenario's
 * reason when the scenario fixes it) and the share of lit footpath tiles. The "Guests dislike dark paths. Build
 * lamps" toast is the `setAfterDark` warning, which the UI root shows for every command result. Owner: W3-F.
 * Registered in `../extensions.ts`. Works with mouse, keyboard, and touch (a 44 × 44 px `.btn`).
 */
import { text } from '../../data/strings/en';
import { litShare } from '../../sim/lighting/api';
import { afterDarkLocked } from '../../sim/scenario/api';
import type { UiExtension, UiPart } from '../extensions';
import type { UiContext } from '../context';
import { h, newId, setAttr, setText } from '../dom';
import { section, statRow } from '../widgets';
import { afterDarkView } from './view';

/** The lit share is a full light-map diff: refresh it at most this often while the panel is open. */
const LIT_REFRESH_MS = 500;

function afterDarkSection(ctx: UiContext): UiPart {
  const { game } = ctx;
  const helpId = newId('after-dark-help');
  const button = h('button', {
    type: 'button',
    class: 'btn toggle',
    'data-testid': 'after-dark-switch',
    'aria-describedby': helpId,
    onclick: () => game.dispatch({ type: 'setAfterDark', on: !game.world.state.park.afterDark }),
  });
  const help = h('p', { id: helpId, class: 'muted', 'data-testid': 'after-dark-help' });
  const lit = statRow(text('night.litPaths'));
  const el = section(text('night.title'), button, help, lit.el);
  el.dataset.testid = 'after-dark-section';
  let share = 1;
  let sharedAt = -Infinity;
  let shareWorld = game.world;
  return {
    el,
    update(now) {
      const world = game.world;
      if (now - sharedAt >= LIT_REFRESH_MS || world !== shareWorld) {
        share = litShare(world);
        sharedAt = now;
        shareWorld = world;
      }
      const v = afterDarkView(world.state, share, afterDarkLocked(world.state));
      setText(button, v.label);
      setAttr(button, 'aria-pressed', v.pressed ? 'true' : 'false');
      if (button.disabled !== v.disabled) button.disabled = v.disabled;
      setText(help, v.help);
      lit.set(v.litPaths);
    },
  };
}

export const afterDarkUi: UiExtension = {
  parkPanel: afterDarkSection,
};
