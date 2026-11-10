/**
 * Top region (Phase 7 §4.1, §4.2): status pill, mood slot, controls (speed, Messages, Menu), and day pill (weather, date
 * and clock, extension parts). The container has no background; only its pills and buttons take pointer events.
 */
import { text } from '../data/strings/en';
import type { Speed } from '../loop';
import { formatGameDate } from '../i18n';
import { unreadCount } from '../sim/notifications';
import type { TextScale } from '../settings/types';
import type { UiContext } from './context';
import { h, newId, setAttr, setText, toggleClass } from './dom';
import { formatMoney, sharePercents, temperamentShares } from './format';
import { icon } from './icons';
import { pillFields, type PillField, type ToolbarPlacement } from './layout';
import { mgmtIcon } from './management/icons';
import { createWeatherBadge } from './management/weatherBadge';
import { UI_EXTENSIONS } from './extensions';

const SPEEDS: readonly Speed[] = [0, 1, 2, 4];
const BALANCE_MS = 500;

export function createHud(ctx: UiContext, openMenu: () => void): { el: HTMLElement; moodSlot: HTMLElement; update(now: number): void } {
  const { game } = ctx;

  // Status pill: one button that opens the Park panel. A hidden field is `hidden`, not removed.
  const name = h('span', { class: 'hud-name', 'data-testid': 'hud-name' });
  const cash = h('span', { class: 'hud-value', 'data-testid': 'hud-cash' });
  const guests = h('span', { class: 'hud-value', 'data-testid': 'hud-guests' });
  const rating = h('span', { class: 'hud-value', 'data-testid': 'hud-rating' });
  const labels: HTMLElement[] = [];
  const labelOf = (label: string): HTMLElement => {
    const el = h('span', { class: 'hud-label', text: label });
    labels.push(el);
    return el;
  };
  const field = (cls: string, label: string | null, iconName: 'guests' | 'star' | null, value: HTMLElement): HTMLElement =>
    h('span', { class: `hud-field ${cls}` }, label === null ? null : labelOf(label), iconName ? icon(iconName) : null, value);
  const fields: Record<PillField, HTMLElement> = {
    name: h('span', { class: 'hud-field hud-field-name' }, name),
    cash: field('hud-field-cash', text('ui.hud.cash'), null, cash),
    guests: field('hud-field-guests', text('ui.hud.guestsShort'), 'guests', guests),
    rating: field('hud-field-rating', text('ui.hud.ratingShort'), 'star', rating),
  };
  const statusPill = h(
    'button',
    { type: 'button', class: 'pill status-pill', 'data-testid': 'status-pill', 'aria-haspopup': 'true', onclick: () => ctx.openPanel('park') },
    fields.name,
    fields.cash,
    fields.guests,
    fields.rating,
  );

  // Mood slot: the Thrill/Chill balance bar (Task 8 replaces it with the mood bar).
  const segChill = h('i', { class: 'seg seg-chill' });
  const segFamily = h('i', { class: 'seg seg-family' });
  const segThrill = h('i', { class: 'seg seg-thrill' });
  const balance = h('div', { class: 'balance', role: 'img', 'data-testid': 'hud-balance' }, segChill, segFamily, segThrill);
  const moodSlot = h(
    'div',
    { class: 'hud-mood' },
    h('div', { class: 'hud-item hud-balance' }, h('span', { class: 'balance-end chill', text: text('ui.tag.chill'), 'aria-hidden': 'true' }), balance, h('span', { class: 'balance-end thrill', text: text('ui.tag.thrill'), 'aria-hidden': 'true' })),
  );

  // Controls: speed (4 buttons; one Speed button opens them on the phone), Messages, Menu.
  const speedButtons = SPEEDS.map((s) =>
    h(
      'button',
      { type: 'button', class: 'speed-btn', 'data-speed': s, 'aria-label': text(`ui.speed.${s}`), 'aria-pressed': 'false', onclick: () => game.setSpeed(s) },
      s === 0 ? icon('pause') : h('span', { text: `${s}×` }),
    ),
  );
  const speedGroup = h('div', { class: 'speed speed-menu', id: newId('speed'), role: 'group', 'aria-label': text('ui.speed.label') }, ...speedButtons);
  const speedLabel = h('span', { class: 'speed-now' });
  const speedToggle = h(
    'button',
    { type: 'button', class: 'hud-btn speed-toggle', 'data-testid': 'speed-toggle', 'aria-label': text('ui.controls.speed'), 'aria-expanded': 'false', 'aria-controls': speedGroup.id },
    speedLabel,
  );
  const messagesBadge = h('span', { class: 'tool-badge', 'data-testid': 'messages-badge', 'aria-hidden': 'true', hidden: true });
  const messages = h(
    'button',
    { type: 'button', class: 'hud-btn', 'data-tool': 'messages', 'data-testid': 'tool-messages', 'aria-label': text('ui.tool.messages'), title: text('ui.tool.messages'), 'aria-pressed': 'false', onclick: () => (ctx.activePanel()?.kind === 'messages' ? ctx.closePanel() : ctx.openPanel('messages')) },
    mgmtIcon('messages'),
    messagesBadge,
  );
  const menu = h(
    'button',
    { type: 'button', class: 'hud-btn', 'data-tool': 'menu', 'data-testid': 'tool-menu', 'aria-label': text('ui.tool.menu'), title: text('ui.tool.menu'), 'aria-haspopup': 'dialog', onclick: openMenu },
    icon('menu'),
  );
  const controls = h('div', { class: 'hud-controls' }, h('div', { class: 'speed-wrap' }, speedToggle, speedGroup), messages, menu);

  // Day pill: weather badge, date and clock, then the extension parts (view rotate buttons, objectives flag).
  const date = h('span', { class: 'hud-date', 'data-testid': 'hud-date' });
  const weather = createWeatherBadge(ctx);
  const extra = UI_EXTENSIONS.flatMap((x) => (x.hud ? [x.hud(ctx)] : []));
  const dayPill = h('div', { class: 'pill day-pill', 'data-testid': 'day-pill' }, weather.el, h('span', { class: 'hud-clock', title: text('ui.hud.date') }, date), ...extra.map((p) => p.el));

  const el = h('header', { class: 'hud', role: 'region', 'aria-label': text('ui.hud.label') }, statusPill, moodSlot, controls, dayPill);

  // The phone's speed menu: a choice, Esc, or a press outside closes it; a layout change resets it.
  let speedOpen = false;
  let lastLayout: ToolbarPlacement | null = null;
  const setSpeedOpen = (open: boolean): void => {
    speedOpen = open;
    setAttr(speedToggle, 'aria-expanded', open ? 'true' : 'false');
    applySpeedVisibility();
  };
  const applySpeedVisibility = (): void => {
    const phone = ctx.root.dataset.layout === 'bottom';
    const hide = phone && !speedOpen;
    if (speedGroup.hidden !== hide) speedGroup.hidden = hide;
    if (speedToggle.hidden !== !phone) speedToggle.hidden = !phone;
  };
  speedToggle.addEventListener('click', () => setSpeedOpen(!speedOpen));
  for (const b of speedButtons) b.addEventListener('click', () => setSpeedOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !speedOpen) return;
    setSpeedOpen(false);
    if (el.contains(document.activeElement)) speedToggle.focus();
  });
  document.addEventListener('pointerdown', (e) => {
    if (speedOpen && !(e.target instanceof Node && speedGroup.parentElement?.contains(e.target))) setSpeedOpen(false);
  });

  let lastBalance = -Infinity;
  let lastUnread = -1;
  let lastFields = '';
  let lastSpeed: Speed | -1 = -1;

  return {
    el,
    moodSlot,
    update(now: number) {
      const s = game.world.state;
      const layout = (ctx.root.dataset.layout === 'bottom' ? 'bottom' : 'side') as ToolbarPlacement;
      if (layout !== lastLayout) {
        lastLayout = layout;
        setSpeedOpen(false);
        // The phone shows icons and numbers; the labels stay for screen readers.
        for (const l of labels) toggleClass(l, 'sr-only', layout === 'bottom');
      }
      const shown = pillFields(layout, game.settings.get('textScale') as TextScale);
      const key = shown.join();
      if (key !== lastFields) {
        lastFields = key;
        for (const f of Object.keys(fields) as PillField[]) fields[f].hidden = !shown.includes(f);
      }
      setText(name, s.park.name);
      setText(cash, formatMoney(s.park.cash));
      toggleClass(cash, 'neg', s.park.cash < 0);
      setText(guests, String(s.guests.length));
      setText(rating, String(s.park.rating));
      setText(date, formatGameDate(s.tick));
      weather.update();
      for (const p of extra) p.update(now);
      for (const b of speedButtons) {
        const on = Number(b.dataset.speed) === game.speed;
        setAttr(b, 'aria-pressed', on ? 'true' : 'false');
        toggleClass(b, 'active', on);
      }
      if (game.speed !== lastSpeed) {
        lastSpeed = game.speed;
        // The name keeps the visible `2×` in it (WCAG 2.5.3); paused shows an icon only.
        setAttr(speedToggle, 'aria-label', game.speed === 0 ? text('ui.controls.speed') : `${text('ui.controls.speed')} ${game.speed}×`);
        speedLabel.replaceChildren(game.speed === 0 ? icon('pause') : document.createTextNode(`${game.speed}×`));
      }
      setAttr(messages, 'aria-pressed', ctx.activePanel()?.kind === 'messages' ? 'true' : 'false');
      const unread = unreadCount(game.world);
      if (unread !== lastUnread) {
        lastUnread = unread;
        messagesBadge.hidden = unread === 0;
        setText(messagesBadge, unread > 99 ? '99+' : String(unread));
        const label = unread > 0 ? text('ui.tool.messagesUnread', { count: unread }) : text('ui.tool.messages');
        setAttr(messages, 'aria-label', label);
        setAttr(messages, 'title', label);
      }
      if (now - lastBalance >= BALANCE_MS) {
        lastBalance = now;
        const shares = temperamentShares(s.guests);
        const p = sharePercents(shares);
        segChill.style.flexGrow = String(p.chill);
        segFamily.style.flexGrow = String(p.family);
        segThrill.style.flexGrow = String(p.thrill);
        toggleClass(balance, 'empty', shares.total === 0);
        setAttr(balance, 'aria-label', shares.total === 0 ? text('ui.hud.balanceEmpty') : text('ui.hud.balance', p));
      }
    },
  };
}
