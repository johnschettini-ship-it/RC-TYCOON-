/** A track type's style spec (items/steel_coaster.js SPEC): the numbers the bake input reads. */
export interface TrackSpec {
  item: string;
  /** Half the width the track takes across (m): bakeNode.ts trackRuns. */
  straddleHalfM: number;
  /** The support top's anchor under the rail line (m). */
  supportTopBelowRail: number;
  [k: string]: unknown;
}
export declare const TRACK_SPECS: Record<string, TrackSpec>;
export declare function trackSpecOf(type: string): TrackSpec;
