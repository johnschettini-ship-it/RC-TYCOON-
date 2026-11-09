/** Stall panel (Phase 1 §7). Owner: W1-B. */
import { getStallDef } from '../../data/catalog';
import { text } from '../../data/strings/en';
import type { PanelView, UiContext } from '../context';
import { formatMoney, formatPrice } from '../format';
import { stallWarnings } from '../info';
import { h } from '../dom';
import { priceSlider, section, statRow, warningList } from '../widgets';
import { RIDE_PRICE_MAX, RIDE_PRICE_STEP } from './ride';

export function createStallPanel(ctx: UiContext, stallId: number): PanelView {
  const { game } = ctx;
  const find = () => game.world.state.stalls.find((s) => s.id === stallId);
  const s0 = find();
  const def = s0 ? getStallDef(s0.defId) : undefined;

  const kind = statRow(text('ui.stall.kind'));
  const price = priceSlider(text('ui.stall.price'), {
    max: RIDE_PRICE_MAX,
    step: RIDE_PRICE_STEP,
    format: formatPrice,
    onCommit: (cents) => game.dispatch({ type: 'setStallPrice', stallId, price: cents }),
  });
  const sales = statRow(text('ui.stall.sales'));
  const salesTotal = statRow(text('ui.stall.salesTotal'));
  const income = statRow(text('ui.stall.income'));
  const incomeTotal = statRow(text('ui.stall.incomeTotal'));
  const warnings = warningList();
  const body = h(
    'div',
    { class: 'panel-content' },
    warnings.el,
    section(null, kind.el),
    section(null, price.el),
    section(null, sales.el, salesTotal.el, income.el, incomeTotal.el),
  );
  if (def) kind.set(text(`ui.kind.${def.kind}`));

  return {
    kind: 'stall',
    id: stallId,
    title: s0?.name ?? '',
    body,
    update() {
      const s = find();
      if (!s) return false;
      price.set(s.price);
      sales.set(String(s.totals.salesThisMonth));
      salesTotal.set(String(s.totals.sales));
      income.set(formatMoney(s.totals.incomeThisMonth));
      incomeTotal.set(formatMoney(s.totals.income));
      warnings.set(stallWarnings(game.world, s));
      return true;
    },
  };
}
