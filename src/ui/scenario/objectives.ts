/**
 * Objectives panel behind the HUD flag icon (Phase 5 §7): each goal with a progress bar, current value, target, and
 * streak; the deadline as "8 months left"; the result once the run is won or lost. Owner: W3-I. Browser only.
 * Side panel on desktop, bottom sheet above the toolbar on phones.
 */
import { getScenarioDef } from '../../data/scenarios';
import { text } from '../../data/strings/en';
import type { ScenarioRun } from '../../sim/scenario/types';
import type { UiContext } from '../context';
import type { UiPart } from '../extensions';
import { h, newId, setAttr, setText, toggleClass } from '../dom';
import { icon } from '../icons';
import { goalView, monthsLeftText } from './model';
import { modalOpen } from './shared';

const REFRESH_MS = 250;

const runOf = (ctx: UiContext): ScenarioRun | null => {
  const s = ctx.game.world.state.scenario;
  return s.kind === 'scenario' ? s : null;
};

export function createObjectives(ctx: UiContext): { button: UiPart; panel: UiPart } {
  let open = false;
  const panelId = newId('objectives');
  const titleId = newId('objectives-title');

  const button = h(
    'button',
    {
      type: 'button',
      class: 'tc-hud-btn',
      'data-testid': 'hud-objectives',
      'aria-label': text('prog.objectives.button'),
      title: text('prog.objectives.button'),
      'aria-expanded': 'false',
      'aria-controls': panelId,
      hidden: true,
      onclick: () => setOpen(!open),
    },
    icon('park'),
  );

  const status = h('p', { class: 'tc-deadline', role: 'status' });
  const deadline = h('p', { class: 'tc-deadline', 'data-testid': 'objectives-deadline' });
  const together = h('p', { class: 'tc-muted', text: text('prog.detail.allGoals') });
  const list = h('div', { class: 'tc-goal-list' });
  const panel = h(
    'section',
    { id: panelId, class: 'tc-objectives', role: 'region', 'aria-labelledby': titleId, 'data-testid': 'objectives-panel', hidden: true },
    h(
      'div',
      { class: 'tc-view-head' },
      h('h2', { id: titleId, text: text('prog.objectives.title') }),
      h('button', { type: 'button', class: 'btn', 'data-testid': 'objectives-close', text: text('prog.objectives.close'), onclick: () => setOpen(false) }),
    ),
    status,
    deadline,
    together,
    list,
  );

  interface Row {
    el: HTMLElement;
    text: HTMLElement;
    fill: HTMLElement;
    bar: HTMLElement;
    value: HTMLElement;
    streak: HTMLElement;
  }
  let rows: Row[] = [];
  let rowsFor: ScenarioRun | null = null;
  let last = -Infinity;

  function setOpen(v: boolean): void {
    open = v;
    last = -Infinity;
  }

  function buildRows(run: ScenarioRun): void {
    rowsFor = run;
    const def = getScenarioDef(run.id);
    rows = (def?.objectives ?? []).map(() => {
      const fill = h('i');
      const bar = h('div', { class: 'tc-bar', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100 }, fill);
      const t = h('span', { class: 'tc-goal-text' });
      const value = h('span');
      const streak = h('span');
      const el = h('div', { class: 'tc-goal', 'data-testid': 'objective' }, t, bar, h('div', { class: 'tc-goal-meta' }, value, streak));
      return { el, text: t, fill, bar, value, streak };
    });
    list.replaceChildren(...rows.map((r) => r.el));
    together.hidden = rows.length < 2;
  }

  function render(run: ScenarioRun): void {
    if (rowsFor !== run) buildRows(run);
    const def = getScenarioDef(run.id);
    const objectives = def?.objectives ?? [];
    objectives.forEach((o, i) => {
      const r = rows[i];
      if (!r) return;
      const v = goalView(o, run.objectives[i], def?.start.loan ?? 0);
      setText(r.text, v.text);
      toggleClass(r.el, 'met', v.met);
      const w = `${Math.round(v.fraction * 100)}%`;
      if (r.fill.style.width !== w) r.fill.style.width = w;
      setAttr(r.bar, 'aria-valuenow', String(Math.round(v.fraction * 100)));
      setAttr(r.bar, 'aria-label', v.text);
      setText(r.value, v.value);
      setText(r.streak, v.streak ?? '');
    });
    const state = run.status === 'active' ? '' : text(run.status === 'won' ? 'prog.objectives.won' : 'prog.objectives.lost');
    setText(status, state);
    status.hidden = state === '';
    const left = run.status === 'active' ? monthsLeftText(run.deadlineMonthIndex, ctx.game.world.state.tick) : null;
    setText(deadline, left ?? (run.deadlineMonthIndex === null ? text('prog.detail.noDeadline') : ''));
    deadline.hidden = deadline.textContent === '';
  }

  return {
    button: {
      el: button,
      update() {
        const run = runOf(ctx);
        button.hidden = run === null;
        if (!run && open) setOpen(false);
        setAttr(button, 'aria-expanded', open ? 'true' : 'false');
        toggleClass(button, 'won', run?.status === 'won');
        toggleClass(button, 'lost', run?.status === 'lost');
      },
    },
    panel: {
      el: panel,
      update(now) {
        const run = runOf(ctx);
        const show = open && run !== null && !modalOpen();
        panel.hidden = !show;
        if (!show || !run) return;
        if (now - last < REFRESH_MS && rowsFor === run) return;
        last = now;
        render(run);
      },
    },
  };
}
