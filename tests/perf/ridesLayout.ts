/**
 * The `rides` bench park's layout (phase 8c batch 1): plain data, no imports, so `sceneInfo.ts` can use it.
 *
 * The bench centres the camera on `focus` at zoom 1, pans, then holds zoom 2, 1, 0.5, 2 on a 390 × 844 phone, and turns
 * at zoom 2 (`src/perf/realBench.ts`). At zoom 0.5 the view is 780 × 1688 world px: tall and narrow in the isometric
 * projection, so a compact blob does not fit; the park is a band along the map diagonal that is vertical on screen at
 * rotation 0 (and 2), with the focus in the middle of it. Every footprint is inside the zoom 0.5 view at rotations 0
 * and 2 (rotations 1 and 3 turn the band across the screen: the test records what stays in view) and 7 rides are in
 * view at zoom 2. Cells are `CELL_W × CELL_H` tiles: path lines on every cell edge, a ride at (+1, +1) in its cell,
 * its exit tile on the line north of it and a queue from its entrance to the line south of it.
 */
export const RIDES_FOCUS = { x: 32, y: 32 } as const;
export const CELL_W = 5;
export const CELL_H = 7;
/** Cell (i, j) per ride, in `FLAT_RIDES` order; the cell origin is the focus + (i × CELL_W, j × CELL_H). */
export const RIDES_CELLS: ReadonlyArray<readonly [number, number]> = [
  [-1, -2], [-3, -1], [0, 0], [3, 3], [0, -1], [2, 2], [-2, 0], [0, 1], [1, 0],
  [-1, -1], [-2, -1], [3, 1], [2, 0], [1, 1], [-5, -3], [-1, 0], [-2, -2], [2, 1],
  // New rides batch A (dodgem_boats): free cells of the band, in view at zoom 0.5.
  [-3, -2],
];

/**
 * Flat-ride colours (2026-11-16): six rides are painted, each in a different one of the six `RIDE_COLOUR_CHOICES`
 * (indices into `TRACK_PALETTE`), so the bench decodes and tints six coloured sets. Carousel, the largest ride set, is
 * placed twice (`RIDES_EXTRA`) in two colours: one ride type as two coloured sets. Every other ride stays Original.
 */
export const RIDES_COLOURS: Readonly<Record<string, number>> = {
  carousel: 2, // lemon
  big_wheel: 1, // sunset
  haunted_manor: 3, // leaf
  swing_tower: 7, // grape
  teacup_twirl: 0, // cherry
};
/** The second carousel, in sky, in a free cell of the band that is inside the zoom 0.5 view at rotations 0 and 2. */
export const RIDES_EXTRA = { defId: 'carousel', cell: [1, 2] as const, colour: 4 } as const;
