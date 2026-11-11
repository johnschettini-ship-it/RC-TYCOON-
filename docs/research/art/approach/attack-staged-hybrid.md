# Attack on proposal "staged-hybrid"

Reviewed 2026-11-11 against the working tree at `fab5189` (two interface-only commits after the proposal's
`0b20aea`). Repository paths are relative to `/home/user/RC-TYCOON-`. Nothing in the repository was changed, built
or run. One helper script was written and run outside the repository:
`/tmp/claude-0/-home-user-RC-TYCOON-/29ee6f8c-df84-5112-ac7e-04cfb7614dae/scratchpad/art/approach/attack-staged-hybrid-work/snap.py`
(it collects every `#rrggbb` literal under `src/render` and snaps it to the draft ramps, as the stage-1 pass would).

## Result in short

- The frame part (whole-number stretch k, whole art scale n, bucket fixed at 0.5, smoothing off, native ground
  painter) is the most carefully worked zoom design among the proposals. Its code claims are almost all right.
- The approach has **no fatal flaw**. It ships after each stage, keeps tests green by keeping the vector entry
  points, and names its own kill test (the owner rejects the pass on rides and stalls).
- Its weak point is the part it calls scaffolding. The pass is a filter, and it is a worse filter on the real art
  than the comparison sheet suggests: nearest-colour snapping of the game's 733 colours breaks form shading and
  shifts hues. After stage 2 the default becomes Pixel while rides, stalls, track and most scenery stay on that
  filter for months (until stages 5 to 8). That is the look the owner already called not good enough.
- Some objects stay on the pass for good (coaster cars, ghosts, walls, plain scenery). The draft's coaster is its
  largest object, so the end state is not the whole draft look.
- The stage sizes are too small. The real total is about 35 to 50 weeks of one worker, not the roughly 20 weeks
  that "small / medium / large" suggests.

Scores: look 6, effort 3, risk 5. Survives after the repairs in section 6.

---

## 1. Claims about the code

### 1.1 Checked and right

| Claim | Checked at |
|---|---|
| `buildSprite` is the one builder, pad 2, transform then paint, ghost wash after | `src/render/canvas.ts:50-72` |
| `makeCanvas` makes a canvas with default options, so it needs a new option for `willReadFrequently` | `src/render/canvas.ts:12-26` |
| Fake `getImageData` returns 4 bytes, so a guard "less than w × h × 4" skips the pass in Node | `tests/unit/render/fakeCanvas.ts:70-71` (returns `{ data: new Uint8ClampedArray(4) }`) |
| The recorder counts `fillRect` as a fill and measures its extent | `tests/unit/render/content/recorder.ts:69-73` |
| `applyPlan` sets canvas size and `terrain.allowExact` | `src/render/renderer.ts:898-917`, `:906` |
| Scale, bucket and unrounded offsets in one place; smoothing forced on | `src/render/renderer.ts:1059-1062, 1071`; static layer `:1018` |
| Blit math; the column cutter skips the 2-pixel pad at the first and last column | `src/render/renderer.ts:338-363`; `s0 = sp.ox + (colL − ax) × sp.scale` = pad for the first column |
| Guests stand at continuous positions | `src/render/renderer.ts:553-554` |
| Plan: phone cap 2, `low` 1, `auto` step to 1; state module | `src/perf/quality.ts:64-77, 93-138`; `src/data/tuning/perf.ts:7` |
| Wheel and keys × 1.15 through `zoomAt`; pinch through `zoomAt` | `src/input/camera.ts:13-14, 83-88`; `src/input/controller.ts:123-129, 150-153, 277-282` |
| Night pass sets smoothing and restores it | `src/render/lighting/pass.ts:159-169` |
| Terrain: bilinear height, path margins, alpha water, `OUTSIDE_FACTOR`, chunk build, 6 ms first-build budget, exact-scale slot | `src/render/terrain.ts:35, 80-82, 165-166, 312-317, 406, 542-561, 567-649` |
| Odd bounds give half-pixel anchors for litter, mess, guests with items | `src/render/sprites/litter.ts:12-13`; `src/render/sprites/props.ts:15, 17` |
| Track slice sprite is built at `track/layer.ts:691`; cars and slices have per-frame build caps | `src/render/track/layer.ts:94-95, 683-692, 840-859` |
| Tutorial needs a zoom change of 0.25 | `src/ui/scenario/tutorialUi.ts:21, 135` |
| Owner screenshot scripts use zoom 0.9, 0.82, 1.25 | `tests/e2e/screenshot.spec.ts:102`, `overview-build3.spec.ts:177`, `content.spec.ts:208`, `scenery.spec.ts:246`, `afterDark.spec.ts:271` |
| Chunk at art resolution is 260 px wide; `staticLayer.test.ts:122` wants > 300 | test line read; bench output 260 × 168 |
| Default zoom 1, spec readability at 0.5, safe palette, settings version 2 | `src/game.ts:17`; spec `…design.md:70`; `src/data/tuning/a11y.ts:15`; `src/settings/schema.ts:13` |
| Pixel 7 canvas 824 × 1830 today, 541 × 1201 at k = 2 | 412 × 915 CSS × 2 and × 1.3125 |
| The zoom level table in 3.2 | recomputed: `zoom = n × k ÷ (2 × device ratio)` gives every row as printed |
| Bench figures | `staged-hybrid-bench/bench-output.txt` matches section 5.4 (typed arrays, desktop Node) |

The renderer-never-snaps rule is a real advantage over the rasterizer proposal: the unit tests that set zoom 0.6
(`tests/unit/render/staticLayer.test.ts:204-227`, `renderer-rotation.test.ts:110-130`) keep passing. The e2e pinch
tests (`tests/e2e/phase1-smoke.spec.ts:148-211`, `track.spec.ts:191-193`) pinch by about × 3, so they still see a
larger zoom after settling.

### 1.2 Wrong or misleading

1. **"Rows 2 and 3 of the sheet are levels 1 and 2."** The sheet's rows are stand-ins with 20 or so colours and far
   fewer parts than the game's art. The real art has 1,606 colour literals in 733 values (critic B.8). Run through
   the proposal's own rule (nearest slot of the 59 draft colours, plus 4 signal slots and a snow ramp), with face
   shades made the way the art makes them (`shade(colour, 1.15)` and `shade(colour, 0.75)`, for example
   `src/render/scenery/art/kit.ts:155-157`):
   - 733 colours land on 65 slots.
   - Of 2,199 base-and-shade pairs (× 0.75, × 0.85, × 1.15), **568 (26 %) fall on the same slot**: the lit and dark
     faces of a box become one flat colour. **877 (40 %) land on another ramp**: the two faces of one box change hue.
   - Examples: cliff brown `#9a7148` → skin `k3`; queue `#a9c0d2` → snow ramp; path `#dcc79c` → cream `c3`; and in
     the sheet itself the carousel red `#e5484d` became pink `p3` (`levels.py` stand-in colour, visible in rows 2
     and 3).
   So level 1 on the real art is weaker than the sheet shows. Stage 2 only fixes colours that pass through a
   helper; colours chosen inside art functions keep the nearest-slot problem.
2. **"Stage 2 … lifts all 174 art functions at once without touching them."** The helpers carry 385 calls
   (`core.md` 2.2). The critic counts 406 direct canvas draw calls and 117 `arc`, `ellipse` or curve calls in
   `src/render` that do not go through any helper (critic C.2, C.7). Those parts get nothing from stage 2. "Lifts
   the parts drawn with helpers" is the true statement.
3. **"A native family … the existing checks hold."** Not automatically. `tests/unit/scenery/art.test.ts:69-72`
   demands that the 4 rotations do not all draw the same. A native round tree, bush or flower bed with the draft's
   fixed light from the left is symmetric and draws the same log in all four views. Each such item needs a
   rotation-dependent detail (speck seed by view rotation) or the test must change. The same holds for stalls'
   `rotation 1 differs from rotation 2` (`tests/unit/render/content/art.test.ts:147`), which the designed backs do
   cover.
4. **"A ride that misses keeps the sprite of its last frame (`rideSprites`, `renderer.ts:290`)."** `rideSprites[ri]`
   is overwritten every frame with the result of `bank.ride`, which always builds on a miss
   (`src/render/renderer.ts:453`; `src/render/sprites/bank.ts:97-111`). The cap needs a change in `bank.ride` (return
   null, or a stand-in) and a rule for a ride seen for the first time or a ghost frame (no last sprite exists).
   Small, but not "as today".
5. **The cap of 2 ride builds per frame is presented as the bound on pass cost.** Stalls, staff, scenery and show
   sprites are also built without a limit on first use (`src/render/sprites/bank.ts:113-121, 160-207`; critic fact
   8) and all of them would go through the vector paint at 4 × art size, a read-back and the pass. A view turn
   rebuilds every visible scenery picture (340 pictures exist; a park shows hundreds). At the proposal's own phone
   factor (× 4 to 6 of 0.15 ms for a stall-size pass, plus read-back) a turn with 300 items adds 200 ms or more of
   build time in one frame. The proposal sets no cap there.
6. **"Native families replacing vector families: about ± 0 bytes."** Plausible but unmeasured; a native ride must
   still draw every angle by code plus designed backs. Not wrong, but not evidence either; the 400 KB limit leaves
   room (about 91 KB) so this is not a risk.

No claim about a file and line was found wrong in a way that breaks the design.

---

## 2. The hard parts

| Hard part | Solved? | Reason |
|---|---|---|
| **Animation frames built per frame by code** | Yes for level 1; yes by design for level 3 | Level 1 reuses the existing per-angle art, so every frame exists. Cost: a bucket-2-size vector paint, a read-back from a CPU canvas and the pass (0.76 ms desktop Node for a 3 × 3 ride, so about 3 to 5 ms on the throttled phone). On a ratio-1 desktop that is about 4 × today's bucket-1 paint plus the pass. The cap of 2 per frame bounds rides only (1.2 item 5). Native rides draw per angle on the grid, as the draft carousel does; the proposal admits edge shimmer (risk 4) and offers 16 angles. Sound. |
| **Four view rotations** | Yes for level 1; designed work for level 3 | Level 1 inherits today's rotation art. Native stalls get two designed backs; rides are mostly round. Symmetric native scenery will trip `tests/unit/scenery/art.test.ts:69-72` (1.2 item 3). |
| **Continuous zoom and phone ratios** | Yes, the best answer of the proposals | Whole k by CSS `pixelated`, whole n by stepped zoom, offsets rounded, bucket fixed at 0.5. Checked: with scale `n / 2` and `sp.scale = 0.5`, `f = n`, and every static anchor and chunk origin is a multiple of 2 world pixels, so both rounded edges in all five blit copies are exact. The canvas never has more pixels than today. Costs: 4 crisp zooms on a ratio-1 monitor, a soft 0.25 overview, blocky canvas overlays on phones until stage 2, and a zoom jump when `auto` steps down mid-game (k changes, the controller re-settles). All depend on owner decision 1. |
| **Column cutter** | Half in stage 1, fixed in stage 2 | The pass outlines the whole sprite, so no ink appears inside a ride. The outline at the left and right corner pixel is cut in stage 1 (the pad is never drawn, `renderer.ts:355-359`); stage 2 widens the first and last strip. Correct. Fences and edge scenery (hedges, walls) get ink at both ends of every piece from the pass; the "open ends" remedy (risk 13) exists only for native items, and walls are among the items that "stay on the pass for good". So walls keep a seam every tile unless the pass learns an edge flag. |
| **Track slices** | Partly | Outline off for slices avoids ink at cuts. But each slice is voted alone: an art pixel that straddles a tile border gets less than 8 of 16 samples in each slice and vanishes in both, so a rail can show a one-pixel gap at every tile border in stages 1 and 2 until stage 2's whole-pixel `polyline` (whose endpoints both slices include) lands. Track is the weakest object until stage 6, and cars stay on the pass for good. |
| **Night multiply** | Deferred, honestly | Today's smooth multiply stays until stage 9 (risk 9). It is correct and readable and the approved drafts have no orange night, so this does not block shipping. Stage 9's plan (light canvas aligned to the art grid, banded pools) is plausible but needs the light divisor to follow n (`tests/unit/lighting/layer.test.ts:153-258`, listed). |
| **Terrain chunk build time** | Probably yes | 2.6 ms per 8 × 8 chunk in desktop Node, 65,000 samples. At the proposal's phone factor that is 10 to 16 ms before the promised optimisation, over the 6 ms first-build budget (`terrain.ts:406`), which still builds at least one chunk per frame. Today's vector chunks are not cheap either (a turn cost 95 to 170 ms on desktop, `terrain.ts:403-404`), so this is not a regression on desktop. Needs the phone measurement the proposal already asks for. |
| **Recorded-fill art tests** | Yes | Stages 1 and 2 keep every vector art function, so recorder tests pass. Native art answers through `emit`, which issues `fillRect` runs without a transform; the recorder counts those (`recorder.ts:69-73`), and runs stay inside bounds if the outline stays within the ±3 tolerance. Exceptions: the rotation test above, the ring test (`tests/unit/a11y/palette.test.ts:59-78`, listed) and the item-colour test (`guestItems.test.ts:68-69`, listed). |
| **Bundle limit** | Yes | + 14 to 25 KB against about 91 KB of room. Both styles ship only for stages 1 and 2. |
| **Determinism** | Yes | Native work is integer work on typed arrays with `Math.imul` hashes. Level 1 depends on the browser's anti-aliasing before the vote, which is today's property too; vote ties must be broken by slot index (easy). |

---

## 3. The look

What the drafts are made of (`concepts/pixel3.py`, and the close-up
`/tmp/claude-0/-home-user-RC-TYCOON-/29ee6f8c-df84-5112-ac7e-04cfb7614dae/scratchpad/canvas/assets/art-orange-pixel-v2-closeup.png`):
hand-placed 2 to 3 tone forms per part, inner ink lines where two layers meet (carousel roof over body), striped
cones with 16 lit and dark segments, ASCII guests with an ink border and a colour map, specks on foliage, dithered
grass patches, slab paths. Every colour is a deliberate ramp step.

What each level gives:

- **Level 1 (stages 1 to 2, the default from the end of stage 2):** silhouettes with an outer ink line, hard edges,
  palette colours chosen by nearest distance. No inner ink lines (one sprite is one silhouette), no specks, no
  stripes the vector art did not already have, broken form shading on a quarter of faces and hue jumps on 40 % (1.2
  item 1). The ground is native and good. This is the filter look with an outline and a good floor. The owner's
  "That works but I still think we can do better" applies to it directly.
- **Level 2:** better lines and two-tone cylinders where helpers draw; the rest as level 1. Still a filter.
- **Level 3:** the draft's own method, ported. For the families done this way the look can reach the drafts
  (row 4 of the proposal's sheet is credible, because it is the draft's method). Limits the proposal states itself:
  rides are smaller than in the drafts because footprints are game rules (the draft wheel is 4.7 tiles wide, the
  footprint allows 2.4), and every ride, stall back, slope, cliff and theme is new design, not a port.
- **Never native:** coaster cars in 6,144 poses, ghosts, walls and plain scenery. The draft's coaster with its
  ASCII cars is the dominant object of the approved picture. A car of about 15 × 8 art pixels made by voting a
  rotated vector box will look like a filtered blob next to native trains' lead cars (stage 6).

So the end state can come close to the drafts for people, trees, stalls and hero rides, with a visible step down
on the coaster trains and on the "stays on the pass" items. The long middle (stages 2 to 7, months) shows the
filter look on the largest objects on screen. The proposal's ordering by screen share puts rides last; the
owner's judgement is formed by rides and the coaster (they dominate the draft), so ordering by what the owner
looks at would differ.

---

## 4. Effort

Counts from the maps: 306 draw functions, about 8,720 lines; world art 174 functions / 5,251 lines; overlays and
ghosts 35 / 1,070; per-frame effects 22 / 759; files read here for size.

| Stage | Proposal | What it really holds | Honest size |
|---|---|---|---|
| 1 Frame | large | grid, stepped zoom on three inputs, plan with k, pass with read-back, palette and snap table, ground painter with 15 slope shapes, cliffs, 5 terrain types, paths with joins, queues with rails, water, settings migration to version 3, about 10 test files | 4 to 5 weeks |
| 2 Helpers | medium (1 to 2 weeks) | 34 helpers re-ruled, plus ghosts and overlays in `renderer.ts`, `management`, `a11y`, `fields`, `terrainTools`, `scenery`, `shows`, `track` layers (group E is 1,070 lines), dither fills, snapping of walkers and cars, column margins, card pictures, owner review | 3 to 4 weeks |
| 3 People | medium | guest stamps in 2 views × 4 poses × items, staff 4 types × costumes × actions (`sprites/staff.ts` 363 lines), litter and mess, path items, fence, arch, mascots and portraits (`mascotArt.ts` 134, `ui/mascots.ts` 209), removal of classic | 3 weeks |
| 4 Green and water | medium | 25 items natively in 4 views, water twinkle layer, cliffs and terrain types tuned | 2 to 3 weeks |
| 5 Stalls, gates, decks | medium | 14 stalls × 2 designed fronts and backs, gate booths, elevated decks and ramps (`elevated/layer.ts` 213) | 2 to 3 weeks |
| 6 Track | large | stations, channels, boats, lead cars; `track/paint.ts` 928 and `track/layer.ts` 1,103 lines | 4 to 6 weeks |
| 7 Hero rides | large | 18 rides (1,453 lines today), each with code-drawn angles, riders, swing, 4 views, bulbs exported to the night pass | 8 to 12 weeks |
| 8 Other themes | large | 60 items in 5 theme files (about 1,400 lines today) plus 2 show sites | 4 to 6 weeks |
| 9 Night, weather, shows | medium | `lighting/*` (about 940 lines), `shows/fx.ts` 289, weather | 3 to 4 weeks |
| 10 Close-out | small | | 1 week |

Total about 35 to 50 weeks of one worker. The labels in the proposal read as 15 to 25 weeks. Stages 4 to 8 can run
in parallel (true: they touch separate files after stage 3), which shortens the calendar, not the work. The
scaffolding also has a cost of its own: the pass, its tests and the classic switch are built and then partly
removed.

---

## 5. Fatal and serious

**Fatal:** none. The approach can work as written; the kill test in its section 9 is the right gate.

**Serious:**

1. Nearest-slot snapping on the real art destroys face shading (26 % of shade pairs) and shifts hues (40 %). The
   pass on the real game will look worse than the sheet, and the sheet is the proposal's main evidence for stages 1
   and 2.
2. From the end of stage 2 until stages 5 to 8 the shipped default is the filter look on rides, stalls, track and
   most scenery: the look the owner already turned down. Coaster cars, ghosts, walls and plain scenery keep it for
   good.
3. Pass cost is capped only for rides. Stalls, staff, scenery and show sprites go through paint at 4 × art size,
   read-back and pass without limit; a view turn on the phone profile can spike by hundreds of milliseconds.
4. Track slices voted one by one can lose the art pixel at each tile border (rail gaps) until stage 2; walls and
   fences carry ink at every piece end for as long as they are on the pass.
5. Stage sizes are about half of the real work (section 4).
6. Stepped zoom (4 crisp sizes on a ratio-1 monitor, soft overview) is an owner decision the whole design rests on;
   it is not taken yet.

---

## 6. Smallest repairs

1. **Replace nearest-RGB snapping with a ramp-preserving colour map.** Assign each of the 733 literal colours (or
   each base colour passed to `shade`) a ramp and tone once, in a generated table checked by a unit test: a face
   pair of one box must land on two different tones of the same ramp. `shade(c, f)` then moves tones on that ramp.
   This is a few days and removes serious flaw 1.
2. **Do not make Pixel the default on the pass alone.** Flip the default only once people, trees, stalls and at
   least the four draft rides (carousel, wheel, tower, coaster train) are native, i.e. pull the heroes forward
   before scenery themes. The owner then never lives with the filter look on what dominates the draft.
3. **One shared per-frame budget (in ms) for every pass build,** with the previous or a stand-in sprite while
   waiting, as terrain chunks already do (`terrain.ts:400-406`).
4. **Give the pass an edge flag** (no ink and no vote loss on the sides of a sprite that touch a neighbour piece),
   used by slices, fences and edge scenery.
5. **Re-size the plan** with the figures of section 4 before the owner commits.
6. **Decide coaster cars natively:** 16 yaw steps × a few pitch steps as stamps or kit boxes, with the pass only
   for roll and steep pitch, instead of "pass for good".

With repairs 1 to 3 the approach survives: the frame and ground work is reusable whatever happens, and the native
kit is the draft's method.
