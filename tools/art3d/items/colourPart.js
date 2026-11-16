// Pure (no three.js, so vitest can load it): the ride colour part (ride colour choice). Each flat ride module marks the
// materials of the part a visitor would call "the ride's colour" with `colourPart`, and bakes with
// `masked: partMask` and `baseColour` (the part's designed colour): the bake writes a tint mask beside every ride sheet
// (white on the part, black elsewhere, soft only at edges) and records the base colour in the index, so the game can
// recolour the part at load as `target × lum(pixel) / lum(base)` within the mask, keeping the shading.
//
// A part material is marked whole, or with a mask map: a texture laid out as the material's own map, white where the
// part's colour family is and black elsewhere (a red-and-cream striped canopy masks its red stripes only). Marks live
// in a WeakMap, so a material cloned from a part material is not part of the colour unless it is marked itself.

const PART = new WeakMap();

/** Marks `material` as the ride's colour part (`maskMap`: only where that texture is white). Returns the material. */
export function colourPart(material, maskMap) {
  PART.set(material, maskMap ? { map: maskMap } : true);
  return material;
}

/** The `masked` predicate of a ride bake: per mesh, its mask (true, { map } or false), per material for an array. */
export function partMask(mesh) {
  const m = mesh.material;
  return Array.isArray(m) ? m.map((x) => PART.get(x) ?? false) : (PART.get(m) ?? false);
}

const HEX = /^#[0-9a-f]{6}$/;

/** A ride bakes its colour part's mask and a lowercase `#rrggbb` base colour; other kinds need neither. */
export function checkRideColour(kind, item, { masked, baseColour }) {
  if (kind !== 'ride') return;
  if (typeof masked !== 'function') throw new Error(`${item}: a ride bakes a tint mask of its colour part (masked: partMask)`);
  if (typeof baseColour !== 'string' || !HEX.test(baseColour)) throw new Error(`${item}: base colour '${baseColour}' must be its colour part's designed colour as #rrggbb (lowercase)`);
}
