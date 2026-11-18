# Phase 8c batch 5: track rides — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bake every track ride type in the realistic look: the 12 types in `src/data/track/trackTypes.ts` and the 5 new types from rides batch C (`launch_coaster`, `mine_train`, `water_coaster`, `flying_coaster`, `sky_ride`). That means every piece of each type, its supports, its cars full and empty (F7), shadows, chain lifts and water channels, all inside the 128 MiB decode budget.

**Architecture:** Stage 1 baked one type (`tools/art3d/items/steel_coaster.js`, 18 of its 34 pieces). Batch 5 turns that module into a shared **track kit**: rail profiles, support styles, car builder, pose and piece classes, frame keys and one `bakeTrackType(B, spec)` loop. Each type then becomes a small module that passes a style spec to the kit. On the game side, rail and car sets are split into **classes** (piece groups for rails, pose classes for cars). The scope then decodes only the classes and headings a built circuit uses, not the whole type. Rails that take the track colour everywhere tint by alpha, with no mask sheet. There are three sub-batches: 5a builds the kit and the dry gravity coasters, 5b the powered and suspended types, and 5c the water types. Each sub-batch ends with owner approval (D9).

**Tech Stack:** three.js 0.160 (vendored build tool), headless Chromium bake, TypeScript reader, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/thrills-and-chills/phase-8c-realistic-art.md` (§5.3 track rides, §5.4 loading by set, §5.5 shadows, §5.6 big objects, §5.7 colour changes, §8 originality, F7 riders). Roadmap: `docs/superpowers/plans/2026-11-14-phase-8c-full-build.md` (batch 5 row). New types: `docs/superpowers/specs/2026-11-17-new-rides-design.md` (batch C). Batch 0 notes: `phase-8c-full-evidence/batch0-deferred.md` (Task 5 deferrals on the track projection are fixed here). Format: the batch 1 plan, `2026-11-15-phase-8c-batch-1-flat-rides.md`.

---

## What exists today (measured 2026-11-17 on `phase8c-full` at `d480ae8`)

**Track types and pieces** (`ALL_TRACK_TYPES`; pieces = set ∩ groups − excludes; rail tiles at one heading from `pieceWorldTiles`; car poses from `tools/art3d/poses.ts reachedPoses`, before spin and front-car variants):

| Type | Rail / supports / car style | Default colours (track, supports, cars) | Pieces | Rail tiles | Car poses |
|---|---|---|---|---|---|
| steel_coaster | steel / round / coaster | 0, 9, 1 | 34 | 92 | 472 |
| junior_coaster | steel (junior gauge) / round / junior | 3, 9, 4 | 20 | 36 | 120 |
| mini_railway | narrow / pillar / loco | 10, 9, 6 | 12 | 20 | 48 |
| wooden_coaster | wood / lattice / coaster | 11, 11, 0 | 26 | 42 | 136 |
| spinning_mouse | steel / round / mouse (spins) | 2, 9, 5 | 18 | 18 | 64 |
| ghost_train | tunnel / pillar / ghost | 7, 9, 8 | 13 | 21 | 48 |
| go_karts | kart / pillar / kart | 9, 9, 1 | 12 | 20 | 48 |
| log_flume | flume / lattice / log | 11, 11, 11 | 10 | 19 | 44 |
| rapids_raft | rapids / pillar / raft (spins) | 9, 9, 1 | 11 | 19 | 44 |
| inverted_coaster | inverted / arm / inverted | 6, 9, 0 | 34 | 92 | 472 |
| bobsled_run | bobsled / round / bobsled | 7, 9, 3 | 23 | 59 | 228 |
| monorail | beam / pillar / monorail | 9, 9, 5 | 12 | 20 | 48 |

There are 56 pieces in all: 31 rail pieces in `pieces.ts`, 6 in `extraPieces.ts` (corkscrew, helix) and 21 in `waterPieces.ts`. For the 12 types that is 458 rail tiles per heading. The steel set's car poses by group: the base groups give 64 poses; banks add 72, loops 60, corkscrews 180 and helixes 200.

**Rendering path today.** In the realistic look, `src/render/track/layer.ts` `drawSlice` asks `look.rail(type, pieceId, tile, heading, colours.track)`. The heading is `(piece.dir + view turn) mod 4` and the anchor is the tile centre at `piece.z` (`realRailPlacement`). Before the rail it stacks `look.support(type, part, heading, colours.supports)` from `supportStack` (foot, 1 m segments, top). `drawCar` asks `look.car(type, yaw, pitch, roll, full, colours.cars)` with `quantisePose` steps (yaw 32, pitch and roll 24). If any getter returns `undefined`, today's slice or car draws instead, so an unbaked piece of a baked type falls back piece by piece. Chain dashes (`drawChain`), water ripples (`drawWater`) and spray stay live overlays in both looks. The realistic path ignores the spin frame and the front-car flag, and it draws no shadow for track.

**Colours.** There are three colour rows per ride (`TrackRideData.colours.track | supports | cars`), each an index into the 12-colour `TRACK_PALETTE`. Every track kind tints frame by frame in the shared tint atlas (`src/render/real/tintAtlas.ts`: pages 1024 × 256 px or as tall as the tallest frame, frames at most 1024 px on a side, `TINT_ATLAS_MAX_PAGES = 24`, 24 MiB, every page admitted to the 128 MiB budget). The tint is luminance × colour on the mask. Track masks stay decoded, because frames tint on demand. Ride sets are different: their masks are decoded only while a coloured set is tinted.

**Sets and memory today.** Sets are `rail:<type>:d<2|4>:r<heading>` (all four headings wanted for every built type, `look/scope.ts`), `support:<type>:d*:r<heading>` and `car:<type>:d*:rall`. The stage 1 steel coaster at d4 has rail sheets of 755 × 817 per heading plus masks, and a car sheet of 1159 × 1140 (64 poses × full/empty) plus its mask. Its real d4 holding is (4 × 2.47 + 0.1 + 5.28) MiB × 2 for masks, about **30 MiB**. The size report shows 10.6 MiB, because `decodedPerTurn` takes the peak of one rotation and ignores headings and resident masks; this is fixed in Task 1. Compressed, the type is 0.93 MB. The bake projects the full track at 11.3 MB using the flat 25.8 KB per piece of simple pieces (`size-report.json`); this underestimates loops, helixes and the car poses.

**Projection if nothing changes** (calibrated on the stage 1 sheets; the bake prints true numbers): the full steel or inverted coaster at d4 holds about 73 MiB of rails (4 headings + masks) plus 74 MiB of cars (472 poses + masks). That is about **147 MiB for one coaster**, more than the whole budget. Bobsled holds about 78 MiB and wooden about 49 MiB. **Batch 5 cannot ship with today's set layout.** Task 2 changes the layout before any type grows past the stage 1 piece list.

---

## Global Constraints

- Branch `phase8c-full` (head `d480ae8` at plan time). Task branches are `b5-tN` in worktrees `/home/user/tc-b5-*`, and the controller merges. No merge to `main`.
- The 5 new types are game content built on `rides-c1` (`/home/user/tc-rides-c1`; at plan time it has no commits past `d480ae8`). Batch 5 never edits their game rows. Their art tasks (5a-L, 5a-M, 5b-F, 5b-S, 5c-W) start only after `rides-c1` merges into `phase8c-full`. Until then the kit and the 12 existing types proceed alone.
- Originality (spec §8): every model, texture and light is made by code in this project. Nothing is downloaded, traced or generated, and no existing game's ride designs, names or look may be copied. Type names are the catalogue's.
- The website build stays byte-identical in JS, CSS and HTML. Today's look is unchanged (`classicOps` golden). Realistic paths sit behind `import.meta.env.VITE_ART === 'real'`. Storage keys use the `tcreal:` prefix only.
- Lighting, camera, densities and colour grade use the kit's fixed values (spec §5.1 item 4, §5.2). Heights use true proportions (F3, 9.8 px/m). Geometry always comes from the game: `pieceWorldSamples` and `pieceWorldTiles` through `bakeNode.ts trackGeometry`, never hand-placed.
- **Frame rule (track):**
  - Rails: one picture per (piece, rail tile, heading), anchored at the tile centre at `piece.z`, clipped to the tile with the `EXT` run-on (stage 1 contract).
  - Cars: one picture per reached pose × full/empty. Spinning types (`vehicle.spins`: spinning_mouse, rapids_raft) bake all 32 yaws for every reached (pitch, roll). Types with a front car (`loco`, `monorail`) add a `front` variant.
  - Supports: foot, segment and top per heading, stacked by the game.
- **Set layout (Task 2):**
  - Rails: `rail:<type>~<class>:d*:r<heading>`. The classes are `base` (S, St, G, X, Br, BB), `turn` (Ts, Tm), `bank` (B), `loop` (L), `cork` (Cs), `helix` (Hx), `spooky` (Sp) and `water` (W), plus any group a new type adds.
  - Cars: `car:<type>~<class>:d*:rall`. A pose belongs to the lowest class that reaches it, in the order `base` → `turn` → `bank` → `loop` → `cork` → `helix`.
  - The scope wants only the (class, heading) pairs and car classes that the ride's built pieces use.
- **Tint rule:**
  - A rail frame that takes the track colour everywhere sits on a sheet marked `tint: 'alpha'`, with no mask file; its alpha is the mask.
  - Frames with untinted parts sit on a masked sheet: station decks, brake fins, water, foam, tunnel shells and chain troughs.
  - Cars and supports keep masks.
  - Three colour rows: rails take `colours.track`, supports `colours.supports`, cars `colours.cars`. One mask per sheet, one colour per frame.
- **Size rule per type** (checked by `checkIndexCli`, see the budget table below):
  - compressed ≤ 6 MB for types with loop, corkscrew or helix pieces, and ≤ 3 MB for the rest;
  - every set ≤ 8 MiB decoded at d4, mask included;
  - the bench circuit of the type ≤ 32 MiB resident at d4, masks included.
- Tall rail tiles: a picture taller than 1024 px at d4 (the atlas's largest side) cannot be tinted. **Changed in the Task 3 review fix (P2):** sub-frames (`[pieceId, tN, 'u<k>']`) are not used. The reader draws one picture per tile, so the frame plan (`trackKeys.js`) refuses a tile over `TALL_M` = 22 m of rail range and `checkIndex` rejects any `u<k>` frame. No piece of the 17 types needs one: the tallest tile is the vertical loop's, 13 m. A future piece over 22 m in one tile needs the reader to stack sub-frames first.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01Q5pHggx1eLkEH7W16KJFwP`.
- Gate per task:
  - `npx tsc --noEmit`;
  - `npx vitest run tests/unit/art3d tests/unit/render/real`;
  - one full `npx vitest run`;
  - the bake of the task's items (`node tools/art3d/bake.mjs --out dist-art/real --only <ids>`);
  - `npx tsx tools/art3d/checkIndexCli.ts dist-art/real` (S5, missing files and the track size rule);
  - `VITE_ART=real npx vite build`;
  - the website `npx vite build` byte check.

## Size budget per type

The estimates are projections from the stage 1 sheets, after Task 2's split and alpha tint, with cars at d4 for all classes. "Bench circuit" means the type's layout in the `tracks` scene. The bake's size report replaces every number in its sub-batch's evidence file.

| Type | Sub-batch | Compressed (est. / limit) | Bench circuit d4 resident (limit 32 MiB) | All classes d4 (info) |
|---|---|---|---|---|
| steel_coaster | 5a | 5.2 / 6 MB | ~26 MiB (base, turn, loop) | ~110 MiB |
| junior_coaster | 5a | 1.3 / 3 MB | ~16 MiB | ~29 MiB |
| wooden_coaster | 5a | 1.6 / 3 MB | ~18 MiB | ~35 MiB |
| spinning_mouse | 5a | 1.8 / 3 MB | ~20 MiB (spin yaws) | ~24 MiB |
| bobsled_run | 5a | 2.6 / 6 MB | ~22 MiB (base, bank, helix) | ~57 MiB |
| launch_coaster | 5a (after rides-c1) | ≤ 6 MB | ≤ 32 MiB | from bake |
| mine_train | 5a (after rides-c1) | ≤ 3 MB | ≤ 32 MiB | from bake |
| mini_railway, monorail | 5b | 0.8 / 3 MB each | ~12 MiB | ~14 MiB |
| ghost_train, go_karts | 5b | 0.8 / 3 MB each | ~12 MiB | ~14 MiB |
| inverted_coaster | 5b | 5.2 / 6 MB | ~26 MiB | ~110 MiB |
| flying_coaster | 5b (after rides-c1) | ≤ 6 MB | ≤ 32 MiB | from bake |
| sky_ride | 5b (after rides-c1) | ≤ 3 MB | ≤ 32 MiB | from bake |
| log_flume, rapids_raft | 5c | 0.8 / 3 MB each | ~12 MiB | ~14 MiB |
| water_coaster | 5c (after rides-c1) | ≤ 6 MB | ≤ 32 MiB | from bake |

All 17 types come to about 38 MB compressed against the 11.3 MB projected today. `projectedFull` rises from about 54 MB to about 81 MB, still under S5's 150 MB. The "all classes" column applies only to a circuit that uses every group. That is one ride drawing about 110 MiB, which the ladder steps down to d2 (about 28 MiB). Owner decision D2 below can cap it.

## Review Focus

1. **Memory with many coasters.** Several big coasters at d4 cannot all fit in 128 MiB. Expected: the ladder lowers the far rides to d2 first, never drops a ride to nothing, and S2 stays ≤ 128. Test: the `tracks` bench scene (Task 8) and the `coasters` stress scene; trackReal tests that a circuit without loops never wants a `~loop` set.
2. **Pieces × headings × colours.** Pictures grow with tiles × 4 headings × 2 densities (about 1,830 rail frames per density for the 12 types) plus poses × 2 (about 1,770 car poses, 3,540 frames per density). Colours are not baked; they cost tint-atlas memory only. Test: the size report's per-type and per-set rows against the size rule; the bake log's frame counts against Task 1's expected-count table.
3. **Tint atlas with track colours.** Every distinct (piece, tile, heading, colour) on screen is one atlas frame. Two big coasters in different colours at d4 may fill the 24 MiB atlas; a refused frame draws untinted (light grey), not missing. Test: the `tracks` bench records tint bytes and refused frames per scene; there is a unit test that one circuit of each style tints within the atlas at d4. Alpha-tint sheets go through the same `tintRect` path (mask = alpha) and are pixel-tested against a full-white mask.
4. **Wrong anchor or heading per style.** Inverted spines sit `lift` above the rail line. Arm supports stand beside the track. Water samples run along the water surface. Tall tiles are cut into stacked sub-frames. Test: trackReal placement tests per style; on the review page each type shows turns 0 and 1 beside today's look.
5. **A piece left in today's look.** A missing frame falls back silently, piece by piece. Test: for every baked type, every piece in its list has a frame at every heading and at both densities (checkIndex, `TRACK_COMPLETE`), and every pose class has every reached pose.
6. **Cars that jump or pop.** Spin yaws missing on spinning types, the front car drawn as a middle car, and riders missing in `full`. Test: unit tests over the pose list per type (spin covers 32 yaws for each reached pitch and roll; front variants exist for `loco` and `monorail`).

---

## Sub-batch 5a: the shared track kit and the dry gravity coasters

### Task 1: Measurement first (size report and track size rule)

The instrument comes before the art, so later tasks are graded against a number fixed before they were made.

**Files:**
- Modify: `tools/art3d/sizeReport.ts`, `tools/art3d/checkIndexCli.ts`, `tools/art3d/checkIndex.ts`, `tests/unit/art3d/sizeReport.test.ts`
- Create: `tools/art3d/trackBudget.ts` (the limits table above, by type id), `tests/unit/art3d/trackBudget.test.ts`

**Interfaces:**
- Track rows in `sizeReport` add `residentAllClasses: { d2; d4 }` (all headings plus `rall`, masks counted for track kinds) and `perSet: { key; d4Bytes }[]`. They also project unbaked pieces by **frame area**, not a flat per-piece byte count. This fixes the batch 0 deferrals: the union divisor, water at steel cost, and track `decodedPerTurn` as a single-rotation peak.
- `trackBudget(typeId): { compressedMax; setMaxD4; benchMaxD4 }`. `checkIndexCli` exits 1 when a baked type breaks its compressed or per-set limit.
- `TRACK_COMPLETE`: checkIndex fails when a baked type lacks a frame for any (piece, tile, heading, density) or any reached pose.

- [ ] **Step 1:** Write failing tests. Track decoded bytes sum 4 headings plus `rall` plus masks (stage 1 steel ≈ 30 MiB at d4, not 10.6). Projection by area makes a loop tile cost more than a straight. A set over 8 MiB fails. A missing piece frame fails `TRACK_COMPLETE`.
- [ ] **Step 2:** Run: fail. **Step 3:** Implement. **Step 4:** Run: pass; gate. Record the stage 1 steel numbers in the commit body.
- [ ] **Step 5:** Commit `feat(bake): track size rule and per-class projection`.

### Task 2: Class sets, alpha tint, scope wants only what is built (game side)

**Files:**
- Modify: `src/render/real/look/track.ts`, `src/render/real/look/scope.ts`, `src/render/real/look/core.ts` (rail frame lookup via the class rec), `src/render/real/look/index.ts` (contract comment), `src/render/real/indexFormat.ts` (`sheets[i].tint?: 'alpha'`), `src/render/real/tint.ts` and `tintAtlas.ts` (alpha as mask), `tools/art3d/checkIndex.ts`
- Create: `src/render/real/trackClasses.ts` (piece group → class, pose → class; imported by both bake and game)
- Test: `tests/unit/render/real/trackReal.test.ts`, `tint.test.ts`, `tintAtlas.test.ts`, `look.test.ts`, `tests/unit/render/real/trackClasses.test.ts`

**Interfaces:**
- `pieceClass(pieceId): TrackClass` and `poseClasses(typeId): Map<poseCode, TrackClass>`, built from `reachedPoses` per class in class order.
- `look.rail(type, pieceId, tile, heading, colour)` keeps its signature and resolves `rail:<type>~<class>`. `look.car(...)` resolves its pose's class set. Old `rail:<type>` and `car:<type>` keys are read as class `base` during the move (no flag day for the stage 1 bake).
- The scope keeps a per-ride `{ classes: Set; headings per class: Set<0..3> }`, rebuilt when the ride's pieces change (the existing piece-count key) and on a view turn (headings shift by the turn).
- [ ] **Step 1:** Write failing tests:
  - `it('a circuit without loops never wants a loop set')`;
  - `it('wants only the headings its pieces face, shifted by the view turn')`;
  - `it('a car on a base pose draws from the base class')`;
  - `it('alpha-tint sheet tints like a full-white mask')`;
  - `it('stage 1 keys still resolve as base')`;
  - memory: the `coaster` scene at d4 wants ≤ 60 % of today's track bytes (fake index sized from Task 1's numbers).
- [ ] **Step 2–4:** Fail, implement, pass. Run the headless coaster scene: track decoded bytes and tint bytes before and after, in the commit body.
- [ ] **Step 5:** Commit `feat(real): track sets by piece and pose class, alpha-tinted rails`.

### Task 3: The track kit; steel_coaster on it with all 34 pieces

**Files:**
- Create: `tools/art3d/items/trackKit.js`, `tools/art3d/items/trackKeys.js` (frame keys, classes via `trackClasses.ts`)
- Modify: `tools/art3d/items/steel_coaster.js` (becomes a style spec), `tools/art3d/items/cards.js` (track card for any type), `tools/art3d/bakeNode.ts` (`trackGeometry(typeId)`: every piece of the type; `cardInput` for every track type via `previewPieces(typeId)`; poses per class, spin yaws, front variant), `tools/art3d/bake.mjs` (`it.track = { type }`), `tools/art3d/items/registry.js` (`TRACK_TYPES` table; drop `COASTER_PIECES`), `tools/art3d/poses.ts`
- Test: `tests/unit/art3d/trackKit.test.ts`, `poses.test.ts`, `bakeRegistry.test.ts`

**Interfaces:**
- `bakeTrackType(B, spec)`, with `spec = { item, rail: RailStyle, supports: SupportStyle, car: CarStyle, lift?, channel?, gauge }`. It:
  - loops classes → headings → pieces → rail tiles, shooting the rail (alpha sheet) and, where needed, a masked frame;
  - shoots supports per heading (foot, seg, top);
  - shoots cars per class and pose, full and empty (front variant where the spec says so);
  - shoots shadows (Task 4) and chain troughs (Task 5).
- Rail styles: `steel`, `junior`, `wood`, `narrow`, `tunnel`, `kart`, `beam`, `inverted`, `bobsled`, `flume`, `rapids`, plus the new types' styles from rides-c1. Each style is a profile set for `sweep` plus tie spacing, drawn from today's `RAIL_LOOKS` sizes (`src/render/track/paint.ts`).
- Support styles: `round`, `lattice`, `pillar`, `arm`, plus `tower` (sky ride, 5b).
- Car styles: one builder per `render.car`, riders through `sitCar` (`tools/art3d/rides.js`).
- Tall tiles are cut into stacked sub-frames (Global Constraints).
- [ ] **Step 1:** Write failing tests:
  - the key count per type equals tiles × 4 headings (+ sub-frames) and poses × 2 (× 32 spin yaws / + front variants);
  - every piece of `steel_coaster` is in the bake input;
  - the card input exists for each `TRACK_RIDES` id.
- [ ] **Step 2–3:** Fail; build the kit by moving `framesOf`, `extended`, `railModel` and `supportPiece` out of `steel_coaster.js`; add the rest.
- [ ] **Step 4:** Bake steel_coaster. Open its pictures:
  - a loop, a corkscrew and a helix, at turns 0 and 1, both densities;
  - cars in each class, full and empty.
  Check the size rule. The stage 1 pieces must match their stage 1 pictures by eye, since the owner approved them.
- [ ] **Step 5:** Commit `feat(art3d): track kit; steel coaster with every piece`.

### Task 4: Shadows for rails, supports and cars

**Files:**
- Modify: `tools/art3d/items/trackKit.js` (shadow frames), `src/render/renderer.ts` (shadow pass: `KIND_TRACK` slices), `src/render/track/layer.ts` (a shadow getter per slice), `src/render/real/look/track.ts` (`railShadow`, `supportShadow`)
- Test: `tests/unit/render/real/trackReal.test.ts`, `renderer-real.test.ts`

**Interfaces:**
- Rail shadow frames `[pieceId, tN, 'sh']` sit in the rail class set and are drawn untinted (`tint` null). Each is the rail sweep projected along the sun onto a plane at the rail line, as soft alpha. The game draws it on the ground at the tile, shifted by `(railZ − groundZ) × SUN_SHIFT` in screen px. The sun turns with the camera, so the shift is one fixed screen vector per metre.
- Support shadow: one `seg` shadow per heading, repeated along the same shift for the column height, plus the footing's contact shadow.
- Cars: decision D1 (proposal: a soft ellipse drawn live under each car at its ground point, shifted by height, no art).
- [ ] Steps: failing placement tests (shift per metre, drawn after the ground and before depth-sorted objects, one draw per slice); implement; bake; look at a 20 m lift on grass and on a slope; commit `feat(real): track shadows`.
- **Done (b5-t4).** As built: the rail shadow lies on a plane `SHADOW_PLANE_BELOW_M` = 1.5 m under the tile's lowest rail (`src/render/real/trackShadowPlane.ts`), not at the rail line, so a descending piece's spine is not under its own catcher; the game shifts it by `(plane − ground) × sunShift()`. Support shadows are `foot:sh`, `seg:sh` (from a 1 m column) and `top:sh`. Shadows sit on plain sheets (no mask, no tint) and every set keeps them at density 2 (frame `density: 2`): at d4 they cost 1.37 MB and 39 MiB decoded and put steel over its 6 MB rule. Cars: D1 (a), a live ellipse (`src/render/track/realShadow.ts`). Known limit: the ground is taken flat at the slice's (or car's) tile, so a shadow over a slope or past the map edge is not bent or cut.

### Task 5: Chain lifts

**Files:**
- Modify: `tools/art3d/items/trackKit.js` (chain trough frames for `chainable` pieces: `[pieceId, tN, 'chain']`, masked out, so untinted), `src/render/track/layer.ts` (realistic: draw the baked trough after the rail when `piece.chain`, then today's moving dashes, at the realistic rail line's height and in a darker, thinner style)
- Test: `trackReal.test.ts`
- [ ] Steps: failing test (a chained piece draws rail, trough, dashes in that order; an unchained one draws the rail only); implement; bake; look at it at zoom 2; commit `feat(real): baked chain troughs with live dashes`.

### Tasks 6–7: Dry gravity coaster modules (parallel worktrees)

**Files per type `X`:**
- Create: `tools/art3d/items/X.js` (a style spec plus `bakeTrackType`).
- Modify (one line each):
  - `registry.js` (`TRACK_TYPES`, `CARD_ITEMS`)
  - `items/index.js` and `index.d.ts`
  - `src/render/real/fallbacks.ts` (`BAKED`; remove `mini_railway` from `STAND_INS` in 5b)
  - `tests/unit/art3d/bakeRegistry.test.ts`
  - `tools/art3d/trackBudget.ts`

**Steps per type:**
- [ ] Add X to the test tables; run; fail.
- [ ] Build the style: recognisable as the type today's look draws (its `RAIL_LOOKS` row and `paintCar` case in `src/render/track/paint.ts`), with realistic materials and proportions, riders seated in `full`, and an original design.
- [ ] Bake X. Open a straight, a turn, the type's signature piece, one support and cars in each class, at turns 0 and 1. Check the size rule with the size report.
- [ ] Run tests; pass. Commit `feat(art3d): bake X`.

| Task | Types | Style notes |
|---|---|---|
| 6 | junior_coaster, wooden_coaster, spinning_mouse | junior: steel at gauge 1.0 with a thinner spine. wooden: laminated rails on timber ties, `lattice` bents (1 m segments with cross bracing that lines up when stacked). mouse: narrow steel, 32 spin yaws, a round car with a centre pivot |
| 7 | bobsled_run; launch_coaster and mine_train once rides-c1 merges | bobsled: an ice trough (the wall takes the track colour, the ice does not, so it uses a masked sheet). launch: steel plus the launch section fins on rides-c1's launch piece. mine: steel rail on `lattice` timber trestle, mine-cart cars. The last two read their styles from rides-c1's `render` rows |

### Task 8: Track bench scenes, review page and cards

**Files:**
- Modify: `tests/perf/scenes.ts`, `src/perf/realBench.ts` (verdict scenes), `tests/unit/perf/scenes.test.ts`, `tools/art3d/reviewShots.mjs` (track parks), `tools/art3d/reviewPage.ts`
- Create: `tests/perf/trackCircuits.ts` (one closed circuit per type, built with game commands as `buildCoaster` does)

**Interfaces:**
- Scene `tracks`: every baked type, one compact closed circuit each, all within two screens at zoom 1. Each circuit uses its type's signature class (loop, helix, corkscrew, splashdown, spooky tunnel). Trains run full; 300 guests. Each sub-batch adds its types.
- Scene `coasters` (stress): 6 big gravity coasters (steel, inverted, wooden, bobsled, launch, flying when baked) with every class built, side by side. It is information only; its verdict is S2 ≤ 128, no hang, and no ride drawn as nothing.
- Review: per type, one park with its bench circuit (cars running), shot at turns 0 and 1 in both looks. There is also a "car sheet" row: every car frame of the type laid out from the index. This replaces the batch 0 ruling's missing coaster shots.
- [ ] **Step 1:** Write a failing test: `tracks` contains each baked type exactly once, every circuit closes and opens (`canOpenTrackRide`), and the map fits.
- [ ] **Step 2–4:** Fail, implement, pass.
- [ ] **Step 5:** Run the headless bench (390 × 844, DPR 2.75, quality high) on the merged branch, all scenes: S2, track bytes per ride, tint bytes and refusals, turns, caps, degraded. Record the results.
- [ ] **Step 6:** Commit `feat(bench): track ride scenes and review shots`.

### Task 9: 5a gate (controller + owner)

- [ ] Merge Tasks 1–8; run a final whole-batch review and one fix wave.
- [ ] Deploy. In the deploy log, check `projectedFull` ≤ 150 MB, every 5a type within its size rule, and the bake time against S8. If a cold bake passes 3 h, shard the bake by type.
- [ ] **Owner:** on the review page, approve or reject each type, including the re-baked steel_coaster (D9).
- [ ] **Owner:** run the bench on the phone at `/real-game/?art=real&bench=1`: pass on every scene, including `tracks`, with no render ratio change.
- [ ] Write the evidence files `phase-8c-full-evidence/batch5a-*.md` and update the full build plan's batch table.

---

## Sub-batch 5b: powered and suspended types

Before 5b starts, its 5a dependencies must be merged and the owner must have approved 5a.

### Task 10: Support styles beside and above the track

**Files:**
- Modify: `src/render/track/layer.ts` (`realSupportPlacement`: the `arm` column stands at the side offset today's `paintSupport` uses, and its `top` reaches over to the spine; `tower` stands only where the game places one), `src/render/real/supportStack.ts` (stack per style: arm top above the rail line by `lift`; lattice bent width), `tools/art3d/items/trackKit.js`
- Test: `trackReal.test.ts` (column x/y per style and heading; top height for `arm` = rail line + lift + arm drop)
- [ ] Steps: failing tests, implement, bake inverted supports, look at them, commit `feat(real): arm and tower supports`.

### Tasks 11–12: Type modules (parallel)

The steps per type are the same as in Tasks 6–7.

| Task | Types | Style notes |
|---|---|---|
| 11 | mini_railway (front loco variant; remove its `STAND_INS` entry), monorail (concrete `beam` and pillars, front cab variant), ghost_train (narrow rail; the `spooky_tunnel` piece is a closed shell with a masked tint), go_karts (asphalt `kart` road with kerbs, the road tinted by alpha, karts with one driver) | front variants: the tests from Review Focus 6 |
| 12 | inverted_coaster (spine above at `lift` 2.4 m, hanging cars, arm supports); flying_coaster and sky_ride once rides-c1 merges | flying: hanging cars with riders lying face down, as the rides-c1 game row and today's-look drawing define them. sky_ride: a cable rail (thin, two hauling ropes), `tower` supports, gondolas. Its cable tile pictures are small, and its towers are the tall part |

### Task 13: 5b gate

This gate repeats Task 9 for the 5b types: the `tracks` scene gains them, then the review page, owner D9, phone bench, and `batch5b-*.md`.

---

## Sub-batch 5c: water types

### Task 14: The water channel kit

**Files:**
- Modify: `tools/art3d/items/trackKit.js` (channel walls and floor take the track colour; the water surface, foam and conveyor belt are masked out, so untinted), `src/render/track/layer.ts` (realistic: today's `drawWater` ripples and `drawSpray` stay live and are restyled softer; anchor on the water-surface sample line)
- Marks per special:
  - `splashdown`: a foam pool;
  - `waterfall`: a white drop;
  - `rough`: standing waves;
  - `whirlpool`: a swirl, in the tile that holds its middle;
  - lifts: a belt with cleats, static (the moving dashes stay live).
- Test: `trackReal.test.ts` (ripples drawn after the baked channel; water pixels untinted with a wall colour set)
- [ ] Steps: failing tests, implement, bake a flume straight and a splashdown, look, commit `feat(art3d): water channel kit`.

### Task 15: Water type modules

The steps per type are the same as in Tasks 6–7.

| Types | Style notes |
|---|---|
| log_flume | timber channel on `lattice` trestle; hollow-log boats with riders; the cars default to timber |
| rapids_raft | wide concrete channel on pillars; round rafts with 32 spin yaws; 8 riders |
| water_coaster (after rides-c1) | coaster rail sections and channel sections as rides-c1 defines them; boat-shaped coaster cars. Rail pieces use the 5a steel style; water pieces use Task 14 |

### Task 16: 5c gate

This gate repeats Task 9 for the 5c types: `tracks` complete with all 17 types, then `coasters` stress, owner D9, phone bench, `batch5c-*.md`, and the batch 5 row of the full build plan marked done.

---

## Risks (plain)

1. **Memory with many coasters.** With today's set layout, one full steel or inverted coaster at d4 projects to about 147 MiB, over the whole budget. Task 2's class sets and alpha-tinted rails are not optional; they come before any type grows past stage 1's 18 pieces. Even with them, a park of several big coasters at zoom 2 runs at d2 for the far rides. That is the ladder's job, but it means coasters will look softer more often than flat rides. The `coasters` stress scene measures it. If the ladder thrashes (rides changing density every few frames), the fallback is decision D2.
2. **Pieces × headings × colours.** Colours are free in files but not in the tint atlas. Baked frames are about 1,830 rail frames and 3,540 car frames per density for the 12 types, and more with spin yaws, front cars, chain troughs, shadows and the 5 new types. Bake time scales with that count. Stage 1 baked 18 items in 7.7 min. The full track set is the biggest single bake of phase 8c, and any kit change re-bakes all 17 types (the cache key hashes the kit). Watch S8; shard by type if a cold bake passes 3 h.
3. **Does the tint atlas handle all types?** Functionally yes. The getters already take each row's colour per call, all three rows are palette indices, and nothing is type-specific. Three gaps, all fixed in this plan:
   - (a) parts that must stay untinted (water, ice, decks, brake fins, tunnel interiors, chain) need masked sheets; the alpha-tint fast path must not swallow them;
   - (b) frames over 1024 px (tall pieces from rides-c1, sky ride towers if not stacked) cannot enter the atlas, hence the sub-frame rule;
   - (c) capacity: distinct on-screen (piece, tile, heading, colour) frames for two big coasters in different colours at d4 may pass 24 MiB. A refused frame draws untinted light grey, which is visible.
   The `tracks` bench records refusals. If they are frequent, raise `TINT_ATLAS_MAX_PAGES` inside the 128 MiB budget (it is already admitted and reclaimable), as Task 4b did.
4. **The 5 new types are a moving target.** Their pieces, render styles and car shapes live on `rides-c1`, which has no commits yet. Any new piece group adds a rail class and possibly a pose class, and a tall launch or top-hat piece triggers sub-frames. Their tasks wait for the merge. Budgets for them are limits, not estimates.
5. **Re-baking the approved steel coaster.** The kit changes its pictures' cache key, so the owner sees it again on the review page.
6. **Spec wording.** Spec §5.7 says "one tint per (sheet, colour)". Batch 0 moved to tinting per frame, and this plan adds alpha-tinted sheets. Update §5.7 in the 5a evidence (a batch 0 deferral).

## Decisions for the owner

**Decided by the owner on 2026-11-17 ("Yes" to all five proposals):** D1 (a) a live soft ellipse; D2 (a) every pose class at both densities, with (b) only if the `coasters` stress scene fails; D3 (a) batch 5 bakes the new types after `rides-c1` (merged at 473a112); D4 ghost_train and go_karts in 5b; D5 live water and chain motion over baked channels and troughs.


- **D1 Car shadows:** (a) a soft ellipse drawn live under each car, with no art and almost no memory (proposal); (b) baked per pose, which doubles car frames; (c) none, as today.
- **D2 Cars in rare poses:** (a) every pose class at both densities; the ladder handles big parks (proposal); (b) cars in loops, corkscrews and helixes baked at d2 only (soft at zoom 2 but about 40 MiB less per big coaster), applied only if the `coasters` stress scene fails S2 or thrashes.
- **D3 Who bakes the new track types:** (a) batch 5 tasks bake them after `rides-c1` merges, and rides batch C ships the game side and today's look only (proposal; one track kit, one review); (b) rides batch C bakes them on the batch 5 kit.
- **D4 Where ghost_train and go_karts go:** neither is a gravity coaster, so this plan puts both in 5b with the powered types. The alternative is a fourth small sub-batch.
- **D5 Water and chain motion:** keep today's live ripples, spray and chain dashes over the baked channel and trough, restyled softer (proposal), rather than baking animation frames (×4 to ×8 the water pictures).

## Not covered by this plan

- Station buildings, entrance and exit gate booths: today's look until batch 7 (entrance plaza and ground).
- Lit and night variants of track and cars: batch 7.
- Game rows, physics and today's-look art of the 5 new types: rides batch C on `rides-c1`.
- Ride colour schemes beyond the three palette rows.
