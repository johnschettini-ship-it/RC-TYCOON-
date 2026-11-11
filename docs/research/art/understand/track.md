# Track rides: how the game draws them today

Area: coasters, railways, water rides. Read-only map of the code as it stands on the working tree (HEAD `e247baa`).
All paths are relative to `/home/user/RC-TYCOON-`. Line numbers are from the files as read on 2026-11-11.
Nothing was run (no npm, no tests, no build). Numbers marked "derived" were worked out by hand from the code.

Files in this area:

| File | Lines | Role |
|---|---|---|
| `src/render/track/paint.ts` | 928 | All track art: rails, channels, beam, platform, road, brakes, tunnel, supports, cars, gate booths |
| `src/render/track/layer.ts` | 1103 | Slices, sprite caching, draw list, trains, per-frame effects, builder ghosts |
| `src/render/track/project.ts` | 212 | Pure math: projection, view rotation, track frame, car pose, quantised steps |
| `src/render/track/preview.ts` | 121 | `drawTrackPreview` for the card picture |
| `src/render/track/toolState.ts` | 128 | Builder state (plain data, no drawing) |
| `src/render/track/colours.ts` | 24 | The 12 player colours |
| `src/render/track/selection.ts` | 58 | Tiles of a selected ride (outline only) |
| `src/data/track/*.ts` | 737 | Piece table, track types, types |

---

## What this area draws

### Counts

- **12 track types** (`src/data/track/trackTypes.ts:120`, `:153`, `:230`, `:233`). The catalog has the same 12 ids (`src/data/catalog/trackRides.ts:6-21`).
- **56 track pieces** (`src/data/track/pieces.ts:104`): 29 rail (`pieces.ts:39-69`), 21 water = 10 flume + 11 rapids (`waterPieces.ts:64-89`), 6 Phase 6 = 2 corkscrews + 4 helixes (`extraPieces.ts:88-95`).
- **8 geometry kinds**: straight, transition, turn, bank, loop, ramp, corkscrew, helix (`src/data/track/types.ts:28-54`).
- **8 special marks**: station, brakes, blockBrake, spooky, splashdown, waterfall, rough, whirlpool (`types.ts:56`).
- **10 rail styles** (`paint.ts:51-65`): steel, wood, narrow, tunnel, kart, flume, rapids, inverted, bobsled, beam. The junior coaster is the steel style with smaller numbers (`paint.ts:71-75`), so 11 looks in practice.
- **4 support styles** (`types.ts:156`; painted at `paint.ts:617-722`): round, lattice, pillar, arm.
- **11 car shapes** (`types.ts:157`; `layer.ts:110`): coaster, junior, loco, mouse, ghost, kart, log, raft, inverted, bobsled, monorail. The loco has a different front car and rear car (`paint.ts:737-738`, `:790-797`). Five shapes add a nose on the front car.
- **12 player colours** for track, supports, cars (`colours.ts:5-18`).
- **2 gate booths** (entrance, exit) per ride (`paint.ts:903-926`).

### The 12 types and what each one uses

Source: `trackTypes.ts:35-75` (Build 1), `:132-149` (Build 3), `:174-184` (water). Colour numbers are indices into `colours.ts:5-18`. "Pieces" is the number of piece ids the type's groups allow (derived from the group lists; it ignores which joint the track end has).

| Type id | Rail style | Supports | Car | Default colours (track / supports / cars) | Pieces |
|---|---|---|---|---|---|
| `steel_coaster` | steel | round | coaster | 0 cherry / 9 silver / 1 sunset | 34 |
| `junior_coaster` | steel (junior numbers) | round | junior | 3 leaf / 9 / 4 sky | 20 |
| `mini_railway` | narrow | pillar | loco | 10 charcoal / 9 / 6 royal | 12 |
| `wooden_coaster` | wood | lattice | coaster | 11 timber / 11 / 0 | 26 |
| `spinning_mouse` | steel | round | mouse (spins) | 2 lemon / 9 / 5 lagoon | 18 |
| `ghost_train` | tunnel | pillar | ghost | 7 grape / 9 / 8 rose | 13 |
| `go_karts` | kart (a road) | pillar | kart | 9 / 9 / 1 | 12 |
| `log_flume` | flume (channel) | lattice | log | 11 / 11 / 11 | 10 |
| `rapids_raft` | rapids (channel) | pillar | raft (spins) | 9 / 9 / 1 | 11 |
| `inverted_coaster` | inverted | arm | inverted | 6 royal / 9 / 0 | 34 |
| `bobsled_run` | bobsled (ice trough) | round | bobsled | 7 / 9 / 3 leaf | 23 |
| `monorail` | beam | pillar | monorail | 9 / 9 / 5 | 12 |

Sum of (type, piece) pairs: 225 (derived). Each pair can be placed in 4 track directions, seen from 4 view rotations, at any height.

### The piece table in short

| Ids | Footprint (tiles) | Height change | Notes |
|---|---|---|---|
| `station`, `straight`, `brakes`, `block_brake`, `spooky_tunnel` | 1 | 0 | `pieces.ts:40-41`, `:64-65`, `:68` |
| `gentle_up`, `gentle_down` | 1 | ±2 m | `pieces.ts:42-43` |
| `steep_up`, `steep_down` | 1 | ±6 m | `pieces.ts:44-45` |
| 8 slope transitions | 1 | ±1 m or ±4 m | `pieces.ts:46-53` |
| `turn_small_left/right` | 1 | 0 | radius 2 m, `pieces.ts:54-55` |
| `turn_medium_left/right`, `banked_turn_medium_left/right` | 3 × 3 | 0 | radius 10 m, `pieces.ts:56-57`, `:62-63` |
| 4 bank in / out pieces | 1 | 0 | roll 0 ↔ 35°, `pieces.ts:58-61`; angle `src/data/tuning/track.ts:13` |
| `vertical_loop_left/right` | 4 × 2 | 0, rail up to 16 m | `pieces.ts:66-67` |
| `corkscrew_left/right` | 3 × 1 | 0, rail up to 4 m | full roll, `extraPieces.ts:31-55` |
| `helix_{left,right}_{up,down}` | 3 × 3 | ±4 m | 360° turn, `extraPieces.ts:57-82` |
| Water: station, straight, small turns, medium turns, slope down, drop, lift | as rail | 0, −2, −6, +2 m | `waterPieces.ts:37-50` |
| `flume_splashdown` | 2 × 1 | 0 | `waterPieces.ts:49`, `:74` |
| `rapids_waterfall`, `rapids_rough`, `rapids_whirlpool` | 1 | −6, 0, 0 | `waterPieces.ts:85-87` |

### Every visual element

| Element | Where painted | Cached? |
|---|---|---|
| Two rails, cross ties, spine | `paint.ts:236-322` | In the slice sprite |
| Go-kart road (asphalt, kerbs, centre dashes) | `paint.ts:503-546` | In the slice sprite |
| Water channel (walls, water, foam chevrons, whirlpool swirl, conveyor cleats) | `paint.ts:343-420` | In the slice sprite |
| Bobsled trough (same painter, ice colour `#eaf5fb`) | `paint.ts:63`, `:376` | In the slice sprite |
| Monorail beam | `paint.ts:426-458` | In the slice sprite |
| Station platform (deck on both sides, yellow edge) | `paint.ts:461-500` | In the slice sprite |
| Brake fins; block brake signal post with a green light | `paint.ts:549-579` | In the slice sprite |
| Spooky tunnel box with a doorway and ghost eyes | `paint.ts:582-614` | In the slice sprite |
| Supports (4 styles) | `paint.ts:617-722` | In the slice sprite |
| Cars and boats (11 shapes) | `paint.ts:773-892` | Car sprite cache |
| Riders (shirt oval + head circle) | `layer.ts:881-921` | No, drawn each frame |
| Chain lift dashes | `layer.ts:719-757` | No, drawn each frame |
| Water ripples | `layer.ts:763-799` | No, drawn each frame |
| Boat spray | `layer.ts:802-817` | No, drawn each frame |
| Gate booths | `paint.ts:903-926` | Gate sprite map |
| Builder ghosts, arrow, labels, tile outlines | `layer.ts:928-1093` | No, drawn each frame |
| Card picture | `preview.ts:52-121` | By the card UI (`src/ui/decks/card.ts:96-117`) |

Things that do **not** exist today:

- **No station building.** A station is only the platform decks (`paint.ts:280`, `:372`, `:451`). The draft shows a roofed station with a striped canopy and a sign.
- **No ground pad under track.** Track tiles keep plain grass (`src/render/terrain.ts:329`). The old picture `docs/screenshots/wave2-coaster.png` still shows grey pads; the current terrain code has no branch for track tiles.
- **The static chain base is never drawn in the game.** `paintRun` has it (`paint.ts:319`), but both game callers pass `chain: false` (`layer.ts:325`, `preview.ts:105`). Only a test passes `true` (`tests/unit/render/track/slices.test.ts:127`).

---

## How it draws

### Data flow

1. **Piece definition.** `TrackPieceDef` (`src/data/track/types.ts:67-103`): entry and exit joint, tiles, rail height range, length, geometry kind, special mark.
2. **Sample table.** Each definition gets one sample every 0.25 m in its local frame: position, height, pitch, bank (sine and cosine), heading (`src/sim/rides/track/geometry.ts:167-364`; step `src/data/tuning/track.ts:56`). Built once per definition (`geometry.ts:128-137`).
3. **World samples.** `pieceWorldSamples(piece)` turns the table into world metres with absolute height (`src/sim/rides/track/api.ts:280-304`). The layer caches it per placed piece in a `WeakMap` (`layer.ts:148`, `:165-172`).
4. **Tiles.** `trackTileSlices(world, rideId)` lists every tile a piece occupies, its rail height range, whether the rail passes over it, and whether a support stands there (`api.ts:259-277`).
5. **Slices.** `buildRideSlices` makes one `SliceRec` per rail tile (`layer.ts:254-318`). A tile that a piece only reserves (corners of a medium turn) gets no slice (`layer.ts:262`).
   - `runsInTile` picks the sample ranges whose segments lie in the tile, by segment midpoint (`layer.ts:175-190`). Neighbouring slices share their boundary sample.
   - Anchor: the tile centre at height 0, in world pixels (`layer.ts:269-272`).
   - Bounds: `sliceBounds` (`layer.ts:226-249`).
   - Support point: the sample nearest the tile centre, or the lowest sample when the rail climbs more than 6 m in the tile (`layer.ts:193-219`, `:277-292`).
6. **Collect, each frame.** `TrackLayer.collect` (`layer.ts:490-563`) checks for changes, culls by bounds, and pushes drawables into the renderer's list: slice, chain overlay, water overlay, gate, car. The renderer calls it at `src/render/renderer.ts:1106`.
7. **Sort and draw.** The renderer sorts the list and calls `track.drawItem` (`renderer.ts:1113-1114`, `:610-612`; dispatch `layer.ts:650-668`).
8. **Slice sprite.** `drawSlice` builds the sprite on first use with `buildSprite(bounds, bucket, paintSlice)` and blits it (`layer.ts:679-695`; `src/render/canvas.ts:56-72`).
9. **Paint.** `paintSlice` paints the support first, then each run with `paintRun` (`layer.ts:321-327`).

### Projection

- Scale constants (`project.ts:14-17`): `PX_X` = 8 px per metre, `PX_Y` = 4 px per metre, `PX_Z` = 8 px per metre of height. A 4 m tile is a 64 × 32 diamond (`src/render/iso.ts:8-10`).
- A world point is turned by the view rotation, then projected: screen x = (vx − vy) × 8, screen y = (vx + vy) × 4 − z × 8 (`project.ts:31-79`).
- `Projector` subtracts the sprite anchor and turns vectors into view space for "which side faces the viewer" tests (`paint.ts:96-137`).
- `trackFrame(yaw, pitch, bankSin, bankCos)` gives three unit vectors at a sample: forward, right (banked), up (`project.ts:171-195`). Every painter builds its shapes from these vectors.

### `paintRun`: one run of one piece (`paint.ts:236-322`)

It first sends water and beam styles elsewhere: `look.channel > 0` → `paintChannel` (`paint.ts:239-242`); `look.beam` → `paintBeam` (`paint.ts:243-246`). For the rail styles it paints in this order:

1. Left rail, right rail, centre line, and spine line as point lists: sample ± right × gauge / 2, lifted by `look.lift` along the track's up for the inverted style (`paint.ts:258-277`).
2. Station platform (`paint.ts:280`).
3. Road for karts (`paint.ts:281`).
4. Cross ties: one stroke every `tieEvery` metres, chosen by absolute sample index so neighbouring slices line up (`paint.ts:284-303`).
5. Spine under the rails: a wide dark stroke and a thin light stroke (`paint.ts:305-311`).
6. Far rail (shade 0.78), then near rail (full colour) (`paint.ts:312-317`). "Near" is decided by summing the view-space right vector over the run (`paint.ts:257`, `:276`).
7. Spine over the rails for the inverted style (`paint.ts:318`).
8. Brake fins (`paint.ts:320`), tunnel box (`paint.ts:321`).

All strokes go through `polyline` (round caps and joins, `paint.ts:142-152`). All filled shapes go through `quad` (`paint.ts:154-166`) or `band` (`paint.ts:332-336`).

### Per rail style

| Style | What `paintRun` produces | Numbers (`paint.ts:52-64`) |
|---|---|---|
| steel | 2 rails, ties each 1 m, spine below | gauge 1.2 m, rail 1.7 px, tie 1.5 px `#434b57`, spine 3.2 px, drop 0.5 m |
| steel (junior) | same | gauge 1.0 m, rail 1.5 px, spine 2.4 px, drop 0.4 m (`paint.ts:73`) |
| wood | 2 rails, ties each 0.5 m, no spine | rail 1.9 px, tie 2.2 px `#6b4a2b`, tie half length 0.95 m |
| narrow | 2 rails, ties each 0.5 m | gauge 1.0 m, rail 1.3 px, tie 2.4 px `#7a5634` |
| tunnel | as narrow | tie `#5b4a6e` |
| kart | asphalt road only | half width 1.6 m, kerb stroke 2.2 px, centre dash 0.9 px (`paint.ts:517-544`) |
| flume | channel | half width 0.95 m, wall 0.55 m, floor 0.35 m below (`paint.ts:345`) |
| rapids | channel | half width 1.45 m, wall 0.45 m |
| inverted | 2 rails + ties + spine, all 2.4 m above the sample line; spine above the rails | gauge 1.0 m, spine 3.8 px, `lift: 2.4`, `drop: -0.5` |
| bobsled | channel painter with ice surface | half width 0.85 m, wall 0.65 m, `trough: '#eaf5fb'` |
| beam | box beam under the sample line | half width 0.45 m, depth 1.0 m, colour `#c9ccd2`, stripe 1.6 px (`paint.ts:452-457`) |

### Channel (`paint.ts:343-420`)

Order: station platform → far wall inner face (shade 0.62) → water surface → conveyor cleats (lifts) → foam chevrons (splashdown, waterfall, rough) → whirlpool swirl (three partial ellipses) → near wall outer face (full colour) → two wall top edge lines. Water colours are four fixed values (`paint.ts:68`). The sample line is the water surface.

### Supports (`paint.ts:617-722`)

One support per slice at most, painted before the rails (`layer.ts:323`). It runs from the tile's ground height to the underside of the rail (`layer.ts:290`).

| Style | Shape | Lines |
|---|---|---|
| round | grey footing ellipse, post split into a lit left half and a shaded right half, cap ellipse | `paint.ts:708-721` |
| pillar | grey post in two halves (`#9aa3ad`, `#7d8691`), cap ellipse in the support colour | `paint.ts:696-707` |
| lattice | two legs 1.5 m apart across the track, X brace and a horizontal every 2 m | `paint.ts:660-695` |
| arm | post 1.3 m beside the track on the far side, braced arm over the spine | `paint.ts:622-659` |

A tile gets a support only when this piece owns the ground there and the rail is above the ground (`api.ts:271-272`). The inverted style also adds one on every ground-level rail tile (`layer.ts:277`).

### Cars (`paint.ts:773-892`)

- Every car is a set of shaded boxes. `paintBox` (`paint.ts:178-223`) projects 8 corners, drops the faces turned away from the viewer, and fills the rest with `shade(colour, faceLight(normal))`.
- `faceLight` (`paint.ts:169-171`): 0.55 + 0.45 × up + 0.3 × toward the viewer's left-front + 0.15 × right-front, capped at 1.05. The result is a continuous number, so there is no fixed set of shades.
- Size table: `carDims` (`paint.ts:733-759`).
- Standard cars: dark bogie, body with a dark outline 0.6 px, seat well on top (`paint.ts:789-802`). Extras: loco cab, boiler, chimney (`:790-797`); ghost car back wall (`:803-806`); mouse ears as circles (`:807-819`); white nose stripe on the front coaster or junior car (`:820-824`).
- Boats: `paintBoat` (`paint.ts:831-855`): log with end rings and a prow, raft with four yellow handles.
- Phase 6: `paintPhase6Car` (`paint.ts:869-892`): hanging chair row with a bogie 2.4 m up, sled with runners, monorail car with a window band and roof.
- A car is painted around its rail point with the identity view frame and a view-space heading (`paint.ts:761-762`, `:774`), so one car sprite serves all four view rotations.

### Trains: how cars follow the track

- For each train that is not parked, the layer takes the train centre `s` (mm along the circuit) and adds `v × 0.05 s × alpha` for the time between ticks (`layer.ts:582-590`; `project.ts:102-107`).
- Car `k` sits at `centre + cars × length / 2 − (k + 0.5) × length` (`project.ts:110-112`).
- `carPoseAt` reads the pose at that distance from the sample tables, with linear interpolation between samples: position, heading, pitch, bank (`project.ts:131-165`; `src/sim/rides/track/layout.ts:149-179`).
- Cars are separate rigid sprites. There are no couplings and no bending.
- Cars on a spooky tunnel piece are not drawn (`layer.ts:611-613`).
- Sort depth of a car: the nearer of the tiles under its front and back, with its own height, on the guest layer (`layer.ts:640-646`). Slices sit on the object layer (`layer.ts:516`).
- `drawCar` rounds heading to 16 steps, pitch to 24, roll to 16 (`layer.ts:840-842`; `project.ts:198-212`), finds or builds the sprite, blits it at the exact car position, then draws riders and spray (`layer.ts:836-868`).

### Gates

Entrance and exit booths stand on the gate tiles beside the station (`layer.ts:525-560`). The booth is a box with two doorways and a pyramid roof; the entrance adds a flag (`paint.ts:903-926`). Roof colour: the ride tag's colour for the entrance, grey `#8a96a3` for the exit (`layer.ts:557`).

### Builder ghosts (`layer.ts:928-1027`)

- Station phase: tile outlines, a direction arrow, a check or cross icon.
- Piece phase: three lines (two rails at ±0.6 m and the centre) in the ghost colour, red outlines on blocking tiles, a dashed drop line from the highest point, a cost label and a height label in `system-ui` text (`layer.ts:1031`).
- Gate phase: dashed outlines on candidate tiles and one solid outline.
- State comes from `trackToolOf(tool)` (`toolState.ts:115-122`). The renderer only reads it.

### Card picture: `drawTrackPreview(ctx, typeId, w, h)` (`preview.ts:52-121`)

- Scene: 2 station tiles, a small turn, a hill, and a straight or the type's special piece (`preview.ts:20-50`). Water types show a lift, a slope, and a splashdown or whirlpool. The Inverted Coaster shows a corkscrew; the Bobsled Run shows a banked turn.
- It measures the scene, fits it into `w × h` with 6% padding by one scale factor `k`, and calls the same painters directly on the given context (`preview.ts:66-85`). No sprite, no bucket.
- It paints flat green diamonds under the pieces (`preview.ts:88-99`), supports where the rail is above 0.5 m (`:103`), the runs (`:105`), then two cars in the station, or one boat (`:108-119`).
- Only caller: `src/ui/decks/card.ts:106`, on a 168 × 120 CSS px canvas at a device pixel ratio of at most 3 (`card.ts:82-83`, `:97`).

---

## Sizes and scale

### World pixels at zoom 1

| Thing | Size | Source |
|---|---|---|
| Tile (4 m) | 64 × 32 px diamond | `iso.ts:8-9`, `tuning/track.ts:52` |
| 1 m along a view axis | 8 px across and 4 px down (8.9 px long) | `project.ts:14-15` |
| 1 m of height | 8 px | `project.ts:17` |
| Gentle slope, one tile | 16 px rise | `pieces.ts:42` |
| Steep slope, one tile | 48 px rise | `pieces.ts:44` |
| Vertical loop | 128 px tall | `pieces.ts:66` |
| Highest ride allowed (steel coaster, 50 m) | 400 px of support | `catalog/trackRides.ts:7` |
| Steel rail gap (gauge 1.2 m) | about 8.6 px between the two rail lines (derived) | `paint.ts:52` |
| Rail stroke | 1.3 to 1.9 px | `paint.ts:52-55`, `:62` |
| Tie stroke | 1.5 to 2.4 px, one every 8.9 px (1 m) or 4.5 px (0.5 m) | `paint.ts:52-55` |
| Spine stroke | 2.4 to 3.8 px, 4 px below the rails | `paint.ts:52`, `:62`, `:73` |
| Round post | 4.4 px wide | `paint.ts:709` |
| Pillar | 7.2 px wide | `paint.ts:697` |
| Lattice | legs 2 px, braces 1 px, legs 1.5 m apart (12 px across) | `paint.ts:665`, `:682`, `:691` |
| Platform | 1.1 m wide, 2.4 px high, edge line 1.4 px | `paint.ts:462-463`, `:498` |
| Coaster car body | 2.1 m long, 1.56 m wide, 0.7 m high. Along a view axis the length covers 16.8 px across and 8.4 px down; the body is 5.6 px tall. | `paint.ts:757` |
| Car spacing | 2.0 to 4.0 m (16 to 32 px along a view axis) | `trackTypes.ts:35-71`, `:132-145`, `:188` |
| Car sprite box | 76 × 78 px around the rail point | `paint.ts:898` |
| Rider | shirt oval 4.8 × 3.0 px, head 3.6 px across | `layer.ts:914`, `:918` |
| Gate booth box | 44 × 48 px; walls 13 px high, roof to 22 px, flag to 32 px | `paint.ts:905-915`, `:928` |
| Tunnel box | 3.9 m × 3.8 m × 4.2 m | `paint.ts:592` |
| Slice sprite, flat one-tile straight on the ground | about 143 × 124 px (derived), because the bounds add 3.2 m on every side | `layer.ts:231`, `:233`, `:248` |

Car body sizes (half length a, half width b, bottom h0, top h1, metres; `paint.ts:733-759`):

| Shape | a | b | h0 | h1 |
|---|---|---|---|---|
| coaster (default) | 1.05 | 0.78 | 0.15 | 0.85 |
| junior | 0.85 | 0.62 | 0.12 | 0.72 |
| loco, front | 1.3 | 0.72 | 0.15 | 1.7 |
| loco, other cars | 1.3 | 0.78 | 0.15 | 0.8 |
| mouse | 0.85 | 0.85 | 0.15 | 0.9 |
| ghost | 0.85 | 0.72 | 0.12 | 0.62 |
| kart | 0.8 | 0.55 | 0.08 | 0.42 |
| log | 1.5 | 0.6 | −0.25 | 0.45 |
| raft | 1.25 | 1.25 | −0.15 | 0.4 |
| inverted | 0.55 | 0.8 | 0.0 | 0.8 |
| bobsled | 1.0 | 0.55 | −0.2 | 0.45 |
| monorail | 1.42 | 0.75 | −0.45 | 1.45 |

### How the draft's pixel grid compares

- The draft script projects with 16 px per half tile, so a tile is 32 × 16 art pixels, and saves the picture enlarged ×4 with nearest-neighbour (`scratchpad/concepts/pixel3.py:78`, `:785`).
- So **1 draft art pixel = 2 world pixels at game zoom 1**. The draft's grid is exactly the resolution of the game's 0.5 zoom bucket. The draft as shown (tile 128 px wide) equals zoom × pixel ratio = 2.
- At that grid: 1 m = 4 art px across, 2 down, 4 up. The steel rail gap is about 4.3 art px. A rail stroke is under 1 art px. A coaster car is about 8 art px long.
- The draft drew its coaster differently from the game: one rail ribbon of three 1-px lines (dark, mid, light) (`pixel3.py:555`), ties as single pixels (`:558`), supports as 2-px columns with braces between neighbouring columns (`:537-547`), and one fixed 8 × 5 car stamp for every heading (`:269`, `:561-566`). Its track is a free spline through 19 hand-set points (`:525-531`), not tile pieces.
- The draft makes outlines by growing each layer's alpha mask by one pixel and filling the ring with ink (`pixel3.py:215-219`).

### Zoom

- Camera zoom is 0.25 to 2.0, continuous (`src/render/camera.ts:6-7`). Wheel and key steps multiply by 1.15 (`src/input/camera.ts:13-14`). Pinch gives any factor (`src/input/controller.ts:280`).
- Each frame: `scale = zoom × pixel ratio` (`renderer.ts:1059`). `zoomBucket(scale)` picks 0.5, 1, or 2, with borders at √½ and √2 (`camera.ts:69-73`).
- A sprite is built at the bucket scale: the painter still works in world pixels, and the canvas transform multiplies by the bucket (`canvas.ts:56-63`).
- `blit` draws the sprite scaled by `scale / sprite.scale` and rounds the target rectangle to whole device pixels (`layer.ts:670-677`).
- Image smoothing is switched on every frame (`renderer.ts:1071`).
- At a total scale of exactly 0.5, 1, or 2, sprites are copied 1:1. Slice anchors are whole world pixels (multiples of 32 across, 16 down; derived from `layer.ts:269-272`), so neighbouring slices line up exactly at scale 1 and 2. At any other scale every sprite is resampled.

### Device pixel ratio

- The renderer gets the raw ratio (`src/main.ts:33`) and turns it into a plan value: capped at 2 on phones, at most 1 on low quality, and stepped down by the auto quality mode (`src/perf/quality.ts:64-76`; `renderer.ts:898-917`).
- The track layer never sees the ratio by itself. It gets `scale`, `offX`, `offY`, and the bucket (`layer.ts:490-495`).
- Per-frame effects multiply their line widths and radii by `scale` (`layer.ts:741-753`, `:769-793`, `:805-814`, `:897-918`).

### View rotation

- `ViewFrame` holds the quarter turns and the map size in metres (`project.ts:20-28`). All projection goes through `viewX` and `viewY` (`project.ts:31-55`).
- A new rotation rebuilds every slice record (`layer.ts:502-506`). The rotation is part of the slice key (`layer.ts:313`), so slice sprites are repainted per rotation.
- Car sprites do not depend on the rotation: the car heading is turned into view space first (`project.ts:58-60`; `layer.ts:624`).

### What is cached

| Cache | Key | Size | Notes |
|---|---|---|---|
| World samples | placed piece object | — | `layer.ts:148` |
| Slice records | rebuilt when a ride's piece list, last piece, or track or support colour changes, or the view turns | — | `layer.ts:440-472`, `:502-506` |
| Slice sprites | 3 per slice (one per bucket), built on first draw, kept on the record, reused across rebuilds by a string key | about 143 × 124 × bucket² px for a flat tile | `layer.ts:136`, `:313`, `:475-483`, `:683-692`. **Not** inside the shared sprite memory budget. |
| Car sprites | shape, yaw step, pitch step, roll step, colour, front, bucket | 80 × 82 px at bucket 1; 156 × 160 at bucket 2 (derived from `canvas.ts:57-58`) | `SpriteCache` of 6,000,000 px (`layer.ts:411`, `:846`), trimmed each frame (`layer.ts:929`) |
| Gate sprites | roof colour, kind, bucket | 6 per colour | `layer.ts:413`, `:819-834` |

Build limits per frame: 20 slices (`layer.ts:94`) and 32 cars (`layer.ts:95`). A slice still waiting is drawn as a plain line (`layer.ts:698-716`). A car still waiting is drawn as a plain rectangle (`layer.ts:870-878`).

Car sprite key space: 11 shapes × 16 × 24 × 16 × 12 colours × 2 × 3 buckets = 4,866,048 possible sprites (derived from `layer.ts:846`). Only poses that occur are built.

---

## Animation

The simulation runs 20 ticks per second (`src/data/tuning/core.ts:2`). Everything below except train motion steps once per tick, stops when the game is paused, and runs faster at 2× and 4×.

| What moves | How it is computed | Source |
|---|---|---|
| Trains | Position along the circuit, moved by `v × 0.05 × alpha` between ticks; smooth | `project.ts:102-107`; `layer.ts:585` |
| Car turning | Sprite chosen by heading in 16 steps (22.5°), pitch in 24 steps (15°), roll in 16 steps (22.5°). The sprite snaps; the position is exact. | `project.ts:198-212` |
| Spinning cars (mouse, raft) | Frame = floor(distance travelled / 750 mm) mod 16, added to the heading | `api.ts:307-309`; `layer.ts:586`, `:619` |
| Riders | Drawn each frame at seat points from the exact track frame (not the rounded one). Hidden below scale 0.4. Two columns when a car has 2 or more seats. | `layer.ts:881-921` |
| Chain lift | Dark line plus light dashes. Dash period 4 × scale device px, offset by tick mod 8. Width at least 1 px. | `layer.ts:719-757` |
| Water surface | Two dashed light lines at ±0.45 × channel half width. Period 6 × scale, offset by tick mod 16, the second lane 5 ticks ahead. | `layer.ts:763-799` |
| Boat spray | 7 dots per boat on a splashdown or waterfall above 2.5 m/s. Places come from the tick. | `layer.ts:151`, `:631`, `:802-817` |

Not animated: the block brake light (always green, `paint.ts:576`), the gate flag, the station, supports, the tunnel, builder ghosts.

Shading on cars changes with pose, because each pose is a separate sprite with its own face light.

---

## What a pixel-art version must keep

### Code that is pure geometry or plumbing and can stay

- All of `src/data/track/`.
- All of `src/sim/rides/track/` (sample tables, layout, API).
- All of `project.ts`.
- All of `toolState.ts`, `selection.ts`.
- In `layer.ts`: `samplesOf`, `runsInTile`, `supportSample`, `sliceBounds`, `buildRideSlices`, `CarBuffer`, and `changed`, `rebuild`, `collect`, `collectCars`, `addCar`, `drawItem` (`layer.ts:165-318`, `:330-668`).
- In `paint.ts`: `Projector`, `carDims`, the bounds constants, and the metre values in `LOOKS` (the pixel widths in `LOOKS` are art).
- In `preview.ts`: `previewPieces` and the fitting maths.

### Signatures other code calls

| Symbol | Used by |
|---|---|
| `TrackLayer.collect(world, sink, view, bucket, scale, offX, offY, alpha, rotation)` (`layer.ts:490`) | `renderer.ts:1106`; tests |
| `TrackLayer.drawItem(ctx, ref, sub)` (`layer.ts:650`) | `renderer.ts:611`; tests |
| `TrackLayer.drawOverlay(ctx, world, tool)` (`layer.ts:928`) | `renderer.ts:869`. It also trims the car cache (`layer.ts:929`). |
| `TrackLayer.sliceCount` (`layer.ts:427`) | `slices.test.ts:204` |
| `KIND_TRACK = 40` (`layer.ts:85`) and sub kinds 0 slice, 1 chain, 2 car, 3 gate, 4 water (`layer.ts:87-91`) | `renderer.ts:610`; tests filter by these numbers |
| `drawTrackPreview(ctx, typeId, w, h)` (`preview.ts:52`) | `src/ui/decks/card.ts:106` |
| `trackRideTiles(world, ride)` (`selection.ts:27`) | `renderer.ts:833` |
| `TRACK_PALETTE` (12 hex values, `colours.ts:5`) | Colour buttons in `src/ui/track/ridePanel.ts:52`. Indices are stored in saves (`src/sim/rides/track/types.ts:105`) and in type defaults. |
| `trackToolOf`, `resetTrackTool`, `TrackToolState` | `src/ui/track/builder.ts:31`, `src/ui/track/panel.ts:12`, `src/ui/track/index.ts:5`, `src/ui/decks/model.ts:7`, `src/input/track/index.ts:9` |
| `paintRun`, `paintSupport`, `paintCar`, `paintGateBooth`, `paintBox`, `paintSlice`, `lookFor`, `LOOKS`, `carDims`, `Projector`, `CAR_BOUNDS`, `GATE_BOUNDS`, `HANG_M` | Unit tests (below) |
| `buildRideSlices`, `samplesOf`, `runsInTile`, `supportSample`, `moneyLabel`, `previewPieces` | Unit tests |

### Anchors, footprints, bounds, order

- **Slice anchor:** tile centre at height 0 (`layer.ts:269-272`).
- **Car anchor:** the rail point on the sample line, which is the riders' line (`layer.ts:614-615`, `:865`).
- **Gate anchor:** gate tile centre at ground height (`layer.ts:535-539`).
- **Slice bounds** must hold everything a slice paints. Tests allow 3 px of slack (`slices.test.ts:52-59`, `:105-112`).
- **`CAR_BOUNDS`** must hold every car at every heading, pitch, and roll with no slack (`slices.test.ts:161-170`; `phase6Render.test.ts:148-163`; `waterRender.test.ts:101-112`).
- **`GATE_BOUNDS`** must hold the booth with no slack (`slices.test.ts:171-173`).
- **Footprints** come from `def.tiles`. Art does not change them.
- **Hit areas are tiles, not pixels.** A click finds the tile, then the ride through the tile's content (`pickEntity`, `src/input/tools.ts:105-112`). The selection outline is tile diamonds (`renderer.ts:831-835`).
- **Draw order:** slices use (tile depth, lowest rail height in the tile, object layer). Chain and water overlays are pushed right after their slice with the same key, and the sort keeps insertion order (`layer.ts:516-522`; `src/render/depth.ts:66-68`). Cars use the guest layer (`layer.ts:646`).
- **Support top** = rail height − `look.drop`. A test pins 0.5 m for steel (`slices.test.ts:98`).
- **Hanging cars:** `look.lift` must equal `HANG_M` = 2.4 (`phase6Render.test.ts:93`).
- **Car shape index order** is part of the cache key; new shapes go at the end (`layer.ts:109-110`).
- **Same inputs give the same pixels** (`paint.ts:11`).
- **No allocation in the per-slice and per-car loops** (`layer.ts:14`). The water overlay must reuse one dash array (`waterRender.test.ts:152-157`).
- **Build limits:** at most 20 slice builds per frame, pending slices as plain lines (spec `docs/superpowers/specs/thrills-and-chills/phase-2-coasters.md:288`).
- **Ghost colours** come from the colour-blind safe pair, and ghost lines double in width with high contrast (`src/render/palette.ts:10-37`). A test scans `src/render` for old red and green values (`tests/unit/render/safeColours.test.ts:25-42`, `:72-80`).
- **Night lighting** puts bulbs at station footprint corners (`src/render/lighting/pass.ts:288-296`). It is outside this area but assumes where a station is.

### Tests that pin this area

Unit tests run the painters against a fake context that records calls. There is no real canvas in these tests (`slices.test.ts:4`, `:21-50`).

| File | Tests | What it pins |
|---|---|---|
| `tests/unit/render/track/slices.test.ts` | 11 | One slice per rail tile; runs cover every segment once; support top; every slice paints inside its bounds; every rail piece × 4 directions × 7 types paints finite points; loop slicing; car and gate bounds; layer drawables; palette; money label |
| `tests/unit/render/track/phase6Render.test.ts` | 10 | Corkscrew and helix in 4 directions × 4 view rotations × all rail types; inverted rails at least 11.2 px above the sample line (`:99-102`); arm support wider than 10 px (`:104-107`); bobsled has no water overlay; four car shapes give different call logs (`:165-173`); a rolled car paints differently (`:175-180`); preview draws |
| `tests/unit/render/track/project.test.ts` | 11 | Projection equals the iso formula; 6 m = 48 px; view rotation; sort key; track frame; 16 / 24 steps; car pose |
| `tests/unit/render/track/selection.test.ts` | 3 | Selection tiles |
| `tests/unit/track/waterRender.test.ts` | 7 | Channel looks; every water piece paints more than 8 points (`:74`); conveyor slices; boat bounds; ripple overlay changes `lineDashOffset` by tick (`:130-170`); spray flag; preview joints |
| `tests/unit/ui/decks.test.ts`, `tests/unit/ui/track/builder.test.ts`, `tests/unit/ui/track/input.test.ts`, `tests/unit/track/waterBuilder.test.ts` | — | Use the tool state or the preview |
| `tests/e2e/track.spec.ts`, `tests/e2e/waterRides.spec.ts` | — | Work through the UI and the game state. No pixel comparison. `track.spec.ts:325` saves a screenshot. |
| `tests/e2e/perf.spec.ts` | — | Frame budget with 10 track rides (`:9`, `:125`) |

What the fake context records: `moveTo`, `lineTo`, `arc`, `ellipse`, `fillRect` (`slices.test.ts:25-30`). Many tests need at least one recorded point. Any other call returns nothing.

---

## What makes pixel art hard here

1. **Every shape is an anti-aliased vector stroke or fill with a fractional width.** Rails are 1.3 to 1.9 px, ties 1.5 to 2.4 px (`paint.ts:52-64`), drawn with round caps (`paint.ts:142-152`). Canvas 2D has no switch to turn off anti-aliasing for paths. Crisp pixels need a painter that sets whole pixels (for example `fillRect` per pixel run) on a fixed grid.

2. **Painters run at three scales.** `buildSprite` multiplies the same world-pixel drawing by 0.5, 1, or 2 (`canvas.ts:56-63`; `layer.ts:691`, `:859`). Pixel art has one native grid. At the 0.5 bucket a 1.7 px rail becomes 0.85 px.

3. **Free zoom and smoothing.** Zoom is continuous from 0.25 to 2 (`camera.ts:6-7`; `src/input/camera.ts:13-14`), the pixel ratio can be a fraction (`src/render/canvas.ts:45-48`; `src/perf/quality.ts:71`), and every blit is smoothed (`renderer.ts:1071`; `layer.ts:670-677`). Sprites are copied 1:1 only when zoom × pixel ratio is exactly 0.5, 1, or 2.

4. **Track is curved 3D geometry at any angle.** Samples carry any heading (radius 2 m, 10 m, 4.8 m turns), pitch (flat, 26.6°, 56.3°, a full circle in loops), and roll (35° banks, a full roll in corkscrews) (`geometry.ts:196-329`). There are 225 type and piece pairs, each in 4 directions and 4 view rotations, at any height. Fixed hand-drawn tile sprites cannot cover this. The pixel look has to come from a painter that follows the samples, and most lines will not have the clean 2:1 pixel-art slope.

5. **A piece is cut at tile borders into separate sprites.** `runsInTile` splits by segment midpoint (`layer.ts:175-190`); each slice sorts by itself (`layer.ts:516`). An outline made the draft's way (grow the sprite's alpha, `pixel3.py:215-219`) would put an ink line across the rails at every tile border. Outlines must be painted along the sides of a run only, and two neighbouring slices must set the same pixels at their shared sample.

6. **Things that span tiles have no home.** A slice knows one piece's samples in one tile and one support point (`layer.ts:112-137`). The draft's trestle braces run between neighbouring support columns (`pixel3.py:543-547`). A support exists only on tiles where the piece owns the ground (`api.ts:271-272`).

7. **Shading is continuous, not ramps.** `shade(hex, factor)` makes any colour (`palette.ts:122-132`). `faceLight` returns a continuous value (`paint.ts:169-171`). `paint.ts` has 33 lines that call `shade` and 32 different fixed hex colours. The player can give track, supports, and cars any of 12 colours (`colours.ts:5-18`), so each of the 12 needs its own ramp, and the fixed materials (platform, asphalt, concrete, water, ice, tunnel) need ramps too.

8. **Cars have a very large pose space.** 16 headings × 24 pitches × 16 rolls per shape, front and rear, 12 colours (`layer.ts:846`). Cars are boxes lit per face (`paint.ts:178-223`). The draft used one fixed stamp (`pixel3.py:269`). At the draft's grid a car is about 8 art px long, so either a pixel rasteriser draws the same boxes, or the pose set is cut down and loops and corkscrews look different.

9. **Car and rider positions are continuous.** A car is blitted at its exact projected point, rounded to a device pixel (`layer.ts:862-865`, `:672-675`). Riders are placed with the exact track frame over a sprite drawn at the rounded pose (`layer.ts:892` against `:856-859`). If one art pixel covers 2 to 4 device pixels, cars and heads land between art pixels.

10. **Six effects are drawn as vectors on the main canvas every frame, outside any sprite.** Chain dashes (`layer.ts:719-757`), water ripples (`:763-799`), spray (`:802-817`), riders (`:881-921`), and the two plain fallbacks (`:698-716`, `:870-878`). They use `setLineDash` and widths times `scale`. They would sit as smooth lines on top of pixel art. One test expects the ripple to work through `lineDashOffset` (`waterRender.test.ts:145-169`).

11. **The unit tests need painters that only write.** The fake context returns nothing from `getImageData` and records nothing for `drawImage` or `putImageData` (`slices.test.ts:21-50`). A painter that reads pixels back (alpha growing for outlines) fails there, and one that only uses image calls records zero points, which fails "paints something" checks (`slices.test.ts:109`, `:128`; `waterRender.test.ts:74`; `phase6Render.test.ts:72`, `:214`).

12. **Slice sprites are large and outside the memory budget.** Each slice holds up to 3 sprites on its record (`layer.ts:136`, `:683-692`), about 143 × 124 px × bucket² for a flat tile because of the 3.2 m pad (`layer.ts:231`). They are not in the shared `SpriteMemory` (`src/render/spriteCache.ts:68-132`). Baked animation frames for chain or water would multiply them.

13. **A roofed station needs new draw order.** There is no station building (`paint.ts:461-500` is all). A roof over the track must be drawn after the cars, but slices are on the object layer and cars on the guest layer (`layer.ts:516`, `:646`). It needs its own drawable kind.

14. **The card picture uses an arbitrary scale.** `drawTrackPreview` fits the scene with a free factor `k` (`preview.ts:81-85`) into 168 × 120 CSS px at up to 3× (`src/ui/decks/card.ts:82-97`). Pixel art needs a fixed-size picture and a whole-number enlargement.

15. **Builder ghost text and lines are vector UI.** Labels use `system-ui` at 12 px × scale (`layer.ts:1031`); ghost rails are 1.2 to 2.2 px × scale strokes (`layer.ts:998`).

---

## Size of the job

Draw functions in this area: **33**, about **1,190 lines** (counted from the line ranges below).

| Group | Functions | Lines | Must change for pixel art? |
|---|---|---|---|
| Painters in `paint.ts` | 13: `paintBox`, `paintRun`, `paintChannel`, `paintBeam`, `paintPlatform`, `paintRoad`, `paintBrakeFins`, `paintTunnel`, `paintSupport`, `paintCar`, `paintBoat`, `paintPhase6Car`, `paintGateBooth` | about 670 (`paint.ts:173-322`, `:338-722`, `:768-926`) | Yes, all |
| Path helpers in `paint.ts` | 3: `polyline`, `quad`, `band` | 37 (`paint.ts:142-166`, `:332-336`) | Yes. A pixel version of these three would carry most painters. |
| Per-frame art in `layer.ts` | 6: `drawChain`, `drawWater`, `drawSpray`, `drawRiders`, `drawPlainSlice`, `drawPlainCar` | 169 (`layer.ts:697-817`, `:870-921`) | Yes |
| Sprite plumbing in `layer.ts` | 5: `paintSlice`, `blit`, `drawSlice`, `drawGate`, `drawCar` | 82 (`layer.ts:320-327`, `:670-695`, `:819-868`) | Wrap: smoothing, scale, grid snapping |
| Builder overlay in `layer.ts` | 5: `drawOverlay`, `drawPieceGhost`, `label`, `arrow`, `tileOutline` | 163 (`layer.ts:927-1093`) | A design choice |
| Card picture | 1: `drawTrackPreview` | 70 (`preview.ts:52-121`) | Yes |

Other numbers:

- Shape tables to re-tune: `LOOKS` (10 styles, `paint.ts:51-65`), `carDims` (12 rows, `paint.ts:733-759`), `CAR_BOUNDS`, `GATE_BOUNDS`.
- Colours to replace with ramps: 32 fixed hex colours and 33 `shade` lines in `paint.ts`; 5 hex and 5 `rgba` values in `layer.ts`; 12 player colours.
- Looks to design: 11 rail looks, 4 supports, 12 car variants, 8 special marks, 2 booths, 1 platform, plus a station building if wanted.
- Unit tests that touch the painters: 28 tests in 3 files (`slices.test.ts`, `phase6Render.test.ts`, `waterRender.test.ts`).
- Outside the listed files but the same subject: piece icons in the builder palette, drawn as vector lines on a 44 × 28 canvas (`src/ui/track/panel.ts:43-47` onward; that file has uncommitted changes from another agent).

Untouched if the painters keep their signatures: about 1,850 lines (data 737, `project.ts` 212, `toolState.ts` 128, `selection.ts` 58, `colours.ts` 24, and about 690 lines of slice and train plumbing in `layer.ts`), plus the whole simulation side.

---

## Open questions

1. **Art pixel size.** The draft's grid is 2 world px per art pixel (the 0.5 bucket). Is that the target for track? Which camera zooms will be allowed: whole-number steps only, or free zoom with resampling?
2. **Rail design.** The spec asks for two rails, ties, and a spine (`docs/superpowers/specs/thrills-and-chills/phase-2-coasters.md:283`). The draft drew one 3-px ribbon. Two rails 4.3 art px apart fit, but leave little room for outlines. Which one?
3. **Outline rule.** Per ride, per element (rail, support, platform, car), or none on rails? Ink colour or the darkest ramp shade? How are tile seams and overlaps between slices handled?
4. **Car poses.** Keep 16 × 24 × 16 with a pixel rasteriser, or a small hand-drawn set? What do cars look like upside down in loops and corkscrews?
5. **Car and rider motion.** Snap car positions to the art grid, or accept positions between art pixels? Bake riders into car sprites (needs seat occupancy in the cache key) or keep drawing them each frame?
6. **Station building.** Add a roofed station as in the draft? One look per type or per rail style? Where does it sort against trains?
7. **Supports.** Stay one per tile, or add braces between neighbouring supports for wood and flume?
8. **Player colours.** Keep the 12 saved indices and give each a ramp? The colour buttons use the same hex list.
9. **Chain, water, spray.** Baked frames per slice (8 chain steps, 16 water steps) or pixel-snapped per-frame drawing? Should they still step per tick?
10. **Far zoom.** Does the 0.5 bucket get its own simpler art, or a scaled copy?
11. **Tests.** May the recording-context tests change (for example to a real canvas), or must the new painters keep emitting `moveTo`, `lineTo`, or `fillRect` calls?
12. **Memory.** Slice sprites sit outside the shared budget today. Is that acceptable if animation frames are added?
13. **Builder ghost and labels.** Stay as vector UI over the pixel scene, or get a pixel style?
14. **Card picture and piece icons.** Are `drawTrackPreview` and the palette piece icons in scope for the new style?
15. **Ground under track.** Stay plain grass, or get a pad or gravel bed? That is drawn by the terrain code, not here.
16. **Block brake light.** It is always green. Should it show the block state?
