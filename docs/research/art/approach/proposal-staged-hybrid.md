# Proposal "staged hybrid": the frame first, then family by family, then heroes by hand

Written 2026-11-11 against the working tree at `0b20aea` (read-only; nothing in the repository was changed, built
or run). All repository paths are relative to `/home/user/RC-TYCOON-`. Every file and line below was opened and
checked for this proposal unless it says "from the map".

Words used:

- **World pixel**: one pixel at zoom 1 on a screen with pixel ratio 1. A tile is 64 × 32 world pixels.
- **Art pixel**: one pixel of the approved drafts = 2 world pixels. A tile is 32 × 16 art pixels.
- **Canvas pixel**: one pixel of the game canvas's backing store. **Device pixel**: one physical screen pixel.
- **Level 0**: today's art (smooth vector). **Level 1**: today's art functions, cleaned by a pass (hard edges,
  palette, outline). **Level 2**: level 1 after the shared drawing helpers learn the draft's rules.
  **Level 3**: art drawn natively on the art-pixel grid with the draft's own method.

Two things I made to check my own claims (both outside the repository):

- A comparison sheet of the four levels on the same five objects:
  `/tmp/claude-0/-home-user-RC-TYCOON-/29ee6f8c-df84-5112-ac7e-04cfb7614dae/scratchpad/art/approach/staged-hybrid-levels.png`
  (script: `/tmp/claude-0/-home-user-RC-TYCOON-/29ee6f8c-df84-5112-ac7e-04cfb7614dae/scratchpad/art/approach/staged-hybrid-bench/levels.py`).
  The shapes are stand-ins drawn with Pillow, not the game's art functions. Row 1 is the kind of filter the owner
  already saw. Rows 2 and 3 are levels 1 and 2. Row 4 is level 3.
- A timing sketch of the pass and of a ground chunk:
  `/tmp/claude-0/-home-user-RC-TYCOON-/29ee6f8c-df84-5112-ac7e-04cfb7614dae/scratchpad/art/approach/staged-hybrid-bench/bench.mjs`
  (results in `bench-output.txt` beside it). It ran in Node 22 on a 4-core Linux machine, on typed arrays only.
  It is not a phone measurement.

---

## 1. The approach in ten sentences

1. The whole screen changes first, in one stage: zoom moves in steps where one art pixel is a whole number of
   device pixels, smoothing is switched off, every sprite is stored once at the draft's resolution, and the ground
   is painted pixel by pixel with the draft's grass and paving texture.
2. In that first stage no art function is rewritten: `buildSprite` paints today's vector art four times too large,
   then a pass takes a majority vote per art pixel, makes the edge hard, moves every colour to the draft's palette
   ramps, and adds the one-pixel ink outline around solid parts.
3. I say plainly that this pass is a filter: it is clearly better than the filter the owner saw (it has the
   outline, the palette, no blended edges, and a hand-built ground), and it is clearly weaker than the drafts.
4. So the pass is scaffolding, not the destination: it lets the game ship in one consistent pixel style after
   every stage while the real art is built behind it.
5. The second stage teaches the 34 shared drawing helpers the draft's rules (lines are whole art pixels, cylinders
   and cones get a lit and a dark side, boxes get a highlight, shades come from the ramps), which lifts all 174 art
   functions at once without touching them.
6. Then object families are redrawn natively, in the order of how much of the screen they cover: people and path
   furniture, trees and common scenery with water, stalls and decks, track, flat rides, the remaining scenery and
   shows.
7. "Natively" means the draft script's own method, ported to TypeScript as a small pixel kit: hard-edged boxes,
   cylinders and cones on an art-pixel buffer, layers that carry their own outline, small ASCII sprites, specks and
   dither.
8. Hero objects (carousel, big wheel, drop tower, swing tower, the coaster station and trains, the mascots) get
   the most hand work and come as their own stage.
9. A switch "Art style: Classic or Pixel" exists only for the first two stages, while no old art has been
   deleted; after the owner's review the game is pixel only and each redrawn family replaces its old code.
10. The pass stays for good only where a side-by-side picture shows no gain from hand work: coaster cars in their
    6,144 poses, placement ghosts, and plain box-shaped scenery.

---

## 2. How a picture is made

### 2.1 New units

| File | What it holds | Main signatures |
|---|---|---|
| `src/render/pixel/style.ts` | The art style switch, module state like `src/perf/quality.ts:122-138` | `type ArtStyle = 'classic' \| 'pixel'`; `artStyle()`; `setArtStyle(s)`; `artStyleVersion()` |
| `src/render/pixel/grid.ts` | The pixel grid policy, pure functions | `ART_PX = 2`; `ART_SCALE = 0.5`; `interface PixelGrid { deviceRatio; stretch; canvasRatio }`; `planStretch(deviceRatio, maxCanvasRatio): number`; `wholeArtScale(zoom, grid): number` (canvas pixels per art pixel, or 0 when not whole); `zoomLevels(grid): readonly number[]`; `nearestZoomLevel(zoom, grid)`; `stepZoomLevel(zoom, dir, grid)`; `snapArt(worldPx)`; `pixelGrid: { current: PixelGrid; version: number }` |
| `src/render/palette.ts` (extended) | The 13 draft ramps (`concepts/pixel3.py:12-26`), a snow ramp, 4 fixed signal slots (`SAFE_PALETTE`, `src/data/tuning/a11y.ts:15`), the ink colour | `RAMPS: Record<RampId, readonly string[]>`; `INK`; `tone(ramp, i): string`; `toneShift(hex, steps): string`; `paletteIndex(r, g, b): number` (nearest slot through a 32,768-entry table filled on first use); `paletteRgba(): Uint8ClampedArray` |
| `src/render/pixel/pass.ts` | The clean-up pass, pure, works on a byte array | `pixelPass(src: Uint8ClampedArray, sw, sh, opts: { supersample: 4; outline: 'solid' \| 'none' }): { index: Uint8Array; w; h }` |
| `src/render/pixel/surface.ts` | The native kit: an art-pixel buffer of palette indices with the draft's primitives | `class PixelSurface { constructor(bounds: ArtBounds); layer(outline = true): PixelLayer; emit(ctx: Ctx): void; toImageData(ctx): ImageData \| null; hash(): number }`; `class PixelLayer { px; hline; rect; poly; line; ellipse; box; cyl; cone; stamp(rows, ax, ay, map, flip?); speck; dither; flush() }` |
| `src/render/pixel/ground.ts` | The ground painter for one terrain chunk | `paintGroundChunk(s: PixelSurface, map, rect: { u0; v0; u1; v1 }, r: ViewRotation, env: TerrainEnv): void` |
| `src/render/pixel/dither.ts` | Dither fills that replace alpha washes | `ditherPattern(ctx, colour, density: 1 \| 2 \| 3, artScale): CanvasPattern \| null` |
| `src/render/pixel/stamps/*.ts` | ASCII sprites as rows of letters (people, mascots, horses, gondolas, stall icons) | `const GUEST_FRONT: readonly string[][]` and so on |

`PixelLayer.box`, `cyl` and `cone` take the same inputs as today's `box`, `cylinder` and `cone`
(`src/render/sprites/shapes.ts:58, 97, 127`) and as the draft's `ibox`, `icyl`, `icone`
(`concepts/pixel3.py:220-241`), at half size. `flush()` is the draft's outline rule (`pixel3.py:202-218`): grow
the layer's mask by one pixel up, down, left and right, paint ink there, then the layer on top.

### 2.2 One sprite

All 14 callers of `buildSprite` (`src/render/canvas.ts:56-72`) keep their calls. The style decides what happens
inside.

**Level 0, classic style:** as today.

**Level 1 and 2, pixel style, an art function that still draws vectors** (`buildSprite`, changed):

1. The renderer passes bucket 0.5 always (see 2.4), so `scale` is `ART_SCALE`. Odd bounds are widened to even
   numbers, so the anchor is a whole art pixel (today litter, mess and guests with items have half-pixel anchors,
   `src/render/sprites/litter.ts:12-13`, `props.ts:17`).
2. Paint into one shared scratch canvas at 4 × the art resolution: `setTransform(2, 0, 0, 2, 4·ox, 4·oy)`, then
   `paint(ctx)`. This is the same vector work as a bucket-2 sprite today. The scratch canvas is made once by
   `makeCanvas` (`canvas.ts:12-26`, new option) with `willReadFrequently: true`, so reading it back is a memory
   copy.
3. `getImageData`, then `pixelPass`:
   - per art pixel, look at its 16 samples; the pixel is solid when at least 8 have alpha ≥ 128;
   - its colour is the palette slot that most of the solid samples snap to (a vote, never a blend, so no
     in-between colours appear on edges);
   - outline: a clear pixel becomes ink when it touches a solid pixel that belongs to a solid part. A part is
     solid when it survives a 3 × 3 erosion. Lines of 1 or 2 art pixels do not survive, so spokes, poles, rails and
     lattice stay free of ink. This is the automatic form of the draft's `Layer(outline=False)`
     (`pixel3.py:511, 538`). My sheet shows the difference: with the plain rule the wheel turned into a black web.
   - ink is never outlined again, so the pass does nothing to art that is already pixel art.
4. `putImageData` into the sprite canvas at art resolution. The ghost wash (`canvas.ts:64-70`) follows as today in
   stage 1 and becomes a dither fill in stage 2.
5. If `getImageData` returns less than `w × h × 4` bytes (the unit-test fake returns 4 bytes,
   `tests/unit/render/fakeCanvas.ts:70-71`), the pass is skipped and the painted canvas is kept. Nothing crashes
   in Node.

A fifth, optional argument `opts?: { outline?: 'solid' | 'none' }` lets track slices switch the outline off
(`src/render/track/layer.ts:691`): a slice is cut at the tile border, and ink at the cut would show inside a
platform.

**Level 3, a native art function:**

1. The art module builds a `PixelSurface` for its bounds and draws on layers; each layer flushes with its own
   outline. Example: `carouselSurface(state): PixelSurface`.
2. The sprite builder calls the new `spriteFromSurface(surface, tint)` in `canvas.ts`: one `putImageData` at art
   resolution. No vector paint, no read-back.
3. The old entry point stays: `drawRideArt(ctx, …)` becomes `rideSurface(…).emit(ctx)`. `emit` writes each run of
   equal colour as `fillRect(x·2, y·2, n·2, 2)` in world pixels, grouped by colour. Under a scale of 0.5 that is
   pixel-exact. It is used by the card pictures, by the recorder tests (which count `fillRect` as a fill and
   measure its extent, `tests/unit/render/content/recorder.ts:69-73`), and as the fallback when `ImageData` is
   missing. A unit test holds `emit` and `toImageData` to the same pixels.

### 2.3 One terrain chunk

`TerrainLayer.build` (`src/render/terrain.ts:542-561`) gets a pixel branch: make a `PixelSurface` for the chunk
bounds, call `paintGroundChunk`, return `spriteFromSurface`. The chunk order, the cache, the tracker, the
first-build budget and the placeholder stay (`terrain.ts:567-649`).

`paintGroundChunk` paints tiles back to front like `paintTile` (`terrain.ts:258-330`) and reuses its neighbour and
join logic. What changes is how colour reaches the pixels:

- **Top face.** Each tile is walked as a regular lattice in tile space (u, v). A sample's height comes from the
  same bilinear rule as today (`terrain.ts:80-82`), so all 15 slope shapes work without special cases. The sample
  is plotted at its art pixel and the pixel below, so steep faces have no holes.
- **Grass.** The draft's rule (`pixel3.py:115-119`): two octaves of value noise in map coordinates (they turn
  with the map) plus a 4 × 4 Bayer threshold in world-anchored art-pixel coordinates (it lines up across chunk
  borders). The sum picks one of three tones of the grass ramp.
- **Slopes and land outside the park.** No free shading (`terrain.ts:292-295`, `shade`). A slope facing the light
  moves one tone up the ramp, a slope facing away one or two tones down. Land outside the park moves two tones
  down (today: colour × 0.78, `terrain.ts:35`).
- **Other terrain types.** Sand uses ramp `s`, dirt `w`, rock `c`, snow the new ramp, each with the same noise.
- **Cliff sides and the map edge.** Filled column by column in two wood or stone tones with a darker bottom line
  and short strata dashes from a hash. The draft has no cliffs; this is new design work (see section 7).
- **Paths.** Margins move to the art grid: `M = 0.16` becomes 1/8 tile and `B = 0.055` becomes 1/16
  (`terrain.ts:165-166`), which are 2:1 pixel stairs. Inside, the draft's slabs (`pixel3.py:160-167`): 2 × 2 slabs
  per tile, joints in `s3`, a darker strip on sides without a join. Queues use the same slabs in a blue-grey tone;
  posts and ropes become whole-pixel lines.
- **Water.** Opaque, not the 0.8 alpha quad of `terrain.ts:312-317`: base tone, short dashes from a hash, a light
  line on the near shore and a dark line on the far shore (`pixel3.py:126, 139-142`).

### 2.4 One frame

| Step | Where | Change in pixel style |
|---|---|---|
| Plan the canvas | `applyPlan`, `src/render/renderer.ts:898-917`; `renderPlan`, `src/perf/quality.ts:64-77` | The plan gains `stretch` (a whole number k). Canvas ratio = device ratio ÷ k. k is the smallest whole number that keeps the ratio at or under today's cap (desktop: no cap, k = 1; phone class: 2; `low`: 1; an `auto` step down uses the `low` cap, as today, `quality.ts:71`). `pixelGrid.current` is set here. `canvas.dataset.art = 'pixel'`; a CSS rule `#game[data-art="pixel"] { image-rendering: pixelated; }` is added to `src/styles/main.css:34`. `terrain.allowExact = false` (`renderer.ts:906`). |
| Scale | `renderer.ts:1059-1062` | `n = wholeArtScale(cam.zoom, grid)`. When n > 0: `scale = n / 2` exactly, and `offX`, `offY` are rounded to whole canvas pixels. `bucket` is fixed to 0.5, so every layer asks for the art-resolution sprite and each sprite exists once. |
| Smoothing | `renderer.ts:1071` and `1018` | `imageSmoothingEnabled = false`, except in the far overview (less than one canvas pixel per art pixel). The night pass sets and restores its own flag (`src/render/lighting/pass.ts:159-169`) and is not touched in stage 1. |
| Blits | `renderer.ts:338-363`, `scenery/layer.ts:60-83`, `shows/layer.ts:113-135`, `track/layer.ts:670-677`, `terrain.ts:638-643` | **No change.** With `sp.scale = 0.5` the factor `f = scale / sp.scale` is n, a whole number; anchors of static objects are even world pixels; `ox` and `oy` are whole. Then both rounded edges of every blit are exact, and a sprite is n times its size with no seam. |
| Moving things | guests `renderer.ts:553-554`; staff in `management/layer.ts`; cars `track/layer.ts:863` | Stage 2: the anchor is snapped with `snapArt` before the push, so walkers and cars sit on the same grid as the ground. |
| Ride strips | `renderer.ts:455-462, 587-594`; `scenery/layer.ts:126-133`; the show tower | Stage 2: the first and the last strip also carry the 2-pixel image margin, so the outline at the footprint's left and right corner is not cut off. |
| Zoom input | `src/input/controller.ts:123-129` (wheel), `:152` (keys), `:277-282` (pinch); `src/input/camera.ts:13-14, 83-88` | Wheel and keys call `stepZoomLevel`. A pinch calls `zoomAt` freely as today and, when the fingers lift, settles on `nearestZoomLevel`. The controller also settles the zoom when `pixelGrid.version` changes (first frame, resize, quality change). The renderer never changes a zoom on its own, so tests and scripts that set `camera.zoom` keep their value. |
| Style change | new, beside `renderer.ts:1050` | When `artStyleVersion()` changes: clear the sprite bank, the chunk images (`terrain.invalidate()`, `terrain.ts:517-519`), scenery, show, car, gate and slice sprites, then re-plan. |

Geometry, depth sorting, view rotation, picking, the caches, the draw list and every file under `src/sim/` are
not touched.

---

## 3. Zoom, device pixel ratio and the pixel grid

### 3.1 The rule

Two whole numbers decide everything:

- **k**, the stretch: device pixels per canvas pixel. The browser stretches the canvas by k with
  `image-rendering: pixelated`.
- **n**, the art scale: canvas pixels per art pixel.

One art pixel is then `n × k` device pixels, always a whole number, on every screen. The camera zoom that belongs
to it is `zoom = n × k ÷ (2 × device ratio)`. Zoom is no longer a free number; it is one of these values between
0.25 and 2.0 (`src/render/camera.ts:6-7`, limits unchanged).

Today the phone class caps the canvas ratio at 2 and lets the browser stretch by 1.3125 on a 2.625 screen, with
smoothing (`src/perf/quality.ts:68`; `src/data/tuning/perf.ts:7`). That stretch can never be even. With a whole k
the canvas has the same number of pixels as in today's plan or fewer, on every device, so the measured frame
budgets are not put at risk by fill rate. Example: a Pixel 7 draws 541 × 1201 canvas pixels (k = 2) instead of
824 × 1830 today.

The canvas keeps its CSS size of 100 %. Its backing size is `ceil(device size ÷ k)`. When the device size is not
a multiple of k, one row or column of canvas pixels in the whole screen is one device pixel narrower. That is the
only unevenness left.

### 3.2 The levels

"Home" is the level nearest to the draft's size of 2 CSS pixels per art pixel. The game starts there (the default
zoom of 1 in `src/game.ts:17` is settled on the first frame).

| Screen | k | Zoom levels (crisp) | Home | Far overview |
|---|---|---|---|---|
| Desktop, ratio 1 | 1 | 0.5, 1, 1.5, 2 | 1 | 0.25, smoothed |
| Desktop, ratio 1.25 | 1 | 0.4, 0.8, 1.2, 1.6, 2 | 0.8 (a tie with 1.2; the smaller wins) | 0.25, smoothed |
| Desktop, ratio 1.5 | 1 | 0.33, 0.67, 1, 1.33, 1.67, 2 | 1 | 0.25, smoothed |
| Desktop or phone, ratio 2 | 1 | 0.25 to 2 in steps of 0.25 | 1 | not needed (0.25 is crisp) |
| Desktop, ratio 3 | 1 | 0.33 to 2 in steps of 0.17 | 1 | none: 0.33 is the lowest zoom on this screen |
| Phone class, ratio 2.625 (Pixel 7) | 2 | 0.38, 0.76, 1.14, 1.52, 1.90 | 1.14 | 0.25, smoothed |
| Phone class, ratio 3 | 2 | 0.33, 0.67, 1, 1.33, 1.67, 2 | 1 | 0.25, smoothed |
| `low` quality, ratio 2 | 2 | 0.5, 1, 1.5, 2 | 1 | 0.25, smoothed |
| `auto` after a step down, ratio 2.625 | 3 | 0.57, 1.14, 1.71 | 1.14 | 0.25, smoothed |

**The far overview.** Where 0.25 would be less than one canvas pixel per art pixel, it is kept as one extra level
and drawn differently: smoothing on, and the ground chunks for it are built without the Bayer dither (flat tone
patches), so shrinking them cannot produce moiré. Guests are already 2 × 3 pixel rectangles from zoom 0.5 down
(`renderer.ts:1067, 1112`). The master spec promises readability at zoom 0.5 only
(`docs/superpowers/specs/2026-11-09-thrills-and-chills-design.md:70`, from the map).

**Between levels.** A pinch in progress, or a zoom set by a script, can sit between levels. The picture is then
drawn with smoothing off and uneven pixels. In motion this reads as normal zooming; it never blurs and then pops.

### 3.3 What the player notices

- The park is sharp at rest on every screen, and each art pixel is a square of equal size.
- The wheel and the plus and minus keys click between sizes, as in classic park games. On a ratio-1 monitor there
  are four sizes and the overview, and the step from 0.5 to 1 doubles the picture. On ratio 2 there are eight.
- A pinch follows the fingers; on release the view settles to the nearest size in about 100 ms (at once with
  reduced motion).
- Panning stays smooth to one canvas pixel. The ground and all objects move together as one grid.
- Walking guests move in steps of one art pixel. To keep the step pattern a clean 2:1 stair, the x position is
  snapped first and y is taken from the walking line (stage 2).
- On a 125 % desktop the default view is one fifth smaller than on a 100 % desktop (an art pixel is 1.6 CSS
  pixels, not 2), because zoom 1 is not a level there.
- Smooth vector overlays (selection, labels) stay smooth on desktops. On phones they are drawn at the canvas
  ratio and stretched by k without smoothing, so they look slightly blocky until stage 2 replaces them.

---

## 4. Coverage

"Stage 1 look" is what the player sees right after the first stage. "Final" is the method at the end.

| Thing | Stage 1 look | Final method | Stage |
|---|---|---|---|
| **Terrain with slopes and cliffs** | Native from the start: noise and dither grass, tone steps on slopes, plain two-tone cliffs | Same painter, plus designed cliff strata, 5 terrain types tuned, map edge skirt | 1, tuned in 4 |
| **Water** | Opaque water with dashes and shore lines, baked into chunks | Plus a twinkle: 2 small sprites per visible water tile, swapped every 10 ticks, drawn in the `drawGround` hook (`src/render/layers.ts:60`); off with reduced motion | 1, twinkle in 4 |
| **Paths and queues** | Slab paving on the art grid, darker edge strip, whole-pixel ropes and posts | Same; path width decided by the owner (section 8) | 1 |
| **Elevated paths** | Unchanged: per-frame vector quads (`src/render/elevated/layer.ts:103-133`), smooth edges over pixel ground | Deck tiles as cached sprites per kind, ramp shape and rotation with the slab texture; posts as whole-pixel columns | 5 |
| **18 flat rides with animation** | Level 1: today's frames through the pass. Chunky parts read well; thin parts break up (row 2 of the sheet) | Level 2 for all in stage 2. Level 3 by hand in stage 7: carousel, big wheel, drop tower, swing tower, pendulum ship first, then the other 13. Moving parts are code-drawn on the grid per angle (the draft's carousel is built this way, `pixel3.py:454-482`); seats, horses, gondolas and riders are stamps that only move | 1, 2, 7 |
| **14 stalls** | Level 1 | Level 3 on a native stall kit (body, door, counter, striped awning, icon stamp on a pole, as `pixel3.py:424-442`); 4 rotations: 2 show the counter, 2 show a designed back | 5 |
| **Track rides with trains** | Level 1; rails are the weakest part | Stage 2: `polyline`, `quad`, `band` (`src/render/track/paint.ts:142-166, 332-336`) draw whole-pixel lines and hard bands with their own ink edge along the run; the pass runs with the outline off for slices. Stage 6: stations, channel water, boats and lead cars natively. Cars in 16 × 24 × 16 poses stay on the pass for good: they are boxes, and the pass handles boxes well | 2, 6 |
| **111 scenery functions in 4 rotations** | Level 1 | Stage 4: Base Set and Classic Fair (25 items, open at the start) natively on a scenery kit (foliage blob in 3 tones with specks, trunk, flower specks, as `pixel3.py:312-338, 408-422`). Stage 8: the other 5 themes; each item is reviewed side by side and stays on the pass when hand work adds nothing (walls, crates, plain pillars) | 4, 8 |
| **Guests and staff** | Level 1: outlined blobs of about 5 × 10 art pixels. Not good enough | Stamps: guest 7 × 12 art pixels (`pixel3.py:256-258`), front and back view, mirrored for the 4 facings, stand, 2 walk frames, sit; shirt, skin, hair and trousers by a colour map; balloon and umbrella stamps; staff in 4 types; Frost, Spark and Boo costumes. `GUEST_BOUNDS` grows to 24 above the feet (`src/render/sprites/props.ts:15`) with the cull margins (`renderer.ts:563-564`) | 3 |
| **Temperament ring** | Vector ellipse through the pass | A full pixel ring for Chill and a dotted ring for Thrill, so shape still differs, not only colour | 3 |
| **Litter and path items** | Level 1 | Stamps for litter and mess; bench, bin and lamp natively (`pixel3.py:299-310`) | 3 |
| **Park fence, entrance arch, gates** | Level 1 | Native; fence rails as whole-pixel lines; gate booths with the stall kit | 3, 5 |
| **Ghosts** | Sprite with the alpha wash at 0.85 opacity (`renderer.ts:758`); off the palette | The object's own sprite with a 50 % checker of the safe blue or vermillion (`ditherPattern`, `source-atop`), an outline in that colour, the check or cross icon as a stamp, a hatch for invalid | 2 |
| **Overlays** (hover, selection, drag, land for sale, Calm, Buzz, Light) | Smooth vector lines over pixel art, as in the approved draft board | Tile outlines from 4 cached edge sprites with ink and white dashes on 2:1 stairs (the draft's drop marker look); tints as dither fills aligned to the art grid; high contrast doubles the dash width | 2 |
| **Night lighting** | Today's smooth multiply (`lighting/pass.ts:159-162`): correct, but colours leave the palette | Stage 9: the light canvas is aligned to the art grid and drawn without smoothing; pools are pre-built in 3 bands with dithered borders (`pixel3.py:188-197`); every art pixel then has one of 4 light levels. Bulbs become 1 to 3 art-pixel squares at positions that the native art exports | 9 |
| **Shows** | Gradient beams and soft particles over the night pass | Beams as 3 nested hard-edged bands, particles as art-pixel squares on the grid, same ticks and same reduced-motion forms (`src/render/shows/fx.ts`) | 9 |
| **Weather** | Alpha tint and thin smooth rain lines | Tint as a dither fill; rain as short whole-pixel streaks on the art grid | 9 |
| **Card pictures** (`drawPreview`, `renderer.ts:1157-1198`; `drawTrackPreview`) | Old vector picture, unchanged | The object's real sprite on a patch of textured grass, shown at the home scale (2 CSS pixels per art pixel, a whole number of device pixels) and cropped to the box like the draft cards; `src/ui/decks/card.ts:82-117` sizes its canvas in whole art pixels | 2 |
| **Mascots** | Old vector portraits | Frost 11 × 14 and Spark 13 × 13 body stamps from the draft (`pixel3.py:263-264`) for the map and the bottom mascots; larger head stamps with a happy and a sad face for portraits; `mascotCanvas` (`src/ui/scenario/mascotArt.ts:109-134`) picks a whole number of device pixels per art pixel and sets its CSS size from that | 3 |

Shadows: the draft darkens ground pixels under objects and snaps them to the palette (`pixel3.py:179-184`). The
game cannot rewrite the ground per frame. Native art bakes a dithered contact shadow in a dark ground tone into
its own sprite, inside its bounds. Shadows that fall across neighbour tiles are not possible with depth-sorted
sprites and are left out.

---

## 5. Rules and tests

### 5.1 No image files

Nothing is added as an image. Art is TypeScript code and rows of letters in the bundle. The release check
(`scripts/check-release.ts:36-38, 46`) is not touched.

### 5.2 The 400 KB limit

The last figure in the maps is 308.8 KB gzipped, from another agent's build; it needs a clean measurement first.

| Item | Estimate, gzipped |
|---|---|
| `pixel/grid.ts`, `style.ts`, the setting and its strings | + 1.0 KB |
| Ramps and the snap table code in `palette.ts` | + 1.0 KB |
| `pixel/pass.ts` | + 1.0 KB |
| `pixel/surface.ts` (kit) | + 3.0 KB |
| `pixel/ground.ts` (while the old tile painter also ships) | + 3.0 KB |
| Stage 2 rules in the shared helpers, dither, overlay sprites, card pictures | + 2.5 KB |
| Stamps: about 100 small sprites as letter rows (another proposal's measurement in the same folder found 0.1 to 0.3 KB gzipped per sprite of tree or stall size) | + 4 KB |
| Native families replacing vector families | about ± 0 (the draft needed 9 to 29 dense lines per object, today's functions are of similar size) |
| Old tile painter, exact-scale chunk code, classic branch removed at stage 3 | − 2 KB |
| **End state** | **about + 14 KB; I plan for + 25 KB at worst (333 KB of 400)** |

### 5.3 Determinism

- Level 3 art is whole-number work on typed arrays: the same pixels in every browser and in Node. The noise uses
  `Math.imul` hashes of position and seed, never `Math.random` and never `GameState.rng`.
- Level 1 and 2 sprites depend on the browser's own anti-aliasing before the vote. The same inputs give the same
  pixels in one browser; edge pixels can differ by one pixel between browsers. Today's art has the same property.
  The rule gets stronger with every family that goes native.
- The pixel kit runs in Node without a canvas, so unit tests can at last check real pixels: palette only, inside
  the bounds, outline closed, 4 rotations differ, frames differ, and a stored hash per hero sprite. A hash is a
  number in a test file, not an image.

### 5.4 Performance

Measured in Node on this machine (typed arrays only; a phone at 4 × CPU throttle will be about 4 to 6 times
slower):

| Work | Result |
|---|---|
| Pass, guest (48 × 68 samples in) | 0.02 ms |
| Pass, stall (152 × 192 in) | 0.15 ms |
| Pass, 3 × 3 ride (400 × 332 in, 100 × 83 art pixels out) | 0.76 ms |
| Pass, 4 × 4 ride (528 × 416 in) | 1.24 ms |
| Ground chunk, 8 × 8 tiles, 65,000 samples, noise not yet optimised | 2.6 ms |

Estimates built on that:

- **Level 1 or 2 sprite build** = today's bucket-2 vector paint + a read-back from a software canvas + the pass.
  For a 3 × 3 ride on the throttled phone: about 3 to 5 ms for the pass. Ride frames are built without a limit
  today (`src/render/sprites/bank.ts:97-111`), so stage 1 adds one: at most 2 filtered ride builds per frame; a
  ride that misses keeps the sprite of its last frame (`rideSprites`, `renderer.ts:290`) for one frame.
- **Level 3 sprite build**: no vector paint and no read-back. Guest about 0.05 ms, tree about 0.1 ms, a ride
  about 0.3 to 0.6 ms on a desktop (estimates, not measured).
- **Chunk build**: target 1.5 ms on a desktop and 6 ms on the throttled phone after the low noise octave is taken
  from tile corners. That fits the existing first-build budget of 6 ms per frame with placeholders
  (`terrain.ts:407, 625-635`).
- **Memory**: every sprite is stored once at art resolution: a quarter of bucket 1 and a sixteenth of bucket 2.
  A chunk is 171 KB instead of 2.2 MB at bucket 2. A 3 × 3 ride frame is 33 KB instead of about 500 KB. The phone
  used 57.5 of 64 MB (`docs/adr/0001-renderer.md`, from the map); I expect 8 to 15 MB.
- **Frame**: the same number of `drawImage` calls, the same or fewer canvas pixels, nearest sampling instead of
  filtered scaling (the code notes that a filtered draw costs about 5 times a 1:1 draw on a software canvas,
  `terrain.ts:415-418`). I expect the frame p95 to stay or fall. This must be measured with
  `tests/e2e/perf-build3.spec.ts` and `tests/e2e/perf.spec.ts` in the prototype, before stage 1 is built.

### 5.5 The art unit tests that record fills

- Stages 1 and 2 keep every art function, and the default style in tests is classic until stage 3. The recorder
  tests (`tests/unit/render/content/art.test.ts:59-82`, `phase6Art.test.ts`, `tests/unit/scenery/art.test.ts`,
  `tests/unit/render/track/slices.test.ts`) pass untouched.
- A native family still answers through its old entry point, and `emit` issues `fillRect` runs with no transform.
  The existing checks hold: more than 10 fills, 0 transforms, all points inside the bounds, the same log for the
  same input, a different log for another angle or rotation.
- New tests are added per native family on the real pixels (5.3).

### 5.6 Colour-blind rules

- The 4 safe colours are fixed signal slots in the palette. No art uses them and no theme recolours them.
- A new test simulates the three common colour-vision types on the palette and requires a set distance between
  the signal pair, between the Thrill ramp (orange) and the Chill ramps (teal, blue), and between ink and the
  light tones. The draft's warm palette was never checked (critic, open questions); a failing pair is fixed in the
  ramp before any art depends on it.
- Colour is never the only signal: ghosts keep check and cross and the invalid hatch; the ring keeps two shapes;
  high contrast doubles dash widths.
- None of the 59 draft colours is among the 16 banned literals of
  `tests/unit/render/safeColours.test.ts:26-43` (I compared the lists).

### 5.7 Tests that must change, and why

| Test | Why | When |
|---|---|---|
| `tests/unit/ui/controller.test.ts:342-359`, `tests/unit/ui/camera.test.ts:51` | One wheel notch is no longer × 1.15 in pixel style. New cases for levels; the old case goes with classic | 1, 3 |
| `tests/unit/perf/quality.test.ts:17-25` | Plans gain `stretch`; pixel plans use device ratio ÷ k | 1 |
| `tests/unit/render/renderer-rotation.test.ts:164-190`, `staticLayer.test.ts:229-265` | Canvas size is device size ÷ k, not CSS size × capped ratio | 1 |
| `tests/unit/render/staticLayer.test.ts:122` | It expects a chunk image wider than 300 px; at art resolution a chunk is 260 | 3 |
| `tests/unit/render/terrain.test.ts:125-164` | Exact-scale chunk images do not exist in pixel style; the test goes with classic | 3 |
| `tests/unit/render/guestItems.test.ts:39-72` | Guest bounds grow; item colours become palette tones | 3 |
| `tests/unit/a11y/palette.test.ts:59-78` | It counts `ellipse` calls of radius 6.2; the ring becomes pixels. New check: full ring closed, Thrill ring has gaps | 3 |
| `tests/unit/paths/layer.test.ts:84-93` | The deck is no longer 4 `rect` posts and 3 fills | 5 |
| `tests/unit/lighting/layer.test.ts:153-258` | The light canvas divisor follows the art scale; `multiply` and `lighter` stay | 9 |
| `tests/e2e/paths.spec.ts:106-110` | The pinned deck colour `#dcc79c` becomes a path tone | 5 |
| `tests/e2e/afterDark.spec.ts:108-125` | Re-check the 80 % brightness margin with banded light | 9 |
| `tests/e2e/screenshot.spec.ts:102`, `overview-build3.spec.ts:177`, `content.spec.ts:208`, `scenery.spec.ts:246`, `track.spec.ts:319`, `afterDark.spec.ts:271` | Owner pictures at zoom 0.9, 0.82, 1.35, 1.25 would show uneven pixels; set them to a level. Not gates | 1 |
| `src/ui/scenario/tutorialUi.ts:21, 135` and its test | The tutorial wants a zoom change of 0.25; on a ratio-3 desktop one step is 0.17. Change the check to "one level" | 1 |

Pass untouched: `camera.test.ts` (range, `zoomAt`, buckets), `spriteCache.test.ts`, `depth.test.ts`,
`iso.test.ts`, `view.test.ts`, `rotation.test.ts`, `safeColours.test.ts`, `tests/e2e/boot.spec.ts` (the draft
grass `#d6c85a` has green 200, above the 120 it wants).

---

## 6. Stages

Each stage ships. Sizes: small is under a week of one worker, medium one to two weeks, large more.

| # | Stage | What the player sees after it | Files it touches | Size |
|---|---|---|---|---|
| 1 | **The frame** | With "Art style: Pixel" switched on in Settings: stepped zoom, hard pixels, draft palette, ink outlines on every object, textured grass, slab paths, opaque water. Default stays Classic | New: `src/render/pixel/{style,grid,pass,surface,ground}.ts`. Changed: `canvas.ts`, `renderer.ts`, `palette.ts`, `terrain.ts`, `src/perf/quality.ts`, `src/input/controller.ts`, `src/input/camera.ts`, `src/settings/{types,schema}.ts` (version 3 with a migration, `schema.ts:13`), `src/ui/settings/model.ts`, `src/ui/perf/index.ts`, `src/ui/scenario/tutorialUi.ts`, `src/styles/main.css`, strings. About 10 test files | large |
| 2 | **Draft rules in the shared helpers** | Lines are clean pixel lines, round things have a lit and a dark side, boxes have a highlight, see-through parts are dithered; people and trains sit on the grid; ghosts and tile outlines are pixel dashes; card pictures show the pixel sprite. Owner review; the default becomes Pixel | `sprites/shapes.ts`, `sprites/content/kit.ts`, `scenery/art/kit.ts`, `track/paint.ts` (3 helpers), `track/layer.ts`, `track/preview.ts`, `management/layer.ts`, `scenery/layer.ts`, `shows/layer.ts`, `a11y/layer.ts`, `fields/overlay.ts`, `terrainTools/layer.ts`, `renderer.ts`, new `pixel/dither.ts`, `src/ui/decks/card.ts` | medium |
| 3 | **People and the small things on paths** | Draft guests with walk frames, staff, Frost, Spark and Boo, benches, bins, lamps, litter, fence and entrance; pixel mascots in the interface. Classic style and the switch are removed | `sprites/props.ts`, `sprites/staff.ts`, `sprites/litter.ts`, `sprites/bank.ts`, new `pixel/stamps/{people,mascots,props}.ts`, `src/ui/scenario/mascotArt.ts`, `src/ui/mascots.ts`, `renderer.ts` (margins), `terrain.ts` (old painter out) | medium |
| 4 | **Green things and water** | Draft trees, bushes, flower beds, hedges, rocks and fountains for the two starting themes; water twinkles; cliffs and the 5 terrain types tuned | `scenery/art/{kit,base,fair,index}.ts`, `scenery/sprites.ts`, `pixel/ground.ts`, a small ground layer for the twinkle | medium |
| 5 | **Stalls, gates and decks** | 14 stalls with striped awnings, icons and designed backs; gate booths; elevated paths as pixel decks | `sprites/stalls.ts`, `sprites/content/stalls.ts`, `track/paint.ts` (gate booth), `elevated/layer.ts`, new `pixel/stamps/icons.ts` | medium |
| 6 | **Track and trains** | Stations with striped roofs, channels with pixel water, boats, lead cars; rails and supports already clean from stage 2 | `track/paint.ts`, `track/layer.ts`, `track/preview.ts` | large |
| 7 | **Hero rides by hand** | Carousel, big wheel, drop tower, swing tower, pendulum ship, then the other 13 flat rides, each with its turning frames | `sprites/rides.ts`, `sprites/content/{gentleRides,thrillRides,phase6Rides,index}.ts`, new `pixel/stamps/rides.ts`, `lighting/pass.ts` (bulb positions from the art) | large |
| 8 | **The other scenery themes and the show sites** | Frost Peaks, Volcano Ridge, Spooky Hollow, Jungle Lagoon, Starport, the 2 show sites | `scenery/art/{frost,volcano,spooky,jungle,starport}.ts`, `shows/art.ts` | large (60 items, light work each) |
| 9 | **Night, weather and shows in pixels** | Banded light pools with dithered borders, pixel bulbs, rain streaks on the grid, stepped beams, pixel fireworks | `lighting/{pass,sprites,overlay}.ts`, `shows/fx.ts`, `management/layer.ts` | medium |
| 10 | **Close-out** | No visible change | Remove helpers nothing calls; fresh bundle and performance figures; new owner screenshots; the renderer decision record and the spec lines on art direction and guest size | small |

Order inside the stages follows screen share: ground (most of every frame) in 1; people (the most numerous and
the only things always moving) in 3; trees (the most numerous objects) in 4; then buildings by count; then the
few large rides. Stages 4 to 8 are independent of each other after stage 3 and can run in parallel.

---

## 7. Quality risk

Where this approach could still look worse than the drafts, and what I would do about it.

1. **Stages 1 and 2 are a filter on objects, and the owner has already judged a filter.** My sheet shows it
   fairly: rows 2 and 3 are much better than row 1 and visibly simpler than row 4. If the project stops after
   stage 2, the game looks better than today and weaker than the drafts. Remedy: the two-day prototype (section 9)
   puts exactly this picture in front of the owner before any stage is built, with native people and trees in the
   same frame so the destination is visible too.
2. **Mixed levels on one screen during stages 3 to 8.** Native trees with specks stand next to rides from the
   pass. Both share palette, outline and grid, so they do not clash, but the rides look plainer. Remedy: order by
   screen share, heroes pulled forward if the owner minds; nothing else.
3. **Thin structure at level 1.** Spokes, chains, poles and rails thinner than one art pixel (40 of 85 ride lines,
   from the map) break into dots under the vote. Stage 2 fixes lines at the helper level. Until then the wheel and
   the coasters are the weakest objects on screen.
4. **Turning parts shimmer.** A ride frame is drawn fresh for each of 32 angles. On a pixel grid, edges of turning
   parts flicker by one pixel from frame to frame in a way hand animation would not. Remedy in stage 7: turning
   parts are placed at whole art pixels, seats and riders are stamps that only move, and rides whose frames look
   busy use 16 angles (the frame code already has a coarse form, `src/render/anim.ts:71-75`).
5. **Rides stay smaller than in the drafts.** The draft wheel is 4.7 tiles wide; the game's footprint allows 2.4
   on 3 × 3 tiles, and footprints are game rules under `src/sim` and `src/data`. Remedy: more height (heights are
   art tables, `src/render/sprites/rides.ts:32-37`), fewer and larger gondolas. The wheel will still not be the
   draft's wheel. This is an owner decision (section 8).
6. **Back views.** The draft has one view. Two of four rotations show the back of a stall, and today's back views
   are near-empty (from the map). Sharper art makes this easier to see. Remedy: every native building gets a
   designed back (door, crates, a vent), counted in stages 5 and 7.
7. **Art the draft never showed.** Slopes, cliffs, the map edge, four terrain types, queue paths, elevated decks,
   15 of 18 rides, 13 of 14 stalls, about 80 scenery items, night for the orange theme. All of it is new design in
   the draft's manner, not a port. Remedy: one reference sheet per stage for the owner before the stage is built
   in full.
8. **Paths are narrower than in the drafts.** The draft paves the whole tile; the game keeps a grass margin, and
   queue ropes and bench positions are tuned to it (`terrain.ts:165, 210-235`). Stage 1 keeps the margin at 1/8
   tile. Remedy if the owner wants the wide look: margin 1/16 and re-tuned item positions in stage 3.
9. **Night leaves the palette until stage 9.** A smooth multiply over pixel art gives hundreds of shades. It is
   correct and readable but not the concept night.
10. **Coarse zoom on ratio-1 monitors and soft far overview.** Four crisp sizes; the overview is smoothed. Some
    players will miss fine zoom. There is no remedy inside a whole-number rule.
11. **Crowds.** Every guest carries its own outline. In a queue with 4 art pixels between guests, a 7-pixel
    sprite overlaps its neighbour by 3. The draft crowd at the fountain shows the same and reads well, but the
    game has 2,000 guests, not 86. Remedy if it turns to mush: guests inside queues use a stamp without the side
    outline.
12. **Level 1 and 2 sprites can differ by an edge pixel between browsers.** Not a visible problem; it matters only
    for anyone who compares screenshots across browsers.
13. **Seams between joined pieces.** Hedge and wall pieces are one sprite per tile edge; each gets its own ink at
    both ends. Remedy: edge items leave their two ends open (no ink on the columns that touch the next piece).

---

## 8. Decisions for the owner

1. **Stepped zoom.** May zoom move in whole steps (4 crisp sizes and a soft overview on a standard monitor, 8 on a
   retina screen or a modern phone)? Everything in this proposal rests on a yes.
2. **When pixel becomes the only style.** I propose: after the review at the end of stage 2. Until then a switch in
   Settings; after that the old art is deleted family by family.
3. **Ride sizes.** Keep the footprints (rides smaller against the guests than in the drafts), or plan a later
   change of game rules to give hero rides more ground? The second is outside this project.
4. **Path width.** Keep the grass margin beside paths, or pave the whole tile as in the drafts?
5. **Night.** Banded, dithered light in stage 9, or keep today's smooth darkness for good and save the stage?
6. **Interface slots.** May mascot portraits and card pictures change their box by a few pixels per screen so that
   their art pixels are whole? The approved board itself shows the small mascots at uneven scales (3.27 and 3.38).

---

## 9. A two-day prototype

On a branch that is never merged, behind the address flag `?art=pixel`.

**Day 1: the frame without the ground.**

- `grid.ts` in a small form (k = 1 only), levels on wheel and keys, `scale = n / 2`, offsets rounded, bucket fixed
  to 0.5, smoothing off at `renderer.ts:1071` and `1018`, exact-scale chunks off.
- The 13 ramps and the snap table in `palette.ts`.
- The pass in `buildSprite` with the scratch canvas, the vote, the snap and the solid-part outline.

**Day 2: the ground and two native families.**

- `PixelSurface` with `px`, `hline`, `poly`, `ellipse`, `stamp`, `flush`, `toImageData`.
- `paintGroundChunk` for grass on all slope shapes, slab paths with joins, opaque water. Cliffs flat in two tones.
- The draft guest stamp (3 poses, colour maps) and the round tree and pine for the 2 or 3 tree items of the Base
  Set, so that level 3 stands in the same picture as level 1.

**What it produces.**

1. One picture, 1280 × 800 at device scale 1 and zoom 1, of the park that `tests/e2e/screenshot.spec.ts` builds:
   pixel ground, outlined rides and stalls from the pass, native guests and trees. Beside it the same view today
   and the approved draft, as a three-part strip.
2. The same view on the phone profile (Pixel 7, ratio 2.625, k = 2) to judge the stretch.
3. Numbers from `TC_PERF=1` runs of `tests/e2e/perf-build3.spec.ts`: frame p95 on desktop and on the throttled
   phone, sprite memory, and the time of 100 filtered ride builds.

**It proves the approach if** the owner calls picture 1 a clear step toward the draft and calls the native guests
and trees draft quality; the phone frame p95 stays at or under 40 ms; a filtered 3 × 3 ride build costs no more
than twice today's build.

**It kills the approach if** the owner sees the pass on rides and stalls as the same filter look that was already
turned down, even as a stopgap. Then stages 1 and 2 give no shippable win, and the project should go straight to
native art for everything with a fuller kit, or to one of the other proposals. The grid, the palette, the ground
painter and the kit from these two days are kept in either case.
