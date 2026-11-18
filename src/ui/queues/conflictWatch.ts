/**
 * Queue clarity (spec 2026-11-18 §3): a one-time message when a queue that touches another ride's queue is built.
 * The first look at a park only remembers the conflicts it already has (a loaded park says nothing); after that each
 * new pair (ride, owner) is said once per park this session. Reads `queueConflicts` only when the network rebuilt
 * (a new array), so the frame loop pays nothing between edits.
 */
import { queueConflicts, type QueueConflict } from '../../sim/pathing/queues';
import type { World } from '../../sim/types';
import { touchesText } from '../panels/queueCard';

export interface ConflictWatch {
  check(world: World, toast: (message: string, kind: 'warning') => void): void;
}

export function createConflictWatch(): ConflictWatch {
  let world: World | null = null;
  let last: readonly QueueConflict[] | null = null;
  const known = new Set<string>();
  return {
    check(w, toast) {
      const list = queueConflicts(w);
      if (w !== world) {
        world = w;
        known.clear();
        for (const c of list) known.add(`${c.rideId}:${c.ownerId}`);
        last = list;
        return;
      }
      if (list === last) return;
      last = list;
      for (const c of list) {
        const key = `${c.rideId}:${c.ownerId}`;
        if (known.has(key)) continue;
        known.add(key);
        toast(touchesText(w, c), 'warning');
      }
    },
  };
}
