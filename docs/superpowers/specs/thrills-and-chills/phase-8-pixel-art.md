# Phase 8 — Pixel park

- **Build:** 5 (proposed). No save schema change. Settings document version 3 from stage 1c, version 4 from stage 5b.
- **Status:** Approved by the owner on 2026-11-11 (revision 7; the owner saw the plan page and answered "Proceed"). The owner gate after stage 0 stays: no stage after stage 0 starts before the owner has seen the stage 0 pictures and said yes. Text of the last revision note: revision 7. Revision 7 repairs the findings of the second reader on revision 6 (the start condition of stage 1a-i names the spec rule of `planStretch`, not the function; the `T_REST` kit share and preview figure, and one line range for each kit). Revision 6 repairs the findings of the last check round (among them: the start condition of stage 1a-i after the kill rules, the light grid phase of stage 8, the bundle projection terms `N_STAMP` and `T_REST`, the orphan lint rule, the exact shadow casters, the build limits and budgets, the resize observers after a style switch, and the full list of generated sprites). Revision 3 added the depth rule (section 12 preamble and section 16), the batch splits and the lists "Open until the stage brief" of stages 3 to 9. Revision 4 repairs the findings of repair round 2. Revision 5 repairs the findings of repair round 3 (among them: section 11.7, the e2e level rule of section 13.3, the stage 5b null-art rule, the test hash seam `artHash`).
- **Master spec:** `docs/superpowers/specs/2026-11-09-thrills-and-chills-design.md`.
- **Previous phase:** `docs/superpowers/specs/thrills-and-chills/phase-7-frost-and-spark-interface.md`.
- **Approved draft pictures:** `docs/screenshots/phase-7-draft-desktop.png` (1280 × 800) and `docs/screenshots/phase-7-draft-phone.png` (390 × 844). A Python script drew the park in them: `docs/research/art/drafts/pixel3.py` on the branch `art-research` (commit `94efdc2`).
- **Approved design record:** `docs/research/art/approach/recommendation.md` (the "rasteriser" approach) on the branch `art-research` (commit `94efdc2`), with the research maps in `docs/research/art/understand/` and the attacks in `docs/research/art/approach/`. The Phase 8 work branch merges `art-research` before stage 0, so these paths are then in the working tree. The proof code of the design record was not kept: no `rasterizer-poc` folder exists. Section 5.3 is the full rasteriser rule. The draft script `pixel3.py` is the source for primitives, stamps and the carousel.
- **Code facts:** HEAD `03720b2` (Build 4 code plus the final review repairs of `cc42cab` and `03720b2`; release `4.0.0`, `scripts/check-release.ts:30`). On 2026-11-11 (revision 6), uncommitted edits of another agent touch, under `src/`: `src/styles/main.css` (line 130 removed, so the lines from `:131` to `:438` move up by one; 2 lines added after `:438`; edits after `:1033`), `src/ui/title.ts`, `src/ui/management/widgets.ts` and `src/data/strings/ui.ts`; and outside `src/`: `scripts/check-release.ts` (the new `auditRows` and `auditOwnerItems`, `:115`, `:137`, and a new item 1 rule, so the lines after `:104` move), `tests/unit/offline/release.test.ts`, `tests/unit/settings/data.test.ts`, `tests/e2e/{a11y,final-repairs,polish,scenery,tips,ui-hud}.spec.ts`, `CHANGELOG.md` and three documents under `docs/superpowers/specs/thrills-and-chills/`. Nothing under `src/render/`, `src/input/`, `src/perf/`, `src/settings/`, `src/audio/` or `src/sim/`, and not `src/main.ts`, changed since `724789b` (`git diff 724789b` of these paths, working tree included, is empty). Every cited line is the line of the working tree on that day; in the files that the other agent edits, a planner re-reads the line before use. Nothing under `src/render/` changed since the design record (commit `fab5189`).

Repository paths are relative to `/home/user/RC-TYCOON-`. A cite `file:line` gives the line of today and the function name, because lines move.

> **Read this first.** Phase 8 changes how the park is drawn. It does not change the game rules, the simulation, the saves, or the interface layout. The art style switch keeps today's look ("Classic") available until stage 5b. In every stage before stage 5b, the game with Classic selected looks and tests as it does today, unless the early-delete remedy of section 10.4 item 5 applies (decided at the stage 0 gate or in the stage 5a or 6 brief).

---

## 1. Goal and what the player sees

The park looks like the approved drafts: square pixels, a fixed set of colours, and a thin dark plum outline around each object.

What the player sees at the end of the phase:

1. Ground with soft grass patches, paved slab paths, clear water with shore lines, and toned slopes and cliffs.
2. Every ride, stall, tree, guest, staff member, track piece and train in pixel art, with a lit left side and a dark right side.
3. Hard-edged ground shadows under objects.
4. Zoom in clear steps. At rest, every art pixel is a sharp square on every screen.
5. Card pictures and picker pictures that are crops of the pixel park.
6. Frost and Spark as small pixel heads in the mood bar, the tips, the tutorial, the award toasts and the end screen.
7. A pixel night with banded light pools, pixel rain, pixel beams and pixel fireworks.

Until stage 4c, Classic is the default and Pixel is a preview in Settings. In stage 4c, after the owner's yes, Pixel becomes the default. Stage 5b removes Classic.

## 2. Scope and non-goals

**In scope:**
1. A pixel surface behind the existing Canvas calls of the art functions (section 5).
2. The palette, the colour map and the ink outline (section 6).
3. Zoom in levels, the stretch `k` and the art scale `n` (section 7).
4. Pixel art for all world art: terrain, rides, stalls, track, cars, scenery, show sites, guests, staff, path items, fence, entrance (sections 8 and 12).
5. Ground shadows from catalog data (section 8.4).
6. Card pictures, the scenery picker and the show picker pictures (section 8.5).
7. The two small mascot heads of `src/ui/scenario/mascotArt.ts` (section 8.5).
8. Map overlays and ghosts, night, weather and show effects in pixel form (stages 7 and 8).
9. The art style setting, settings version 3 and version 4 (section 9).

**Non-goals:**
1. The simulation does not change. No file under `src/sim/` changes. Rendering never changes the state hash (`tests/unit/render/renderer-rotation.test.ts:148-161`).
2. The title screen is not redrawn. Build 4 rebuilt it (`src/ui/titleScreen/`) and deleted `src/ui/mascots.ts`.
3. No image files. Art is TypeScript code and letter rows. The image rule of the release check does not change (`RASTER`, `RASTER_ALLOWED` and `originalityProblems`, `scripts/check-release.ts:37, 39, 55`). Master spec §1.3 "All graphics are drawn in code" (`docs/superpowers/specs/2026-11-09-thrills-and-chills-design.md:39`) holds: stamps are TypeScript data, as the rows of `pixel3.py:256-282`.
4. No new runtime dependency and no new dev dependency.
5. No new game content, no change to ride footprints, no new commands, no new save fields.
6. The HTML interface is not pixel art (Phase 7 §4.9 look tokens stay). Interface drawings outside the mascot heads and the card and picker pictures do not change: track piece icons (`src/ui/track/panel.ts`), the track test chart (`src/ui/track/chart.ts`), the guest dial (`src/ui/panels/guest.ts`) and the app icon (`public/icons/icon.svg`).
7. No pixel match with the drafts for random parts (tree specks, ground details). The target is the same look, not the same pixels. The ground details are drawn (section 8.1 item 7); only their positions differ from the drafts.

## 3. Owner decisions

| # | Question | Answer | Status | Other options and their effect | Used from |
|---|---|---|---|---|---|
| 1 | Zoom in steps? | Yes: crisp levels; a pinch follows the fingers, then settles on a level. | **Answered** by the owner. | — | Stage 1b |
| 2 | Farthest zoom on screens where the smallest crisp level is at least 0.375 (section 7.2)? | (a) Keep zoom 0.25 as one soft overview level (section 7.5). | Default. The owner can change it before stage 1b starts. | (b) Stop at the farthest crisp level (0.5 on a 1× monitor). `zoomLevels` returns crisp levels only; section 7.5, the soft chunks, `SOFT_CHUNK_GROW`, `SOFT_LEVEL_GAP` and risk 17 go. | Stage 1b |
| 3 | When does Pixel become the default? | (b) In stage 4c, after stages 4a and 4b (track, trains and card pictures done), after the owner reviews their pictures. | Default. The owner can change it before stage 4a starts. | (a) After stage 3: the work of stage 4c moves to a stage directly after stage 3, and stages 4a and 4b run with Pixel as the default. (c) Only when everything is redrawn: the work of stage 4c moves into stage 5b, and stages 5a, 6 and 7 still run with Classic as the default. Stage 8 still follows stage 5b, so the flip comes before the night redraw; for a flip after everything, stage 8 moves before stage 5b. | Stage 4a (choice), stage 4c (flip) |
| 4 | Ride sizes? | (a) Keep today's footprints. Rides can grow taller, not wider (`pixelRideHeight`, section 5.2). | Default. The owner can change it before stage 3 starts. | (b) Bigger hero footprints: a later game-rule change outside Phase 8 (new footprints change the simulation, a non-goal of section 2). Phase 8 does not change. | Stage 3 |
| 5 | Night? | (a) Pixel night: banded pools with dithered borders on the art grid. | Default. The owner can change it before stage 8 starts. | (b) Keep today's smooth light pass over the pixel park. Stage 8 does only rain, beams, fireworks and bulbs on the art grid; `NIGHT_POOL_BANDS` goes, and `tests/unit/lighting/layer.test.ts:153-258` does not change. Shadows still turn off at `NIGHT_SHADOW_OFF` (batch 8.2 stays). | Stage 8 |

A default does not block a stage. Every stage that uses a default has this line: "Before it starts: the owner was asked about decision N; with no change, the default holds."

**Owner gate.** No stage after stage 0 starts before the owner has seen the stage 0 pictures and said yes (section 11.6).

**Exception to master §3.** Master §3 says "Phases inside a build merge to `main` behind no flags" (`docs/superpowers/specs/2026-11-09-thrills-and-chills-design.md:94`). The owner approved the design record, which keeps a Classic / Pixel switch until Pixel is complete (recommendation §1 item 4, §4). This spec takes that approval as the exception to master §3; the stage 0 report names it at the owner gate. So stages 1a-i to 7 (every stage before stage 5b) merge behind the art style switch, the `?art=` address flag and `VITE_ART`. Stage 5b removes the switch before Build 5 ships.

## 4. Words

| Word | Meaning |
|---|---|
| **World pixel** | One unit of the game's world drawing at zoom 1. A tile is 64 × 32 world pixels, a height step is 8 (`src/render/iso.ts:8-10`). |
| **Art pixel** | One pixel of the approved drafts. One art pixel is 2 × 2 world pixels. A tile is 32 × 16 art pixels (`pixel3.py:78`). |
| **Canvas pixel** | One pixel of the game canvas backing store. |
| **Device pixel** | One physical screen pixel. |
| **Device ratio** | `window.devicePixelRatio`: device pixels per CSS pixel. |
| **k** (stretch) | Device pixels per canvas pixel, a whole number. The browser applies it with `image-rendering: pixelated`. |
| **Canvas ratio** | Canvas pixels per CSS pixel: `device ratio / k`. |
| **n** (art scale) | Canvas pixels per art pixel, a whole number: `n = 2 × zoom × canvas ratio`. |
| **Level** | A zoom value. A **crisp level** has a whole `n`. The **soft level** is zoom 0.25 where it is not crisp (section 7.5). |
| **Home level** | The level the game uses at start (section 7.6). |
| **Grid** | The record `{ device, deviceRatio, stretch, canvasRatio }` that the renderer publishes (section 5.2, `grid.ts`). |
| **Ramp** | A named row of colours from light to dark, for example `g` (grass). |
| **Tone** | One position in a ramp, numbered from 1 (lightest). |
| **Slot** | One palette colour, named by ramp and tone, for example `g2`. Index 0 is "transparent". |
| **Signal slot** | A slot that carries meaning (safe colours, temperament tint, ghost tones). Art colours never land on a signal slot. |
| **Ink** | The outline colour, slot `i3` = `#2a1a36`. |
| **Surface** | A `PixelSurface`: a grid of slot indices at art resolution that accepts Canvas calls. |
| **Layer** | A group of pixels on a surface that gets one ink ring when it closes. |
| **Cut pixel** | A pixel painted while `cut(true)` is on, or by a stamp. It belongs to the silhouette but makes no ink ring. |
| **Stamp** | A small picture written as rows of letters. Each letter is a key into a colour map. |
| **Classic** | Today's art style. **Pixel** is the new art style. |
| **Twin** | A pixel art function: an art function that exists only for Pixel (section 5.4). |
| **Classic family** | The Classic art functions of one kind of object (rides, stalls, scenery, track, show sites, people and props). |
| **Batch** | A plan-sized part of a stage: one plan, built, checked and merged alone. A batch that redraws objects names them; the lint, the sheets and the owner pictures of section 8.6 run per batch. A stage with no batch list is one batch. |
| **Owner pictures** | Screenshots of the real game, at levels, for the owner to review. |
| **Plan-ready stage** | Stage 0, 1a-i, 1a-ii, 1b, 1c, 2a or 2b. This spec gives all that a planner needs (section 12 preamble). |
| **Outline stage** | Stage 3 to 9. This spec gives the decided rules, the batches and the list "Open until the stage brief" (section 12 preamble). |
| **Stage brief** | A short addendum to this spec, written and reviewed before an outline stage is planned. It decides the points of the stage's list "Open until the stage brief". |
| **Sample** | One point of a track piece's `WorldSamples` (`samplesOf`, `src/render/track/layer.ts:165-172`). `runsInTile` (`:175-190`) splits the samples of a piece into runs `[k0, k1]`, one run for each part of the piece inside one tile. |
| **Cut side** | An end of a run where `runsInTile` splits the piece at a tile edge: `k0 > 0` (the start) or `k1 < s.n − 1` (the end), where `s.n` is the sample count of the piece. The first and the last sample of a piece are never a cut side. |

---

## 5. Architecture

### 5.1 Pipeline

```
bank.ride / stall / guest / ...                 src/render/sprites/bank.ts:97-207 (signatures unchanged)
  cache miss
  buildSprite(bounds, scale, paint, tint, opts?)  src/render/canvas.ts:56-72
    artStyle() === 'classic': today's body, unchanged
    artStyle() === 'pixel':
      1 s = new PixelSurface(evenBounds(bounds), opts)   bounds widened to even world pixels
      2 paint(s as unknown as Ctx)                        the same art function, or its twin (5.4)
      3 s.finish()                                        closes the last layer: ink ring
      4 if tint: s.remap(ghostTable(tint))                replaces the source-atop wash (canvas.ts:64-70)
      5 { canvas, ctx } = makeCanvas(s.w, s.h); s.blitTo(ctx)
      6 return { image: canvas, w: s.w, h: s.h, ox: s.ox, oy: s.oy, scale: ART_SCALE, artHash: s.hash() }
      7 if artBuildLog.hashes is an array: push s.hash()                       (tests only, section 13.3 sprites.test.ts)
      (artHash and step 7 come in stage 1a-ii)
renderer draw                                    src/render/renderer.ts:1046-1147
  grid from applyPlan; n = artScale(cam.zoom, grid); frame.art = { n, scale, offX, offY }
  bucket = 0.5; offX, offY rounded; smoothing off (on only at the soft level)
  every sprite copy goes through blitArt / blitArtColumn (grid.ts)
  ground shadows: shadow layer drawGround, first world layer (section 8.4)
```

`artHash` is a new optional member of `Sprite` (`src/render/spriteCache.ts:14-21`): `artHash?: number`, set only by the Pixel branch. `artBuildLog` is a new export of `canvas.ts`: `const artBuildLog: { hashes: number[] | null }`, start value `{ hashes: null }`. Only tests set `hashes` to an array; the game never does. Why both: a bank method returns its `Sprite`, so a test reads `artHash`; a track slice is built inside `TrackLayer.drawSlice` (`src/render/track/layer.ts:679-695`) and never leaves the layer, so a test reads the log.

`evenBounds(b)` is a private function of `canvas.ts`: `left = 2 × floor(b.left / 2)`, `top = 2 × floor(b.top / 2)`, `right = 2 × ceil(b.right / 2)`, `bottom = 2 × ceil(b.bottom / 2)`.

The renderer never changes `cam.zoom`. Only the input controller changes it (section 7.4).

### 5.2 New units under `src/render/pixel/`

All pixel-only code lives under `src/render/pixel/`, and all pixel-only constants that are not in those files live in `src/data/tuning/pixel.ts`. So one size test measures both (section 10.4 item 6). Nothing under `src/sim/` or `src/data/` imports these units.

| File | Exports (exact signatures) | Job | Stage |
|---|---|---|---|
| `style.ts` | `type ArtStyle = 'classic' \| 'pixel'`; `type ArtStyleSetting = 'auto' \| ArtStyle`; `const ART_STYLE_AUTO: ArtStyle`; `resolveArtStyle(setting: ArtStyleSetting, search: string, buildDefault: string \| undefined): ArtStyle`; `setArtStyle(s: ArtStyle): void`; `artStyle(): ArtStyle`; `artStyleVersion(): number` | Module state, as `src/perf/quality.ts:122-138`. The start value is `'classic'`, so Node tests run Classic. Rules in section 9. | 1a-i |
| `palette.ts` | `type RampId`; `const RAMPS: Readonly<Record<RampId, readonly string[]>>`; `const SLOT_NAMES: readonly string[]` (index → name, index 0 = `''`); `const SLOT_RGBA: Uint32Array`; `const INK_SLOT: number`; `slotIndex(name: string): number`; `slotOf(css: string): number`; `nearestInFamily(rgb: number): number`; `tone(name: string, steps: number): string`; `trackSlot(index: number, tone: 1 \| 2 \| 3): number`; `ghostTable(tint: string): Uint8Array`; `const paletteStats: { misses: number }`; `const SHADE_STEP = 1.18` (section 15; the generator `colourMapGen.test.ts` imports it for the proposal rule of section 6.5) | Ramps, slots, signal slots and colour resolution (section 6). `nearestInFamily` never returns a signal slot, an `r` slot or `INK_SLOT`. | 1a-i |
| `colourMap.ts` | `const QUEUE_SLOT = 'n3'` (section 15); `const COLOUR_MAP: Readonly<Record<string, string>>` (lower-case `#rrggbb` → slot name), keys sorted; the entry of `#a9c0d2` is `QUEUE_SLOT` | The hand-checked colour map (section 6.4): literals and derived outputs. Generated, then edited by hand, checked in. Stage 1a-i holds only the fixed entries of section 6.4; stage 1a-ii adds the rest. `QUEUE_SLOT` lives here, not in `palette.ts`, because `palette.ts` imports `COLOUR_MAP` and an import back would make a cycle. `ground.ts` (queues), the entry of `#a9c0d2` and pair 4 of `palette.test.ts` read `QUEUE_SLOT`. | 1a-i, 1a-ii |
| `derived.ts` | `type DerivedRecord = { out: string; base: string; f: number } \| { out: string; a: string; b: string; t: number }`; `startDerivedMemo(): void`; `stopDerivedMemo(): readonly DerivedRecord[]`; `noteDerived(out: string, base: string, f: number): void`; `noteMixed(out: string, a: string, b: string, t: number): void` | The derived-colour memo. A tool aid: it records only between `startDerivedMemo` and `stopDerivedMemo`, which only the generator calls (section 6.5). It imports nothing, so `src/render/palette.ts` can call it with no import cycle. | 1a-i |
| `surface.ts` | `class PixelSurface` (members in section 5.3); `interface SurfaceOptions { ink?: boolean }`; `isPixelSurface(ctx: unknown): ctx is PixelSurface`; `const ART_SCALE = 0.5`; `const SURFACE_PAD = 2`; `const BAYER4: readonly number[]` (section 15) | The rasteriser (section 5.3). The proof code was not kept; section 5.3 is the full rule. `isPixelSurface(ctx)` is `ctx instanceof PixelSurface`; it never tests for members. Why: the recorder (the `get` trap of the recorder Proxy, `tests/unit/render/content/recorder.ts:109-110`) and `FakeCanvas` (`tests/unit/render/fakeCanvas.ts:51-75`) answer every member name. | 1a-i |
| `grid.ts` | `interface PixelGrid { device: DeviceClass; deviceRatio: number; stretch: number; canvasRatio: number }`; `planStretch(deviceRatio: number, device: DeviceClass, capped: boolean): number`; `makeGrid(deviceRatio: number, device: DeviceClass, capped: boolean): PixelGrid`; `artScale(zoom: number, grid: PixelGrid): number`; `interface ZoomLevel { zoom: number; n: number; soft: boolean }`; `zoomLevels(grid: PixelGrid): readonly ZoomLevel[]`; `nearestLevel(zoom: number, grid: PixelGrid): number`; `stepLevel(zoom: number, dir: 1 \| -1, grid: PixelGrid): number`; `levelStep(grid: PixelGrid): number`; `const pixelGrid: { current: PixelGrid \| null; version: number }`; `publishGrid(g: PixelGrid \| null): void`; `viewportCss(): { width: number; height: number }`; `snapArt(v: number): number`; `snapWalker(ax: number, ay: number, slope: 0.5 \| -0.5 \| 0): { x: number; y: number }`; `snapCar(ax: number, ay: number, dx: number, dy: number): { x: number; y: number }`; `interface ArtFrame { n: number; scale: number; offX: number; offY: number }` (stage 2a adds the optional members `walkers?: Float64Array; walkerCount?: number`, section 8.4 item 4; optional because the stage 1b tests build `ArtFrame` literals and `tsc` checks `tests`, `tsconfig.json:19`); `const LEVEL_EPS = 1e-6`; `const SOFT_LEVEL_GAP = 1.5`; `const HOME_ZOOM_TARGET = 1`; `const CAR_SLOPE_MAX = 2`; `blitArt(ctx: CanvasRenderingContext2D, sp: Sprite, wx: number, wy: number, f: ArtFrame): void`; `blitArtColumn(ctx: CanvasRenderingContext2D, sp: Sprite, ax: number, ay: number, colL: number, colR: number, f: ArtFrame, ends: number): void` | Section 7. One copy rule for every sprite. It imports `ART_SCALE` from `surface.ts`. `ArtFrame.scale` is `cam.zoom × canvas ratio`, as `scale` in `draw` (`renderer.ts:1059`). `viewportCss()` reads `document.documentElement.clientWidth` and `clientHeight`. | 1b |
| `ground.ts` | `paintGroundChunk(s: PixelSurface, map: MapState, rect: { u0: number; v0: number; u1: number; v1: number }, r: ViewRotation, env: TerrainEnv, soft: boolean): void` (`rect` as `chunkViewRect` returns it, `src/render/terrain.ts:349`); `hash3(a: number, b: number, c: number): number` (an unsigned 32-bit value, `Math.imul` mixing); `vnoise(x: number, y: number, seed: number): number`; `const GROUND_DETAIL_SHARE: number` | The ground painter (section 8.1, "Ground"). It imports `BAYER4` from `surface.ts`. | 1c |
| `budget.ts` | `class BuildBudget { constructor(limitMs: number, now?: () => number); limitMs: number; beginFrame(): void; take(): boolean; spend<T>(build: () => T): T }`; `const buildBudget: BuildBudget` | One time budget per frame for optional sprite builds (section 10.3). | 1c |
| `art/shapes.ts` | `pixelBox`, `pixelCylinder`, `pixelCone`, `pixelPyramid`, `pixelHead`, each with the parameters of its Classic twin in `src/render/sprites/shapes.ts:58-179` | Draft shading of the primitives (`pixel3.py:220-241`). | 2a |
| `art/kit.ts` | `pixelRider`, `pixelPlatform`, `pixelDot`, `pixelDot3`, `pixelStar`, `pixelPoly2`, `pixelLine2`, `pixelOval` (twins of `src/render/sprites/content/kit.ts:29-102`); `pixelTrunk`, `pixelCluster`, `pixelCanopy`, `pixelTier`, `pixelRock`, `pixelPost`, `pixelGlow`, `pixelFlowers`, `pixelEdgeBox`, `pixelPanel`, `pixelPedestal`, `pixelEyes` (twins of `src/render/scenery/art/kit.ts:96-263`); each with the parameters of its Classic twin | Draft shading of the kit helpers (section 5.5). | 2a |
| `shadows.ts` | `interface Caster { shape: 'box' \| 'ellipse' \| 'rect'; w: number; d: number; heightPx: number; shift: number }` (a box: `w` and `d` in tiles, `shift` 0; an ellipse or a rect: `w` and `d` in art pixels, `heightPx` 0, `shift` in art pixels to the screen right; section 8.4); `casterOf(kind: 'ride' \| 'stall' \| 'scenery' \| 'guest' \| 'staff' \| 'pathItem' \| 'show', defId: string, rotation: number): Caster \| null`; `createPixelShadowLayer(): WorldLayer`; `const ROUND_CASTERS: ReadonlySet<string>`; `const SHADOW_MULTIPLY: string`; `const GUEST_SHADOW: Caster`; `const BENCH_SHADOW: Caster`; `const EDGE_CASTER_DEPTH: number`; `const SHADOW_TZ: number`; `const SHADOW_LEN: number` | Ground shadows (section 8.4). The `'pathItem'` case comes in stage 2b, the `'show'` case in stage 6. | 2a, 2b, 6 |
| `stamp.ts` | `interface Stamp { rows: readonly string[]; pairs?: readonly string[] }`; `type StampMap = Readonly<Record<string, string>>`; `stamp(ctx: ArtCtx, s: Stamp, x: number, y: number, map: StampMap, opts?: { mirror?: boolean }): void`; `px(ctx: ArtCtx, x: number, y: number, colour: string): void`; `stampSize(s: Stamp): { w: number; h: number }` | The stamp format (section 8.3). | 2b |
| `sprites/people.ts` | `const PIXEL_GUEST_BOUNDS: ArtBounds`; `const PIXEL_GUEST_ITEM_BOUNDS: ArtBounds`; `drawGuestPixel(ctx: ArtCtx, g: GuestLook): void` | Guest stamps: front, back, two steps, sit, items, rings. | 2b |
| `sprites/staff.ts` | `drawStaffPixel(ctx: ArtCtx, look: StaffLook): void` (twin of `drawStaffArt`, `src/render/sprites/staff.ts:356`) | Staff and costume stamps. | 2b |
| `sprites/props.ts` | `drawPathItemPixel(ctx: ArtCtx, code: number, side: number, fillLevel: number, broken: boolean): void`; `drawLitterPixel(ctx: ArtCtx, variant: number, flip: number): void`; `drawMessPixel(ctx: ArtCtx, variant: number, flip: number): void` (twins of `src/render/sprites/litter.ts:150, 159, 216`); `drawFencePixel(ctx: ArtCtx, dir: Dir): void`; `drawEntrancePixel(ctx: ArtCtx, part: 0 \| 1, outerDir: Dir \| -1): void` (twins of `src/render/sprites/props.ts:233, 261`) | Bench, bin, lamp, litter, mess, fence, entrance. | 2b |
| `sprites/mascots.ts` | `type Mascot = 'frost' \| 'spark'`; `type Mood = 'happy' \| 'sad'` (the same unions as `src/ui/scenario/mascotArt.ts:6-7`; `src/render/` does not import `src/ui/`); `const MASCOT_STAMPS: Readonly<Record<Mascot, Readonly<Record<Mood, Stamp>>>>`; `const MASCOT_MAP: StampMap`; `const MASCOT_ART: Readonly<Record<Mascot, { w: number; h: number }>>`; `const MASCOT_GAP = 2`; `mascotArtScale(boxWCss: number, boxHCss: number, dpr: number, artW: number, artH: number): number` | Frost and Spark heads (section 8.5). | 2b |
| `sprites/rideParts.ts`, `sprites/icons.ts` | `HORSE`, `GONDOLA`, `CAR_NOSE`, `RIDER_HEAD` and other stamps; `STALL_ICONS: Readonly<Record<string, Stamp>>` | Small moving parts and stall icons. | 3 |
| `art/rides.ts` | `const PIXEL_RIDE_ART: Readonly<Record<string, (ctx: ArtCtx, ex: number, ey: number, st: RideArtState) => void>>`; `pixelRideHeight(defId: string): number \| undefined` (the art height in world pixels of the twin, in place of `HEIGHTS` or `CONTENT_RIDE_ART[id].height`, `src/render/sprites/rides.ts:32-37, 52`); `pixelGate(...)` with the parameters of `drawGate` (`rides.ts:101`, stage 5a) | Twins of flat rides and of the ride gate. | 3, 5a |
| `art/stalls.ts` | `const PIXEL_STALL_ART: Readonly<Record<string, (ctx: ArtCtx, rotation: number) => void>>` | One stall kit for the 14 stalls. | 3 |
| `art/scenery.ts` | `const PIXEL_SCENERY_ART: Readonly<Record<string, (ctx: ArtCtx, o: SceneryArtOpts) => void>>`; `pixelSceneryTop(defId: string): number \| undefined` (the top of the twin's bounds in world pixels, negative, in place of `−heightM × 8 − ART_HEADROOM_PX`, `src/render/scenery/art/index.ts:41`) | Twins of scenery items. | 3, 6 |
| `art/track.ts` | `paintSlicePixel(ctx: ArtCtx, sl: SliceRec, f: ViewFrame): void` (twin of `paintSlice`, `src/render/track/layer.ts:321`); `paintCarPixel(...)` with the parameters of `paintCar` (`src/render/track/paint.ts:773`); `paintGateBoothPixel(...)` with the parameters of `paintGateBooth` (`paint.ts:903`); `artDot(ctx: CanvasRenderingContext2D, wx: number, wy: number, slot: string, f: ArtFrame): void` (one art pixel, `n × n` canvas pixels, at the snapped world point); `artDash(ctx: CanvasRenderingContext2D, wx0: number, wy0: number, wx1: number, wy1: number, slot: string, f: ArtFrame): void` (a line of art pixels on the art grid) | Rails, supports, cars, gates, chain, ripples, spray (section 12, stage 4a). | 4a, 5a |
| `preview.ts` | `pixelPreview(id: string, kind: 'ride' \| 'stall' \| 'track' \| 'scenery' \| 'show', artW: number, artH: number): PixelSurface`; `drawPixelPreview(ctx: CanvasRenderingContext2D, s: PixelSurface, m: number): void` | Card and picker pictures (section 8.5). | 4b |
| `art/shows.ts` | `const PIXEL_SHOW_ART: Readonly<Record<string, (ctx: ArtCtx, facing: Dir) => void>>` (twins of `drawShowSiteArt`, `src/render/shows/art.ts:171`) | The two show sites. | 6 |
| `overlay.ts` | `dashLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, slot: string, f: ArtFrame): void`; `ditherFill(ctx: CanvasRenderingContext2D, pts: readonly number[], slot: string, density: 1 \| 2 \| 3, f: ArtFrame): void` (`pts` is a polygon `[x0, y0, x1, y1, …]` in world pixels) | Map overlays and ghosts (stage 7). It uses no `Path2D`, so Node tests can call it (`vitest.config.ts`: environment `node`). | 7 |

`ArtCtx` is a new interface in `src/render/sprites/shapes.ts`, next to `Ctx` (`shapes.ts:6`). It holds the Canvas members that art uses: `fillStyle`, `strokeStyle`, `lineWidth`, `lineCap`, `lineJoin`, `beginPath`, `moveTo`, `lineTo`, `closePath`, `rect`, `arc`, `ellipse`, `quadraticCurveTo`, `bezierCurveTo`, `arcTo`, `fill`, `stroke`, `fillRect`, `strokeRect`, `save`, `restore`, `translate`, `scale`, `rotate`, `setTransform`, and the optional `layer?(ink?: boolean): void` and `cut?(on: boolean): void`. A real 2D context and a `PixelSurface` both satisfy it. `Ctx` stays the real canvas type, because `makeCanvas` returns it (`src/render/canvas.ts:12, 23`).

Why: the existing art functions keep the type `Ctx`. `buildSprite` passes the surface through one cast. Twins take `ArtCtx` and call `ctx.layer?.()` and `ctx.cut?.()`, so they also run on a real context and on a recorder.

### 5.3 The `PixelSurface` rules

Members (exact):

| Member | Rule |
|---|---|
| `constructor(bounds: ArtBounds, opts?: SurfaceOptions)` | `w = ceil(right × 0.5) − floor(left × 0.5) + 2 × SURFACE_PAD`, `h` the same with top and bottom. Anchor `ox = SURFACE_PAD − floor(left × 0.5)`, `oy = SURFACE_PAD − floor(top × 0.5)`. The pad of `SURFACE_PAD` (2) art pixels holds the ink ring, as `PAD = 2` in `canvas.ts:50`. `opts.ink` (default `true`) is the ink value of the first layer. |
| `readonly w, h, ox, oy: number` | Image size and anchor in art pixels. |
| Canvas subset of `ArtCtx` | Coordinates are world pixels around the anchor. One internal matrix stack serves `save`, `restore`, `translate`, `scale`, `rotate`, `setTransform` (used by `src/render/sprites/props.ts:171` and `src/render/sprites/litter.ts:161, 217`). |
| `layer(ink?: boolean): void` | `ink` defaults to `opts.ink`, which defaults to `true`. Closes the current layer and starts a new one. When the closing layer has ink on: every pixel that is 4-adjacent to an ink-making pixel of this layer, and is not a pixel of this layer, becomes ink. This can paint over older layers (inner lines between parts), but never over a cut pixel. `ink = false` starts a layer with no ring (spokes, lattice). |
| `cut(on: boolean): void` | While on, painted pixels are cut pixels. A cut pixel counts as part of the layer, so no ring of this layer lands on it, but it makes no ink ring itself. |
| `finish(): void` | Closes the last layer. `buildSprite` calls it. |
| `remap(table: Uint8Array): void` | Replaces each slot index `i` with `table[i]`. |
| `blitTo(ctx: Ctx): void` | Writes the pixels into `ctx`. It uses `putImageData` when `typeof ImageData === 'function'`, else `emitRuns(ctx)`. |
| `emitRuns(ctx: ArtCtx): void` | One `fillRect` per horizontal run of one slot, in image pixels, with `fillStyle` set to the slot colour. |
| `pixel(x: number, y: number): number` | Slot index at an image pixel (tests). |
| `inkMask(): Uint8Array` | One byte per image pixel: 1 for each ink-making pixel (an opaque fill pixel of a layer with ink on that is not a cut pixel and not a stroke pixel), else 0. The lint test reads it (section 8.6). |
| `hash(): number` | FNV-1a over `w`, `h` and the slot indices. |
| `misses: number` | Colours that `slotOf` resolved by the fallback rule while this surface painted (section 6.5). |
| `fillStyle`, `strokeStyle` set to a slot name | A string that is a name in `SLOT_NAMES` (for example `'y1'`) selects that slot directly, opaque. `slotOf` is not called and no miss is counted. Any other string is a CSS colour and resolves by raster rule 5. |

Why `typeof ImageData`: the unit-test fake answers every method, so `ctx.createImageData` "exists" there and returns `undefined` (`tests/unit/render/fakeCanvas.ts:51-75`). Node has no `ImageData`.

Raster rules:

1. **Fill.** `fill()` sets each pixel whose centre is inside the path by the non-zero rule. An opaque fill also sets the pixels on its edges by a one-pixel line (as Pillow does), so thin shapes never vanish.
2. **Fill rectangle.** `fillRect` sets the pixels whose centres are inside. A rectangle thinner than one art pixel becomes one pixel wide.
3. **Stroke.** `stroke()` draws a Bresenham line `max(1, round(lineWidth / 2))` art pixels wide. Stroke pixels belong to the layer but make no ink ring. So spokes, ropes, rails and lattice get no black web.
4. **Curves.** `arc`, `ellipse`, `quadraticCurveTo`, `bezierCurveTo` and `arcTo` become line segments of at most 1 art pixel.
5. **Colour.** Every `fillStyle` and `strokeStyle` that is a CSS colour resolves through `slotOf` (section 6.5). Alpha comes from the `rgba(…)` string. A slot name selects its slot directly (members table).
6. **Translucent colour.** Alpha ≥ `OPAQUE_ALPHA` (0.995) is opaque. Below it, on an opaque pixel: mix the two colours by alpha, then take `nearestInFamily(mixed)`, the nearest non-signal slot by RGB distance inside the hue family of the mixed colour (section 6.5 rule 2 families). This "mix and snap" is not a miss. On a transparent pixel: set the pixel when alpha is above the Bayer threshold `(BAYER4[(y & 3) × 4 + (x & 3)] + 0.5) / 16`, and mark it as a cut pixel. **Decision:** the design record (§2.3, `surface.ts`) says only "a 4 × 4 ordered dither"; the cut mark is a decision of this spec. Why: a dither pixel on nothing is a lone pixel; as an ink-making pixel it would get its own ring of up to 4 ink pixels, so a glow or an in-art shadow (section 8.4 item 6, until stages 2b and 6) would turn into a field of dark specks. As a cut pixel it keeps the soft edge, and no ring paints over it.
7. **Determinism.** Whole-number raster, `Math.imul` hashes, no time, no random numbers, no read-back from a canvas. Every output pixel is one slot with alpha 0 or 255.

### 5.4 Branch rule: how Pixel art is selected

1. A Classic art function never changes before stage 5b. The game with Classic selected draws today's pixels. Exception: when the early-delete remedy of section 10.4 item 5 applies (decided at the stage 0 gate or in the stage 5a or 6 brief), the Classic family that it names is deleted in that stage, and Classic then draws that family with its twins.
2. Pixel art lives in twins under `src/render/pixel/`. A dispatcher calls the twin only when the context is a surface, for example in `drawStallArt`: `if (isPixelSurface(ctx) && PIXEL_STALL_ART[id]) return PIXEL_STALL_ART[id](ctx, rotation)`. In `drawRideArt` (`src/render/sprites/rides.ts:471-495`), the branch sits inside the `withGates` body, before the `switch`, so the Classic gates (`drawGate`, `:101`, called by `withGates`, `:111-117`) keep drawing around the twin. In stage 5a, `withGates` calls `pixelGate` in place of `drawGate` on a surface. The dispatcher reads the record at call time (`PIXEL_RIDE_ART[id]`), so a test can spy on an entry.
3. The dispatchers that get this branch: `drawRideArt` (`src/render/sprites/rides.ts:471`), `drawStallArt` (`src/render/sprites/stalls.ts:152`), `drawSceneryArt` (`src/render/scenery/art/index.ts:51`), `drawGuestArt` (`src/render/sprites/props.ts:140`), `drawFenceArt` (`props.ts:233`), `drawEntranceArt` (`props.ts:261`), `drawStaffArt` (`src/render/sprites/staff.ts:356`), `drawPathItemArt`, `drawLitterArt`, `drawMessArt` (`src/render/sprites/litter.ts:150, 159, 216`), `paintSlice` (`src/render/track/layer.ts:321`), `paintCar` (`src/render/track/paint.ts:773`), `paintGateBooth` (`paint.ts:903`), `drawGate` (`src/render/sprites/rides.ts:101`, stage 5a), `drawShowSiteArt` (`src/render/shows/art.ts:171`), the primitives `box`, `cylinder`, `cone`, `pyramid`, `head` (`src/render/sprites/shapes.ts:58-179`), and the 20 kit helpers named in section 5.5 (stage 2a rows). The design record counts 24 kit helpers. The other 4 are `shadow` of `src/render/scenery/art/kit.ts:91-93`, which draws nothing on a surface (section 8.4 item 6), and `polyline`, `quad` and `band` of `src/render/track/paint.ts:142, 154, 332`, which get twins in stage 4a (track rule 4).
4. The recorder tests pass a recorder, not a surface. So they run the Classic path and pass unchanged until stage 5b, or until the early-delete remedy deletes their Classic family (rule 1).
5. An interface picture that has no surface (the mascot heads) branches on `artStyle()`.
6. Every twin emits only these calls on a recorder: fills, `fillRect`, paths, and `layer` / `cut` inside the part that it draws. It calls no `translate`, `scale`, `rotate`, `transform` or `setTransform`.

Why rule 6: the recorder counts all five as transforms (`tests/unit/render/content/recorder.ts:81-95`) and expects 0 (`tests/unit/scenery/art.test.ts:56`, `tests/unit/render/guestItems.test.ts:62`). The arch test adds the op counts of the back half and the front half and compares them with the whole (`tests/unit/scenery/art.test.ts:87`). A `layer` call at the start of a whole drawing breaks that sum. These tests run against the twins from stage 5b.

Why twins, not edits (a change from the design record, which adds pixel calls inside the same art functions and budgets "art edits 6 to 9 KB"): twins keep Classic unchanged until stage 5b, as every stage must ship. The cost: until stage 5b, the twins and the Classic art ship together. Today's Classic art is 44.2 KB (`src/render/sprites/content` with `src/render/scenery/art`), 28.2 KB (`src/render/track`) and 14.7 KB (`src/render/shows`) of source gzip. Section 10.4 sets the size limits and the measure.

### 5.5 Changes to existing code

Line numbers are today's. "Pixel" means "when `artStyle()` is `'pixel'`"; the Classic path does not change. The rows are in stage order.

| File | Function (line today) | Change | Stage |
|---|---|---|---|
| `src/render/canvas.ts` | `buildSprite` (`:56-72`) | Pixel branch of section 5.1. New optional 5th parameter `opts?: SurfaceOptions`. Bounds widen to even world pixels, so the anchor is a whole art pixel (litter left `-9` and top `-7`, mess left `-11` and guests with items `-13` are odd today: `src/render/sprites/litter.ts:12-13`, `src/render/sprites/props.ts:17`). | 1a-i |
| `src/render/sprites/shapes.ts` | type `Ctx` (`:6`) | Add `ArtCtx` (section 5.2). | 1a-i |
| `src/render/palette.ts` | `shade` (`:122-132`) | Calls `noteDerived(out, hex, f)` (`pixel/derived.ts`) before it returns. Its output does not change. | 1a-i |
| `src/render/scenery/art/kit.ts` | `mixHex` (`:78-83`) | Calls `noteMixed(out, a, b, t)` before it returns. Output unchanged. | 1a-i |
| `src/render/shows/art.ts` | `shade` (`:23-27`, a private copy) | Calls `noteDerived(out, hex, f)` before it returns. Output unchanged. | 1a-i |
| `src/render/layers.ts` | `WorldLayer` (`:55-65`) | New optional member `clearArt?(): void`. Each world layer with a private sprite cache implements it: scenery (`ScenerySprites`, `src/render/scenery/layer.ts:39`), shows (`sprite`, `src/render/shows/layer.ts:95-104`), the pixel shadow layer (its mask cache, from 2a) and lighting (from 8). | 1a-i |
| `src/render/track/layer.ts` | `TrackLayer` | New method `clearArt(): void`: clears `carCache` (`:411`), `gateCache` (`:413`) and the slice sprites. | 1a-i |
| `src/render/renderer.ts` | `draw` (`:1046-1147`), start | On an `artStyleVersion()` change: set `canvas.dataset.art = artStyle()`, re-plan, then clear every art cache (section 5.6): `bank.cache.clear()`, the terrain chunk images (`terrain.invalidate()`, `src/render/terrain.ts:517`), `track.clearArt()`, `l.clearArt?.()` for each world layer, the static layer (`statics.clear()`, `statics` at `renderer.ts:938`) and `lastRideSprite` (from 1c). The first frame counts as a change, so `data-art` is set from the first frame. | 1a-i |
| `src/render/sprites/bank.ts` | `fence` (`:190-197`) | Pixel: the fence sprite builds with `{ ink: false }` until `drawFencePixel` paints its ends with `cut(true)` (stage 2b). | 1a-i |
| `src/render/track/layer.ts` | slice build in `drawSlice` (`:691`) | Pixel, stages 1a-i to 3: slice sprites build with `{ ink: false }`. Stage 4a replaces this with the cut rule. | 1a-i |
| `src/main.ts` | `boot` (`:16-51`) | Calls `setArtStyle(resolveArtStyle(setting, location.search, import.meta.env.VITE_ART))` once, after `game` exists (`:23`) and before the first `resize()` (`:36`). `setting` is `'auto'` in stages 1a-i to 1b, and `game.settings.get('artStyle')` from stage 1c to stage 4c (section 9.2). From stage 5b, `boot` calls `setArtStyle('pixel')` and reads no `artStyle` setting (section 9.6). | 1a-i, 1c, 5b |
| `src/render/renderer.ts` | `applyPlan` (`:898-917`) | Passes `artStyle()` to `renderPlan`. Sets `canvas.dataset.stretch = String(plan.stretch)`. Pixel: `canvas.width = ceil(cssW × rawDpr / stretch)`, height the same (`:912-913`); `canvas.style.width = (canvas.width × stretch / rawDpr) + 'px'`, height the same (section 7.1 item 3); `dpr = plan.pixelRatio` (the canvas ratio); `terrain.allowExact = false` (`:906`); `publishGrid({ device: plan.device, deviceRatio: rawDpr, stretch: plan.stretch, canvasRatio: plan.pixelRatio })`; `canvas.dataset.homeZoom = String(nearestLevel(HOME_ZOOM_TARGET, grid))`, at full precision (`data-zoom` keeps 3 decimals). Why `plan`: inside `applyPlan`, `device` is the `DeviceEnv` of `browserDeviceEnv()` (`renderer.ts:892`, in `createCanvasRenderer`), not a `DeviceClass`; the class is `plan.device` (from `cls`, `:901`), and `capped` exists only inside `renderPlan`. Why full precision: on the Pixel 7 profile the home level is 8/7, and `artScale(1.143, grid)` is 0 (`2 × 1.143 × 1.3125 = 3.000375`). Classic: today's body. When the previous plan was Pixel, it clears `canvas.style.width` and `canvas.style.height`, and calls `publishGrid(null)`. The Classic path never reads or writes `canvas.style` otherwise. `FakeCanvas` gains a `style` member in this stage (section 13.2), so a Node test can run the renderer in Pixel. `publishGrid(null)` raises the version by 1, so the controller sees the change. | 1b |
| `src/render/renderer.ts` | `draw` (`:1046-1147`) | Pixel: `bucket = 0.5` (`:1060`); `offX = round(cssW × dpr / 2 − cam.centerX × scale)`, `offY` the same with height (`:1061-1062`): the viewport centre, not `canvas.width / 2`; `n = artScale(cam.zoom, grid)`; `frame.art = { n, scale, offX, offY }` next to `frame.bucket` (`:1077`), `null` in Classic; `imageSmoothingEnabled` is true only when the grid has a soft level and `cam.zoom` equals it, else false (`:1071`); `canvas.dataset.artScale = String(n)` next to `data-zoom` (`:1121-1124`). | 1b |
| `src/render/renderer.ts` | `drawStatic` (`:989-1035`) | The smoothing line `:1018` follows the same rule as `:1071`. | 1b |
| `src/render/renderer.ts` | `blit`, `blitColumn` (`:338-363`) | Pixel: `blitArt`, `blitArtColumn`. The first and last ride columns get `ends` bits, so the ink ring at the footprint corners is not cut (today's clamp `:357-358`). | 1b |
| `src/render/renderer.ts` | `collectGuests` (`:508-…`), anchors (`:553-554`) | Pixel: the anchor `(ax, ay)` passes through `snapWalker(ax, ay, slope)` (section 7.7) before the sprite push and the dot push. `slope` follows the guest's view direction; a guest that stands or sits uses 0. | 1b |
| `src/render/management/layer.ts` | `collectStaff` (`:231-262`), anchors (`:244-245`) | Pixel: staff anchors pass through `snapWalker`, as guests. | 1b |
| `src/render/management/layer.ts` | `collectPathItems` push (`:227`); `drawGround` decal blits (`:171`, `:178`) | Pixel: the anchor passes through `snapArt(x)`, `snapArt(y)` before the push or the blit. Why: path items stand at `u` or `v` = `EDGE` 0.14 or `CORNER` 0.16 (`pathItemPlacement`, `src/render/management/pathItemPos.ts:17-20`), and litter and mess at the random fractions of `litterSlot` and `messSlot` (`src/render/management/litter.ts:36, 53`), so their anchors are not even (for example `u` 0.5, `v` 0.14 gives x = 11.52 world pixels). | 1b |
| `src/render/renderer.ts` | `collectGuests` dots (`:556-559`); `dots.draw` (`:1112`) | Pixel at `n > 0`: a guest dot is one art pixel (`n × n` canvas pixels) at `snapWalker(ax, ay, 0)`, in the slot colour of today's dot colour (the shirt, or the temperament tint step with the overlay on, `renderer.ts:557`). At `n = 0` the dots stay as today. | 1b |
| `src/render/layers.ts` | `LayerFrame` (`:21-36`) | New optional member `art?: ArtFrame \| null` (absent or `null` in Classic). Why optional: `tsc` checks `tests` (`tsconfig.json:19`), and 8 test files declare full `LayerFrame` literals (for example `tests/unit/a11y/palette.test.ts:31` and `tests/bench/lightScene.ts:47`). | 1b |
| `src/render/scenery/layer.ts` | `blit`, `blitColumn` (`:60-83`) | Pixel (`f.art` not `null`): `blitArt`, `blitArtColumn`. The first and last column get the `ends` bits, as for rides. | 1b |
| `src/render/shows/layer.ts` | `blit`, `blitColumn` (`:113-135`) | Pixel: `blitArt`, `blitArtColumn`. The first and last column get the `ends` bits, as for rides. | 1b |
| `src/render/track/layer.ts` | `collect` (`:490`) | New last parameter `art: ArtFrame \| null = null`, kept for `blit` and `drawCar`. The renderer passes `frame.art` (`renderer.ts:1106`). Why the default: 3 tests call `collect` with 9 arguments (`tests/unit/render/track/slices.test.ts:192`, `tests/unit/render/track/phase6Render.test.ts:197`, `tests/unit/track/waterRender.test.ts:126`). | 1b |
| `src/render/track/layer.ts` | `blit` (`:670-677`) | Pixel: `blitArt`. | 1b |
| `src/render/track/layer.ts` | `drawCar` (`:836-866`) | Pixel: car anchors through `snapCar(ax, ay, dx, dy)` (`:862-865`; section 7.7), where `(dx, dy)` is the car's travel tangent in view space. | 1b |
| `src/perf/quality.ts` | `renderPlan` (`:64-77`), `RenderPlan` (`:49-61`) | New 5th parameter `style: ArtStyle = 'classic'`. New field `stretch: number` (1 in Classic). Pixel: `stretch = planStretch(d, device, capped)` with `capped = low \|\| (quality === 'auto' && autoMaxRatio <= 1)` (today `high` ignores `autoMaxRatio`, `src/perf/quality.ts:71`); `pixelRatio = d / stretch`; `zoomBuckets = 3`. | 1b |
| `src/styles/main.css` | `#game` rule (`:34`) | Add `#game[data-art="pixel"] { right: auto; bottom: auto; image-rendering: pixelated; }`. The inline size from `applyPlan` replaces the 100 % size; the box is anchored at the top left, and `html, body { overflow: hidden }` (`:26-32`) cuts the part past the viewport. | 1b |
| `src/main.ts` | `resize` (`:31-36`, in `boot`) | In both styles, a second `ResizeObserver`, installed at mount next to the first one (`:35`), watches `document.documentElement`. Each call of `resize` reads `artStyle()` to choose the source: `viewportCss()` in Pixel, the canvas box (`getBoundingClientRect`, today) in Classic. Why: in Pixel the canvas box is larger than the viewport and depends on the plan, so the box size would feed back into the plan; and from stage 1c the style changes at run time (`apply` in `src/ui/perf/index.ts`, section 9.2), so an observer installed only for a Pixel boot would miss a Classic-to-Pixel switch, after which the fixed inline box size never changes on a window resize. | 1b |
| `src/input/index.ts` | pointer to world (`:43-44`, `:50`, `:64`); wheel listener (`:92-100`) | Pixel: `width` and `height` come from `viewportCss()`; `left` and `top` from the canvas box, as today. In both styles the wheel listener passes `e.timeStamp` as the 5th argument of `ctl.wheel` (`:97`), as pointer events pass `t: e.timeStamp` (`:69`). | 1b |
| `src/ui/land/index.ts` | `measure` (`:256-262`) | In both styles, the `ResizeObserver` (`:262`, installed at mount) also observes `document.documentElement`. Each call of `measure` reads `canvas.dataset.art` to choose the source: when it is `'pixel'`, `st.viewW` and `st.viewH` come from `document.documentElement.clientWidth` and `clientHeight`; else from the canvas box, as today. Why both styles: `data-art` is set on the first frame (section 5.5, `draw` row), after `mountUI` runs, so a check at mount is always false. `src/input/land/index.ts:80` passes them to `screenToWorld` unchanged. | 1b |
| `src/audio/index.ts` | `viewport` (`:22`) | When `canvas.dataset.art` is `'pixel'`: `document.documentElement.clientWidth` and `clientHeight` in place of `canvas.clientWidth` and `clientHeight`. Why: in Pixel the canvas box is up to 0.6 CSS px larger than the viewport (section 7.3). | 1b |
| `src/input/controller.ts` | `wheel` (`:123-129`), `keyDown` case `'zoom'` (`:150-155`), `apply` case `'pinch'` (`:277-282`), `default` (`:314-315`), `update` (`:94-…`) | `wheel` gains a 5th parameter `t = 0` (the event time in ms); Classic ignores it. Why the default: `tests/unit/ui/controller.test.ts:355` calls `wheel` with 4 arguments. Pixel: section 7.4. Classic: unchanged. | 1b |
| `src/input/camera.ts` | `wheelZoomFactor` (`:83-88`) | Unchanged until 5b. New export `wheelNotches(deltaY: number, deltaMode: number): number` with the same notch rule. | 1b |
| `src/ui/scenario/tutorialUi.ts` | `uiChecks` (`:132-138`) | The zoom step passes when `abs(cam.zoom − cam0.zoom) >= min(TUTORIAL_ZOOM_CHANGE, levelStep(grid)) − 1e-6` (`:135`). Classic: `levelStep` is not used. | 1b |
| `src/render/terrain.ts` | `build` (`:542-561`) | Pixel: `new PixelSurface(chunkBounds, { ink: false })`, `paintGroundChunk` (it opens no inked layer), then `blitTo`. Scale `ART_SCALE`. | 1c |
| `src/render/terrain.ts` | `draw` (`:567-…`), chunk copy (`:638-643`); `prefetch` (`:681`); `PLACEHOLDER` (`:411`) | `draw` gains a 10th parameter `soft = false`, and `prefetch` a 6th parameter `soft = false`; the existing calls with 9 and 5 arguments do not change. The renderer passes `soft = true` only in Pixel when the zoom is the soft level (the same test that turns `imageSmoothingEnabled` on, section 5.5 `draw` row), from `drawStatic` (`renderer.ts:1021, 1031`) and from the idle prefetch (`prefetchTurn`, `:984`). Pixel (`artStyle()`): with `soft` false, a chunk is built at `ART_SCALE` with `soft = false` and kept in the slot of bucket 0.5; with `soft` true, it is built with `soft = true` and kept in cache slot `EXACT_SLOT` (`:424`) (section 7.5). The copy factor is today's `f = scale / sp.scale` (`:638`); at a crisp level it is `n`, because `sp.scale` is 0.5 and `scale` is `n / 2`, so the copy is whole-pixel. The chunk placeholder fills in the colour of slot `g2`, not `#67b24b`. `FIRST_BUILD_BUDGET_MS = 6` (`:407`) stays. | 1c |
| `src/render/sprites/bank.ts` | `ride` (`:97-111`) | Unchanged. New method `rideIfReady(defId: string, w: number, d: number, rotation: Dir, frame: number, bucket: ZoomBucket): Sprite \| null`: the cached sprite, else a build when `buildBudget.take()` is true, else `null`. | 1c |
| `src/render/sprites/bank.ts` | `guest` (`:124-…`), `stall` (`:113-121`), `staff`, `pathItem`, `decal`, `fence`, `entrance` (`:97-207`) | Pixel only: every build runs inside `buildBudget.spend(...)` (stage 1c). Guests use `PIXEL_GUEST_BOUNDS`, or `PIXEL_GUEST_ITEM_BOUNDS` with a balloon or an umbrella (stage 2b). Every other kind keeps today's bounds, widened to even world pixels by `buildSprite` (section 8.3). | 1c, 2b |
| `src/render/renderer.ts` | `collectRides` (`:423-464`) | Pixel: `bank.rideIfReady(...)` (`:454`). A new map `lastRideSprite: Map<number, { defId: string; w: number; d: number; sprite: Sprite }>` is keyed by `r.id × 4 + vrot` (the ride id, not the index `ri`, because indices shift when a ride is added or demolished). Each built sprite is stored there. On `null`, the entry for the key is used when its `defId`, `w` and `d` equal the ride's; else `bank.ride(...)` builds at once. Once per frame, entries of ride ids that no longer exist are deleted, as `TrackLayer.changed` deletes `sigs` (`src/render/track/layer.ts:465-470`). Why the rotation in the key: after a view turn, the columns of `columnsFor(eu, ev)` (`:455`) belong to the new rotation. The reset `rideSprites[ri] = null` (`:432`) stays. | 1c |
| `src/render/renderer.ts` | `applyPlan` (`:898-917`) | Pixel: `buildBudget.limitMs = plan.device === 'phone' ? BUILD_BUDGET_MS_PHONE : BUILD_BUDGET_MS_DESKTOP`. | 1c |
| `src/render/renderer.ts` | `draw` | `buildBudget.beginFrame()` once per frame. Pixel: `canvas.dataset.complete` is `'1'` when the frame skipped no build (no `take()` returned false, no `null` from `rideIfReady`, no stand-in) and no terrain chunk is pending; else `'0'`. | 1c |
| `src/render/track/layer.ts` | `drawSlice` (`:679-695`), `drawCar` (`:836-866`) | Pixel: a build also needs `buildBudget.take()`; the count caps `MAX_SLICE_BUILDS_PER_FRAME = 20` and `MAX_CAR_BUILDS_PER_FRAME = 32` (`:94-95`) stay. | 1c |
| `src/perf/stats.ts` | `PerfSnapshot` (`:13-…`) | New optional members `artBuilds?: number` and `artBuildMsMax?: number` (the slowest sprite or chunk build of the frame). The overlay shows them only when present. Why optional: `tests/unit/perf/overlay.test.ts:34-52` declares a full `PerfSnapshot` literal, and `tsc` checks `tests` (`tsconfig.json:19`). | 1c |
| `src/settings/types.ts`, `src/settings/schema.ts` | `SettingsValues`; `SETTINGS_VERSION` (`:13`); `parseSettings` (`:104-129`) | Section 9. | 1c, 5b |
| `src/ui/settings/model.ts` | `settingsSections`, Display (`:57-73`) | A `choice` control for `artStyle` after `renderQuality`. | 1c |
| `src/data/strings/settings.ts` | settings strings | Section 9.4. | 1c |
| `src/ui/perf/index.ts` | `apply` (`:73-74`) | Also calls `setArtStyle(resolveArtStyle(...))` (section 9.2). From stage 5b it reads no `artStyle` setting and makes no `setArtStyle` call (section 9.6). | 1c, 5b |
| `src/render/sprites/shapes.ts` | `box`, `cylinder`, `cone`, `pyramid`, `head` (`:58-179`) | Surface branch to the twins in `pixel/art/shapes.ts`. | 2a |
| `src/render/sprites/content/kit.ts` | `rider` (`:29`), `platform` (`:35`), `dot` (`:40`), `dot3` (`:48`), `star` (`:53`), `poly2` (`:69`), `line2` (`:86`), `oval` (`:97`) | Surface branch to the twin in `pixel/art/kit.ts`. The other exports (`TAU`, `drawSorted`, `seatsFilled`, `axes`, `wave`) paint nothing and do not change. | 2a |
| `src/render/scenery/art/kit.ts` | `trunk` (`:96`), `cluster` (`:106`), `canopy` (`:119`), `tier` (`:126`), `rock` (`:132`), `post` (`:155`), `glow` (`:160`), `flowers` (`:174`), `edgeBox` (`:206`), `panel` (`:240`), `pedestal` (`:253`), `eyes` (`:258`) | Surface branch to the twin in `pixel/art/kit.ts`. The other exports paint nothing and do not change, except `shadow` (next row). | 2a |
| `src/render/scenery/art/kit.ts` | `shadow` (`:91-93`) | Returns at once on a surface. | 2a |
| `src/render/sprites/props.ts` | `drawGuestArt` shadow ellipse (`:158-160`) | Skipped on a surface (`isPixelSurface(ctx)`). | 2a |
| `src/render/sprites/stalls.ts` | `drawStallArt` generic path, shadow `poly3` (`:162-163`) | Skipped on a surface. | 2a |
| `src/render/sprites/staff.ts` | `shadow` (`:48`) | Returns at once on a surface. | 2a |
| `src/render/sprites/content/stalls.ts` | `shadow` (`:17`) | Returns at once on a surface. | 2a |
| `src/render/worldLayers.ts` | `createWorldLayers` (`:17-25`) | Pixel shadow layer as the first entry. The layer is always present (the style can change at run time, and the layer list is built once); with `f.art` absent or `null` it draws nothing. | 2a |
| `src/render/renderer.ts` | `draw`, frame order (`:1086-1114`) | Pixel: the block `:1093-1110`, from the fence refresh (`fenceSegments`, `entranceOuterDir`, `fenceVersion`, `:1093-1097`) to `collectGuests` (`:1110`), runs after `mgmt.begin` (`:1087`) and before `mgmt.drawGround` (`:1088`); its code does not change. Why the fence refresh moves with it: `collectFence` (`:1102`) and `collectEntrance` (`:1103`) read `fence` and `outerDir`, and `fence` is `[]` before the first refresh (`:296`). Why after `mgmt.begin`: `mgmt.collect` (`:1108`) uses the scale, view and `va` that `begin` sets. `collectGuests` (when not `lod`) and `ManagementLayer.collectStaff` append each snapped walker anchor to `frame.art.walkers` (section 8.4 item 4); the renderer creates `walkers` (a `Float64Array` of 2 × 256 numbers, doubled when full) and sets `walkerCount` to 0 before the block. `ManagementLayer.begin` (`src/render/management/layer.ts:129`) gains a last parameter `art: ArtFrame \| null = null`, and the renderer passes `frame.art` (the default keeps `tests/unit/render/management/layer.test.ts:36, 107` unchanged). Classic keeps today's order. Why safe: the block draws nothing on `ctx`; it fills `list` and `dots` only, and the two `drawGround` methods of today (`src/render/lighting/layer.ts:37`, `src/render/fields/overlay.ts:109`) only draw. | 2a |
| `src/render/renderer.ts` | `collectGuests` cull (`:563-564`) | Pixel: cull margins from `PIXEL_GUEST_BOUNDS` and `PIXEL_GUEST_ITEM_BOUNDS`. | 2b |
| `src/render/management/layer.ts` | `collectPathItems` (`:203-230`), push (`:227`) | Pixel only: when `map.pathItemLevel[i]` is not 0, `z` is the `z` of the elevated path with that id in `world.state.elevatedPaths` (today `surfaceZ`, so a deck item is drawn at ground height). This is the rule of the lamp light source (`rebuildSnap`, `src/sim/lighting/lightMap.ts:607-609`), so the lamp and its bulb (`drawBulbs`, `src/render/lighting/pass.ts:245-246`) stand at the same height. Classic does not change. | 2b |
| `src/ui/scenario/mascotArt.ts` | `mascotCanvas` (`:109-134`) | Pixel: section 8.5. | 2b |
| `src/ui/mood/moodBar.ts`, `src/ui/tips/bubble.ts`, `src/ui/scenario/tutorialUi.ts` | cache keys (`moodBar.ts:57` in `portrait`, `bubble.ts:84` in `show`, `tutorialUi.ts:123` in `setGuide`) | Each key adds `artStyle()` (section 8.5). | 2b |
| `src/render/sprites/rides.ts` | `drawRideArt` (`:471-495`) | Surface branch inside the `withGates` body, before the `switch` (section 5.4 rule 2). | 3 |
| `src/render/sprites/rides.ts` | `rideArtBounds` (`:50-54`) | Pixel: the height is `pixelRideHeight(defId)` when it is defined, else today's rule. | 3 |
| `src/render/scenery/art/index.ts` | `sceneryArtBounds` (`:35-44`) | The `def` parameter type gains `id` (its callers pass a full `SceneryDef`: `scenery/sprites.ts:77`, `scenery/preview.ts:12`). Pixel: `top` is `pixelSceneryTop(def.id)` when it is defined, else today's rule. | 3 |
| `src/render/renderer.ts` | `drawSelection` (`:787-848`), arrow (`:821-823`) | Pixel: arrow heights from the pixel bounds. | 3 |
| `src/render/management/layer.ts` | `drawPatrol` staff arrow (`:436-441`) | Pixel: arrow heights from the pixel staff stamps. | 3 |
| `src/render/scenery/layer.ts` | `collect` cull (`:104-108`) | Pixel: the top margin is `pixelSceneryTop(def.id)` when it is defined, not `heightM × STEP + ART_HEADROOM_PX`. | 3 |
| `src/render/lighting/pass.ts` | heights (`:45-54`) | Pixel: bulb and lamp heights from the pixel art. | 3 |
| `src/render/track/layer.ts`, `src/render/track/paint.ts` | `paintSlice` (`layer.ts:321`), `paintCar` (`paint.ts:773`) | Surface branch to `paintSlicePixel` and `paintCarPixel`. | 4a |
| `src/render/track/layer.ts` | `sliceBounds` (`:226`), `runsInTile` (`:175-190`) callers; slice build (`:691`); riders (`:880-921`) | Pixel: section 12, stage 4a, track rules. | 4a |
| `src/render/track/layer.ts` | `drawChain` (`:719`), `drawWater` (`:763`), `drawSpray` (`:802`), `drawPlainSlice` (`:698`), `drawPlainCar` (`:870`) | Pixel at `n > 0`: chain dashes, ripples and the stand-ins as `artDash` lines; spray as single art pixels with `artDot` (section 12, stage 4a). At `n = 0`: today's drawing. | 4a |
| `src/render/renderer.ts` | `drawPreview` (`:1157-1198`) | Pixel: `pixelPreview(...)` then `drawPixelPreview(...)`. | 4b |
| `src/render/track/preview.ts` | `drawTrackPreview` (`:52`) | Pixel: `pixelPreview(typeId, 'track', …)` then `drawPixelPreview`. | 4b |
| `src/render/scenery/preview.ts` | `drawSceneryPreview` (`:8`) | Pixel: `pixelPreview(defId, 'scenery', …)`. | 4b |
| `src/render/shows/preview.ts` | `drawShowSitePreview` (`:6`) | Pixel: `pixelPreview(defId, 'show', …)`. | 4b |
| `src/ui/decks/card.ts` | `previewCanvas` (`:111-132`), `newCanvas` (`:103-105`), cache (`:101`) | Cache key `${id}@${dpr}@${artStyle()}`. Pixel: section 8.5; the source and the copy both have the size `CARD_ART_W × m` by `CARD_ART_H × m` (section 8.5 item 3). | 4b |
| `src/ui/scenery/picker.ts`, `src/ui/shows/picker.ts` | `preview` (`:39-52`, `:25-38`) | Pixel: section 8.5. In Pixel the `preview` canvas gets the class `pixel-preview` (today it has no class, `src/ui/scenery/picker.ts:41`, `src/ui/shows/picker.ts:27`). | 4b |
| `src/styles/main.css` | new rule `.pixel-preview` after `.card-details .card-preview` (`:546`) | `.pixel-preview { image-rendering: pixelated; }`. In Pixel, `newCanvas` of `card.ts` and the picker `preview` functions add the class `pixel-preview`; in Classic no canvas has it, so Classic does not change. The box rules of `.card-preview` (`:358`, `:546`) do not change. | 4b |
| `src/render/pixel/style.ts` | `ART_STYLE_AUTO` | `'pixel'` after the owner's yes (section 9.5). | 4c |
| `src/render/track/paint.ts` | `paintGateBooth` (`:903`; built at `track/layer.ts:830`) | Surface branch to `paintGateBoothPixel`. | 5a |
| `src/render/sprites/rides.ts` | `withGates` (`:111-117`) | On a surface, it calls `pixelGate` in place of `drawGate` (`:101`). | 5a |
| `src/render/elevated/layer.ts` | deck fill (`:110-130`), colours `ELEVATED_COLOURS` (`:26-36`) | Pixel at `n > 0`: deck tops, edges and post columns as art-pixel fills in the path and queue slots, on the art grid. | 5a |
| `src/render/shows/layer.ts` | `drawAfterObjects` beam and rocket origins (`:266-275`) | Pixel: origins from the pixel show art. | 6 |
| `src/render/renderer.ts` | `drawGhost` (`:728-785`), overlays `tileFace` … `drawOverlays` (`:623-871`) | Pixel: section 12, stage 7 (the decided rules; the stage 7 brief gives the rest). | 7 |
| `src/render/lighting/pass.ts` | light multiply (`:159-169`); `drawBulbs` bulb positions (`:229-300`, ride corners `:285-297`) | Pixel: section 12, stage 8 (the decided rules; the stage 8 brief gives the rest). | 8 |
| `src/render/spriteCache.ts` | `Sprite` (`:14-21`) | New optional member `artHash?: number` (section 5.1). Classic sprites have none. | 1a-ii |
| `src/render/canvas.ts` | `buildSprite` Pixel branch; new export `artBuildLog` | The branch sets `artHash = s.hash()` and pushes it to `artBuildLog.hashes` when that is an array (section 5.1). | 1a-ii |
| `.gitignore` | — | Add `.pixel-sheets/`. | 1a-ii |

Adaptations to the design record, because the code of today differs:
- The design record says `renderer.ts:453` keeps the last ride sprite. The code resets every ride sprite at `:432` and assigns at `:454`, so a separate `lastRideSprite` map holds it.
- The design record names `edge(side)`. A track cut is a sample position, not a side of the image, so the surface has `cut(on)`.
- The design record puts the sheet and colour scripts under `scripts/`. Scripts there import only Node modules (the imports of `scripts/check-release.ts`), so these tools are gated Vitest files that can import the source (section 8.6).
- The design record says "putImageData if `ctx.createImageData` exists". The fake canvas answers every method, so the test is `typeof ImageData`.
- The design record lists `src/ui/mascots.ts` and a 22 × 28 portrait. The file is deleted, and today's faces are two heads with two moods (`src/ui/scenario/mascotArt.ts:7, 49, 77`). Phase 8 draws two heads with two moods.
- The design record sets the card box from a whole scale. The card box is flexible (`src/styles/main.css:358, 546`) and gives way to the text, so the canvas content is at a whole scale and the on-screen scale may be uneven.
- The design record keeps the canvas at CSS size 100 %. Then the Pixel 7 profile stretches by a factor that is not `k` (section 7.1), so in Pixel the canvas box follows the backing size.
- The design record keeps a run-time derived-colour rule. That rule makes pixels depend on build order, so derived outputs go into the checked-in map instead (section 6.5).
- The design record snaps cars like walkers with a fixed slope. Track tangents have any slope, so `snapCar` takes the tangent.
- The design record has no Pixel bounds. The code sizes each sprite from Classic heights (`rideArtBounds`, `src/render/sprites/rides.ts:50`; `sceneryArtBounds`, `src/render/scenery/art/index.ts:35`), so the twins export `pixelRideHeight` and `pixelSceneryTop`.
- The design record sets one fixed limit: a unit test fails when the gzip of `src/render/pixel/**` passes 40 KB. Twins and Classic ship together until stage 5b, so the limit is a sum of steps by stage (section 10.4 item 6), with the start values of section 15. It stays a hard test.
- The design record ports proof code (`rasterizer-poc`). That code was not kept, so section 5.3 is the full rule and `pixel3.py` is the source for shapes.
- The design record has the renderer clear every art cache. Several caches are private to layer closures, so `WorldLayer` gets `clearArt?()` and `TrackLayer` gets `clearArt()`.
- The design record marks lit and dark map entries with `<` and `>`. A `StampMap` value is a slot name or a CSS colour, so the spec keeps the pairs on the `Stamp` (`pairs`), and one map serves stamps with and without a mirror.
- The design record counts 24 kit helpers with the draft shading. This spec counts 20 in stage 2a; section 5.4 rule 3 names the other 4.

### 5.6 Caches and the style switch

1. Pixel sprites use bucket 0.5, so they get the same keys as Classic bucket-0.5 sprites (`src/render/spriteCache.ts:47-50`). The key layout does not change (`tests/unit/render/spriteCache.test.ts:30-35`).
2. On an `artStyleVersion()` change, `draw` re-plans and clears: the sprite bank (`bank.cache.clear()`), the terrain chunk images, the track slice, gate and car sprites (`track.clearArt()`), the scenery sprites, show sprites and shadow masks (`l.clearArt?.()` for each world layer), the static layer and `lastRideSprite`.
3. Card pictures put the style in their cache key (section 5.5). The pickers keep no cache; they draw again when the picker builds its cards (`preview`, `src/ui/scenery/picker.ts:39-52`, called at `:125` in `showTheme`; `src/ui/shows/picker.ts:25-38`). The mascot callers put the style in their keys (section 8.5).
4. A zoom change between crisp levels builds nothing: one image per sprite serves every level. The first step to the soft level builds the soft chunks under `FIRST_BUILD_BUDGET_MS`.

---

## 6. Colour

### 6.1 Draft ramps

From `pixel3.py:12-26`, light to dark. Fixed.

| Ramp | Meaning | Tones |
|---|---|---|
| `g` | sunlit grass | `#f0e07a` `#d6c85a` `#bdb24b` `#98993f` `#6f7f3a` `#4d6238` |
| `s` | sand and paving | `#ffe9bf` `#fbd08e` `#f0ae62` `#cf8444` `#9c5a36` `#6e3d2e` |
| `o` | orange to red | `#ffd76a` `#ffab33` `#f47a1c` `#d9501a` `#a8301f` `#6e2330` |
| `t` | teal | `#b4f0e0` `#62d1c0` `#2fa89c` `#207a80` `#1a5266` |
| `b` | blue | `#a9d8ff` `#5aa2ee` `#356cc4` `#27468c` |
| `v` | violet | `#c9a4f0` `#9a6bd6` `#6b45a8` `#472d78` |
| `c` | cream to stone | `#fff8e6` `#f3e0be` `#d3b894` `#a48a78` `#75606a` |
| `l` | leaves | `#c2de62` `#8fc04a` `#5a9a44` `#3a7748` `#28554a` |
| `w` | wood | `#d99a5a` `#b06a34` `#7a4426` `#4f2c22` |
| `k` | skin | `#f8d2a6` `#d99a66` `#9a5e38` `#5e3a26` |
| `a` | water | `#8fe3d6` `#52c4bd` `#35a0aa` `#27788c` |
| `p` | pink | `#ffb0c0` `#ff7a9a` `#d94a78` |
| `i` | plum to ink | `#6e4470` `#4a2c52` `#2a1a36` |

### 6.2 Added ramps

| Ramp | Meaning | Tones | Status |
|---|---|---|---|
| `n` | neutral grey (rock, metal, queue, silver and charcoal track) | `#f4f1ea` `#dcd6cc` `#bdb5ab` `#958d8a` `#6d6670` `#4d4856` (the draft frost theme's `s` ramp, `pixel3.py:30`) | Provisional; fixed by the stage 1a-ii colour sheet. |
| `e` | snow | `#ffffff` `#eef6ff` `#dbe9f7` `#bcd2ea` `#93b0d2` `#6f8fb8` (the draft frost theme's `g` ramp, all 6 tones, `pixel3.py:30`; tone 6 gives snow cliffs and shadows on snow a dark tone) | Provisional; fixed by the stage 1a-ii colour sheet. |
| `r0` … `r8`, `r11` | player track colours | For each `TRACK_PALETTE` colour `c` with index 0 to 8 and 11 (`src/render/track/colours.ts:5-18`): `[shade(c, 1.3), c, shade(c, 0.7)]`. Index 9 (silver) and 10 (charcoal) use `n`. | Provisional; fixed by the stage 4a track sheet. |

`TRACK_PALETTE` values do not change; the track panel shows them as swatches (`src/ui/track/ridePanel.ts:11`).

Only `trackSlot(i, tone)` reaches the `r` ramps: `r{i}` tone 1 to 3, or `n2`, `n3`, `n4` for index 9 and `n4`, `n5`, `n6` for index 10. The track twins of stage 4a call it directly. The colour map never names an `r` slot. Before stage 4a, Classic track art on a surface resolves `TRACK_PALETTE` literals through the colour map, as any other literal.

### 6.3 Signal slots

Signal slots carry meaning. They are fixed. No art colour maps to a signal slot.

| Ramp | Tones | Source |
|---|---|---|
| `x` | `#0072B2` `#56B4E9` `#E69F00` `#D55E00` | `SAFE_PALETTE`, `src/data/tuning/a11y.ts:15` |
| `y` | the 9 temperament tint steps `tintStepRgb(0…8)` | `src/render/palette.ts:84-103` |
| `q` | valid ghost tones: `GHOST_LIGHT_VALID` (`#cce3f0`), `shade(GHOST_VALID, 1.4)` (`#66aad1`), `GHOST_VALID` (`#0072b2`), `GHOST_DARK_VALID` (`#00446b`) | `src/render/palette.ts:10-21` |
| `u` | invalid ghost tones: `GHOST_LIGHT_INVALID` (`#f7dfcc`), `shade(GHOST_INVALID, 1.4)` (`#e69e66`), `GHOST_INVALID` (`#d55e00`), `GHOST_DARK_INVALID` (`#803800`) | `src/render/palette.ts:10-21` |

**Decision: tone 2 of the ghost ramps.** Tone 2 of `q` and `u` is `shade(base, 1.4)`, a tone of the same safe blue or vermillion, between `GHOST_LIGHT_*` (`shade(base, 1.8)`) and the base. Why: the design record (§4, stage 7) asks for "ghosts in four palette tones of the safe blue or vermillion"; `#56B4E9` (sky blue, `GHOST_WATER`) and `#E69F00` (orange, also Thrill tint step 8) are other hues. The four tones fall in lightness (HSL `L` 0.87, 0.61, 0.35, 0.21 for `q`; 0.88, 0.65, 0.42, 0.25 for `u`), so each threshold of `ghostTable` below picks one tone. No literal under `src/render/` equals `#66aad1` or `#e69e66` today (`grep -rni`), so rule 0 of section 6.5 catches no art colour.

`ghostTable(tint)` uses the `q` tones when the RGB of `tint` equals the RGB of `GHOST_VALID` (`src/render/palette.ts:10`), else the `u` tones. `GHOST_TINT_VALID` (`src/render/sprites/bank.ts:23`) is `rgbaOf(GHOST_VALID, 0.5)` (`:26-29`), so it selects `q`, and `GHOST_TINT_INVALID` (`:24`) selects `u`. Why the RGB test, not `tint === GHOST_TINT_VALID`: `src/render/pixel/palette.ts` then imports only `src/render/palette.ts`, not `sprites/bank.ts`; an import of `bank.ts` would make the cycle `canvas.ts` → `pixel/palette.ts` → `sprites/bank.ts` → `canvas.ts` and would load the sprite system into `palette.test.ts`. It maps every art slot to one of the 4 tones by the HSL lightness `L` of the slot colour: `L ≥ 0.75` → tone 1, `L ≥ 0.5` → tone 2, `L ≥ 0.25` → tone 3, else tone 4. Index 0 stays 0. `INK_SLOT` → tone 4.

### 6.4 The colour map

**What it holds.**
1. One entry for each distinct colour literal under `src/render/`, outside `src/render/pixel/`: every `#rrggbb` (case folded) and every `rgb(…)` / `rgba(…)` literal with numbers, keyed by its `#rrggbb` value. At HEAD `03720b2` that is 733 distinct hex values and 88 distinct numeric `rgb`/`rgba` literals (108 occurrences): 821 distinct strings (`grep -rhoE "rgba?\([0-9., ]+\)" src/render --include=*.ts | sort -u | wc -l` gives 88). The map has fewer keys, because `rgba` literals that differ only in alpha share one `#rrggbb` key. The tool reports the exact count.
2. One entry for each derived output that the generator records (section 6.5).
3. An entry is global. It also serves every other use of the same literal. For example, `#3d9be0` is a shirt, `TRACK_PALETTE[4]` (`src/render/track/colours.ts:10`) and the litter can; `#e8503a` is a shirt, the queue rope (`src/render/terrain.ts:40`) and the litter cup.

**How it is made.**
1. `TC_PIXEL_COLOURS=1 npx vitest run tests/unit/render/pixel/colourMapGen.test.ts` scans the files, builds every sprite with the derived memo on (section 6.5), and writes a proposal to `.pixel-sheets/colourMap.proposed.ts` and a colour sheet `.pixel-sheets/colours.png`. Without the variable the file skips.
2. The proposal rule for a literal: inside the colour's hue family (section 6.5), the ramp whose tones keep the order of lightness, then the tone of nearest lightness. It never uses nearest RGB over the whole palette.
3. A person checks the sheet by eye and edits the entries. The checked file is `src/render/pixel/colourMap.ts`.

**Fixed entries** (they repair the wrong snaps that the design record measured):
- the grass pair `#6dbb4f` / `#64b049` (`src/render/terrain.ts:29`) → `g2` / `g3`;
- the queue `#a9c0d2` (`:40`) → `n3` (`QUEUE_SLOT`, provisional; stage 1a-ii colour sheet), never an `a` slot;
- the path `#dcc79c` (`:39`) → `s2`;
- snow `#f2f6fa` / `#e6edf3` (`:33`) → `e1` / `e2`;
- cliffs `#9a7148` / `#7b5835` (`:36-37`) → `w2` / `w3`;
- silver `#c5ced8` and charcoal `#3b4250` → `n3` / `n5`, the base tones of `trackSlot(9, 2)` and `trackSlot(10, 2)`;
- `#56b4e9` → `b2`: ride art draws it (`src/render/sprites/content/phase6Rides.ts:237, 241`), so it is an art colour (section 6.5 rule 0);
- `#000000` → `i2`. `shade` of an `rgb(…)` string gives `#000000` (`src/render/palette.ts:122-132` parses `hex.slice(1)`), for example the arms of a tinted guest;
- a dark fill maps at least one tone above ink: no entry names `i3`, except the entry of a literal that equals `#2a1a36` (check 6);
- guest shirts (`SHIRT_COLOURS`, `src/render/palette.ts:52-65`), by hue (provisional; stage 1a-ii colour sheet):

| Literal | Name | Slot |
|---|---|---|
| `#e8503a` | tomato | `o4` |
| `#f39a2b` | orange | `o3` |
| `#f5d03b` | sun yellow | `o1` |
| `#7cc04b` | leaf green | `l2` |
| `#2fb39a` | teal | `t2` |
| `#3d9be0` | sky blue | `b2` |
| `#4f63d9` | cobalt | `b3` |
| `#8d5ad8` | violet | `v2` |
| `#d457a8` | pink | `p2` |
| `#f2f2f2` | white | `c1` |
| `#a0522d` | sienna | `w2` |
| `#30425a` | navy | `i2` |

**Checks** (`tests/unit/render/pixel/colourMap.test.ts`, 6 checks):
1. Every literal that the scan finds has an entry. A new literal without an entry fails the test.
2. Every entry names an existing slot.
3. No entry names an `r` slot. An entry names a signal slot only when its literal equals that slot's colour and the entry is in the list `SIGNAL_ENTRIES` of `colourMap.test.ts` (hand-checked). `#56b4e9` names `b2`.
4. The two tones of each pair in `FACE_PAIRS` are on one ramp, with different tones. `FACE_PAIRS` (in `colourMap.test.ts`) starts with: `#6dbb4f`/`#64b049`, `#9a7148`/`#7b5835`, `#f2f6fa`/`#e6edf3`, and the `light`/`dark` pairs of `TAG_COLOURS.thrill`, `.family` and `.chill` (`src/render/palette.ts:115-119`). Each art batch adds the lit and dark face literals of its objects.
5. No banned literal of `tests/unit/render/safeColours.test.ts:26-43` is in `palette.ts` or `colourMap.ts`. (That test scans every `.ts` file under `src/render/`, `:71-82`.)
6. No entry names `i3` (`INK_SLOT`), except the entry of a literal that equals `#2a1a36`. Why: a dark fill on the ink slot merges with the outline (the design record's repair "dark fills kept one step off `i3`").

### 6.5 Colour resolution (`slotOf`)

`slotOf(css)` parses the colour to `#rrggbb` and takes the first rule that matches:

0. The colour equals a signal slot colour → that slot. Where two signal slots share a colour, the first in the order `x`, `y`, `q`, `u` wins; they draw the same. Exception: `#56b4e9` (slot `x2` and tint step 0) skips rule 0, because ride art draws it (`phase6Rides.ts:237`). It resolves through `COLOUR_MAP` to `b2`. Ghost tints never reach `slotOf`: they go through `remap(ghostTable(tint))`.
1. `COLOUR_MAP` holds the colour → that slot.
2. Fallback: `nearestInFamily(rgb)`, the nearest slot by RGB distance inside the family of the colour, and `paletteStats.misses` goes up by 1.

Family rules (exact). Hue, saturation and lightness are HSL.
- a. A colour with saturation below 0.15 has the grey family: `n`, `e`, `c`.
- b. Any other colour has the ramps whose mid tone hue is within 30° of its hue. The mid tone of a ramp with `t` tones is tone `ceil(t / 2)`. The ramps `n`, `e`, `c` and `i` take no part in this rule.
- c. When rule b finds no ramp, the family is the one ramp with the nearest mid tone hue.
- d. A colour with lightness below 0.2 also has `i1` and `i2` in its family (dark plum). `i3` (`INK_SLOT`) is in no family, so `nearestInFamily` never returns `INK_SLOT`, also in mix and snap (section 5.3 rule 6).
- e. A family never holds `x`, `y`, `q`, `u` or an `r` ramp.

`palette.test.ts` has one case for each of rules a to e.

`slotOf` reads no state that drawing writes. Only rule 2 counts a miss. The three rules are pure functions of the colour, so the same sprite always gets the same pixels, in any build order (master spec §2.5).

**Derived colours.** Art makes colours at run time: `shade` (`src/render/palette.ts:122`), `mixHex` (`src/render/scenery/art/kit.ts:78`) and the private `shade` of `src/render/shows/art.ts:23`. Every function under `src/render/` that returns a colour built from another colour calls `noteDerived` or `noteMixed`. The memo records only while the generator runs:
1. The generator calls `startDerivedMemo()`, builds every sprite in Node, then calls `stopDerivedMemo()`. "Every sprite" is: every ride, stall, scenery and show-site sprite of the catalogs in 4 rotations and every frame; every staff frame (`staffFrame(type, costume, walk, action)` for each staff type, costume, walk and action value, `src/render/sprites/staff.ts:33`) in 4 facings (`bank.staff`); every path item frame (`bank.pathItem`, the frame bits of `src/render/sprites/bank.ts:173`); every litter and mess decal with flip 0 and 1 (`bank.decal`); the fence in 4 directions (`bank.fence`); both entrance parts with each `outerDir` 0 to 3 and −1 (`bank.entrance`); from stage 1c, the `paintGroundChunk` chunks of the two generator maps, `createWorld({ seed: 1, parkName: 'Gen' })` (64 × 64, layout `classic`) and `createWorld({ seed: 1, parkName: 'Gen', layout: 'freePlay' })` (96 × 96) (`src/sim/world.ts:21-28, 76`), in 4 rotations (before stage 1c the generator builds no chunks: chunks are not surfaces yet, and the terrain literals are in the fixed entries of section 6.4); the track slices of every piece in 4 rotations and the cars at every pose, for each of the 12 track colours; the guests with the tint bit for steps 0 to 8.
2. For each recorded output that has no map entry, the proposal is: `shade(base, f)` → the base's slot moved by `round(ln f / ln SHADE_STEP)` tones toward light (`f > 1`) or dark (`f < 1`), clamped to the ramp; on the `i` ramp a dark move stops at `i2` and never reaches `i3`; `mixHex(a, b, t)` → the ramp of `a` when `t < 0.5`, else of `b`, at the tone of nearest lightness.
3. When two records give one output from different bases, the proposal uses the base that comes first in `COLOUR_MAP` key order.
4. The outputs go into `COLOUR_MAP` as ordinary entries, and a person checks them as for the literals.

At run time `noteDerived` and `noteMixed` return at once, so `shade` and `mixHex` keep today's output.

**Gate:** `tests/unit/render/pixel/sprites.test.ts` (from stage 1a-ii) builds sprites in Pixel and fails on any miss. It builds them twice in two orders and compares the hashes.

### 6.6 Colour-blind rule

`tests/unit/render/pixel/palette.test.ts` runs before any art is tuned (stage 1a-i). It converts pairs of slots through the Machado (2009) matrices for protan, deutan and tritan at severity 1.0, then to CIE Lab, and requires a CIE76 distance of at least `CB_MIN_DELTA_E` (10, fixed; a decision of this spec, section 15) for each pair:
1. `x1` against `x4` (valid against invalid).
2. `y1` against `y9` (Chill tint against Thrill tint).
3. The Chill ramp mid tones `t3`, `b2` against the Thrill mid tone `o3`.
4. The queue slot `n3` against the footpath slot `s2`.

When a pair fails, the threshold does not change. Pair 4 is repaired by `QUEUE_SLOT` (stage 1a-ii colour sheet). Pair 3 is repaired by the choice of Chill and Thrill mid tones. A failure of pair 1 or 2 (fixed signal colours) goes to the owner at the stage 1a-i review.

Colour is never the only signal: the check and cross icons, the hatch on invalid ghosts, and the full and notched temperament rings stay (Phase 6 §4.7). None of the draft colours is a banned literal (checked at HEAD `1bef750`; `src/render/` is the same at `03720b2`; tone 6 of `e`, `#6f8fb8`, is not in the banned list `tests/unit/render/safeColours.test.ts:26-43` either).

---

## 7. Zoom and sharp pixels

### 7.1 Policy

1. One art pixel is always `n × k` device pixels at a crisp level, with `n` and `k` whole.
2. `k` is the stretch. `planStretch(deviceRatio, device, capped)`:

| Device class | `capped` false | `capped` true (`low`, or `auto` after its step down) |
|---|---|---|
| desktop | 1 | `max(1, floor(deviceRatio))` |
| phone | `max(1, ceil(deviceRatio / PHONE_MAX_RENDER_SCALE))` (cap 2, `src/data/tuning/perf.ts:7`) | `max(1, ceil(deviceRatio))` |

Why the desktop floor: today `low` never puts a desktop below canvas ratio 1 (`renderPlan`, `src/perf/quality.ts:71`). On 1.25× and 1.5× desktops no whole `k` gives a canvas ratio between 1 and the device ratio. So `low` and the `auto` step down keep the canvas ratio at 1.25 or 1.5 there. This departs from the design record §3.1 (`ceil(ratio)` = 2, ratio 0.625 or 0.75), which goes below the floor. The cost is in section 14 row 22.

3. Canvas ratio = `deviceRatio / k`. Backing size = `ceil(cssW × deviceRatio / k)` by `ceil(cssH × deviceRatio / k)`, where `cssW` and `cssH` are the viewport size. The canvas box is the backing size × `k` device pixels: `canvas.style.width = canvas.width × k / deviceRatio` CSS pixels, height the same. So the browser scale is exactly `k`. The box is anchored at the top left and is less than `k` device pixels larger than the viewport in each direction (the viewport need not be a whole number of device pixels: Pixel 7 at `k = 2` gives 2204 against 839 × 2.625 = 2202.375); the part past the viewport is cut. No canvas pixel is narrower than another.
4. `n = artScale(zoom, grid)`: `2 × zoom × canvasRatio` when that value is within `LEVEL_EPS` (1e-6) of a whole number ≥ 1, else 0.
5. The renderer draws any zoom it is given. With `n > 0`, every copy is exact. With `n = 0` (a pinch in progress, a test, a script), smoothing stays off and pixels are uneven for that moment. Nothing blurs, except the soft level.

Why item 3: with the 100 % box of today (`src/styles/main.css:34`) the browser scales by `(CSS size × device ratio) / canvas size`, which is not `k`. On the Pixel 7 profile (412 × 839 at 2.625, `playwright.config.ts:20`), the height is 2202.4 device pixels against 1102 × 2 = 2204, so the stretch drops rows in the middle of the screen.

### 7.2 Levels

`zoomLevels(grid)` returns, in ascending order:
- every crisp level `zoom = n × k / (2 × deviceRatio)` for whole `n ≥ 1` with `ZOOM_MIN ≤ zoom ≤ ZOOM_MAX` (0.25 to 2, `src/render/camera.ts:6-7`);
- the soft level `ZOOM_MIN` (0.25) when the smallest crisp level is at least `SOFT_LEVEL_GAP × ZOOM_MIN` (1.5 × 0.25 = 0.375).

`nearestLevel(zoom, grid)`: the level with the smallest `abs(level − zoom)`; a tie within `LEVEL_EPS` goes to the smaller zoom. `stepLevel(zoom, dir, grid)`: the first level strictly above (`dir = 1`) or below (`dir = −1`) `zoom ± LEVEL_EPS`; at the ends it returns the end level. `levelStep(grid) = k / (2 × deviceRatio)`.

### 7.3 Levels by screen

| Screen | k | Canvas ratio | Crisp levels | Soft level | Home |
|---|---|---|---|---|---|
| Desktop 1× | 1 | 1 | 0.5, 1, 1.5, 2 | 0.25 | 1 (the exact draft) |
| Desktop 1.25× | 1 | 1.25 | 0.4, 0.8, 1.2, 1.6, 2 | 0.25 | 0.8 (art pixel 1.6 CSS px) |
| Desktop 1.5× | 1 | 1.5 | 0.333 to 2 in steps of 0.333 | none | 1 |
| Desktop or phone 2× | 1 | 2 | 0.25 to 2 in steps of 0.25 | none | 1 |
| Desktop 3× | 1 | 3 | 0.333 to 2 in steps of 0.167 (11 levels) | none | 1 |
| Phone 2.625× (Pixel 7) | 2 | 1.3125 | 0.381, 0.762, 1.143, 1.524, 1.905 | 0.25 | 1.143 (8/7) |
| Phone 3× | 2 | 1.5 | 0.333 to 2 in steps of 0.333 | none | 1 |
| Pixel 7 at `low`, or after the `auto` step down | 3 | 0.875 | 0.571, 1.143, 1.714 | 0.25 | 1.143 (8/7) |
| Desktop 2× at `low` | 2 | 1 | 0.5, 1, 1.5, 2 | 0.25 | 1 |
| Desktop 1.25× at `low` | 1 | 1.25 | as at `high` | as at `high` | as at `high` |
| Desktop 1.5× at `low` | 1 | 1.5 | as at `high` | as at `high` | as at `high` |

The Pixel 7 test profile has a CSS viewport of 412 × 839 (`playwright.config.ts:20`). At `k = 2` its canvas is 541 × 1102 and its box 412.19 × 839.62 CSS pixels. Today the `auto` step down gives 412 × 839, and fixed 2× gives 824 × 1678.

### 7.4 Controller rules (Pixel only)

The controller reads `pixelGrid.current` (published by `applyPlan`). Classic keeps today's rules (`src/input/controller.ts:123-129, 150-155, 277-282`).

1. **Wheel.** `wheel` adds `wheelNotches(deltaY, deltaMode)` to an accumulator. When `abs(sum) >= 1 − LEVEL_EPS`, the zoom steps one level with `stepLevel` around the pointer (`zoomAt` with factor `level / cam.zoom`), and the sum moves 1 toward 0. The sum resets to 0 after `WHEEL_IDLE_RESET_MS` (300 ms) with no wheel event: `wheel` gains a 5th parameter `t` (`e.timeStamp` from `src/input/index.ts:97`, section 5.5), and when `t − lastWheelT ≥ WHEEL_IDLE_RESET_MS` the sum is set to 0 before the new notches are added; then `lastWheelT = t`. A desktop trackpad pinch arrives as wheel events (`src/input/index.ts:92-100`) and follows the same rule.
   **Decision: the idle reset.** The design record (§2.4, the repair of authored W4) adopts the notch accumulator; the idle reset and its value are decisions of this spec. Why: a trackpad sends many small deltas, and without a reset the rest of a notch from a scroll long ago adds to the next small move and makes a step that the player did not ask for. 300 ms is longer than the gap between the events of one gesture (one event per frame, about 16 ms) and shorter than the pause between two gestures. A change of the value is a spec change.
2. **Keys.** One press of a zoom key (`src/input/keyboard.ts:34-35`) steps one level around the viewport centre.
3. **Pinch.** A pinch zooms freely, as today. On `pinchEnd` (`src/input/gestures.ts:52`; ignored today at `controller.ts:314-315`) the zoom settles to `nearestLevel` around the last pinch centre. The `pinchEnd` action carries no position, so the controller stores `cx` and `cy` of each `pinch` action (`apply` case `'pinch'`, `controller.ts:277-282`) and uses the last pair on `pinchEnd`. The settle runs over `PINCH_SETTLE_MS` (100 ms) in `update`, or at once with reduced motion. **Decision:** 100 ms is a decision of this spec. Why: about six frames at 60 Hz, so the settle reads as one short snap after the fingers lift, not as a jump and not as a slow glide. A change of the value is a spec change.
4. **Grid change.** In `update`, when `pixelGrid.version` changed (start, resize, plan change, style change) and `pixelGrid.current` is not `null`, the zoom settles at once to `nearestLevel` around the viewport centre.
5. The controller does not settle a zoom that a test or a script sets through `window.__tc`. Rule 4 runs only on a grid change.
6. `#game[data-zoom]` (`src/render/renderer.ts:1121-1124`) keeps its 3-decimal format and changes on every step. `#game[data-art-scale]` holds `n`, and `#game[data-home-zoom]` holds the home level at full precision (`String(level)`, section 5.5).

### 7.5 Far overview (owner decision 2, default)

1. The soft level 0.25 exists where section 7.2 says.
2. There, smoothing is on for the copy of the static layer and the sprites. Terrain chunks come from a second image painted with `soft = true` (no Bayer dither, so no moiré).
3. Soft chunk images keep today's overlap: each tile grows by 1 art pixel (today: growth `0.6 / scale`, `src/render/terrain.ts:105-117, 551`). A soft chunk is a `PixelSurface` with `{ ink: false }`, so its pad is `SURFACE_PAD` (2 art pixels), which holds the growth (today `CHUNK_PAD = 2`, `:399`). So a filtered copy shows no seam.
4. Guests are dots there, as today (`GUEST_LOD_ZOOM = 0.5`, `src/data/tuning/perf.ts:12`).

### 7.6 Home level

The home level is `nearestLevel(HOME_ZOOM_TARGET, grid)` (`HOME_ZOOM_TARGET` = 1): the level nearest to 2 CSS pixels per art pixel, the approved scale. The game sets zoom 1 at start (`src/game.ts:17`); controller rule 4 settles it to the home level on the first frame.

### 7.7 Copy rules

`blitArt(ctx, sp, wx, wy, f)` with `f.n > 0`: `x0 = f.offX + wx × n / 2 − sp.ox × n`, `y0 = f.offY + wy × n / 2 − sp.oy × n`, width `sp.w × n`, height `sp.h × n`. Ride, stall, scenery, show, fence, entrance, slice and gate anchors are multiples of 2 world pixels, so every edge is whole. Walkers (guests, staff), cars, path items and ground decals (litter, mess) pass snapped anchors from stage 1b (section 5.5).

With `f.n = 0`, the size factor is `f.scale / sp.scale`, and the edges round as `blit` in `renderer.ts:338-345`.

`blitArtColumn(..., ends)`: as today's `blitColumn` (`:350-363`), at factor `n` (or at `f.scale / sp.scale` with `f.n = 0`). Bit 1 of `ends` extends the column to the left edge of the image; bit 2 extends it to the right edge.

`snapArt(v) = 2 × round(v / 2)`.

`snapWalker(ax, ay, slope)`: `x = snapArt(ax)`, then `y = snapArt(ay + (x − ax) × slope)`. `slope` is +0.5 when the walker moves along the view `u` axis, −0.5 along the view `v` axis, 0 when it stands. So a walker on a 2:1 path moves on a clean stair.

`snapCar(ax, ay, dx, dy)`: `(dx, dy)` is the car's travel tangent in view space. When `abs(dx) ≥ abs(dy) / 2`: `x = snapArt(ax)`, then `y = snapArt(ay + (x − ax) × s)` with `s = dy / dx` clamped to [−`CAR_SLOPE_MAX`, `CAR_SLOPE_MAX`] (2). Else (a near-vertical tangent): `y = snapArt(ay)`, then `x = snapArt(ax + (y − ay) × dx / dy)`. Why: x and y rounded apart make a moving train wobble.

### 7.8 What changes for the player

1. Zoom clicks between 4 and 11 sizes instead of gliding by 15 % (`src/input/camera.ts:13-14`). One wheel notch or key press is one size. A trackpad swipe steps after one notch's worth of movement.
2. A pinch follows the fingers and then settles in about 100 ms (at once with reduced motion).
3. At rest every art pixel is a crisp square. Only the soft level is blurred.
4. On a 1× monitor, the step from 0.5 to 1 doubles the picture.
5. On a 1.25× screen, the normal view is 20 % smaller than the draft.
6. Panning stays smooth to one canvas pixel. People and trains move in single art-pixel steps.
7. On phones above 2×, overlay lines become pixel dashes in stage 7. Text labels drawn into the canvas (cost labels, builder labels) stay blockier than today on phones above 2× (section 14 row 21).
8. Zooming between crisp levels builds nothing, so it is instant.
9. The tutorial "zoom" step asks for one size.
10. When `auto` quality steps down during play, `k` changes, and the zoom settles once to the nearest level of the new grid (controller rule 4).

---

## 8. Art rules

### 8.1 Pixel-art rules of the drafts

1. **Outline.** One art pixel of ink around each layer (section 5.3). No ink between parts of one layer. Two parts with a line between them are two layers (carousel body and roof, `pixel3.py:457, 472`). Spokes, lattice, rails and ropes have no outline.
2. **Light from the upper left, on the screen.** Tops lightest, left faces lit, right faces dark (`pixel3.py:220-241`). The art is painted in view space, so the light stays on the screen left in all 4 view rotations.
3. **Flat shading.** 2 or 3 tones per form. A cylinder is lit to `CYLINDER_LIT_SHARE` (60 %) of its width, then dark. A cone has `CONE_SEGMENTS` (16) segments, lit or dark by screen side, with stripe pairs. A tree has 3 stacked tones offset up and left, plus about 7 light specks and 5 dark specks. The speck positions of trees, shrubs and beds take the view rotation into their hash seed, so the 4 views differ (`tests/unit/scenery/art.test.ts:69-72`).
4. **Clusters.** A tone forms clusters. Specks and the single pixels of stamps (hands, eyes, bulbs) are the only single pixels. Lint rule: at most `ORPHAN_MAX_SHARE` (2 %, provisional) of the ink-making pixels (`inkMask` 1) of a sprite have no 4-neighbour of the same slot (section 8.6 item 2).
5. **Dither.** Only the 4 × 4 Bayer pattern, in world-anchored art-pixel coordinates, so it lines up across sprites and chunks. Use it for ground texture borders, translucent fills on nothing, light bands and tints. Never on object faces.
6. **Palette only.** Every sprite and chunk pixel is a slot. Two passes multiply over the finished frame and so leave the palette: the shadow layer (section 8.4) and the night pass (stage 8).
7. **Ground** (`ground.ts`, from `pixel3.py:106-170`):
   - Tiles are painted back to front. Each tile top is walked as a lattice in tile space; the height comes from the bilinear tile height (`src/render/terrain.ts:80-82`). Each sample is plotted at its art pixel and the pixel below, so steep faces have no holes.
   - Grass: two octaves of `vnoise` in map coordinates (scales `GRASS_NOISE_SCALES` 0.42 and 1.9) plus Bayer × `GRASS_BAYER_WEIGHT` (0.16). Sum below 0.30 → `g1`, below 0.56 → `g2`, else `g3` (`GRASS_THRESHOLDS`). With `soft = true` the Bayer weight is 0.
   - Grass details (the draft's `details` of the orange theme, `pixel3.py:28`, painted at `pixel3.py:746-767`): an art pixel of grass is a detail anchor when `hash3(ax, ay, 1) / 2^32 < GROUND_DETAIL_SHARE` (`ax`, `ay` the world-anchored art-pixel coordinates). `hash3(ax, ay, 2)` picks the kind with the shares 0.6 tuft, 0.25 flower, 0.15 rock. A tuft is `g4` at (−1, −1), (0, −2), (1, −1) over `g3` at (0, 0). A flower is one of `c1`, `o1`, `p1`, `p2` (picked by `hash3(ax, ay, 3)`) at (0, −1) over `l3` at (0, 0). A rock is `c3` at (0, 0), `c4` at (1, 0) and `c2` at (0, −1). Offsets are in art pixels from the anchor. A detail pixel is painted only on a grass pixel. A chunk scans the anchors within 2 art pixels outside its own rectangle, so a detail is whole across chunk edges. No details with `soft = true`.
   - Sand, dirt, rock, snow: the same noise, two tones of `s`, `w`, `n` and `e`.
   - Paths: each tile is 2 × 2 slabs; a slab is `s1` (22 % by `hash3`) or `s2`; joints `s3` where the slab fraction is below 0.13; the edge to grass `s4` within 0.11 tile.
   - Queues: the queue slot `n3`, same slab rule, posts and rope from the colour map.
   - Water: opaque `a2`; dashes `a1` (7.5 %) and `a3` (6 %) from `hash3` of `(x >> 2, y)`; far shore `a4`, near shore `a1`. Grass next to water: `g4` within 0.2 tile, `s4` within 0.09 tile.
   - Slopes: a face that turns to the light is one tone lighter; a face that turns away is one tone darker.
   - Land outside the park: `OUTSIDE_TONE_STEPS` (2) tones darker (today `× 0.78`, `terrain.ts:35`).
   - Cliffs and map edge faces: left face `w2`, right face `w3`, a strata line one tone darker every 4 art pixels.

### 8.2 Data-or-code rule

1. A part that only moves (a horse, a gondola, a rider, a stall icon, a guest) is a stamp.
2. A member that turns to any angle (an arm, a spoke, a rim, a rail, a car body) is drawn by code on the surface.
3. A stamp is never rotated. A stamp may be mirrored (section 8.3).
4. Frame counts stay: 32 angles × 5 rider levels per ride (`src/render/anim.ts:9, 57-60`), 16 angles and 3 levels on phones (`:71-75`), 16 yaw × 24 pitch × 16 roll car poses (`src/render/track/layer.ts:840-846`).
5. Where 32 angles shimmer, a ride may draw 16 distinct angles (each pair of frames shares one picture).

### 8.3 Stamps and mirroring

- **Format.** `rows` is a list of strings. The width is the length of the longest string. `.` and space are transparent. Each other letter is a key into the `StampMap`; the value is a slot name or a CSS colour. The letter `o` maps to ink unless the map says otherwise.
- **No second outline.** `stamp()` and `px()` paint cut pixels: they make no ink ring, and no layer's ring paints over them. A stamp carries its own outline in its `o` letters (the draft rows hold it: `pixel3.py:256-282`).
- **Anchor.** Bottom centre, as `pixel3.py:243`: the left column is `x − ART_PX_WORLD × floor(w / 2)` world pixels and the top row is `y − ART_PX_WORLD × (h − 1)`. `x` and `y` are even world pixels.
- **Output.** One `fillRect` of `ART_PX_WORLD × runLength` by `ART_PX_WORLD` world pixels per run of one letter, between `cut(true)` and `cut(false)` on a context that has `cut`. On a `PixelSurface`, `stamp()` and `px()` set `fillStyle` to the slot name when the map value is a slot name (section 5.3, members table). On any other context (a real context, a recorder), they set `fillStyle` to the slot colour (`SLOT_RGBA` of the slot as `#rrggbb`). A map value that is a CSS colour is passed through unchanged on every context. So a recorder sees fills in CSS colours.
- **Mirror.** `opts.mirror` flips the rows left to right. Each string in `pairs` holds two letters, "lit dark" (for example `"ab"`). When mirrored, the two letters swap their map values. So a mirrored stamp keeps its light on the screen left.
- **Single pixels.** `px(ctx, x, y, colour)` sets one art pixel (sparkle, bulbs, spray).
- **Guest rings.** The ring stamp names its slot directly: the `StampMap` value is the slot name `y{ringStep + 1}`, not the CSS colour, so on a surface the slot is selected directly (section 5.3, members table) and `slotOf` rule 0 and the `#56b4e9` exception do not apply. Why: the ring colour of today is the shirt colour `rgbCss(tintStepRgb(step))` (`src/render/sprites/bank.ts:139, 149`), and through `slotOf` step 0 (`#56b4e9`) gives `b2` and step 8 (`#e69f00`) gives `x3`.
- **Guest size.** The draft guest is 7 × 12 art pixels (`pixel3.py:256`), so `PIXEL_GUEST_BOUNDS` is `{ left: −8, right: 8, top: −24, bottom: 6 }`. The draft balloon adds 9 rows (`pixel3.py:260`), so `PIXEL_GUEST_ITEM_BOUNDS` is `{ left: −14, right: 14, top: −44, bottom: 6 }`. Both are provisional; the stage 2b lint test fixes them. Classic keeps `GUEST_BOUNDS` and `GUEST_ITEM_BOUNDS` (`src/render/sprites/props.ts:15, 17`).
- **Other kinds.** Staff, path items, litter, mess, fence and entrance keep today's bounds (`STAFF_BOUNDS`, `src/render/sprites/staff.ts:13`; `PATH_ITEM_BOUNDS`, `LITTER_BOUNDS`, `MESS_BOUNDS`, `src/render/sprites/litter.ts:11-13`; `fenceBounds()`, `entranceBounds()`, `src/render/sprites/props.ts`), widened to even world pixels by `buildSprite`.

### 8.4 Shadows

1. Shadows come from catalog data, not from art functions. `casterOf` returns:
   - ride: a box of the footprint, height `(ex + ey) × 8 − 6 − rideArtBounds(defId, w, d, rotation).top` world pixels, which is the art height that `rideArtBounds` uses (`HEIGHTS`, `CONTENT_RIDE_ART[id].height` or `genericHeight`, `src/render/sprites/rides.ts:50-54`), and in Pixel `pixelRideHeight(defId)` when it is defined (stage 3). `ex` and `ey` come from `extent(w, d, rotation)`. Why not `−top`: `top` is `(ex + ey) × 8 − height − 6`, so `−top` is 58 for the 3 × 3 carousel, not its height;
   - stall: a 1 × 1 box, height `16 − stallArtBounds().top` = 66 world pixels (`src/render/sprites/stalls.ts:31-33`);
   - scenery in the centre slot: shape `ellipse` for the ids in `ROUND_CASTERS`, else a `box` of the footprint of `src/data/catalog/scenery.ts` with `heightPx = heightM × 8` world pixels (the metre of `sceneryArtBounds`, `src/render/scenery/art/index.ts:41`). `ROUND_CASTERS` is `oak_round`, `pine_tall`, `birch_silver`, `willow`, `shrub_round`, `shrub_flowering`, `boulder` (`scenery.ts:48-53, 56`); stage 6 adds the round items of each theme it draws. Each round caster has a pair (`r`, `k`), as the draft call `sh_ell(x, y, r, k)` (`pixel3.py:173-175`: centre moved by `r × 0.55 × k` tiles along x and back along y, `rx = int(r × 22.6 × (1 + 0.35k))`, `ry = max(1, int(r × 11.3))`). The caster is `w = 2 × floor(r × 22.6 × (1 + 0.35k)) + 1`, `d = 2 × max(1, floor(r × 11.3)) + 1` (the pixel count of the draft ellipse box `[cx − rx, cx + rx]`), `heightPx` 0 and `shift = round(r × 0.55 × k × 32)` (the draft centre move, in art pixels to the screen right: one tile is 32 art pixels wide). The pairs:

     | Id | `r` | `k` | Source | `w` × `d` | `shift` |
     |---|---|---|---|---|---|
     | `oak_round` | 0.42 | 1.3 | draft round tree (`pixel3.py:313`) | 27 × 9 | 10 |
     | `pine_tall` | 0.36 | 1.5 | draft pine (`pixel3.py:329`) | 25 × 9 | 10 |
     | `birch_silver` | 0.3 | 1.2 | draft bare tree, the slim trunk tree (`pixel3.py:355`); the Classic shadow radius is also 0.3 (`src/render/scenery/art/base.ts:59`) | 19 × 7 | 6 |
     | `willow` | 0.45 | 1.3 | no draft willow: `r` from the Classic shadow (`base.ts:68`), `k` of the draft round tree | 29 × 11 | 10 |
     | `shrub_round`, `shrub_flowering` | 0.32 | 1.0 | no draft shadow (the draft `bush`, `pixel3.py:408-413`, has none): `r` from the Classic shadow (`base.ts:81, 87`), `k` of the draft boulder | 19 × 7 | 6 |
     | `boulder` | 0.38 | 1.0 | `k` of the draft boulder (`pixel3.py:672`, `sh_ell(x, y, rr / 22.0, 1.0)`); `r` from the Classic shadow (`base.ts:120`), because the game boulder (`rock` radius 0.34 tile, `base.ts:121`) is larger than the draft one | 23 × 9 | 7 |

     **Decision: no caster for flower beds.** `bed_mixed` and `bed_tulip` get no caster (`casterOf` gives `null`). Why: they lie flat; the draft flower bed (`pixel3.py:414-421`) and the Classic beds (`base.ts:92-118`, no `shadow` call) draw no shadow.
   - scenery in an edge slot (`edge` 0 to 3, `src/sim/scenery/types.ts:9-10`; flag `E`, for example `hedge_low`, `fence_wood`, `rail_iron`, `fence_painted`): a box 1 tile long along its edge and `EDGE_CASTER_DEPTH` (0.1 tile) deep, height from `heightM`; `rotation` passes the edge;
   - guest and staff: an ellipse `GUEST_SHADOW` (8 × 3 art pixels, `shift` 0) under the feet, the draft guest ellipse `[cx − 3, cy − 1, cx + 4, cy + 1]` (`pixel3.py:288`);
   - path items (from stage 2b): the bench, a rect `BENCH_SHADOW` (14 × 3 art pixels, `shift` 1), the draft bench shadow, a rectangle `[cx − 5, cy − 1, cx + 8, cy + 1]` (`pixel3.py:309`); the bin and the lamp: no caster;
   - show sites (from stage 6): a box of the footprint (`w`, `d` of `src/data/catalog/showSites.ts:5-6`), height `TOWER_TOP_PX` (92) for `lightshow_tower` and `LAUNCHER_MOUTH_PX` (26) for `fireworks_launcher` (`src/render/shows/art.ts:17, 19`);
   - litter, mess, track and the park fence (`drawFenceArt`): no caster.

   **Decision: casters of path items, litter and show sites.** The bench and the two show sites get a caster; the bin, the lamp, litter and mess do not. Why: the draft shadows the bench and not the lamp (`pixel3.py:299-310`), a show site stands as tall as a ride, and litter and mess lie flat on the ground.
2. Shape, from `pixel3.py:172-178`: a box shadow is the footprint sheared to the screen right by `heightPx / SHADOW_TZ × SHADOW_LEN` tiles (`SHADOW_TZ` 40 world pixels, `SHADOW_LEN` 0.75); an ellipse or rect shadow covers the art-pixel columns `cx − floor((w − 1) / 2) + shift` to `cx + ceil((w − 1) / 2) + shift` and the rows `cy − floor((d − 1) / 2)` to `cy + ceil((d − 1) / 2)`, where (`cx`, `cy`) is the art pixel of the caster's anchor (the item's anchor, or the snapped anchor of the walker or the bench); an ellipse sets the pixels whose centres are inside the ellipse of that box, a rect sets every pixel of the box. So `GUEST_SHADOW` covers `cx − 3` to `cx + 4` and `BENCH_SHADOW` `cx − 5` to `cx + 8`, as the draft.
3. Each caster's mask is cached as an art-pixel image per caster key and view rotation.
4. The shadow layer (`createPixelShadowLayer`, first in `createWorldLayers`) draws in its `drawGround` (`src/render/layers.ts:60`, called at `src/render/renderer.ts:1089`). In Pixel, the renderer runs the block from the fence refresh to `collectGuests` (`renderer.ts:1093-1110`) after `mgmt.begin` (`:1087`) and before `mgmt.drawGround` (`:1088`), so queue positions (`placeQueues`), bench seats (`mgmt.collect` → `placeSitters`) and snapped walker anchors exist before the ground step (section 5.5, stage 2a row). `collectGuests` (when not `lod`; dots have no shadow) and `ManagementLayer.collectStaff` append each snapped walker anchor to `frame.art.walkers`, a `Float64Array` of x, y pairs in world pixels with the count `frame.art.walkerCount`; the renderer sets the count to 0 before the block and grows the array when it is full. `ArtFrame` gains these two optional members in stage 2a (section 5.2); the shadow layer reads `f.art.walkerCount ?? 0`. The shadow layer reads anchors only from the world state and from `frame.art`. With `f.art` absent or `null` (Classic) it draws nothing. It draws all visible masks with `source-over` into one canvas-size shadow canvas, then multiplies that canvas once over the frame with colour `SHADOW_MULTIPLY`. So two shadows that overlap do not darken twice. `SHADOW_MULTIPLY` is `#c9c0cb` = `mix(#ffffff, i2, 0.3)`, the draft's shadow (`shadow=('i2', 0.3)`, `pixel3.py:28`, applied at `:184`), as a multiply.
5. Order: shadows fall over litter (`mgmt.drawGround`, `renderer.ts:1088`) and under the Calm, Buzz and Light overlays.
6. In-art shadows on a surface.
   - From stage 2a, the shadow layer draws the shadow of every object with a caster, so these Classic in-art shadows are skipped on a surface (`isPixelSurface(ctx)`, section 5.5): the 62 calls of `shadow` (`src/render/scenery/art/kit.ts:91-93`); the helper `shadow` of `src/render/sprites/staff.ts:48` and of `src/render/sprites/content/stalls.ts:17`; the guest ellipse in `drawGuestArt` (`src/render/sprites/props.ts:158-160`); the generic stall `poly3` in `drawStallArt` (`src/render/sprites/stalls.ts:162-163`).
   - Path items, litter and show sites keep their Classic in-art shadows until their twins replace the Classic functions: the bench (`src/render/sprites/litter.ts:69-71`), the bin (`:97`), the lamp (`:139`) and litter (`:162`) in stage 2b; the show sites (`src/render/shows/art.ts:84`, `:128`) in stage 6. Until then they show as Bayer-dithered pixels (section 5.3 rule 6). The twins draw no in-art shadow. The bench caster comes with the bench twin (stage 2b), the show-site casters with the show twins (stage 6).
7. Stage 8 hides shadows when the lighting darkness is at least `NIGHT_SHADOW_OFF` (0.5, provisional), as the draft skips shadows at night (`pixel3.py:180`).

### 8.5 Interface pictures

**Card pictures** (`previewCanvas`, `src/ui/decks/card.ts:111-132`; reused by `src/ui/panels/cardDetails.ts:89`):
1. `pixelPreview(id, kind, CARD_ART_W, CARD_ART_H)` (84 × 60 art pixels = the 168 × 120 CSS preview canvas at the draft scale, `PREVIEW_W` and `PREVIEW_H`, `card.ts:97-98`) composes a patch of the pixel ground and the real pixel sprite at view rotation 2. It crops on a focus point: the centre of the sprite's opaque pixels, raised by `CARD_FOCUS_RAISE` (10 %) of the sprite height.
2. A track card shows a station and three track pieces with one car, through `paintSlicePixel` and `paintCarPixel`.
3. The canvas backing is `CARD_ART_W × m` by `CARD_ART_H × m`, with `m = max(1, round(2 × dpr))` and `dpr = min(PREVIEW_DPR_MAX, devicePixelRatio)` (`PREVIEW_DPR_MAX` 3). Smoothing is off. In Pixel, `newCanvas` (`src/ui/decks/card.ts:103-105`) makes the source and the copy of `previewCanvas` at this size, not at `round(168 × dpr)`, so the copy (`drawImage(source, 0, 0)`, `:129-130`) fills the canvas. Why: at dpr 2.625, `m = 5` gives a source 420 pixels wide, and today's copy is 441.
4. In Pixel the canvas gets the class `pixel-preview`, and CSS gives it `image-rendering: pixelated` (section 5.5, `src/styles/main.css` row). The flexible box stays (`src/styles/main.css:358`, `:546`), so the picture on screen can be at an uneven scale. Why: the box gives way to the text (Phase 7), and the approved board shows card crops at uneven scales.

**Picker pictures:** the scenery picker (96 × 72 CSS, `src/ui/scenery/picker.ts:17-18`) uses 48 × 36 art pixels; the show picker (120 × 96 CSS, `src/ui/shows/picker.ts:14-15`) uses 60 × 48 art pixels. Same rules as the cards: in Pixel each `preview` function (`src/ui/scenery/picker.ts:39-52`, `src/ui/shows/picker.ts:25-38`) makes its canvas at the art size × `m`, with the class `pixel-preview`.

**Mascot heads** (`mascotCanvas`, `src/ui/scenario/mascotArt.ts:109-134`):
1. Pixel: a Frost head and a Spark head. Today's `drawFrost` and `drawSpark` draw heads (`mascotArt.ts:48-106`), and Phase 7 §4.3 names a "Frost head" and a "Spark head". Each head is authored from the head rows of the draft figures (`pixel3.py:263-264`): `FROST` rows 0 to 5 (11 wide), `SPARK` rows 0 to 6 and columns 0 to 6, each with one added mouth row. Sizes `MASCOT_ART` (width × height): Frost 11 × 7, Spark 7 × 8 art pixels (provisional; the stage 2b mascots sheet fixes them). The `sad` stamps change the eyes and the mouth row only. `'both'` puts Frost and Spark side by side with `MASCOT_GAP` (2) transparent art pixels between them.
2. The canvas keeps today's CSS box and backing size (`:110-120`). The art is drawn at `m = mascotArtScale(boxWCss, boxHCss, dpr, artW, artH) = max(1, floor(min(boxWCss × dpr / artW, boxHCss × dpr / artH)))` canvas pixels per art pixel, centred, with smoothing off and `image-rendering: pixelated`. Exact rule: `mascotCanvas` calls `setTransform(m / 2, 0, 0, m / 2, ox, oy)` in place of today's `setTransform(dpr, …)` (`mascotArt.ts:123`), with `ox = floor((canvas.width − artW × m) / 2) + ART_PX_WORLD × floor(W0 / 2) × m / 2` and `oy = floor((canvas.height − artH × m) / 2) + (artH − 1) × m`, all whole canvas pixels. `W0` is the width of the left head: the one head, or Frost for `'both'`. One head: `stamp(c, MASCOT_STAMPS[who][mood], 0, 0, MASCOT_MAP)`. `'both'`: Frost at x = 0 and Spark at x = (`W0` + `MASCOT_GAP` + `floor(SparkW / 2)` − `floor(W0 / 2)`) × `ART_PX_WORLD`, where `SparkW` is `MASCOT_ART.spark.w`. Both stamps use y = 0, so the heads stand on the bottom row of the art box. In Pixel, `canvas.style.imageRendering = 'pixelated'` and `c.imageSmoothingEnabled = false`. `boxWCss` is the box width of `mascotCanvas`: `heightCss` for one head, `round(heightCss × 1.9)` for `'both'` (`mascotArt.ts:110-111`). `boxHCss` is `heightCss`. For `'both'`, `artW` is Frost W + `MASCOT_GAP` + Spark W (20) and `artH` is the larger height (8). Example: Frost at 40 CSS px and dpr 1 gives `m = 3`, so 33 × 21 CSS px of art in a 40 × 40 box.
3. Why the box stays: each caller passes a fixed height (`PORTRAIT_PX` 48/40, `src/ui/mood/moodBar.ts:15`; `FACE_PX` 48/40, `src/ui/tips/bubble.ts:24`; 56, `tutorialUi.ts:126`; 48, `awardsUi.ts:39`; 96, `flow.ts:388`), and `mascotCanvas` sets the CSS box from it (`canvas.style.width`, `canvas.style.height`, `mascotArt.ts:114-115`). The CSS rules `.mood-face` (`src/styles/main.css:134`) and `.tip-art` (`:458`) set no size.
4. The callers keep their calls to `mascotCanvas`: `src/ui/mood/moodBar.ts:60` (in `portrait`), `src/ui/tips/bubble.ts:87` (in `show`), `src/ui/scenario/tutorialUi.ts:126`, `src/ui/scenario/awardsUi.ts:39`, `src/ui/scenario/flow.ts:388`. Three of them can ask for `'both'`: the tutorial finale (`tutorialUi.ts:175`, 56 px), the `perfectBalance` award toast (`awardsUi.ts:39`, `AWARD_MASCOT` in `src/ui/scenario/model.ts:172`, 48 px) and the end screen (`flow.ts:388`, 96 px). Three cache keys add `artStyle()`: `moodBar.ts:57` (`${mood}@${px}`, in `portrait`), `bubble.ts:84` (`${t.speaker}:${t.mood}@${FACE_PX[layout]}`, in `show`) and `tutorialUi.ts:123` (`${guide}:${mood}`, in `setGuide`). The other two callers draw a new canvas each time.
5. The canvas keeps `role="img"` and its `aria-label` (`tests/e2e/scenario.spec.ts:192-195`).

### 8.6 Authoring checks for each batch

Each stage from 2a to 8 redraws objects in batches. Every batch passes these checks before it merges:

1. **Sheet.** `TC_PIXEL_SHEET=1 npx vitest run tests/unit/render/pixel/sheet.test.ts` writes contact sheets as PNG files (written with `node:zlib`) to `TC_PIXEL_SHEET_DIR` (default `.pixel-sheets/`, ignored by git). A sheet shows each object in 4 rotations and 3 frames, at `n = 2`, on grass. Before stage 1c (no pixel ground yet), "on grass" is a flat fill of slot `g2` behind the object; from stage 1c, it is a patch of `paintGroundChunk` on a grass-only map. The sheets are never tracked: the release check allows a tracked PNG only as `public/icons/icon-<n>.png` or `docs/screenshots/<name>.png` with no subfolder (`RASTER_ALLOWED`, `scripts/check-release.ts:39`, used in `originalityProblems`, `:60`); any other tracked PNG fails it.
2. **Lint test.** `tests/unit/render/pixel/lint.test.ts` runs on surfaces (not on built `Sprite` images) over every sprite of the batches that each stage names in section 12, and of no other sprite: palette only; outline closed (no pixel with `inkMask` 1 has a transparent 4-neighbour: an ink pixel lies between each ink-making pixel and transparency); inside bounds (no opaque pixel in the outer row or column of the image); lit side left (the mean tone index of the left half of the opaque pixels is not darker than the right half); orphans: of the pixels with `inkMask` 1, at most `ORPHAN_MAX_SHARE` have no 4-neighbour of the same slot. Stamp pixels, stroke pixels and dither pixels are cut or stroke pixels, so the rule does not count them (section 5.3). A sprite with fewer than 100 counted pixels is not checked by the orphan rule. Why: the approved draft rows hold single pixels by design (the hands `S` of `GUEST` and `GUEST_BACK`, `pixel3.py:256-257`; the bulb `W` of `LAMP`, `:261`; the eyes and nose of `FROST`, `:263`), and a count over all opaque pixels fails them (2 of 39, 1 of 6, 3 of 30).
3. **Side by side.** For each object that the draft shows, the sheet test also writes the object next to the matching crop of `docs/screenshots/phase-7-draft-desktop.png`, both at 2 device pixels per art pixel.
4. **Owner pictures.** At the end of each stage: the real game at the home level on desktop 1280 × 800 and phone 412 × 839, plus the batch sheets. The owner reviews them. Stage 4c also needs the owner's yes before `ART_STYLE_AUTO` changes.
5. **One critic.** One reviewer checks all batches of the phase against this section.

---

## 9. The art style switch and the setting

### 9.1 The setting

- Key `artStyle`, type `ArtStyleSetting` = `'auto' | 'classic' | 'pixel'`, default `'auto'`, check `oneOf(['auto', 'classic', 'pixel'])`.
- Settings, Display section, a `choice` control after Render quality.
- `'auto'` follows `ART_STYLE_AUTO`. Why: a stored document holds every key (`src/settings/schema.ts:132-135`), and stored values win (`:122-127`). A stored `'auto'` follows the build, so the default can change at stage 4c without a migration.

### 9.2 Resolution

`resolveArtStyle(setting, search, buildDefault)` takes the first that applies:
1. The address flag: `search` holds `art=pixel` or `art=classic`. It holds for the session and is never stored.
2. The stored setting when it is `'classic'` or `'pixel'`.
3. `buildDefault` (`import.meta.env.VITE_ART`) when it is `'classic'` or `'pixel'`.
4. `ART_STYLE_AUTO`.

`src/main.ts` `boot` calls `setArtStyle(resolveArtStyle(setting, location.search, import.meta.env.VITE_ART))` once, before the first `resize()` (`src/main.ts:36`). In stages 1a-i to 1b, `setting` is `'auto'`. From stage 1c, `setting` is `game.settings.get('artStyle')`: the settings exist at `src/main.ts:23`, so a stored style needs no second plan. From stage 1c, `src/ui/perf/index.ts` `apply` (`:73-74`) calls `setArtStyle(resolveArtStyle(game.settings.get('artStyle'), location.search, import.meta.env.VITE_ART))` on each settings change, next to `setRenderQuality`. Stage 5b ends both reads of the setting (section 9.6 item 4). The renderer reads `artStyle()` and `artStyleVersion()` every frame and re-plans on a change. `#game` gets `data-art`.

### 9.3 Settings version 3 (stage 1c)

1. `SETTINGS_VERSION = 3` (`src/settings/schema.ts:13`).
2. A frozen list `V2_KEYS` holds the 20 keys of version 2 (today's `SETTING_KEYS`), written out like `V1_KEYS` (`:62-82`).
3. `parseSettings` (`:120`): version 1 → `V1_KEYS`; version 2 → `V2_KEYS`; version 3 → `SETTING_KEYS`. Keys added since the document's version get their default.
4. A version 2 document with `artStyle` is unreadable ("unknown setting artStyle"). A version 3 document with a missing or bad `artStyle` is unreadable. A version 4 document is unreadable ("newer version").
5. The store writes version 3 at the next change.

### 9.4 Strings (`src/data/strings/settings.ts`)

`en-XA` follows by generation (`strings: pseudoTable(en)`, `src/data/strings/en-XA.ts:66-71`); it needs no edit.

| Id | Text, stages 1c to 4b | Text, stage 4c |
|---|---|---|
| `settings.display.artStyle` | "Art style" | "Art style" |
| `settings.artStyle.auto` | "Auto" | "Auto" |
| `settings.artStyle.classic` | "Classic" | "Classic" |
| `settings.artStyle.pixel` | "Pixel (preview)" | "Pixel" |

### 9.5 Default by stage

| Stage | `ART_STYLE_AUTO` | Control | Settings version |
|---|---|---|---|
| 1a-i to 1b | `'classic'` | none (address flag and `VITE_ART` only) | 2 |
| 1c to 4b | `'classic'` | Auto, Classic, Pixel (preview) | 3 |
| 4c, after the owner's yes | `'pixel'` | Auto, Classic, Pixel | 3 |
| 5b and later | removed: Pixel always | no control | 4 |

Why no control in 1a-i to 1b: the preview is not complete before the pixel ground and the build budget of stage 1c.

### 9.6 Settings version 4 (stage 5b)

1. `artStyle` leaves `SettingsValues` and `SETTING_SPECS`. `SETTINGS_VERSION = 4`.
2. A frozen list `V3_KEYS: readonly (SettingKey | 'artStyle')[]` holds the 21 keys of version 3 (`'artStyle'` is no longer a `SettingKey`, `src/settings/types.ts:50`). A frozen table `REMOVED_V3_CHECKS` keeps the version 3 check of `artStyle` (`oneOf(['auto', 'classic', 'pixel'])`).
3. `parseSettings`: version 1 → `V1_KEYS`; version 2 → `V2_KEYS`; version 3 → `V3_KEYS`, where `artStyle` is checked by `REMOVED_V3_CHECKS` and then dropped; version 4 → `SETTING_KEYS`. `V1_KEYS` and `V2_KEYS` hold no `artStyle`, so they need no drop. Keys added since the document's version get their default.
4. `src/main.ts` `boot` and `src/ui/perf/index.ts` `apply` stop reading `game.settings.get('artStyle')`, because `'artStyle'` is no longer a `SettingKey` and `tsc --noEmit` (the first step of `npm run build`, `package.json:9`) fails otherwise. `boot` calls `setArtStyle('pixel')`; `apply` makes no `setArtStyle` call. For the same reason `src/ui/settings/model.ts` `settingsSections` (`:46`) drops the `artStyle` `choice` control of stage 1c: the `choice` member of `ControlSpec` has `key: SettingKey` (`:24`), and its options `['auto', 'classic', 'pixel']` would also match `'classic'` in the stage 5b grep check. The four strings of section 9.4 go from `src/data/strings/settings.ts`.
5. `style.ts` keeps `artStyle()` (always `'pixel'`) until stage 9 removes the module state.

---

## 10. Performance and size budgets

### 10.1 Frame

The Phase 6 §4.6 budgets stay: desktop frame p95 ≤ 20 ms; phone scene at 4× CPU throttle frame p95 ≤ 40 ms (`src/data/tuning/perf.ts:15-17`). Neither perf spec asserts them (`tests/e2e/perf.spec.ts`, `tests/e2e/perf-build3.spec.ts:271-274` print `[perf]` lines).

**The stage measure.** Each stage from 1b runs this command, with a free port:

```
VITE_ART=pixel TC_PERF_QUALITY=high PW_PORT=<free> TC_PERF=1 npx playwright test tests/e2e/perf-build3.spec.ts --project=desktop --project=phone
```

The stage records in `docs/adr/0001-renderer.md`, from the `[perf]` lines of `scene phone` and `scene build2`: the frame p95, the canvas ratio, the zoom and `n`, the longest frame after a view turn, and the sprite memory (`sprites … MB (chunks …, sprites …)`, printed from `spriteCacheByKind` of `PerfSnapshot`, `perf-build3.spec.ts:193`). A run is valid only when the printed canvas ratio equals the "Canvas ratio" column of section 7.3 for the screen at `high`, and `n > 0`.

### 10.2 Sprite and chunk build

| Measure | Limit | Status | Measured by |
|---|---|---|---|
| One ride sprite build, phone at 4× throttle | ≤ 3 ms (`RIDE_BUILD_MAX_MS`) | Fixed (kill rule 4 threshold) | Stage 0 `numbers.json` |
| One terrain chunk build (8 × 8 tiles), phone at 4× throttle | ≤ 12 ms (`CHUNK_BUILD_MAX_MS`) | Fixed (kill rule 4 threshold) | Stage 0 `numbers.json` |
| Slowest frame after a view turn, phone at 4× throttle | ≤ 100 ms (`TURN_FRAME_MAX_MS`) | Fixed (risk 18 threshold) | Stage 0 `numbers.json`, then the stage measure |

The three limits are thresholds, not tuning values: stage 0 measures against them and never sets them. Why: a limit that stage 0 set from its own result could never fail.

**Decision: the view-turn limit.** `TURN_FRAME_MAX_MS` (100 ms) is a decision of this spec; the design record has no view-turn limit. Why: 100 ms is about six frames at 60 Hz, one hitch that the player sees once per turn; a longer frame reads as a freeze. A result above it stops nothing (no kill rule uses it): the remedy of section 14 row 18 is then added to stage 1c (section 10.3), and the stage 0 report says so.

Node bench of the design record: ride 0.285 ms mean, stall 0.10 ms, scenery 0.12 ms, guest 0.024 ms, ground chunk 2.6 ms.

### 10.3 Build budget per frame

`buildBudget` has `limitMs` = `BUILD_BUDGET_MS_DESKTOP` or `BUILD_BUDGET_MS_PHONE`. Start values 4 and 6, provisional. Stage 0 fixes them by this rule, from `numbers.json`: `BUILD_BUDGET_MS_PHONE = max(6, ceil(phone spriteBuildMsMax))` and `BUILD_BUDGET_MS_DESKTOP = max(4, ceil(desktop spriteBuildMsMax))`. Why: the start value holds unless the slowest measured sprite build alone is longer; then the budget grows to it, so a frame can always finish one build that it started. `applyPlan` sets `limitMs` from the device class at each plan (section 5.5, stage 1c).
- `beginFrame()` resets the spent time. `take()` is true while the spent time is below the limit. `spend(build)` runs the build and adds its time.
- Optional builds ask `take()` first: ride frames (a miss keeps the last sprite), track slices (a miss draws `drawPlainSlice`, `src/render/track/layer.ts:685-687`), cars (`drawPlainCar`, `:849-851`). Until stage 4a the stand-ins draw as today's vectors; from stage 4a they draw on the art grid (section 14 row 20).
- A first sight of a stall, staff, scenery, show site, path item, guest, fence or entrance always builds, and its time counts. Exception (the remedy of section 14 row 18): when the stage 0 phone `turnFrameMsMax` is above `TURN_FRAME_MAX_MS`, from stage 1c a first sight of a stall or a scenery item also asks `take()`, and on a miss it draws nothing in that frame and sets `data-complete` to `'0'`.
- The terrain first-build rule (`FIRST_BUILD_BUDGET_MS = 6`, `src/render/terrain.ts:407`) stays separate.

### 10.4 Bundle

1. The initial load stays below `INITIAL_LOAD_BUDGET_BYTES` (400 KB gzip of JS and CSS, `scripts/check-release.ts:29`, measured by `initialLoadBytes`, `:100`) at the end of every stage. Today (the Build 4 release): 352.7 KB (`CHANGELOG.md:19`; `docs/superpowers/specs/thrills-and-chills/build-4-acceptance.md:17`). 47.3 KB is free to the limit, and 39.3 KB to `PEAK_LOAD_MAX`.
2. **The binding gate** is the measured initial load ≤ `PEAK_LOAD_MAX` at the end of each stage, and the projection of item 3 below `PEAK_LOAD_MAX` (kill rule 7). Twins and Classic art ship together until stage 5b (section 5.4), so the twins must fit in that room.
3. **The projection.** Stage 0 measures:
   - `L_proto`: the initial load of the prototype build (it holds the surface, palette, grid, ground, the carousel twin and the guest stamps).
   - The cost `C` of a twin: `initialLoadBytes` of the prototype build minus `initialLoadBytes` of the same build with the twin's dispatch entry removed. The worktree removes an entry when `import.meta.env.VITE_PROTO_DROP` names it, so the bundler drops the twin. `C_ride` is the cost of the carousel twin; `C_guest` is the cost of the guest stamps.
   - `C_MAP`: the minified gzip of a map with one entry for each literal that the section 6.4 scan finds and each derived output that the memo records while `protoSheet.test.ts` builds its sprites, each value `'n3'`. It is measured as the gzip (`node:zlib`, `gzipSync`) of `JSON.stringify(map)` with sorted keys, which is the minified form of the object literal (keys that start with `#` keep their quotes). `C_MAP_SRC` is the gzip of the same map written as the source file of `colourMap.ts` (one entry per line). `protoNumbers.test.ts` writes both to `numbers.json`. Why: `L_proto` holds only a hand map of about 80 literals, and the full map of stage 1a-ii has about 820 literals plus the derived outputs.
   - The projected initial load at the end of stage 7: `P = L_proto + C_MAP + C_ride × 17 + C_guest × (14 + 85 + 2) / K_SMALL + C_guest × N_STAMP / K_SMALL + T_TRACK + T_REST`. 17 is the other flat rides; 14, 85 and 2 are the stalls, scenery items and show sites. `K_SMALL` (2, provisional; fixed by the first measured stall twin, batch 3.1) says that a stall, scenery or show-site twin costs half the guest stamps.
   - `N_STAMP` (8, fixed) is the number of stamp families of stages 2b to 3 that ship next to Classic and that `L_proto` does not hold, each counted as 1: staff with costumes, path items, litter and mess, the fence, the entrance, the mascot heads (stage 2b), the ride parts and the stall icons (stage 3).
   - `T_TRACK` (13 KB of minified gzip, provisional; fixed by the stage 4a measure) is the track twins, which stage 0 does not build. Derivation: the Classic track painter `src/render/track/paint.ts` (`paintRun`, `paintSupport`, `paintCar`, `paintGateBooth`) is 10.5 KB of source gzip (10 766 bytes, `gzip -9`), about 6.3 KB minified at `R_GZIP` 0.6; the twins also draw the trestles, columns and stations and the nose, cab and rider stamps that Classic does not have, so the start value is twice that (12.6 KB), rounded up.
   - `T_REST` (8 KB of minified gzip, provisional; each share is replaced by the stage that builds it: 2a, 4b, 5a, 7) is the pixel code that later stages add next to Classic and that is neither a twin of a catalog object nor a stamp family. Derivation, from the source gzip (`gzip -9`; 1 KB is 1024 bytes, as in `PEAK_LOAD_MAX`) of the Classic code that each part replaces, times `R_GZIP` 0.6; art with draft shading counts twice, code for code once:
     - `pixel/art/kit.ts` (stage 2a): the 20 kit helpers, `src/render/sprites/content/kit.ts:29-102` (`rider` to `oval`, 849 bytes) and `src/render/scenery/art/kit.ts:96-263` (`trunk` to `eyes`, 2 555 bytes): (0.8 + 2.5) × 2 × 0.6 = 4.0 KB;
     - `pixel/preview.ts` (stage 4b): `src/render/track/preview.ts`, `src/render/scenery/preview.ts` and `src/render/shows/preview.ts` (3 093 bytes, the sum of the three files, each without the stored file name, `gzip -9 -n`): 3.0 × 0.6 = 1.8 KB;
     - the gate twin `pixelGate` (stage 5a): `drawGate`, `src/render/sprites/rides.ts:101-108` (182 bytes): 0.2 × 2 × 0.6 = 0.2 KB;
     - `pixel/overlay.ts` with the ghost stamps (stage 7): the overlay code of `src/render/renderer.ts:623-871` (`tileFace` to `drawOverlays`, 2 894 bytes): 2.8 × 0.6 = 1.7 KB;
     - sum 7.7 KB, rounded up to 8 KB.
   - The measured cost of a part: at the end of a stage that builds it (2a, 4a, 4b, 5a, 7), the growth of the measured initial load over the end of the stage before. It replaces the part's term or share in `P` (item 4). The growth is an upper bound, because it also holds the other code of that stage.
   - `P` must be below `PEAK_LOAD_MAX`.
4. At the end of each stage, the stage records the initial load and repeats the projection with the costs that it has measured (the twins and parts it built replace the estimates of item 3). If the projection reaches `PEAK_LOAD_MAX`, the remedy of section 14 row 16 starts before the next stage.
5. **Near the limit.** When a projection (at stage 0 or at the end of a later stage) is below `PEAK_LOAD_MAX` but at or above `PEAK_LOAD_MAX − PROJECTION_NEAR` (8 KB, so 384 KB), nothing stops. The remedy of section 14 row 16 becomes the plan from the next family that merges: the Classic rides go in stage 5a and the Classic scenery and show sites in stage 6, each after the owner approves the twins. The stage report says so, and at stage 0 the owner sees it at the gate. Why: 8 KB is the margin of `PEAK_LOAD_MAX` for the projection error, so a projection inside it has no room left for a wrong estimate.
6. **The pixel code limit.** `tests/unit/render/pixel/bundleSize.test.ts` is a hard test: it fails when the gzip of all `.ts` files under `src/render/pixel/` and of `src/data/tuning/pixel.ts`, joined in path order, is above `PIXEL_CODE_GZIP_LIMIT`. The test file holds a constant `PIXEL_STAGES_MERGED: readonly string[]`, the stages whose first batch has merged; the first batch of each stage appends its stage. The limit is the sum of the steps `PIXEL_CODE_STEP_KB[S]` (section 15) over `PIXEL_STAGES_MERGED`. One step per stage, so the limit is defined after any merge order of the parallel stages 5a, 6 and 7. With `room = (PEAK_LOAD_MAX − B) / R_GZIP` in KB, the cumulative limit after stage `S` is `floor(room × share(S))` KB for stage 1a-i and `floor(room × share(S)) + ceil(C_MAP_SRC / 1024)` KB for stage 1a-ii and every later stage (the colour map of stage 1a-ii comes on top of its share), and the step of `S` is its growth over the stage before `S` in the order of section 12.1, where `B` is the initial load at the stage 0 base, `R_GZIP` is the ratio of minified gzip to source gzip that stage 0 measures for the carousel twin (start value 0.6, provisional), and `share(S)` is the planned share of the pixel code at the end of stage `S` (section 15). Stage 0 recomputes every step from its measured `B` and `R_GZIP` and writes them into section 15; after that they are fixed, and a change is a spec change. The release check of item 2 stays the binding gate for the initial load.
7. Each stage runs `npm run build && node scripts/check-release.ts --no-build` and records the initial load in the changelog. Why `--no-build`: without it the script builds again (`npx vite build` in `checkRelease`), so the check measures a second build.
8. Stage 5b removes the Classic code. Stage 9 records the final figure.

### 10.5 Memory

1. The shared budgets stay: 64 MB phone, 192 MB desktop (`src/data/tuning/perf.ts:4`).
2. A sprite at art scale holds 1/16 of the bytes of the same sprite at bucket 2. A ground chunk of 8 × 8 tiles is about 260 × 168 pixels, 171 KB (about 2.7 MB at bucket 2: 1040 × 672 × 4 bytes).
3. Each stage records the sprite memory of `scene phone` from the stage measure (section 10.1). Limit: not above the last recorded figure, 57.5 MB (`docs/adr/0001-renderer.md:91-136`).
4. JS heap: ≤ 250 MB desktop, ≤ 150 MB phone (`src/data/tuning/perf.ts:18`).

---

## 11. Stage 0: the prototype

A throwaway experiment. It is never merged. It answers four questions: is Pixel clearly closer to the drafts than the filter look the owner turned down; is it fast enough on the phone profile; does track work; does the bundle fit.

### 11.1 Where

A separate worktree outside the main checkout, so other agents' tests are not disturbed. Base: the HEAD of the branch when stage 0 starts (today `03720b2`). `B` = 352.7 KB (section 10.4) is only the start value; stage 0 measures `B` on its base.

```
PROTO="${TMPDIR:-/tmp}/tc-phase8-proto"
git -C /home/user/RC-TYCOON- worktree add --detach "$PROTO/wt" HEAD
cd "$PROTO/wt" && npm ci
```

### 11.2 The scene

Built by commands through `window.__tc` (`src/main.ts:45`), as `tests/e2e/screenshot.spec.ts:33-91` does:
1. A new park through `newParkAt(page, '?art=classic', name)`, then `borrow`. The pixel specs do not call `newPark` (`tests/e2e/helpers.ts:23`): it starts with `page.goto('/')`, which drops the address flag. `newParkAt(page, query, name)` is a new helper in `tests/e2e/helpers.ts` that runs the title steps of `newPark` after `page.goto('/' + query)`.
2. A footpath cross of 12 tiles each way.
3. A `carousel` and a `big_wheel`, rotation 2, one queue tile each, open.
4. One `snack_shack` facing the path.
5. Six scenery items with `placeScenery`: `oak_round`, `pine_tall`, `birch_silver`, `shrub_round`, `bed_mixed`, `fountain_garden` (`src/data/catalog/scenery.ts:48-57`).
6. Two benches and one lamp.
7. Park open, `step(6000)` so guests walk and queue, then speed 0.
8. Before each capture: the clock at 12:00, weather sunny, After Dark off, overlays none, no tool, no selection, the pointer outside the canvas (as `clockTo` in `tests/e2e/afterDark.spec.ts`), and no ride broken or held for a storm: the scene steps in steps of 100 ticks, at most 40 times, until every ride has status `'open'`, as `buildPark` does (`tests/e2e/overview-build4.spec.ts:58`), else the run fails. Why: until stage 8 the light pass multiplies a smoothed light canvas (`src/render/lighting/pass.ts:159-162`), weather draws as vectors (`mgmt.drawWeather`, `src/render/management/layer.ts:314`, called at `renderer.ts:1115`), and a broken or storm-held ride gets a vector marker (`drawRideMarkers`, `src/render/management/layer.ts:447-452`) that is not on the art grid.
9. The camera centred on the carousel at the home level (`#game[data-home-zoom]`): zoom 1 on desktop 1×, 8/7 on the Pixel 7 profile. In Classic, the camera uses the same number, read from the "after" page.

The "before" and "after" scenes come from one save. Items 1 to 7 run once, in a page opened at `/?art=classic`. The scene is saved to slot 1 through the menu (Menu, Save, slot 1, as `tests/e2e/keyboard.spec.ts:100-109`), and the test reads the save text from `localStorage['tc.save.1']`. Then both pages load that text, so neither keeps state that the save does not hold: the "before" page opens `/?art=classic` and the "after" page opens `/?art=pixel`; each puts the text in `localStorage['tc.save.1']`, reloads and presses `title-continue`, as `loadScene` does (`tests/e2e/perf-build3.spec.ts:73-85`). Item 8 then runs in each page. Why: a new park gets `randomSeed()` (`src/ui/scenario/flow.ts:241`), so two new parks have two different maps and guest flows. The window hook `window.__tc` is the `Game` (`src/main.ts:45`) and has no save method, so the save goes through the menu. The same scene and camera serve "before" (Classic) and "after" (Pixel). Every prototype change to an existing art function is a surface branch (section 5.4 rule 2), so the worktree in Classic draws today's look.

### 11.3 Files (in the worktree only)

| File | What |
|---|---|
| new `src/render/pixel/style.ts` | `artStyle()` from `?art=pixel` or `VITE_ART=pixel`, read at boot only; `?art=classic` gives Classic. |
| new `src/render/pixel/derived.ts` | The derived-colour memo of section 5.2 (`startDerivedMemo`, `stopDerivedMemo`, `noteDerived`, `noteMixed`); `protoNumbers.test.ts` uses it. |
| new `src/render/pixel/palette.ts`, `colourMap.ts` | Section 6 ramps; a hand map for the colours of the scene's objects and terrain (about 80 literals) and their derived outputs. |
| new `src/render/pixel/surface.ts` | The rasteriser of section 5.3 (the proof code was not kept), with the matrix stack, the stroke rule, `cut` and `inkMask`. |
| new `src/render/pixel/art/shapes.ts` | Twins of `box`, `cylinder`, `cone`, `pyramid`, `head`, drawn from the draft primitives `ibox`, `icyl`, `icone` (`pixel3.py:220-241`). |
| new `src/render/pixel/art/rides.ts` | The carousel twin, drawn from `carousel` (`pixel3.py:454-482`). |
| new `src/render/pixel/grid.ts` | `k`, `n`, levels for ratio 1 and 2.625, `blitArt`, `blitArtColumn`, the canvas box rule. |
| new `src/render/pixel/ground.ts` | Grass, slab paths, flat and sloped tops. |
| new `src/render/pixel/stamp.ts`, `sprites/people.ts` | Draft guest rows: front, back, two steps; shirt map. |
| new `src/render/pixel/shadows.ts` | Casters for the ride, the stall, the trees and the guests; the `drawGround` layer, which reads walker anchors from `frame.art.walkers` (section 8.4 item 4). The in-art shadows of these objects are skipped on a surface (section 8.4 item 6, first list). |
| `src/render/canvas.ts` | Pixel branch in `buildSprite` (`:56-72`). |
| `src/render/renderer.ts` | `n / 2` scale, bucket 0.5, rounded offsets, smoothing off, whole copies, plan `k`, canvas box, guest anchors through `snapWalker`, guest dots on the art grid, the Pixel frame order of section 8.4 item 4 with `frame.art.walkers` (`:1086-1110`), `data-art`, `data-home-zoom` (full precision), `data-art-scale`, `data-stretch` (`String(plan.stretch)`) and `data-complete` (`'1'` when no terrain chunk is pending; the prototype has no build budget) (`:338-363`, `:553-554`, `:556-559`, `:898-917`, `:1018`, `:1059-1071`, `:1112`). A probe sets `window.__pixelStats = { spriteBuildMsMax, chunkBuildMsMax, turnFrameMsMax, spriteMb, chunkMb }`: the slowest sprite build, the slowest chunk build and the slowest frame after a view turn since the last reset, and the sprite and chunk memory. |
| `src/render/terrain.ts` | Pixel chunk build and copy (`:542-561`, `:638-643`). |
| `src/render/management/layer.ts` | Path item push (`:227`) and decal blits (`:171`, `:178`) through `snapArt` (section 5.5, stage 1b row). |
| `src/render/scenery/layer.ts` | Whole copies (`:60-83`). |
| `src/render/sprites/shapes.ts` | `ArtCtx`; in `box`, `cylinder`, `cone`, `pyramid`, `head` a surface branch to the twins in `pixel/art/shapes.ts`. Only when `isPixelSurface(ctx)`; the Classic body does not change (section 5.4 rule 1). |
| `src/render/sprites/rides.ts` | `drawRideArt` (`:471-495`): a surface branch inside the `withGates` body to the carousel twin. Only when `isPixelSurface(ctx)`; `drawCarousel` (`:121-188`) does not change (section 5.4 rule 1). |
| `src/render/track/layer.ts` | `sliceBounds` (`:226`): when `artStyle()` is `'pixel'`, the bounds grow by one sample on each cut side (stage 4a track rule 2); it runs when `collect` builds the slice records, not while a surface paints, so it branches on the style, not on the context. The slice paint of `drawSlice` (`:679-695`, `paintSlice`): on a surface, the stage 4a track rules 1 and 3 (the run widened by one sample on each cut side, the extra samples painted with `cut(true)`, rails from the shared samples). No slice `{ ink: false }`. |
| `src/render/sprites/props.ts` | `drawGuestArt` (`:140`) calls the stamps on a surface. |
| `src/render/palette.ts` | `shade` memo (`:122-132`). |
| `src/perf/quality.ts`, `src/styles/main.css`, `src/main.ts` | `stretch`; `#game[data-art="pixel"]` rule; viewport size for `resize`. |
| `tests/e2e/helpers.ts` | New `newParkAt(page, query, name)` (section 11.2 item 1). `newPark` does not change. |
| new `tests/e2e/pixelProto.spec.ts` | Builds the scene once and loads it in the second page (section 11.2), and saves the pictures to `$TC_PROTO_OUT`. Phone runs set the CPU throttle to 4 through a CDP session (`Emulation.setCPUThrottlingRate`, rate 4) before the measures. It turns the view 4 times and reads `window.__pixelStats`. It writes `numbers.json` (times and memory per project) and `strip-desktop.png`, and runs the grid check of `pixelGrid.spec.ts` (section 13.3) on the "after" scene at every crisp level of the screen (the e2e level rule of section 13.3), after the pictures at the home level are taken. |
| `tests/e2e/perf-build3.spec.ts` | When `#game[data-art]` is `'pixel'` (the style that runs, not the build variable), `at(rot)` (`:255`) uses the zoom of `#game[data-home-zoom]`, not 1. The `[perf]` line also prints `zoom` and `n` (`#game[data-art-scale]`). |
| new `tests/unit/render/pixel/protoSheet.test.ts` | Node sheet with real pixels: the 18 flat rides at frame 0; the steel coaster pieces of `tests/e2e/screenshot.spec.ts:56-73` (with the chain pieces) in 2 views with a 4-car train. It calls `setArtStyle('pixel')` before `TrackLayer.collect` (Node starts in Classic, and `sliceBounds` branches on `artStyle()`), then builds each slice through `TrackLayer`, as `tests/unit/render/track/slices.test.ts:192` does, so each slice is painted with the stage 4a track rules 1 to 3. PNG through `node:zlib`. |
| new `tests/unit/render/pixel/classicOps.test.ts` | Imports only Classic art functions and the recorder (`tests/unit/render/content/recorder.ts`). It records the op lists of the scene's objects (carousel, big wheel, snack shack, the 6 scenery items, bench, lamp, guest frames) in Classic and writes their hashes to `$TC_PROTO_OUT/classic-ops-<name>.json`. |
| new `tests/unit/render/pixel/protoNumbers.test.ts` | Skipped unless `TC_PROTO_OUT` is set. Reads the release and perf files of section 11.4 (among them `perf-classic.txt`) and adds to `numbers.json`: `L_proto`, `B`, `C_ride`, `C_guest`, `C_MAP` and `C_MAP_SRC` (it builds the map of section 10.4 item 3 itself, from the scan and the memo records of the `protoSheet.test.ts` sprites, which it builds again between `startDerivedMemo` and `stopDerivedMemo`), `R_GZIP` (`C_ride` ÷ the source gzip of the carousel twin's code), the desktop and phone frame p95, the Classic frame p95 of `perf-classic.txt` with the ratios Pixel ÷ Classic (section 11.5), the start values `K_SMALL`, `N_STAMP`, `T_TRACK` and `T_REST` of section 15, and the projection `P` (section 10.4 item 3). |

The big wheel and the stall stay on their unchanged art functions (with the primitive twins). So one picture shows the "untouched" floor and the "tuned" ceiling (carousel, guests).

### 11.4 Commands

Run inside the worktree. Each Playwright run has its own `PW_PORT`, because the config reuses any server on the port (`playwright.config.ts:5, 15`).

```
PROTO="${TMPDIR:-/tmp}/tc-phase8-proto"
cd "$PROTO/wt"
TC_PROTO_OUT="$PROTO/out" PW_PORT=4391 npx playwright test tests/e2e/pixelProto.spec.ts --project=desktop --project=phone
TC_PROTO_OUT="$PROTO/out" TC_PIXEL_SHEET=1 npx vitest run tests/unit/render/pixel/protoSheet.test.ts
PW_PORT=4392 TC_PERF=1 npx playwright test tests/e2e/perf-build3.spec.ts --project=desktop --project=phone | tee "$PROTO/out/perf-classic.txt"
VITE_ART=pixel TC_PERF_QUALITY=high PW_PORT=4393 TC_PERF=1 npx playwright test tests/e2e/perf-build3.spec.ts --project=phone | tee "$PROTO/out/perf-pixel-k2.txt"
VITE_ART=pixel TC_PERF_QUALITY=low PW_PORT=4394 TC_PERF=1 npx playwright test tests/e2e/perf-build3.spec.ts --project=phone | tee "$PROTO/out/perf-pixel-k3.txt"
VITE_ART=pixel TC_PERF_QUALITY=high PW_PORT=4395 TC_PERF=1 npx playwright test tests/e2e/perf-build3.spec.ts --project=desktop | tee "$PROTO/out/perf-pixel-desktop.txt"
VITE_ART=pixel npm run build && node scripts/check-release.ts --no-build | tee "$PROTO/out/release-pixel.txt"
VITE_ART=pixel VITE_PROTO_DROP=carousel npm run build && node scripts/check-release.ts --no-build --no-tests | tee "$PROTO/out/release-no-carousel.txt"
VITE_ART=pixel VITE_PROTO_DROP=guest npm run build && node scripts/check-release.ts --no-build --no-tests | tee "$PROTO/out/release-no-guest.txt"
git -C /home/user/RC-TYCOON- worktree add --detach "$PROTO/base" "$(git -C "$PROTO/wt" rev-parse HEAD)"
(cd "$PROTO/base" && npm ci && npm run build && node scripts/check-release.ts --no-build --no-tests | tee "$PROTO/out/release-base.txt")
mkdir -p "$PROTO/base/tests/unit/render/pixel" && cp tests/unit/render/pixel/classicOps.test.ts "$PROTO/base/tests/unit/render/pixel/"
TC_PROTO_OUT="$PROTO/out" npx vitest run tests/unit/render/pixel/classicOps.test.ts
(cd "$PROTO/base" && TC_PROTO_OUT="$PROTO/out/base" npx vitest run tests/unit/render/pixel/classicOps.test.ts)
for f in "$PROTO"/out/base/classic-ops-*.json; do cmp "$f" "$PROTO/out/$(basename "$f")"; done
TC_PROTO_OUT="$PROTO/out" npx vitest run tests/unit/render/pixel/protoNumbers.test.ts
npx vitest run tests/unit/render/content/art.test.ts tests/unit/render/content/phase6Art.test.ts tests/unit/scenery/art.test.ts tests/unit/render/track/slices.test.ts
```

Why `TC_PERF_QUALITY=high` for `k = 2`: under `auto`, a slow run steps down (`AutoScale.frame`, `src/perf/quality.ts:107-120`), and in Pixel that gives `k = 3`. `high` has no cap.

The worktree `$PROTO/wt` has no commits of its own, so its `HEAD` is the base commit. `B` is the initial load in `release-base.txt`.

After the owner gate: `git -C /home/user/RC-TYCOON- worktree remove "$PROTO/wt"` and the same for `"$PROTO/base"`.

### 11.5 Outputs (in `$PROTO/out/`)

| File | What |
|---|---|
| `before-desktop.png`, `after-desktop.png` | 1280 × 800, device ratio 1. The before pictures come from the worktree in Classic. They show today's look: the `classic-ops-*.json` files of the worktree and of the base commit are equal (kill rule 6). |
| `before-phone.png`, `after-phone.png` | Pixel 7: 412 × 839 CSS pixels at device ratio 2.625. |
| `strip-desktop.png` | Before, after, and the matching crop of `docs/screenshots/phase-7-draft-desktop.png`, side by side. |
| `sheet-rides-track.png` | The rides and track sheet. |
| `numbers.json` | For desktop and phone: frame p95 (`scene build2` on desktop from `perf-pixel-desktop.txt`, `scene phone` on the phone from `perf-pixel-k2.txt` and `perf-pixel-k3.txt`), slowest sprite build, slowest chunk build, slowest frame after a view turn (phone at 4× throttle), sprite and chunk memory; the Classic phone frame p95 (`scene phone`, quality `auto`) and the Classic desktop frame p95 (`scene build2`) from `perf-classic.txt`, and for each the ratio Pixel ÷ Classic (the Pixel phone at `k = 2`); `B`, `L_proto`, `C_ride`, `C_guest`, `C_MAP`, `C_MAP_SRC`, `R_GZIP`, the start values `K_SMALL`, `N_STAMP`, `T_TRACK` and `T_REST` that the projection used, and the projection `P` (section 10.4 item 3). Keys: `B`, `L_proto`, `C_ride`, `C_guest`, `C_MAP`, `C_MAP_SRC`, `R_GZIP`, `K_SMALL`, `N_STAMP`, `T_TRACK`, `T_REST`, `P`, `desktop`, `phone`, `classic`. |
| `perf-classic.txt`, `perf-pixel-k2.txt`, `perf-pixel-k3.txt`, `perf-pixel-desktop.txt` | The printed `[perf]` lines. Each line prints `canvas ratio`; the k2 file must show 1.3125, the k3 file 0.875 and the desktop file 1, else the run is invalid. `perf-classic.txt` is today's passing setting (quality `auto`), the base of the comparison of `numbers.json`. The desktop frame p95 is read from the `scene build2` line. The phone frame p95 is read from the `scene phone` lines with `n > 0`. |
| `release-pixel.txt`, `release-no-carousel.txt`, `release-no-guest.txt`, `release-base.txt` | The release checks of the prototype build, of the two builds without one twin, and of the base. |
| `classic-ops-*.json`, `base/classic-ops-*.json` | The Classic op-list hashes of the worktree and of the base commit. |

### 11.6 Kill rules and the owner gate

The approach stops, or changes, when one of these is true:

| # | Condition | Result |
|---|---|---|
| 1 | The owner does not call `after-desktop.png` a clear step toward the draft, beyond the filter look already seen. | Stop. No stage 1a-i. |
| 2 | The grid check of `pixelGrid.spec.ts` (section 13.3) fails on the "after" scene at any crisp level of the screen (desktop 1× and the Pixel 7 profile; the levels by the e2e level rule of section 13.3, after `data-complete` is `'1'`). Guests, path items and decals are drawn at snapped anchors (section 7.7). The check reads the canvas backing with `getImageData` (not a page screenshot). A run of one colour that touches no canvas edge must have a length that is a multiple of `n` canvas pixels. `data-stretch`, the backing size, the box size and `image-rendering` must be as section 7.1 says. | The grid is wrong. Repair, then repeat stage 0. |
| 3 | The `scene phone` frame p95 (runs with `n > 0`) is above 40 ms at `k = 2` and also at `k = 3`. | Stop. |
| 3a | Only `k = 2` fails. | `k = 3` becomes the phone stretch: `planStretch` for phones returns `max(1, ceil(deviceRatio))` at every quality. Update sections 7.1 (the `planStretch` rule) and 7.3 before stage 1a-i. |
| 4 | A chunk build is above 12 ms or a ride sprite build above 3 ms on the throttled phone, after one tuning round. | Stop. |
| 5 | The track sheet (slices painted with the stage 4a track rules 1 to 3) shows ink across rails at tile joins, or gaps in rails. | Stage 4a needs a new seam design. The design is written and reviewed before stage 1a-i starts. |
| 6 | A recorder test (`art.test.ts`, `phase6Art.test.ts`, `scenery/art.test.ts`, `slices.test.ts`) fails in Classic, or a `classic-ops-*.json` file of the worktree differs from the base. | Repair the branch rule (section 5.4), then repeat. |
| 7 | The projected initial load at the end of stage 7 reaches `PEAK_LOAD_MAX` (392 KB). | The remedy of section 14 row 16 becomes the plan. The stage list and section 13.1 item 2 are rewritten for it before stage 1a-i starts, and the owner sees and approves the change at the gate. |
| 7a | The projection is below `PEAK_LOAD_MAX` but at or above `PEAK_LOAD_MAX − PROJECTION_NEAR` (384 KB). | No stop. The early-delete remedy of section 14 row 16 is planned for stages 5a and 6 (section 10.4 item 5), and the owner sees it at the gate. |

**Owner gate.** The owner sees `strip-desktop.png`, `after-phone.png`, `sheet-rides-track.png` and the numbers. The numbers show the Pixel phone p95 next to today's `auto` p95 (`numbers.json` key `classic`). Stage 1a-i starts only after the owner says yes. The stage 0 report also sets the provisional values that stage 0 measures (section 15).

### 11.7 Done when

- [ ] Every file of section 11.5 exists in `$PROTO/out` (`ls`).
- [ ] In `$PROTO/out`, `grep -o "canvas ratio [0-9.]*" <file> | sort -u` prints exactly one line for each file: `canvas ratio 1.3125` for `perf-pixel-k2.txt`, `canvas ratio 0.875` for `perf-pixel-k3.txt` and `canvas ratio 1` for `perf-pixel-desktop.txt` (the `[perf]` line prints `canvas ratio ${ratio}:`, `tests/e2e/perf-build3.spec.ts:272`).
- [ ] The `cmp` loop of section 11.4 prints nothing.
- [ ] The last `npx vitest run` command of section 11.4 passes.
- [ ] `node -e "const j = require(process.argv[1]); for (const k of ['B', 'L_proto', 'C_ride', 'C_guest', 'C_MAP', 'C_MAP_SRC', 'R_GZIP', 'K_SMALL', 'N_STAMP', 'T_TRACK', 'T_REST', 'P', 'desktop', 'phone', 'classic']) if (!(k in j)) process.exit(1)" "$PROTO/out/numbers.json"` exits 0.
- [ ] The stage 0 report gives the result of each kill rule 1 to 7a, and the recomputed values of section 15: `PIXEL_CODE_STEP_KB`, `R_GZIP`, `BUILD_BUDGET_MS_DESKTOP` and `BUILD_BUDGET_MS_PHONE` (by the rule of section 10.3).
- [ ] The owner pictures of the owner gate are delivered, and the owner's answer is recorded in the stage 0 report.

---

## 12. Stages 1 to 9

Sizes are small, medium, large. Each stage merges with the full suite green, the bundle and performance figures measured and recorded (sections 10.1 and 10.4), and owner pictures (section 8.6). Each stage leaves the branch releasable; Build 5 is the build after stage 9.

**The depth rule.** This spec describes its stages at two depths. The rule also holds for every review of this spec and of a stage brief.
1. **Plan-ready stages:** stage 0 (section 11) and stages 1a-i, 1a-ii, 1b, 1c, 2a and 2b. For these, the spec gives all that a planner needs: files, functions, signatures, values, tests with what each asserts, and a "Done when" list in which a command or a picture checks every line. A plan-ready stage has no placeholder; a provisional value names the measurement that fixes it.
2. **Outline stages:** stages 3 to 9. For each, the spec gives: what the player sees; the files; the rules that are decided; the existing tests that must keep passing and those that are known to change, with the reason; the risks; the start condition; the batches (each batch is one plan); and the list "Open until the stage brief". A "Done when" list in an outline stage holds the checks that are decided; the stage brief completes it.
3. **Stage brief.** Before an outline stage is planned, its stage brief is written: a short addendum to this spec that decides each point of the stage's list "Open until the stage brief", from the measurements and the owner pictures of the earlier stages. The brief is reviewed as this spec is. The start condition of each outline stage includes "its stage brief is approved".
4. **Faults.** In a review, a missing detail of an outline stage is not a fault when the stage's open list names it. A false code fact, a contradiction, a check that cannot pass, a missing start condition or a missing batch split is a fault in every stage.

This list departs from the design record in five ways. First, stages 1 and 2 are split (1a-i, 1a-ii, 1b, 1c, 2a and 2b), so each part fits one plan; stage 2b and the large outline stages have batches. Second, stage 4 is split into 4a (track), 4b (interface pictures) and 4c (the default flip). Third, the design record's stage 5 is split into 5a (the other flat rides, gates and decks) and 5b (Classic removed), and 5b waits for stages 6 and 7. Fourth, the outline stages wait for their stage briefs. Fifth, stage 3 draws all 25 items of the Base Set and Classic Fair themes, not only their green items (the design record's stage 3 says "Base Set and Classic Fair green items", and its stage 6 covers only the other 5 themes). Why: the non-green items of those two themes (for example `boulder`, `fountain_garden`, the edge items) are in no stage of the design record.

### 12.1 Order and parallel work

| Stage | Starts after | Can run in parallel with |
|---|---|---|
| 1a-i | Owner yes on stage 0; the stage 0 values written into section 15; if kill rule 3a fired, sections 7.1 (the `planStretch` rule) and 7.3 updated; if kill rule 5 fired, the new seam design written and reviewed; if kill rule 7 fired, the stage list and section 13.1 item 2 rewritten and approved | — |
| 1a-ii | 1a-i merged | — |
| 1b | 1a-ii merged | — |
| 1c | 1b merged | — |
| 2a | 1c merged | — |
| 2b | 2a merged | — |
| 3 | 2b merged; stage 3 brief approved | — |
| 4a | 3 merged; stage 4a brief approved | — |
| 4b | 4a merged; stage 4b brief approved | — |
| 4c | 4b merged; stage 4c brief approved | — |
| 5a | 4c merged; stage 5a brief approved | 6, 7 |
| 6 | 4c merged; stage 6 brief approved | 5a, 7 |
| 7 | 4c merged; stage 7 brief approved | 5a, 6 |
| 5b | 5a, 6 and 7 merged; stage 5b brief approved | — |
| 8 | 5b merged; stage 8 brief approved | — |
| 9 | 8 merged; stage 9 brief approved | — |

Inside a stage, the batches merge in the order of the stage's batch list, unless the list says that two batches can run in parallel; then the later one to merge rebases on the earlier one. A brief can be written while the stage before runs; it is approved after the measurements and owner pictures that it names exist.

Why 5b waits for 6 and 7: once Classic is gone, the recorder tests of scenery and shows run on the twins (section 5.4 rule 4), so every scenery and show twin must exist first.

Stages 5a, 6 and 7 touch separate functions. Shared source files: `src/render/elevated/layer.ts` (5a decks, 7 ghosts), `src/render/shows/layer.ts` (6 beam and rocket origins, 7 overlays) and `src/render/pixel/colourMap.ts` (new literals of each stage). Shared test files: `pixelArt.test.ts`, `lint.test.ts`, `sprites.test.ts`, `colourMap.test.ts` (`FACE_PAIRS` grows with each batch) and `bundleSize.test.ts` (`PIXEL_STAGES_MERGED`). When two of these stages are ready at the same time, they merge in the order 5a, 6, 7, and the later one rebases on the earlier one. The limit of `bundleSize.test.ts` is a sum of steps (section 10.4 item 6), so it is defined in any merge order.

### Stage 1a-i — Surface, palette and the sprite branch. Medium.

**Before it starts:** owner yes on stage 0; the stage 0 values written into section 15; if kill rule 3a fired, sections 7.1 (the `planStretch` rule) and 7.3 updated; if kill rule 5 fired, the new seam design written and reviewed; if kill rule 7 fired, the stage list and section 13.1 item 2 rewritten and approved.

**What the player sees:** nothing in Settings. With `?art=pixel`: every object hard-edged and outlined in ramp colours, drawn by the Classic art functions on a surface. Colours without a map entry resolve by the fallback rule (section 6.5 rule 2). Zoom, ground and copies are as today, so the preview looks soft. Classic stays the default.

**Files:** new `src/render/pixel/{style,palette,colourMap,derived,surface}.ts` (`colourMap.ts` with the fixed entries of section 6.4 only), `src/data/tuning/pixel.ts` (the constants of section 15 whose file is `src/data/tuning/pixel.ts` and whose stage is 1a-i to 2b: `ART_PX_WORLD`, `OPAQUE_ALPHA`, `WHEEL_IDLE_RESET_MS`, `PINCH_SETTLE_MS`, `BUILD_BUDGET_MS_DESKTOP`, `BUILD_BUDGET_MS_PHONE`; stage 8 adds `NIGHT_POOL_BANDS`). Changed (section 5.5, stage 1a-i rows): `canvas.ts`, `sprites/shapes.ts` (`ArtCtx`), `palette.ts`, `scenery/art/kit.ts` (`mixHex`), `shows/art.ts` (`shade`), `sprites/bank.ts` (fence ink), `track/layer.ts` (slice ink, `clearArt`), `layers.ts` (`clearArt?`), `scenery/layer.ts` and `shows/layer.ts` (`clearArt`), `renderer.ts` (style change, `data-art`), `main.ts` (`boot`).

**Tests that prove it:** new `style.test.ts`, `palette.test.ts`, `surface.test.ts`, `styleSwitch.test.ts`, `bundleSize.test.ts` and `tests/e2e/pixelSmoke.spec.ts` (its boot part; section 13.3). Misses are allowed and counted (`paletteStats.misses`). Every other test passes unchanged in Classic.

**Done when:**
- [ ] `style.test.ts`, `palette.test.ts` (with the family rules a to e of section 6.5) and `surface.test.ts` pass.
- [ ] `styleSwitch.test.ts` passes: an `artStyleVersion()` change clears every cache of section 5.6 item 2 that exists at this stage.
- [ ] `PW_PORT=<free> npx playwright test tests/e2e/pixelSmoke.spec.ts --project=desktop --project=phone` passes: with `?art=pixel` the game boots, `#game[data-art="pixel"]`, no console error.
- [ ] The whole suite passes; the e2e suite runs in Classic.
- [ ] `bundleSize.test.ts` passes; `npm run build && node scripts/check-release.ts --no-build` gives an initial load at most `PEAK_LOAD_MAX`; both figures recorded in the changelog.
- [ ] Owner pictures delivered (Pixel at today's zoom, to show the raw surface).

### Stage 1a-ii — Colour map, generator and sheets. Medium.

**Before it starts:** 1a-i merged.

**What the player sees:** with `?art=pixel`: every colour comes from the checked colour map. No other change.

**Files:** `src/render/pixel/colourMap.ts` (every literal and derived output, section 6.4). New tools `tests/unit/render/pixel/colourMapGen.test.ts`, `sheet.test.ts` and the PNG writer they share, `tests/unit/render/pixel/png.ts` (`writePng(path: string, w: number, h: number, rgba: Uint8Array): void`, with `node:zlib`). Changed: `src/render/spriteCache.ts` (`Sprite.artHash`), `src/render/canvas.ts` (`artHash`, `artBuildLog`). `.gitignore`.

**Tests that prove it:** new `colourMap.test.ts`, `sprites.test.ts` (zero misses); the tools `colourMapGen.test.ts` and `sheet.test.ts`; `surface.test.ts` gains the `artHash` case (section 13.3).

**Done when:**
- [ ] `sprites.test.ts` builds, in Pixel, with no throw and no colour miss, and with the same hashes in two build orders: every ride, stall, scenery and show-site sprite of the catalogs in 4 rotations at frames 0 and 8; every staff frame (`staffFrame(type, costume, walk, action)` for each staff type, costume, walk and action value, `src/render/sprites/staff.ts:33`) in 4 facings (`bank.staff`); every path item frame (`bank.pathItem`, the frame bits of `src/render/sprites/bank.ts:173`); every litter and mess decal with flip 0 and 1 (`bank.decal`); the fence in 4 directions (`bank.fence`); both entrance parts with each `outerDir` 0 to 3 and −1 (`bank.entrance`); the track slices of every piece in 4 rotations for each of the 12 track colours; the cars of each car type at the sample poses (yaw 0, 4, 8, 12 × pitch 0, 6, 12, 18 × roll 0, 8) for each of the 12 track colours; and the guests with the tint bit for steps 0 to 8. The generator (section 6.5 item 1) builds every car pose, so the map holds the colours of all poses.
- [ ] `colourMap.test.ts` passes; the colour sheet is checked by eye and delivered.
- [ ] The whole suite passes; the e2e suite runs in Classic.
- [ ] `bundleSize.test.ts` passes; `npm run build && node scripts/check-release.ts --no-build` gives an initial load at most `PEAK_LOAD_MAX`; both figures recorded in the changelog.
- [ ] Owner pictures delivered (the colour sheet).

### Stage 1b — Grid and stepped zoom. Medium.

**Before it starts:** 1a-ii merged. The owner was asked about decision 2; with no change, the default holds.

**What the player sees:** with `?art=pixel`: stepped zoom, crisp copies of every sprite, guests, staff and trains in art-pixel steps, guest dots on the art grid. The ground is today's ground, painted at art scale.

**Files:** new `src/render/pixel/grid.ts`. Changed (section 5.5, stage 1b rows): `renderer.ts` (`applyPlan`, `draw`, `drawStatic`, `blit`, `blitColumn`, `collectGuests` anchors and dots), `management/layer.ts` (`collectStaff` anchors), `layers.ts`, `scenery/layer.ts`, `shows/layer.ts`, `track/layer.ts` (`collect`, `blit`, car snap), `perf/quality.ts`, `styles/main.css`, `main.ts` (`resize`), `input/index.ts`, `ui/land/index.ts`, `audio/index.ts`, `input/controller.ts`, `input/camera.ts`, `ui/scenario/tutorialUi.ts`, `management/layer.ts` (path item and decal snaps), `tests/e2e/perf-build3.spec.ts` (home zoom, section 13.2), `tests/unit/render/fakeCanvas.ts` (`style`, section 13.2), `tests/e2e/helpers.ts` (`newParkAt`, section 13.2).

**Tests that prove it:** new `grid.test.ts`, `tests/unit/ui/pixelZoom.test.ts`; `tests/e2e/pixelSmoke.spec.ts` gains the size, step and home-level checks; `quality.test.ts` gains `k` cases.

**Done when:**
- [ ] Wheel, keys and pinch step and settle as section 7.4 says (`pixelZoom.test.ts`).
- [ ] `grid.test.ts` passes, with the level lists of section 7.3, the car stair, snapped walker and car anchors that are multiples of 2 world pixels, path item and litter anchors that are multiples of 2 world pixels, and `artScale(Number(String(level)), grid) > 0` for every level of section 7.3.
- [ ] `pixelSmoke.spec.ts` passes on desktop and phone, with the box and backing sizes of section 7.1 item 3, and the start at the home level (`data-zoom` equals `data-home-zoom` at 3 decimals).
- [ ] The whole suite passes in Classic.
- [ ] `bundleSize.test.ts` passes; `npm run build && node scripts/check-release.ts --no-build` gives an initial load at most `PEAK_LOAD_MAX`; both figures recorded in the changelog.
- [ ] The stage measure of section 10.1 recorded.
- [ ] Owner pictures delivered (at every crisp level of desktop 1× and the Pixel 7 profile).

### Stage 1c — Pixel ground, build budget, the setting. Medium.

**Before it starts:** 1b merged.

**What the player sees:** in Settings, "Art style: Pixel (preview)". With it: the draft ground (grass patches, slab paths, shore lines, toned slopes, two-tone cliffs). Objects keep their Classic shapes. Classic stays the default.

**Files:** new `src/render/pixel/{ground,budget}.ts`. Changed (section 5.5, stage 1c rows): `terrain.ts` (`draw` and `prefetch` gain `soft`; the placeholder colour), `sprites/bank.ts` (`rideIfReady`, `spend`), `renderer.ts` (`collectRides` with `lastRideSprite`, `applyPlan` budget limit, `beginFrame`, `data-complete`, the `soft` argument of `terrain.draw` in `drawStatic` and of `terrain.prefetch` in `prefetchTurn`), `track/layer.ts` (budget), `perf/stats.ts`, `settings/{types,schema}.ts`, `ui/settings/model.ts`, `ui/perf/index.ts`, `data/strings/settings.ts`, `main.ts` (`boot` reads the stored setting).

**Tests that prove it:** new `ground.test.ts`, `budget.test.ts`, `rideSprites.test.ts`, `tests/e2e/pixelGrid.spec.ts`; `tests/e2e/pixelSmoke.spec.ts` gains its stage 1c cases (build a carousel; the style-switch resize case, section 13.3); the settings tests of section 13.2 (stage 1c), with `tests/e2e/settings.spec.ts:23`.

**Done when:**
- [ ] With `?art=pixel` on desktop and phone, `pixelGrid.spec.ts` passes at every crisp level of the screen.
- [ ] A version 1 and a version 2 settings document load; the store writes version 3 (`tests/unit/settings/data.test.ts`, `tests/unit/core/settings-store.test.ts`; section 13.2, stage 1c).
- [ ] `rideSprites.test.ts` passes (`lastRideSprite`, `rideIfReady`, `data-complete`).
- [ ] `PW_PORT=<free> npx playwright test tests/e2e/pixelSmoke.spec.ts --project=desktop --project=phone` passes with its stage 1c cases: a carousel builds with no console error, and after a Classic-to-Pixel switch through the setting and a viewport resize, `canvas.width` is `ceil(cssW × devicePixelRatio / k)` for the new viewport.
- [ ] The whole suite passes; the e2e suite runs in Classic.
- [ ] `bundleSize.test.ts` passes; `npm run build && node scripts/check-release.ts --no-build` gives an initial load at most `PEAK_LOAD_MAX`; both figures recorded in the changelog.
- [ ] The stage measure of section 10.1 recorded, with the sprite memory of section 10.5 item 3.
- [ ] Owner pictures delivered.

### Stage 2a — Draft shading and shadows. Medium.

**Before it starts:** 1c merged.

**What the player sees (Pixel):** lit and dark sides and highlights on every object drawn with the primitives and kit helpers; ground shadows from the shadow layer.

**One batch.** Its objects (lint, sheets, owner pictures): one test picture per primitive and per kit helper (5 + 20 = 25 pictures, drawn by `lint.ts` on a surface), plus `carousel`, `big_wheel` and `snack_shack` at frame 0 in 4 rotations. Lint gates the 25 primitive and kit pictures. `lint.ts` draws each of the 25 pictures with the arguments of one named Classic call site (the list of call sites, one `path:line` for each helper, is a constant of `lint.ts`). `pixelDot`, `pixelDot3`, `pixelStar`, `pixelEyes`, `pixelFlowers` and `pixelGlow` are not checked by the orphan rule: they draw dots, small stars, eyes and flowers of about 2 art pixels (`flowers`, `size = 2.2`, `src/render/scenery/art/kit.ts:174`), or translucent halos that dither on nothing (`glow`, `:160`). `pixelDot3` is on the list because it draws the same dot as `pixelDot` at a map point (`dot3`, `src/render/sprites/content/kit.ts:48`). For the three rides, the lint result is reported on the sheet and does not gate the merge: they are Classic art functions on a surface, which section 5.4 rule 1 does not let this stage change. Lint runs on no other sprite in this stage.

**Files:** new `pixel/art/{shapes,kit}.ts`, `pixel/shadows.ts`. Changed: `sprites/shapes.ts` (surface branch), `sprites/content/kit.ts`, `scenery/art/kit.ts` (helpers and `shadow`), `sprites/staff.ts` (`shadow`), `sprites/content/stalls.ts` (`shadow`), `sprites/stalls.ts` (generic shadow), `sprites/props.ts` (guest shadow), `worldLayers.ts`, `renderer.ts` (Pixel frame order, `frame.art.walkers`), `management/layer.ts` (`begin` takes `art`; `collectStaff` writes walker anchors), `pixel/grid.ts` (`ArtFrame` gains the optional `walkers`, `walkerCount`; the stage 1b `ArtFrame` literals of `grid.test.ts` do not change), `tests/unit/render/fakeCanvas.ts` (`op`, section 13.2).

**Tests that prove it:** new `shadows.test.ts`; `lint.test.ts` for this batch. Recorder tests unchanged.

**Done when:**
- [ ] On a surface, none of the in-art shadows of the first list of section 8.4 item 6 draws; the shadow layer, driven alone on a `FakeCanvas` context, gives exactly one `draws` entry with `op === 'multiply'` per frame; `casterOf('ride', 'carousel', 0)` has `heightPx` 100, the art height of `rideArtBounds` (`HEIGHTS.carousel`, `src/render/sprites/rides.ts:32`); `casterOf('scenery', 'oak_round', 0)` is the ellipse 27 × 9 with `shift` 10 of section 8.4 item 1, and `casterOf('scenery', 'bed_mixed', 0)` is `null`; with two anchors in `frame.art.walkers` and no guest in the world state, the layer draws two guest masks at those anchors (`shadows.test.ts`).
- [ ] Lint passes for the 25 primitive and kit pictures; the lint result of the three rides is on the sheet; sheets and side-by-side pictures delivered; owner pictures delivered.
- [ ] The whole suite passes; the e2e suite runs in Classic.
- [ ] `bundleSize.test.ts` passes; `npm run build && node scripts/check-release.ts --no-build` gives an initial load at most `PEAK_LOAD_MAX`; both figures recorded in the changelog; the projection of section 10.4 item 4 repeated, with the `pixel/art/kit.ts` share of `T_REST` replaced by the growth of the initial load over the end of stage 1c, and recorded in the changelog.
- [ ] The stage measure of section 10.1 recorded, with the sprite memory of section 10.5 item 3.

### Stage 2b — People, props and mascots. Large.

**Before it starts:** 2a merged.

**What the player sees (Pixel):** draft guests (front, back, two steps, sit, balloon, umbrella, full and notched rings); staff and costumes; benches (with a ground shadow), bins, lamps, litter and mess, the fence and the entrance; a path item on a deck at deck height; pixel Frost and Spark heads in the mood bar, tips, tutorial, toasts and end screen.

**Batches** (one plan each, in this order; 2b.2 and 2b.3 can run in parallel after 2b.1):

| Batch | Objects (lint, sheets, owner pictures) | Files | Tests |
|---|---|---|---|
| 2b.1 People | every guest frame (with and without the tint bit), every staff frame and costume | new `pixel/stamp.ts`, `pixel/sprites/{people,staff}.ts`; changed `sprites/props.ts` (`drawGuestArt` dispatch), `sprites/staff.ts` (`drawStaffArt` dispatch), `sprites/bank.ts` (guest bounds), `renderer.ts` (`collectGuests` cull margins) | new `stamp.test.ts`, `people.test.ts`; `sprites.test.ts` golden hashes of the guest front and back (written into the test when the owner approves the batch 2b.1 pictures; the batch merges with them) and the ring rule; `palette.test.ts` ring case; `lint.test.ts` for the batch |
| 2b.2 Props | every path item frame, litter, mess, the fence in 4 directions, the entrance parts | new `pixel/sprites/props.ts`; changed `sprites/litter.ts` (dispatch), `sprites/props.ts` (`drawFenceArt`, `drawEntranceArt` dispatch), `sprites/bank.ts` (the fence `{ ink: false }` goes), `management/layer.ts` (`collectPathItems`, Pixel only), `pixel/shadows.ts` (the bench caster) | new `props.test.ts`; `shadows.test.ts` bench case; `lint.test.ts` for the batch, with the fence join rule |
| 2b.3 Mascot heads | the mascot stamps | new `pixel/sprites/mascots.ts`; changed `ui/scenario/mascotArt.ts`, `ui/mood/moodBar.ts`, `ui/tips/bubble.ts`, `ui/scenario/tutorialUi.ts` (cache keys) | new `mascots.test.ts`; `pixelSmoke.spec.ts` toast case (`tests/e2e/scenario.spec.ts:192-195` with `?art=pixel`) |

Recorder tests unchanged in every batch.

**Done when** (each batch checks its own lines and the last four):
- [ ] 2b.1: a mirrored stamp keeps its lit side on the screen left; a stamp gets no second outline (`stamp.test.ts`).
- [ ] 2b.1: ring pixels of tinted guests are `y` slots (`sprites.test.ts`); `slotOf(rgbCss(tintStepRgb(0)))` is `b2` and `slotOf(rgbCss(tintStepRgb(8)))` is `x3` (`palette.test.ts`).
- [ ] 2b.1: on a surface, `drawGuestPixel` and `drawStaffPixel` paint no pixel below the feet row (`people.test.ts`).
- [ ] 2b.2: on a surface, the bench, bin, lamp, litter and mess twins draw no in-art shadow (section 8.4 item 6; `props.test.ts`).
- [ ] 2b.2: no ink pixel lies on the join of two fence segments (`lint.test.ts`); `casterOf('pathItem', 'bench', 0)` is `BENCH_SHADOW` (a 14 × 3 rect with `shift` 1) and the bin and lamp give `null` (`shadows.test.ts`); in Pixel, `collectPathItems` pushes a path item whose `map.pathItemLevel` is not 0 at the `z` of that elevated path (`props.test.ts`).
- [ ] 2b.3: mascot heads stay inside their Phase 7 boxes, in width and height, at device ratio 1, 2 and 3 (`mascots.test.ts`); `pixelSmoke.spec.ts` passes with the toast case.
- [ ] Lint passes for the batch; sheets and side-by-side pictures delivered; owner pictures delivered.
- [ ] The whole suite passes; the e2e suite runs in Classic.
- [ ] `bundleSize.test.ts` passes; `npm run build && node scripts/check-release.ts --no-build` gives an initial load at most `PEAK_LOAD_MAX`; both figures recorded in the changelog.
- [ ] The stage measure of section 10.1 recorded, with the sprite memory of section 10.5 item 3.

### Stage 3 — Hero rides, stalls and trees. Large. Outline.

**Before it starts:** 2b merged; the stage 3 brief approved. The owner was asked about decision 4; with no change, the default holds.

**What the player sees (Pixel):** the hero rides `carousel`, `big_wheel`, `swing_tower`, `drop_tower`, `observation_tower` at the level of the draft carousel; the 14 stalls on one stall kit with striped awnings, an icon on a pole and designed backs; all 25 items of the Base Set and Classic Fair themes (`src/data/catalog/scenery.ts:47-75`) with three-tone foliage and specks. Edge items (`hedge_low`, `fence_wood`, `rail_iron`, `fence_painted`) tile with no ink at joins (`cut`).

**Files:** new `pixel/sprites/{rideParts,icons}.ts`, `pixel/art/{rides,stalls,scenery}.ts`. Changed: `sprites/rides.ts` (`drawRideArt` dispatch, `rideArtBounds`), `sprites/stalls.ts` (`drawStallArt` dispatch), `scenery/art/index.ts` (`drawSceneryArt` dispatch, `sceneryArtBounds`), `lighting/pass.ts` (`:45-54`, Pixel heights), `renderer.ts` (`drawSelection` arrow), `management/layer.ts` (`drawPatrol` arrow heights, `:436-441`), `scenery/layer.ts` (`collect` cull, `:104-108`), `pixel/colourMap.ts` (new literals).

**Decided rules:**
1. Dispatch as section 5.4 rule 2. In `drawRideArt`, the branch sits inside the `withGates` body, so the Classic gates keep drawing around a twin until stage 5a.
2. Bounds: `rideArtBounds` uses `pixelRideHeight(defId)` when it is defined; `sceneryArtBounds` and the scenery cull use `pixelSceneryTop(def.id)` when it is defined (section 5.5, stage 3 rows). Classic bounds do not change.
3. Data or code as section 8.2: turning members are drawn by code, moving parts are stamps (`rideParts.ts`, `icons.ts`); the frame counts stay.
4. One stall kit draws the 14 stalls: a striped awning, an icon stamp of `STALL_ICONS` on a pole, and a designed back.
5. Edge items paint their join pixels with `cut(true)`, so no ink lands on the join of two edge items.
6. In Pixel, the bulb and lamp heights of `lighting/pass.ts`, the `drawSelection` arrow and the `drawPatrol` arrow come from the pixel art, not from Classic numbers.

**Batches** (one plan each, in this order):

| Batch | Objects | Files | Tests |
|---|---|---|---|
| 3.1 Stall kit | the 14 stalls, 4 rotations | `pixel/sprites/icons.ts`, `pixel/art/stalls.ts`, `sprites/stalls.ts` | new `pixelArt.test.ts` (stall cases); `sprites.test.ts` stall cases; `lint.test.ts` |
| 3.2 Hero rides | the 5 hero rides, 32 angle frames, occupancy 0 and 1, 4 rotations | `pixel/sprites/rideParts.ts`, `pixel/art/rides.ts`, `sprites/rides.ts`, `renderer.ts` (`drawSelection`), `management/layer.ts` (`drawPatrol`), `lighting/pass.ts` | `pixelArt.test.ts` ride cases; `sprites.test.ts` hero ride cases and the gates case; `lint.test.ts` |
| 3.3 Base Set and Classic Fair scenery | the 25 items, 4 rotations, every frame | `pixel/art/scenery.ts`, `scenery/art/index.ts`, `scenery/layer.ts` | `pixelArt.test.ts` scenery cases; `lint.test.ts` with the edge-item join rule |

**Existing tests:** the recorder tests (`tests/unit/render/content/art.test.ts`, `tests/unit/render/content/phase6Art.test.ts`, `tests/unit/scenery/art.test.ts`) pass unchanged: they pass a recorder, so they run the Classic path (section 5.4 rule 4). `tests/unit/lighting/layer.test.ts` passes unchanged (Node runs Classic). No existing test is known to change in this stage.

**Risks:** section 14 rows 4, 5, 6 and 18.

**Open until the stage brief:**
1. The value of `pixelRideHeight` for each hero ride and of `pixelSceneryTop` for each item, measured from the twins.
2. The hero rides that draw 16 distinct angles instead of 32 (section 8.2 item 5), from the shimmer on the stage 3 sheets.
3. The Pixel numbers of `src/render/lighting/pass.ts:45-54`, of the `drawSelection` arrow (`renderer.ts:821-823`) and of the `drawPatrol` arrow (`management/layer.ts:436-441`), and the twin that exports each one.
4. The stall kit design: the awning stripes, the 14 icons of `STALL_ICONS` and the back of each stall, from the stage 2b owner pictures.
5. The golden hash of carousel frame 0 rotation 0, written when the owner approves the carousel.
6. The owner's answer to decision 4 (default: option a).
7. How batch 3.1 measures the cost of the stall twins that fixes `K_SMALL` (section 15), for example the growth of the initial load over stage 2b divided by 14, compared with `C_guest`.

**Done when** (the decided checks; the brief adds the rest):
- [ ] Each hero ride has more than 8 distinct hashes over its 32 angle frames; occupancy 0 and 1 differ; at frame 0 the 4 view rotations give 4 different hashes (`sprites.test.ts`).
- [ ] Every stall differs from every other stall, and rotation 1 differs from rotation 2 (`sprites.test.ts`).
- [ ] Every twin of the batch stays inside its Pixel bounds (`pixelArt.test.ts`).
- [ ] On a surface, `drawRideArt` still draws the Classic gates around a twin: the carousel sprite from `drawRideArt` differs from the twin painted alone, and every pixel that differs is opaque in the sprite that `withGates` paints with an empty body (`sprites.test.ts`). Why this form: `withGates` draws the front gates after the body (`src/render/sprites/rides.ts:111-117`), so gate pixels and their rings can lie over twin pixels.
- [ ] No ink pixel lies on the join of two edge items (`lint.test.ts`).
- [ ] Lint passes for each batch; sheets and side-by-side pictures delivered; owner pictures delivered.
- [ ] `bundleSize.test.ts` passes; the initial load is at most `PEAK_LOAD_MAX`; both figures recorded.

### Stage 4a — Track, trains and track effects. Large. Outline.

**Before it starts:** 3 merged; if kill rule 5 fired, the seam design that was written and reviewed before stage 1a-i is the base of the stage 4a brief; the stage 4a brief approved. The owner was asked about decision 3; with no change, the default holds.

**What the player sees (Pixel):** coasters with rail ribbons, trestles and columns, and no ink across tile joins; shaded cars with stamped noses and riders on the art grid; stations; chain dashes, water ripples and spray as art pixels.

**Files:** `pixel/art/track.ts`; changed `track/paint.ts` (`paintCar` dispatch), `track/layer.ts` (`paintSlice` dispatch, rules 1 to 3, 5, 6), `pixel/colourMap.ts`.

**Decided rules (track rules):**
1. A slice in Pixel paints its run range widened by one sample on each cut side (section 4; `runsInTile`, `src/render/track/layer.ts:175-190`). The extra samples are painted with `cut(true)`. The slice `{ ink: false }` of stage 1a-i goes.
2. In Pixel, `sliceBounds` (`src/render/track/layer.ts:226`) grows by one sample on each cut side. So `tests/unit/render/track/slices.test.ts:105-112` ("every slice paints inside its bounds") holds unchanged when it runs on `paintSlicePixel` from 5b. Classic bounds do not change.
3. Rails are drawn from the shared sample points, so two slices give the same pixels where they overlap.
4. `polyline`, `quad`, `faceLight`, `paintBox`, `band` (`src/render/track/paint.ts:142, 154-166, 169, 178-223, 332-336`) get twins in `pixel/art/track.ts`. They pick tones with `trackSlot(i, tone)`, not through the colour map.
5. Car bodies stay code-drawn boxes in the full pose space. Noses, cabs and riders are stamps. Riders (`track/layer.ts:880-921`) become stamped heads on the art grid.
6. Per-frame track effects at `n > 0`: chain dashes (`drawChain`, `track/layer.ts:719`) and ripples (`drawWater`, `:763`) are `artDash` lines on the art grid; spray (`drawSpray`, `:802`) is single art pixels with `artDot`. The budget stand-ins `drawPlainSlice` (`:698`) and `drawPlainCar` (`:870`) are `artDash` lines on an art-grid stair. At `n = 0` they draw as today.

**Batches** (one plan each, in this order):

| Batch | Objects and rules | Tests |
|---|---|---|
| 4a.1 Slices | every track piece of every track ride in 4 rotations, for each of the 12 track colours; rules 1 to 4 | new `trackSeam.test.ts`; `lint.test.ts` |
| 4a.2 Cars and riders | the cars at the poses of `carBounds.test.ts`; rule 5 | new `carBounds.test.ts`; `lint.test.ts` |
| 4a.3 Track effects and stand-ins | rule 6 | new `trackFx.test.ts` |

**Existing tests:** `tests/unit/render/track/slices.test.ts`, `tests/unit/render/track/phase6Render.test.ts` and `tests/unit/track/waterRender.test.ts` pass unchanged (recorders and Node take the Classic path). No existing test is known to change in this stage.

**Risks:** section 14 rows 3, 19 and 20.

**Open until the stage brief:**
1. The tones of the `r` ramps (section 6.2; the stage 4a track sheet) and the measured `T_TRACK`.
2. How trestles, columns and stations are drawn: the draft shows one coaster only.
3. The nose, cab and rider stamps of each car type.
4. The stair rule of `artDash` for slopes other than 2:1 (chain dashes and stand-ins).
5. The remedy when cars of about 8 art pixels look blobby in loops and rolls (risk 3), from the stage 4a.2 sheet.
6. The owner's answer to decision 3 (default: option b). With option a or c, the brief rewrites the order of stages 4a to 5b as section 3 row 3 says.

**Done when** (the decided checks; the brief adds the rest):
- [ ] No ink pixel lies on a slice's cut line; a rail is continuous across two slices (`trackSeam.test.ts`).
- [ ] `paintCarPixel` on a surface puts no opaque pixel outside `CAR_BOUNDS` (`src/render/track/paint.ts:898`) for all 16 × 24 × 16 poses (`carBounds.test.ts`).
- [ ] Chain dashes, ripples, spray and stand-ins lie on the art grid and change by tick (`trackFx.test.ts`).
- [ ] Lint passes; the track sheet and owner pictures delivered; `bundleSize.test.ts` passes; the initial load is at most `PEAK_LOAD_MAX`.

### Stage 4b — Card and picker pictures. Medium. Outline.

**Before it starts:** 4a merged; the stage 4b brief approved.

**What the player sees (Pixel):** card, scenery picker and show picker pictures as crops of the pixel park; a track card shows a station, three track pieces and one car.

**Files:** new `pixel/preview.ts`; changed `renderer.ts` (`drawPreview`), `track/preview.ts`, `scenery/preview.ts`, `shows/preview.ts`, `ui/decks/card.ts`, `ui/scenery/picker.ts`, `ui/shows/picker.ts`, `styles/main.css` (`.pixel-preview`).

**Decided rules:** section 8.5 (card and picker pictures): the art sizes, `m`, the focus point, the class `pixel-preview` with `image-rendering: pixelated`, the flexible box, the card cache key with `artStyle()` (the pickers have no cache), and source and copy of the same size.

**Batches** (one plan each, in this order):

| Batch | Files | Tests |
|---|---|---|
| 4b.1 Card pictures | `pixel/preview.ts`, `renderer.ts` (`drawPreview`), `track/preview.ts`, `ui/decks/card.ts`, `styles/main.css` (the `.pixel-preview` rule) | new `preview.test.ts`; `pixelSmoke.spec.ts` card case |
| 4b.2 Picker pictures | `scenery/preview.ts`, `shows/preview.ts`, `ui/scenery/picker.ts`, `ui/shows/picker.ts`, `styles/main.css`: in Pixel the picker `preview` canvases get the class `pixel-preview` (`image-rendering: pixelated`) | `preview.test.ts` picker cases |

**Existing tests:** `tests/unit/render/track/phase6Render.test.ts:204-217` (`drawTrackPreview` on a recorder) and `tests/unit/render/terrain.test.ts:49-55` (`drawPreview` exists) pass unchanged. No existing test is known to change in this stage.

**Risks:** section 14 row 14.

**Open until the stage brief:**
1. The ground patch around a card sprite: grass only, or also path and queue tiles.
2. The track card: which station, which three pieces and which car pose.
3. The value of `CARD_FOCUS_RAISE`, from the stage 4b.1 owner pictures.
4. What a 2 × 2 item or an edge item shows in the 48 × 36 scenery picker picture (a crop at a whole scale).

**Done when** (the decided checks; the brief adds the rest):
- [ ] Card pictures render at a whole number `m` of canvas pixels per art pixel, at dpr 1, 2, 2.625 and 3 (`preview.test.ts`).
- [ ] On the phone profile with `?art=pixel`, a card preview canvas in the DOM is `CARD_ART_W × 5` = 420 pixels wide, and its rightmost column holds drawn pixels (`getImageData`), so the source fills the copy (`pixelSmoke.spec.ts`). The source canvas stays in the private `previews` map (`src/ui/decks/card.ts:101`) and is never read.
- [ ] Owner pictures of the hand, the card details panel and both pickers delivered.

### Stage 4c — Pixel becomes the default. Small. Outline.

**Before it starts:** 4b merged; the stage 4c brief approved. The owner was asked about decision 3; with no change, the default holds. The owner has reviewed the stage 4a and 4b pictures and said yes.

**What the player sees:** Pixel is the default; Classic is still selectable. The setting label drops "(preview)".

**Files:** `pixel/style.ts` (`ART_STYLE_AUTO = 'pixel'`), `data/strings/settings.ts` (label), `.github/workflows/ci.yml` (the Classic e2e job, section 13.1 item 2), new `tests/e2e/classicSmoke.spec.ts`.

**Decided rules:** section 9.5 (row 4c); section 13.1 item 2 (the Classic CI job on desktop).

**Batches:** one batch.

**Existing tests:** the whole e2e suite runs in Pixel. `tests/e2e/paths.spec.ts:106-110` passes unchanged until stage 5a (section 13.2). Unit tests do not change (Node runs Classic).

**Risks:** section 14 rows 1 and 11.

**Open until the stage brief:**
1. The e2e tests that fail in Pixel, found by one full run with `VITE_ART=pixel` at the end of stage 4b; each gets a section 13.2 row with its change and reason.
2. The owner's yes on the stage 4a and 4b pictures. Decision 3 is answered before stage 4a (section 3); with option b it holds here.

**Done when:**
- [ ] `ART_STYLE_AUTO = 'pixel'`, after the owner's yes.
- [ ] The whole e2e suite passes in Pixel and, on desktop, in Classic; `classicSmoke.spec.ts` passes.
- [ ] Owner pictures delivered (desktop and phone at the home level, Pixel by default).

### Stage 5a — Other flat rides, gates and decks. Large. Outline.

**Before it starts:** 4c merged; the stage 5a brief approved.

**What the player sees:** the other 13 flat rides (`teacup_twirl`, `bumper_cars`, `rocket_rounds`, `spiral_slide`, `mirror_maze`, `haunted_manor`, `pendulum_ship`, `thunder_disc`, `flip_arm`, `magic_carpet`, `kiddie_cars`, `merry_mill`, `gyro_globe`, `src/data/catalog/flatRides.ts:20-38`) in pixel art; ride gates and booths; elevated paths as pixel decks with post columns.

**Files:** `pixel/art/rides.ts` (with `pixelGate`), `pixel/art/track.ts` (gate booth), `src/render/sprites/rides.ts` (`withGates`), `src/render/track/paint.ts` (`paintGateBooth` dispatch, `:903`; built at `track/layer.ts:830`), `src/render/elevated/layer.ts` (Pixel branch), `pixel/colourMap.ts`, `tests/e2e/paths.spec.ts` (section 13.2).

**Decided rules:**
1. Ride dispatch as stage 3. On a surface, `withGates` calls `pixelGate` in place of `drawGate` (`src/render/sprites/rides.ts:101, 111-117`); `paintGateBooth` dispatches to `paintGateBoothPixel`.
2. Decks at `n > 0`: deck tops, edges and post columns as art-pixel fills in the path and queue slots, on the art grid (section 5.5, stage 5a row). At `n = 0`: today's drawing.
3. Mirror Maze and Haunted Manor hide their riders, as `tests/unit/render/content/art.test.ts:101-108` checks for Classic.

**Batches** (one plan each; 5a.1, 5a.2 and 5a.3 in this order; 5a.4 can run in parallel with them):

| Batch | Objects | Tests |
|---|---|---|
| 5a.1 Flat rides, first half | `teacup_twirl`, `bumper_cars`, `rocket_rounds`, `spiral_slide`, `mirror_maze`, `haunted_manor`, `pendulum_ship` (catalog order), 32 angle frames, 4 rotations | `pixelArt.test.ts`; `lint.test.ts`; the rider rule of decided rule 3 |
| 5a.2 Flat rides, second half | `thunder_disc`, `flip_arm`, `magic_carpet`, `kiddie_cars`, `merry_mill`, `gyro_globe` | `pixelArt.test.ts`; `lint.test.ts` |
| 5a.3 Gates and booths | the gate twin, the gate booths | `lint.test.ts` |
| 5a.4 Decks | the deck pieces | new `decks.test.ts`; `tests/e2e/paths.spec.ts:106-110` change |

**Existing tests:** recorder tests unchanged (Classic path). Known to change: `tests/e2e/paths.spec.ts:106-110` (section 13.2: Pixel decks).

**Risks:** section 14 rows 6 and 16.

**Open until the stage brief:**
1. The art of each of the 13 rides and of the gate twin (no draft exists for them), from the owner pictures of stage 3.
2. The deck slots of the footpath and queue decks and their edge and column tones.
3. Whether the early-delete remedy of section 10.4 item 5 applies (from the projections of stages 3 to 4c). If it applies: the Classic family that is deleted, and the rows of section 13.2 (the registry and spy lines of `art.test.ts`, `phase6Art.test.ts`) that move from 5b to this stage.

**Done when** (the decided checks; the brief adds the rest):
- [ ] Every flat ride has a twin; every twin stays inside its Pixel bounds (`pixelArt.test.ts`); lint passes; owner pictures delivered.
- [ ] Deck fills lie in the deck slots and post columns stand at the deck corners (`decks.test.ts`).
- [ ] `bundleSize.test.ts` passes; the initial load is at most `PEAK_LOAD_MAX`.

### Stage 5b — Classic removed. Medium. Outline.

**Before it starts:** 5a, 6 and 7 merged; the stage 5b brief approved.

**What the player sees:** no change in Pixel. The Art style control is gone.

**Decided work:**
1. `buildSprite` loses its Classic body. In the game, every sprite is painted on a surface.
2. Each Classic art function that has a twin is deleted; the dispatcher calls the twin with any context (a surface or a recorder). The Classic terrain painter (`TilePainter` and `paintTile`, used by `build`, `src/render/terrain.ts:551-556`) is deleted; `paintGroundChunk` replaces it.
3. The terrain exact-scale code goes: `allowExact` (`src/render/terrain.ts:463`), `MAX_EXACT_SCALE` (`:422`), `MAX_EXACT_BUILDS_PER_FRAME` (`:421`), `EXACT_SETTLE_FRAMES` (`:420`), `wantsExact` (`:588`) and the bucket stand-in path. `EXACT_SLOT` stays for the soft level.
4. `ZOOM_BUCKETS`, `zoomBucket` and the sprite key layout stay (tests pin them, `tests/unit/render/camera.test.ts:97-106`, `tests/unit/render/spriteCache.test.ts:30-35`).
5. The Classic zoom rules of the controller go. `wheelZoomFactor`, `WHEEL_ZOOM_FACTOR` and `KEY_ZOOM_FACTOR` (`src/input/camera.ts:13-14, 83-88`) are deleted; `tests/unit/ui/camera.test.ts:49-63` tests `wheelNotches`.
6. Settings version 4 (section 9.6), with the changes of `boot`, `apply`, `settingsSections` (the `artStyle` control goes, `src/ui/settings/model.ts:46`) and `src/data/strings/settings.ts` (section 9.6 item 4).
7. The Classic e2e CI job and `classicSmoke.spec.ts` go. The address flag `?art=` and `VITE_ART` go: `resolveArtStyle` is deleted, and `boot` calls `setArtStyle('pixel')`.
8. The colour map entries that only Classic track art made are deleted (the generator lists them).
9. Every Classic branch goes: in each file of section 5.5 whose row says "Pixel", among them `renderer.ts` (`applyPlan`, `draw`, `drawStatic`, `blit`, `blitColumn`, the guest dots), `layers.ts` (the type of `LayerFrame.art` stays optional; only the code paths for `null` go), `scenery/layer.ts`, `shows/layer.ts`, `track/layer.ts` (the `f.art === null` and `art === null` paths), `terrain.ts` (the `artStyle()` checks), `sprites/bank.ts`, `management/layer.ts`, `elevated/layer.ts`, `lighting/pass.ts`, `input/controller.ts`, `ui/land/index.ts` and `audio/index.ts` (the `data-art` checks), `main.ts` (`resize` keeps only the `viewportCss()` source; the second observer stays), and `ui/scenario/mascotArt.ts` (`drawFrost` and `drawSpark` go). `applyPlan` passes `'pixel'` to `renderPlan` and sets `canvas.dataset.art = 'pixel'` as literals, so `#game[data-art="pixel"]` in `main.css` still applies. Every `isPixelSurface` call outside `src/render/pixel/` goes with its branch. From 5b a layer treats an absent or `null` `f.art`, and `TrackLayer.collect` treats `art = null`, as `n = 0`: it copies with `blitArt` and `blitArtColumn` on the frame `{ n: 0, scale: f.scale, offX: f.offX, offY: f.offY }`, today's drawing path (section 7.7). That path stays for the soft level and a pinch (sections 7.1 item 5 and 7.5). At `n = 0`, `drawChain`, `drawWater`, `drawSpray`, `drawPlainSlice` and `drawPlainCar` (`src/render/track/layer.ts:719, 763, 802, 698, 870`) and the elevated deck fill (`ELEVATED_COLOURS`, `src/render/elevated/layer.ts:26-36`, filled at `:110-130`) keep today's vector code: they are the `n = 0` path, not Classic code (stage 4a decided rule 6, stage 5a decided rule 2). So `tests/unit/track/waterRender.test.ts:145-169` (it calls `collect` with 9 arguments, so `art` is `null`, then `drawItem`) and `tests/unit/paths/layer.test.ts:84-93` (its `frame()` literal, `:10`, has no `art`) pass unchanged. So the 8 files with `LayerFrame` literals (`tests/unit/{lighting/layer,scenery/render,shows/render,paths/layer,a11y/palette,terrain/layer,fields/overlay}.test.ts` and `tests/bench/lightScene.ts:47`) and the 3 tests that call `collect` with 9 arguments (section 5.5, `collect` row) pass unchanged, except the rows of section 13.2 marked 5b.

**Batches** (one plan each, in this order):

| Batch | Work items | Why this order |
|---|---|---|
| 5b.1 The switch goes | 6, 7; the start value of `artStyle()` becomes `'pixel'` | After it, the game and the Node tests always run Pixel; the Classic code is dead. |
| 5b.2 Classic art goes | 1, 2, 8 | The recorder tests now run the twins (section 5.4 rule 4). |
| 5b.3 Classic zoom and branches go | 3, 4, 5, 9 | The grep check of "Done when" passes only after this batch. |

**Existing tests:** the rows of section 13.2 marked "5b", among them the Phase 8 tests with Classic cases (`style.test.ts`, `styleSwitch.test.ts`, `pixelZoom.test.ts`, `props.test.ts`, `shadows.test.ts`; reason: Classic and the switch removed). Each changed test changes in the batch whose change makes it fail.

**Risks:** section 14 rows 12 and 16.

**Open until the stage brief:**
1. The batch of each section 13.2 row marked "5b" (by the rule above, from a run of the suite at the end of each batch).
2. Dead helpers that the grep does not find (for example `shadow` of `src/render/scenery/art/kit.ts:91-93`, which only Classic art calls), from a run of `tsc --noEmit` and a search for unused exports.
3. What the controller does when `pixelGrid.current` is `null` after 5b, and the change of the null-grid case of `tests/unit/ui/pixelZoom.test.ts` and of `tests/unit/ui/controller.test.ts:68-81, 338-360` (they must publish a grid).

**Done when:**
- [ ] `grep -rnE "artStyle\(\)|isPixelSurface|'classic'|dataset\.art\b" src --include=*.ts --exclude-dir=pixel --exclude-dir=sim` finds only: `canvas.dataset.art = 'pixel'` in `src/render/renderer.ts`; the `artStyle()` cache keys in `src/ui/decks/card.ts`, `src/ui/mood/moodBar.ts`, `src/ui/tips/bubble.ts` and `src/ui/scenario/tutorialUi.ts`; the `style` parameter of `renderPlan` and its Classic plan in `src/perf/quality.ts`; and `REMOVED_V3_CHECKS` in `src/settings/schema.ts` (section 9.6 item 2). Stage 9 removes all but the first and the last. Why `\b`: it stops the match on `canvas.dataset.artScale` (section 5.5, `draw` row), which stays. Why `--exclude-dir=sim`: `src/sim/world.ts:22` (`type MapLayout = 'classic' | 'freePlay'`) is a simulation type that stays, and `src/sim/` never holds a Classic branch.
- [ ] The whole suite passes; the initial load is recorded and lower than at the end of stage 7.
- [ ] Owner pictures delivered (desktop and phone at the home level, to show no change).

### Stage 6 — Other scenery themes and show sites. Large (light work per item). Outline.

**Before it starts:** 4c merged; the stage 6 brief approved.

**What the player sees:** Frost Peaks, Volcano Ridge, Spooky Hollow, Jungle Lagoon and Starport (60 items, 12 per theme, `src/data/catalog/scenery.ts:76-145`) and the two show sites in pixel art, with ground shadows. Dark themes get wider tone steps. Hedges and walls tile with no ink at joins (they use `cut`).

**Files:** `pixel/art/scenery.ts`, `pixel/art/shows.ts`, `pixel/shadows.ts` (`ROUND_CASTERS`, the show caster), `pixel/colourMap.ts`; changed `src/render/shows/art.ts` (`drawShowSiteArt` dispatch), `src/render/shows/layer.ts` (`drawAfterObjects` beam and rocket origins, `:266-275`).

**Decided rules:**
1. Scenery dispatch and bounds as stage 3; edge items use `cut` at joins.
2. The show-site casters of section 8.4 item 1; the twins draw no in-art shadow (section 8.4 item 6).
3. In Pixel, the beam and rocket origins of `drawAfterObjects` come from the pixel show art.
4. Each theme adds its round items to `ROUND_CASTERS`.

**Batches** (one plan each; the theme batches in catalog order; 6.6 can run in parallel with them):

| Batch | Objects |
|---|---|
| 6.1 Frost Peaks | 12 items, 4 rotations, every frame |
| 6.2 Volcano Ridge | 12 items |
| 6.3 Spooky Hollow | 12 items |
| 6.4 Jungle Lagoon | 12 items |
| 6.5 Starport | 12 items |
| 6.6 Show sites | `lightshow_tower`, `fireworks_launcher`, 4 rotations; the show casters; the origins of decided rule 3 |

Each batch: `pixelArt.test.ts` cases, `lint.test.ts`, a sheet.

**Existing tests:** recorder tests unchanged; `tests/unit/shows/render.test.ts` passes unchanged. No existing test is known to change in this stage.

**Risks:** section 14 rows 6 and 7.

**Open until the stage brief:**
1. The tone step of each dark theme (Volcano Ridge, Spooky Hollow), from the colour sheet.
2. The ids that each theme adds to `ROUND_CASTERS`.
3. The art of each item; the draft frost theme (`pixel3.py:29-33`) is the only draft of a theme.
4. The beam and rocket origin numbers of decided rule 3.
5. Whether the early-delete remedy of section 10.4 item 5 applies. If it applies: the Classic family that is deleted (scenery, show sites), and the rows of section 13.2 (the registry line of `tests/unit/scenery/art.test.ts:40`) that move from 5b to this stage.

**Done when** (the decided checks; the brief adds the rest):
- [ ] All 85 scenery items and both show sites have twins; lint passes; owner pictures delivered per theme.
- [ ] On a surface, no in-art shadow of a show site draws; `casterOf('show', id, 0)` gives the box of section 8.4 item 1 (`shadows.test.ts`).
- [ ] `bundleSize.test.ts` passes; the initial load is at most `PEAK_LOAD_MAX`.

### Stage 7 — Overlays and ghosts. Medium. Outline.

**Before it starts:** 4c merged; the stage 7 brief approved.

**What the player sees:** ghosts in the 4 tones of `q` or `u` (section 6.3), with stamped check and cross and a Bayer hatch; tile outlines and the selection as pixel dashes on 2:1 stairs; Calm, Buzz, Light and land tints as aligned dither; the spanner and storm-cloud ride markers as stamps; high contrast doubles the dash width.

**Files:** new `pixel/overlay.ts` (section 5.2); changed `renderer.ts` (`drawGhost` `:728-785`, overlays `:623-871`), `a11y/layer.ts`, `fields/overlay.ts`, `terrainTools/layer.ts`, `management/layer.ts`, `scenery/layer.ts`, `shows/layer.ts`, `track/layer.ts`, `elevated/layer.ts`, `lighting/overlay.ts`.

**Decided rules:**
1. `dashLine` and `ditherFill` have the signatures of section 5.2 and use no `Path2D`.
2. Ghost sprites keep the `remap(ghostTable(tint))` of stage 1a-i (section 6.3).
3. Dashes lie on 2:1 art-pixel stairs; tints are Bayer dither in world-anchored art-pixel coordinates (section 8.1 rule 5).
4. Colour is never the only signal: the check, the cross and the hatch on invalid ghosts stay (section 6.6). Text labels are exempt from the art grid.
5. With high contrast on, the dash width doubles.

**Batches** (one plan each; 7.1 first, then 7.2 and 7.3 in parallel):

| Batch | Files |
|---|---|
| 7.1 Dashes and outlines | `pixel/overlay.ts`; `renderer.ts` overlays (`:623-871`), the tile outlines and the selection lines |
| 7.2 Ghosts | `renderer.ts` `drawGhost` (`:728-785`); the ghosts of `scenery/layer.ts`, `shows/layer.ts`, `track/layer.ts`, `elevated/layer.ts`; the check, cross and hatch stamps |
| 7.3 Tints and ride markers | `a11y/layer.ts` (Calm, Buzz), `lighting/overlay.ts` (Light), `fields/overlay.ts`, `terrainTools/layer.ts` (land tints), `management/layer.ts` (with `drawRideMarkers`, `src/render/management/layer.ts:447`, called at `:373`: the spanner and storm-cloud markers) |

**Existing tests:** `tests/unit/render/safeColours.test.ts` passes unchanged. No existing test is known to change; the brief checks the e2e tests that read overlay pixels.

**Risks:** section 14 row 12.

**Open until the stage brief:**
1. For each changed file: the function and its line, and the `dashLine` or `ditherFill` call that replaces each vector call.
2. The dither density of each overlay (Calm, Buzz, Light, land tints).
3. The alpha rule for ghost sprites (for example "`drawGhost` copies ghost sprites at `globalAlpha` 1").
4. The names of the check, cross and hatch stamps and their file.
5. How the high-contrast setting reaches `dashLine`.
6. The e2e tests that read overlay pixels (for example under `tests/e2e/a11y.spec.ts`) and their change in Pixel, if any.
7. The cases of `ghost.test.ts` and `overlay.test.ts` for each overlay kind.
8. The ride marker (`drawRideMarkers`) on the art grid: its stamps and the step of its bob.

**Done when** (the decided checks; the brief adds the rest):
- [ ] Every ghost pixel and every `dashLine` and `ditherFill` pixel is a slot; the ghost tones are `q` or `u` slots (section 6.3); check, cross and hatch are present (`ghost.test.ts`). Text labels are exempt.
- [ ] Owner pictures of each tool delivered; `bundleSize.test.ts` passes; the initial load is at most `PEAK_LOAD_MAX`.

### Stage 8 — Night, weather, shows. Medium. Outline.

**Before it starts:** 5b merged; the stage 8 brief approved. The owner was asked about decision 5; with no change, the default holds.

**What the player sees:** night as banded light pools with dithered borders on the art grid, crisp bulbs, pixel rain, stepped beams, pixel fireworks, water sparkle; shadows off at night.

**Files:** `lighting/{pass,sprites}.ts`, `shows/fx.ts`, `shows/layer.ts`, `management/layer.ts` (weather), `pixel/shadows.ts`, `src/data/tuning/pixel.ts` (`NIGHT_POOL_BANDS`).

**Decided rules:**
1. The light canvas has one pixel per art pixel of the screen (divisor `n` instead of `LIGHT_CANVAS_DIVISOR`, `src/render/lighting/pass.ts:35, 121-122`); pools are `NIGHT_POOL_BANDS` (3) bands with Bayer borders, as `pixel3.py:188-197`; the multiply copies it with smoothing off at factor `n` (`pass.ts:159-169`). The light canvas is aligned to the art grid: with `p = offX − n × floor(offX / n)` and `q = offY − n × floor(offY / n)` (so 0 ≤ `p`, `q` < `n`), it has `ceil(width / n) + 1` by `ceil(height / n) + 1` pixels, light pixel (i, j) covers the art pixel whose canvas origin is `(p − n + i × n, q − n + j × n)`, and the multiply copies it to that origin (destination `p − n`, `q − n`, size `lw × n` by `lh × n`). Why: today the light canvas starts at the canvas corner (`LightPass` draw, `pass.ts:121-122, 162`), but the art pixels lie at `offX + m × n`; a light pixel from the canvas corner covers parts of two art pixels whenever `offX mod n ≠ 0`, and the bands crawl against the art while the player pans (`light-fx.md` obstacle 2; section 14 row 23). At the soft level and at a zoom that is not a crisp level (`n = 0`), the light canvas keeps today's divisor and smoothing.
2. Bulbs sit on art pixels (`drawBulbs`, `pass.ts:229-300`).
3. With the lighting darkness at least `NIGHT_SHADOW_OFF`, the shadow layer draws nothing (section 8.4 item 7).
4. With reduced motion, beams stay still, as today.

**Batches** (one plan each; 8.1, then 8.2; 8.3 and 8.4 can run in parallel after 8.1):

| Batch | Files |
|---|---|
| 8.1 Light pools | `lighting/pass.ts` (light canvas, multiply) |
| 8.2 Bulbs and shadows off | `lighting/pass.ts` (`drawBulbs`), `lighting/sprites.ts`, `pixel/shadows.ts` |
| 8.3 Rain | `management/layer.ts` (`drawWeather`, `:314`, called at `renderer.ts:1115`) |
| 8.4 Show effects and sparkle | `shows/fx.ts` (`drawLightshow` `:116`, `rocketAt` `:163`, `particlesAt` `:174`), `shows/layer.ts` (`drawAfterObjects`, `:255`); water sparkle |

**Existing tests:** `tests/e2e/afterDark.spec.ts:108-125` and `tests/unit/shows/render.test.ts` pass unchanged. Known to change: `tests/unit/lighting/layer.test.ts:153-258` (section 13.2: the divisor follows `n`).

**Risks:** section 14 rows 8 and 23.

**Open until the stage brief:**
1. The rain rule: drop shape on the art grid, count and speed.
2. The beam rule: how a beam steps on the art grid.
3. The rocket and spark rule of the fireworks.
4. Water sparkle: which code draws it and where (no sparkle code exists under `src/render/` today: not found).
5. The tests of rain, beam and firework pixels on the art grid (file and cases).
6. The final `NIGHT_POOL_BANDS` and `NIGHT_SHADOW_OFF`, from the stage 8 owner pictures at dusk and at 22:00.
7. The `PIXEL_CODE_STEP_KB` step of stage 8 if the night code does not fit the limit after stage 7.
8. The owner's answer to decision 5 (default: option a).

**Done when** (the decided checks; the brief adds the rest):
- [ ] Mean brightness at 22:00 < 0.8 × noon; with After Dark off, |22:00 − noon| < 0.05 × noon (`tests/e2e/afterDark.spec.ts:108-125`).
- [ ] With darkness at least `NIGHT_SHADOW_OFF`, the shadow layer draws nothing (`shadows.test.ts`).
- [ ] The light grid and the art grid share a phase: after a pan by one canvas pixel, no band edge of a light pool moves relative to the art (`tests/unit/lighting/layer.test.ts`, the light pass driven alone at a crisp level with `offX` and then `offX + 1`; the brief names the case).
- [ ] Owner pictures at noon, dusk and 22:00 delivered.

### Stage 9 — Close-out. Small. Outline.

**Before it starts:** 8 merged; the stage 9 brief approved.

**What the player sees:** no change.

**Decided work:**
1. Remove dead code: `canvasPixelRatio` (`src/render/canvas.ts:45-48`) and the `artStyle` module state of `src/render/pixel/style.ts`. Every remaining caller drops its `artStyle()` call: `src/ui/decks/card.ts` (cache key), `src/ui/mood/moodBar.ts`, `src/ui/tips/bubble.ts`, `src/ui/scenario/tutorialUi.ts` (cache keys), `src/render/renderer.ts` (the `artStyleVersion()` check in `draw`), `src/perf/quality.ts` (`renderPlan` loses `style`; the Pixel plan is the only plan). `src/main.ts` and `src/ui/perf/index.ts` no longer read the style after stage 5b (section 9.6 item 4). `REMOVED_V3_CHECKS` stays: settings version 4 still reads version 3 documents. `shade`, `mixHex` and the private `shade` of `shows/art.ts` lose their `noteDerived` and `noteMixed` calls when no generator run needs them, and each function that has no caller left is deleted.
2. Update `docs/adr/0001-renderer.md` and the master spec build table (Build 5 row).
3. Update master spec §2.5: guests are about 14 × 24 px at zoom 1 (7 × 12 art pixels).
4. Retake `docs/screenshots/` at levels. Each owner screenshot script sets the zoom to `nearestLevel` of its fixed zoom on its screen: `tests/e2e/screenshot.spec.ts:102` (0.9), `tests/e2e/overview-build3.spec.ts:177` (0.9), `tests/e2e/content.spec.ts:208` (0.9), `tests/e2e/scenery.spec.ts:253` (0.82), `tests/e2e/afterDark.spec.ts:271` (1.25).
   **Decision: `tests/e2e/overview-build4.spec.ts`.** Stage 9 does not change its code and runs it with `TC_SCREENSHOT=1` with the other scripts, so `docs/screenshots/phase-7-desktop.png`, `phase-7-phone.png`, `phase-7-title-desktop.png` and `phase-7-title-phone.png` show the pixel park. Why: it runs at `deviceScaleFactor` 1 (`:104`), where `k` = 1 and the levels are 0.5, 1, 1.5 and 2 on desktop and phone, so its zooms 1 (desktop) and 0.5 (phone) (`:60`) are already crisp levels.
5. Release check for Build 5, in `scripts/check-release.ts` with `tests/unit/offline/release.test.ts`: `RELEASE_VERSION` (`:30`) becomes `'5.0.0'`; the audit list of `checkRelease` (`auditPaths`, `:205`) adds `build-5`, so `build-5-acceptance.md` is read; the CHANGELOG and README checks (`:266-270`) look for "Build 5"; the tag check (`:275-276`) looks for `build-5`. `package.json` and `package-lock.json` `version` become `5.0.0` (item 8 of `checkRelease` compares it with `RELEASE_VERSION`, `scripts/check-release.ts:265`, and `tests/unit/offline/release.test.ts:99-102` asserts it); write `docs/superpowers/specs/thrills-and-chills/build-5-acceptance.md` with its result line (`**Result:`) and a "| # | Done when" table with one row for each item of section 16. Item 1 of the release check (`doneWhenProblems`, `:152`) fails on any row of that table whose result is FAIL or PENDING (`auditRows`, `:115`), and `auditOwnerItems` (`:137`) lists each row whose result is OPEN or GAP as an owner item; so every row is PASS before the release, or OPEN or GAP with the owner's item. Add a `## … Build 5` section to `CHANGELOG.md` and a Build 5 paragraph to `README.md`.
6. A fresh bundle and performance run.

**Batches** (one plan each, in this order):

| Batch | Work items | Tests |
|---|---|---|
| 9.1 Dead code | 1 | `tests/unit/render/renderer-rotation.test.ts:10, 169-172` and `tests/unit/perf/quality.test.ts` change (section 13.2) |
| 9.2 Documents and screenshots | 2, 3, 4 | the screenshot scripts of item 4 |
| 9.3 Build 5 release | 5, 6 | `tests/unit/offline/release.test.ts` follows item 5; `perf.spec.ts` and `perf-build3.spec.ts` with `TC_PERF=1` on desktop and phone |

**Existing tests:** the full suite. Known to change: the stage 9 rows of section 13.2.

**Risks:** none new.

**Open until the stage brief:**
1. (Closed: a screenshot script gets the level list by the e2e level rule of section 13.3.)
2. The wording of the master spec changes of items 2 and 3.
3. Whether `src/render/pixel/derived.ts`, the memo hooks and the remaining `shade` callers stay after stage 5b (the colour map generator needs them while new literals can come).
4. The line numbers of `scripts/check-release.ts` and `tests/unit/offline/release.test.ts` in item 5: on the day of revision 6 another agent had uncommitted edits in both files (header, "Code facts"); the brief re-reads them.

**Done when:** section 16.

---

## 13. Tests

### 13.1 Existing tests that must pass unchanged

1. Every unit test passes unchanged until stage 5b, because Node tests run Classic (`artStyle()` starts at `'classic'`) and the recorders take the Classic path (section 5.4). Exceptions: the tests of section 13.2 for stages 1b, 1c and 2a; and, when the early-delete remedy of section 10.4 item 5 applies, the registry and spy lines of section 13.2 that the stage 5a or 6 brief moves to that stage.
2. Every e2e test passes unchanged in Classic through stage 4b, and in Pixel from stage 4c, except the tests of section 13.2. From stage 4c until 5b, CI also runs the e2e suite with `VITE_ART=classic` on desktop (one extra job in `.github/workflows/ci.yml`); `tests/e2e/paths.spec.ts:106-110` keeps its Classic expectation in that job.
3. In particular, these pass unchanged in every stage: geometry and bookkeeping (`iso`, `camera` range, `depth`, `rotation`, `view`, `walkerHeight`, `terrainTracker`, `management/geometry`, `track/project`, `track/selection`, `scene`, `spriteCache`, `anim` under `tests/unit/render/`); `tests/unit/render/staticLayer.test.ts:218-222` (no dots at zoom 0.6 and 0.8, dots at zoom 0.6 and 0.75 at `low`: these zooms are not crisp levels at dpr 1, so the dots stay as today; the renderer never snaps the zoom); `tests/unit/render/safeColours.test.ts`; `tests/unit/architecture.test.ts`; `tests/unit/offline/release.test.ts` (until stage 9, section 13.2); `tests/unit/perf/overlay.test.ts` (the new `PerfSnapshot` members are optional); `tests/e2e/boot.spec.ts:12-21` (draft grass `g1` to `g3` have green above 120); `tests/e2e/afterDark.spec.ts:108-125`; `tests/e2e/phase1-smoke.spec.ts:148-211` (a wheel notch or a pinch raises `data-zoom`); `tests/e2e/tutorial.spec.ts:65-71, 140-153`; `tests/e2e/overview-build4.spec.ts` (skipped without `TC_SCREENSHOT`; stage 9 runs it unchanged).

### 13.2 Existing tests that change

| Test | Stage | Change | Reason |
|---|---|---|---|
| `tests/e2e/perf-build3.spec.ts:255, 271-274` | 1b | When `#game[data-art]` is `'pixel'` (the style that runs, so also from stage 4c with no `VITE_ART`), `at(rot)` uses `#game[data-home-zoom]`; the `[perf]` line also prints `zoom` and `n`. | Zoom 1 is not a level on every screen. |
| `tests/unit/perf/quality.test.ts:15-30` | 1b | Gains Pixel cases: `stretch` and `pixelRatio` for the screens of section 7.3, and `renderPlan('high', 'phone', 2.625, 1, 'pixel')` gives `stretch` 2 (`high` ignores `autoMaxRatio`). Today's cases do not change. | `renderPlan` gains `style`. |
| `tests/unit/render/fakeCanvas.ts:16-31` | 1b | `FakeCanvas` gains `readonly style: Record<string, string> = {}`. | `applyPlan` writes the canvas box size in Pixel, and a Node test (`styleSwitch.test.ts`) runs the renderer in Pixel. |
| `tests/e2e/helpers.ts:23` | 1b | Gains `newParkAt(page, query, name)`: the title steps of `newPark` after `page.goto('/' + query)`. `newPark` does not change. | `newPark` opens `/`, which drops the address flag (section 11.2 item 1). |
| `tests/unit/render/fakeCanvas.ts:7-14, 52-75` | 2a | Each `DrawCall` gains `op: string`, the current `globalCompositeOperation` of the context (default `'source-over'`), recorded in `getContext` for `drawImage`. | `shadows.test.ts` counts the multiply copies; a property set goes to `state` only today. |
| `tests/unit/core/settings-store.test.ts:39-61` | 1c | `defaultSettings()` gains `artStyle: 'auto'`. | Settings version 3. |
| `tests/unit/core/settings-store.test.ts:64-69, 78` | 1c | Version 2 → 3; "newer version" uses 4. | Settings version 3. |
| `tests/unit/settings/data.test.ts:82-125` | 1c | `v1Values` (`:82-85`) also drops `artStyle`; the version 2 cases use a document with no `artStyle`. The case "a version 1 document keeps every one of its 19 values unchanged" (`:93-104`) expects `{ ok: true, values: { ...v, mascotTips: defaults.mascotTips, artStyle: defaults.artStyle } }`, because `parseSettings` starts from `defaultSettings()` (`src/settings/schema.ts:122`), which holds `artStyle: 'auto'` from this stage; its 19 values do not change. Add: a version 2 document with no `artStyle` loads with `'auto'`; a version 2 document with `artStyle` is unreadable ("unknown setting artStyle"). "Version 3 unreadable" → version 4; "the build writes version 3". | Settings version 3. |
| `tests/unit/settings/behaviour.test.ts:110-121` | 1c | The version 1 document also drops `artStyle`; it becomes version 3 at the next change. | Settings version 3. |
| `tests/unit/settings/model.test.ts:45` | 1c | Display list gains `'artStyle'` after `'renderQuality'`. | New control. |
| `tests/e2e/settings.spec.ts:23` | 1c | `doc.version` is 3. | Settings version 3. |
| `tests/e2e/paths.spec.ts:106-110` | 5a | In Pixel: deck pixel within 60 of the deck slot colour, not `#dcc79c`. In Classic (the CI job): unchanged. | Pixel decks. |
| `tests/unit/render/terrain.test.ts:2, 85-124, 125-164, 211-262` | 5b | The import list loses `EXACT_SETTLE_FRAMES`. The draw-order case (`:85-124`) matches a chunk draw at `b.left − 2 × SURFACE_PAD` and `b.top − 2 × SURFACE_PAD` at scale 1 (a surface pad of 2 art pixels copied at factor 2), and reads `hasImage` with the bucket that holds the art-scale image (0.5). The exact-scale case (`:125-164`) and the stand-in, 3-bucket and prefetch cases (`:211-262`) become: one art-scale image per chunk and rotation, copied at factor `n`; prefetch builds one art-scale image per call. | Chunks are surfaces at art scale; exact-scale and bucket code removed. |
| `tests/unit/render/staticLayer.test.ts:240-241` | 5b | Phone at dpr 3, `high`: the width is `ceil(412 × 3 / 2)` = 618, not 824 (`k` = 2). The other cases of that test (2560, 1280) and the step-down test (`:245-265`: 824, 412, 824) do not change. | Canvas size from `k`. |
| `tests/unit/render/staticLayer.test.ts:122` | 5b | The rebuild frame draws chunk images of about 260 px width, copied at factor `n`, not wider than 300. | Chunks at art scale. |
| `tests/unit/ui/camera.test.ts:49-63` | 5b | Notch accumulator cases of `wheelNotches` instead of `1.15 ** notches`. | Classic zoom removed. |
| `tests/unit/ui/controller.test.ts:68-81, 338-360` | 5b | Keys and wheel step one level; a pinch settles on `pinchEnd`. | Classic zoom removed. |
| `tests/unit/render/guestItems.test.ts:39-72` | 5b | Bounds from `PIXEL_GUEST_BOUNDS` and `PIXEL_GUEST_ITEM_BOUNDS`; item fills are `fillStyle=<slot colour of ITEM_COLOURS[n]>`. | Pixel guests use slots. |
| `tests/unit/a11y/palette.test.ts:59-78` | 5b | The ring is checked by pixels: a full ring has no gap, a notched ring has gaps. | Rings are stamps, not `ellipse` calls of radius 6.2. |
| `tests/unit/core/settings-store.test.ts`, `tests/unit/settings/data.test.ts`, `tests/unit/settings/behaviour.test.ts`, `tests/unit/settings/model.test.ts:45`, `tests/e2e/settings.spec.ts:23` | 5b | Defaults lose `artStyle`; version 3 → 4; a version 1 and a version 2 document load (no `artStyle` to drop; the 19-value case of `data.test.ts:93-104` again expects `{ ...v, mascotTips: defaults.mascotTips }`); a version 3 document with a good `artStyle` loads and drops it; a version 3 document with a bad `artStyle` is unreadable; the Display list loses `'artStyle'`; the stored `doc.version` is 4. | Settings version 4. |
| `tests/unit/render/staticLayer.test.ts:217`, `tests/unit/render/renderer-rotation.test.ts:110-131` | 5b | At `GUEST_LOD_ZOOM` (0.5) and dpr 1, `n` is 1, so a guest dot is `n × n` = 1 × 1 canvas pixels, not 2 × 3. | Dots on the art grid. |
| `tests/unit/render/renderer-rotation.test.ts:181-191` | 5b | The phone canvas width is `ceil(cssW × dpr / k)` (541 for 412 at 2.625, `k` 2), not `round(412 × 2)`, and the height is `ceil(cssH × dpr / k)` (1201 for 915), not `round(915 × 2)` (`:186-187`). The desktop case (2560) does not change. | Canvas size from `k`. |
| `tests/unit/render/content/art.test.ts:41-51, 112-122`, `tests/unit/render/content/phase6Art.test.ts:43-50, 110-116` | 5b | The registry checks read `PIXEL_RIDE_ART` and `PIXEL_STALL_ART`; the spies are `vi.spyOn(PIXEL_RIDE_ART, id)` and `vi.spyOn(PIXEL_STALL_ART, id)`. | `CONTENT_RIDE_ART` and `CONTENT_STALL_ART` are deleted. |
| `tests/unit/scenery/art.test.ts:40` | 5b | The keys of `PIXEL_SCENERY_ART` equal the catalog ids. | `SCENERY_ART` is deleted. |
| `tests/unit/render/content/art.test.ts`, `phase6Art.test.ts`, `tests/unit/scenery/art.test.ts`, `tests/unit/render/track/slices.test.ts`, `tests/unit/render/track/phase6Render.test.ts` | 5b | Only the registry and spy lines change (rows above). The other assertions do not change; they now run the twins, with the Pixel bounds. A failure is an art fault, not a test change. | Classic functions deleted. |
| `tests/unit/render/pixel/style.test.ts` | 5b | The start value is `'pixel'`; the `resolveArtStyle` cases go with the function. | Classic and the switch removed. |
| `tests/unit/render/pixel/styleSwitch.test.ts` | 5b | Removed with the switch; the 5b grep check replaces it. | Classic and the switch removed. |
| `tests/unit/ui/pixelZoom.test.ts` | 5b | The Classic case goes; the null-grid case follows the stage 5b brief (open item 3). | Classic and the switch removed. |
| `tests/e2e/pixelSmoke.spec.ts` (the style-switch resize case) | 5b | The case opens `/` (Pixel by default), does no switch, and keeps the viewport resize and the `canvas.width` check. | The setting `artStyle` is removed. |
| `tests/unit/render/pixel/props.test.ts` | 5b | The Classic case (`surfaceZ` for a deck item) goes. | Classic and the switch removed. |
| `tests/unit/render/pixel/shadows.test.ts` | 5b | The carousel height is `pixelRideHeight('carousel')`, not 100. | Classic and the switch removed (Node runs Pixel, so `casterOf` uses `pixelRideHeight`). |
| `tests/unit/lighting/layer.test.ts:153-258` | 8 | The light canvas divisor follows the art grid (`n`) at crisp levels: the light canvas is `ceil(width / n) + 1` by `ceil(height / n) + 1` pixels and its copy starts at `(p − n, q − n)` (stage 8 decided rule 1). | Pixel night. |
| `tests/unit/render/renderer-rotation.test.ts:10, 169-172` | 9 | Drop the `canvasPixelRatio` case; the plan tests cover the ratio. | Dead code removed. |
| `tests/unit/perf/quality.test.ts:15-30` and its stage 1b Pixel cases | 9 | The Classic plan cases go; the Pixel cases drop the 5th argument; `zoomBuckets` is 3 in every case. | `renderPlan` loses `style`. |
| `tests/e2e/screenshot.spec.ts:102`, `tests/e2e/overview-build3.spec.ts:177`, `tests/e2e/content.spec.ts:208`, `tests/e2e/scenery.spec.ts:253`, `tests/e2e/afterDark.spec.ts:271` | 9 | The fixed zoom (0.9, 0.82 or 1.25) → `nearestLevel` of that zoom on the screen. | Owner screenshots at levels. |
| `tests/unit/offline/release.test.ts` | 9 | Follows the Build 5 release check (stage 9 work item 5). | Build 5. |

Until 5a, decks draw as vectors in `#dcc79c` (`src/render/elevated/layer.ts:27`, filled at `:110-130`) in both styles, so `tests/e2e/paths.spec.ts:106-110` passes unchanged in Pixel in stages 1a-i to 4c.

No test is skipped or removed without a replacement that checks the same behaviour. Exception: `classicSmoke.spec.ts`, `styleSwitch.test.ts` and the Classic CI job are removed in 5b, together with the Classic style and the switch that they test.

### 13.3 New tests

Unit tests are under `tests/unit/render/pixel/` unless the name has a folder.

| Test | Stage | Asserts |
|---|---|---|
| `style.test.ts` | 1a-i | `resolveArtStyle` order of section 9.2; `setArtStyle` bumps `artStyleVersion` only on a change; the start value is `'classic'` (changes in 5b, section 13.2). |
| `palette.test.ts` | 1a-i | Ramp values of sections 6.1 to 6.3; slot names unique; `INK_SLOT` is `i3`; `trackSlot` of section 6.2; `slotOf` rule 0 for every signal colour, and the `#56b4e9` exception; one case for each family rule a to e of section 6.5; `nearestInFamily` never returns a signal slot; `nearestInFamily` of a colour with lightness below 0.2 is never `INK_SLOT`; `ghostTable` thresholds of section 6.3; colour-blind pairs of section 6.6 at `CB_MIN_DELTA_E` 10 (pair 4 reads `QUEUE_SLOT` of `colourMap.ts`). From 2b: `slotOf(rgbCss(tintStepRgb(0)))` is `b2` and `slotOf(rgbCss(tintStepRgb(8)))` is `x3` (why the ring stamp names its `y` slot directly, section 8.3). |
| `colourMap.test.ts` | 1a-ii | The 6 checks of section 6.4, with the hand-checked list `SIGNAL_ENTRIES` for check 3; the shirt table of section 6.4; `COLOUR_MAP['#a9c0d2'] === QUEUE_SLOT`. |
| `colourMapGen.test.ts`, `sheet.test.ts` | 1a-ii | Tools, skipped unless `TC_PIXEL_COLOURS=1` or `TC_PIXEL_SHEET=1` (sections 6.4 and 8.6). |
| `surface.test.ts` | 1a-i | A 2:1 line is a clean stair; two fills that share an edge leave no gap; a fill thinner than one art pixel sets at least one pixel; a stroke makes no ink ring; `layer()` puts ink between two layers; `cut(true)` pixels make no ink; a surface made with `{ ink: false }` has no ink; translucent fill on nothing dithers; mix and snap never gives a signal slot or `INK_SLOT`; `BAYER4` and `SURFACE_PAD` equal the values of section 15; `inkMask` marks only ink-making pixels; `emitRuns` and the `ImageData` path give the same pixels; same input, same `hash()`; `isPixelSurface` is false for a recorder and for `FakeCanvas`; `fillStyle = 'y1'` paints slot `y1`, not `b2`, and counts no miss. From 1a-ii: a sprite from `buildSprite` in Pixel has `artHash` equal to the `hash()` of a surface painted with the same bounds and paint function. |
| `styleSwitch.test.ts` | 1a-i | A `FakeCanvas` renderer (`createCanvasRenderer`) draws one frame in Classic. Spies, installed after that frame, record each call of `SpriteCache.prototype.clear` with its `this`, of `TerrainLayer.prototype.invalidate` and of `TrackLayer.prototype.clearArt`. `setArtStyle('pixel')` runs and the renderer draws again: `clear` ran on at least 5 distinct caches (the bank, the static layer, the track cars, the scenery sprites and the show sprites), `invalidate` and `clearArt` ran once each, and `canvas.dataset.art` is `'pixel'`. A third frame with no style change calls none of them. Removed in 5b (section 13.2). |
| `sprites.test.ts` | 1a-ii | In Pixel: every ride, stall, scenery and show-site sprite of the catalogs in 4 rotations at frames 0 and 8; every staff frame (`staffFrame(type, costume, walk, action)` for each staff type, costume, walk and action value, `src/render/sprites/staff.ts:33`) in 4 facings (`bank.staff`); every path item frame (`bank.pathItem`, the frame bits of `src/render/sprites/bank.ts:173`); every litter and mess decal with flip 0 and 1 (`bank.decal`); the fence in 4 directions (`bank.fence`); both entrance parts with each `outerDir` 0 to 3 and −1 (`bank.entrance`); the track slices of every piece in 4 rotations for each of the 12 track colours; the cars of each car type at the sample poses (yaw 0, 4, 8, 12 × pitch 0, 6, 12, 18 × roll 0, 8) for each of the 12 track colours; guest frames with the tint bit (256) for steps 0 to 8. No throw, `paletteStats.misses === 0`, the same hashes in two build orders. The hash seam (section 5.1): the test installs `FakeCanvas` (`install()`, `tests/unit/render/fakeCanvas.ts`) and builds every case through the real path. Rides, stalls, guests, staff, path items, decals, the fence and the entrance: the `SpriteBank` methods (`src/render/sprites/bank.ts:97-207`); scenery: `ScenerySprites.get` (`src/render/scenery/sprites.ts:70`); show sites: `buildSprite(showArtBounds(defId), 0.5, (ctx) => drawShowSiteArt(ctx, defId, facing))`, the call of `sprite` in `src/render/shows/layer.ts:101`; the test compares `sprite.artHash`. Track slices: `artBuildLog.hashes = []`, then `TrackLayer.collect` with a test map and a recording sink, as `tests/unit/render/track/slices.test.ts:192` does, then `drawItem` (`src/render/track/layer.ts:650`) for each collected item, with `collect` again after each 20 builds (`MAX_SLICE_BUILDS_PER_FRAME`; the count resets in `collect`, `:496`); the test compares the log. Cars: `buildSprite(CAR_BOUNDS, 0.5, (cx) => paintCar(cx, shape, yaw, pitch, hex, front, Math.sin(roll), Math.cos(roll)))`, the call of `drawCar` (`src/render/track/layer.ts:859`) at the pose; the test compares `artHash`. From 2b: ring pixels of tinted guests are `y` slots (the ring stamp names its slot, section 8.3); golden hashes of the guest front and back, written when the owner approves the batch 2b.1 pictures. From 3 (outline, completed by the stage 3 brief): golden hash of carousel frame 0 rotation 0; each hero ride has more than 8 distinct hashes over the 32 angle frames, occupancy 0 and 1 differ, and at frame 0 the 4 view rotations give 4 different hashes; every pixel in which `drawRideArt` differs from the twin painted alone is opaque in the sprite that `withGates` paints with an empty body. |
| `bundleSize.test.ts` | 1a-i | Fails when the gzip of `src/render/pixel/**/*.ts` and `src/data/tuning/pixel.ts`, joined in path order, is above `PIXEL_CODE_GZIP_LIMIT`, the sum of `PIXEL_CODE_STEP_KB` over `PIXEL_STAGES_MERGED` (section 10.4 item 6). |
| `grid.test.ts` | 1b | `planStretch` table of section 7.1; the level lists of section 7.3; `nearestLevel` tie goes to the smaller zoom; `stepLevel` ends; `snapWalker` stairs; every `snapWalker` and `snapCar` result is a multiple of 2 world pixels, so a guest, staff or car sprite anchor is on the art grid; `snapCar`: a train on a straight 2:1 piece moves on a clean stair, and a near-vertical tangent snaps y first; `blitArt` destination edges are whole; with `n = 0`, `blitArt` matches the rounding of `renderer.ts` `blit`; `artScale(Number(String(level)), grid) > 0` for every level of section 7.3; `ManagementLayer` driven alone in Pixel (a recording `blit` and a recording sink, a map with a bench and litter): every path item push and every litter and mess blit has an anchor that is a multiple of 2 world pixels. |
| `tests/unit/ui/pixelZoom.test.ts` | 1b | With a published grid: a wheel notch steps one level; ten pixel deltas of 10 step once (the sum is 0.9999999999999999, within `LEVEL_EPS` of 1, section 7.4 rule 1); the accumulator resets: a notch of 0.5 at `t` = 0 and a notch of 0.5 at `t` = `WHEEL_IDLE_RESET_MS` give no step, and at `t` = `WHEEL_IDLE_RESET_MS − 1` they give one step (the test imports the constant from `src/data/tuning/pixel.ts` and passes `t` as the 5th argument of `wheel`); a pinch settles to its level after `PINCH_SETTLE_MS` of `update` time; keys step; `pinchEnd` settles to the nearest level; a grid change settles; a zoom set by `__tc` stays until a grid change; with `pixelGrid.current` `null` (Classic) the rules of today hold (changes in 5b, section 13.2). |
| (rule) | 1b | **The e2e level rule.** An e2e spec gets the levels in Node: `zoomLevels(makeGrid(dpr, device, false))` imported from `src/render/pixel/grid.ts` (e2e specs import `src`, as `tests/e2e/a11y.spec.ts:10` and `tests/e2e/shows.spec.ts:2-3` do), with `dpr` from `page.evaluate(() => devicePixelRatio)` and `device` from `#game[data-device]` (`src/render/renderer.ts:915`), after the wait for `data-stretch` of the spec. The crisp levels are those with `soft` false. A spec sets a level through `window.__tc.camera.zoom` (section 7.4 rule 5: the controller does not settle it), then waits for `data-zoom` to equal `level.toFixed(3)`. The "next level" is `stepLevel(zoom, 1, grid)`. |
| `tests/e2e/pixelSmoke.spec.ts` | 1a-i | From 1a-i: the spec opens `/?art=pixel`: boot; `data-art="pixel"`; no console errors. From 1b, the spec starts a park with `newParkAt(page, '?art=pixel', name)`, never with `newPark` (section 11.2 item 1), and: set `renderQuality` (a version 2 setting) to `'high'` through `__tc.settings.set`, then wait until `data-stretch` equals `planStretch(devicePixelRatio, device, false)`; `data-art="pixel"`; `canvas.width === ceil(cssW × devicePixelRatio / k)`; the box width is `canvas.width × k / devicePixelRatio`; computed `image-rendering` is `pixelated`; after boot and `newParkAt` with no input, `Number(data-zoom).toFixed(3)` equals `Number(data-home-zoom).toFixed(3)`; one wheel step raises `data-zoom` to the next level (the e2e level rule above); no console errors. From 1c: build a carousel. From 1c, the style-switch resize case: open `/` with no address flag through `newParkAt(page, '', name)`, set `artStyle` to `'classic'` and then to `'pixel'` through `__tc.settings.set`, wait until `#game[data-art]` is `'pixel'` and `data-stretch` equals `planStretch(devicePixelRatio, device, false)`, change the viewport size with `page.setViewportSize` (width − 40, height − 60), and check that `canvas.width` becomes `ceil(cssW × devicePixelRatio / k)` for the new `cssW` (changes in 5b, section 13.2). From 2b: the award toast mascot is a `canvas[role=img]` with its label. From 4b (outline): the card preview size of the stage 4b "Done when". |
| `ground.test.ts` | 1c | The same chunk twice gives the same hash; 4 rotations differ; the Bayer phase matches across two neighbouring chunks; water is opaque; `soft = true` has no Bayer pattern; a soft chunk covers its neighbour's first art pixel; grass details: on a grass-only map, the share of detail anchors over 64 × 64 tiles is within 25 % of `GROUND_DETAIL_SHARE`, every detail pixel is one of the slots of section 8.1 item 7, a detail that crosses a chunk edge has the same pixels in both chunks, and a `soft = true` chunk has none. |
| `budget.test.ts` | 1c | With an injected clock: `take()` turns false after the limit; `beginFrame()` resets. |
| `rideSprites.test.ts` | 1c | A `FakeCanvas` renderer in Pixel. With `buildBudget.take()` false, `collectRides` reuses the last sprite of the same ride id and rotation; after a demolish the entry is deleted; a ride with a new `defId` at the same id builds at once; `data-complete` is `'0'` on a skipped build and `'1'` on a frame with no skipped build and no pending chunk. |
| `tests/e2e/pixelGrid.spec.ts` | 1c | Desktop and phone. The prototype scene of section 11.2 items 1 to 7 is built in this page, started with `newParkAt(page, '?art=pixel', name)` (never `newPark`, section 11.2 item 1); `renderQuality` set to `'high'` through `__tc.settings.set`, then a wait until `data-stretch` equals `planStretch(devicePixelRatio, device, false)`. The prototype scene in the state of section 11.2 item 8, at each crisp level (the e2e level rule above), after the scene settles: `#game[data-complete="1"]` (section 5.5, stage 1c), so no pending build and no `drawPlainSlice` or `drawPlainCar` stand-in. It reads the canvas backing with `getImageData`, not a page screenshot. Every horizontal and vertical run of one colour that touches no canvas edge has a length that is a multiple of `n` canvas pixels. Separately: `data-stretch = k`; `canvas.width === ceil(cssW × devicePixelRatio / k)`; the box size of section 7.1 item 3; computed `image-rendering` is `pixelated`. Guest dots are on the art grid (section 5.5), so the check holds at every crisp level, also below `GUEST_LOD_ZOOM`. |
| `shadows.test.ts` | 2a | The layer is driven alone (`createPixelShadowLayer()` on a `FakeCanvas` context), not through the renderer. `casterOf` for each kind of section 8.4 item 1, with `casterOf('ride', 'carousel', 0).heightPx` = 100 (changes in 5b, section 13.2) and the stall height 66; `casterOf('scenery', 'oak_round', 0)` equals `{ shape: 'ellipse', w: 27, d: 9, heightPx: 0, shift: 10 }`; `casterOf('scenery', 'bed_mixed', 0)` is `null`; `casterOf('scenery', 'fountain_garden', 0)` is a 1 × 1 box with `heightPx` 16 (`heightM` 2 × 8); `casterOf('guest', 'guest', 0)` equals `GUEST_SHADOW`; the mask of `GUEST_SHADOW` covers the columns `cx − 3` to `cx + 4`; an edge item gives a box 1 tile by `EDGE_CASTER_DEPTH`; box shear by height; exactly one `draws` entry with `op === 'multiply'` per frame; walker masks at the anchors of `frame.art.walkers` only; with `f.art` `null` the layer draws nothing; overlap does not darken twice; `SHADOW_MULTIPLY` is `#c9c0cb`. From 2b: the bench gives `BENCH_SHADOW`, whose mask covers the columns `cx − 5` to `cx + 8`; the bin and the lamp give `null`. From 6 and 8 (outline): the show casters; nothing drawn at darkness `NIGHT_SHADOW_OFF` or more. |
| `lint.test.ts` (helper `lint.ts`) | 2a | The 5 lint rules of section 8.6, on surfaces, for every sprite of the batches that the merged stages name in section 12, and no other sprite. From 2b: no ink pixel on the join of two fence segments. From 3: the same for two edge items. |
| `stamp.test.ts` | 2b | Anchor bottom centre; one `fillRect` per run; mirror swaps the `pairs` letters; output uses no transform; a stamped guest on a surface has exactly one ink pixel (its own `o`) between its body and transparency, so no second outline. |
| `props.test.ts` | 2b | In Pixel, `collectPathItems` pushes a path item whose `map.pathItemLevel` is not 0 at the `z` of that elevated path, and a ground item at `surfaceZ`; in Classic both at `surfaceZ` (changes in 5b, section 13.2). The bench, bin, lamp, litter and mess twins draw no in-art shadow. |
| `people.test.ts` | 2b | Guest frames: front, back, two steps, sit differ; a guest with a balloon or an umbrella stays inside `PIXEL_GUEST_ITEM_BOUNDS`; full and notched rings differ by pixels; `drawGuestPixel` and `drawStaffPixel` on a surface paint no pixel below the feet row (no in-art shadow). The stair of walkers is in `grid.test.ts` (`snapWalker`). |
| `mascots.test.ts` | 2b | Stamp sizes of `MASCOT_ART` (Frost 11 × 7, Spark 7 × 8); for `'frost'`, `'spark'` and `'both'` at heights 40, 48, 56 and 96 and dpr 1, 2 and 3, the art at `m = mascotArtScale(...)` fits the box of `mascotCanvas` in width and in height. |
| `pixelArt.test.ts` | 3 | The recorder checks of the Classic art tests, run on the twins of the merged batches, against the Pixel bounds (`rideArtBounds` and `sceneryArtBounds` with `artStyle()` `'pixel'`). |
| `trackSeam.test.ts` | 4a | No ink pixel on a slice's cut line; a rail continuous across two slices, for every piece of `tests/e2e/screenshot.spec.ts:58-66` in 4 directions. |
| `carBounds.test.ts` | 4a | `paintCarPixel` on a surface for all 16 × 24 × 16 poses: no opaque pixel outside `CAR_BOUNDS`. |
| `trackFx.test.ts` | 4a | Pixel chain dashes (`drawChain`), ripples (`drawWater`), spray (`drawSpray`) and the stand-ins (`drawPlainSlice`, `drawPlainCar`) lie on the art grid; chain, ripples and spray change by tick. |
| `preview.test.ts` | 4b | `pixelPreview` sizes; the focus crop holds the sprite centre; `m` for dpr 1, 2, 2.625, 3. |
| `tests/e2e/classicSmoke.spec.ts` | 4c | `?art=classic`: boot and build a carousel with no console errors. Removed in 5b. |
| `decks.test.ts` | 5a | Pixel deck fills in the deck slots; post columns at the deck corners. |
| `ghost.test.ts` | 7 | Ghost pixels are only `q` or `u` slots; check and cross stamps present; invalid ghost hatch; high contrast doubles the dash width; `ditherFill` on a polygon covers the polygon's art pixels at the given density. |

---

## 14. Risks that remain

| # | Risk | Remedy or measure |
|---|---|---|
| 1 | The draft look lives in per-object work. The surface alone gives crisp but plain art. If stages 3 to 6 are cut short, the park stays plain. | Pixel is not the default before stage 4c. The owner reviews each batch. |
| 2 | Phone speed is not measured yet. `k = 2` on the Pixel 7 draws 1.72 times the canvas of today's passing setting. | Stage 0 kill rules 3 and 3a. Fallback `k = 3` has three crisp levels. |
| 3 | Track at any angle: rails do not get the draft's single clean spline; cars about 8 art pixels long get blobby in loops and rolls. | Stage 0 sheet; stage 4a seam test; owner review of the track sheet. |
| 4 | Turning parts shimmer by one pixel per frame. | Stamps on whole pixels, no ink on spokes, 16 distinct angles where 32 look busy (section 8.2). |
| 5 | Rides are smaller than in the drafts on today's footprints (wheel 3 tiles against 4.7). | Owner decision 4. Height can grow. |
| 6 | Much art has no draft: slopes, cliffs, map edge, four terrain types, queues, decks, 15 of 18 rides, 13 of 14 stalls, about 80 scenery items, back views, night. | Each batch has sheets and owner pictures (section 8.6). |
| 7 | The colour map is hand work over about 820 literals plus derived outputs. The miss test finds gaps, not taste. Dark themes can lose separation. | The colour sheet; wider tone steps for dark themes (stage 6). |
| 8 | The shadow layer and the night pass multiply over the frame, so their pixels are not slots. | Accepted. A slot-exact form needs chunk baking, which re-dirties chunks. |
| 9 | Crowds: 7-pixel guests 4 pixels apart in queues can merge into a band of heads and ink. | If the stage 2b pictures show it: queue guests drawn with no side ink. |
| 10 | Stepped zoom jumps 2× between 0.5 and 1 on 1× monitors; on 1.25× screens the home size is 20 % off the draft. | Owner decision 1 accepted it. |
| 11 | Two styles in one code base until stage 5b cost bundle bytes; 39.3 KB is free under `PEAK_LOAD_MAX`. | `bundleSize.test.ts`; the release check at each stage; stage 5b removes Classic. Row 16 gives the measure and the remedy. |
| 12 | Pixel identity across browsers is not guaranteed where an edge passes exactly through a pixel centre. | Golden hashes run in Node only. The e2e test checks runs, not exact pixels. |
| 13 | The canvas box is less than `k` device pixels larger than the viewport, so the right and bottom edges lose less than one canvas pixel. | Accepted. The grid check ignores runs that touch an edge. |
| 14 | Card pictures show at an uneven scale in a flexible box. | Accepted (section 8.5). The canvas content is at a whole scale. |
| 15 | Small mascot heads at device ratio 1 fill only part of their box: Frost at 40 px is 33 × 21 CSS px (section 8.5). | Owner pictures at stage 2b. The owner can ask for a larger box (an interface change). |
| 16 | Twins double the art code until 5b: today's Classic art is about 87 KB of source gzip (section 5.4). | Measure: the initial load and the projection at the end of each stage (section 10.4). Remedy: delete each Classic family early, as soon as its twin merges and the owner approves it (rides at 5a, scenery at 6). Classic then shows that family in pixel art, and the owner is told. |
| 17 | Seams at the soft level: chunk images have transparent corners, and a filtered copy blends them with the sky. | `ground.test.ts`: a soft chunk covers its neighbour's first art pixel; owner picture at zoom 0.25 on desktop 1×. |
| 18 | A view turn rebuilds every visible scenery and stall sprite in one frame. | Measure: the slowest frame after a view turn, phone at 4× throttle (`numbers.json`, then the stage measure). Remedy, if above 100 ms: scenery and stall builds also ask `take()` and draw nothing until built. |
| 19 | Derived outputs (for example `shade(colour, faceLight(…))` with a continuous `f`, `src/render/track/paint.ts:169, 220`) add many map entries until the track twins of stage 4a use `trackSlot`. | The generator reports the count; `bundleSize.test.ts` holds the size. Stage 5b deletes the entries that only Classic track art made. |
| 20 | The budget stand-ins (`drawPlainSlice`, `drawPlainCar`) and the chunk placeholder (`#67b24b`, `src/render/terrain.ts:411`) draw as smooth vectors in another green in Pixel, and budget misses make them more frequent. | Measure: owner pictures during a view turn. Remedy: stage 1c fills the placeholder in the colour of `g2`; stage 4a draws the stand-ins with `artDash` on an art-grid stair. |
| 21 | Text labels drawn into the canvas (cost labels, builder labels, for example `label`, `src/render/track/layer.ts:1029-1031`) are exempt from the art grid (stage 7 decided rule 4). At `k = 2` they are drawn at canvas ratio 1.3125 and stretched × 2 by the browser, so they stay blockier than today on phones above 2×. | Accepted. |
| 22 | The `auto` step down does nothing on 1.25× and 1.5× desktops in Pixel (section 7.1 item 2); today it lowers the canvas ratio to 1. | Measure: the stage measure on a 1.5× desktop profile; accepted unless the desktop p95 passes 20 ms. |
| 23 | The light grid and the art grid must share a phase (`light-fx.md` obstacle 2): the light canvas starts at the canvas corner today, the art grid at `offX`, `offY`. | Remedy: the aligned light canvas of stage 8 decided rule 1. Measure: a pan by one canvas pixel moves no band edge relative to the art (stage 8 "Done when"). |

## 15. Constants

Each row names its file.

| Name | Value | File | Status |
|---|---|---|---|
| `ART_SCALE` | 0.5 image pixel per world pixel | `src/render/pixel/surface.ts` | Fixed |
| `ART_PX_WORLD` | 2 world pixels per art pixel (stamp anchor and run size, section 8.3) | `src/data/tuning/pixel.ts` | Fixed |
| `INK_SLOT` | the index of `i3` (`#2a1a36`) | `src/render/pixel/palette.ts` | Fixed |
| `BAYER4` | `[0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]`, row-major, index `(y & 3) × 4 + (x & 3)`, copied from `BAYER` (`pixel3.py:88`) | `src/render/pixel/surface.ts` | Fixed |
| `SURFACE_PAD` | 2 art pixels | `src/render/pixel/surface.ts` | Fixed |
| `OPAQUE_ALPHA` | 0.995 | `src/data/tuning/pixel.ts` | Fixed. A decision of this spec. Why: the highest alpha below 1 of an `rgba(…)` literal under `src/render/` today is 0.95, a gradient stop of `makeBulbSprite` (`src/render/lighting/sprites.ts:59`; it and `makeGlowSprite` also have stops at alpha 1, `:41`, `:58`), and these stops are not art on a surface; in art the highest is 0.92 (`rockWaterfall`, `src/render/scenery/art/jungle.ts:171`). So every literal below 1 is translucent; 0.995 also treats a computed alpha that misses 1 only by rounding as opaque. |
| `LEVEL_EPS` | 1e-6 | `src/render/pixel/grid.ts` | Fixed |
| `SOFT_LEVEL_GAP` | 1.5 | `src/render/pixel/grid.ts` | Fixed. Why: it reproduces the levels table of the design record §3.2 (no soft level at 1.5× and 3×), where a crisp level of at most 0.333 is already close to 0.25. The design record's text ("where 0.25 is less than one canvas pixel per art pixel") would also give a soft level at 1.5×; this spec follows the table. |
| `HOME_ZOOM_TARGET` | 1 (sections 5.5 `applyPlan` and 7.6) | `src/render/pixel/grid.ts` | Fixed |
| `CAR_SLOPE_MAX` | 2 (the clamp of `snapCar`) | `src/render/pixel/grid.ts` | Fixed. A decision of this spec. Why: it equals the bound of the branch `abs(dx) ≥ abs(dy) / 2` (section 7.7), so the clamp only guards against rounding at the branch edge. |
| `WHEEL_IDLE_RESET_MS` | 300 | `src/data/tuning/pixel.ts` | Fixed. A decision of this spec (section 7.4 rule 1). |
| `PINCH_SETTLE_MS` | 100 | `src/data/tuning/pixel.ts` | Fixed. A decision of this spec (section 7.4 rule 3). |
| `BUILD_BUDGET_MS_DESKTOP` | 4 | `src/data/tuning/pixel.ts` | Provisional; fixed by stage 0: `max(4, ceil(desktop spriteBuildMsMax))` of `numbers.json` (section 10.3) |
| `BUILD_BUDGET_MS_PHONE` | 6 | `src/data/tuning/pixel.ts` | Provisional; fixed by stage 0: `max(6, ceil(phone spriteBuildMsMax))` of `numbers.json` (section 10.3) |
| `RIDE_BUILD_MAX_MS` | 3 (throttled phone) | kill rule only | Fixed (kill rule 4 threshold) |
| `CHUNK_BUILD_MAX_MS` | 12 (throttled phone) | kill rule only | Fixed (kill rule 4 threshold) |
| `TURN_FRAME_MAX_MS` | 100 (throttled phone) | risk 18 only | Fixed (risk 18 threshold). A decision of this spec (section 10.2). |
| `SHADE_STEP` | 1.18 | `src/render/pixel/palette.ts` | Provisional; stage 1a-ii colour sheet |
| `QUEUE_SLOT` | `'n3'` (`export const`; the entry of `#a9c0d2`, `ground.ts` queues and pair 4 of `palette.test.ts` read it, section 5.2) | `src/render/pixel/colourMap.ts` | Provisional; stage 1a-ii colour sheet |
| `CB_MIN_DELTA_E` | 10 | `tests/unit/render/pixel/palette.test.ts` | Fixed. A decision of this spec. Why: a CIE76 distance of 10 is a clear visible step; the four pairs of section 6.6 measure 20 or more under all three matrices with the start palette, so the value catches a palette change that brings a pair close, not today's palette. A failing pair is repaired as section 6.6 says; the threshold does not change. |
| `GRASS_NOISE_SCALES` | [0.42, 1.9] | `src/render/pixel/ground.ts` | Provisional; stage 1c owner pictures |
| `GRASS_BAYER_WEIGHT` | 0.16 | `src/render/pixel/ground.ts` | Provisional; stage 1c owner pictures |
| `GRASS_THRESHOLDS` | [0.30, 0.56] | `src/render/pixel/ground.ts` | Provisional; stage 1c owner pictures |
| `PATH_LIGHT_SLAB_SHARE` | 0.22 | `src/render/pixel/ground.ts` | Provisional; stage 1c owner pictures |
| `PATH_JOINT` | 0.13 tile fraction | `src/render/pixel/ground.ts` | Provisional; stage 1c owner pictures |
| `PATH_EDGE` | 0.11 tile | `src/render/pixel/ground.ts` | Provisional; stage 1c owner pictures |
| `WATER_DASH_SHARES` | `a1` 0.075, `a3` 0.06 | `src/render/pixel/ground.ts` | Provisional; stage 1c owner pictures |
| `BANK_WIDTHS` | `g4` 0.2 tile, `s4` 0.09 tile | `src/render/pixel/ground.ts` | Provisional; stage 1c owner pictures |
| `OUTSIDE_TONE_STEPS` | 2 | `src/render/pixel/ground.ts` | Provisional; stage 1c owner pictures |
| `STRATA_EVERY` | 4 art pixels | `src/render/pixel/ground.ts` | Provisional; stage 1c owner pictures |
| `GROUND_DETAIL_SHARE` | 0.0017 detail anchors per grass art pixel (about 0.43 per tile: the draft places `520 × AREA × 1.6` details over 64 × 64 tiles, `pixel3.py:747`, with `AREA` = 2.13 at 640 × 400 art pixels, `pixel3.py:9`; a tile top is 256 art pixels) | `src/render/pixel/ground.ts` | Provisional; stage 1c owner pictures |
| `GROUND_DETAIL_KINDS` | tuft 0.6, flower 0.25, rock 0.15 (`pixel3.py:28`) | `src/render/pixel/ground.ts` | Provisional; stage 1c owner pictures |
| `SOFT_CHUNK_GROW` | 1 art pixel per tile (the pad is `SURFACE_PAD`) | `src/render/pixel/ground.ts` | Fixed |
| `CYLINDER_LIT_SHARE` | 0.6 | `src/render/pixel/art/shapes.ts` | Provisional; stage 2a side by side |
| `CONE_SEGMENTS` | 16 | `src/render/pixel/art/shapes.ts` | Provisional; stage 2a side by side |
| `SHADOW_TZ` | 40 world pixels of height per tile of shadow | `src/render/pixel/shadows.ts` | Provisional; stage 2a side by side |
| `SHADOW_LEN` | 0.75 | `src/render/pixel/shadows.ts` | Provisional; stage 2a side by side |
| `SHADOW_MULTIPLY` | `#c9c0cb` = `mix(#ffffff, i2, 0.3)`, the draft's orange-theme shadow (`pixel3.py:28, 184`), as a multiply | `src/render/pixel/shadows.ts` | Provisional; stage 2a side by side |
| `GUEST_SHADOW` | `{ shape: 'ellipse', w: 8, d: 3, heightPx: 0, shift: 0 }`, art pixels (`pixel3.py:288`) | `src/render/pixel/shadows.ts` | Provisional; stage 2a side by side |
| `EDGE_CASTER_DEPTH` | 0.1 tile (the depth of the box of an edge item, section 8.4) | `src/render/pixel/shadows.ts` | Provisional; stage 2a side by side |
| `BENCH_SHADOW` | `{ shape: 'rect', w: 14, d: 3, heightPx: 0, shift: 1 }`, art pixels (the draft rectangle, `pixel3.py:309`) | `src/render/pixel/shadows.ts` | Provisional; stage 2b side by side |
| `ROUND_CASTERS` | `oak_round`, `pine_tall`, `birch_silver`, `willow`, `shrub_round`, `shrub_flowering`, `boulder`, each with its pair (`r`, `k`) of section 8.4 item 1; stage 6 adds the round items of each theme | `src/render/pixel/shadows.ts` | Fixed by stage |
| `NIGHT_SHADOW_OFF` | 0.5 darkness | `src/render/pixel/shadows.ts` | Provisional; fixed by the stage 8 owner pictures at dusk and at 22:00 |
| `NIGHT_POOL_BANDS` | 3 | `src/data/tuning/pixel.ts` | Provisional; fixed by the stage 8 owner pictures at dusk and at 22:00 |
| `ORPHAN_MAX_SHARE` | 0.02 | `tests/unit/render/pixel/lint.ts` | Provisional; stage 2a lint |
| `FACE_PAIRS` | the list of section 6.4 check 4 | `tests/unit/render/pixel/colourMap.test.ts` | Grows by batch |
| `PIXEL_GUEST_BOUNDS` | `{ left: −8, right: 8, top: −24, bottom: 6 }` | `src/render/pixel/sprites/people.ts` | Provisional; stage 2b lint |
| `PIXEL_GUEST_ITEM_BOUNDS` | `{ left: −14, right: 14, top: −44, bottom: 6 }` | `src/render/pixel/sprites/people.ts` | Provisional; stage 2b lint |
| `MASCOT_ART` | Frost head 11 × 7, Spark head 7 × 8 art pixels (width × height) | `src/render/pixel/sprites/mascots.ts` | Provisional; stage 2b mascots sheet |
| `MASCOT_GAP` | 2 art pixels | `src/render/pixel/sprites/mascots.ts` | Fixed. A decision of this spec. Why: with a gap of 1, the ink outlines of the two heads are one transparent pixel apart and read as one shape at `m` = 1 or 2; with 2, the art of `'both'` is 20 × 8 art pixels and still fits the `'both'` box (1.9 × the height, section 8.5 item 2). |
| `CARD_ART_W` × `CARD_ART_H` | 84 × 60 art pixels | `src/render/pixel/preview.ts` | Fixed (card preview canvas 168 × 120 CSS px, `src/ui/decks/card.ts:97-98`) |
| `CARD_FOCUS_RAISE` | 0.1 of the sprite height | `src/render/pixel/preview.ts` | Provisional; stage 4b owner pictures |
| `PREVIEW_DPR_MAX` | 3 | `src/render/pixel/preview.ts` | Fixed |
| `SCENERY_PREVIEW_ART` | 48 × 36 art pixels | `src/render/pixel/preview.ts` | Fixed |
| `SHOW_PREVIEW_ART` | 60 × 48 art pixels | `src/render/pixel/preview.ts` | Fixed |
| `PIXEL_CODE_GZIP_LIMIT` | The sum of `PIXEL_CODE_STEP_KB` over the stages in `PIXEL_STAGES_MERGED` (section 10.4 item 6); a hard test | `tests/unit/render/pixel/bundleSize.test.ts` | Follows the steps |
| `PIXEL_CODE_STEP_KB` | Start values in KB of source gzip, from `floor(room × share(S))` with `room = (PEAK_LOAD_MAX − B) / R_GZIP`, `B` = 352.7 KB and `R_GZIP` = 0.6 (room 65.5 KB). The start values hold no colour map term; stage 0 adds `ceil(C_MAP_SRC / 1024)` from stage 1a-ii (section 10.4 item 6). Stage: step (cumulative limit, `share`): 1a-i 9 (9, 0.15); 1a-ii 7 (16, 0.25), where stage 0 sets `step(1a-ii) = ceil(C_MAP_SRC / 1024) + floor(room × 0.25) − floor(room × 0.15)` and every later cumulative limit to `floor(room × share(S)) + ceil(C_MAP_SRC / 1024)` (`C_MAP_SRC` in bytes, section 10.4 item 3; `room` in KB); 1b 3 (19, 0.30); 1c 5 (24, 0.38); 2a 5 (29, 0.45); 2b 7 (36, 0.55); 3 8 (44, 0.68); 4a 8 (52, 0.80); 4b 3 (55, 0.84); 4c 0 (55, 0.84); 5a 2 (57, 0.88); 6 5 (62, 0.95); 7 3 (65, 1.0); 5b 0; 8 0; 9 0. Why 0 from 5b: stage 5b moves no code into the measured files, and the planned pixel code is complete at share 1.0; a stage 8 step is an open point of the stage 8 brief. | `tests/unit/render/pixel/bundleSize.test.ts` | Provisional; fixed by stage 0, which recomputes every step from its measured `B` and `R_GZIP` |
| `PIXEL_STAGES_MERGED` | the stages whose first batch has merged, starting with `['1a-i']` | `tests/unit/render/pixel/bundleSize.test.ts` | Grows by stage |
| `PROJECTION_NEAR` | 8 × 1024 bytes (the band below `PEAK_LOAD_MAX` of section 10.4 item 5 and kill rule 7a) | `numbers.json` and the stage records | Fixed |
| `R_GZIP` | 0.6 (minified gzip ÷ source gzip, measured on the carousel twin) | `numbers.json` | Provisional; stage 0 |
| `K_SMALL` | 2 (a stall, scenery or show-site twin costs `C_guest / K_SMALL`) | `numbers.json` | Provisional; fixed by the first measured stall twin (batch 3.1). Stage 0 cannot measure it: it builds no stall, scenery or show-site twin (section 11.3). |
| `N_STAMP` | 8 (the stamp families of stages 2b to 3, section 10.4 item 3) | `numbers.json` | Fixed |
| `T_TRACK` | 13 KB of minified gzip (the track twins; derivation in section 10.4 item 3) | `numbers.json` | Provisional; fixed by the stage 4a measure |
| `T_REST` | 8 KB of minified gzip (`pixel/art/kit.ts`, `pixel/preview.ts`, the gate twin, `pixel/overlay.ts`; derivation in section 10.4 item 3) | `numbers.json` | Provisional; fixed by the stage 2a, 4b, 5a and 7 measures |
| `PEAK_LOAD_MAX` | 392 × 1024 bytes (the initial load at the end of each stage, and the projection of section 10.4 item 3). Why: an 8 KB margin under `INITIAL_LOAD_BUDGET_BYTES` for the projection error. | `numbers.json` and the stage records | Fixed |
| `INITIAL_LOAD_BUDGET_BYTES` | 400 × 1024 | `scripts/check-release.ts` | Fixed (master §10) |
| `ART_STYLE_AUTO` | `'classic'`, then `'pixel'` in stage 4c after the owner's yes | `src/render/pixel/style.ts` | Fixed by stage |
| `SETTINGS_VERSION` | 3 (stage 1c), 4 (stage 5b) | `src/settings/schema.ts` | Fixed by stage |

## 16. Done when

The depth rule of section 12 holds for this list: the plan-ready stages (0, 1a-i, 1a-ii, 1b, 1c, 2a, 2b) were planned from this spec; each outline stage (3 to 9) was planned from this spec and its approved stage brief, which decided every point of the stage's list "Open until the stage brief".

- [ ] The owner said yes to the stage 0 pictures before stage 1a-i started.
- [ ] A stage brief was written, reviewed and approved before the plan of each of the stages 3, 4a, 4b, 4c, 5a, 5b, 6, 7, 8 and 9.
- [ ] Every world object, the ground, the shadows, the track and cars, the overlays and ghosts, the night, weather and shows draw in pixel art from the palette of section 6, with the ink outline.
- [ ] At every crisp level on desktop 1280 × 800 and phone 412 × 839, `pixelGrid.spec.ts` passes.
- [ ] Zoom steps by levels; a pinch settles; the soft level exists where section 7.2 says; the game starts at the home level.
- [ ] Card, scenery picker and show picker pictures are crops of the pixel park; the mascot heads are pixel art in all five places.
- [ ] The simulation is unchanged: no file under `src/sim/` changed, and the state hash test passes.
- [ ] No image file is tracked except the files that `RASTER_ALLOWED` allows (`public/icons/icon-<n>.png`, `docs/screenshots/<name>.png`; section 8.6 item 1). At the end of every stage, the initial-load check (item 2) and the originality check (item 7) of `node scripts/check-release.ts --no-build` pass, with the initial load at most `PEAK_LOAD_MAX`. At stage 9, the whole release check passes for Build 5 (`RELEASE_VERSION` `'5.0.0'`).
- [ ] No new runtime or dev dependency.
- [ ] Classic is removed; settings version 4 reads documents of versions 1, 2 and 3.
- [ ] All unit, integration and e2e tests pass on desktop and phone. CI is green. Each changed test is in section 13.2 with its reason.
- [ ] The frame budgets of Phase 6 §4.6 pass in the `TC_PERF=1` runs, recorded in `docs/adr/0001-renderer.md`.
- [ ] The master spec build table has a Build 5 row, and master §2.5 gives the pixel guest size. `docs/screenshots/` holds new pictures taken at the home level.
- [ ] The owner has looked at screenshots of the real game at 1280 × 800 and 412 × 839 and has accepted them.
