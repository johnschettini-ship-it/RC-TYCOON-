# Phase 8 Stage 0 ("Pixel park" prototype) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the throwaway Pixel prototype of spec section 11 in a separate worktree, and deliver the pictures, the numbers file and the stage 0 report that answer the four questions and the kill rules 1 to 7a.

**Architecture:** All work is in a detached worktree `$PROTO/wt` outside the main checkout. Pixel art comes from a `PixelSurface` (a slot grid at art resolution) behind the existing Canvas calls; twins draw only on a surface, so the worktree in Classic draws today's look. Node tests prove each unit, a Node sheet shows rides and track, one Playwright spec builds the scene and takes the pictures and measures, and one Node test writes `numbers.json`.

**Tech Stack:** TypeScript strict, Vite, plain CSS, Canvas 2D, Vitest (Node environment), Playwright (projects `desktop` 1280 × 800 and `phone` Pixel 7), `node:zlib` for PNG and gzip.

**Spec:** `docs/superpowers/specs/thrills-and-chills/phase-8-pixel-art.md` (approved revision 7). Read sections 1 to 4, 11 (all), 5.1 to 5.6, 6, 7, 8.1 to 8.4, 10, 13.3 and 15 before Task 1. "§" below refers to this spec. The draft script is `git -C /home/user/RC-TYCOON- show art-research:docs/research/art/drafts/pixel3.py` ("`pixel3.py`" below).

## Global Constraints

- **Place.** `PROTO=/tmp/tc-phase8-proto`, a fixed path (not from `TMPDIR`: the tasks run in separate sessions, and a session with another `TMPDIR` would not find the worktree; Prototype decision 22). Every file change of stage 0 is in `$PROTO/wt` (§11.1). Every output goes to `$PROTO/out` (§11.5). All paths in the tasks are relative to `$PROTO/wt` unless they start with `$PROTO` or `/home/user/RC-TYCOON-`.
- **Shell prefix (every command).** The shell keeps no variable and no directory between two tool calls: a call starts again in `/home/user/RC-TYCOON-` with `PROTO` unset. So every command block starts with these three lines, and every one-line `Run:` command starts with `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1;`:

  ```bash
  set -e
  PROTO=/tmp/tc-phase8-proto
  cd "$PROTO/wt"
  ```

  A command with no such prefix is not allowed. Only Task 1 Steps 1 and 2 (before `$PROTO/wt` exists) use `cd "$PROTO"` in place of `cd "$PROTO/wt"`. A "Run: the command of Step N" line runs that command with its prefix. A block that must go on after an expected non-zero exit (a `grep` that must find nothing, a `cmp` loop) puts `|| true` after that command. A block that runs `npx playwright test … | tee <file>` adds `set -o pipefail` after `set -e`, so a failed run stops the block (without it the exit status is that of `tee`). The `check-release.ts` blocks do not add it (an exit 1 from failing release rows other than item 2 is expected there).
- **Load gate (timing runs only).** This machine has 4 cores and is shared: other agents run Vitest and Playwright in the main checkout. Before each timing run (Task 19b Step 2, Task 19c Steps 2 and 4, each of the four blocks of Task 20 Step 1), this shell function must print `quiet`:

  ```bash
  quiet() {
    for i in $(seq 1 30); do
      busy="$(pgrep -af 'vitest|playwright|vite (build|preview)' | grep -v tc-phase8-proto || true)"
      load="$(cut -d' ' -f1 /proc/loadavg)"
      if [ -z "$busy" ] && awk -v l="$load" 'BEGIN { exit !(l < 1.0) }'; then echo quiet; return 0; fi
      echo "wait $i: load $load"; sleep 60
    done
    echo "not quiet after 30 min"; exit 1
  }
  ```

  On `not quiet after 30 min` the block stops: report to the controller, who starts the same block again in a later quiet window (the task does not fail; nothing of that block counts until it passes). Each timing task writes `cat /proc/loadavg` before and after each run into its notes file (`kill2-4-notes.md`, `kill3-notes.md`). When kill rule 3 or 4 fires, that one run is repeated once in a quiet window before the result counts, and the report gives both values. A block defines `quiet` after its prefix lines (copy the function above), and its port check (Ports below) comes right after `quiet`, just before its run, because a port can be taken while the gate waits.
- **Start condition of the measuring tasks (controller).** The controller starts Task 19b, Task 19c and Task 20 (the frame measures, the tuning round and the perf runs) only when no other agent runs tests on this machine. The load gate stays as a second guard inside every timing block.
- **Time limits.** A background Bash call with no `timeout` is stopped after 1 800 000 ms (30 min), in the middle of a run; a foreground call stops at 600 000 ms (10 min). A block that calls `quiet` waits up to 30 minutes before its run starts, so it can run longer than 30 minutes: run it with `run_in_background` and `timeout: 7200000` (2 h, the controller's limit for a measuring task) and wait for it to end; each such block says so. One timing block holds one run (one `npx playwright test` command), so it fits in 2 h. A block without a gate that can run longer than 10 minutes (Task 1 Steps 2 to 4, Task 17 Steps 2 and 4, Task 19a Step 2, Task 21 Step 3, Task 22 Step 1) runs with `run_in_background` and `timeout: 3600000`.
- **The main checkout is read-only.** No command of this plan writes under `/home/user/RC-TYCOON-`: every command runs with `$PROTO/wt` as its working directory (Task 1 Steps 1 and 2: `$PROTO`), or names the worktree path (`git -C /home/user/RC-TYCOON- worktree add --detach "$PROTO/wt" HEAD`). Run no npm, test, build or server command in the main checkout. The only git commands that write under its `.git` folder are the two `git worktree add` commands of §11.1 and §11.4 and `git add -A` inside `$PROTO/wt` (the worktree's own index under `.git/worktrees/`); every `git status` and `git diff` of the plan passes `--no-optional-locks`, so it does not refresh an index (`git rev-parse` reads only). Other agents work in the main checkout during stage 0: they change files there and commit. Its state therefore changes for reasons outside the prototype; that is never a stop. Never restore, delete or edit anything there.
- **The task check.** Every task starts with Task 1 Step 6a (Task 1 itself: its Step 1) and ends with Task 1 Step 6b. Both append `git --no-optional-locks -C /home/user/RC-TYCOON- status --porcelain` to `$PROTO/out/main-status.log` (for the report only). Step 6b stops the stage only on a `WRONG-DIR` line (the block did not run in `$PROTO/wt`) or a `LEAK` line (a path under `/home/user/RC-TYCOON-` is in the task's written list).
- **The written list.** Each task keeps `$PROTO/written-<task>.txt` (Step 6a empties it): one absolute path per line for every file or folder that its own commands and edits write. After each Write or Edit tool call it appends the path (`$PROTO/wt/<path>`); after each command block it appends each target of `>`, `>>`, `tee`, `cp`, `mkdir` and `rm`, each path given in `TC_PROTO_OUT`, `TC_PROTO_HASHES`, `TC_PROTO_TRACE` or `OWNER_OUT`, and `$PROTO/wt` (or `$PROTO/base`) for each `npm`, `npx` or `git add -A` run there (they write `dist`, `test-results` and caches in that folder). Step 6b adds the worktree's changed paths and the files under `$PROTO` that are newer than the task's start mark. The git metadata of the three git commands named above is not in the list.
- **No commits.** `$PROTO/wt` has no commits of its own: its `HEAD` stays the base commit (§11.4, the base worktree reads it). A task ends with `git add -A` in `$PROTO/wt` (stage only). The reviewer of a task reads `git --no-optional-locks -C "$PROTO/wt" diff` and `git --no-optional-locks -C "$PROTO/wt" status --short` (with the prefix) before that step. Never push, never commit, never create a branch.
- **Ports.** Each Playwright run uses its own `PW_PORT` (§11.4: 4391 to 4395; Task 19a uses 4391, Task 19b 4397, Task 19c 4398 for its profile run; Prototype decision 23). Development runs (Task 18 Step 5) use 4396 or 4399. Before each run, this check prints `free`: `test "$(lsof -nP -iTCP:$PW_PORT -sTCP:LISTEN -t | wc -l)" -eq 0 || { echo "port $PW_PORT busy"; exit 1; }; echo free` (with `PW_PORT` set to the run's port; `ss` is not installed on this machine, `lsof` is `/usr/bin/lsof`). On `port … busy` the block stops; pick another free port in the same range. Reason: the config reuses any server on the port (`playwright.config.ts:12-17`).
- **One Playwright worker.** Every Playwright command of this plan passes `--workers=1`. `playwright.config.ts` sets no `workers`, and this machine has 4 cores, so two projects would run in parallel workers and every timing would be taken under CPU contention (`perf-build3.spec.ts:19`: timings on a shared machine are noise).
- **Simulation.** No file under `src/sim/` changes, also not in the worktree (§2 non-goal 1).
- **No image files in `src` or `tests`.** PNG files are written only under `$PROTO/out` (§2 non-goal 3, §8.6 item 1).
- **Raster rules.** Whole-number raster, `Math.imul` hashes, no time, no random numbers, no read-back from a canvas in art code. Every surface pixel is one slot with alpha 0 or 255 (§5.3 rule 7). Timing code (Task 5, 9, 18) only measures; it never changes a pixel.
- **Branch rule.** A change to an existing art function is a surface branch: `if (isPixelSurface(ctx)) …` before the Classic body. The Classic body does not change (§5.4 rules 1, 2). Code that runs outside a surface branches on `artStyle()`.
- **Node tests start in Classic.** A test that calls `setArtStyle('pixel')` calls `setArtStyle('classic')` in `afterEach`.
- **Comments.** Code comments are in English, in short sentences, in the style of the existing files. Each new file starts with `/** Phase 8 stage 0 prototype (never merged): <job>. */`.
- **Gates of every code task:** `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx tsc --noEmit` prints nothing; the task's own tests pass; `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/render/content/art.test.ts tests/unit/render/content/phase6Art.test.ts tests/unit/scenery/art.test.ts tests/unit/render/track/slices.test.ts` passes (the recorder tests of kill rule 6).
- **Language of the plan words.** "Pixel" means `artStyle() === 'pixel'`. "Surface" means a `PixelSurface`. "Slot" and "tone" as §4.

## Review Focus

1. **A Playwright run reuses a server on its port that another agent started in the main checkout.** The run then measures the wrong build and looks valid. Test: the lsof port check before every run (Global Constraints), Tasks 19a and 19b assert `#game[data-art="pixel"]` on the "after" page (only the prototype sets it), and Task 20 checks the printed `n` (only the prototype prints a number there).
2. **A Node test leaves the style at `'pixel'`.** Later tests in the same file then run Pixel and the recorder tests change. Test: Task 2 (`style.test.ts`, "a fresh import starts in classic") and the `afterEach` rule of the Global Constraints; Task 17 runs the recorder tests in one process.
3. **A sprite with odd bounds (litter `left −9`, `top −7`; mess `left −11`; guests with items `left −13`).** The anchor must stay a whole art pixel. Test: Task 5 (`evenBounds` case).
4. **`VITE_PROTO_DROP` does not remove the twin from the bundle (no constant folding).** Then `C_ride` or `C_guest` is near 0 and the projection `P` is too low. Test: Task 21 Step 3 (the twin marker string is absent from the drop build; `C_ride > 0` and `C_guest > 0`).
5. **The home level on the Pixel 7 profile is 8/7; `data-zoom` (3 decimals) gives `artScale(1.143) = 0`.** Test: Task 6 (`artScale(Number(String(level)))` and `artScale(1.143) === 0`) and Task 7 (`data-home-zoom` at full precision).
6. **A command runs in the main checkout or writes there.** The shell starts each tool call in `/home/user/RC-TYCOON-` with `PROTO` unset, so a block without the prefix runs Vitest there (false evidence for kill rule 6, and a second test run beside the one in progress) or writes to `/out`. Other agents change and commit files in the main checkout at the same time, so its status cannot tell a prototype leak from their work. Test: Task 1 Step 6b prints `WRONG-DIR` when its block does not run in `$PROTO/wt`, and prints `LEAK` with the path when the task's written list (the files that the task's own commands and edits wrote, Global Constraints) holds a path under `/home/user/RC-TYCOON-`; a change of the main checkout's status is only logged (`main-status.log`). The reviewer also checks that every command block of the task starts with the prefix of the Global Constraints, and that the task's written list names every output of its blocks.

## Coverage map

| Item of §11 | Task |
|---|---|
| 11.1 worktree, `npm ci`, base `B` | 1 |
| 11.2 scene items 1 to 9, one save for "before" and "after" | 19a (19b loads the same save) |
| 11.3 `src/render/pixel/style.ts` | 2 |
| 11.3 `src/render/pixel/derived.ts`; `src/render/palette.ts` `shade` memo (and `mixHex`, `src/render/scenery/art/kit.ts`) | 2 |
| 11.3 `src/render/pixel/palette.ts`, `colourMap.ts` | 3 (fixed entries), 15 (scene entries) |
| 11.3 `src/render/pixel/surface.ts` | 4 |
| 11.3 `src/render/canvas.ts` `buildSprite`; `src/render/sprites/shapes.ts` `ArtCtx` | 5 |
| 11.3 `src/render/pixel/grid.ts` | 6 |
| 11.3 `src/perf/quality.ts`, `src/styles/main.css`, `src/main.ts` | 7 (and 2 for `boot`) |
| 11.3 `src/render/renderer.ts` (copies, anchors, dots, attributes) | 7, 8, 13, 18 |
| 11.3 `src/render/management/layer.ts`; `src/render/scenery/layer.ts` | 8 |
| 11.3 `src/render/pixel/ground.ts`; `src/render/terrain.ts` | 9 |
| 11.3 `src/render/pixel/art/shapes.ts`; `shapes.ts` surface branches | 10 |
| 11.3 `src/render/pixel/stamp.ts`, `sprites/people.ts`; `src/render/sprites/props.ts` | 11 |
| 11.3 `src/render/pixel/art/rides.ts`; `src/render/sprites/rides.ts` | 12 |
| 11.3 `src/render/pixel/shadows.ts` (with the frame order of §8.4 item 4) | 13 |
| 11.3 `src/render/track/layer.ts` | 14 |
| 11.3 `tests/unit/render/pixel/protoSheet.test.ts` | 16 |
| 11.3 `tests/unit/render/pixel/classicOps.test.ts` | 17 |
| 11.3 `tests/e2e/perf-build3.spec.ts`; the `window.__pixelStats` probe | 18 |
| 11.3 `tests/e2e/helpers.ts` `newParkAt`; `tests/e2e/pixelProto.spec.ts` | 19a, 19b |
| 11.3 `tests/unit/render/pixel/protoNumbers.test.ts` | 21 |
| 11.4 `worktree add`, `npm ci` (11.1); base worktree and `release-base.txt` (lines 889-890) | 1 |
| 11.4 `pixelProto.spec.ts` run (line 880) | 19a (`-g pictures`), 19b (`-g "measures and grid"`) |
| 11.4 `protoSheet.test.ts` run (line 881) | 16 |
| 11.4 four perf runs (lines 882-885) | 20 |
| 11.4 three release builds (lines 886-888) | 21 |
| 11.4 `classicOps` copy, two runs, `cmp` loop, recorder tests (lines 891-894, 896) | 17, again in 22 |
| 11.4 `protoNumbers.test.ts` run (line 895) | 21 |
| 11.5 `before-*.png`, `after-*.png`, `strip-desktop.png` | 19a |
| 11.5 `sheet-rides-track.png` | 16 |
| 11.5 `numbers.json` | 19b (per project parts), 21 (merge) |
| 11.5 `perf-*.txt` | 20 |
| 11.5 `release-*.txt` | 1 (base), 21 |
| 11.5 `classic-ops-*.json`, `base/classic-ops-*.json` | 17 |
| Kill rule 1 (owner: after picture closer to draft) | 19a (pictures), 22 (gate) |
| Kill rule 2 (grid check) | 19b |
| Kill rules 3, 3a (phone p95 at `k` 2 and 3) | 20, 21 |
| Kill rule 4 (chunk and ride build on the throttled phone) | 19b, 19c (the one tuning round) |
| Kill rule 5 (track joins) | 14, 16 |
| Kill rule 6 (Classic unchanged) | 17, 22 |
| Kill rules 7, 7a (projection `P`) | 21 |
| 11.7 line 1 (`ls` of outputs) | 22 |
| 11.7 line 2 (`canvas ratio` grep) | 20 |
| 11.7 line 3 (`cmp` loop prints nothing) | 17, 22 |
| 11.7 line 4 (last `vitest` command passes) | 17, 22 (with the whole suite against the baseline of Task 1) |
| 11.7 line 5 (`numbers.json` keys) | 21 |
| 11.7 line 6 (report: kill rules and §15 values) | 22 |
| 11.7 line 7 (owner pictures delivered; the answer recorded) | 22 (the answer is written by the controller) |

## Prototype decisions

Each line is a decision of this plan that departs from section 11 or adds to it. Section 6 of the stage 0 report (Task 22) copies this list, with the result of each line where a task measured one.

1. `tone()` on the `i` ramp: a dark move stops at `i2` (§6.5 item 2). `paletteStats.missed` is a prototype member. Left out: the `r` ramps, `trackSlot`, `ghostTable`, `SHADE_STEP` (Task 15 uses the step 1.18 as a number), and the colour-blind check of §6.6 (the four slot pairs at `CB_MIN_DELTA_E` 10, a case of the §13.3 `palette.test.ts` row) (Task 3).
2. `PixelSurface.plot(x, y, slot)` is a prototype member, not in §5.3; Task 9 paints the ground with it (Task 4).
3. The Pixel branch of `buildSprite` has no tint remap (§5.1 step 4), no `artHash` and no hash log (§5.1 step 7, stage 1a-ii). `artBuildLog.surfaces` and `artBuildStats` are prototype seams (Task 5).
4. Left out of `grid.ts`: `stepLevel`, `levelStep`, `pixelGrid`, `publishGrid`, `snapCar`, `CAR_SLOPE_MAX`; `applyPlan` publishes no grid (Tasks 6, 7).
5. `data-complete` comes from `terrain.complete` (no build budget). The management layer `begin` keeps its signature and reads `artStyle()`. A guest's snap slope comes from its motion, not from its frame (Task 8).
6. Ground: flat tiles by inverse mapping; water opaque `a2` only: no water dashes (`a1` 7.5 %, `a3` 6 %), no far shore (`a4`) or near shore (`a1`), no grass bank next to water (`g4` within 0.2 tile, `s4` within 0.09 tile) (§8.1 item 7); no details (`GROUND_DETAIL_SHARE`), no posts or rope on queues, no strata line; `soft` ignored; the face polygons are copied from `terrain.ts` (Task 9).
7. `pixelCone` ignores its `segments` argument and draws `CONE_SEGMENTS` (16) segments (Task 10).
8. Guests keep `GUEST_BOUNDS`; no items, rings or sit frame; the step rows are made from the front and back rows by a change of the last two rows; no frame is mirrored (Task 11).
9. Carousel twin: draft radii × 0.8 and heights × 0.75; no riders; no `pixelRideHeight`, no `pixelGate` (Task 12).
10. Shadows: no edge casters, no `staff`, `pathItem` or `show` kinds, no shadows at `n = 0` (Task 13). Ellipse casters of scenery centre on the footprint centre (§8.4 item 2 names "the item's anchor" and does not say which point; the draft, `sh_ell(x, y, r, k)`, `pixel3.py:173-175`, and the Classic in-art shadow, `shadow(ctx, 0.5, 0.5, r)`, `src/render/scenery/art/base.ts:43`, centre on the tile centre); box casters keep the back corner (Task 13).
11. `paintSlice` gains a 4th parameter `extras = true` (Task 14).
12. Sheet layout: background `g2`, 2 sheet pixels per art pixel, 6 rides per row, no text (Task 16).
13. `rideBuildMsMax` is a prototype key of `__pixelStats` (Task 18).
14. The scene coordinates; the south leg of the footpath cross is 15 tiles, to the entrance road; the strip crops at (320, 200) and (320, 180) (Task 19a).
15. The §11.4 `pixelProto.spec.ts` run is split into two runs (`pictures`, `measures and grid`) that share one save file; one `numbers-<project>.json` per project, merged by Task 21; with `TC_PROTO_REUSE_SAVE=1` the `pictures` test loads the saved park and builds none, so a repeat of the pictures keeps the map of the measures (Tasks 19a, 19b, 19c, 21).
16. Every Playwright command passes `--workers=1` (Global Constraints).
17. `scripts/check-release.ts` prints `(N bytes)` after the item 2 value (Task 21).
18. The terrain chunk copy (`terrain.ts:638-643`, `TerrainLayer.draw`) does not change, though §11.3 names it: at a crisp level `f = n` and `offX`, `offY` and `sp.ox` are whole, so the copy is on the art grid (§5.5 stage 1c `draw` row). Kill rule 2 checks it (Task 9).
19. The frame p95 of a perf file is the mean of its counted `[perf]` lines (the spec does not say how to combine more than one line); Pixel files count only lines with `n > 0` (Tasks 20, 21).
20. The load gate before every timing run, the start condition of the measuring tasks (no other agent runs tests), and the repeat of a run that fires kill rule 3 or 4 (Global Constraints, Tasks 19b, 19c, 20).
21. The desktop `chunkBuildMsMax` is read after the desktop turn prefetch (`renderer.ts:907`, `prefetchTurn` `:973-986`), so it is not a cold-build measure; the report gives it as "after prefetch" (Task 19b).
22. `PROTO` is the fixed path `/tmp/tc-phase8-proto`, not `"${TMPDIR:-/tmp}/tc-phase8-proto"` of §11.1 and §11.4 (Global Constraints "Place").
23. Ports outside the 4391 to 4395 of §11.4: Task 19b uses 4397, Task 19c 4398, the development run of Task 18 4396 (or 4399), so no run of this plan reuses the server of another (Global Constraints "Ports").
24. The tuning round profiles the slow build with a CDP CPU profile (`Profiler.start` and `Profiler.stop`), not a trace (Tasks 19b, 19c).

---

### Task 1: Worktree, base build and baseline

**Files:** none in the repository. Creates `$PROTO/wt`, `$PROTO/base`, `$PROTO/out`, `$PROTO/out/base`.

**Interfaces:**
- Produces: `$PROTO/base-sha` (the base commit), `$PROTO/out/main-status.log` (the main checkout status at the start and the end of each task, for the report; never a stop), `$PROTO/written-<task>.txt` and `$PROTO/task-<task>.start` (the written list and the start mark of each task, Step 6), `$PROTO/out/release-base.txt`.

- [ ] **Step 1: Record the base commit and start the task check (Step 6a for Task 1)**

```bash
set -e
PROTO=/tmp/tc-phase8-proto
mkdir -p "$PROTO/out/base" "$PROTO/out/e2e" "$PROTO/scratch"
cd "$PROTO"
git --no-optional-locks -C /home/user/RC-TYCOON- rev-parse HEAD > "$PROTO/base-sha"
{ echo "--- task 1 start $(date -u +%FT%TZ)"; git --no-optional-locks -C /home/user/RC-TYCOON- status --porcelain; } >> "$PROTO/out/main-status.log"
printf '%s\n' "$PROTO/out" "$PROTO/scratch" "$PROTO/base-sha" > "$PROTO/written-1.txt"
touch "$PROTO/task-1.start"
```

Expected: `$PROTO/base-sha` holds the HEAD of `ccr-6f420895-3xt45j` at this moment. Step 6a cannot run yet (it needs `$PROTO/wt`), so this block does its work for Task 1.

- [ ] **Step 2: Create the worktree (§11.1)**

```bash
set -e
PROTO=/tmp/tc-phase8-proto
cd "$PROTO"
git -C /home/user/RC-TYCOON- worktree add --detach "$PROTO/wt" HEAD
cd "$PROTO/wt"
npm ci
echo "$PROTO/wt" >> "$PROTO/written-1.txt"
```

The `worktree add` writes the worktree entry under the main checkout's `.git/worktrees/` (allowed, Global Constraints); it is not in the written list.

- [ ] **Step 3: Base worktree and `release-base.txt` (§11.4 lines 889-890)**

```bash
set -e
PROTO=/tmp/tc-phase8-proto
cd "$PROTO/wt"
git -C /home/user/RC-TYCOON- worktree add --detach "$PROTO/base" "$(git -C "$PROTO/wt" rev-parse HEAD)"
(cd "$PROTO/base" && npm ci && npm run build && node scripts/check-release.ts --no-build --no-tests | tee "$PROTO/out/release-base.txt")
printf '%s\n' "$PROTO/base" "$PROTO/out/release-base.txt" >> "$PROTO/written-1.txt"
```

Expected: `grep "Initial load" "$PROTO/out/release-base.txt"` prints one row with `PASS` and a value in KB.

- [ ] **Step 4: Baseline gates in the worktree**

```bash
set -e
PROTO=/tmp/tc-phase8-proto
cd "$PROTO/wt"
npx tsc --noEmit
npx vitest run tests/unit/render tests/unit/scenery 2>&1 | tail -5 | tee "$PROTO/baseline.txt"
npx vitest run 2>&1 | tee "$PROTO/baseline-full.log" | tail -15
grep -E "^ *(FAIL|×) " "$PROTO/baseline-full.log" | sed -E 's/ +[0-9]+ms$//' | sort -u > "$PROTO/baseline-full.txt" || true
wc -l < "$PROTO/baseline-full.txt"
```

Expected: `tsc` prints nothing; the render and scenery run reports 0 failed. The whole suite runs once on the base code: `baseline-full.txt` holds the names of the tests that already fail on the base or in this environment (the last line prints their count, often 0). Record the count in `$PROTO/out/baseline-notes.md`. Tasks 17 and 22 compare with this file.

- [ ] **Step 5: Check the base commit**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; test "$(git rev-parse HEAD)" = "$(cat "$PROTO/base-sha")" && echo same`
Expected: `same`. Then Step 6b with `TASK=1`.

- [ ] **Step 6: The task check (Step 6a at the start of every task from Task 2 on, Step 6b at the end of every task)**

Step 6a (start):

```bash
PROTO=/tmp/tc-phase8-proto
cd "$PROTO/wt" || exit 1
TASK="<task number>"
test "$(pwd)" = "$PROTO/wt" || echo WRONG-DIR
{ echo "--- task $TASK start $(date -u +%FT%TZ)"; git --no-optional-locks -C /home/user/RC-TYCOON- status --porcelain; } >> "$PROTO/out/main-status.log"
: > "$PROTO/written-$TASK.txt"
touch "$PROTO/task-$TASK.start"
echo started
```

Step 6b (end, after the task's last `git add -A`):

```bash
PROTO=/tmp/tc-phase8-proto
cd "$PROTO/wt" || exit 1
TASK="<task number>"
test "$(pwd)" = "$PROTO/wt" || echo WRONG-DIR
{ echo "--- task $TASK end $(date -u +%FT%TZ)"; git --no-optional-locks -C /home/user/RC-TYCOON- status --porcelain; } >> "$PROTO/out/main-status.log"
git --no-optional-locks status --porcelain --no-renames | cut -c4- | sed "s|^|$PROTO/wt/|" >> "$PROTO/written-$TASK.txt"
find "$PROTO" \( -path "$PROTO/wt/node_modules" -o -path "$PROTO/base/node_modules" \) -prune -o -type f -newer "$PROTO/task-$TASK.start" -print >> "$PROTO/written-$TASK.txt"
sort -u "$PROTO/written-$TASK.txt" | while IFS= read -r p; do realpath -m -- "$p"; done | grep -E '^/home/user/RC-TYCOON-(/|$)' && echo LEAK || echo no-leak
```

Set `TASK` to the number of the running task (for example `TASK=9`) in both blocks. The blocks have no `set -e`, so every check prints. Expected: Step 6a prints `started`; Step 6b prints `no-leak`; neither prints `WRONG-DIR`. `realpath -m` resolves `..` and symbolic links, so a path that points into the main checkout shows with its real place.

Rule: other agents work in the main checkout and change and commit files there, so the two status records in `main-status.log` can differ for reasons outside the prototype; that is logged for the report (Task 22) and the task goes on. A `WRONG-DIR` line, or a `LEAK` line (it prints the paths of the written list that lie under `/home/user/RC-TYCOON-`): stop and report the output, `written-$TASK.txt` and `main-status.log` to the controller. Never restore, delete or edit anything in `/home/user/RC-TYCOON-` (no `git checkout`, no `git stash`, no `rm`). Step 6b of Task 1 runs after Step 5 with `TASK=1` (Task 1 has no Step 6a: Step 1 did its work).

---

### Task 2: Art style switch and derived-colour memo

**Files:**
- Create: `src/render/pixel/style.ts`, `src/render/pixel/derived.ts`
- Modify: `src/render/palette.ts` `shade` (`:122-132`): call `noteDerived(out, hex, f)` before the return; `src/render/scenery/art/kit.ts` `mixHex` (`:77-83`): call `noteMixed(out, a, b, t)` before the return (§6.5 "Derived colours": every function under `src/render/` that builds a colour from another records it; Task 15 reads both kinds); `src/main.ts` `boot` (`:16-51`): one call `setArtStyle(resolveArtStyle('auto', location.search, import.meta.env.VITE_ART))` after `game` exists (`:23`) and before the first `resize()` (`:36`)
- Test: `tests/unit/render/pixel/style.test.ts`, `tests/unit/render/pixel/derived.test.ts`

**Interfaces:**
- Produces, `style.ts` (the full unit of §5.2): `type ArtStyle = 'classic' | 'pixel'`; `type ArtStyleSetting = 'auto' | ArtStyle`; `const ART_STYLE_AUTO: ArtStyle = 'classic'`; `resolveArtStyle(setting: ArtStyleSetting, search: string, buildDefault: string | undefined): ArtStyle`; `setArtStyle(s: ArtStyle): void`; `artStyle(): ArtStyle`; `artStyleVersion(): number`.
- Produces, `derived.ts` (the full unit of §5.2): `type DerivedRecord`; `startDerivedMemo(): void`; `stopDerivedMemo(): readonly DerivedRecord[]`; `noteDerived(out: string, base: string, f: number): void`; `noteMixed(out: string, a: string, b: string, t: number): void`. It imports nothing.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/render/pixel/style.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { ART_STYLE_AUTO, artStyle, artStyleVersion, resolveArtStyle, setArtStyle } from '../../../../src/render/pixel/style';

afterEach(() => setArtStyle('classic'));

describe('art style (§9.2)', () => {
  it('a fresh import starts in classic', () => {
    expect(artStyle()).toBe('classic');
    expect(ART_STYLE_AUTO).toBe('classic');
  });
  it('takes the address flag, then the setting, then the build value, then auto', () => {
    expect(resolveArtStyle('classic', '?art=pixel', 'classic')).toBe('pixel');
    expect(resolveArtStyle('pixel', '?x=1&art=classic', 'pixel')).toBe('classic');
    expect(resolveArtStyle('pixel', '', 'classic')).toBe('pixel');
    expect(resolveArtStyle('auto', '', 'pixel')).toBe('pixel');
    expect(resolveArtStyle('auto', '?art=bogus', 'bogus')).toBe('classic');
    expect(resolveArtStyle('auto', '', undefined)).toBe(ART_STYLE_AUTO);
  });
  it('setArtStyle raises the version only on a change', () => {
    const v = artStyleVersion();
    setArtStyle('classic');
    expect(artStyleVersion()).toBe(v);
    setArtStyle('pixel');
    expect(artStyleVersion()).toBe(v + 1);
    setArtStyle('pixel');
    expect(artStyleVersion()).toBe(v + 1);
  });
});
```

```ts
// tests/unit/render/pixel/derived.test.ts
import { describe, expect, it } from 'vitest';
import { noteDerived, noteMixed, startDerivedMemo, stopDerivedMemo } from '../../../../src/render/pixel/derived';
import { shade } from '../../../../src/render/palette';
import { mixHex } from '../../../../src/render/scenery/art/kit';

describe('derived-colour memo (§6.5)', () => {
  it('records only between start and stop; shade output does not change', () => {
    const out = shade('#3d9be0', 0.7);
    noteDerived('#000001', '#000002', 2);
    startDerivedMemo();
    expect(shade('#3d9be0', 0.7)).toBe(out);
    noteMixed('#aaaaaa', '#ffffff', '#555555', 0.5);
    expect(stopDerivedMemo()).toEqual([
      { out, base: '#3d9be0', f: 0.7 },
      { out: '#aaaaaa', a: '#ffffff', b: '#555555', t: 0.5 },
    ]);
    expect(stopDerivedMemo()).toEqual([]);
  });
  it('mixHex records its output while the memo runs', () => {
    startDerivedMemo();
    const out = mixHex('#ffffff', '#000000', 0.5);
    expect(stopDerivedMemo()).toEqual([{ out, a: '#ffffff', b: '#000000', t: 0.5 }]);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/render/pixel/style.test.ts tests/unit/render/pixel/derived.test.ts`
Expected: FAIL, "Cannot find module …/pixel/style" and "…/pixel/derived".

- [ ] **Step 3: Implement `style.ts`, `derived.ts`, the `shade` and `mixHex` calls and the `boot` call**

`resolveArtStyle` follows §9.2 items 1 to 4; it reads the flag with `new URLSearchParams(search).get('art')`. The module state follows `src/perf/quality.ts:122-138`. Outside a memo, `noteDerived` and `noteMixed` return at once.

- [ ] **Step 4: Run the tests to see them pass**

Run: the command of Step 2. Expected: PASS. Then the Global gates.

- [ ] **Step 5: Stage**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; git add -A`. Then Task 1 Step 6b.

---

### Task 3: Palette and fixed colour map

**Files:**
- Create: `src/render/pixel/palette.ts`, `src/render/pixel/colourMap.ts`
- Test: `tests/unit/render/pixel/palette.test.ts`

**Interfaces:**
- Consumes: `tintStepRgb` (`src/render/palette.ts:96-103`), `GHOST_*` (`src/render/palette.ts:10-24`), `SAFE_PALETTE` (`src/data/tuning/a11y.ts:15`, upper case: store the ramps lower case).
- Produces, `palette.ts` (part of the §5.2 unit): `type RampId` (`'g' | 's' | 'o' | 't' | 'b' | 'v' | 'c' | 'l' | 'w' | 'k' | 'a' | 'p' | 'i' | 'n' | 'e' | 'x' | 'y' | 'q' | 'u'`); `const RAMPS: Readonly<Record<RampId, readonly string[]>>`; `const SLOT_NAMES: readonly string[]` (index 0 = `''`, then the ramps in `RampId` order, tones 1 up); `const SLOT_RGBA: Uint32Array` (the colour as `0xAABBGGRR`, alpha 255, the byte order of `ImageData` on little-endian; index 0 is 0); `const INK_SLOT: number`; `slotIndex(name: string): number` (throws on an unknown name); `slotOf(css: string): number`; `nearestInFamily(rgb: number): number` (`rgb` is `0xRRGGBB`); `tone(name: string, steps: number): string`; `const paletteStats: { misses: number; missed: Set<string> }` (`missed` is a prototype member: the CSS strings that went to the fallback rule; Task 15 prints it). Left out in stage 0: the `r` ramps, `trackSlot`, `ghostTable`, `SHADE_STEP` (no track twin, no ghost and no generator in the prototype), and the colour-blind case of the §13.3 `palette.test.ts` row (the four pairs of §6.6 at `CB_MIN_DELTA_E` 10; pair 4 reads `QUEUE_SLOT`): no slot choice of stage 0 is final (Prototype decision 1).
- Produces, `colourMap.ts`: `const QUEUE_SLOT = 'n3'`; `const COLOUR_MAP: Readonly<Record<string, string>>` with keys sorted. This task holds the fixed entries of §6.4 and the 12 shirt rows. Task 15 adds the scene entries.
- `tone(name, steps)` returns the slot name `steps` tones darker (positive) or lighter (negative) on the same ramp, clamped to the ramp; on the `i` ramp a dark move stops at `i2` (prototype decision, from §6.5 item 2).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/render/pixel/palette.test.ts
import { describe, expect, it } from 'vitest';
import { COLOUR_MAP, QUEUE_SLOT } from '../../../../src/render/pixel/colourMap';
import { INK_SLOT, RAMPS, SLOT_NAMES, nearestInFamily, paletteStats, slotIndex, slotOf, tone } from '../../../../src/render/pixel/palette';

const ramp = (slot: number): string => (SLOT_NAMES[slot] as string).replace(/\d+$/, '');

describe('palette (§6.1 to §6.5)', () => {
  it('draft ramps, unique slot names, ink', () => {
    expect(RAMPS.g).toEqual(['#f0e07a', '#d6c85a', '#bdb24b', '#98993f', '#6f7f3a', '#4d6238']);
    expect(RAMPS.i).toEqual(['#6e4470', '#4a2c52', '#2a1a36']);
    expect(RAMPS.n).toEqual(['#f4f1ea', '#dcd6cc', '#bdb5ab', '#958d8a', '#6d6670', '#4d4856']);
    expect(RAMPS.y).toHaveLength(9);
    expect(new Set(SLOT_NAMES).size).toBe(SLOT_NAMES.length);
    expect(SLOT_NAMES[0]).toBe('');
    expect(SLOT_NAMES[INK_SLOT]).toBe('i3');
  });
  it('rule 0: a signal colour gives its signal slot; a shared colour gives the first in x, y, q, u order; #56b4e9 gives b2', () => {
    expect(slotOf(RAMPS.x[0] as string)).toBe(slotIndex('x1'));
    expect(slotOf(RAMPS.u[1] as string)).toBe(slotIndex('u2')); // #e69e66, not shared
    expect(slotOf('#d55e00')).toBe(slotIndex('x4')); // u3 (GHOST_INVALID) = x4
    expect(slotOf(RAMPS.u[2] as string)).toBe(slotIndex('x4'));
    expect(slotOf(RAMPS.q[2] as string)).toBe(slotIndex('x1')); // q3 (GHOST_VALID) = x1
    for (const r of ['x', 'y', 'q', 'u'] as const) {
      for (const c of RAMPS[r]) {
        if (c === '#56b4e9') continue;
        const first = (['x', 'y', 'q', 'u'] as const).flatMap((s) => RAMPS[s].map((v, k) => [v, `${s}${k + 1}`] as const)).find(([v]) => v === c)!;
        expect(slotOf(c), c).toBe(slotIndex(first[1]));
      }
    }
    const m = paletteStats.misses;
    expect(slotOf('#56b4e9')).toBe(slotIndex('b2'));
    expect(paletteStats.misses).toBe(m);
  });
  it('fixed entries and shirts (§6.4)', () => {
    const want: Record<string, string> = {
      '#6dbb4f': 'g2', '#64b049': 'g3', '#a9c0d2': QUEUE_SLOT, '#dcc79c': 's2', '#f2f6fa': 'e1', '#e6edf3': 'e2',
      '#9a7148': 'w2', '#7b5835': 'w3', '#c5ced8': 'n3', '#3b4250': 'n5', '#000000': 'i2',
      '#e8503a': 'o4', '#f39a2b': 'o3', '#f5d03b': 'o1', '#7cc04b': 'l2', '#2fb39a': 't2', '#3d9be0': 'b2',
      '#4f63d9': 'b3', '#8d5ad8': 'v2', '#d457a8': 'p2', '#f2f2f2': 'c1', '#a0522d': 'w2', '#30425a': 'i2',
    };
    for (const [css, slot] of Object.entries(want)) expect(SLOT_NAMES[slotOf(css)], css).toBe(slot);
    expect(QUEUE_SLOT).toBe('n3');
    const keys = Object.keys(COLOUR_MAP);
    expect(keys).toEqual([...keys].sort());
    for (const v of Object.values(COLOUR_MAP)) {
      expect(SLOT_NAMES).toContain(v);
      expect(v).not.toBe('i3');
    }
  });
  it('family rules a to e (§6.5)', () => {
    expect(['n', 'e', 'c']).toContain(ramp(nearestInFamily(0x808080))); // a
    expect(ramp(nearestInFamily(0x2050e0))).toBe('b'); // b: hue 226, only b2 (211) is within 30
    expect(ramp(nearestInFamily(0x33cc66))).toBe('t'); // c: hue 140, nearest mid tone t3 (174)
    expect(SLOT_NAMES[nearestInFamily(0x2a1a36)]).toBe('i2'); // d: dark plum, never i3
    for (let r = 0; r < 256; r += 37) for (let g = 0; g < 256; g += 37) for (let b = 0; b < 256; b += 37) {
      const s = nearestInFamily((r << 16) | (g << 8) | b);
      expect(['x', 'y', 'q', 'u']).not.toContain(ramp(s)); // e
      expect(s).not.toBe(INK_SLOT);
    }
  });
  it('a colour with no entry is a miss; an entry is not', () => {
    const m = paletteStats.misses;
    slotOf('#6dbb4f');
    expect(paletteStats.misses).toBe(m);
    slotOf('rgba(18, 52, 86, 0.4)');
    expect(paletteStats.misses).toBe(m + 1);
  });
  it('tone moves along one ramp and never reaches ink', () => {
    expect(tone('g2', 1)).toBe('g3');
    expect(tone('g6', 1)).toBe('g6');
    expect(tone('g1', -1)).toBe('g1');
    expect(tone('i2', 1)).toBe('i2');
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/render/pixel/palette.test.ts`
Expected: FAIL, "Cannot find module …/pixel/colourMap".

- [ ] **Step 3: Implement `palette.ts` and `colourMap.ts`**

Ramps from §6.1, §6.2 (`n`, `e`) and §6.3 (`x`, `y`, `q`, `u`), stored lower case. `slotOf` parses `#rrggbb`, `#rgb`, `rgb(…)` and `rgba(…)` to `#rrggbb` and takes the first matching rule of §6.5 (0, 1, 2). A string that does not parse counts one miss and gives `slotIndex('i2')`. `nearestInFamily` follows the family rules a to e of §6.5 exactly (HSL; mid tone = tone `ceil(t / 2)`). `colourMap.ts` holds the fixed entries and the shirt table of §6.4, keys sorted.

- [ ] **Step 4: Run the test to see it pass**

Run: the command of Step 2. Expected: PASS. Then the Global gates.

- [ ] **Step 5: Stage**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; git add -A`. Then Task 1 Step 6b.

---

### Task 4: The pixel surface

**Files:**
- Create: `src/render/pixel/surface.ts`, `src/data/tuning/pixel.ts`
- Test: `tests/unit/render/pixel/surface.test.ts`

**Interfaces:**
- Consumes: `slotOf`, `slotIndex`, `nearestInFamily`, `SLOT_NAMES`, `SLOT_RGBA`, `INK_SLOT` (Task 3); `ArtBounds` (`src/render/sprites/rides.ts:15-20`, type only); `Ctx` (`src/render/sprites/shapes.ts:6`, type only).
- Produces, `src/data/tuning/pixel.ts`: `ART_PX_WORLD = 2`, `OPAQUE_ALPHA = 0.995` (§15).
- Produces, `surface.ts` (the full unit of §5.2 and §5.3): `class PixelSurface` with `constructor(bounds: ArtBounds, opts?: SurfaceOptions)`, `readonly w, h, ox, oy: number`, the Canvas subset of `ArtCtx`, `layer(ink?: boolean): void`, `cut(on: boolean): void`, `finish(): void`, `remap(table: Uint8Array): void`, `blitTo(ctx: Ctx): void`, `emitRuns(ctx: ArtCtx): void`, `pixel(x: number, y: number): number`, `inkMask(): Uint8Array`, `hash(): number`, `misses: number`; `interface SurfaceOptions { ink?: boolean }`; `isPixelSurface(ctx: unknown): ctx is PixelSurface`; `const ART_SCALE = 0.5`; `const SURFACE_PAD = 2`; `const BAYER4: readonly number[]`.
- Produces (prototype only, not in §5.3): `plot(x: number, y: number, slot: number): void`: set one image pixel to `slot`, opaque, in the current layer, ink-making unless `cut` is on. Task 9 uses it for the ground. (`emitRuns` takes `ArtCtx` from Task 5; in this task type it as `Ctx` and widen it in Task 5.)

- [ ] **Step 1: Write the failing test**

The test file holds these cases (names and assertions; `s` is `new PixelSurface({ left: -40, right: 40, top: -40, bottom: 40 })` unless the case says otherwise):

```ts
// tests/unit/render/pixel/surface.test.ts (cases)
it('size and anchor (§5.3)', () => expect([s.w, s.h, s.ox, s.oy]).toEqual([44, 44, 22, 22]));
it('constants (§15)', () => {
  expect(BAYER4).toEqual([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
  expect([SURFACE_PAD, ART_SCALE]).toEqual([2, 0.5]);
});
it('a 2:1 stroke is a clean stair', () => {
  // strokeStyle 'g2', lineWidth 2, moveTo(-32, -16), lineTo(32, 16), stroke()
  // every image row between the first and the last stroke row holds exactly 2 stroke pixels
});
it('two fills with a shared edge leave no gap', () => {
  // triangle (0,0)(40,0)(0,40) in 'g2', triangle (40,0)(40,40)(0,40) in 's2':
  // every image pixel whose centre is inside world [0,40) x [0,40) is opaque
});
it('a fill thinner than one art pixel sets at least one pixel', () => {
  // fillStyle 'g2'; fillRect(0.2, 0, 0.5, 10) → at least 1 opaque pixel
});
it('a stroke makes no ink ring', () => { /* stroke, finish(): no pixel equals INK_SLOT */ });
it('layer() puts ink between two layers', () => {
  // fillRect(-10,-10,20,20) 'g2'; layer(); fillRect(10,-10,20,20) 's2'; finish()
  expect(s.pixel(s.ox + 4, s.oy)).toBe(INK_SLOT);
});
it('cut pixels make no ink', () => { /* cut(true); fillRect; cut(false); finish(): no INK_SLOT, inkMask all 0 */ });
it('a surface with { ink: false } has no ink', () => { /* fill, finish(): no INK_SLOT */ });
it('a translucent fill on nothing dithers by BAYER4', () => {
  // fillStyle 'rgba(255,0,0,0.5)'; fillRect(0, 0, 16, 16) (8 x 8 art pixels from an aligned corner)
  // exactly 32 opaque pixels; inkMask is 0 for all of them
});
it('the dither is anchored to world art pixels, not to image pixels (§8.1 item 5)', () => {
  // a = new PixelSurface({ left: -40, right: 40, top: -40, bottom: 40 }) (ox 22),
  // b = new PixelSurface({ left: -42, right: 40, top: -40, bottom: 40 }) (ox 23, one art pixel more on the left);
  // on both: fillStyle 'rgba(255,0,0,0.5)'; fillRect(0, 0, 16, 16); finish()
  // for ax, ay in 0..7: (a.pixel(a.ox + ax, a.oy + ay) !== 0) === (b.pixel(b.ox + ax, b.oy + ay) !== 0)
  expect(b.ox - a.ox).toBe(1);
});
it('mix and snap never gives a signal slot or ink', () => {
  // fillRect 'g2' opaque, then 'rgba(0,114,178,0.5)' over it: no pixel ramp in x, y, q, u; no INK_SLOT
});
it('inkMask marks only ink-making pixels', () => {
  // an opaque fill (1), a stroke (0), a cut fill (0), a dither on nothing (0)
});
it('emitRuns and the ImageData path give the same pixels', () => {
  // emitRuns into a recording ctx (fillRect + fillStyle) rebuilds the pixel grid;
  // a stub globalThis.ImageData class plus a ctx with createImageData/putImageData captures blitTo;
  // both equal s.pixel(x, y) mapped through SLOT_RGBA; delete the stub after the case
});
it('same input, same hash; other input, other hash', () => {
  const B = { left: -40, right: 40, top: -40, bottom: 40 };
  const paint = (fill: string): PixelSurface => {
    const p = new PixelSurface(B);
    p.fillStyle = fill;
    p.fillRect(-10, -10, 20, 20);
    p.finish();
    return p;
  };
  expect(paint('g2').hash()).toBe(paint('g2').hash());
  expect(paint('s2').hash()).not.toBe(paint('g2').hash());
});
it('isPixelSurface is false for a recorder and FakeCanvas', () => {
  expect(isPixelSurface(new Recorder().ctx())).toBe(false);
  expect(isPixelSurface(new FakeCanvas().getContext())).toBe(false);
  expect(isPixelSurface(s)).toBe(true);
});
it("fillStyle = 'y1' paints slot y1 and counts no miss", () => {
  // fillStyle 'y1'; fillRect(0,0,4,4): pixel slot is slotIndex('y1'); s.misses 0
});
it('a colour with no map entry counts one miss on the surface', () => { /* fillStyle '#123456' → s.misses 1 */ });
it('the matrix stack serves translate, save and restore', () => {
  // save(); translate(10, 0); fillRect(0,0,2,2); restore(); fillRect(0,0,2,2)
  // pixels (ox + 5, oy) and (ox, oy) are opaque
});
```

`Recorder` comes from `../content/recorder`, `FakeCanvas` from `../fakeCanvas`.

- [ ] **Step 2: Run the test to see it fail**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/render/pixel/surface.test.ts`
Expected: FAIL, "Cannot find module …/pixel/surface".

- [ ] **Step 3: Implement `surface.ts` and `src/data/tuning/pixel.ts`**

Follow the members table and raster rules 1 to 7 of §5.3 exactly. One layer id per pixel, one cut bit, one stroke bit; `layer()` and `finish()` paint the ring of the closing layer as §5.3 says. Curves become segments of at most 1 art pixel (rule 4). In rule 6 (dither), `x` and `y` of the Bayer index `(y & 3) × 4 + (x & 3)` are world-anchored art pixels: `x = ix − ox`, `y = iy − oy` for the image pixel `(ix, iy)` (§8.1 item 5), so the dither lines up across sprites and chunks. `hash()` is FNV-1a over `w`, `h` and the slot bytes. `isPixelSurface` is `ctx instanceof PixelSurface`.

- [ ] **Step 4: Run the test to see it pass**

Run: the command of Step 2. Expected: PASS. Then the Global gates.

- [ ] **Step 5: Stage**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; git add -A`. Then Task 1 Step 6b.

---

### Task 5: The Pixel branch of `buildSprite`

**Files:**
- Modify: `src/render/canvas.ts` `buildSprite` (`:56-72`); `src/render/sprites/shapes.ts` (add `ArtCtx` next to `Ctx`, `:6`); `src/render/pixel/surface.ts` (`emitRuns(ctx: ArtCtx)`)
- Test: `tests/unit/render/pixel/buildSprite.test.ts`

**Interfaces:**
- Consumes: `PixelSurface`, `SurfaceOptions`, `ART_SCALE`, `isPixelSurface` (Task 4); `artStyle` (Task 2).
- Produces, `shapes.ts`: `interface ArtCtx` with the members of §5.2 (last paragraph): `fillStyle`, `strokeStyle`, `lineWidth`, `lineCap`, `lineJoin`, `beginPath`, `moveTo`, `lineTo`, `closePath`, `rect`, `arc`, `ellipse`, `quadraticCurveTo`, `bezierCurveTo`, `arcTo`, `fill`, `stroke`, `fillRect`, `strokeRect`, `save`, `restore`, `translate`, `scale`, `rotate`, `setTransform`, `layer?(ink?: boolean): void`, `cut?(on: boolean): void`.
- Produces, `canvas.ts`: `buildSprite(bounds: ArtBounds, scale: number, paint: (ctx: Ctx) => void, tint: string | null = null, opts?: SurfaceOptions): Sprite`; private `evenBounds(b: ArtBounds): ArtBounds` (§5.1); `const artBuildLog: { hashes: number[] | null; surfaces: Array<{ surface: PixelSurface; image: AnyCanvas }> | null }` (start `{ hashes: null, surfaces: null }`; `surfaces` is a prototype seam for the Node sheet, Task 16); `const artBuildStats: { spriteBuildMsMax: number; chunkBuildMsMax: number; turnFrameMsMax: number; rideBuildMsMax: number; spriteMb: number; chunkMb: number }` (all 0 at start; this task writes `spriteBuildMsMax`, Task 9 writes `chunkBuildMsMax`, Task 18 writes the rest and shows the object as `window.__pixelStats`).
- The Pixel branch runs steps 1, 2, 3 and 5 of §5.1, and step 6 without `artHash`. Step 4 (`remap(ghostTable(tint))`) is left out: a tinted build in Pixel paints with no tint (no ghost in the scene). Step 7 (the push to `artBuildLog.hashes`) and `artHash` are left out (stage 1a-ii): the branch never writes `artBuildLog.hashes`. `artBuildLog.surfaces` is the prototype seam: when it is an array, the branch pushes `{ surface: s, image: canvas }` after step 5. Around the branch, `performance.now()` (when `typeof performance !== 'undefined'`) measures the build; `artBuildStats.spriteBuildMsMax` keeps the maximum.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/render/pixel/buildSprite.test.ts
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { install } from '../fakeCanvas';
import { artBuildLog, buildSprite } from '../../../../src/render/canvas';
import { isPixelSurface } from '../../../../src/render/pixel/surface';
import { setArtStyle } from '../../../../src/render/pixel/style';

beforeAll(() => install());
afterEach(() => {
  setArtStyle('classic');
  artBuildLog.surfaces = null;
});

describe('buildSprite Pixel branch (§5.1)', () => {
  it('odd bounds widen to even world pixels, so the anchor is a whole art pixel', () => {
    setArtStyle('pixel');
    let surface = false;
    const sp = buildSprite({ left: -9, right: 9, top: -7, bottom: 3 }, 2, (ctx) => {
      surface = isPixelSurface(ctx);
      ctx.fillStyle = 'g2';
      ctx.fillRect(-2, -2, 4, 4);
    });
    expect(surface).toBe(true);
    expect([sp.w, sp.h, sp.ox, sp.oy, sp.scale]).toEqual([14, 10, 7, 6, 0.5]);
  });
  it('Classic does not change', () => {
    let surface = true;
    const sp = buildSprite({ left: -9, right: 9, top: -7, bottom: 3 }, 2, (ctx) => {
      surface = isPixelSurface(ctx);
    });
    expect(surface).toBe(false);
    expect([sp.w, sp.h, sp.ox, sp.oy, sp.scale]).toEqual([40, 24, 20, 16, 2]);
  });
  it('the build log takes one entry per Pixel build only while it is an array', () => {
    setArtStyle('pixel');
    buildSprite({ left: -4, right: 4, top: -4, bottom: 4 }, 0.5, () => undefined);
    artBuildLog.surfaces = [];
    buildSprite({ left: -4, right: 4, top: -4, bottom: 4 }, 0.5, () => undefined);
    expect(artBuildLog.surfaces).toHaveLength(1);
    expect(isPixelSurface(artBuildLog.surfaces[0]!.surface)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/render/pixel/buildSprite.test.ts`
Expected: FAIL (no `artBuildLog` export; the first case gets `surface` false).

- [ ] **Step 3: Implement the branch, `evenBounds`, `artBuildLog`, `artBuildStats` and `ArtCtx`**

Pass the surface to `paint` with one cast (`s as unknown as Ctx`), as §5.2 says.

- [ ] **Step 4: Run the test to see it pass**

Run: the command of Step 2. Expected: PASS. Then the Global gates.

- [ ] **Step 5: Stage**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; git add -A`. Then Task 1 Step 6b.

---

### Task 6: Grid, levels and copy rules

**Files:**
- Create: `src/render/pixel/grid.ts`
- Test: `tests/unit/render/pixel/grid.test.ts`

**Interfaces:**
- Consumes: `ART_SCALE` (Task 4); `Sprite` (`src/render/spriteCache.ts:14-21`); `DeviceClass` (`src/render/spriteCache.ts:53`); `PHONE_MAX_RENDER_SCALE` (`src/data/tuning/perf.ts:7`); `ZOOM_MIN`, `ZOOM_MAX` (`src/render/camera.ts:6-7`).
- Produces (part of the §5.2 unit): `interface PixelGrid { device: DeviceClass; deviceRatio: number; stretch: number; canvasRatio: number }`; `planStretch(deviceRatio: number, device: DeviceClass, capped: boolean): number`; `makeGrid(deviceRatio: number, device: DeviceClass, capped: boolean): PixelGrid`; `artScale(zoom: number, grid: PixelGrid): number`; `interface ZoomLevel { zoom: number; n: number; soft: boolean }`; `zoomLevels(grid: PixelGrid): readonly ZoomLevel[]`; `nearestLevel(zoom: number, grid: PixelGrid): number`; `viewportCss(): { width: number; height: number }`; `snapArt(v: number): number`; `snapWalker(ax: number, ay: number, slope: 0.5 | -0.5 | 0): { x: number; y: number }`; `interface ArtFrame { n: number; scale: number; offX: number; offY: number; walkers?: Float64Array; walkerCount?: number }`; `LEVEL_EPS = 1e-6`; `SOFT_LEVEL_GAP = 1.5`; `HOME_ZOOM_TARGET = 1`; `blitArt(ctx: CanvasRenderingContext2D, sp: Sprite, wx: number, wy: number, f: ArtFrame): void`; `blitArtColumn(ctx: CanvasRenderingContext2D, sp: Sprite, ax: number, ay: number, colL: number, colR: number, f: ArtFrame, ends: number): void`.
- Left out in stage 0 (no controller and no track twin): `stepLevel`, `levelStep`, `pixelGrid`, `publishGrid`, `snapCar`, `CAR_SLOPE_MAX`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/render/pixel/grid.test.ts
import { describe, expect, it } from 'vitest';
import { artScale, blitArt, blitArtColumn, makeGrid, nearestLevel, planStretch, snapArt, snapWalker, zoomLevels } from '../../../../src/render/pixel/grid';

const levels = (dpr: number, dev: 'phone' | 'desktop', capped = false) => zoomLevels(makeGrid(dpr, dev, capped)).map((l) => [Number(l.zoom.toFixed(3)), l.n, l.soft]);

describe('grid (§7)', () => {
  it('planStretch table (§7.1)', () => {
    expect(planStretch(1, 'desktop', false)).toBe(1);
    expect(planStretch(1.5, 'desktop', true)).toBe(1);
    expect(planStretch(2, 'desktop', true)).toBe(2);
    expect(planStretch(2.625, 'phone', false)).toBe(2);
    expect(planStretch(2.625, 'phone', true)).toBe(3);
    expect(planStretch(3, 'phone', false)).toBe(2);
    expect(makeGrid(2.625, 'phone', false)).toEqual({ device: 'phone', deviceRatio: 2.625, stretch: 2, canvasRatio: 1.3125 });
  });
  it('levels for ratio 1 and 2.625 (§7.3)', () => {
    expect(levels(1, 'desktop')).toEqual([[0.25, 0, true], [0.5, 1, false], [1, 2, false], [1.5, 3, false], [2, 4, false]]);
    expect(levels(2.625, 'phone')).toEqual([[0.25, 0, true], [0.381, 1, false], [0.762, 2, false], [1.143, 3, false], [1.524, 4, false], [1.905, 5, false]]);
    expect(levels(2.625, 'phone', true)).toEqual([[0.25, 0, true], [0.571, 1, false], [1.143, 2, false], [1.714, 3, false]]);
  });
  it('home level and the tie rule (§7.2, §7.6)', () => {
    expect(nearestLevel(1, makeGrid(1, 'desktop', false))).toBe(1);
    expect(nearestLevel(1, makeGrid(2.625, 'phone', false))).toBeCloseTo(8 / 7, 12);
    expect(nearestLevel(0.75, makeGrid(1, 'desktop', false))).toBe(0.5);
  });
  it('a level read back at full precision is crisp; 3 decimals are not (Review Focus 5)', () => {
    for (const g of [makeGrid(1, 'desktop', false), makeGrid(2.625, 'phone', false), makeGrid(2.625, 'phone', true)]) {
      for (const l of zoomLevels(g)) if (!l.soft) expect(artScale(Number(String(l.zoom)), g)).toBeGreaterThan(0);
    }
    expect(artScale(1.143, makeGrid(2.625, 'phone', false))).toBe(0);
  });
  it('snapArt and the walker stair (§7.7)', () => {
    expect(snapArt(11.52)).toBe(12);
    expect(snapArt(-3)).toBe(-2);
    for (let ax = 0; ax <= 40; ax += 0.25) {
      const p = snapWalker(ax, ax / 2, 0.5);
      expect(p.x % 2).toBe(0);
      expect(p.y % 2).toBe(0);
      expect(p.y).toBe(2 * Math.round(p.x / 4));
    }
  });
  it('blitArt copies at factor n with whole edges', () => {
    const calls: number[][] = [];
    const ctx = { drawImage: (...a: unknown[]) => calls.push(a.slice(1) as number[]) } as unknown as CanvasRenderingContext2D;
    const sp = { image: {} as never, w: 20, h: 30, ox: 10, oy: 25, scale: 0.5 };
    blitArt(ctx, sp, 64, 32, { n: 3, scale: 1.5, offX: 101, offY: 57 });
    expect(calls[0]).toEqual([167, 30, 60, 90]);
  });
  it('blitArt at n = 0 rounds as renderer blit (renderer.ts:338-345)', () => {
    const calls: number[][] = [];
    const ctx = { drawImage: (...a: unknown[]) => calls.push(a.slice(1) as number[]) } as unknown as CanvasRenderingContext2D;
    const sp = { image: {} as never, w: 20, h: 30, ox: 10, oy: 25, scale: 0.5 };
    blitArt(ctx, sp, 33, 17, { n: 0, scale: 1.2, offX: 10.3, offY: 4.6 });
    expect(calls[0]).toEqual([26, -35, 48, 72]);
  });
  it('blitArtColumn ends bits extend the strip to the image edges', () => {
    const calls: number[][] = [];
    const ctx = { drawImage: (...a: unknown[]) => calls.push(a.slice(1) as number[]) } as unknown as CanvasRenderingContext2D;
    const sp = { image: {} as never, w: 40, h: 30, ox: 20, oy: 25, scale: 0.5 };
    const f = { n: 2, scale: 1, offX: 0, offY: 0 };
    blitArtColumn(ctx, sp, 0, 0, -32, 0, f, 0);
    blitArtColumn(ctx, sp, 0, 0, -32, 0, f, 1);
    blitArtColumn(ctx, sp, 0, 0, 0, 32, f, 2);
    expect(calls).toEqual([
      [4, 0, 16, 30, -32, -50, 32, 60],
      [0, 0, 20, 30, -40, -50, 40, 60],
      [20, 0, 20, 30, 0, -50, 40, 60],
    ]);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/render/pixel/grid.test.ts`
Expected: FAIL, "Cannot find module …/pixel/grid".

- [ ] **Step 3: Implement `grid.ts`**

`planStretch` follows the table of §7.1 item 2. `zoomLevels` follows §7.2 (`zoom = n × k / (2 × deviceRatio)`). `artScale` follows §7.1 item 4. `blitArt`, `blitArtColumn`, `snapArt`, `snapWalker` follow §7.7. `viewportCss()` reads `document.documentElement.clientWidth` and `clientHeight`.

- [ ] **Step 4: Run the test to see it pass**

Run: the command of Step 2. Expected: PASS. Then the Global gates.

- [ ] **Step 5: Stage**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; git add -A`. Then Task 1 Step 6b.

---

### Task 7: Render plan, canvas box and home level

**Files:**
- Modify: `src/perf/quality.ts` `RenderPlan` (`:49-61`), `renderPlan` (`:64-77`); `src/render/renderer.ts` `applyPlan` (`:898-917`); `src/main.ts` `resize` (`:31-36`); `src/styles/main.css` after the `#game` rule (`:34`)
- Test: `tests/unit/render/pixel/plan.test.ts`

**Interfaces:**
- Consumes: `planStretch`, `makeGrid`, `nearestLevel`, `HOME_ZOOM_TARGET`, `viewportCss` (Task 6); `artStyle` (Task 2).
- Produces: `renderPlan(quality: RenderQuality, device: DeviceClass, dpr: number, autoMaxRatio = Infinity, style: ArtStyle = 'classic'): RenderPlan`; `RenderPlan.stretch: number` (1 in Classic). Pixel rules: §5.5 `src/perf/quality.ts` row (`capped = low || (quality === 'auto' && autoMaxRatio <= 1)`, `pixelRatio = d / stretch`, `zoomBuckets = 3`).
- Produces, renderer `applyPlan` (`renderer.ts:898-917`, §5.5 `applyPlan` row of stage 1b, prototype part). One body for both styles; the Pixel path changes only the line `:906` (`allowExact`) and the lines `:912-913` (backing size), and adds the `style` and `homeZoom` lines. Every other line (`:899-905`, `:907-911`, `:914-916`) runs in both styles, so `canvas.dataset.pixelRatio = String(dpr)` (`:914`, read by the `[perf]` line as `canvas ratio`, `perf-build3.spec.ts:269`) and `canvas.dataset.device` (`:915`, read by the e2e level rule) stay in Pixel.
  - Both styles: pass `artStyle()` as the 5th argument of `renderPlan` (`:903`); set `canvas.dataset.stretch = String(plan.stretch)` (`'1'` in Classic).
  - Pixel only: `terrain.allowExact = false` (in place of `:906`); `canvas.width = Math.max(1, Math.ceil(cssW × rawDpr / plan.stretch))`, height the same (in place of `:912-913`); `canvas.style.width = (canvas.width × plan.stretch / rawDpr) + 'px'`, height the same; `canvas.dataset.homeZoom = String(nearestLevel(HOME_ZOOM_TARGET, makeGrid(rawDpr, plan.device, capped)))` where `capped` is `plan.stretch !== planStretch(rawDpr, plan.device, false)`. `dpr = plan.pixelRatio` (`:904`) is the canvas ratio.
  - Classic: the lines `:906` and `:912-913` as today; no `style` write. The prototype has no `publishGrid` (no controller rules).
- Produces, CSS: `#game[data-art="pixel"] { right: auto; bottom: auto; image-rendering: pixelated; }`.
- Produces, `main.ts`: a second `ResizeObserver` on `document.documentElement` next to the first (`:35`); `resize` reads `artStyle()`: `viewportCss()` in Pixel, `getBoundingClientRect()` in Classic (§5.5 `resize` row).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/render/pixel/plan.test.ts
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { install, make } from '../fakeCanvas';
import { renderPlan } from '../../../../src/perf/quality';
import { createCanvasRenderer } from '../../../../src/render/renderer';
import { makeGrid, nearestLevel } from '../../../../src/render/pixel/grid';
import { setArtStyle } from '../../../../src/render/pixel/style';

beforeAll(() => install());
afterEach(() => setArtStyle('classic'));

describe('render plan with a stretch (§7.1)', () => {
  it('Pixel plans', () => {
    const p = (q: 'auto' | 'high' | 'low', dev: 'phone' | 'desktop', d: number, auto = Infinity) => {
      const r = renderPlan(q, dev, d, auto, 'pixel');
      return [r.stretch, r.pixelRatio, r.zoomBuckets];
    };
    expect(p('high', 'phone', 2.625)).toEqual([2, 1.3125, 3]);
    expect(p('auto', 'phone', 2.625)).toEqual([2, 1.3125, 3]);
    expect(p('auto', 'phone', 2.625, 1)).toEqual([3, 0.875, 3]);
    expect(p('low', 'phone', 2.625)).toEqual([3, 0.875, 3]);
    expect(p('high', 'desktop', 1)).toEqual([1, 1, 3]);
  });
  it('Classic plans keep stretch 1 and today’s values', () => {
    const r = renderPlan('high', 'phone', 2.625);
    expect([r.stretch, r.pixelRatio]).toEqual([1, 2]);
  });
  it('applyPlan in Pixel: backing size, box size, stretch and home level at full precision', () => {
    setArtStyle('pixel');
    const c = Object.assign(make(10, 10), { style: {} as Record<string, string> });
    const r = createCanvasRenderer(c as unknown as HTMLCanvasElement);
    r.resize(412, 839, 2.625);
    expect([c.width, c.height]).toEqual([541, 1102]);
    expect(parseFloat(c.style.width as string)).toBeCloseTo((541 * 2) / 2.625, 9);
    expect(c.dataset.stretch).toBe('2');
    expect(c.dataset.pixelRatio).toBe('1.3125');
    expect(c.dataset.device).toBe('phone');
    expect(c.dataset.homeZoom).toBe(String(nearestLevel(1, makeGrid(2.625, 'phone', false))));
  });
  it('applyPlan in Classic does not change', () => {
    const c = Object.assign(make(10, 10), { style: {} as Record<string, string> });
    createCanvasRenderer(c as unknown as HTMLCanvasElement).resize(412, 839, 2.625);
    expect([c.width, c.height]).toEqual([824, 1678]);
    expect(c.style).toEqual({});
    expect(c.dataset.stretch).toBe('1');
    expect(c.dataset.pixelRatio).toBe('2');
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/render/pixel/plan.test.ts`
Expected: FAIL (`stretch` undefined; backing 824 in Pixel).

- [ ] **Step 3: Implement the plan, `applyPlan`, `resize` and the CSS rule**

`renderPlan` follows the §5.5 `src/perf/quality.ts` row (Interfaces above); in Classic it returns today's values and `stretch: 1`. `applyPlan` follows the three lists of the Interfaces: keep one body and branch only the lines named there. `resize` and the second `ResizeObserver` follow the `main.ts` line of the Interfaces. Add the CSS rule after the `#game` rule.

- [ ] **Step 4: Run the test to see it pass**

Run: the command of Step 2, then `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/perf tests/unit/render/staticLayer.test.ts tests/unit/render/renderer-rotation.test.ts`. Expected: PASS (the Classic tests do not change). Then the Global gates.

- [ ] **Step 5: Stage**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; git add -A`. Then Task 1 Step 6b.

---

### Task 8: Pixel frame: whole copies, snapped anchors, dots, attributes

**Files:**
- Modify: `src/render/layers.ts` `LayerFrame` (`:21-36`): optional `art?: ArtFrame | null`
- Modify: `src/render/pixel/grid.ts`: add `walkerSlope`
- Modify: `src/render/renderer.ts`: `blit`, `blitColumn` (`:338-363`) → `blitArt`, `blitArtColumn` when `frame.art` is set; `drawList` ride columns (`:587-593`): `ends` bit 1 for column 0 and bit 2 for the last column of the ride (keep the column count per ride next to `rideEy`: allocated in `collectRides` at `:429`, written at `:451`, `rideEy[ri] = ev`); `collectGuests` anchors (`:553-554`) through `snapWalker`; dots (`:556-559`, `:1112`); `draw` (`:1059-1071`, `:1077`, `:1121-1124`); `drawStatic` smoothing (`:1018`)
- Modify: `src/render/scenery/layer.ts` `blit`, `blitColumn` (`:60-83`), with `ends` for the first and last column
- Modify: `src/render/management/layer.ts` decal blits (`:171`, `:178`) and the path item push (`:227`): anchors through `snapArt` when `artStyle()` is `'pixel'`
- Test: `tests/unit/render/pixel/frame.test.ts`

**Interfaces:**
- Consumes: `ArtFrame`, `artScale`, `makeGrid`, `blitArt`, `blitArtColumn`, `snapArt`, `snapWalker` (Task 6); `artStyle` (Task 2); `slotOf`, `SLOT_RGBA` (Task 3).
- Produces, renderer `draw`, both styles (attributes only; no Classic pixel changes): `canvas.dataset.art = artStyle()` on the first frame; `canvas.dataset.complete = terrain.complete ? '1' : '0'` on every frame (`terrain.complete` is set by `TerrainLayer.draw`, `src/render/terrain.ts:647`; the prototype has no build budget, §11.3). The Classic "before" page of Task 19a waits for `data-complete="1"`, so Classic must write it.
- Produces, renderer `draw` in Pixel only (§5.5 stage 1b `draw` row, prototype part): `bucket = 0.5`; `offX = round(cssW × dpr / 2 − cam.centerX × scale)`, `offY` the same with height; `n = artScale(cam.zoom, grid)` with the grid of the last plan; `frame.art = { n, scale, offX, offY }` (`null` in Classic); `imageSmoothingEnabled = false` (`:1071` and `:1018`; the prototype has no soft chunks, so smoothing is on only when the grid has a soft level and `cam.zoom` equals it); `canvas.dataset.artScale = String(n)`. `data-art-scale`, `data-stretch` other than `'1'` (Task 7) and `data-home-zoom` (Task 7) are Pixel only.
- Produces, guest anchors (§5.5 `collectGuests` row, §7.7): `slope` comes from the guest's motion, not from its frame. `slope = 0` when the guest sits (`sitDir >= 0`), or when it is outside a queue and does not move (`g.nextTile < 0 || g.nextTile === g.tile`, the inner `else` at `renderer.ts:549-550`). Else (a walker, or a guest in the queue branch `:536-540`) `slope = vf & 1 ? 0.5 : -0.5` with `vf = viewDir(facing, rot)` (as `:568`; compute it before the snap; view directions 1 and 3 move along `u`). The rule is a new pure export of `src/render/pixel/grid.ts`: `walkerSlope(sitting: boolean, moving: boolean, vf: number): 0 | 0.5 | -0.5`; the renderer passes `sitting = sitDir >= 0` and `moving = inQueue || (g.nextTile >= 0 && g.nextTile !== g.tile)`, where `inQueue` is the queue branch (`qStamp[gi] === frameNo`, `renderer.ts:536`). Why not `walk`: with reduced motion `walk` stays 0 for walking guests (`bob` false, `renderer.ts:519, 548`), and queued guests also keep `walk` 0, so a slope from `walk` would snap their x and y apart.
- Produces, dots at `n > 0`: push `(offX + x × n / 2 + n / 2, offY + y × n / 2)` with `(x, y) = snapWalker(ax, ay, 0)`, and draw with `w = h = n`. So `GuestDots.draw` (`renderer.ts:155-185`) fills the art pixel above the snapped anchor. The dot colour is the slot colour of today's dot colour (§5.5 dots row): a second table `LOD_SLOT_COLOURS = LOD_COLOURS.map((c) => slotCss(slotOf(c)))`, built once on the first Pixel frame, where `slotCss(slot)` is the `SLOT_RGBA` value of the slot as `#rrggbb` (lower case). `GuestDots.draw` gains a last parameter `colours: readonly string[] = LOD_COLOURS`; the renderer passes `LOD_SLOT_COLOURS` in Pixel at `n > 0`. At `n = 0` the dots stay as today (`LOD_COLOURS`).
- Management layer: `begin` does not change (no `art` parameter before stage 2a); it reads `artStyle()`.

- [ ] **Step 1: Write the failing test**

Use the set-up of `tests/unit/render/staticLayer.test.ts:19-45` (FakeCanvas `install()`, `terrainClock.now = () => 0`, a park with a footpath row and 30 guests), plus `executeCommand(world, { type: 'placeRide', defId: 'carousel', x: 8, y: 10, rotation: 2 })`, one `oak_round` (`placeScenery`, x 12, y 12, rotation 2, edge −1), litter and mess on the path (`map.litter[tileIndex(map, 10, 16)] = 3` and `map.mess[tileIndex(map, 14, 16)] = 1`, as `tests/unit/render/renderer-rotation.test.ts:38-39`), a bench on the path (`executeCommand(world, { type: 'buildPathItem', x: 12, y: 16, itemType: 'bench' })` returns ok; command type `src/sim/commands/types.ts:66`) and `runTicks(world, 200)`. The bench goes through the path item push of `collectPathItems` (`src/render/management/layer.ts:227`), the mess through the decal blit at `:171` and the litter through the one at `:178` (`ManagementLayer.drawGround`); the first two cases check their copies with every other `c.draws` entry (the §13.3 `grid.test.ts` row: every path item push and every litter and mess blit is on the art grid). The canvas gets a `style` member as in Task 7.

```ts
// tests/unit/render/pixel/frame.test.ts (cases)
it('every sprite copy in Pixel is whole and on the art grid of the frame', () => {
  // setArtStyle('pixel'); renderer.resize(800, 600, 1); draw 3 frames at cam(1) (n = 2)
  // offX = Math.round(800 / 2 - cam.centerX * 1), offY likewise
  // for every c.draws entry with w < c.width: x, y, w, h are integers; w % 2 === 0; h % 2 === 0;
  // ((x - offX) % 2 + 2) % 2 === 0 and ((y - offY) % 2 + 2) % 2 === 0
  // c.dataset: art 'pixel', artScale '2', complete '1'; the context's imageSmoothingEnabled is false
  // the bench copy and the litter copy are among the checked entries: before the frames,
  // vi.spyOn(SpriteBank.prototype, 'pathItem') and vi.spyOn(SpriteBank.prototype, 'decal') (src/render/sprites/bank.ts:170, :179);
  // after the frames, the image of some spy result (spy.mock.results[i].value.image) is the image of at least one
  // checked c.draws entry: for the pathItem spy; for a decal call with frame (2nd argument) >= DECAL_MESS (bank.ts:79, the mess);
  // and for a decal call with frame < DECAL_MESS (the litter); vi.restoreAllMocks() in afterEach
});
it('at n = 3 (zoom 1.5) the same holds with modulus 3', () => {
  // as the first case at cam(1.5): c.dataset.artScale '3'; for every c.draws entry with w < c.width:
  // x, y, w, h integers; w % 3 === 0; h % 3 === 0; ((x - offX) % 3 + 3) % 3 === 0; ((y - offY) % 3 + 3) % 3 === 0
});
it('the walker slope comes from motion, not from the frame', () => {
  expect(walkerSlope(true, true, 1)).toBe(0); // sits
  expect(walkerSlope(false, false, 1)).toBe(0); // stands
  expect(walkerSlope(false, true, 1)).toBe(0.5); // moves along u
  expect(walkerSlope(false, true, 3)).toBe(0.5);
  expect(walkerSlope(false, true, 0)).toBe(-0.5); // moves along v
  expect(walkerSlope(false, true, 2)).toBe(-0.5);
});
it('guest dots in Pixel are one art pixel on the grid', () => {
  // resize(800, 600, 2), cam(0.5): n = 2, guests are dots (lod)
  // every c.rects entry: w === 2, h === 2, ((x - offX) % 2 + 2) % 2 === 0, ((y - offY) % 2 + 2) % 2 === 0
  // every c.rects fill is a slot colour: the set of '#' + rrggbb of SLOT_RGBA holds it
});
it('Classic frames do not change', () => {
  // the same world in Classic at cam(1): c.dataset.art is 'classic', no artScale attribute, smoothing true
  expect(c.dataset.complete).toBe('1');
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/render/pixel/frame.test.ts`
Expected: FAIL (`data-art` unset; copies at bucket 1 are not on the grid).

- [ ] **Step 3: Implement the frame changes**

Follow the rows of §5.5 named in Files and Interfaces. The Classic code paths do not change.

- [ ] **Step 4: Run the tests to see them pass**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/render`. Expected: PASS (all render tests run Classic and do not change). Then the Global gates.

- [ ] **Step 5: Stage**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; git add -A`. Then Task 1 Step 6b.

---

### Task 9: Pixel ground chunks

**Files:**
- Create: `src/render/pixel/ground.ts`
- Modify: `src/render/terrain.ts` `build` (`:542-561`): Pixel branch; the copy (`:638-643`, `TerrainLayer.draw`) does not change (its factor is `n` at a crisp level, §5.5 stage 1c `draw` row; Prototype decision 18, a departure from the §11.3 terrain row)
- Test: `tests/unit/render/pixel/ground.test.ts`

**Interfaces:**
- Consumes: `PixelSurface` with `plot`, `BAYER4` (Task 4); `slotIndex` (Task 3); `viewCornerHeights`, `viewToMap`, `viewSize` (`src/render/view.ts:174, 43, 71`); `artBuildStats` (Task 5, in the `terrain.ts` branch). `ground.ts` imports nothing from `src/render/terrain.ts` (`terrain.ts` imports `ground.ts` for the branch, so an import back would make a cycle): `paintGroundChunk` gets the tile rect as a parameter. `chunkViewRect` and `chunkBounds` (`src/render/terrain.ts:349, 364`) are used by the `terrain.ts` branch and by the test only.
- Produces (part of the §5.2 unit): `paintGroundChunk(s: PixelSurface, map: MapState, rect: { u0: number; v0: number; u1: number; v1: number }, r: ViewRotation, env: TerrainEnv, soft: boolean): void` (the prototype accepts `soft` and ignores it: no soft chunks); `hash3(a: number, b: number, c: number): number` (unsigned 32 bit, `Math.imul` mixing); `vnoise(x: number, y: number, seed: number): number` (value noise in [0, 1), smoothstep as `pixel3.py:83-87`); `const OUTSIDE_TONE_STEPS = 2`. Left out: `GROUND_DETAIL_SHARE` and the details.
- Produces, `terrain.ts` Pixel `build`: `s = new PixelSurface(g, { ink: false })`; `paintGroundChunk(s, map, chunkViewRect(...), r, env, false)`; `makeCanvas(s.w, s.h)`; `s.blitTo(ctx)`; returns `{ image, w: s.w, h: s.h, ox: s.ox, oy: s.oy, scale: ART_SCALE }`. `artBuildStats.chunkBuildMsMax` keeps the slowest Pixel chunk build.
- Ground rules of the prototype (decisions, from §8.1 item 7 and `pixel3.py:106-170`):
  - A flat tile (4 equal corner heights) is filled by inverse mapping: each art pixel whose centre lies in the tile top gets the colour of its map point, as `pixel3.py:106-110`. A sloped tile is walked as the lattice of §8.1 item 7 (bilinear height, each sample at its art pixel and the pixel below).
  - Grass: `vnoise(x × 0.42, y × 0.42, seed) × 0.75 + vnoise(x × 1.9 + 7, y × 1.9 + 3, seed) × 0.25 + ((BAYER4[(ay & 3) × 4 + (ax & 3)] + 0.5) / 16 − 0.5) × 0.16` (`pixel3.py:116-118`; `x`, `y` map coordinates; `ax`, `ay` world-anchored art-pixel coordinates; `seed = env.seed`); below 0.30 → `g1`, below 0.56 → `g2`, else `g3`.
  - Footpath and park entrance tiles fill the whole tile top: 2 × 2 slabs, `s1` when `hash3(tx × 2 + sx, ty × 2 + sy, 5) / 2^32 < 0.22`, else `s2`; joints `s3` where the slab fraction is below 0.13; `s4` within 0.11 tile of a neighbour whose content is not footpath, queue or park entrance (`pixel3.py:159-170`).
  - Queue tiles: the same slab rule with `n2`, `n3` (`QUEUE_SLOT`), joint `n4`, edge `n5`. No posts, no rope.
  - Sand, dirt, rock and snow: the grass rule with two tones (`s1`/`s2`, `w1`/`w2`, `n2`/`n3`, `e1`/`e2`). Water: opaque `a2`, no shore lines.
  - Slopes: one tone lighter when `0.12 × dzdx − 0.06 × dzdy > 0`, one tone darker when it is below 0 (the sign of today's rule, `paintTile`, `terrain.ts:292-294`). Land outside the park: 2 tones darker (`OUTSIDE_TONE_STEPS`).
  - Cliff and map edge faces: copy the face polygons of `TilePainter.faceE` and `faceS` (`terrain.ts:119-150`) and the face conditions of `paintTile` (`terrain.ts:267-287`) into `ground.ts` as private functions that draw on the surface, filled with `fillStyle` `'w3'` (right face, `faceE`) and `'w2'` (left face, `faceS`). Do not export `TilePainter` or `paintTile` (both private, `terrain.ts:56, 258`): `ground.ts` would have to import them from `terrain.ts`, which imports `ground.ts` (the cycle of the Consumes line). No strata line.

- [ ] **Step 1: Write the failing test**

Maps from `createWorld({ seed: 1, parkName: 'G', mapSize: 32 })` (`m` is its `state.map`); `paint(map, cx, cy, r)` makes `new PixelSurface(chunkBounds(map, cx, cy, r), { ink: false })` and calls `paintGroundChunk` with `chunkViewRect(map, cx, cy, r)`.

```ts
// tests/unit/render/pixel/ground.test.ts (cases)
it('the same chunk twice gives the same hash', () => {
  expect(paint(m, 1, 1, 0).hash()).toBe(paint(m, 1, 1, 0).hash());
});
it('the 4 view rotations of one chunk give 4 hashes', () => {
  expect(new Set([0, 1, 2, 3].map((r) => paint(m, 1, 1, r as ViewRotation).hash())).size).toBe(4);
});
it('a pixel depends only on its world art pixel (Bayer phase across chunks)', () => {
  // s1 = paint(m, 1, 1, 0) (chunk (1, 1) alone).
  // a = chunkViewRect(m, 1, 1, 0), b = chunkViewRect(m, 2, 1, 0);
  // rect = { u0: min(a.u0, b.u0), v0: min(a.v0, b.v0), u1: max(a.u1, b.u1), v1: max(a.v1, b.v1) };
  // A = chunkBounds(m, 1, 1, 0), B = chunkBounds(m, 2, 1, 0);
  // bounds = { left: min(A.left, B.left), right: max(A.right, B.right), top: min(A.top, B.top), bottom: max(A.bottom, B.bottom) };
  // s2 = new PixelSurface(bounds, { ink: false }); paintGroundChunk(s2, m, rect, 0, env, false)
  // compared pixels: (x, y) of s1 with s1.pixel(x, y) !== 0 whose centre lies inside the tile top of a tile of
  // chunk (1, 1) and at least 2 art pixels from the chunk's tile border (the edge pixels can be painted over by
  // the tiles of chunk (2, 1), which are painted later; that is not a fault)
  // each compared pixel equals s2.pixel(X, Y) with X − s2.ox === x − s1.ox and Y − s2.oy === y − s1.oy
  // at least 100 pixels are compared
});
it('a flat grass chunk has no hole and only grass slots', () => {
  // chunk (1, 1), r 0: every art pixel whose centre lies inside a tile top is opaque;
  // every opaque pixel is g1, g2 or g3 (owned land) or g3, g4, g5 (outside)
});
it('a footpath tile is slabs', () => {
  // placeFootpath(world, 12, 12): the art pixels inside that tile top are s1, s2, s3 or s4 only
});
it('a queue tile uses the n tones', () => {
  // placeQueue(world, 12, 13) (tests/helpers/world.ts:39); chunk (1, 1), r 0:
  // every art pixel whose centre lies inside that tile top is n2, n3, n4 or n5 (SLOT_NAMES[s.pixel(x, y)])
});
it('map edge faces are w2 and w3', () => {
  // chunk (3, 3) at the map corner (32 x 32 map, 8-tile chunks), r 0: the face pixels below the edge tiles are w2 or w3
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/render/pixel/ground.test.ts`
Expected: FAIL, "Cannot find module …/pixel/ground".

- [ ] **Step 3: Implement `ground.ts` and the `build` branch**

- [ ] **Step 4: Run the tests to see them pass**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/render/pixel/ground.test.ts tests/unit/render/terrain.test.ts tests/unit/render/pixel/frame.test.ts`. Expected: PASS. Then the Global gates.

- [ ] **Step 5: Stage**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; git add -A`. Then Task 1 Step 6b.

---

### Task 10: Primitive twins

**Files:**
- Create: `src/render/pixel/art/shapes.ts`
- Modify: `src/render/sprites/shapes.ts` `box` (`:58`), `cylinder` (`:97`), `cone` (`:127`), `pyramid` (`:159`), `head` (`:170`): first line `if (isPixelSurface(ctx)) return pixelX(ctx, …same arguments)`
- Test: `tests/unit/render/pixel/shapes.test.ts`

**Interfaces:**
- Consumes: `PixelSurface`, `isPixelSurface` (Task 4); `slotOf`, `SLOT_NAMES`, `tone` (Task 3); `sx`, `sy`, `circlePt`, `ellipseRadii` (`shapes.ts:12, 16, 117, 76`).
- Produces: `pixelBox`, `pixelCylinder`, `pixelCone`, `pixelPyramid`, `pixelHead`, each with the parameters of its Classic twin but `ctx: ArtCtx`; `const CYLINDER_LIT_SHARE = 0.6`; `const CONE_SEGMENTS = 16`.
- Draft rules (`pixel3.py:220-241`, §8.1 items 2, 3):
  - `pixelBox`: the three faces of `box` (left, right, top). The right face is at least one tone darker than the left. Rule: let `L = slotOf(left)`, `R = slotOf(right)`. If `R` is on the ramp of `L` and its tone index is larger than that of `L`, keep `R`; else `R = slotIndex(tone(SLOT_NAMES[L], 1))`. (So a right colour on another ramp is replaced.) The ramp of a slot is its name without the digits; the tone index is the digits.
  - `pixelCylinder`: the side from `x − rx` to `x − rx + 2 × rx × CYLINDER_LIT_SHARE` in the side colour (lit), the rest in `tone(side slot, 1)` (dark), the top ellipse in the top colour (`icyl`, `split` 0.2).
  - `pixelCone`: ignores its `segments` argument (the Classic `cone` has `segments = 12`, `shapes.ts:127`, and `drawCarousel` passes 16, `rides.ts:162`) and always draws `CONE_SEGMENTS` (16) segments; segment `k` uses colour `colours[k % colours.length]` when `cos(am) − sin(am) < 0.25` (screen left, `icone`), else `tone(that slot, 1)`; drawn back to front by `cos(am) + sin(am)`.
  - `pixelPyramid`: the faces of `pyramid`, left and right as `pixelBox`.
  - `pixelHead`: a skin disc of radius `r`; the hair on the upper half; the right third of the disc one tone darker.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/render/pixel/shapes.test.ts (cases)
it('box on a surface draws the twin', () => {
  // two surfaces with the same bounds: box(s1, 0.2,0.2,0.8,0.8,0,20,'#f3e0be','#d3b894','#a48a78') and pixelBox(s2, same) → same hash
});
it('box on a recorder stays Classic', () => {
  // Recorder ops of box(...) contain exactly 3 'fill(' entries, as today (shapes.ts:70-72)
});
it('pixelBox: left face lighter than right face', () => {
  // s = new PixelSurface({ left: -40, right: 40, top: -60, bottom: 40 }) (s.oy = 32);
  // pixelBox(s, 0.2, 0.2, 0.8, 0.8, 0, 20, '#6dbb4f', '#dcc79c', '#9a7148'); s.finish()
  // By box (shapes.ts:58-73, sx and sy :12-18) the top face spans world y −13.6 to 5.6, so the rows below its
  // lowest point hold only side faces: the rows s.oy + 4 to s.oy + 11 (world y 8 to 24).
  // left-face pixels: opaque, not INK_SLOT, image row from s.oy + 4 to s.oy + 11, column < s.ox;
  // right-face pixels: the same rows, column > s.ox
  // both sets hold at least 10 pixels (an empty selection cannot pass)
  // left '#dcc79c' is s2, right '#9a7148' is w2 (another ramp): every left-face pixel is slotIndex('s2'),
  // every right-face pixel is slotIndex('s3') (the replaced colour)
});
it('pixelBox: a darker right colour on the ramp of the left is kept', () => {
  // the same box and the same two pixel sets with right RAMPS.s[3] (s4): each set holds at least 10 pixels;
  // every left-face pixel is slotIndex('s2'), every right-face pixel is slotIndex('s4')
});
it('pixelPyramid is the twin of pyramid on a surface', () => {
  // two surfaces with the bounds { left: -40, right: 40, top: -60, bottom: 40 }:
  // pyramid(s1, 0.2, 0.2, 0.8, 0.8, 10, 40, '#9a7148', '#dcc79c', '#7b5835') and
  // pixelPyramid(s2, 0.2, 0.2, 0.8, 0.8, 10, 40, '#9a7148', '#dcc79c', '#7b5835'); finish() both → same hash
});
it('pixelHead: hair on the top row, skin on the bottom row', () => {
  // s = new PixelSurface({ left: -16, right: 16, top: -16, bottom: 16 });
  // pixelHead(s, 0, 0, 6, '#f3e0be', '#3b2a20'); s.finish()  (the argument order of head, shapes.ts:170)
  // the top opaque non-ink row holds the hair slot (slotOf('#3b2a20')); the bottom opaque non-ink row holds the skin slot (slotOf('#f3e0be'))
});
it('pixelCylinder is lit to 60 % of its width', () => {
  // s = new PixelSurface({ left: -40, right: 40, top: -40, bottom: 40 });
  // pixelCylinder(s, 0.5, 0.5, 0.4, 0, 20, '#3d9be0', '#f2f2f2'); s.finish()
  // (rx = 0.4 × 32 × √2 = 18.1 world pixels; the top ellipse ends at world y 5.0, the side ends at y 25.1)
  // the image row r = s.oy + 5 (world y 10 to 12, side only): L = count of pixels equal slotOf('#3d9be0') (b2),
  // D = count of pixels equal slotIndex(tone('b2', 1)) (b3); L > 0, D > 0
  // the lit count is within 1 pixel of its share: Math.abs(L − CYLINDER_LIT_SHARE × (L + D)) <= 1
});
it('pixelCone: 16 segments, lit on the screen left', () => {
  // bounds B = { left: -48, right: 48, top: -56, bottom: 24 }; colours ['#e8503a', '#f2f2f2'] (o4, c1)
  // a = new PixelSurface(B); pixelCone(a, 0.5, 0.5, 0.8, 20, 60, colours, 12); a.finish()
  // b = new PixelSurface(B); pixelCone(b, 0.5, 0.5, 0.8, 20, 60, colours, 16); b.finish()
  // a.hash() === b.hash() (the segments argument is ignored: CONE_SEGMENTS, Prototype decision 7)
  // on a: slotIndex('o4') and slotIndex(tone('o4', 1)) (o5) both occur;
  // over the opaque non-ink pixels of the o ramp: the mean tone index (the digits of the slot name) of the
  // pixels with column < a.ox is <= the mean of the pixels with column > a.ox
});
it('a twin paints only slots: surface.misses is 0 for map colours', () => {
  const s = new PixelSurface({ left: -40, right: 40, top: -60, bottom: 40 });
  box(s as never, 0.2, 0.2, 0.8, 0.8, 0, 20, '#6dbb4f', '#dcc79c', '#9a7148');
  s.finish();
  expect(s.misses).toBe(0);
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/render/pixel/shapes.test.ts`
Expected: FAIL, "Cannot find module …/pixel/art/shapes".

- [ ] **Step 3: Implement the twins and the five branches**

The twins call no `translate`, `scale`, `rotate`, `transform` or `setTransform` (§5.4 rule 6).

- [ ] **Step 4: Run the tests to see them pass**

Run: the command of Step 2 and the Global gates (the recorder tests prove the Classic path).

- [ ] **Step 5: Stage**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; git add -A`. Then Task 1 Step 6b.

---

### Task 11: Guest stamps

**Files:**
- Create: `src/render/pixel/stamp.ts`, `src/render/pixel/sprites/people.ts`
- Modify: `src/render/sprites/props.ts` `drawGuestArt` (`:140`): first line `if (import.meta.env.VITE_PROTO_DROP !== 'guest' && isPixelSurface(ctx)) { drawGuestPixel(ctx, g); return; }`
- Test: `tests/unit/render/pixel/stamp.test.ts`, `tests/unit/render/pixel/people.test.ts`

**Interfaces:**
- Consumes: `isPixelSurface`, `PixelSurface` (Task 4); `SLOT_NAMES`, `SLOT_RGBA`, `INK_SLOT` (Task 3); `ART_PX_WORLD` (Task 4); `GuestLook` (`src/render/sprites/props.ts:21-41`).
- Produces, `stamp.ts` (the full unit of §5.2, rules of §8.3): `interface Stamp { rows: readonly string[]; pairs?: readonly string[] }`; `type StampMap = Readonly<Record<string, string>>`; `stamp(ctx: ArtCtx, s: Stamp, x: number, y: number, map: StampMap, opts?: { mirror?: boolean }): void`; `px(ctx: ArtCtx, x: number, y: number, colour: string): void`; `stampSize(s: Stamp): { w: number; h: number }`.
- Produces, `people.ts` (part of the §5.2 unit): `drawGuestPixel(ctx: ArtCtx, g: GuestLook): void`; `const GUEST_FRONT: Stamp`, `GUEST_BACK: Stamp`, `GUEST_STEP_1: Stamp`, `GUEST_STEP_2: Stamp`, `GUEST_BACK_STEP_1: Stamp`, `GUEST_BACK_STEP_2: Stamp`. Left out: `PIXEL_GUEST_BOUNDS`, `PIXEL_GUEST_ITEM_BOUNDS` (the bank keeps `GUEST_BOUNDS`, `props.ts:15`; the 12-row stamp reaches world y −22, inside the surface pad), items, rings and the sit frame.
- Rows: `GUEST_FRONT` and `GUEST_BACK` are the strings of `GUEST` and `GUEST_BACK` (`pixel3.py:256-257`). `GUEST_STEP_1` and `GUEST_STEP_2` are `GUEST_FRONT` with the last two rows changed so that the left leg (step 1) or the right leg (step 2) is one row shorter; the outline stays closed (every non-`o` letter has no transparent 4-neighbour). `GUEST_BACK_STEP_1` and `GUEST_BACK_STEP_2` are `GUEST_BACK` with the same change of the last two rows.
- Frame choice: back rows for view facings N and W (`g.facing` 0 and 3), front rows for E and S; `walk` 0 and 3 give the standing rows (`GUEST_FRONT`, `GUEST_BACK`); `walk` 1 gives `GUEST_STEP_1` (front) or `GUEST_BACK_STEP_1` (back), `walk` 2 gives `GUEST_STEP_2` or `GUEST_BACK_STEP_2`. No frame is mirrored; a back facing never shows the face. Map: `o` ink, `H` `g.hair`, `S` `g.skin`, `T` `g.shirt`, `P` `'#2f3b55'` (the Classic trousers, `drawGuestArt`, `props.ts:168`). Balloon, umbrella and ring are not drawn in stage 0.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/render/pixel/stamp.test.ts (cases)
it('size and bottom-centre anchor (§8.3)', () => {
  expect(stampSize(GUEST_FRONT)).toEqual({ w: 7, h: 12 });
  // on a Recorder: stamp(ctx, GUEST_FRONT, 0, 0, map): the first fillRect is (-2, -22, 6, 2) with fillStyle '#2a1a36'
});
it('one fillRect per run of one letter', () => {
  const map = { H: 'g2' };
  const r = new Recorder();
  stamp(r.ctx(), { rows: ['oHHHHHo'] }, 0, 0, map);
  expect(r.ops.filter((o) => o.startsWith('fillRect(')).length).toBe(3);
});
it('mirror swaps the pairs letters, so light stays on the left', () => {
  // { rows: ['ab'], pairs: ['ab'] }, map { a: '#ff0000', b: '#00ff00' }, mirror: the left run is '#ff0000'
});
it('a stamp uses no transform', () => { /* Recorder.transforms === 0 */ });
it('a stamped guest has no second outline', () => {
  // on a surface (bounds { left: -16, right: 16, top: -32, bottom: 8 }): stamp GUEST_FRONT at (0, 0) with the map
  // { H: '#3b2a20', S: '#f3e0be', T: '#e8503a', P: '#2f3b55' }, finish()
  const oCount = GUEST_FRONT.rows.join('').split('o').length - 1; // (28)
  // the count of pixels equal to INK_SLOT is oCount
});
```

```ts
// tests/unit/render/pixel/people.test.ts (cases)
it('the draft rows', () => {
  expect(GUEST_FRONT.rows).toEqual(['..ooo..', '.oHHHo.', 'oHHHHHo', 'oHSSSHo', '.oSSSo.', 'oTTTTTo', 'oTTTTTo', 'oSTTTSo', '.oTTTo.', '.oPPPo.', '.oPoPo.', '.oo.oo.']);
});
it('the 6 frames differ', () => {
  // GUEST_FRONT, GUEST_BACK, GUEST_STEP_1, GUEST_STEP_2, GUEST_BACK_STEP_1, GUEST_BACK_STEP_2 stamped on 6 surfaces
  // with the same map: 6 different hashes
});
it('a walking guest that faces N shows the back of the head', () => {
  // drawGuestPixel with facing 0 and walk 1 gives the same hash as stamp(s, GUEST_BACK_STEP_1, 0, 0, map) with the map of that guest (H, S, T, P as above), on surfaces with the same bounds
});
it('the shirt letter takes the shirt colour', () => {
  // g.shirt '#e8503a': the pixel of a T letter is slotIndex('o4')
});
it('drawGuestArt on a surface is the twin; on a recorder it is Classic', () => {
  // surface hash equals drawGuestPixel hash; Recorder ops contain 'ellipse(' (props.ts:158-160)
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/render/pixel/stamp.test.ts tests/unit/render/pixel/people.test.ts`
Expected: FAIL, "Cannot find module …/pixel/stamp".

- [ ] **Step 3: Implement `stamp.ts`, `people.ts` and the branch**

`stamp` and `px` paint between `cut(true)` and `cut(false)` when the context has `cut` (§8.3 "Output").

- [ ] **Step 4: Run the tests to see them pass**

Run: the command of Step 2, `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/render/guestItems.test.ts tests/unit/a11y`, and the Global gates.

- [ ] **Step 5: Stage**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; git add -A`. Then Task 1 Step 6b.

---

### Task 12: Carousel twin

**Files:**
- Create: `src/render/pixel/art/rides.ts`
- Modify: `src/render/sprites/rides.ts` `drawRideArt` (`:471-495`): inside the `withGates` body, before the `switch`: `if (isPixelSurface(ctx) && PIXEL_RIDE_ART[defId]) { PIXEL_RIDE_ART[defId](ctx, ex, ey, st); return; }`
- Test: `tests/unit/render/pixel/carousel.test.ts`

**Interfaces:**
- Consumes: `PixelSurface`, `isPixelSurface` (Task 4); `pixelCylinder`, `pixelCone` (Task 10); `stamp`, `px` (Task 11).
- Produces: `const PIXEL_RIDE_ART: Readonly<Record<string, (ctx: ArtCtx, ex: number, ey: number, st: RideArtState) => void>>` with one entry, `carousel`, unless `import.meta.env.VITE_PROTO_DROP === 'carousel'`; then it is `{}` (§10.4 item 3, the drop build of Task 21). `PIXEL_RIDE_ART` is a plain object literal, not frozen (no `Object.freeze`, unlike `FLAT_RIDES`, `src/data/catalog/flatRides.ts:19`): the test spies on its entry, and `vi.spyOn` throws on a frozen object; `drawRideArt` reads the entry at call time (§5.4 rule 2). Left out: `pixelRideHeight`, `pixelGate`.
- Draft source: `carousel` (`pixel3.py:454-482`) with `HORSE` (`pixel3.py:267`). `HORSE` is a module constant of `src/render/pixel/art/rides.ts` and is used only there (not in `stamp.ts` or `people.ts`, which stay in the carousel drop build), so the marker check of Task 21 Step 3 sees it leave the bundle. Draft art pixels become world pixels × 2. Radii × 0.8 and heights × 0.75 of the draft values: the draft roof (1.74 tiles) becomes 1.4 tiles, the Classic roof radius (the `cone` call of `drawCarousel`, `rides.ts:162`), and the draft flag top (65 art pixels) becomes 98 world pixels, the Classic flag top (the `line3` call, `rides.ts:179`). So the twin fits `rideArtBounds('carousel', 3, 3, r)` (height 100, `HEIGHTS`, `rides.ts:33`). Two layers: the body (platform, drum, horses, poles, centre pole) and the roof (valance, cone, flag), as the draft. Horses turn with `st.angle` (`2π × (k / 8 + st.angle)`), poles are strokes (no ink), horses are `HORSE` stamps with the draft map (`W` c1 or o1, `S` o4, b2, v2, p2). Bulbs are `px` in `o1`. No riders in stage 0.
- Colours are slot names, so the twin itself counts no miss.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/render/pixel/carousel.test.ts (cases)
const st = { rotation: 2 as const, angle: 0, swing: 0, occupancy: 0 };
it('drawRideArt calls the twin on a surface and not on a recorder', () => {
  // const spy = vi.spyOn(PIXEL_RIDE_ART, 'carousel'); surface → 1 call; new Recorder().ctx() → still 1 call
});
it('the twin stays inside the Classic bounds', () => {
  // s = new PixelSurface(rideArtBounds('carousel', 3, 3, 2)); PIXEL_RIDE_ART.carousel(s, 3, 3, st); s.finish()
  // no opaque pixel in the outer row or column of the image; s.misses === 0
});
it('the roof layer puts ink over the body', () => {
  // at least one INK_SLOT pixel has an opaque non-ink pixel directly above and directly below it
});
it('the horses turn with the angle', () => {
  // hash at st.angle 0 !== hash at st.angle 1/16
});
it('each view rotation paints inside the bounds', () => {
  // for rotation 0..3: s = new PixelSurface(rideArtBounds('carousel', 3, 3, rotation));
  // PIXEL_RIDE_ART.carousel(s, 3, 3, { ...st, rotation }); s.finish(): no opaque pixel in the outer row or column
  // (no rule on equal or different hashes: stage 3 asks for 4 different hashes of a hero ride, §13.3)
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/render/pixel/carousel.test.ts`
Expected: FAIL, "Cannot find module …/pixel/art/rides".

- [ ] **Step 3: Implement the twin and the branch**

The twin calls no `translate`, `scale`, `rotate`, `transform` or `setTransform` (§5.4 rule 6).

- [ ] **Step 4: Run the tests to see them pass**

Run: the command of Step 2 and the Global gates.

- [ ] **Step 5: Stage**

The look of the twin is checked on the sheet (Task 16 Step 3) and in the pictures (Task 19a Step 3).

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; git add -A`. Then Task 1 Step 6b.

---

### Task 13: Ground shadows and the Pixel frame order

**Files:**
- Create: `src/render/pixel/shadows.ts`
- Modify: `src/render/worldLayers.ts` `createWorldLayers` (`:17-25`): `createPixelShadowLayer()` first
- Modify: `src/render/renderer.ts` `draw` (`:1086-1114`): in Pixel the block from the fence refresh (`:1093-1097`) to `collectGuests` (`:1110`) runs after `mgmt.begin` (`:1087`) and before `mgmt.drawGround` (`:1088`); `collectGuests` (not `lod`) appends each snapped walker anchor to `frame.art.walkers` (a `Float64Array` of 2 × 256 numbers, doubled when full; `walkerCount` set to 0 before the block) (§8.4 item 4, §5.5 stage 2a row)
- Modify: `src/render/scenery/art/kit.ts` `shadow` (`:91-93`): returns at once on a surface; `src/render/sprites/stalls.ts` `drawStallArt` shadow `poly3` (`:162-163`): skipped on a surface (§8.4 item 6, first list; the scene's trees and snack shack use them)
- Test: `tests/unit/render/pixel/shadows.test.ts` (the layer alone), `tests/unit/render/pixel/shadowFrame.test.ts` (the renderer's frame order and walker list; a file of its own, because its `vi.mock` of `worldLayers` holds for the whole file)

**Interfaces:**
- Consumes: `ArtFrame` (Task 6); `PixelSurface` (Task 4); `rideArtBounds` (`rides.ts:50-54`), `stallArtBounds` (`src/render/sprites/stalls.ts:31-33`), `getSceneryDef` (`src/data/catalog/scenery.ts`), `extent` (`src/sim/footprint`), `viewTileSX`, `viewTileSY`, `viewPointSX`, `viewPointSY`, `viewTileU`, `viewTileV` (`src/render/view.ts:237, 242`); `STEP_PX`, `TILE_W`, `TILE_H` (`src/render/iso`; the renderer's private `HW = TILE_W / 2`, `HH = TILE_H / 2`, `renderer.ts:59-60`, are copied as local constants); `itemView`, `newItemView` (`src/render/scenery/place`; the scenery layer's private `STEP = 8`, `scenery/layer.ts:31`, equals `STEP_PX`, `src/render/iso.ts:10`: use `STEP_PX`); `makeCanvas` (`src/render/canvas.ts:12`).
- Produces (part of the §5.2 unit): `interface Caster` (§5.2); `casterOf(kind: 'ride' | 'stall' | 'scenery' | 'guest', defId: string, rotation: number): Caster | null` (stage 0 kinds only; edge scenery gives `null`); `casterMask(c: Caster, rotation: ViewRotation): { w: number; h: number; cx: number; cy: number; bits: Uint8Array }` (prototype export: the art-pixel mask of §8.4 items 2 and 3, `w × h` bytes, row by row, 1 = shadow; `(cx, cy)` is the mask column and row of the caster's anchor art pixel; the layer caches its result per caster key and view rotation); `createPixelShadowLayer(): WorldLayer` (name `'pixelShadow'`, `kinds: []`, `drawGround` only); `const ROUND_CASTERS: ReadonlySet<string>` (the 7 ids and pairs of §8.4 item 1); `const SHADOW_MULTIPLY = '#c9c0cb'`; `const GUEST_SHADOW: Caster = { shape: 'ellipse', w: 8, d: 3, heightPx: 0, shift: 0 }`; `const SHADOW_TZ = 40`; `const SHADOW_LEN = 0.75`. Left out: `BENCH_SHADOW`, `EDGE_CASTER_DEPTH`, the `'staff'`, `'pathItem'` and `'show'` kinds.
- Rules: casters of §8.4 item 1 (ride, stall, round and box scenery, guest; `bed_mixed` gives `null`); shapes of §8.4 item 2 (a box shadow is the footprint polygon of `pixel3.py:178` with its far corners moved to the screen right by `heightPx / SHADOW_TZ × SHADOW_LEN × 64` world pixels). Ellipse rule (exact form of §8.4 item 2, "the pixels whose centres are inside the ellipse of that box"): for the box of columns `c0` to `c1` and rows `r0` to `r1` (inclusive), the ellipse has the centre `ex = (c0 + c1 + 1) / 2`, `ey = (r0 + r1 + 1) / 2` and the radii `rx = (c1 − c0 + 1) / 2`, `ry = (r1 − r0 + 1) / 2`, in pixel-edge coordinates; the pixel `(x, y)` is set when `((x + 0.5 − ex) / rx)² + ((y + 0.5 − ey) / ry)² ≤ 1`. (For `GUEST_SHADOW` this sets the columns `cx − 3` to `cx + 4` on the middle row.) Anchor of a caster (the `(ax, ay)` of the copy rule below) = the anchor that the renderer pushes for that object: a ride, `(u0 − v0) × HW`, `(u0 + v0) × HH − z × STEP_PX` with `(u0, v0)` from `footprintViewOrigin` (`collectRides`, `renderer.ts:441-447`; the origin rule is the private closure `footprintViewOrigin`, `renderer.ts:383-390`: copy it into `shadows.ts` as a pure function of `(va, x, y, ex, ey)`, do not export it from the renderer); a stall, `viewTileSX(va, st.x, st.y)`, `viewTileSY(va, st.x, st.y, z)` (`collectStalls`, `renderer.ts:466`, its `ax` and `ay`); a scenery item with a `box` caster, its sprite anchor `(ax, ay)` = `(iv.u0 − iv.v0) × HW`, `(iv.u0 + iv.v0) × HH − item.z × STEP_PX` (`SceneryLayer.collect`, `src/render/scenery/layer.ts:103-104`, with `itemView`); a scenery item with an `ellipse` caster (the ids of `ROUND_CASTERS`), the footprint centre `(ax + (iv.ex − iv.ey) × HW / 2, ay + (iv.ex + iv.ey) × HH / 2)` from that sprite anchor (for a 1 × 1 item the sprite anchor + (0, 16) world pixels, the tile centre, where the draft `sh_ell(x, y, r, k)`, `pixel3.py:173-175`, and the Classic `shadow(ctx, 0.5, 0.5, r)`, `src/render/scenery/art/base.ts:43` drawn by `shadow` at `sx(cu, cv)`, `sy(cu, cv, 0)`, `src/render/scenery/art/kit.ts:91-93`, centre the ellipse; Prototype decision 10); a walker, the snapped anchor in `frame.art.walkers`. Both scenery points are even world pixels (`(iv.ex − iv.ey) × 16` and `(iv.ex + iv.ey) × 8`). A box mask holds the footprint diamond with its back corner (the top vertex on screen, the point `(u0, v0)`) at the mask's `(cx, cy)`. An ellipse mask has its anchor pixel at `(cx, cy)` and the columns and rows of §8.4 item 2 around it (the `shift` moves the columns to the screen right), so an oak's ellipse covers the rows from 4 art pixels above to 4 art pixels below its trunk foot (with the back corner as its anchor it would end 4 art pixels above the foot, behind the tree). Masks cached per caster key and view rotation (§8.4 item 3): the cache holds `casterMask` and a mask image of `w × h` pixels, painted once with `fillStyle = SHADOW_MULTIPLY` and one `fillRect(x, y, len, 1)` per horizontal run of 1 bits (no other colour and no other drawing call on the mask image); all masks drawn with `source-over` (the shadow context never sets another `globalCompositeOperation`) into one canvas-size shadow canvas (cleared with `clearRect` each frame; after the `clearRect` and before the mask copies, the shadow context sets `imageSmoothingEnabled = false` each frame, because a new 2D context starts with smoothing on and a smoothed `w × n` copy gives partial alpha at every shadow edge; the frame context keeps `imageSmoothingEnabled = false` of Task 8 for the multiply copy, which is 1:1), then one `drawImage` of the shadow canvas on the frame context with `globalCompositeOperation = 'multiply'` (§8.4 item 4), restored after. Copy rule (as `blitArt`, §7.7): a caster whose anchor is at world pixel `(ax, ay)` (even: ride, stall and scenery anchors are multiples of 2 world pixels, walker anchors are snapped) copies its mask image to `x0 = f.art.offX + (ax / 2 − cx) × n`, `y0 = f.art.offY + (ay / 2 − cy) × n`, size `w × n` by `h × n`, with `n = f.art.n`. So every shadow edge lies on the art grid of the frame, and kill rule 2 (Task 19b) checks shadows with the rest of the canvas. With `f.art` absent, `null`, or `f.art.n === 0` the layer draws nothing (prototype: no shadows at a non-crisp zoom).

- [ ] **Step 1: Write the failing test**

The layer is driven alone on a context stub that records `globalCompositeOperation` and the image at each `drawImage` (FakeCanvas does not record it before stage 2a). The shadow canvas and the mask images are `FakeCanvas` objects (`install()`, `makeCanvas`): the shadow canvas is the `image` of the multiply copy, its `draws` list holds the mask copies (`fakeCanvas.ts:59-62`), its `count(name)` counts the calls, and the context of a mask image keeps the last `fillStyle` (the state object of `fakeCanvas.ts:26`).

```ts
// tests/unit/render/pixel/shadows.test.ts (cases)
it('casters (§8.4 item 1)', () => {
  expect(casterOf('ride', 'carousel', 0)?.heightPx).toBe(100);
  expect(casterOf('stall', 'snack_shack', 0)?.heightPx).toBe(66);
  expect(casterOf('scenery', 'oak_round', 0)).toEqual({ shape: 'ellipse', w: 27, d: 9, heightPx: 0, shift: 10 });
  expect(casterOf('scenery', 'pine_tall', 0)).toEqual({ shape: 'ellipse', w: 25, d: 9, heightPx: 0, shift: 10 });
  expect(casterOf('scenery', 'birch_silver', 0)).toEqual({ shape: 'ellipse', w: 19, d: 7, heightPx: 0, shift: 6 });
  expect(casterOf('scenery', 'shrub_round', 0)).toEqual({ shape: 'ellipse', w: 19, d: 7, heightPx: 0, shift: 6 });
  expect(casterOf('scenery', 'bed_mixed', 0)).toBeNull();
  expect(casterOf('scenery', 'fountain_garden', 0)).toEqual({ shape: 'box', w: 1, d: 1, heightPx: 16, shift: 0 });
  expect(casterOf('guest', 'guest', 0)).toEqual(GUEST_SHADOW);
  expect(SHADOW_MULTIPLY).toBe('#c9c0cb');
});
it('the guest mask covers the columns cx - 3 to cx + 4', () => {
  const m = casterMask(GUEST_SHADOW, 0);
  const cols = new Set<number>();
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.bits[y * m.w + x]) cols.add(x - m.cx);
  expect(Math.min(...cols)).toBe(-3);
  expect(Math.max(...cols)).toBe(4);
});
it('a box shadow grows to the screen right with the height', () => {
  // (40 / SHADOW_TZ × SHADOW_LEN × 64 = 48 world pixels = 24 art pixels, §8.4 item 2)
  const low = casterMask({ shape: 'box', w: 1, d: 1, heightPx: 0, shift: 0 }, 0);
  const high = casterMask({ shape: 'box', w: 1, d: 1, heightPx: 40, shift: 0 }, 0);
  const right = (m: typeof low): number => {
    let r = -Infinity;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.bits[y * m.w + x]) r = Math.max(r, x - m.cx);
    return r;
  };
  expect(right(high) - right(low)).toBe(24);
});
it('masks go into the shadow canvas on the art grid (n = 2 and n = 3)', () => {
  // world with a carousel, a stall, an oak and 2 walkers; for n of 2 and 3: f.art = { n, scale: n / 2, offX: 101, offY: 57, walkers, walkerCount: 2 }
  // for every entry d of shadowCanvas.draws: x, y, w, h are integers; d.w % n === 0; d.h % n === 0;
  // ((d.x - 101) % n + n) % n === 0 and ((d.y - 57) % n + n) % n === 0
});
it('one multiply copy per frame; nothing with f.art null', () => {
  // world with a carousel, a stall, an oak and 2 walkers in f.art.walkers: drawGround → exactly 1 drawImage with op 'multiply'
  // the same call with f.art = null → 0 drawImage calls
});
it('walker masks only at the anchors of frame.art.walkers', () => {
  // an empty world (no ride, stall or scenery); walkers [40, 20, 80, 60], walkerCount 2, n = 2, offX = offY = 0:
  // shadowCanvas.draws has exactly 2 entries, at x = (40 / 2 - m.cx) * 2, y = (20 / 2 - m.cy) * 2 and
  // x = (80 / 2 - m.cx) * 2, y = (60 / 2 - m.cy) * 2, with m = casterMask(GUEST_SHADOW, 0)
});
it('two overlapping shadows do not darken twice', () => {
  // an empty world; two walkers 1 art pixel apart (walkers [40, 20, 42, 20], walkerCount 2), n = 2:
  // shadowCanvas.draws has exactly 2 entries; const op = shadowCanvas.getContext().globalCompositeOperation: typeof op !== 'string' || op === 'source-over'
  // (FakeCanvas returns a function for a property that was never set);
  // shadowCanvas.count('fill') === 0 and shadowCanvas.count('fillRect') === 0 (only clearRect and drawImage);
  // each mask image: its context's fillStyle === SHADOW_MULTIPLY, count('fillRect') > 0, count('fill') === 0, count('drawImage') === 0;
  // the frame stub has exactly 1 drawImage, with op 'multiply'
  // (shadowCanvas.getContext() as { imageSmoothingEnabled: unknown }).imageSmoothingEnabled === false
  // (the FakeCanvas state object keeps a value once it is set, fakeCanvas.ts:26, :75-78)
});
it('a ride shadow lies under its footprint (anchor rule)', () => {
  // a world with only a carousel: executeCommand(world, { type: 'placeRide', defId: 'carousel', x: 8, y: 10, rotation: 2 }) ok;
  // view rotation 0; f.art = { n: 2, scale: 1, offX: 0, offY: 0, walkers: new Float64Array(0), walkerCount: 0 }; drawGround
  // shadowCanvas.draws has exactly 1 entry d; m = casterMask(casterOf('ride', 'carousel', 2)!, 0); z = map.heights[10 * map.width + 8]
  // bit(X, Y) = m.bits[(Y − d.y / 2) * m.w + (X − d.x / 2)] for the world art pixel (X, Y) (0 outside the mask)
  // footprint (u0 8, v0 10, 3 × 3): front corner at art (−32, 192 − 4z), left corner at art (−80, 168 − 4z)
  // (the shear of pixel3.py:178 keeps the back, left and front corners and moves the right corner):
  expect(bit(-32, 190 - 4 * z)).toBe(1); // 2 art pixels inside the front corner
  expect(bit(-76, 168 - 4 * z)).toBe(1); // 4 art pixels inside the left corner
  expect(bit(-32, 194 - 4 * z)).toBe(0); // 2 art pixels outside the front corner
});
it('a round tree shadow centres on the tile centre, moved by its shift (ellipse anchor rule)', () => {
  // a world with only an oak: placeScenery oak_round at (12, 12), rotation 2, edge −1, ok; item = world.state.scenery[0];
  // view rotation 0, so itemView gives u0 = 12, v0 = 12, ex = ey = 1: sprite anchor ax = 0, ay = 24 × 16 − item.z × 8
  // f.art = { n: 2, scale: 1, offX: 0, offY: 0, walkers: new Float64Array(0), walkerCount: 0 }; drawGround
  // shadowCanvas.draws has exactly 1 entry d; m = casterMask(casterOf('scenery', 'oak_round', 2)!, 0)
  // rows = the rows y of m with a 1 bit, cols = the columns x of m with a 1 bit (world art pixel = d.x / 2 + x, d.y / 2 + y)
  const ax = 0;
  const ay = 24 * 16 - item.z * 8;
  expect(d.y / 2 + (Math.min(...rows) + Math.max(...rows)) / 2).toBe(ay / 2 + 8); // the middle row: the tile centre
  expect(d.x / 2 + (Math.min(...cols) + Math.max(...cols)) / 2).toBe(ax / 2 + 10); // the middle column: ax / 2 + shift
  expect(Math.max(...rows) - Math.min(...rows) + 1).toBe(9); // d of oak_round
});
```

```ts
// tests/unit/render/pixel/shadowFrame.test.ts (cases; the renderer's Pixel frame order, §8.4 item 4)
// const seen = vi.hoisted(() => [] as Array<{ count: number; pairs: number[]; frame: LayerFrame }>);
// vi.mock('../../../../src/render/worldLayers', async (importOriginal) => {
//   const mod = await importOriginal<typeof import('../../../../src/render/worldLayers')>();
//   return { ...mod, createWorldLayers: () => mod.createWorldLayers().map((l) => l.name !== 'pixelShadow' ? l : {
//     ...l,
//     drawGround: (ctx, world, tool, f) => {
//       const n = f.art?.walkerCount ?? 0;
//       seen.push({ count: n, pairs: Array.from(f.art?.walkers?.subarray(0, 2 * n) ?? []), frame: f });
//       l.drawGround!(ctx, world, tool, f);
//     },
//   }) };
// });
it('the walker list of a frame is filled before the shadow layer draws', () => {
  // the world, canvas and renderer of Task 8 (frame.test.ts set-up); setArtStyle('pixel'); renderer.resize(800, 600, 1); cam(1) (n = 2, not lod)
  // draw frame 1; runTicks(world, 20) (guests move); draw frame 2; draw frame 3 (no tick between 2 and 3)
  // seen has 3 entries; s1, s2, s3 = seen[0], seen[1], seen[2]
  // after frame 2 and after frame 3 (read at once, before the next draw): s.frame.art.walkerCount and the pairs of s.frame.art.walkers
  expect(s2.count).toBeGreaterThan(0);
  expect(s2.count).toBe(countAfter2); // the count at drawGround is the count of the finished frame 2: the block ran before drawGround
  expect(s2.pairs).toEqual(pairsAfter2); // the same anchors, not those of frame 1
  expect(s2.pairs).not.toEqual(s1.pairs); // frame 1 and frame 2 differ, so the check above can see a late block
  expect(s3.count).toBe(s2.count); // the count is set to 0 before the block of each frame (frame 3 = frame 2)
  expect(s2.count).toBeLessThanOrEqual(world.state.guests.length);
  for (const v of s2.pairs) expect(v % 2).toBe(0); // snapped anchors (snapWalker gives even world pixels)
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/render/pixel/shadows.test.ts tests/unit/render/pixel/shadowFrame.test.ts`
Expected: FAIL, "Cannot find module …/pixel/shadows" (and in `shadowFrame.test.ts`, `seen` is empty: no `pixelShadow` layer yet).

- [ ] **Step 3: Implement the layer, the frame order, the walker list and the two skips**

Classic keeps today's frame order and today's in-art shadows.

- [ ] **Step 4: Run the tests to see them pass**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/render tests/unit/scenery` and the Global gates.

- [ ] **Step 5: Stage**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; git add -A`. Then Task 1 Step 6b.

---

### Task 14: Track slices with the cut rule

**Files:**
- Modify: `src/render/track/layer.ts` `sliceBounds` (`:226`): when `artStyle()` is `'pixel'`, each run widens by one sample on each cut side before the bounds are measured (stage 4a track rule 2); `paintSlice` (`:321`) gains a 4th parameter `extras = true` (the 5 existing call sites in 4 files, `src/render/track/layer.ts:691`, `tests/unit/render/track/phase6Render.test.ts:124` and `:139`, `tests/unit/render/track/slices.test.ts:108` and `tests/unit/track/waterRender.test.ts:93`, pass 3 arguments, so nothing changes for them): on a surface with `extras` true, each run `[k0, k1]` is painted as today, then the extra samples `[k0 − 1, k0]` (when `k0 > 0`) and `[k1, k1 + 1]` (when `k1 < s.n − 1`) are painted with `cut(true)` (track rules 1 and 3). The slice build in `drawSlice` (`:691`) keeps ink on (no `{ ink: false }`).
- Test: `tests/unit/render/pixel/slices.test.ts`

**Interfaces:**
- Consumes: `artStyle`, `setArtStyle` (Task 2); `PixelSurface`, `INK_SLOT` (Tasks 3, 4); `buildRideSlices` (`layer.ts:254`), `paintSlice` (`:321`), `viewFrame` (`src/render/track/project.ts`); `buildR1` (`tests/unit/track/helpers.ts:88`); `makeTestWorld` (`tests/helpers/world.ts:29`).
- Produces: `paintSlice(ctx, sl: SliceRec, f: ViewFrame, extras = true): void` (the new parameter; `extras` false paints the bare runs only, for the test below). A slice in Pixel paints inside its grown bounds.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/render/pixel/slices.test.ts (cases)
it('Pixel slice bounds contain the Classic bounds and some grow', () => {
  // world = makeTestWorld(); id = buildR1(world); f = viewFrame(0, …) as slices.test.ts does
  // classic = buildRideSlices(world, id, f); setArtStyle('pixel'); pixel = buildRideSlices(world, id, f)
  // for each index: pixel.left <= classic.left, pixel.right >= classic.right, pixel.top <= classic.top, pixel.bottom >= classic.bottom
  // at least one slice has a strictly larger box
});
it('every Pixel slice paints inside its bounds, in 4 view rotations', () => {
  // for r 0..3: each slice on new PixelSurface(sl.bounds): paintSlice(s as never, sl, f); s.finish();
  // no opaque pixel in the outer row or column of the image
});
it('the extra samples make no ink', () => {
  // r 0; for each slice: a = new PixelSurface(sl.bounds); paintSlice(a as never, sl, f, true); a.finish();
  //                      b = new PixelSurface(sl.bounds); paintSlice(b as never, sl, f, false); b.finish();
  // for every pixel index i with a.pixel != 0 and b.pixel == 0 (painted only by the extra samples): a.inkMask()[i] === 0
  // at least one slice has such a pixel (the extras paint something)
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/render/pixel/slices.test.ts`
Expected: FAIL (bounds do not grow).

- [ ] **Step 3: Implement the two branches**

- [ ] **Step 4: Run the tests to see them pass**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/render/pixel/slices.test.ts tests/unit/render/track tests/unit/track/waterRender.test.ts` and the Global gates.

- [ ] **Step 5: Stage**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; git add -A`. Then Task 1 Step 6b.

---

### Task 15: Scene colour map

**Files:**
- Modify: `src/render/pixel/colourMap.ts` (add entries)
- Test: `tests/unit/render/pixel/protoMap.test.ts`

**Interfaces:**
- Consumes: `buildSprite`, `artBuildLog` (Task 5); the bank (`src/render/sprites/bank.ts:97-207`); `ScenerySprites.get` (`src/render/scenery/sprites.ts:70`); `paletteStats` (Task 3); `startDerivedMemo`, `stopDerivedMemo`, `DerivedRecord` (Task 2).
- Produces: `COLOUR_MAP` entries for every literal and derived output that the scene's objects draw: the big wheel, the gates of both rides (`drawGate`, `rides.ts:101-108`), the snack shack, the 6 scenery items of §11.2 item 5 in 4 facings, the bench and the lamp (`bank.pathItem`), litter and mess (`bank.decal`), the fence in 4 directions, both entrance parts, and guests in the 12 shirts with each skin and hair (about 80 literals, §11.3). Each entry follows the proposal rule of §6.4 "How it is made" item 2 (inside the hue family, the ramp that keeps the order of lightness, the tone of nearest lightness) and, for a `shade` output, §6.5 item 2 with step 1.18; no entry names `i3` (§6.4 check 6).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/render/pixel/protoMap.test.ts
it('the scene objects resolve every colour through the map (no miss)', () => {
  // install(); setArtStyle('pixel'); paletteStats.misses = 0; paletteStats.missed.clear();
  // const bank = new SpriteBank() (src/render/sprites/bank.ts:88, default budget); const scen = new ScenerySprites() (src/render/scenery/sprites.ts:61);
  // bucket 0.5 for every call; the key helpers are guestSpriteKey, pathItemSpriteKey, decalSpriteKey (bank.ts:61, :71, :76), scenerySpriteKey (scenery/sprites.ts:35):
  // - rides: bank.ride(id, def.w, def.d, rot, frame, 0.5) for id 'carousel' and 'big_wheel' (def = getFlatRideDef(id)), rot 0..3, frame 0 and 16;
  //   the gates: drawRideArt draws them (drawGate, rides.ts:101-108), so no extra call
  // - stall: bank.stall('snack_shack', rot, 0, 0.5), rot 0..3
  // - scenery: scen.get(scenerySpriteKey(id, f, 0, 0.5), id, f, 0, 0.5) for the 6 ids of §11.2 item 5, f 0..3
  // - path items: frame = pathItemFrame(code, side, 0, false) (src/render/sprites/litter.ts:28) for code ITEM_BENCH and ITEM_LAMP (litter.ts:16, :18), side 0..3;
  //   bank.pathItem(pathItemSpriteKey(frame, 0.5), frame, 0.5)
  // - decals: litter frame 0..3 (LITTER_VARIANTS, src/render/management/litter.ts:8) and mess frame DECAL_MESS + 0..1 (bank.ts:79), flip 0 and 1;
  //   bank.decal(decalSpriteKey(frame, flip, 0.5), frame, flip, 0.5)
  // - fence: bank.fence(dir, 0.5), dir 0..3; entrance: bank.entrance(part, outerDir, 0.5), part 0 and 1, outerDir −1..3
  // - guests: frame = colour | (walk << 4) | (look << 6) (the decoding of bank.guest, bank.ts:124-140), colour 0..11, look 0..3 (the 4 skin and hair pairs of LOOKS, bank.ts:38), walk 0..2;
  //   bank.guest(guestSpriteKey(facing, frame, 0.5), facing, frame, 0.5) for facing 0 and 1 (front and back rows)
  // call bank.beginFrame() before each bank.guest call (it resets the cap of GUEST_BUILDS_PER_FRAME, bank.ts:82, :92-95; 288 guest builds exceed 48)
  // startDerivedMemo() runs before the first build; const recs = stopDerivedMemo() after the last (in a finally, so a throw does not leave the memo on)
  const missed = [...paletteStats.missed].sort();
  // one line per missed colour, so Step 3 knows which rule maps it:
  // for each m of missed: every record r of recs with r.out === m prints 'm <- shade(r.base, r.f)' or 'm <- mix(r.a, r.b, r.t)';
  // a missed colour with no record prints 'm <- literal'
  if (missed.length > 0) console.log(missed.map((m) => describeMiss(m, recs)).join('\n'));
  expect(missed).toEqual([]);
  expect(paletteStats.misses).toBe(0);
});
it('keys stay sorted; no entry is i3 or a signal slot', () => {
  const keys = Object.keys(COLOUR_MAP);
  expect(keys).toEqual([...keys].sort());
  for (const k of keys) expect(k).toBe(k.toLowerCase());
  for (const v of Object.values(COLOUR_MAP)) {
    expect(v).not.toBe('i3');
    expect(['x', 'y', 'q', 'u']).not.toContain(v.replace(/\d+$/, ''));
  }
});
```

- [ ] **Step 2: Run the test to see it fail and list the misses**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/render/pixel/protoMap.test.ts`
Expected: FAIL; the log holds one line per missed colour, `<out> <- shade(<base>, <f>)`, `<out> <- mix(<a>, <b>, <t>)` or `<out> <- literal` (`describeMiss(m: string, recs: readonly DerivedRecord[]): string` is a helper of the test file).

- [ ] **Step 3: Add the entries**

Write one entry per missed colour, keys sorted, lower case, by its log line (§6.5 "Derived colours" item 2, with the step 1.18 in place of `SHADE_STEP`):
1. `<- literal`: the proposal rule of §6.4 "How it is made" item 2 (inside the hue family of §6.5, the ramp whose tones keep the order of lightness, the tone of nearest lightness). Write these entries first.
2. `<- shade(base, f)`: `tone(B, −Math.round(Math.log(f) / Math.log(1.18)))`, where `B` is the slot name of the base (`COLOUR_MAP[base]`, else `SLOT_NAMES[slotOf(base)]`). `tone` takes positive steps toward dark (Task 3), and `f > 1` lightens, so the step count is negated; `tone` clamps to the ramp and stops at `i2` on the `i` ramp.
3. `<- mix(a, b, t)`: the ramp of the slot of `a` when `t < 0.5`, else of `b`, at the tone of nearest lightness to the output.
4. When two records give one output from different bases, use the record whose base comes first in `COLOUR_MAP` key order (the sorted keys; §6.5 item 3).
No entry names `i3` (the palette test checks it).

- [ ] **Step 4: Run the test to see it pass**

Run: the command of Step 2 and `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/render/pixel/palette.test.ts tests/unit/render/safeColours.test.ts`. Expected: PASS. Then the Global gates.

- [ ] **Step 5: Stage**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; git add -A`. Then Task 1 Step 6b.

---

### Task 16: Rides and track sheet

**Files:**
- Create: `tests/unit/render/pixel/protoKit.ts` (helper, not a test file), `tests/unit/render/pixel/protoSheet.test.ts`
- Output: `$PROTO/out/sheet-rides-track.png`

**Interfaces:**
- Consumes: `buildSprite`, `artBuildLog` (Task 5); `SLOT_RGBA` (Task 3); `drawRideArt`, `rideArtBounds` (`rides.ts`); `FLAT_RIDES` (`src/data/catalog/flatRides.ts:19`); `TrackLayer` (`src/render/track/layer.ts`), `buildR1` (`tests/unit/track/helpers.ts:88`), `executeCommand` (`src/sim/commands`), `runTicks` (`tests/helpers/world.ts`); `install`, `FakeCanvas` (`tests/unit/render/fakeCanvas.ts`).
- Produces, `protoKit.ts`:
  - `writePng(path: string, w: number, h: number, rgba: Uint8Array): void` (RGBA, 8 bit, filter 0, `node:zlib` `deflateSync`, CRC32 in the file; the signature of stage 1a-ii's `png.ts`).
  - `interface SheetSprite { label: string; surface: PixelSurface; x: number; y: number }` and `buildSheetSprites(): { rides: SheetSprite[]; track: Array<{ rot: 0 | 1; slices: SheetSprite[]; cars: SheetSprite[]; other: SheetSprite[] }> }`. Labels: a ride's label is its catalog id; a track sprite's label is `slice`, `car` or `other` with the `ref` of its item (for example `car 3`). Classification: the sink records the `sub` of each pushed item (the 3rd argument of `DrawSink.push`, `layer.ts:99`); for each item, the helper notes `draws.length` before and after its `drawItem(ctx, ref, sub)` call, and the new `draws` entries go to `slices` when `sub` is 0 (`SUB_SLICE`, `layer.ts:87`), to `cars` when `sub` is 2 (`SUB_CAR`, `layer.ts:89`), and to `other` for every other `sub` (chain, gate booth, water). The two constants are private: the helper writes the numbers with a comment that names `layer.ts:87-91`. `cars` counts draws, not distinct surfaces (`drawCar` reuses one cached sprite for cars with the same pose). Rides are the 18 `FLAT_RIDES` at frame 0 (`angle 0`, `swing 0`, `occupancy 0`), rotation 2, each a surface from `buildSprite(rideArtBounds(id, w, d, 2), 0.5, (c) => drawRideArt(c, id, w, d, st))` read from `artBuildLog.surfaces`; track is R1 (`buildR1`, the pieces of `tests/e2e/screenshot.spec.ts:56-73`, chain pieces included) with `setTrainConfig` 1 train of 4 cars, `startTestRun` and `runTicks(world, 600)`, collected by a `TrackLayer` with `collect(world, sink, bigView, 0.5, 0.5, 0, 0, 0, rot)` for `rot` 0 and 1, then `drawItem` on a `FakeCanvas` context for each item in depth order. `drawSlice` builds at most 20 slices per `collect` (`MAX_SLICE_BUILDS_PER_FRAME`, the count resets in `collect`, `layer.ts:496`), and `drawCar` at most 32 cars, so the helper repeats `collect` and `drawItem` until a pass adds no entry to `artBuildLog.surfaces`. The last pass builds nothing, so it logs no surface: keep one `Map` from `image` to `surface` over all passes (from every `artBuildLog.surfaces` entry), and compose the `draws` of the last pass (the `FakeCanvas` `draws` list: call `reset()` before each pass, so after the loop the list holds the last pass), each with the surface that the map gives for its `image`, at its place `(x, y)` in art pixels. A `draws` entry whose `image` is not in the map is an error (the test fails). `setArtStyle('pixel')` runs before `collect` (§11.3).
  - Task 21 adds more exports to this file.
- Sheet layout (decision): background slot `g2`; 2 sheet pixels per art pixel (§8.6 item 1, `n = 2`); top part: the 18 rides in catalog order, 6 per row, each cell the size of the largest ride image; bottom part: the two track views side by side, each the assembled coaster with its train. No text (no font in Node); the stage 0 report lists the cell order.

- [ ] **Step 1: Write the sheet test**

```ts
// tests/unit/render/pixel/protoSheet.test.ts
describe.skipIf(!process.env.TC_PIXEL_SHEET || !process.env.TC_PROTO_OUT)('stage 0 sheet', () => {
  it('writes sheet-rides-track.png', () => {
    const { rides, track } = buildSheetSprites();
    expect(rides.map((r) => r.label)).toEqual(FLAT_RIDES.map((d) => d.id));
    expect(rides.length).toBe(18);
    expect(track.map((t) => t.rot)).toEqual([0, 1]);
    for (const t of track) {
      expect(t.slices.length).toBeGreaterThan(30);
      expect(t.cars.length).toBe(4);
    }
    // compose (rides, then each view's other, slices and cars in draw order); writePng(`${TC_PROTO_OUT}/sheet-rides-track.png`, …)
  });
});
```

- [ ] **Step 2: Run it (§11.4 line 881)**

```bash
set -e
PROTO=/tmp/tc-phase8-proto
cd "$PROTO/wt"
TC_PROTO_OUT="$PROTO/out" TC_PIXEL_SHEET=1 npx vitest run tests/unit/render/pixel/protoSheet.test.ts
```

Expected: PASS; `file "$PROTO/out/sheet-rides-track.png"` prints "PNG image data".

- [ ] **Step 3: Check the picture (kill rule 5 evidence)**

Open the PNG (Read tool). Check: every ride is drawn with an ink outline; the carousel is the twin; the other 17 rides use the primitive twins; on both track views, look at every tile join of the rails at 4× zoom (crop with `writePng` of a region if needed, to `$PROTO/scratch/`). Record in `$PROTO/out/kill5-notes.md`: for each view, "ink across a rail at a join: yes/no (where)", "gap in a rail: yes/no (where)".

- [ ] **Step 4: Stage**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; git add -A`. Then Task 1 Step 6b.

---

### Task 17: Classic op lists and the recorder tests (kill rule 6)

**Files:**
- Create: `tests/unit/render/pixel/classicOps.test.ts`
- Output: `$PROTO/out/classic-ops-*.json`, `$PROTO/out/base/classic-ops-*.json`

**Interfaces:**
- Consumes (Classic only; the file imports nothing under `src/render/pixel/`, because the same file runs on the base commit): `Recorder` (`tests/unit/render/content/recorder.ts`); `drawRideArt` (`rides.ts:471`), `drawStallArt` (`stalls.ts:152`), `drawSceneryArt` (`src/render/scenery/art/index.ts:51`), `drawPathItemArt` (`src/render/sprites/litter.ts:150`), `drawGuestArt` (`props.ts:140`), `SHIRT_COLOURS` (`src/render/palette.ts:52-65`), `SKIN_TONES`, `HAIR_COLOURS` (`shapes.ts:200-201`).
- Produces: one file per object, `classic-ops-<name>.json` = `{ "name": string, "ops": number, "hash": string }`. Each object has one or more op lists (one `Recorder` per call, in the order below). `ops` = the sum of the lengths of its lists. `hash` = FNV-1a 32 bit (offset `0x811c9dc5`, prime `0x01000193`, `Math.imul`, over the UTF-16 code units) of the text made of every list as `recorder.ops.join('\n')`, the lists joined with `'\n--\n'`, written as 8 lower-case hex digits. Names: `carousel`, `big_wheel` (each at `angle` 0 and 0.3, rotation 0 to 3, occupancy 2; one file per ride holding all its lists in order), `snack_shack` (rotation 0 to 3), the 6 scenery ids (facing 0 to 3, `wilted` false, `part` 0, `edge` −1, footprint 1 × 1), `bench` and `lamp` (`drawPathItemArt(ctx, ITEM_BENCH or ITEM_LAMP, side 0 to 3, 0, false)`, `litter.ts:16, 18`), `guest` (facing 0 to 3 × `walk` 0 to 3, shirt `SHIRT_COLOURS[0]`, skin and hair index 0, ring `null`, and one case with ring step 8).
- The test skips unless `TC_PROTO_OUT` is set.

- [ ] **Step 1: Write the test**

```ts
// tests/unit/render/pixel/classicOps.test.ts (shape; the object list is the Produces line above)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Recorder } from '../content/recorder';
// + drawRideArt, drawStallArt, drawSceneryArt, drawPathItemArt, ITEM_BENCH, ITEM_LAMP, drawGuestArt, SHIRT_COLOURS, SKIN_TONES, HAIR_COLOURS

const OUT = process.env.TC_PROTO_OUT;
const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
};
const lists = (calls: Array<(r: Recorder) => void>): string[][] => calls.map((c) => { const r = new Recorder(); c(r); return r.ops; });
const write = (name: string, ls: string[][]): void => {
  for (const l of ls) expect(l.length, name).toBeGreaterThan(0);
  const ops = ls.reduce((n, l) => n + l.length, 0);
  writeFileSync(join(OUT as string, `classic-ops-${name}.json`), JSON.stringify({ name, ops, hash: fnv(ls.map((l) => l.join('\n')).join('\n--\n')) }) + '\n');
};

describe.skipIf(!OUT)('Classic op lists (kill rule 6)', () => {
  it('writes the 12 files', () => {
    mkdirSync(OUT as string, { recursive: true });
    // carousel: for angle of [0, 0.3], for rotation of [0, 1, 2, 3]: drawRideArt(r.ctx(), 'carousel', 3, 3, { rotation, angle, swing: 0, occupancy: 2 })
    // ... one write() per name of the Produces line, lists in the stated order
  });
});
```

The comment lines name the calls; every call of the Produces line is one list. The file imports nothing under `src/render/pixel/`.

- [ ] **Step 2: Run the commands of §11.4 lines 891-894**

```bash
set -e
PROTO=/tmp/tc-phase8-proto
cd "$PROTO/wt"
mkdir -p "$PROTO/base/tests/unit/render/pixel" && cp tests/unit/render/pixel/classicOps.test.ts "$PROTO/base/tests/unit/render/pixel/"
TC_PROTO_OUT="$PROTO/out" npx vitest run tests/unit/render/pixel/classicOps.test.ts
(cd "$PROTO/base" && TC_PROTO_OUT="$PROTO/out/base" npx vitest run tests/unit/render/pixel/classicOps.test.ts)
for f in "$PROTO"/out/base/classic-ops-*.json; do cmp "$f" "$PROTO/out/$(basename "$f")" || true; done
```

Expected: both runs PASS; `ls "$PROTO"/out/classic-ops-*.json | wc -l` and `ls "$PROTO"/out/base/classic-ops-*.json | wc -l` both print 12; the `cmp` loop prints nothing (11.7 line 3).

- [ ] **Step 3: Run the recorder tests (§11.4 line 896)**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/render/content/art.test.ts tests/unit/render/content/phase6Art.test.ts tests/unit/scenery/art.test.ts tests/unit/render/track/slices.test.ts`
Expected: PASS (11.7 line 4).

- [ ] **Step 4: Run the whole unit suite in the worktree**

```bash
set -e
PROTO=/tmp/tc-phase8-proto
cd "$PROTO/wt"
npx vitest run 2>&1 | tee "$PROTO/suite-17.log" | tail -15
grep -E "^ *(FAIL|×) " "$PROTO/suite-17.log" | sed -E 's/ +[0-9]+ms$//' | sort -u > "$PROTO/suite-17.txt" || true
comm -23 "$PROTO/suite-17.txt" "$PROTO/baseline-full.txt"
```

Expected: the `comm` line prints nothing (no failure that is not in the baseline of Task 1 Step 4). (The block runs in `$PROTO/wt` by its prefix; a write outside the worktree shows in Step 6b, not in the main checkout's status, which other agents change.) A failure that is also in `baseline-full.txt` existed on the base code or comes from the environment: it is not a Classic change; list it in `$PROTO/out/baseline-notes.md`. A failure that `comm` prints in a file outside `tests/unit/render/pixel/` is a Classic change: repair the branch (§5.4), then repeat Steps 2 to 4. A failure that `comm` prints in a file inside `tests/unit/render/pixel/` (a prototype test) is a fault of the prototype task that owns that test: repair it in that task's files, then repeat Steps 2 to 4.

- [ ] **Step 5: Stage**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; git add -A`. Then Task 1 Step 6b.

---

### Task 18: Probe and perf spec changes

**Files:**
- Modify: `src/render/renderer.ts` `collectRides` (`:454`): time the `bank.ride` call; `draw`: the probe
- Modify: `tests/e2e/perf-build3.spec.ts` `at(rot)` (`:255`) and the `[perf]` line (`:271-274`)
- Test: `tests/unit/render/pixel/probe.test.ts`

**Interfaces:**
- Consumes: `artBuildStats` (Task 5, 9).
- Produces, renderer probe (§11.3 `renderer.ts` row): in Pixel, each frame sets `window.__pixelStats = artBuildStats` (the same object, when `typeof window !== 'undefined'`), so its keys are `spriteBuildMsMax`, `chunkBuildMsMax`, `turnFrameMsMax`, `rideBuildMsMax`, `spriteMb`, `chunkMb`. The renderer writes: `rideBuildMsMax`, the slowest `bank.ride` call at `:454` (a cache hit costs about 0; a prototype key, because kill rule 4 names ride builds); `turnFrameMsMax`, the largest frame interval in the 30 frames after a frame whose `rot` changed: at the start of each `draw`, `t = performance.now()`; the interval is `t` minus the `t` of the previous `draw` start (no interval on the first `draw`). The turn draw is the first `draw` whose `rot` differs from that of the draw before it; the intervals that count are those that end at the starts of the 30 draws after the turn draw (the first of them holds the turn draw itself). This is the frame measure of `perf-build3.spec.ts` (`runFor`, `:99`: the interval between two `requestAnimationFrame` timestamps; the `turns: longest frame` text, `:263-273`), so it holds the whole frame (style, layout, paint, compositing, garbage collection and work outside `draw`), as §11.3 ("the slowest frame after a view turn") and §10.2 (`TURN_FRAME_MAX_MS`) ask. The time of the `draw` body alone is not this measure; `spriteMb = bank.cache.pixels × 4 / 1048576` and `chunkMb = terrain.pixels × 4 / 1048576` (as `drawDebug`, `renderer.ts:884`). Reset: the e2e spec writes 0 to the four `…Max` keys of `window.__pixelStats`; that is the same object, so the maxima start again.
- Produces, `perf-build3.spec.ts` (§13.2 stage 1b row, §11.3): when `#game[data-art]` is `'pixel'`, `at(rot)` uses `Number(#game[data-home-zoom])`, read after the quality set (`:258`) and two `requestAnimationFrame` round trips; the `[perf]` line ends with `; zoom ${data-zoom}, n ${data-art-scale ?? 'n/a'}`. The text `canvas ratio ${ratio}:` does not change (11.7 line 2 greps it).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/render/pixel/probe.test.ts (cases)
it('the probe fills __pixelStats in Pixel', () => {
  // globalThis.window = {} as never for the case (delete it after); Pixel renderer as in Task 8, two frames
  // window.__pixelStats has the 6 keys, all finite and >= 0; spriteMb > 0; chunkMb > 0
});
it('a view turn sets turnFrameMsMax', () => {
  // reset the maxima to 0; turn cam.rotation; draw 3 frames: turnFrameMsMax > 0
});
it('turnFrameMsMax is the interval between draw starts, not the draw time', () => {
  // vi.spyOn(performance, 'now') returns a counter that the test sets: draw at t = 0 (rot 0), t = 100 (rot 1, the turn),
  // t = 150, t = 400 (each draw call reads the clock; the spy returns the set value for every call within one draw)
  // after the 4th draw: turnFrameMsMax === 250 (400 − 150); a draw-body time would be 0 here
});
it('Classic sets no __pixelStats', () => {
  // globalThis.window = {} as never for the case (delete it after); Classic renderer as in Task 8, two frames
  expect((globalThis.window as unknown as { __pixelStats?: unknown }).__pixelStats).toBeUndefined();
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/render/pixel/probe.test.ts`. Expected: FAIL (`__pixelStats` undefined).

- [ ] **Step 3: Implement the probe and the two perf spec changes**

- [ ] **Step 4: Run the test to see it pass**

Run: the command of Step 2 and the Global gates.

- [ ] **Step 5: Check the perf spec in Classic (short run)**

```bash
set -e
PROTO=/tmp/tc-phase8-proto
cd "$PROTO/wt"
PW_PORT=4396
test "$(lsof -nP -iTCP:$PW_PORT -sTCP:LISTEN -t | wc -l)" -eq 0 || { echo "port $PW_PORT busy"; exit 1; }; echo free
PW_PORT=$PW_PORT TC_PERF=1 TC_PERF_SECONDS=3 TC_PERF_WARMUP=2 npx playwright test tests/e2e/perf-build3.spec.ts --project=desktop --workers=1 -g "scene build2"
```

Expected: `free`; PASS; the `[perf]` line holds `canvas ratio 1:` and ends with `zoom 1.000, n n/a`.

- [ ] **Step 6: Stage**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; git add -A`. Then Task 1 Step 6b.

---

### Task 19a: Scene, save and the pictures (kill rule 1 evidence)

**Files:**
- Modify: `tests/e2e/helpers.ts`: new `newParkAt(page: Page, query: string, name: string): Promise<void>` after `newPark` (`:23-33`): `page.goto('/' + query)`, then the title steps of `newPark`. `newPark` does not change.
- Create: `tests/e2e/pixelProto.spec.ts` (this task writes the test `pictures`; Task 19b adds the test `measures and grid` to the same file)
- Output: `$PROTO/out/before-desktop.png`, `after-desktop.png`, `before-phone.png`, `after-phone.png`, `strip-desktop.png`, `$PROTO/out/e2e/save-desktop.txt`, `$PROTO/out/e2e/save-phone.txt`

**Interfaces:**
- Consumes: `planStretch` (Task 6, imported from `src` in Node); `#game` attributes `data-art`, `data-stretch`, `data-home-zoom`, `data-zoom`, `data-complete`, `data-device` (Tasks 7, 8).
- Produces, in `pixelProto.spec.ts` (module helpers, used again by Task 19b): `loadSave(page: Page, art: 'pixel' | 'classic', save: string): Promise<void>`; `prepareView(page: Page): Promise<void>` (§11.2 item 8, below); `centreOnCarousel(page: Page, rot: number, zoom: number): Promise<void>`; `waitComplete(page: Page, frames: number): Promise<void>` (waits for `data-complete="1"`, which Task 8 writes in both styles, so it also serves the Classic "before" page; then `frames` animation frames); `OUT = process.env.TC_PROTO_OUT`.
- Produces, `$PROTO/out/e2e/save-<project>.txt`: the text of `localStorage['tc.save.1']` after the build. Task 19b loads it, so the measures and the grid check run on the same save as the pictures.
- The spec skips unless `TC_PROTO_OUT` is set. Before it writes a file, it calls `mkdirSync(join(OUT, 'e2e'), { recursive: true })`. Timeout 600 s per test.
- Produces, the reuse switch (for Task 19c Step 3): when `process.env.TC_PROTO_REUSE_SAVE === '1'`, the test `pictures` skips item 1 (no new park, no save) and uses the text of `${OUT}/e2e/save-<project>.txt` (it fails at once when the file is absent); items 2 to 5 do not change. Unset, item 1 runs as below. Why: a new park gets `randomSeed()` (§11.2), so a second build would give the pictures another map than the measures of Task 19b.

**Scene (decision: the coordinates; the steps are §11.2):** classic 64 × 64 map (`newParkAt` presses `title-size-64`). `setSpeed(0)`; `borrow` 1 000 000 (as `tests/e2e/screenshot.spec.ts:44`). Footpath cross from (31, 44) (decision: 12 tiles north, west and east, and 15 tiles south to the park entrance road at (31, 59), so the cross joins the entrance; §11.2 item 2 says 12 each way): `buildPathLine` (31, 59)→(31, 32) and (19, 44)→(43, 44); exit road (20, 50)→(31, 50). `big_wheel` at (21, 46) and `carousel` at (26, 46), rotation 2; `buildPath` kind `queue` at each `ride.entrance.outside` and `footpath` at each `ride.exit.outside` (as `tests/e2e/overview-build4.spec.ts:38-50`); `setRideOpen`. `snack_shack` at (24, 43), rotation 2. `placeScenery` rotation 2, edge −1: `oak_round` (34, 46), `pine_tall` (36, 46), `birch_silver` (38, 46), `shrub_round` (34, 48), `bed_mixed` (36, 48), `fountain_garden` (38, 48). `buildPathItem` `bench` at (29, 44) and (35, 44), `lamp` at (33, 44). `setParkOpen`; `step(6000)`; `setSpeed(0)`. Every dispatch must return `ok`, else the test fails.

**Camera centre (`centreOnCarousel`):** the map point (27.5, 47.5) (the carousel centre), `h = map.heights[47 × N + 27]`, `N = map.width`. The view point `(u, v)` of a map point `(x, y)` by rotation `r`: r 0 → `(x, y)`; r 1 → `(N − y, x)`; r 2 → `(N − x, N − y)`; r 3 → `(y, N − x)` (the table of `perf-build3.spec.ts:109` for a point, not a tile). Then `camera.rotation = r`, `camera.zoom = zoom`, `camera.centerX = (u − v) × 32`, `camera.centerY = (u + v) × 16 − h × 8`. Do not copy the tile formula `(u + v + 1) × 16` of `perf-build3.spec.ts:113`: it aims at a tile centre and moves the point 16 world pixels.

**`prepareView` (§11.2 item 8):** clock to 12:00 as `clockTo` in `tests/e2e/afterDark.spec.ts:38-49`, weather `sunny`, `setAfterDark` off, `tool.overlay` none, no tool, no selection; the pointer outside the canvas: `page.mouse.move(0, 0)` (inside the `#game` box, which fills the viewport from the top left), then `page.dispatchEvent('#game', 'pointerleave', { pointerType: 'mouse' })`, so the canvas runs `ctl.hoverOut()` (`src/input/index.ts:88-90`); then `step(100)` up to 40 times until every ride has status `'open'`, else fail. Last, assert `__tc.tool.hoverTile === null` (the hover outline, `renderer.ts:863-867`, is a vector line at 1.5 × scale and would break the pictures and the grid check). Every capture (Task 19a items 3 and 4) and every grid check (Task 19b item 3) asserts `__tc.tool.hoverTile === null` again just before it.

- [ ] **Step 1: Write the test `pictures`**

One test per project, one page, in this order:
1. **Build** (§11.2 items 1 to 7; skipped with `TC_PROTO_REUSE_SAVE=1`, Interfaces): `newParkAt(page, '?art=classic', 'Proto Park')`, the scene above, then save to slot 1 through the menu (`openTool(page, 'menu')`, `menu-save`, `slot-1`; toast "Park saved to slot 1", as `tests/e2e/keyboard.spec.ts:100-109`), then read `localStorage['tc.save.1']` and write it to `${OUT}/e2e/save-<project>.txt`.
2. **Load** (`loadSave`): `page.goto('/?art=…')`, set the save text, reload, press `title-continue` (as `tests/e2e/perf-build3.spec.ts:73-85`).
3. **"After" page** (`/?art=pixel`), loaded first because the "before" page uses its home level: assert `#game[data-art="pixel"]` (Review Focus 1); `__tc.settings.set('renderQuality', 'high')`; wait until `data-stretch` equals `String(planStretch(dpr, device, false))`; `prepareView`; `centreOnCarousel(page, 0, Number(data-home-zoom))`; `waitComplete(page, 2)`; `page.screenshot` → `after-<project>.png`. Check: `canvas.width === Math.ceil(document.documentElement.clientWidth × dpr / k)` and `canvas.height === Math.ceil(document.documentElement.clientHeight × dpr / k)`, and neither changes over 10 frames (the box does not feed back into the plan).
4. **"Before" page** (`/?art=classic`): `loadSave` with the same save, `renderQuality` `high`, `prepareView`, `centreOnCarousel(page, 0, z)` with `z` the "after" home level (the same zoom number); `waitComplete(page, 2)`; `before-<project>.png`.
5. **Strip** (desktop only): in the page, draw into a 1920 × 400 canvas: the 640 × 400 crop at (320, 200) of `before-desktop.png`, the same crop of `after-desktop.png`, and the 640 × 400 crop at (320, 180) of `docs/screenshots/phase-7-draft-desktop.png` (decision: that crop holds the plaza, the big wheel, a stall and the carousel roof, and the card hand covers least of it); `toDataURL('image/png')` → `strip-desktop.png`.

- [ ] **Step 2: Run it (§11.4 line 880, the `pictures` part)**

```bash
set -e
PROTO=/tmp/tc-phase8-proto
cd "$PROTO/wt"
PW_PORT=4391
test "$(lsof -nP -iTCP:$PW_PORT -sTCP:LISTEN -t | wc -l)" -eq 0 || { echo "port $PW_PORT busy"; exit 1; }; echo free
TC_PROTO_OUT="$PROTO/out" PW_PORT=$PW_PORT npx playwright test tests/e2e/pixelProto.spec.ts --project=desktop --project=phone --workers=1 -g "pictures"
ls "$PROTO"/out/before-*.png "$PROTO"/out/after-*.png "$PROTO/out/strip-desktop.png" "$PROTO"/out/e2e/save-*.txt
```

Expected: `free`; 2 passed; `ls` lists the 5 PNG files and the 2 save files.

- [ ] **Step 3: Check the pictures (kill rule 1 evidence)**

Open `after-desktop.png`, `after-phone.png`, `before-desktop.png`, `strip-desktop.png` (Read tool). Check: the after pictures show square art pixels, an ink outline on the carousel, the guest stamps and the shadows; the before pictures show today's look; the strip holds three crops of 640 × 400. Write what you see, one line per picture, into `$PROTO/out/kill1-notes.md`.

- [ ] **Step 4: Stage**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; git add -A`. Then Task 1 Step 6b.

---

### Task 19b: Measures and the grid check (kill rules 2 and 4)

Start condition: the controller starts this task only when no other agent runs tests on this machine (Global Constraints).

**Files:**
- Modify: `tests/e2e/pixelProto.spec.ts` (add the test `measures and grid`)
- Output: `$PROTO/out/e2e/numbers-desktop.json`, `$PROTO/out/e2e/numbers-phone.json`

**Interfaces:**
- Consumes: `loadSave`, `prepareView`, `centreOnCarousel`, `waitComplete`, `save-<project>.txt` (Task 19a); `zoomLevels`, `makeGrid` (Task 6, imported from `src` in Node, the e2e level rule of §13.3); `window.__pixelStats` (Task 18); `#game` attributes `data-art`, `data-art-scale`, `data-stretch`, `data-home-zoom` (Task 7), `data-zoom`, `data-complete`, `data-device` (Tasks 7, 8).
- Produces, `numbers-<project>.json`: `{ "spriteBuildMsMax", "chunkBuildMsMax", "chunkBuildMsMaxLoad", "turnFrameMsMax", "rideBuildMsMax", "spriteMb", "chunkMb", "homeZoom", "stretch", "loadavgBefore", "loadavgAfter", "gridLevels": [{ "zoom", "n", "ok", "badRuns" }] }`. `chunkBuildMsMaxLoad` is `chunkBuildMsMax` read before the reset (the cold chunk builds of the first view after the load); `chunkBuildMsMax` is the value after the 4 turns. On desktop the turned views are prefetched in idle frames (`prefetchTurns`, `renderer.ts:907`; `prefetchTurn`, `:973-986`), so the desktop after-turn value can be near 0: the report gives it as "after prefetch" and uses `chunkBuildMsMaxLoad` as the desktop chunk build measure (Prototype decision 21). On the phone `prefetchTurns` is false. `loadavgBefore` and `loadavgAfter` are the text of `/proc/loadavg` read by the test (Node `readFileSync`) before the load and after the measures. One file per project (decision): Task 21 merges both files into `numbers.json`.
- Produces, the profile switch (for Task 19c Step 2; Prototype decision 24): when `process.env.TC_PROTO_TRACE` is set (a folder), the phone part of item 2 runs, on the CDP session of the throttle (`const cdp = await page.context().newCDPSession(page)`), `await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');` before the 4 turns, and after them `const { profile } = await cdp.send('Profiler.stop');` and `writeFileSync(join(process.env.TC_PROTO_TRACE, 'turn-profile.cpuprofile'), JSON.stringify(profile))`. Unset, the test does not profile. Why not a Playwright trace: a trace holds actions, network, console and screenshots, but no JavaScript CPU samples, so it cannot name a function, and `show-trace` is a window that a headless session cannot use.

- [ ] **Step 1: Write the test `measures and grid`**

One test per project, one page. It fails at once when `save-<project>.txt` is absent ("run Task 19a first").
1. **Load:** `loadSave(page, 'pixel', save)`; assert `#game[data-art="pixel"]` (Review Focus 1); `renderQuality` `high`; wait for the `data-stretch` of Task 19a Step 1 item 3; `prepareView`; `centreOnCarousel(page, 0, Number(data-home-zoom))`; `waitComplete(page, 2)`.
2. **Measures:** phone only: `Emulation.setCPUThrottlingRate` rate 4 through a CDP session. Read `__pixelStats.chunkBuildMsMax` as `chunkBuildMsMaxLoad`. Reset the four maxima of `__pixelStats` to 0. Turn the view 4 times: `centreOnCarousel(page, r, home)` for `r` 1, 2, 3, 0; after each, `waitComplete(page, 30)` (with `TC_PROTO_TRACE` set, the 4 phone turns run inside the CPU profile of the Interfaces). Read `__pixelStats`. Phone: rate 1. Keep the values with `homeZoom`, `stretch` and the two `loadavg` texts.
3. **Grid check** (kill rule 2): for each level of `zoomLevels(makeGrid(dpr, device, false))` with `soft` false: `__tc.camera.zoom = level.zoom`, wait for `data-zoom === level.zoom.toFixed(3)`, then `waitComplete(page, 2)`; assert `__tc.tool.hoverTile === null`; then in the page `getImageData` of the whole canvas: every horizontal and every vertical run of one RGBA value that touches no canvas edge has a length that is a multiple of `level.n`. Also check `data-stretch = k`, `canvas.width === Math.ceil(cssW × dpr / k)` and `canvas.height === Math.ceil(cssH × dpr / k)` (`cssW`, `cssH` = `document.documentElement.clientWidth`, `clientHeight`), the box width `canvas.width × k / dpr` and the box height `canvas.height × k / dpr` (each ±0.01 CSS px, from `getBoundingClientRect()`), computed `image-rendering` `pixelated` (§7.1 item 3: the backing size and the box size, both axes). Record `{ zoom, n, ok, badRuns }` (up to 10 bad runs with x, y, length).
4. **Write** `${OUT}/e2e/numbers-<project>.json` (also when a level fails), then fail the test when one level has `ok` false.

- [ ] **Step 2: Run it**

```bash
set -e
PROTO=/tmp/tc-phase8-proto
cd "$PROTO/wt"
quiet() { …the function of the Global Constraints "Load gate"… }
quiet
PW_PORT=4397
test "$(lsof -nP -iTCP:$PW_PORT -sTCP:LISTEN -t | wc -l)" -eq 0 || { echo "port $PW_PORT busy"; exit 1; }; echo free
TC_PROTO_OUT="$PROTO/out" PW_PORT=$PW_PORT npx playwright test tests/e2e/pixelProto.spec.ts --project=desktop --project=phone --workers=1 -g "measures and grid"
cat "$PROTO/out/e2e/numbers-desktop.json" "$PROTO/out/e2e/numbers-phone.json"
```

Write the body of `quiet` in full (the `…` line stands for it). The block can run longer than 30 minutes (the gate, the build, then two tests of up to 600 s each): run it with `run_in_background` and `timeout: 7200000`, and wait for it to end. Expected: `quiet`; `free`; 2 passed; both JSON files print. With `--workers=1` the desktop test and the phone test run one after the other, so the throttled phone measures share the CPU with no other test of this plan; the load gate and the `loadavg` values show that no other run shared it.

- [ ] **Step 3: Read kill rules 2 and 4**

Kill rule 2: every `gridLevels` entry of both files has `ok` true. Kill rule 4: in `numbers-phone.json`, `chunkBuildMsMax <= 12` and `rideBuildMsMax <= 3` (§10.2; the throttled after-turn values; `chunkBuildMsMaxLoad` is taken before the throttle and does not count here). Write both results with the values, `loadavgBefore` and `loadavgAfter` of both files into `$PROTO/out/kill2-4-notes.md`. When kill rule 2 fires, stop the plan and report to the controller (the grid is wrong; §11.6 says repair and repeat stage 0). When kill rule 4 fails: first copy `numbers-phone.json` to `$PROTO/out/e2e/numbers-phone.first-run.json` and run the block of Step 2 once more (the load gate waits for a quiet window; the same `run_in_background` and `timeout: 7200000`); the values of the repeat run decide; write both runs into `kill2-4-notes.md`. When kill rule 4 still fails, do Task 19c. Else skip Task 19c.

- [ ] **Step 4: Stage**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; git add -A`. Then Task 1 Step 6b.

---

### Task 19c: One tuning round (only when kill rule 4 fails in Task 19b)

Start condition: the controller starts this task only when no other agent runs tests on this machine (Global Constraints).

**Files:**
- Modify: only files under `src/render/pixel/` and the Pixel branches of `src/render/terrain.ts` (`build`) and `src/render/canvas.ts` (`buildSprite`)
- Scratch (deleted before Step 5's `git add -A`): `tests/unit/render/pixel/protoHashes.test.ts`
- Output: `$PROTO/out/e2e/numbers-phone.before-tuning.json`, a new `$PROTO/out/e2e/numbers-phone.json`, `$PROTO/out/tuning-notes.md`

- [ ] **Step 1: Keep the first numbers**

```bash
set -e
PROTO=/tmp/tc-phase8-proto
cd "$PROTO/wt"
cp "$PROTO/out/e2e/numbers-phone.json" "$PROTO/out/e2e/numbers-phone.before-tuning.json"
```

- [ ] **Step 1b: Record the pixels before the change**

The tests of Tasks 4 to 14 compare hashes with each other, not with fixed values, so they do not show a pixel change. This step records the sheet and the scene's ground chunks before the change. Write `tests/unit/render/pixel/protoHashes.test.ts` (skipped unless both `TC_PROTO_HASHES` and `TC_PROTO_SAVE` are set; deleted in Step 5 before `git add -A`): it reads the save text from the file `process.env.TC_PROTO_SAVE` (the block passes `$PROTO/out/e2e/save-phone.txt`; Vitest has no `PROTO` variable), calls `deserialize(text)` (`src/save/index.ts:46`; the result `{ ok: true, world }`, `src/save/codec.ts:14`; the test fails when `ok` is false), takes `world.state.map` and its terrain env as `ground.test.ts` does, and writes to the file `process.env.TC_PROTO_HASHES` one line `cx cy r hash` per chunk `cx` 2 to 5, `cy` 4 to 7 and view rotation `r` 0 to 3 (8-tile chunks, `CHUNK_SIZE`, `src/render/terrainTracker.ts:14`: the scene of Task 19a spans tiles x 19 to 43 and y 32 to 59, so chunk row 4, tiles y 32 to 39, holds the north leg of the footpath cross) (each chunk painted as `ground.test.ts` `paint` does, with `setArtStyle('pixel')`).

```bash
set -e
PROTO=/tmp/tc-phase8-proto
cd "$PROTO/wt"
mkdir -p "$PROTO/scratch/pre"
TC_PROTO_OUT="$PROTO/scratch/pre" TC_PIXEL_SHEET=1 npx vitest run tests/unit/render/pixel/protoSheet.test.ts
sha256sum < "$PROTO/scratch/pre/sheet-rides-track.png" > "$PROTO/scratch/pre-sheet.sha256"
TC_PROTO_SAVE="$PROTO/out/e2e/save-phone.txt" TC_PROTO_HASHES="$PROTO/scratch/pre-hashes.txt" npx vitest run tests/unit/render/pixel/protoHashes.test.ts
wc -l < "$PROTO/scratch/pre-hashes.txt"
```

Expected: both runs PASS; the last line prints 64 (4 × 4 chunks × 4 rotations).

- [ ] **Step 2: Profile the slow build**

Take a CPU profile of the 4 phone view turns at throttle 4 with the profile switch of the test `measures and grid` (Task 19b Interfaces). The scratch output folder gets a copy of the saves, so the real `numbers-phone.json` is not overwritten. First write the summary script `$PROTO/scratch/top-self.cjs` (a tool of this step, not a source file): it sums the self time of each sample (`profile.samples[i]` is a node id of `profile.nodes`, `profile.timeDeltas[i]` its time in microseconds) per function, maps each bundle position to its source through the build's source map (`vite.config.ts` sets `build.sourcemap: true`; `source-map-js` is installed by `npm ci` as a dependency of Vite's PostCSS), because the build is minified and its function names are short letters, and prints the 15 largest:

```js
// $PROTO/scratch/top-self.cjs: node top-self.cjs <profile>, run with $PROTO/wt as the working directory
const fs = require('node:fs');
const path = require('node:path');
const { SourceMapConsumer } = require(require.resolve('source-map-js', { paths: [process.cwd()] }));
const p = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const maps = new Map();
const mapOf = (url) => {
  const file = path.join('dist', new URL(url).pathname.replace(/^\//, '') + '.map');
  if (!maps.has(file)) maps.set(file, fs.existsSync(file) ? new SourceMapConsumer(JSON.parse(fs.readFileSync(file, 'utf8'))) : null);
  return maps.get(file);
};
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const self = new Map();
p.samples.forEach((id, i) => {
  const c = byId.get(id).callFrame;
  let key = `${c.functionName || '(anonymous)'} ${c.url}:${c.lineNumber + 1}`;
  if (/^https?:/.test(c.url)) {
    const m = mapOf(c.url);
    const o = m && m.originalPositionFor({ line: c.lineNumber + 1, column: c.columnNumber });
    if (o && o.source) key = `${o.name || c.functionName || '(anonymous)'} ${o.source}:${o.line}`;
  }
  self.set(key, (self.get(key) || 0) + (p.timeDeltas[i] || 0) / 1000);
});
for (const [k, ms] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`${ms.toFixed(1).padStart(8)} ms  ${k}`);
```

```bash
set -e
PROTO=/tmp/tc-phase8-proto
cd "$PROTO/wt"
quiet() { …the function of the Global Constraints "Load gate"… }
quiet
mkdir -p "$PROTO/scratch/out/e2e"
cp "$PROTO"/out/e2e/save-*.txt "$PROTO/scratch/out/e2e/"
PW_PORT=4398
test "$(lsof -nP -iTCP:$PW_PORT -sTCP:LISTEN -t | wc -l)" -eq 0 || { echo "port $PW_PORT busy"; exit 1; }; echo free
TC_PROTO_TRACE="$PROTO/scratch" TC_PROTO_OUT="$PROTO/scratch/out" PW_PORT=$PW_PORT npx playwright test tests/e2e/pixelProto.spec.ts --project=phone --workers=1 -g "measures and grid" || true
ls -l "$PROTO/scratch/turn-profile.cpuprofile"
{ echo "## Self time of the 4 phone turns (CPU profile, throttle 4)"; node "$PROTO/scratch/top-self.cjs" "$PROTO/scratch/turn-profile.cpuprofile"; } | tee -a "$PROTO/out/tuning-notes.md"
```

Write the body of `quiet` in full. The block can run longer than 30 minutes (the gate, the build, one test of up to 600 s): run it with `run_in_background` and `timeout: 7200000`, and wait for it to end. Expected: `quiet`; `free`; 1 passed (or 1 failed only by a grid level, which Task 19b already recorded; the `|| true` lets the block go on to the profile); `turn-profile.cpuprofile` exists; 15 lines `<ms> ms  <function> <source>:<line>`, also in `tuning-notes.md`. The `dist` folder of this run is the one the profile was taken on, so run no build between the run and the script. Below the 15 lines, name in `tuning-notes.md` the slowest function of the slow build (chunk: `paintGroundChunk` and what it calls; ride: the carousel twin and the primitive twins) and the change you plan.

- [ ] **Step 3: Change the code, then compare the pixels**

Change only the files of this task's Files list. The change must not change a pixel. Run:

```bash
set -e
PROTO=/tmp/tc-phase8-proto
cd "$PROTO/wt"
npx vitest run tests/unit/render/pixel
mkdir -p "$PROTO/scratch/post"
TC_PROTO_OUT="$PROTO/scratch/post" TC_PIXEL_SHEET=1 npx vitest run tests/unit/render/pixel/protoSheet.test.ts
sha256sum < "$PROTO/scratch/post/sheet-rides-track.png" | cmp - "$PROTO/scratch/pre-sheet.sha256" && echo sheet-same
TC_PROTO_SAVE="$PROTO/out/e2e/save-phone.txt" TC_PROTO_HASHES="$PROTO/scratch/post-hashes.txt" npx vitest run tests/unit/render/pixel/protoHashes.test.ts
cmp "$PROTO/scratch/pre-hashes.txt" "$PROTO/scratch/post-hashes.txt" && echo chunks-same
```

Then the Global gates. Expected: PASS; `sheet-same`; `chunks-same`. When `sheet-same` or `chunks-same` does not print (a `cmp` before `&&` does not stop a `set -e` block), the tuning changed pixels: the pictures and the sheet no longer show the measured build. Then, after Step 4, run Task 16 Step 2 again, and Task 19a Steps 2 and 3 again with `TC_PROTO_REUSE_SAVE=1` added to the `npx playwright test` command of Task 19a Step 2 (the `pictures` test then loads `save-<project>.txt` and builds no new park, so the new pictures show the same map and guests as the measures of Step 4; Task 19a Interfaces), and record that in `tuning-notes.md`.

- [ ] **Step 4: Measure again**

Run the block of Task 19b Step 2 once more (port 4397, with its load gate; `run_in_background` and `timeout: 7200000`). Expected: 2 passed. Read kill rule 4 again. A second failure fires kill rule 4; do not tune again. Add the new values and the result to `$PROTO/out/kill2-4-notes.md` and `tuning-notes.md`.

- [ ] **Step 5: Stage**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; rm -f tests/unit/render/pixel/protoHashes.test.ts; git add -A`. Then Task 1 Step 6b.

---

### Task 20: Perf runs (kill rules 3, 3a)

**Files:** none. Output: `$PROTO/out/perf-classic.txt`, `perf-pixel-k2.txt`, `perf-pixel-k3.txt`, `perf-pixel-desktop.txt`.

- [ ] **Step 1: Run §11.4 lines 882-885, one block per run, each on a free port, with one worker**

Start condition: the controller starts this task only when no other agent runs tests on this machine (Global Constraints). Run the four blocks below one after the other, never in parallel. Each block has the prefix, `set -o pipefail`, the load gate, its port check right after the gate, its two `loadavg` lines and one run; write the body of `quiet` in full (the `…` line stands for it). Each block can run longer than 30 minutes (the gate waits up to 30 minutes, then the build and the run): run each with `run_in_background` and `timeout: 7200000`, and wait for it to end before the next. `perf-loadavg.txt` only grows (a repeated block adds its lines; the lines are in time order).

Block 1, Classic (§11.4 line 882):

```bash
set -e
set -o pipefail
PROTO=/tmp/tc-phase8-proto
cd "$PROTO/wt"
quiet() { …the function of the Global Constraints "Load gate"… }
quiet
PW_PORT=4392
test "$(lsof -nP -iTCP:$PW_PORT -sTCP:LISTEN -t | wc -l)" -eq 0 || { echo "port $PW_PORT busy"; exit 1; }; echo free
echo "classic before $(cat /proc/loadavg)" >> "$PROTO/out/perf-loadavg.txt"
PW_PORT=$PW_PORT TC_PERF=1 npx playwright test tests/e2e/perf-build3.spec.ts --project=desktop --project=phone --workers=1 | tee "$PROTO/out/perf-classic.txt"
echo "classic after $(cat /proc/loadavg)" >> "$PROTO/out/perf-loadavg.txt"
```

Block 2, Pixel `k = 2` (§11.4 line 883):

```bash
set -e
set -o pipefail
PROTO=/tmp/tc-phase8-proto
cd "$PROTO/wt"
quiet() { …the function of the Global Constraints "Load gate"… }
quiet
PW_PORT=4393
test "$(lsof -nP -iTCP:$PW_PORT -sTCP:LISTEN -t | wc -l)" -eq 0 || { echo "port $PW_PORT busy"; exit 1; }; echo free
echo "k2 before $(cat /proc/loadavg)" >> "$PROTO/out/perf-loadavg.txt"
VITE_ART=pixel TC_PERF_QUALITY=high PW_PORT=$PW_PORT TC_PERF=1 npx playwright test tests/e2e/perf-build3.spec.ts --project=phone --workers=1 | tee "$PROTO/out/perf-pixel-k2.txt"
echo "k2 after $(cat /proc/loadavg)" >> "$PROTO/out/perf-loadavg.txt"
```

Block 3, Pixel `k = 3` (§11.4 line 884):

```bash
set -e
set -o pipefail
PROTO=/tmp/tc-phase8-proto
cd "$PROTO/wt"
quiet() { …the function of the Global Constraints "Load gate"… }
quiet
PW_PORT=4394
test "$(lsof -nP -iTCP:$PW_PORT -sTCP:LISTEN -t | wc -l)" -eq 0 || { echo "port $PW_PORT busy"; exit 1; }; echo free
echo "k3 before $(cat /proc/loadavg)" >> "$PROTO/out/perf-loadavg.txt"
VITE_ART=pixel TC_PERF_QUALITY=low PW_PORT=$PW_PORT TC_PERF=1 npx playwright test tests/e2e/perf-build3.spec.ts --project=phone --workers=1 | tee "$PROTO/out/perf-pixel-k3.txt"
echo "k3 after $(cat /proc/loadavg)" >> "$PROTO/out/perf-loadavg.txt"
```

Block 4, Pixel desktop (§11.4 line 885):

```bash
set -e
set -o pipefail
PROTO=/tmp/tc-phase8-proto
cd "$PROTO/wt"
quiet() { …the function of the Global Constraints "Load gate"… }
quiet
PW_PORT=4395
test "$(lsof -nP -iTCP:$PW_PORT -sTCP:LISTEN -t | wc -l)" -eq 0 || { echo "port $PW_PORT busy"; exit 1; }; echo free
echo "desktop before $(cat /proc/loadavg)" >> "$PROTO/out/perf-loadavg.txt"
VITE_ART=pixel TC_PERF_QUALITY=high PW_PORT=$PW_PORT TC_PERF=1 npx playwright test tests/e2e/perf-build3.spec.ts --project=desktop --workers=1 | tee "$PROTO/out/perf-pixel-desktop.txt"
echo "desktop after $(cat /proc/loadavg)" >> "$PROTO/out/perf-loadavg.txt"
```

Expected for each block: `quiet`; `free`; the run passes (with `pipefail`, a failed run stops the block, and its `after` line is missing). On `port … busy` the block stops: pick another free port of 4392 to 4395 for that block (its run is the only one that uses it) and run the block again. On `not quiet after 30 min` the block stops: report to the controller, who starts that block again later. `--workers=1` keeps the desktop and phone projects of block 1 apart: timings on a shared machine are noise (`perf-build3.spec.ts:19`). Add each `perf-*.txt` and `perf-loadavg.txt` to the written list.

- [ ] **Step 2: Validity checks (11.7 line 2, Review Focus 1)**

```bash
set -e
PROTO=/tmp/tc-phase8-proto
cd "$PROTO/wt"
for f in perf-classic perf-pixel-k2 perf-pixel-k3 perf-pixel-desktop; do grep -Eq '[0-9]+ passed' "$PROTO/out/$f.txt" && ! grep -Eq '[0-9]+ failed' "$PROTO/out/$f.txt" || { echo "$f did not pass"; exit 1; }; done; echo all-passed
for f in perf-pixel-k2.txt perf-pixel-k3.txt perf-pixel-desktop.txt; do echo "$f"; grep -o "canvas ratio [0-9.]*" "$PROTO/out/$f" | sort -u; done
grep -h "\[perf\]" "$PROTO/out/perf-pixel-k2.txt" "$PROTO/out/perf-pixel-k3.txt" "$PROTO/out/perf-pixel-desktop.txt" | grep -Evc ", n [1-9][0-9]*$" || true
```

Expected: `all-passed`; exactly `canvas ratio 1.3125`, `canvas ratio 0.875`, `canvas ratio 1` (one line each); the last count is 0 (every `[perf]` line of the three Pixel files ends with `n <k>` where `k > 0`; an `n 0` or `n n/a` line means the run read the home zoom too early or ran Classic). Else the run is invalid: find the cause (port reuse, a quality step, a home zoom read too early) and run that file's block of Step 1 again (with its load gate, port check and time limit).

- [ ] **Step 3: Read the kill rule values**

Take each value by the rule that Task 21 later builds as `parseP95(text, 'phone', 'phone', true)` (the function does not exist yet; read the file by hand): only the `[perf] phone` lines with `scene phone ` and `n > 0`; the frame p95 is the number of `/frame p50 [\d.]+ \/ p95 ([\d.]+)/` (not the `tick`, `work`, `render` or `pan` p95); with more than one counted line, the value is their mean (Prototype decision 19). `P95_K2` comes from `perf-pixel-k2.txt`, `P95_K3` from `perf-pixel-k3.txt`. Kill rule 3 fires when both are above 40 ms; kill rule 3a fires when only `P95_K2` is above 40 ms. Kill rules 3 and 3a are read on the unrounded means. Write the two values (also as one line `P95_K2=<value> P95_K3=<value>`, each value rounded to 2 decimals: with one counted line, the printed number), the counted lines, the result and `perf-loadavg.txt` into `$PROTO/out/kill3-notes.md`. `kill3-notes.md` and `numbers.json` (`phone.frameP95K2`, `phone.frameP95K3`, Task 21) must hold the same two values; Task 21 Step 5 checks it within 0.006 ms (the rounding to 2 decimals). When kill rule 3 or 3a fires, copy the fired file to `<name>.first-run.txt`, run that one block of Step 1 again (with its load gate, port check and time limit), repeat Step 2 for it, and let the repeat run decide; write both values into `kill3-notes.md`.

- [ ] **Step 4: Task check**

Task 1 Step 6b with `TASK=20`.

---

### Task 21: Release builds and `numbers.json` (kill rules 7, 7a)

**Files:**
- Modify: `scripts/check-release.ts` item 2 detail (`:220`): append ` (${bytes} bytes)` after `gzipped JS + CSS` (decision: the KB value has one decimal, and `C_guest` is multiplied by 54.5 in `P`)
- Modify: `tests/unit/render/pixel/protoKit.ts` (add the pure functions below)
- Create: `tests/unit/render/pixel/protoNumbers.test.ts`
- Output: `$PROTO/out/release-pixel.txt`, `release-no-carousel.txt`, `release-no-guest.txt`, `numbers.json`

**Interfaces:**
- Consumes: `buildSheetSprites` (Task 16); `startDerivedMemo`, `stopDerivedMemo` (Task 2); the outputs of Tasks 1, 19b and 20.
- Produces, `protoKit.ts` (pure, tested):
  - `parseLoadBytes(text: string): number` (the `(N bytes)` value when present, else the `X.X KB gzipped` value × 1024, rounded).
  - `parseP95(text: string, project: 'desktop' | 'phone', scene: 'phone' | 'build2', requireN: boolean): number`: it reads only the lines that start with `[perf] ${project}` and hold `scene ${scene} ` (`perf-build3.spec.ts:272`), and takes the frame p95: the number after `frame p50 X / p95 ` (regular expression `/frame p50 [\d.]+ \/ p95 ([\d.]+)/`, `fmt`, `perf-build3.spec.ts:189-196`), never the `tick`, `work`, `render` or `pan` p95. With `requireN` true (Pixel files), a line counts only when it ends with `n <number>` and that number is above 0 (`n 0` and `n n/a` lines are skipped). With `requireN` false (`perf-classic.txt`), every matching line counts. The result is the mean of the counted lines; no counted line throws an error. `perf-classic.txt` holds `scene build2` lines of both projects, so the `project` input keeps the desktop and the phone values apart.
  - `projection(v: { L_proto: number; C_MAP: number; C_ride: number; C_guest: number; K_SMALL: number; N_STAMP: number; T_TRACK: number; T_REST: number }): number` = §10.4 item 3 formula (bytes).
  - `kill7(P: number): 'fires' | 'near' | 'clear'` (`P >= 392 × 1024` → fires; `P >= 384 × 1024` → near (7a)).
  - `stepTable(B: number, rGzip: number, cMapSrc: number): Record<string, { step: number; limit: number }>` by §10.4 item 6 and the shares of §15 (`1a-i` 0.15, `1a-ii` 0.25, `1b` 0.30, `1c` 0.38, `2a` 0.45, `2b` 0.55, `3` 0.68, `4a` 0.80, `4b` 0.84, `4c` 0.84, `5a` 0.88, `6` 0.95, `7` 1.0, then `5b`, `8`, `9` step 0), in the order of §12.1; `room = (392 − B / 1024) / rGzip` KB; `limit(1a-i) = floor(room × 0.15)`; from `1a-ii`, `limit = floor(room × share) + ceil(cMapSrc / 1024)`. Steps: `step(1a-i) = limit(1a-i)`; for every later stage of the §12.1 order, `step(S) = limit(S) − limit(previous stage)`; `5b`, `8` and `9` have `step` 0 and `limit` = `limit(7)`.
  - `buildBudgets(desktopMs: number, phoneMs: number): { desktop: number; phone: number }` = `max(4, ceil(desktopMs))`, `max(6, ceil(phoneMs))` (§10.3). The inputs are `spriteBuildMsMax` of `numbers-desktop.json` and of `numbers-phone.json` (the phone value is measured at 4× throttle, Task 19b), never a frame p95 or a chunk time: `constants.BUILD_BUDGET_MS_DESKTOP` and `constants.BUILD_BUDGET_MS_PHONE` = `buildBudgets(desktop.spriteBuildMsMax, phone.spriteBuildMsMax)`.
- Sources of the four sizes (§10.4 item 3, §11.4 "`B` is the initial load in `release-base.txt`"): `B = parseLoadBytes(release-base.txt)` (Task 1); `L_proto = parseLoadBytes(release-pixel.txt)`; `C_ride = L_proto − parseLoadBytes(release-no-carousel.txt)`; `C_guest = L_proto − parseLoadBytes(release-no-guest.txt)` (Step 3). Each text is read from `$PROTO/out` (`TC_PROTO_OUT`). Note: `release-base.txt` comes from the base commit, whose `check-release.ts` has no `(N bytes)`, so `B` is the KB value × 1024.
- Produces, `numbers.json` (every size in bytes, every time in ms, every memory in MB): `B`, `L_proto`, `C_ride`, `C_guest`, `C_MAP`, `C_MAP_SRC`, `R_GZIP`, `K_SMALL` (2), `N_STAMP` (8), `T_TRACK` (13 × 1024), `T_REST` (8 × 1024), `P`, `desktop: { frameP95, spriteBuildMsMax, chunkBuildMsMax, chunkBuildMsMaxLoad, turnFrameMsMax, rideBuildMsMax, spriteMb, chunkMb, loadavgBefore, loadavgAfter }` (`frameP95 = parseP95(perf-pixel-desktop.txt, 'desktop', 'build2', true)`; the other members from `numbers-desktop.json`), `phone: { frameP95K2, frameP95K3, spriteBuildMsMax, chunkBuildMsMax, chunkBuildMsMaxLoad, turnFrameMsMax, rideBuildMsMax, spriteMb, chunkMb, loadavgBefore, loadavgAfter }` (`frameP95K2 = parseP95(perf-pixel-k2.txt, 'phone', 'phone', true)`, `frameP95K3` the same from `perf-pixel-k3.txt`; the other members from `numbers-phone.json`), `classic: { phoneFrameP95, desktopFrameP95, phoneRatio, desktopRatio }` (`parseP95(perf-classic.txt, 'phone', 'phone', false)` and `parseP95(perf-classic.txt, 'desktop', 'build2', false)`; ratios Pixel ÷ Classic; the phone ratio uses `frameP95K2`), plus `kill7` and `constants: { PIXEL_CODE_STEP_KB, R_GZIP, BUILD_BUDGET_MS_DESKTOP, BUILD_BUDGET_MS_PHONE }`.
- `C_MAP` and `C_MAP_SRC` (§10.4 item 3): the scan of every `#rrggbb` literal, matched without regard to case (`/#[0-9a-f]{6}\b/gi`) and then folded to lower case (§6.4 item 1; `src/render/palette.ts:9` and `:85` hold upper-case literals), and every numeric `rgb(…)`/`rgba(…)` literal (as `#rrggbb`) in the `.ts` files under `src/render/` outside `src/render/pixel/`, plus the `out` of every record of `stopDerivedMemo()` around `buildSheetSprites()`; each value `'n3'`; `C_MAP = gzipSync(JSON.stringify(sortedMap)).length`; `C_MAP_SRC` = the gzip of the map as the source of `colourMap.ts` (one `'#rrggbb': 'n3',` line per entry). `R_GZIP = C_ride / gzipSync(readFileSync('src/render/pixel/art/rides.ts'), { level: 9 }).length`.

- [ ] **Step 1: Write the failing pure tests**

```ts
// tests/unit/render/pixel/protoNumbers.test.ts (always-run part)
it('step table at the start values reproduces §15', () => {
  const t = stepTable(352.7 * 1024, 0.6, 0);
  expect(['1a-i', '1a-ii', '1b', '1c', '2a', '2b', '3', '4a', '4b', '4c', '5a', '6', '7', '5b', '8', '9'].map((s) => t[s]!.step))
    .toEqual([9, 7, 3, 5, 5, 7, 8, 8, 3, 0, 2, 5, 3, 0, 0, 0]);
  expect(t['7']!.limit).toBe(65);
  expect(stepTable(352.7 * 1024, 0.6, 30_000)['1a-ii']!.step).toBe(7 + 30);
});
it('projection and the kill rule 7 bands', () => {
  expect(projection({ L_proto: 360_000, C_MAP: 4_000, C_ride: 1_000, C_guest: 400, K_SMALL: 2, N_STAMP: 8, T_TRACK: 13_312, T_REST: 8_192 }))
    .toBe(360_000 + 4_000 + 17_000 + (400 * 101) / 2 + (400 * 8) / 2 + 13_312 + 8_192);
  expect(kill7(392 * 1024)).toBe('fires');
  expect(kill7(384 * 1024)).toBe('near');
  expect(kill7(384 * 1024 - 1)).toBe('clear');
});
it('build budgets (§10.3)', () => expect(buildBudgets(2.1, 7.2)).toEqual({ desktop: 4, phone: 8 }));
const phoneLine = (n: string, p95 = '41.5'): string =>
  `[perf] phone (CPU 4×) scene phone run 1/1 (high), canvas ratio 1.3125: 30.0 fps, frame p50 20.0 / p95 ${p95} / max 90 ms; ` +
  'tick p50 1.00 / p95 2.00 ms; work p95 9.0 ms; render p95 8.0 ms; draws 10; sprites 5.0 MB, 3 canvases made; ' +
  'long tasks 0 in 30 s; guests 1 → 1; heap 50 MB; turns: longest frame 80 ms (work 70.0 ms), 60 ms (work 50.0 ms); ' +
  `pan: frame p95 33.3 ms, work p95 n/a ms; zoom 1.143, n ${n}`;
const build2 = (project: 'desktop' | 'phone', p95: string): string =>
  `[perf] ${project}${project === 'phone' ? ' (CPU 4×)' : ''} scene build2 run 1/1, canvas ratio 1: 50.0 fps, frame p50 10.0 / p95 ${p95} / max 40 ms; ` +
  'tick p50 1.00 / p95 2.00 ms; work p95 9.0 ms; render p95 8.0 ms; draws 10; sprites 5.0 MB, 3 canvases made; ' +
  'long tasks 0 in 30 s; guests 1 → 1; heap 50 MB; turns: longest frame 30 ms (work 20.0 ms), 30 ms (work 20.0 ms); pan: frame p95 22.2 ms, work p95 n/a ms';
it('parseP95 takes the frame p95 of the right project and scene', () => {
  expect(parseP95(phoneLine('3'), 'phone', 'phone', true)).toBe(41.5); // not tick 2.00, work 9.0, render 8.0 or pan 33.3
  expect(parseP95([phoneLine('3', '40.0'), phoneLine('3', '42.0')].join('\n'), 'phone', 'phone', true)).toBe(41);
  expect(parseP95([phoneLine('0', '99.0'), phoneLine('n/a', '99.0'), phoneLine('2', '30.0')].join('\n'), 'phone', 'phone', true)).toBe(30);
  expect(() => parseP95(phoneLine('n/a'), 'phone', 'phone', true)).toThrow();
  const classic = [build2('desktop', '12.5'), build2('phone', '35.0')].join('\n');
  expect(parseP95(classic, 'desktop', 'build2', false)).toBe(12.5);
  expect(parseP95(classic, 'phone', 'build2', false)).toBe(35);
});
it('parses the release lines', () => {
  expect(parseLoadBytes('| 2 | Initial load < 400 KB gzip (master §10) | PASS | 360.1 KB gzipped JS + CSS (368742 bytes) |')).toBe(368742);
  expect(parseLoadBytes('| 2 | Initial load < 400 KB gzip (master §10) | PASS | 352.7 KB gzipped JS + CSS |')).toBe(Math.round(352.7 * 1024));
});
```

The output part is `describe.skipIf(!process.env.TC_PROTO_OUT)` and writes `numbers.json`.

- [ ] **Step 2: Run the pure tests to see them fail, implement `protoKit.ts` functions, run them to pass**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; npx vitest run tests/unit/render/pixel/protoNumbers.test.ts`. Expected first: FAIL (no exports); after the implementation: PASS (the output part skipped).

- [ ] **Step 3: The three builds (§11.4 lines 886-888) and the drop check (Review Focus 4)**

```bash
set -e
PROTO=/tmp/tc-phase8-proto
cd "$PROTO/wt"
VITE_ART=pixel npm run build && node scripts/check-release.ts --no-build | tee "$PROTO/out/release-pixel.txt"
grep -l "\.\.\.\.\.oo\.\." dist/assets/*.js || true; grep -l "\.oPoPo\." dist/assets/*.js || true; echo "control done"
VITE_ART=pixel VITE_PROTO_DROP=carousel npm run build && node scripts/check-release.ts --no-build --no-tests | tee "$PROTO/out/release-no-carousel.txt"
grep -l "\.\.\.\.\.oo\.\." dist/assets/*.js || true; echo "carousel marker check done"
VITE_ART=pixel VITE_PROTO_DROP=guest npm run build && node scripts/check-release.ts --no-build --no-tests | tee "$PROTO/out/release-no-guest.txt"
grep -l "\.oPoPo\." dist/assets/*.js || true; echo "guest marker check done"
```

Expected: each `Initial load` row is `PASS`; in the two drop builds, `grep -l` prints no file name before its "done" line (the `HORSE` row `.....oo..` and the guest row `.oPoPo.` are not in the drop builds). After the first build, each of the two control greps prints at least one file name (the markers are in the full build; both can print the same `dist/assets/index-*.js`, because the renderer, `people.ts` and `art/rides.ts` share one entry chunk). `release-pixel.txt` may show other failing rows (items 1 and 9 depend on the release documents); only item 2 counts here.

- [ ] **Step 4: Write `numbers.json` (§11.4 line 895)**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; TC_PROTO_OUT="$PROTO/out" npx vitest run tests/unit/render/pixel/protoNumbers.test.ts`
Expected: PASS; the output part asserts `C_ride > 0`, `C_guest > 0` and that both `e2e/numbers-*.json` files exist.

- [ ] **Step 5: Key check (11.7 line 5)**

```bash
set -e
PROTO=/tmp/tc-phase8-proto
cd "$PROTO/wt"
node -e "const j = require(process.argv[1]); for (const k of ['B', 'L_proto', 'C_ride', 'C_guest', 'C_MAP', 'C_MAP_SRC', 'R_GZIP', 'K_SMALL', 'N_STAMP', 'T_TRACK', 'T_REST', 'P', 'desktop', 'phone', 'classic']) if (!(k in j)) process.exit(1)" "$PROTO/out/numbers.json" && echo keys-ok
node -e "const j = require(process.argv[1]); const t = require('fs').readFileSync(process.argv[2], 'utf8'); const m = /P95_K2=([\d.]+) P95_K3=([\d.]+)/.exec(t); if (!m || Math.abs(Number(m[1]) - j.phone.frameP95K2) > 0.006 || Math.abs(Number(m[2]) - j.phone.frameP95K3) > 0.006) process.exit(1)" "$PROTO/out/numbers.json" "$PROTO/out/kill3-notes.md" && echo kill3-same
```

Expected: `keys-ok`; `kill3-same` (`kill3-notes.md` and `numbers.json` hold the same two p95 values, up to the rounding to 2 decimals of Task 20 Step 3; a hand mean such as (40.1 + 42.3) / 2 written as 41.20 and the float 41.199999999999996 of `parseP95` agree). Then read `kill7` (kill rules 7 and 7a).

- [ ] **Step 6: Stage**

Run: `PROTO=/tmp/tc-phase8-proto; cd "$PROTO/wt" || exit 1; git add -A`. Then Task 1 Step 6b.

---

### Task 22: Stage 0 report

**Files:**
- Create: `$PROTO/out/stage-0-report.md`
- Copy: the owner pictures to the folder that the controller names (`$OWNER_OUT` below)

- [ ] **Step 1: Final checks of §11.7**

```bash
set -e
PROTO=/tmp/tc-phase8-proto
cd "$PROTO/wt"
for f in before-desktop.png after-desktop.png before-phone.png after-phone.png strip-desktop.png sheet-rides-track.png numbers.json \
   perf-classic.txt perf-pixel-k2.txt perf-pixel-k3.txt perf-pixel-desktop.txt \
   release-pixel.txt release-no-carousel.txt release-no-guest.txt release-base.txt; do test -s "$PROTO/out/$f" || { echo "missing $f"; exit 1; }; done
ls "$PROTO"/out/classic-ops-*.json "$PROTO"/out/base/classic-ops-*.json | wc -l
for f in "$PROTO"/out/base/classic-ops-*.json; do cmp "$f" "$PROTO/out/$(basename "$f")" || true; done
npx vitest run tests/unit/render/content/art.test.ts tests/unit/render/content/phase6Art.test.ts tests/unit/scenery/art.test.ts tests/unit/render/track/slices.test.ts
npx vitest run 2>&1 | tee "$PROTO/suite-22.log" | tail -15
grep -E "^ *(FAIL|×) " "$PROTO/suite-22.log" | sed -E 's/ +[0-9]+ms$//' | sort -u > "$PROTO/suite-22.txt" || true
comm -23 "$PROTO/suite-22.txt" "$PROTO/baseline-full.txt"
```

Expected: no `missing` line; the count prints 24 (12 files in `out`, 12 in `out/base`); `cmp` prints nothing; the recorder tests pass; the `comm` line prints nothing. Run the block with `run_in_background` and `timeout: 3600000` (Global Constraints "Time limits"). The whole suite runs again here because Tasks 18 and 21 changed shared code (`renderer.ts`, `scripts/check-release.ts`) after the suite run of Task 17 Step 4; a failure that `comm` prints is sorted as in Task 17 Step 4 (outside `tests/unit/render/pixel/`: a Classic change; inside: a fault of the prototype task that owns the test); repair it, then repeat Task 17 Steps 2 to 4 and this step. Repeat the blocks of Task 20 Step 2 and Task 21 Step 5.

- [ ] **Step 2: Write the report with this outline (fixed)**

```markdown
# Phase 8 stage 0 report

## 1. Result
One paragraph: the kill rules that fired, and the advice to the owner (go to stage 1a-i, go with changes, or stop).

## 2. Kill rules
| # | Condition (short) | Result | Evidence |
|---|---|---|---|
| 1 | after-desktop.png a clear step toward the draft | Owner decides | strip-desktop.png, after-phone.png |
| 2 | grid check at every crisp level | pass / fired | numbers-*.json gridLevels (levels, n, bad runs), kill2-4-notes.md |
| 3 | phone p95 > 40 ms at k = 2 and k = 3 | pass / fired | perf-pixel-k2.txt, perf-pixel-k3.txt (values), kill3-notes.md (load averages; both runs when a run was repeated) |
| 3a | only k = 2 fails | pass / fired | the same; if fired: k = 3 for phones, §7.1 and §7.3 to update |
| 4 | chunk > 12 ms or ride > 3 ms, throttled phone, after one tuning round | pass / fired | numbers.json phone, kill2-4-notes.md (load averages; both runs when a run was repeated; the before-tuning values of Task 19c) |
| 5 | ink across rails at joins, or rail gaps | pass / fired | sheet-rides-track.png, kill5-notes.md |
| 6 | recorder test fails, or classic-ops differ | pass / fired | cmp output (empty), Vitest result |
| 7 | P >= 392 KB | pass / fired | numbers.json P, kill7 |
| 7a | 384 KB <= P < 392 KB | pass / fired | the same; if fired: early-delete remedy planned for 5a and 6 |

## 3. Numbers
Tables from numbers.json: desktop and phone (frame p95, slowest sprite, chunk, ride build, slowest turn frame, sprite and chunk MB, load averages);
the chunk build: chunkBuildMsMaxLoad (first view after the load) and chunkBuildMsMax (after the turns; on desktop marked "after prefetch", never given as a cold-build measure);
the Pixel phone p95 next to today's auto p95 (key classic) with the ratios; B, L_proto, C_ride, C_guest, C_MAP, C_MAP_SRC, R_GZIP, P.
Risk 18: turnFrameMsMax on the phone (the largest frame interval after a view turn, Task 18) against TURN_FRAME_MAX_MS (100 ms), next to the
`turns: longest frame` values of the `scene phone` lines of perf-pixel-k2.txt (the same measure in the perf spec); above 100 ms, the remedy of §14 row 18 goes into stage 1c.

## 4. Constants of section 15, recomputed
PIXEL_CODE_STEP_KB (step and cumulative limit per stage, with B, R_GZIP and ceil(C_MAP_SRC / 1024)), R_GZIP,
BUILD_BUDGET_MS_DESKTOP, BUILD_BUDGET_MS_PHONE (rule of §10.3), and the values that stay start values (K_SMALL, T_TRACK, T_REST).

## 5. Owner pictures
strip-desktop.png (before | after | draft crop at (320, 180)), after-phone.png, sheet-rides-track.png (cell order of the 18 rides),
before-*.png, and where they are. The exception to master §3 (§3 of the spec: stages 1a-i to 7 merge behind the art style switch).
Owner's answer: (written here by the controller after the gate).

## 6. Prototype decisions
The list "Prototype decisions" of the plan header, one line each, with the result of each line where a task measured one (for example the effect of the tuning round, or a sheet cell that the layout cut).

## 7. Open points for stage 1a-i
Each point with its source: kill rule results that change sections (3a, 5, 7, 7a); the hand map entries to carry over;
the `plot` member of the surface; tint and ghostTable; anything the tuning round changed.
main-status.log: one line saying whether the main checkout's status changed between the task 1 start record and the last record so far (the task 22 start record; other agents' work; for information).
```

- [ ] **Step 3: Deliver the owner pictures**

The controller gives the absolute path of `OWNER_OUT` in the task brief. Put it in the block where it says `OWNER_OUT=…`.

```bash
set -e
PROTO=/tmp/tc-phase8-proto
cd "$PROTO/wt"
OWNER_OUT="…"   # the absolute path from the task brief
case "$OWNER_OUT" in /?*) ;; *) echo 'ask the controller for OWNER_OUT (an absolute path)'; exit 1;; esac
case "$(realpath -m -- "$OWNER_OUT")" in /home/user/RC-TYCOON-|/home/user/RC-TYCOON-/*) echo 'OWNER_OUT is in the main checkout: ask the controller for another path'; exit 1;; esac
echo "$OWNER_OUT" >> "$PROTO/written-22.txt"
mkdir -p "$OWNER_OUT" && cp "$PROTO/out/strip-desktop.png" "$PROTO/out/after-phone.png" "$PROTO/out/sheet-rides-track.png" \
  "$PROTO/out/after-desktop.png" "$PROTO/out/before-desktop.png" "$PROTO/out/before-phone.png" \
  "$PROTO/out/numbers.json" "$PROTO/out/stage-0-report.md" "$OWNER_OUT/"
```

Expected: 8 files in `$OWNER_OUT`. Do not remove the worktrees: §11.4 removes them after the owner gate, outside this plan.

- [ ] **Step 4: Last task check**

Task 1 Step 6b with `TASK=22`. Expected: `no-leak`; no `WRONG-DIR` line.
