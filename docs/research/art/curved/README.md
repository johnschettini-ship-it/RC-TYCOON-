# Curved art concepts: A, B, C

Three style sheets for the "curved, clean" look that replaces pixel art. Every sheet shows **the same scene with
the same objects in the same places**: a 12 x 12 tile grass patch, paved path with a branch, a two-tile queue
line, a carousel, a coaster section (station flat, lift slope, 90 degree curve, drop, support posts, one car with
riders), a food stall with an awning, two trees, a bush, a bench, a lamp, 5 walking guests (plus 2 queuing),
and soft ground shadows. Each sheet also has a 2x guest line-up and a 1.6x "shading rule" (box, cylinder, ball).

All art is original and drawn as code (SVG). No outside images, no outside fonts (system UI font only).

| File | Style |
| --- | --- |
| `a-soft-flat.svg` | A: Soft rounded flat |
| `b-clay.svg` | B: Clay / toy 3D |
| `c-cartoon.svg` | C: Bold cartoon |
| `tools/generate.mjs` | Builds all three SVGs from one scene description (`node tools/generate.mjs`) |
| `tools/render.cjs` | Renders the PNGs in `docs/screenshots/concept-curved-*.png` with Playwright |

The renders: `docs/screenshots/concept-curved-{a,b,c}.png` (1600 x 1000),
`concept-curved-{a,b,c}-phone.png` (390 x 520 CSS px at DPR 2: carousel, queue, path, guests) and
`concept-curved-compare.png` (A, B, C side by side, sheet above, phone crop below).

## How the scene is built (shared by all three)

* Isometric 2:1 projection: `screen = (ox + (x - y) * 52, oy + (x + y) * 26 - z)`, the same model as the game.
* Solids are made from three primitives: **box** (top, left, right face), **cylinder** (side + top ellipse; a
  circle of radius r tiles is an ellipse of `rx = 1.414 * 52 * r`, `ry = rx / 2`), **blob** (ellipse: foliage, heads,
  balls). Thin things are **tubes**: a stroked polyline (rails, posts, limbs, railings).
* Light comes from the upper left: top face lightest, left (+y) face lit, right (+x) face in shade.
* The style only changes how a face, cylinder, blob or tube is filled and outlined. That is why the three sheets
  can be compared one-to-one, and it is also how the game would do it: one renderer, one "material" function.

## A: Soft rounded flat

* **Fills:** two tones per object. Top = base lightened ~14%, left = base, right = base x 0.84.
  Cylinders and balls use a hard light/dark split (no smooth gradient).
* **Outline:** 1.6 px, the fill's own hue darkened to ~0.66 (never black). Tubes = a darker under-stroke 2.4 px wider.
* **Corners:** every polygon is rounded (radius 6 px) with quadratic corners.
* **Shadows:** one blurred dark-green ellipse / footprint per object at ~20% opacity.
* **Canvas 2D mapping:** `fill()` + `stroke()` on `Path2D`s with `quadraticCurveTo` corners. Cylinders split into two
  paths or a 2-stop gradient. Shadows: pre-blurred sprites (do not use `ctx.filter` / `shadowBlur` per frame).
* **Cost:** low. ~2 fills + 1 stroke per face. Easy to cache per ride rotation.

## B: Clay / toy 3D

* **Fills:** smooth linear gradients per face (top light to base; left base to darker near the ground; right
  darker), horizontal multi-stop gradients on cylinders, radial gradients on balls, plus a white specular
  "gloss" ellipse on every ball and a soft white rim on the front edges of boxes and the island.
* **Outline:** none. Edges read from the gradient contrast.
* **Proportions:** chunkier: thicker rails (6 px), posts (9 px), rounder guests with bigger heads, larger corner radius (10 px).
* **Shadows:** two layers: a wide soft blur (ambient) plus a tight dark contact shadow (fake AO). A warm "studio" light
  over the whole scene (light top-left, faint violet bottom-right).
* **Canvas 2D mapping:** `createLinearGradient` / `createRadialGradient` per face. Gradients depend on screen position,
  so they must be made per object or drawn in local space with `translate()`. Gloss = extra ellipse with alpha.
* **Cost:** high. 3 to 5 draw calls per face, many gradient objects, blurred shadows. On phones it only works with
  **pre-rendered sprites** (bake each ride / scenery / guest pose to an offscreen canvas per rotation and zoom),
  which means more memory and re-baking on zoom.

## C: Bold cartoon

* **Fills:** flat. Top and left = base, right = base x 0.8 (exactly one shade step). Balls and foliage: base plus
  one darker crescent.
* **Outline:** one ink colour (`--ink` #1f2340, the UI token) at **2.6 px everywhere**, round joins and caps.
  Tubes = an ink under-stroke `w + 5.2` then the colour stroke `w`.
* **Corners:** rounded (radius 5 px), all shapes curved, no pixel steps.
* **Shadows:** ink at ~17% opacity with a very small blur (1.6 px): soft but simple.
* **Canvas 2D mapping:** `fill()` then `stroke()` with `lineJoin = 'round'`. Ink outlines can be batched: one ink
  `stroke()` for many paths. Guests: 6 to 8 small paths each, same rule.
* **Cost:** low, about the same as A. Strokes at fixed screen width need `lineWidth / zoom` when the camera zooms.
  Matches the UI's existing ink outline and hard-shadow look, so map and HUD share one language.

## Rules for guests and rides (all styles)

* Guest = shadow, back arm, two legs + shoes, torso (or dress), front arm + hand, head, hair/hat, accessory
  (balloon, backpack). 3/4 view; `dir = +1/-1` mirrors. Variety comes from skin, hair style, shirt, trousers
  and accessory, using the game's `SHIRT_COLOURS` family.
* Rides are drawn back to front: back horses, centre column, front horses, then the roof (wedges sorted by depth),
  valance, trim band and lights. Coaster: posts sorted by depth, spine, ties, both rails, then the car.
* Draw order of the whole scene: ground, paths, all ground shadows, then objects sorted by `x + y`.
