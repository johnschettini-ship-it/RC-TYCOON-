/** Staff slice (Phase 3). Owner: W1-H. Shapes follow phase-3-management.md §5. */
import type { EntityId } from '../units';
import type { Costume, StaffType } from '../../data/catalog/types';
import type { Dir } from '../map';

export type StaffStateName = 'walking' | 'sweeping' | 'cleaning' | 'emptying' | 'inspecting' | 'fixing' | 'performing';

export interface Staff {
  id: EntityId;
  type: StaffType;
  name: string;
  tile: number;
  nextTile: number;
  progress: number;
  dir: Dir;
  state: StaffStateName;
  stateTicks: number;
  /** Task target tile, or −1. */
  targetTile: number;
  /** Ride id for mechanic tasks, or −1. */
  targetRideId: EntityId;
  /** Bitset over map tiles (base64 in saves), or null = whole park. */
  patrol: Uint8Array | null;
  costume: Costume | null;
  hiredTick: number;
  hoursThisMonth: number;
}

export interface StaffSlice {
  members: Staff[];
  /** Ride ids waiting for a mechanic, oldest first. */
  pendingBreakdowns: EntityId[];
  autoRepair: boolean;
}

export function createStaffSlice(): StaffSlice {
  return { members: [], pendingBreakdowns: [], autoRepair: false };
}
