/**
 * Ride panel maintenance block (Phase 3 §4.5, §7.1): reliability %, breakdown type, assigned mechanic,
 * breakdowns this month, last inspection, and the inspection interval selector. Owner: W2-B.
 */
import { text } from '../../data/strings/en';
import { INSPECTION_INTERVALS, INSPECT_NEVER, REL_MAX } from '../../data/tuning/staff';
import type { Ride } from '../../sim/rides/types';
import type { UiContext } from '../context';
import { h, newId, toggleClass } from '../dom';
import { meterBar, section, statRow, warningList } from '../widgets';
import { formatDuration, formatSpan } from './time';

export function intervalLabel(ticks: number): string {
  return ticks === INSPECT_NEVER ? text('ui.time.never') : formatSpan(ticks);
}

/** "Waiting for a mechanic", the mechanic's name, or "No mechanic is hired" (broken rides only). */
export function mechanicLine(ctx: UiContext, ride: Ride): string {
  const s = ctx.game.world.state;
  if (ride.status !== 'broken') return text('ui.ride.mechanicNotNeeded');
  if (ride.assignedMechanicId !== null) {
    const m = s.staff.members.find((x) => x.id === ride.assignedMechanicId);
    if (m) return m.name;
  }
  return s.staff.members.some((x) => x.type === 'mechanic') ? text('ui.ride.mechanicWaiting') : text('ui.ride.mechanicNone');
}

export function inspectionOverdue(ride: Ride, now: number): boolean {
  const iv = ride.inspectionIntervalTicks;
  return iv > 0 && ride.status !== 'inspecting' && now - ride.lastInspectionTick >= iv;
}

export function createMaintenanceSection(ctx: UiContext, rideId: number): { el: HTMLElement; update(ride: Ride): void } {
  const { game } = ctx;
  const reliability = meterBar(text('ui.ride.reliability'), { max: 100, format: (v) => `${v}%`, tone: 'neutral' });
  reliability.el.dataset.testid = 'ride-reliability';
  const meter = reliability.el.querySelector('.meter');
  const breakdown = statRow(text('ui.ride.breakdown'));
  const mechanic = statRow(text('ui.ride.mechanic'));
  const count = statRow(text('ui.ride.breakdownsMonth'));
  const last = statRow(text('ui.ride.lastInspection'));
  const warn = warningList();
  const id = newId('inspect');
  const select = h(
    'select',
    {
      id,
      class: 'select',
      'data-testid': 'ride-inspection',
      onchange: () => game.dispatch({ type: 'setInspectionInterval', rideId, intervalTicks: Number(select.value) }),
    },
    ...INSPECTION_INTERVALS.map((t) => h('option', { value: String(t), text: intervalLabel(t) })),
  );
  const el = section(
    text('ui.ride.maintenance'),
    warn.el,
    reliability.el,
    breakdown.el,
    mechanic.el,
    count.el,
    last.el,
    h('label', { class: 'row', for: id }, h('span', { class: 'row-label', text: text('ui.ride.inspectEvery') }), select),
  );
  return {
    el,
    update(r: Ride) {
      const now = game.world.state.tick;
      const pct = Math.round((r.reliability * 100) / REL_MAX);
      reliability.set(pct);
      if (meter) toggleClass(meter, 'low', pct < 50);
      breakdown.set(r.status === 'broken' && r.breakdownType ? text(`breakdown.${r.breakdownType}`) : text('ui.ride.breakdownNone'));
      mechanic.set(mechanicLine(ctx, r));
      count.set(String(r.breakdownsThisMonth));
      last.set(text('ui.ride.ago', { time: formatDuration(now - r.lastInspectionTick) }));
      if (document.activeElement !== select && select.value !== String(r.inspectionIntervalTicks)) select.value = String(r.inspectionIntervalTicks);
      warn.set(inspectionOverdue(r, now) ? [text('ui.ride.inspectionOverdue')] : []);
    },
  };
}
