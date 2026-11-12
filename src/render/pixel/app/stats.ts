/** Phase 8b stage 0b test (never merged): `window.__predrawnStats`, the runtime counters the perf runs read. Timing only measures. */
import type { DecodeRecord } from './store';

const MB = 1024 * 1024;
/** Decode records kept. */
const DECODES_KEPT = 100;

export interface PredrawnStats {
  /** Shared budget use of the last frame: `sheetMb + swapMb + chunkMb + staticMb + otherMb`. */
  budgetMb: number;
  budgetMbMax: number;
  sheetMb: number;
  swapMb: number;
  chunkMb: number;
  staticMb: number;
  /** The rest of the shared sprite memory (live builds: track, riders, and other caches; fix round 1 M1). */
  otherMb: number;
  /** Sheets that failed to fetch or decode twice (fix round 1 M3). */
  failed: number;
  /** Decoded images held now. */
  sheetsDecoded: number;
  /** Missing pictures of the last frame. */
  missing: number;
  /** The last frame had no missing picture and no placeholder ground (Task 15: the e2e `waitComplete`). */
  frameComplete: boolean;
  /** Missing pictures summed over every frame since the last reset. */
  missingTotal: number;
  /** Frames with a missing picture since the last reset. */
  incompleteFrames: number;
  /** Most frames with a missing picture from a view turn to the next complete frame. */
  incompleteAfterTurnMax: number;
  /** Slowest ground chunk assembly (ms). */
  chunkMsMax: number;
  /** Slowest main-thread palette swap (ms). */
  swapMainMsMax: number;
  /** The last 100 decodes. */
  decodeMs: DecodeRecord[];
  /** `performance.now()` of the first complete frame of the open park (−1: none yet). */
  firstCompleteMs: number;
  frameSet: 'full' | 'coarse';
  device: 'phone' | 'tablet';
  /** Zeroes the maxima, the totals and `decodeMs`; keeps `firstCompleteMs`. */
  reset(): void;
}

export function createStats(frameSet: 'full' | 'coarse', device: 'phone' | 'tablet'): PredrawnStats {
  const s: PredrawnStats = {
    budgetMb: 0,
    budgetMbMax: 0,
    sheetMb: 0,
    swapMb: 0,
    chunkMb: 0,
    staticMb: 0,
    otherMb: 0,
    failed: 0,
    sheetsDecoded: 0,
    missing: 0,
    frameComplete: false,
    missingTotal: 0,
    incompleteFrames: 0,
    incompleteAfterTurnMax: 0,
    chunkMsMax: 0,
    swapMainMsMax: 0,
    decodeMs: [],
    firstCompleteMs: -1,
    frameSet,
    device,
    reset() {
      s.budgetMbMax = 0;
      s.missingTotal = 0;
      s.incompleteFrames = 0;
      s.incompleteAfterTurnMax = 0;
      s.chunkMsMax = 0;
      s.swapMainMsMax = 0;
      s.decodeMs.length = 0;
    },
  };
  return s;
}

/** Record one decode (the last `DECODES_KEPT` stay). */
export function noteDecode(s: PredrawnStats, r: DecodeRecord): void {
  s.decodeMs.push(r);
  if (s.decodeMs.length > DECODES_KEPT) s.decodeMs.shift();
}

/** The budget parts of a frame, in MB; `budgetMb` is their sum (Review Focus 5). */
export function noteBudget(s: PredrawnStats, sheetBytes: number, swapBytes: number, chunkBytes: number, staticBytes: number, otherBytes = 0): void {
  s.sheetMb = sheetBytes / MB;
  s.swapMb = swapBytes / MB;
  s.chunkMb = chunkBytes / MB;
  s.staticMb = staticBytes / MB;
  s.otherMb = otherBytes / MB;
  s.budgetMb = s.sheetMb + s.swapMb + s.chunkMb + s.staticMb + s.otherMb;
  if (s.budgetMb > s.budgetMbMax) s.budgetMbMax = s.budgetMb;
}
