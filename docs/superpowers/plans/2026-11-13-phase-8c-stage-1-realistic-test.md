# Phase 8c Stage 1: Realistic Art Test Inside the Game — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the realistic look (pre-rendered 3D pictures) inside the real game behind `?art=real`, on the three speed-test parks plus a coaster park, and measure the stage 1 kill rules S1–S8 on real phones.

**Architecture:** A build-time bake (`tools/art3d/`, three.js in headless Chromium) writes WebP sheets, tint masks and one `index.json`. At play time a set manager decodes only the sets the view needs (built item kinds, current density, current turn, the ahead turn, on-screen objects) under a 128 MB budget. A `RealLook` object turns world objects into `Sprite`s that the existing renderer draws through its existing depth list; anything not baked falls back to today's art. Today's look is untouched when the switch is off.

**Tech Stack:** TypeScript strict, Vite 8, Canvas 2D, Vitest, Playwright (bake + e2e), three.js 0.160.0 (vendored build tool only).

**Spec:** `docs/superpowers/specs/thrills-and-chills/phase-8c-realistic-art.md` (approved 2026-11-13, F1–F10 as proposed). Evidence: `docs/research/art/realistic/` and `docs/research/art/realistic/phone-test/results-owner-phone-1..4.md`.

## Global Constraints

- Work on branch `phase8c-stage1` cut from `ccr-6f420895-3xt45j`; never merged until the owner gate (spec §6).
- Today's look must not change (S6): with the switch off, every recorder test and the classic-ops golden file stay byte-identical.
- The website build must not change (S7): no `art/` folder in `dist`, initial load growth ≤ 2 KB gzip, service-worker rules unchanged. All realistic-look code loads through `import()` only when `artStyle() === 'real'`.
- three.js is a vendored build tool in `tools/art3d/vendor/` with its MIT licence. It must not appear in any `src/` import or any `dist` file.
- No downloaded models, textures, HDR images or fonts. No AI image tools (8b D2). Never imitate an existing game's look.
- Baked art is never committed (release-check raster rule stays as is). It is built into `dist-art/real/` (git-ignored) and copied into the realistic build only.
- Projection: tile 2:1 diamond, `TILE_W` 64 px for `TILE_M` 4 m → 11.3 px per metre horizontal at game zoom 1. Realistic look height scale 9.8 px per metre (F3); today's look keeps `STEP_PX` 8.
- Densities (F1): 2 and 4 times game zoom-1 world pixels (22.6 and 45.2 px per metre). Pick the smallest density ≥ `zoom × dpr`, else 4.
- Decode budget (F2): 128 MB, phones and tablets alike (F5). It covers decoded sheets, tinted sheets and realistic ground chunks.
- Ahead set: the turn the Turn button goes to (`(rot + 1) % 4`) only (F4).
- Guests (F6, stage 1 subset per spec §6): 2 body types × 4 outfits, shirt tinted from the game's 12 shirt colours. Facings: 4, because the game moves guests in 4 directions (spec §5.3 lists 8 as the upper bound; record this in the stage 1 report).
- Cars baked full and empty (F7). Night as a grade plus baked lights (F8) is out of stage 1 scope.
- The realistic build shares the website origin: it prefixes every `localStorage` key with `tcreal:` and never reads or writes an unprefixed `tc.*` key.
- All player-visible text comes from `src/data/strings/`.

## Review Focus

1. A park with items the stage 1 bake does not cover (for example `drop_tower`, `mirror_maze`, a wooden coaster): each must draw as its fallback (baked nearest item, or today's art), never invisible, and the bench report lists every fallback used. → Task 7 test `falls back for unbaked items`.
2. Two turns tapped quickly, the second before the ahead set is decoded: the view must end on the right turn, with no set stuck in "loading" and the budget respected. → Task 5 test `double turn before ahead ready`.
3. Zooming across a density boundary while sets decode: a set drawn in this frame or the frame before must never be freed. → Task 5 test `never frees a set used this or last frame`.
4. A missing or corrupt sheet file: report it once, draw the object in today's art, keep the game running. → Task 5 test `decode failure marks set failed` and Task 7 test `failed set uses classic art`.
5. Placing an item whose set is not decoded yet: the placement ghost still shows (today's ghost art) and the place command still works. → Task 8 test `ghost falls back while set decodes`.

---

### Task 1: Art switch and per-look height scale

**Files:**
- Create: `src/render/artStyle.ts`
- Modify: `src/render/iso.ts:10` (`STEP_PX`), `src/render/track/project.ts:17` (`PX_Z`), `src/audio/mix.ts:16` (local copy)
- Test: `tests/unit/render/artStyle.test.ts`, `tests/unit/render/iso-step.test.ts`

**Interfaces:**
- Produces: `type ArtStyle = 'classic' | 'real'`; `artStyle(search?: string, env?: string): ArtStyle` (env from `import.meta.env.VITE_ART`; `?art=real` wins over env; anything else is `'classic'`); `export let STEP_PX: number` (default 8) and `setStepPx(px: number): void` in `iso.ts`; `REAL_STEP_PX = 9.8` exported from `artStyle.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// artStyle.test.ts
it('defaults to classic', () => expect(artStyle('', undefined)).toBe('classic'));
it('reads ?art=real', () => expect(artStyle('?art=real', undefined)).toBe('real'));
it('reads VITE_ART', () => expect(artStyle('', 'real')).toBe('real'));
it('rejects unknown values', () => expect(artStyle('?art=pixel', 'pixel')).toBe('classic'));
// iso-step.test.ts
it('classic step is 8', () => expect(tileToScreen(0, 0, 1).sy).toBe(-8));
it('setStepPx changes every projection', () => {
  setStepPx(9.8);
  expect(tileToScreen(0, 0, 1).sy).toBeCloseTo(-9.8);
  expect(isoY(0, 0, 1)).toBeCloseTo(-9.8);          // track/project.ts
  setStepPx(8);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/render/artStyle.test.ts tests/unit/render/iso-step.test.ts` — Expected: FAIL (module missing, `setStepPx` missing).

- [ ] **Step 3: Implement**

Make `STEP_PX` a live `export let`. Replace the module-load copies (`PX_Z` in `track/project.ts`, the local `STEP_PX` in `audio/mix.ts`) with reads of the live binding. No other call site changes.

- [ ] **Step 4: Run the new tests and the full unit suite**

Run: `npm test` — Expected: all pass (classic results unchanged).

- [ ] **Step 5: Commit** — `git commit -m "Art switch and per-look height step"`

---

### Task 2: Classic-ops guard (S6)

**Files:**
- Create: `tests/unit/render/real/classicOps.test.ts`, `tests/unit/render/real/classic-ops.json` (golden file)
- Uses: `tests/unit/render/content/recorder.ts` (`Recorder`)

**Interfaces:**
- Produces: a golden file of SHA-256 hashes of the recorded op lists for: rides `carousel`, `big_wheel`, `swing_tower`, `teacup_twirl` (4 rotations, frame 0); stall `snack_shack` (4 rotations); scenery `oak_round`, `pine_tall`, `birch_silver`, `willow`, `shrub_round`, `boulder`, `lamp_globe`, `bunting_pole`; guest frames for all 12 shirt colours, walk 0–3, facing 0–3.

- [ ] **Step 1:** Write the test: it computes the hashes and compares them with `classic-ops.json`; with `TC_WRITE_CLASSIC_OPS=1` it writes the file instead.
- [ ] **Step 2:** Generate the golden file **on the base commit** (`git stash; TC_WRITE_CLASSIC_OPS=1 npx vitest run tests/unit/render/real/classicOps.test.ts; git stash pop`) — Expected: file written.
- [ ] **Step 3:** Run without the variable — Expected: PASS on top of Task 1 (Task 1 must not change classic art).
- [ ] **Step 4: Commit** — `git commit -m "Classic-ops guard for today's look"`

---

### Task 3: The kit in `tools/art3d/` and the bake camera

**Files:**
- Create: `tools/art3d/` (moved from `docs/research/art/realistic/tools/`: `kit.js`, `rides.js`, `people.js`, `textures.js`, `post.js`, `vendor/three-0.160.0.module.min.js` + `LICENSE`), `tools/art3d/camera.ts`, `tools/art3d/catalog.ts`
- Modify: `tsconfig.json` `include` (add `tools/art3d/*.ts`), `.gitignore` (add `dist-art/`)
- Test: `tests/unit/art3d/camera.test.ts`, `tests/unit/art3d/catalog.test.ts`

**Interfaces:**
- Produces:
  - `bakeCamera(rot: 0|1|2|3, density: 2|4): { pxPerMetre: number; project(xM: number, yM: number, zM: number): { sx: number; sy: number } }` — orthographic, yaw 45° + 90°·rot, pitch 30°.
  - `itemSpec(kind: 'ride'|'stall'|'scenery', id: string): { footprintTiles: [number, number]; heightM: number }` read from `src/data/catalog/`.
  - `contentHash(files: string[]): string` (SHA-256 of the kit modules an item uses).
- The research copy stays where it is (it documents rounds 6–7); `tools/art3d/` is the one the bake uses.

- [ ] **Step 1: Write the failing tests**

```ts
it('matches the game projection at density 2', () => {
  const cam = bakeCamera(0, 2);
  const g = tileToScreenReal(3, 5, 2);           // tileToScreen with REAL_STEP_PX, ×2
  const p = cam.project(3 * 4, 5 * 4, 2);        // metres
  expect(p.sx).toBeCloseTo(g.sx, 3); expect(p.sy).toBeCloseTo(g.sy, 3);
});
it('pxPerMetre is 22.6 and 45.2', () => {
  expect(bakeCamera(0, 2).pxPerMetre).toBeCloseTo(22.63, 1);
  expect(bakeCamera(0, 4).pxPerMetre).toBeCloseTo(45.25, 1);
});
it('turn 1 maps like viewTileSX/SY for rotation 1', () => { /* same check against src/render/view.ts */ });
it('reads catalogue footprints', () => expect(itemSpec('ride', 'carousel').footprintTiles).toEqual([3, 3]));
```

- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement. `tileToScreenReal` is a test helper (tileToScreen with the step set to 9.8 and scaled by density). The kit's scene scale changes from round 6's 3 m tiles to the game's 4 m tiles.
- [ ] **Step 4:** Run `npm test` and `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "art3d kit and bake camera matched to the game projection"`

---

### Task 4: Index format and validator

**Files:**
- Create: `src/render/real/indexFormat.ts`, `tools/art3d/checkIndex.ts`
- Test: `tests/unit/render/real/indexFormat.test.ts` (with a small hand-written fixture `tests/fixtures/real-index.json`)

**Interfaces:**
- Produces (shared by the bake and the game):

```ts
export type SetKey = string;                                   // `${kind}:${item}:d${density}:r${rot|'all'}`
export interface RealFrame { sheet: string; sx: number; sy: number; w: number; h: number; ox: number; oy: number }
export interface RealSetEntry { key: SetKey; kind: RealKind; item: string; density: 2 | 4; rot: 0|1|2|3|'all';
  sheets: { file: string; w: number; h: number; mask?: string }[]; frames: Record<string, RealFrame> }
export type RealKind = 'ground' | 'shadow' | 'ride' | 'stall' | 'scenery' | 'guest' | 'rail' | 'support' | 'car' | 'facade';
export interface RealIndex { format: 'real/1'; pxPerMetreZoom1: 11.31; stepPxPerMetre: 9.8; densities: [2, 4];
  sets: RealSetEntry[]; bytes: { compressed: number; decodedByDensity: Record<'2'|'4', number> } }
export function setKey(kind: RealKind, item: string, density: 2|4, rot: 0|1|2|3|'all'): SetKey;
export function frameKey(parts: (string | number)[]): string;  // e.g. ['carousel', 'f7', 'occ2']
```

  - `checkIndex(index: RealIndex, files: Set<string>): string[]` returns problems: unknown file, file not in index, sheet over 2048 px, frame outside its sheet, `ox/oy` not finite, a `mask` with different size from its sheet, a ride/stall/scenery/car set missing for any rotation (unless `rot: 'all'`).
- Frame `ox`, `oy`: offset from the object's game anchor (the screen point `tileToScreen` gives for the same world point today's sprite uses) to the frame's top-left, in density pixels. This keeps `blit`/`blitColumn` in `renderer.ts:338,350` working unchanged.

- [ ] **Step 1:** Tests: the fixture validates clean; each listed problem is detected by a mutated copy (one assertion per problem).
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS.
- [ ] **Step 5: Commit** — `git commit -m "Realistic art index format and validator"`

---

### Task 5: Set manager

**Files:**
- Create: `src/render/real/setManager.ts`
- Test: `tests/unit/render/real/setManager.test.ts`

**Interfaces:**
- Consumes: `RealIndex`, `SetKey` (Task 4).
- Produces:

```ts
export interface Decoded { image: CanvasImageSource; bytes: number; close(): void }
export interface SetIO { read(file: string): Promise<Blob>; decode(blob: Blob): Promise<Decoded> }
export type SetState = 'none' | 'loading' | 'ready' | 'failed';
export class SetManager {
  constructor(index: RealIndex, io: SetIO, budgetBytes: number /* 128 * 2**20 */, onError: (key: SetKey, err: unknown) => void);
  beginFrame(frame: number): void;
  want(keys: SetKey[], priority: 'now' | 'ahead'): void;   // queue decodes
  use(key: SetKey): RealSetEntry & { images: CanvasImageSource[] } | null;  // null unless ready; marks used this frame
  state(key: SetKey): SetState;
  residentBytes(): number; peakBytes(): number;
  densityCap(): 2 | 4;                                      // 2 once the budget forced density 2 everywhere
  endFrame(): void;                                         // frees unwanted sets, enforces the budget
}
```

- Budget order when over 128 MB (spec §5.4 item 4): free `ahead` sets first, then density-4 sets of objects outside the view, then ask the caller (via `densityCap(): 2|4`) to draw density 2 everywhere. Never free a set used in this frame or the frame before.
- `read` blobs are cached in memory (compressed) once read (result 3 lesson); in the app they are local files.
- At most 2 decodes in flight; `now` before `ahead`.

- [ ] **Step 1: Write the failing tests** (fake `SetIO` with controllable promises, `bytes` per sheet fixed):
  - `decodes a wanted set and reports ready`
  - `ahead set decodes after now sets`
  - `turn is instant when the ahead set is ready` (after `want([r1], 'now')` the set is `ready` in the same frame)
  - `double turn before ahead ready` (want r1 then r2 quickly → r2 ends ready, r1 freed, no set left `loading` after the promises settle, peak ≤ budget)
  - `never frees a set used this or last frame` (budget pressure while a set was `use`d last frame → still ready)
  - `over budget: frees ahead first, then caps density to 2`
  - `decode failure marks set failed` (rejected decode → `failed`, reported once via `onError`, never retried in the same session)
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS.
- [ ] **Step 5: Commit** — `git commit -m "Realistic art set manager with 128 MB budget and ahead set"`

---

### Task 6: Tint masks

**Files:**
- Create: `src/render/real/tint.ts`
- Test: `tests/unit/render/real/tint.test.ts`

**Interfaces:**
- Produces: `tintPixels(base: Uint8ClampedArray, mask: Uint8ClampedArray, rgb: [number, number, number]): Uint8ClampedArray` (mask red channel = strength 0–255; result = base luminance × rgb, mixed by strength; alpha from base); `tintSheet(base: Decoded, mask: Decoded, rgb, make: (w, h) => Canvas): Decoded` (counted in the set manager budget under key `${setKey}#${hex}`).

- [ ] **Step 1:** Tests: strength 0 leaves pixels unchanged; strength 255 on mid-grey gives rgb × 0.5 luminance (±1); alpha unchanged; result length equals input.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** — `git commit -m "Tint masks for shirts and ride colours"`

---

### Task 7: RealLook — world objects to sprites

**Files:**
- Create: `src/render/real/look.ts`, `src/render/real/fallbacks.ts`
- Test: `tests/unit/render/real/look.test.ts`

**Interfaces:**
- Consumes: `SetManager` (Task 5), `tintSheet` (Task 6), `Sprite` (`src/render/types.ts`), `RealIndex`.
- Produces:

```ts
export interface RealLook {
  density(zoom: number, dpr: number): 2 | 4;                     // F1 rule, capped by SetManager.densityCap()
  prepare(world: World, rot: ViewRotation, view: ViewRect, zoom: number, dpr: number): void;  // wants sets for built kinds + on-screen objects + ahead turn
  ride(defId: string, rot: ViewRotation, frame: number, occupancy: number): Sprite | null;
  stall(defId: string, rot: ViewRotation): Sprite | null;
  scenery(defId: string, rot: ViewRotation, frame: number): Sprite | null;
  guest(guestId: number, shirt: number, walk: number, facing: number, sitting: boolean): Sprite | null;
  staff(staffType: string, facing: number, walk: number): Sprite | null;
  rail(trackType: string, pieceId: string, tile: number, rot: ViewRotation, colour: number): Sprite | null;
  car(trackType: string, yawStep: number, pitchStep: number, rollStep: number, full: boolean, colour: number): Sprite | null;
  shadow(kind: 'ride' | 'stall' | 'scenery', defId: string, rot: ViewRotation): Sprite | null;
  groundPiece(terrain: string, slopeMask: number, variant: number, rot: ViewRotation): Sprite | null;
  incomplete(): number;                                            // objects skipped this frame (set not ready)
  fallbacksUsed(): string[];
}
export function createRealLook(index: RealIndex, sets: SetManager): RealLook;
```

- `fallbacks.ts`: `REAL_FALLBACK: Record<string, string | 'classic'>` — stage 1 bakes `carousel`, `swing_tower`, `big_wheel` (rides), `snack_shack` (stall), `oak_round`, `pine_tall`, `birch_silver`, `willow`, `shrub_round`, `boulder`, `lamp_globe`, `bunting_pole`, bench, bin (scenery/path items), `steel_coaster` (track). Mapped: `teacup_twirl → carousel`, `fizz_stand`/`restrooms`/`balloon_stand → snack_shack`, `mini_railway → steel_coaster`; every other id → `'classic'`.
- A `null` return means "set not ready": the renderer skips the object this frame and `incomplete()` counts it. A `'classic'` fallback or a `failed` set returns `undefined`, which tells the renderer to draw today's art.
- Guest body/outfit: `guestId % 2` body, `(guestId >> 1) % 4` outfit; shirt tinted by the game's shirt index.
- Car poses are quantised: yaw 32 steps, pitch and roll 15° steps (same quantisation as the bake, Task 9).

- [ ] **Step 1: Write the failing tests** (fake index + fake SetManager):
  - `returns a sprite with scale = density and anchor offsets from the frame`
  - `returns null and counts incomplete while the set loads`
  - `falls back for unbaked items` (`drop_tower` → `undefined`, listed in `fallbacksUsed()`; `teacup_twirl` → carousel sprite)
  - `failed set uses classic art` (returns `undefined`)
  - `prepare wants only built kinds, the current turn and the ahead turn`
  - `density rule` (zoom 1 dpr 2 → 2; zoom 2 dpr 2.625 → 4; cap 2 → 2)
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** — `git commit -m "RealLook maps world objects to baked sprites"`

---

### Task 8: Renderer integration, shadows, ground and start-up

**Files:**
- Modify: `src/render/renderer.ts:265` (`createCanvasRenderer(canvas, opts?: { look?: RealLook })`), its `drawList` cases (ride 3, stall 4, guest 5, staff 6), a shadow pass after `drawStatic`/ground and before `list.sort()`; `src/render/scenery/layer.ts:137` and `src/render/track/layer.ts:650` (accept the look through `LayerFrame` as optional `look?: RealLook`); `src/main.ts:21` (when `artStyle() === 'real'`: `setStepPx(REAL_STEP_PX)`, install the `tcreal:` storage prefix, `import('./render/real/boot')`, then create the renderer with the look)
- Create: `src/render/real/ground.ts` (`RealGround`: lays ground pieces into 8 × 8 tile chunk canvases, under `FIRST_BUILD_BUDGET_MS`), `src/render/real/boot.ts` (fetches `art/real/index.json`, builds `SetManager` with `createImageBitmap` IO and `RealLook`), `src/render/real/storagePrefix.ts`
- Modify: `src/perf/stats.ts` (add `incompleteFrames` and `realResidentMB`, `realPeakMB` to the perf probe)
- Test: `tests/unit/render/real/renderer-real.test.ts` (uses `tests/unit/render/fakeCanvas.ts`), `tests/unit/render/real/storagePrefix.test.ts`

**Interfaces:**
- Consumes: `RealLook` (Task 7), `artStyle`, `setStepPx`, `REAL_STEP_PX` (Task 1).
- Produces: `installStoragePrefix(storage: Storage, prefix: 'tcreal:'): void` (proxies `getItem/setItem/removeItem/key/length/clear` so only prefixed keys are visible; `clear` removes only prefixed keys — copy the tested approach of `phase8b-stage0b-proto` commit `5b09d2c`, including the original `length` getter to avoid recursion).
- The renderer rule per object: `sprite = look ? look.x(...) : undefined`; `undefined` → today's `bank.x(...)`; `null` → skip and count; a `Sprite` → `blit`/`blitColumn` as today.

- [ ] **Step 1: Write the failing tests**
  - `without a look the draw calls are identical` (draw-call log of a test world with and without passing `{}` equals)
  - `draws the real sprite when ready` (fake look returns a sprite with a known image → that image is drawn at the anchor)
  - `skips and counts when not ready`
  - `draws shadows before objects` (call order)
  - `ghost falls back while set decodes` (placement ghost of `carousel` with look returning `null` → today's ghost sprite drawn)
  - `storage prefix hides and protects unprefixed keys` (fake real save `tc.save.1` survives `clear()`; the game sees only `tcreal:` keys)
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run `npm test`, `npx tsc --noEmit`, `npm run build`, then `npx tsx scripts/check-release.ts` — Expected: all pass; website `dist` has no `art/`; initial load growth ≤ 2 KB gzip against the base commit (record both numbers in the commit message).
- [ ] **Step 5: Commit** — `git commit -m "Realistic look in the renderer behind ?art=real"`

---

### Task 9: The stage 1 bake

**Files:**
- Create: `tools/art3d/bake.mjs` (Node + Playwright driver), `tools/art3d/bake.html`, `tools/art3d/bakePage.ts` (in-browser bake), `tools/art3d/items/` (one module per stage 1 item: ground, guests, `carousel`, `swing_tower`, `big_wheel`, `snack_shack`, 10 scenery/path items, `steel_coaster` rails/supports/cars, one facade piece set), `tools/art3d/poses.ts`
- Test: `tests/unit/art3d/poses.test.ts`; verification by running the bake and `checkIndex`

**Interfaces:**
- Consumes: `bakeCamera`, `itemSpec`, `contentHash` (Task 3); `RealIndex`, `checkIndex` (Task 4).
- Produces: `node tools/art3d/bake.mjs --out dist-art/real [--only <item>] [--density 2|4]` writes WebP sheets (quality 85, ≤ 2048 px), masks, and `index.json`; prints counts, compressed MB, decoded MB per density, and seconds; reuses unchanged items from `dist-art/cache/` keyed by `contentHash` (S8).
- `reachedPoses(trackType: string, pieceIds: string[]): { yaw: number; pitch: number; roll: number }[]` in `poses.ts`: walks `pieceWorldSamples` (`src/sim/rides/track/api.ts:308`) for each piece and returns the unique quantised poses (yaw 32 steps, pitch/roll 15°).
- Content per spec §5.3 and §6: ground (grass with 4 variants, 16 slope shapes, cliff faces per height step, water, path and queue joins), soft shadows per object and turn, guests (2 bodies × 4 outfits × 4 facings × 8 walk frames + sit, with shirt masks), `carousel` 16 frames over 72° (`rot: 'all'`), `swing_tower` and `big_wheel` frames following the phone coarse set in `src/render/anim.ts`, occupancy 0/full; rails per piece × tile × turn, supports per 1 m step, cars per reached pose full/empty with car-body masks.
- Large objects are cut into depth columns like `footprintColumns` (`src/render/depth.ts:88`) so `blitColumn` sorts them.

- [ ] **Step 1:** Test `reachedPoses` on a two-piece fixture layout (flat + 25° up): expected unique poses listed exactly.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5:** Run `node tools/art3d/bake.mjs --out dist-art/real --only carousel`, then `npx tsx tools/art3d/checkIndex.ts dist-art/real` — Expected: 0 problems. Then the full bake — Expected: 0 problems; print and keep the size report.
- [ ] **Step 6:** Look at one sheet per kind with Read (guests at density 4, carousel, coaster) and fix floating or clipped pictures.
- [ ] **Step 7: Commit** (code only) — `git commit -m "Stage 1 bake: ground, guests, 3 rides, stall, scenery, steel coaster"`

---

### Task 10: Coaster test park

**Files:**
- Modify: `tests/perf/sceneInfo.ts` (add `coaster`), `tests/perf/scenes.ts` (`buildPerfScene('coaster')`)
- Create: `tests/perf/coaster-600-guests.tcsave.json` (generated with `TC_WRITE_SCENES=1 npx vitest run tests/unit/perf/scenes.test.ts`)

**Interfaces:**
- Produces: scene `coaster`: 64 × 64 map, one `steel_coaster` with station, lift, 25 m drop, two curves, supports at several heights, 2 trains × 4 cars; one `carousel`, one `snack_shack`, 20 scenery items, 600 guests, focus on the coaster.

- [ ] **Step 1:** Extend `tests/unit/perf/scenes.test.ts`: the `coaster` scene loads, the coaster can open (`canOpenTrackRide` returns `null`), guest count is 600.
- [ ] **Step 2–4:** Run (FAIL), implement and generate, run (PASS).
- [ ] **Step 5: Commit** — `git commit -m "Coaster perf scene for stage 1"`

---

### Task 11: Bench runner and results card

**Files:**
- Create: `src/perf/realBench.ts`, `src/perf/realBenchCard.ts`, strings in `src/data/strings/en.ts` (keys under `ui.realBench.*`)
- Modify: `src/main.ts` (when `?bench=1` and `artStyle() === 'real'`, show a "Run benchmark" button)
- Test: `tests/unit/perf/realBench.test.ts` (sequence and result shape with fake game and fake clock), `tests/e2e/real-bench.spec.ts` (headless smoke: the card appears, no console errors; numbers not asserted)

**Interfaces:**
- Consumes: `Game.setWorld` (`src/game.ts:44`), `deserialize` (`src/save/index.ts:46`), the perf probe fields (Task 8).
- Produces: `runRealBench(game: Game, scenes: { id: string; json: string }[], clock: () => number): Promise<RealBenchResult>`; the four scene saves are loaded with `import()` only in bench mode, never through `localStorage`.
- Sequence per scene: 5 s warm-up; 10 s pan; zoom 2 → 1 → 0.5 → 2; 4 turns with the Turn action, 1 s apart; 20 scenery placements through `game.dispatch` along a path edge; 5 s idle.
- `RealBenchResult` holds per scene: frame p50/p95/p99 and frames > 33 ms, work p95, incomplete frames, peak and end `realResidentMB`, turn times (ms from the Turn action to the first frame drawn at the new rotation with `incomplete() === 0`), placement longest frame; plus start time (navigation start to the first complete frame, S4), device ratio, canvas size, user agent, fallbacks used, and an S1–S5 band per row with the spec's limits.
- The card copies text plus JSON (clipboard in the click handler, select-text fallback), as the phone test did.

- [ ] **Step 1:** Unit test: with a fake game and clock, the result has one row per scene, 4 turn times per scene, and bands computed from the spec limits (S1 33 ms, S2 128 MB, S3 250/500 ms, S4 4 s).
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS); run the e2e smoke with `npm run e2e -- tests/e2e/real-bench.spec.ts` after a local bake.
- [ ] **Step 5: Commit** — `git commit -m "Stage 1 benchmark runner and results card"`

---

### Task 12: Deploy at `/real-game/` and the owner gate report

**Files:**
- Modify: `.github/workflows/deploy.yml` (check out `phase8c-stage1` into `real-game-src`; `actions/cache` for `dist-art/cache` keyed by `hashFiles('tools/art3d/**')`; `npx playwright install --with-deps chromium`; `node tools/art3d/bake.mjs --out dist-art/real`; `VITE_ART=real npx vite build --outDir ../dist/real-game`; copy `dist-art/real` to `dist/real-game/art/real/`). Keep the existing steps.
- Create: `docs/superpowers/specs/thrills-and-chills/phase-8c-stage-1-report.md` (template: per phone a table of S1–S8 with value and band, fallbacks used, bake time cold and warm, app-size projection from the bake report, what was not tested)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1:** Push the branch and run the deploy (`run_workflow`, `deploy.yml`, ref `ccr-6f420895-3xt45j`) — Expected: success; the main site and `/real-test/` unchanged; `/real-game/?art=real&bench=1` serves the bench.
- [ ] **Step 2:** Record bake time cold (first run) and warm (second run with no kit change) from the job log against S8 (60 min warm, 4 h cold).
- [ ] **Step 3:** Run the bench headless once (code check only) and fill the report's "headless" row, labelled not representative.
- [ ] **Step 4:** Ask the owner to run the bench on their phone, an older Android and an iPhone, paste the results, and play the parks. Fill the report from their results.
- [ ] **Step 5: Commit** the report — `git commit -m "Phase 8c stage 1 report"` — and present the S1–S8 table at the owner gate. The full build starts only after the owner says yes.
