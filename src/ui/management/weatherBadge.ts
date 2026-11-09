/**
 * HUD weather (Phase 3 §4.9, §7.1): an icon for the current state and a small forecast icon for `next`.
 * Hover shows "Rain now · Cloudy next"; a tap shows it as a toast (touch has no hover). At night with After Dark on
 * a clear sky shows the moon, not the sun (`hudWeatherIcons`). Owner: W2-B.
 */
import { text } from '../../data/strings/en';
import type { UiContext } from '../context';
import { h, setAttr } from '../dom';
import { setMgmtIcon } from './icons';
import { forecastText, hudWeatherIcons } from './weather';

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
    update() {
      const s = ctx.game.world.state;
      const w = s.management.weather;
      const icons = hudWeatherIcons(s);
      const k = `${w.current}|${w.next}|${icons.now}|${icons.next}`;
      if (k === key) return;
      key = k;
      setMgmtIcon(now, icons.now, `icon weather-${w.current}${icons.now === 'weather_night' ? ' weather-night' : ''}`);
      setMgmtIcon(next, icons.next, `icon small weather-${w.next}${icons.next === 'weather_night' ? ' weather-night' : ''}`);
      const f = forecastText(w);
      setAttr(el, 'title', f);
      setAttr(el, 'aria-label', `${text('ui.hud.weather')}: ${f}`);
      el.dataset.weather = w.current;
      el.dataset.night = icons.night ? 'true' : 'false';
    },
    el,
  };
}
