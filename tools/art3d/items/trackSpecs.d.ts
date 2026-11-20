/** A track type's style spec (items/steel_coaster.js SPEC): the numbers the bake input reads. */
export interface TrackSpec {
  item: string;
  /** Half the width the track takes across (m): bakeNode.ts trackRuns. */
  straddleHalfM: number;
  /** The support top's anchor under the rail line (m). */
  supportTopBelowRail: number;
  /** Every rail frame has parts that never take the track colour (the bobsled's ice): every piece on a masked sheet. */
  maskedRails?: boolean;
  /** Rail classes baked in two halves (`<class>.0`, `<class>.1`: trackClasses.ts railSplitClass), each set under the per-set limit. */
  splitRailClasses?: string[];
  /** Car classes baked in yaw halves (`<class>.0`, `<class>.1`: trackClasses.ts carSplitClass). */
  splitCarClasses?: string[];
  [k: string]: unknown;
}
export declare const TRACK_SPECS: Record<string, TrackSpec>;
export declare function trackSpecOf(type: string): TrackSpec;
