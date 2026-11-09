import { describe, expect, it } from 'vitest';
import { executeCommand } from '../../../../src/sim/commands';
import { tileIndex } from '../../../../src/sim/map';
import { uiStrings } from '../../../../src/data/strings/ui';
import { filterStaff, patrolSummary, staffStatusText, totalWages } from '../../../../src/ui/management/staffInfo';
import { forecastText, weatherIcon } from '../../../../src/ui/management/weather';
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
