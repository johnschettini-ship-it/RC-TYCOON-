/**
 * Mascot tip bubble (Phase 7 §4.8): one short sentence with the small face of the speaker and at most one button.
 * The rules (`./model`) run every `TIP_CHECK_MS`. Desktop: centred above the hand, where the tool status bar shows
 * while a tool is active. Phone: below the day pill. Hidden while a dialog or the title is open, while a tool other
 * than Inspect is active, while an overlay is on or the overlay chip row is open (the overlay legend takes its place on
 * the phone), on the phone while a panel is open or a card of the hand is pressed (a picker, a panel, a held card), and
 * in the low layout (a phone held sideways) while the hand is open; it comes back when that ends and a tip still matches. When the bubble hides while one of its buttons has the focus,
 * the focus goes to the Rides deck button, not to the page body. Screen readers hear the tip from a lasting status
 * region (`live`): it gets the sentence when the bubble shows or its tip changes, and is emptied when the bubble hides.
 * Browser only.
 */
import { text } from '../../data/strings/en';
import { TIP_CHECK_MS } from '../../data/tuning/interface';
import type { UiContext } from '../context';
import { h, setAttr, setText } from '../dom';
import type { UiPart } from '../extensions';
import { icon } from '../icons';
import { mascotCanvas } from '../scenario/mascotArt';
import { overlayChipsOpen } from '../overlays';
import { modalOpen, titleOpen } from '../scenario/shared';
import { dropStale, matchingTips, shownTip, tipInput, type Tip, type TipId } from './model';

/** Face height (CSS px) per layout. */
const FACE_PX = { side: 48, bottom: 40 } as const;

export function createTipBubble(ctx: UiContext): UiPart & { live: HTMLElement } {
  const { game, root } = ctx;
  const art = h('div', { class: 'tip-art', 'aria-hidden': 'true' });
  const say = h('p', { class: 'tip-text', 'data-testid': 'tip-text' });
  const action = h('button', { type: 'button', class: 'btn primary tip-action', 'data-testid': 'tip-action', onclick: () => act() });
  const close = h(
    'button',
    { type: 'button', class: 'icon-btn tip-close', 'data-testid': 'tip-close', 'aria-label': text('ui.tip.close'), onclick: () => closeTip() },
    icon('cross'),
  );
  const el = h(
    'aside',
    { class: 'tip-bubble', 'data-testid': 'tip', 'aria-label': text('ui.tip.label'), hidden: true },
    art,
    h('div', { class: 'tip-body' }, say, action),
    close,
  );

  // A live region that stays in the DOM (a region that appears with its text is often not announced).
  const live = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite', 'data-testid': 'tip-live' });

  let closed = new Set<TipId>();
  let tip: Tip | null = null;
  let shownId: TipId | null = null;
  let face = '';
  let lastCheck = -Infinity;
  // The low layout (Task 19) has no room for the tip between the top region and an open hand: it hides then.
  let hand: HTMLElement | null = null;
  const handOpen = (): boolean => {
    hand ??= root.querySelector<HTMLElement>('[data-testid="hand"]');
    return hand !== null && !hand.hidden;
  };

  function act(): void {
    if (!tip) return;
    if (tip.id === 'cashLow') ctx.openPanel('finance');
    else if (tip.group) ctx.openDeck('rides', tip.group);
    else ctx.openDeck('rides');
  }

  function closeTip(): void {
    if (!tip) return;
    closed.add(tip.id);
    tip = null;
  }

  function check(): void {
    const matching = matchingTips(tipInput(game.world, game.settings.get('mascotTips')));
    closed = dropStale(closed, matching);
    tip = shownTip(matching, closed);
  }

  // A new world starts with no closed tip; its first check runs one period later. A settings change checks at once.
  game.onWorldChanged(() => {
    closed = new Set();
    tip = null;
    lastCheck = performance.now();
  });
  game.settings.onChange(() => {
    lastCheck = -Infinity;
  });

  function show(t: Tip): void {
    const layout = root.dataset.layout === 'bottom' ? 'bottom' : 'side';
    const key = `${t.speaker}:${t.mood}@${FACE_PX[layout]}`;
    if (key !== face) {
      face = key;
      const c = mascotCanvas(t.speaker, t.mood, FACE_PX[layout], '');
      c.removeAttribute('role');
      c.removeAttribute('aria-label');
      art.replaceChildren(c);
    }
    if (t.id === shownId) return;
    shownId = t.id;
    setAttr(el, 'data-tip', t.id);
    setAttr(el, 'data-speaker', t.speaker);
    setText(say, text(`ui.tip.${t.id}`));
    setText(action, t.group ? text('ui.tip.showZone', { zone: text(`ui.tag.${t.group}`) }) : text(`ui.tip.${t.id}.button`));
  }

  return {
    el,
    live,
    update(now) {
      if (now - lastCheck >= TIP_CHECK_MS) {
        lastCheck = now;
        check();
      }
      const blocked =
        modalOpen() ||
        titleOpen() ||
        game.tool.tool !== 'inspect' ||
        game.tool.overlay !== 'none' ||
        overlayChipsOpen(ctx) ||
        (root.dataset.layout === 'bottom' && (ctx.activePanel() !== null || ctx.cardPressed())) ||
        (root.dataset.low === '1' && handOpen());
      const visible = tip !== null && !blocked;
      if (visible && tip) show(tip);
      setText(live, visible && tip ? text(`ui.tip.${tip.id}`) : '');
      if (el.hidden === visible) {
        // A button of the bubble that hides with it would drop the focus to the page body.
        const hadFocus = !visible && el.contains(document.activeElement);
        el.hidden = !visible;
        if (hadFocus) ctx.controlFor('rides')?.focus();
      }
    },
  };
}
