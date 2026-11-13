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

---

# Round 3: H, I, J, K — four different looks

A to G share one scene, one set of shapes and one draw order; only the surface material changes, so they read
as one look in seven finishes. Round 3 drops that rule. Each of H, I, J and K has **its own scene layout,
proportions, shape language, lighting and content**: water with a bridge, terrain steps, a bigger ride, trees in
groups. What stays is the game camera: isometric 2:1, `screen = (ox + (x - y) * 52 * s, oy + (x + y) * 26 * s - z * s)`
(only the zoom `s` changes per sheet) with the same four 90 degree turns, so any of the four could ship.

| File | Style |
| --- | --- |
| `h-toy.svg` | H: Chunky toy diorama |
| `i-neon.svg` | I: Neon night |
| `j-lush.svg` | J: Lush premium mobile |
| `k-minimal.svg` | K: Minimal geometric |
| `tools/generate-r3.mjs` | Builds H to K (`node tools/generate-r3.mjs`, or `node tools/generate-r3.mjs h j`). Separate from `generate.mjs`, so A to G stay byte-identical |
| `tools/render-r3.cjs` | Renders `concept-curved-{h,i,j,k}.png` (1600 x 1000), `-phone.png` (390 x 520 CSS px at DPR 2, each framed on a ride, a path and guests) and `concept-curved-compare-3.png` (same layout as compare-2) |
| `tools/shrink-r3.py` | Cuts only PNGs over ~1 MB to 256 colours, with the fast-octree quantizer (median cut, as in `shrink.py`, averaged away J's small saturated shirt and flower colours). Only J's sheet and compare-3 needed it |

New shared building block: the **rounded slab** (`Ctx.slab`): a rounded rectangle in grid space, extruded; its side
is the hull of top and bottom outline, filled with a two-colour split at the front corner (lit left, shaded
right). Every terrain piece in round 3 (tray, land, hill, path, flowerbed, kerb) is one or more slabs stacked by
height, which is also a direct model for the game's terrain: draw a height level's sides first, then its tops.

## H: Chunky toy diorama

* **Look:** painted wooden toys on a blue plastic tray, photographed close with a tilt-shift lens. Two land
  pieces and a stacked-block hill sit in the tray's water; a channel with a chunky bridge, a pond with a duck boat.
  Rides are stubby and fat: a teacup ride on a striped turntable, a short oval coaster with one hump, fat yellow
  posts and bathtub cars, a popcorn stall topped by a giant bucket. Lollipop and stacked-cone trees.
* **Guests:** peg dolls. A rounded peg body (shirt painted on top, trousers band below) and a ball head that is
  ~42% of the height, two dot eyes, cheeks, a hair cap. No legs, stub arms. They are the most readable guests of
  all eleven sheets at phone size.
* **Fills:** primaries (red, blue, yellow, green, white) in three flat tones per paint: top = +16% white, left =
  base, right = x0.74. No gradients on objects. Balls: flat base, flat shade crescent, one white satin highlight.
* **Outline:** none. Instead a thin light **bevel line** on the front top edge of every slab and box (the
  rounded toy edge catching light).
* **Light / shadows:** soft blurred contact shadows in dark blue; one large warm shadow of the tray on the table.
* **Tilt-shift:** the scene is drawn twice: once blurred (6 px at sheet scale), once sharp through a horizontal
  band mask (sharp between ~42% and ~66% of the height). Out-of-focus bokeh circles in the backdrop.
* **Canvas 2D mapping:** shapes are `fill()` only (3 fills + 1 stroke per box). Tilt-shift: render the world to
  an offscreen canvas, draw it once with `ctx.filter = 'blur(4px)'` into a **half-resolution** buffer, then draw the
  sharp frame on top through a gradient alpha mask (`destination-in` with a linear gradient). Better: skip the
  blurred pass on phones and keep only a soft vignette; the toy proportions carry the look by themselves.
* **Phone cost: low for the art, medium with tilt-shift.** Objects are cheaper than A (no outlines). The
  full-frame blur is one extra full-screen pass per frame; at DPR 2 on a mid phone that is the most expensive part
  of this style. Pre-draw: nothing is required, but caching rides per rotation is easy and worth it.

## I: Neon night

* **Look:** night is the base, not a filter. A dark navy park on a black plinth, a canal across the middle with
  an arched light bridge, a **big Ferris wheel** (two magenta rims, 16 spokes, 12 lit gondolas, bulbs), a coaster
  with a lift, a drop and a **vertical loop** in yellow, a twister flat ride, a snack stall with a glowing window
  and a neon roof sign, lamps, dark trees with fairy lights, stars and a crescent moon.
* **Shape language:** lines, not solids. Rides, path edges and land edges are neon tubes; fill is used only
  where light falls (light pools on the ground, the stall window, gondola windows). A faint tile lattice shows
  the game grid.
* **Neon:** every tube = 3 strokes of the same path: a wide halo (6.5x width, 10% opacity), a glow (2.6x, 32%) and a
  near-white core. **No blur filter.** Bulbs = a faint disc plus a hot dot.
* **Guests:** small dark silhouettes, rim-lit: the whole silhouette is drawn in the nearest light's colour, nudged
  ~1.3 px toward that light, then the dark shape on top, so a thin coloured crescent stays on one side. Each guest
  carries one glowing item (balloon, headband, glow stick, phone, light-up ears).
* **Water:** the neon objects are drawn a second time with mirrored height around the water level (a second
  `Ctx` with `zMirror`), clipped to the canal, slightly blurred and dimmed, plus short ripple streaks.
* **Canvas 2D mapping:** three `stroke()`s per tube with `globalCompositeOperation = 'lighter'` for halo and glow
  (additive light, the right look and cheap on GPU canvas). Light pools = pre-rendered radial-gradient sprites
  drawn with `'lighter'`. Reflection = the neon layer drawn again with a flipped `setTransform` into the canal's
  clip, at low alpha (blur optional).
* **Phone cost: medium.** No textures, few fills, but many long strokes and overdraw: every tube is drawn 3x,
  the reflection doubles the neon layer, and additive blending over large halos costs fill rate. Pre-draw: light
  pools and bulb glows as sprites; cache each ride's neon per rotation on an offscreen canvas (one `drawImage`
  instead of ~100 strokes). At phone size the rides read very well (light on dark), but guests are the weakest:
  they are read by their glow item and rim, not by colour or clothes, so telling guests apart is hard.

## J: Lush premium mobile

* **Look:** rich and polished. A lake washes around three land pieces with a shallow-water halo, a white foam
  band and a sandy rim; soil sides with a darker base; a rock-sided hill with strata lines and a tree grove on top;
  a wooden plank bridge to an island; lily pads and water sparkles. Rides: a glossy red tubular coaster on white
  posts with a coloured train, a **swing ride** (striped canopy, scalloped valance, ten chair swings flung out
  with riders), a round fruit hut with a thatched cone roof. Flowerbeds with dense blooms, benches, lamps, bushes.
* **Fills:** soft gradients everywhere: vertical gradients on side faces, a 4-stop "turned" gradient on
  cylinders, a radial gloss gradient plus a specular oval on every sphere (foliage, balloons, fruit, lamp globes),
  a back-to-front gradient on the grass, a warm-to-cool gradient on the paving. A soft sunlight/vignette overlay.
* **Outline:** none. Edges come from tone steps and a 1.4 px white highlight on the front top edges.
* **Shadows:** soft blurred ambient occlusion under every object (stronger and tighter than A's shadows).
* **Paths:** kerb stones (a raised light band with stone joints), paving joints every half tile, warm fill.
* **Guests:** slim chibi (head ~26% of height): shoes, legs that step, a gradient shirt, swinging arms, a radial
  shaded head, hair with a highlight; hats, backpacks, glossy balloons.
* **Canvas 2D mapping:** gradients must be created per object in local space (`translate` then a cached
  `CanvasGradient`); AO, foam and water halo are pre-blurred sprites; grass tufts and paving joints belong in a
  pre-rendered terrain chunk, never drawn per frame.
* **Phone cost: high.** It is the most detailed sheet: several gradient fills per face, ~500 tufts, foam and
  halos, 5 to 7 gloss spheres per tree. It only runs on phones as **pre-rendered sprites**: terrain baked in
  chunks per rotation, each ride / tree / flowerbed / guest pose baked per rotation and zoom level, which means a
  sprite atlas, memory per zoom step and re-baking when terrain changes. That is the normal pipeline of polished
  mobile tycoon games; it is a production cost, not a frame-time cost.

## K: Minimal geometric

* **Look:** calm and premium. A square ground plate, a raised plateau with stairs, a sunken pool, a few flat
  paths, cone and cylinder trees in groups, a tall **drop tower** (one square column, a ring carriage, a cap), a
  coaster drawn as a two-plane ribbon on thin posts, a stall = a cube under a tilted roof plane. Lots of empty
  bone-coloured space and one flat sun disc.
* **Palette:** exactly five colours: bone `#f3eee5`, sage `#a9c2a4`, coral `#e8735a`, amber `#f2b84b`, slate
  `#2f4858`. Every face is one of three planes of light: top = the colour, left = mixed 17% toward slate, right =
  mixed 40% toward slate. No other tones.
* **Outline, texture, gradients:** none. Cylinders and cones are split into a lit half and a shade half by one
  hard stop.
* **Shadows:** hard, flat, cast by height: one slate plane at 20% per object (hull of the footprint and the
  footprint slid along the sun vector by its height), clipped to the surface it falls on. The tower's shadow runs
  across the plateau and down to the ground; the coaster's is the track projected onto the ground.
* **Guests:** capsules: a body capsule and a round head, each split light/shade, a short flat shadow. No faces,
  no limbs; colour = shirt.
* **Canvas 2D mapping:** one `fill()` per face with a solid colour (the three planes can be computed once per
  colour and per rotation: rotating the camera only swaps which tone sits on which face). Cast shadows: one
  polygon per object, all drawn in one batch with a single `globalAlpha` (overlaps get darker; draw them into an
  offscreen layer at full alpha and composite once at 20% if that matters).
* **Phone cost: the lowest of all eleven sheets.** ~1 fill per face, no strokes, no gradients, no blur, no
  textures. Nothing has to be pre-drawn; everything can be drawn live, even at DPR 2. The price is information:
  guests are only colour and position (good for crowds, bad for "which guest is that"), and rides must be
  recognised from silhouette alone.

## Which reads best at phone size

* **H** reads best for the things a tycoon player taps most: guests and rides. The big heads and the flat
  primaries make every guest distinct at 1x, and the fat ride shapes survive any zoom. Its cost sits in the
  tilt-shift pass, which can be dropped on phones without losing the look.
* **K** is the cleanest and cheapest and reads very well for layout (paths, terrain, rides), but its guests are
  anonymous capsules.
* **J** looks the most "finished" but is busy at phone size: the detail (tufts, flowers, joints) turns into
  noise below ~1x and guests compete with flowerbeds for attention. It needs the most production work.
* **I** has the strongest mood and rides pop, but guests are the hardest to tell apart and night-only play needs
  a daytime counterpart for long sessions.

---

# Round 4: L, M, N, O — four more different looks

Same rule as round 3: each sheet has its **own layout, proportions, shape language, light and content**; only the
game camera is shared (isometric 2:1, `screen = (ox + (x - y) * 52 * s, oy + (x + y) * 26 * s - z * s)`, four 90 degree
turns). Every sheet has a coaster, a flat ride, a stall, paths, walking guests, a 2x guest line-up and a style note.

**Riders sit in the cars now.** Round 3 drew riders standing on top of cars. Round 4 treats every car, cup, gondola
and boat as a **tub**: draw the opening (a dark well), then the riders' upper bodies (arms up) with their hips below
the rim, then the car's camera-facing walls *over* their laps. Shared helpers in `generate-r4.mjs`:
`carGeom` (a car on a track by arc length: corners, the side faces the camera can see, seat points) and `cupGeom`
(an open cylinder plus its **front wall** = side minus the opening). In the game this is the same: ride sprite back
half, rider sprites, ride sprite front half.

| File | Style |
| --- | --- |
| `l-sky.svg` | L: Sky islands |
| `m-felt.svg` | M: Felt and stitch |
| `n-glass.svg` | N: Stained glass |
| `o-retro.svg` | O: Retro-future chrome |
| `tools/generate-r4.mjs` | Builds L to O (`node tools/generate-r4.mjs`, or `node tools/generate-r4.mjs l n`). Colour/geometry helpers copied from `generate-r3.mjs`; A to K are untouched |
| `tools/render-r4.cjs` | Renders `concept-curved-{l,m,n,o}.png` (1600 x 1000), `-phone.png` (390 x 520 CSS px at DPR 2, framed on a ride, a path and guests) and `concept-curved-compare-4.png` (same layout as compare-3) |
| `tools/shrink-r3.py` | Reused: `python3 tools/shrink-r3.py m n compare-4` cut M's phone crop, N's sheet and compare-4 to 256 colours (they were over 1 MB) |

## L: Sky islands

* **Look:** the park floats on three pastel islands (blob tops, hanging rock undersides with strata and vines)
  joined by sagging rope bridges with plank decks, over a cloud sea. Rides are grown, not built: a **flower-petal
  spinner** (lily-pad base, a stem, a nine-petal canopy, petal cups with seated riders), a **vine coaster** with
  curving leaf-stem supports and seed-pod cars, a **mushroom stall** (spotted dome cap, serving window in the stalk).
  Cotton-candy puff trees, a bell-flower lamp, small floating rocks.
* **Fills:** soft gradients everywhere: sides go lilac-shade → base → lit (left to right), spheres are radial with
  the light centre upper right, the grass is a radial mint, the sky a pink → lilac → mint ramp with a pale sun glow.
* **Outline:** none. Instead a **rim light**: the sun is *behind* the park (upper right), so every silhouette gets a
  thin white line on its sun side (the back edge of each island top, the right edge of cylinders, balls, guests).
* **Shade:** mixed toward lilac `#8a74c8`, never grey or black. Shadows are soft lilac blurs.
* **Guests:** soft bell-shaped cloaks, round heads with rim light, trailing scarves, parasols and heart balloons.
* **Canvas 2D mapping:** gradients per object in local space (`translate` + cached `CanvasGradient`); the rim line is
  one extra `stroke()` of a partial arc / edge path with `globalAlpha`. Islands = one `Path2D` each (top, lip band,
  underside); bridges are lines. Clouds and island glows = pre-blurred sprites.
* **Phone cost: medium.** No filters, but 2 to 4 gradient fills plus a rim stroke per object, and big translucent
  cloud layers (overdraw). Pre-draw: clouds, glows, island undersides (static) and the puff trees; rides can be live
  or cached per rotation. Floating islands also change the game: terrain becomes discrete islands, so paths need
  bridges and the build grid needs "no ground here" tiles.

## M: Felt and stitch

* **Look:** a plush toy park on a padded patchwork cushion on a gingham cloth. Every panel is felt with a dashed
  thread seam just inside its edge; the cushion has a piped cord edge. A **plush octopus spinner** (button eyes,
  stitched smile, yarn arms swinging felt cups with seated riders), a **yarn coaster** on ribbed knitted posts with
  pillow cars (a button badge on the nose), a **cupcake stall** (pleated wrapper, three frosting puffs, a red button
  cherry), felt-disc trees with button apples, stitched pines, spool-of-thread lamps, a felt pond with lily pads.
* **Fills:** flat felt colours, three tones per box (top = base, left x0.88, right x0.74). Warm, cosy palette: rust,
  berry, mustard, teal, olive, oat, cream.
* **Puff:** every panel gets an SVG filter (`#mPuff`): inner shadow along its lower-right edge and a soft light along
  its upper-left edge, so each piece looks stuffed. Guests get a lighter version on the whole figure.
* **Seams:** dashed thread 1.3 px (`4 3`), drawn on a copy of the shape inset ~4 px. **Yarn** = 3 strokes (dark
  under-stroke, colour, light dashed ply). **Knit** = a thick stroke with a dashed dark/light rib overlay.
* **Texture:** one filter over the whole scene: a 2.4 px turbulence displacement (fuzzy felt edges) and a fibre
  noise multiplied into the colours (arithmetic composite, so translucent shadows stay dark).
* **Guests:** plush dolls: round felt heads with button eyes and a stitched smile, yarn-loop or braided hair, beanies
  with pompoms, a seam down the body, sewn-on patches, stubby legs.
* **Canvas 2D mapping:** shapes are cheap `fill()`s; seams are `setLineDash` strokes. The puff cannot be live
  (`ctx.filter` / `shadowBlur` per panel per frame is far too slow): bake it. Felt fibre is a tiled noise texture
  multiplied in (`globalCompositeOperation = 'multiply'` on the sprite, clipped by `source-atop`).
* **Phone cost: high to draw live, medium if baked.** About 130 puff-filtered panels plus every guest on this one sheet. **Must be
  pre-drawn:** every ride, tree, stall and guest pose as a sprite per rotation with the puff and fibre baked in;
  the ground as baked terrain chunks. Shirt recolouring at run time would break the baked fibre, so bake per colour
  set or keep the fibre as an overlay pass. At phone size it reads very well: the shapes are fat and the colours warm.

## N: Stained glass

* **Look:** the park is a glass window lit from behind, sitting on a dark lead-latticed field. The octagonal deck
  is a **mosaic**: a jittered lattice of half-tile cells (some split into triangles), each cell coloured by what lies
  there (emerald grass, topaz/citrine paths, sapphire water, ruby/amethyst flowerbed). Rides: a **swinging boat**
  on twin sapphire A-frames (the hull cut into ruby/citrine and sapphire/amethyst panes, a sun-disc medallion,
  seated rows), a **camelback coaster** with ruby glass rails on amber posts banded with lead, a **hexagonal
  lantern kiosk** with a pyramid roof of jewel triangles. Glass-cut trees and cypresses, diamond lanterns.
* **Fills:** every piece is one **radial gradient** (light centre `light(col, 0.62)` → body → deep edge
  `shade(col, 0.72)`): the "light shining through" look. Faces in shade use darker glass; that is the only shading.
* **Lead:** `#1b1722`, 3 px on objects, 2.4 px on the ground mosaic, 5 px around the deck, ~1 to 2 px on guests.
  Faces are cut 1 to 3 times by a recursive chord split (`cut()`); cylinders into staves; crowns into leaf pieces.
* **Light:** four screen-blended sunbeam bands over the whole sheet plus floating motes; the colours the glass throws
  are blurred jewel pools on the floor below the deck.
* **Guests:** built from lead-framed glass pieces: two-tone torso (lit half / dark half), legs, arms, a round head,
  a hair or crown piece, glass balloons.
* **Canvas 2D mapping:** each piece = `fill()` with a radial gradient + `stroke()` lead. Batch the lead: draw all
  fills, then ONE `stroke()` of a combined `Path2D` per layer. Gradients are per piece, so cache them per colour
  and use `setTransform` to place them (or bake). Beams = 4 gradient quads with `'screen'`; floor light = sprites.
* **Phone cost: medium to high.** About 400 mosaic pieces for the ground alone. **Must be pre-drawn:** the ground
  mosaic as baked terrain chunks (it only changes when paths change); rides and trees cached per rotation. Guests
  can be drawn live (8 to 10 pieces each) or baked. Beams and pools are cheap. Readability is good because the
  lead line separates everything, but the ground is busy: paths read by colour family, not by edges.

## O: Retro-future chrome

* **Look:** a 1960s idea of tomorrow on a rounded cream **terrazzo plaza** (speckled) on an orange band, under a
  teal sky with a ringed planet, orbit lines and atomic starbursts. A **monorail** (cream beam with an orange stripe,
  swept chrome cone pylons, a three-car train with seated riders under glass canopies), the **Orbiter** (chrome
  column, mirror-ball hub, five saucer gondolas under glass domes with seated riders, a starburst platform),
  the **Comet coaster** (twin chrome tube rails on a teal spine, rocket cars with a chrome tail fin), a **Googie
  kiosk** (glass drum, boomerang V roof, tilted "SNACKS" sign on a starburst pole), boomerang planters with spiky
  plants, palms, starburst lamps, a kidney pool, boomerang-curved walkways with orange edging.
* **Chrome:** a 9-stop vertical **band gradient** on cylinders, pylons and tubes (dark / white / grey / dark /
  warm ground reflection / light / dark); spheres use a **horizon reflection** (teal sky above, a hard dark horizon
  line, warm ground below) plus a white specular oval. Tubes = dark under-stroke, grey, and a white highlight
  stroke nudged up.
* **Paint:** flat, two tones with a hard split (`c.split`), no texture. **Glass:** 30% pale dome + white rim + one
  curved highlight stroke.
* **Shadows:** small soft ink ellipses, one wide soft shadow under the plaza.
* **Guests:** tall and sleek (small heads, long thin legs, white go-go boots), A-line tunics and dresses with white
  round collars, bob / beehive / flip / flat hair, a bubble helmet, a saucer balloon.
* **Canvas 2D mapping:** chrome = a cached `CanvasGradient` per object width, drawn in local space (the bands must
  move with the object, not the screen); domes = one translucent `fill()` + two `stroke()`s; everything else flat
  `fill()`. Terrazzo speckle belongs in a pre-rendered ground pattern.
* **Phone cost: low to medium.** No filters except a few soft shadows; flat fills plus one gradient per chrome part.
  Pre-draw: the terrazzo ground and shadows (baked chunk), lamp glows. Rides can be drawn live, but caching per
  rotation is cheap and worth it. Guests are thin: very readable at 1x on the phone crop, but at the smallest zoom
  their limbs (1.6 to 2 px) will shimmer; a min line width of 1.5 device px is needed.

## Which reads best at phone size (round 4)

* **O** reads best: flat shapes with crisp silhouettes, chrome only where it helps, riders clearly seated in domes
  and canopies, and the cheapest of the four to draw. Its guests are the most fashionable but the thinnest.
* **M** is the warmest and its fat plush shapes and big-headed dolls read very well, but it is only practical as
  pre-baked sprites (the puff and fibre filters).
* **N** has the most striking mood and its lead lines separate everything, but the mosaic ground is busy and the
  whole ground has to be baked.
* **L** is the dreamiest; rides and guests read, but floating islands change the game's terrain model and the
  pastel-on-pastel palette gives the least contrast between path, grass and guests.

---

# Round 5: P, Q, R, S — four more different looks

Same rules as rounds 3 and 4: each sheet has its **own scene layout, shape language, light and content**; only the
game camera is shared (isometric 2:1, `screen = (ox + (x - y) * 52 * s, oy + (x + y) * 26 * s - z * s)`, four 90 degree
turns). Every sheet has a coaster, a flat ride, a stall, paths, walking guests, a 2x guest line-up and a style note.
Riders sit **in** every car, seat, gondola and boat (well, then seated riders, then the near walls over their laps,
using `carGeom` / `cupGeom` copied from round 4). New rule this round: **every guest arm and leg is at least 2.6 screen
px wide** at the size it is drawn (`LIMB(k)` in the generator), so limbs do not shimmer when the camera moves.

| File | Style |
| --- | --- |
| `p-sketch.svg` | P: Sketchbook |
| `q-comic.svg` | Q: Comic pop |
| `r-lowpoly.svg` | R: Low-poly crystal |
| `s-origami.svg` | S: Origami |
| `tools/generate-r5.mjs` | Builds P to S (`node tools/generate-r5.mjs`, or `node tools/generate-r5.mjs p r`). Helpers copied from `generate-r4.mjs`; A to O are untouched |
| `tools/render-r5.cjs` | Renders `concept-curved-{p,q,r,s}.png` (1600 x 1000), `-phone.png` (390 x 520 CSS px at DPR 2, framed on a ride, a path and guests) and `concept-curved-compare-5.png` (same layout as compare-4) |
| `tools/shrink-r3.py` | Reused: `python3 tools/shrink-r3.py p q r s compare-5` cut P's sheet, P's phone crop and compare-5 to 256 colours (the marker streaks pushed them over 1 MB) |

## P: Sketchbook

* **Look:** a page from a designer's sketchbook (spiral binding, dot grid, faint coffee ring, masking tape on the
  panels). The park is a loose oval vignette of marker on paper, not a board: a **wave swinger** (scalloped
  red/white canopy, chair-tubs swung out on chains, riders seated), a **wooden out-and-back coaster** with lattice
  bents drawn like a structure study, a **lemonade cart** with a striped umbrella, scribbled round trees and
  zig-zag pines, a pond, a bench, lamps. Hand-lettered notes with arrows ("WAVE SWINGER", "LIFT HILL", "QUEUE",
  "POND?", a ringed "CARS: BLUE/YELLOW/TEAL?"), a dimension line and colour-test marker dabs.
* **Fills:** alcohol-marker washes at about 60% with `multiply`. Each wash is the shape shrunk ~7% and pushed
  off-register, so it spills out one side and leaves paper on the other. Shade = a second marker pass on the same
  face. Big areas (grass, paths, water) are parallel marker strokes clipped to a jittered outline; each stroke is its
  own path so overlaps darken, like a real marker.
* **Outline:** 1.5 px pen. Every straight edge is its own stroke that **overshoots** both corners by 1 to 4 px and
  bows slightly; curves are drawn twice (a confident pass and a faint second pass).
* **Light / shadows:** no light model; cast shadows are **pen hatching** inside an ellipse.
* **Construction:** blue pencil iso grid lines, a horizon line, a vertical axis and ellipse guides around the swinger.
* **Labels:** a single-stroke letter set (`GLYPH`, a 4 x 6 grid per letter) drawn as pen strokes; no font.
* **Guests:** pen figures with a paper-white underlay (so they read over any wash), an off-register marker shirt,
  thick pen arms and legs, open-loop heads, scribbled hair.
* **Canvas 2D mapping:** strokes are cheap; the overshoot needs per-edge random lengths, so generate them **once**
  and store them with the sprite (re-randomising per frame makes the lines boil). Washes need
  `globalCompositeOperation = 'multiply'` and per-wash clipping (`clip()` per shape) — the clipped streak fills are the
  expensive part.
* **Phone cost: medium if baked, high live.** Several hundred stroke paths and ~40 clip regions on this sheet, plus
  multiply blending. **Must be pre-drawn:** the ground vignette, path washes and construction lines (one baked layer
  per rotation), every ride and tree as sprites. Guests can be live (about 15 strokes each). A sketch also needs the
  same jitter in all four rotations to look like one drawing. Readability at phone size is fair: ink keeps edges,
  but washes over washes get muddy and the hatching turns grey below ~1x.

## Q: Comic pop

* **Look:** one big comic panel with a heavy black border and white page gutters; the title is a yellow caption box,
  the line-up and note are inset panels with yellow headers. The ground runs out past the panel border (cropped
  like a comic frame) under a flat cyan sky with inked clouds and an inked hedge line. A **steel coaster with a
  vertical loop** (red tube rails, blue columns, a train banking into a turn with action lines and "WHOOSH!"),
  **bumper cars** (fenced rink, sparking poles, motion arcs, a "BONK!" burst), a **hot dog stand** with a giant hot
  dog on the roof ("HOT!"), lollipop trees, a bench, lamps. A **speech bubble** ("BEST DAY EVER!!") over one guest.
* **Fills:** flat bold primaries (red, yellow, blue, cyan, green); top faces 35% lighter; no gradients.
* **Outline:** black on everything: 3 to 4 px on shapes, 7.5 px under each rail, 1.3 to 2.5 px on guests.
* **Shadows:** **Ben-Day dots only**: a navy dot pattern (7 px, rotated 30 degrees) on shaded faces and as cast
  shadows. No darker tints anywhere. White glints on cars and balloons.
* **Not F (retro poster):** F is muted cream/teal/mustard print with halftone on everything, sun rays and
  off-register ink. Q is pure saturated primaries, black brush ink, dots only in shadow, panel borders, sound
  effects and a speech bubble.
* **Guests:** chunky, big heads, big white eyes, open smiles, inked limbs (black under-stroke + colour stroke),
  spiky hair, ponytails, caps with a white shine.
* **Canvas 2D mapping:** every shape = `fill()` + `stroke()`; Ben-Day = a cached `CanvasPattern` from a small dot
  tile (`createPattern`), filled over the shaded face (`fill()` the same path again). Action lines and sound effects
  are UI-like overlays drawn last. Text in bubbles uses the system font.
* **Phone cost: low.** Flat fills, one pattern, no blur, no blending. Pre-draw only to save time (rides per rotation);
  guests and cars can be live. Thick ink costs fill-rate on big shapes, nothing more. **Reads very well at phone
  size**: the black line separates everything and guests are the biggest and clearest of the round.

## R: Low-poly crystal

* **Look:** a floating chunk of faceted terrain with a faceted river that falls off the front cliff as a waterfall,
  gem hills, low-poly pines and gem trees, faceted rocks, pale faceted mountains and polygon clouds, a pale
  heptagon sun. A **polygon Ferris wheel** (12-sided rims, spokes, hex gondolas with crystal canopies, two riders
  each), an **angular coaster** (straight track facets, white square posts, faceted cars with a nose wedge), a
  **crystal ice-cream kiosk** (hex body, gem roof, a cone sign with a gem scoop), a plank bridge.
* **Fills:** **one flat colour per triangle**, computed from its normal against a cool light from the upper left
  (`tone()`): the dark side drifts toward slate blue, the lit side toward white. No gradients, no outlines; each
  facet is stroked in its own colour to hide anti-aliasing seams.
* **Terrain:** a 0.5-tile triangle grid with 5 px of z jitter on grass (1 px on paths), paths and the river
  carved by masks; cliffs are three jittered rows of triangles (soil, rock, deep rock), water facets get extra
  normal jitter to sparkle.
* **Shadows:** crisp flat footprint shadows pushed away from the light, 20% slate.
* **Guests:** two-facet bodies (lit half / dark half plus a light shoulder facet), hexagon heads in three facets,
  angular hair and caps, square limbs, a kite-diamond balloon.
* **Canvas 2D mapping:** solids are lists of 3D faces; at load, project them per rotation, cull back faces, take the
  tone, and draw `fill()` per facet. That is cheap to compute **once** but there are many paths: the terrain alone is
  ~1,000 triangles on this sheet (792 ground, ~240 cliff).
* **Phone cost: low to medium.** Flat fills only, no blur, but many small paths. **Must be pre-drawn:** the terrain
  (baked chunks; it only changes when terraforming or paths change). Rides, trees and guests can be live or cached
  per rotation; the shading is a function of the face normal, so all four rotations come out right automatically
  (a real plus over hand-painted styles). Readability is good, but the jittered grass competes slightly with
  guests; paths read by colour.

## S: Origami

* **Look:** the park on a sheet of pre-creased green paper (the ghost of a fold pattern, large triangles each tilted
  a hair), in front of a six-panel **folding screen** with painted hills and a vermilion sun; paper cranes fly in the
  sky and stand on a **pleated pond**. A **carousel** with a folded-star deck and a **pleated roof** (28 alternating
  mountain/valley triangles, red and cream, zig-zag hem), riders seated on **paper cranes**; a **paper-strip coaster**
  on accordion-folded legs with **paper-boat cars** (riders inside, the centre sail folded up); a **tea stall** shaped
  like a folded house (creased roof, pennant flaps, a folded fan on the ridge); folded pines and "balloon" trees;
  diamond lanterns. Paths are cream strips with a lengthwise crease and folded-over ends.
* **Fills:** each plane takes one tone from its angle to the light plus a soft linear ramp across it (lighter at
  the crease side). Paper colours: vermilion, indigo, mustard, sakura pink, sage, sky, cream.
* **Outline:** none. **Creases** instead: a mountain fold is a pale line, a valley fold a dark line; paper edges get a
  thin white line.
* **Shadows:** soft blurred shadows under objects and strips (the paper lifts off the sheet).
* **Not E (cut paper):** E stacks flat cut layers with crisp drop shadows. S has no stacked layers: every object is
  a few **folded planes**, shaded by their angle, with visible crease lines and pleats.
* **Guests:** a cone body folded down the middle (lit half / shaded half), a folded collar, a diamond head folded on
  its diagonal, flap / bob / paper-hat hair, paper-strip limbs, a folded fan or kite.
* **Canvas 2D mapping:** planes = `fill()` with a cached `CanvasGradient` per tone (set in local space with
  `setTransform`), creases = one `stroke()` each. Soft shadows = pre-blurred sprites.
* **Phone cost: medium.** No filters except shadows, but a gradient per plane. **Must be pre-drawn:** the ground
  sheet, the folding screen and all shadows; the carousel roof (28 gradient planes) and coaster strip per rotation.
  Guests are live-cheap (about 10 flat triangles). Readability is good for rides (strong shapes and pleats) but
  guests are small and slim, and the pale cream paths are close to the cream screen.

## Which reads best at phone size (round 5)

* **Q** reads best: thick black ink separates guests, cars and paths at any zoom, the flat primaries survive
  small sizes, riders in the bumper cars and coaster are obvious, and it is the cheapest of the four to draw.
  Its risk is noise: sound effects and action lines must be rationed or the screen gets loud.
* **R** is the cleanest and handles rotation for free (shading from normals), but the jittered terrain is busy
  behind small guests.
* **S** is the most charming and the rides read well; guests are the weakest of the four at 1x.
* **P** has the most personality, but marker over marker gets muddy at phone size and it is the hardest to
  keep consistent across four rotations and many sprites.
