/**
 * Chain lifts in the realistic look (batch 5 Task 5, owner decision D5), shared by the bake and the game (no imports):
 * the bake shoots a chain trough per rail tile of a chainable piece (frame [pieceId, `t<i>`, `chain`], untinted, in the
 * rail's set: tools/art3d/items/trackKit.js), and the game draws it after the rail on a chained piece, then today's
 * moving dashes over it (track/layer.ts drawChain), restyled for the realistic look.
 */

/** The chain's line under the rail line (m, along the track's up): the top of the baked trough's chain. */
export const CHAIN_LINE_M = -0.04;

/** The realistic dashes: a dark chain line and lighter moving links, thinner than today's (1.8 and 1 px at zoom 1). */
export const CHAIN_STYLE = { base: '#15181d', baseW: 1.1, link: '#7d848d', linkW: 0.6, periodPx: 3 } as const;
