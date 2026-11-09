/**
 * HUD top bar (Phase 0 §4.11, Phase 1 §7): park name, cash, guests, rating, Thrill/Chill balance,
 * date and clock, speed buttons. Owner: W1-B.
 */
import { text } from '../data/strings/en';
import type { Speed } from '../loop';
import { formatDate } from '../sim/time';
import type { UiContext } from './context';
import { h, setAttr, setText, toggleClass } from './dom';
import { formatMoney, sharePercents, temperamentShares } from './format';
import { icon } from './icons';
import { createWeatherBadge } from './management/weatherBadge';

const SPEEDS: readonly Speed[] = [0, 1, 2, 4];
const BALANCE_MS = 500;

export function createHud(ctx: UiContext): { el: HTMLElement; update(now: number): void } {
  const { game } = ctx;
  // Its accessible name is the park name itself; it opens the park panel.
  const name = h('button', { type: 'button', class: 'hud-name', 'data-testid': 'hud-name', title: text('ui.hud.parkName'), 'aria-haspopup': 'true', onclick: () => ctx.openPanel('park') });
  const cash = h('span', { class: 'hud-value', 'data-testid': 'hud-cash' });
  const guests = h('span', { class: 'hud-value', 'data-testid': 'hud-guests' });
  const rating = h('span', { class: 'hud-value', 'data-testid': 'hud-rating' });
  const date = h('span', { class: 'hud-date', 'data-testid': 'hud-date' });
  const segChill = h('i', { class: 'seg seg-chill' });
  const segFamily = h('i', { class: 'seg seg-family' });
  const segThrill = h('i', { class: 'seg seg-thrill' });
  const balance = h('div', { class: 'balance', role: 'img', 'data-testid': 'hud-balance' }, segChill, segFamily, segThrill);

  // Phase 3 §7.1: weather icon with the forecast.
  const weather = createWeatherBadge(ctx);

  const speedButtons = SPEEDS.map((s) =>
    h(
      'button',
      { type: 'button', class: 'speed-btn', 'data-speed': s, 'aria-label': text(`ui.speed.${s}`), 'aria-pressed': 'false', onclick: () => game.setSpeed(s) },
      s === 0 ? icon('pause') : h('span', { text: `${s}×` }),
    ),
  );

  const el = h(
    'header',
    { class: 'hud', role: 'region', 'aria-label': text('ui.hud.label') },
    name,
    h('div', { class: 'hud-item hud-cash', title: text('ui.hud.cash') }, h('span', { class: 'sr-only', text: text('ui.hud.cash') }), cash),
    h('div', { class: 'hud-item hud-guests', title: text('ui.hud.guests') }, icon('guests'), h('span', { class: 'sr-only', text: text('ui.hud.guests') }), guests),
    h('div', { class: 'hud-item hud-rating', title: text('ui.hud.rating') }, icon('star'), h('span', { class: 'sr-only', text: text('ui.hud.rating') }), rating),
    h('div', { class: 'hud-item hud-balance' }, h('span', { class: 'balance-end chill', text: text('ui.tag.chill'), 'aria-hidden': 'true' }), balance, h('span', { class: 'balance-end thrill', text: text('ui.tag.thrill'), 'aria-hidden': 'true' })),
    h('div', { class: 'hud-item hud-clock', title: text('ui.hud.date') }, date),
    weather.el,
    h('div', { class: 'speed', role: 'group', 'aria-label': text('ui.speed.label') }, ...speedButtons),
  );

  let lastBalance = -Infinity;

  return {
    el,
    update(now: number) {
      const s = game.world.state;
      setText(name, s.park.name);
      setText(cash, formatMoney(s.park.cash));
      toggleClass(cash, 'neg', s.park.cash < 0);
      setText(guests, String(s.guests.length));
      setText(rating, String(s.park.rating));
      setText(date, formatDate(s.tick));
      weather.update();
      for (const b of speedButtons) {
        const on = Number(b.dataset.speed) === game.speed;
        setAttr(b, 'aria-pressed', on ? 'true' : 'false');
        toggleClass(b, 'active', on);
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
