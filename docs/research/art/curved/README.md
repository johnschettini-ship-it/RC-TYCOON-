# Curved art concepts: A to G

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
| `d-storybook.svg` | D: Storybook painted (round 2) |
| `e-paper.svg` | E: Paper craft (round 2) |
| `f-poster.svg` | F: Retro poster (round 2) |
| `g-golden.svg` | G: Golden hour lights (round 2) |
| `tools/generate.mjs` | Builds every SVG from one scene description (`node tools/generate.mjs`, or `node tools/generate.mjs d e` for some) |
| `tools/render.cjs` | Renders the PNGs in `docs/screenshots/concept-curved-*.png` with Playwright (`node tools/render.cjs defg` for some) |
| `tools/shrink.py` | Cuts PNGs to a 256-colour palette with Pillow (no pngquant here): `python3 tools/shrink.py d e f compare-2` |

The renders: `docs/screenshots/concept-curved-{a,b,c}.png` (1600 x 1000),
`concept-curved-{a,b,c}-phone.png` (390 x 520 CSS px at DPR 2: carousel, queue, path, guests) and
`concept-curved-compare.png` (A, B, C side by side, sheet above, phone crop below).
Round 2: `concept-curved-{d,e,f,g}.png`, `concept-curved-{d,e,f,g}-phone.png` (same crop) and
`concept-curved-compare-2.png` (D, E, F, G, same layout). D, E, F and compare-2 were cut to 256 colours to stay near
1 MB; G was left at full colour because its sky and glows band badly in a palette (about 1 MB as it is).

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

---

# Round 2: D, E, F, G

Same scene, same primitives, same draw order. Each new style is one more "material" branch in the helpers
(`tone()` picks the face colour, `paint()` draws a filled shape, plus branches in `tube`, `blob`, `cyl`, `shadow`).
A, B and C come out byte-for-byte the same as before.

## D: Storybook painted

* **Fills:** a muted, sun-faded palette. Top = base lightened ~12%, left = base, right = base x 0.8 mixed 16% toward a
  soft violet (gouache shade, never grey). Cylinders and balls keep the hard light/dark split of A.
* **Texture:** one SVG filter (`#paint`) on the whole scene: `feTurbulence` + `feDisplacementMap` (scale 4.5) makes
  every edge slightly wobbly, then two noise layers (a big soft blotch and a fine paper tooth) are multiplied into the
  fills only, clipped to their own alpha. A faint paper grain sits over the background too.
* **Outline:** 1.3 px "coloured pencil": the fill's hue darkened to ~0.5 and pulled toward warm brown, at 85% opacity.
  Tubes = a pencil under-stroke 2 px wider.
* **Shadows:** blurred violet wash (`#5b4a78`, ~20%). Loose watercolour washes on the paper behind the island.
* **Canvas 2D mapping:** shapes are the same `Path2D` fills and strokes as A. The wobble and grain cannot be done per
  frame: `ctx.filter` with SVG filters is slow and not supported everywhere. Bake each sprite (ride per rotation,
  scenery, each guest pose) once with the wobble, then multiply a shared paper-texture image over it
  (`globalCompositeOperation = 'multiply'` inside the sprite's own alpha via `source-atop`).
* **Phone cost: medium.** Drawing is cheap once baked, but **everything must be a pre-rendered sprite**, including
  guests (a few poses x directions x colour sets, or bake on first use and cache). Recolouring shirts at run time
  breaks the baked texture, so either bake per colour or keep the grain as a separate overlay pass. Memory goes up
  with zoom levels.

## E: Paper craft

* **Fills:** bright craft colours, flat. Top = base +10% white, left = base, right = base x 0.84.
* **Edge:** no ink outline. Every shape has a 1 px **white die-cut edge** (a 2 px white stroke drawn *under* the fill,
  `paint-order: stroke`, so only the outer half shows).
* **Layer shadow:** every shape, tube and grass patch drops a copy of itself offset (2, 2.8) px in dark brown at 30%,
  unblurred. Paving slabs are separate cut pieces; the island side is three stacked card layers.
* **Ground shadows:** small offset and a tiny blur (0.8 px). Faint paper fibre noise over the whole sheet.
* **Canvas 2D mapping:** per shape: `translate(2, 2.8)` + fill shadow colour, then `stroke()` white with `lineWidth 2`,
  then `fill()`. Three calls per shape, no gradients, no filters. The fibre texture is one tiled pattern image
  (`createPattern`) drawn over the frame or baked into sprites.
* **Phone cost: low to medium.** About 3x the draw calls of A (shadow, edge, fill), all cheap. Can be drawn live;
  caching rides per rotation is still worth it. Only the paper fibre texture must be a pre-made image.

## F: Retro poster

* **Inks:** six inks on cream paper: navy `#243152`, red `#d6452f`, teal `#2a8a80`, mustard `#e8a62a`, olive
  `#7fa33c`, peach `#efb38f` (paper `#f3e6c8`). The generator snaps every colour in the sheet to the nearest ink, so
  nothing in between can sneak in. Skin tones map to peach / mustard / red (an honest limit of six inks).
* **Fills:** flat ink. **No gradients and no darker fill for shade:** the shade side, the dark crescent on balls and
  every ground shadow are **navy halftone dots** (an SVG `pattern`, 30 degrees). Lights and the sunburst are mustard
  halftone.
* **Outline:** 1.8 px navy, drawn as a separate pass shifted (1.5, 1.1) px: the "out of register" print look.
  Tubes = a navy under-stroke shifted the same way.
* **Grain:** sparse paper-coloured speckle over everything (thresholded noise), plus a printed double border.
* **Canvas 2D mapping:** fills are trivial. Halftone = `ctx.createPattern()` from a small dot tile, set as `fillStyle`
  and filled over the shade paths; the pattern must be anchored in world space (`pattern.setTransform`) or the dots
  swim when the camera scrolls. Misregistration = stroke the same `Path2D` after `translate(1.5, 1.1)`.
* **Phone cost: low to medium.** No blur, no gradients. Patterns are cheap on GPU canvas but the dot tile must scale
  with zoom (or dots turn to mush or to big polka dots); pre-render 2 to 3 tile sizes. The grain is one pre-made
  overlay image. Guests lose detail at phone size: with six inks and navy outlines, small faces get busy.

## G: Golden hour lights

* **Shapes and palette:** A's palette and A's hue outlines (1.4 px); only the light changes.
  Sun low on the left: left faces = base mixed 30% toward orange (the lit side), top faces = base x 0.86 mixed 30%
  toward warm peach (grazing light), right faces = base x 0.55 mixed 45% toward blue (`#2e3a8a`): warm light, cool shade.
* **Sky:** a gradient from deep blue-violet through rose to an orange horizon, a low sun disc with a halo, a few stars.
  A soft-light colour grade (warm left, cool right) sits over everything.
* **Shadows:** long and soft, cast away from the sun (screen right). Tall things get a real cast shadow: the hull of the
  footprint and the top, slid along the ground by height (carousel, stall, trees, lamp, sign, coaster track); small
  things get their contact shadow stretched 2.1x to the right.
* **Lights:** carousel bulbs, coaster bulbs, the lamp (with a warm pool on the path) and the stall window glow: each a
  radial-gradient halo plus a hot core.
* **Canvas 2D mapping:** same as A plus a "time of day" tint per face: in the game this is the same `tone()` with the
  light colour, shade colour and shadow length interpolated over the day (a day/night cycle is one set of numbers).
  Long shadows are one extra polygon per tall object. Glows: **pre-rendered halo sprites** drawn with
  `globalCompositeOperation = 'lighter'` (or `'screen'`), never `shadowBlur`. Sky = one gradient fill per frame.
* **Phone cost: medium.** Shapes cost the same as A. Per-face tints are free if colours are computed once per hour of
  game time, not per frame; but cached ride sprites must be re-baked (or re-tinted) as the light changes, so keep a few
  pre-baked time-of-day variants. Blurred cast shadows and glow halos must be **pre-blurred sprites**; drawing 50 to
  100 additive halo sprites per frame is fine on phones, live blur is not.
