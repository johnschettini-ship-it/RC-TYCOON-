# Phase 8b stage 0b report

Date: 2026-11-12. Throwaway test of design section 6 (`docs/superpowers/specs/thrills-and-chills/phase-8b-predrawn-art.md`, revision 5). Code: worktree `/tmp/tc-phase8b-proto/wt`, branch `phase8b-stage0b-proto` (never merged). All numbers: `numbers.json`. Owner decisions in force: D6 = (a), D7 = (b), D8 = (a), D11 = (a).

## 1. Result

**What passed.** Every kill rule except one passed in the test browser. The pictures are the same as stage 0 (B1). Phones are faster than today's look. On the `phone` scene a slow frame takes 33.4 ms with pixel art and 50 ms today. A view turn takes 4 frame steps instead of 7 (B2b, B3b). The busy `build2` scene stays under 40 ms (33.4 ms). Memory stays inside 64 MB: at most 26.5 MB on the phone in the speed runs, and 61.6 MB on the tablet in the hard-cases park (B6). A park starts in 1.7 to 2.0 seconds; the limit is 4 seconds (B5). Turns, colour changes and placing items are quick (B3-other). Today's look and the website did not change (B7, B8).

**What fired.** B4, the tablet speed rule. On the tablet profile a slow frame takes about 100 ms. The limit is 40 ms. By the rule as written, the result is **Stop, owner decision**. Some context, which does not change the result: today's look on the same tablet profile takes 450 to 500 ms per slow frame. That is 5 times slower than pixel art. The test computer draws without a graphics chip (software drawing). The tablet screen is the largest canvas (about 5 times the phone's pixels). So the real tablet run should decide what tablets get. You have three options:
1. **Stop**: the B4 result stands, and the approach stops.
2. **A separate tablet limit**: you set another limit for tablets.
3. **Phones only first**: the full build brings pixel art to phones. Tablets keep today's look until a real tablet passes.

**One thing a player may see.** The first time a ride changes to a new loading state (more or fewer riders), it may show its previous loading state for up to about 6 frames (about 0.2 s). Nothing goes blank. The full build should load these pictures early.

**A rule changed after the data was seen.** Task 15 said a speed run counts only when no picture was missing. The runs had the short misses above. After seeing the data, the controller decided that these runs still count, because every frame was drawn and the times are real. With the old rule, the pixel runs on this computer give no valid value for B2, B2b, B3-turn and B3b (and B4).

**Advice: go to the full build for phones**, once the real phone run agrees. Tablets wait for your choice of the three options above.

**What you must do:** run the device checklist (section 7) on the Android emulator, on one mid-range Android phone, and on an older iPhone if you can. A tablet run helps the B4 choice. Send back the table. A failure on a real device decides over the test computer.

Owner pictures (in the folder with this report):
- `phone-phone-pixel.png`: the phone at k = 3, the picture phones will really get: square pixels, the new ground, dithered shadows.
- `phone-phone-today.png`: the same view in today's look.
- `build2-phone-pixel.png` and `build2-phone-today.png`: the busy Build 2 park on the phone, pixel and today.
- `cases-phone-pixel.png` and `cases-phone-today.png`: the coaster in its own (changed) colours, its supports and a cliff face; today's look next to it.
- `cases-phone-pixel-r1.png`: the same park after one view turn.
- `cases-phone-pixel-night.png`: at night, with no object shadows (D8).
- `phone-tablet-pixel.png` and `phone-tablet-today.png`: the phone park on the tablet (k = 2), pixel and today.
- `build2-tablet-pixel.png` and `build2-tablet-today.png`: Build 2 on the tablet, with the pond as flat water pieces.
- `cases-tablet-pixel.png` and `cases-tablet-today.png`: the whole coaster with loop and helix on the tablet.
- `cases-tablet-pixel-r1.png`: the tablet after one view turn.
- `strip-phone.png`: today (left) and pixel (right) side by side, the coaster on the phone.

## 2. Kill rules

| # | Condition (short) | Result | Evidence |
|---|---|---|---|
| B1 | predrawn ≠ stage 0 surface output; new keys format | pass | `b1/result.md`: 44 325 entries, 0 failures; 24 464 hashes compared (ride 18 304, guest 5 376, scenery 396, staff 252, stall 56, path item 48, decal 12, entrance 8, show 8, fence 4), all equal; every entry format ok; 7 328 rails inside their slice bounds. First run (`b1/result.first-run.md`): 240 rails outside a single-tile anchor bound only, all hashes equal; the controller fixed the bound (not counted as a B1 failure). |
| B2 | phone or build2 frame p95 > 40 ms (strict, for information) | reported (would pass) | phone 33.4 ms, build2 33.4 ms (`numbers.json` pixel.phone, `perf-pixel-phone.txt`) |
| B2b | phone ≤ today and work ≤ today + 2 ms; build2 ≤ 40 ms | pass | phone 33.4 ≤ today 50.1 ms, work 10.0 ≤ 17.3 + 2 ms; build2 33.4 ≤ 40 ms (`perf-today.txt`, `perf-pixel-phone.txt`) |
| B3-turn | turn frame > 6 steps (for information) | reported (would pass) | phone 67 ms = 4 steps, build2 83 ms = 5 steps |
| B3b | turn steps ≤ today + 1 (per scene, Test decision 19) | pass | phone 4 ≤ 7 + 1; build2 5 ≤ 5 + 1 |
| B3-other | cold chunk > 12 ms; swap > 3 ms; > 30 incomplete frames; 20 placements > 100 ms | pass | phone: 4.1 ms, 0.9 ms, 6 frames, 33.4 ms (`e2e/cases-phone.json`, `b3other-b5-notes.md`); tablet, reported: 5.8 ms, 0.8 ms, 18 frames, 116.6 ms |
| B4 | tablet build1/build2 p95 > 40 ms or memory > 64 MB (full set, then coarse) | **fired: Stop, owner decision** | coarse (phone) frame set: build1 100.1 ms, build2 100.0 ms (limit 40); memory 61.59 MB at most (≤ 64). Today on the same profile: 500.0 / 449.9 ms. The full set was not timed: its projected upper bound is 152 MB on the cases park (`perf-pixel-tablet.txt`, `e2e/cases-tablet.json`) |
| B5 | page start to park > 4 s (new park; Continue build2) | pass | new park 1 732 ms, Continue build2 2 004 ms (`e2e/start-phone.json`); device times: owner |
| B6 | shared budget > 64 MB (phone, tablet) | pass | largest of any run: phone 26.46 MB (perf `build2`), tablet 61.59 MB (cases park) |
| B7 | today's look changed | pass | `b7-notes.md`: classic-ops and renderer-ops identical to base, recorder tests 363 passed, suite equal to baseline; Task 22 again: `cmp` silent, recorder tests 363 passed, suite 284 files / 3 775 tests passed, 0 failed, nothing new against the baseline |
| B8 | website +2 KB, art folder, worker rules; app build with worker | pass | `b8-notes.md`: +159 bytes (limit 2 048), no `art/`, worker source and precache list equal to base, web JS clean; `check-app.txt`: no worker in the app build. Repeated in Task 22 (`b8-notes-22.md`): +159 bytes, same lines |

Real-device values of B2, B3 and B6: "owner step" until the checklist comes back; a device failure decides over Chromium (§6).

**Validity of the speed runs (controller decision 1, made after the data was seen).** Task 15's rule said a `[perf]` line with `missing > 0` is invalid. Every pixel line had misses in its 30 s window: phone 26 / 26 / 27, build2 8 / 9 / 8, tablet build1 8 / 9 / 9, tablet build2 8 / 9 / 8 per run. Task 19 found the cause: short bursts of 2 to 6 frames when a ride first changes to an occupancy group the 10 s warm-up never needed; during them the object keeps its last decoded picture (no hole, no blank). The controller ruled that these lines are valid timing evidence: every frame was drawn and the frame times are real. The misses are reported as a separate fact a player can see (a ride may show its previous loading state for up to about 6 frames, about 0.2 s, the first time it changes) and as an open point for the full build (prefetch the occupancy groups of rides on screen). **This rule was changed after the data was seen.** Both readings: with the decision, the table above; with the original rule, B2, B2b, B3-turn and B3b (and B4) have no valid value from this container (`numbers.json` `validity.originalRule`). The rule function `sceneValues` keeps the original rule as an option (`strictMissing`), and its test shows both.

**B4 context (it does not weaken the result).** Today's look measured 450 to 500 ms on the same tablet profile, 5 times slower than pixel art. The container draws in software (SwiftShader, `2d_canvas: unavailable_software`), and the tablet canvas is the largest (pixel: 1 024 × 1 366 = 1.40 M canvas pixels; the phone 361 × 735 = 0.27 M; today's `build1` ran at canvas ratio 2). Work p95 is 36 ms; the rest of the 100 ms frame is drawing and waiting. The real tablet run of the device checklist should decide among: (1) tablets are a stop, (2) a separate tablet limit, (3) phones only first.

**Phone, plainly (controller decision 3).** The pixel look is faster than today on both phone scenes: frame p95 33.4 vs 50 ms (`phone` 33.4 vs 50.1, `build2` 33.4 vs 50.0); turn 4 vs 7 steps (`phone`) and 5 vs 5 (`build2`). It stays inside the 64 MB budget (largest 26.46 MB in the perf runs, 22.89 MB in the cases park). App start 1.7 to 2.0 s.

## 3. Numbers next to today's look

Medians of 3 runs, headless Chromium, CPU throttle 4, software drawing. Phone: Pixel 7 profile, dpr 2.625, k = 3, art scale n 2 (one art pixel = 6 device px), canvas 361 × 735, coarse frame set. Tablet: 1 024 × 1 366 CSS, dpr 2, k = 2, n 2, canvas 1 024 × 1 366, coarse frame set (`?frames=coarse`). Steps = `round(ms / 16.67)`. Headless frame times come in 16.67 ms steps, so p95 values are 33.4, 50 or 100.

| Profile, scene | Look | frame p50 | frame p95 | work p95 | render p95 | turn frame ms (steps) | budget max MB | incomplete after turn | missing per run |
|---|---|---|---|---|---|---|---|---|---|
| phone, `phone` | today | 33.3 | 50.1 | 17.3 | 10.1 | 117 (7) | (sprites 57.6) | – | – |
| phone, `phone` | pixel | 16.7 | 33.4 | 10.0 | 4.1 | 67 (4) | 22.08 | 6 | 26 / 26 / 27 |
| phone, `build2` | today | 33.3 | 50.0 | 24.6 | 9.8 | 83 (5) | (sprites 63.6) | – | – |
| phone, `build2` | pixel | 16.7 | 33.4 | 17.5 | 6.0 | 83 (5) | 26.46 | 6 | 8 / 9 / 8 |
| tablet, `build1` | today | 349.9 | 500.0 | 292.9 | 184.1 | 667 (40) | (sprites 106.8) | – | – |
| tablet, `build1` | pixel (coarse) | 83.3 | 100.1 | 36.2 | 14.5 | 167 (10) | 41.74 (largest 43.03) | 12 | 8 / 9 / 9 |
| tablet, `build2` | today | 283.4 | 449.9 | 264.0 | 126.5 | 400 (24) | (sprites 126.1) | – | – |
| tablet, `build2` | pixel (coarse) | 66.7 | 100.0 | 33.7 | 10.6 | 133 (8) | 42.40 (largest 42.67) | 13 | 8 / 9 / 8 |

Today's "sprites" is today's sprite memory, not the pixel budget; it is shown for size only. Turn and pan misses (outside the window): phone 66 / 63 / 67, build2 42, tablet build1 1 550 / 1 494 / 1 550, tablet build2 67.

**Cases measures** (Task 18, hard-cases park, pixel only; the plan has no today counterpart):

| Value | Phone | Tablet (coarse) | Limit |
|---|---|---|---|
| cold chunk assembly | 4.1 ms | 5.8 ms | 12 ms |
| main-thread part of a colour swap | 0.9 ms | 0.8 ms | 3 ms |
| incomplete frames after a turn | 6 | 18 | 30 |
| longest frame of 20 placements | 33.4 ms | 116.6 ms (reported) | 100 ms (phone decides) |
| budget max, median (largest run) | 22.43 MB (22.89) | 61.59 MB (61.59) | 64 MB |
| one ground sheet decode, throttle 1 / 4 | 4.5 / 35.9 ms (× 8.0) | 16.8 / 199.7 ms (× 11.9) | – |
| store decodes in the loops, median / max | 108 / 188 ms | 217 / 271 ms | – |

The CPU throttle applies to decoding (ratio far above 1.5). Ghost pictures: valid and invalid shown in every loop, 0 missing.

**App start** (phone, throttle 4, cold page): new park 1 732 ms (runs 1 732 / 1 930 / 1 686), Continue `build2` 2 004 ms (2 009 / 2 004 / 1 999). Limit 4 000 ms.

**Drawing path** (`e2e/gpu-*.json`): software on both profiles (`2d_canvas: unavailable_software`; ANGLE on SwiftShader, Vulkan 1.3.0). In stage 0 a phone's graphics chip did most of the pixel filling; this container cannot show that.

**WebKit:** not possible here. Controller decision C5: no WebKit download (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` is set on purpose, and no other browser may be installed). The owner's iPhone run covers WebKit.

**Load averages** (`loadavg.txt`, 1 / 5 / 15 min): cases before 0.81 0.57 0.63, after 1.09 0.83 0.73; start before 0.37 0.67 0.68, after 1.01 0.79 0.72; perf today before 0.37 0.64 0.67, after 1.19 1.13 0.96; perf pixel phone before 0.40 0.91 0.89, after 1.23 1.16 1.01; perf pixel tablet before 0.64 0.97 0.96, after 1.18 1.11 1.02. Every block started after the load gate printed `quiet`.

## 4. Projected sizes and memory

Art (`art/report.json`, `check-app.txt`); 1 MB = 1 048 576 bytes.

| Pack | Pictures | Unique | Sheets | PNG bytes |
|---|---|---|---|---|
| rides-full | 14 080 | 12 268 | 360 | 4 558 970 |
| rides-coarse | 4 224 | 3 600 | 216 | 1 412 593 |
| track | 16 930 | 13 491 | 65 | 677 914 |
| objects | 532 | 424 | 105 | 77 605 |
| ghosts | 476 | 419 | 4 | 73 394 |
| ground | 1 607 | 991 | 1 | 34 127 |
| shadows | 848 | 82 | 1 | 6 087 |
| people | 5 628 | 594 | 2 | 3 771 |
| **total** | 44 325 | 31 869 | 754 | 6 844 461 |

Unique pictures per kind: ride 15 868, rail 7 152, car 6 300, ground 991, guest 480, ghost 419, scenery 328, staff 114, shadow 82, stall 51, support 22, path item 18, decal 11, deck 10, show 8, entrance 4, fence 4, gate 4, post 3. PNG bytes per kind: ride 5 971 563, rail 410 867, car 262 989, ghost 73 394, scenery 60 189, ground 34 127, stall 12 344, shadow 6 087, staff 2 216, support 2 006, show 1 965, guest 1 555, deck 1 291, path item 1 033, entrance 945, gate 750, fence 594, decal 535, post 11.

Projected app art (sheets and indexes): both frame sets 7 928 911 bytes (7.56 MB); coarse set only 3 028 112 bytes (2.89 MB). Build time: cold paint and pack 22.4 to 23.5 s; cached about 1 s for the sheet step (Vite 1.6 s, 2.0 s wall).

Projection (`projection.md`, maximum over the 4 views) next to the measured budget (B6):

| Scene | Device, frame set | Projected total MB | Upper bound MB | Measured budget max MB (largest run) |
|---|---|---|---|---|
| phone | phone, coarse | 12.95 | 27.30 | 22.08 |
| build2 | phone, coarse | 14.81 | 26.50 | 26.46 |
| cases | phone, coarse | 22.38 | 54.93 | 22.89 |
| build1 | tablet, coarse | 20.28 | 34.97 | 43.03 |
| build2 | tablet, coarse | 22.72 | 34.41 | 42.67 |
| cases | tablet, coarse | 30.23 | 62.78 | 61.59 |
| cases | tablet, full | 42.95 | 152.20 | not timed |

The measured tablet values are above the projection for `build1` and `build2` because the timing runs include the pan and the turns, which open new views (chunks 15 to 16 MB measured against 5 MB projected). Parts at the end of the cases runs: phone 22.04 = sheets 9.97 + swaps 5.11 + chunks 5.94 + static 1.01 + other 0; tablet 61.20 = 29.12 + 5.11 + 21.62 + 5.34 + 0. The sum of the parts held within 0.01 MB in every loop (Review Focus 5).

## 5. Owner pictures

The files in OWNER_OUT (`/tmp/claude-0/-home-user-RC-TYCOON-/29ee6f8c-df84-5112-ac7e-04cfb7614dae/scratchpad/stage0b-owner`): 16 pictures, `numbers.json`, this report, `device-checklist.md`, `app-src-0b.tar.gz`.

| File | What to look at |
|---|---|
| `phone-phone-pixel.png` | The phone at k = 3: the picture phones will really get. Square art pixels (6 device pixels each); grass from tile pieces with 4 dithered variants; path edge pieces; dithered checkerboard shadows under the carousel and teacups; guests with their own small shadow. |
| `phone-phone-today.png` | The same view in today's look. |
| `build2-phone-pixel.png` | Build 2 on the phone: wide paths, the drop tower's large dithered shadow, a balloon stall, dense queues. |
| `build2-phone-today.png` | The same today. |
| `cases-phone-pixel.png` | The coaster in its own colours (track and support colours changed by palette swap), chain-lift marks, a raised area with stepped cliff faces. |
| `cases-phone-today.png` | The same today: the swapped colours match today's colours. |
| `cases-phone-pixel-r1.png` | After one view turn: complete, no gaps. |
| `cases-phone-pixel-night.png` | At 22:00 with After Dark: night tint, no object shadows (D8). |
| `phone-tablet-pixel.png`, `phone-tablet-today.png` | The phone park on the tablet (k = 2): many rides with dithered shadows, the railway train. |
| `build2-tablet-pixel.png`, `build2-tablet-today.png` | Build 2 on the tablet: the pond as flat water pieces. |
| `cases-tablet-pixel.png`, `cases-tablet-today.png` | The whole coaster with loop, helix and train; cliff faces, fences, shows, a stall. |
| `cases-tablet-pixel-r1.png` | The tablet after one view turn. |
| `strip-phone.png` | Today (left) and pixel (right) side by side: the coaster on the phone. |

Reminder: the pictures are the stage 0 art with its faults (olive-yellow grass, guests without balloons or umbrellas in hand, no queue rails, one flat purple haunted house, colours no person checked). The look is not judged in this test (§6).

Owner's answer: (written here by the controller after the gate).

## 6. Open points

**Test decisions of the plan, with results:**

1. Hook architecture (one hook file, runtime as a separate app chunk): held. Website +159 bytes after the controller's `__TC_APP__` flag (+1 882 before it).
2. Phone stretch k = max(1, ceil(dpr)): Pixel 7 profile k = 3 (C4), art scale n 2 (one art pixel = 6 device px; the plan's "n 3" was written for stage 0's k 2, Task 15).
3. Tablet stretch k = max(1, round(dpr)): k = 2, canvas 1 024 × 1 366, canvas ratio 1 (C1).
4. Today's numbers from the app build with the Classic style: done (Task 19 block 1).
5. Reserved ramps `rt`, `rs`, `rc` (111 palette slots): 0 role pixels outside their ramp; the coaster shows its real colours; swap main-thread time 0.9 ms. No colour-blind check (full build).
6. Shadow pictures, checkerboard in two phases: the phase includes the mask anchor, `(ax/2 + ay/2 + cx + cy) & 1`, so round casters share one checkerboard (Task 12). No object shadows at night (picture).
7. Ground pieces: 1 607 pieces (991 unique) in one sheet; cold chunk 4.1 ms (phone). No shore, strata, queue posts or dashes.
8. Rails, supports, gates, cars: rails 7 328, supports 48, gates 4 (real roof colours, not swapped), cars 9 536 (pose walk 320 poses, 944 for spinning cars, exact crossing method). Every rail inside its slice bounds (B1).
9. Elevated paths: 10 deck and 4 post pictures; posts stacked from the ground up.
10. Start decode driven by the frame, progress line over the canvas (C10): app start 1.7 to 2.0 s (B5).
11. Keep the last picture: rides, stalls, scenery and shows keep their last decoded picture while a sheet decodes. This is what a player sees during the misses of section 2.
12. No native features in 0b: the emulator checklist records today's Export, Import, close and back-button behaviour (C7).
13. B1 reference from `$PROTO/s0`: 24 464 hashes compared, all equal. (Task 14's report wrote 28 264; its own table sums to 24 464.) Ghosts and cars are new keys with a format check only (C8).
14. Turn value = the larger of the two turn frames, median over 3 runs: implemented in `sceneValues`.
15. Previews keep today's drawing.
16. Ghosts: 476 pictures (419 unique); valid and invalid swaps shown in the cases park, 0 missing.
17. App identity: `dev.thrillsandchills.stage0b`, "T&C 0b test".
18. Bench mode: built and smoke-checked on the Pixel 7 profile (buttons, a run starts); the full bench runs only on the owner's devices.
19. B3b per scene: `build2` limit = today's 5 steps + 1; pixel 5 steps: pass (C2, C3).

**Decisions of Batch 8 (controller), with their reasons:**
- Decision 1, `[perf]` lines with `missing > 0`: valid, and the misses are reported separately (section 2). Reason: every frame was drawn and the frame times are real; during a miss the object keeps its last decoded picture. Made after the data was seen; with the original rule B2, B2b, B3-turn and B3b have no valid value from this container.
- Decision 2, B4: reported as fired by the rule as written (Stop, owner decision), with the context of section 2 next to it. Reason: the rule was fixed before the test; the context belongs next to the result, not in its place. Three options for the owner: stop, a separate tablet limit, phones only first.
- Decision 3, phone: reported plainly (section 2). Reason: the owner needs the phone result as measured.
- Decision 4, delivery: OWNER_OUT as above; the controller pushes branch `phase8b-stage0b-proto` (C6); the device checklist names it.
- Decision 5: section 1 in simple English for the owner. Reason: the owner is not a programmer.

**What the full build needs from this test:**
- **Prefetch the occupancy groups** of the rides on screen (decision 1), so a ride never shows its previous loading state. Measured: up to 6 frames per first change.
- **Tablets:** the owner's B4 choice. The full frame set does not fit 64 MB (upper bound 152 MB on the cases park), so tablets need the coarse set or fewer frames; the coarse set reached 61.6 MB, close to 64 MB. Tablet placements reached 116.6 ms (the phone decides B3-other), and the `build1` pan gave 1 550 misses.
- **Art scale against 64 MB (§5.8 item 7):** phones used at most 26.5 MB (upper bound 54.9 MB on the cases park): room for the final art at n 2. A larger art scale needs a new projection.
- **B5 limit:** 1.7 to 2.0 s in Chromium; the provisional 4 s limit can stay until the device times come back.
- **Real-device results** (device checklist): B2, B3 and B6 on a phone and an iPhone; app start by screen recording; WebKit.
- **Native features** (§5.3 items 5 to 7): file saves, share sheet, back button, autosave on hide.
- **Release check row 7 (originality)** fails on the test branch only: the Capacitor template images under `android/app` and the copies under `mobile/www`. The full build needs its own icons and should not commit the app build copy.
- **Look (owner gate):** olive-yellow grass, guests without balloons or umbrellas in hand, no queue rails (Test decision 7): stage 0 art faults for the art batches.

**Not done in this test:** the WebKit run (C5); the full tablet frame set was not timed (projection above 64 MB; controller decision in Batch 7); Task 19 block 4 not run (block 3 already used the coarse set); no APK built here (no Android SDK; owner step).

**main-status.log:** start and end records of Tasks 1 to 22 (with the repeat run 14b); the main checkout's status was empty at every record (no change seen; information only).

## 7. Device checklist for the owner

This test app is a throwaway. It is never merged and never published. It shows the predrawn pixel pictures on your own devices, so we can read the speed and memory limits there. A result from a real device decides over the computer test.

The test code is on branch `phase8b-stage0b-proto` (never merged). The same code is in the archive `app-src-0b.tar.gz`.

Write every value into the table at the end and send the table back.

### 1. Get the test app

1. Take the archive `app-src-0b.tar.gz`. It holds the test code without `node_modules`, without the built files and without `.git`. (Or check out the branch `phase8b-stage0b-proto`.)
2. On the Windows computer, unpack it into a new, empty folder, for example `C:\Users\<you>\Documents\Game Projects\TC-0b-test`.
3. Open PowerShell in that folder and run these lines one by one:

   ```powershell
   npm ci
   $env:VITE_BENCH = "1"
   $env:VITE_ART = "pixel"
   npm run mobile:sync
   ```

   The two `$env:` lines turn on the Bench buttons and the pixel look. They last only for this PowerShell window. Run them again before every new `npm run mobile:sync`.
4. Then follow Orange Day's `docs/ANDROID-FIRST-RUN.md`, Steps 1 and 3 to 5:
   - Step 1: install Android Studio (skip it if it is already installed).
   - Step 3: File → Open → choose the `android` folder inside the test folder (not the whole folder).
   - Step 4: make a Pixel 6 emulator with API 34 or 35.
   - Step 5: press Run.
5. The app is called "T&C 0b test". It does not replace any other app.

### 2. Android emulator run

The emulator is not a speed test. It checks that the app works inside Android.

1. Does the title screen appear? (yes / no)
2. On the title, find the group "Bench". Press `phone · pixel`. It runs 3 times (about 2 minutes) and then shows a result panel. Does it finish and show numbers? (yes / no)
3. Do the park pictures appear (grass, paths, rides)? This shows that the picture sheets load from inside the app. (yes / no)
4. Export, then Import: in a park, open the menu, press Export, then Import. Write what happens. (Today's download may do nothing inside the app. That is a known open point, not a failure.)
5. Make a save. Close the app from the recent-apps list (swipe it away). Open it again and press Continue. Is the save still there? (yes / no)
6. Press the Android back button on the title screen, and again while a panel is open in a park. Write what happens each time.

Note: the Bench clears the test app's saves each time it runs. Do step 5 before you use the Bench again, or make a new save first.

### 3. Android phone (mid-range)

1. On the phone: Settings → About phone → tap "Build number" 7 times. Then turn on "USB debugging" in Developer options.
2. Connect the phone with a USB cable. In Android Studio, choose the phone at the top and press Run.
3. **App start (B5 device value):** close the app. Start a screen recording on the phone. Tap the app icon. Press Continue (or New park). Stop the recording. Count the time from the tap to the first frame where the whole park is drawn (no empty spots). Write it in seconds.
4. Run all five Bench buttons, one after the other: `phone · pixel`, `phone · today`, `build2 · pixel`, `build2 · today`, `cases · pixel`. Each shows a result panel when it is done. Press "Copy" on the panel and paste the text into a note.
5. Open `cases · pixel` again. Turn the view twice (the Rotate button). Watch for a stutter: none, short, or long?
6. Write the phone model, the Android version, and the screen refresh rate. The refresh rate is the `stepMs` value in the result panel (16.7 = 60 Hz, 8.3 = 120 Hz).

### 4. Older iPhone (iPhone 11 or older)

An iPhone needs a Mac with Xcode, or a cloud device service. If you have neither, write "not run". This run also covers WebKit (Safari's engine), which could not run in the test container.

If you can run it: do the same steps as for the Android phone (section 3).

### 5. Table to send back

One column per device. For each Bench button, copy the values from its result panel.

| Value | Emulator | Android phone | iPhone |
|---|---|---|---|
| Model | Pixel 6 (emulator) | | |
| Android / iOS version | | | |
| Screen refresh (`stepMs`) | | | |
| App start, tap to full park (screen recording, s) | – | | |
| `phone · pixel`: frame p95 / work p95 / turn frame (steps) | | | |
| `phone · pixel`: budget max MB / incomplete after turn / missing / first complete ms | | | |
| `phone · today`: frame p95 / work p95 / turn frame (steps) | | | |
| `build2 · pixel`: frame p95 / work p95 / turn frame (steps) | | | |
| `build2 · pixel`: budget max MB / incomplete after turn / missing / first complete ms | | | |
| `build2 · today`: frame p95 / work p95 / turn frame (steps) | | | |
| `cases · pixel`: frame p95 / work p95 / turn frame (steps) | | | |
| `cases · pixel`: budget max MB / incomplete after turn / missing / first complete ms | | | |
| Stutter when turning in `cases · pixel` (none / short / long) | | | |
| Emulator: title appears | | – | – |
| Emulator: Bench finishes | | – | – |
| Emulator: park pictures appear | | – | – |
| Emulator: Export, then Import (what happened) | | – | – |
| Emulator: save still there after close and Continue | | – | – |
| Emulator: back button on the title / in a panel (what happened) | | – | – |

A tablet, if you have one: the same steps as the Android phone, in its own column. The computer test fired the tablet speed limit (B4), so a real tablet result helps you decide what tablets get.
