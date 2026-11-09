/** Staff panel view model (Phase 3 §4.2, §7.1). Owner: W2-B. Pure. */
import { STAFF } from '../../data/catalog/people';
import type { StaffType } from '../../data/catalog/types';
import { text } from '../../data/strings/en';
import { patrolHas } from '../../sim/staff/patrol';
import { isPatrolConnected } from '../../sim/staff/tasks';
import type { Staff } from '../../sim/staff/types';
import type { World } from '../../sim/types';
import type { Cents } from '../../sim/units';

export type StaffFilter = 'all' | StaffType;
export const STAFF_FILTERS: readonly StaffFilter[] = ['all', 'groundskeeper', 'mechanic', 'security', 'performer'];

export function staffTypeName(type: StaffType): string {
  return text(`ui.staff.type.${type}`);
}

export function staffWage(type: StaffType): Cents {
  return STAFF.find((d) => d.id === type)?.wageMonthly ?? 0;
}

export function filterStaff(members: readonly Staff[], filter: StaffFilter): Staff[] {
  return filter === 'all' ? members.slice() : members.filter((m) => m.type === filter);
}

export function totalWages(members: readonly Staff[]): Cents {
  let sum = 0;
  for (const m of members) sum += staffWage(m.type);
  return sum;
}

function rideName(world: World, id: number): string {
  return world.state.rides.find((r) => r.id === id)?.name ?? '';
}

/** The status line, for example "Fixing Big Wheel" or "Heading to empty a bin". */
export function staffStatusText(world: World, s: Staff): string {
  switch (s.state) {
    case 'fixing':
      return text('staff.status.fixing', { ride: rideName(world, s.targetRideId >= 0 ? s.targetRideId : s.fixRideId) });
    case 'inspecting':
      return text('staff.status.inspecting', { ride: rideName(world, s.targetRideId) });
    case 'sweeping':
    case 'cleaning':
    case 'emptying':
    case 'performing':
      return text(`staff.status.${s.state}`);
    default:
      break;
  }
  switch (s.task) {
    case 'fix':
      return text('staff.status.goingToFix', { ride: rideName(world, s.fixRideId >= 0 ? s.fixRideId : s.targetRideId) });
    case 'inspect':
      return text('ui.staff.walking.inspect', { ride: rideName(world, s.targetRideId) });
    case 'toPatrol':
    case 'sweep':
    case 'mess':
    case 'bin':
    case 'roam':
    case 'perform':
      return text(`ui.staff.walking.${s.task}`);
    default:
      return text('ui.staff.walking.wander');
  }
}

export interface PatrolSummary {
  /** Painted tiles, 0 = whole park. */
  tiles: number;
  /** False shows "Patrol area is not connected". */
  connected: boolean;
}

export function patrolSummary(world: World, s: Staff): PatrolSummary {
  if (!s.patrol) return { tiles: 0, connected: true };
  let n = 0;
  const total = world.state.map.width * world.state.map.height;
  for (let i = 0; i < total; i++) if (patrolHas(s.patrol, i)) n++;
  return { tiles: n, connected: isPatrolConnected(world, s) };
}
