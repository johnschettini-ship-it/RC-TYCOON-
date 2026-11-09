/**
 * Research panel (Phase 3 §7.1): budget level, one focus toggle per category, the current item with a
 * progress bar and estimated unlock month, and the items research has unlocked. Owner: W2-B.
 */
import { RESEARCH_CATEGORIES } from '../../data/research';
import type { ResearchCategory } from '../../data/catalog/types';
import { text } from '../../data/strings/en';
import { RESEARCH_BUDGET_MONTHLY, RESEARCH_LEVELS, type ResearchLevelKey } from '../../data/tuning/management';
import { monthIndexOf } from '../../sim/time';
import type { PanelView, UiContext } from '../context';
import { h, setAttr, setText, toggleClass } from '../dom';
import { monthLabel } from '../finance';
import { formatMoney } from '../format';
import { meterBar, section, statRow } from '../widgets';
import { itemsLeft, researchEta, researchView } from './research';
import { segmented } from './widgets';

export function createResearchPanel(ctx: UiContext): PanelView {
  const { game } = ctx;
  const budget = segmented<ResearchLevelKey>(
    text('ui.research.budget'),
    RESEARCH_LEVELS.map((l) => ({
      value: l,
      label: text(`ui.research.level.${l}`),
      detail: text('ui.research.levelCost', { cost: formatMoney(RESEARCH_BUDGET_MONTHLY[l]) }),
      testId: `research-level-${l}`,
    })),
    (level) => game.dispatch({ type: 'setResearchBudget', level }),
    'levels',
  );

  const name = h('p', { class: 'research-name', 'data-testid': 'research-current' });
  const progress = meterBar(text('ui.research.progress'), { max: 100, format: (v) => `${v}%`, tone: 'neutral' });
  const points = statRow(text('ui.research.points'));
  const eta = statRow(text('ui.research.eta'));

  const focusButtons = RESEARCH_CATEGORIES.map((c) => {
    const left = h('span', { class: 'seg-detail' });
    const b = h(
      'button',
      {
        type: 'button',
        class: 'btn focus-btn',
        'aria-pressed': 'false',
        'data-testid': `research-focus-${c}`,
        onclick: () => {
          const on = game.world.state.management.research.focus[c];
          game.dispatch({ type: 'setResearchFocus', category: c, on: !on });
        },
      },
      h('span', { class: 'focus-check', 'aria-hidden': 'true' }),
      h('span', { class: 'seg-label' }, h('span', { text: text(`ui.research.category.${c}`) }), left),
    );
    return { category: c as ResearchCategory, b, left };
  });

  const unlocked = h('ul', { class: 'plain-list' });
  const noneUnlocked = h('p', { class: 'muted', text: text('ui.research.noneUnlocked') });
  let unlockedKey = '';

  const body = h(
    'div',
    { class: 'panel-content' },
    section(text('ui.research.budget'), budget.el),
    section(text('ui.research.current'), name, progress.el, points.el, eta.el),
    section(text('ui.research.focus'), h('div', { class: 'focus-grid' }, ...focusButtons.map((f) => f.b))),
    section(text('ui.research.unlocked'), unlocked, noneUnlocked),
  );

  return {
    kind: 'research',
    id: null,
    title: text('ui.research.title'),
    body,
    update() {
      const world = game.world;
      const r = world.state.management.research;
      budget.set(r.level);
      const v = researchView(world);
      if (v.complete) {
        setText(name, text('ui.research.complete'));
        progress.el.hidden = true;
        points.el.hidden = true;
        eta.el.hidden = true;
      } else {
        setText(name, v.category ? `${v.name ?? ''} · ${text(`ui.research.category.${v.category}`)}` : (v.name ?? ''));
        progress.el.hidden = false;
        points.el.hidden = false;
        eta.el.hidden = false;
        progress.set(v.percent);
        points.set(text('ui.research.pointsValue', { points: v.pointsPerHour }));
        const t = researchEta(world);
        eta.set(t === null ? text('ui.research.paused') : text('ui.research.etaValue', { month: monthLabel(monthIndexOf(t)) }));
      }
      for (const f of focusButtons) {
        const on = r.focus[f.category];
        setAttr(f.b, 'aria-pressed', on ? 'true' : 'false');
        toggleClass(f.b, 'on', on);
        setText(f.left, text('ui.research.itemsLeft', { count: itemsLeft(world, f.category) }));
      }
      const key = v.unlocked.join('|');
      if (key !== unlockedKey) {
        unlockedKey = key;
        unlocked.replaceChildren(...v.unlocked.map((n) => h('li', { text: n })));
        noneUnlocked.hidden = v.unlocked.length > 0;
      }
      return true;
    },
  };
}
