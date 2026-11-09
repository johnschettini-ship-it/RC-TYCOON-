/**
 * After Dark show sites (Phase 6 §4.4, §5). Owner: W4-C. Slice: `GameState.shows`, sorted by id.
 * A site marks its footprint tiles `Content.Building` with `contentRef` = its id (like a stall without a service
 * side). Fields may be extended by W4-C; update `save/slices/shows.ts` and the 2 → 3 migration line with them.
 */
import type { Dir } from '../map';
import type { Cents, EntityId } from '../units';

/** Phase 6 §4.4: `idle → announced → running → done → idle`. */
export type ShowStatus = 'idle' | 'announced' | 'running' | 'done';

export interface ShowSchedule {
  /** 20–23. */
  hour: number;
  /** 0 or 30. */
  minute: 0 | 30;
  /** 1–3. */
  everyNDays: number;
  enabled: boolean;
}

export interface ShowTotals {
  shows: number;
  /** Total cost of the shows run (cents, ≥ 0). */
  cost: Cents;
  /** Watchers summed over all shows. */
  watchers: number;
}

export interface ShowSite {
  id: EntityId;
  /** `SHOW_SITES` id (`src/data/catalog/showSites.ts`). */
  defId: string;
  /** Footprint origin (minimum x and y). */
  x: number;
  y: number;
  rotation: Dir;
  schedule: ShowSchedule;
  status: ShowStatus;
  /** Tick the next show starts, or −1 when none is scheduled (disabled). */
  nextShowTick: number;
  /** Tick the current or last show started, or −1 (seeds the render RNG with the site id, Phase 6 §4.4). */
  startTick: number;
  /** Watchers of the last show (show site panel). */
  lastWatchers: number;
  totals: ShowTotals;
  /** Build cost paid (park value, 50% refund, master R14–R15). */
  totalBuildCost: Cents;
  builtTick: number;
}

/** Phase 6 §6: a new site's schedule starts disabled at 21:00, every day. */
export function defaultShowSchedule(): ShowSchedule {
  return { hour: 21, minute: 0, everyNDays: 1, enabled: false };
}
