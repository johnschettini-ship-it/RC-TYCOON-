/**
 * Award toasts at month end with a Chill or Thrill accent (Phase 5 §4.10, §7; no mascot face since Task 23) and the park panel awards section (active
 * awards and the whole history). Owner: W3-I. Browser only.
 */
import { text } from '../../data/strings/en';
import { awardsEnabled } from '../../sim/awards/api';
import { isPositiveAward, type AwardId } from '../../sim/awards/types';
import type { UiContext } from '../context';
import type { UiPart } from '../extensions';
import { h, setText } from '../dom';
import { section } from '../widgets';
import { AWARD_ACCENT, monthLabel } from './model';
import { modalOpen } from './shared';

const TOAST_MS = 4500;

/** One toast at a time; awards of the same month end queue up. Tap or click dismisses. */
export function createAwardToasts(): UiPart & { push(id: AwardId): void; clear(): void } {
  const el = h('div', { class: 'tc-award-toast', role: 'status', 'aria-live': 'polite', 'data-testid': 'award-toast', hidden: true });
  const queue: AwardId[] = [];
  let until = 0;
  let showing: AwardId | null = null;

  const next = (now: number): void => {
    showing = queue.shift() ?? null;
    if (!showing) {
      el.hidden = true;
      return;
    }
    const id = showing;
    const positive = isPositiveAward(id);
    const name = text(`prog.award.${id}`);
    const accent = AWARD_ACCENT[id];
    el.className = `tc-award-toast ${positive ? 'positive' : 'negative'} ${accent}`;
    void el.offsetWidth; // restart the entry animation for each toast
    el.classList.add('enter');
    el.replaceChildren(
      h(
        'div',
        {},
        h('strong', { text: text(positive ? 'prog.award.toastPositive' : 'prog.award.toastNegative', { name }) }),
        h('span', { text: text(`prog.award.desc.${id}`) }),
        h('span', { text: text(positive ? 'prog.award.effectPositive' : 'prog.award.effectNegative') }),
      ),
    );
    el.hidden = false;
    until = now + TOAST_MS;
  };
  el.addEventListener('click', () => {
    until = 0;
  });

  return {
    el,
    push(id) {
      queue.push(id);
    },
    clear() {
      queue.length = 0;
      showing = null;
      el.hidden = true;
    },
    update(now) {
      if (modalOpen()) {
        el.hidden = true;
        return;
      }
      if (showing === null ? queue.length > 0 : now >= until) next(now);
    },
  };
}

/** Park panel section: awards in effect this month and every award of the game, newest first. */
export function createAwardsSection(ctx: UiContext): UiPart {
  const active = h('ul', { class: 'tc-award-list', 'data-testid': 'awards-active' });
  const history = h('ul', { class: 'tc-award-list tc-award-history', 'data-testid': 'awards-history' });
  const note = h('p', { class: 'tc-muted' });
  const el = section(text('prog.awards.title'), note, h('h4', { class: 'tc-section-title', text: text('prog.awards.active') }), active, h('h4', { class: 'tc-section-title', text: text('prog.awards.history') }), history);
  el.setAttribute('data-testid', 'awards-section');
  let key = '';

  const item = (id: AwardId, date: string | null): HTMLElement =>
    h(
      'li',
      { class: isPositiveAward(id) ? 'positive' : 'negative' },
      h('span', { class: 'tc-award-name', text: text(`prog.award.${id}`), title: text(`prog.award.desc.${id}`) }),
      date ? h('span', { class: 'tc-award-date', text: date }) : h('span', { class: 'tc-award-date', text: text(isPositiveAward(id) ? 'prog.award.effectPositive' : 'prog.award.effectNegative') }),
    );

  return {
    el,
    update() {
      const world = ctx.game.world;
      const s = world.state.scenario;
      if (s.kind === 'tutorial') {
        el.hidden = true;
        return;
      }
      el.hidden = false;
      const enabled = awardsEnabled(world);
      const k = `${enabled}|${s.awards.active.join(',')}|${s.awards.history.length}`;
      if (k === key) return;
      key = k;
      setText(note, enabled ? '' : text('prog.awards.off'));
      note.hidden = enabled;
      active.replaceChildren(...(s.awards.active.length > 0 && enabled ? s.awards.active.map((id) => item(id, null)) : [h('li', { class: 'tc-muted', text: text('prog.awards.noneActive') })]));
      const rows = [...s.awards.history].reverse().map((r) => item(r.id, monthLabel(r.monthIndex)));
      history.replaceChildren(...(rows.length > 0 ? rows : [h('li', { class: 'tc-muted', text: text('prog.awards.none') })]));
    },
  };
}
