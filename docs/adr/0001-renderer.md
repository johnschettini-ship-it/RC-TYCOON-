# ADR 0001 — Renderer: keep Canvas 2D, no PixiJS (Build 3)

- **Status:** Accepted (W4-E, Build 3). Reopen after the release's manual real-phone check if it fails (see Plan).
- **Spec:** Phase 6 §4.6 (budgets, method, work order, PixiJS decision rule, sprite cache limits), §8 (sprite cache
  budget), §9 (perf run, LRU by bytes); master §4 (upgrade path: one `Renderer` interface), §10 (budgets).

## Method

- **Scenes:** three schema 3 saves in `tests/perf/` built by `tests/perf/scenes.ts` (regenerate with
  `TC_WRITE_SCENES=1 npx vitest run tests/unit/perf/scenes.test.ts`): `build1` (64 × 64, 2,000 guests, 10 Mini Railway
  loops with 2 trains each, 14 flat rides, 4 stalls, 8 staff), `build2` (128 × 128, 3,000 guests, 24 flat rides with
  queues, 24 stalls, plateaus, ponds, 60 scenery items, a Lightshow Tower and a Fireworks Launcher with shows at
  21:00 and 22:30, 12 staff; the before / after tables used placeholder sites with no shows, the merged-build table
  has real shows), `phone` (the `build1` park with 800 guests). Guests are real (needs, decisions); the track rides
  run empty trains (a harness: no gates). All three start at 13:10 with After Dark on, so a run reaches the night.
- **Perf run:** `TC_PERF=1 npx playwright test tests/e2e/perf-build3.spec.ts` (`TC_PERF_RUNS`, `TC_PERF_QUALITY`,
  `TC_PERF_SECONDS`, `TC_PERF_WARMUP`). The scene loads through the title screen (slot 1, Continue), the camera sits
  on the park centre at zoom 1, the game runs 10 s to warm up and then **30 s at 1×** with the real loop. Reported:
  fps and frame p50 / p95 / max (requestAnimationFrame timestamps, so frames are multiples of 16.7 ms), tick p50 /
  p95, main-thread work p95, render p95, `drawImage` calls per frame, sprite memory by cache, canvases made (cache
  churn), long tasks, JS heap (CDP, after GC), the longest frame of two view turns, and a 3 s pan.
- **Phone:** the Playwright Pixel 7 profile (412 × 839 CSS px, touch, `pointer: coarse`) with **4× CPU throttling**
  (CDP `Emulation.setCPUThrottlingRate`); **desktop:** 1280 × 800, DPR 1.
- **Machine:** headless Chromium 153 with **software raster** (no GPU) on a shared 4-core container. Other agents ran
  test suites at the same time for most of the work (load average 6–16); the tables below come from runs at load
  average 1–5, with before / after pairs run back to back, and the PixiJS rule uses 3 runs.
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
   time; master §5.1, Phase 0 §4.8, and Phase 4 §4.10 now say 8 × 8). Chunks with no image in the current rotation are
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

All runs: 10 s warm-up, then 30 s at 1×. "Before" = the Wave 4.0 renderer with only the probe added (same scenes,
same harness), run back to back with "after". Frame times are requestAnimationFrame intervals, so they come in
16.7 ms steps (33.4 = two refreshes).

**Phone scene (800 guests), Pixel 7 profile, CPU 4× slower — 3 runs each (budget: p95 ≤ 40 ms):**

| | Before | After, `auto` (default) | After, `high` (fixed 2×) |
|---|---|---|---|
| fps | 16.5 / 17.0 / 18.8 | 43.0 / 41.0 / 41.8 | 23.2 |
| Frame p95 | 83.4 / 83.4 / 83.3 ms | **33.4 / 33.4 / 49.9 ms** | 83.3 ms |
| Render p95 (`Renderer.draw`) | 26.0–27.3 ms | 9.6–10.1 ms | 12.0 ms |
| Main-thread work p95 (`Game.frame`) | 31.9–33.5 ms | 16.4–17.6 ms | 21.2 ms |
| Tick p95 (4× slower CPU) | 3.9–4.4 ms | 4.8–5.0 ms | 5.0 ms |
| Long tasks in 30 s | 367–386 | 36–55 | 343 |
| Sprite and chunk memory | 130 MB | 57.5 MB | 64.0 MB |
| Longest frame of a view turn | 450–633 ms | 83–117 ms | 150–183 ms |
| Pan, frame p95 | 83–100 ms | 33.4 ms | 100 ms |
| Render scale | 2× | 1× (`auto` stepped down) | 2× |

**Build 2 scene (128 × 128, 3,000 guests) on the phone profile, CPU 4×:** before 17–19 fps, p95 100–117 ms, render
p95 33–39 ms, 132 MB (3 runs, busier machine); after `auto` 47 fps, p95 33.4 / 33.4 / 33.4 ms, render p95 9–10 ms,
58–64 MB; after `high` 20 fps, p95 83.3–83.4 ms, render p95 12 ms.

**Desktop, 1280 × 800 (budget: frame p95 ≤ 20 ms, tick p95 ≤ 4 ms):**

| Scene | | Before | After |
|---|---|---|---|
| Build 1 (2,000 guests, 10 track rides) | fps, frame p95 | 59.9, 16.8 ms | 59.9, 16.7 ms |
| | tick p95, render p95 | 1.6 ms, 4.3 ms | 1.6 ms, 4.1 ms |
| | longest frame of a turn | 67–83 ms (work 66–78 ms) | 33 ms (work 25–28 ms) |
| Build 2 (128 × 128, 3,000 guests, 2 shows) | fps, frame p95 | 59.9, 16.7 ms | 59.9, 16.7–16.8 ms |
| | tick p95, render p95 | 2.4 ms, 3.3 ms | 2.6–2.7 ms, 3.0–3.1 ms |
| | longest frame of a turn | 50–67 ms (work 51–66 ms) | 17–33 ms (work 9–15 ms) |
| | long tasks in 30 s | 1 | 0 |

**Merged build (W4-A … W4-G, real shows at 21:00 and 22:30 in the Build 2 scene), `auto`, load average 1–1.4:**

| Scene | Runs | fps | Frame p95 | Render p95 | Tick p95 | Long tasks |
|---|---|---|---|---|---|---|
| Phone scene, phone profile, CPU 4× | 3 | 50.5–53.0 | **33.3 / 33.4 / 33.4 ms** | 6.9–8.5 ms | 3.7–4.1 ms | 19–24 in 30 s |
| Build 2, phone profile, CPU 4× | 1 | 48.7 | 49.9 ms | 8.1 ms | 10.3 ms | 63 in 30 s |
| Build 2, desktop | 2 × 30 s, 1 × 60 s | 59.9–60.0 | 16.7–16.8 ms | 2.5–3.2 ms | **2.4–2.5 ms** | 0 |
| Build 1, desktop | 1 | 59.7 | 16.8 ms | 5.1 ms | 1.8 ms | 0 |

Desktops were already vsync-bound in this harness; the desktop gains are the turn (no frame over 33 ms) and less
work per frame. **Other budgets:** JS heap 7–9 MB in every scene (budget 250 / 150 MB; sprite and chunk images are
canvas memory, capped separately at 192 / 64 MB); initial load 314.0 KB gzipped JS + CSS + HTML on the merged
build (budget 400 KB). **Terrain change check** on 128 × 128 (`tests/bench/render.bench.ts`): 0.37 → 0.06 ms per
frame. With the machine busy (load average 9–15), the same runs gave phone p95 50 ms for `auto` and desktop tick
p95 up to 4.9 ms: these budgets have little margin on a loaded device.

## PixiJS decision

**Rule (Phase 6 §4.6):** adopt PixiJS only if, after steps 1–4, the phone scene p95 frame > 40 ms in 2 of 3 runs
**and** the profile shows ≥ 50% of frame time in canvas drawing.

**Measured:** with the default render quality (`auto`) the phone scene p95 was over 40 ms in **1 of 3 runs** (33.4,
33.4, 49.9 ms), and in **0 of 3** on the merged build (33.3, 33.4, 33.4 ms). **The rule is not met: PixiJS is not
adopted.** No runtime dependency was added.

With the render scale held at 2× (`high`) both conditions would hold: p95 83 ms, and the profile is dominated by the
browser putting an 824 × 1,678 px software-rastered canvas on screen (render p95 is only 12 ms and main-thread work
21 ms of the 83 ms; the rest is canvas commit and raster, 343 long tasks in 30 s). That is not a reason to switch
renderers here:

1. **The proxy has no GPU.** Headless Chromium rasters Canvas 2D in software, and WebGL would run on SwiftShader
   (also the CPU), so a PixiJS renderer cannot be shown to win on this proxy. Real phones raster both Canvas 2D and
   WebGL on the GPU; the expensive part measured here (per-pixel work on 1.4 Mpx per frame) is what a GPU does well.
2. **Bundle budget.** The merged build is 314.0 KB gzipped (JS 306.0, CSS 7.5, HTML 0.5); PixiJS v8 adds roughly 150–250 KB gzipped depending on the
   modules used (estimate: not installed), which breaks the 400 KB budget and needs the owner's approval.
3. **Contract cost.** `WorldLayer` (Wave 3.0/4.0) hands a `CanvasRenderingContext2D` to the fields, lighting
   (`multiply` / `lighter` compositing), elevated path, scenery, terrain tool, show, and a11y layers, and the track
   and management layers draw through the same context. A `PixiRenderer` means porting every card's layer; the
   `Renderer` interface alone (master §4) does not cover them.

The upgrade path stays open: everything still draws through one `Renderer` interface.

## Plan for the gap

- `auto` stays the default render quality. It keeps 2× where the device holds the budget and steps down to 1×
  where it cannot; `high` and `low` remain player choices.
- **Release (Phase 6 §4.6 method, release checklist item 2):** run the manual check on a real mid-range Android
  phone and an iPhone with the F3 overlay, at `auto` and `high`. If `high` misses p95 ≤ 40 ms on real hardware while
  the overlay's render p95 stays low (the browser's raster, not our drawing, is the bound), reopen this ADR with the
  owner (bundle budget). If render p95 is high, profile the layers first.
- **Layers owned by other cards** (out of W4-E scope, reported): the track layer drew 9.9% of the phone frame before
  this work, cutting slices from large per-ride images (in a software canvas a draw costs by the source image size);
  per-slice images would remove most of it. The scenery, terrain tool, and track layers still hard-code the old
  red / green ghost colours (Phase 6 §4.7).
- Re-run `TC_PERF=1 TC_PERF_RUNS=3` before the release on the gate build (the merged-build table above is the last
  run). The Build 2 phone run (not a budget scene) still has a p95 of 50 ms: 3,000 guests tick at 10 ms p95 on the
  throttled CPU.
