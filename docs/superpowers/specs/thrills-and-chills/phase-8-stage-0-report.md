# Phase 8 stage 0 report

Date: 2026-11-11. Base commit: see `base-sha` (`2db863e415bfa2ae56d7d3a490973eedaa3375b8`). Worktree: `/tmp/tc-phase8-proto/wt` (never merged, no commits). All files named here are in `/tmp/tc-phase8-proto/out/` unless a path says otherwise.

Prototype code: branch `phase8-stage0-proto` (never merge). Owner pictures: `docs/screenshots/phase-8-stage0-*.png`.

## 1. Result

Three kill rules fired: 4 (a stop rule), 7 (the stage plan must change) and 3a (phones use k = 3). Read section 8 (controller addendum) with this section: it corrects three statements of this report and adds measurements; it does not change any kill rule result. **Kill rule 4 fired**: on the throttled phone, one ground chunk takes 15.3 ms to build (the limit is 12 ms), and one ride sprite takes 7.9 ms (the limit is 3 ms). One tuning round did not fix it. The spec says "Stop" for this rule. **Kill rule 7 fired**: the projected download at the end of stage 7 is 413.0 KB, and the limit is 392 KB. The spec says the stage plan must then be rewritten (delete the old art early) before stage 1a-i. **Kill rule 3a fired**: the phone is too slow at the sharp setting (k = 2), but fast enough at k = 3, so phones must use k = 3. Kill rules 2, 3, 5 and 6 passed. Kill rule 1 is your decision. **Advice: stop.** Kill rule 4 is a stop rule, and the tuning round moved the build times only by the normal noise between runs. To go on, the spec would need a change to rule 4 (for example, spread the builds over frames with a build budget, or draw the big wheel as a twin) and a rewritten stage plan for rule 7; that is a new decision for you, not a result of this prototype.

What you see in the three owner pictures:
- `strip-desktop.png`: today's smooth park on the left, the new pixel park in the middle, and the draft on the right; the middle picture clearly looks like the draft family (outlined pixel rides, small pixel guests, slab paths), but its grass is more yellow and its ride shadows are big and dark.
- `after-phone.png`: the same pixel park on a phone, closer in; the carousel, the guests and the paths are crisp, with square pixels.
- `sheet-rides-track.png`: all 18 rides and a roller coaster track in two views, in pixel art; the track joins are clean, but some rides are flat single colours (for example the purple haunted house).

Owner's answer: 

## 2. Kill rules

| # | Condition (short) | Result | Evidence |
|---|---|---|---|
| 1 | after-desktop.png a clear step toward the draft | Owner decides | strip-desktop.png, after-phone.png, kill1-notes.md |
| 2 | grid check at every crisp level | pass | `e2e/numbers-*.json` gridLevels: desktop (k 1) zoom 0.5 / 1 / 1.5 / 2, n 1 to 4; phone (k 2) zoom 0.381 / 0.762 / 1.143 / 1.524 / 1.905, n 1 to 5; every level ok, 0 bad runs, in all four runs (Task 19b two runs, Task 19c two runs); kill2-4-notes.md |
| 3 | phone p95 > 40 ms at k = 2 and k = 3 | pass | perf-pixel-k3.txt: 33.4 ms at k = 3 (not above 40). kill3-notes.md (load averages in perf-loadavg.txt) |
| 3a | only k = 2 fails | **fired** | perf-pixel-k2.txt: 66.6 ms (repeat run, decides); perf-pixel-k2.first-run.txt: 50.1 ms; k = 3: 33.4 ms. Consequence: k = 3 for phones; spec sections 7.1 (`planStretch`) and 7.3 to update before stage 1a-i |
| 4 | chunk > 12 ms or ride > 3 ms, throttled phone, after one tuning round | **fired** | numbers.json phone: chunkBuildMsMax 15.3, rideBuildMsMax 7.9 (Task 19c run 2, decides; run 1: 14.6 and 7.3). Before tuning (Task 19b): chunk 19.0 / 16.4, ride 9.1 / 8.0. Load averages of every run: kill2-4-notes.md; tuning: tuning-notes.md |
| 5 | ink across rails at joins, or rail gaps | pass | sheet-rides-track.png, kill5-notes.md (both views: no ink across a rail, no rail gap; all 51 slice pairs touch) |
| 6 | recorder test fails, or classic-ops differ | pass | Task 22 Step 1: the `cmp` loop over the 12 + 12 classic-ops files printed nothing; recorder tests 4 files, 363 passed; whole suite 276 files passed, 3 skipped (3699 tests passed, 5 skipped), no failure beyond the empty baseline |
| 7 | P >= 392 KB | **fired** | numbers.json P = 422946.5 bytes (413.0 KB), kill7 = `fires` |
| 7a | 384 KB <= P < 392 KB | not applicable | P is above 392 KB, so rule 7 applies, not 7a |

## 3. Numbers

From numbers.json (times in ms, memory in MB).

| Measure | Desktop | Phone (4× CPU throttle) |
|---|---|---|
| Frame p95, Pixel | 16.8 (scene build2) | 66.6 at k = 2; 33.4 at k = 3 (scene phone) |
| Slowest sprite build (spriteBuildMsMax) | 1.7 | 7.9 |
| Slowest ride build (rideBuildMsMax) | 1.7 | 7.9 (the big wheel, which has no twin) |
| Chunk build, first view after load (chunkBuildMsMaxLoad) | 5.1 | 4.7 (measured before the throttle starts) |
| Chunk build after the turns (chunkBuildMsMax) | 2.1 (after prefetch; not a cold-build measure) | 15.3 |
| Slowest frame after a view turn (turnFrameMsMax) | 22.3 | 83.9 |
| Sprite memory (spriteMb) | 0.53 | 0.41 |
| Chunk memory (chunkMb) | 18.11 | 9.91 |
| loadavg before / after | 1.08 0.61 0.51 / 1.08 0.61 0.51 | 1.07 0.61 0.52 / 1.07 0.61 0.52 |

Pixel next to today's look (key `classic`, today's setting, quality `auto`):

| | Classic | Pixel | Ratio Pixel ÷ Classic |
|---|---|---|---|
| Phone frame p95 (scene phone) | 49.9 | 66.6 (k = 2) | 1.33 |
| Phone frame p95 at k = 3 (for information) | 49.9 | 33.4 | 0.67 |
| Desktop frame p95 (scene build2) | 16.8 | 16.8 | 1.00 |

Note: today's Classic phone run is itself above 40 ms. The frame p95 values fall on frame steps (16.7, 33.4, 50, 66.7 ms), so one step separates a pass from a fail.

Sizes (bytes):

| Value | Bytes | Note |
|---|---|---|
| B | 363520 | 355.0 KB, release-base.txt (KB × 1024) |
| L_proto | 378401 | 369.5 KB, release-pixel.txt |
| C_ride | 500 | carousel twin |
| C_guest | 209 | guest stamps |
| C_MAP | 3151 | 872 map keys |
| C_MAP_SRC | 3357 | |
| R_GZIP | 0.243 | start value was 0.6 |
| P | 422946.5 | 413.0 KB; limit 401408 (392 KB) |

Terms of P: L_proto 378401 + C_MAP 3151 + C_ride × 17 = 8500 + C_guest × 101 / 2 = 10554.5 + C_guest × 8 / 2 = 836 + T_TRACK 13312 + T_REST 8192. `L_proto + T_TRACK + T_REST` alone is 390.5 KB, so rule 7 does not hinge on the twin estimates.

**Risk 18 (view turn).** Phone `turnFrameMsMax` is 83.9 ms, below `TURN_FRAME_MAX_MS` (100 ms), so by the rule of section 10.3 the remedy of section 14 row 18 does not go into stage 1c. But the `turns: longest frame` values of the `scene phone` lines in perf-pixel-k2.txt are 183 ms and 117 ms (first run: 183 ms and 100 ms; k = 3: 150 ms and 100 ms), above 100 ms; and the CPU-profile run of Task 19c gave `turnFrameMsMax` 111 ms. The two measures disagree; see section 7.

## 4. Constants of section 15, recomputed

Inputs: B = 355.0 KB, R_GZIP = 0.243, room = (392 − 355.0) / 0.243 = 152.3 KB, map term ceil(C_MAP_SRC / 1024) = 4 KB (added from stage 1a-ii on).

| Stage | PIXEL_CODE_STEP_KB (step) | Cumulative limit (KB) | share |
|---|---|---|---|
| 1a-i | 22 | 22 | 0.15 |
| 1a-ii | 20 | 42 | 0.25 |
| 1b | 7 | 49 | 0.30 |
| 1c | 12 | 61 | 0.38 |
| 2a | 11 | 72 | 0.45 |
| 2b | 15 | 87 | 0.55 |
| 3 | 20 | 107 | 0.68 |
| 4a | 18 | 125 | 0.80 |
| 4b | 6 | 131 | 0.84 |
| 4c | 0 | 131 | 0.84 |
| 5a | 7 | 138 | 0.88 |
| 6 | 10 | 148 | 0.95 |
| 7 | 8 | 156 | 1.0 |
| 5b, 8, 9 | 0 | 156 | |

- `R_GZIP` = 0.243 (start value 0.6). It is low because `art/rides.ts` holds more than the twin (comments, the dispatch map). So the steps are about 2.3 times the start values. They hold only while kill rule 7 has not changed the plan.
- `BUILD_BUDGET_MS_DESKTOP` = max(4, ceil(1.7)) = **4**. `BUILD_BUDGET_MS_PHONE` = max(6, ceil(7.9)) = **8** (rule of section 10.3).
- Start values that stay: `K_SMALL` 2 (no stall twin built), `T_TRACK` 13 KB, `T_REST` 8 KB, `N_STAMP` 8 (fixed).

## 5. Owner pictures

Delivered to the owner folder (`OWNER_OUT`: `/tmp/claude-0/-home-user-RC-TYCOON-/29ee6f8c-df84-5112-ac7e-04cfb7614dae/scratchpad/stage0-owner`), and kept in `/tmp/tc-phase8-proto/out/`:
- `strip-desktop.png`: three crops side by side: before (today) at (320, 180), after (pixel) at (320, 180), the draft `phase-7-draft-desktop.png` at (320, 180).
- `after-phone.png`: the pixel park on the Pixel 7 profile (k 2, home zoom 8/7).
- `sheet-rides-track.png`: the 18 rides, cell order left to right, top to bottom: carousel, big_wheel, swing_tower, teacup_twirl, bumper_cars, rocket_rounds / spiral_slide, observation_tower, mirror_maze, haunted_manor, pendulum_ship, thunder_disc / drop_tower, flip_arm, magic_carpet, kiddie_cars, merry_mill, gyro_globe; below them the coaster track in view 0 (left) and view 1 (right), with a train of 4 cars.
- `after-desktop.png`, `before-desktop.png`, `before-phone.png`, `numbers.json`, this report.

The first-run pictures are in `out/first-run/`.

**Exception to master §3** (spec section 3): master §3 says phases merge with no flags. The owner approved the design record, which keeps a Classic / Pixel switch until Pixel is complete. So stages 1a-i to 7 merge behind the art style switch (`?art=`, `VITE_ART`), and stage 5b removes the switch before Build 5 ships.

Things to know when you look at the pictures (controller notes, `controller-notes.md`; observations, not kill results):
1. Colours (source: Task 15 report; Task 10 review). The 115 scene colours are machine proposals; no person has checked them yet (that is stage 1a-ii). On the sheet the haunted house is one flat purple, and many rides take orange and sand tones. In `after-desktop.png` the big wheel platform top and the pine tree read flat. Cause: six light/dark pairs fall on one tone at the dark end of a ramp, and "darker" does nothing at the last tone.
2. Rides (source: kill5-notes.md). Only the carousel is a real pixel twin. The other 17 rides draw today's shapes through the pixel primitives.
3. Grass (source: pixel count by the controller, kill1-notes.md). The three grass colours equal the grass colours of the draft. The field looks more ochre than the draft because the scene is sparse. A greener grass ramp is your choice for stage 1a-ii.
4. Shadows (source: Task 13; spec §8.4 item 2). The shapes follow the spec (`SHADOW_TZ` 40, `SHADOW_LEN` 0.75, both provisional). On an open field the ride and stall shadows look big and heavy. Advice: tune `SHADOW_LEN` in stage 2a against a sparse park.
5. Capture (source: Task 19a, controller change). The pictures were taken after the toast went away and the mood bar updated. The strip crops start at y 180 (the plan said y 200), so no card is in the strip.
6. Not tested (source: Task 9, Task 16). Slopes, water and two-tone ground of the ground chunks have no test. The `other` group of the sheet is empty.
7. Open code points (source: Tasks 12, 13, 14, 18, 8, 2 and Prototype decision 3): see section 7.

## 6. Prototype decisions

1. `tone()` on the `i` ramp stops at `i2`; `paletteStats.missed` is a prototype member; no `r` ramps, `trackSlot`, `ghostTable`, `SHADE_STEP` (1.18 as a number), no colour-blind check. Result: six base/shade pairs fall on one tone at the dark end of a ramp (Task 15).
2. `PixelSurface.plot` is a prototype member; the ground uses it.
3. No tint remap, no `artHash`, no hash log in the Pixel `buildSprite`. Result: a tinted build in Pixel draws without its tint (ghosts untinted).
4. Left out of `grid.ts`: `stepLevel`, `levelStep`, `pixelGrid`, `publishGrid`, `snapCar`, `CAR_SLOPE_MAX`. Result: the grid check still passed (kill rule 2).
5. `data-complete` from `terrain.complete`; the management layer `begin` reads `artStyle()`; guest snap slope from motion.
6. Ground: flat tiles by inverse mapping; water `a2` only; no dashes, shores, banks, details, queue posts, strata; `soft` ignored. Result: slopes, water and two-tone ground are not tested (controller note 6).
7. `pixelCone` draws 16 segments.
8. Guests keep `GUEST_BOUNDS`; no items, rings or sit frame; no mirrored frame.
9. Carousel twin: radii × 0.8, heights × 0.75; no riders, no `pixelRideHeight`, no `pixelGate`. Result: the carousel reads close to the draft (kill1-notes.md).
10. Shadows: no edge casters, no `staff`, `pathItem`, `show` kinds, none at n = 0; ellipse casters centred on the footprint centre. Result: box shadows read heavy (controller note 4).
11. `paintSlice` gains `extras = true`. Result: clean joins (kill rule 5 pass).
12. Sheet layout: background `g2`, 2 sheet pixels per art pixel, 6 rides per row, no text. Result: no cell was cut; sheet 1712 × 1256.
13. `rideBuildMsMax` is a prototype key of `__pixelStats`. Result: it found the big wheel as the slow ride.
14. Scene coordinates; strip crops at (320, 200) and (320, 180). Result: changed by the controller to y 180 for all three crops (controller note 5).
15. The `pixelProto.spec.ts` run split into `pictures` and `measures and grid`, one save. Result: the pictures were retaken on the same save with `TC_PROTO_REUSE_SAVE=1`.
16. Every Playwright command passes `--workers=1`.
17. `check-release.ts` prints `(N bytes)`. Result: exact L_proto, C_ride, C_guest.
18. The terrain chunk copy does not change. Result: kill rule 2 passed.
19. Frame p95 of a file = the mean of its counted lines. Result: each file had one counted line.
20. Load gate, start condition, repeat of a fired run. Result: kill rules 3a and 4 were each repeated once; the repeat confirmed both (k2 50.1 then 66.6 ms; chunk 14.6 then 15.3 ms, ride 7.3 then 7.9 ms).
21. Desktop `chunkBuildMsMax` is read after the prefetch. Result: 2.1 ms "after prefetch"; first view 5.1 ms.
22. `PROTO` is the fixed path `/tmp/tc-phase8-proto`.
23. Ports 4396 to 4398 outside 4391 to 4395. Result: no port was busy.
24. The tuning round used a CDP CPU profile. Result: chunk time in `vnoise`, `colourAt`, `set`, `flatTop`; the slow ride is the big wheel. The pixel-neutral change moved the times only by the run-to-run noise (tuning-notes.md).

## 7. Open points for stage 1a-i

Only if the owner decides to go on despite kill rule 4 (a spec change):
- **Kill rule 4** (source: kill2-4-notes.md, tuning-notes.md). The chunk build (15.3 ms) and the big wheel build (7.9 ms) are too slow on the throttled phone. The slow ride is the big wheel without a twin; its time is spread over the surface primitives and the fixed canvas cost. Options named by Task 19c: a big wheel twin, or a build budget that spreads builds over frames (§10.2, §10.3). This needs a spec decision.
- **Kill rule 3a** (source: kill3-notes.md). k = 3 becomes the phone stretch: update §7.1 (`planStretch` for phones returns `max(1, ceil(deviceRatio))` at every quality) and §7.3 before stage 1a-i.
- **Kill rule 7** (source: numbers.json, Task 21 report). P = 413.0 KB. The remedy of §14 row 16 becomes the plan: rewrite the stage list and §13.1 item 2 before stage 1a-i, and the owner approves it. L_proto is already 14.5 KB above B.
- **Kill rule 5** passed: no new seam design needed. **7a**: not applicable.
- **R_GZIP** 0.243 against 0.6 (source: Task 21 report): judge whether the carousel twin is a fair sample before the steps are fixed in §15.
- **Risk 18** (source: numbers.json, perf-pixel-k2.txt, tuning-notes.md): `turnFrameMsMax` 83.9 ms passes, but the perf spec's `turns: longest frame` shows 183 ms, and the profile run gave 111 ms. Decide which measure counts for §10.3.
- **Hand map entries to carry over** (source: Task 3, Task 15 reports): `colourMap.ts` holds 139 keys (12 fixed, 12 shirts, 115 machine-proposed scene entries); the scene entries need a person's check (§6.4 item 3, stage 1a-ii). The full map scan found 872 keys.
- **The `plot` member** of the surface (source: Task 4; decision 2): a prototype member, not in §5.3; the ground needs it or an equivalent.
- **Tint and `ghostTable`** (source: Task 5; decision 3): no tint remap in Pixel; ghosts and tinted builds draw untinted.
- **What the tuning round changed** (source: tuning-notes.md, Task 19c): pixel-neutral speed-ups in `src/render/pixel/ground.ts` (`vnoise` shared products, `flatTop` row bounds) and `src/render/pixel/surface.ts` (`set` layer box only with ink, `scan` without sort for two crossings). Pixels unchanged (`sheet-same`, `chunks-same`).
- **Colours** (source: controller note 1; Task 15 report; Task 10 review): six base/shade pairs fall on one tone at the dark end of a ramp; `darker` does nothing at the last tone.
- **Grass** (source: controller note 3): a greener grass ramp is an owner choice for stage 1a-ii.
- **Shadows** (source: controller note 4; Task 13): tune `SHADOW_LEN` in stage 2a against a sparse park.
- **Capture** (source: controller note 5; Task 19a): the `pictures` test waits for the toast and the mood bar; strip crops at y 180.
- **Missing tests** (source: controller note 6; Tasks 9, 16): slopes, water and two-tone ground chunks; the empty `other` group of the sheet.
- **Open code points** (source: controller note 7): ride gates share the body and roof layers (Task 12); only visible guests cast a shadow, and the caster cache builds a string key per object per frame (Task 13); joins between two track pieces keep the old ink behaviour (Task 14); a second view turn within 30 draws of the first drops one interval of `turnFrameMsMax` (Task 18); staff anchors are not snapped (Task 8); the private `shade` of `src/render/shows/art.ts` is not in the derived-colour memo (Task 2); a tinted build in Pixel draws without its tint (Prototype decision 3).

main-status.log: the main checkout's status did not change between the task 1 start record and the task 22 start record (every record is empty: a clean status). For information only.

## 8. Controller addendum (2026-11-11, after the report; checked by three independent verifiers)

This section adds the controller's own measurements. It does not change any kill rule result of section 2: by spec §11.6 and the plan's repeat rule, kill rules 3a, 4 and 7 fired.

**Method.** A temporary probe (`controller-probe.patch`, removed after the runs; the worktree is back at its staged state, tree `7d5e292f`) recorded every ride sprite build by ride id and every ground chunk build. Same park (`e2e/save-phone.txt`), same phone profile, CPU throttle 4, 4 view turns. Logged in `controller-compare.log`: 3 comparison runs (today's look at quality `auto` and `high`, then Pixel, in one page) and 3 runs of the Task 19b measure (phone project only). About 10 earlier runs of the same kinds were not logged; no figure below depends on them. The controller's runs are outside the plan's procedure: 4 of the 6 logged runs started above the load gate (1-minute load up to 2.00).

**Correction 1: the slow ride is the carousel, not the big wheel.** In all 6 logged runs the slowest Pixel ride build is the carousel twin (6.6 to 10.7 ms); the big wheel is 3.4 to 6.7 ms. Task 19c named the big wheel from CPU profile samples; its script most likely merged back-to-back ride builds of one frame. So the one twin built so far is the slowest ride, because of its own detail (two layers with two ink rings, 8 horse stamps, a 16-segment cone). Stage 0 gives no evidence that a big wheel twin would bring the big wheel under 3 ms. If all 18 rides got twins as detailed as the carousel, each may build in about 7 to 10 ms on the throttled phone.

**Correction 2: ride builds against today.** The ride half of kill rule 4 fails clearly: every Pixel ride build is above 3 ms in every logged run. Against today's look (quality `auto`, medians of the logged runs): the carousel twin about 2.8 times slower (7.2 against 2.2 ms), the big wheel about 1.5 times (4.5 against 3.0 ms). Note: today's phone images have 4 to 16 times the pixels of a Pixel image, and the browser may finish part of today's drawing outside the timer, so the ratios are not exact.

**Correction 3: the chunk half of kill rule 4.** By the rules the chunk half fired: the deciding repeat gave 15.3 ms, and every task run was 14.6 to 19.0 ms. The controller's 3 logged measure runs gave 11.4, 11.8 and 10.7 ms. The cause of this shift was not found (the controller ran the phone project alone; the task runs ran desktop first, with a server build inside the run). These runs cannot change the result; they show only that the Pixel chunk build sits near the 12 ms limit. Per build, a Pixel chunk costs about the same as today's at quality `high` and about 1.4 times today's at `auto` (mean 5.7 to 7.1 ms against 4.5 to 4.8 ms). Its total is lower only because it builds fewer chunks (45 against 60 and 75). Today's look also has single chunk builds above 12 ms (one outlier per logged run: 40.8, 13.8, 28.7 ms; the next builds are 7 to 9 ms). This does not change the result: spec §10.2 fixes the limits so that stage 0 cannot set them from its own result. A different limit would be a spec change for the owner to decide openly.

**What this means for the player (from the perf files).**
- Phones would get k = 3 (kill rule 3a): quality `low`, canvas ratio 0.875. That picture is coarser than today's and coarser than `after-phone.png`, which shows k = 2.
- Phone at k = 3, scene `phone`: frame p95 better than today (33.4 against 49.9 ms), but the median frame doubles (33.2 against 16.7 ms: a steady 30 frames per second against 60 with hitches; 38.9 against 41.1 fps).
- Phone at k = 3, crowded scene `build2`: worse than today and above the 40 ms limit (p95 50.0 against 33.4 ms).
- Phone at k = 2: too slow (p95 66.6 against 49.9 ms).
- View turns hitch longer: longest frame 150 and 100 ms at k = 3, 183 and 117 ms at k = 2, against 100 and 100 ms today. By the §10.3 measure (`turnFrameMsMax` 83.9 ms) the risk 18 remedy is not triggered; the two measures disagree.
- Desktop: the crowded scene `build1` fails the 20 ms budget (p95 33.3 against 16.8 ms today); scene `build2` is equal (16.8 ms).
- Sprite memory on the phone is far lower (5.6 against 57.7 MB).

**Controller advice (not a result of the prototype; the owner decides).** By §11.6 the result is Stop. Options:
- (a) Stop, and keep today's look. This is the result the rules give.
- (b) Change the spec, and run one more small test (stage 0b) with a new ride build design (for example off the main thread, or a faster ink pass), a fix for the crowded scenes, and the unchanged limits of 3 ms and 12 ms. Stop if it fails.
- (c) Keep the pixel look only as an optional style behind the existing art switch (for example desktop only), with today's look as the default. This is also a spec change.
In every option, kill rules 7 (the size plan must change) and 3a (coarser phone picture) stand. Open faults besides the ride build: phone `build2` above 40 ms at k = 3, desktop `build1` above 20 ms, view turns up to 183 ms, chunk builds near or above 12 ms.
The controller recommends (a) unless the owner calls the look a clear step toward the draft (kill rule 1) and wants to pay for (b).
