/** Staff slice (Phase 3). Owner: W1-H. Shapes follow phase-3-management.md §5. */
import type { EntityId } from '../units';
import type { Costume, StaffType } from '../../data/catalog/types';
import type { Dir } from '../map';
import type { RideStatus } from '../rides/types';

/** `watering`: Phase 4 garden watering (Groundskeeper task `water`). */
export type StaffStateName = 'walking' | 'sweeping' | 'cleaning' | 'emptying' | 'inspecting' | 'fixing' | 'performing' | 'watering';

/**
 * What the staff member is doing or heading for.
 * `none`: choose at the next tile boundary. `toPatrol`: walking back into the patrol area.
 * `water`: Phase 4 §4.5 — walk to a path tile next to a garden with `waterLevel < 128` and water it.
 */
export type StaffTask = 'none' | 'wander' | 'toPatrol' | 'sweep' | 'mess' | 'bin' | 'water' | 'fix' | 'inspect' | 'roam' | 'perform';

export interface Staff {
  id: EntityId;
  type: StaffType;
  name: string;
  tile: number;
  /** Phase 4 §4.2: height (absolute steps) of the path node the staff member stands on. Maintained by W3-B. */
  z: number;
  /** Tile being walked to, or −1 when standing on `tile`. */
  nextTile: number;
  /** Ticks walked toward `nextTile` (the catalog walk speed is ticks per tile). */
  progress: number;
  dir: Dir;
  state: StaffStateName;
  /** Ticks left in a timed state (sweeping, cleaning, emptying, inspecting, fixing, performing). */
  stateTicks: number;
  /** Task target tile, or −1. */
  targetTile: number;
  /** Ride id of the current mechanic activity (inspection or fix), or −1. */
  targetRideId: EntityId;
  /** Bitset over map tiles (base64 in saves), or null = whole park. */
  patrol: Uint8Array | null;
  costume: Costume | null;
  hiredTick: number;
  hoursThisMonth: number;
  task: StaffTask;
  /** Tiles still to walk, next first. Empty when wandering or standing. */
  route: number[];
  /** Tile the staff member came from (wandering avoids it), or −1. */
  prevTile: number;
  /** A walking staff member re-runs task selection at this tick. */
  nextRecheckTick: number;
  /** Mechanic: ride id of the assigned breakdown, or −1. */
  fixRideId: EntityId;
  /** Mechanic: ride status before the inspection began, restored when it ends. */
  savedRideStatus: RideStatus | null;
  /** Performer: walking ticks left before the next show. */
  walkTicksLeft: number;
}

/** A guest sitting on a bench (Phase 3 §4.3). */
export interface BenchSitter {
  guestId: EntityId;
  tile: number;
  untilTick: number;
}

export interface StaffSlice {
  /** Sorted by id. */
  members: Staff[];
  /** Ride ids waiting for a mechanic, oldest first. */
  pendingBreakdowns: EntityId[];
  /** Park setting: repair broken path items at each hour start (default on). */
  autoRepair: boolean;
  /** Sorted by guest id. */
  benchSitters: BenchSitter[];
  /** Last fix tick per ride (guests score a recently fixed ride lower for 1 day). Sorted by ride id. */
  recentFixes: { rideId: EntityId; tick: number }[];
  /** Day index of the last "not enough cash to repair" message, or −1. */
  repairNoticeDay: number;
}

export function createStaffSlice(): StaffSlice {
  return { members: [], pendingBreakdowns: [], autoRepair: true, benchSitters: [], recentFixes: [], repairNoticeDay: -1 };
}
