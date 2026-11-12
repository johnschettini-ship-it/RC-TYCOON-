# Phase 8b Stage 0b ("Predrawn test") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the throwaway stage 0b test of design section 6 in a separate worktree, and deliver the numbers, the owner pictures, the app build for the owner's devices and the stage 0b report that answer the kill rules B1 to B8.

**Architecture:** All work is in a detached worktree `$PROTO/wt` outside the main checkout. The stage 0 art code (surface, palette, twins, stamps, ground painter, shadow masks) runs only at build time: a sheet tool (a Vite plugin, app mode only) paints every picture once, packs indexed PNG sheets and one binary index per pack. The game reaches pixel code only through one small hook file; in app mode `main.ts` loads the pixel runtime as a separate chunk (picture store, decode queue, palette swap, ground assembly, shadow pass), so the website build stays today's game. Measures run in Playwright (phone and tablet profiles, CPU throttle 4) on `vite preview` of `dist-app`; real devices and the Android emulator are owner steps prepared by this plan.

**Tech Stack:** TypeScript strict, Vite 8 (`runnerImport`, `emitFile`, `--mode app`), Canvas 2D, `createImageBitmap`, Vitest (Node), Playwright (projects `phone` Pixel 7, new `tablet`), `node:zlib` for PNG, Capacitor 7.6.8 (test wrapper only).

**Spec:** `docs/superpowers/specs/thrills-and-chills/phase-8b-predrawn-art.md` (revision 5, approved with round 1 decisions D1 to D11 as proposed). Read sections 1 to 6 and 9 before Task 1. "§" below refers to this design. The stage 0 plan `docs/superpowers/plans/2026-11-11-phase-8-stage-0-prototype.md` and report `docs/superpowers/specs/thrills-and-chills/phase-8-stage-0-report.md` are the model; stage 0 code is on branch `phase8-stage0-proto` (commit `9a70d8f`, never merged; read with `git -C /home/user/RC-TYCOON- show phase8-stage0-proto:<path>`). Its code base `2db863e` has the same `src/`, `tests/`, `scripts/` and configs as the current HEAD of `ccr-6f420895-3xt45j` (only docs differ), so stage 0 files copy in unchanged.

## Controller decisions (2026-11-12, before execution)

- C1: tablet stretch k = max(1, round(dpr)) (Test decision 3) stands.
- C2: B3b uses today's turn + 1 step for each scene separately (Test decision 19) stands.
- C3: with the owner's D7 = (b), B3b decides as a stop rule; strict B3-turn is reported only.
- C4: phone k = max(1, ceil(dpr)) (the rule of stage 0 kill rule 3a, Test decision 2) stands; the report gives the k of each device.
- C5: no WebKit download. `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` is set on purpose and the session rules forbid installing another browser. Task 20 records "not possible here"; the real iPhone run of the device checklist covers WebKit.
- C6: the controller pushes the 0b worktree as branch `phase8b-stage0b-proto` (never merged), as for stage 0, and Task 22 also writes `app-src-0b.tar.gz`. The device checklist names the branch.
- C7: Test decision 12 stands (0b records today's Export/Import, close and back-button behaviour; the full build adds the native features).
- C8: confirmed: ghosts and cars are new keys in B1 (format check only).
- C9: the design's scene line is corrected by the controller (the `phone` and `build1` scenes hold 14 flat rides, `tests/perf/sceneInfo.ts:21-23`).
- C10: Test decision 10 stands (the start progress line shows over the canvas until the first complete frame).

## Global Constraints

- **Place.** `PROTO=/tmp/tc-phase8b-proto` (fixed path). Worktrees: `$PROTO/wt` (the test; detached at the HEAD of `ccr-6f420895-3xt45j` at Task 1), `$PROTO/base` (same commit, never edited: B7 and B8 compare with it), `$PROTO/s0` (detached at `phase8-stage0-proto`: the stage 0 surface output for B1; only Task 14 adds one untracked test file there). Outputs go to `$PROTO/out`. Paths in tasks are relative to `$PROTO/wt` unless they start with `$PROTO` or `/home/user`.
- **Shell prefix (every command).** Every command block starts with `set -e`, `PROTO=/tmp/tc-phase8b-proto`, `cd "$PROTO/wt"`; every one-line `Run:` starts with `PROTO=/tmp/tc-phase8b-proto; cd "$PROTO/wt" || exit 1;`. Only Task 1 Steps 1 and 2 use `cd "$PROTO"`. A block that must go on after an expected non-zero exit puts `|| true` after that command. A block that pipes `npx playwright test … | tee` adds `set -o pipefail`.
- **Load gate (timing runs only).** Before each timing run (Tasks 18 and 19, each block) this function must print `quiet` (write its body in full in every block; `…` in a task stands for it):

  ```bash
  quiet() {
    for i in $(seq 1 30); do
      busy="$(pgrep -af 'vitest|playwright|vite (build|preview)' | grep -v tc-phase8b-proto || true)"
      load="$(cut -d' ' -f1 /proc/loadavg)"
      if [ -z "$busy" ] && awk -v l="$load" 'BEGIN { exit !(l < 1.0) }'; then echo quiet; return 0; fi
      echo "wait $i: load $load"; sleep 60
    done
    echo "not quiet after 30 min"; exit 1
  }
  ```

  On `not quiet after 30 min` the block stops and the controller starts it again later (not a task failure). Each timing block appends `cat /proc/loadavg` before and after its run to `$PROTO/out/loadavg.txt` with a label. The port check comes right after `quiet`.
- **Median of 3 (replaces the stage 0 repeat rule, §1 "Load gate").** Every timing value is the median of 3 runs in one block (`TC_PERF_RUNS=3`, or 3 loops inside a test). No extra repeat of a fired rule.
- **Start condition (controller).** Tasks 18 and 19 start only when no other agent runs tests or builds on this machine. The load gate stays inside every block.
- **Time limits.** A block that calls `quiet` runs with `run_in_background` and `timeout: 7200000` (2 h) and holds one `npx playwright test` command. A block without the gate that can run longer than 10 min (Task 1 Steps 2 to 4, Task 8 Step 5, Task 14 Steps 3 to 5, Task 16 Steps 2 and 3, Task 17 Step 2, Task 20 Step 2, Task 22 Step 1) runs with `run_in_background` and `timeout: 3600000`.
- **The main checkout is read-only.** Nothing writes under `/home/user/RC-TYCOON-`. Allowed git writes: the three `git -C /home/user/RC-TYCOON- worktree add` commands of Task 1, and `git add -A` inside `$PROTO/wt`. Every `git status`/`git diff` passes `--no-optional-locks`. Other agents change and commit in the main checkout; that is never a stop. Never restore, delete or edit anything there. `/home/user/orange-day-pocket-republic` is read-only too.
- **The task check.** Every task starts with Task 1 Step 6a and ends with Task 1 Step 6b (stage 0 Task 1 Step 6, with `PROTO=/tmp/tc-phase8b-proto`; written list `$PROTO/written-<task>.txt`, start mark `$PROTO/task-<task>.start`, log `$PROTO/out/main-status.log`; stop only on `WRONG-DIR` or `LEAK`). The find in Step 6b prunes `node_modules` of all three worktrees and `$PROTO/wt/android`.
- **The written list.** As stage 0: after each Write/Edit append the path; after each block append each target of `>`, `>>`, `tee`, `cp`, `mkdir`, `rm`, each path given in `TC_*` output variables or `OWNER_OUT`, and the worktree folder for each `npm`, `npx` or `git add -A` run there.
- **No commits.** `$PROTO/wt` keeps `HEAD` at the base commit; tasks end with `git add -A` (stage only). Never push, commit or create a branch. The reviewer reads `git --no-optional-locks -C "$PROTO/wt" diff --cached` and `status --short`.
- **Ports.** `PW_PORT` per run, free-checked just before the run with `test "$(lsof -nP -iTCP:$PW_PORT -sTCP:LISTEN -t | wc -l)" -eq 0 || { echo "port $PW_PORT busy"; exit 1; }; echo free`. Assignment: 4401 development checks, 4402 Task 14, 4403 Task 17, 4404 Task 18 cases, 4405 Task 18 start, 4406 Task 19 block 1, 4407 block 2, 4408 block 3, 4409 block 4, 4410 Task 20, 4411 and 4412 spare. The config reuses any server on its port (`playwright.config.ts:12-17`).
- **One Playwright worker.** Every Playwright command passes `--workers=1`.
- **Network.** Only the npm registry (Capacitor packages, Task 13) and one attempt to download Playwright WebKit (Task 20). No environment change: if the proxy refuses a host, record it and go on.
- **Simulation.** No file under `src/sim/` changes.
- **No image files in `src` or `tests`.** PNG files are written only under `$PROTO/out`, `dist-app/`, `dist-app` copies (`mobile/www/`, `android/…/public/`) and the plugin's cache folder `node_modules/.cache/tc-sheets/`.
- **Website stays today's game (B8).** No file outside `src/render/pixel/` imports a value from `src/render/pixel/`. The game reaches pixel code only through `src/render/artHook.ts` (the kind codes `K_*`, types and two holders). Type imports are written on one line (`import type { … } from '…/pixel/…'`). Check, part of every code task's gates: `PROTO=/tmp/tc-phase8b-proto; cd "$PROTO/wt" || exit 1; grep -rnE "from '[^']*/pixel/" src --include=*.ts | grep -v '^src/render/pixel/' | grep -v ':import type ' || echo static-ok` prints `static-ok` (the dynamic `import('./render/pixel/app/runtime')` in `main.ts` has no `from` and does not match). `src/render/pixel/surfaceArt.ts` and everything it imports is imported only by `tools/` and tests.
- **Branch rule.** An existing Classic function keeps its body; a new branch is `if (pixel.rt) …` (runtime) or `const sa = surfaceArt.on; if (sa?.is(ctx)) …` (build tool) before the Classic body. Today's look must not change (B7).
- **Raster rules (art code and tool).** Whole-number raster, `Math.imul` hashes, no time, no random numbers, no read-back from a canvas in art code. Every picture pixel is one palette slot with alpha 0 or 255. Timing code only measures.
- **Node tests start clean.** A test that sets `surfaceArt.on` or `pixel.rt` clears both in `afterEach`.
- **Comments.** English, short sentences. Each new file starts with `/** Phase 8b stage 0b test (never merged): <job>. */`.
- **Gates of every code task:** `npx tsc --noEmit` prints nothing (Task 2 adds `tools` to `tsconfig.json` `include`); the task's own tests pass; `npx vitest run tests/unit/render/content/art.test.ts tests/unit/render/content/phase6Art.test.ts tests/unit/scenery/art.test.ts tests/unit/render/track/slices.test.ts tests/unit/render/pixel` passes; the static import check prints `static-ok`.
- **Values from the design (verbatim).** Phone and tablet budget 64 MB (D11); `ART_START_MAX_S` 4 s; growth warning 25 %; frame step 16.67 ms, steps `round(ms / 16.67)`; B2 40 ms; B3-turn 6 steps (100 ms); B3-other: cold chunk 12 ms, main-thread swap 3 ms, 30 incomplete frames, 20 placements 100 ms; B8: +2 KB (2048 bytes); sheets at most 2048 × 2048, 2-pixel transparent gap; grass 4 variants; iPhone canvas area below 16 777 216 pixels; D6 = (a), D7 = (b), D8 = (a).

## Review Focus

1. **A run measures the wrong build** (a server of another agent on the port, the website build, or the Classic style when Pixel was meant). Expected: the run fails, not a plausible number. Test: port check before every run; Tasks 15 and 17 to 19 assert `window.__tcBuild === 'app'` (set only by the app runtime chunk, Task 10) and, for Pixel runs, `#game[data-art="pixel"]` and `window.__predrawnStats` present; Classic runs assert `data-art` absent.
2. **Decoding changes pixels** (colour-space conversion or premultiplied alpha in `createImageBitmap`). Expected: decoded slot colours are exact. Test: Task 10 asserts the decode options `{ premultiplyAlpha: 'none', colorSpaceConversion: 'none' }`; Task 14 format check of every entry (palette colours only, alpha 0 or 255).
3. **A missing picture draws nothing** (a key the catalogue never made, or a sheet still decoding), so a frame is cheaper than the real one. Expected: missing pictures are counted and fail the run. Test: Task 5 key-equality test; Task 15 prints `missing` in every `[perf]` line; Task 21 rejects a line with `missing > 0`; Tasks 17 and 18 assert `__predrawnStats.missingTotal === 0` after warm-up.
4. **The website build pulls pixel code** through a static import. Expected: the web initial load grows at most 2 048 bytes. Test: the static import check in every task's gates; Task 16 (B8).
5. **The shared budget is miscounted** (a swapped sheet not counted, the static layer counted twice, an evicted sheet still counted). Expected: `budgetMb` equals the sum of its parts at every frame. Test: Task 10 accounting cases; Task 18 asserts `budgetMb` = `sheetMb + swapMb + chunkMb + staticMb` (±0.01) at its end.

## Coverage map

| Item of § | Task |
|---|---|
| 5.1 items 1 to 7 (plugin, surface without canvas, indexed PNG, hash names, dedupe and counts, packing, cache) | 3, 8 |
| 5.1 item 6 (hand-made sheets) | not in 0b (D1 = a) |
| 5.2 items 1, 2, 4 (binary index, virtual module, keys per kind) | 3, 5 to 8, 10 |
| 5.2 item 3 (previews from the index) | not in 0b (Test decision 15) |
| 5.3 items 1, 2 (Capacitor, two outputs, app pass), 8 (budget, fine sheets, decode, device classes, canvas limit) | 8, 10, 11, 13, 16 |
| 5.3 items 3 to 7, 9, 10 | 13 (wrapper only), report open points (Test decision 12) |
| 5.4 ground | 7, 12 |
| 5.5 shadows (D8) | 4, 5, 12 |
| 5.6 colour changes | 4, 10, 12, 18 |
| 5.7 track, cars, elevated paths | 6, 12 |
| 5.8 art rules | not applied (§6 "What the owner will see") |
| §6 scope: three parks, cases park, ghosts, swap | 9, 18, 19 |
| §6 Measures (median of 3, next to today) | 18, 19, 21 |
| §6 Before the timing runs (sizes, projection, stop above 64 MB) | 9 |
| B1 | 14 |
| B2, B2b, B3-turn, B3b | 19, 21 |
| B3-other | 18, 21 |
| B4 | 19, 21 |
| B5 | 18, 21 |
| B6 | 18, 19, 21 |
| B7, B8 | 16, again in 22 |
| Also reported (sizes, counts, decode time and throttle, drawing path, WebKit, emulator) | 8, 9, 17, 18, 20, 22 |
| Owner gate (numbers, devices, app start, k = 3, ground, shadows) | 17, 22 |

## Test decisions

Each line departs from §6 or adds to it. Report section 6 copies this list with the result of each line.

1. **Hook architecture.** `src/render/artHook.ts` holds `surfaceArt` (build tool) and `pixel` (runtime); the runtime is a dynamic chunk loaded only in app mode. Why: B8 (+2 KB) and "no pixel loader (it compiles out)" (§5.3 item 2).
2. **Phone stretch** `k = max(1, ceil(dpr))` at every quality (stage 0 report §7, kill rule 3a): Pixel 7 profile k = 3.
3. **Tablet stretch** `k = max(1, round(dpr))` (canvas ratio about 1, CSS-pixel canvas): tablet profile k = 2. §6 does not fix it (controller question C1).
4. **Today's numbers** come from the app build with the Classic style (`VITE_ART` unset), so both runs use one build path and one server kind.
5. **Reserved ramps** `rt` (track), `rs` (supports), `rc` (car body): 6 tones each, copies of the `n` ramp, appended after `u` (no stage 0 slot index moves). Swap target of tone `t` for palette colour `c`: `slotOf(shade(TRACK_PALETTE[c], 1.18 ** (3 − t)))`. No colour-blind check of swap results (§5.6 item 5 is for the full build).
6. **Shadow pictures:** slot `i1`, checkerboard of the stage 0 caster mask (`casterMask`), two phases per (object, view); the runtime picks the phase by the anchor's art-pixel parity, so two shadows never add up. Stage 0 `SHADOW_TZ` 40 and `SHADOW_LEN` 0.75 stay.
7. **Ground pieces:** tops by (terrain, view slope mask, owned, variant `hash3(x, y, 0x0b) & 3`); paths by (content, view slope mask in {0, 3, 6, 12, 9}, view edge mask, variant); faces by (side, cap) stacked one height step each from the lowest bottom corner, the lower part hidden by the tiles drawn after; water one flat piece; no shore, strata, queue posts or dashes (as stage 0 Prototype decision 6).
8. **Rails** are pictures of (track type, piece, piece direction, tile of the piece, view) anchored at the tile centre at the piece's base height, painted by the stage 0 `paintSlicePixel` with no support; **supports** are stacked segments (foot, one step, top) per (support style, view); **gates** use the track ramp; **cars** the poses the pose walk finds.
9. **Elevated paths:** deck pieces per (kind, view ramp: flat or view direction 0 to 3) and one post segment per (corner, step), with today's `ELEVATED_COLOURS`.
10. **Start decode** is driven by the frame: a missing picture queues its sheet; a progress line over the canvas (`role="progressbar"`) shows decoded / queued until the first complete frame (§5.3 item 8 says "on the title").
11. **Keep the last picture:** rides, stalls, scenery and show sites draw their last decoded picture while a sheet decodes; guests, staff and decals draw nothing then. Either case counts the frame as incomplete.
12. **No native features** in 0b: no file saves, share sheet, back-button handling or autosave on hide (§5.3 items 5 to 7). The emulator checklist records today's behaviour of Export, Import, a save after close and the back button.
13. **B1 reference** comes from `$PROTO/s0` (the stage 0 commit) through the stage 0 sprite bank; both sides compare a trimmed hash (§ Task 3 `trimmedHash`); guest entries skip pixels of the shadow colour on both sides.
14. **Turn value** of a run: the larger of its two `turns: longest frame` values; the rule value is the median over 3 runs.
15. **Previews** (cards, pickers, §5.2 item 3) keep today's drawing in 0b.
16. **Ghosts:** the frame-0 picture of each placeable (ride, stall, scenery, show site) in small ghost sheets, swapped with `ghostTable` valid or invalid (phase-8 spec §6.3 thresholds).
17. **App identity:** test id `dev.thrillsandchills.stage0b`, name "T&C 0b test" (E8 is open).
18. **Bench mode** (device runs): the test app build (`VITE_BENCH=1`) has bench buttons on the title and the three speed-test saves plus the cases save as emitted files `bench/*.json`; the bench repeats the perf procedure on the device and shows the numbers on screen.
19. **B3b per scene:** the `build2` turn limit is today's `build2` turn steps + 1 (§6 does not say; controller question C2).

---

### Task 1: Worktrees, base build and baseline

**Files:** none in the repository. Creates `$PROTO/wt`, `$PROTO/base`, `$PROTO/s0`, `$PROTO/out`, `$PROTO/out/base`, `$PROTO/out/e2e`, `$PROTO/scratch`.

**Interfaces:**
- Produces: `$PROTO/base-sha`, `$PROTO/s0-sha` (`9a70d8f…`), `$PROTO/out/release-base.txt`, `$PROTO/out/base/load-bytes.txt` (exact web initial load), `$PROTO/out/base/dist-files.txt`, `$PROTO/out/base/sw-manifest.json`, `$PROTO/baseline-full.txt`, `$PROTO/out/baseline-notes.md`, `$PROTO/out/env.md` (browsers present, `nproc`, Node version).

- [ ] **Step 1: Record the base and start the task check** (as stage 0 Task 1 Step 1, with `mkdir -p "$PROTO/out/base" "$PROTO/out/e2e" "$PROTO/scratch"`, `git rev-parse HEAD > base-sha`, `git rev-parse phase8-stage0-proto > s0-sha`, both with `--no-optional-locks -C /home/user/RC-TYCOON-`).

- [ ] **Step 2: Create the three worktrees and install**

```bash
set -e
PROTO=/tmp/tc-phase8b-proto
cd "$PROTO"
git -C /home/user/RC-TYCOON- worktree add --detach "$PROTO/wt" "$(cat "$PROTO/base-sha")"
git -C /home/user/RC-TYCOON- worktree add --detach "$PROTO/base" "$(cat "$PROTO/base-sha")"
git -C /home/user/RC-TYCOON- worktree add --detach "$PROTO/s0" "$(cat "$PROTO/s0-sha")"
for w in wt base s0; do (cd "$PROTO/$w" && npm ci); done
printf '%s\n' "$PROTO/wt" "$PROTO/base" "$PROTO/s0" >> "$PROTO/written-1.txt"
```

- [ ] **Step 3: Base website build and its facts (B8 reference)**

```bash
set -e
PROTO=/tmp/tc-phase8b-proto
cd "$PROTO/wt"
(cd "$PROTO/base" && npm run build && node scripts/check-release.ts --no-build --no-tests | tee "$PROTO/out/release-base.txt")
node --input-type=module -e "const m = await import('$PROTO/base/scripts/check-release.ts'); console.log(m.initialLoadBytes('$PROTO/base/dist'))" > "$PROTO/out/base/load-bytes.txt"
(cd "$PROTO/base/dist" && find . -type f ! -name '*.map' | sort) > "$PROTO/out/base/dist-files.txt"
cp "$PROTO/base/dist/sw-manifest.json" "$PROTO/out/base/sw-manifest.json"
cat "$PROTO/out/base/load-bytes.txt"
```

Expected: one integer (about 363 000). `grep "Initial load" release-base.txt` shows `PASS`.

- [ ] **Step 4: Baseline gates in the worktree** (stage 0 Task 1 Step 4 unchanged: `tsc`, render and scenery run, whole suite into `baseline-full.log` and `baseline-full.txt`, count into `baseline-notes.md`).

- [ ] **Step 5: Environment facts**

Run: `PROTO=/tmp/tc-phase8b-proto; cd "$PROTO/wt" || exit 1; { echo "nproc $(nproc)"; node --version; ls /opt/pw-browsers; echo "PLAYWRIGHT_BROWSERS_PATH=$PLAYWRIGHT_BROWSERS_PATH"; } | tee "$PROTO/out/env.md"`
Expected: `chromium-*` listed; no `webkit-*` (Task 20 handles that). Then Step 6b with `TASK=1`.

- [ ] **Step 6: The task check** (Step 6a and 6b of stage 0 Task 1 Step 6, with `PROTO=/tmp/tc-phase8b-proto`, and the Step 6b `find` pruning `$PROTO/wt/node_modules`, `$PROTO/base/node_modules`, `$PROTO/s0/node_modules`, `$PROTO/wt/android`).

---

### Task 2: Stage 0 art code behind the tool hook

**Files:**
- Create (copied with `git -C /home/user/RC-TYCOON- show phase8-stage0-proto:<path> > <path>`): `src/render/pixel/{surface,palette,colourMap,derived,stamp,grid,ground,shadows,style}.ts`, `src/render/pixel/art/{shapes,rides}.ts`, `src/render/pixel/sprites/people.ts`, `src/data/tuning/pixel.ts`, `tests/unit/render/pixel/{surface,palette,stamp,shapes,carousel,people,ground,grid,shadows,derived,classicOps}.test.ts`, `tests/unit/render/pixel/protoKit.ts` (keep only `writePng`)
- Create: `src/render/artHook.ts`, `src/render/pixel/surfaceArt.ts`, `src/render/pixel/art/track.ts` (stage 0 `paintSlicePixel` and `widenRuns`, moved out of `track/layer.ts`)
- Modify (hook branches, the bodies of stage 0's diff in hook form): `src/render/sprites/shapes.ts` (`box`, `cylinder`, `cone`, `pyramid`, `head`; the `ArtCtx` interface), `src/render/sprites/props.ts` `drawGuestArt`, `src/render/sprites/rides.ts` `drawRideArt`, `src/render/sprites/stalls.ts` (in-art shadow), `src/render/scenery/art/kit.ts` (`shadow`, `mixHex` note), `src/render/palette.ts` `shade` (note), `src/render/track/layer.ts` (`sliceBounds` widening, `paintSlice` 4th parameter `extras = true`), `tsconfig.json` (`include` adds `"tools"`)
- Test: `tests/unit/render/pixel/hook.test.ts`

**Interfaces:**
- Produces, `src/render/artHook.ts` (imports types only):
  - `interface SurfaceArt { is(ctx: unknown): boolean; box(ctx, u0, v0, u1, v1, h0, h1, top, left, right): void; cylinder(ctx, cu, cv, r, h0, h1, side, top): void; cone(ctx, cu, cv, r, h0, h1, colours, segments): void; pyramid(ctx, u0, v0, u1, v1, h0, h1, back, left, right): void; head(ctx, x, y, r, skin, hair): void; guest(ctx, g: GuestLook): void; ride(ctx, defId: string, ex: number, ey: number, st: RideArtState): boolean; slice(ctx, sl: SliceRec, f: ViewFrame, extras: boolean): void; widenRuns(s: WorldSamples, runs: readonly number[]): number[]; noteDerived(out: string, hex: string, f: number): void; noteMixed(out: string, a: string, b: string, t: number): void }` (parameter types as the Classic functions).
  - `const surfaceArt: { on: SurfaceArt | null }` and `const pixel: { rt: PixelRuntime | null }` (`PixelRuntime` is declared here by Task 10; this task declares it as `interface PixelRuntime {}`).
- Produces, `src/render/pixel/surfaceArt.ts`: `installSurfaceArt(): void` (sets `surfaceArt.on` to the stage 0 functions: `isPixelSurface`, `pixelBox`, …, `drawGuestPixel`, `PIXEL_RIDE_ART` lookup returning `false` without a twin, `paintSlicePixel`, `widenRuns`, `noteDerived`, `noteMixed`) and `clearSurfaceArt(): void`.
- Stage 0 Classic-file branches that are not copied: `canvas.ts` `buildPixelSprite` (Task 3 `paintPicture` replaces it), `terrain.ts` `buildPixel`, `renderer.ts`, `quality.ts`, `main.ts`, `layers.ts`, `worldLayers.ts`, `management/layer.ts`, `scenery/layer.ts`, `main.css` (Tasks 10 to 12 do their runtime work), `import.meta.env.VITE_PROTO_DROP` (dropped).

- [ ] **Step 1: Write `hook.test.ts`**

```ts
it('without the hook, art on a recorder gives today\'s ops', () => {
  // clearSurfaceArt(); Recorder ops of drawRideArt('carousel', 3, 3, …), drawGuestArt, drawStallArt, box(): equal to the
  // op lists of the same calls recorded before any install in this file (no branch taken)
});
it('with the hook, a surface paints the stage 0 twin', () => {
  // installSurfaceArt(); a PixelSurface of rideArtBounds('carousel', 3, 3, 2); drawRideArt(...) then finish():
  // hash() equals the hash of PIXEL_RIDE_ART.carousel painted directly on a second surface with the same bounds
});
it('the stall in-art shadow is skipped on a surface only', () => { /* recorder: poly3 with rgba(20,30,20,0.18) present; surface: no pixel of that colour */ });
it('track slices widen their runs only with the hook on', () => { /* sliceBounds of one slice: wider with installSurfaceArt() */ });
```

Copied stage 0 tests get one change each: `beforeAll(installSurfaceArt)`, `afterEach(clearSurfaceArt)` in place of `setArtStyle` calls where they relied on the branches; their assertions stay.

- [ ] **Step 2: Copy the files, run the tests to see `hook.test.ts` fail**

Run: `PROTO=/tmp/tc-phase8b-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/render/pixel`. Expected: FAIL (no `artHook.ts`).

- [ ] **Step 3: Implement the hook file, `surfaceArt.ts`, `art/track.ts` and the hook branches**

- [ ] **Step 4: Run the gates.** Expected: all pass; `static-ok`; `classicOps.test.ts` skips (no `TC_PROTO_OUT`).

- [ ] **Step 5: Stage** (`git add -A`), then Step 6b.

---

### Task 3: Picture, PNG, index and packing formats

**Files:**
- Create: `src/render/pixel/app/format.ts` (shared by tool and runtime: index codec, CRC-32, palette swap, trimmed hash), `tools/sheets/picture.ts`, `tools/sheets/png.ts`, `tools/sheets/pack.ts`
- Test: `tests/unit/tools/sheets/format.test.ts`, `tests/unit/tools/sheets/pack.test.ts`

**Interfaces:**
- Produces, `tools/sheets/picture.ts`:
  - `interface Picture { w: number; h: number; ox: number; oy: number; slots: Uint8Array }` (row-major slot indices, 0 transparent).
  - `evenBounds(b: ArtBounds): ArtBounds` (stage 0 `canvas.ts`).
  - `paintPicture(bounds: ArtBounds, paint: (ctx: Ctx) => void, opts?: SurfaceOptions): Picture` (stage 0 `buildPixelSprite` without canvas: `new PixelSurface(evenBounds(bounds), opts)`, `paint`, `finish()`, slots via `pixel(x, y)`).
  - `trim(p: Picture): Picture` (drop fully transparent border rows and columns, anchor kept); `pictureHash(p: Picture): number` (FNV-1a over `w, h, ox, oy` as int32 LE and the slots; dedupe key).
- Produces, `tools/sheets/png.ts`: `encodeIndexedPng(w: number, h: number, slots: Uint8Array, paletteRgb: Uint8Array): Uint8Array` (signature, IHDR colour type 3 bit depth 8, PLTE with every slot, tRNS of one byte `0` so index 0 is transparent and all others opaque, one IDAT `deflateSync` level 9 with filter 0, IEND; no `gAMA`, `cHRM`, `sRGB`, `iCCP`); `sheetName(slots: Uint8Array, paletteRgb: Uint8Array): string` (first 10 hex digits of SHA-256 over palette then slots).
- Produces, `tools/sheets/pack.ts`: `packGroups(groups: Array<{ id: string; pics: Picture[] }>, max = 2048, gap = 2): Array<{ group: string; w: number; h: number; places: Array<{ pic: number; x: number; y: number }> }>`: shelf packing per group, pictures sorted by height then width descending; a group never shares a sheet with another group and spans more sheets when needed; sheet size = used box rounded up to a multiple of 4; a picture larger than `max − 2 × gap` throws.
- Produces, `src/render/pixel/app/format.ts`:
  - `const INDEX_MAGIC = 0x54433042` ('TC0B'), `INDEX_VERSION = 1`.
  - Swap numbers (shared by tool and runtime): a sheet with `swappable` 1 to 3 takes `swap` = the track palette colour 0 to 11 and uses table `(swappable − 1) × 12 + swap`; a ghost sheet (`swappable` 4) takes `swap` 0 (valid) or 1 (invalid) and uses table `36 + swap`; `swap` −1 means the plain sheet. `swapTableIndex(swappable: number, swap: number): number`.
  - `interface PackIndex { palette: Uint8Array /*RGB per slot*/; swaps: Uint8Array[] /*38 tables in the order above: slot → slot*/; sheets: Array<{ file: string; w: number; h: number; swappable: number /*0 none, 1 rt, 2 rs, 3 rc, 4 ghost*/ }>; kind: Uint8Array; key: Float64Array; sheet: Uint16Array; x: Uint16Array; y: Uint16Array; w: Uint16Array; h: Uint16Array; ox: Int16Array; oy: Int16Array }`.
  - `encodeIndex(ix: PackIndex): Uint8Array`, `decodeIndex(bytes: Uint8Array): PackIndex` (little-endian; sheet file names as UTF-8 with a u16 length; throws on a wrong magic or version).
  - `crc32(bytes: Uint8Array, start: number, end: number): number`.
  - `swapPalette(png: Uint8Array, table: Uint8Array, paletteRgb: Uint8Array): Uint8Array` (a copy whose PLTE entry `i` is `paletteRgb[table[i]]`, with a new PLTE CRC; other chunks byte-identical).
  - `trimmedHash(rgba: Uint8Array, w: number, h: number, ox: number, oy: number, skipRgb: number /* -1 none */): number`: box of pixels with alpha 255 whose RGB is not `skipRgb`; FNV-1a over `x0 − ox, y0 − oy, x1 − ox, y1 − oy` (int32 LE) and the RGBA bytes of the box (skipped pixels as 4 zero bytes); an empty box hashes the four zeros.

- [ ] **Step 1: Write the failing tests**

```ts
// format.test.ts
it('index round trip', () => { /* 2 sheets, 3 entries with key 2 ** 47 + 5, ox −7: decodeIndex(encodeIndex(ix)) deep-equals ix */ });
it('index rejects a wrong magic', () => expect(() => decodeIndex(new Uint8Array(16))).toThrow());
it('PNG is indexed, has no colour-space chunk, index 0 transparent', () => {
  // chunk types of encodeIndexedPng(3, 2, …, palette of 4 slots) are exactly ['IHDR','PLTE','tRNS','IDAT','IEND']; byte 25 (colour type) is 3;
  // inflateSync of IDAT gives rows of [0, …slots]
});
it('crc32 matches zlib', () => expect(crc32(bytes, 0, bytes.length)).toBe(zlib.crc32(bytes)));
it('swapPalette rewrites PLTE only', () => { /* table [0,2,1,3]: PLTE entries 1 and 2 swapped; IDAT bytes equal; CRC of PLTE valid */ });
it('trimmedHash ignores padding and skipped pixels', () => {
  // the same 2 × 2 opaque block at (1, 1) of a 4 × 4 image (ox 1, oy 1) and at (0, 0) of a 2 × 2 image (ox 0, oy 0): equal hashes;
  // a third image with one extra pixel of skipRgb: equal hash with skipRgb, different without
});
it('sheetName depends on palette and slots, not on PNG bytes', () => { /* two encodes at deflate levels 1 and 9: same sheetName */ });
// pack.test.ts
it('two groups never share a sheet; gap 2; no overlap; max size held', () => { /* 2 groups of 40 pictures 100 × 80 */ });
it('a group larger than one sheet spans sheets', () => { /* 600 pictures of 120 × 120 in one group: ≥ 2 sheets, each ≤ 2048 */ });
it('an oversized picture throws', () => expect(() => packGroups([{ id: 'a', pics: [pic(2045, 10)] }])).toThrow());
```

- [ ] **Step 2: Run to see them fail**

Run: `PROTO=/tmp/tc-phase8b-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/tools/sheets`. Expected: FAIL (missing modules).

- [ ] **Step 3: Implement the four files.**

- [ ] **Step 4: Run the tests and the gates.** Expected: PASS.

- [ ] **Step 5: Stage**, then Step 6b.

---

### Task 4: Reserved ramps, swap and ghost tables, shadow pictures

**Files:**
- Modify: `src/render/pixel/palette.ts` (ramps `rt`, `rs`, `rc` after `u`; `nearestInFamily` never returns them)
- Create: `tools/sheets/ramps.ts`
- Test: `tests/unit/tools/sheets/ramps.test.ts`

**Interfaces:**
- Consumes: `slotOf`, `slotIndex`, `SLOT_RGBA`, `RAMPS` (palette); `noteDerived` records (Task 2 hook); `TRACK_PALETTE` (`src/render/track/colours.ts:5`); `casterMask` (`src/render/pixel/shadows.ts`).
- Produces, `tools/sheets/ramps.ts`:
  - `SENTINEL = { track: '#7f7f81', supports: '#7f817f', car: '#817f7f' }` (no literal under `src/render/` equals them: the test greps).
  - `withRoles<T>(fn: () => T): T`: runs `fn` with a colour rule in front of `slotOf`: a sentinel resolves to tone 3 of its ramp; `shade(sentinel, f)` (seen through the derived memo) to tone `clamp(3 − round(ln f / ln 1.18), 1, 6)`; every other colour as `slotOf`.
  - `swapTable(role: 'track' | 'supports' | 'car', colour: number): Uint8Array` (identity except the 6 slots of the role's ramp; tone `t` → Test decision 5).
  - `ghostTable(valid: boolean): Uint8Array` (phase-8 spec §6.3: `q` tones for valid, `u` for invalid, by HSL `L` ≥ 0.75 / 0.5 / 0.25 / else; 0 stays 0; `INK_SLOT` → tone 4).
  - `SHADOW_SLOT = slotIndex('i1')`; `shadowPicture(m: CasterMask, phase: 0 | 1): Picture` (slot `SHADOW_SLOT` where `m.bits` is 1 and `(x + y + phase) & 1` is 0; anchor `(m.cx, m.cy)`).

- [ ] **Step 1: Write the failing tests**

```ts
it('the reserved ramps exist and move no stage 0 slot', () => { /* slotIndex('u4') unchanged against a list of the stage 0 SLOT_NAMES length; slotIndex('rt1') > slotIndex('u4') */ });
it('paint with a sentinel lands in the role ramp', () => {
  // withRoles(() => paintPicture(CAR_BOUNDS, (c) => paintCar(c, 'coaster', 0, 0, SENTINEL.car, true, 0, 1))): every non-ink, non-transparent
  // slot whose colour came from the car body is an rc slot; no slot of the n ramp from the body
});
it('swapTable maps rt tones to the colour ramp and leaves others', () => {
  const t = swapTable('track', 0); // cherry
  expect(t[slotIndex('rt3')]).toBe(slotOf(TRACK_PALETTE[0]!));
  expect(t[slotIndex('g2')]).toBe(slotIndex('g2'));
});
it('ghostTable thresholds', () => { /* a light slot → q1; INK_SLOT → q4; 0 → 0; invalid uses u */ });
it('shadow pictures are half dithered and the two phases are complementary', () => {
  // for a 10 × 4 all-ones mask: phase 0 and phase 1 each set 20 pixels, never the same pixel, every set slot is SHADOW_SLOT
});
```

- [ ] **Step 2: Run to see them fail** (`npx vitest run tests/unit/tools/sheets/ramps.test.ts`).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and the gates.**
- [ ] **Step 5: Stage**, then Step 6b.

---

### Task 5: Catalogue of objects, ghosts, shadows and people

**Files:**
- Create: `src/render/pixel/app/keys.ts`, `tools/sheets/catalogue/types.ts`, `tools/sheets/catalogue/objects.ts`, `tools/sheets/catalogue/people.ts`
- Test: `tests/unit/tools/sheets/catalogueObjects.test.ts`

**Interfaces:**
- Produces, kind codes in `src/render/artHook.ts` (so Classic files may import them): `K_RIDE 1, K_STALL 2, K_SCENERY 3, K_PATH_ITEM 4, K_DECAL 5, K_FENCE 6, K_ENTRANCE 7, K_SHOW 8, K_GUEST 9, K_STAFF 10, K_SHADOW 11, K_GHOST 12, K_RAIL 13, K_SUPPORT 14, K_GATE 15, K_CAR 16, K_DECK 17, K_POST 18, K_GROUND 19`. `src/render/pixel/app/keys.ts` (runtime and tool) re-exports them and adds: `shadowKey(kind: number, defId: string, view: number, phase: 0 | 1): number`; `ghostKey(kind: number, defId: string, view: number): number`. Objects and people keep today's cache keys with bucket 0.5: `spriteKey` (rides, stalls, fence, entrance, show sites), `scenerySpriteKey`, `pathItemSpriteKey`, `decalSpriteKey`, `guestSpriteKey`, `staffSpriteKey` (`src/render/spriteCache.ts`, `src/render/sprites/bank.ts:61-77`, `src/render/scenery/sprites.ts`).
- Produces, `tools/sheets/catalogue/types.ts`: `interface PictureSpec { pack: string; group: string; kind: number; key: number; paint(): Picture; ref: [method: string, ...args: Array<string | number>] | null }`; `type Catalogue = Iterable<PictureSpec>`.
- Produces, `objects.ts`: `objectSpecs(): PictureSpec[]`:
  - packs `rides-full` (every flat ride of `src/data/catalog/flatRides.ts`, view rotation 0 to 3, angle 0 to 31, occupancy 0 to 4; `swing_tower` also swing 0 to 4), group `<defId>/<view>/<occupancy>`; `rides-coarse` the frames of `coarseRideFrame` (even angles, occupancy 0, 2, 4), same groups, its own sheets. Paint: `drawRideArt` with `rideArtBounds` as `SpriteBank.ride` (`bank.ts:97-111`) decodes the frame. `ref: ['ride', defId, w, d, view, frame]`.
  - pack `objects`: stalls (`drawStallArt`, every stall def × 4 views; `ref ['stall', …]`), scenery (every def × facing 0 to 3 × the frames of `SCENERY_FRAME` wilted and arch parts that the def can show; `artOpts`; `ref ['scenery', key, defId, f, frame]`), path items (`drawPathItemArt` frames of `pathItemFrame`; `ref ['pathItem', key, frame]`), decals (litter 0 to 3, mess 8 to 9, flip 0 and 1), fence (4), entrance (part 0, 1 × outer 0 to 3 and −1), show sites (every show def × 4). Groups: one per kind and def.
  - pack `ghosts`: `K_GHOST` frame-0 picture of every ride, stall, scenery and show def × 4 views; group `ghost/<kind>`; sheets `swappable` 4; `ref null`.
  - pack `shadows`: `K_SHADOW` `shadowPicture(casterMask(casterOf(kind, defId, view), view), phase)` for rides, stalls and scenery with a caster (stage 0 `casterOf`); group `shadow`; `ref null`.
- Produces, `people.ts`: `peopleSpecs(): PictureSpec[]`, pack `people`: guests (every `guestFrame(colour, walk, look, tinted, items)` the game makes: shirt colour 0 to 11 untinted and step 0 to 8 tinted, walk 0 to 3, look 0 to 3, items 0, balloon, umbrella; facing 0 to 3), each picture = the stage 0 guest stamp on top of `shadowPicture(casterMask(GUEST_SHADOW, 0), 0)` (shadow pixels only where the stamp is transparent; bounds = union); `ref ['guest', key, facing, frame]`. Staff: every `staffFrame` value of `src/render/sprites/staff.ts` × facing 0 to 3; `ref ['staff', key, facing, frame]`. Groups: `guest/<facing>`, `staff`.
- Paint runs inside `withRoles` (Task 4) with `installSurfaceArt()` on.

- [ ] **Step 1: Write the failing tests**

```ts
it('keys equal the game key functions', () => {
  // for 50 specs of each kind (fixed stride): the spec key equals the key the game computes for the ref fields, e.g.
  // spriteKey(defId, view, frame, 0.5) for rides, guestSpriteKey(facing, frame, 0.5) for guests
});
it('keys are unique per kind and pack', () => { /* Set size equals spec count */ });
it('ride counts: full and coarse sets', () => {
  // rides-full: 18 × 4 × 32 × 5 + swing_tower extra (4 × 32 × 5 × 4); rides-coarse: 18 × 4 × 16 × 3 + swing_tower extra
});
it('group rule: a rides group holds one ride, one view and one occupancy', () => { /* every group id parses to one (defId, view, occupancy) */ });
it('guest pictures hold the stamp and a shadow under it', () => {
  // one guest spec: picture has SHADOW_SLOT pixels; with SHADOW_SLOT pixels cleared, trimmedHash equals the stage 0 stamp on a surface
});
it('a ride picture equals the stage 0 surface for the same call', () => {
  // spec of carousel view 2 frame 0: paint() slots equal paintPicture(rideArtBounds(…), (c) => drawRideArt(c, …)) slots
});
```

- [ ] **Step 2: Run to see them fail** (`npx vitest run tests/unit/tools/sheets/catalogueObjects.test.ts`).
- [ ] **Step 3: Implement `keys.ts`, `types.ts`, `objects.ts`, `people.ts`.** Enumerate frames from the game's own frame functions (`encodeRideFrame`, `coarseRideFrame`, `guestFrame`, `staffFrame`, `pathItemFrame`), never by hand-written numbers.
- [ ] **Step 4: Run the tests and the gates.**
- [ ] **Step 5: Stage**, then Step 6b.

---

### Task 6: Catalogue of track and elevated paths

**Files:**
- Modify: `src/render/pixel/app/keys.ts` (`railKey`, `supportKey`, `gateKey`, `carKey`, `deckKey`, `postKey`)
- Create: `tools/sheets/catalogue/track.ts`, `tools/sheets/catalogue/elevated.ts`
- Test: `tests/unit/tools/sheets/catalogueTrack.test.ts`

**Interfaces:**
- Consumes: `buildRideSlices`, `paintSlice` (`src/render/track/layer.ts:253, 335`), `paintSupport`, `paintGateBooth`, `paintCar`, `yawStep`, `pitchStep`, `rollStep`, `CAR_SHAPES`, `GATE_BOUNDS`, `CAR_BOUNDS` (`track/layer.ts`, `track/paint.ts`), `samplesOf` and the track piece defs (`src/data/track/`), `ELEVATED_COLOURS`, `DECK_PX` (`src/render/elevated/layer.ts:24-36`).
- Produces, `keys.ts`: `railKey(typeIdx: number, pieceIdx: number, dir: number, tile: number, view: number): number`; `supportKey(styleIdx: number, part: 0 | 1 | 2 /*foot, step, top*/, view: number): number`; `gateKey(kind: 0 | 1, view: number): number`; `carKey(shape: number, yaw: number, pitch: number, roll: number, front: 0 | 1): number`; `deckKey(kind: 0 | 1, ramp: -1 | 0 | 1 | 2 | 3): number`; `postKey(corner: 0 | 1 | 2 | 3): number`. Index tables `TRACK_TYPE_IDS`, `TRACK_PIECE_IDS`, `SUPPORT_STYLES` sorted, so the runtime and the tool share the numbers.
- Produces, `track.ts`: `trackSpecs(): PictureSpec[]`, pack `track`:
  - rails: for every track type and every piece its type allows (`groups`, `excludePieces`), direction 0 to 3, each tile of the piece (`trackTileSlices` order), view 0 to 3: build a one-piece world (a station-less test record is enough: `buildRideSlices` on a world whose track data holds that one piece at (16, 16, z 4)), drop the support, paint with the role sentinels (`colours.track = SENTINEL.track`); anchor = tile centre at the piece's base height. Group `rail/<type>/<view>`; sheets `swappable` 1.
  - supports: per support style and view: foot, one step (8 world px) and top segments painted by `paintSupport` with `SENTINEL.supports`; group `support/<style>`; `swappable` 2.
  - gates: entrance and exit × view with `SENTINEL.track`; group `gate`; `swappable` 1.
  - cars: the pose walk: for every piece def, both directions of travel and every sample of `samplesOf`, collect `(yawStep, pitchStep, rollStep)`; for every car shape × collected pose × front 0/1 paint `paintCar` with `SENTINEL.car`. Group `car/<shape>`; `swappable` 3. Prints the pose count.
  - `ref null` for all (new keys, B1 format check only).
- Produces, `elevated.ts`: `elevatedSpecs(): PictureSpec[]`, pack `track`: decks (footpath, queue × ramp −1 and view direction 0 to 3) with the polygons of `drawDeck` at scale 1 (corner offsets and `DECK_PX` 4; a ramp raises the two corners of its direction by one step, as `corners()`), posts (corner 0 to 3, one step, `supportDark` at corner 1). Group `elevated`.

- [ ] **Step 1: Write the failing tests**

```ts
it('rail pictures of one piece at two heights are the same picture', () => { /* the tool paints at z 4; a second paint at z 7 gives equal slots and anchor */ });
it('rail pictures hold only rt slots, ink and transparent', () => { /* for 20 specs: every slot ∈ rt ramp ∪ {INK_SLOT, 0} ∪ fixed tie and deck colours listed in the test */ });
it('the pose walk finds the corkscrew rolls', () => { /* some pose with rollStep ≠ 0 for corkscrew_right; the pose set size is printed and > 16 */ });
it('car pictures of the same pose and different colours do not exist (one picture, swapped)', () => { /* keys unique without a colour field */ });
it('deck pieces: 10 decks and 4 posts', () => expect(elevatedSpecs().length).toBe(14));
```

- [ ] **Step 2: Run to see them fail.** `npx vitest run tests/unit/tools/sheets/catalogueTrack.test.ts`.
- [ ] **Step 3: Implement.** If a piece type cannot be built alone (a station rule), build the smallest valid piece list and take the slices of the wanted piece; record which pieces needed it in the task report.
- [ ] **Step 4: Run the tests and the gates.**
- [ ] **Step 5: Stage**, then Step 6b.

---

### Task 7: Catalogue of ground pieces

**Files:**
- Modify: `src/render/pixel/app/keys.ts` (`groundKey`)
- Create: `src/render/pixel/app/faces.ts`, `tools/sheets/catalogue/ground.ts`
- Test: `tests/unit/tools/sheets/catalogueGround.test.ts`

**Interfaces:**
- Consumes: stage 0 `ground.ts` (`hash3`, `setRule`/`colourAt` through `paintGroundChunk` on a synthetic map, `OUTSIDE_TONE_STEPS`, `FACE_LEFT`, `FACE_RIGHT`, `WATER_SLOT`).
- Produces, `keys.ts`: `groundKey(part: 0 | 1 | 2 | 3 /*top, path, face, water*/, a: number, b: number, c: number, d: number): number` with fields: top `(terrain 0-4, viewMask 0-15, owned 0-1, variant 0-3)`; path `(content 0 footpath / 1 queue / 2 entrance, viewMask ∈ {0,3,6,12,9}, edges 0-15 in view directions N E S W bits 1 2 4 8, variant)`; face `(side 0 E / 1 S, cap 0 none / 1 high at the first corner / 2 high at the second, 0, 0)`; water `(0, 0, 0, 0)`. `GROUND_VARIANT_SEED = 0x0b`; `groundVariant(x: number, y: number): number = hash3(x, y, GROUND_VARIANT_SEED) & 3`.
- Produces, `faces.ts` (pure, runtime and test): `faceStack(topA: number, topB: number, bottomA: number, bottomB: number): { from: number; steps: number; cap: 0 | 1 | 2 }` in height steps: `from = min(bottomA, bottomB)`, `steps = min(topA, topB) − from` (0 when negative), `cap` by `topA − topB` (+1 → 1, −1 → 2, 0 → 0). Returns `steps 0, cap 0` when neither top is above its bottom (no face, as stage 0 `paintGroundTile` conditions).
- Produces, `ground.ts`: `groundSpecs(): PictureSpec[]`, pack `ground`, group `ground` (one group; may span sheets): tops painted as the top of the centre tile of a 3 × 3 synthetic map (heights 4, the view mask applied to the centre, owned flag, the variant chosen by placing the tile at map coordinates whose `groundVariant` equals it), faces (one step, caps), paths (synthetic neighbours give the edge mask), water. Anchor: the tile's top corner at its base height. `ref null`.

- [ ] **Step 1: Write the failing tests**

```ts
it('faceStack', () => {
  expect(faceStack(6, 6, 4, 4)).toEqual({ from: 4, steps: 2, cap: 0 });
  expect(faceStack(7, 6, 4, 5)).toEqual({ from: 4, steps: 2, cap: 1 });
  expect(faceStack(4, 4, 4, 4)).toEqual({ from: 4, steps: 0, cap: 0 });
});
it('ground key fields are distinct', () => { /* all specs: unique keys */ });
it('piece counts', () => { /* tops 5 × 16 × 2 × 4 = 640; paths 3 × 5 × 16 × 4 = 960; faces 6; water 1 */ });
it('a flat grass top piece covers exactly the tile diamond', () => { /* opaque pixels of top(0, 0, 1, v) = the art pixels whose centres lie in the diamond (stage 0 flatTop rule) */ });
it('grassValue variation exists between variants', () => { /* 4 variant pictures of a flat grass top: 4 different hashes */ });
```

- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and the gates.**
- [ ] **Step 5: Stage**, then Step 6b.

---

### Task 8: Sheet build, Vite plugin and the two outputs

**Files:**
- Create: `tools/sheets/entry.ts` (the module the runner loads: `installSurfaceArt()`, then all catalogues), `tools/sheets/build.ts`, `tools/sheets/plugin.ts`, `scripts/check-app.ts`
- Modify: `vite.config.ts` (mode-aware), `src/vite-env.d.ts` or a new `src/art-virtual.d.ts` (`declare module 'virtual:tc-art'`), `src/main.ts` (`registerOffline` only when `import.meta.env.MODE !== 'app'`), `src/ui/settings/model.ts:98` (offline row left out in app mode), `src/ui/offline/index.ts` (update toast left out in app mode), `playwright.config.ts` (app server; `tablet` project), `package.json` (scripts `build:app`, `check:app`)
- Test: `tests/unit/tools/sheets/build.test.ts`

**Interfaces:**
- Consumes: Tasks 3 to 7.
- Produces, `tools/sheets/build.ts`: `buildSheets(specs: Iterable<PictureSpec>, opts: { coarseOnly?: boolean }): { files: Array<{ path: string; bytes: Uint8Array }>; packs: Array<{ name: string; index: string; hash: string }>; report: ArtReport; keys: Record<string, KeyRow[]> }`. Paths: `art/<pack>/<group-safe>-<sheetName>.png` and `art/<pack>/index-<hash>.bin`. Dedupe by `pictureHash` within a group (several keys may point at one placement). `ArtReport = { packs: Record<string, { pictures: number; unique: number; sheets: number; pngBytes: number; decodedBytes: number }>; kinds: Record<string, { pictures: number; unique: number; pngBytes: number }>; totalPngBytes: number; appArtBytesFull: number; appArtBytesCoarseOnly: number; buildMs: number }`. `KeyRow = { entry: number; kind: number; key: number; ref: PictureSpec['ref'] }`.
- Produces, `tools/sheets/plugin.ts`: `sheetsPlugin(): Plugin`. App mode (`config.mode === 'app'`): in `buildStart` it calls `runnerImport('/tools/sheets/entry.ts', { configFile: false, root })`, runs `buildSheets`, emits each file with `this.emitFile({ type: 'asset', fileName, source })`; with `VITE_BENCH=1` also emits `bench/build1.json`, `bench/build2.json`, `bench/phone.json` (from `tests/perf/`) and, when the file exists, `bench/cases.json` (from `tests/perf/cases-0b.tcsave.json`, Task 9). Virtual module `virtual:tc-art` exports `packs: Array<{ name: string; url: string; hash: string }>` (URLs relative to `base`) and `report`. Web mode: `packs = []`, no files. Dev server (`npm run dev -- --mode app`): serves the files from memory. Disk cache: `node_modules/.cache/tc-sheets/<sha256 of the tool's input files and catalogue source>.json` + files; a hit skips the paint. Writes the report to `process.env.TC_ART_REPORT` and the key rows to `process.env.TC_ART_KEYS/<pack>.json` when set. Prints one line per pack and the totals.
- Produces, `vite.config.ts`: `defineConfig(({ mode }) => ({ base: './', build: { target: 'es2022', sourcemap: true }, plugins: mode === 'app' ? [sheetsPlugin(), dropWorker()] : [swManifestPlugin(), sheetsPlugin()] }))`; `dropWorker()` deletes `sw.js` from the app output folder in `closeBundle`.
- Produces, `scripts/check-app.ts`: `checkApp(dir: string): { ok: boolean; lines: string[] }`: every file under `<dir>/art/` is named in an index and every index entry's sheet exists; no `sw.js`, no `sw-manifest.json`; art bytes per pack and total; warns above 150 MB. CLI prints the lines and exits 1 when not ok.
- Produces, `playwright.config.ts`: with `TC_APP=1` the server command is `npx tsc --noEmit && npx vite build --mode app --outDir dist-app && npx vite preview --outDir dist-app --port ${port} --strictPort` and the server `timeout` is `1_800_000`; without it, today's command. New project `{ name: 'tablet', use: { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, launchOptions } }`.

- [ ] **Step 1: Write the failing test**

```ts
it('builds a small catalogue into sheets and an index that decodes', () => {
  // buildSheets(first 200 specs of objectSpecs() and 20 of groundSpecs()): every index entry's sheet file exists in files;
  // decodeIndex of each index; each entry's rectangle lies inside its sheet; report.packs totals equal the sums
});
it('the same input gives the same file names', () => { /* two runs: equal paths */ });
it('checkApp finds a missing sheet and an extra file', () => { /* temp dir from the build above, one sheet removed, one stray file added */ });
```

- [ ] **Step 2: Run to see it fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and the gates.**
- [ ] **Step 5: First full app build and web build**

```bash
set -e
PROTO=/tmp/tc-phase8b-proto
cd "$PROTO/wt"
mkdir -p "$PROTO/out/art"
TC_ART_REPORT="$PROTO/out/art/report.json" TC_ART_KEYS="$PROTO/out/art/keys" npx vite build --mode app --outDir dist-app 2>&1 | tail -30
node scripts/check-app.ts dist-app
npx vite build 2>&1 | tail -3
test ! -e dist/art && echo web-no-art
```

Run with `run_in_background` and `timeout: 3600000`. Expected: one line per pack; `check-app` exits 0; `web-no-art`. Record `buildMs` and the cache folder size in `$PROTO/out/art/build-notes.md`; run the app build once more and record the cached build time (the dev start must stay fast, §5.1 item 7).

- [ ] **Step 6: Stage**, then Step 6b.

---

### Task 9: Cases park save and the size and memory projection (gate before timing)

**Files:**
- Create: `tests/perf/casesScene.ts`, `tests/unit/perf/casesScene.test.ts`, `tools/sheets/project.ts`, `tests/unit/tools/sheets/project.test.ts`
- Output: `tests/perf/cases-0b.tcsave.json` (worktree only), `$PROTO/out/projection.json`, `$PROTO/out/projection.md`

**Interfaces:**
- Produces, `tests/perf/casesScene.ts`: `buildCasesScene(): World` on a 64 × 64 map with commands as `tests/perf/scenes.ts` (`executeCommand` with `{ setup: true }`, research unlocked, cash written in): all 18 flat rides (rows of 5, rotation 2, queue and exit paths); a `steel_coaster` with a chain lift, a drop, medium turns, `corkscrew_right`, supports at heights 1 to 6 (built over raised and lowered ground) and colours `track 6, supports 9, cars 0` (not the defaults); a footpath on the ground and an elevated footpath line at `z 10` with a ramp; a 6 × 6 raised plateau with cliffs, a slope band, and a pond (`lowerLand`, `raiseWater`); 120 guests via `addGuestDirect`; `SETTLE_TICKS` 200. Same seed rule as `scenes.ts`.
- `casesScene.test.ts`: with `TC_WRITE_SCENES=1` writes the save with `serialize(world, GAME_VERSION, SCENE_SAVED_AT)`; always: the save deserializes, has 18 flat rides, 1 track ride with a corkscrew piece, ≥ 1 elevated path, water tiles and ≥ 3 support heights.
- Produces, `tools/sheets/project.ts`: `projectScene(world: World, packs: LoadedPacks, device: { cssW: number; cssH: number; dpr: number; stretch: number; coarse: boolean }, view: number): { sheetsMb: number; swapMb: number; chunkMb: number; staticMb: number; totalMb: number; sheets: number }`: the sheets that the objects of the park need in that view (rides: the groups of their current occupancy; guests and staff: every `people` sheet; scenery, stalls, path items, fence, entrance, shows: their groups; shadows; ground: every `ground` sheet; track: rail sheets of the used types in that view, swapped once per used colour, support and car sheets likewise); chunk images: the chunks that meet the viewport at the home zoom × chunk image bytes (`CHUNK_SIZE` 8 tiles at `ART_SCALE` 0.5); static layer: canvas width × height × 4. The value per scene is the maximum over views 0 to 3.

- [ ] **Step 1: Write both tests** (`casesScene.test.ts` above; `project.test.ts`: a world with one carousel and one guest on a fake index of known sheet sizes gives the exact sum; a swapped track sheet counts once per colour).
- [ ] **Step 2: Run to see them fail; implement; run to pass.**
- [ ] **Step 3: Write the save and the projection**

```bash
set -e
PROTO=/tmp/tc-phase8b-proto
cd "$PROTO/wt"
TC_WRITE_SCENES=1 npx vitest run tests/unit/perf/casesScene.test.ts
TC_PROJECT_OUT="$PROTO/out/projection.json" TC_PROJECT_DIST=dist-app npx vitest run tests/unit/tools/sheets/project.test.ts
cat "$PROTO/out/projection.json"
```

The output part of `project.test.ts` (`describe.skipIf(!process.env.TC_PROJECT_OUT)`) loads the indexes of `dist-app`, the four saves (`phone`, `build1`, `build2`, `cases`) and writes, per scene and device (phone: the viewport and scale of Playwright's `devices['Pixel 7']`, k 3, coarse set; tablet: 1024 × 1366, dpr 2, k 2, full set and coarse set), the projection, plus the art report of Task 8 (size per kind, total, projected app art size for both frame sets, decoded bytes per pack).

- [ ] **Step 4: Write `projection.md` and apply the gate.** One table: scene × device × frame set → total MB with its parts. **Gate (§6 "Before the timing runs"): if any phone value or any tablet coarse-set value is above 64 MB, stop the plan here and report to the controller** (the controller reports to the owner). A tablet full-set value above 64 MB only means tablets get the coarse set (B4); record it.
- [ ] **Step 5: Stage**, then Step 6b.

---

### Task 10: App runtime: picture store and app boot

**Files:**
- Modify: `src/render/artHook.ts` (the `PixelRuntime` interface), `src/render/spriteCache.ts` (`Sprite` gets optional `sx?: number; sy?: number`), `src/main.ts` (app boot)
- Create: `src/render/pixel/app/store.ts`, `src/render/pixel/app/runtime.ts`, `src/render/pixel/app/progress.ts`, `src/render/pixel/app/stats.ts`; strings `art.progress` and `art.decodeError` in `src/data/strings/en.ts` and `en-XA.ts` (as the existing keys)
- Test: `tests/unit/render/pixel/store.test.ts`

**Interfaces:**
- Produces, `artHook.ts` `PixelRuntime` (Tasks 11 and 12 implement the drawing members):
  ```ts
  interface PixelPlan { stretch: number; canvasW: number; canvasH: number; boxW: number; boxH: number; homeZoom: number; budgetBytes: number; coarse: boolean; device: 'phone' | 'tablet' }
  interface PixelFrame { n: number; scale: number; offX: number; offY: number; night: boolean }
  interface PixelRuntime {
    plan(cssW: number, cssH: number, dpr: number): PixelPlan;
    beginFrame(cam: Camera, world: World, cssW: number, cssH: number, dpr: number, alpha: number): PixelFrame;
    picture(kind: number, key: number, swap?: number): Sprite | null;
    blit(ctx: CanvasRenderingContext2D, sp: Sprite, wx: number, wy: number): void;
    blitColumn(ctx: CanvasRenderingContext2D, sp: Sprite, ax: number, ay: number, colL: number, colR: number, ends: number): void;
    snapWalker(ax: number, ay: number, slope: 0 | 0.5 | -0.5, out: { x: number; y: number }): void;
    chunk(map: MapState, rect: { u0: number; v0: number; u1: number; v1: number }, r: ViewRotation, geom: ArtBounds): Sprite | null; // null: a piece is still decoding
    drawShadows(ctx: CanvasRenderingContext2D, world: World, f: LayerFrame): void;
    drawTrack(ctx: CanvasRenderingContext2D, what: 'slice' | 'car' | 'gate', rec: unknown, f: LayerFrame): boolean;
    drawElevated(ctx: CanvasRenderingContext2D, p: ElevatedPath, world: World, f: LayerFrame): void;
    endFrame(staticBytes: number, chunkBytes: number): void;
  }
  ```
- Produces, `store.ts`: `class PictureStore { constructor(io: StoreIo, budgetBytes: number); load(packs: PackRef[], coarse: boolean): Promise<void>; get(kind: number, key: number, swap: number): Sprite | null; beginFrame(): void; endFrame(otherBytes: number): void; readonly sheetBytes: number; readonly swapBytes: number; readonly queued: number; readonly decoded: number; readonly missing: number }`. `StoreIo = { fetch(url: string): Promise<Uint8Array>; decode(png: Uint8Array): Promise<{ image: CanvasImageSource; close(): void }>; now(): number }`; the browser `decode` is `createImageBitmap(new Blob([png], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })`. Rules: `get` returns a `Sprite` with `sx`, `sy`, `scale` 0.5 when the sheet (or its swap) is decoded; else queues it (at most 4 decodes in flight), counts `missing` and returns null. A swap decode rewrites the PLTE with `swapPalette` (time of that main-thread part kept as `swapMainMsMax`). Bytes: `w × h × 4` per decoded sheet or swap. Eviction (`endFrame`): while `sheetBytes + swapBytes + otherBytes > budget`, close the least recently used sheet not used in this frame or the frame before. Kinds of the `ride` packs read only the set of `coarse`.
- Produces, `stats.ts`: `window.__predrawnStats = { budgetMb, budgetMbMax, sheetMb, swapMb, chunkMb, staticMb, sheetsDecoded, missing, missingTotal, incompleteFrames, incompleteAfterTurnMax, chunkMsMax, swapMainMsMax, decodeMs: Array<{ file: string; w: number; h: number; ms: number }> /*last 100*/, firstCompleteMs, frameSet, device, reset(): void }` (`reset` zeroes the maxima, totals and `decodeMs`, keeps `firstCompleteMs`).
- Produces, `runtime.ts`: `start(boot: () => void): Promise<void>`: sets `window.__tcBuild = 'app'` (both styles; Review Focus 1); resolves the style (`resolveArtStyle('auto', location.search, import.meta.env.VITE_ART)`; app default `classic`, D3 = b); for `pixel`: injects the CSS `#game[data-art="pixel"]{right:auto;bottom:auto;image-rendering:pixelated}`, loads `virtual:tc-art` indexes (`?frames=coarse|full` overrides the device's set, for B4), sets `pixel.rt`, then `boot()`; for `classic`: `boot()` only. Exposes `window.__predrawn = { packs, entries(pack: string), decodeAll(pack: string): Promise<…> }` for Task 14. Progress line (`progress.ts`): `role="progressbar"`, `aria-label` from `art.progress`, `aria-valuenow` decoded, `aria-valuemax` queued; shown while a frame is incomplete and no complete frame has been drawn yet; a decode error shows `art.decodeError` in a polite live region.
- `main.ts`: `if (import.meta.env.MODE === 'app') void import('./render/pixel/app/runtime').then((m) => m.start(boot)); else boot();`.

- [ ] **Step 1: Write the failing tests** (fake `StoreIo` with a manual clock and promises the test resolves)

```ts
it('get returns null and queues once, then the sprite after decode', async () => { /* missing 1, queued 1; after resolve: sprite with sx, sy of the entry, scale 0.5 */ });
it('at most 4 decodes in flight', () => { /* 6 sheets requested: 4 fetches started */ });
it('a sheet used this frame or the frame before is never evicted', () => { /* budget = 2 sheets; frame 1 uses A, frame 2 uses B, frame 3 needs C: A evicted, B kept */ });
it('budget parts add up', () => { /* sheetBytes + swapBytes + otherBytes reported equals the store's total; an evicted sheet leaves sheetBytes */ });
it('a swap is a separate decode and counts in swapBytes', () => { /* get(K_RAIL, key, colour 6) after the plain sheet: one more decode; swapBytes = sheet bytes */ });
it('the coarse set reads only rides-coarse', () => { /* load with coarse true: no fetch of rides-full */ });
it('browser decode options', () => { /* the browser StoreIo passes { premultiplyAlpha: 'none', colorSpaceConversion: 'none' } (spy on createImageBitmap) */ });
```

- [ ] **Step 2: Run to see them fail; implement; run to pass.** Then the gates; also `npx vite build` (web) and check `dist/assets` has no file containing `__predrawnStats` (`grep -l __predrawnStats dist/assets/*.js || echo web-clean`).
- [ ] **Step 3: Stage**, then Step 6b.

---

### Task 11: Renderer integration

**Files:**
- Modify: `src/render/renderer.ts` (plan, frame, `blit`, `blitColumn`, `collectRides` keep-last, `collectGuests` snap and dots, the shadow call after `mgmt.drawGround`, data attributes, turn tracking), `src/render/sprites/bank.ts` (each builder: `if (pixel.rt) return pixel.rt.picture(K_…, key) ?? null` before the cache), `src/render/scenery/sprites.ts` `get`, `src/render/shows/layer.ts` `sprite` and its blits, `src/render/management/layer.ts` (snapped anchors, art blit), `src/render/scenery/layer.ts` (art blits), `src/render/layers.ts` (`LayerFrame.art?: PixelFrame | null`), `src/render/pixel/app/runtime.ts` (`plan`, `beginFrame`, `picture`, `blit`, `blitColumn`, `snapWalker`, `endFrame`)
- Test: `tests/unit/render/pixel/frame0b.test.ts`, `tests/unit/render/pixel/rendererOps.test.ts` (imports nothing under `src/render/pixel/`, so it also runs in `$PROTO/base`)

**Interfaces:**
- Consumes: `PixelRuntime` (Task 10); stage 0 `grid.ts` (`makeGrid`, `artScale`, `zoomLevels`, `nearestLevel`, `snapWalker`, `walkerSlope`, `blitArt`, `blitArtColumn`, copied by Task 2, changed here to draw `sp.sx ?? 0`, `sp.sy ?? 0` as the source origin).
- Produces, `plan`: device `phone` when `isPhoneScreen(cssW, cssH)`, else `tablet`; stretch phone `max(1, ceil(dpr))`, tablet `max(1, round(dpr))` (Test decisions 2, 3); canvas `ceil(cssW × dpr / k)` × `ceil(cssH × dpr / k)`, box `canvas × k / dpr` CSS px anchored top left; `budgetBytes` 64 MB; `coarse` true on phones and on tablets with `?frames=coarse`; `homeZoom = nearestLevel(HOME_ZOOM_TARGET, grid)`; throws when `canvasW × canvasH ≥ 16 777 216`.
- Produces, renderer attributes on `#game` (Pixel only): `data-art="pixel"`, `data-stretch`, `data-home-zoom` (full precision), `data-art-scale` (`n`), `data-art-complete` (`1` once a frame has `missing === 0`). The turn tracking of stage 0 `probeFrameStart` moves into `beginFrame` and feeds `incompleteAfterTurnMax` (frames with `missing > 0` from the turn draw to the first complete frame) and `firstCompleteMs` (`performance.now()` of the first complete frame).
- `data-art-complete` and `firstCompleteMs` start again when the drawn `World` object changes (a new park or a load), so B5 measures the opened park, not the world behind the title. If New park keeps the same `World` object, reset them on the title's start and Continue presses instead and say so in the task report.
- Ghost frames (`GHOST_FRAME_VALID`, `GHOST_FRAME_INVALID`, the scenery and show ghost bits) map to `picture(K_GHOST, ghostKey(kind, defId, view), 0 | 1)`.
- Keep-last (Test decision 11): `rideSprites[ri] = picture ?? lastRide[ri]`; the same per stall index, scenery item index and show index; guests, staff and decals skip when null.
- `spriteMemory.budgetBytes` = `budget − store bytes − static layer bytes` each frame (the chunk cache gives way).

- [ ] **Step 1: Write the failing tests** (a fake `PixelRuntime` recording calls; a real renderer on a fake canvas as stage 0 `frame.test.ts`)

```ts
it('plan: Pixel 7 profile k 3, tablet k 2, canvas sizes', () => { /* plan(412, 915, 2.625): stretch 3, canvas 361 × 801; plan(1024, 1366, 2): stretch 2, canvas 1024 × 1366 */ });
it('plan refuses a canvas at the iPhone limit', () => expect(() => plan(5000, 5000, 1)).toThrow());
// rendererOps.test.ts (B7 evidence for the renderer; skips unless TC_PROTO_OUT is set): the renderer on `FakeCanvas`
// (`tests/unit/render/fakeCanvas.ts`), the `phone` scene save, 3 frames at view rotations 0, 1, 1 at zoom 1; writes
// `renderer-ops.json` = { calls, hash } (FNV-1a of the `DrawCall` list as JSON lines); Task 16 compares base and worktree.
it('with pixel.rt bank builders call picture and never buildSprite', () => { /* spy: buildSprite not called; picture called with K_RIDE and the spriteKey */ });
it('a ride keeps its last picture while its new sheet decodes', () => { /* frame 1 sprite A; frame 2 picture returns null: blit gets A; incomplete counted */ });
it('blits copy whole art pixels from the sheet rectangle', () => { /* drawImage args: sx, sy of the sprite; dest x and y integers; width w × n */ });
it('a view turn counts incomplete frames until the first complete one', () => { /* rot change, 3 frames missing then complete: incompleteAfterTurnMax 3 */ });
```

- [ ] **Step 2: Run to see them fail; implement; run to pass; gates.**
- [ ] **Step 3: Stage**, then Step 6b.

---

### Task 12: Ground assembly, shadow pass, track and elevated drawing

**Files:**
- Create: `src/render/pixel/app/ground.ts`, `src/render/pixel/app/shadows.ts`, `src/render/pixel/app/track.ts`
- Modify: `src/render/pixel/app/runtime.ts` (`chunk`, `drawShadows`, `drawTrack`, `drawElevated`), `src/render/terrain.ts` `build` (`if (pixel.rt)`: `pixel.rt.chunk(…)`; a `null` result leaves the chunk unbuilt for this frame, as a chunk over today's build budget, and it is tried again next frame), `src/render/track/layer.ts` (`drawSlice`, `drawCar`, `drawGate`: `if (pixel.rt?.drawTrack(ctx, …)) return;`), `src/render/elevated/layer.ts` `drawItem` (`if (pixel.rt) { pixel.rt.drawElevated(…); return; }`), `src/render/renderer.ts` (call `pixel.rt.drawShadows` right after `mgmt.drawGround` and the layers' `drawGround`, before the object list)
- Test: `tests/unit/render/pixel/assemble.test.ts`

**Interfaces:**
- Consumes: `groundKey`, `groundVariant`, `faceStack` (Task 7); `shadowKey`, stage 0 `casterOf`, `casterMask` placement (`footprintViewOrigin`, `src/render/pixel/shadows.ts`); `railKey`, `supportKey`, `gateKey`, `carKey`, `deckKey`, `postKey` (Task 6); `PictureStore.get` with `swap` (Task 10); `darknessAt` (`src/render/lighting/darkness.ts`).
- Produces, `ground.ts`: `assembleChunk(store: PictureStore, map: MapState, rect, r: ViewRotation, geom: ArtBounds): { sprite: Sprite; complete: boolean }`: one canvas at `ART_SCALE` of the chunk bounds; view tiles back to front (as `paintGroundChunk`); per tile: face stacks on the `+u` and `+v` edges (`faceStack`, the conditions of stage 0 `paintGroundTile`), then the top or path piece, then water above the water level; one `drawImage` per piece from its sheet rectangle. `complete` false when a piece was missing (the terrain keeps the chunk unbuilt and retries). The time of each assembly feeds `chunkMsMax`. Runs inside today's `FIRST_BUILD_BUDGET_MS` spread (`terrain.ts:407, 626`).
- Produces, `shadows.ts`: `drawShadowPass(ctx, store, world, f: LayerFrame, frame: PixelFrame): void`: nothing when `frame.night` (D8; `darknessAt(tick + alpha, afterDark) > 0`); else for each ride, stall and scenery item whose shadow box meets the view: one `drawImage` of `shadowKey(kind, defId, viewRotation, parity)` where `parity = (anchorArtX + anchorArtY) & 1`. Numeric keys only; no string per object (cache the def hash per def id once).
- Produces, `track.ts`: `drawSlice`: the rail picture of the slice (`railKey` from the slice's type, piece, direction, tile index, view) at its tile centre lifted by the piece base height, swap = the ride's track colour; its support as a stack of `supportKey` segments from the ground to `support.top` (foot, steps, top), swap = support colour. `drawCar`: `carKey` swap = car colour; riders stay drawn live (§5.7 item 5). `drawGate`: `gateKey` swap = the gate's track colour index (`TRACK_PALETTE.indexOf(colour)`, 9 when absent). Elevated: posts per step from ground to deck at the 4 corners, then the deck piece (`deckKey(kind, view ramp)`). Water ripples and chain marks stay live.

- [ ] **Step 1: Write the failing tests** (a fake store that returns 1 × 1 sprites and logs keys)

```ts
it('a flat chunk draws one top per tile and no face', () => { /* 8 × 8 flat owned grass: 64 drawImage calls, all part 0 keys */ });
it('a raised tile draws its face stacks and the variant from groundVariant', () => { /* one tile 2 steps up: 2 + 2 face steps; top key variant = groundVariant(x, y) */ });
it('a path tile uses the view edge mask', () => { /* a footpath with a footpath north only: edges = view mask of N in view r */ });
it('missing piece leaves the chunk incomplete', () => { /* store returns null once: complete false */ });
it('no object shadow at night; guests keep theirs', () => { /* night: zero shadow draws; guest sprite unchanged */ });
it('shadow phase follows the anchor parity', () => { /* two scenery items one art pixel apart: phases 0 and 1 */ });
it('a support of 5 steps draws foot, 3 steps and top with the support swap', () => { /* keys and swap colour 9 */ });
```

- [ ] **Step 2: Run to see them fail; implement; run to pass; gates.**
- [ ] **Step 3: Development check in a browser (no timing)**

```bash
set -e
PROTO=/tmp/tc-phase8b-proto
cd "$PROTO/wt"
PW_PORT=4401
test "$(lsof -nP -iTCP:$PW_PORT -sTCP:LISTEN -t | wc -l)" -eq 0 || { echo "port $PW_PORT busy"; exit 1; }; echo free
TC_APP=1 VITE_ART=pixel PW_PORT=$PW_PORT npx playwright test tests/e2e/boot.spec.ts --project=phone --workers=1
```

Run with `run_in_background` and `timeout: 3600000`. Expected: `free`; the boot test passes in the Pixel app build. A failure that also fails in the Classic app build (`VITE_ART` unset) is a Task 8 matter; record both.

- [ ] **Step 4: Stage**, then Step 6b.

---

### Task 13: App wrapper and device bench mode

**Files:**
- Create: `capacitor.config.json` (`appId` `dev.thrillsandchills.stage0b`, `appName` "T&C 0b test", `webDir` `mobile/www`, `server.androidScheme` `https`), `scripts/build-mobile-www.mjs` (copies `dist-app` to `mobile/www`, writes `mobile/www/BUILD.txt` with the base commit and the art report totals), `src/render/pixel/app/bench.ts`
- Modify: `package.json` (`@capacitor/core` and `@capacitor/android` 7.6.8 as dependencies, `@capacitor/cli` 7.6.8 as dev dependency, exact; scripts `mobile:www` = `vite build --mode app --outDir dist-app && node scripts/build-mobile-www.mjs`, `mobile:sync` = `npm run mobile:www && npx cap sync android`), `src/render/pixel/app/runtime.ts` (bench start), `src/ui/title/*` only through a DOM insert from `bench.ts` (no title code change)
- Generated: `android/` by `npx cap add android`
- Test: `tests/unit/render/pixel/bench.test.ts`

**Interfaces:**
- Produces, `bench.ts` (active only when `import.meta.env.VITE_BENCH === '1'`): on the title, a group "Bench" with buttons `phone · pixel`, `phone · today`, `build2 · pixel`, `build2 · today`, `cases · pixel` (each at least 44 × 44 CSS px) that reload `./index.html?bench=<scene>&art=<pixel|classic>`. With `?bench=`: fetch `bench/<scene>.json`, put it in `tc.save.1`, press Continue, then run the procedure of `perf-build3.spec.ts` `runFor` in the page (10 s warm-up at 1×, 30 s measure, view turns to rotation 1 and 2 with 1 s each, 3 runs), and show a result panel: per run frame p50/p95/max, work p95 (`perfProbe`), turn frame max, `stepMs` (5th percentile of the frame intervals), steps `round(ms / stepMs)`, `budgetMbMax`, `incompleteAfterTurnMax`, `missingTotal`, `firstCompleteMs`, the device line (`navigator.userAgent`, dpr, CSS size, k); the medians of the 3 runs; a Copy button (clipboard) and the same text selectable.
- `benchSummary(runs: BenchRun[]): BenchSummary` is pure and tested (medians, steps by `stepMs`).

- [ ] **Step 1: Write `bench.test.ts`** (`benchSummary` of 3 fixed runs: medians and steps; `stepMs` of intervals at 120 Hz gives 8.3).
- [ ] **Step 2: Run to see it fail; implement; run to pass; gates.**
- [ ] **Step 3: Install Capacitor and generate the Android project**

```bash
set -e
PROTO=/tmp/tc-phase8b-proto
cd "$PROTO/wt"
npm install --save-exact @capacitor/core@7.6.8 @capacitor/android@7.6.8
npm install --save-dev --save-exact @capacitor/cli@7.6.8
VITE_BENCH=1 VITE_ART=pixel npm run mobile:www
npx cap add android
npx cap sync android
ls android/app/src/main/assets/public | head
du -sh mobile/www android/app/src/main/assets/public
```

Expected: `index.html` and `art` listed in the Android web root; sizes printed. No Android SDK exists here: nothing is built into an APK (owner step, Task 22 checklist). On a registry refusal, record it and skip Steps 3 and 4 (the checklist then names the commands for the owner's computer).

- [ ] **Step 4: Stage** (`git add -A`; `android/` and `mobile/www` are staged as generated files of the test), then Step 6b.

---

### Task 14: B1 compare

**Files:**
- Create: `tests/unit/tools/sheets/b1Compare.test.ts`; in `$PROTO/s0` (untracked, not staged anywhere): `tests/unit/render/pixel/b1Ref.test.ts` and a copy of `src/render/pixel/app/format.ts` as `tests/unit/render/pixel/b1Format.ts`
- Modify: `tests/e2e/predrawn0b.spec.ts` (create; test `b1 decode`)
- Output: `$PROTO/out/b1/ref-<pack>.json`, `$PROTO/out/b1/decoded-<pack>.json`, `$PROTO/out/b1/result.md`

**Interfaces:**
- Consumes: key rows `$PROTO/out/art/keys/<pack>.json` (Task 8 Step 5); `window.__predrawn.decodeAll` (Task 10); `trimmedHash`.
- `b1Ref.test.ts` (in s0; runs only with `TC_B1_KEYS` and `TC_B1_OUT`): `setArtStyle('pixel')`, `artBuildLog.surfaces = []`, then for each row with `ref` calls the stage 0 builder (`SpriteBank` `ride`, `stall`, `guest`, `staff`, `pathItem`, `decal`, `fence`, `entrance` with bucket 0.5; `ScenerySprites.get`; show sites `buildSprite(showArtBounds(defId), 0.5, (c) => drawShowSiteArt(c, defId, facing), null)`), takes the last surface, turns its slots into RGBA (`SLOT_RGBA`) and writes `{ entry, hash }` with `trimmedHash(rgba, w, h, ox, oy, guest ? SHADOW_RGB : -1)` (`SHADOW_RGB` = RGB of `i1` as one number, passed in `TC_B1_SKIP`).
- `b1 decode` (Playwright, phone project, app build with `VITE_ART=pixel`): for each pack, `__predrawn.decodeAll(pack)` decodes every sheet with the store's decode options, draws it on an `OffscreenCanvas`, reads `getImageData` per entry rectangle and returns `{ entry, hash, formatOk, why }` (hash as above; format: rectangle inside the sheet, every pixel alpha 0 or 255, every opaque RGB in the index palette, anchor inside `[-w, 2w] × [-h, 2h]`, the entry has at least one opaque pixel). Writes `decoded-<pack>.json`.
- `b1Compare.test.ts` (runs with `TC_B1_DIR`): an entry with a ref passes when hashes are equal; any entry passes the format check; writes `result.md` (counts per kind: compared, equal, format ok; the first 20 failures with kind and fields) and fails on any failure.

- [ ] **Step 1: Write the three tests.** Copy `format.ts` into s0 as `b1Format.ts` (`cp`), and import `trimmedHash` from it there.
- [ ] **Step 2: Reference in s0**

```bash
set -e
PROTO=/tmp/tc-phase8b-proto
cd "$PROTO/wt"
mkdir -p "$PROTO/out/b1"
(cd "$PROTO/s0" && TC_B1_KEYS="$PROTO/out/art/keys" TC_B1_OUT="$PROTO/out/b1" TC_B1_SKIP="$(node -e "console.log(0x6e4470)")" npx vitest run tests/unit/render/pixel/b1Ref.test.ts)
ls "$PROTO"/out/b1/ref-*.json
```

Run with `run_in_background` and `timeout: 3600000`. Expected: PASS; one ref file per pack with refs (`rides-full`, `rides-coarse`, `objects`, `people`).

- [ ] **Step 3: Decode in the browser**

```bash
set -e
set -o pipefail
PROTO=/tmp/tc-phase8b-proto
cd "$PROTO/wt"
PW_PORT=4402
test "$(lsof -nP -iTCP:$PW_PORT -sTCP:LISTEN -t | wc -l)" -eq 0 || { echo "port $PW_PORT busy"; exit 1; }; echo free
TC_APP=1 VITE_ART=pixel TC_B1_DIR="$PROTO/out/b1" PW_PORT=$PW_PORT npx playwright test tests/e2e/predrawn0b.spec.ts --project=phone --workers=1 -g "b1 decode" | tee "$PROTO/out/b1/decode-run.txt"
```

Run with `run_in_background` and `timeout: 3600000`. Expected: 1 passed; one `decoded-<pack>.json` per pack.

- [ ] **Step 4: Compare (B1)**

Run: `PROTO=/tmp/tc-phase8b-proto; cd "$PROTO/wt" || exit 1; TC_B1_DIR="$PROTO/out/b1" npx vitest run tests/unit/tools/sheets/b1Compare.test.ts; cat "$PROTO/out/b1/result.md"`
Expected: PASS. **On a failure (B1):** repair the tool once (Tasks 3 to 8 files only), rebuild (Task 8 Step 5), repeat Steps 2 to 4 with the first result kept as `result.first-run.md`. A second failure stops the plan: report to the controller for an owner decision.

- [ ] **Step 5: Stage** (the wt files only), then Step 6b.

---

### Task 15: Perf spec and the 0b e2e harness

**Files:**
- Modify: `tests/e2e/perf-build3.spec.ts` (tablet project, query, home zoom, probe text, throttle on tablet), `tests/e2e/predrawn0b.spec.ts` (helpers and the tests `pictures`, `cases`, `start`; bodies filled by Tasks 17 and 18)
- Create: `tests/unit/render/pixel/b0bKit.ts` (`parsePerf`, Task 21 extends), `tests/unit/render/pixel/b0bKit.test.ts`

**Interfaces:**
- Produces, `perf-build3.spec.ts`: the tablet project runs `build1` and `build2` with CPU throttle 4 (as the phone); `TC_PERF_QUERY` (for example `?frames=coarse`) is appended in `loadScene` (`page.goto('/' + query)`); with `TC_APP=1`, `loadScene` asserts `window.__tcBuild === 'app'` (Review Focus 1); when `#game[data-art]` is `pixel`, `at(rot)` uses `Number(data-home-zoom)` read after two `requestAnimationFrame` round trips; after the warm-up `__predrawnStats.reset()`; the `[perf]` line ends with `; art n ${data-art-scale}, k ${data-stretch}, budget max ${budgetMbMax} MB, sheets ${sheetMb} MB, swaps ${swapMb} MB, chunks ${chunkMb} MB, static ${staticMb} MB, incomplete after turn ${incompleteAfterTurnMax}, missing ${missingTotal}, chunk max ${chunkMsMax} ms` (Pixel), or `; art classic` (Classic). The text `canvas ratio ${ratio}:` and the `turns: longest frame` text do not change.
- Produces, `predrawn0b.spec.ts` helpers: `loadSave(page, text, query)`, `waitComplete(page, frames)` (waits for `data-art-complete="1"`, then `frames` animation frames), `assertAppBuild(page)` (Review Focus 1), `OUT = process.env.TC_0B_OUT` (the spec skips when unset; `mkdirSync(join(OUT, 'e2e'), { recursive: true })`), timeout 900 s per test.
- Produces, `b0bKit.ts`: `interface PerfLine { project: string; scene: string; run: number; frameP95: number; workP95: number; renderP95: number; turns: [number, number]; art: 'pixel' | 'classic'; budgetMax: number | null; incompleteAfterTurn: number | null; missing: number | null; chunkMax: number | null; parts: { sheets: number; swaps: number; chunks: number; static: number } | null }`; `parsePerf(text: string): PerfLine[]` (only `[perf]` lines; frame p95 by `/frame p50 [\d.]+ \/ p95 ([\d.]+)/`, work by `/work p95 ([\d.]+) ms/` before `render`, turns by `/turns: longest frame (\d+) ms .*?, (\d+) ms/`).

- [ ] **Step 1: Write `b0bKit.test.ts`** with fixture lines built like stage 0 `protoNumbers.test.ts` (a Pixel phone line, a Classic tablet line): each field parsed; `pan: frame p95` and `tick p95` never taken; a line with `missing 3` parses `missing 3`.
- [ ] **Step 2: Run to see it fail; implement; run to pass; gates.**
- [ ] **Step 3: Short development runs (no timing)**

```bash
set -e
PROTO=/tmp/tc-phase8b-proto
cd "$PROTO/wt"
PW_PORT=4401
test "$(lsof -nP -iTCP:$PW_PORT -sTCP:LISTEN -t | wc -l)" -eq 0 || { echo "port $PW_PORT busy"; exit 1; }; echo free
TC_APP=1 VITE_ART=pixel PW_PORT=$PW_PORT TC_PERF=1 TC_PERF_SECONDS=3 TC_PERF_WARMUP=2 npx playwright test tests/e2e/perf-build3.spec.ts --project=phone --project=tablet --workers=1 -g "scene build2"
```

Run with `run_in_background` and `timeout: 3600000`. Expected: 2 passed; each `[perf]` line holds `art n 3, k 3` (phone) or `art n …, k 2` (tablet) and `missing 0`.

- [ ] **Step 4: Stage**, then Step 6b.

---

### Task 16: Today's look and the website (B7, B8)

**Files:**
- Output: `$PROTO/out/classic-ops-*.json`, `$PROTO/out/base/classic-ops-*.json`, `$PROTO/out/b7-notes.md`, `$PROTO/out/b8-notes.md`, `$PROTO/out/release-web.txt`, `$PROTO/out/check-app.txt`

- [ ] **Step 1: B7, Classic op lists and recorder tests** (stage 0 Task 17 Steps 2 to 4 with `PROTO=/tmp/tc-phase8b-proto`: copy `classicOps.test.ts` and `rendererOps.test.ts` to `$PROTO/base/tests/unit/render/pixel/`, run both in both trees with `TC_PROTO_OUT` set to `$PROTO/out` and `$PROTO/out/base`, the `cmp` loop over `classic-ops-*.json` and `renderer-ops.json`, the recorder tests, the whole suite and `comm` against `baseline-full.txt`). Expected: 13 + 13 files; `cmp` prints nothing; recorder tests pass; `comm` prints nothing. Write the results to `b7-notes.md`. On a failure: repair the branch (Branch rule), repeat this step.
- [ ] **Step 2: B8, the website build**

```bash
set -e
PROTO=/tmp/tc-phase8b-proto
cd "$PROTO/wt"
npm run build && node scripts/check-release.ts --no-build --no-tests | tee "$PROTO/out/release-web.txt" || true
WB=$(node --input-type=module -e "const m = await import('$PROTO/wt/scripts/check-release.ts'); console.log(m.initialLoadBytes('$PROTO/wt/dist'))")
BB=$(cat "$PROTO/out/base/load-bytes.txt")
echo "web $WB base $BB growth $((WB - BB))" | tee "$PROTO/out/b8-notes.md"
test ! -e dist/art && echo "no-art" | tee -a "$PROTO/out/b8-notes.md"
cmp public/sw.js "$PROTO/base/public/sw.js" && cmp scripts/sw-manifest-plugin.ts "$PROTO/base/scripts/sw-manifest-plugin.ts" && echo "worker-source-same" | tee -a "$PROTO/out/b8-notes.md"
node -e "const a = require(process.argv[1]), b = require(process.argv[2]); const same = JSON.stringify(a.files) === JSON.stringify(b.files) && a.format === b.format; console.log(same ? 'precache-files-same' : 'precache-files-differ')" "$PWD/dist/sw-manifest.json" "$PROTO/out/base/sw-manifest.json" | tee -a "$PROTO/out/b8-notes.md"
grep -l "__predrawnStats\|tc-art" dist/assets/*.js || echo "web-clean" | tee -a "$PROTO/out/b8-notes.md"
```

Run with `run_in_background` and `timeout: 3600000`. Expected: growth ≤ 2048; `no-art`; `worker-source-same`; `precache-files-same`; `web-clean`.

- [ ] **Step 3: B8, the app build has no worker**

Run: `PROTO=/tmp/tc-phase8b-proto; cd "$PROTO/wt" || exit 1; VITE_ART=pixel npx vite build --mode app --outDir dist-app && node scripts/check-app.ts dist-app | tee "$PROTO/out/check-app.txt"` (background, `timeout: 3600000`). Expected: exit 0; no `sw.js`, no `sw-manifest.json`; art sizes per pack.

- [ ] **Step 4: Read B7 and B8.** Either fires: repair, then repeat its step (B7 and B8 say "Repair, then repeat"). Write the result into the notes files.
- [ ] **Step 5: Stage**, then Step 6b.

---

### Task 17: Owner pictures and the drawing path

**Files:**
- Modify: `tests/e2e/predrawn0b.spec.ts` (test `pictures`)
- Output: `$PROTO/out/pictures/*.png`, `$PROTO/out/e2e/gpu-<project>.json`, `$PROTO/out/pictures-notes.md`

**Interfaces:**
- Test `pictures` (phone and tablet projects, app build with `VITE_ART=pixel`, and the same views in Classic through `?art=classic` on the same build): for the saves `phone`, `build2`, `cases`: load, `assertAppBuild`, settle the view as stage 0 `prepareView` (noon, sunny, no tool, pointer out, rides open), camera on the scene focus (cases: the coaster corkscrew) at the home zoom, `waitComplete(page, 2)`, screenshot `pictures/<scene>-<project>-pixel.png` and `-today.png`; on `cases` also view rotation 1 (`cases-<project>-pixel-r1.png`), night (`cases-phone-pixel-night.png`, after-dark clock 22:00: object shadows gone), and a strip 1920 × 600 of the today | pixel crops of `cases-phone` (`strip-phone.png`, made in the page as stage 0). Also writes `gpu-<project>.json` from the CDP `SystemInfo.getInfo` (`gpu.featureStatus['2d_canvas']`, `gpu.devices[0]`) and the canvas sizes and `k`.

- [ ] **Step 1: Write the test.**
- [ ] **Step 2: Run it**

```bash
set -e
set -o pipefail
PROTO=/tmp/tc-phase8b-proto
cd "$PROTO/wt"
PW_PORT=4403
test "$(lsof -nP -iTCP:$PW_PORT -sTCP:LISTEN -t | wc -l)" -eq 0 || { echo "port $PW_PORT busy"; exit 1; }; echo free
TC_APP=1 VITE_ART=pixel TC_0B_OUT="$PROTO/out" PW_PORT=$PW_PORT npx playwright test tests/e2e/predrawn0b.spec.ts --project=phone --project=tablet --workers=1 -g "pictures" | tee "$PROTO/out/pictures-run.txt"
ls "$PROTO"/out/pictures/ "$PROTO"/out/e2e/gpu-*.json
```

Run with `run_in_background` and `timeout: 3600000`. Expected: 2 passed; the PNG files and 2 JSON files listed.

- [ ] **Step 3: Look at the pictures** (Read tool) and write one line per picture into `pictures-notes.md`: square pixels at k = 3 on the phone, the new ground (tile pieces, 4 grass variants), the dithered shadows and none at night, guests with their own shadow, the coaster in its non-default colours (swap). Also the drawing path from `gpu-*.json` ("graphics chip" or "software").
- [ ] **Step 4: Stage**, then Step 6b.

---

### Task 18: Cases measures and app start (B3-other, B5, B6 part)

Start condition: the controller starts this task only when no other agent runs tests on this machine.

**Files:**
- Modify: `tests/e2e/predrawn0b.spec.ts` (tests `cases` and `start`)
- Output: `$PROTO/out/e2e/cases-phone.json`, `$PROTO/out/e2e/cases-tablet.json`, `$PROTO/out/e2e/start-phone.json`, `$PROTO/out/b3other-b5-notes.md`

**Interfaces:**
- Test `cases` (phone and tablet, CPU throttle 4 through CDP, Pixel app build), three loops (median of 3), each: load `cases` save, `waitComplete`, `__predrawnStats.reset()`, then (1) four view turns (rotation 1, 2, 3, 0, each followed by 60 frames) — reads `incompleteAfterTurnMax`, `chunkMsMax` (cold assemblies of the turned views; the phone has no turn prefetch); (2) colour swap: `setTrackColours` to `track 2, supports 10, cars 7` then 60 frames — reads `swapMainMsMax`; (3) placement ghosts: scenery tool on `oak_round` over a free tile, then over a blocked tile, 30 frames each (valid and invalid ghost pictures drawn: `missingTotal` stays 0 after their decode); (4) 20 scenery placements in a row, one `placeScenery` dispatch per animation frame, recording the frame intervals: the longest; (5) `budgetMbMax` and the parts at the end (Review Focus 5 check). Decode time: one `ground` sheet decoded through `__predrawn` at throttle 1 and at throttle 4, 5 times each, medians (`decodeMsT1`, `decodeMsT4`). Writes `cases-<project>.json` = `{ runs: [{ incompleteAfterTurnMax, chunkMsMax, swapMainMsMax, placeFrameMaxMs, budgetMbMax, parts, decodeMsT1, decodeMsT4, decodeMsList }], loadavgBefore, loadavgAfter }` (`decodeMsList`: `__predrawnStats.decodeMs` with each sheet's file name and size, the decode time per sheet of §6 "Also reported").
- Test `start` (phone, throttle 4 set before navigation through a CDP session on a new page): (a) `page.goto('/')`, click `title-new` as soon as it is enabled, fill the name, `title-size-64`, `title-start`; (b) the `build2` save in `tc.save.1`, `title-continue`. Value: `__predrawnStats.firstCompleteMs` (milliseconds from navigation start; `performance.timeOrigin` based). Three loops each, fresh page each loop. Writes `start-phone.json = { newPark: number[], continueBuild2: number[] }`.

- [ ] **Step 1: Write the two tests.**
- [ ] **Step 2: Run `cases` (timing block)**

```bash
set -e
set -o pipefail
PROTO=/tmp/tc-phase8b-proto
cd "$PROTO/wt"
quiet() { …the function of the Global Constraints "Load gate"… }
quiet
PW_PORT=4404
test "$(lsof -nP -iTCP:$PW_PORT -sTCP:LISTEN -t | wc -l)" -eq 0 || { echo "port $PW_PORT busy"; exit 1; }; echo free
echo "cases before $(cat /proc/loadavg)" >> "$PROTO/out/loadavg.txt"
TC_APP=1 VITE_ART=pixel TC_0B_OUT="$PROTO/out" PW_PORT=$PW_PORT npx playwright test tests/e2e/predrawn0b.spec.ts --project=phone --project=tablet --workers=1 -g "cases" | tee "$PROTO/out/cases-run.txt"
echo "cases after $(cat /proc/loadavg)" >> "$PROTO/out/loadavg.txt"
```

Run with `run_in_background` and `timeout: 7200000`. Expected: `quiet`; `free`; 2 passed.

- [ ] **Step 3: Run `start` (timing block)** — the block of Step 2 with port 4405, label `start`, `--project=phone`, `-g "start"`, output `start-run.txt`. Expected: 1 passed.
- [ ] **Step 4: Read the rules** into `b3other-b5-notes.md` (medians of 3; phone values decide B3-other): cold chunk `chunkMsMax` ≤ 12 ms; `swapMainMsMax` ≤ 3 ms; `incompleteAfterTurnMax` ≤ 30; `placeFrameMaxMs` ≤ 100 ms; B5: median `newPark` and median `continueBuild2` ≤ 4 000 ms (`ART_START_MAX_S`); B6 part: `budgetMbMax` ≤ 64 on phone and tablet. Also the decode medians at throttle 1 and 4 and whether they differ by more than 1.5 × (the throttle applied to decoding).
- [ ] **Step 5: Stage**, then Step 6b.

---

### Task 19: Perf runs (B2, B2b, B3-turn, B3b, B4, B6)

Start condition: the controller starts this task only when no other agent runs tests on this machine.

**Files:** none. Output: `$PROTO/out/perf-today.txt`, `perf-pixel-phone.txt`, `perf-pixel-tablet.txt`, `perf-pixel-tablet-coarse.txt` (only when B4 fires on the full set).

- [ ] **Step 1: Run the blocks one after the other** (each: prefix, `set -o pipefail`, `quiet`, port check, two `loadavg` lines with its label, one run; `run_in_background`, `timeout: 7200000`):

| Block | Port | Environment and command (after `PW_PORT=$PW_PORT TC_APP=1 TC_PERF=1 TC_PERF_RUNS=3`) | Output |
|---|---|---|---|
| 1 today | 4406 | (no `VITE_ART`) `npx playwright test tests/e2e/perf-build3.spec.ts --project=phone --project=tablet --workers=1 -g "scene "` | `perf-today.txt` |
| 2 pixel phone | 4407 | `VITE_ART=pixel` … `--project=phone` … | `perf-pixel-phone.txt` |
| 3 pixel tablet | 4408 | `VITE_ART=pixel` … `--project=tablet` … | `perf-pixel-tablet.txt` |
| 4 tablet coarse (only if B4 fires on block 3) | 4409 | `VITE_ART=pixel TC_PERF_QUERY='?frames=coarse'` … `--project=tablet` … | `perf-pixel-tablet-coarse.txt` |

Expected per block: `quiet`; `free`; passed. Block 1 runs both profiles in one block (same session for "today").

- [ ] **Step 2: Validity checks**

```bash
set -e
PROTO=/tmp/tc-phase8b-proto
cd "$PROTO/wt"
for f in perf-today perf-pixel-phone perf-pixel-tablet; do grep -Eq '[0-9]+ passed' "$PROTO/out/$f.txt" && ! grep -Eq '[0-9]+ failed' "$PROTO/out/$f.txt" || { echo "$f did not pass"; exit 1; }; done; echo all-passed
grep -h "\[perf\]" "$PROTO/out/perf-pixel-phone.txt" "$PROTO/out/perf-pixel-tablet.txt" | grep -Evc "missing 0, " || true
grep -h "\[perf\]" "$PROTO/out/perf-today.txt" | grep -vc "art classic$" || true
grep -o "canvas ratio [0-9.]*" "$PROTO/out/perf-pixel-phone.txt" "$PROTO/out/perf-pixel-tablet.txt" | sort -u
```

Expected: `all-passed`; both counts 0; canvas ratio 0.875 (phone) and 1 (tablet). Else the run is invalid: find the cause and run that block again.

- [ ] **Step 3: Read B4 now** (median `build1` and `build2` frame p95 of `perf-pixel-tablet.txt` above 40 ms, or its `budget max` above 64): if it fires, run block 4 and read B4 again on it.
- [ ] **Step 4: Task check** (Step 6b; no staging needed, no file changed).

---

### Task 20: WebKit function run

**Files:**
- Modify: `playwright.config.ts` (project `webkit-phone`: `devices['iPhone 13']`, only when `TC_WEBKIT=1`), `tests/e2e/predrawn0b.spec.ts` (test `webkit function`)
- Output: `$PROTO/out/webkit.md`

**Interfaces:**
- Test `webkit function` (labelled "function only"; no throttle, no timing): Pixel app build; load `cases`; `waitComplete`; checks: sheets decode (`sheetsDecoded > 0`, `missingTotal === 0` after complete), crisp pixels (the stage 0 grid check: every horizontal and vertical run of one RGBA value not touching the canvas edge has a length that is a multiple of `n` at the home level), canvas sizes (`canvas.width === ceil(cssW × dpr / k)`, both axes; box size ±0.01 CSS px), `image-rendering` `pixelated`, one view turn completes.

- [ ] **Step 1: Write the test and the project.**
- [ ] **Step 2: Try to get WebKit, then run**

```bash
set -e
set -o pipefail
PROTO=/tmp/tc-phase8b-proto
cd "$PROTO/wt"
mkdir -p "$PROTO/pw"
PLAYWRIGHT_BROWSERS_PATH="$PROTO/pw" PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD= npx playwright install webkit 2>&1 | tail -5 | tee "$PROTO/out/webkit.md" || { echo "webkit download refused: run not possible here" | tee -a "$PROTO/out/webkit.md"; exit 0; }
PW_PORT=4410
test "$(lsof -nP -iTCP:$PW_PORT -sTCP:LISTEN -t | wc -l)" -eq 0 || { echo "port $PW_PORT busy"; exit 1; }; echo free
PLAYWRIGHT_BROWSERS_PATH="$PROTO/pw" TC_WEBKIT=1 TC_APP=1 VITE_ART=pixel TC_0B_OUT="$PROTO/out" PW_PORT=$PW_PORT npx playwright test tests/e2e/predrawn0b.spec.ts --project=webkit-phone --workers=1 -g "webkit function" 2>&1 | tee -a "$PROTO/out/webkit.md" || true
```

Run with `run_in_background` and `timeout: 3600000`. Expected: either "run not possible here" (the proxy refused the download, or WebKit lacks system libraries: record the error lines) or the test result. Neither stops the plan; the report names it, and the owner's iPhone run (Task 22 checklist) covers WebKit on a device.

- [ ] **Step 3: Stage**, then Step 6b.

---

### Task 21: `numbers.json` and the rule results

**Files:**
- Modify: `tests/unit/render/pixel/b0bKit.ts` (pure rule functions)
- Create: `tests/unit/render/pixel/numbers0b.test.ts`
- Output: `$PROTO/out/numbers.json`

**Interfaces:**
- Produces, `b0bKit.ts`:
  - `median(xs: number[]): number` (3 values: the middle; throws on an empty list).
  - `steps(ms: number): number = Math.round(ms / 16.67)`.
  - `sceneValues(lines: PerfLine[], project: string, scene: string): { frameP95: number; workP95: number; turn: number; budgetMax: number | null; missing: number }` (medians over the runs; `turn` = median of the per-run `max(turns)`; throws when not 3 lines or when a Pixel line has `missing > 0`).
  - `rules(m: Measures): Record<'B2' | 'B2b' | 'B3turn' | 'B3b' | 'B3other' | 'B4' | 'B5' | 'B6', { result: 'pass' | 'fired' | 'reported' | 'owner'; detail: string }>` with D6 = (a), D7 = (b): `B2` strict reported for information (`reported`), `B2b` decides (phone scene: Pixel frame p95 ≤ today's and work p95 ≤ today's + 2; `build2` ≤ 40); `B3turn` reported for information, `B3b` decides (Test decision 19: per scene, `steps(pixel turn) ≤ steps(today turn) + 1`); `B3other` from Task 18; `B4` (full set, then coarse when present); `B5` → `owner` when above 4 s, else `pass`; `B6` = max of the perf `budgetMax` and the cases `budgetMbMax`, phone and tablet, ≤ 64.
- `numbers.json` = `{ today: { phone: {phone, build2}, tablet: {build1, build2} }, pixel: { phone: {…}, tablet: {…}, tabletCoarse?: {…} }, cases: { phone, tablet }, start: { newParkMs, continueBuild2Ms }, sizes: <art report totals and per kind>, projection: <projection.json>, b1: <counts from result.md>, b7, b8: <values of the notes>, rules, loadavg: <loadavg.txt lines> }`.

- [ ] **Step 1: Write the pure tests**

```ts
it('median and steps', () => { expect(median([50.1, 33.4, 49.9])).toBe(49.9); expect(steps(100)).toBe(6); expect(steps(116.6)).toBe(7); });
it('B2b: phone passes at today\'s p95 with work + 2, build2 strict', () => { /* today phone 49.9 work 9.0; pixel 49.9 work 11.0 → pass; work 11.1 → fired; pixel build2 40.1 → fired */ });
it('B3b: one step over today passes, two steps fire', () => { /* today 100 ms (6), pixel 116 (7) pass, 133 (8) fired */ });
it('sceneValues rejects a missing picture', () => { /* a Pixel line with missing 2 → throws */ });
it('B5 above 4 s goes to the owner', () => { /* 4 100 → owner */ });
```

The output part (`describe.skipIf(!process.env.TC_0B_OUT)`) reads the outputs of Tasks 8, 9, 14, 16, 18, 19 and writes `numbers.json`.

- [ ] **Step 2: Run to see the pure tests fail; implement; run to pass.**
- [ ] **Step 3: Write `numbers.json`**

Run: `PROTO=/tmp/tc-phase8b-proto; cd "$PROTO/wt" || exit 1; TC_0B_OUT="$PROTO/out" npx vitest run tests/unit/render/pixel/numbers0b.test.ts && node -e "const j = require(process.argv[1]); for (const k of ['today','pixel','cases','start','sizes','projection','b1','b7','b8','rules']) if (!(k in j)) process.exit(1); console.log(JSON.stringify(j.rules, null, 1))" "$PROTO/out/numbers.json"`
Expected: PASS; the rules print.
- [ ] **Step 4: Stage**, then Step 6b.

---

### Task 22: Report, owner pictures and the device checklist

**Files:**
- Create: `$PROTO/out/stage-0b-report.md`, `$PROTO/out/device-checklist.md`, `$PROTO/out/app-src-0b.tar.gz`
- Copy: owner files to `$OWNER_OUT` (the controller gives the absolute path)

- [ ] **Step 1: Final checks**

```bash
set -e
PROTO=/tmp/tc-phase8b-proto
cd "$PROTO/wt"
for f in numbers.json projection.json projection.md b1/result.md b7-notes.md b8-notes.md check-app.txt pictures-notes.md b3other-b5-notes.md perf-today.txt perf-pixel-phone.txt perf-pixel-tablet.txt webkit.md art/report.json; do test -s "$PROTO/out/$f" || { echo "missing $f"; exit 1; }; done
for f in "$PROTO"/out/base/classic-ops-*.json; do cmp "$f" "$PROTO/out/$(basename "$f")" || true; done
npx vitest run tests/unit/render/content/art.test.ts tests/unit/render/content/phase6Art.test.ts tests/unit/scenery/art.test.ts tests/unit/render/track/slices.test.ts
npx vitest run 2>&1 | tee "$PROTO/suite-22.log" | tail -15
grep -E "^ *(FAIL|×) " "$PROTO/suite-22.log" | sed -E 's/ +[0-9]+ms$//' | sort -u > "$PROTO/suite-22.txt" || true
comm -23 "$PROTO/suite-22.txt" "$PROTO/baseline-full.txt"
```

Expected: no `missing`; `cmp` prints nothing; recorder tests pass; `comm` prints nothing. Repeat Task 16 Step 2 (B8 after every change).

- [ ] **Step 2: Write `device-checklist.md`** (for the owner; plain words, one section each, every value written into the table at its end):
  1. **Get the test app.** The archive `app-src-0b.tar.gz` (Step 4) holds the worktree without `node_modules`, `dist*` and `.git`. On the Windows computer: unpack, `npm ci`, `npm run mobile:sync`, then Android Studio as Orange Day's `docs/ANDROID-FIRST-RUN.md` Steps 1 and 3 to 5 (open the `android` folder; Pixel 6 emulator with API 34 or 35; Run).
  2. **Android emulator run** (§6 "Also reported"): the title appears; Bench `phone · pixel` finishes and shows numbers; the park pictures appear (sheets load from inside the app); Export then Import (write what happens: today's download may do nothing inside the app); make a save, close the app from the recent-apps list, open it, Continue (does the save remain?); press the back button on the title and in a panel (what happens).
  3. **Android phone** (mid-range): Settings → About → Build number 7 times, USB debugging, Run on the phone. Time from tapping the icon to the first full park frame: screen-record, count from the tap to the first frame with all pictures (B5 device value). Run the five Bench buttons; copy each result panel (Copy button) into a note. Turn the view twice in `cases · pixel` and watch for a stutter.
  4. **Older iPhone** (iPhone 11 or older): needs a Mac with Xcode or a cloud device service (§6). The same steps as the Android phone. Without either, write "not run".
  5. **Table to send back:** per device: model, Android/iOS version, screen refresh rate (Bench `stepMs`), and for each Bench button frame p95, work p95, turn frame (steps), budget max MB, incomplete after turn, missing, first complete ms; app start by screen recording; the emulator answers of item 2.
- [ ] **Step 3: Write the report with this outline (fixed)**

```markdown
# Phase 8b stage 0b report

## 1. Result
One paragraph: which kill rules fired (B1 to B8, with D6 = a and D7 = b), what is still open on real devices, and the advice to the owner (go to the full build, go with changes, or stop). Then one line per owner picture: what it shows.

## 2. Kill rules
| # | Condition (short) | Result | Evidence |
|---|---|---|---|
| B1 | predrawn ≠ stage 0 surface output; new keys format | pass / fired | b1/result.md (counts per kind, first failures; the repair run if any) |
| B2 | phone or build2 frame p95 > 40 ms (strict, for information) | reported | numbers.json pixel.phone, perf-pixel-phone.txt |
| B2b | phone ≤ today and work ≤ today + 2 ms; build2 ≤ 40 ms | pass / fired | the same, perf-today.txt |
| B3-turn | turn frame > 6 steps (for information) | reported | turns of perf-pixel-phone.txt |
| B3b | turn steps ≤ today + 1 (per scene, Test decision 19) | pass / fired | perf-today.txt, perf-pixel-phone.txt |
| B3-other | cold chunk > 12 ms; swap > 3 ms; > 30 incomplete frames; 20 placements > 100 ms | pass / fired | e2e/cases-phone.json, b3other-b5-notes.md |
| B4 | tablet build1/build2 p95 > 40 ms or memory > 64 MB (full set, then coarse) | pass / fired | perf-pixel-tablet*.txt, cases-tablet.json |
| B5 | page start to park > 4 s (new park; Continue build2) | pass / owner | e2e/start-phone.json; device times: owner |
| B6 | shared budget > 64 MB (phone, tablet) | pass / fired | budget max of the perf lines and cases runs |
| B7 | today's look changed | pass / fired | b7-notes.md (cmp, recorder tests, suite vs baseline) |
| B8 | website +2 KB, art folder, worker rules; app build with worker | pass / fired | b8-notes.md, check-app.txt |
Real-device values of B2, B3 and B6: "owner step" until the checklist comes back; a device failure decides over Chromium (§6).

## 3. Numbers next to today's look
Tables from numbers.json, medians of 3: per profile and scene, today | pixel for frame p50/p95, work p95, render p95, turn frame (ms and steps);
cases measures (cold chunk, swap main-thread part, incomplete frames, placements, decode time at throttle 1 and 4 and whether the throttle applied);
app start (new park, Continue build2); the drawing path of the test browser (gpu-*.json); WebKit: result or "not possible here" with the reason; load averages.

## 4. Projected sizes and memory
Art size per kind and total, unique picture count per kind, sheet count, PNG bytes per pack (art/report.json); the projected app size with both frame sets and
with the coarse set only; build time cold and cached; the projection per scene and device (projection.md) next to the measured budget max (B6) with its parts.

## 5. Owner pictures
Each file of OWNER_OUT and what to look at: the phone at k = 3 (the picture phones will get), the new ground, the dithered shadows (and none at night),
the coaster in its swapped colours, today | pixel strip. Reminder: the pictures are the stage 0 art with its faults; the look is not judged (§6).
Owner's answer: (written here by the controller after the gate).

## 6. Open points
The Test decisions of the plan header, one line each, with the result where a task measured one; then what the full build needs from this test
(art scale against 64 MB per §5.8 item 7, the tablet frame set, the B5 limit, real-device results), and anything a task recorded as not done.
main-status.log: one line (did the main checkout's status change; other agents' work; information only).

## 7. Device checklist for the owner
The text of device-checklist.md.
```

- [ ] **Step 4: Archive and deliver**

```bash
set -e
PROTO=/tmp/tc-phase8b-proto
cd "$PROTO/wt"
OWNER_OUT="…"   # the absolute path from the task brief
case "$OWNER_OUT" in /?*) ;; *) echo 'ask the controller for OWNER_OUT (an absolute path)'; exit 1;; esac
case "$(realpath -m -- "$OWNER_OUT")" in /home/user/RC-TYCOON-|/home/user/RC-TYCOON-/*) echo 'OWNER_OUT is in the main checkout: ask the controller for another path'; exit 1;; esac
echo "$OWNER_OUT" >> "$PROTO/written-22.txt"
tar -czf "$PROTO/out/app-src-0b.tar.gz" --exclude=./node_modules --exclude='./dist*' --exclude=./.git --exclude=./mobile/www --exclude='./android/app/src/main/assets/public' -C "$PROTO/wt" .
mkdir -p "$OWNER_OUT" && cp "$PROTO"/out/pictures/*.png "$PROTO/out/numbers.json" "$PROTO/out/stage-0b-report.md" "$PROTO/out/device-checklist.md" "$PROTO/out/app-src-0b.tar.gz" "$OWNER_OUT/"
ls "$OWNER_OUT" | wc -l
```

Expected: the picture count + 4 files. The controller decides how the owner receives the archive (Task 22 delivers it only to `OWNER_OUT`). Do not remove the worktrees.

- [ ] **Step 5: Last task check** (Step 6b with `TASK=22`). Expected: `no-leak`; no `WRONG-DIR`.

---

## Execution batches (sequential; each task: implement, review, fix)

| Batch | Tasks | Note |
|---|---|---|
| 1 Setup | 1 | |
| 2 Tool core | 2, 3, 4 | |
| 3 Catalogue | 5, 6, 7 | |
| 4 Build and the memory gate | 8, 9 | Task 9 Step 4 can stop the plan (projection above 64 MB) |
| 5 Runtime | 10, 11, 12 | |
| 6 Wrapper, checks and harness (no timing) | 13, 14, 15, 16, 17 | Task 14 can stop the plan (second B1 failure); Task 16 must pass before any timing |
| 7 Measuring (quiet machine, controller start condition) | 18, 19, 20 | one at a time; each timing block with the load gate, `run_in_background`, 2 h |
| 8 Results | 21, 22 | the controller writes the owner's answer into report §5 after the gate, and asks the owner to run the device checklist |
