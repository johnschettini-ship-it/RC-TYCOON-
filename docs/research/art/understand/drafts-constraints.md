# Map: the draft art and the rules that bind any new art

Area: `drafts-constraints`. Read-only study, 2026-11-11. Nothing in the repository was changed, built, or run.

Path short forms used below:

- `CONCEPTS/` = `/tmp/claude-0/-home-user-RC-TYCOON-/29ee6f8c-df84-5112-ac7e-04cfb7614dae/scratchpad/concepts/` (outside the repository)
- `CANVAS/` = `/tmp/claude-0/-home-user-RC-TYCOON-/29ee6f8c-df84-5112-ac7e-04cfb7614dae/scratchpad/canvas/` (the boards that became the two approved pictures)
- All other paths are relative to `/home/user/RC-TYCOON-/`.
- "art px" = one pixel of the draft's raw image. "world px" = the game's unit at zoom 1 (`src/render/iso.ts:8-10`). "CSS px" and "device px" have their usual meaning.

The most important finding first: **the approved world is one still picture, drawn for one view, one zoom, one frame, by a Python script that edits pixels one by one.** It proves the look. It does not prove that the look survives rotation, zoom, animation, or the game's 141 catalog entries (18 flat rides, 14 stalls, 12 track types, 85 scenery items, 2 show sites, 3 path items, 4 staff types, 3 costumes).

---

## 1. What this area draws

### 1.1 The draft files and their line of descent

| File | Size | What it is | Status |
|---|---|---|---|
| `CONCEPTS/scene.js` | 555 lines, 42.6 KB | Canvas 2D **vector** scene with 8 styles (`clean`, `golden`, `paper`, `toy`, `pixel`, `pixelblue`, `pixelnight`, `print`; `scene.js:13-124`). One function `render(style, W, H, dpr, opts)` (`scene.js:125`). | First round. Not the approved look. |
| `CONCEPTS/render.cjs` | 28 lines | Playwright runner for `scene.js`. Pixel styles default to 400 × 300 at zoom 0.5, DPR 1 (`render.cjs:18-19`). | First round. |
| `CONCEPTS/post.py` | 44 lines | Post-process of the vector renders: median-cut quantise to 48 or 56 colours, or to a fixed 12-colour palette, no dither, then nearest scale × 4 (`post.py:6-16, 40-43`). Also a blur-and-vignette "miniature" look (`post.py:18-38`). | First round. This is "draw small, then quantise". The owner did not approve this version. |
| `CONCEPTS/pixel2.py` | 557 lines, 34.1 KB | "Orange Day v2: a pixel-art concept drawn pixel by pixel (no anti-aliasing, fixed palette)" (`pixel2.py:2`). Fixed 400 × 300 (`pixel2.py:7`). | Second round. Parent of pixel3. |
| `CONCEPTS/pixel3.py` | 786 lines, 54.8 KB | Same engine plus 6 themes and a variable frame size (`pixel3.py:7-9, 27-62`). | **Drew the approved world.** |
| `CONCEPTS/out/` | 32 PNG files | Raw and scaled outputs. | See below. |

Proof of which file is the approved world (checked by pixel comparison, not by name):

- `CANVAS/assets/ui-world-desktop.png` (1280 × 800) is exactly `CONCEPTS/out/desk-raw.png` (640 × 400) scaled × 2 with nearest neighbour. 640 × 400 can only come from pixel3 (`PIX_W`, `PIX_H` at `pixel3.py:7`); pixel2 is fixed at 400 × 300.
- `CANVAS/assets/ui-world-phone-v2.png` (780 × 1688) is exactly `CONCEPTS/out/phone-orange-raw.png` (195 × 422) scaled × 4.
- `docs/screenshots/phase-7-draft-desktop.png` and `docs/screenshots/phase-7-draft-phone.png` are byte-identical to `CANVAS/shots/draft-desktop.png` and `CANVAS/shots/draft-phone.png`. Those are screenshots of `CANVAS/project/DraftDesktop.dc.html` and `DraftPhone.dc.html` at device scale 1 (`CANVAS/shot.cjs:22`).
- The world image sits under the interface as an `<img>` at 1280 × 800 CSS px with `image-rendering: pixelated` (`DraftDesktop.dc.html:18`). The interface on top is HTML and CSS, not pixel art. The "Drop here to build" tile and the drag line are an SVG overlay with dashed strokes (`DraftDesktop.dc.html:20-24`), not part of the pixel world.

`CONCEPTS/out/` content:

| Files | From | Size |
|---|---|---|
| `art-clean.png`, `art-golden.png`, `art-paper.png`, `art-print.png`, `art-toy.png` | `scene.js` vector styles | 1600 × 1200 |
| `art-pixel.png`, `art-pixelblue.png`, `art-pixelnight.png`, `art-pixel-195x422.png`, `art-pixel-big.png` | `scene.js` pixel styles (before `post.py`) | 400 × 300, 195 × 422, 1600 × 1200 |
| `pixel2-raw.png`, `pixel2-big.png` | `pixel2.py` | 400 × 300, 1600 × 1200 |
| `p3-{orange,frost,jungle,spooky,starport,stone}-raw.png` and the same without `-raw` | `pixel3.py`, one per theme | 400 × 300 and 1600 × 1200 |
| `desk-raw.png`, `desk-big.png` | `pixel3.py orange`, 640 × 400 | **the approved desktop world** |
| `desk2-raw.png`, `desk2-big.png` | `pixel3.py orange`, other vertical offset | variant ("high") |
| `desk-stone-raw.png`, `desk-stone-big.png` | `pixel3.py stoneage`, 640 × 400 | variant |
| `phone-orange-raw.png`, `phone-orange-big.png` | `pixel3.py orange`, 195 × 422 | **the approved phone world** |

### 1.2 Objects in the approved draft (`pixel3.py`, theme `orange`)

24 rows, about 30 object kinds (some rows hold several). Sizes are in art px and were computed from the code; "about" means the code has a random part or the size was added up from several shapes.

| Object | Code | Lines | Bytes | How it is built | Size in art px |
|---|---|---|---|---|---|
| Ground: grass, path, plaza, pond | `ground()` `pixel3.py:106-170` | 65 | 4,326 | per-pixel loop over the whole frame | tile 32 × 16 |
| Ground details: tuft, flower, rock | `pixel3.py:746-767` | 22 | – | single pixels with `P()` | 2 to 4 px each |
| Guest (3 adult poses) | `guest()` `286-294`; rows `256-258` | 9 + 3 | 657 | ASCII sprite, colour map per guest | 7 × 12 (cap pose 8 × 12) |
| Child | rows `259` | 1 | – | ASCII sprite | 5 × 7 |
| Balloon | rows `260` | 1 | – | ASCII sprite | 5 × 9 |
| Lamp | `lamp()` `299-307`; rows `261` | 9 + 1 | 467 | ASCII sprite | 5 × 12 |
| Bench | `bench()` `308-310`; rows `262` | 3 + 1 | 183 | ASCII sprite | 12 × 7 |
| Mascot Frost | rows `263`, placed `622-624` | 1 | – | ASCII sprite, 5 colours with ink | 11 × 14 |
| Mascot Spark | rows `264`, placed `625` | 1 | – | ASCII sprite, 5 colours with ink | 13 × 13 |
| Round tree, autumn tree | `tree_round()` `312-327` | 16 | 1,210 | primitives: 3 blobs × 3 tones, highlight and shade specks | about 19–27 × 24–28 |
| Pine | `tree_pine()` `328-338` | 11 | 660 | primitives: 3 tiers, lit left half, dark right half | about 20 × 28 |
| Bush | `bush()` `408-413` | 6 | 319 | 2 ellipses and 3 pixels | 11 × 7 |
| Flower bed | `flowerbed()` `414-422` | 9 | 512 | diamond and 16 random 2-px flowers | 26 × 13 |
| Stall (3 placed: ice cream, drink, burger) | `stall()` `424-442`; icons `270-272` | 19 + 3 | 1,827 | 2 boxes, counter, door, striped awning, ASCII icon on a pole | about 36 × 37 |
| Fountain | `fountain()` `443-453` | 11 | 831 | cylinder, water disc, column, 17 spray pixels | about 29 × 25 |
| Carousel | `carousel()` `454-482`; horse rows `267` | 29 + 1 | 2,236 | 3 cylinders, 8 horse sprites sorted front and back, striped cone roof with 16 segments, valance, flag, bulbs | about 80 × 86 |
| Tower ride | `tower()` `483-501` | 19 | 1,810 | boxes for base and shaft with bracing, ring cylinder, 8 rider heads, cap, flag | about 46 × 137 |
| Big wheel | `wheel()` `502-523`; gondola rows `268` | 22 + 1 | 1,831 | base boxes, A-frame legs, 12 spokes, rim as a 97-point polyline, 10 gondola sprites | about 76 × 120 |
| Coaster | `coaster()` `524-579`; car rows `269` | 56 + 1 | 3,754 | Catmull-Rom spline through 19 fixed points (`525-531`), lattice supports, 3-pixel rail, sleepers, station with striped roof and sign, 3 trains of 3 car sprites | about 160 × 150 |
| Swan boat | `swan()` `580-581`; rows `266` | 2 + 1 | 138 | ASCII sprite | 12 × 8 |
| Lily pad | `lily()` `582-587` | 6 | 303 | 8 to 10 pixels | 4 × 3 |
| Pole and bunting | `pole()` `588-593`, `bunting()` `594-604` | 17 | 953 | striped 2-px pole; sagging line with flags every 5 px | pole 2 × 26 |
| Hot-air balloon | `sky()` `698-710` | 13 | – | masked ellipse with 6 colour bands, basket | about 31 × 49 |
| Birds | `sky()` `711-718` | 8 | – | 6 pixels each | 5 × 4 |

Shared machinery: palette and helpers (`pixel3.py:12-26, 67-89`), shadows (`172-184`), light pools (`185-197`), outline layer (`199-218`), primitives `ibox`, `icyl`, `icone`, `stamp`, `P` (`220-251`), depth list (`253-254`), scene placement (`607-694`), paint order (`745-786`).

Scene counts for the approved desktop picture (640 × 400, `AREA` = 2.13, `pixel3.py:9`): up to 136 trees (`640-648`), up to 55 bushes (`649-652`), 86 guest placements (`686-692`), 13 lamps (`617-618`), 4 benches (`619`), 4 flower beds (`616`), 3 stalls, 4 rides, 1 fountain, 2 swans, 4 lilies.

### 1.3 Objects that exist only in other themes (not approved, but the code is there)

Palm, bare tree, crystal, bulb tree, antenna, dome, fern (`pixel3.py:339-407`); Boo, snowman, pumpkin, ghost, torch, robot, mammoth, dinosaur, bone, campfire, pterosaur sprites (`265, 273-282`); boulder (`671-677`); bats, parrots, UFO (`711-741`); path styles planks, cobble, panels (`144-158`); water styles ice, swamp, lagoon, plasma (`127-137`); snow caps (`204-212`); fog (`771-778`); snowfall (`779-783`).

A draft theme is a whole-world change: it replaces colour ramps (`pixel3.py:64`), tree kinds, ground details, path and water style. In the game a theme is a set of scenery items (`docs/superpowers/specs/2026-11-09-thrills-and-chills-design.md:66-67`); the ground does not change. Draft theme `stoneage` is not a game theme, and the game theme Volcano Ridge has no draft.

### 1.4 What the game has and the draft does not show

Counts come from `src/data/catalog/`.

| Game content | Count | In the draft |
|---|---|---|
| Flat rides (`src/data/catalog/flatRides.ts:20-38`) | 18 | 3 shapes (carousel, wheel, tower). 15 have no draft. |
| Stalls and facilities (`src/data/catalog/stalls.ts`) | 14 | 1 building shape with 3 awning colours and 3 icons. |
| Track ride types (`src/data/catalog/trackRides.ts`) | 12 | 1 fixed coaster. No piece set, no slopes by piece, no banking, no loops, no corkscrews, no chain, no brakes, no water channels, no boats. |
| Scenery items (`src/data/catalog/scenery.ts:46-147`) | 85 | about 6 comparable (round tree, pine, bush, flower bed, fountain; a boulder in one theme only). |
| Show sites (`src/data/catalog/showSites.ts`) | 2 | none. No beams, no fireworks. |
| Path items (`src/data/catalog/people.ts`) | 3 (bench, bin, lamp) | bench and lamp. No bin. |
| Staff types and costumes | 4 + 3 | Frost, Spark, Boo as still sprites. No staff. |
| View rotations | 4 | 1. Every shape is drawn for one view only. |
| Zoom | 0.25 to 2.0, continuous (`src/render/camera.ts:6-7`) | 1 scale. |
| Animation frames | many (section 4) | 0. One still frame. |

Also absent from the draft: park fence and entrance, queue paths, ride entrance and exit gates, terrain height, slopes and cliffs, terrain types (sand, dirt, rock, snow), map edge faces, elevated paths and ramps with supports, litter and mess, umbrellas, placement ghosts with check and cross icons and hatching, selection outlines, Calm, Buzz and Light overlays, temperament rings, land-for-sale tints, the map cursor, rain, and night for the approved theme (night exists only in `spooky` and `starport`, `pixel3.py:45, 60`).

### 1.5 The rules and tests in this area (inventory)

- Spec rules: master spec §1.3, §2.5, §4, §5.4, §6.4, §10; Phase 6 §4.6, §4.7; Phase 7 scope note. Listed in section 5.1.
- `tests/unit/render/`: 23 test files with 200 `it` / `it.each` declarations (the `it.each` ones run once per ride, stall, or item), plus 2 helpers (`fakeCanvas.ts`, `content/recorder.ts`). Listed in section 5.2.
- `tests/bench/render.bench.ts`: 2 benchmarks. `tests/e2e/screenshot.spec.ts`: 1 screenshot script. `tests/e2e/perf.spec.ts`: 2 measurements. `tests/e2e/perf-build3.spec.ts`: 2 always-on tests and 3 measurements. Listed in section 5.3.
- Outside the asked list but binding on art: 13 more unit test files, 3 browser tests that read canvas pixels, and the release script. Listed in section 5.4.

---

## 2. How it draws

### 2.1 The draft pipeline (`pixel3.py`)

1. **Frame.** One RGB image of `W × H` art px, 400 × 300 by default, set by `PIX_W` and `PIX_H` (`pixel3.py:7`, `103`). Origin `OX, OY` (`pixel3.py:8`).
2. **Projection.** `scr(x, y, z) = (round(OX + (x − y) × 16), round(OY + (x + y) × 8 − z))` (`pixel3.py:78`). A tile is a 32 × 16 diamond. Tile edges are perfect 2:1 pixel stairs. Height `z` is given directly in art px. Every coordinate is rounded to a whole pixel here.
3. **Ground pass** (`ground()`, `pixel3.py:106-170`), run at `745`. For every pixel it inverts the projection to tile coordinates (`110-112`), reads the tile kind (`tile_type`, `92-101`) and the 4 neighbours (`114`), and picks one palette colour. Details in 2.4.
4. **Ground details** (`746-767`): about 1,770 random points on the desktop frame; those on grass get a tuft (4 px), a flower (2 to 4 px), or a rock (3 px).
5. **Shadows** (`apply_shadows`, `179-184`), run at `768`. Details in 2.5.
6. **Light pools** (`apply_lights`, `188-197`), run at `769`. Night themes only. Details in 2.6.
7. **Objects**, back to front: every object registered a closure with a depth key (`add(key, fn)`, `253-254`). Keys are `x + y` plus a small bias (for example stall `+1.2`, guest `+0.02`). The list is sorted and run (`770`). The coaster is split by hand into a far part and a near part at `x + y ≥ 16.2` (`537`, `567-579`).
8. **Weather passes**: fog (`771-778`) and snowfall (`779-783`), theme only.
9. **Output**: raw PNG, then `resize(W × 4, H × 4, NEAREST)` (`784-785`). The script prints the number of colours used (`786`).

### 2.2 The pixel grid and "no anti-aliasing"

- All drawing uses Pillow `ImageDraw` (polygon, ellipse, line, arc, chord, point, rectangle) on integer coordinates. Pillow draws these without anti-aliasing. There is no blending anywhere except the two "mix then snap" passes in 2.5 and 2.6.
- Result, measured on `CONCEPTS/out/desk-raw.png`: 52 distinct colours, every pixel is a palette colour, ink is 5.6 % of all pixels, the four grass tones are 62.6 %.

### 2.3 The palette

- 13 named ramps, 59 colour slots, all distinct (`pixel3.py:12-26`). Ramp meaning (comments at `pixel2.py:12-24`): `g` sunlit grass (6), `s` sand and paving (6), `o` orange to red (6), `t` teal (5), `b` blue (4), `v` violet (4), `c` cream to stone (5), `l` leaves (5), `w` wood (4), `k` skin (4), `a` water (4), `p` pink (3), `i` plum to ink (3).
- Slot names are ramp letter plus index from light to dark, for example `g1` … `g6` (`pixel3.py:68-70`). Code never writes a hex colour outside the ramps; it writes `C['o3']`.
- The outline colour is `INK = i3 = #2a1a36`, a dark plum, not black (`pixel3.py:71`).
- `snap(c)` returns the nearest palette colour by squared RGB distance, with a cache (`pixel3.py:73-76`). It is used only after a mix (shadows, lights, fog).
- A theme overrides whole ramps (`pixel3.py:29-61, 64`). The shapes do not change.
- Slots not used in the approved desktop picture: `g6`, `s5`, `s6`, `t5`, `v3`, `v4`, `i1`.

### 2.4 Texture (ground)

- **Grass** (`pixel3.py:115-119`): two octaves of value noise in tile space (`vnoise`, `83-87`, scales 0.42 and 1.9) plus a 4 × 4 Bayer threshold in screen space (`BAYER`, `88`; weight 0.16). The sum picks one of 3 tones: `g1` below 0.30, `g2` below 0.56, else `g3`. This gives large soft patches with dithered borders. There is no per-tile checker.
- **Grass next to water** (`121-124`): a `g4` bank band within 0.2 tile, a `s4` line within 0.09 tile.
- **Path** (`160-167`): each tile is cut into 2 × 2 slabs. Slab colour `s1` (22 %) or `s2` by a hash of the slab; joints `s3` where the slab fraction is below 0.13. **Plaza**: checker of `c1` and `s1` half-tiles with `s2` joints.
- **Path edge to grass** (`168-169`): `s4` within 0.11 tile.
- **Water** (`126, 139-142`): base `a2`; short horizontal dashes `a1` (7.5 %) and `a3` (6 %) from a hash of `(sx // 4, sy)`; far shore edges `a4`, near shore edges `a1`.
- The hash is `h3(a, b, c)` (`79-82`), 32-bit integer mixing. The noise and the dither are pure functions of position, so the ground is the same on every run.

### 2.5 Outline, shading, shadows

- **Outline rule** (`Layer.flush()`, `pixel3.py:202-218`). An object draws into its own transparent layer. On flush, the layer's alpha is grown by 1 px up, down, left, and right (not diagonally; `214-215`). "Grown minus original" is the outline mask (`216`). Ink is pasted there, then the layer on top (`217-218`). So: a 1-px ink line **outside** the silhouette, around the whole layer, and none between parts inside one layer. An object that wants an inner line uses two layers (carousel body and roof: `457`, `472`). Thin lattice work turns the outline off (`Layer(outline=False)`: wheel spokes `511`, coaster supports `538`).
- **ASCII sprites carry their own outline**: the letter `o` maps to ink (for example `256`, `289`). They are stamped straight to the frame, with no layer.
- **Form shading is flat, 2 or 3 tones per form, light from the left.** Box: top, left face light, right face dark, optional 1-px highlight on the top front edges (`ibox`, `220-225`). Cylinder: lit colour, then the dark colour from 60 % of the width to the right (`icyl`, `226-233`, `split=0.2`). Cone: 16 segments sorted back to front, each lit or dark by its screen side, with alternating stripe pairs (`icone`, `234-241`). Trees: 3 stacked tones offset up and left, plus 7 highlight specks and 5 shade specks (`318-325`).
- **Shadows** (`172-184`). Each object adds an ellipse (`sh_ell`) or a sheared box (`sh_box`) to one 1-bit mask, shifted to the screen right. After the ground is painted, every masked pixel becomes `snap(mix(pixel, i2, 0.3))` for the orange theme (`28`, `184`). So a shadow is a darker **palette** colour of whatever is under it. Shadows fall on the ground only: they are applied before any object is drawn (`768` before `770`). Night themes skip shadows (`180`).

### 2.6 Light pools

- `glow(x, y, r, tint)` records a light **only when the theme is night** (`pixel3.py:186-187`). The approved orange picture has no light pool at all.
- In a night theme, each light paints an ellipse on the ground, twice as wide as tall (`193`). Three brightness bands with Bayer-dithered borders (`195-196`); each pixel becomes `snap(mix(pixel, tint, 0.5 / 0.3 / 0.19))` (`197`). Radii in art px: lamp 30, stall 26, fountain 26, carousel 58, tower 36, wheel 54, coaster station 50 (`300, 425, 444, 455, 484, 504, 532`).
- Pools are applied before objects (`769`), so objects are not lit by them. Objects show night with hand-placed lit pixels instead (windows `428`, bulbs `481`, `516`, lamp halo `304-306`).

### 2.7 How sprites are authored

- **ASCII art** (`pixel3.py:256-282`): 27 sprites as lists of strings. `.` or space is transparent; every other letter is a key into a colour map given at stamp time (`stamp()`, `242-249`). The anchor is bottom centre (`243`). The same rows give many looks by changing the map: 12 shirts (`283`), 6 hair colours (`284`), 4 skin tones and 4 trouser colours (`289`).
- **Primitives** for everything larger: `ibox`, `icyl`, `icone`, plus raw Pillow shapes, drawn into a `Layer` and outlined on flush.
- **Single pixels** with `P(x, y, colour)` (`250-251`) for sparkle, bulbs, spray, bunting, sleepers, birds.
- **Randomness**: Python `random.Random(seed)` per object (`287`, `313`, `329`) and four module-level generators for scatter (`638`, `653`, `680`, `746`). Fixed seeds, so every run gives the same picture.

### 2.8 What ports to TypeScript with Canvas 2D, and what does not

| Draft technique | Ports? | Why |
|---|---|---|
| Palette ramps and named slots (`pixel3.py:12-26`) | Yes, as data | The game today has 1,602 hex colour literals (730 distinct) under `src/render/`, written in place. |
| Projection `scr()` (`78`) | Yes, already there | It is `tileToScreen` (`src/render/iso.ts:16-18`) at half scale: 16 and 8 instead of 32 and 16. |
| ASCII sprites and `stamp()` (`242-249`) | Yes | A loop over rows that writes pixels or runs. |
| `h3`, `vnoise`, `BAYER` (`79-88`) | Yes | Needs `Math.imul` and `>>> 0` to match Python's masked big-integer products. |
| Depth by `x + y` plus bias (`253-254`, `770`) | Yes, already there | The game has its own depth keys (`tests/unit/render/depth.test.ts:14-66`). |
| Flat 2-to-3-tone shading with light from the left | Yes | It is a choice of colours per face. Under view rotation the lit side must stay on the screen left, so faces change colour per rotation. |
| Nearest scale × 4 (`785`) | Yes | `imageSmoothingEnabled = false` with `drawImage`, or CSS `image-rendering: pixelated`. Only whole-number scales give even pixels. |
| Pillow shapes without anti-aliasing (polygon, ellipse, line, arc, chord) | **No** | Canvas 2D path fills and strokes are always anti-aliased. There is no switch. Only `fillRect` on whole device pixels is exact. Options: own rasterisers into a pixel grid; or draw, then threshold alpha and snap colours with `getImageData`. |
| Outline by growing the alpha mask (`202-218`) | Partly | Needs either per-pixel work on a grid, or a compositing trick (ink silhouette drawn at 4 offsets under the sprite), which needs hard-edged alpha first. |
| Shadows and light pools as `snap(mix(pixel, tint, t))` (`184`, `197`) | **No, not per frame** | They read and rewrite the picture under them. In the browser that is `getImageData` and `putImageData` on the full canvas every frame. The game has no such call anywhere in `src/` today. Static shadows can be baked when a terrain chunk is built; moving ones cannot. |
| Whole-frame per-pixel ground loop (`106-170`) | Only at chunk build | The game caches the ground in 8 × 8-tile chunk images (`tests/unit/render/anim.test.ts:70-74`). The draft inverts a flat projection; the game has slopes and heights. |
| Python `random.Random` sequences | **No** (not bit-exact) | Mersenne Twister plus Python's `randint`, `choice`, `choices`. Any seeded generator gives the same kind of result, not the same pixels as the draft. |
| Scene authored by constants for one camera | **No** | Nothing takes a rotation, a frame, a rider count, or a footprint as input. |

`scene.js` is already Canvas 2D, but it is the vector style that the pixel look replaced. Its "pixel" styles are the vector scene with a darker outline (`scene.js:67-79`), drawn small and then quantised by `post.py`. It shows the weaker route, not the approved one.

---

## 3. Sizes and scale

### 3.1 The draft

| Quantity | Value | Source |
|---|---|---|
| Tile | 32 × 16 art px | `pixel3.py:78` |
| Height | free, in art px. Rides use heights by eye: carousel top 56, tower 115, wheel hub 58 and radius 47, coaster peak 68 | `pixel3.py:477, 496, 503, 525` |
| Shadow length constant | `TZ = 20` art px of height per tile of shadow, × 0.75 | `pixel3.py:10, 177` |
| Guest | 7 × 12 art px | `pixel3.py:256` |
| Desktop draft | 640 × 400 art px shown at 1280 × 800 CSS px | `DraftDesktop.dc.html:18` |
| Phone draft | 195 × 422 art px shown at 390 × 844 CSS px | `DraftPhone.dc.html:18` |
| **Art pixel on screen** | **2 × 2 CSS px in both approved pictures** | above |
| Zoom, DPR, rotation | not handled. One scale, one view | – |
| Cache | none. One frame per run | – |

### 3.2 How the draft scale maps onto the game

- Game tile at zoom 1: 64 × 32 world px, height step 8 px (`src/render/iso.ts:8-10`; pinned by `tests/unit/render/iso.test.ts:28` and the master spec `docs/superpowers/specs/2026-11-09-thrills-and-chills-design.md:220-221`).
- So **the approved draft equals the game at zoom 1 when 1 art px = 2 world px.** A height step is 4 art px. A tile length of height (4 m, 4 steps) is 16 art px.
- The spec guest is "about 10 × 16 px at 1× zoom" (`…design.md:72`). The code bounds are 16 × 25 world px (`GUEST_BOUNDS`, `src/render/sprites/props.ts:15`). The draft guest is 14 × 24 world px, so it fits the code bounds.
- Game footprints against draft shapes: Carousel 3 × 3 tiles (`src/data/catalog/flatRides.ts:20`), draft roof radius 1.74 tiles (`pixel3.py:476`), slightly over. Big Wheel 3 × 3 (`flatRides.ts:21`), draft rim radius 2.35 tiles, base 3.2 × 1.4 (`pixel3.py:503, 507`), clearly over. Drop Tower 2 × 2 (`flatRides.ts:32`), draft base 1.4 × 1.4, fits. Stall 1 × 1, draft roof 1.12 tiles (`pixel3.py:432`), about 72 world px wide; a test accepts a drawn stall width of 50 to 90 px at zoom 1 (`tests/unit/render/renderer-rotation.test.ts:104-105`).

### 3.3 What the game does with scale today (facts that decide whether pixels stay square)

| Fact | Where |
|---|---|
| Zoom is any real number from 0.25 to 2.0. Default 1. | `src/render/camera.ts:6-7, 33, 53-57`; `src/game.ts:17` |
| The wheel multiplies zoom by 1.15 per notch; a pinch multiplies by the finger ratio. | `src/input/camera.ts:13, 87`; `src/input/controller.ts:127, 280` |
| Draw scale = `zoom × pixel ratio`, continuous. | `src/render/renderer.ts:1059` |
| Sprites are built at one of 3 bucket scales (0.5, 1, 2 image px per world px) and stretched to the draw scale by `drawImage`. | `src/render/camera.ts:9, 69-73`; `src/render/renderer.ts:338-345, 1060` |
| Image smoothing is switched **on** every frame. | `src/render/renderer.ts:1071`, also `1018` |
| Each sprite corner is rounded to a device pixel on its own. | `src/render/renderer.ts:340-343` |
| Art functions receive a context that already carries the scale transform. | `src/render/canvas.ts:62` |
| Sprite canvas size = `ceil(bounds × scale) + 4`. | `src/render/canvas.ts:50, 57-58` |
| On a desktop, when zoom rests between buckets, terrain chunks are redrawn at the exact scale. | `src/render/terrain.ts:588-589`; `src/render/renderer.ts:906`; test `tests/unit/render/terrain.test.ts:125-164` |
| Pixel ratio: device ratio on desktop; capped at 2 on screens with a side below 600 CSS px; 1 at low quality; `auto` may step down to 1 when frames are slow. | `src/render/canvas.ts:32-49`; `src/perf/quality.ts:64-75`; tests `tests/unit/render/renderer-rotation.test.ts:164-190`, `tests/unit/render/staticLayer.test.ts:229-265` |
| Guests become 2 × 3 px rectangles at zoom ≤ 0.5 (≤ 0.75 at low quality). | `src/render/renderer.ts:74-75, 1067, 1112`; `src/data/tuning/perf.ts:12`; `src/perf/quality.ts:22` |

Device px per art px, if 1 art px = 2 world px: `2 × zoom × ratio`.

| Zoom | Ratio 1 | Ratio 2 | Ratio 1.5 |
|---|---|---|---|
| 0.25 | 0.5 (smaller than a pixel) | 1 | 0.75 |
| 0.5 | 1 | 2 | 1.5 |
| 1 | 2 | 4 | 3 |
| 1.15 (one wheel notch) | 2.3 | 4.6 | 3.45 |
| 2 | 4 | 8 | 6 |

The three bucket scales 0.5, 1, 2 give 1, 2, 4 image px per art px, all whole numbers. The in-between zooms do not.

### 3.4 What is cached (game side, as far as the rules of this area reach)

- Sprites by `(defId, rotation, frame, bucket)`; the key layout is fixed (`src/render/spriteCache.ts:44-50`; `tests/unit/render/spriteCache.test.ts:29-57`).
- One shared byte budget for all caches, counted as `width × height × 4`: 64 MB phone, 192 MB desktop (`src/data/tuning/perf.ts:4`; `tests/unit/render/spriteCache.test.ts:112-190`; Phase 6 §4.6, `docs/superpowers/specs/thrills-and-chills/phase-6-polish.md:161`).
- Terrain chunk images per `(chunk, rotation, bucket)`; cap 64 MB, 32 MB on phone-sized screens (`src/render/terrain.ts:429-434`).
- One canvas-sized static layer for a still view (`src/render/renderer.ts:1000-1025`; `tests/unit/render/staticLayer.test.ts:57-90`).
- A sprite stored at art resolution is 1/16 of the bytes of the same sprite at bucket 2. The `Sprite` record already carries its own `scale` (`src/render/spriteCache.ts:13-21`) and `blit` already divides by it (`src/render/renderer.ts:339`).

---

## 4. Animation

**The draft has none.** One frame. Guests have 3 still poses and no facing. The carousel, wheel, and trains do not move. Coaster cars are one upright sprite stamped on the track at any slope (`pixel3.py:561-566`). The balloon and birds are placed once.

What the game animates today, and how the tests in this area pin it (any new art must supply all of these):

| Thing | Frames or steps | Motion comes from | Pinned by |
|---|---|---|---|
| Flat ride turn | 32 angles (`ANGLE_FRAMES`, `src/render/anim.ts:9`); 16 on phones and at low quality | `ride.cycle.phase` and `ticks`, trapezoid speed profile, whole revolutions (`src/render/anim.ts:10-34, 42`) | `tests/unit/render/anim.test.ts:9-36, 110-128` |
| Flat ride swing | 5 levels | same | `anim.test.ts:32-36, 38-48` |
| Flat ride riders | 5 occupancy levels (3 when coarse) | rider count | `anim.test.ts:50-57`; rides must look different with riders (`tests/unit/render/content/art.test.ts:101-108`) |
| Ride frame code | angle, swing, occupancy in one number below 2048 | – | `anim.test.ts:38-48` |
| A running ride | more than 8 different frames per cycle; a waiting ride shows angle 0 | – | `content/art.test.ts:90-99`; `content/phase6Art.test.ts:98-105` |
| Guest | 4 facings × 3 walk frames × 4 looks × 12 shirts, tinted or not, balloon, umbrella | position interpolated between ticks (`tests/unit/render/scene.test.ts:157-191`) | `tests/unit/render/spriteCache.test.ts:6-17`; `tests/unit/render/guestItems.test.ts:23-36`; frame layout `src/render/sprites/bank.ts:50-52` |
| Coaster and other cars | 16 yaw steps, 24 pitch steps, 16 roll steps | pose along the track, interpolated | `tests/unit/render/track/project.test.ts:137, 148-159`; `tests/unit/render/track/phase6Render.test.ts:175` |
| Water ripples, spray | by tick | – | `tests/unit/track/waterRender.test.ts:130, 172` |
| Shows | beams and fireworks; still glow with reduced motion | show timeline | `tests/unit/shows/render.test.ts:118-158` |
| Reduced motion | turns off guest bobbing, beam sweeps, bursts | setting | Phase 6 §4.7, `…/phase-6-polish.md:167` |

Rule: rendering never changes the simulation (`tests/unit/render/renderer-rotation.test.ts:148-161`; `tests/unit/render/staticLayer.test.ts:188-200`).

---

## 5. What a pixel-art version must keep

### 5.1 Written rules

| # | Rule | Where |
|---|---|---|
| R1 | The game is original. No art from any existing game. | `docs/superpowers/specs/2026-11-09-thrills-and-chills-design.md:37-38` |
| R2 | **All graphics are drawn in code.** | `…design.md:39` |
| R3 | No third-party assets or data files of any kind. | `…design.md:294` |
| R4 | The release script fails on any tracked raster image outside `public/icons/icon-<n>.png` and `docs/screenshots/<name>.png`. A sprite sheet PNG is "image not made by the project". | `scripts/check-release.ts:36-38, 46`; test `tests/unit/offline/release.test.ts:42-51`; checklist `docs/release/build-3-checklist.md:21` |
| R5 | Flat colours, chunky shapes, clear silhouettes. **Readable at 0.5× zoom.** | `…design.md:70` |
| R6 | Thrill items use warm hues; Chill items use cool hues. | `…design.md:71` |
| R7 | Guests are about 10 × 16 px at 1× zoom, shirt colour from a guest palette, thin temperament ring when the overlay is on. | `…design.md:72` |
| R8 | **Every drawing function is deterministic: same inputs give the same pixels.** | `…design.md:74` |
| R9 | Family-friendly tone. | `…design.md:77` |
| R10 | Rendering is Canvas 2D. Runtime dependencies: none; a new one needs a written reason. All drawing goes through one `Renderer` interface. | `…design.md:104, 109, 111`; interface `src/render/types.ts:155-159` |
| R11 | The simulation uses only the seeded generator in `GameState.rng`. So drawing must never take numbers from it. `render/` reads the state and changes it only through commands. | `…design.md:157, 168-172` |
| R12 | Tile at zoom 1 is a 64 × 32 px diamond; height step 8 px; `sx = (x − y) × 32`, `sy = (x + y) × 16 − z × 8`. Depth by `x + y`, then `z`, then layer. Multi-tile objects are cut into per-tile slices. View rotation turns map coordinates before projection. | `…design.md:219-224` |
| R13 | Budgets: desktop 60 fps with 2,000 guests and 10 track rides, tick < 3 ms; mid-range phone 30 fps with 800 guests; desktop 128 × 128 with 3,000 guests 60 fps; **initial load < 400 KB gzipped JS + CSS**. The renderer culls outside the viewport. | `…design.md:278-287` |
| R14 | Phase 6 budgets: desktop p95 frame ≤ 20 ms; phone scene at 4× CPU throttle p95 frame ≤ 40 ms; JS heap ≤ 250 MB desktop, ≤ 150 MB phone. | `docs/superpowers/specs/thrills-and-chills/phase-6-polish.md:148-153`; constants `src/data/tuning/perf.ts:15-19` |
| R15 | Work order that already shaped the renderer: culling and chunk caches, sprite atlases per zoom bucket, guest level of detail below zoom 0.5, skip redraw of unchanged static layers. | `…phase-6-polish.md:155` |
| R16 | Sprite cache: LRU with a byte budget, `width × height × 4`, terrain chunks count. Phone 64 MB, at most 3 zoom buckets, render scale at most 2× device pixels. Desktop 192 MB. | `…phase-6-polish.md:161, 268` |
| R17 | PixiJS only by the written decision rule; the decision so far is "keep Canvas 2D". | `…phase-6-polish.md:156`; `docs/adr/0001-renderer.md:1, 138-156` |
| R18 | **All palettes are colour-blind safe by default** (blue–orange family `#0072B2`, `#56B4E9`, `#E69F00`, `#D55E00`). | `…phase-6-polish.md:166`; `src/data/tuning/a11y.ts:15` |
| R19 | **Colour is never the only signal**: valid ghost has a check icon; invalid ghost has a cross icon and a hatch; Chill guests a full ring, Thrill guests a notched ring. | `…phase-6-polish.md:166` |
| R20 | High contrast setting thickens outlines. | `…phase-6-polish.md:166`; `tests/unit/render/safeColours.test.ts:102-110` |
| R21 | Reduced motion turns off guest bobbing, beam sweeps, firework bursts. | `…phase-6-polish.md:167` |
| R22 | The canvas has an `aria-label`. | `…phase-6-polish.md:165`; `index.html:15` |
| R23 | Phase 7 keeps today's art for the park, the rides, the card pictures, and the mascots. Pixel art for the park is "proposed Phase 8, with its own spec". | `docs/superpowers/specs/thrills-and-chills/phase-7-frost-and-spark-interface.md:8, 41, 365, 375` |

Measured headroom for R13 (read-only, from the `dist/` folder another agent built at 01:50 today): JS 307.0 KB + CSS 9.2 KB = **308.8 KB gzipped of 400 KB**. About 91 KB gzipped is free. The decision record measured 314.0 KB on Build 3 (`docs/adr/0001-renderer.md:133, 155`). The size check counts only the JS and CSS that `index.html` names (`scripts/check-release.ts:85-90`).

### 5.2 `tests/unit/render/` (23 files, 200 `it` / `it.each` declarations)

Group A — **geometry and bookkeeping. A new style passes these untouched if projection, anchors, depth, and keys do not change.**

| File | Tests | What it pins |
|---|---|---|
| `tests/unit/render/iso.test.ts:27-125` | 9 | 64 × 32 tile, 8 px step (`:28`); round trip; `pickTile` height-aware (`:52-108`); `mapScreenBox`. |
| `tests/unit/render/camera.test.ts:21-107` | 7 | zoom range is exactly 0.25–2 (`:53-61`); `zoomAt` keeps the anchor within 0.5 px (`:63-90`); buckets are exactly `[0.5, 1, 2]` with thresholds (`:97-106`). |
| `tests/unit/render/depth.test.ts:14-95` | 8 | order by `x + y`, `z`, layer; packed keys; a 3 × 3 footprint is 6 screen columns (`:70`). |
| `tests/unit/render/rotation.test.ts:28-143` | 5 | picking and depth under the 4 view rotations. |
| `tests/unit/render/view.test.ts:29-245` | 9 | the rotation table; sprite rotation = stored rotation + view rotation (`:150`). |
| `tests/unit/render/walkerHeight.test.ts:10-77` | 5 | guests and staff are drawn at ground or deck height. |
| `tests/unit/render/terrainTracker.test.ts:20-94` | 4 | which map layers make a chunk dirty; path items do not (`:83`). |
| `tests/unit/render/management/geometry.test.ts:9-115` | 12 | litter and mess positions by hash; staff interpolation; bench and bin placement on a tile edge. |
| `tests/unit/render/management/layer.test.ts:40-111` | 3 | one staff entry per member with costume frame; path items with fill level and broken flag; bench sitters two seats apart. |
| `tests/unit/render/track/project.test.ts:32-187` | 11 | track projection; a steep slope is 48 px (`:63`); slice depth keys; 16 yaw and 24 pitch steps (`:137`). |
| `tests/unit/render/track/selection.test.ts:9-50` | 3 | selected ride outline tiles. |
| `tests/unit/render/scene.test.ts:13-279` | 16 | queue slots 4 per tile (`:13-77`); fence segments (`:79-109`); path join masks (`:111-155`); guest position and lanes (`:157-191`); **`SHIRT_COLOURS` has ≥ 8 entries and every index is used; tint is blue at T ≤ 35 and orange at T ≥ 65** (`:251-278`). |
| `tests/unit/render/spriteCache.test.ts:6-190` | 12 | guest frame bits (`:6-17`); key = `((hash × 4 + rotation) × 4096 + frame) × 4 + bucket index` (`:29-36`); no collisions (`:38-52`); LRU and the 64 / 192 MB budgets (`:59-190`). |

Group B — **art call recorders. These bind how art is drawn, not only what it looks like.** The recorder (`tests/unit/render/content/recorder.ts`) logs every context call, measures the extent of `moveTo`, `lineTo`, `arc`, `ellipse`, `rect`, `fillRect` (`:40-77`), counts `fill()` and `fillRect()` as fills (`:69-80`), and counts `translate`, `rotate`, `scale`, `transform`, `setTransform` as transforms (`:81-95`).

| File | Tests | What it pins |
|---|---|---|
| `tests/unit/render/content/art.test.ts:40-109` | 7 (rides) | Signatures `drawRideArt(ctx, defId, w, d, state)` (`src/render/sprites/rides.ts:471`) and `rideArtBounds(defId, w, d, rotation)` (`rides.ts:50`). 10 research rides each have an entry in `CONTENT_RIDE_ART` (`:41-44`) and the dispatcher calls its `draw` once (`:46-52`). Every ride's call log differs from every other (`:54-57`). For 4 rotations × frames × 2 occupancies: **no non-finite number, 0 transforms, more than 10 fills, every point inside the bounds ± 3** (`:59-82`). Same input gives the same log; another angle gives another log (`:84-88`). Mirror Maze and Haunted Manor hide riders; three others show them (`:101-108`). |
| `tests/unit/render/content/art.test.ts:111-149` | 4 (stalls) | `drawStallArt(ctx, defId, rotation)` (`src/render/sprites/stalls.ts:152`), `stallArtBounds()` (`stalls.ts:31`). 8 stalls with own art; more than 8 fills; inside bounds; **rotation 1 differs from rotation 2** (`:147`). |
| `tests/unit/render/content/phase6Art.test.ts:41-143` | 7 + 4 | Same for the 4 Phase 6 rides and 3 stalls. Also: riders change the log (`:89`); **at least 2 different looks over the 4 rotations** (`:92-96`); every stall differs from every other stall (`:120-124`). |
| `tests/unit/render/content/phase6Art.test.ts:145-174` | 2 | sprite keys are FNV-1a of the id and never collide. |
| `tests/unit/render/guestItems.test.ts:23-78` | 4 | `drawGuestArt(ctx, look)` (`src/render/sprites/props.ts:140`); a plain guest stays in `GUEST_BOUNDS` (−8…8, −20…5; `props.ts:15`); balloon top is more than 10 px above the head; umbrella is more than 8 px wider than the guest; both inside `GUEST_ITEM_BOUNDS` (−13…13, −40…5; `props.ts:17`); 0 transforms; **the log contains `fillStyle=<item colour>`** (`:68-69`); deterministic. |
| `tests/unit/render/track/slices.test.ts:63-246` | 11 | every slice, every piece in 4 directions and every rail style **records at least one point** and all points are inside the slice bounds ± 3 (`:105-112, 115-136`); cars inside `CAR_BOUNDS` (−38…38, −40…38; `src/render/track/paint.ts:898`), gate booths inside `GATE_BOUNDS` (`paint.ts:928`) (`:161`); 12 track colours (`:239`). This recorder knows `moveTo`, `lineTo`, `arc`, `ellipse`, `fillRect` only (`:21-48`). |
| `tests/unit/render/track/phase6Render.test.ts:60-218` | 10 | Phase 6 pieces paint finite points; inverted rails are drawn above the riders (`:89-108`); bobsled trough, monorail beam (`:110-128`); cars inside bounds at any yaw, pitch, roll (`:148`); a rolled car paints differently, 16 roll steps (`:175`). |

Group C — **the whole renderer on a fake canvas** (`tests/unit/render/fakeCanvas.ts`). The fake counts every context call and keeps `drawImage` and `rect` destinations (`:55-66`). `getImageData` returns 4 bytes (`:70-71`). Any other method returns `undefined` (`:73`), so `createImageData(...)` returns `undefined` there.

| File | Tests | What it pins |
|---|---|---|
| `tests/unit/render/renderer-rotation.test.ts:52-162` | 5 | all Build 1 objects draw in 4 rotations with finite numbers; **more than 60 `drawImage` calls and the same count in every rotation** (`:53-72`); the stall sprite is 50–90 px wide at zoom 1 and centred within 3 px on its tile's top corner (`:74-108`); guests are 2 × 3 px rectangles at zoom ≤ 0.5, one fill per colour group (`:110-130`); Buy Land tint adds fills (`:132-146`); drawing never changes the state hash (`:148-161`). |
| `tests/unit/render/renderer-rotation.test.ts:164-190` | 3 | pixel ratio cap 2 on phone-sized screens only; chunk cache 32 / 64 MB; sprite bank 96 MB; canvas size = CSS size × capped ratio. |
| `tests/unit/render/staticLayer.test.ts:57-201` | 5 | a still view composes a canvas-sized layer once and copies it (`:58-90`); **that layer has exactly 1 `fillRect` (the sky) and some `drawImage` calls** (`:74-75`); it is rebuilt on camera, zoom, rotation, or tile change, and **the rebuild frame draws images wider than 300 px** (`:92-126`, `:122`); memory pressure keeps on-screen chunks (`:128-154`); desktop prefetches both neighbour rotations, phones do not (`:156-186`). |
| `tests/unit/render/staticLayer.test.ts:203-275` | 4 | guest dots by quality (`:204-227`); low quality renders at ratio 1 (`:229-243`); `auto` steps down to 1 when frames are slow (`:245-265`); budget follows the device class (`:267-274`). |
| `tests/unit/render/staticLayer.test.ts:277-298` | 1 | the draw-call probe equals the number of `drawImage` calls. |
| `tests/unit/render/terrain.test.ts:16-55` | 4 | chunk bounds; `grassShade(seed, x, y)` returns 0 or 1 per tile, from the seed (`:33-46`; `src/render/terrain.ts:49`); the renderer module imports without a DOM (`:49-55`). |
| `tests/unit/render/terrain.test.ts:57-165` | 3 | chunks under rotation; drawn back to front at `bounds − 2 px` (`:99-104`); **bucket images are drawn scaled, then rebuilt one per frame at the exact scale and drawn 1:1** (`:125-164`). |
| `tests/unit/render/terrain.test.ts:167-265` | 5 | chunk builds are spread over frames by a 6 ms budget; phones keep 3 buckets with no exact-scale images (`:229`); prefetch. |
| `tests/unit/render/anim.test.ts:7-129` | 11 | ride animation and frame packing (section 4); chunks are 8 × 8 tiles (`:70-74`); coarse frames. |

Group D — **colour rules.**

| File | Tests | What it pins |
|---|---|---|
| `tests/unit/render/safeColours.test.ts:57-83` | 3 | ghost washes are `rgba(0,114,178,0.5)` and `rgba(213,94,0,0.55)` (`:58-62`); `renderer.ts` and `bank.ts` hold no red or green ghost literal (`:64-69`); **no file under `src/render/` contains any of 16 listed red or green literals** (`:26-43, 71-82`). A new palette file must avoid those exact values. |
| `tests/unit/render/safeColours.test.ts:85-111` | 3 | land, water, elevated-path ghosts use the safe pair; high contrast doubles ghost line width. |

### 5.3 The benchmark and the three browser files in this area

| File | What it does | Gate? | What a new style must keep |
|---|---|---|---|
| `tests/bench/render.bench.ts:50-58` | Times the terrain change check on 128 × 128. | No (prints). | `TerrainTracker.sync(map)` and the perf scene saves. Art-independent. |
| `tests/bench/render.bench.ts:60-75` | Times one tick of the Build 2 scene, budget p95 4 ms. | No (prints). | Art-independent. |
| `tests/e2e/screenshot.spec.ts:27-124` | With `TC_SCREENSHOT=1`: builds a park by commands and saves `docs/screenshots/build1-overview.png` at device scale 2 (`:28`) and **zoom 0.9** (`:102`). | No (skipped by default, `:30`). | The debug hook `window.__tc` (`dispatch`, `step`, `setSpeed`, `camera`). At zoom 0.9 and ratio 2 an art pixel would be 3.6 device px, not a whole number. |
| `tests/e2e/perf.spec.ts:122-153` | With `TC_PERF=1`: fps and frame p50 / p95 for 2,000 guests + 10 track rides on desktop at zoom 1 and 0.5; 800 guests on the phone profile at 4× CPU throttle. | No ("a measurement tool, not a gate", `:5-7`). | Camera set by `(x − y) × 32`, `(x + y + 1) × 16 − 64` (`:95-96`): the projection must stay. Numbers go into the acceptance document. |
| `tests/e2e/perf-build3.spec.ts:199-223` | The performance overlay is hidden by default; F3 and the setting show it; it shows fps, Tick, Draw calls, Sprite cache. | **Yes, always on.** | `data-testid="perf-overlay"` and the four words. |
| `tests/e2e/perf-build3.spec.ts:225-237` | Each of the 3 scene saves loads with ≥ 95 % of its guests. | **Yes, always on** (desktop). | Save loading; no console errors while drawing. |
| `tests/e2e/perf-build3.spec.ts:239-278` | With `TC_PERF=1`: 10 s warm-up, 30 s run, heap, two view turns, a pan. Reads `data-pixel-ratio` from the canvas (`:269`) and the probe fields `drawCalls`, `spriteCacheMb`, `spriteCacheByKind`, `canvasesMade` (`:25-40`). | No. | The probe API and `canvas.dataset.pixelRatio` (`src/render/renderer.ts:914`). The numbers decide the PixiJS rule (`docs/adr/0001-renderer.md:138-156`). |

Last recorded numbers, for scale (`docs/adr/0001-renderer.md:91-136`): phone scene at 4× throttle, `auto` quality, frame p95 33.4 / 33.4 / 49.9 ms against 40 ms; at 2× render scale 83 ms. Desktop frame p95 16.7–16.8 ms. Sprite and chunk memory 57.5 MB of 64 MB on the phone. The record says these budgets "have little margin on a loaded device" (`:135-136`).

### 5.4 Other tests that bind art (outside the asked list, found while reading)

| File | What it pins |
|---|---|
| `tests/e2e/boot.spec.ts:12-21` | After boot, the canvas has at least one sampled pixel with green above 120. Any bright ground passes. |
| `tests/e2e/paths.spec.ts:109-110` | The pixel at an elevated path deck is within 60 (sum of channel differences) of `#dcc79c` (`src/render/elevated/layer.ts:27`). Draft paving `s1 #ffe9bf` is 104 away and fails; `s2 #fbd08e` is 54 away. **This expected colour must be re-pinned with the new path palette.** |
| `tests/e2e/afterDark.spec.ts:110-125` | Mean canvas brightness at 22:00 is below 80 % of noon; with After Dark off it is within 5 % of noon. |
| `tests/unit/a11y/palette.test.ts:35-78` | Temperament tint ends are exactly `#56B4E9` and `#E69F00` (`:40-43`); the ghost icon fill is the safe colour (`:45-56`); **the ring is drawn with `ctx.ellipse(…, rx = 6.2, …)`: 6 arcs when notched, 1 when full** (`:68-77`). |
| `tests/unit/scenery/art.test.ts:38-72` | One drawing per catalog item (85); all logs differ; inside bounds, 0 transforms, more than 2 fills; deterministic; **the 4 rotations do not all draw the same** (`:69-72`). |
| `tests/unit/scenery/render.test.ts:22-56` | Golden sprite key values for scenery. |
| `tests/unit/paths/layer.test.ts:84-93` | The elevated deck is 4 `rect` posts and 3 fills in `ELEVATED_COLOURS.footpath.left / right / top`. |
| `tests/unit/lighting/layer.test.ts:153-258` | The night pass fills a **1/4-resolution** light canvas with the ambient colour, adds lights with `lighter`, multiplies it over the frame (`:153`); bulbs after the multiply (`:172`); at most `MAX_LIGHT_SPRITES` a frame (`:235`). |
| `tests/unit/lighting/darkness.test.ts:47-53` | Ambient colour goes from white to `rgb(70, 80, 130)`. |
| `tests/unit/shows/render.test.ts:83-158` | Show sites as column slices; effects only while a show runs; reduced motion gives still beams. |
| `tests/unit/track/waterRender.test.ts:56-202` | Channels and boats inside bounds; ripples animate by tick. |
| `tests/unit/ui/controller.test.ts:342-359` | One wheel notch gives zoom exactly 1.15, then 1 / 1.15. `tests/unit/ui/camera.test.ts:51`: `WHEEL_ZOOM_FACTOR` is 1.15. |
| `tests/unit/perf/quality.test.ts:17-25` | Render plans per quality and device (pixel ratio, 3 or 4 zoom buckets, coarse ride frames). |
| `tests/unit/architecture.test.ts:41-62` | `sim/` and `data/` import rules. `render/` is free to import, but must not be imported by `sim/`. |
| `tests/unit/offline/release.test.ts:42-51` | A tracked `public/art/ride.png` is reported as "image not made by the project". |

### 5.5 Contracts in one list

- `Renderer { resize(cssW, cssH, dpr); draw(world, camera, tool, alpha) }` (`src/render/types.ts:155-159`); `createCanvasRenderer(canvas)` and `drawPreview` exist and import without a DOM (`tests/unit/render/terrain.test.ts:49-55`).
- `Sprite { image, w, h, ox, oy, scale }` (`src/render/spriteCache.ts:13-21`); `buildSprite(bounds, scale, paint, tint)` (`src/render/canvas.ts:56`); ghost tint by `source-atop` wash (`canvas.ts:64-69`).
- `spriteKey(defId, rotation, frame, bucket)` with 12-bit frames and 3 buckets (`src/render/spriteCache.ts:44-50`).
- Art entry points and their bounds: `drawRideArt` / `rideArtBounds`, `drawStallArt` / `stallArtBounds`, `drawGuestArt` / `GUEST_BOUNDS` / `GUEST_ITEM_BOUNDS`, `drawFenceArt` / `fenceBounds`, `drawEntranceArt` / `entranceBounds`, `drawGhostIcon` (`src/render/sprites/props.ts:15-17, 140, 215-261, 328`), `CONTENT_RIDE_ART`, `CONTENT_STALL_ART` (`src/render/sprites/content/index.ts:30, 48`), `drawSceneryArt` / `sceneryArtBounds`, `paintSlice`, `paintRun`, `paintSupport`, `paintCar`, `paintGateBooth` with `CAR_BOUNDS`, `GATE_BOUNDS`.
- Art functions use no canvas transform and must record fills (group B).
- Ride frame packing and `ANGLE_FRAMES = 32` (`src/render/anim.ts:9, 58-71`). Guest frame bits (`src/render/sprites/bank.ts:50-52`).
- Meaning colours: `SAFE_PALETTE` (`src/data/tuning/a11y.ts:15`), ghost colours (`src/render/palette.ts:10-24`), 9 tint steps (`palette.ts:84`), 12 shirt colours (`palette.ts:52-65`). The draft also has 12 shirts (`pixel3.py:283`).
- Canvas data attributes that tests read: `data-zoom`, `data-rotation`, `data-pixel-ratio`, `data-device`, `data-auto-scale` (`src/render/renderer.ts:914-916, 1124-1132`).
- Anchors and footprints: tile top corner anchor for sprites (`tests/unit/render/renderer-rotation.test.ts:89-106`); column slices for multi-tile objects (`src/render/renderer.ts:349-363`).

---

## 6. What makes pixel art hard here

1. **Zoom is continuous and tests say so.** Scale = `zoom × ratio` (`src/render/renderer.ts:1059`), zoom changes by × 1.15 (`src/input/camera.ts:13`) or by pinch (`src/input/controller.ts:280`). Tests pin the exact values (`tests/unit/ui/controller.test.ts:342-345`, `tests/unit/render/camera.test.ts:53-61`). Square, even art pixels exist only where `2 × zoom × ratio` is a whole number (table in 3.3). Everything else gives uneven or blurred pixels.
2. **Smoothing is on and sprites are stretched.** `ctx.imageSmoothingEnabled = true` every frame (`src/render/renderer.ts:1071`, `1018`); sprites are scaled by `scale / sp.scale` (`:339-344`). Pixel art needs the opposite on every path that draws art, while the night light canvas needs smoothing kept (`src/render/lighting/pass.ts:159-161`).
3. **Canvas 2D cannot fill a path without anti-aliasing.** The draft relies on aliased polygons, ellipses, lines, and arcs (`pixel3.py:220-241` and every object). The game's shared shape helpers (polygon, line, box, disc, cylinder, cone, pyramid, head, rounded rectangle) are all path fills and strokes on one `Ctx` type (`src/render/sprites/shapes.ts:6, 21-185`). There are 89 functions named `draw…` or `paint…` and 205 `fillStyle` assignments under `src/render/`.
4. **Art is drawn through a scale transform at three scales, and on desktop at any scale.** `buildSprite` sets `setTransform(scale, …)` (`src/render/canvas.ts:62`); terrain chunks are rebuilt at the exact zoom (`src/render/terrain.ts:550, 588-589`; test `tests/unit/render/terrain.test.ts:125-164`). Vector art gets sharper from this. Pixel art gets seams and soft edges at any scale that is not 0.5, 1, or 2.
5. **Tests bind the drawing method.** Art must produce `fill()` or `fillRect()` calls (more than 10 per ride frame, more than 8 per stall, more than 2 per scenery item) and recordable points, with no transform (`tests/unit/render/content/art.test.ts:71-72, 136-137`; `content/phase6Art.test.ts:72-73, 131-132`; `tests/unit/scenery/art.test.ts:54-55`; `tests/unit/render/track/slices.test.ts:108-109`). Art that only calls `putImageData` or `drawImage` of a ready bitmap records zero fills and zero points and fails. Runs of `fillRect` pass.
6. **Node tests have no pixels.** The fake canvas returns 4 bytes from `getImageData` and `undefined` from `createImageData` (`tests/unit/render/fakeCanvas.ts:70-73`); vitest runs in `node` (`vitest.config.ts:7`). `src/` has no `getImageData`, `putImageData`, or `ImageData` today. An outline pass, a palette snap, or a dither that reads pixels back cannot be tested there without new helpers, and must not crash there.
7. **The draft's shadows and light pools rewrite the picture under them** (`pixel3.py:184, 197`). In the game that would be a full-canvas read and write every frame. The game's night is a smooth 1/4-resolution multiply (`src/render/lighting/pass.ts:1-12, 159-161`), pinned by `tests/unit/lighting/layer.test.ts:153` and by the brightness test `tests/e2e/afterDark.spec.ts:117`. A smooth multiply over pixel art leaves the palette. Ghost washes (`src/render/canvas.ts:64-69`), overlays, and land tints leave it too.
8. **Four view rotations.** The draft has one. Tests demand different drawings per rotation for every scenery item (`tests/unit/scenery/art.test.ts:69-72`), every Phase 6 ride (`tests/unit/render/content/phase6Art.test.ts:92-96`), and every stall (`content/art.test.ts:147`). Light comes from the screen left in the draft (`pixel3.py:220-241`), so lit and dark faces swap with rotation. ASCII sprites cannot be turned; each facing is new art.
9. **Frame counts.** For each of 18 flat rides the frame space is 4 rotations × 32 angles × up to 5 swing levels × 5 rider levels (`src/render/anim.ts:9, 58`); cars at 16 yaw × 24 pitch × 16 roll (`tests/unit/render/track/project.test.ts:137`; `track/phase6Render.test.ts:175`); guests 4 facings × 3 walk frames. Frames drawn by hand are not practical at these counts. The draft's procedural shapes (`ibox`, `icyl`, `icone`) are its only route that could cover them, and the draft never turned one of them or drew a second frame.
10. **Sub-pixel positions.** Guests, staff, and cars move between ticks on continuous positions (`tests/unit/render/scene.test.ts:157-170`); each sprite corner is rounded alone (`src/render/renderer.ts:340-343`); the camera offset is fractional (`:1061-1062`). At 4 device px per art px, objects land off the art grid of the ground.
11. **Phone screens.** The canvas ratio is capped at 2 on phone-sized screens (`src/render/canvas.ts:38, 45-49`), 1 at low quality, and `auto` can drop to 1 (`tests/unit/render/staticLayer.test.ts:229-265`). The browser then stretches the canvas to the real device ratio (2.625 on the Pixel 7 test profile, `tests/unit/render/renderer-rotation.test.ts:169`). That stretch is not a whole number, and `#game` has no `image-rendering` rule (`src/styles/main.css:34`).
12. **Zoom 0.25.** An art pixel is half a CSS px (table in 3.3). The picture must be shrunk, which smears dither and outlines. The spec only promises readability at 0.5 (`…design.md:70`), where 1 art px = 1 CSS px.
13. **Image-size assumptions in tests.** `d.image.width > 300` on a rebuild frame (`tests/unit/render/staticLayer.test.ts:122`): an 8 × 8-tile chunk stored at art resolution is about 260 px wide and fails. Bucket images "drawn scaled", then exact images "drawn 1:1" (`tests/unit/render/terrain.test.ts:145-158`).
14. **No image files.** Rule R2 and the release script (`scripts/check-release.ts:36-38, 46`) forbid sprite sheets. Every sprite is code or data inside the JS bundle, which has about 91 KB gzipped of room (5.1). The draft's whole script, for about 30 object kinds in one view plus five extra themes, is 54.8 KB of dense Python.
15. **Meaning colours are outside the draft palette.** `#0072B2`, `#56B4E9`, `#E69F00`, `#D55E00` (`src/data/tuning/a11y.ts:15`) are not in any ramp (`pixel3.py:12-26`). The temperament ring is pinned as a vector ellipse of radius 6.2 (`tests/unit/a11y/palette.test.ts:75`). The draft's warm grass and orange rides were not checked for colour-blind safety.
16. **The ground is world-continuous in the draft, tile-based in the game.** Draft grass is noise over the plane with Bayer dither in screen space (`pixel3.py:116-119`) on flat land. The game has slopes, cliffs, 5 terrain types, water beds, and edge faces, drawn per tile into chunks, with a per-tile two-shade function (`src/render/terrain.ts:49, 291`). Dither must line up across chunk borders and under 4 rotations.
17. **Depth by slices.** Multi-tile sprites are cut into vertical columns per tile (`src/render/renderer.ts:349-363`; `tests/unit/render/depth.test.ts:70`). An outline made around a whole sprite is cut with it; an outline made per slice appears inside the object.
18. **Owner pictures are taken at odd scales.** `tests/e2e/screenshot.spec.ts:28, 102` uses zoom 0.9 at ratio 2.

---

## 7. Size of the job

This area owns no game drawing code. Its numbers are the draft's size and the size of the rule set.

**The draft (the only existing code in the approved style):**

- 38 drawing functions in `pixel3.py`: 27 object functions (table in 1.2 plus the theme-only ones) and 11 shared ones (`sh_ell`, `sh_box`, `apply_shadows`, `glow`, `apply_lights`, `Layer.flush`, `ibox`, `icyl`, `icone`, `stamp`, `P`).
- 573 lines of drawing code: 504 in those functions, 27 ASCII sprite lines, 22 for ground details, 7 for the boulder, 13 for fog and snowfall. Lines are dense: the file averages 70 bytes per line and many lines hold 4 to 8 statements.
- Per-object cost in the draft, for one view and one frame: small prop 2 to 9 lines; tree 11 to 16; stall 19; tower 19; wheel 22; carousel 29; coaster 56; ground 65.
- 27 ASCII sprites, 3 × 5 to 20 × 13 art px.

**The rule set a new style meets:** 23 written rules (5.1); 23 unit test files with 200 declarations in `tests/unit/render/`; 2 always-on browser tests and 8 non-gating benchmarks, measurements, or screenshot scripts in the four named files; 16 further files in 5.4.

- Pass untouched if geometry and keys stay: group A, 13 files, 104 declarations.
- Bind the drawing method and need either compliant art (fill runs, bounds, no transforms, 4 rotations) or a rewrite: group B, 5 files, 49 declarations, plus `tests/unit/scenery/art.test.ts` (3 tests × 85 items), `tests/unit/track/waterRender.test.ts`, `tests/unit/a11y/palette.test.ts`.
- Bind the renderer pipeline (smoothing, bucket and exact-scale images, image widths, static layer): group C, 4 files, 41 declarations.
- Bind colours: group D, 1 file, 6 declarations; plus 2 browser tests with pinned colours (`tests/e2e/paths.spec.ts:110`, `tests/e2e/afterDark.spec.ts:117`).

**Whole-game context** (rough, by `wc` and `grep`; the other area maps hold the exact figures): `src/render/` has 16,922 lines in 80 files; 89 functions named `draw…` or `paint…`; art-heavy folders are `sprites/` 2,038 lines, `sprites/content/` 1,855, `scenery/art/` 2,238, `track/` 2,578, `shows/` 1,116, `lighting/` 939, `terrain.ts` 734; mascot portraits `src/ui/scenario/mascotArt.ts` 134 lines.

---

## 8. Open questions

1. **May tests change?** Group B and C tests encode the vector method (fill counts, exact-scale chunks, image widths, `ellipse` radius 6.2). Is the rule "all current tests pass unchanged", or "each changed test is listed and approved"?
2. **Zoom.** May zoom snap to whole-number art scales (for example 0.5, 1, 1.5, 2 at ratio 1), which changes `tests/unit/ui/controller.test.ts:342-345`? Or must zoom stay continuous, with uneven pixels between steps?
3. **Zoom below 0.5.** Keep 0.25, or raise the minimum (`tests/unit/render/camera.test.ts:60` pins 0.25)?
4. **Art pixel size.** The drafts imply 1 art px = 2 world px. Is that fixed, so that zoom 1 looks like the draft?
5. **Phones.** Is a soft stretch from canvas ratio 2 to the device ratio acceptable, or must the phone canvas run at a whole device ratio (which the measured phone frame budget does not allow at 2.625, `docs/adr/0001-renderer.md:147-148`)?
6. **Palette discipline.** Must every pixel on screen be one of the 59 palette colours, as in the draft? If yes, night, shadows, ghosts, overlays, and tints need dithered, in-palette forms. If no, which layers may blend?
7. **Night.** The approved pictures are day only. The night look exists only as theme drafts (`spooky`, `starport`). Which night look is the target: dithered pools (`pixel3.py:188-197`) or today's smooth light?
8. **Themes.** Draft themes recolour the whole world. Game themes are scenery sets. Is a recoloured ground wanted at all?
9. **Colour-blind safety of the warm palette** (R18): who checks the 13 ramps, and do the four safe colours join the palette as fixed "signal" slots?
10. **Rotation and light.** Does the light stay on the screen left in all 4 views (faces change colour when the view turns), or does it turn with the map?
11. **Ride footprints.** The draft wheel is wider than a 3 × 3 footprint (3.2). Redraw to fit, or change bounds and slices?
12. **Card pictures and mascots.** Phase 7 keeps today's art for both (`…phase-7-frost-and-spark-interface.md:8`). The drafts show pixel versions: card pictures are crops of the world (`CANVAS/assets/thumb-*.png`, 272 to 352 px squares) and mascots are the 11 × 14 and 13 × 13 sprites scaled × 6 (`CANVAS/assets/mascot-frost.png` 66 × 84, `mascot-spark.png` 78 × 78). Are both in the art project? The mood-bar mascots in the draft are shown at 36 × 46 px (`DraftDesktop.dc.html:53`), which is not a whole multiple of 11 × 14.
13. **Bundle room.** About 91 KB gzipped is free. Does the old vector art leave the bundle, or do both styles ship (for a setting or a fallback)?
14. **Bit-exact match to the draft** is not possible for the random parts (trees, scatter). Is "same look" enough?
15. **Screenshots for the owner** (`tests/e2e/screenshot.spec.ts:102` and the other screenshot scripts) use zoom 0.9. Change them to a whole-number art scale?
