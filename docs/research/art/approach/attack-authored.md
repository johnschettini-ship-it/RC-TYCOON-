# Attack on proposal "authored" (pixel art as data)

Reviewed 2026-11-11 against the working tree of `/home/user/RC-TYCOON-` at `fab5189` (read-only; nothing was
changed, built or run). Repository paths are relative to that folder. "The proposal" is
`/tmp/claude-0/-home-user-RC-TYCOON-/29ee6f8c-df84-5112-ac7e-04cfb7614dae/scratchpad/art/approach/proposal-authored.md`.
`pixel3.py` is the approved draft renderer. Art pixel = 2 world pixels.

## Result in short

- The proposal's facts about today's code are right. I found no wrong file or line in its own check table.
- Its errors are in what the design reaches: trains, the stand-in look of stage 1, the size of the art job, and
  three test assertions.
- Two parts cannot work as written. Both have a small repair, so the approach survives.
- Its look ceiling is the highest of the three proposals. Its effort is the largest and its evidence is the
  thinnest: the only thing it made is a re-encoding of the draft's own 21 objects.

Scores: look 8, effort 2 (10 = small), risk 3 (10 = low).

---

## 1. Claims checked against the code

### 1.1 Claims that hold

| Claim | Checked at | Result |
|---|---|---|
| One builder; `Sprite.scale` is free | `src/render/canvas.ts:56-72`; `src/render/renderer.ts:338-345` | True. Every blit divides by `sp.scale`. |
| Five blit copies | `renderer.ts:338-363`, `scenery/layer.ts:60-83`, `shows/layer.ts:113-135`, `track/layer.ts:676`, `terrain.ts:638-643` | True (grep of `drawImage(` finds these plus the night pass and the static layer). |
| Smoothing is set in three lines | `renderer.ts:1071`, `:1018`, `lighting/pass.ts:160` | True. The night pass saves and restores the flag (`pass.ts:159`, `:169`), so it works with smoothing off elsewhere. |
| Scale and offset are set in one place | `renderer.ts:1059-1062` | True. |
| Zoom has three writers | `src/input/controller.ts:127`, `:152`, `:280` → `zoomAt` (`src/render/camera.ts:31-37`) | True (grep finds no other writer in `src/`). |
| Canvas ratio comes from `renderPlan` | `src/perf/quality.ts:64-77`; `renderer.ts:898-917` | True. |
| The recorder counts `fillRect` as a fill and records both corners | `tests/unit/render/content/recorder.ts:69-73` | True. |
| The size check counts only files that `index.html` names | `scripts/check-release.ts:85-90` | True. Today's `dist`: JS 308,085 + CSS 9,320 bytes at gzip level 6 = 310.0 KB of 400 KB. |
| No raster file may be tracked; text data passes | `scripts/check-release.ts:36-38, 46` | True. |
| Guest bounds are an imported constant | `src/render/sprites/props.ts:15`; `tests/unit/render/guestItems.test.ts:8, 43-45` | True. |
| The tracker marks a tile and 4 neighbours | `src/render/terrainTracker.ts:126-134` | True. |
| The fake canvas returns 4 bytes from `getImageData` | `tests/unit/render/fakeCanvas.ts:70-71` | True. |
| Zoom-stop table (section 3.1) | arithmetic on `k = 2 × zoom × R` | Correct for every row. |
| Grass rule, outline rule, shadow rule quoted from the draft | `pixel3.py:115-119`, `:213-218`, `:184` | True. |

### 1.2 Claims that are wrong or incomplete

**W1. Trains: "4 headings × 3 pitches, plus banked and upside down; about 5,000 px".**
Today a car has 16 headings × 24 pitches × 16 rolls per shape (`src/render/track/layer.ts:840-846`). The track has
gentle slopes (26.6°), steep slopes (56.3°), a full circle of pitch in loops and a full roll in corkscrews
(`src/data/track/pieces.ts:42-45, 66-67`; `extraPieces.ts:31-82`; `track.md` obstacle 4). One "up" sprite cannot lie
along both slopes, and a loop needs every pitch. The count is also low: 11 car shapes, a different loco front, and a
nose on five front cars (`src/render/track/paint.ts:737-738, 790-797, 820-824`). At the proposal's own pose list,
with riders baked in, that is 150 to 600 sprites of about 50 px, so 8,000 to 30,000 px, not 5,000.

**W2. "The two arch halves still add up to the whole."**
The test compares the number of recorded calls: `back.ops.length + front.ops.length` must equal the whole's
(`tests/unit/scenery/art.test.ts:80-89`). The proposal's adapter emits runs of one composed buffer
(`(ctx, o) => emitRuns(ctx, composeSceneryBuf(id, o), …)`, section 4.1). Runs merge and overwrite where the halves
share a row, so the counts do not add. It only holds if the whole is two separate emissions with no shared buffer,
no shared outline and the same `fillStyle` reset. The proposal does not say so.

**W3. "The art tests keep running through `fillRect`: points and bounds."**
`tests/unit/render/guestItems.test.ts:59, 68-69` passes arbitrary colour strings (`'#123456'`) and expects
`fillStyle=<ITEM_COLOURS[n]>` in the log. `emitRuns` takes `fillStyle` from the fixed palette (section 2.2), and the
six item colours (`props.ts:20`) are not draft colours. The same holds for `paintRun`, `paintSupport` and `paintCar`,
which the tests call with hex colours (`tests/unit/render/track/phase6Render.test.ts:95-101`). Every adapter needs a
colour-string-to-slot step, and `ITEM_COLOURS` must become palette values. The registry test also spies on
`CONTENT_RIDE_ART[id].draw` (`tests/unit/render/content/art.test.ts:46-52`), so the composers must stay behind that
record. All solvable, none mentioned.

**W4. "A wheel notch goes to the next stop."**
One wheel event is not one notch. `wheelZoomFactor` returns a fraction of a notch for pixel deltas
(`src/input/camera.ts:83-88`), which is what trackpads send, many times per gesture. "Next stop per event" would run
through every stop in one swipe. The controller also has no access to the canvas ratio: it is a local of the
renderer (`renderer.ts:904`). Both need new plumbing (a notch accumulator, an exported plan).

**W5. "`low` quality and the `auto` step down use `n + 1`."**
On a desktop with device ratio 1 this gives a canvas ratio of 0.5. Today the plan never goes below 1 there
(`src/perf/quality.ts:71`: `Math.min(d, 1)` and `Math.max(1, autoMaxRatio)`). At 0.5 only zoom 1 and 2 are sharp.
The rule must keep the floor of 1.

**W6. "A zoom that is not a stop draws in the smoothed mode. Nothing breaks."**
Today seams between chunks are hidden by a 2-pixel pad and by growing each tile by `0.6 / scale`
(`src/render/terrain.ts:399, 551, 105-117`). The proposal removes both (its section 5.5: "No pad of 2 scaled
pixels"). Chunk images are diamonds with clear corners. Filtered at a scale that is not whole, their hard alpha
edges blend with the clear pixels, and the sky colour `#1d2b3a` shows as a dark line on every chunk border. This
hits every pinch in progress and the far view at zoom 0.25 (a 2-to-1 filtered reduction), which the proposal offers
as a normal stop. During a pinch on a ratio-2 screen the 0.5-scale sprites are also magnified about 5 times with
bilinear filtering, far softer than today, where a bucket-2 sprite exists.

**W7. "Baked shadows: the tracker marks chunks within 4 tiles when `content` changes."**
Edge scenery and arches do not touch `map.content` (`src/sim/scenery/types.ts:4`, `commands.ts:60`), so the tracker
never sees them. The chunk painter gets rides and stalls but no scenery (`terrain.ts:42-46`, `renderer.ts:990`), and
trees are the main shadow casters in the draft. A dirty chunk loses all its images at once (`terrain.ts:503-509`)
and then falls under the 6 ms first-build budget with a flat placeholder (`terrain.ts:623-631`). A wider dirty
radius means more chunks flash to the placeholder after each placement, most on phones.

**W8. Phone cost: "43 % of the pixels of today's R = 2".**
True, but the phone figure that passes today is at ratio 1, after the `auto` step down
(`docs/adr/0001-renderer.md:91-104`: 33.4 ms at 1×, 83.3 ms at 2×; the cost is putting the canvas on screen, `:147-149`).
The proposed default phone canvas (541 × 1,101) has 1.72 times the pixels of the one that passes. Section 3.4 also
says overlays get coarser "at reduced quality"; with `n = 2` they are coarser at normal quality on every phone above
ratio 2.

**W9. Sizes of the job.** "About 330 sprites", "a composer is about 30 lines", "data about 45 KB". See section 4.

**W10. Palette tables.** "Every table is a 64-entry lookup" (section 2.2). The palette is 59 draft colours + 4
signal colours + 9 tint steps + 36 for the 12 player colours × 3 steps (section 4, track row) = 108.

**W11. "The look the owner called 'works'."** The owner's sentence was "That works but I still think we can do
better". Stage 1 ships that look, and a weaker form of it (see F2).

---

## 2. The hard parts

| Hard part | Solved? | Reason |
|---|---|---|
| Animation frames built by code | Flat rides: yes in principle. Trains: no. | A composer per ride places stamps in a byte buffer per frame; frame numbers and the cache stay (`src/render/anim.ts:57-60`, `sprites/bank.ts:97-111`). A frame is about 33 KB instead of 0.5 MB. But the parts that turn freely (ship hull, flip arm, gyro rings, spokes) are drawn by `raster.ts` lines, so there are two art systems, and the proposal itself says these parts will look plainer (risk 4). Trains: see W1. |
| Four view rotations | Partly | Rides are code, so they turn. The mirror with a tone swap is right for box faces only; a highlight, a curved shade or a sign glyph flips to the wrong side. Natural items get two variants picked by facing parity, so every tree changes shape when the view turns. That rule exists to pass `tests/unit/scenery/art.test.ts:69-72`, not because it looks right. |
| Continuous zoom, phone ratios | Solved by removing continuous zoom | The grid design is sound: whole `n`, whole `k`, one rounded offset, one blit. The price: a ratio-1 desktop has no sharp size between zoom 0.5 and 1; the measured phone profile will probably land on `n = 3` (W8), which leaves 3 sharp sizes; vector overlays and the builder's text labels (`track/layer.ts:1031`) are drawn into the low-ratio canvas and then enlarged by nearest pixel, which is neither smooth nor pixel art. Also W4, W5, W6. |
| Column cutter | Yes | The outline is made on the whole composed buffer, the strips are cuts of one image, and the first and last strip run to the sprite edge (`renderer.ts:350-363, 455-462`; same in `scenery/layer.ts:70-83`, `shows/layer.ts:121-135`). Not covered: track slices are separate sprites per tile, and the draft's trestle braces run between support columns of neighbouring tiles (`track.md` obstacle 6). |
| Night multiply pass | Postponed, not solved | Stage 9a keeps the smooth multiply and the gradient bulbs over pixel art. It is compatible (see 1.1). Bulb heights copy today's shapes (`lighting/pass.ts:44-54`) and need new numbers in stages 3, 6 and 7; only stage 6 lists them. Stage 9b is a sketch. |
| Terrain chunk build time | Plausible, not measured | A chunk is 256 × about 140 art pixels. The rasterizer proposal measured about 100 ns per pixel for the same ground rule in Node: 2 to 3.5 ms on a desktop, 8 to 14 ms at 4× throttle, over the 6 ms first-build budget (`terrain.ts:407`), so one chunk per frame on the phone. The slope rule (shift columns up, fill gaps) has no draft and no test picture. Shadows add W7. |
| Art tests that record fills | In the letter | The adapters are code that only the tests call; the game makes sprites with `putImageData`. The proposal says the tests "get weaker in meaning", which is honest. W2 and W3 are missing designs. The new Node pixel tests are a real gain, but a golden hash per sprite and view means a hash update for every art fix. |
| Bundle limit | Yes, with less room than claimed | My estimate: data 55 to 75 KB (section 4), new code about 20 KB, removed code 32 KB: about 365 KB at the end. If old art is not deleted stage by stage (owner decision 7, second option), the peak is about 395 to 400 KB, at the limit. |
| Determinism | Yes | Whole-number buffers and a `Math.imul` hash are exact. Composers still use `Math.sin` and `Math.cos` before rounding, so "no fractions" is overstated, but a different result needs a product that lands exactly on a half. Better than today's anti-aliased paths. |

---

## 3. The look

**What speaks for it.** This is not the filter look. The ground rule, the guest, lamp, bench, horse, gondola and
mascot sprites are the draft's own, and a composer is the draft's carousel recipe (`pixel3.py:454-482`). Static
props can be drawn to any quality. Of the three proposals this one can come closest to the approved picture.

**What is not shown.** The proposal made one picture, `measure/contact-sheet.png`. It is the draft's own 21 objects,
rendered by the draft's code and decoded again. It proves the byte cost. It does not prove the method:

- No sprite was authored for a catalog item that the draft lacks. The draft has 1 stall shape, 3 flat rides and
  about 6 scenery kinds. The game has 14 stalls, 18 flat rides, 85 scenery items, 11 car shapes, 4 staff types and
  3 costumes (`drafts-constraints.md` 1.4).
- No second view, no mirrored sprite, no ride at the game's footprint size was drawn.
- The proposal itself says language models place pixels poorly above about 24 × 24 (risk 2). The draft agrees: all
  27 of its typed sprites are 20 × 13 or smaller, and everything larger is built from primitives. So "authored"
  means "generated, then corrected" for stalls, trees, large scenery, the manor and the maze. That is the rasterizer
  method with the result frozen as data.

**Where it would fall short of the draft at the end.** Rides are about half the draft's size on today's footprints
(any approach has this). Trains (W1). Night stays a smooth darkening. On phones above ratio 2 the overlays are
coarse. The far view is a blurred average. About 500 or more sprites from many agent runs will drift in outline
weight and ramp use; the lint rules catch form, not taste.

**The interim.** From stage 1 to stage 8 the park is the filter look with authored islands. See F2.

Judgement: the end state can reach about 8 of 10 against the draft. The path there is the weakest of the three.

---

## 4. The effort

The proposal gives sizes only as small, medium and large. Against the counts in the maps:

| Item | Proposal | My reading | Basis |
|---|---|---|---|
| Authored sprites | about 330 | about 485 without cars; 650 to 1,100 with the car poses it lists | Ground and decks 58, people and staff 73, path items and fence 26, scenery 150 plus 25 lit, stalls 28, ride parts about 80, track parts 15, shows, mascots, digits 31; cars 13 body kinds × 12 to 24 poses × 1 or 2 rider states |
| Ride composers | 18 × about 30 lines | 50 to 70 lines each | Today's 19 ride bodies are 1,380 lines, 73 each (`rides-stalls.md:678-682`). The orbit, depth order, swing, arm and drop maths stay; only the detail moves into stamps. |
| Data bytes | 162,000 px × 0.27 = 45 KB | 200,000 to 230,000 px × 0.30 to 0.35 = 55 to 75 KB | 71 % of the measured pixels are three whole-ride pictures (`measure/measure.json`: carousel 5,273, wheel 3,806, tower 3,612 of 17,784) that the game would not store. Without them the same file gives 0.31; without the two palette-swap copies, 0.35 (my rerun on `measure/sample-rle.txt`). A 4 × 4 Haunted Manor front is 128 × 95 art pixels per view (`src/data/catalog/flatRides.ts:29`, `rides.ts:53`). |
| Art code thrown away | 5,000 lines | All 174 world-art functions (5,250 lines) and all 34 primitives | No geometry is reused except in track. This is the maximum scope of the three proposals. |

Stage sizes:

| Stage | Proposal | My reading | Why |
|---|---|---|---|
| 1 Pixel grid | Large | Two large stages | 8 new core files, the pack/lint/sheet tool, 16 changed files, zoom stops, canvas plan, CSS sizing, five blits, the cutter, the stand-in filter, card pictures, and the pipeline tests of 8 test files. It changes zoom for every player before one authored sprite is visible. |
| 2 Ground | Large | Very large | A per-pixel painter for 15 slope shapes, cliffs up to 63 steps, 5 terrain types, shores, paths on 4 ramp shapes, queues, plaza, baked shadows with a new tracker rule, and decks turned from per-frame vectors into cached sprites. No draft exists for slopes, cliffs or decks. |
| 3 People and small things | Medium | Medium to large | About 100 sprites, cull margins, the ring, two test files. |
| 4, 5 Scenery | Medium, large | As stated | About 150 sprites. Parallel work, but one critic for all. |
| 6 Stalls | Medium | Medium to large | 28 sprites of about 900 px each, the size where typed grids fail. |
| 7 Flat rides | Large | Very large | 18 composers, about 80 parts, the 4 × 4 buildings, all ride tests. |
| 8 Track and trains | Large | Very large, and the least specified | One table row covers 13 painters and 670 lines (`critic.md` C.7), 10 rail styles, 4 support styles, 56 pieces, 6 per-frame effects, gate booths and the builder ghosts. A roofed station as in the draft needs a new draw kind (`track.md` obstacle 13); the proposal lists only a platform. |
| 9 Light, ghosts, overlays | Medium + medium | Large | Ghosts and placement overlays alone are 25 functions in 8 files (`critic.md` C.7, group E). |

Seven owner decisions gate the work. A "no" to decision 2 (the written rule "all graphics are drawn in code") stops
this approach and no other. A "no" to decision 1 (stepped zoom) stops all three.

---

## 5. Fatal flaws, with the smallest repair

**F1. Trains as specified cannot follow the track.** See W1. On a steep slope, in a loop and in a corkscrew the car
sprite disagrees with the rail under it. This is a wrong picture on the game's main ride type, not stiff motion.
*Smallest repair:* keep today's pose space and draw car bodies by code with the proposal's own `isoBox` from the
size table (`track/paint.ts:733-759`); author only noses, cab and rider stamps. Trains are then code, not data.

**F2. Stage 1 ships a look the owner already turned down, in a weaker form, and keeps it for track until stage 8.**
The stand-in draws today's vector art at scale 0.5 and cuts alpha hard (section 2.2, `standIn.ts`). Rails are 1.3
to 1.9 world pixels wide (`track/paint.ts:52-55`), so 0.65 to 0.95 of an art pixel: they break into dots. Swing
chains, spokes and ropes vanish (the proposal's risk 9 admits "40 of 85 ride lines"). The rule is that the game
stays shippable after each stage. The proposal's other option, a setting until stage 8, is not designed: the art
tests cannot point at both the vector functions and the adapters, old art cannot be deleted per stage, and the
bundle peak then sits at the limit (section 2, bundle row).
*Smallest repair:* make the stand-in a real hard-edged rasteriser (no stroke under one art pixel, for example paint
at scale 1 and keep a pixel when any quarter of it is covered), and move track before scenery. In practice this
means borrowing the rasterizer proposal's stage 1.

With both repairs no fatal flaw remains. The approach then is close to the staged hybrid: a rasteriser for geometry
and for the interim, authored data for small and static things.

## 6. Serious flaws

1. **No evidence for the core bet.** Agents must hand-author 500 or more grids, in up to four views, at draft
   quality. Nothing was authored to test this (section 3). The rasterizer proposal shows the game's real art
   functions on the pixel grid.
2. **Effort is undercounted by about a factor of two** in sprites and composer code, and stages 1, 2, 7 and 8 are
   each larger than "large" (section 4).
3. **Zoom on real devices** (section 2): a 2× jump between the two most used sizes on ratio-1 desktops; probably 3
   sizes on the measured phone profile; coarse overlays and labels on every phone above ratio 2; W4, W5.
4. **Seams and blur off a stop** and at the far view (W6); **placeholder flashes** after placements (W7).
5. **Views:** the tone-swap mirror is wrong for anything but box faces, and trees morph on a view turn.
6. **Tests:** adapters are test-only code; W2 and W3 are undesigned; one art rule is bent to pass a test.
7. **Track stage** is one table row for the most varied art in the game; braces between columns and a station roof
   have no place in the slice model.
8. **Night** is postponed to an optional stage, so smooth light and gradient bulbs sit on pixel art until then.

## 7. Verdict

Highest look ceiling of the three, because it ports the draft's own method and data, and its code facts are right.
But the core bet (agents hand-authoring 500 or more sprites in four views) has no proof, trains as specified cannot
follow slopes and loops, and stage 1 ships the turned-down filter look with broken thin lines. It survives only with
code-drawn cars and a real hard-edged stand-in, which makes it the hybrid. Largest effort.
