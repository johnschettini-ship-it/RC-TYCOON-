/**
 * The numbers the track shadow bake and the game share (batch 5 Task 4; no imports, so the bake page bundles it alone).
 * The game's side is `./trackShadow.ts`, the bake's `tools/art3d/items/trackKit.js`.
 */

/** The bake's sun (tools/art3d/bakePage.ts VT.sun): elevation and azimuth in degrees, view axes (x, y) = three.js (x, z). */
export const SUN_EL_DEG = 52;
export const SUN_AZ_DEG = 128;

/**
 * The rail shadow's plane under a rail tile's lowest rail (m): the bake shadows the tile's rail onto it, and the game
 * shifts the picture by the plane's height above the ground. Under the spine (0.57 m) and a steep end's run-on.
 */
export const SHADOW_PLANE_BELOW_M = 1.5;
