/**
 * Tutorial bubbles (Phase 5 §4.11, §7; Phase 7 §4.11): each step shows in a bubble near the HUD (no mascot face or
 * speaker name since Task 23; the steps' `guide` field is not shown); a ring
 * highlights the target element (`data-tutorial-target`); text says "click" or "tap" after the last pointer type; the
 * bubble moves to the half of the screen away from the target so it never covers it. The `ui` checks (Next, camera, zoom, guest panel,
 * finance panel) are measured here and sent as `tutorialAdvance`. Owner: W3-I. Browser only.
 */
import { text } from '../../data/strings/en';
import { TUTORIAL_STEP_COUNT, TUTORIAL_STEPS, type TutorialStep, type TutorialStepId } from '../../sim/tutorial/steps';
import type { TutorialRun } from '../../sim/tutorial/types';
import type { World } from '../../sim/types';
import type { UiContext } from '../context';
import { confirmDialog } from '../dialogs';
import type { UiPart } from '../extensions';
import { h, setAttr, setText } from '../dom';
import { actVerb, cameraTiles } from './model';
import { lastPointer, modalOpen } from './shared';

/** Camera move (tiles) and zoom change of steps 2 and 3. */
export const TUTORIAL_CAMERA_TILES = 4;
export const TUTORIAL_ZOOM_CHANGE = 0.25;

/**
 * Control each step points at (Phase 7 §4.11): an old toolbar tool id, resolved with `ctx.controlFor` (its card, or
 * its deck button while the deck is closed), or a selector for HUD values. None for the map gestures, the welcome,
 * and the steps done on the map (`openRide`, `inspectGuest`).
 */
const TARGETS: Partial<Record<TutorialStepId, { tool: string } | { selector: string }>> = {
  footpath: { tool: 'footpath' },
  carousel: { tool: 'rides' },
  connectCarousel: { tool: 'queue' },
  stalls: { tool: 'stalls' },
  openPark: { tool: 'park' },
  swingTower: { tool: 'rides' },
  changePrice: { tool: 'park' },
  juniorCoaster: { tool: 'rides' },
  groundskeeper: { tool: 'staff' },
  financePanel: { tool: 'finance' },
  guests100: { selector: '[data-testid="hud-guests"]' },
};

/** Steps whose hint differs between mouse and touch beyond the "click / tap" word. */
const GESTURE_HINTS: ReadonlySet<TutorialStepId> = new Set(['moveView', 'zoom']);

function hintOf(step: TutorialStep, pointer: 'mouse' | 'touch'): string {
  if (GESTURE_HINTS.has(step.id)) return text(`prog.tutorial.hint.${step.id}.${pointer}`);
  return text(`prog.tutorial.hint.${step.id}`, { act: actVerb(pointer) });
}

const runOf = (world: World): TutorialRun | null => (world.state.scenario.kind === 'tutorial' ? world.state.scenario : null);

export function createTutorialUi(ctx: UiContext): UiPart & { finished(): void; ring: HTMLElement } {
  const { game, root } = ctx;
  const title = h('span', { class: 'tc-bubble-title', 'data-testid': 'tutorial-title' });
  const hint = h('span', { class: 'tc-bubble-hint', 'data-testid': 'tutorial-hint' });
  const counter = h('span', { class: 'tc-bubble-step', 'data-testid': 'tutorial-step' });
  const next = h('button', { type: 'button', class: 'btn primary', 'data-testid': 'tutorial-next', text: text('prog.tutorial.next'), onclick: () => advance('welcome') });
  const skipStep = h('button', { type: 'button', class: 'btn', 'data-testid': 'tutorial-skip-step', text: text('prog.tutorial.skipStep'), onclick: () => game.dispatch({ type: 'tutorialSkipStep' }) });
  const skipAll = h('button', {
    type: 'button',
    class: 'btn',
    'data-testid': 'tutorial-skip-all',
    text: text('prog.tutorial.skipAll'),
    onclick: () => confirmDialog(root, text('prog.tutorial.skipConfirm'), text('prog.tutorial.skipYes'), text('prog.tutorial.skipNo'), () => game.dispatch({ type: 'tutorialSkipAll' })),
  });
  const close = h('button', { type: 'button', class: 'btn primary', 'data-testid': 'tutorial-close', text: text('prog.tutorial.close'), onclick: () => { finaleWorld = null; } });
  const el = h(
    'aside',
    { class: 'tc-bubble', role: 'dialog', 'aria-live': 'polite', 'aria-label': text('prog.tutorial.label'), 'data-testid': 'tutorial-bubble', hidden: true },
    h('div', { class: 'tc-bubble-text' }, counter, title, hint),
    h('div', { class: 'tc-bubble-actions' }, skipAll, skipStep, next, close),
  );
  const ring = h('div', { class: 'tc-ring', 'aria-hidden': 'true', hidden: true });

  let shownWorld: World | null = null;
  let shownStep = -1;
  /** The world whose tutorial just finished: its finale bubble shows until Close. */
  let finaleWorld: World | null = null;
  let target: Element | null = null;
  let cam0 = { x: 0, y: 0, zoom: 1 };

  function advance(stepId: TutorialStepId): void {
    game.dispatch({ type: 'tutorialAdvance', stepId });
  }

  function setTarget(t: Element | null): void {
    if (t === target) return;
    target?.removeAttribute('data-tutorial-target');
    target = t;
    if (t && current) t.setAttribute('data-tutorial-target', current.id);
    // Phones: the chip row and the hand scroll sideways; bring a new target into view once.
    if (t instanceof HTMLElement && typeof t.scrollIntoView === 'function') t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /** The control of the current step, looked up every update: the ring moves from the deck button to the card. */
  function resolveTarget(): Element | null {
    const goal = current ? TARGETS[current.id] : undefined;
    if (!goal) return null;
    return 'tool' in goal ? ctx.controlFor(goal.tool) : document.querySelector(goal.selector);
  }

  let current: TutorialStep | null = null;

  function hide(): void {
    el.hidden = true;
    ring.hidden = true;
    setTarget(null);
  }

  function enterStep(world: World, run: TutorialRun): void {
    shownWorld = world;
    shownStep = run.stepIndex;
    current = TUTORIAL_STEPS[run.stepIndex] ?? null;
    cam0 = { x: game.camera.centerX, y: game.camera.centerY, zoom: game.camera.zoom };
    setTarget(null);
  }

  /** The `ui` checks of the current step. */
  function uiChecks(step: TutorialStep): void {
    const cam = game.camera;
    if (step.id === 'moveView' && cameraTiles(cam0.x, cam0.y, cam.centerX, cam.centerY) >= TUTORIAL_CAMERA_TILES) advance('moveView');
    else if (step.id === 'zoom' && Math.abs(cam.zoom - cam0.zoom) >= TUTORIAL_ZOOM_CHANGE) advance('zoom');
    else if (step.id === 'inspectGuest' && ctx.activePanel()?.kind === 'guest') advance('inspectGuest');
    else if (step.id === 'financePanel' && ctx.activePanel()?.kind === 'finance') advance('financePanel');
  }

  function place(): void {
    const r = target instanceof HTMLElement ? target.getBoundingClientRect() : null;
    const visible = r !== null && r.width > 0 && r.height > 0;
    ring.hidden = !visible;
    if (visible && r) {
      const pad = 4;
      ring.style.left = `${Math.round(r.left - pad)}px`;
      ring.style.top = `${Math.round(r.top - pad)}px`;
      ring.style.width = `${Math.round(r.width + pad * 2)}px`;
      ring.style.height = `${Math.round(r.height + pad * 2)}px`;
    }
    // Away from the target: a target in the lower half puts the bubble at the top, else at the bottom.
    const pos = visible && r && r.top + r.height / 2 > window.innerHeight / 2 ? 'top' : 'bottom';
    setAttr(el, 'data-pos', pos);
  }

  return {
    el,
    ring,
    finished() {
      finaleWorld = game.world;
    },
    update() {
      const world = game.world;
      const run = runOf(world);
      if (!run || modalOpen() || run.skipped || (run.done && finaleWorld !== world)) {
        hide();
        return;
      }
      el.hidden = false;
      const pointer = lastPointer();
      if (run.done) {
        // Finale after step 16.
        current = null;
        setTarget(null);
        setText(title, text('prog.tutorial.doneTitle'));
        setText(hint, text('prog.tutorial.doneText'));
        setText(counter, '');
        next.hidden = true;
        skipStep.hidden = true;
        skipAll.hidden = true;
        close.hidden = false;
        place();
        return;
      }
      if (world !== shownWorld || run.stepIndex !== shownStep) enterStep(world, run);
      const step = current;
      if (!step) return;
      setTarget(resolveTarget());
      setText(title, text(`prog.tutorial.step.${step.id}`));
      setText(hint, hintOf(step, pointer));
      setText(counter, text('prog.tutorial.stepOf', { n: run.stepIndex + 1, total: TUTORIAL_STEP_COUNT }));
      next.hidden = step.id !== 'welcome';
      skipStep.hidden = step.id === 'welcome';
      skipAll.hidden = false;
      close.hidden = true;
      place();
      if (step.check === 'ui') uiChecks(step);
    },
  };
}
