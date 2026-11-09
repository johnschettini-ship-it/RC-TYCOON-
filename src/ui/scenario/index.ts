/**
 * Scenario front end (Phase 5 §4.4, §4.10–4.13, §7): the objectives panel behind a HUD flag icon, the end screen on
 * `scenarioEnded` (the loop pauses: `game.setSpeed(0)`), award toasts with the fitting mascot, the park panel awards
 * section, and tutorial bubbles with the `data-tutorial-target` ring. Progress is written here: a won run on its
 * `scenarioEnded` event (once: a save loaded after the win sends no event) and `tutorialDone` when step 16 finishes.
 * The title screen flow is `./flow.ts` plus `../title.ts`. Owner: W3-I. Registered in `../extensions.ts`.
 */
import { recordScenarioWin } from '../../progress';
import { scenarioResult } from '../../sim/scenario/api';
import type { UiContext } from '../context';
import type { UiExtension, UiPart } from '../extensions';
import { h } from '../dom';
import { createAwardsSection, createAwardToasts } from './awardsUi';
import { createObjectives } from './objectives';
import { progressStore, titleFlow } from './shared';
import { injectScenarioStyles } from './styles';
import { createTutorialUi } from './tutorialUi';

interface Parts {
  objectives: ReturnType<typeof createObjectives>;
  toasts: ReturnType<typeof createAwardToasts>;
  tutorial: ReturnType<typeof createTutorialUi>;
}

const partsOf = new WeakMap<UiContext, Parts>();

function parts(ctx: UiContext): Parts {
  let p = partsOf.get(ctx);
  if (!p) {
    injectScenarioStyles();
    p = { objectives: createObjectives(ctx), toasts: createAwardToasts(), tutorial: createTutorialUi(ctx) };
    partsOf.set(ctx, p);
    ctx.game.onWorldChanged(() => p?.toasts.clear());
  }
  return p;
}

export const scenarioUi: UiExtension = {
  hud(ctx) {
    return parts(ctx).objectives.button;
  },

  bars(ctx): UiPart {
    const p = parts(ctx);
    const el = h('div', { class: 'tc-scenario-layer', style: 'display: contents' }, p.objectives.panel.el, p.toasts.el, p.tutorial.el, p.tutorial.ring);
    return {
      el,
      update(now) {
        p.objectives.panel.update(now);
        p.toasts.update(now);
        p.tutorial.update(now);
      },
    };
  },

  parkPanel(ctx) {
    return createAwardsSection(ctx);
  },

  onEvents(ctx, events) {
    const p = parts(ctx);
    const world = ctx.game.world;
    for (const ev of events) {
      if (ev.type === 'award') {
        p.toasts.push(ev.id);
      } else if (ev.type === 'scenarioEnded') {
        const run = world.state.scenario.kind === 'scenario' ? world.state.scenario : null;
        if (run && ev.status === 'won') recordScenarioWin(progressStore(), run, scenarioResult(world), new Date().toISOString());
        ctx.game.setSpeed(0);
        titleFlow()?.showEndScreen(ev);
      } else if (ev.type === 'tutorialStep' && ev.done) {
        progressStore().markTutorialDone();
        p.tutorial.finished();
      }
    }
  },
};
