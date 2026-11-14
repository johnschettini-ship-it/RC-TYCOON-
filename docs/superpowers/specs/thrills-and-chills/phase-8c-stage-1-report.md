# Phase 8c stage 1: owner gate report

**Status: TEMPLATE. Phone rows are empty until the owner runs the bench.** Build rows (S5 to S8) are filled from the bake and build evidence. Decision rule: see the kill rules S1 to S8 in `phase-8c-realistic-art.md`. The full build starts only after the owner says yes.

**Test link:** `/real-game/?art=real&bench=1` on the deployed site (deploy workflow, branch `ccr-6f420895-3xt45j`, builds `phase8c-stage1`). Play the parks at `/real-game/?art=real`.
**Build under test:** branch `phase8c-stage1` (commit: fill in from the deploy log).

## Phone results

Fill one table per phone. The bench copies its own text; paste it under each table.

How the bench measures (final fix wave):
- **Art download first.** Before anything is measured, the bench reads every compressed art file (about 9 MB) into the game, with a progress line. The card shows the time as "Art download (before the run)". In the app every file is inside the app, so this time is not part of S4.
- **S4** is the app's start to its first drawn frame (its art not awaited) plus the first park's load, with all art already local, to its first complete frame. "Boot to first complete frame (with download)" is shown apart, for information.
- **Complete frame** means no object skipped and the realistic ground laid, as the renderer counts it.
- **Each park's table** also shows the density chosen at each zoom step (2, 1, 0.5, 2, then after the turns), picture memory at the peak split into sets / tinted sheets / ground chunks, and any wait that timed out. A timed-out wait carries the set manager's state in the copied JSON (`stalls`).
- **Phones and densities.** The game draws at most 2 device pixels per CSS pixel on a phone (`PHONE_MAX_RENDER_SCALE`), so a phone uses density 2 at zoom 1 and density 4 at zoom 2, whatever its DPR. A desktop with DPR above 2 uses density 4 at zoom 1. Headless and desktop numbers (DPR 2, zoom 1, density 2) do not carry over to phones.

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

Code check only. Headless Chromium on SwiftShader says nothing about a phone's frame time or memory. Headless numbers are not phone numbers.

| Run | S1 | S2 | S3 | S4 | Fallbacks | Note |
|---|---|---|---|---|---|---|
| Headless bench, once after deploy | | | | | | NOT representative |

For reference, the shot script in task 9b (headless, 390x844, DPR 2) saw: coaster zoom 1 resident 70.8 MB; coaster zoom 2 peak 120.4 MB with density capped to 2 (pressure 138.8 MB against the 128 MB budget); `build2` zoom 1 peak 120.4 MB; `incomplete` 0 and no fallbacks in all three.

Final fix wave, phone path headless (390x844, DPR 2.75, touch: the game draws at 2 device pixels per CSS pixel; art read first; zoom 1 → 2 → 1 → 0.5 → 2, then 4 turns through the Turn buttons): coaster peak 127.1 MB (sets 41.8, tints 20.2, ground 60.7 at zoom 2, density 4), one cap at 131.9 MB pressure, then density 2; `build2` peak 68.2 MB. Every step and every turn reached a complete frame; turns 75 to 192 ms. Not representative of a phone's speed.

## Build evidence (S5 to S8)

| # | Evidence | Result |
|---|---|---|
| S5 | Baked art: 234 sets, 273 files, 9.22 MB compressed plus 348 KB index (final fix wave: guests bake only the frames the game reads). The whole `/real-game/` folder (game, art and bench saves) built to 21 MB in the dry run. Projected from the stage 1 items only (18 items), not the full build. | About 21 MB against 150 MB: **pass** |
| S6 | `classicOps.test.ts` (today's draw calls golden, `classic-ops.json`): 2 passed in tasks 8 and 9b. | **Holds** |
| S7 | Website initial load (`initialLoadBytes`): base 374,321 B, stage 1 at task 8 376,320 B, growth +1,999 B against the limit of 2,048 B (49 B margin). Task 9b: website bundle differs from base in `index-*.js` only, by +38 B gzip (the `blitColumn` clip in shared code). Final fix wave: the website build's files are byte-identical to `e9918ea` (source maps apart); initial load 374,662 B in both. Re-measure before the gate. | **Holds, margin is thin** |
| S8 | Bake, 18 items: cold 459.5 s (7.7 min; other cold runs 520.7 s and 458 s) on the build computer; warm 0.5 s. A CI runner is slower and has no cache on its first run: read the cold figure from the first deploy log, the warm figure from the second deploy with no kit change. | Local cold 7.7 min against 4 h, warm 0.5 s against 60 min: **pass** |

### Bake sizes (task 9 and 9b)

| Item | Value |
|---|---|
| Sets | 234 |
| Compressed | 9.22 MB (plus 348 KB index) |
| Decoded per turn, density 2 | 33.0 MB (rides 21.7, ground 4.0, guests 1.3, cars 2.8) |
| Decoded per turn, density 4 | 122.0 MB (rides 77.6, ground 16.3, guests 5.1, cars 10.6): just under the 128 MB budget when every stage 1 item is built, before tinted sheets and ground chunks |
| Decoded, all four turns | 47.28 MB at density 2, 177.31 MB at density 4 |
| Guest tinted sheets, stage 1 (8 guest sets x 12 shirt colours) | 7.7 MB at density 2, 29.3 MB at density 4 (before the final fix wave, with unused walk frames: about 98 MB at density 4) |
| Guest tinted sheets, full build projection (F6: 32 guest sets x 12 colours, same sheet size) | 30.8 MB at density 2, **117.1 MB at density 4**: nearly the whole budget. The full build needs fewer colours per set at density 4, smaller guest sheets, or tinting per frame instead of per sheet |
| Coaster scene, zoom 2 on a DPR 2 phone | pressure 138.8 MB: the set manager caps to density 2 |

| Deploy bake | Time | Log |
|---|---|---|
| Cold (first run, empty cache) | | `bake wall time:` line |
| Warm (second run, no kit change) | | `bake wall time:` line |

## Known faults (task 9b)

1. Cliff faces and shore water are today's art. `RealGround` draws only grass, water, path and queue pieces. The baked cliff pieces are not used by any reader, and shore pieces are not baked. This shows on the `build2` pond.
1b. Path and queue tiles use their baked kerb pieces by join mask (final fix wave). Park entrance tiles count as grass in `RealGround`, so its grass covers today's entrance plaza.
2. The coaster scene at zoom 2 on a phone does not fit density 4 (pressure 131.9 MB against 128 MB in the final headless run), so it is shown at density 2 upscaled. This is the S2 risk. At zoom 2 the ground chunks are the biggest part (60.7 MB of a 127.1 MB peak): a chunk of 8 x 8 tiles at scale 4 is about 2048 x 1100 px, wider than the screen. Smaller ground chunks at high zoom would cut this; not done in stage 1.
3. One stall observed once in task 9b (coaster zoom 2 stayed at `incomplete() = 26` for 60 s). Likely cause, fixed in the final fix wave: tinted sheets and ground chunks were held outside the set manager's control, so no ladder step could free them and decodes stopped. They are now admitted to the budget before they are made and reclaimed under pressure; the stall did not recur in the headless phone path. If a wait still times out on a phone, the bench row shows the set manager's state.
3b. The density cap is sticky within a session: once capped, it lifts only when everything wanted, held memory included, would fit at density 4 within 75% of the budget. After the coaster scene at zoom 2 caps, the parks after it stay at density 2 at zoom 2 for the rest of the run.
4. Saddle looks: on steep track the saddle plate sits about 1 m under the rail line and reads as beside the rail.
5. Faint 1 px seams at support segment joints at large zoom.
6. Fixed in the final fix wave: the real build registers no service worker (it would have deleted the main game's offline cache, which shares the origin) and unregisters one an earlier test deploy left for its scope.
7. Not baked: shadows for rails, supports, cars and facades; chain-lift dashes, path on slopes, shore pieces, cliff tops on slopes; guest items (balloon, umbrella) and staff; bin fill and broken looks; lit and night variants.

## What was not tested

- Any real phone: S1 to S4 have no measured value yet.
- View turns 2 and 3 at zoom 2; `build1` and phone-size scenes; the mini railway stand-in rails; the inverted and hanging support path (no baked type uses it).
- Baked art through the bench on a phone. Headless runs with baked art (quick bench and the phone path script) are code checks only.
- Safari and iOS memory behaviour of decoded WebP sheets.
- A warm CI bake: the cache restore on GitHub Actions has not run yet.
- The full item list: only 18 stage 1 items are baked; the full build is what the owner gate decides.

## Owner decision

Go / no-go: ______   Date: ______   Notes: ______
