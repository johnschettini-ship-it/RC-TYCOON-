// Steel Coaster (track ride): every piece the type builds, on the track kit (trackKit.js, batch 5 Task 3). Its models
// are the stage 1 ones the owner approved: steel rails (two round rails over a box spine), round columns, two-row open
// cars. Sets, frames and anchors: trackKit.js header.
import { bakeTrackType, RAIL_STYLES, SUPPORT_STYLES, SEG_H, railModel as kitRail, supportPiece as kitSupport } from './trackKit.js';

/**
 * The style spec: painted light (the game tints track, supports and cars with the ride's colours). The steel numbers
 * the kit and the bake input need (Task 3 review P2: they lived outside the kit, so another type could not set its own):
 *   straddleHalfM        half the width the track takes across (rails 0.5 m off the rail line, 0.055 m thick): a piece
 *                        whose track runs along a tile edge, this far either side, is cut by runs (bakeNode.ts trackRuns);
 *   supportTopBelowRail  the support top's anchor under the rail line (m): the card stacks its columns there, as the
 *                        game does (src/render/real/supportStack.ts SUPPORT_TOP_BELOW_RAIL, which must agree).
 */
export const SPEC = {
  item: 'steel_coaster',
  rail: 'steel',
  supports: 'round',
  car: 'coaster',
  colours: { track: '#e2e2e2', supports: '#dedede', cars: '#ececec' },
  straddleHalfM: 0.6,
  supportTopBelowRail: 1.2,
  // its corkscrew cars in roll halves (trackClasses.ts carSplitClass): whole (uncut by the hold-out ground) one set per
  // quadrant was 8.0-8.6 MiB at d4
  splitCarClasses: ['cork'],
};

// The steel models for the title panorama (items/title.js), which builds its own coaster from them.
export const railModel = (K, s, special, mats) => kitRail(K, s, special, mats, RAIL_STYLES.steel);
export const supportPiece = (K, part, t, mat) => kitSupport(K, part, t, mat, SUPPORT_STYLES.round);
export { SEG_H };

export default {
  bake(B) {
    bakeTrackType(B, SPEC);
  },
};
