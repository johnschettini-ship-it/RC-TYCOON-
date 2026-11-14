# Phase 8c full build (realistic look): batch 0 plan and batch roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bake every game item in the realistic look, inside the 128 MB picture budget, in owner-approved batches.

**Architecture:** The stage 1 pipeline stays: 3D models in code (`tools/art3d/`), baked to WebP sets in CI, drawn by `RealLook` through the `SetManager` budget. Batch 0 fixes the two conditions of the owner's GO (all picture memory inside 128 MB; older Android and iPhone tested) and prepares the pipeline for about 150 items. Batches 1 to 8 then add items kind by kind. Each batch gets its own short plan (written with superpowers:writing-plans when it starts) and an owner side-by-side approval (D9).

**Tech Stack:** TypeScript strict, Vite 8, Canvas 2D, Vitest 5, Playwright 1.63, three.js 0.160 (vendored build tool), GitHub Actions + Pages.

**Spec:** `docs/superpowers/specs/thrills-and-chills/phase-8c-realistic-art.md` (F1–F10), evidence `phase-8c-stage-1-report.md` and `phase-8c-stage-1-evidence/owner-phone-1..3*.md`.

**Owner decision:** "Go, start the full build" (2026-11-14), on the conditions given with the recommendation: memory first, older Android and iPhone early.

## Global Constraints

- Branch: `phase8c-full`, cut from `phase8c-stage1` at `a499614`. Task branches `fb-tN` in worktrees `/home/user/tc-fb-*`; the controller merges. No merge to `main` without the owner's request.
- The website build stays byte-identical: every realistic path behind compile-time `import.meta.env.VITE_ART === 'real'`. `initialLoadBytes` growth ≤ 2,048 B over base 374,662 B.
- Today's look unchanged: `tests/unit/render/real/classicOps.test.ts` golden passes untouched.
- Realistic build storage keys use the `tcreal:` prefix only; never read or write unprefixed `tc.*`.
- Decode budget F2: **128 MB for ALL picture memory** (spec §5.4 item 4: sets, tinted sheets, chunk images and the static layer). Today's terrain and today's sprites count too.
- Kill rules: S1 frame p95 ≤ 33 ms; S2 ≤ 128 MB (all picture memory, from Task 2 on); S3 turn ≤ 250 ms (Turn button direction) / ≤ 500 ms (other); S4 start ≤ 4 s; S5 app art ≤ 150 MB; S6g longest gap ≤ 500 ms; S8 bake ≤ 60 min warm / 4 h cold.
- Art rules: models, textures and lights made by code only; no downloaded models, textures, HDRIs, or AI images; must not copy any existing game's look or names.
- Baked art is never committed. CI bakes it.
- Phones draw at most render ratio 2 (`PHONE_MAX_RENDER_SCALE`).
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01Q5pHggx1eLkEH7W16KJFwP`.
- Gate per task: `npx tsc --noEmit`, `npx vitest run`, `VITE_ART=real npx vite build`, website `npx vite build` byte check.

## Review Focus

1. **Zoom step after a cover drop.** Task 3 frees today's terrain under the realistic ground. On a zoom step the realistic ground of the new density is not laid yet. Expected: the d2 twin or a placeholder draws; no empty (sky-coloured) tile for even one frame. Test in Task 3.
2. **Tint atlas full.** 1,000 guests in 12 shirt colours on screen at d4. Expected: the atlas evicts the least recently used frames; a guest whose frame is not tinted yet draws untinted (counted incomplete), never invisible. Test in Task 4.
3. **Render ratio drops mid-run.** `auto` quality steps down to ratio 1 during a scene. Expected: the bench row names the frame and the new ratio, and the verdict says the run is not at full sharpness. Test in Task 2.
4. **Item with no baked art yet.** During batches, most items still use today's art. Expected: they draw today's art (fallback list), and today's sprite memory stays inside the budget. Test in Task 3.
5. **Bake grows past S5.** A batch adds 30 MB of art. Expected: the bake report fails the CI step when the projected full total passes 150 MB, before deploy. Test in Task 5.

---

## Batch 0: conditions and pipeline (detailed)

### Task 1: Split `look.ts` by kind (no behaviour change)

`src/render/real/look.ts` is 951 lines and every batch edits it. Split it before items are added.

**Files:**
- Create: `src/render/real/look/{index,core,rides,track,people,ground,scenery}.ts`
- Modify: `src/render/real/look.ts` becomes a re-export of `look/index.ts` (keeps every import path).
- Test: existing `tests/unit/render/real/{look,trackReal,renderer-real,ground}.test.ts`

**Interfaces:**
- Produces: the same `RealLook`, `createRealLook(index, sets, opts)`, `pickDensity`, `SupportPart`, `RealSets`, `RealLookOptions`, `TINT_FRAME_MS`, `DEGRADE_FRAMES` exports, unchanged. `core.ts` holds the shared want/use/soft-draw/tint-budget machinery; each kind module exports `make<Kind>Getters(core: LookCore)` returning its part of `RealLook`.

- [ ] **Step 1:** Run `npx vitest run tests/unit/render/real` and record the pass count.
- [ ] **Step 2:** Move code; no logic edits. Each kind module ≤ 300 lines.
- [ ] **Step 3:** Run the same tests: same pass count. Run `npx tsc --noEmit`.
- [ ] **Step 4:** Commit `refactor(real): split look.ts by kind`.

### Task 2: Bench counts all picture memory and logs render ratio changes

**Files:**
- Modify: `src/perf/realBench.ts`, `src/perf/realBenchCard.ts`, `src/render/renderer.ts` (expose ratio changes)
- Test: `tests/unit/perf/realBench.test.ts`

**Interfaces:**
- Produces: `BenchRow.ratioChanges: { frame: number; from: number; to: number }[]`; `BenchRow.canvasAtStart: [number, number]`; `bands.S2.value = allPeakMB` (limit 128). The renderer sets `canvas.dataset.renderRatio` on every plan change (it already sets `dataset.autoScale`); the bench reads it each frame.
- Report format stays `tc-real-bench/1`, plus the new fields. The `look: classic` run reports S2 as all picture memory too.

- [ ] **Step 1: Failing tests** in `realBench.test.ts`:
  - `it('S2 is all picture memory')`: a scene with managed peak 100 MB and other memory 40 MB → `bands.S2.value === 140`, `band === 'fail'`.
  - `it('logs a render ratio change')`: fake renderer ratio 2 for 200 frames, then 1 → `ratioChanges` equals `[{ frame: 200, from: 2, to: 1 }]`, and the text line contains `render ratio 2→1 at frame 200`.
  - `it('verdict notes reduced sharpness')`: any ratio change → verdict text adds `not at full sharpness`.
- [ ] **Step 2:** Run `npx vitest run tests/unit/perf/realBench.test.ts`: the three fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run: pass. Full `npx vitest run`: pass.
- [ ] **Step 5:** Commit `feat(bench): S2 counts all picture memory; log render ratio changes`.

### Task 3: Today's memory inside the budget

The realistic run 2 held 108–128 MB managed plus 26–49 MB of today's terrain and sprites outside the budget.

**Files:**
- Modify: `src/render/terrain.ts` (cover drop), `src/render/renderer.ts`, `src/render/real/ground.ts`, `src/render/real/setManager.ts` (only if `hold` needs a named slot), `src/data/tuning/perf.ts`
- Test: `tests/unit/render/real/renderer-real.test.ts`, `tests/unit/render/real/ground.test.ts`

**Interfaces:**
- Consumes: `SetManager.hold(id: string, bytes: number, upBytes?: number)`.
- Produces:
  - `REAL_CLASSIC_SPRITE_MB = 16` in `perf.ts`: today's sprite cache budget in the realistic build.
  - Each frame the renderer calls `sets.hold('classic', terrainBytes + staticLayerBytes + classicSpriteBytes)`, so the ladder sees true pressure.
  - `TerrainLayer` takes `cover: ((chunk: number) => boolean) | null` through its env/options instead of the module global `realGroundCover` (ledger minor). The `placeholders` counter moves onto the layer.
  - A covered chunk frees **all** its buckets and exact images, not only the current bucket.
  - `RealGround` keeps drawing the d2 twin (or the placeholder) for a covered chunk whose current-density pieces are not ready. This also closes the one-frame hole when demotions lift at an unchanged density (ledger minor).

- [ ] **Step 1: Failing tests:**
  - `renderer-real.test.ts` `it('holds today\'s memory in the budget')`: after a frame, `sets.snapshot()` has a hold `classic` equal to terrain + static + sprite bytes.
  - `it('frees every bucket of a covered chunk')`: zoom 1 → 2 with the realistic ground ready at both → today's terrain bytes for covered chunks = 0.
  - `ground.test.ts` `it('no empty tile on a zoom step')`: zoom 1 → 2, d4 pieces not decoded → every in-view covered tile draws a d2 piece or a placeholder in that same frame.
  - `it('no hole when demotions lift')`: demoted then lifted at the same density → every tile draws in the lift frame.
  - `it('items without baked art draw today\'s art within the budget')`: a park with an unbaked stall → the stall draws through the fallback; classic sprite bytes ≤ 16 MB.
- [ ] **Step 2:** Run: fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the real tests and full suite: pass. Website build byte-identical; `classicOps` golden unchanged.
- [ ] **Step 5:** Headless phone path (`node tools/art3d/realShots.mjs` phone path, 390×844, DPR 2.75): all-picture peak ≤ 128 MB in every scene. Record the numbers in the commit body.
- [ ] **Step 6:** Commit `fix(real): today's terrain and sprites inside the 128 MB budget`.

### Task 4: Tint per frame in a shared atlas (F6 memory)

Whole-sheet tints project to 117 MB at d4 for the full guest set (32 sets × 12 colours). Tint only the frames on screen.

**Files:**
- Create: `src/render/real/tintAtlas.ts`
- Modify: `src/render/real/look/people.ts`, `src/render/real/look/track.ts` (cars, rails, supports), `src/render/real/tint.ts` (frame-rectangle tint)
- Test: `tests/unit/render/real/tintAtlas.test.ts`, `tests/unit/render/real/tint.test.ts`

**Interfaces:**
- Produces:
  - `TINT_PAGE_PX = 1024`, `TINT_ATLAS_MAX_PAGES = 12` (12 MB at most).
  - `class TintAtlas { constructor(sets: Pick<SetManager, 'admit' | 'hold'>, make: (w: number, h: number) => CanvasLike); get(sheetKey: number, frame: number, colour: number): Sprite | undefined; request(sheetKey: number, frame: number, colour: number, base: Decoded, mask: Decoded, rect: {x: number; y: number; w: number; h: number}): void; step(budgetMs: number): void; reclaim(needBytes: number): number; bytes(): number; dispose(): void }`
  - Shelf packing per page; least recently used frame evicted first; pages admitted through `sets.admit('tint:<page>', bytes)`; `reclaim` registered with `addReclaimer`.
  - `tintRect(base, mask, rect, rgb, dst, dx, dy)` in `tint.ts`.
- [ ] **Step 1: Failing tests** (`tintAtlas.test.ts`, fake canvases):
  - `it('tints only the requested frame')`: request one 40×80 frame → `bytes()` = one page; the tinted pixels equal `tintPixels` on that rectangle.
  - `it('returns undefined until tinted, then a sprite')`.
  - `it('evicts least recently used when full')`: fill 12 pages, request one more → the frame not used for the longest is gone, the newest is present.
  - `it('1,000 guests in 12 colours at d4 stay within 12 MB')`: 32 sets × 8 facings × 4 walk frames × 12 colours of 40×80 frames, 1,000 random requests → `bytes() ≤ 12 * 2**20`.
  - `it('an untinted frame draws the base, counted incomplete')` in `look.test.ts`.
- [ ] **Step 2:** Run: fail.
- [ ] **Step 3:** Implement. Guests, cars, rails and supports use the atlas; whole-sheet tinting is removed.
- [ ] **Step 4:** Run the full suite: pass. Headless coaster scene: tint bytes ≤ 12 MB (stage 1 run 2: 39 MB).
- [ ] **Step 5:** Commit `feat(real): per-frame tint atlas`.

### Task 5: Bake size report and S5 gate

**Files:**
- Create: `tools/art3d/sizeReport.ts`
- Modify: `tools/art3d/bake.mjs` (write `size-report.json` beside `index.json`), `tools/art3d/checkIndexCli.ts`
- Test: `tests/unit/art3d/sizeReport.test.ts`

**Interfaces:**
- Produces: `sizeReport(index: RealIndex, files: Map<string, number>): { perItem: { id: string; compressedBytes: number; decodedPerTurn: { d2: number; d4: number } }[]; totalCompressed: number; projectedFull: number }`. `projectedFull` = baked total + (catalogue items not yet baked × the mean of baked items of the same kind). `checkIndexCli` exits 1 when `projectedFull > 150 MB` (S5) and prints the top ten items by size.
- [ ] **Step 1: Failing tests:** `it('sums per item')`, `it('projects unbaked items by kind mean')`, `it('fails over 150 MB')`.
- [ ] **Step 2:** Run: fail. **Step 3:** Implement. **Step 4:** Run: pass. Run the real bake once locally; record `projectedFull` in the commit body.
- [ ] **Step 5:** Commit `feat(bake): size report and S5 projection gate`.

### Task 6: Batch review page

The owner approves each batch side by side with today's look (spec §7 item 1, D9), on the phone.

**Files:**
- Create: `tools/art3d/reviewShots.mjs`, `tools/art3d/reviewPage.ts`
- Modify: `.github/workflows/deploy.yml` on `ccr-6f420895-3xt45j` (run after the real build; output to `dist/real-game/review/`; checkout ref `phase8c-full`)
- Test: `tests/unit/art3d/reviewPage.test.ts`

**Interfaces:**
- Produces: `node tools/art3d/reviewShots.mjs --items <id,id,...> --out <dir>`: for each item, a one-item park built through the game's own placement code, screenshot at zoom 2, ratio 2, turns 0 and 1, in both looks (`?art=classic` and `?art=real`). `reviewPage(items: {id: string; name: string; shots: {look: 'classic' | 'real'; turn: number; file: string}[]}[]): string` returns a phone-width HTML page, one row per item: name, today's look, realistic look.
- [ ] **Step 1: Failing test:** `it('one row per item with both looks')`; `it('fits 390 px wide')` (no fixed width over 390).
- [ ] **Step 2–4:** Run fail, implement, run pass. Run `reviewShots` locally for the 18 stage 1 items; check the pictures by eye.
- [ ] **Step 5:** Commit `feat(art3d): batch review page`.

### Task 7: Batch 0 phone gate (owner)

- [ ] **Step 1:** Merge Tasks 1–6 into `phase8c-full`. Point the deploy workflow at `phase8c-full`; trigger it; check the deploy log (bake time, `projectedFull`).
- [ ] **Step 2:** Load `/real-game/?art=real` in headless Chromium: console clean, a park draws.
- [ ] **Step 3: Owner:** run `/real-game/?art=real&bench=1` on the owner's phone, an older Android, and an iPhone (F10). Pass: S1–S4, S6g, and the new S2 (all picture memory ≤ 128 MB) in every park, with no render ratio change. If no older Android or iPhone is available, record that in the report as an open risk; the owner decides whether batch 1 starts.
- [ ] **Step 4:** Save each run as `phase-8c-full-evidence/batch0-<phone>.md`; update `phase-8c-stage-1-report.md` → new `phase-8c-full-report.md` with a batch table.

---

## Batches 1–8 (roadmap; each gets its own plan when it starts)

Every batch ends the same way: bake in CI → size report under S5 → review page → owner approves (D9) → bench on the owner's phone, S1–S6g pass with the batch's items placed in the bench parks (the `scale` park swaps its alias sets for real ones as they land). Card art comes with each item.

| # | Batch | Items (catalogue count) | Baked in stage 1 | Notes |
|---|---|---|---|---|
| 1 | Flat rides | 18 flat rides | carousel, big_wheel, swing_tower | Animation frames per `src/render/anim.ts`; occupancy steps; round rides one turn set |
| 2 | Stalls and path items | 14 stalls; bench, bin, lamp | snack_shack, bench, bin | Bin fill and broken looks; lit variants wait for batch 7 |
| 3 | Scenery: base and Classic Fair | base set + classic_fair (of 83 scenery items) | 8 base items | Big items as tiling pieces (§5.6) |
| 4 | Scenery: Frost Peaks, Volcano Ridge, Spooky Hollow, Jungle Lagoon, Starport | rest of the 83 | none | Split into two sub-batches if the review page passes 25 items |
| 5 | Track rides | 12 track types: every piece (`src/data/track/pieces.ts`, `extraPieces.ts`, `waterPieces.ts`), supports, cars full and empty (F7) | steel_coaster, 18 pieces | Shadows for rails, supports and cars; chain-lift dashes; inverted and hanging supports; water channels. Likely two sub-batches (dry, water) |
| 6 | Guests and staff | F6: 4 bodies × 8 outfits; staff groundskeeper, mechanic, security, performer; costume `boo`; balloon and umbrella | 8 guest sets | Judged at zoom 2 on a phone, not close-up |
| 7 | Ground, night and shows | Cliff faces, shores, paths on slopes, entrance plaza; night grade + baked lights (F8); lightshow_tower, fireworks_launcher | grass, water, path, queue | Lit variants of lamps, stalls and rides |
| 8 | Release | — | — | Full bench on three phones; app build with the realistic look as default in the app only after the owner approves removal of today's look there (spec §7 item 3); website keeps today's look (E2); full career pass |

**Mascot maker (F9):** the catalogue no longer has created mascots (`people.ts`: removed with Task 24); only the `boo` costume remains (batch 6). F9 parts baking starts only if the maker comes back.

**Bake time:** stage 1 baked 18 items in 7.7 min cold locally. About 150 items projects to about 65 min cold locally, longer on CI (S8 cold limit 4 h; the GitHub job limit is 6 h). Shard the bake across CI jobs only if a deploy log passes 3 h.

## Not covered by this plan

- Per-batch item lists, model details and look rules: each batch plan.
- Removing today's look from the app: owner decision at batch 8.
- The Blender comparison: not requested; three.js stays the bake tool.
