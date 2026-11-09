/**
 * HUD weather (Phase 3 §4.9, §7.1): an icon for the current state and a small forecast icon for `next`.
 * Hover shows "Rain now · Cloudy next"; a tap shows it as a toast (touch has no hover). Owner: W2-B.
 */
import { text } from '../../data/strings/en';
import type { UiContext } from '../context';
import { h, setAttr } from '../dom';
import { setMgmtIcon } from './icons';
import { forecastText, weatherIcon } from './weather';

export function createWeatherBadge(ctx: UiContext): { el: HTMLElement; update(): void } {
  const now = h('span', { class: 'weather-now', 'aria-hidden': 'true' });
  const next = h('span', { class: 'weather-next', 'aria-hidden': 'true' });
  const el = h(
    'button',
    {
      type: 'button',
      class: 'hud-weather',
      'data-testid': 'hud-weather',
      onclick: () => ctx.toast(forecastText(ctx.game.world.state.management.weather), 'info'),
    },
    now,
    next,
  );
  let key = '';
  return {
    el,
    update() {
      const w = ctx.game.world.state.management.weather;
      const k = `${w.current}|${w.next}`;
      if (k === key) return;
      key = k;
      setMgmtIcon(now, weatherIcon(w.current), `icon weather-${w.current}`);
      setMgmtIcon(next, weatherIcon(w.next), `icon small weather-${w.next}`);
      const f = forecastText(w);
      setAttr(el, 'title', f);
      setAttr(el, 'aria-label', `${text('ui.hud.weather')}: ${f}`);
      el.dataset.weather = w.current;
    },
  };
}
