/** Finance panel (Phase 1 §4.5): this and last month by category, 12-month profit bars. Owner: W1-B. */
import { text } from '../../data/strings/en';
import { monthIndexOf } from '../../sim/time';
import type { PanelView, UiContext } from '../context';
import { h, toggleClass } from '../dom';
import { financeSummary, monthLabel, profitHistory } from '../finance';
import { formatMoney } from '../format';
import { section } from '../widgets';

export function createFinancePanel(ctx: UiContext): PanelView {
  const { game } = ctx;
  const tbody = h('tbody');
  const tfoot = h('tfoot');
  const empty = h('p', { class: 'muted', text: text('ui.finance.noData') });
  const table = h(
    'table',
    { class: 'finance-table' },
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', { scope: 'col', text: text('ui.finance.category') }),
        h('th', { scope: 'col', text: text('ui.finance.thisMonth') }),
        h('th', { scope: 'col', text: text('ui.finance.lastMonth') }),
      ),
    ),
    tbody,
    tfoot,
  );
  const chart = h('div', { class: 'profit-chart', role: 'list', 'aria-label': text('ui.finance.history') });
  const body = h('div', { class: 'panel-content' }, section(null, table, empty), section(text('ui.finance.history'), chart));
  let lastKey = '';

  const money = (v: number): HTMLElement => {
    const td = h('td', { class: 'num', text: formatMoney(v) });
    toggleClass(td, 'neg', v < 0);
    return td;
  };

  return {
    kind: 'finance',
    id: null,
    title: text('ui.finance.title'),
    body,
    update() {
      const s = game.world.state;
      const m = monthIndexOf(s.tick);
      const sum = financeSummary(s.economy.ledger, m);
      const hist = profitHistory(s.economy.ledger, m);
      const key = JSON.stringify([m, sum, hist]);
      if (key === lastKey) return true;
      lastKey = key;
      tbody.replaceChildren(
        ...sum.rows.map((r) => h('tr', {}, h('th', { scope: 'row', text: text(`ui.ledger.${r.category}`) }), money(r.thisMonth), money(r.lastMonth))),
      );
      tfoot.replaceChildren(h('tr', {}, h('th', { scope: 'row', text: text('ui.finance.profit') }), money(sum.thisTotal), money(sum.lastTotal)));
      empty.hidden = sum.rows.length > 0;
      const maxAbs = Math.max(1, ...hist.map((p) => Math.abs(p.profit)));
      chart.replaceChildren(
        ...hist.map((p) => {
          const pct = (Math.abs(p.profit) / maxAbs) * 50;
          const bar = h('i', { class: p.profit < 0 ? 'bar neg' : 'bar pos' });
          bar.style.height = `${pct.toFixed(1)}%`;
          const label = text('ui.finance.bar', { month: monthLabel(p.monthIndex), amount: formatMoney(p.profit) });
          return h('div', { class: 'bar-slot', role: 'listitem', 'aria-label': label, title: label }, bar, h('span', { class: 'bar-label', text: monthLabel(p.monthIndex).slice(0, 3) }));
        }),
      );
      return true;
    },
  };
}
