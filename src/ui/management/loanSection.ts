/**
 * Loan block for the finance panel (Phase 3 §4.8, §7.1): balance, limit, monthly interest, park value,
 * Borrow $1,000 (with confirmation) and Repay $1,000. Refusals show the command's exact reason. Owner: W2-B.
 */
import { text } from '../../data/strings/en';
import { LOAN_STEP } from '../../data/tuning/management';
import type { UiContext } from '../context';
import { confirmDialog } from '../dialogs';
import { h } from '../dom';
import { formatMoney } from '../format';
import { section, statRow } from '../widgets';
import { loanView } from './loans';

export function createLoanSection(ctx: UiContext): { el: HTMLElement; update(): void } {
  const { game } = ctx;
  const step = formatMoney(LOAN_STEP);
  const balance = statRow(text('ui.finance.loanBalance'));
  const limit = statRow(text('ui.finance.loanLimit'));
  const rate = statRow(text('ui.finance.loanRate'));
  const interest = statRow(text('ui.finance.loanInterest'));
  const parkValue = statRow(text('ui.finance.parkValue'));
  balance.el.dataset.testid = 'loan-balance';
  const borrow = h('button', {
    type: 'button',
    class: 'btn',
    'data-testid': 'loan-borrow',
    text: text('ui.finance.borrow', { amount: step }),
    onclick: () => {
      const v = loanView(game.world);
      confirmDialog(ctx.root, text('ui.finance.borrowConfirm', { amount: step, rate: v.ratePercent }), text('ui.finance.borrowYes'), text('ui.dialog.cancel'), () => {
        // Always one step: at the limit the command answers "Loan limit reached".
        game.dispatch({ type: 'borrow', amount: LOAN_STEP });
      });
    },
  });
  const repay = h('button', {
    type: 'button',
    class: 'btn',
    'data-testid': 'loan-repay',
    text: text('ui.finance.repay', { amount: step }),
    onclick: () => game.dispatch({ type: 'repay', amount: LOAN_STEP }),
  });
  const el = section(text('ui.finance.loan'), balance.el, limit.el, rate.el, interest.el, h('div', { class: 'button-row' }, borrow, repay), parkValue.el);
  return {
    el,
    update() {
      const v = loanView(game.world);
      balance.set(formatMoney(v.balance));
      limit.set(formatMoney(v.limit));
      rate.set(text('ui.finance.loanRateValue', { rate: v.ratePercent }));
      interest.set(formatMoney(v.interest));
      parkValue.set(formatMoney(game.world.state.management.parkValue));
      // Buttons stay enabled so a refused press explains itself; they dim when it would fail.
      borrow.classList.toggle('dim', v.borrow === 0);
      repay.classList.toggle('dim', v.repay === 0);
    },
  };
}
