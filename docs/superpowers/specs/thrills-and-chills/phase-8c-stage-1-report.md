# Phase 8c stage 1: owner gate report

**Status: TEMPLATE. Phone rows are empty until the owner runs the bench.** Build rows (S5 to S8) are filled from the bake and build evidence. Decision rule: see the kill rules S1 to S8 in `phase-8c-realistic-art.md`. The full build starts only after the owner says yes.

**Test link:** `/real-game/?art=real&bench=1` on the deployed site (deploy workflow, branch `ccr-6f420895-3xt45j`, builds `phase8c-stage1`). Play the parks at `/real-game/?art=real`.
**Build under test:** branch `phase8c-stage1` (commit: fill in from the deploy log).

## Phone results

Fill one table per phone. The bench copies its own text; paste it under each table.

### Phone 1: owner's Android 10 phone (model: ______ , browser: ______ )

| # | Measure | Limit | Value | Band |
|---|---|---|---|---|
| S1 | `build2` frame p95 | at most 33 ms | | |
| S2 | Peak decoded memory, three parks | at most 128 MB | | |
| S3 | Turn time, Turn button direction / other direction | at most 250 ms / 500 ms | | |
| S4 | App start to first complete park frame | at most 4 s | | |
| S5 | App size, all art (build measure, same on every phone) | at most 150 MB | see build table | |
| S6 | Today's look unchanged | no change | see build table | |
| S7 | Website unchanged | no change | see build table | |
| S8 | Bake time | at most 60 min warm / 4 h cold | see build table | |

Fallbacks used (ids drawn with today's art): ______
Notes from playing the parks: ______

### Phone 2: older Android (model: ______ , browser: ______ )

| # | Measure | Limit | Value | Band |
|---|---|---|---|---|
| S1 | `build2` frame p95 | at most 33 ms | | |
| S2 | Peak decoded memory, three parks | at most 128 MB | | |
| S3 | Turn time, Turn button direction / other direction | at most 250 ms / 500 ms | | |
| S4 | App start to first complete park frame | at most 4 s | | |
| S5 to S8 | see build table | | | |

Fallbacks used: ______
Notes: ______

### Phone 3: iPhone (model: ______ , Safari version: ______ )

| # | Measure | Limit | Value | Band |
|---|---|---|---|---|
| S1 | `build2` frame p95 | at most 33 ms | | |
| S2 | Peak decoded memory, three parks | at most 128 MB | | |
| S3 | Turn time, Turn button direction / other direction | at most 250 ms / 500 ms | | |
| S4 | App start to first complete park frame | at most 4 s | | |
| S5 to S8 | see build table | | | |

Fallbacks used: ______
Notes: ______

### Headless (not representative)

Code check only. Headless Chromium on SwiftShader says nothing about a phone's frame time or memory.

| Run | S1 | S2 | S3 | S4 | Fallbacks | Note |
|---|---|---|---|---|---|---|
| Headless bench, once after deploy | | | | | | NOT representative |

For reference, the shot script in task 9b (headless, 390x844, DPR 2) saw: coaster zoom 1 resident 70.8 MB; coaster zoom 2 peak 120.4 MB with density capped to 2 (pressure 138.8 MB against the 128 MB budget); `build2` zoom 1 peak 120.4 MB; `incomplete` 0 and no fallbacks in all three.

## Build evidence (S5 to S8)

| # | Evidence | Result |
|---|---|---|
| S5 | Baked art: 234 sets, 273 files, 9.58 MB compressed plus 401 KB index. The whole `/real-game/` folder (game, art and bench saves) built to 21 MB in the dry run. Projected from the stage 1 items only (18 items), not the full build. | About 21 MB against 150 MB: **pass** |
| S6 | `classicOps.test.ts` (today's draw calls golden, `classic-ops.json`): 2 passed in tasks 8 and 9b. | **Holds** |
| S7 | Website initial load (`initialLoadBytes`): base 374,321 B, stage 1 at task 8 376,320 B, growth +1,999 B against the limit of 2,048 B (49 B margin). Task 9b: website bundle differs from base in `index-*.js` only, by +38 B gzip (the `blitColumn` clip in shared code). Re-measure before the gate. | **Holds, margin is thin** |
| S8 | Bake, 18 items: cold 459.5 s (7.7 min; other cold runs 520.7 s and 458 s) on the build computer; warm 0.5 s. A CI runner is slower and has no cache on its first run: read the cold figure from the first deploy log, the warm figure from the second deploy with no kit change. | Local cold 7.7 min against 4 h, warm 0.5 s against 60 min: **pass** |

### Bake sizes (task 9 and 9b)

| Item | Value |
|---|---|
| Sets | 234 |
| Compressed | 9.58 MB (plus 401 KB index) |
| Decoded per turn, density 2 | 35.7 MB (rides 21.7, ground 4.0, guests 4.1, cars 2.8) |
| Decoded per turn, density 4 | 132.3 MB (rides 77.6, ground 16.3, guests 15.6, cars 10.6): just over the 128 MB budget when every stage 1 item is built |
| Decoded, all four turns | 49.81 MB at density 2, 187.15 MB at density 4 |
| Coaster scene, zoom 2 on a DPR 2 phone | pressure 138.8 MB: the set manager caps to density 2 |

| Deploy bake | Time | Log |
|---|---|---|
| Cold (first run, empty cache) | | `bake wall time:` line |
| Warm (second run, no kit change) | | `bake wall time:` line |

## Known faults (task 9b)

1. Cliff faces and shore water are today's art. `RealGround` draws only grass, water, path and queue pieces. The baked cliff pieces are not used by any reader, and shore pieces are not baked. This shows on the `build2` pond.
2. The coaster scene at zoom 2 on a DPR 2 phone does not fit density 4 (138.8 MB against 128 MB), so it is shown at density 2 upscaled. This is the S2 risk.
3. One stall observed once and not reproduced: coaster zoom 2 loaded right after zoom 1 stayed at `incomplete() = 26` for 60 s with today's ground drawn. Four later runs completed in 3.8 to 4.9 s. Suspect the set manager's cap and room hysteresis. If it happens on a phone, the bench's S4 and turn waits will show it.
4. Saddle looks: on steep track the saddle plate sits about 1 m under the rail line and reads as beside the rail.
5. Faint 1 px seams at support segment joints at large zoom.
6. The real build's service worker precaches the four bench save chunks (about 420 KB gzip), so every visitor to `/real-game/` downloads them on install.
7. Not baked: shadows for rails, supports, cars and facades; chain-lift dashes, path on slopes, shore pieces, cliff tops on slopes; guest items (balloon, umbrella) and staff; bin fill and broken looks; lit and night variants.

## What was not tested

- Any real phone: S1 to S4 have no measured value yet.
- View turns 2 and 3 at zoom 2; `build1` and phone-size scenes; the mini railway stand-in rails; the inverted and hanging support path (no baked type uses it).
- Baked art through the bench with real turn decode times (the bench e2e ran with fakes).
- Safari and iOS memory behaviour of decoded WebP sheets.
- A warm CI bake: the cache restore on GitHub Actions has not run yet.
- The full item list: only 18 stage 1 items are baked; the full build is what the owner gate decides.

## Owner decision

Go / no-go: ______   Date: ______   Notes: ______
