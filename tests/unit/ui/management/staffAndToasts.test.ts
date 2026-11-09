import { describe, expect, it } from 'vitest';
import { executeCommand } from '../../../../src/sim/commands';
import { tileIndex } from '../../../../src/sim/map';
import { uiStrings } from '../../../../src/data/strings/ui';
import { filterStaff, patrolSummary, staffStatusText, totalWages } from '../../../../src/ui/management/staffInfo';
import { forecastText, hudWeatherIcons, weatherIcon } from '../../../../src/ui/management/weather';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../../../../src/data/tuning/core';
import { MESSAGE_TOAST_MS, TOAST_PRIORITY, ToastArbiter, messageHasToast, messageToastPriority } from '../../../../src/ui/management/toastArbiter';
import { makeTestWorld, placeRideDirect } from '../../../helpers/world';

describe('staff panel text', () => {
  it('status lines follow state, then task', () => {
    const world = makeTestWorld();
    const ride = placeRideDirect(world, 'carousel', 10, 10, 0);
    executeCommand(world, { type: 'hireStaff', staffType: 'mechanic' });
    const m = world.state.staff.members[0]!;
    expect(staffStatusText(world, m)).toBe('Walking');
    m.task = 'fix';
    m.fixRideId = ride.id;
    expect(staffStatusText(world, m)).toBe('Heading to fix Carousel');
    m.state = 'fixing';
    expect(staffStatusText(world, m)).toBe('Fixing Carousel');
    m.state = 'walking';
    m.task = 'bin';
    expect(staffStatusText(world, m)).toBe('Heading to empty a bin');
    m.state = 'sweeping';
    expect(staffStatusText(world, m)).toBe('Sweeping litter');
  });

  it('filters by type, sums wages, and summarises the patrol', () => {
    const world = makeTestWorld();
    executeCommand(world, { type: 'hireStaff', staffType: 'groundskeeper' });
    executeCommand(world, { type: 'hireStaff', staffType: 'mechanic' });
    const members = world.state.staff.members;
    expect(filterStaff(members, 'mechanic').map((m) => m.type)).toEqual(['mechanic']);
    expect(filterStaff(members, 'all')).toHaveLength(2);
    expect(totalWages(members)).toBe(5000 + 8000);
    const g = members[0]!;
    expect(patrolSummary(world, g)).toEqual({ tiles: 0, connected: true });
    const map = world.state.map;
    // A patrol far from any path: not reachable → "Patrol area is not connected".
    executeCommand(world, { type: 'editPatrol', staffId: g.id, add: [tileIndex(map, 5, 5), tileIndex(map, 6, 5)], remove: [] });
    expect(patrolSummary(world, g)).toEqual({ tiles: 2, connected: false });
    expect(uiStrings['ui.staff.editPatrol']).toBe('Edit patrol area');
  });
});

describe('weather forecast', () => {
  it('reads "Rain now · Cloudy next" (Phase 3 §7.1)', () => {
    expect(forecastText({ current: 'rain', next: 'cloudy' })).toBe('Rain now · Cloudy next');
    expect(weatherIcon('storm')).toBe('weather_storm');
  });

  it('a clear sky shows the moon at night (20:00–06:00) with After Dark on, the sun by day or with it off', () => {
    expect(weatherIcon('sunny', true)).toBe('weather_night');
    expect(weatherIcon('rain', true)).toBe('weather_rain');
    const w = makeTestWorld();
    const s = w.state;
    s.management.weather = { current: 'sunny', next: 'sunny', nextChangeTick: TICKS_PER_DAY };
    const at = (hour: number, minute = 0): void => {
      s.tick = TICKS_PER_DAY + hour * TICKS_PER_HOUR + Math.round((minute * TICKS_PER_HOUR) / 60);
    };
    s.park.afterDark = true;
    for (const [hour, minute, night] of [[12, 0, false], [19, 59, false], [20, 0, true], [23, 0, true], [5, 59, true], [6, 0, false]] as const) {
      at(hour, minute);
      expect(hudWeatherIcons(s).now, `${hour}:${minute}`).toBe(night ? 'weather_night' : 'weather_sunny');
    }
    // The forecast icon follows the tick its state starts: midnight (night) or noon (day).
    at(21);
    s.management.weather.nextChangeTick = 2 * TICKS_PER_DAY;
    expect(hudWeatherIcons(s)).toEqual({ now: 'weather_night', next: 'weather_night', night: true });
    s.management.weather.nextChangeTick = 2 * TICKS_PER_DAY + 12 * TICKS_PER_HOUR;
    expect(hudWeatherIcons(s).next).toBe('weather_sunny');
    s.management.weather.current = 'cloudy';
    expect(hudWeatherIcons(s).now).toBe('weather_cloudy');
    // After Dark off: no night, so the sun shows at 23:00.
    s.management.weather.current = 'sunny';
    s.park.afterDark = false;
    at(23);
    expect(hudWeatherIcons(s)).toEqual({ now: 'weather_sunny', next: 'weather_sunny', night: false });
  });
});

describe('toast priority (Phase 3 §7.3)', () => {
  it('only breakdown and research messages toast', () => {
    expect(messageHasToast('breakdown')).toBe(true);
    expect(messageHasToast('research')).toBe(true);
    expect(messageHasToast('weather')).toBe(false);
    expect(messageToastPriority('breakdown')).toBe(TOAST_PRIORITY.breakdown);
    expect(messageToastPriority('finance')).toBe(TOAST_PRIORITY.other);
  });

  it('a newer toast replaces an older one of lower or equal priority, never a higher one in its time', () => {
    const a = new ToastArbiter();
    expect(a.offer(TOAST_PRIORITY.other, 0, 3000)).toBe(true);
    expect(a.offer(TOAST_PRIORITY.research, 100, MESSAGE_TOAST_MS)).toBe(true);
    expect(a.offer(TOAST_PRIORITY.other, 200, 3000)).toBe(false);
    expect(a.offer(TOAST_PRIORITY.breakdown, 300, MESSAGE_TOAST_MS)).toBe(true);
    expect(a.offer(TOAST_PRIORITY.research, 400, MESSAGE_TOAST_MS)).toBe(false);
    expect(a.offer(TOAST_PRIORITY.breakdown, 500, MESSAGE_TOAST_MS)).toBe(true);
    // After it expires, anything shows.
    expect(a.offer(TOAST_PRIORITY.other, 500 + MESSAGE_TOAST_MS, 3000)).toBe(true);
    a.clear();
    expect(a.offer(TOAST_PRIORITY.other, 0, 3000)).toBe(true);
  });
});
