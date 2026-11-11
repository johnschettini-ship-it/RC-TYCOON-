# Recommendation: how "Thrills & Chills" gets the draft's pixel art

Lead architect's decision, 2026-11-11. Read-only on the repository at `fab5189`; nothing there was changed, built or
run. Repository paths are relative to `/home/user/RC-TYCOON-`. `SCRATCH/` means
`/tmp/claude-0/-home-user-RC-TYCOON-/29ee6f8c-df84-5112-ac7e-04cfb7614dae/scratchpad/`. `pixel3.py` is
`SCRATCH/concepts/pixel3.py`. Inputs: the three proposals and three attacks in `SCRATCH/art/approach/`, the maps
`critic.md`, `core.md`, `drafts-constraints.md` (read in full) and the code lines cited below (re-read for this
document). Section 8 settles the points where attackers and proposers disagree.

Words: a **world pixel** is one pixel at zoom 1 on a 1x screen (tile 64 x 32). An **art pixel** is one pixel of the
approved drafts = 2 x 2 world pixels (tile 32 x 16). A **slot** is one palette colour. **k** = device pixels per
canvas pixel, **n** = canvas pixels per art pixel; both whole.

---

## 1. Recommendation in plain words

1. We teach the game to draw the way the approved drafts were drawn: square pixels, a fixed set of colours, and a
   thin dark outline around every object.
2. We do not throw the old drawings away; we give them a new pencil that can only make sharp, whole pixels in the
   draft's colours.
3. Small things (guests, staff, benches, lamps, horses, mascots) are redrawn by hand as tiny pixel pictures, as in
   the drafts.
4. The first thing the player sees is the ground: textured grass, paved paths and clear water, plus draft-style
   guests, all behind an "Art style: Pixel (preview)" switch in Settings.
5. Next come the big eye-catchers: the carousel, the big wheel, the towers, the stalls, the trees, then the roller
   coaster and its trains.
6. Only when those look like the drafts does the pixel style become the normal look; until then today's look stays
   the default, so the game can ship at every step.
7. After that, the other rides and the other scenery themes are redrawn, then night, weather and the light shows.
8. Zoom changes from a smooth slide to clear steps, because pixels are only sharp at whole sizes.
9. Card pictures and the Frost and Spark mascots use the same pixel art as the park.
10. Cost: one small trial, then about nine stages: two small or medium and seven large.
11. The trial comes first: one small real park, drawn both ways, at desktop and phone size, with speed numbers.
12. If the owner does not see a clear step toward the drafts in that trial, we stop before the large work starts.

---

## 2. The chosen approach

**Winner: the rasteriser** (`proposal-rasterizer.md`), repaired for every fatal and serious flaw the attacks found,
with the zoom policy, the style switch and the build budget of the staged hybrid, and the stamp format, mirror
rule, card rule and authoring checks of the authored proposal grafted in.

### 2.1 Why this one

- It is the only proposal whose core has been run on the game's real, unchanged art functions (bench re-run by the
  attacker: rides 0.285 ms mean, stalls 0.10, scenery 0.12, guests 0.024 in Node; `attack-rasterizer.md` 1.1). The
  tuned carousel in `rasterizer-proof-tuned-scene.png` is at draft level inside the game's own rules (3 x 3
  footprint, angle and rider inputs, Canvas-style calls).
- It never reads a canvas back, so it runs in Node, keeps the recorder tests green untouched (the recorders stand in
  for the context, `tests/unit/render/content/recorder.ts:96-110`), and lets unit tests check real pixels for the
  first time.
- It keeps the procedural route that animation needs: 32 angles x 5 rider levels per ride (`src/render/anim.ts:9,
  57-60`) and 16 x 24 x 16 car poses (`src/render/track/layer.ts:840-846`) cannot be authored by hand. The authored
  proposal's trains fail on exactly this (`attack-authored.md` F1); the hybrid's filter pass costs a bucket-2 paint
  plus a read-back per sprite and keeps the filter look on cars for good.
- Its weak points are all repairable: wrong colours from nearest-slot snapping, a look-the-owner-rejected interim,
  track outlines at cuts, shadow sources, and the stage sizes. Sections 2.3 to 2.7 repair each.

### 2.2 Pipeline

```
bank.ride / stall / guest / ...         src/render/sprites/bank.ts:97-207   (unchanged signatures)
  cache miss, shared build budget left? (new BuildBudget, see 2.6)
  buildSprite(bounds, scale, paint, tint, opts?)   src/render/canvas.ts:56-72
    style = artStyle()                             new src/render/pixel/style.ts
    'classic': today's body, unchanged
    'pixel':
      1 s = PixelSurface.acquire(bounds, opts)     bounds widened to even world px -> whole art px anchor
      2 paint(s)                                   the SAME art function; it now gets an ArtCtx
      3 s.finish()                                 ink ring per layer; no ink on strokes; no ink on cut edges
      4 tint ? s.remap(ghostTable(tint))           replaces the source-atop wash (canvas.ts:64-70)
      5 image = makeCanvas(s.w, s.h); s.blitTo(ctx) putImageData if ctx.createImageData exists, else emitRuns
      6 return { image, w, h, ox, oy, scale: 0.5 } Sprite record unchanged (spriteCache.ts:14-21)
renderer frame                                     src/render/renderer.ts:1046-1147
  scale = n / 2, bucket = 0.5, offX/offY rounded, smoothing off  (:1059-1062, :1071, :1018)
  every blit through blitArt / blitArtColumn       the five copies (critic fact 5)
  shadow pass in a new world layer's drawGround    src/render/layers.ts:60, renderer.ts:1089
```

### 2.3 New units (all under `src/render/pixel/`; nothing under `src/sim/`)

| File | Exports | Job, and which flaw it repairs |
|---|---|---|
| `style.ts` | `type ArtStyle = 'classic' \| 'pixel'`, `artStyle()`, `setArtStyle()`, `artStyleVersion()` | Module state like `src/perf/quality.ts:122-138`. Read from the setting, the address flag `?art=pixel` and `import.meta.env.VITE_ART`. Repairs rasterizer F1 and S6 (no way back): Classic stays the default until the owner flips it (stage 4). From the hybrid. |
| `palette.ts` | `RAMPS` (the 13 draft ramps, `pixel3.py:12-26`, plus a neutral grey ramp `n`, a cold snow ramp `e`, and a 3-step ramp for each of the 12 player track colours), `SIGNAL` (the 4 safe colours `src/data/tuning/a11y.ts:15`, the 9 tint steps `src/render/palette.ts:84`, ghost tones), `INK = i3`, `slotOf(css)`, `tone(css, steps)`, `RGBA`, `ghostTable(tint)` | Signals are fixed slots; no art colour may land on them. |
| `colourMap.ts` (generated, checked in) | `COLOUR_MAP: Record<string, [ramp, tone]>` | **Repairs the colour collapse** (rasterizer F1, hybrid serious 1): every one of the ~733 colour literals under `src/render` (critic B.8) gets a ramp and a tone once, by a script plus an eye check, not by nearest RGB. Grass `#6dbb4f` / `#64b049` (`src/render/terrain.ts:29`) become two tones of `g`, not `l2` / `l3`; queue `#a9c0d2` (`:40`) goes to `n` or `b`, not water `a1`; silver and charcoal track colours go to `n`. Dark fills map at least one tone off `i3`. |
| `surface.ts` | `class PixelSurface implements ArtCtx` with the Canvas subset of the proposal (2.1) **plus** `translate`, `scale`, `rotate`, `setTransform` on an internal matrix stack (needed by `src/render/sprites/props.ts:171`, `src/render/sprites/litter.ts:161, 217`), `layer(ink = true)`, `edge(side)`, `finish()`, `remap()`, `blitTo()`, `emitRuns(ctx)`, `hash()` | Ported from `SCRATCH/art/approach/rasterizer-poc/pixelctx.mjs` (541 lines). Rules: a fill sets pixels whose centre is inside plus edge pixels; a stroke is a Bresenham line `max(1, round(lineWidth / 2))` wide and **goes to a no-ink mask** (the hybrid's erosion insight, done without erosion: spokes, ropes, rails and lattice get no black web); translucent colours mix-and-snap over existing pixels, else a 4 x 4 ordered dither. `edge(side)` marks a sprite side as a cut: no ink on that side and the paint runs one sample past it. Repairs the cut-outline flaw (rasterizer S2, hybrid serious 4). |
| `colour resolution` (inside `surface.ts`) | `slotOf` order: `COLOUR_MAP` hit; else a derived colour recorded by `shade` / `mixHex` (`src/render/palette.ts:122-132`, `src/render/scenery/art/kit.ts:78-87`) as `(base, factor)` → base's ramp moved by `round(log(f) / log(1.18))` tones; else nearest slot **inside the hue family** and a counter of misses | `shade` and `mixHex` get a 3-line memo map; their outputs do not change, so Classic and every test is unaffected. A unit test builds every sprite and fails on any miss. |
| `grid.ts` | `ART_SCALE = 0.5`, `planStretch(deviceRatio, cap)`, `artScale(zoom, grid)` (n or 0), `zoomLevels(grid)`, `nearestLevel`, `stepLevel`, `blitArt`, `blitArtColumn(…, edge)` | Section 3. One blit for all five copies. `edge` draws the pad of the first and last ride column, so outlines at footprint corners are not cut (`src/render/renderer.ts:355-359`). |
| `ground.ts` | `paintGroundChunk(s, map, rect, rotation, env)`, `hash3`, `vnoise`, `BAYER4` | Draft grass (`pixel3.py:115-119`), slabs (`:160-169`), opaque water with shores (`:121-142`); slopes move one tone up or down; land outside the park two tones down (today `x 0.78`, `terrain.ts:35`); cliffs two-tone with strata. Sample walk in tile space with the bilinear height (`terrain.ts:80-82`), as the hybrid specified; its bench: 2.6 ms per 8 x 8 chunk in Node (`staged-hybrid-bench/bench-output.txt`). |
| `stamp.ts`, `sprites/{people,staff,props,rideParts,mascots,icons}.ts` | `stamp(ctx, rows, x, y, map, opts?: { mirror?: boolean })`, `px()` | Letter rows as in `pixel3.py:256-282`; one `fillRect` per run, so recorders see fills. Mirror swaps palette entries marked `<` (lit) and `>` (dark) (authored proposal 2.1), so a mirrored sprite keeps light on the screen left (repairs rasterizer attack 2, "flip mirrors the shading"). |
| `shadows.ts` | `SHADOW_CASTERS` table by kind (ride footprint and height from `src/render/sprites/rides.ts:32-37`, stall box, scenery from `heightM` in `src/data/catalog/scenery.ts`), `createPixelShadowLayer(): WorldLayer` | **Repairs "no source of shadow shapes"** (rasterizer S3, authored W7): shapes come from catalog data, not from inside art functions. Drawn every frame in the layer's `drawGround` (`src/render/layers.ts:60`, called at `renderer.ts:1089`, before all objects as in the draft, `pixel3.py:768-770`) as cached hard-edged art-pixel masks with `multiply` by one fixed plum tone matching `mix(p, i2, 0.3)` (`pixel3.py:184`). No chunk rebuild, no tracker change, edge scenery included. The 62 in-art `shadow` calls (`kit.ts:91-93`) return early in pixel style. |
| `budget.ts` | `BuildBudget { beginFrame(); take(): boolean }`, 4 ms per frame on desktop, 6 ms on phones | **Repairs uncapped builds** (hybrid serious 3): stalls, staff, scenery, shows and rides all draw from one budget. On a miss a ride keeps its last sprite; `bank.ride` (`src/render/sprites/bank.ts:97-111`) returns `null` and `renderer.ts:453` keeps `rideSprites[ri]` when the result is null; a first sight with no sprite builds anyway. |

`src/render/sprites/shapes.ts:6`: `Ctx` stays the real-canvas type (it is also the type of `makeCanvas`,
`canvas.ts:12, 23`). A new `ArtCtx` interface is what art helpers and art functions accept; both real contexts and
`PixelSurface` satisfy it (repairs rasterizer attack 1.2 item 3).

### 2.4 Changes to existing code

| Where | Change |
|---|---|
| `src/render/canvas.ts:56-72` | Pixel branch as in 2.2; optional `opts: { ink?: boolean; edges?: number; pad?: number }`. |
| `src/render/renderer.ts:1059-1062, 1071, 1018` | Pixel style: `n = artScale(zoom, grid)`; when `n > 0`, `scale = n / 2`, offsets rounded; `bucket = 0.5`; smoothing off (on only at the far overview). The renderer never changes `cam.zoom` itself, so tests that set zoom 0.6 (`tests/unit/render/staticLayer.test.ts:217-219`) keep their meaning. |
| `renderer.ts:338-363`, `scenery/layer.ts:60-83`, `shows/layer.ts:113-135`, `track/layer.ts:670-677`, `terrain.ts:638-643` | Call `blitArt` / `blitArtColumn` in pixel style. With `sp.scale = 0.5` and `scale = n / 2` the factor is `n`; static anchors are multiples of 2 world px (critic C.2), so both rounded edges are exact. |
| `renderer.ts:898-917` `applyPlan`, `src/perf/quality.ts:64-77` | The plan gains `stretch` (k). `#game[data-art="pixel"] { image-rendering: pixelated; }` in `src/styles/main.css:34`. The canvas keeps CSS size 100 %, so `src/main.ts:35` (observes the canvas) keeps working. `terrain.allowExact = false` in pixel style (`renderer.ts:906`). |
| `renderer.ts:553-554`; `management/layer.ts` staff; `track/layer.ts:862-865` cars | Walker anchors snapped to the art grid along the walking line: x first, y from the line, so a 2:1 path is a clean stair (repairs rasterizer S4). |
| `terrain.ts:542-561` | Pixel branch: `PixelSurface` + `paintGroundChunk`, one image per chunk and rotation at art scale. The 6 ms first-build rule (`terrain.ts:407`) stays. |
| `src/input/controller.ts:123-129, 150-153, 277-282`; `src/input/camera.ts:83-88` | Pixel style: wheel and keys step one level; trackpad pixel deltas accumulate fractional notches and step when the sum passes one notch (repairs authored W4); a pinch is free and settles to the nearest level on release; the controller reads the published grid (`grid.ts`), not a renderer local (repairs W4's "controller has no ratio"). |
| `src/render/track/paint.ts:142-166, 169-223, 332-336` | `polyline`, `quad`, `band`, `faceLight`, `paintBox` pick ramp tones; rails are drawn from shared sample points; slices built with `edge` flags for both cut sides (`track/layer.ts:175-190, 691`). Cars stay code-drawn boxes on the surface in the full pose space (`track/layer.ts:840-846`); noses, cabs and riders become stamps. Riders (`track/layer.ts:881-921`) become stamped heads on the art grid. |
| `renderer.ts:1157-1198` `drawPreview`; `src/ui/decks/card.ts:82-117` | Pixel style: the real sprite on a patch of textured ground, at the largest whole scale that covers the box, smoothing off, cropped on a focus point (the draft cards are crops, critic C.1). |
| `src/ui/scenario/mascotArt.ts:109-134`, `src/ui/mascots.ts` | Frost 11 x 14 and Spark 13 x 13 (`pixel3.py:263-264`) plus a 22 x 28 portrait with moods, drawn at a whole number of device pixels per art pixel. |

### 2.5 What the art functions do over time

- **Untouched first.** In stage 1 every one of the 174 world-art functions (critic C.7 group A) runs unchanged on
  the surface and comes out hard-edged, outlined and in ramp colours.
- **Primitives next.** `box`, `cylinder`, `cone`, `pyramid`, `head` (`shapes.ts:58-179`) and the 24 kit helpers get
  the draft's shading (`pixel3.py:220-241`): this lifts everything drawn through them (385 calls, `core.md` 2.2).
  Direct `arc` / `ellipse` calls (117, critic C.7) are fixed per object later.
- **Per object last, by the data-or-code rule** (authored proposal 2.3): a part that only moves is a stamp; a member
  that turns to any angle is drawn by code; a stamp is never rotated. Calls are additive and safe on a real canvas
  (`ctx.layer?.()`, `tone()` on strings, stamps as `fillRect`), so Classic keeps working until it is removed.
- **Authoring checks** for every batch (from the authored proposal 2.5): a Node contact sheet (`scripts/pixel-sheet.ts`,
  PNG writer on `node:zlib`, output untracked), a lint test (palette only, outline closed, inside bounds, lit side
  left), side-by-side with the draft crop, one critic for the whole project, and in-park pictures for the owner.

### 2.6 Rules and tests

- **No image files.** Art is TypeScript and letter rows; `scripts/check-release.ts:36-38, 46` is not touched. The
  master spec line "All graphics are drawn in code" (`…design.md:39`) still holds: the stamps are code-side data in
  the same sense as `pixel3.py:256-282`.
- **Bundle.** Rasteriser 4 KB, palette and colour map 4 KB, ground and shadows 3 KB, stamps 6 to 10 KB, art edits
  6 to 9 KB, minus removed vector guests, staff, litter and bucket code: net about + 20 to 30 KB on 310 KB measured
  (`attack-authored.md` 1.1). Both styles ship only until stage 5. A unit test fails if the gzip of
  `src/render/pixel/**` passes 40 KB.
- **Determinism.** Whole-number raster, `Math.imul` hashes, no time, no random, no read-back; alpha only 0 or 255.
- **Recorder tests** (`tests/unit/render/content/art.test.ts`, `phase6Art.test.ts`, `tests/unit/scenery/art.test.ts`,
  `tests/unit/render/track/slices.test.ts`, `phase6Render.test.ts`) pass unchanged: the art functions still call
  the context they are given; the Proxy recorder logs `layer` and `edge` as plain ops
  (`tests/unit/render/content/recorder.ts:104-106`); the slices recorder returns a no-op for unknown keys
  (`tests/unit/render/track/slices.test.ts:43`). Stamps record `fillStyle` from the map they are given, so the
  item-colour assertion (`tests/unit/render/guestItems.test.ts:68-69`) holds when item colours map to themselves.
- **New Node tests with pixels:** `tests/unit/render/pixel/{surface,colourMap,grid,sprites,ground,stamp}.test.ts`
  (2:1 stairs, no gaps on shared edges, no colour misses over all sprites, face pairs on one ramp with two tones,
  4 rotations differ, frames differ, golden hashes for carousel frame 0 and guest front, levels per ratio).
  `tests/e2e/pixelGrid.spec.ts`: at a level, every `n·k` block outside overlays is one colour, desktop and phone.
- **Colour-blind.** `tests/unit/render/pixel/palette.test.ts` runs the signal pairs, the Thrill and Chill ramp mid
  tones and queue against footpath through protan, deutan and tritan matrices with a minimum distance; it runs
  before any art is tuned. None of the 59 draft colours is among the 16 banned literals
  (`tests/unit/render/safeColours.test.ts:26-43`; checked by two proposers).

### 2.7 Grafted from the other two

| From | What |
|---|---|
| Staged hybrid | k/n zoom policy with CSS 100 % and `image-rendering: pixelated`; the renderer never snaps; pinch settles on release; style switch while both styles live; walker snapping along the line; native ground painter design; shared build cap idea. |
| Authored | Stamp format and the lit/dark mirror swap; data-or-code rule; batch process with sheets, lint and critic; whole-scale card pictures; ride and scenery strips that run to the sprite edge; `pixGrid` browser check; lamp on a deck drawn at deck height (`management/layer.ts:215, 222`, critic B.11) fixed while path items are redrawn. |
| Attacks | Ramp-preserving colour map; grey and snow ramps; `edge` cut lines; trains as code with stamped noses; shared ms budget; phone measured against today's passing `auto` run; track in the prototype; honest stage sizes. |

---

## 3. Zoom and sharp pixels

### 3.1 The policy

- **One art pixel is always `n x k` device pixels, both whole.** `k` = device pixels per canvas pixel, applied by
  the browser with `image-rendering: pixelated`; `n` = canvas pixels per art pixel. Zoom levels are
  `zoom = n x k / (2 x device ratio)` inside today's range 0.25 to 2.0 (`src/render/camera.ts:6-7`).
- **k** is the smallest whole number that keeps the canvas ratio at or under today's cap: desktop 1; phone class
  `ceil(ratio / 2)` (cap 2, `src/data/tuning/perf.ts:7`); `low` and the `auto` step down use the low cap
  `ceil(ratio / 1)` but never push a ratio-1 desktop below canvas ratio 1 (`quality.ts:71`, repairs authored W5).
- **Backing size** = `ceil(device size / k)`; CSS size stays 100 %. Where the device size is not a multiple of k,
  one canvas row or column is one device pixel narrower. That is the only unevenness at rest.
- **The renderer draws any zoom it is given.** At a level everything is exact. Between levels (a pinch in progress,
  a script) smoothing stays off and pixels are uneven for that moment; nothing blurs. The controller settles to a
  level on release, after a resize, and after a plan change.
- **Far overview.** Where 0.25 is less than one canvas pixel per art pixel (1x and 1.25x desktops, phones at k = 2),
  0.25 is kept as one extra level drawn with smoothing on from chunks built without the Bayer dither (no moire).
  Guests are dots there already (`src/data/tuning/perf.ts:12`). Owner decision 2.
- **Home level** is the level nearest to 2 CSS pixels per art pixel (the approved scale, critic B.1). The game starts
  there; `src/game.ts:17` zoom 1 is settled on the first frame.
- **Interface pictures** (cards, mascots) use a whole number of device pixels per art pixel and set their CSS box from
  it, so a box may change by a few pixels per screen. The approved board already shows small mascots at uneven
  scales (3.27, 3.38; critic C.1); we do better than the board.

### 3.2 Levels by screen

| Screen | k | Crisp zoom levels | Home |
|---|---|---|---|
| Desktop 1x | 1 | 0.5, 1, 1.5, 2 (+ 0.25 soft) | 1 (exact draft) |
| Desktop 1.25x | 1 | 0.4, 0.8, 1.2, 1.6, 2 (+ 0.25 soft) | 0.8 (art pixel 1.6 CSS px) |
| Desktop 1.5x | 1 | 0.33, 0.67, 1, 1.33, 1.67, 2 | 1 |
| Desktop or phone 2x | 1 | 0.25 to 2 in steps of 0.25 | 1 |
| Phone 2.625x (Pixel 7) | 2 | 0.38, 0.76, 1.14, 1.52, 1.90 (+ 0.25 soft) | 1.14 |
| Phone 3x | 2 | 0.33 to 2 in steps of 0.33 | 1 |
| Pixel 7 at `low` or after the `auto` step down | 3 | 0.57, 1.14, 1.71 (+ 0.25 soft) | 1.14 |

Phone cost: the Pixel 7 canvas at k = 2 is 541 x 1201 (`attack-staged-hybrid.md` 1.1), fewer pixels than today's
fixed 2x (824 x 1830) but 1.72 times the canvas of the only setting that passes the budget today, `auto` after its
step down to 1x (`docs/adr/0001-renderer.md:93-104`: p95 33.4 ms at 1x, 83 ms at 2x). The prototype measures it;
if it fails, the phone default becomes k = 3 (0.875 canvas ratio, three crisp levels).

### 3.3 What changes for the player

- Zoom clicks between 4 to 8 sizes (11 on a 3x desktop) instead of gliding by 15 %. One wheel notch or key press is
  one size; a trackpad swipe steps when it has moved one notch's worth. A pinch follows the fingers and then
  settles in about 100 ms (at once with reduced motion).
- At rest every pixel is a crisp square on every screen; nothing is ever blurred except the far overview.
- On a standard monitor the step from the closest overview size (0.5) to the normal size (1) doubles the picture.
- On 125 % Windows screens the normal view is 20 % smaller than the draft (zoom 1 is not a level there).
- Panning stays smooth to one canvas pixel; people and trains move in single art-pixel steps.
- On phones above 2x, map overlays drawn into the canvas (selection lines, cost labels) are slightly blockier until
  stage 7 redraws them; the HTML interface is not affected.
- Zooming is instant: one image per sprite, nothing is rebuilt on a zoom change.
- The tutorial's "zoom" step (`src/ui/scenario/tutorialUi.ts:21, 135`) asks for "one size" instead of a change of
  0.25.

---

## 4. Stages

Sizes: small, medium, large (no time estimates). Each stage merges with the full suite green, the bundle and
performance figures re-measured, and a set of owner pictures. The game ships after every stage: until stage 4
Classic is the default and Pixel is a preview in Settings.

| # | Stage | What the player sees | Files | Size | Tests that prove it |
|---|---|---|---|---|---|
| 0 | **Prototype** (section 6, throwaway worktree) | Nothing; the owner sees before and after pictures | worktree only | small | kill rules in section 6 |
| 1 | **Pixel frame (preview)** | With "Art style: Pixel (preview)" on: stepped zoom, crisp pixels, draft ground (grass patches, slab paths, shore lines, toned slopes, plain two-tone cliffs), every object hard-edged and outlined in ramp colours. Classic stays default. | New `pixel/{style,palette,colourMap,surface,grid,ground,budget}.ts`, `scripts/pixel-colours.ts`, `scripts/pixel-sheet.ts`. Changed: `canvas.ts`, `renderer.ts`, `terrain.ts`, `scenery/layer.ts`, `shows/layer.ts`, `track/layer.ts`, `sprites/bank.ts`, `sprites/shapes.ts` (types), `palette.ts` (memo), `perf/quality.ts`, `input/controller.ts`, `input/camera.ts`, `styles/main.css`, `settings/{types,schema}.ts` (version 3 with migration, `schema.ts:13`), `ui/settings/model.ts`, `ui/scenario/tutorialUi.ts`, strings | large | new `pixel/surface`, `colourMap`, `grid`, `ground` unit tests; `pixelGrid.spec.ts` on desktop and phone with `?art=pixel`; all existing tests unchanged in Classic; `quality.test.ts` gains k cases |
| 2 | **Draft shapes, shadows, people and mascots** | Lit and dark sides and highlights everywhere; ground shadows; draft guests (front, back, two steps, sit, items), staff and costumes, solid and notched rings; benches, bins, lamps, litter, fence and entrance; pixel Frost and Spark in the mood bar and tips | `sprites/shapes.ts`, `sprites/content/kit.ts`, `scenery/art/kit.ts`, new `pixel/{stamp,shadows}.ts`, `pixel/sprites/{people,staff,props,mascots}.ts`, `sprites/props.ts`, `sprites/staff.ts`, `sprites/litter.ts`, `management/layer.ts`, `worldLayers.ts`, `renderer.ts` (cull margins `:563-564`, arrow `:821-823`), `ui/scenario/mascotArt.ts`, `ui/mascots.ts` | large | `pixel/stamp.test.ts` (mirror keeps light left), sprite hashes for guest front and back; `guestItems.test.ts` and `a11y/palette.test.ts:59-78` updated with listed reasons (bounds top −24; ring checked by pixels: gaps for Thrill) |
| 3 | **Hero rides, stalls and trees** | Carousel, big wheel, swing tower, drop tower and observation tower at the level of the proof carousel; 14 stalls on one stall kit with striped awnings, icon on a pole and designed backs; Base Set and Classic Fair green items with three-tone foliage and specks | `sprites/rides.ts`, `sprites/content/{gentleRides,thrillRides}.ts` (heroes only), `sprites/stalls.ts`, `sprites/content/stalls.ts`, `pixel/sprites/{rideParts,icons}.ts`, `scenery/art/{base,fair}.ts`, `lighting/pass.ts:45-54` (bulb positions) | large | recorder tests unchanged; `pixel/sprites.test.ts` (4 rotations differ, frames differ, outline closed, inside bounds); owner sheet per batch |
| 4 | **Track, trains, card pictures; Pixel becomes the default** | Coasters with rail ribbons, trestles and columns, no ink across tile joins, shaded cars with stamped noses and riders, stations; card and picker pictures are crops of the pixel sprites. After the owner's review Pixel is the default (Classic still selectable) | `track/paint.ts`, `track/layer.ts`, `track/colours.ts`, `track/preview.ts`, `renderer.ts` (`drawPreview`), `scenery/preview.ts`, `shows/preview.ts`, `ui/decks/card.ts`, `ui/scenery/picker.ts`, `ui/shows/picker.ts`, `settings/schema.ts` (default) | large | `slices.test.ts`, `phase6Render.test.ts` unchanged; new seam test (no ink pixel on a slice's cut side, rail continuous across two slices); `waterRender.test.ts:145-169` updated (ripples as pixel dashes) |
| 5 | **Other 13 flat rides, gates and decks; Classic removed** | Every flat ride redrawn; ride gates and booths; elevated paths as pixel decks with post columns | `sprites/content/{gentleRides,thrillRides,phase6Rides,index}.ts`, `track/paint.ts` (gate booth), `elevated/layer.ts`; delete the Classic branch of `buildSprite`, exact-scale chunk code, bucket paths | large | `paths/layer.test.ts:84-93`, `tests/e2e/paths.spec.ts:106-110` re-pinned to the path tone; `terrain.test.ts:125-164`, `staticLayer.test.ts:122` replaced (one image per chunk and rotation at art scale, about 260 px wide); controller and camera tests rewritten for levels |
| 6 | **Other scenery themes and show sites** | Frost Peaks, Volcano Ridge, Spooky Hollow, Jungle Lagoon, Starport (60 items) and the two show sites, reviewed on sheets; dark themes get wider tone steps; hedges and walls tile with no ink at joins | `scenery/art/{frost,volcano,spooky,jungle,starport,index}.ts`, `shows/art.ts` | large (light work per item) | `tests/unit/scenery/art.test.ts` unchanged; sheet per theme |
| 7 | **Overlays and ghosts** | Ghosts in four palette tones of the safe blue or vermillion with stamped check, cross and hatch; tile outlines and selection as pixel dashes on 2:1 stairs; Calm, Buzz, Light and land tints as aligned dither | `renderer.ts:623-871`, `a11y/layer.ts`, `fields/overlay.ts`, `terrainTools/layer.ts`, `management/layer.ts`, `scenery/layer.ts`, `shows/layer.ts`, `track/layer.ts`, `elevated/layer.ts`, `lighting/overlay.ts` | medium | `safeColours.test.ts` (ghost tones from the safe pair; high contrast doubles dashes) |
| 8 | **Night, weather, shows** | Banded light pools with dithered borders on the art grid, crisp bulbs, pixel rain, stepped beams, pixel fireworks, water sparkle | `lighting/{pass,sprites}.ts`, `shows/fx.ts`, `shows/layer.ts`, `management/layer.ts` | medium | `lighting/layer.test.ts:153-258` (divisor follows the art grid), `afterDark.spec.ts:108-125` re-checked, `shows/render.test.ts` |
| 9 | **Close-out** | No visible change; new owner screenshots | remove dead code (`shade` callers left, `canvasPixelRatio`), ADR and spec updates, fresh bundle and performance run, `docs/screenshots` retaken at levels | small | full suite, `perf.spec.ts` and `perf-build3.spec.ts` with `TC_PERF=1` |

Order rule: what the owner judges first (heroes, people, the coaster) comes before what is numerous but quiet
(themed scenery). Stages 5, 6 and 7 touch separate files and can run in parallel after stage 4.

---

## 5. Decisions for the owner

1. **Zoom in steps?** (a) Yes: 4 to 8 crisp sizes, a pinch glides then settles. (b) No: smooth zoom, uneven pixels
   between sizes. **Recommended: (a).** Without it no approach gives square pixels.
2. **The farthest zoom on standard monitors?** (a) Keep it as a soft, slightly blurred overview. (b) Stop at the
   farthest crisp size (0.5 on a 1x monitor). **Recommended: (a)**; guests are dots there already.
3. **When does the pixel look become the normal look?** (a) After people, ground, hero rides and stalls (stage 3).
   (b) After the coaster and card pictures too (stage 4). (c) Only when everything is redrawn. **Recommended: (b)**;
   the coaster is the largest object in the approved picture.
4. **Ride sizes?** (a) Keep today's footprints and let rides grow taller (the big wheel stays about half the draft's
   width). (b) Plan bigger footprints for hero rides later, as a game-rule change outside this project.
   **Recommended: (a)** now, (b) left open.
5. **Night?** (a) Banded, dithered pixel night in stage 8. (b) Keep today's smooth darkening over the pixel park for
   good and skip stage 8's light work. **Recommended: (a)**, since the approved drafts have no night yet and it is
   the last stage either way.

---

## 6. The prototype

A throwaway experiment that is never merged. It answers three questions: is it clearly closer to the drafts than
the filter the owner turned down, is it fast enough on the phone profile, and does track work.

**Where.** A separate worktree at the current commit, outside the main checkout so other agents' tests are not
disturbed:
`git -C /home/user/RC-TYCOON- worktree add --detach SCRATCH/art/proto/wt fab5189`, then `npm ci` inside it.

**The scene** (built by commands through `window.__tc`, `src/main.ts:45`, as `tests/e2e/screenshot.spec.ts:33-91`
does): a new park (`newPark`, `tests/e2e/helpers.ts:22`), `borrow`, a footpath cross of about 12 tiles each way, a
`carousel` and a `big_wheel` (rotation 2, one queue tile each, open), one `snack_shack` stall facing the path, six
trees and shrubs (`oak_round`, `pine_tall`, `birch_silver`, `shrub_round`, `bed_mixed`, `fountain_garden`,
`src/data/catalog/scenery.ts:48-57`) placed with `placeScenery`, two benches and a lamp, park open, `step(6000)` so
guests walk and queue, speed 0. Camera centred on the carousel at the home level (zoom 1 on desktop 1x, 1.14 on the
Pixel 7 profile). The same scene and camera for before and after.

**Files it touches (in the worktree only).**

| File | What |
|---|---|
| new `src/render/pixel/style.ts` | `artStyle()` from `?art=pixel` or `VITE_ART=pixel` |
| new `src/render/pixel/palette.ts`, `colourMap.ts` | 13 ramps + grey + snow; hand map for the colours of the scene's objects and terrain (about 80 literals), derived-colour memo |
| new `src/render/pixel/surface.ts` | port of `rasterizer-poc/pixelctx.mjs`, plus `translate`/`scale`, stroke no-ink rule, `edge` |
| new `src/render/pixel/grid.ts` | k and n, levels for ratio 1 and 2.625, `blitArt`, `blitArtColumn(edge)` |
| new `src/render/pixel/ground.ts` | grass, slab paths, flat and sloped tops |
| new `src/render/pixel/stamp.ts`, `sprites/people.ts` | draft guest rows, stand, back, two steps, shirt map |
| new `src/render/pixel/shadows.ts` | casters for ride, stall, trees; `drawGround` layer |
| `src/render/canvas.ts:56-72` | pixel branch in `buildSprite` |
| `src/render/renderer.ts:338-363, 1018, 1059-1071, 898-917` | scale n / 2, bucket 0.5, rounded offsets, smoothing off, whole blit, plan k |
| `src/render/terrain.ts:542-561, 638-643` | pixel chunk build and blit |
| `src/render/scenery/layer.ts:60-83` | whole blit |
| `src/render/sprites/shapes.ts` | `ArtCtx` type; re-made `box`, `cylinder`, `cone`, `pyramid`, `head` from `rasterizer-poc/shapes.tuned.mjs` |
| `src/render/sprites/rides.ts:121-188` `drawCarousel` | the draft-style carousel from `rasterizer-poc/proof2.mjs:60-126` |
| `src/render/sprites/props.ts:140` `drawGuestArt` | calls `stamp` in pixel style |
| `src/render/palette.ts:122-132` | `shade` memo |
| `src/perf/quality.ts:64-77`, `src/styles/main.css:34` | `stretch` k; `#game[data-art="pixel"] { image-rendering: pixelated }` |
| new `tests/e2e/pixelProto.spec.ts` | builds the scene, saves the pictures to `$TC_PROTO_OUT`, reads build timings from a `window.__pixelStats` probe |
| new `tests/unit/render/pixel/protoSheet.test.ts` | Node sheet with real pixels: the 18 flat rides at frame 0, the steel coaster pieces of `screenshot.spec.ts:54-62` in 2 views with a 4-car train, written as PNG through `node:zlib` |

The big wheel and the stall stay on their unchanged art functions (with re-made primitives), so one picture shows
both the "untouched" floor and the "tuned" ceiling (carousel, guests).

**Command that makes the pictures** (run inside the worktree; its own port so other agents' servers are not hit):

```
cd SCRATCH/art/proto/wt && npm ci && \
TC_PROTO_OUT=SCRATCH/art/proto/out PW_PORT=4391 npx playwright test tests/e2e/pixelProto.spec.ts --project=desktop --project=phone && \
TC_PROTO_OUT=SCRATCH/art/proto/out TC_PIXEL_SHEET=1 npx vitest run tests/unit/render/pixel/protoSheet.test.ts && \
VITE_ART=pixel PW_PORT=4392 TC_PERF=1 npx playwright test tests/e2e/perf-build3.spec.ts --project=phone
```

(`SCRATCH` written out in full.) Outputs in `SCRATCH/art/proto/out/`: `before-desktop.png`, `after-desktop.png`
(1280 x 800, ratio 1), `before-phone.png`, `after-phone.png` (Pixel 7, 412 x 915 at 2.625), `strip-desktop.png`
(before, after and the matching crop of `docs/screenshots/phase-7-draft-desktop.png` side by side),
`sheet-rides-track.png`, `numbers.json` (frame p95 desktop and phone, slowest sprite and chunk build, sprite and
chunk memory). The worktree is removed afterwards with `git worktree remove`.

**It kills the approach, or changes it, if:**

- the owner does not call `after-desktop.png` a clear step toward the draft beyond the filter look already seen;
- any n x n block of `after-*.png` outside overlays holds two colours (the grid is wrong);
- the phone frame p95 is above 40 ms at k = 2 and also at k = 3 (if only k = 2 fails, k = 3 becomes the phone
  default);
- a chunk build is above 12 ms or a ride sprite above 3 ms on the throttled phone after one tuning round;
- the track sheet shows ink across rails at tile joins or gaps in rails (then stage 4 needs a new seam design
  before stage 1 starts);
- the recorder tests (`art.test.ts`, `phase6Art.test.ts`, `scenery/art.test.ts`, `slices.test.ts`) fail in Classic.

---

## 7. Risks that remain

1. **The draft look lives in per-object work.** The rasteriser gives crisp but plain art; draft quality comes from
   redrawing about 135 object functions (stages 2 to 6). If that work is cut short the game stays "crisp but plain".
   This is why Pixel is not the default before stage 4.
2. **Phone speed is unmeasured.** k = 2 on the Pixel 7 draws 1.72 times the canvas of today's passing setting.
   Fallback k = 3 has only three crisp sizes.
3. **Track at any angle.** Rails will not have the draft's clean single spline; cars are about 8 art pixels long and
   get blobby in loops and corkscrews. The prototype sheet is the first look.
4. **Turning parts shimmer.** Polygons that turn 1/32 per frame crawl by a pixel. Remedy per ride: stamps on whole
   pixels, no ink on spokes, 16 angles where 32 look busy (`anim.ts:71-75`).
5. **Rides are smaller than in the drafts** on today's footprints (wheel 3 tiles against 4.7). Height can grow,
   width cannot without a rule change (owner decision 4).
6. **New design the draft never showed:** slopes, cliffs, map edge, four terrain types, queues, decks, 15 of 18 rides,
   13 of 14 stalls, about 80 scenery items, back views, night. Each needs an owner sheet.
7. **The colour map is hand work** over about 733 literals plus derived colours. The miss test makes gaps visible but
   not taste; dark themes may still lose separation.
8. **Shadows are a multiply,** like night: hard-edged and correct in shape, but their colours are not palette slots.
   A palette-exact version would need chunk baking with the dirtying problems the attacks found.
9. **Crowds.** 7-pixel guests 4 pixels apart in queues can merge into a band of heads and ink. Remedy if needed:
   queue guests without side ink.
10. **Stepped zoom on 1x monitors** jumps 2x between 0.5 and 1, and on 1.25x screens the home size is 20 % off the
    draft. Some players will miss smooth zoom.
11. **Two styles in one code base until stage 5.** Art edits must stay safe on a real canvas; Classic will drift
    slightly (stamped guests) and is a safety net, not a product.
12. **Bundle and memory figures are estimates** until a clean build is measured at each stage (310 KB today, about
    90 KB free).
13. **Cross-browser pixel identity** is not guaranteed where an edge passes exactly through a pixel centre; golden
    hashes run in Node only.

---

## 8. Disputed points, checked against the code

| Point | Proposer said | Attacker said | Code says | Who is right |
|---|---|---|---|---|
| Nearest-slot snapping in rasterizer stage 2 and hybrid level 1 | "Plain but pixel-true"; "a few faces" | Checkerboard grass, water-coloured queues, hue shifts, 26 % of shade pairs flat | Re-run here on the draft ramps: `#6dbb4f` → `l2`, `#64b049` → `l3`, `#a9c0d2` → `a1`, `#f2f6fa` and `#e6edf3` → `c1`, `#dcc79c` → `c3`, `#9a7148` → `k3`, `#c4ccd6` → `t1`, `#3a414c` → `l5` (`terrain.ts:29-40`) | **Attackers.** Repaired by `colourMap.ts`. |
| Art uses only the listed Canvas subset | No transforms in sprite art | `translate`, `scale` exist | `src/render/sprites/props.ts:171` `ctx.translate(0, 1.5)`; `src/render/sprites/litter.ts:161, 217` `ctx.scale` | **Attacker.** Surface gets a matrix stack. |
| `Ctx` can become `ArtCtx` in place | Yes | No, `Ctx` is also the real canvas type | `src/render/canvas.ts:3, 12, 23` | **Attacker.** Two types. |
| Renderer snaps zoom | Rasterizer: yes | Breaks the 0.6 dot tests | `tests/unit/render/staticLayer.test.ts:217-219` expects 0 dots at 0.6 | **Attacker.** The hybrid's "renderer never snaps" is adopted. |
| A ride that misses keeps its last sprite | Hybrid: "as today" | No, overwritten every frame | `renderer.ts:453` assigns `bank.ride(...)` each frame; `bank.ts:97-111` always builds | **Attacker.** `bank.ride` returns null on budget miss. |
| Only rides need a build cap | Hybrid: 2 ride builds | Stalls, scenery, staff, shows uncapped too | `bank.ts:113-121` builds stalls with no cap; only guests have one (`bank.ts:82`) | **Attacker.** One shared ms budget. |
| Wheel notch = next level per event | Authored | Trackpads send fractions | `src/input/camera.ts:83-88` returns `1.15 ** notches` with fractional `notches` | **Attacker.** Notch accumulator. |
| `low` uses `n + 1` | Authored | Floor of 1 on desktop must stay | `src/perf/quality.ts:71` `Math.min(d, 1)` and `Math.max(1, autoMaxRatio)` | **Attacker.** |
| Phone canvas "57 % / 43 % fewer pixels" | Rasterizer, authored | Wrong baseline | ADR: p95 33.4 ms at 1x (`auto` stepped down), 83 ms at fixed 2x (`docs/adr/0001-renderer.md:93-104`) | **Attackers.** True against 2x, but 1.72x the passing setting; measured in the prototype. |
| Trains as a few authored poses | Authored: 4 headings x 3 pitches | Cannot follow steep slopes, loops, rolls | Pose key 16 yaw x 24 pitch x 16 roll (`track/layer.ts:840-846`) | **Attacker.** Cars stay code. |
| Recorder tests survive `ctx.layer?.()` | Rasterizer | Agreed | Proxy logs unknown methods (`recorder.ts:104-106`); slices recorder returns no-op (`slices.test.ts:43`) | **Proposer.** |
| Arch halves still add up with composed buffers | Authored | Op counts do not add | `tests/unit/scenery/art.test.ts:87` compares `ops.length` | **Attacker**, but moot: the chosen approach keeps the art functions, so back and front still emit their own calls. |
| Stand-in at scale 0.5 keeps thin lines | Authored | Rails 0.65 to 0.95 art px break into dots | The proof's one-pixel rule never drops a stroke (`rasterizer-poc/pixelctx.mjs`) | **Attacker** against the stand-in; the rasteriser's rule is the repair. |
| Smoothing set in three places | All | Agreed | `renderer.ts:1018, 1071`; `lighting/pass.ts:159-169` saves and restores | **Agreed.** |
| `main.ts` observes the canvas | Rasterizer sets canvas CSS size | Observer would stop seeing window changes | `src/main.ts:35` observes `canvas` | **Attacker.** CSS size stays 100 %, k by `pixelated`. |
