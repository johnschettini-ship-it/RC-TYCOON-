/**
 * Show UI read models (Phase 6 §7): show site panel, picker cards, placement status, event toasts; the extension's
 * registration; strings (master R4). Owner: W4-C.
 */
import { describe, expect, it } from 'vitest';
import { showStrings } from '../../../src/data/strings/shows';
import { text } from '../../../src/data/strings/en';
import { Game } from '../../../src/game';
import { executeCommand } from '../../../src/sim/commands';
import { extensionPanel, toolbarEntries, UI_EXTENSIONS } from '../../../src/ui/extensions';
import { showEventToast, showsUi } from '../../../src/ui/shows';
import { scheduleStep, scheduleTime, showCards, showPanelView, showStatusView, whenText } from '../../../src/ui/shows/view';
import { makeTestWorld } from '../../helpers/world';
import { at, placeSite, runTo, scheduleSite, showWorld } from './helpers';

describe('show strings (master R4)', () => {
  it('every key starts with shows. and no text ends with a period', () => {
    for (const [k, v] of Object.entries(showStrings)) {
      expect(k.startsWith('shows.')).toBe(true);
      expect(v.endsWith('.'), k).toBe(false);
    }
    expect(text('shows.notEnoughCash')).toBe('Not enough cash for the show');
  });
});

describe('extension registration', () => {
  it('a Shows toolbar entry, the show site panel, and an event hook', () => {
    expect(UI_EXTENSIONS).toContain(showsUi);
    const entry = toolbarEntries().find((e) => e.id === 'shows');
    expect(entry?.label).toBe('Shows');
    expect(extensionPanel('showSite')).toBeDefined();
    expect(typeof showsUi.bars).toBe('function');
    expect(typeof showsUi.onEvents).toBe('function');
  });
});

describe('show site panel view', () => {
  it('a new site: switched off at 21:00 every day, costs, and the viewing area', () => {
    const w = showWorld();
    const site = placeSite(w, 'lightshow_tower', 30, 36);
    expect(showPanelView(w, site)).toEqual({
      title: 'Lightshow Tower',
      state: 'Off',
      hour: '21',
      minute: '00',
      hourDown: true,
      hourUp: true,
      minuteDown: false,
      minuteUp: true,
      everyNDays: 1,
      enabled: false,
      enabledLabel: 'Shows: Off',
      costPerShow: '$150',
      lastWatchers: '0',
      totalCost: '$0',
      showsRun: '0',
      runningCost: '$40 a month',
      viewTiles: '18 footpath tiles',
    });
  });

  it('the state line follows the show: next show, gathering, running, After Dark off', () => {
    const w = makeTestWorld();
    const site = placeSite(w, 'fireworks_launcher', 20, 20);
    scheduleSite(w, site, 22, 30, 2);
    expect(showPanelView(w, site).state).toBe('Next show today at 22:30');
    runTo(w, at(0, 21, 30) + 1);
    expect(showPanelView(w, site).state).toBe('Guests are gathering for the 22:30 show');
    runTo(w, at(0, 22, 30) + 1);
    expect(showPanelView(w, site).state).toBe('Show running');
    expect(showPanelView(w, site).totalCost).toBe('$400');
    runTo(w, at(1, 12));
    // Every 2 days: from day 1 the next show is on day 2.
    expect(showPanelView(w, site).state).toBe('Next show tomorrow at 22:30');
    w.state.park.afterDark = false;
    expect(showPanelView(w, site).state).toBe('Waiting for After Dark (park panel)');
    executeCommand(w, { type: 'setShowEnabled', id: site.id, enabled: false });
    expect(showPanelView(w, site)).toMatchObject({ state: 'Off', enabledLabel: 'Shows: Off', enabled: false, everyNDays: 2, hour: '22', minute: '30' });
  });

  it('steppers: hour 20–23, minute 00 or 30; ends of the range disable the button', () => {
    expect(scheduleStep({ hour: 21, minute: 0 }, 'hour', 1)).toEqual({ hour: 22, minute: 0 });
    expect(scheduleStep({ hour: 23, minute: 30 }, 'hour', 1)).toBeNull();
    expect(scheduleStep({ hour: 20, minute: 30 }, 'hour', -1)).toBeNull();
    expect(scheduleStep({ hour: 20, minute: 0 }, 'minute', 1)).toEqual({ hour: 20, minute: 30 });
    expect(scheduleStep({ hour: 20, minute: 30 }, 'minute', 1)).toBeNull();
    expect(scheduleStep({ hour: 20, minute: 30 }, 'minute', -1)).toEqual({ hour: 20, minute: 0 });
    expect(scheduleTime({ hour: 20, minute: 30 })).toBe('20:30');
    expect(whenText(at(0, 10), at(0, 21))).toBe('today at 21:00');
    expect(whenText(at(0, 22), at(1, 21))).toBe('tomorrow at 21:00');
    expect(whenText(at(0, 22), at(3, 20, 30))).toBe('in 3 days at 20:30');
  });
});

describe('picker cards and placement status', () => {
  it('both sites with build cost, cost per show, radius, and length; locked until researched', () => {
    const w = makeTestWorld();
    expect(showCards(w)).toEqual([
      { id: 'lightshow_tower', name: 'Lightshow Tower', cost: '$2,500', perShow: '$150 per show', facts: '8 tile view · 15 s show', locked: true, label: 'Lightshow Tower, $2,500, $150 per show' },
      { id: 'fireworks_launcher', name: 'Fireworks Launcher', cost: '$1,500', perShow: '$400 per show', facts: '12 tile view · 20 s show', locked: true, label: 'Fireworks Launcher, $1,500, $400 per show' },
    ]);
  });

  it('status line: pick, hint, ready, or the block reason', () => {
    expect(showStatusView(null, null, false)).toEqual({ title: 'Pick a show site', detail: '', valid: null });
    expect(showStatusView('fireworks_launcher', null, true)).toEqual({ title: 'Fireworks Launcher: $1,500', detail: 'Tap the map, then Confirm', valid: null });
    const ghost = { kind: 'showSite' as const, defId: 'fireworks_launcher', tile: 0, x: 0, y: 0, rotation: 0 as const, tiles: [0], valid: false, reason: 'A path is in the way', cost: 150_000 };
    expect(showStatusView('fireworks_launcher', ghost, false)).toEqual({ title: 'Fireworks Launcher: $1,500', detail: 'A path is in the way', valid: false });
    expect(showStatusView('fireworks_launcher', { ...ghost, valid: true, reason: null }, false).detail).toBe('Ready to build');
  });
});

describe('event toasts', () => {
  it('cancelled → "Not enough cash for the show"; announced → the show time; others none', () => {
    const w = makeTestWorld();
    const site = placeSite(w, 'lightshow_tower', 20, 20);
    scheduleSite(w, site, 20, 30, 1);
    const g = new Game(w);
    expect(showEventToast(g, { type: 'show', siteId: site.id, phase: 'cancelled', watchers: 0 })).toEqual({ message: 'Not enough cash for the show', kind: 'warning' });
    expect(showEventToast(g, { type: 'show', siteId: site.id, phase: 'announced', watchers: 4 })).toEqual({ message: 'Lightshow Tower show at 20:30: guests are gathering', kind: 'info' });
    expect(showEventToast(g, { type: 'show', siteId: site.id, phase: 'started', watchers: 4 })).toBeNull();
    expect(showEventToast(g, { type: 'show', siteId: site.id, phase: 'ended', watchers: 4 })).toBeNull();
  });
});
