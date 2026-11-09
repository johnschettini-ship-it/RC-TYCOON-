/**
 * Show site picker (Phase 6 §7): the 2 show sites with a preview, build cost, cost per show, viewing radius, and show
 * length. Locked sites are marked and their cards disabled until the Scenery research unlocks them. Desktop: a side
 * panel; phone: a bottom sheet. Picking a site starts the placement tool and closes the picker. Owner: W4-C.
 */
import { text } from '../../data/strings/en';
import { chooseShowSite } from '../../input/shows';
import { drawShowSitePreview } from '../../render/shows/preview';
import type { UiContext } from '../context';
import { h, setText } from '../dom';
import { icon } from '../icons';
import { showCards } from './view';

const PREVIEW_W = 120;
const PREVIEW_H = 96;

export interface Picker {
  el: HTMLElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
  update(): void;
}

function preview(defId: string): HTMLCanvasElement {
  const dpr = Math.min(3, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const c = h('canvas', { width: Math.round(PREVIEW_W * dpr), height: Math.round(PREVIEW_H * dpr), 'aria-hidden': 'true' });
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.scale(dpr, dpr);
    try {
      drawShowSitePreview(ctx, defId, PREVIEW_W, PREVIEW_H);
    } catch (e) {
      console.warn('show site preview failed', defId, e);
    }
  }
  return c;
}

export function createShowPicker(ctx: UiContext): Picker {
  const { game } = ctx;
  const grid = h('div', { class: 'shw-grid', 'data-testid': 'show-picker-grid' });
  const afterDarkNote = h('p', { class: 'shw-note', 'data-testid': 'show-picker-after-dark', hidden: true, text: text('shows.picker.afterDarkOff') });
  const close = h('button', { type: 'button', class: 'btn', 'aria-label': text('shows.picker.close'), 'data-testid': 'show-picker-close', onclick: () => api.close() }, icon('cross'));
  const el = h(
    'section',
    { class: 'shw-picker', role: 'dialog', 'aria-label': text('shows.picker.title'), 'data-testid': 'show-picker', hidden: true },
    h('div', { class: 'shw-head' }, h('h2', { text: text('shows.picker.title') }), close),
    h('p', { class: 'shw-help', text: text('shows.picker.help') }),
    afterDarkNote,
    grid,
  );
  const cards = new Map<string, { el: HTMLButtonElement; lock: HTMLElement }>();
  let lastKey = '';

  function build(): void {
    grid.replaceChildren();
    cards.clear();
    for (const c of showCards(game.world)) {
      const lock = h('span', { class: 'shw-lock', text: text('shows.picker.locked') });
      const card = h(
        'button',
        {
          type: 'button',
          class: 'shw-card',
          'data-def': c.id,
          'data-testid': `show-card-${c.id}`,
          'aria-label': c.label,
          onclick: () => {
            chooseShowSite(game, c.id);
            api.close();
          },
        },
        preview(c.id),
        h('span', { class: 'shw-name', text: c.name }),
        h('span', { class: 'shw-cost', text: c.cost }),
        h('span', { class: 'shw-facts', text: c.perShow }),
        h('span', { class: 'shw-facts', text: c.facts }),
        lock,
      );
      cards.set(c.id, { el: card, lock });
      grid.append(card);
    }
    refresh();
  }

  function refresh(): void {
    for (const c of showCards(game.world)) {
      const card = cards.get(c.id);
      if (!card) continue;
      card.el.disabled = c.locked;
      card.lock.hidden = !c.locked;
      setText(card.lock, text('shows.picker.locked'));
    }
    afterDarkNote.hidden = game.world.state.park.afterDark;
  }

  const api: Picker = {
    el,
    open() {
      if (!el.hidden) return;
      el.hidden = false;
      // The picker and an entity panel share the right side (desktop) or the bottom sheet (phone).
      ctx.closePanel();
      if (cards.size === 0) build();
      else refresh();
      (cards.values().next().value?.el as HTMLButtonElement | undefined)?.focus({ preventScroll: true });
    },
    close() {
      el.hidden = true;
    },
    isOpen: () => !el.hidden,
    update() {
      if (el.hidden) return;
      const s = game.world.state;
      const key = `${s.management.research.unlocked.length}:${s.park.afterDark}:${s.scenario.kind}`;
      if (key !== lastKey) {
        lastKey = key;
        refresh();
      }
    },
  };
  return api;
}
