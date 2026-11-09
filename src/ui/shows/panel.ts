/**
 * Show site panel (Phase 6 §7): the schedule (hour and minute steppers, every-N-days picker), the enabled switch, cost
 * per show, last show watchers, total cost; plus the show state, shows run, running cost, and viewing area. Commands
 * `setShowSchedule` and `setShowEnabled` (free). Every control is a 44 × 44 px `.btn` with a label. Owner: W4-C.
 */
import { text } from '../../data/strings/en';
import { SHOW_EVERY_N_DAYS_MAX, SHOW_EVERY_N_DAYS_MIN } from '../../data/tuning/shows';
import { findShowSite } from '../../sim/shows/api';
import type { ShowSite } from '../../sim/shows/types';
import type { PanelView, UiContext } from '../context';
import { h, newId, setAttr, setText } from '../dom';
import { section, statRow } from '../widgets';
import { scheduleStep, showPanelView } from './view';

export function createShowSitePanel(ctx: UiContext, id: number | null): PanelView {
  const { game } = ctx;
  const siteId = id ?? -1;
  const find = (): ShowSite | undefined => findShowSite(game.world, siteId);

  const setSchedule = (hour: number, minute: number, everyNDays: number): void => {
    game.dispatch({ type: 'setShowSchedule', id: siteId, hour, minute, everyNDays });
  };
  const step = (part: 'hour' | 'minute', dir: 1 | -1): void => {
    const site = find();
    if (!site) return;
    const next = scheduleStep(site.schedule, part, dir);
    if (next) setSchedule(next.hour, next.minute, site.schedule.everyNDays);
  };
  const stepBtn = (testid: string, label: string, glyph: string, onclick: () => void): HTMLButtonElement =>
    h('button', { type: 'button', class: 'btn', 'aria-label': label, 'data-testid': testid, onclick }, glyph);

  const state = h('p', { class: 'shw-state', 'data-testid': 'show-state', role: 'status' });
  const hourDown = stepBtn('show-hour-down', text('shows.panel.hourDown'), '−', () => step('hour', -1));
  const hourUp = stepBtn('show-hour-up', text('shows.panel.hourUp'), '+', () => step('hour', 1));
  const minuteDown = stepBtn('show-minute-down', text('shows.panel.minuteDown'), '−', () => step('minute', -1));
  const minuteUp = stepBtn('show-minute-up', text('shows.panel.minuteUp'), '+', () => step('minute', 1));
  const hour = h('output', { class: 'shw-clock', 'data-testid': 'show-hour', 'aria-label': text('shows.panel.hour') });
  const minute = h('output', { class: 'shw-clock', 'data-testid': 'show-minute', 'aria-label': text('shows.panel.minute') });
  const timeLabel = newId('show-time');
  const time = h(
    'div',
    { class: 'shw-time', role: 'group', 'aria-labelledby': timeLabel },
    hourDown,
    hour,
    hourUp,
    h('span', { class: 'shw-colon', 'aria-hidden': 'true', text: ':' }),
    minuteDown,
    minute,
    minuteUp,
  );
  const daysLabel = newId('show-days');
  const dayButtons: HTMLButtonElement[] = [];
  for (let n = SHOW_EVERY_N_DAYS_MIN; n <= SHOW_EVERY_N_DAYS_MAX; n++) {
    dayButtons.push(
      h('button', {
        type: 'button',
        class: 'btn',
        role: 'radio',
        'aria-checked': 'false',
        'data-testid': `show-days-${n}`,
        text: text(`shows.panel.days.${n}`),
        onclick: () => {
          const site = find();
          if (site) setSchedule(site.schedule.hour, site.schedule.minute, n);
        },
      }),
    );
  }
  const days = h('div', { class: 'shw-days', role: 'radiogroup', 'aria-labelledby': daysLabel }, ...dayButtons);
  const enabled = h('button', {
    type: 'button',
    class: 'btn toggle',
    'data-testid': 'show-enabled',
    onclick: () => {
      const site = find();
      if (site) game.dispatch({ type: 'setShowEnabled', id: siteId, enabled: !site.schedule.enabled });
    },
  });
  const costPerShow = statRow(text('shows.panel.costPerShow'));
  const lastWatchers = statRow(text('shows.panel.lastWatchers'));
  const totalCost = statRow(text('shows.panel.totalCost'));
  const showsRun = statRow(text('shows.panel.showsRun'));
  const running = statRow(text('shows.panel.runningCost'));
  const viewArea = statRow(text('shows.panel.viewArea'));
  costPerShow.el.dataset.testid = 'show-cost-per-show';
  lastWatchers.el.dataset.testid = 'show-last-watchers';
  totalCost.el.dataset.testid = 'show-total-cost';

  const body = h(
    'div',
    { class: 'panel-content', 'data-testid': 'show-panel' },
    section(null, state, enabled),
    section(
      text('shows.panel.schedule'),
      h('p', { id: timeLabel, class: 'row-label', text: text('shows.panel.startTime') }),
      time,
      h('p', { id: daysLabel, class: 'row-label', text: text('shows.panel.every') }),
      days,
    ),
    section(null, costPerShow.el, lastWatchers.el, totalCost.el, showsRun.el, running.el, viewArea.el),
  );
  const site0 = find();

  return {
    kind: 'showSite',
    id: siteId,
    title: site0 ? showPanelView(game.world, site0).title : '',
    body,
    update() {
      const site = find();
      if (!site) return false;
      const v = showPanelView(game.world, site);
      setText(state, v.state);
      setText(hour, v.hour);
      setText(minute, v.minute);
      if (hourDown.disabled === v.hourDown) hourDown.disabled = !v.hourDown;
      if (hourUp.disabled === v.hourUp) hourUp.disabled = !v.hourUp;
      if (minuteDown.disabled === v.minuteDown) minuteDown.disabled = !v.minuteDown;
      if (minuteUp.disabled === v.minuteUp) minuteUp.disabled = !v.minuteUp;
      dayButtons.forEach((b, k) => setAttr(b, 'aria-checked', k + SHOW_EVERY_N_DAYS_MIN === v.everyNDays ? 'true' : 'false'));
      setText(enabled, v.enabledLabel);
      setAttr(enabled, 'aria-pressed', v.enabled ? 'true' : 'false');
      costPerShow.set(v.costPerShow);
      lastWatchers.set(v.lastWatchers);
      totalCost.set(v.totalCost);
      showsRun.set(v.showsRun);
      running.set(v.runningCost);
      viewArea.set(v.viewTiles);
      return true;
    },
  };
}
