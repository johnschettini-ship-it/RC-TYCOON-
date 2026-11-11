# Attack on proposal "rasterizer"

Reviewed 2026-11-11 against the working tree at commit `fab5189` (two interface-only commits after the proposal's
`0b20aea`). Repository paths are relative to `/home/user/RC-TYCOON-`. Nothing in the repository was changed, built or
tested. `POC/` means
`/tmp/claude-0/-home-user-RC-TYCOON-/29ee6f8c-df84-5112-ac7e-04cfb7614dae/scratchpad/art/approach/rasterizer-poc/`.

What I did beyond reading: I re-ran the proposal's own `POC/bench.mjs` (it only reads `src/`), and I ran the proof
palette's own `snap` function over the game's colour literals to see what "nearest slot" does to them. Both results
are quoted below.

## Result in short

- The core idea is sound and is the best-proven part of any proposal: a small rasteriser that speaks the Canvas path
  calls, sets whole art pixels, and never reads a canvas back. The timings reproduce.
- It has **one flaw that is fatal as written**: stage 2 is not a shippable game. Nearest-slot colour snapping and
  one ink ring per sprite give wrong colours and broken track, not just a "plain" look. The repair is small.
- The draft look does not come from the rasteriser. It comes from re-writing about 135 object functions in stages
  4 to 7. The proposal says this in its risk list, but its stage sizes and its "day one" sentence hide it.
- Track (the largest object in the approved draft) has no proof picture and the thinnest design.
- Verdict: survives after the repairs in section 6. Scores: look 7, effort 3, risk 5.

---

## 1. Claims about the code

### 1.1 Claims I checked and found right

| Claim | Checked at |
|---|---|
| `buildSprite` is the one sprite builder, with 14 call sites (9 in `bank.ts`, `scenery/sprites.ts:77`, `shows/layer.ts:101`, `track/layer.ts:691, 830, 859`) | `src/render/canvas.ts:56-72`; grep gives exactly these 14 |
| Blit and column cutter; the left and right pad of a ride sprite is never drawn | `src/render/renderer.ts:338-363`; `s0 = sp.ox + (colL − ax) × sp.scale` equals the pad for the first column (`:355`) |
| Columns are 32 world pixels wide, anchored at the footprint's left corner | `src/render/renderer.ts:455-462` |
| Frame set-up lines (camera clamp, scale, bucket, offsets, smoothing) | `src/render/renderer.ts:1058-1071` |
| `applyPlan` sets the canvas size from the plan; exact-scale terrain is one flag | `src/render/renderer.ts:898-917`, `:906` |
| `renderPlan`, phone class, `auto` step down | `src/perf/quality.ts:31-35, 64-77` |
| Terrain: tile painter, seam growth, path shape, tile paint, slope light, alpha water, chunk build, exact-scale path, chunk blit, 6 ms first-build rule | `src/render/terrain.ts:28-40, 56-163, 172-189, 258-330, 292-296, 312-317, 407, 542-561, 588-589, 605, 618, 632, 638-643` |
| Primitives `box`, `cylinder`, `cone`, `pyramid`, `head`; the light is decided by the caller's colours and by screen side | `src/render/sprites/shapes.ts:58-73, 97-114, 127-156, 159-167, 170-179` |
| Kit helpers; 62 `shadow` and 25 `glow` calls in scenery art | `src/render/scenery/art/kit.ts:91-93, 160-165`; `src/render/sprites/content/kit.ts:29-117`; `src/render/track/paint.ts:142-166, 169, 178, 332` |
| Track slices are runs of samples per tile; slice, gate and car sprites come from `buildSprite` | `src/render/track/layer.ts:175-190, 683-692, 830, 840-859` |
| Wheel, key and pinch zoom all go through `zoomAt` | `src/input/controller.ts:123-129, 150-153, 277-282`; `src/render/camera.ts:31-37` |
| The night pass sets smoothing on and restores the earlier value | `src/render/lighting/pass.ts:159-169` |
| Recorder tests take the context as a `Proxy` and log unknown methods, so `ctx.layer?.()` is harmless there | `tests/unit/render/content/recorder.ts:96-110`; `tests/unit/render/track/slices.test.ts:21-48` |
| Scenery placement already dirties terrain chunks (centre items write `Content.Scenery`) | `src/sim/scenery/commands.ts:60`; `src/render/terrainTracker.ts:22` |
| Sprite build times | Re-run here: rides mean 0.285 ms, p95 0.46, max 0.88; stalls 0.10; scenery 0.12; guests 0.024 (Node 22.23, warm) |

### 1.2 Claims that are wrong or misleading

1. **"`rasterizer-proof-baseline-sheet.png` … is what the game looks like after stage 2."** Wrong. The sheet stands
   on the draft's grass, which is stage 3 work. In stage 2 the chunk is built "with the existing `TilePainter` calls"
   (proposal 9, day 1, step 5), so the ground is today's colours (`src/render/terrain.ts:28-40`) pushed through
   nearest-slot snapping. With the proof's own `Palette.snap`:

   | Today | Snaps to | Effect |
   |---|---|---|
   | grass `#6dbb4f` / `#64b049` (the two per-tile shades, `terrain.ts:29, 291`) | `l2 #8fc04a` / `l3 #5a9a44` | Two slots. A difference of about 10 per channel becomes 53 / 38 / 6: a hard random checkerboard over the whole map. Plain RGB distance gives the same split. |
   | queue fill `#a9c0d2` (`terrain.ts:40`) | `a1 #8fe3d6` | Queues take the water colour. |
   | sand `#e3cf8f` / `#dac584` | `s2` / `c3` | The two shades land on two different ramps. |
   | land outside the park (× 0.78, `terrain.ts:35, 294`) | sand → `c4`, snow → `c3`, path edge → `g5` | Hue changes, not a darker tone. |
   | snow `#f2f6fa` / `#e6edf3` | both `c1` cream | Snow is no longer white or cold. |

2. **"Art that uses anything else … stops compiling; grep finds none in sprite art today"** (section 2.2, `Ctx` row).
   Sprite art calls `ctx.translate` (`src/render/sprites/props.ts:171`, a sitting guest) and `ctx.scale`
   (`src/render/sprites/litter.ts:161, 217`). Neither is in the `ArtCtx` member list of section 2.1. The proof
   context has both (`POC/pixelctx.mjs:144-151`), which is why the proof ran. Stage 2 lists `sprites/shapes.ts (type
   only)`, so as written stage 2 does not compile; guests and litter are only replaced in stage 4.

3. **"`shapes.ts:6` `Ctx` becomes the interface `ArtCtx`."** `Ctx` is also the type of every canvas made by
   `makeCanvas` (`src/render/canvas.ts:12, 23`) and is used for `setTransform`, `drawImage` and compositing in
   `src/render/terrain.ts:66, 550`, `src/render/renderer.ts:940` and `src/render/track/preview.ts:86`. It cannot be
   narrowed in place. Two types are needed, and `paintSlice` is typed with the DOM types directly
   (`src/render/track/layer.ts:321`).

4. **"It … runs in Node as it is" and the list of tests that change.** True for the surface, not for the copy into
   the cached image. The renderer unit tests run `buildSprite` on `FakeCanvas`, whose context returns `undefined`
   for `createImageData` and `putImageData` (`tests/unit/render/fakeCanvas.ts:46-75`), and Node has no `ImageData`.
   `blitTo` as described throws there, or needs a guard; the helper is not in the list. Also missing from the list:
   - `tests/unit/render/staticLayer.test.ts:204-227`: `dots(0.6)` must be 0 at ratio 1. With the renderer snapping
     zoom (section 3, "the renderer snaps any other zoom"), 0.6 becomes 0.5 and guests are dots. Fails.
   - `tests/unit/render/renderer-rotation.test.ts:110-130`: the same case at zoom 0.6. Fails.
   - `tests/unit/render/terrain.test.ts` from about line 211 to 262: stand-in, refine, "3 zoom buckets" and prefetch
     cases use buckets 1 and 2. The proposal lists only `:125-164`.
   - `tests/unit/render/track/slices.test.ts:105-112` in stage 6: "painted one sample past its ends" leaves the slice
     bounds ± 3 unless `sliceBounds` (`src/render/track/layer.ts:303`) grows.
   - `tests/unit/render/terrainTracker.test.ts:83` if lamps and benches get a baked shadow.

5. **"On a 2.625× phone the canvas has 57 % fewer pixels than today."** The comparison is with a fixed ratio of 2,
   which misses the budget today (frame p95 83 ms, `docs/adr/0001-renderer.md`, phone table). The setting that
   passes today is `auto` after its step down to ratio 1 (same table, "Render scale 1×"). Against that, `m = 2`
   (ratio 1.3125) has 72 % **more** canvas pixels. The only step below it is `m = 3` (ratio 0.875), with overlays in
   3 × 3 device pixel blocks and three zoom levels.

6. **Small.** The Canvas call counts differ slightly from a grep of `src/render` at `fab5189` (207 `beginPath`,
   190 `lineTo`, 148 `fill`, 124 `moveTo`, 95 `stroke`, 94 `fillRect`, 59 `closePath`, 45 `arc`, 40 `ellipse`,
   26 `quadraticCurveTo`). Nothing depends on it.

---

## 2. The hard parts

| Hard part | Solved? | Reason |
|---|---|---|
| **Animation frames built by code** | **Yes** | The art functions keep their inputs; a frame is one more call. The build cost reproduces (0.29 ms mean per ride). Open points: the bench is warm V8 on a server core and leaves out canvas creation and the image copy; cars (6,144 poses per shape) and track slices were never run through the proof; "a sprite that waits shows its previous frame" needs new state in `bank.ride` (`src/render/sprites/bank.ts:97-111` returns synchronously today); turning hard-edged polygons crawl by a pixel, which the proposal admits. |
| **Four view rotations** | **Mostly** | Procedural art is painted in view space, and lit and dark are picked by screen side, so it carries over. Stamps do not: `flip` mirrors the shading too, so the light jumps to the screen right on two of four facings. The proposal has no rule to swap lit and dark letters on a flip. Car sprites "for the 16 headings" (risk 3) cannot be inside the count of "about 180 sprites": there are 11 car shapes (`src/render/track/layer.ts:110`), each with a front and a following car, so 9 distinct headings give about 200 sprites for cars alone. |
| **Continuous zoom and phone ratios** | **Yes, by removing them** | Whole-number levels and a whole-number canvas pixel size are a complete and consistent rule. It is an owner decision, stated as one. Costs not stated: on a 1× desktop guests are sprites at three levels only (1, 1.5, 2), because 0.5 is the dot level (`src/data/tuning/perf.ts:12`); the 0.25 level is a smoothed picture, which is the filter look; two unit tests break (1.2 item 4); `src/main.ts:31-35` observes the canvas itself, and once the renderer sets the canvas CSS size the observer no longer sees the window change, so a wrapper element must be observed. |
| **Column cutter** | **Yes for rides, 2 × 2 scenery and the show tower** | The outline is made before the cut, columns fall on multiples of 16 art pixels, and the `edge` flag draws the pad of the first and last column. Checked against `renderer.ts:350-363, 455-462` and `scenery/layer.ts:60-83, 126-133`. |
| **Outlines at other cuts (track slices, fences)** | **No** | See flaw F1 and S2. A ring per slice puts ink across the rail at every tile border. `seam(x, y, r)` as a radius also removes the side ink near the cut, in both neighbours, at the same point: a gap in the rail outline every tile unless each slice overshoots by more than `r` and both slices raster the same pixels. The rule that works is a cut line, not a radius. Not designed, not proven. |
| **Night multiply pass** | **Not solved, postponed** | Stages 2 to 8 keep the smooth quarter-size multiply, so at night the picture is crisp art under a soft gradient with colours off the palette. That is acceptable because no night was approved. Stage 9 is a sketch ("banded discs, the multiply stays"), and is offered as optional. |
| **Terrain chunk build time** | **Believable, not measured** | 16,400 ground pixels per chunk at the measured 100 ns is 1.6 ms for flat draft grass. Slopes add an inverse projection with two height rounds per pixel, shadows and shore tests. 2 to 4 ms on a desktop is credible; 8 to 16 ms on the phone profile is above the 6 ms rule, so a phone builds one chunk per frame, as it does today. No regression, no gain. The "1 ms and 4 ms" target has no basis yet. |
| **Art unit tests that record fills** | **Yes** | The recorders stand in for the context; stamps issue `fillRect` runs; `layer` and `seam` are optional calls. This is the strongest point against the other approaches. The gaps are in the pipeline tests (1.2 item 4), not in the art tests. |
| **Bundle limit** | **Yes** | + 18 to 24 KB is plausible (the proof rasteriser is 5.6 KB gzipped with comments). Even twice that fits in the 91 KB of room. Needs a clean build measurement. |
| **Determinism** | **Yes** | Whole-number raster, `Math.imul` hashes, no time, no random numbers, no canvas read-back (so browser fingerprint noise cannot touch it). Pixel equality across engines is not guaranteed where an edge passes exactly through a pixel centre (`Math.sin` and `Math.cos` differ in the last bit), but that is no worse than today, and golden hashes run in Node only. |

---

## 3. Flaws

### Fatal as written

**F1. Stage 2 is not shippable, and the brief demands a shippable game after each stage.** Stage 2 switches the whole
park to "nearest slot + one ink ring per sprite" with no way back (the flag is removed in stage 2 and the vector
look is not kept). What that gives is not "plain"; parts of it are wrong:

- **Ground:** checkerboard grass, water-coloured queues, off-hue sand, snow and outside land (table in 1.2 item 1).
- **Colour collapse is far larger than "a few faces":** the game's 733 colour values land on 57 slots. 75 different
  values land on `c1`, and **42 different dark values land on `i3`, the ink slot**, so dark fills merge with the
  outline. The palette has no neutral grey: of 124 grey values, 47 land on a slot with a clear tint (cream,
  tan, mint or dark green). Examples: silver `#c4ccd6` → mint `t1`; charcoal `#3a414c`, `#434b57`, `#4a505a` → dark
  green `l5`. Two of the 12 player
  track colours change hue this way (`src/render/track/colours.ts:15-16`: silver → `t1`, charcoal → `l5`). The
  bumper-car floor (`#4a505c`, `#555c69`, `src/render/sprites/content/gentleRides.ts:18, 22`) is already dark green
  in the baseline sheet for this reason.
- **Track and fences:** every slice sprite (`track/layer.ts:691`) and every fence segment gets its own ring, so ink
  crosses the rails at each tile border until stage 6 and stage 7.
- **Mixed methods on screen:** elevated decks, chain, ripples, spray, riders on cars, weather and all overlays stay
  smooth vector drawing over the pixel map for one to seven stages (22 + 35 functions, critic table C.7).

The proposal half admits this ("the owner may see the filter look again", "I would wait for stage 5"), which means
stages 2 to 4 are stages that must not ship.

**Smallest repair:** (a) stage 2 carries a hand-made colour table for terrain, paths and queues (the stage 3 ramps
moved forward) and one neutral grey ramp; (b) `buildSprite` gets `ink: false` for track slices and fence
segments until seams exist; (c) dark fills are kept one step off `i3`; (d) the `?pixel=1` flag stays until
the owner signs off stage 5, which is possible only while art functions are not yet edited for pixels, so stages 3
to 5 must be planned as "works on both surfaces" or merged behind the flag as one release. About two to four days
of extra work in stage 2, and a decision about the flag.

### Serious

**S1. The draft look is in the per-object work, not in the method.** Compare the baseline sheet with the tuned
scene. The only object at draft level is the carousel that was re-written (about 65 lines at `POC/proof2.mjs:60-126`,
a port of `pixel3.py:454-482`). In the same picture the game's own stalls and trees are clearly below the draft:
one-tone canopies against the draft's three tones and specks (`pixel3.py:312-327`), tent stalls against the
draft's striped-awning houses (`pixel3.py:424-442`), and dither dots around every trunk. So the plan is really
"build the surface (stages 1 to 3), then author 20 rides, 12 stalls, 13 track painters, 98 scenery functions and
about 180 sprites". The rasteriser makes that authoring possible and testable. It does not make it small.

**S2. Track has no proof and is the draft's showpiece.** No picture shows a rail, a support, a train, a slope piece
or a station. The draft coaster is one fixed spline with a 3-pixel ribbon, an un-inked lattice and one upright car
stamp (`pixel3.py:524-579`). The game has 12 track types, any heading, pitch and roll, per-tile slices, and cars in
6,144 poses. The proposal's own numbers say the two rails are 4.3 art pixels apart and cars are about 8 pixels
long. With a 1-pixel ink ring that is mostly ink. The seam rule is not workable as stated (section 2). Riders on
cars are drawn every frame as a vector ellipse and circle each (`track/layer.ts:881-921`) and must be re-placed on
the art grid.

**S3. Baked ground shadows have no source of shapes.** The draft's shadows are a large part of its look
(`pixel3.py:172-184`). The proposal bakes them into chunks, but the 62 `shadow` calls sit inside the item art with
their own positions and radii (`scenery/art/kit.ts:91`), and rides, stalls, track supports and fences have no
shadow shape at all. Either the chunk builder runs every nearby art function against a collector context (about
0.1 ms each, up to dozens per chunk) or about 130 object kinds get a new shadow record per rotation. Tall objects
throw a shadow further than the one-tile neighbour rule of the tracker (`terrainTracker.ts:3-5`). Edge scenery
and path items do not dirty chunks at all (`tests/unit/render/terrainTracker.test.ts:83`). "Changed in one place
each" is not true.

**S4. Movement on the art grid.** `blitArt` rounds x and y of a walker separately. A guest moves about 0.53 art
pixels a frame in x and 0.27 in y, so the two steps fall on different frames and the walk along a 2:1 path wobbles.
The same holds for trains. The proposal states "people move in whole art pixels" as a feature and has no rule for
snapping along the direction of travel.

**S5. Browser performance is not measured, and the phone comparison is against the wrong baseline** (1.2 item 5).
Every blit becomes a scaled draw (today chunks are 1:1 copies on desktops, `terrain.ts:414-418`: "a software
canvas pays about 5× for a filtered draw"). Nearest-neighbour scaling is cheaper than filtering, and sources are 4
to 16 times smaller, so it will probably pass; but it is the main number, and it does not exist yet. The proposal
says so and makes it a kill rule, which is right.

**S6. One art code base, no fallback.** Stages 3 to 7 edit the same functions that draw the vector look (`tone`
for `shade`, stamps for shapes, `layer` calls). After stage 3 there is no old look to return to. If the owner
rejects the look at stage 5, the cost of going back is the whole of stages 2 to 5.

### Smaller

- Stamps carry their own ink letter and also get the automatic ring: a double outline unless stamped sprites are
  built with `ink: false` or the letter is dropped. Not stated.
- The draft's ground details (about 1,770 tufts, flowers and rocks, `pixel3.py:746-767`) are not in the coverage
  table.
- Stand-ins stay vector: `drawPlainSlice`, `drawPlainCar` (`track/layer.ts:698, 870`) and the flat chunk
  placeholder `#67b24b` (`terrain.ts:411`) flash smooth shapes in another green while builds wait.
- Far-zoom guest dots use the raw shirt colours, sprites use snapped ones.
- Stage 1 ships stepped zoom with no gain for the player (four or five levels, vector art as before).

---

## 4. The look

**Can it reach the drafts?** For the things the draft shows and that are re-written the draft's way: yes. The
method is the draft's own (hard primitives, ramps, layers with an ink ring, stamps, per-pixel ground), and the tuned
carousel and the guest row prove it inside the game's rules (3 × 3 footprint, angle and rider inputs, fills on a
context).

**Would the owner see the filter look again?** Yes, for a long time, unless stages are held back:

- Stage 2 is by construction a filter: the same vector shapes, re-rastered and snapped. It is a better filter than
  the one the owner saw (exact 2:1 stairs, no soft edge left, a real outline), but the baseline sheet shows what it
  is: small flat shapes, blob guests, icon smudges, a wheel that is a dense blue knot.
- Stage 3 (re-made primitives) adds a dark side and a highlight. `rasterizer-proof-baseline-vs-primitives.png`
  shows how little that changes.
- The scenery sheets: at this resolution most items are 10 to 20 art pixels. About half read as meant, a quarter
  are dark blobs (the volcano and spooky sets), and all carry dither dots. This is 85 items × 4 facings to fix.

**Where the ceiling is below the draft, whatever the effort:** the big wheel is about a third smaller than the
draft's (3 tiles against 4.7); rails at any angle never have the draft's clean ribbon; rotating parts shimmer; zoom
levels above the draft scale show 3 to 8 device pixels per art pixel; night is a smooth wash.

Score for the look it can reach: **7 of 10**. Expected look if the per-object stages are cut short: 4 to 5.

---

## 5. The effort

The proposal gives sizes in words only. Against the maps (critic table C.7):

| Stage | Proposal says | What it really holds | My size |
|---|---|---|---|
| 1 Pixel grid | medium | 5 blit copies (87 lines), zoom levels, input, 4 tests | medium |
| 2 Rasteriser core | large | surface (541 lines in the proof, more with seams, remap, pooling), palette, `buildSprite`, chunk build, plan and CSS and `main.ts`, 4 preview paths, 4 changed test files with more cases than listed plus the fake canvas helper, 4 new test files, plus the repair of F1 | large to very large |
| 3 Primitives and ground | large | 34 primitives (458 lines), draft ground on slopes, cliffs, water, 5 terrain types (new design, owner review), baked shadows with no shape source (S3), elevated decks | very large |
| 4 People and small things | medium | guests, 4 staff types with walk and work frames, 3 costumes, bench, bin, lamp, litter: 15 functions, 590 lines, about 70 sprites | large |
| 5 Flat rides and stalls | large | 34 functions, 2,100 lines re-written at about 60 to 100 lines each, about 50 part sprites, bulb positions, a review sheet of 19 rides × 4 views × frames | very large |
| 6 Track | large | 13 painters (670 lines), 6 per-frame effects (169 lines), seams, supports, car sprites; no proof | very large, highest risk |
| 7 Scenery | large, "many small edits" | 98 functions, 1,475 lines, 340 pictures to review; the sheets show it is more than small edits | large |
| 8 Overlays, cards, mascots | medium | 35 overlay functions (1,070 lines) turned into sprites per slope shape, 4 preview paths, 7 mascot functions | large |
| 9 Night, shows, weather | medium | about 11 functions | medium |
| 10 Clean-up | small | | small |

In total about 5,250 lines of world art are touched, most of them re-written in stages 4 to 7, on top of about
3,000 lines of new plumbing, about 1,500 lines of overlays and effects, and 26 test files by the proposal's own count
(9 of them new) plus the cases in 1.2 item 4.
That is the size of re-doing the art layer once, with the structure kept. Sentence 5 of the proposal ("on the first
day … all 174 world art functions come out crisp") is true and is not the job.

Score: **3 of 10** (10 = small).

---

## 6. Repairs I would require before choosing this approach

1. Fix F1: stage 2 with a hand-made terrain colour table, a grey ramp, `ink: false` for sliced sprites, dark fills
   kept off the ink slot; keep the flag until the owner approves.
2. Add a track picture to the two-day prototype: one coaster with a lift hill, a turn, a station and a train, in
   two views, with seams as cut lines. If it does not look right there, this approach loses its largest object.
3. Say where baked shadow shapes come from, and what it costs per chunk build.
4. Put `translate` and `scale` into `ArtCtx`, keep `Ctx` for real canvases, and guard `blitTo` outside a browser.
5. List the missing tests (1.2 item 4) and observe a wrapper element instead of the canvas in `main.ts`.
6. Measure the phone profile against today's `auto` result, not against ratio 2.
7. Give stamps a flip that swaps lit and dark, and snap walkers along their direction of travel.

## 7. Against the other two proposals, in one paragraph

All three share the same grid rule, the same ground rule and the same end state for small things (authored stamps).
This one differs in how old art is carried meanwhile: a true re-raster instead of a read-back filter (hybrid) or a
stand-in filter (authored). That choice keeps the art unit tests alive, needs no canvas read-back, and gives real
pixels in Node tests. Its weakness is the same as the hybrid's first stage (the filter look on screen) without the
hybrid's "Classic or Pixel" switch, and it promises less authored art than "authored" for exactly the objects where
the draft is strongest.

## 8. Scores and verdict

- **Look: 7.** The draft's own method, proven on one ride and on guests; the ceiling is set by object size, track
  and motion.
- **Effort: 3.** Ten stages, six of them large or larger; nearly all art functions are re-written.
- **Risk: 5.** The core is proven and the kill rules are honest; stage 2 as written is not shippable, track is
  unproven, browser speed is unmeasured, and there is no way back after stage 3.

**Verdict.** Sound engine, honest proofs, wrong picture of the cost. The rasteriser is the right base and keeps the
art tests alive, but it is a better filter until about 135 object functions are re-written. Stage 2 as written
ships wrong colours and broken track outlines; repair it, keep the flag until the owner approves, and prove track
in the prototype. Survives with those changes.
