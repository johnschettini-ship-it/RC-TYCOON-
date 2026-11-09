/**
 * Show UI read models (Phase 6 §7): the show site panel, the picker cards, and the placement status line. Owner: W4-C.
 * Pure (no DOM): the views in this folder render them, the unit tests check them.
 */
import { getShowSiteDef, SHOW_SITES, type ShowSiteDef } from '../../data/catalog';
import { text } from '../../data/strings/en';
import { TICKS_PER_SECOND } from '../../data/tuning/core';
import { SHOW_HOUR_MAX, SHOW_HOUR_MIN } from '../../data/tuning/shows';
import type { ShowGhost } from '../../render/shows/ghost';
import { isUnlocked } from '../../sim/research/api';
import { viewingTiles } from '../../sim/shows/api';
import type { ShowSchedule, ShowSite } from '../../sim/shows/types';
import { dayIndexOf } from '../../sim/time';
import { formatClock } from '../../i18n';
import type { World } from '../../sim/types';
import { formatMoney } from '../format';

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "21:00" from a schedule. */
export function scheduleTime(s: Pick<ShowSchedule, 'hour' | 'minute'>): string {
  return `${pad2(s.hour)}:${pad2(s.minute)}`;
}

/** The clock of a tick in the locale's format ("21:30", or "9:30 PM" with a 12 h clock; W4-G `formatClock`). */
export function tickTime(tick: number): string {
  return formatClock(tick);
}

/** "today at 21:00", "tomorrow at 21:00", "in 2 days at 21:00". */
export function whenText(now: number, tick: number): string {
  const days = dayIndexOf(tick) - dayIndexOf(now);
  const time = tickTime(tick);
  if (days <= 0) return text('shows.when.today', { time });
  if (days === 1) return text('shows.when.tomorrow', { time });
  return text('shows.when.days', { n: days, time });
}

/** The panel's status line. */
export function showStateText(world: World, site: ShowSite): string {
  switch (site.status) {
    case 'announced':
      return text('shows.state.announced', { time: tickTime(site.nextShowTick) });
    case 'running':
      return text('shows.state.running');
    case 'done':
      return text('shows.state.done');
    default:
      if (!site.schedule.enabled || site.nextShowTick < 0) return text('shows.state.off');
      if (!world.state.park.afterDark) return text('shows.state.noAfterDark');
      return text('shows.state.next', { when: whenText(world.state.tick, site.nextShowTick) });
  }
}

/** The schedule after one step of the hour or minute stepper, or null at the end of its range. */
export function scheduleStep(s: Pick<ShowSchedule, 'hour' | 'minute'>, part: 'hour' | 'minute', dir: 1 | -1): { hour: number; minute: 0 | 30 } | null {
  if (part === 'hour') {
    const hour = s.hour + dir;
    return hour < SHOW_HOUR_MIN || hour > SHOW_HOUR_MAX ? null : { hour, minute: s.minute as 0 | 30 };
  }
  const minute = s.minute + dir * 30;
  return minute < 0 || minute > 30 ? null : { hour: s.hour, minute: minute as 0 | 30 };
}

export interface ShowPanelView {
  title: string;
  state: string;
  hour: string;
  minute: string;
  hourDown: boolean;
  hourUp: boolean;
  minuteDown: boolean;
  minuteUp: boolean;
  everyNDays: number;
  enabled: boolean;
  enabledLabel: string;
  costPerShow: string;
  lastWatchers: string;
  totalCost: string;
  showsRun: string;
  runningCost: string;
  viewTiles: string;
}

export function showPanelView(world: World, site: ShowSite): ShowPanelView {
  const def = getShowSiteDef(site.defId);
  const sc = site.schedule;
  return {
    title: def?.name ?? site.defId,
    state: showStateText(world, site),
    hour: pad2(sc.hour),
    minute: pad2(sc.minute),
    hourDown: scheduleStep(sc, 'hour', -1) !== null,
    hourUp: scheduleStep(sc, 'hour', 1) !== null,
    minuteDown: scheduleStep(sc, 'minute', -1) !== null,
    minuteUp: scheduleStep(sc, 'minute', 1) !== null,
    everyNDays: sc.everyNDays,
    enabled: sc.enabled,
    enabledLabel: text(sc.enabled ? 'shows.panel.on' : 'shows.panel.off'),
    costPerShow: formatMoney(def?.costPerShow ?? 0),
    lastWatchers: String(site.lastWatchers),
    totalCost: formatMoney(site.totals.cost),
    showsRun: String(site.totals.shows),
    runningCost: text('shows.panel.perMonth', { cost: formatMoney(def?.runningCostMonthly ?? 0) }),
    viewTiles: text('shows.panel.viewTiles', { n: viewingTiles(world, site.id).length }),
  };
}

export interface ShowCardView {
  id: ShowSiteDef['id'];
  name: string;
  cost: string;
  perShow: string;
  facts: string;
  locked: boolean;
  /** Accessible name of the card button. */
  label: string;
}

export function showCards(world: World): ShowCardView[] {
  return SHOW_SITES.map((def) => {
    const cost = formatMoney(def.buildCost);
    const perShowCost = formatMoney(def.costPerShow);
    return {
      id: def.id,
      name: def.name,
      cost,
      perShow: text('shows.picker.perShow', { cost: perShowCost }),
      facts: text('shows.picker.facts', { radius: def.radius, seconds: Math.round(def.showTicks / TICKS_PER_SECOND) }),
      locked: !isUnlocked(world, def.id),
      label: text('shows.picker.card', { name: def.name, cost, perShow: perShowCost }),
    };
  });
}

export interface ShowStatusView {
  title: string;
  detail: string;
  /** null: no ghost yet. */
  valid: boolean | null;
}

export function showStatusView(defId: string | null, ghost: ShowGhost | null, touch: boolean): ShowStatusView {
  const def = defId ? getShowSiteDef(defId) : undefined;
  if (!def) return { title: text('shows.status.pick'), detail: '', valid: null };
  const title = text('shows.status.place', { name: def.name, cost: formatMoney(def.buildCost) });
  if (!ghost) return { title, detail: text(touch ? 'shows.status.hintTouch' : 'shows.status.hintMouse'), valid: null };
  return { title, detail: ghost.valid ? text('shows.status.valid') : (ghost.reason ?? ''), valid: ghost.valid };
}
