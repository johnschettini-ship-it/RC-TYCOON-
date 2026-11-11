# Renderer core: how the game draws today

Area: `src/render/renderer.ts`, `spriteCache.ts`, `iso.ts`, `camera.ts`, `view.ts`, `types.ts`, `palette.ts`,
`sprites/bank.ts`, `sprites/shapes.ts`, `canvas.ts`, `anim.ts`, `depth.ts`, `layers.ts`, `worldLayers.ts`,
`docs/adr/0001-renderer.md`, and the render quality setting (`src/perf/quality.ts`, `src/settings`).

All paths are relative to `/home/user/RC-TYCOON-`. Line numbers are from the working tree at commit `e247baa`.
Everything here was read from the code. Nothing was run.

Terms used below:

- **World pixel**: one pixel at zoom 1 on a screen with device pixel ratio 1. A tile is 64 × 32 world pixels.
- **Device scale**: `camera zoom × canvas pixel ratio`. This is the number of canvas pixels per world pixel.
- **Bucket**: one of the three scales (0.5, 1, 2) at which sprite images are built and cached.
- **Art pixel**: one pixel of the approved drafts. The draft scripts draw a tile as 32 × 16 art pixels
  (`concepts/pixel3.py:78`), and the raw frames (640 × 400, 195 × 422) are exactly half the size of the approved
  pictures (1280 × 800, 390 × 844). So one art pixel is 2 world pixels. The drafts therefore have the resolution of
  the game's 0.5 bucket, shown at device scale 1. (The size match is measured; I did not trace the step that put the
  raw frame into the final picture.)

---

## 1. What this area draws

### 1.1 The frame, in order

One call of `draw(world, camera, tool, alpha)` (`src/render/renderer.ts:1046-1147`) draws these layers:

| # | Layer | Where | Kind of drawing |
|---|---|---|---|
| 1 | Sky fill `#1d2b3a`, then terrain chunk images | `drawStatic`, `renderer.ts:989-1035` | 1 fill + 1 `drawImage` per visible chunk, or 1 `drawImage` of the static layer |
| 2 | Ground decals (litter, mess) | `mgmt.drawGround`, `renderer.ts:1088` | sprite blits |
| 3 | `drawGround` of the 7 world layers | `renderer.ts:1089` | layer code (tints, water) |
| 4 | Ownership tints (Buy Land tool only) | `renderer.ts:1090`, `680-703` | 4 translucent fills, `OWNED_TINTS` `renderer.ts:235-241` |
| 5 | Far-zoom guest dots (zoom ≤ 0.5) | `renderer.ts:1112`, `155-185` | 2 × 3 CSS px rectangles, one fill per colour |
| 6 | Depth-sorted objects | `renderer.ts:1113-1114`, `575-620` | sprite blits and layer `drawItem` calls |
| 7 | Weather | `mgmt.drawWeather`, `renderer.ts:1115` | management layer |
| 8 | `drawAfterObjects` of the layers (night light, show beams) | `renderer.ts:1116` | layer code, `multiply` and `lighter` compositing |
| 9 | Overlays: drag, purchase rectangle, selection, hover, ghost, track overlay, layer overlays | `drawOverlays`, `renderer.ts:850-871` | vector strokes and fills in device pixels |
| 10 | Debug overlay (`?debug` only) | `renderer.ts:873-886`, `1145` | text |

The dots (5) are drawn before the sorted objects, so rides and fences cover them (`renderer.ts:1111`).

The 7 world layers, in call order (`src/render/worldLayers.ts:16-26`): fields overlay, lighting, elevated paths,
scenery, terrain tools, shows, accessibility.

### 1.2 Depth-sorted object kinds

| Kind id | Object | Pushed at | Drawn at |
|---|---|---|---|
| 1 `KIND_FENCE` | Park fence segment, 4 edge directions | `renderer.ts:394-406` | `renderer.ts:600-602` |
| 2 `KIND_ARCH` | Park entrance, 2 parts (back, front) | `renderer.ts:408-421` | `renderer.ts:603-605` |
| 3 `KIND_RIDE` | One 32-px column of a flat ride sprite | `renderer.ts:423-464` | `renderer.ts:587-594` |
| 4 `KIND_STALL` | Stall | `renderer.ts:466-478` | `renderer.ts:595-599` |
| 5 `KIND_GUEST` | Guest | `renderer.ts:508-571` | `renderer.ts:582-586` |
| 6, 7 | Staff, path item | `src/render/management/layer.ts:45-46` | `renderer.ts:606-609` |
| 40 | Track slices, cars, gates | `src/render/track/layer.ts:85` | `renderer.ts:610-612` |
| 60, 61 | Elevated path, support | `src/render/layers.ts:44-53` | `renderer.ts:613-617` |
| 70, 71 | Scenery, scenery on an edge | same | same |
| 80 | Show site | same | same |

### 1.3 Sprites the core builds (`SpriteBank`, `src/render/sprites/bank.ts:84-208`)

| Builder | Key parts | Variants |
|---|---|---|
| `ride` (`bank.ts:97-111`) | def id, view rotation, frame, bucket | 18 flat rides (`src/data/catalog/flatRides.ts`: carousel, big_wheel, swing_tower, teacup_twirl, bumper_cars, rocket_rounds, spiral_slide, observation_tower, mirror_maze, haunted_manor, pendulum_ship, thunder_disc, drop_tower, flip_arm, magic_carpet, kiddie_cars, merry_mill, gyro_globe). Frame = angle 0–31, swing 0–4, occupancy 0–4 (`anim.ts:57-60`). 2 ghost frames 4094, 4095 (`anim.ts:78-79`). 4 rotations, 3 buckets. |
| `stall` (`bank.ts:113-121`) | def id, view rotation, frame, bucket | 14 stalls (`src/data/catalog/stalls.ts`). Frame is always 0 in play (`renderer.ts:597`), or a ghost frame. |
| `guest` (`bank.ts:124-157`) | facing, frame, bucket | Frame = colour (12 shirts or 9 tint steps), walk (0 stand, 1 and 2 steps, 3 sit), look (4 skin and hair pairs, `bank.ts:38-43`), tinted bit, balloon bit, umbrella bit (`bank.ts:50-53`). 4 facings. |
| `staff` (`bank.ts:160-167`) | facing, frame, bucket | Frame = type, costume, walk, action (`sprites/staff.ts:32-35`). |
| `pathItem` (`bank.ts:170-176`) | frame, bucket | code, side, fill level, broken. |
| `decal` (`bank.ts:179-188`) | frame, flip, bucket | litter 0–3, mess 8–9, flipped or not. |
| `fence` (`bank.ts:190-197`) | direction, bucket | 4. |
| `entrance` (`bank.ts:199-207`) | part, outer direction, bucket | 2 parts × 4 directions. |

### 1.4 Vector drawing the core does itself (no sprite)

- Tile outlines and fills for drag, hover, selection, purchase, ghost footprint: `tileFace` `renderer.ts:623-638`,
  `outlineTiles` `646-660`, `drawPurchaseRect` `706-726`, `drawOwnershipTints` `680-703`.
- Guest selection ring (ellipse) and yellow marker triangle: `renderer.ts:793-826`.
- Ghost check or cross icon: `drawGhostIcon` called at `renderer.ts:764, 779, 784` (function in `sprites/props.ts:328`).
- Far-zoom guest rectangles: 21 colour slots = 12 shirt colours + 9 temperament steps (`renderer.ts:77`).
- Card previews: `drawPreview` `renderer.ts:1157-1198` (see 2.6).

---

## 2. How it draws

### 2.1 Data flow of one frame (`renderer.ts:1046-1147`)

1. `applyPlan()` if the quality setting changed (`1050`), then `autoFrame()` (`1051`).
2. View rotation `rot = cam.rotation & 3`, the affine view table, camera clamp (`1056-1058`).
3. `scale = cam.zoom × dpr`, `bucket = zoomBucket(scale)`, `offX`, `offY`, the visible world rectangle (`1059-1066`).
4. Context reset: identity transform, alpha 1, **`imageSmoothingEnabled = true`** (`1069-1071`).
5. `LayerFrame` filled for the layers (`1073-1082`).
6. Sky and terrain (`1085-1086`), ground (`1087-1090`).
7. Collection into the draw list (`1098-1110`): fence, entrance, rides, stalls, track, queue placement, management,
   layers, guests.
8. Dots, sort, `drawList` (`1112-1114`).
9. Weather, `drawAfterObjects`, overlays (`1115-1118`).
10. `bank.cache.trim()` (`1119`), canvas data attributes (`1121-1134`), debug (`1145`).

The draw list is a struct of typed arrays that never shrinks (`DrawList`, `renderer.ts:80-121`). Each entry has
`kind, ref, sub, ax, ay, skey` and a packed sort key (`depth.ts:55-72`): depth (u + v at 1/64 tile), then base
height, then layer, then insertion order.

### 2.2 How a sprite is defined

A sprite is two things, both in world pixels around an anchor point:

- `ArtBounds { left, right, top, bottom }` (`sprites/rides.ts:15-20`).
- A paint function `(ctx) => void` that issues Canvas 2D vector calls (`fill`, `stroke`, `arc`, `ellipse`).

The art functions use the primitives in `src/render/sprites/shapes.ts`. Local coordinates are `(u, v)` in tiles
and `h` in world pixels of height: `x = (u − v) × 32`, `y = (u + v) × 16 − h` (`shapes.ts:1-18`).

| Primitive | Lines | What it draws |
|---|---|---|
| `poly3` | `shapes.ts:21-39` | filled (and stroked) polygon of 3D points |
| `line3` | `shapes.ts:42-50` | stroked line with round caps |
| `flat` | `shapes.ts:53-55` | flat quad |
| `box` | `shapes.ts:58-73` | left face, right face, top |
| `disc` | `shapes.ts:81-94` | ellipse |
| `cylinder` | `shapes.ts:97-114` | side and top ellipse |
| `cone` | `shapes.ts:127-156` | striped cone, 12 segments sorted back to front |
| `pyramid` | `shapes.ts:159-167` | four-sided roof |
| `head` | `shapes.ts:170-179` | circle and hair arc |
| `rrect` | `shapes.ts:185-198` | rounded rectangle path |

27 files import `shapes.ts`. Calls outside `shapes.ts`: `poly3` 86, `box` 82, `cylinder` 76, `line3` 65, `disc` 35,
`rrect` 17, `cone` 14, `pyramid` 8, `head` 2 (385 in all).

### 2.3 How a sprite is built

`buildSprite(bounds, scale, paint, tint)` in `src/render/canvas.ts:56-72` is the single builder for every sprite:

1. Image size = `ceil(bounds size × scale) + 4` (2 px pad on each side, `canvas.ts:50, 57-58`).
2. Anchor in the image: `ox = 2 − bounds.left × scale`, `oy = 2 − bounds.top × scale` (`canvas.ts:60-61`).
3. `ctx.setTransform(scale, 0, 0, scale, ox, oy)` and then `paint(ctx)` (`canvas.ts:62-63`). The vector art is
   rasterised by the browser at that scale, with anti-aliasing.
4. Optional ghost wash: one `source-atop` fill over the whole image (`canvas.ts:64-70`).
5. Result: `Sprite { image, w, h, ox, oy, scale }` (`spriteCache.ts:14-21`).

`buildSprite` has 14 callers: 9 in `sprites/bank.ts`, 1 in `scenery/sprites.ts:77`, 1 in `shows/layer.ts`, 3 in
`track/layer.ts:691, 830, 859`. Terrain chunks use the same recipe in their own code (`terrain.ts:542-561`).
The `scale` passed is always the bucket, except for exact-scale terrain chunks (`terrain.ts:618, 632`).

### 2.4 How a sprite is cached

- Key: one number, `((hash(defId) × 4 + rotation) × 4096 + frame) × 4 + bucketIndex` (`spriteCache.ts:46-50`).
  The hash is FNV-1a of the id (`spriteCache.ts:26-37`). Frames wrap at 4096 (`spriteCache.ts:44`).
  `bucketIndex` gives 0, 1, 2 (`spriteCache.ts:39-41`). Slot 3 is free in sprite keys; terrain uses slot 3 for its
  exact-scale image (`terrain.ts:424`).
- Guests, staff, path items and decals use a pre-hashed id (`bank.ts:31-34, 61-78`).
- `SpriteCache` is an LRU on a `Map` with a pixel cap (`spriteCache.ts:138-250`). Sprites used in the current frame
  are never evicted (`spriteCache.ts:217, 229`).
- All caches share one byte budget, `SpriteMemory` (`spriteCache.ts:68-132`): 64 MB on phones, 192 MB on desktops
  (`src/data/tuning/perf.ts:4`, set at `renderer.ts:909`).
- At most 48 new guest sprites are built per frame. Past that, a guest is drawn with the sprite of another bucket,
  scaled (`bank.ts:82, 127-134`).

### 2.5 How a sprite is blitted

`blit(sp, wx, wy)` (`renderer.ts:338-345`):

```
f  = scale / sp.scale
x0 = round(devX(wx) − sp.ox × f)      x1 = round(devX(wx) + (sp.w − sp.ox) × f)
y0 = round(devY(wy) − sp.oy × f)      y1 = round(devY(wy) + (sp.h − sp.oy) × f)
ctx.drawImage(sp.image, x0, y0, x1 − x0, y1 − y0)
```

`devX(wx) = wx × scale + offX` (`renderer.ts:325-326`). The two edges are rounded separately, so the drawn size can
change by 1 px when `f` is not a whole number.

`blitColumn` (`renderer.ts:350-363`) draws one vertical strip of a sprite with the 9-argument `drawImage`. Flat
rides are cut into strips of 32 world pixels (`renderer.ts:455-462`, `depth.ts:88-109`). Each strip sorts at the
depth of the front tile under it, so guests can stand between the parts of a ride.

The same blit math exists in four more places: `scenery/layer.ts:60-83`, `shows/layer.ts:113-135`,
`track/layer.ts:670-677`, `terrain.ts:638-643`. The management layer receives the core `blit` as a closure
(`renderer.ts:347`, `management/layer.ts:118`).

### 2.6 Card pictures: `drawPreview`

`drawPreview(ctx, defId, w, h)` (`renderer.ts:1157-1198`):

1. Looks up a flat ride, else a stall, else falls back to a generic 2 × 2 ride (`1158-1173`).
2. Takes the art bounds at rotation 0 (`rideArtBounds` or `stallArtBounds`).
3. Fit factor `k = min((w − 2·pad) / boundsWidth, (h − 2·pad) / boundsHeight)`, `pad = 6 %` of the short side
   (`1174-1177`). `k` is any real number.
4. `clearRect`, `translate`, `scale(k, k)` (`1178-1181`).
5. Draws one grass diamond per footprint tile in two fixed greens `#64b049`, `#6dbb4f` (`1183-1194`).
6. Calls the art function directly: `drawStallArt(ctx, defId, 2)` or `drawRideArt(ctx, defId, w, d, { rotation: 0,
   angle: 0, swing: 0, occupancy: 0 })` (`1195-1196`).

It does not use the sprite cache. The art is re-rasterised as vectors at the fit scale.

The only caller is `src/ui/decks/card.ts:96-117`: a 168 × 120 CSS px canvas (`card.ts:82-83`), backing size ×
`min(3, devicePixelRatio)` (`card.ts:97`), drawn once per id and pixel ratio and then copied (`card.ts:114-115`).
Track rides use `drawTrackPreview` (`src/render/track/preview.ts:52`) instead.

### 2.7 Image smoothing

- Main canvas: `ctx.imageSmoothingEnabled = true` every frame (`renderer.ts:1071`).
- Static layer canvas: `true` (`renderer.ts:1018`).
- Lighting pass: sets `true`, then restores the earlier value (`src/render/lighting/pass.ts:159-169`).
- `imageSmoothingQuality` is never set. No CSS `image-rendering` rule exists (`src/styles/main.css:34` is the only
  `#game` rule).
- Sprite canvases never set it (they receive vector calls only).

### 2.8 What the palette module offers (`src/render/palette.ts`)

| Export | Lines | Content |
|---|---|---|
| `GHOST_VALID`, `GHOST_INVALID` | `10-11` | `#0072B2` blue, `#D55E00` vermillion (from `SAFE_PALETTE`, `src/data/tuning/a11y.ts:15`) |
| `GHOST_FILL_*`, `GHOST_LIGHT_*`, `GHOST_DARK_*`, `GHOST_WATER` | `17-24` | derived ghost colours |
| `ghostFill`, `ghostStroke`, `ghostLineWidth` | `27-37` | line width doubles with high contrast |
| `withAlpha` | `40-43` | `#rrggbb` to `rgba()` |
| `GHOST_HATCH`, `CURSOR_COLOUR`, `SKY` | `45-49` | `SKY = #1d2b3a` |
| `SHIRT_COLOURS` | `52-65` | 12 flat colours |
| `mix32`, `shirtIndex` | `68-81` | integer hash, stable shirt per guest id |
| `TINT_STEPS`, `tintStep`, `tintStepRgb`, `temperamentTint`, `rgbCss` | `84-112` | 9 steps from Chill `#56B4E9` to Thrill `#E69F00` |
| `TAG_COLOURS` | `115-119` | thrill, family, chill × main, light, dark |
| `shade(hex, f)` | `122-132` | darken or lighten by any factor |

It has no colour ramps, no outline colour, no palette index, and no function that snaps a colour to a palette.
Other colours live next to the art: skin and hair in `shapes.ts:200-201`, item colours in `sprites/props.ts:20`,
stall schemes in `sprites/stalls.ts:21-29`, terrain colours in `terrain.ts` (22 distinct hex values).
`src/render` holds 1,606 hex colour literals (734 distinct) and 105 calls of `shade(`.

### 2.9 Render quality setting

- Setting: `renderQuality: 'auto' | 'high' | 'low'`, default `auto` (`src/settings/types.ts:11, 29`,
  `src/settings/schema.ts:46`). Shown in Settings → Display (`src/ui/settings/model.ts:66-71`).
- Wiring: `src/ui/perf/index.ts:74` copies the setting into `setRenderQuality` (`src/perf/quality.ts:125-129`).
  The renderer re-plans when the version changes (`renderer.ts:1050`).
- Plan (`renderPlan`, `quality.ts:64-77`):

| Field | Desktop, high or auto | Phone, high or auto | low (any device) |
|---|---|---|---|
| Canvas pixel ratio | device ratio | `min(device ratio, 2)` | `min(device ratio, 1)` |
| Zoom buckets | 4 (3 + exact-scale terrain) | 3 | 3 |
| Guest dots from zoom | 0.5 | 0.5 | 0.75 |
| Ride frames | 32 angles, 5 occupancy | 16 angles, 3 occupancy | 16 angles, 3 occupancy |
| Shared image budget | 192 MB | 64 MB | by device |

- `auto` also steps the pixel ratio down to 1 when a 60-frame window has a frame p95 over 1.25 × the budget, after
  120 warm-up frames. It never steps back up (`AutoScale`, `quality.ts:93-120`, `renderer.ts:920-928`).
- Phone = coarse pointer, or device memory ≤ 4 GB, or a CSS side below 600 px (`quality.ts:31-35`).

---

## 3. Sizes and scale

### 3.1 Fixed sizes at zoom 1 (world pixels)

- Tile: 64 wide, 32 high. One height step: 8 px (`src/render/iso.ts:8-10`).
- Projection: `sx = (x − y) × 32`, `sy = (x + y) × 16 − z × 8` (`iso.ts:16-18`).

| Sprite | Bounds (left, right, top, bottom) | Size | Source |
|---|---|---|---|
| Guest | −8, 8, −20, 5 | 16 × 25 | `sprites/props.ts:15` |
| Guest with balloon or umbrella | −13, 13, −40, 5 | 26 × 45 | `sprites/props.ts:17` |
| Staff | −12, 12, −30, 5 | 24 × 35 | `sprites/staff.ts:13` |
| Path item | −16, 16, −32, 8 | 32 × 40 | `sprites/litter.ts:11` |
| Litter | −9, 9, −7, 6 | 18 × 13 | `sprites/litter.ts:12` |
| Mess | −11, 11, −6, 6 | 22 × 12 | `sprites/litter.ts:13` |
| Fence segment | −34, 34, −20, 36 | 68 × 56 | `sprites/props.ts:215-217` |
| Park entrance | −40, 40, −70, 40 | 80 × 110 | `sprites/props.ts:253-255` |
| Stall | −34, 34, −50, 38 | 68 × 88 | `sprites/stalls.ts:31-33` |
| Flat ride, extent ex × ey, height H | −ey·32, ex·32, (ex+ey)·8 − H − 6, (ex+ey)·16 + 4 | (ex+ey)·32 × ((ex+ey)·8 + H + 10) | `sprites/rides.ts:50-54` |

Ride heights H: carousel 100, big_wheel 118, swing_tower 146, teacup_twirl 50 (`sprites/rides.ts:32-37`). A 3 × 3
carousel is 192 × 158 world pixels: 100 × 83 image pixels at bucket 0.5, 196 × 162 at bucket 1, 388 × 320 at
bucket 2 (each side + 4).

For comparison, the draft guest stamp is 7 × 12 art pixels (`concepts/pixel3.py:256`) = 14 × 24 world pixels. It
fits the current guest bounds with 1 px to spare on each side.

### 3.2 Zoom

- Camera zoom range 0.25 to 2.0 (`src/render/camera.ts:6-7`), clamped in `zoomAt` (`camera.ts:31-37`) and every
  frame (`camera.ts:54-60`). Default zoom 1 (`src/game.ts:17`).
- Zoom is continuous. Wheel and keys multiply by 1.15 per step (`src/input/camera.ts:13-14`,
  `src/input/controller.ts:127, 152`). Pinch multiplies by the finger distance ratio (`controller.ts:280`).
  There is no snapping.
- `scale = cam.zoom × dpr` (`renderer.ts:1059`).
- Bucket: `scale < 0.707 → 0.5`, `scale < 1.414 → 1`, else `2` (`camera.ts:69-73`).
- Resample factor at blit time, `f = scale / bucket`: from 0.5 to 1.41 in bucket 0.5, from 0.71 to 1.41 in bucket 1,
  from 0.71 up to the pixel ratio in bucket 2 (2 on phones, 3 on a 3× desktop).
- So sprites are drawn 1:1 only when `zoom × dpr` is exactly 0.5, 1 or 2. At every other zoom the browser scales
  them with bilinear smoothing.
- Terrain differs on desktops at `high` and `auto`: after 8 still frames at a non-bucket scale ≤ 2, visible chunks
  are rebuilt at the exact device scale, one per frame, and then drawn 1:1 (`terrain.ts:414-424, 588-589, 605`).
  Off on phones and at `low` (`renderer.ts:906`).

### 3.3 Device pixel ratio

- `main.ts:31-36` calls `renderer.resize(cssWidth, cssHeight, window.devicePixelRatio)` from a `ResizeObserver`.
- Backing size: `canvas.width = round(cssW × dpr)`, same for height (`renderer.ts:912-913`). `dpr` here is the
  planned ratio (2.9), not always the device ratio.
- The canvas CSS size is 100 % of the window (`src/styles/main.css:34`). When the planned ratio is lower than the
  device ratio (phones over 2×, `low`, `auto` after a step down), the browser stretches the canvas to the screen.
- All drawing is in backing pixels with the identity transform (`renderer.ts:1069`). Only the debug overlay sets a
  `dpr` transform (`renderer.ts:876`).
- Line widths and marker sizes in overlays are multiplied by `scale` (for example `renderer.ts:752, 815-822`).
- The canvas has no alpha channel (`renderer.ts:267`).
- Card previews use their own ratio, `min(3, devicePixelRatio)` (`src/ui/decks/card.ts:97`).

### 3.4 View rotation (4 views)

- `Camera.rotation` is 0–3 quarter turns clockwise. It is UI state only (`src/render/types.ts:14-18`).
- Map to view table: `src/render/view.ts:6-12`, functions `mapToView`, `viewToMap`, `mapToViewContinuous`
  (`view.ts:29-68`). Hot loops use `ViewAffine` (`view.ts:114-171`) and `viewTileSX/SY`, `viewPointSX/SY`
  (`view.ts:247-264`).
- Depth sorts by `u + v` in view space (`depth.ts:36-43`).
- A sprite is asked for with rotation `(map rotation + r) mod 4` (`view.ts:82-84`, used at `renderer.ts:439, 476,
  745`). Directions turn the same way (`view.ts:92-94`). So every object needs art for 4 rotations, and the sprite
  key holds the view rotation.
- A multi-tile footprint is anchored at its view origin (min u, min v), and its extents swap at r = 1 and 3
  (`renderer.ts:383-390, 442-449`).
- Slopes turn with `rotateSlopeMask` (`view.ts:76-79`). Terrain chunk images are keyed by rotation
  (`terrain.ts:438-440`).
- A turn keeps the map point at the screen centre (`rotateCameraView`, `view.ts:222-232`).
- Picking runs the inverse table (`pickTile`, `iso.ts:136-167`).

### 3.5 What is cached

| Cache | Label | Cap | Where |
|---|---|---|---|
| Sprite bank (rides, stalls, guests, staff, path items, decals, fence, entrance) | `sprites` | 96 MB | `bank.ts:20, 89`, `renderer.ts:274` |
| Terrain chunk images, 8 × 8 tiles, per rotation and bucket (+ exact slot) | `chunks` | 64 MB, 32 MB on phone-sized screens | `terrain.ts:429-435, 467` |
| Static layer: sky + all visible chunks in one canvas-sized image | `static` | 1 image | `renderer.ts:938-1035` |
| Scenery sprites | `other` | 8 M px | `scenery/sprites.ts:59-62` |
| Show sprites | `other` | own cap | `shows/layer.ts:78` |
| Track car sprites | `other` | 6 M px | `track/layer.ts:411` |
| All of the above together | shared | 64 MB phone, 192 MB desktop | `spriteCache.ts:56-58, 135` |
| Footprint column tables | — | — | `renderer.ts:289, 328-336` |
| Fence segments (rebuilt when the terrain version changes) | — | — | `renderer.ts:1093-1097` |
| Card pictures by id and pixel ratio | — | — | `src/ui/decks/card.ts:86-117` |

The static layer is built on the second frame of a still view and copied 1:1 while the camera centre, scale,
rotation, canvas size and terrain version stay the same (`renderer.ts:944-967, 1000-1025`).

---

## 4. Animation

- The loop calls `renderer.draw(world, camera, tool, alpha)` once per animation frame (`src/game.ts:102`). The
  simulation runs at 20 ticks per second (`src/data/tuning/core.ts:2`). `alpha` in [0, 1) is the share of a tick
  that has passed.
- **Rides.** Each frame of a ride is a whole separate sprite. `rideFrameFor` (`anim.ts:82-88`) turns the ride's
  cycle into a frame number:
  - angle: 32 frames per revolution (`anim.ts:9`), from `rideAnimation` (`anim.ts:42-48`), which eases with a
    trapezoid speed profile, 20 % ramps (`anim.ts:20-33`). Revolutions per run: carousel 4, big_wheel 1, swing_tower
    6, teacup_twirl 3, others 2 (`anim.ts:12-18`).
  - swing: 0–4, only for swing_tower (`anim.ts:86`).
  - occupancy: 0–4 from riders and capacity (`anim.ts:51-55`).
  - The frame depends on ticks only, not on `alpha`, so rides move at 20 steps per second at most.
  - Phones and `low` use 16 angles and 3 occupancy levels (`coarseRideFrame`, `anim.ts:71-75`, `renderer.ts:453`).
  - The sprite is built by calling the ride's art function with `angle / 32`, `swing / 4`, `occupancy`
    (`bank.ts:102-108`).
- **Guests.** Position is interpolated every frame with `alpha` (`guestPosition`, `renderer.ts:542`). Walking
  guests switch between frames 1 and 2 every 5 ticks: `1 + ((floor((progress + alpha) / 5) + id) & 1)`
  (`renderer.ts:548`; 10 ticks per tile, `src/render/guestPos.ts:11`). Standing is frame 0, sitting is frame 3
  (`renderer.ts:528-535`). Reduced motion keeps walkers on frame 0 (`renderer.ts:519`). Facing comes from the walk
  direction, turned into the view (`renderer.ts:547, 568`).
- **Queues.** Queue places are recomputed each frame, 4 guests per tile (`placeQueues`, `renderer.ts:481-502`).
- **Stalls, fence, entrance.** No animation.
- **Ghosts.** One still frame with a colour wash, drawn at alpha 0.85 (`renderer.ts:758, 775`).
- **Camera.** Pan, zoom and turn change `offX`, `offY`, `scale` and `rot` only. Nothing is tweened in the renderer.
- Staff, track cars, weather, shows, night light and water belong to other layers.

---

## 5. What a pixel-art version must keep

### 5.1 Function signatures and types

- `Renderer { resize(cssWidth, cssHeight, dpr); draw(world, camera, tool, alpha) }` (`src/render/types.ts:155-159`).
  The ADR keeps "one `Renderer` interface" as the upgrade path (`docs/adr/0001-renderer.md:162`).
- `createCanvasRenderer(canvas: HTMLCanvasElement): Renderer` (`renderer.ts:265`, used at `src/main.ts:21`).
- `drawPreview(ctx, defId, w, h)` (`renderer.ts:1157`, used at `src/ui/decks/card.ts:107`, checked to exist and to
  import without a DOM at `tests/unit/render/terrain.test.ts:49-54`).
- Re-exports from `renderer.ts`: `withAlpha` (`189`, imported by `tests/unit/render/safeColours.test.ts:7`),
  `GUEST_LOD_ZOOM`, `GUEST_LOD_W`, `GUEST_LOD_H` (`72-75`).
- `Sprite { image, w, h, ox, oy, scale }` (`spriteCache.ts:14-21`) and `buildSprite(bounds, scale, paint, tint)`
  (`canvas.ts:56`). `scale` may be any number: the blit code divides by it. A sprite built at a fixed native scale
  already works with every blit function.
- `spriteKey` layout and `guestSpriteKey`, `staffSpriteKey`, `pathItemSpriteKey`, `decalSpriteKey`
  (`spriteCache.ts:46-50`, `bank.ts:61-78`). Tests: `tests/unit/render/spriteCache.test.ts:6-57`.
- `SpriteBank` methods (`bank.ts:97-207`). The management layer calls `bank.decal` (`management/layer.ts:170, 177`),
  `bank.staff` (`305`) and `bank.pathItem` (`307, 554`).
- `SpriteCache` and `SpriteMemory` API (`spriteCache.ts:68-250`). Tests: `spriteCache.test.ts:59-190`.
- `WorldLayer`, `LayerFrame`, `LayerSink`, `LAYER_KIND` (`src/render/layers.ts:21-65`). Layers get a
  `CanvasRenderingContext2D` in device pixels and read `f.scale`, `f.offX`, `f.offY`, `f.dpr`, `f.bucket`.
- `iso.ts`, `camera.ts` and `view.ts` say "Signatures are a contract" in their headers (`iso.ts:2`, `camera.ts:1`,
  `view.ts:2`). `TILE_W = 64`, `TILE_H = 32`, `STEP_PX = 8` are repeated as literals in `shapes.ts:8-9`,
  `view.ts:190-192` and `tests/e2e/paths.spec.ts:55-56`.
- `ZoomBucket = 0.5 | 1 | 2` is used in 10 files (`camera.ts`, `layers.ts`, `spriteCache.ts`, `bank.ts`,
  `terrain.ts`, `renderer.ts`, `management/layer.ts`, `scenery/sprites.ts`, `track/layer.ts`, `perf/quality.ts`).

### 5.2 Anchors, footprints and bounds

- Ride anchor: the top corner of the footprint's view-origin tile at the base height (`renderer.ts:448-449`,
  `sprites/rides.ts:4`). Stall, fence, entrance: the tile's top corner. Guest and staff: the feet.
- A ride sprite must span exactly `[−ey × 32, ex × 32]` around its anchor, because the column cutter assumes it
  (`renderer.ts:455-462, 591-592`, bounds at `sprites/rides.ts:53`).
- Bounds are used outside sprite building: culling (`renderer.ts:450-452, 469-475`), ghost icon position
  (`renderer.ts:761, 778`), the ride marker of the management layer (`management/layer.ts:471`), preview fitting
  (`renderer.ts:1166-1177`).
- Guest culling margins are literals that match the guest bounds: 10 or 14 px sideways, −6 to +24 or +42 px down
  (`renderer.ts:563-564`).
- Depth: `packDepth`, `sortKey`, `footprintColumns`, `Layer` (`src/render/depth.ts`). Tests:
  `tests/unit/render/depth.test.ts`, `tests/unit/render/rotation.test.ts:99-143`.

### 5.3 Hit areas

Picking never reads sprite pixels. A pointer goes to `pickTile(map, sx, sy, rotation)` (`iso.ts:136-167`, called at
`src/input/controller.ts:569`), then `pickEntity(world, tile)` (`src/input/tools.ts:105`). New art cannot change
what a click hits, as long as the tile geometry stays.

### 5.4 Behaviour that tests pin down

| Behaviour | Test |
|---|---|
| Zoom clamps to 0.25–2.0; `zoomAt` keeps the anchor within 0.5 px | `tests/unit/render/camera.test.ts:53-90` |
| Nearest bucket of 0.5, 1, 2 | `tests/unit/render/camera.test.ts:97` |
| All 4 rotations draw with finite numbers and the same draw counts | `tests/unit/render/renderer-rotation.test.ts:53` |
| Guests are 2 × 3 px rectangles at zoom ≤ 0.5 (0.75 at `low`) | `renderer-rotation.test.ts:110`, `staticLayer.test.ts:204-227` |
| Canvas pixel ratio: capped at 2 on phones, 1 at `low`; `data-device`, `data-auto-scale` | `renderer-rotation.test.ts:164-190`, `staticLayer.test.ts:229-265`, `tests/unit/perf/quality.test.ts` |
| A still view composes the static layer once and then copies it | `tests/unit/render/staticLayer.test.ts:57-200` |
| `drawImage` count equals the probe's count | `staticLayer.test.ts:277-297` |
| Rendering never changes the game state | `renderer-rotation.test.ts:148`, `staticLayer.test.ts:188` |
| Ghost colours are the colour-blind safe pair; banned red and green literals may not appear anywhere in `src/render/**` | `tests/unit/render/safeColours.test.ts:24-60` |
| Shirt colour is stable per guest id; tint steps | `tests/unit/render/scene.test.ts:251-279` |
| The canvas has pixels with green channel > 120 after boot | `tests/e2e/boot.spec.ts:12-21` |
| An elevated deck pixel is within 60 (sum of channel differences) of `#dcc79c` | `tests/e2e/paths.spec.ts:106-110` |
| Night lowers the mean brightness of the canvas | `tests/e2e/afterDark.spec.ts:52-67` |
| `data-zoom` exists and grows on pinch and wheel | `tests/e2e/boot.spec.ts:11`, `tests/e2e/phase1-smoke.spec.ts:148-211`, `tests/e2e/track.spec.ts:191-193` |

Unit tests run the whole renderer on a fake canvas that records calls and holds no pixels
(`tests/unit/render/fakeCanvas.ts`). Its `getImageData` returns 4 bytes (`fakeCanvas.ts:70-71`).

### 5.5 Rules written in the code and the ADR

- No allocation per object in the frame loop (`renderer.ts:9-10`).
- Destinations are rounded to whole device pixels "so slices do not seam" (`renderer.ts:9`).
- Canvas data attributes that tests and the perf run read: `data-zoom`, `data-camera-x`, `data-rotation`
  (`renderer.ts:1121-1134`), `data-pixel-ratio`, `data-device`, `data-auto-scale` (`renderer.ts:914-916`).
- Colour is never the only signal; ghost line widths double with high contrast (`palette.ts:1-5, 35-37`).
- Budgets: phone frame p95 ≤ 40 ms, desktop ≤ 20 ms, initial load ≤ 400 KB gzipped
  (`src/data/tuning/perf.ts:15-19`). The ADR's last measured build was 314 KB (`docs/adr/0001-renderer.md:133`);
  later work (for example the bundled Fredoka font, `src/styles/tokens.css:8-14`) is not in that figure. No runtime
  dependency (`0001-renderer.md:144-145`).
- In Chrome's software canvas a `drawImage` costs by the size of the source image, and one shared atlas was slower
  than separate canvases (`0001-renderer.md:42-45, 58-61`).
- A filtered (scaled) draw costs about 5 times a 1:1 draw on a software canvas (`terrain.ts:415-418`).

---

## 6. What makes pixel art hard here

1. **Smoothing is forced on.** `renderer.ts:1071` and `renderer.ts:1018` set `imageSmoothingEnabled = true` every
   frame. No CSS `image-rendering` rule exists (`src/styles/main.css:34`). Every scaled sprite and every stretched
   canvas is blurred.

2. **The scale is almost never a whole multiple of the art.** `scale = zoom × dpr` (`renderer.ts:1059`). Zoom moves
   in steps of × 1.15 and by pinch (`src/input/camera.ts:13-14`, `src/input/controller.ts:280`), with no snapping
   (`camera.ts:31-37`). From zoom 1 the steps are 1.15, 1.32, 1.52, 1.75, 2.0 and 0.87, 0.76, 0.66, 0.57, 0.50 …
   Only three image scales exist (`camera.ts:9, 69-73`), and blits resample by `scale / bucket`
   (`renderer.ts:339-344`). Pixel art scaled by 1.15 or 0.87 has uneven pixels with smoothing off, and blur with it
   on.

3. **The canvas itself is stretched on many devices.** Phones cap the canvas ratio at 2 (`src/data/tuning/perf.ts:7`,
   `quality.ts:68`), so a 2.625× phone shows the canvas stretched by 1.3125. `low` renders at 1× (`quality.ts:71`),
   and `auto` drops to 1× on slow devices in the middle of play (`quality.ts:93-120`). Desktop ratios of 1.25 and
   1.5 give `round(cssW × dpr)` backing sizes that do not match the screen exactly (`renderer.ts:912-913`).

4. **All art is anti-aliased vector drawing, rasterised by the browser at each bucket scale.** `buildSprite` sets
   `setTransform(scale, …)` and runs the same paint function at 0.5, 1 and 2 (`canvas.ts:62-63`). The three results
   are three different rasterisations, not one image scaled. Canvas 2D cannot turn off anti-aliasing for paths. The
   art uses fractional line widths and round caps (`shapes.ts:42-50`; widths 2.2 and 2.6 at
   `sprites/props.ts:239-245`) and 117 arc, ellipse and curve calls in `src/render`. A hard-edged, outlined
   look needs a different rasteriser or a pixel pass after painting.

5. **Anchors and sizes are not on a pixel grid.** At bucket 0.5 an odd bound gives a half-pixel anchor
   (`canvas.ts:60-61`; litter bounds −9 and −7 at `sprites/litter.ts:12`, mess −11 at `litter.ts:13`, guest item
   bounds −13 at `props.ts:17`, bottom 5 for guests and staff). Guests stand at continuous positions
   (`renderer.ts:553-554`), the camera centre is a float (`camera.ts:63-66`), and the two edges of a blit are
   rounded separately (`renderer.ts:340-343`), so a sprite's drawn size changes by 1 px as it moves when the factor
   is not whole.

6. **The blit math is copied in five places.** `renderer.ts:338-363`, `scenery/layer.ts:60-83`,
   `shows/layer.ts:113-135`, `track/layer.ts:670-677`, `terrain.ts:638-643`. A new snapping rule must go into all
   of them, or into one shared function that does not exist yet.

7. **Ride columns clip the sprite at its bounds.** `blitColumn` starts the first strip at image x = 2 and ends the
   last at `w − 2` (`renderer.ts:355-359` with `ox` from `canvas.ts:60`). The 2-px pad on the left and right is
   never drawn for rides, and the ride bounds end exactly at the footprint corners (`sprites/rides.ts:53`). A dark
   outline around the left or right corner of a ride would be cut off. At a non-whole factor each 32-px strip also
   gets a slightly different width (`renderer.ts:352-353`).

8. **Ride animation is a new full sprite per frame, generated by code.** 32 angles × 5 swing × 5 occupancy × 4
   rotations × 3 buckets per ride (`anim.ts:9, 57-60`, `spriteCache.ts:46-50`), for 18 flat rides. Hand-drawn
   bitmaps cannot cover this. The pixel look has to come from code, as it did in the draft scripts.

9. **Terrain is rebuilt at exact device scales on desktops.** After 8 still frames, chunk art is rasterised again
   at the exact `zoom × dpr` (`terrain.ts:414-424, 588-589`, on when `plan.zoomBuckets > 3`, `renderer.ts:906`).
   Tiles are also grown by `0.6 / scale` px to hide seams (`terrain.ts:551`). The ground's pixel grid would change
   with zoom and would not match the sprites' grid.

10. **There is no palette to snap to, and blending makes new colours.** `palette.ts` has no ramps (2.8). `shade`
    makes any tint (`palette.ts:122-132`, 105 calls). 1,606 hex literals sit in `src/render`. On top of that the
    renderer blends: ghost wash at alpha 0.5 and 0.55 (`bank.ts:23-24`, `canvas.ts:64-70`), ghost sprites at alpha
    0.85 (`renderer.ts:758, 775`), ownership tints (`renderer.ts:235-241`), and the night pass multiplies a
    quarter-size smooth light image over the frame (`src/render/lighting/pass.ts:158-169`).

11. **Card pictures are a separate vector path.** `drawPreview` scales the vector art by a real-number fit factor
    (`renderer.ts:1174-1181`) on a canvas of 168 × 120 CSS px × up to 3 (`src/ui/decks/card.ts:82-97`), with its
    own two grass colours (`renderer.ts:1191`). It shares no pixels with the map sprites. The draft cards show the
    same pixel art as the map.

12. **Overlays are smooth vector lines whose width follows the scale.** Tile outlines, the selection ring and the
    marker triangle (`renderer.ts:646-660, 787-846`) use widths such as `max(1, 1.5 × scale)`. They will look
    different from pixel art under them. The draft shows a chequered pixel outline for the drop target.

13. **Stand-in sprites from another bucket.** When more than 48 guest sprites are missing in one frame, guests are
    drawn with another bucket's sprite, scaled (`bank.ts:82, 127-134`). Terrain does the same while chunks wait to
    be built (`terrain.ts:610-616`). For a few frames after a bucket change the picture mixes resolutions.

14. **Zoom below the art's native size.** At zoom 0.25 on a 1× screen the 0.5-bucket images are drawn at half size
    (`camera.ts:6`, `renderer.ts:339`). If the art is authored at the draft's resolution (the 0.5 bucket), this
    zoom drops every second pixel.

15. **Unit tests have no pixels.** The fake canvas returns a 4-byte `getImageData` and ignores `putImageData`
    (`tests/unit/render/fakeCanvas.ts:55-76`). A pixel pass inside `buildSprite` must work on that fake, and
    its output cannot be checked in unit tests as they stand. Sprite builds during play already cost 5.1 % of
    main-thread time on the phone before the last tuning (`docs/adr/0001-renderer.md:37`).

---

## 7. Size of the job

### 7.1 The core files

| File | Lines | Style-dependent part |
|---|---|---|
| `src/render/renderer.ts` | 1,198 | smoothing (2 lines), `blit` and `blitColumn` (`338-363`, 26 lines), overlays (`622-871`, 250 lines, 9 functions), plan (`898-917`, 20 lines), `drawPreview` (`1157-1198`, 42 lines) |
| `src/render/sprites/shapes.ts` | 201 | all of it: 10 draw primitives |
| `src/render/sprites/bank.ts` | 208 | 8 builders (`97-207`, 111 lines): signatures stay, each wraps one art function |
| `src/render/canvas.ts` | 72 | `buildSprite` (`50-72`, 23 lines) |
| `src/render/palette.ts` | 132 | all of it (add ramps, an outline colour, a snap function) |
| `src/render/camera.ts` | 73 | buckets and `zoomBucket` (`9-10, 69-73`, 7 lines); zoom snapping would touch `zoomAt` (`31-37`) |
| `src/render/spriteCache.ts` | 250 | `bucketIndex` (`39-41`) only |
| `src/perf/quality.ts` | 138 | `renderPlan` (`64-77`, 14 lines) |
| `src/render/iso.ts`, `view.ts`, `depth.ts`, `types.ts`, `layers.ts`, `worldLayers.ts`, `anim.ts` | 878 | none (geometry, sorting, contracts, frame numbers) |

### 7.2 Counts

- Functions in the core that issue canvas draw calls: **35**.
  - `renderer.ts`: 16 (`GuestDots.draw`, `blit`, `blitColumn`, `drawList`, `tileFace`, `tilePath`, `outlineTiles`,
    `drawOwnershipTints`, `drawPurchaseRect`, `drawGhost`, `drawSelection`, `drawOverlays`, `drawDebug`,
    `drawStatic`, `draw`, `drawPreview`).
  - `shapes.ts`: 10 primitives.
  - `canvas.ts`: 1 (`buildSprite`).
  - `bank.ts`: 8 builders.
- Lines in the core that a new style must replace or wrap: about **830** (the spans in 7.1: 2 + 26 + 250 + 20 + 42
  + 201 + 111 + 23 + 132 + 7 + 3 + 14).
- Outside the core, the same two choke points apply:
  - `buildSprite` has 14 call sites in 4 files (2.3).
  - 4 more copies of the blit math, 61 lines (2.5).
  - 385 calls of the shape primitives and about 320 direct `fill` / `stroke` / `fillRect` / `fillText` calls
    outside `renderer.ts` (190 in `src/render/sprites`, 43 in `track`, 20 in `shows`, 18 in `scenery`, 15 in
    `management`, 6 in `terrain.ts`, the rest in smaller layers). The other area maps cover those.

### 7.3 Two points that reduce the job

- Every sprite passes through `buildSprite` (`canvas.ts:56-72`). The `tint` step there already post-processes the
  finished image. A pixel pass (hard alpha, palette snap, 1-px outline) could sit at the same place and reach all
  14 callers.
- `Sprite.scale` is free. A sprite built once at a native scale (for example 0.5, the draft's resolution) is
  blitted correctly by all five blit functions without a change to the `Sprite` type. At the draft's resolution a
  sprite needs a quarter of the memory of bucket 1 and a sixteenth of bucket 2.

---

## 8. Open questions

1. **Art pixel size.** The drafts use 1 art pixel = 2 world pixels (tile 32 × 16). Is that the target, so that the
   art's native resolution is today's 0.5 bucket?
2. **Zoom.** May zoom snap to steps where `zoom × ratio ÷ native scale` is a whole number, or must it stay
   continuous from 0.25 to 2.0 (`tests/unit/render/camera.test.ts:53-90`, pinch tests in
   `tests/e2e/phase1-smoke.spec.ts:148-211`)? What should zoom 0.25 look like when it is below the native size?
3. **Fractional and capped pixel ratios.** On 1.25×, 1.5× and 2.625× screens, should the canvas render at a whole
   ratio and be stretched with `image-rendering: pixelated`, or are uneven pixels acceptable? Does the phone cap of
   2 and the `auto` step down to 1 stay?
4. **Meaning of `low` quality.** Pixel art at native resolution is already cheap. Should `low` still mean a 1×
   canvas, or something else?
5. **Rasteriser.** Keep the existing vector art functions and add a pixel pass in `buildSprite`, or write a new
   pixel rasteriser behind the `shapes.ts` primitives, or redraw the art? The draft scripts drew shapes without
   anti-aliasing, snapped colours to ramps, and added the outline by growing the alpha mask
   (`concepts/pixel3.py:73-76, 200-217`).
6. **Palette scope.** One fixed palette for the game, or one per theme? The draft script has 13 base ramps of 3 to
   6 colours and replaces some ramps per theme (`concepts/pixel3.py:12-62`).
7. **Blended colours.** Are off-palette colours acceptable for ghosts, ownership tints, weather and the night
   light pass, or must those become dithered or palette-mapped?
8. **Ride frames.** Do rides keep 32 angles (16 on phones), or fewer, hand-tuned frames?
9. **Outlines on multi-tile objects.** Should a ride's outline extend past its footprint corners? If so the ride
   bounds and the column cutter need a margin (`sprites/rides.ts:53`, `renderer.ts:350-363`).
10. **Terrain exact-scale images.** Turn them off for pixel art (`renderer.ts:906`), or keep them on desktops?
11. **Card pictures.** Should a card show the map sprite at a whole-number scale, or a cropped scene as in the
    drafts? The preview box is 168 × 120 CSS px today (`src/ui/decks/card.ts:82-83`).
12. **Overlays.** Do hover, selection and ghost outlines become pixel-styled, or stay smooth lines?
13. **Tests.** How will pixel output be checked, given that unit tests use a canvas without pixels
    (`tests/unit/render/fakeCanvas.ts`)? The colour check in `tests/e2e/paths.spec.ts:106-110` depends on the
    current footpath colour.
14. **Bundle size.** If art becomes bitmap data in code (rows of characters, as in the draft stamps at
    `concepts/pixel3.py:256-282`), how much of the 400 KB load budget may it use? The ADR's last figure was 314 KB;
    the current figure needs a fresh measurement.
