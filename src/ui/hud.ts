/**
 * Top region (Phase 7 §4.1, §4.2): status pill, mood slot, controls (speed, Messages, Menu), and the chip row: the day
 * chip (weather, date and clock), the extension parts (the objectives flag right of the chip, the view controls at the
 * row's right end). The container and the chip row have no background; only their pills and buttons take pointer events.
 *
 * The upright phone (Task 24, not the low layout) has ONE row: the status pill (cash and guests), the mood circle, the
 * time chip (weather icon and the hour), the Speed button, the one turn-view button and Menu. Messages and the objectives
 * flag are Menu items there (the chip row is hidden), and a dot on Menu shows unread messages. The parts move between
 * the containers only when that mode changes, so the focus order follows the row.
 */
import { text } from '../data/strings/en';
import type { Speed } from '../loop';
import { formatClock, formatGameDate } from '../i18n';
import { t } from '../data/strings/index';
import { unreadCount } from '../sim/notifications';
import type { TextScale } from '../settings/types';
import type { UiContext } from './context';
import { h, newId, setAttr, setText, toggleClass } from './dom';
import { formatMoney, formatMoneyShort } from './format';
import { icon } from './icons';
import { pillFields, type PillField, type ToolbarPlacement } from './layout';
import { compactTop, createMoodBar } from './mood/moodBar';
import { mgmtIcon } from './management/icons';
import { createWeatherBadge } from './management/weatherBadge';
import { UI_EXTENSIONS, type MenuItem } from './extensions';

const SPEEDS: readonly Speed[] = [0, 1, 2, 4];

export function createHud(ctx: UiContext, openMenu: (extra: readonly MenuItem[]) => void): { el: HTMLElement; moodSlot: HTMLElement; update(now: number): void } {
  const { game } = ctx;

  // Status pill: one button that opens the Park panel. A hidden field is `hidden`, not removed.
  const name = h('span', { class: 'hud-name', 'data-testid': 'hud-name' });
  const cash = h('span', { class: 'hud-value', 'data-testid': 'hud-cash' });
  // Task 21, 24: the compact row shows whole dollars (K or M from $100,000); screen readers get the full value here.
  const cashFull = h('span', { class: 'sr-only', hidden: true });
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
    cash: h('span', { class: 'hud-field hud-field-cash' }, labelOf(text('ui.hud.cash')), cash, cashFull),
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

  // Mood slot: the mood bar (Phase 7 §4.3).
  const mood = createMoodBar(ctx);
  const moodSlot = h('div', { class: 'hud-mood' }, mood.el);

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
    { type: 'button', class: 'hud-btn speed-toggle', 'data-testid': 'speed-toggle', 'aria-label': text(`ui.speed.${game.speed}`), 'aria-expanded': 'false', 'aria-controls': speedGroup.id },
    speedLabel,
  );
  const messagesBadge = h('span', { class: 'tool-badge', 'data-testid': 'messages-badge', 'aria-hidden': 'true', hidden: true });
  const messages = h(
    'button',
    { type: 'button', class: 'hud-btn', 'data-tool': 'messages', 'data-testid': 'tool-messages', 'aria-label': text('ui.tool.messages'), title: text('ui.tool.messages'), 'aria-pressed': 'false', onclick: () => (ctx.activePanel()?.kind === 'messages' ? ctx.closePanel() : ctx.openPanel('messages')) },
    mgmtIcon('messages'),
    messagesBadge,
  );
  // Task 24: on the upright phone a small dot on Menu shows unread messages (Messages is a Menu item there).
  const menuDot = h('span', { class: 'menu-dot', 'data-testid': 'menu-dot', 'aria-hidden': 'true', hidden: true });
  const menu = h(
    'button',
    {
      type: 'button',
      class: 'hud-btn',
      'data-tool': 'menu',
      'data-testid': 'tool-menu',
      'aria-label': text('ui.tool.menu'),
      title: text('ui.tool.menu'),
      'aria-haspopup': 'dialog',
      onclick: (e: Event) => {
        menuByPointer = (e as MouseEvent).detail !== 0;
        openMenu(compactTop(ctx.root) ? menuItems() : []);
      },
    },
    icon('menu'),
    menuDot,
  );
  const speedWrap = h('div', { class: 'speed-wrap' }, speedToggle, speedGroup);
  const controls = h('div', { class: 'hud-controls' }, speedWrap, messages, menu);

  // Chip row: the day chip (weather badge, date and clock), the extension parts of the `chip` slot right of it (the
  // objectives flag), and those of the `end` slot at the right end (the view controls). The modules own their parts.
  const date = h('span', { class: 'hud-date', 'data-testid': 'hud-date' });
  const weather = createWeatherBadge(ctx);
  const chip = h('div', { class: 'pill day-pill', 'data-testid': 'day-pill' }, weather.el, h('span', { class: 'hud-clock', title: text('ui.hud.date') }, date));
  const placed = UI_EXTENSIONS.flatMap((x) => (x.hud ? [{ part: x.hud(ctx), end: x.hudSlot === 'end' }] : []));
  const extra = placed.map((p) => p.part);
  const chipParts = placed.filter((p) => !p.end).map((p) => p.part.el);
  const endParts = placed.filter((p) => p.end).map((p) => p.part.el);
  const dayRow = h('div', { class: 'hud-day' }, chip, ...chipParts, ...endParts);

  const el = h('header', { class: 'hud', role: 'region', 'aria-label': text('ui.hud.label') }, statusPill, moodSlot, controls, dayRow);

  /**
   * The upright phone's Menu items (Task 24): Messages with the unread count, then the parts' items (objectives). The
   * dialog gives the focus back to Menu when it closes; after a pointer press an item leaves no focus there, as a pointer
   * press on any top-region button does (`index.ts`), so Space pauses the game instead of opening the Menu again.
   */
  let menuByPointer = false;
  const pointerBlur = (item: MenuItem): MenuItem => ({
    ...item,
    onClick: () => {
      if (menuByPointer && document.activeElement === menu) menu.blur();
      item.onClick();
    },
  });
  const menuItems = (): MenuItem[] => {
    const count = unreadCount(game.world);
    const items: MenuItem[] = [
      {
        label: text('ui.menu.messages'),
        detail: count > 0 ? text('ui.menu.messagesUnread', { count }) : undefined,
        testId: 'menu-messages',
        onClick: () => ctx.openPanel('messages'),
      },
    ];
    for (const p of placed) {
      const item = p.part.menuItem?.();
      if (item) items.push(item);
    }
    return items.map(pointerBlur);
  };

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
  for (const b of speedButtons) {
    b.addEventListener('click', () => {
      // A choice made with the keyboard keeps the focus on a visible control: the menu's Speed button.
      const had = speedGroup.contains(document.activeElement);
      setSpeedOpen(false);
      if (had && speedGroup.hidden) speedToggle.focus();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !speedOpen) return;
    setSpeedOpen(false);
    if (el.contains(document.activeElement)) speedToggle.focus();
  });
  document.addEventListener('pointerdown', (e) => {
    if (speedOpen && !(e.target instanceof Node && speedGroup.parentElement?.contains(e.target))) setSpeedOpen(false);
  });

  // Task 24: the upright phone's one row is the pill, the mood circle, the chip, then the Speed button, the view controls
  // (one turn button there) and Menu; the chip row (the objectives flag and Messages, both Menu items there) is hidden.
  // At large text the row wraps (the controls stay together at the right). Called only when the mode changes.
  let lastArrange: boolean | null = null;
  const arrange = (compact: boolean): void => {
    if (compact) {
      el.insertBefore(chip, controls);
      controls.replaceChildren(speedWrap, ...endParts, menu);
      dayRow.replaceChildren(...chipParts, messages);
    } else {
      controls.replaceChildren(speedWrap, messages, menu);
      dayRow.replaceChildren(chip, ...chipParts, ...endParts);
    }
    dayRow.hidden = compact;
    cashFull.hidden = !compact;
    setAttr(cash, 'aria-hidden', compact ? 'true' : null);
    if (!compact) {
      setAttr(statusPill, 'title', null);
      for (const a of ['role', 'aria-label', 'title']) setAttr(chip, a, null);
    } else {
      setAttr(chip, 'role', 'group');
    }
  };

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
      const compact = compactTop(ctx.root);
      const textScale = game.settings.get('textScale') as TextScale;
      if (compact !== lastArrange) {
        lastArrange = compact;
        arrange(compact);
        lastUnread = -1;
      }
      const shown = pillFields(layout, textScale, compact);
      const key = shown.join();
      if (key !== lastFields) {
        lastFields = key;
        for (const f of Object.keys(fields) as PillField[]) fields[f].hidden = !shown.includes(f);
      }
      setText(name, s.park.name);
      const cashText = formatMoney(s.park.cash);
      toggleClass(cash, 'neg', s.park.cash < 0);
      setText(guests, String(s.guests.length));
      setText(rating, String(s.park.rating));
      const dateText = formatGameDate(s.tick, true);
      if (compact) {
        // Whole dollars in the pill; the full value is in its name and title. The chip shows the hour; the month and year
        // are in its name and title (Task 24).
        setText(cash, formatMoneyShort(s.park.cash));
        setText(cashFull, cashText);
        setAttr(statusPill, 'title', text('ui.hud.pillCompact', { cash: cashText, guests: s.guests.length }));
        setText(date, formatClock(s.tick, true));
        setAttr(chip, 'aria-label', dateText);
        setAttr(chip, 'title', dateText);
      } else {
        setText(cash, cashText);
        setText(date, dateText);
      }
      weather.update();
      for (const p of extra) p.update(now);
      for (const b of speedButtons) {
        const on = Number(b.dataset.speed) === game.speed;
        setAttr(b, 'aria-pressed', on ? 'true' : 'false');
        toggleClass(b, 'active', on);
      }
      if (game.speed !== lastSpeed) {
        lastSpeed = game.speed;
        // The name is the speed's own name: it keeps the visible `2×` in it (WCAG 2.5.3) and names the paused state.
        setAttr(speedToggle, 'aria-label', text(`ui.speed.${game.speed}`));
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
        const dot = compact && unread > 0;
        menuDot.hidden = !dot;
        const menuLabel = dot ? t('ui.tool.menuUnread', { n: unread }) : text('ui.tool.menu');
        setAttr(menu, 'aria-label', menuLabel);
        setAttr(menu, 'title', menuLabel);
      }
      mood.update(now);
    },
  };
}
