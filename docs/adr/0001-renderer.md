# ADR 0001 — Renderer: keep Canvas 2D, no PixiJS (Build 3)

- **Status:** Accepted (W4-E, Build 3). Reopen after the release's manual real-phone check if it fails (see Plan).
- **Spec:** Phase 6 §4.6 (budgets, method, work order, PixiJS decision rule, sprite cache limits), §8 (sprite cache
  budget), §9 (perf run, LRU by bytes); master §4 (upgrade path: one `Renderer` interface), §10 (budgets).

## Method

- **Scenes:** three schema 3 saves in `tests/perf/` built by `tests/perf/scenes.ts` (regenerate with
  `TC_WRITE_SCENES=1 npx vitest run tests/unit/perf/scenes.test.ts`): `build1` (64 × 64, 2,000 guests, 10 Mini Railway
  loops with 2 trains each, 4 flat rides, 4 stalls, 8 staff), `build2` (128 × 128, 3,000 guests, 24 flat rides with
  queues, 24 stalls, plateaus, ponds, 60 scenery items, 2 show sites written directly until W4-C's `placeShowSite`
  merges, 12 staff), `phone` (the `build1` park with 800 guests). Guests are real (needs, decisions); the track rides
  run empty trains (a harness: no gates). All three start at 13:10 with After Dark on, so a run reaches the night.
- **Perf run:** `TC_PERF=1 npx playwright test tests/e2e/perf-build3.spec.ts` (`TC_PERF_RUNS`, `TC_PERF_QUALITY`,
  `TC_PERF_SECONDS`, `TC_PERF_WARMUP`). The scene loads through the title screen (slot 1, Continue), the camera sits
  on the park centre at zoom 1, the game runs 10 s to warm up and then **30 s at 1×** with the real loop. Reported:
  fps and frame p50 / p95 / max (requestAnimationFrame timestamps, so frames are multiples of 16.7 ms), tick p50 /
  p95, main-thread work p95, render p95, `drawImage` calls per frame, sprite memory by cache, canvases made (cache
  churn), long tasks, JS heap (CDP, after GC), the longest frame of two view turns, and a 3 s pan.
- **Phone:** the Playwright Pixel 7 profile (412 × 839 CSS px, touch, `pointer: coarse`) with **4× CPU throttling**
  (CDP `Emulation.setCPUThrottlingRate`); **desktop:** 1280 × 800, DPR 1.
- **Machine:** headless Chromium 153 with **software raster** (no GPU) on a shared 4-core container. Six other agents
  ran test suites at the same time (load average 6–16), so every number is noisy; before / after pairs were run back
  to back, and the PixiJS rule uses 3 runs.
- **Profiles:** CDP `Profiler` (self time by function, unminified build) and a `devtools.timeline` trace for the
  split between JavaScript, canvas calls, and the canvas commit.

## What the profile showed (before, phone scene, 4× CPU)

| Share of main-thread time | Before |
|---|---|
| `drawImage` (native): terrain chunks 15.3%, sprites 12.1%, track slices 9.9%, ride columns 2.5% | 43.5% |
| "(program)": canvas commit to the compositor (`Canvas2DResourceProvider::Snapshot`, `ProduceCanvasResource`) | 29.2% |
| Simulation (`stepTick`) | 14.0% |
| Sprite builds during play (LRU churn) | 5.1% |
| Renderer JavaScript (collection, sort) and UI | ≈ 8% |

Root causes found:

1. **Terrain chunks redrawn every frame from large images.** In Chrome's software canvas a `drawImage` costs in
   proportion to the *source image*, not the part drawn: 40 slices of 64 × 600 px from 2048 × 1100 px images cost
   19–22 ms of main-thread time at 4× CPU against 0.1 ms from small images (micro-benchmark,
   `ImageBitmap` sources no better). A 16 × 16 chunk image was 2048 × 1100 px (9 MB) at the phone's zoom bucket.
2. **A view turn built every visible chunk in one frame**: 95–170 ms of work on desktop, 300–600 ms on the phone.
3. **No memory cap across caches**: sprites 96 MB and chunks 32–64 MB each capped on their own; the phone used
   114–134 MB, and running rides cycled through more animation frames than the caches kept.
4. **The terrain change check** compared 9 layers byte by byte every frame (147,456 values on 128 × 128).

## Work order (Phase 6 §4.6 steps 1–4, and what else was needed)

1. **Culling and chunk caches** (existed). Chunks are now **8 × 8 tiles** (a quarter of the image size and build
   time; the master §5.1 "16 × 16" note is superseded by this ADR). Chunks with no image in the current rotation are
   built while the frame has spent < 6 ms on them (at least one per frame); the rest draw a flat placeholder for a
   frame or two. On desktops, idle frames build the chunks of both neighbouring view rotations, so a turn usually
   finds them ready.
2. **Sprite atlases per zoom bucket: measured, not adopted.** In the same micro-benchmark, 1,000 sprite draws cost
   the same from one atlas (5.6 ms at 4×) as from 100 separate canvases (5.2 ms), and frames got slower (median
   33 ms against 17 ms), because one large shared source costs more per frame in a software canvas. An atlas would
   help a GPU-rastered canvas batch draws, which this proxy cannot measure; revisit with a real-phone profile.
3. **Guest level of detail** (existed since Phase 4): at zoom ≤ 0.5 guests are 2 × 3 px rectangles, one fill per
   colour; `low` quality starts at zoom 0.75.
4. **Skip redraw of unchanged static layers: the static terrain layer.** On the second frame of a still view the sky
   and every visible chunk are composited into one canvas-sized image; while the camera centre, zoom × pixel ratio,
   rotation, canvas size, and terrain (tracker version and map) are unchanged, each frame copies it 1:1 (one
   `drawImage`). The visible chunk images stay marked in use (for the next pan); everything else may be evicted.

Also done (Phase 6 §4.6 limits and the remaining findings):

- **Shared sprite memory**: every `SpriteCache` (sprites, terrain chunks, the static layer, scenery, track cars)
  counts `width × height × 4` bytes toward one budget, **64 MB on phones, 192 MB on desktops**; over budget, the
  least recently used images of all caches go first; images used in the renderer's current frame never go.
- **Device class**: phone = `pointer: coarse`, or `navigator.deviceMemory ≤ 4`, or a phone-sized screen. Phones:
  render scale ≤ 2×, at most 3 zoom buckets (no exact-scale chunk images), coarse ride frames (16 angles, 3 occupancy
  levels) so a running ride's frames fit the budget.
- **Render quality** (Settings → Display): `high` = the device's best; `low` = 1× render scale, guest rectangles
  from zoom 0.75, 3 buckets, coarse ride frames; **`auto`** = `high`, but the render scale steps down to 1× when a
  60-frame window (after a 120-frame warm-up) has a frame p95 over 1.25 × the device budget (25 ms desktop, 50 ms
  phone). It never steps back up on its own; a resize or a quality change starts over.
- **Terrain change check**: the 7 layers chunk art reads, compared as 32-bit words.
- **Probe and overlay**: `perfProbe` (ring buffers, nearest-rank p50 / p95, draw calls, sprite memory, churn) and
  the F3 / Settings overlay; the probe reads no clock while off.

## Results

RESULTS

## PixiJS decision

PIXI

## Plan for the gap

PLAN
