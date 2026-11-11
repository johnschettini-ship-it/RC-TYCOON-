# Proposal "authored": pixel art as data

Angle: every static thing is an authored pixel sprite kept as compact data in TypeScript. Animated rides and track keep
code, and that code puts authored parts together on a whole-pixel grid.

Written 2026-11-11 against the working tree at commit `0b20aea`. Repository paths are relative to
`/home/user/RC-TYCOON-`. Nothing in the repository was changed, built or run. Measurements were made in
`/tmp/claude-0/-home-user-RC-TYCOON-/29ee6f8c-df84-5112-ac7e-04cfb7614dae/scratchpad/art/approach/measure/` on the
approved draft renderer (`pixel3.py`) and on the `dist/` folder that another agent had built.

Words used below:

- **World pixel**: the game's unit at zoom 1. A tile is 64 × 32 world pixels (`src/render/iso.ts:8-10`).
- **Art pixel**: one pixel of the drafts = 2 world pixels. A tile is 32 × 16 art pixels.
- **Canvas pixel**: one pixel of the game canvas's backing store.
- **k**: canvas pixels per art pixel. **n**: device pixels per canvas pixel. Both are whole numbers in this proposal.

What I checked in the code before relying on it:

| Claim | Where | Result |
|---|---|---|
| One sprite builder; `Sprite.scale` is free | `src/render/canvas.ts:56-72`, `src/render/spriteCache.ts:14-21`, `src/render/renderer.ts:338-345` | True. A sprite built at scale 0.5 is blitted correctly today. |
| Five copies of the blit math | `renderer.ts:338-363`, `scenery/layer.ts:60-83`, `track/layer.ts:670-677`, `terrain.ts:638-643`, `shows/layer.ts` | True (read four of the five). |
| Smoothing forced on | `renderer.ts:1071`, `:1018`, `lighting/pass.ts:160` | True. |
| Scale and offset set in one place | `renderer.ts:1059-1062` | True. |
| Canvas ratio comes from `renderPlan` | `src/perf/quality.ts:64-77`, `renderer.ts:898-917` | True. |
| The art tests accept `fillRect` runs | `tests/unit/render/content/recorder.ts:69-73` (counts a fill, records both corners), `tests/unit/scenery/art.test.ts:50-90` | True. |
| The size check counts only files that `index.html` names | `scripts/check-release.ts:85-90` | True. A chunk loaded later by `import()` is not counted. |
| No image files may be tracked | `scripts/check-release.ts:36-38, 46` | True. Text and TypeScript data are not matched. |
| Guest bounds are a constant the test imports | `src/render/sprites/props.ts:15`, `tests/unit/render/guestItems.test.ts:8, 43-45` | True. |
| Terrain tracker marks a tile and its 4 neighbours | `src/render/terrainTracker.ts:126-134` | True. |
| Bundle today | `dist/assets/index-*.js` 307,643 bytes gzipped, CSS 9,256 | 309.5 KB of 400 KB on that build (the brief says 306 KB). |

---

## 1. The approach in ten sentences

1. Every picture in the park is made of art pixels on one grid, with the draft's 59 palette colours and the draft's
   dark plum outline, and no picture is ever blurred or stretched by a fraction.
2. Things that do not move (ground details, path tiles, trees, benches, stalls, fences, guests, staff, cars, horses,
   gondolas) are drawn once by an artist agent as a small grid of letters, checked by eye, and stored in the game as
   short text strings.
3. The game turns each string into a tiny image the first time it is needed and keeps it, at the draft's own
   resolution, so one image serves every zoom.
4. Things that move (the 18 flat rides, trains, track) keep their code, but the code now only places authored parts
   and draws a few straight members (spokes, arms, rails) with whole-pixel lines; a part moves by whole art pixels.
5. Four views are covered by authored views, not by turning pixels: one or two variants for things with no front,
   front and back for things with a face, and a mirror that also swaps the lit and the dark side.
6. Zoom moves in steps at which one art pixel is a whole number of screen pixels, on every phone and desktop.
7. All art is composed in plain number arrays before it touches a canvas, so unit tests can check real pixels in
   Node for the first time.
8. The data adds about 45 KB gzipped and the old vector art frees about 32 KB, so the bundle ends near 335 KB of
   400 KB.
9. Sprites are 4 to 16 times smaller in memory than today, and there is one image per sprite, not three.
10. The work ships in ten stages; from the first stage the whole park is on the pixel grid (old art passes through a
    stand-in filter), and each later stage replaces one group with authored art.

---

## 2. How a picture is made

### 2.1 The data format

The artist writes a grid. A tool packs it. The game reads the packed string.

Source file (not shipped), for example `art/pix/scenery/base/oak_round.pix`:

```
id oak_round.a      size 29 30      anchor 14 29      class N      shadow ell 9
pal o=i3 a=l1 b=l2 c=l3 d=l4 t=w2 u=w3
...........ooooooo...........
.........oobbbbbbboo.........
........obbabbbbbbbbo........
(27 more rows)
```

Packed string (shipped), one per sprite, in a generated module such as `src/render/pix/data/sceneryBase.ts`:

```
'oak_round.a': '29 30 14 29 N|i3 l1 l2 l3 l4 w2 w3|.11a7/.9a2c7a2/.8ac2bc8a/…'
```

- Header: width, height, anchor x, anchor y, class. Then the local palette as ramp slot names. Then the rows.
- A row is a list of runs: one letter (`.` is clear, `a`–`Z` is a local palette entry) and an optional count. Clear
  pixels at the end of a row are left out.
- A palette entry may carry `<` or `>` ("lit left face", "dark right face"). A mirrored draw swaps the two, so a
  mirrored box still has its light on the screen left.
- Class: `N` no direction, `A` one axis (mirror gives the other), `D` front or back (mirror gives the other two).

Measured on 21 objects of the approved draft (trees, bush, flower bed, 2 stalls, fountain, carousel, tower, wheel,
lamp, bench, 3 guests, swan, pole, Frost, Spark), rendered one by one with the draft's own code and then encoded
(`measure/measure.py`, `measure/measure2.py`, `measure/roundtrip.py`):

| Encoding | Raw bytes | Gzipped (level 6) | Gzip bytes per opaque art pixel |
|---|---|---|---|
| Plain grid (one letter per pixel) | 28,295 | 4,687 | 0.264 |
| **Run-length rows (chosen)** | **13,432** | **4,825** | **0.271** |
| Run-length rows with "same as the pixel above" | 13,724 | 5,588 | 0.314 |
| 21 PNG-8 files, for comparison | 7,486 | about 7,600 as base64 | 0.43 |

The packed strings decode back to the same pixels for 21 of 21 objects. The sheet
`/tmp/claude-0/-home-user-RC-TYCOON-/29ee6f8c-df84-5112-ac7e-04cfb7614dae/scratchpad/art/approach/measure/contact-sheet.png`
is painted from the decoded strings only. Single objects: tree 200–220 bytes, stall 285, fountain 224, whole carousel
1,099, whole tower 653, whole wheel 1,586, guest about 88 alone and far less in a pack.

Run-length rows gzip as well as the plain grid and are half the size before gzip, so the game ships run-length rows
and the artist edits the plain grid.

### 2.2 New units

All new code is under `src/render/pix/`. None of it is under `src/sim/`.

| File | Exports | Job |
|---|---|---|
| `palette.ts` | `PAL: readonly string[]` (CSS colours by index, index 0 is clear), `slot(name: string): number`, `INK`, `SHADOW_LUT: Uint8Array`, `GHOST_LUT: { valid: Uint8Array; invalid: Uint8Array }`, `DRY_LUT`, `SIGNAL` (the four colour-blind safe colours and the 9 tint steps as fixed slots) | The 13 draft ramps (`pixel3.py:12-26`) as data. Every table that maps a colour to another colour (shadow, ghost, wilted, shirt) is a 64-entry lookup made once. |
| `format.ts` | `interface PixSprite { w: number; h: number; ax: number; ay: number; cls: 'N' \| 'A' \| 'D'; pal: Uint8Array; swap: Uint8Array; px: Uint8Array }`, `decodePix(src: string): PixSprite` (memo by string) | String to pixels. |
| `buf.ts` | `class PixBuf { readonly w: number; readonly h: number; readonly px: Uint8Array }`, `stamp(b: PixBuf, s: PixSprite, x: number, y: number, o?: { mirror?: boolean; remap?: Uint8Array }): void`, `outline(b: PixBuf, ink?: number): void`, `relight(b: PixBuf, mask: Uint8Array, lut: Uint8Array): void` | The work surface: one byte per art pixel, a global palette index. `outline` is the draft's rule (grow the shape by one pixel in 4 directions, `pixel3.py:213-218`). |
| `raster.ts` | `pline`, `prect`, `ppoly`, `pellipse`, `isoBox`, `isoCyl`, `isoCone` (all take a `PixBuf`, whole-number coordinates, palette indices) | The draft's `ibox`, `icyl`, `icone` and plain lines, for members that turn freely. No anti-aliasing exists here. |
| `upload.ts` | `emitRuns(ctx: Ctx, b: PixBuf, left: number, top: number): void`, `pixSprite(b: PixBuf, ax: number, ay: number): Sprite` | `emitRuns` issues one `fillRect` per run in world pixels (2 × art pixels), with `fillStyle` from `PAL`. `pixSprite` makes the cached image at scale 0.5: with `putImageData` when the context has `createImageData`, else with `emitRuns`. |
| `blit.ts` | `interface PixView { k: number; offX: number; offY: number; whole: boolean }`, `blitPix(ctx, v: PixView, sp: Sprite, wx: number, wy: number): void`, `blitPixColumn(ctx, v, sp, ax, ay, colL, colR): void` | The one blit: `x = offX + (round(wx / 2) − sp.ox) × k`, size `sp.w × k`. Whole numbers only. |
| `zoom.ts` | `canvasPlan(devW: number, devH: number, dpr: number, maxRatio: number): { n: number; ratio: number; width: number; height: number; cssW: number; cssH: number }`, `zoomStops(ratio: number): number[]`, `nextStop(zoom: number, dir: 1 \| -1, ratio: number): number`, `nearestStop(zoom: number, ratio: number): number` | Section 3. |
| `standIn.ts` | `pixelise(ctx: Ctx, w: number, h: number): void` | Temporary, stages 1–9: hard alpha, nearest palette colour, outline, for old vector sprites drawn at scale 0.5. Does nothing when `getImageData` returns no pixels (unit-test fakes, `tests/unit/render/fakeCanvas.ts:70-71`). |
| `data/*.ts` | generated string packs (`terrain`, `people`, `props`, `stalls`, `sceneryBase` … `sceneryStarport`, `rideParts`, `track`, `shows`, `mascots`) | The art. |
| `recipes/scenery.ts` | `SCENERY_RECIPES: Record<string, SceneryRecipe>`, `composeScenery(def: SceneryDef, o: SceneryArtOpts, out: PixBuf): void` | One table row per item (section 4). |
| `recipes/rides/*.ts`, `recipes/stalls.ts`, `recipes/people.ts`, `recipes/terrain.ts`, `recipes/track.ts` | `composeRide(defId, ex, ey, st: RideArtState, out: PixBuf)`, `composeStall`, `composeGuest`, `composeStaff`, `paintChunkPix(map, chunk, r, env, out: PixBuf)`, `paintSlicePix`, `composeCar` | Code that places parts. |

Tools and sources outside `src/`:

| File | Job |
|---|---|
| `scripts/pix.ts` (Node, no dependency) | `pack` (sources to `data/*.ts`), `lint` (section 2.5), `sheet` (contact sheets as PNG into an untracked folder; the PNG writer is 40 lines on `node:zlib`). |
| `art/pix/**/*.pix` | The grids. Text files, tracked, not in the bundle. |
| `art/gen/*` | Optional throwaway generators that an artist used to rough out a large sprite. Not in the bundle. |

### 2.3 The pipeline for one sprite

A static sprite (a Round Oak):

1. An artist agent writes `art/pix/scenery/base/oak_round.pix` and runs `pix lint` and `pix sheet`.
2. `pix pack` writes the string into `src/render/pix/data/sceneryBase.ts`. A unit test fails if the packed files
   differ from the sources.
3. In play, `ScenerySprites.get` (`src/render/scenery/sprites.ts:70-81`) no longer calls
   `buildSprite(…, bucket, drawSceneryArt)`. It calls `composeScenery(def, o, buf)`: look up the recipe, `decodePix`,
   `stamp` (mirrored or recoloured if the recipe says so), apply `GHOST_LUT` for a ghost. Then `pixSprite(buf, ax, ay)`.
4. The result is an ordinary `Sprite` with `scale: 0.5` under the same cache key. The bucket part of the key is
   always 0 for pixel sprites, so `spriteKey` and its tests stay.

An animated sprite (carousel, angle frame 7, half full):

1. `SpriteBank.ride` (`src/render/sprites/bank.ts:97-111`) calls `composeRide('carousel', ex, ey, st, buf)`.
2. The composer, about 30 lines, does what `pixel3.py:454-482` did: `isoCyl` for the turntable; the back horses
   (authored `horse` sprite, two colour maps, stamped at whole-pixel orbit points with a 0 or 2 pixel bob); the
   centre pole; the front horses; `outline`; then the authored `carousel.roof` sprite and the flag on a second layer;
   `outline` again; rider heads as authored 3 × 3 stamps.
3. `pixSprite` makes the frame. The frame number and the cache are unchanged (`src/render/anim.ts:57-60, 82-88`).

The rule that decides data or code: **a part that only moves is an authored stamp. A member that must turn to any
angle (spoke, arm, ship hull edge, rail) is drawn by `raster.ts` from the geometry the game already has. A stamp is
never rotated; at most the code picks one of a few authored directions.**

Old entry points stay as thin adapters, so the art tests keep running:

```ts
// src/render/sprites/rides.ts:471
export function drawRideArt(ctx: Ctx, defId: string, w: number, d: number, st: RideArtState): void {
  const b = rideArtBounds(defId, w, d, st.rotation);
  emitRuns(ctx, composeRideBuf(defId, w, d, st), b.left, b.top);
}
```

The same pattern serves `drawStallArt` (`stalls.ts:152`), `drawGuestArt` (`props.ts:140`), `drawStaffArt`,
`drawPathItemArt`, `drawFenceArt`, `drawEntranceArt`, `drawSceneryArt` (`scenery/art/index.ts:51-55`), `paintSlice`,
`paintCar` and `paintGateBooth` (`track/paint.ts`).

### 2.4 The pipeline for one frame

Functions that change in `createCanvasRenderer(...).draw` (`src/render/renderer.ts:1046-1147`):

| Line today | Today | After |
|---|---|---|
| `renderer.ts:1059` | `scale = cam.zoom × dpr` | Same value. Also `k = 2 × scale`; `whole = k` is a whole number. |
| `renderer.ts:1061-1062` | `offX`, `offY` are fractions | Rounded to whole canvas pixels. All anchors are on the art grid in world space, so one whole offset keeps ground and objects on the same grid. Panning still moves by single canvas pixels. |
| `renderer.ts:1071`, `:1018` | `imageSmoothingEnabled = true` | `= !whole`. Smoothing is on only while a pinch is between two stops (section 3). |
| `renderer.ts:338-363` | `blit`, `blitColumn` round each edge alone | Call `blitPix`, `blitPixColumn`. The copies in `scenery/layer.ts:60-83`, `shows/layer.ts:113-135`, `track/layer.ts:670-677`, `terrain.ts:638-643` call the same two functions. |
| `renderer.ts:455-462`, `:591-592`; `scenery/layer.ts:126-133` | Ride and 2 × 2 scenery strips stop at the footprint corners | The first and the last strip run to the sprite's edge. `rideArtBounds` (`sprites/rides.ts:53`) gets 8 world pixels on each side. An outline or an overhang is no longer cut. |
| `renderer.ts:898-917` `applyPlan` | canvas size = CSS size × plan ratio | Canvas size and CSS size from `canvasPlan` (section 3). `terrain.allowExact = false` (`:906`). |
| `terrain.ts:542-561` `build` | vector `paintTile` under a scale transform, at 3 bucket scales or an exact scale | `paintChunkPix` into a `PixBuf`, then `pixSprite`. One image per chunk and view. The exact-scale path (`terrain.ts:584-589`) and the stand-in path between buckets (`:604-622`) are not used. |
| `renderer.ts:1157-1198` `drawPreview` | vector art at a free scale `k` | The real sprite at the largest whole scale that covers the box, smoothing off (section 4, cards). |

The order of the frame (sky and terrain, ground decals, objects sorted by depth, weather, night, overlays) does not
change. Depth, view rotation, culling, picking, caches and the draw list are untouched.

### 2.5 How sprites are authored and checked at scale

About 330 sprites and 18 ride composers have to be made. The process is built for AI agents that can look at
pictures.

1. **Brief.** One art-director agent writes, per batch of about 12 sprites, a brief: box size in art pixels (from
   the game's bounds), ramps allowed, class (`N`, `A`, `D`), anchor, shadow, and a crop of the nearest thing in the
   approved draft.
2. **Draw.** An artist agent writes the grids. For sprites over about 24 × 24 it may first write a short generator
   with the same primitives as `raster.ts` (this is how the draft was made), print the grid, and then correct pixels
   by hand. The stored art is the grid, not the generator.
3. **Lint** (`pix lint`, also a unit test): only known ramp slots; at most 16 colours; the outline is closed and
   one pixel wide; no single stray pixels unless marked; the sprite fits its bounds; the anchor is inside; for
   classes `A` and `D` the `<` and `>` marks exist; the lit ramp steps are on the left half; none of the 16 banned
   reds and greens (`tests/unit/render/safeColours.test.ts:26-43`); the gzip size of each pack is under its budget.
4. **Look** (`pix sheet`): each sprite at × 1, × 2 and × 4 on grass, on path and on the night ground, next to a
   guest for scale, next to the draft crop, in all the views the game will ask for. The artist reads the PNG and
   makes at least two rounds.
5. **Critic.** A second agent with vision scores the sheet against a fixed list (reads at × 1; reads at zoom 0.5;
   light from the left; ramp steps used in order; outline weight equal to its neighbours; size right beside a guest;
   no noise) and returns failures with pixel positions.
6. **In the park.** A Playwright script places every item of the batch in a fixed test park and saves
   `docs/screenshots/pix-<batch>.png` at a zoom stop. The owner sees these and the sheets, not grids.

Batches are independent, so stalls, each scenery theme and each ride can be made by parallel agents once stage 1 has
fixed the palette, the format and three reference sprites (guest, oak, stall) as the style anchor.

---

## 3. Zoom, device pixel ratio and the pixel grid

### 3.1 The rule

**One canvas pixel is exactly n × n device pixels. One art pixel is exactly k × k canvas pixels. n and k are whole
numbers.** An art pixel is then `k × n` device pixels on every screen, square and sharp.

- `n` is 1 on desktops. On the phone class it is the smallest whole number with `device ratio / n ≤ 2` (the present
  phone cap, `src/data/tuning/perf.ts:7`). `low` quality and the `auto` step down use `n + 1`.
- Canvas ratio `R = device ratio / n` replaces `plan.pixelRatio` (`src/perf/quality.ts:68-71`).
- The canvas backing size is the device-pixel size of the window divided by `n`, rounded up. The device-pixel size
  comes from `ResizeObserver`'s `devicePixelContentBoxSize` where the browser has it, else from
  `round(CSS size × device ratio)` (`src/main.ts:31-36`; `renderer.resize` gets two optional numbers).
- The canvas CSS size is set in pixels to `backing size × n / device ratio`, and `#game` gets
  `image-rendering: pixelated` (`src/styles/main.css:34`). The browser then maps every canvas pixel to exactly
  `n × n` device pixels. No fractional stretch exists any more.
- `cam.zoom` keeps its meaning (art pixel = 2 × zoom CSS pixels) and its range 0.25–2
  (`src/render/camera.ts:6-7`). A **zoom stop** is a zoom with `k = 2 × zoom × R` whole.

| Device | Device ratio | n | Canvas ratio R | Zoom stops in 0.25–2 | Art pixel in device pixels |
|---|---|---|---|---|---|
| Desktop | 1 | 1 | 1 | 0.5, 1, 1.5, 2 (and the far view 0.25) | 1, 2, 3, 4 |
| Desktop | 1.25 | 1 | 1.25 | 0.4, 0.8, 1.2, 1.6, 2 | 1 … 5 |
| Desktop | 1.5 | 1 | 1.5 | 0.33, 0.67, 1, 1.33, 1.67, 2 | 1 … 6 |
| Desktop, phone | 2 | 1 | 2 | 0.25 to 2 in steps of 0.25 | 1 … 8 |
| Phone (Pixel 7 test profile) | 2.625 | 2 | 1.3125 | 0.38, 0.76, 1.14, 1.52, 1.90 | 2, 4, 6, 8, 10 |
| Phone | 3 | 2 | 1.5 | 0.33 … 2 (6 stops) | 2, 4 … 12 |
| Desktop | 3 | 1 | 3 | 0.33 … 2 (11 stops) | 2 … 12 |
| Phone at `low` or after the `auto` step | 2.625 | 3 | 0.875 | 0.57, 1.14, 1.71 (and the far view 0.29) | 3, 6, 9 |
| Any at `low` | 2 | 2 | 1 | 0.5, 1, 1.5, 2 | 2, 4, 6, 8 |

Cost on the phone profile: the canvas at R = 1.3125 has 43 % of the pixels of today's R = 2 and 1.7 times those of
today's stepped-down R = 1. At `low` it has 77 % of today's R = 1. The picture is equally sharp at every `n`.

### 3.2 How zoom moves

- Wheel notch and the zoom keys (`src/input/controller.ts:127, 152`): go to the next stop that is at least 15 %
  away, keeping the point under the pointer (`zoomAt`, `src/render/camera.ts:31-37`, is called with the factor
  `nextStop / zoom`).
- Pinch (`controller.ts:280`): the zoom follows the fingers. While `k` is not whole, the frame is drawn with
  smoothing on, as today. On release the zoom eases to the nearest stop in about 120 ms and the picture snaps sharp.
- The first frame after boot or resize moves the zoom to the stop nearest to 1 (default zoom,
  `src/game.ts:17`).
- A change of `n` (quality setting, `auto` step) moves the zoom to the nearest stop of the new ratio.
- The tutorial's zoom step asks for a zoom change of 0.25 (`src/ui/scenario/tutorialUi.ts:21, 135`). On a screen
  with many stops one notch is smaller than that, so the check becomes "the zoom moved by one stop".
- The renderer accepts any zoom. A zoom that is not a stop (a test, the screenshot script at zoom 0.9,
  `tests/e2e/screenshot.spec.ts:102`) draws in the smoothed mode. Nothing breaks.
- Far view: where `k = 1/2` is inside the range (R ≤ 1), zoom 0.25 is one more stop. It is an exact 2-to-1
  reduction with smoothing on, so every canvas pixel is the mean of a 2 × 2 art block. Guests are already
  rectangles there (`src/data/tuning/perf.ts:12`).

### 3.3 Positions on the grid

- Ground, rides, stalls, scenery, fences and track slices have anchors that are multiples of 2 world pixels
  (critic, section C.2), so they land on the art grid with no rounding.
- Guests, staff and cars stand at fractions. `blitPix` rounds their world position to the art grid. They move in
  whole art-pixel steps.
- Sprite bounds with odd numbers (guest with an item −13, litter −9 and −7, mess −11;
  `src/render/sprites/props.ts:17`, `litter.ts:12-13`) are made even.

### 3.4 What the player notices

- The park is sharp at every zoom stop on every screen. Nothing shimmers during a pan.
- Zoom clicks between 4 to 11 sizes instead of gliding. A pinch still glides and then settles.
- The farthest and the nearest zoom differ a little between devices (0.25 to 0.4 at the far end, 1.7 to 2 at the
  near end).
- People and trains move in small whole steps, as in classic pixel games.
- On phones at reduced quality the tool outlines and the cost label, which are drawn into the same canvas, get
  coarser by the factor `n`. Stage 9 gives the labels pixel digits.

---

## 4. Coverage

"Sprites" are authored grids. "px" are opaque art pixels, the unit that sets the byte cost (0.27 gzip bytes each,
measured; small sprites cost more per pixel because of their headers).

| Thing | How it gets the draft look | Views and animation | Authored data |
|---|---|---|---|
| **Flat ground** (5 terrain types) | `paintChunkPix` fills each tile top from a tone field: two octaves of value noise in map space plus a 4 × 4 Bayer threshold in screen space, three ramp steps, exactly `pixel3.py:115-119`. Sand, dirt, rock and snow use the same field with their own ramp. Authored detail stamps (tuft, flower, pebble, per type) are scattered by a hash of the map tile. Land outside the park uses the next darker ramp steps, not a multiply. | Painted in view space per view, as today (`terrain.ts:258-265`). Noise turns with the map; the dither stays on the screen. 4 images per chunk, not 16. | 20 stamps, about 300 px |
| **Slopes** (14 shapes) | The same tile content, pushed up per column by the height of the surface (0 to 4 art pixels per step), with gaps of one pixel filled downward. Slopes that face the light use the ramp one step lighter, slopes that face away one step darker. | By view, as today (`terrain.ts:292-294`). | none |
| **Cliffs and the map edge** | Authored strips, 16 px wide, that repeat downward: a lit left face and a dark right face, for earth, rock and ice, with strata lines and an ink line at the top edge. `faceE` and `faceS` (`terrain.ts:120-151`) keep their geometry and fill with the strip. | 2 faces, any height. | 6 strips, about 1,500 px |
| **Water** | Base `a2`, hashed dashes `a1` and `a3`, light near-shore and dark far-shore lines, a `g4` bank band on the grass (`pixel3.py:121-142`). Solid, not see-through. Drawn level on sloped tiles. Still, as in the draft. | By view. | none |
| **Paths, queues, plaza** | The path fills the tile as in the draft. Authored 32 × 16 slab tiles (4 footpath, 2 queue on the teal ramp, 2 plaza) and authored kerb pieces per open side. Queue posts and rope are authored stamps on open sides. Ramps use the slope rule. Guest lanes, queue slots and item positions (`guestPos.ts:14`, `queue.ts:10`, `management/pathItemPos.ts:17-48`) are inside the full tile, so they stay valid. | Join masks as today (`src/render/paths.ts`); kerbs per screen side. | about 5,000 px |
| **Shadows** | Baked into the chunk: every ride, stall and scenery recipe names a shadow shape (ellipse or sheared box); the chunk painter marks it and replaces each marked ground pixel through `SHADOW_LUT` (the draft's `snap(mix(pixel, i2, 0.3))`, `pixel3.py:184`, as a table). Ground only, as in the draft. `TerrainTracker.markTile` (`terrainTracker.ts:126-134`) marks chunks within 4 tiles when `content` changes. Guests carry a 5 × 2 chequered shadow in their sprite. | Shadow falls to the screen right in every view. | none |
| **Elevated paths** | A deck is a cached sprite per kind, ramp direction and open-side mask: the path tile on top, authored side strips, a rail on open sides. Posts are whole-art-pixel rectangles down to the ground. Neighbouring decks join without lines. | Per view. | about 800 px |
| **18 flat rides** | A composer per ride (section 2.3). Authored: horses, gondolas, seats, cups, rockets and small cars in 8 headings (4 authored, 4 mirrored), ghost, flags, signs, roofs, the manor and maze fronts, the gate (front-left, front-right, back). Code: turntables, masts, wheels, arms, hull, rings. Sizes fit the game's footprints. | Same 32 angle frames, 5 swing levels and 5 rider levels (`anim.ts:57-60`). 11 rides have one body, 7 swap an axis in the composer; gates per view. Riders are 3 × 3 heads with a shirt. | about 34,000 px |
| **14 stalls** | Per stall: a service-front sprite and a back sprite, class `A` (the mirror with the tone swap gives the other two views). Striped awnings and the sign icon on a pole as in the draft (`pixel3.py:424-442`). | 4 views from 2 sprites. No animation, as today. | about 20,000 px |
| **Track rides** | `paintSlice` and `paintRun` (`track/paint.ts:236-322`) keep their sample geometry and call `raster.ts`: a rail is a colour line with dark side lines, drawn from shared sample points so neighbouring slices set the same pixels and no outline crosses a tile border. Ties are whole-pixel bars. Supports are authored strips (trestle, steel, flume) repeated to the height. Station platform, gate booth, tunnel mouth and channel walls are authored. The 12 player colours each get a 3-step ramp. | Per view as today. Chain links, ripples and spray become art-pixel rectangles on the grid each frame, stepped by tick. | about 4,000 px |
| **Trains** | An authored car per shape in 4 headings × 3 pitches (level, up, down), mirrored to 8 headings, plus banked left, banked right and upside down. `drawCar` (`track/layer.ts:836-866`) maps its 16 × 24 × 16 pose to the nearest authored pose. One sprite set serves all views, as today (`track/paint.ts:761-762`). Riders are baked in (empty and full). | Position on the art grid each frame. | about 5,000 px |
| **Scenery, 85 items** | Section 4.1. | 4 views from classes `N`, `A`, `D`. | about 70,000 px |
| **Guests** | The draft guest, 7 × 12: front and back, each in stand, two steps and sit; balloon and umbrella as extra stamps. Shirt (12 slots, the draft's `SHIRTS`, `pixel3.py:283`, or the 9 tint steps), skin, hair and trousers by palette remap. `GUEST_BOUNDS.top` goes from −20 to −24 (`props.ts:15`); the cull margins and arrow heights follow (`renderer.ts:563-564, 821-823`). | 4 facings = 2 sprites and their mirrors. Walk frames as today (`renderer.ts:548`). | 12 sprites, about 900 px |
| **Temperament ring** | Chill: a closed 9 × 5 ring. Thrill: the same ring with every third pixel missing. The shape differs, not only the colour. | — | 2 sprites |
| **Staff and costumes** | 4 staff types and 3 mascot costumes: front and back, 2 steps, 1 work pose. Frost, Spark and Boo reuse the mascot designs. | As guests. | about 50 sprites, 6,000 px |
| **Litter, mess, path items** | Bench (2 axes by mirror, broken), bin (4 fill levels, broken), lamp (broken), 4 litter, 2 mess. A path item on a deck is drawn at deck height (`management/layer.ts:215, 222` reads `pathItemLevel`). | — | about 20 sprites, 1,500 px |
| **Park fence and entrance** | Fence: one sprite per axis, drawn so that it tiles along the edge; the outline is open at both ends, so a run has no seams. Arch: back part and front pillar per axis. | Parallel edges share a sprite. | about 2,500 px |
| **Ghosts** | The same buffer through `GHOST_LUT`: three blue or three vermillion steps by brightness, ink kept, every second pixel clear in a chequer instead of opacity 0.85. The check, the cross and the hatch stay (`sprites/props.ts:328`, `a11y/layer.ts`). | — | none |
| **Overlays** (hover, selection, drag line, tool marks) | Stay vector, as the approved draft keeps its drop marker smooth (`CANVAS/project/DraftDesktop.dc.html:20-30`). Corner points are rounded to the art grid and line width is one art pixel. Cost labels get authored 3 × 5 digits. | — | digits, 150 px |
| **Night** | Stage 9a keeps today's multiply pass (`lighting/pass.ts:159-162`): the pixel park darkens smoothly, every pixel edge stays sharp. Stage 9b (owner decision 4): the light canvas gets one cell per art pixel, aligned to the art grid, drawn with smoothing off; pools are pre-made discs with 4 light levels and Bayer edges (`pixel3.py:188-197`); lit windows and bulbs are authored "lit" sprites drawn after the multiply in place of the gradient bulbs (`pass.ts:285-308`). | — | lit sprites, about 3,000 px |
| **Shows** | 2 show sites as authored sprites. Firework particles become art-pixel squares on the grid. Beams stay smooth light in 9a and get 3 banded steps in 9b. | Reduced motion as today (`shows/fx.ts:219-225`). | about 3,000 px |
| **Weather** | Rain as art-pixel dashes on the grid. The full-screen tints stay (they change all colours equally and keep the edges). | — | none |
| **Card pictures** | `drawPreview(ctx, defId, w, h)` keeps its signature. It composes the real sprite (rides at angle 0, with a patch of ground from the tile kit), picks the largest whole scale at which the picture covers the box, centres it on a focus point from the recipe, and draws with smoothing off. This is the cropped close view of the draft cards. `drawTrackPreview` composes a fixed small layout (station, curve, hill, train) with the track painters. `drawSceneryPreview` and the show picker do the same. The card canvases get `image-rendering: pixelated` and a CSS size that equals backing size ÷ device ratio (`src/ui/decks/card.ts:89-117`). | — | none |
| **Mascots** | Frost (11 × 14), Spark (13 × 13) and Boo from the draft (`pixel3.py:263-265`) plus mood stamps (eyes, mouth, tear) and a larger 22 × 28 portrait each. `mascotCanvas` (`src/ui/scenario/mascotArt.ts:109-134`) draws them at a whole scale: × 3 in the mood bar, × 6 at the bottom, as in the draft board. The statues and costumes use the same sprites. | 3 moods. | about 2,500 px |

### 4.1 What happens to the 111 scenery functions

Today: 85 item functions, 12 theme helpers, 13 kit primitives and 1 fallback, 1,579 lines
(`src/render/scenery/art/*`). After:

- **85 item functions become 85 rows of one table** and about 150 sprites. `SCENERY_ART` keeps its 85 keys and its
  type; each entry is made from the table: `(ctx, o) => emitRuns(ctx, composeSceneryBuf(id, o), …)`.
- **12 theme helpers are deleted.** Their content (pennant, snow pine, mascot figures, pumpkin, frond) is now inside
  sprites.
- **13 kit primitives are deleted.** `shadow` becomes the baked ground shadow; `glow` becomes a "lit" sprite;
  `cluster`, `canopy`, `rock`, `flowers` are drawn pixels; `edgeBox`, `post`, `pedestal` are in sprites. The 12
  helpers that do not draw (`faceVec`, `archPosts`, `edgeEnds` …) stay where recipes need them.
- **The fallback** is one grey authored block.

A recipe row:

```ts
oak_round:   { cls: 'N', views: ['oak_round.a', 'oak_round.b'], shadow: ['ell', 9] },
lamp_globe:  { cls: 'D', front: 'lamp_globe.f', back: 'lamp_globe.b', lit: 'lamp_globe.lit' },
fence_wood:  { cls: 'A', edge: 'fence_wood' },
ticket_arch: { cls: 'A', back: 'ticket_arch.back', front: 'ticket_arch.post' },
bed_tulip:   { cls: 'A', views: ['bed_tulip'], wilt: DRY_LUT },
tent_red:    { cls: 'D', body: 'tent.body', door: 'tent.door', remap: RED_STRIPES, shadow: ['box', 2, 2, 20] },
```

How the four views are covered:

| Kind of item | Count | Authored | The 4 views |
|---|---|---|---|
| No direction (trees, shrubs, rocks, beds, fountains) | about 31 | 2 variants each | View parity picks variant a or b. A tree looks the same from every side, and the two variants also break up rows of equal trees. |
| A front and a back (statues, lamp, snowman, owl, parrot, lanterns) | 14 | front and back | The mirror with the tone swap gives the other two. |
| One axis (table, rack, well, bunting, tulip rows, columns, rope bridge) | 7 | 1 | Mirror with tone swap. |
| Arches over paths | 6 | back half with beam, front post | Mirror with tone swap. Whole = back then front, so the two halves still add up to the whole. |
| Edge items (hedge, fences, walls) | 9 | 1 per item | Parallel edges share the sprite at another offset; the other axis is the mirror. Sprites tile along the edge. |
| 2 × 2 items | 11 | body plus small overlays (door, dish, fall) | Overlays per view. |
| Wilted gardens | 8 | none | `DRY_LUT` maps leaf and flower ramps to dry ramps. |

The scenery layer, placement, keys, ghost store and catalog are not touched except for the blit and the strip
edges.

---

## 5. Rules and tests

### 5.1 No image files

All art is text: `.pix` sources and generated `.ts` string packs. `scripts/check-release.ts:36-38` matches image
extensions only. The contact sheets are written to an untracked folder; owner pictures go to `docs/screenshots/`,
which is allowed. The master spec says "All graphics are drawn in code"
(`docs/superpowers/specs/2026-11-09-thrills-and-chills-design.md:39`); authored pixel data in the source needs one
changed sentence there (owner decision 2).

### 5.2 The 400 KB limit

Data, from the inventory of section 4 at the measured 0.27 gzip bytes per opaque art pixel (0.5 for sprites under
100 px):

| Pack | Opaque art px | Gzip estimate |
|---|---|---|
| Terrain kit, decks | 9,000 | 2.5 KB |
| Path items, litter, fence, arch | 4,000 | 1.4 KB |
| Guests, staff, costumes | 7,000 | 2.5 KB |
| Stalls | 20,000 | 5 KB |
| Scenery, 7 themes | 70,000 | 19 KB |
| Flat ride parts | 34,000 | 9 KB |
| Track and trains | 9,000 | 3 KB |
| Show sites, lit sprites | 6,000 | 1.6 KB |
| Mascots, icons, digits | 3,000 | 0.9 KB |
| **Total** | **about 162,000** | **about 45 KB** |

Code. The built bundle is 0.635 times the gzip size of the comment-stripped source (307,643 against 484,780 bytes,
measured). By that factor:

| Change | Lines | Gzip estimate |
|---|---|---|
| New: `pix` core (palette, format, buffer, raster, upload, blit, zoom) | about 900 | +6 KB |
| New: composers and recipe tables (18 rides, stalls, people, scenery table, terrain, track) | about 1,300 | +8 KB |
| Removed: rides 8.6, stalls 3.8, guest, staff and small props 4.2, shape kits 2.7, scenery 10.9, show art 1.3, mascots 0.9 | about 5,000 | −32 KB |
| Rewritten in place, about the same size: `paintTile` and helpers, `track/paint.ts` | about 950 | 0 |

Result: 306 + 45 + 14 − 32 = **about 333 KB** (337 KB if today's figure is the 309.5 KB I measured). If the data
turns out 50 % larger: about 356 KB. Worst moment during the work, if no old code were deleted until the end and the
stand-in were still in: about 367 KB. Each stage deletes the art it replaces, so the real peak is lower.

Two guards: a unit test fails when a pack's gzip size passes its budget; and, held in reserve, the five research
themes' scenery packs (about 12 KB) can be loaded after start with `import()`, which the size check does not count
(`scripts/check-release.ts:85-90`) and the service worker still caches (owner decision 6).

### 5.3 Determinism

Composition is whole-number work on byte arrays: no clock, no `Math.random`, no fractions in positions. The noise is
a 32-bit hash with `Math.imul`. `fillRect` on whole pixels with an opaque colour and `putImageData` with alpha 255
are exact in every browser. The same inputs give the same bytes, and a unit test compares hashes of composed buffers
(rule R8, `…design.md:74`). Drawing takes nothing from `GameState.rng`.

### 5.4 Performance budgets

Estimates, to be replaced by measurements in the prototype (section 9). No test or build was run.

| Step | Desktop | Phone profile (4× throttle) | Today, for scale |
|---|---|---|---|
| Decode and upload a small sprite (under 600 px) | 0.05–0.1 ms, mostly making the canvas | 0.3–0.5 ms | a vector build at 1 to 3 scales |
| Compose and upload a ride frame (about 8,000 px buffer, 12 stamps, outline) | 0.2–0.4 ms | 1–2 ms | whole-ride vector frame at bucket 2, 0.5–0.9 MB each |
| Build a terrain chunk (260 × 140 art px, tone field, tiles, shadows) | 1–2 ms | 6–12 ms | first builds have a 6 ms frame budget, at least one per frame (`terrain.ts:625-635`) |

- Build limits stay: guests 48, slices 20, cars 32 per frame, the chunk budget.
- Builds per sprite fall from 3 or 4 (buckets, exact scale) to 1. A zoom change builds nothing.
- Memory, 4 bytes per pixel: a carousel frame is 33 KB (0.50 MB at bucket 2 today); all 160 frames of the pendulum
  ship are 9.5 MB (about 140 MB today, `rides-stalls.md`); a chunk image is 146 KB (2.15 MB at bucket 2). The phone
  run used 57.5 MB of its 64 MB (`docs/adr/0001-renderer.md`); the same scene should need under 15 MB.
- Blits copy from sources 4 to 16 times smaller, without filtering. The ADR found that a blit costs by source size
  and that a filtered blit costs about 5 times a plain one (`terrain.ts:415-418`), so frame time should fall. The
  risk is the chunk build on the phone; the remedy is a noise table per chunk (one hash per tile corner, not per
  pixel).
- The static layer (`renderer.ts:989-1035`) works unchanged and is cheaper to compose.
- Per-frame cost added: none in the frame loop. No pixels are read back in a frame.

### 5.5 The art unit tests that record fills

They keep running against the adapters of section 2.3, which issue `fillRect` runs and no transform:

- `tests/unit/render/content/art.test.ts`, `phase6Art.test.ts`: more than 10 fills per ride frame and more than 8
  per stall (a sprite has hundreds of runs); 0 transforms; points inside the bounds; every ride and stall differs;
  another angle or rider level differs; at least 2 looks over 4 rotations (gates and mirrored parts differ);
  the registries `CONTENT_RIDE_ART` and `CONTENT_STALL_ART` keep one `draw` per id.
- `tests/unit/scenery/art.test.ts`: 85 keys; more than 2 fills; bounds; no transforms; the 4 facings do not all
  draw the same (variant a or b, or the mirror); wilted differs (other `fillStyle` values); arch halves add up.
- `tests/unit/render/track/slices.test.ts`, `phase6Render.test.ts`, `guestItems.test.ts`: points and bounds through
  `fillRect`.

These tests get weaker in meaning (any sprite passes "more than 2 fills"). The real protection moves to new tests
that see pixels in Node, which was not possible before:

| New test | Checks |
|---|---|
| `tests/unit/render/pix/format.test.ts` | pack and decode round trip; the packed modules equal the sources |
| `tests/unit/render/pix/lint.test.ts` | the lint rules of section 2.5 over every sprite |
| `tests/unit/render/pix/golden.test.ts` | a hash of the composed buffer per sprite id, view and a sample of ride frames |
| `tests/unit/render/pix/blit.test.ts`, `zoom.test.ts` | whole-number destinations; stops per ratio; `n` rule |
| `tests/unit/render/pix/budget.test.ts` | gzip size per pack |
| `tests/unit/a11y/pixPalette.test.ts` | section 5.6 |
| `tests/e2e/pixGrid.spec.ts` | at a zoom stop, every `k × k` block of the canvas has one colour (the check that the approved draft passes at 100 %) |

Tests that must change, and why:

| Test | Why |
|---|---|
| `tests/unit/ui/controller.test.ts:342-359`, `tests/unit/ui/camera.test.ts:51` | A wheel notch goes to the next stop, not × 1.15. |
| `tests/unit/perf/quality.test.ts:17-25`, `tests/unit/render/renderer-rotation.test.ts:164-190`, `staticLayer.test.ts:229-265` | The canvas ratio is `device ratio / n`; canvas size comes from device pixels. |
| `tests/unit/render/terrain.test.ts:99-104, 125-164` | No pad of 2 scaled pixels; no exact-scale rebuild. Replaced by "one image per chunk and view, drawn at a whole factor". |
| `tests/unit/render/staticLayer.test.ts:122` | A chunk image is about 260 px wide, not over 300. |
| `tests/unit/paths/layer.test.ts:84-93` | A deck is a sprite and posts, not 3 vector fills. |
| `tests/unit/a11y/palette.test.ts:59-78` | The ring is pixels, not an ellipse of radius 6.2. New check: the Thrill ring has gaps. |
| `tests/unit/render/track/phase6Render.test.ts:175`, `tests/unit/track/waterRender.test.ts:145-169` | Cars have level, banked and upside-down poses, not 16 roll steps; ripples are stepped pixels, not `lineDashOffset`. |
| `tests/unit/lighting/layer.test.ts:153-258` | Only if stage 9b is chosen (light canvas size and bulbs). |
| `tests/e2e/paths.spec.ts:106-110` | The deck colour is re-pinned to the path ramp. |
| `tests/e2e/screenshot.spec.ts:102` and the other owner screenshot scripts | Zoom 0.9 becomes a zoom stop. |

Tests that pass untouched: the 13 geometry files of group A (`drafts-constraints.md` 5.2), `spriteCache.test.ts`,
`anim.test.ts`, `camera.test.ts:53-106`, `safeColours.test.ts` (the ghost constants in `bank.ts:23-24` stay as
values), `scene.test.ts:251-279` (12 shirts, tint ends), `tests/e2e/boot.spec.ts` (grass `#d6c85a` has green 200),
`afterDark.spec.ts`.

### 5.6 Colour-blind rules

- The four safe colours and the 9 tint steps (`src/data/tuning/a11y.ts:15`, `src/render/palette.ts:84`) are fixed
  palette slots that no remap may change.
- Colour is never the only signal: ghost check and cross and hatch stay; the Thrill ring differs by shape; queue
  paths differ from footpaths by posts and rope as well as by ramp; broken items have a drawn crack.
- New `pixPalette.test.ts`: for every pair of colours that carries a meaning (ghost valid and invalid, tint ends,
  queue and footpath, Thrill and Chill tag ramps), the difference under simulated protanopia, deuteranopia and
  tritanopia stays over a threshold. The draft's warm ramps were never checked; this test checks them before any
  sprite is drawn.
- The 16 banned literals are not in the 59 draft colours (the test scans `src/render/pix/palette.ts` as well).
- High contrast still doubles overlay line widths (`palette.ts:35-37`).

---

## 6. Stages

Each stage ends with the full test suite green and a set of owner pictures.

| # | Stage | The player sees after it | Main files | Size |
|---|---|---|---|---|
| 1 | **Pixel grid** | The whole park on the art grid in the draft palette, sharp at every zoom stop; zoom in steps. Art is still the old shapes passed through the stand-in filter (the look the owner called "works"). Card and picker pictures at whole scales. | New `src/render/pix/{palette,format,buf,raster,upload,blit,zoom,standIn}.ts`, `scripts/pix.ts`. Changed: `renderer.ts`, `canvas.ts`, `terrain.ts` (build and draw), `scenery/layer.ts`, `shows/layer.ts`, `track/layer.ts`, `sprites/bank.ts`, `perf/quality.ts`, `main.ts`, `styles/main.css`, `input/controller.ts`, `input/camera.ts`, `ui/scenario/tutorialUi.ts`, `ui/decks/card.ts`, `scenery/preview.ts`, `track/preview.ts`; the pipeline tests of 5.5. | Large |
| 2 | **Ground** | The draft's ground: dithered grass, slab paths, plaza, pond with shores, baked shadows; slopes, cliffs, queues and decks in the same style. | `pix/recipes/terrain.ts`, `pix/data/terrain.ts`, `terrain.ts:24-330, 710-733`, `terrainTracker.ts`, `elevated/layer.ts`, terrain and path tests. | Large |
| 3 | **People and small things** | Draft guests with a visible walk, staff, costumes, rings, benches, bins, lamps, litter, fence, entrance. | `pix/recipes/people.ts`, `pix/data/{people,props}.ts`, `sprites/props.ts`, `staff.ts`, `litter.ts`, `management/layer.ts`, guest and ring tests. | Medium |
| 4 | **Scenery, the two open themes** | 25 items of Base and Classic Fair as authored sprites. | `pix/recipes/scenery.ts`, `pix/data/scenery{Base,Fair}.ts`, `scenery/art/{base,fair,index}.ts`, `scenery/layer.ts`. | Medium |
| 5 | **Scenery, five research themes** | The other 60 items. Five agents in parallel, one theme each. | `pix/data/scenery{Frost,Volcano,Spooky,Jungle,Starport}.ts`, `scenery/art/*`; `scenery/art/kit.ts` shrinks to its helpers. | Large |
| 6 | **Stalls** | 14 stalls with striped awnings and sign icons. | `pix/recipes/stalls.ts`, `pix/data/stalls.ts`, `sprites/stalls.ts`, `sprites/content/stalls.ts`, light positions in `lighting/pass.ts:45-54`. | Medium |
| 7 | **Flat rides** | 18 rides built from authored parts, moving by whole pixels. First the three draft rides (carousel, wheel, tower) as the reference, then the rest in parallel. | `pix/recipes/rides/*.ts`, `pix/data/rideParts.ts`, `sprites/rides.ts`, `sprites/content/{gentle,thrill,phase6}Rides.ts`, `content/index.ts`. | Large |
| 8 | **Track rides and trains** | Rails, supports, stations, cars, chain and water in pixels. | `pix/recipes/track.ts`, `pix/data/track.ts`, `track/paint.ts`, `track/layer.ts`, `track/preview.ts`, track tests. | Large |
| 9 | **Light, ghosts, overlays, shows, mascots** | 9a: palette ghosts, grid-true overlays, pixel rain and fireworks, show sites, pixel mascots, smooth night. 9b (if chosen): banded night with lit windows. | `lighting/pass.ts`, `lighting/sprites.ts`, `shows/{art,fx,layer}.ts`, `management/layer.ts`, the 8 ghost files, `ui/scenario/mascotArt.ts`, `pix/data/{shows,mascots}.ts`. | Medium (9a), medium (9b) |
| 10 | **Clean-up** | No visible change. | Delete `pix/standIn.ts`, `sprites/shapes.ts` and `sprites/content/kit.ts` drawing parts, `buildSprite`'s vector path; update the master spec's art direction, the Phase 8 spec and the ADR; final size and performance run. | Small |

Files touched over all stages: about 50 new (10 core, 14 data packs, 12 recipe files, 1 tool, about 13 tests),
about 45 changed, about 20 deleted or emptied; about 115 in all, plus about 330 `.pix` sources.

---

## 7. Quality risk

Where this approach could still look worse than the drafts.

1. **Many hands.** The draft is one scene from one generator with one taste. Here about 330 sprites come from many
   agent runs. Style can drift: outline weight, how many ramp steps a surface uses, how busy a sprite is. Remedy:
   three reference sprites and the lint rules fixed in stage 1; every batch judged on a sheet beside the reference
   and the draft crop; a single critic agent for the whole project; in-park pictures per batch for the owner.
2. **Large sprites are hard to draw as grids.** Language models place pixels well up to about 24 × 24 and poorly at
   70 × 60. The 11 large scenery items, the stalls, the manor and the maze will mostly be roughed out by generator
   and corrected by hand. They may look more "computed" than the small props. Remedy: allow these few to stay
   composed from `raster.ts` primitives and stamps in a recipe, exactly as the draft built its stall and carousel.
3. **Rides are smaller than the draft's.** The draft wheel is 4.7 tiles wide and about 105 art pixels tall; a 3 × 3
   footprint allows about 46 art pixels of wheel. The carousel loses about 15 %. Heights can grow (they are render
   data, `sprites/rides.ts:32-37`), widths cannot without a rule change. Remedy: owner decision 3.
4. **Stiff motion.** Parts step by whole pixels at up to 20 steps per second, with 32 angles. Slow rides (the wheel
   at about 1 step per second) will visibly tick. The pendulum ship's hull, the flip arm and the gyro rings are
   line-drawn at each angle and will look plainer than the authored parts beside them. Remedy: author 5 to 9 hull
   poses for the ship if the line-drawn hull fails review; keep 32 angles on desktop.
5. **Mirrors.** The tone swap is right for boxes and wrong for anything with a drawn highlight or a face detail on
   one side. A wrong mirror shows as light from the right. Remedy: the lint rule for classes `A` and `D`, and
   authoring the fourth view where the sheet shows a fault.
6. **Trees that do not turn.** About 31 natural items show variant a or b, not four sides. In a turned view a tree
   changes to its sibling. Today's game does the same with a lean or a seed. Owner decision 5.
7. **Crowds.** A queue has 4 guests per tile, 4 art pixels apart, and a guest is 7 wide with an outline. A full
   queue is a band of heads and ink. The draft shows the same in its busiest spots and it reads, but it is denser
   here. Remedy: guests in a queue alternate a half-pixel-row offset by slot parity; test on the sheet before
   stage 3 ships.
8. **Slopes and cliffs have no draft.** The column-shift rule can make a sloped path look stretched on the steep
   side. Remedy: review the 14 shapes on a sheet in stage 2; author separate ramp tiles for the 4 path ramps if the
   rule fails.
9. **The interim look.** Between stage 1 and stage 8 the park mixes authored art with filtered old art. Thin lines
   of the old art vanish in the filter (40 of 85 ride lines are under one art pixel). It is coherent but uneven.
   Remedy: order the stages by what fills the screen (ground, people, scenery first).
10. **Night.** With 9a, a smooth light pool on pixel art is not the draft's dithered night. With 9b the light is
    banded but still one multiply over the frame, so a pool's edge cuts across sprites in steps.
11. **Trains in loops.** Level, up, down, banked and upside-down poses replace 6,144 computed poses. In a corkscrew a
    car flips between poses instead of rolling. Remedy: add 2 more roll poses per heading if review asks for it
    (about 0.5 KB).
12. **Phone at reduced quality.** With `n = 3` an art pixel is at least 3 device pixels and only 3 sharp zoom stops
    and the far view exist. The art stays sharp, but the choice of zoom is coarse.

---

## 8. Decisions for the owner

1. **Zoom in steps.** The park is sharp only at whole sizes. Accept zoom that clicks between 4 to 11 sizes (a pinch
   glides and then settles)? Without this, no approach gives square pixels.
2. **The written rule.** "All graphics are drawn in code" becomes "all graphics are code or pixel data written for
   this project and kept in the source; no image files". Accept?
3. **Ride sizes.** Keep today's footprints, so the Big Wheel is about half the draft's size and the carousel a
   little smaller, or plan larger footprints later as a game-rule change outside this project?
4. **Night.** Stop at smooth darkening over the pixel park (cheap, ships in 9a), or also do the banded night with
   lit windows (9b, one more medium stage)?
5. **Views of natural things.** Trees, shrubs and rocks get two authored variants, not four sides. Accept?
6. **Reserve for size.** If the art grows past the estimate, may the five research themes' scenery load just after
   start instead of with the first load?
7. **The interim.** Show the stand-in filter look from stage 1 on (the park is coherent at every release), or keep
   the pixel look behind a setting until stage 8?

---

## 9. A two-day prototype

Goal: one real picture from the real game, and four numbers, that prove or kill the approach.

Built behind the URL flag `?pix=1`, on a branch, with no change to the default game:

Day 1, the grid:

- `src/render/pix/palette.ts`, `format.ts`, `buf.ts`, `upload.ts`, `blit.ts`, `zoom.ts` in their smallest form.
- In `renderer.ts`: whole offsets, smoothing off at a stop, wheel to the next stop, `canvasPlan` for ratio and CSS
  size, `image-rendering: pixelated`.
- `paintChunkPix` for flat tiles only: the grass tone field, footpath slab tiles with kerbs, the plaza, baked
  shadows.

Day 2, the art (three agents in parallel with the process of section 2.5):

- 14 sprites as data: guest front and back in 3 poses, oak a and b, pine, bench, lamp, ice-cream stall front and
  back, the horse, the carousel roof, the gate.
- `composeRide('carousel')` with all 32 angle frames; guests through `composeGuest` with shirt remap.
- Everything else stays as it is and is drawn through `pixelise`.

What it produces:

- `docs/screenshots/pix-prototype-desktop.png` (1280 × 800, device ratio 1, zoom 1) and
  `pix-prototype-phone.png` (the Pixel 7 profile, ratio 2.625, `n = 2`): the starting park with a carousel, a stall,
  paths, trees, benches, lamps and walking guests. Each is set beside the same crop of the approved draft.
- A 10-second screen recording of the carousel turning and guests walking, to judge whole-pixel motion.
- A contact sheet of the 14 sprites.

The numbers and the limits that kill it:

| Measure | How | Kill if |
|---|---|---|
| Look | The owner compares the two pictures and the recording | The authored sprites and the composed carousel are not judged equal to the draft, or stepped zoom is refused |
| Grid | `pixGrid` check on the screenshot | Any `k × k` block has two colours outside the stand-in sprites |
| Bytes | gzip of the prototype's data pack against section 2.1 | Over 0.4 gzip bytes per opaque art pixel (the plan would pass 60 KB of data) |
| Build time | `performance.now()` around `pixSprite` and `paintChunkPix` on the phone profile | A chunk takes over 12 ms, or a ride frame over 3 ms, at 4× throttle after the noise-table fix |
| Frame time and memory | `tests/e2e/perf-build3.spec.ts` with `TC_PERF=1` on the phone scene | Frame p95 worse than today's 33.4 ms, or sprite memory not under half of today's 57.5 MB |
