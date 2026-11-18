// Steel Coaster (track ride): every piece the type builds, on the track kit (trackKit.js, batch 5 Task 3). Its models
// are the stage 1 ones the owner approved: steel rails (two round rails over a box spine), round columns, two-row open
// cars. Sets, frames and anchors: trackKit.js header.
import { bakeTrackType, RAIL_STYLES, SUPPORT_STYLES, SEG_H, railModel as kitRail, supportPiece as kitSupport } from './trackKit.js';

/** The style spec: painted light (the game tints track, supports and cars with the ride's colours). */
export const SPEC = {
  item: 'steel_coaster',
  rail: 'steel',
  supports: 'round',
  car: 'coaster',
  colours: { track: '#e2e2e2', supports: '#dedede', cars: '#ececec' },
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
