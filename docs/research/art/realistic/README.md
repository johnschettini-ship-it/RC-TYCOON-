# Realistic art concepts: T to W (round 6), X to AA (round 7)

After 19 stylised looks (A to S, see `../curved/README.md`) the brief changed to "back to more real-life concepts":
real-world materials, proportions and light. SVG cannot do that, so this round builds the park as a **3D scene in
three.js** and renders it through an **orthographic camera at the game's 2:1 angle**. That is also how a realistic
isometric game ships: models rendered ahead of time into sprites, one set per rotation and zoom (see the last
section for what that costs).

All four sheets are **one scene with four treatments**, so they compare one-to-one. Everything is original and made
in code: geometry, materials and every texture are generated on a canvas at render time. No downloaded models,
textures, HDRIs or fonts (sign and menu lettering use the system sans-serif, like earlier rounds). The coaster name
on the station ("Comet Run") and the kiosk menu are made up.

| File | What |
| --- | --- |
| `tools/kit.js` | Round 7 shared kit: lazy textures + materials, lamps, benches, bins, planters, broadleaf trees, pines (snowy or not), shrubs, rocks, carousel + horse, guests and crowds, paving grid with kerbs, ground slab |
| `tools/rides.js` | Round 7 rides: track frames with banking, profile sweeps, instanced beams, timber trestles, wooden track, sit-down / inverted / log / sled cars with riders, Ferris wheel, slide tower, drop tower, monorail, stalls, huts, city buildings, gulls |
| `tools/scene-pier.js`, `scene-forest.js`, `scene-city.js`, `scene-winter.js` | Round 7 settings X, Y, Z, AA (18 x 18 tile plots) |
| `tools/scenes.js` | Scene registry + the guest line-up (G) |
| `tools/park.js` | The round 6 scene in metres: island, paving + kerbs, pond + fountain, kiosk, coaster, queue, guests (furniture, trees, carousel now from `kit.js`) |
| `tools/people.js` | Guests: jointed low-poly humans with real proportions and poses (walk, stand, wave, sit, ride, horse) |
| `tools/textures.js` | Procedural canvas textures: grass + clover, clay pavers, concrete slabs, asphalt, wood, paint, stone, soil, bark, water normal map, leaf cards, striped canvas, signs |
| `tools/post.js` | Hand-written post chain: depth AO, bloom, ACES + grade, tilt-shift (no three.js add-ons needed) |
| `tools/main.js` | Variants T/U/V/W/X/Y/Z/AA/G (sun, sky, exposure, grade, scene), camera, 2x supersampling, label |
| `tools/render.cjs` | Playwright driver, writes `docs/screenshots/concept-real-*.png` |
| `tools/shrink.py` | Cuts the PNGs to a 256-colour palette (Pillow) so each stays under 1 MB |
| `tools/vendor/three-0.160.0.module.min.js` | three.js r160, vendored single file (MIT, `three-LICENSE.txt`). Not added to `package.json` |

Run (from the repo root, Playwright is already a dev dependency; no `playwright install` needed):

```
node docs/research/art/realistic/tools/render.cjs              # everything: 8 sheets + phones, both compares, T turns, guests
node docs/research/art/realistic/tools/render.cjs x aa compare2   # some variants (space-separated tokens)
node docs/research/art/realistic/tools/render.cjs turns guests # only the rotation sheet / the guest line-up
BIG=20 OUT=/tmp/x.png node docs/research/art/realistic/tools/render.cjs dbg x 0 5 0 0.4    # also lists meshes longer than 20 m (finds stray beams)
OUT=/tmp/x.png node docs/research/art/realistic/tools/render.cjs dbg t 10.5 2 -9 3   # close-up: variant x y z zoom
python3 docs/research/art/realistic/tools/shrink.py
```

Outputs: `docs/screenshots/concept-real-{t,u,v,w}.png` (1600 x 1000, whole island),
`concept-real-{t,u,v,w}-phone.png` (390 x 520 CSS px at DPR 2, carousel + avenue + guests, game zoom 1.4),
`concept-real-compare.png` (same layout as `concept-curved-compare-5.png`) and `concept-real-t-turns.png`
(T from all four 90 degree turns).

## Round 7: fixes to the shared parts, four new settings (X to AA)

The owner liked the real-life direction and said "keep going". Round 7 moves everything reusable into
`tools/kit.js` and `tools/rides.js`, so T/U/V/W and the new settings share one set of people, trees, carousel and
furniture. **T, U, V, W, the T turns sheet and `concept-real-compare.png` were re-rendered** because the fixes change them.

### What was fixed (shared, so it shows in every sheet)

* **Guests** (`people.js`, see `concept-real-guests.png`): a shaped torso (lathe profile with hips, waist, chest and
  shoulders) instead of a capsule; thicker tapered limbs; a face on every head (eyes with a glint, brows in the hair
  colour, nose, mouth, ears, jaw); ten hair styles (short, crop, side parting, curly, afro, long, bun, ponytail, bob,
  pigtails) and bald; hats (cap, sun hat, bucket hat, beanie with pompom) that sit above the brows so the face shows,
  with big hair tucked under them; 12 skin tones; dresses, skirts, shorts, trousers, sleeveless / short / long sleeves,
  winter coats with a zip, scarves and gloves (`season: 'winter'`); backpacks and shoulder bags; children with a bigger
  head and shorter legs (about 22 % of guests), older adults with grey hair and a slight stoop. New poses: eat (ice
  cream, drink, candy floss), point, skate, slide (on a mat or toboggan), dangle (open seats), and the horse rider now
  sits astride with bent knees.
* **Carousel horses** (`kit.horse`): a carved jumper with barrel, chest and rump volumes, an arched neck, a wedge head
  angled nose-down with muzzle, nostrils, eyes and ears, bridle bands, a carved mane (gilded on some light horses),
  forelock, a flowing tail, legs in a gallop pose (front legs curled, hind legs pushing off) with knees and hooves,
  and a saddle with blanket, pommel, cantle and stirrups on the brass pole.
* **Tree crowns** (`kit.tree`): the solid core is now small and mid-green, and 64 leaf cards per cluster fill the whole
  volume at many depths; every card gets its own tint (yellow-green to blue-green) and is lighter towards the outside
  and the top. The dark balls are gone. New: conifers (`kit.pine`, drooping needle-branch cards round a dark core,
  optional snow cards on every branch) and shrubs with flowers.
* **Carousel roof**: one 96-segment cone with the stripes in its texture, so stripe edges are straight and smooth
  (round 6 used a faceted second cone). Ribs line up with the stripe joins.
* Also fixed on the way: `Beams` (instanced timber/steel) built a left-handed basis, which turned long rails into
  lines across the sky; the ground slab's top face hid anything below y = 0 (lakes); a debug option lists any mesh
  over a size limit so stray geometry is found quickly.

### The four new settings (18 x 18 tiles = 54 m, 1 tile = 3 m, daylight)

| | Rides | Setting and details |
| --- | --- | --- |
| **X Seaside pier** | wooden out-and-back coaster on timber trestles (two trains of four cars, lift with chain and catwalk), 16 m Ferris wheel (16 tubs, 2 to 3 riders each, bulbs on the spokes), striped slide tower with a spiral mat slide (riders on mats) | timber deck in two plank tones on cast-iron piles with braces and foam rings, white railings, sea with swell and ripples, sand beach with towels, parasols, a sandcastle and breaking foam, sea wall promenade with flags, four food stalls, a moored launch, buoys, gulls flying and perched |
| **Y Lakeside forest** | log flume: lift up a wooded hill, run along the crest, big drop down the hillside into a splash pool with a spray fan, return along the shore; six log boats with riders | log-built lodge station with a shingle roof, three wooden footbridges (over the flume, by the splash pool, over a brook), lake with reeds, rocks, a jetty and a canoe, pine forest behind the rides, picnic glade, lakeside lawn with blankets and a kite, paths edged with timber kerbs |
| **Z City plaza** | inverted steel coaster (cars hang below the track, legs dangling, shoulder bars, cantilever supports), 30 m drop tower (12 seats), monorail on pylons over the street | seven original brick and render buildings with shopfronts at the two back edges, street with markings and crossings, glass-and-steel station, ground jets with children playing, round basin fountain, raised planters with trees and benches, café tables, coffee and pretzel stalls |
| **AA Winter festival** | covered bobsled coaster (half-pipe trough, high banking, lift, two timber snow sheds over the descent, six sleds), carousel strung with lights (bulbs on every rib, snow on the canopy) | snow ground with drifts and footprints, snowy pines, frozen pond with ten skaters and a skate hire hut, market street of eight timber huts with warm hatches and garlands, string lights over the street, decorated festival tree, snowman, sledging knoll with toboggans, cleared paths with granite kerbs and snow banks, low warm sun (21 degrees) with long shadows |

Each setting has roughly 60 to 80 guests on the ground plus seated riders in every ride car, gondola, boat and sled, paths
with kerbs (stone, timber or granite), benches, lamps and bins. Names on signs (Shorebird, Timber Run, Skyline,
Ice Runner, the stall names) are made up. Nothing imitates another game's look, names or art; all textures are drawn
in code (new: sand, sea, ice, snow, pine needles, snow on branches, shingles, log walls, brick and render facades,
curtain-wall glass).

Outputs: `docs/screenshots/concept-real-{x,y,z,aa}.png` (1600 x 1000), `concept-real-{x,y,z,aa}-phone.png`
(390 x 520 CSS px at DPR 2, game zoom 1.4: X slide tower + stalls, Y splash pool + bridge + lake, Z coaster over the
fountain jets, AA carousel + market street), `concept-real-compare-2.png` (same layout as `concept-real-compare.png`)
and `concept-real-guests.png` (12 guests in two rows plus a carousel horse with its rider, game zoom 8.4).

**Which reads best at phone size:** AA Winter festival. The white ground makes every guest, hut and light stand out,
the carousel stripes and the market read at a glance, and the low sun gives strong modelling. X is a close second
(the slide tower and stalls are bold shapes); Y and Z are busier: trees and coaster supports cover part of the action.

### Render times (headless Chromium, SwiftShader on 4 CPU cores, 2x supersampling)

| | Sheet 1600 x 1000 | Phone 780 x 1040 | Scene build |
| --- | --- | --- | --- |
| T (round 6 scene, round 7 kit) | 24 s (was about 20 s) | 10 s | 5 s |
| X Seaside pier | 13 s | 10 s | 3 s |
| Y Lakeside forest | 20 s | 9 s | 2 s |
| Z City plaza | 21 s | 8 s | 5 s |
| AA Winter festival | 18 s | 9 s | 3 s |
| Guest line-up | 8 s | - | 0.2 s |

The whole set (8 sheets, 8 phones, turns, two compares, line-up) takes about 6 minutes. On a real GPU each frame is
well under 100 ms. The bigger plots cost little extra because trees, ties, beams, bulbs and kerbs are instanced.

### Do the memory estimates change for bigger rides?

Yes, for the tall and wide ones; the per-ride numbers above were for a carousel and a mid-size coaster.

| Item | Pixels at zoom 1 | Frames | RGBA, 3 zooms | Compressed |
| --- | --- | --- | --- | --- |
| Ferris wheel: frame + legs (2 views: it is mirror-symmetric) | 400 x 460 | 2 | 7.7 MB | 1.9 MB |
| Ferris wheel: rotating ring (16 tubs repeat every 22.5 degrees, 6 frames per view) | 400 x 400 | 12 | 40 MB | 10 MB |
| Ferris wheel tubs with riders (placed at run time, hang straight down) | 50 x 60 | 8 colours x 2 | 0.5 MB | 0.1 MB |
| Log flume trough kit (30 pieces x 4 rotations, incl. trestle) | 104 x 150 avg | 120 | 39 MB | 10 MB |
| Log boat with riders (16 yaw x 5 pitch: flat, lift, drop) | 70 x 50 | 80 | 6 MB | 1.5 MB |
| Splash animation | 150 x 150 | 8 | 3.8 MB | 0.9 MB |
| Drop tower (round: 1 view) + seat ring | 150 x 720 + 120 x 60 | 1 + 1 | 2.4 MB | 0.6 MB |
| Slide tower (4 views) | 170 x 400 | 4 | 5.7 MB | 1.4 MB |
| One city building (4 rotations, 6 floors) | 400 x 600 | 4 | 20 MB | 5 MB |

So a **Ferris wheel is about 12 MB compressed** for three zooms (most of it the turning ring; 4 frames instead of 6, or
drawing the ring live as a rotated sprite, halves it), and a **log flume about 12 MB**, the same order as a coaster
because the cost is the piece kit, not the boat. Drop and slide towers are cheap. The real surprise is **scenery
buildings**: a street of seven baked facades is 35 MB compressed, more than any ride, so buildings should be a
modular kit (floor, bay and corner pieces that tile) or drawn live in 3D. The park-level estimate (60 to 120 MB
compressed) holds for a modest park; a park with a big wheel, a flume and a city backdrop moves to about 100 to 150 MB
compressed, which strengthens the case for streaming ride packs and keeping only the current zoom resident.

### What did not come out right (round 7)

* Guests are better but still read as jointed figures close up (visible elbow and knee joints, no fingers); hair is
  sphere shapes. At game zoom they read as people with clothes, hats and faces only from zoom 2 up.
* The sea in X uses a colour map with swell bands; from above the light bands read as blotches rather than waves, and
  the foam lines on the beach are too regular. A real water shader with depth colour would fix both.
* In Y the brook is partly hidden by trees and reads only near the lake and the plot edge; trees and coaster supports
  in Y and Z cover some guests and the basin fountain's spray is hard to see.
* The bobsled trough in AA is very bright inside (white fibreglass in sun); the covered sections are simple pitched
  roofs, and the sledging knoll is too low to read.
* The carousel and festival lights hardly read in daylight (they are meant for an evening mode like V).
* The inverted coaster has no inversions and the wooden coaster no tunnel; both are kept simple to stay readable.
* All PNGs are cut to 256 colours by `shrink.py` (faint banding in the sky gradients).

## Scale and camera

* **1 tile = 3 m.** A tile's top is a 104 x 52 px diamond at zoom 1, so the screen scale is
  `104 / (3 * sqrt 2) = 24.5 px per metre`. A 1.75 m adult is about **37 px tall** at zoom 1 (74 device px on a DPR 2
  phone), a child 25 px. With 4 m tiles adults drop to 28 px, which was too small to read pose and clothing.
* 3 m also gives real-world sizes on the grid: a path is one tile (3 m, a normal park footpath), the carousel is
  13 m across (about 4 x 4 tiles), the coaster station 12.6 m (4 tiles), the lift hill 10.6 m high, the kiosk
  3 x 3.6 m, lamps 4.6 m, benches 1.7 m, trees 7 to 11 m.
* **Camera:** orthographic, yaw 45 degrees, **pitch 30 degrees** below the horizon. That is the "2:1" setup: tile
  edges then run at atan(0.5) = 26.565 degrees on screen, a vertical metre is `24.5 * cos 30 = 21.2 px`. The island is
  14 x 14 tiles (42 m) on a 1.6 m soil slab.
* **Rotation:** the world group turns by 90 degree steps under a fixed camera and a fixed sun, which is exactly what a
  sprite bake would do (shadows always fall to screen right). `concept-real-t-turns.png` shows all four.

## Lighting and render settings

| | T Daylight real | U Miniature photo | V Evening lights | W Clean architectural |
| --- | --- | --- | --- | --- |
| Sun | 3.4, 52 deg up, white-warm | 3.6, 48 deg | 0.55, 9 deg, orange (long shadows) | 1.15, 62 deg, near white |
| Shadows | PCF soft, 4096 map | PCF soft, 4096 | VSM, radius 10 | VSM, radius 18 (very soft) |
| Sky (env + hemisphere) | blue sky, bright horizon, sun disc | same | deep blue to dusky rose | flat light grey (overcast) |
| Night lights | - | - | 25 point lights (lamps, carousel, station, kiosk, fountain) + emissive bulbs, LED line on the coaster spine, lit windows | - |
| AO (strength / radius) | 0.75 / 0.9 m | 0.8 / 0.9 m | 0.65 / 0.9 m | 1.0 / 1.3 m, intensity 1.55 |
| Bloom | barely | slight | strong (threshold 0.9) | off |
| Grade | sat 1.05, contrast 1.04 | sat 1.32, contrast 1.12, warm gain, vignette | slight blue lift, vignette | sat 0.78, lifted blacks |
| Lens | - | tilt-shift: sharp band across the plaza, disc blur to 22 px | - | - |

Common to all: physically based materials (`MeshStandardMaterial`, `MeshPhysicalMaterial` with clearcoat for car
paint, horses and the balloon, sheen for clothes, metalness 1 for brass and stainless), a procedural sky dome turned
into a PMREM environment (reflections and image-based fill light), a hemisphere light, one shadow-casting sun, ACES
filmic tone mapping and sRGB output in the final pass. **2x supersampling**: every frame renders at twice the output
size and is averaged down, which removes the stair-steps on rails and railings.

AO is screen-space from the depth buffer (16 samples, depth-aware blur). With an orthographic camera depth is
linear, so positions come straight from (uv, depth) and normals from neighbouring depths. A real bake would use
ray-traced or baked AO instead; this is the cheap version that is good enough to judge the look.

**Materials (all procedural):** lawn = noise-mixed greens + 52 000 blade strokes + clover patches, a bump map and
large vertex-colour patches against visible tiling; avenue = 30 x 15 cm clay pavers in running bond with sand joints
and bevelled bump; plaza = 60 cm concrete slabs; queue pad = asphalt with aggregate; kerbs and coping = granite-grey
concrete; decks and benches = wood planks with grain; steel = painted (noise roughness, clearcoat); water = normal
map + near-mirror clearcoat reflecting the sky; trees = bark + 700 to 1000 alpha-tested leaf cards per tree around
solid foliage clumps; carousel valance and kiosk awning = woven striped canvas with a scalloped edge.

**Render time** (headless Chromium, WebGL2 on SwiftShader, i.e. the CPU, 4 cores): about **20 s for a 1600 x 1000
sheet** (3200 x 2000 internal, ~5 s of it building the scene and textures) and **13 s for a phone crop** (1560 x 2080
internal). On any real GPU the same frame is well under 100 ms, so a full sprite bake of a ride (4 rotations x 3 zooms
x a few dozen animation frames) is minutes, not hours.

## What each variant is for

* **T Daylight real** is the default game look: true colours, crisp shadows, a light blue-grey void.
* **U Miniature photo** is T through a tilt-shift lens: a sharp band, everything above and below melts, more
  saturation and contrast. It makes the park look like a model railway layout. The blur is a camera effect, so in a
  game it would be a live full-screen pass (cheap), never baked into sprites.
* **V Evening lights** is blue hour with a low orange sun: long soft shadows, warm lamp pools, glowing carousel bulbs,
  a lit kiosk and station, an LED outline on the coaster. In a game this is a time-of-day mode, not a separate art set
  (see below).
* **W Clean architectural** is overcast light, strong AO, lowered saturation and lifted blacks: everything reads
  clearly, nothing is loud. The calmest of the four, closest to an architect's visualisation.

## How a game would use this (honest version)

**What is baked, what is live.** A 3D-rendered isometric game draws pre-rendered sprites, not 3D, on the player's
device:

* **Baked per rotation (4) and zoom (2 or 3):** rides, track pieces, buildings, trees, scenery, guests. The shadow
  each object casts on the ground is baked into a separate soft shadow sprite (drawn first, multiplied), because
  baked into the object it would be wrong on paths and slopes.
* **Drawn live:** terrain and paths as tiled textures (the grass, paver and slab textures above tile at 3 m, so the
  same images work as runtime tiles); water (animated normal map in a small shader); the tilt-shift of U; colour
  grading (one full-screen pass: T, W and the warm/cool shift of V are mostly grades of the same sprites);
  selection outlines, UI.
* **Night (V)** should not double the art. Bake each sprite twice small, not twice big: the normal lit sprite plus an
  **emissive layer** (bulbs, windows, LED lines: mostly empty, compresses to almost nothing). At night the game
  darkens and cools the lit layer with a grade, adds the emissive layer with additive blending, and draws light pools
  as additive radial sprites. Real point lights on sprites need a normal-map bake too (+1 texture per sprite),
  which is only worth it if night is a big feature.
* **Ride animation:** the carousel is a static base and canopy plus an animated horse ring. Ten matching horses
  repeat every 36 degrees, so 8 frames cover a full smooth turn, and a round ride needs no extra rotation views.
  Coaster cars are **one sprite per car orientation** (track yaw in 16 to 32 steps x pitch x bank; about 300 to 500
  small frames per car type), placed along the track at run time, as classic isometric coaster games do. Riders are
  baked into the car frames (arms up and arms down sets).
* **Guests:** 6 to 8 frame walk cycle x 4 screen directions (2 when mirrored) + idle, queue, sit, wave, ride. Bake
  them as **greyscale shaded layers + a colour-mask** (skin, hair, top, bottom), then tint in a small shader, so 40
  outfits cost the same as one. At zoom 1 a guest frame is about 24 x 40 px.

**Memory on a phone (estimate, RGBA8 = 4 bytes/px in GPU memory; ASTC or ETC2 = 1 byte/px).** Zoom 1 is 24.5 px/m,
zoom 2 is 4x the pixels, zoom 0.5 a quarter, so three zooms cost 5.25x zoom 1.

| Item | Pixels at zoom 1 | Frames | RGBA, 3 zooms | Compressed (8 bpp) |
| --- | --- | --- | --- | --- |
| Carousel (base + canopy, 1 view, it is round) | 320 x 350 | 1 | 2.4 MB | 0.6 MB |
| Carousel horse ring | 320 x 200 | 8 | 10.8 MB | 2.7 MB |
| Coaster track pieces (40 types x 4 rotations, avg 104 x 150 px) | 15 600 each | 160 | 52 MB | 13 MB |
| Coaster car with riders (3 types) | 60 x 50 | 3 x 400 | 76 MB | 19 MB |
| Food kiosk (4 rotations) | 130 x 160 | 4 | 1.7 MB | 0.4 MB |
| Tree (6 kinds x 4 rotations) | 200 x 260 | 24 | 26 MB | 6.5 MB |
| Guests (4 body types x ~200 frames, + colour mask) | 24 x 40 | 800 x 2 | 32 MB | 8 MB |
| Small scenery (40 items x 4 rotations, lamps, benches, bins, railings) | ~40 x 80 | 160 | 8 MB | 2 MB |

So **one realistic ride costs about 3 MB (carousel) to 30 MB (a coaster with its cars) compressed across three
zooms**, and a modest park (10 ride types, guests, trees, scenery) lands around **60 to 120 MB compressed, 250 to
450 MB as plain RGBA**. Plain RGBA is too much for a phone browser; WebGL with ASTC/ETC2 textures is required, and
only the current zoom (plus a lower one for zoom-out) should stay resident, which roughly halves that. Download size
is smaller again: lossy WebP/AVIF is about a tenth of RGBA, so a ride is roughly 1 to 8 MB to download, which suggests
streaming ride packs on first use instead of one big download. For comparison, the stylised looks (A to S) can be
drawn live from vector shapes for almost nothing.

**What cannot be baked and stay right:** anything the player builds piece by piece (coaster track, paths, queue
lines) must be a kit of pieces that join on the grid, so the bake has to cover every piece x rotation x zoom, and
custom colours need the mask-tint trick above. Supports of different heights are baked as a repeatable column
segment plus top and footing sprites.

**The alternative** is to skip sprites and run the 3D scene live in WebGL (the game today draws with Canvas 2D in
`src/render/` with a sprite cache; three.js would replace that layer). With low-poly LODs (guest about 300 triangles, no AO, one shadow map, no supersampling)
a modern phone holds 30 to 60 fps for a park of this size, with free rotation, zoom and time of day. It costs far
less download and memory, but battery and older phones suffer, and the look drops a step below these renders.

## What did not come out right

* Guests are low-poly with no faces or hands detail. At zoom 1 they read as people (pose, clothing, skin, hair),
  close up they look like jointed mannequins.
* Tree crowns are leaf cards around solid clumps. From a distance they look real; close up the clumps show as darker
  balls in places.
* The carousel roof stripes are drawn as a second cone with alternate segments, so the stripes have hard faceted
  edges close up, and the horses are simple shapes (no carving).
* The coaster is a short closed circuit squeezed into a 6 x 5 tile corner, so its turns are tighter than a real
  family coaster would be; banking is computed from speed and curvature but the drop is steep for its size.
* The screen-space AO darkens some thin things (railings against grass) a little too much in W.
* Lettering uses the system sans-serif, which varies by OS; the bake should use a bundled, licensed font.
* All ten PNGs were cut to 256 colours (`shrink.py`) to get from 1.4 to 3 MB down to 250 to 700 KB. That shows as faint
  rings in the V background gradient; the full-colour renders do not have them.
* The soil cross-section around the island is a diorama convention, not a real-life one. A game would fade the
  terrain out at the map edge instead.
