# Phase 2 — Coasters

- **Build:** 1 ("The Big Build")
- **Status:** Draft for review
- **Parent spec:** [`../2026-11-09-thrills-and-chills-design.md`](../2026-11-09-thrills-and-chills-design.md)
- **Content numbers:** [`content-catalog.md`](content-catalog.md) section 2. This file adds track-specific numbers.

---

## 1. Goal
The player builds a track ride piece by piece, tests it, sees its ratings, and opens it. Guests queue, board trains, ride, and unload. One generic track system serves every track ride type in the catalog.

## 2. Depends on
- Phase 0: loop, iso math, camera, input, HUD, sprite cache.
- Phase 1: commands, paths and queues, gates, guests (temperament, needs, ride choice), economy, ride panel, saves.

## 3. Scope
1. Generic track system: piece definitions, track types, drive modes (gravity, powered, guest-driven), vehicle features (spin).
2. Track builder with station placement, piece palette, ghost preview, undo, chain and brake options, auto-close.
3. Clearance, supports, and validation with exact error strings.
4. Deterministic 1D train physics, block sections, multi-train dispatch.
5. Test run with measured values, ratings, and warnings.
6. Guest boarding, riding, unloading, and temperament reactions.
7. Rendering of track, supports, trains, and chain animation.
8. Costs, running costs, and ride value.
9. Content: Steel Coaster, Junior Coaster, Mini Railway. Phase 3 adds Wooden Coaster, Spinning Mouse, Ghost Train, and Go-Kart Track as data only.
10. Extension points for water rides (Phase 4).

---

## 4. Detailed design

### 4.1 Track grid and joint state
- Track pieces align to tiles. Directions: 0 = +x, 1 = +y, 2 = −x, 3 = −y. A right turn is `dir + 1 (mod 4)`.
- A **joint** is the point where two pieces meet. A joint state is: tile edge midpoint, rail height `z` (integer metres), direction, slope, bank.
- **Slopes:** `F` flat (0°), `G+`/`G−` gentle (2 m per tile, 26.57°), `X+`/`X−` steep (6 m per tile, 56.31°).
- **Reason for these slopes:** gentle suits lift hills and family rides. Steep gives real drops. Both rises are integers, so heights stay integer.
- **Bank:** `none`, `left`, `right`. Bank angle = 35°.
- A piece table entry lists its entry state, its exit state, and its geometry in a **local frame**: entry tile (0, 0), heading +x, entry height 0. Placing a piece rotates and offsets this frame.
- Exit `(dx, dy)` is the offset of the **next** piece's entry tile. Rail z ranges are relative to the entry height.

### 4.2 Piece table
Groups: S station, St straight, G gentle, X steep, Ts small turn, Tm medium turn, B banking, Br brakes, BB block brake, L loop, Sp spooky tunnel. `κv` is vertical curvature (+ valley, − crest). `κh` is horizontal curvature.

| # | id | Entry | Exit (dx, dy, dz, turn) | Exit slope/bank | Tiles (local) | Rail z | Length | Curvature | Cost | Group |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `station` | F/none | 1, 0, 0, 0 | F/none | (0,0) | 0 | 4.00 m | — | $60 | S |
| 2 | `straight` | F/none | 1, 0, 0, 0 | F/none | (0,0) | 0 | 4.00 m | — | $25 | St |
| 3 | `gentle_up` | G+ | 1, 0, +2, 0 | G+ | (0,0) | 0…2 | 4.47 m | — | $35 | G |
| 4 | `gentle_down` | G− | 1, 0, −2, 0 | G− | (0,0) | −2…0 | 4.47 m | — | $35 | G |
| 5 | `steep_up` | X+ | 1, 0, +6, 0 | X+ | (0,0) | 0…6 | 7.21 m | — | $50 | X |
| 6 | `steep_down` | X− | 1, 0, −6, 0 | X− | (0,0) | −6…0 | 7.21 m | — | $50 | X |
| 7 | `flat_to_gentle_up` | F | 1, 0, +1, 0 | G+ | (0,0) | 0…1 | 4.12 m | κv +1/24 | $40 | G |
| 8 | `gentle_up_to_flat` | G+ | 1, 0, +1, 0 | F | (0,0) | 0…1 | 4.12 m | κv −1/24 | $40 | G |
| 9 | `flat_to_gentle_down` | F | 1, 0, −1, 0 | G− | (0,0) | −1…0 | 4.12 m | κv −1/24 | $40 | G |
| 10 | `gentle_down_to_flat` | G− | 1, 0, −1, 0 | F | (0,0) | −1…0 | 4.12 m | κv +1/24 | $40 | G |
| 11 | `gentle_to_steep_up` | G+ | 1, 0, +4, 0 | X+ | (0,0) | 0…4 | 5.66 m | κv +1/20 | $45 | X |
| 12 | `steep_to_gentle_up` | X+ | 1, 0, +4, 0 | G+ | (0,0) | 0…4 | 5.66 m | κv −1/20 | $45 | X |
| 13 | `gentle_to_steep_down` | G− | 1, 0, −4, 0 | X− | (0,0) | −4…0 | 5.66 m | κv −1/20 | $45 | X |
| 14 | `steep_to_gentle_down` | X− | 1, 0, −4, 0 | G− | (0,0) | −4…0 | 5.66 m | κv +1/20 | $45 | X |
| 15 | `turn_small_left` | F/none | 0, −1, 0, −1 | F/none | (0,0) | 0 | 3.14 m | κh 1/2 | $35 | Ts |
| 16 | `turn_small_right` | F/none | 0, +1, 0, +1 | F/none | (0,0) | 0 | 3.14 m | κh 1/2 | $35 | Ts |
| 17 | `turn_medium_left` | F/none | 2, −3, 0, −1 | F/none | (0..2, −2..0) | 0 | 15.71 m | κh 1/10 | $120 | Tm |
| 18 | `turn_medium_right` | F/none | 2, +3, 0, +1 | F/none | (0..2, 0..2) | 0 | 15.71 m | κh 1/10 | $120 | Tm |
| 19 | `bank_left_in` | F/none | 1, 0, 0, 0 | F/left | (0,0) | 0 | 4.00 m | roll 0→35° | $40 | B |
| 20 | `bank_left_out` | F/left | 1, 0, 0, 0 | F/none | (0,0) | 0 | 4.00 m | roll 35→0° | $40 | B |
| 21 | `bank_right_in` | F/none | 1, 0, 0, 0 | F/right | (0,0) | 0 | 4.00 m | roll 0→35° | $40 | B |
| 22 | `bank_right_out` | F/right | 1, 0, 0, 0 | F/none | (0,0) | 0 | 4.00 m | roll 35→0° | $40 | B |
| 23 | `banked_turn_medium_left` | F/left | 2, −3, 0, −1 | F/left | (0..2, −2..0) | 0 | 15.71 m | κh 1/10, bank 35° | $150 | B |
| 24 | `banked_turn_medium_right` | F/right | 2, +3, 0, +1 | F/right | (0..2, 0..2) | 0 | 15.71 m | κh 1/10, bank 35° | $150 | B |
| 25 | `brakes` | F/none | 1, 0, 0, 0 | F/none | (0,0) | 0 | 4.00 m | — | $60 | Br |
| 26 | `block_brake` | F/none | 1, 0, 0, 0 | F/none | (0,0) | 0 | 4.00 m | — | $90 | BB |
| 27 | `vertical_loop_left` | F/none | 4, −1, 0, 0 | F/none | (0..3, −1..0) | 0…16 | 50.27 m | see 4.3 | $900 | L |
| 28 | `vertical_loop_right` | F/none | 4, +1, 0, 0 | F/none | (0..3, 0..1) | 0…16 | 50.27 m | see 4.3 | $900 | L |
| 29 | `spooky_tunnel` | F/none | 1, 0, 0, 0 | F/none | (0,0) | 0 | 4.00 m | — | $150 | Sp |

- **Chain option:** pieces 2, 3, 5, 7, 8, 11, 12. Adds $20 per piece.
- **Brake option:** piece 25 has a target speed of 2–20 m/s in 1 m/s steps. Default 6 m/s.
- **Small turn geometry:** quarter circle, radius 2 m, centre at local (0, 1) tile corner.
- **Medium turn geometry:** quarter circle, radius 10 m (2.5 tiles). The piece reserves the full 3 × 3 block.
- **Spooky tunnel:** a closed box over the rail with a scare scene. The box is 4 m high.

### 4.3 Geometry profiles and the κ rule
- Each piece def generates a **sample table** at start-up: one sample every 0.25 m with `s`, local x/y, height `h`, pitch `θ`, bank `β`, `κv`, `κh`. Sample tables are static data. Saves do not store them.
- In transition pieces, pitch changes linearly with `s`. Heights are scaled so the exit height equals `dz` exactly.
- **κ rule:** iso pieces are short, but real valleys and crests are long. G-force estimates use the κv values in the table, not the drawn bend. This keeps sensible designs in real-world G ranges.
- **Vertical loop:** pitch goes 0° → 360° in four quarter arcs with radii 12 m, 4 m, 4 m, 12 m (κv = +1/12, +1/4, +1/4, +1/12). Height 16 m. The track shifts one tile sideways inside the piece. It counts as 1 inversion.
- **Trig:** `sim/trig.ts` builds sin/cos lookup tables with a fixed polynomial (+, −, ×, ÷ only). The simulation never calls `Math.sin` or `Math.cos`. This keeps results equal across browsers.

### 4.4 Track types
`TrackTypeDef` holds everything that differs between types. Adding a type needs data and a render style only.

| Field | Meaning |
|---|---|
| `drive` | `gravity`, `powered`, `guestDriven`, or `waterCurrent` (Phase 4) |
| `medium` | `rail` or `water` (Phase 4) |
| `groups` | allowed piece groups and options |
| `physics` | μ, c_d, chain speed, drive speed, corner speeds |
| `vehicle` | seats per car, car length, cars per train range, max trains, `spins` |
| `ratings` | type terms and extra terms (section 4.10) |
| `costs` | base cost, piece factor, run base, extra train cost |
| `render` | rail style, support style, car shape, colour defaults |

| Type | Groups | Notes |
|---|---|---|
| Steel Coaster | S St G X Ts Tm B Br BB L + chain | — |
| Junior Coaster | S St G Ts Tm B Br BB + chain | Max height 12 m. |
| Mini Railway | S St G Ts Tm | Powered. |
| Wooden Coaster (Ph 3) | S St G X Ts Tm B Br BB + chain | Lattice supports. Airtime factor 1.5. |
| Spinning Mouse (Ph 3) | S St G X Ts Br BB + chain | Single-car trains. `spins = true`. |
| Ghost Train (Ph 3) | S St G Ts Tm Sp | Powered. |
| Go-Kart Track (Ph 3) | S St G Ts Tm | Guest-driven. Time trial (4.8). |

- Phase 2 implements all three drive modes and the `spins` feature. Tests use test-only type definitions for the Phase 3 types.

### 4.5 Placement, clearance, and supports
- **Station:** a run of 1–12 consecutive `station` pieces. The station rail sits on the ground (`z` = ground height; ground level is 8 on new maps, master R2). The circuit starts at the entry joint of the first station tile.
- **Envelope:** each track tile occupies the height interval `[railMin − 1, railMax + 3)` metres. Two envelopes on one tile must not overlap.
- **Path under track:** a footpath or queue occupies `[g, g + 3)` on its tile. So a path fits under track when the lowest rail on that tile is at least **4 m** above the path.
- **Ground-level track** (rail at ground): the tile's `content` becomes `track`. Nothing else can stand on that ground.
- **Supports:** each tile with elevated rail gets a support from the rail to the ground. A support blocks the ground of its tile: no path, building, stall, or scenery.
- **Span rule:** a tile may skip its support if its ground holds a footpath, a queue, or other track. At most **2 consecutive tiles** along the track may skip supports.
- **No tunnels:** rail height is never below ground height. Tunnels are out of scope.
- All occupied tiles and support tiles must be owned by the park (Phase 4 may relax this for construction rights).
- The per-tile **occupancy list** (master spec 6.3) is derived from entities. It is rebuilt on load and updated by commands. Saves do not store it.

### 4.6 Validation and error strings
Commands return these exact `reason` strings (no final period, master R4). `{n}` and `{name}` are filled in.

| Rule | Reason |
|---|---|
| Not enough money | `Not enough cash` |
| Tile outside the park | `Outside the park` |
| First piece is not a station | `Track must start with a station` |
| Station rail above or below ground | `Station must be on the ground` |
| Piece entry does not match the track end | `Piece does not fit the track end` |
| Piece group not allowed for this type | `This ride type cannot use this piece` |
| Envelope overlap with a path | `Track hits a path` |
| Envelope overlap with a ride, stall, or building | `Track hits a ride or building` |
| Envelope overlap with own track | `Track hits its own track` |
| Envelope overlap with another track ride | `Track hits another track` |
| Rail below ground | `Track cannot go below ground` |
| Rail higher than the type maximum | `Too high for this ride type (max {n} m)` |
| More than 2 unsupported tiles in a row | `Too many tiles without supports` |
| More than 300 pieces | `Track is too long (max 300 pieces)` |
| Gate not beside a station side | `Gate must be beside the station` |
| Gate tile not empty | `Tile is not empty` |
| Test or open with an open circuit | `Circuit is not complete` |
| Open without both gates | `Place an entrance and an exit` |
| Open without a passed test | `Run a test first` |
| Station shorter than the train | `Station is too short for this train. Needs {n} tiles` |
| Trains > allowed by blocks | `Too many trains for the block brakes. Add a block brake or remove a train` |
| Edit while open | `Close the ride first` |
| Edit with guests on board | `Ride must be empty to edit the track` |
| Edit during a test | `Wait for the test to finish` |

### 4.7 Physics
- **Model:** each train is a point on the circuit at its **centre**. `s` = distance from the station entry joint, in metres, wrapping at the circuit length. All forces use the sample at the centre.
- **Mass-independent:** every term below is an acceleration. Guest load never changes motion. So a train with guests moves exactly like the empty test train.
- **Per tick** (dt = 0.05 s), for drive `gravity`:
  1. `a = −g·sinθ − μ·g·cosθ − c_d·v²` (friction and drag act only when v > 0).
  2. `v' = v + a·dt`.
  3. Chain piece and `v' < chainSpeed`: `v' = min(chainSpeed, v + 3.0·dt)`.
  4. Brakes and `v' > target`: `v' = max(target, v − 6.0·dt)`.
  5. Block brake: trim to 2.0 m/s the same way. If the next block is occupied, stop the train (decelerate at 6.0 m/s²) so its front halts at the piece exit joint. The train is **held**. On release it accelerates at 2.0 m/s² to 2.0 m/s.
  6. Station pieces: trim to station speed 2.0 m/s. Stop with 4.0 m/s² so the front halts 0.5 m before the station exit joint.
  7. `s += v'·dt`.
- **Drive `powered`:** `v` moves toward the target speed at 1.5 m/s² (up) or 4.0 m/s² (down), on any slope. On turn pieces the target is the corner speed (section 8).
- **Drive `guestDriven`:** like `powered`. The target speed = `6.0 + 3.0 × temperament / 100` m/s. Corner speeds are higher (section 8).
- **Gap rule** (`powered`, `guestDriven`): a vehicle never gets closer than 3 m to the tail of the vehicle ahead. It slows to the leader's speed at 4.0 m/s².
- **Stall:** for drive `gravity`, the test fails when `v' ≤ 0` outside the station and outside a hold. It also fails when the pitch is between 90° and 270° and vertical G < 0 (`Train is too slow for the loop`).
- **Equivalence guarantee:** block brakes and stations always output fixed speeds. Holding a train never changes its later speed profile. So a passed test proves that every later run completes.
- **Fault guard:** if a stall happens in operation (a bug), the ride closes. Riders appear at the exit gate. The toast says `Ride closed after a fault. Run a new test` The error goes to the console.
- **Family rule:** the game has no crashes, injuries, or deaths. Blocks and the gap rule make train contact impossible. A failed test train fades out and reappears in the station.

### 4.8 Blocks, trains, and dispatch
- **Block points:** the station and each `block_brake`. A block runs from one block point to the next.
- A block is occupied from the moment a train's front passes its start point until the train's tail passes its end point.
- **Max trains** (gravity types) = `max(1, number of block brakes)`, also capped by the type's max trains. This rule makes deadlock impossible.
- **Powered and guest-driven types** have no blocks. The gap rule separates vehicles. The station holds waiting vehicles in a line.
- **Station cycle:** arrive → unload (2 s) → load → dispatch.
  - Loading ends at max dwell, or when the train is full and min dwell has passed. Defaults: min 3 s, max 15 s. Player range: min 0–30 s, max 5–60 s.
  - Gravity types dispatch only when the next block is free.
- **Station length:** `ceil(cars × carLength / 4)` tiles at least.
- **Go-Kart time trial:** the player sets laps (1–5, default 2). Karts depart 1 s apart. Karts pass through the station on middle laps and stop there after the last lap. Up to `min(12, stationTiles × 2)` karts run. The fastest lap time shows in the ride panel.
- Mini Railway and Ghost Train run 1 lap per dispatch.

### 4.9 Test run
- The player presses **Test**. One empty train of the configured size runs one lap in game time. The ride status is `testing`.
- Any change to pieces, chain, brake speed, train count, or car count clears the test result.
- **Measured values** (G values use a 5-tick moving average; station time is excluded):

| Value | Definition |
|---|---|
| `vMax` | Max speed (m/s) |
| `vAvg` | `length / rideTime` (m/s) |
| `rideTime` | Dispatch to station stop (s) |
| `length` | Circuit length (m) |
| `drops`, `dropMax` | A drop is a continuous descent of 3 m or more. Count, and the largest (m). |
| `posGMax` | Max vertical G |
| `vertGMin` | Min vertical G (negative = ejector airtime) |
| `airtime` | Seconds with vertical G < 0.2 |
| `latMax` | Max lateral G |
| `inversions` | Count of loop pieces |
| `highest` | Highest rail above ground (m) |
| `turnPieces` | Count of turn pieces of any kind |

- **G formulas** at a sample with pitch θ, bank β, speed v:
  - `Gv = ((g·cosθ + v²·κv)·cosβ + v²·κh·sinβ) / g`
  - `Gl = |v²·κh·cosβ − g·cosθ·sinβ| / g`

### 4.10 Ratings
Raw terms (all `min` caps shown):

- `E_raw = 0.08·vMax + 0.04·min(dropMax, 50) + 0.3·min(drops, 5) + 0.6·kAir·min(airtime, 3) + 0.6·min(inversions, 3) + 0.25·min(latMax, 2) + min(rideTime / 30, 1.5) + E_type + E_extra`
- `I_raw = 0.8·max(0, posGMax − 1) + 1.2·max(0, 0.5 − vertGMin) + 1.0·latMax + 0.05·vMax + 0.4·min(inversions, 3) + 0.02·min(dropMax, 50) + I_type`
- `N_raw = 0.5·max(0, posGMax − 1.5) + 1.0·latMax + 0.6·min(inversions, 3) + 0.3·min(airtime, 3) + min(0.1·turnPieces, 2) + N_type`

Steps in order:
1. **Soft cap** each value: if `x > 6`, then `x = 6 + (x − 6) × 0.5`.
2. **Penalties** on excitement: `posGMax > 5.0` → `E −= 1.5 × (posGMax − 5.0)`. `vertGMin < −1.5` → `E −= 1.5 × (−1.5 − vertGMin)`. `latMax > 2.5` → `E −= 1.5 × (latMax − 2.5)`. `rideTime < 20` → `E ×= rideTime / 20`.
3. Clamp to 0.00–10.00. Round to the nearest hundredth: `Math.round(x × 100)`. Store integer hundredths.

| Type | E_type | I_type | N_type | kAir | E_extra |
|---|---|---|---|---|---|
| Steel Coaster | 1.0 | 0.3 | 0.0 | 1.0 | — |
| Junior Coaster | 1.2 | 0.0 | 0.0 | 1.0 | — |
| Mini Railway | 2.0 | 0.0 | 0.0 | 1.0 | `min(length / 100, 1.5)` (scenic) |
| Wooden Coaster | 1.0 | 0.8 | 0.2 | 1.5 | — |
| Spinning Mouse | 1.2 | 0.5 | 1.5 | 1.0 | `min(0.1 × small turns, 1.0)` |
| Ghost Train | 2.0 | 0.3 | 0.0 | 1.0 | `min(0.4 × spooky tunnels, 2.0)` |
| Go-Kart Track | 1.5 | 0.5 | 0.0 | 1.0 | `0.2 × laps` |

**Worked example — reference circuit R1 (section 9.2), Steel Coaster:**

| Input | Value | | Input | Value |
|---|---|---|---|---|
| vMax | 17.4 m/s | | vertGMin | 0.57 |
| rideTime | 52.0 s | | airtime | 0.0 s |
| length | 204.4 m | | latMax | 0.66 |
| drops / dropMax | 1 / 16 m | | inversions | 0 |
| posGMax | 2.24 | | turnPieces | 4 |

- E = 1.392 + 0.64 + 0.3 + 0 + 0 + 0.165 + 1.5 + 1.0 = 4.997 → **5.00**
- I = 0.992 + 0 + 0.66 + 0.87 + 0 + 0.32 + 0.3 = 3.142 → **3.14**
- N = 0.37 + 0.66 + 0 + 0 + 0.4 + 0 = 1.43 → **1.43**
- A unit test feeds these inputs to the rating function and expects 500 / 314 / 143.

**Warnings** (ride panel and test toast):

| Condition | Text |
|---|---|
| I > 8.00 | `Very intense: most guests will not ride` |
| N > 7.00 | `Guests may feel sick after this ride` |
| E < 2.00 | `This ride is dull` |
| Any penalty applied | `G-forces are too strong. Guests enjoy this ride less` |
| Test failed | `Test failed: train stops on piece {n} ({name})` or `Test failed: train is too slow for the loop on piece {n}` |

### 4.11 Guests on track rides
- Ride choice uses the Phase 1 score and hard rejects, including max intensity `2.0 + 0.08 × T`. A ride without a passed test has no stats and is never chosen.
- **Boarding:** guests on the platform board in queue order. Seats fill from the front car to the back. All waiting guests board within 2 s.
- **Riding:** the guest state is `riding` with `{ rideId, trainId, car, seat }`. The guest draws inside the car.
- **Unloading:** riders leave through the exit gate. Happiness and nausea change by the Phase 1 rules, plus:
  - Thrill group (T ≥ 65, master R6) and airtime ≥ 1.0 s: happiness +10. Thought id `airtimeAwesome`: "Floating out of my seat was awesome!"
  - Chill group (T ≤ 35) and inversions ≥ 1: happiness −10. Thought id `neverUpsideDown`: "Upside down? Never again"
- A guest who refuses for intensity gets the Phase 1 thought "That looks too intense for me".
- Thoughts follow master R5 (stored as ids, text in `src/data/strings/en.ts`).
- The ride panel shows throughput in guests per game hour: `seats × trains × 50 / (rideTicks + maxDwellTicks)` (1 game hour = 50 ticks).

### 4.12 Costs and value
- **Build cost** = type base cost + Σ (piece cost × piece factor) + chain extras + $3 × (highest rail above ground on the piece, m) + extra trains × extra train cost.
- **Running cost per month** = run base + $1.50 × piece count + extra train cost / 20 × (trains − 1). It is charged by the hourly charge rule (master R9).
- **Refunds:** `removeLastTrackPiece` refunds 100% before the ride first opens and 50% after. Demolish refunds 50% (Phase 1 rule), or 100% if the ride never opened.
- **Asset value** (input to Phase 3 park value) = `totalBuildCost × max(0.30, 1 − 0.7 × ageMonths / 120)`, the same formula as Phase 3 §4.12 (`DEP_FLOOR` 0.30, `DEP_MONTHS` 120). This is not the Phase 1 "ride value" used for price checks.
- **`tall` flag** (catalog section 2): set from the last passed test when `highest ≥ 20 m`.

### 4.13 Rendering
- **Pieces:** one draw function per rail style. It projects the sample table through iso math. It draws two rails (gauge 1.2 m), cross ties every 1 m, and the spine. Direction and view rotation are inputs, so all 4 rotations use the same code.
- **Per-tile slices:** a placed piece pre-renders into one slice sprite per occupied tile. Each slice holds the rail samples inside that tile and the tile's support. Slices sort with key `(x + y, railMin, layer)`.
- **Supports:** steel = round posts; wooden = lattice; powered rides = short pillars.
- **Trains:** cars draw every frame at the interpolated `s`. Car sprites are cached lazily by (type, yaw in 16 steps, pitch in 24 steps, zoom bucket, colour). Riders draw as heads with shirt colours. Spinning cars add a spin frame.
- **Chain animation:** dashes on visible chain pieces move by `tick mod 8`. It draws as an overlay, not in the slice cache.
- **Cache rules:** slices rebuild on zoom bucket or view rotation change. At most 20 slices rebuild per frame. Pending slices draw as plain lines.
- **Colours:** the player picks track, support, and car colours from a 12-colour original palette.
- **Performance:** 10 track rides × 3 trains × 7 cars = 210 car draws per frame. This fits the Build 1 budget.

### 4.14 Water extension points (Phase 4)
- `medium: 'water'` pieces draw a channel and an animated water surface.
- `drive: 'waterCurrent'` uses gravity physics plus a current speed per piece.
- Piece flags reserved: `conveyorLift` (acts as chain), `splashdown` (brakes with a spray effect), `waterfall`.
- Any speed variation on rapids must be a fixed function of `s`, never the RNG. This keeps test and operation equal.
- Hook `onRideEffects(guest, ride)` lets Phase 4 add wetness.

---

## 5. State and entity changes

```ts
interface TrackRide {                          // plus the Phase 1 ride record fields; lives in the `track` slice (master R12)
  kind: 'track';
  typeId: TrackTypeId;
  status: 'building' | 'testing' | 'closed' | 'open';
  pieces: TrackPieceInstance[];                 // ordered from the station entry joint
  circuitClosed: boolean;
  gates: { entrance: TileRef | null; exit: TileRef | null };
  trainConfig: { trains: number; carsPerTrain: number };
  operation: { minDwellTicks: number; maxDwellTicks: number; laps: number };
  trains: TrainState[];
  test: TestResult | null;                      // measured values + ratings (hundredths)
  colours: { track: number; supports: number; cars: number };
  totalBuildCost: number;                       // cents
  openedOnce: boolean;
}
interface TrackPieceInstance { defId: string; x: number; y: number; z: number; dir: 0|1|2|3; chain: boolean; brakeSpeed: number | null; }
interface TrainState { id: number; s: number; v: number; state: 'loading'|'running'|'held'|'unloading'|'waiting'; dwellTicks: number; lap: number; seats: number[]; }   // seats: guest id or −1
```

- The Phase 1 guest record gains `seat: { rideId, trainId, car, seat } | null`. It is set only in state `riding`.
- **Tick order:** track rides update after flat rides (master R13). Trains update in ascending ride id, then train id.
- Derived, not saved: occupancy lists, cumulative piece lengths, block layout, sample tables.
- **Save:** these fields are part of Build 1 schema version 1. No migration is needed inside Build 1.
- **Load checks:** each piece entry matches the previous exit; `circuitClosed` matches the geometry; `0 ≤ s < length`; every seated guest exists and is `riding` on this ride. Any failure rejects the save (master spec 7).

## 6. Commands added

| Command | Rules |
|---|---|
| `placeStation { typeId, x, y, dir }` | Creates a `TrackRide` in `building` with one station piece. Pays base cost + piece. |
| `addTrackPiece { rideId, defId, chain?, brakeSpeed? }` | Appends at the track end. Auto-closes the circuit when the exit joint equals the station entry joint. |
| `removeLastTrackPiece { rideId }` | Not the first station piece. Reopens a closed circuit. Refund per 4.12. |
| `setPieceOptions { rideId, index, chain?, brakeSpeed? }` | Ride `building` or `closed`. Clears the test. |
| `placeTrackGate { rideId, kind, x, y }` | Ground tile beside a station tile's side. Entrance ≠ exit. |
| `setTrainConfig { rideId, trains, carsPerTrain }` | Ride not open. Clears the test. |
| `setTrackOperation { rideId, minDwellS, maxDwellS, laps }` | Any time. |
| `setTrackColours { rideId, track, supports, cars }` | Any time. |
| `startTestRun { rideId }` | Circuit closed, ride not open, station long enough, train count valid. |
| `editTrack { rideId }` | Ride closed, trains empty and in the station. Status → `building`. |
| `setRideOpen`, `demolish`, `setRidePrice` | Phase 1 commands, extended with the rules above. |

## 7. UI

### 7.1 Flow
1. Build menu → **Track Rides** tab → pick a type.
2. Place the station tile. The ghost shows a direction arrow. Rotate with `R` or the Rotate button.
3. The **builder** opens. The palette shows only pieces that fit the current end and the type. Groups: Straight, Slopes, Turns, Banking, Special.
4. Selecting a piece shows its ghost at the track end with cost, height tag (`+12 m`), and a dashed line to the ground.
5. A valid ghost is green with `✓ $45`. An invalid ghost is red with `✕` and the reason text in the panel. The conflicting object gets a red outline.
6. Piece options appear when available: **Chain lift** toggle, **Brake speed** − / + stepper.
7. When the circuit closes, a toast says `Circuit complete!`. The builder asks for the **Entrance** gate, then the **Exit** gate.
8. The ride panel opens on the **Test** tab. **Test** → watch the train → results.
9. **Open** starts operation.

### 7.2 Desktop
- Side panel builder. Hovering a palette piece previews its ghost. Click selects it. **Build** (or `Enter`, or a click on the ghost) adds it. Double-click selects and builds.
- Shortcuts: `Backspace` undo last piece, `C` chain toggle, `1`–`5` palette groups, `Esc` leave the builder (the track stays).

### 7.3 Touch
- Bottom sheet, at most 45% of the screen height. Row 1: group tabs. Row 2: piece buttons with icon and name, at least 56 × 56 px. Row 3: options, cost label, **Undo**, large **Build** button (56 px high), **Done**.
- No hover. Tap a piece to show its ghost. Tap **Build** to confirm.
- One-finger drag and pinch move the camera. Map taps never add pieces.
- **Follow** toggle (on by default): the camera keeps the track end in view.

### 7.4 Ride panel tabs (track rides)
- **Overview:** status, price, queue, riders, income, warnings.
- **Track:** pieces, length, highest point, build cost, **Edit track**, **Demolish**.
- **Trains:** trains, cars, dwell min/max, laps (go-karts), colours.
- **Test:** measured values, ratings, warnings, and a line chart of speed, vertical G, and lateral G over ride time. Each series has a label and a different line style.

## 8. Tuning constants (starting values, `src/data/track.ts`)

| Type | Base cost | Piece factor | Run base/mo | Extra train | Car length | Seats/car | μ | c_d (1/m) | Chain | Drive speed | Max height |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Steel Coaster | $3,000 | 1.0 | $120 | $800 | 2.5 m | 4 | 0.015 | 0.0008 | 3.0 m/s | — | 50 m |
| Junior Coaster | $1,500 | 0.7 | $60 | $400 | 2.0 m | 2 | 0.020 | 0.0010 | 2.0 m/s | — | 12 m |
| Mini Railway | $1,200 | 0.6 | $50 | $500 | 3.0 m | 6 | — | — | — | 5.0 m/s | 8 m |
| Wooden Coaster | $2,800 | 1.2 | $130 | $700 | 2.5 m | 4 | 0.025 | 0.0010 | 2.5 m/s | — | 40 m |
| Spinning Mouse | $2,500 | 0.9 | $90 | $300 | 2.0 m | 4 | 0.020 | 0.0010 | 2.0 m/s | — | 16 m |
| Ghost Train | $2,000 | 0.8 | $70 | $300 | 2.0 m | 2 | — | — | — | 3.0 m/s | 6 m |
| Go-Kart Track | $1,800 | 0.5 | $60 | $100 | 2.0 m | 1 | — | — | — | 6.0–9.0 m/s | 4 m |

| Constant | Value |
|---|---|
| g | 9.81 m/s² |
| Bank angle | 35° |
| Chain pull acceleration | 3.0 m/s² |
| Brake deceleration | 6.0 m/s² |
| Station speed / block brake exit speed | 2.0 m/s |
| Station stop deceleration | 4.0 m/s² |
| Powered acceleration / deceleration | 1.5 / 4.0 m/s² |
| Corner speed, powered (small / medium turn) | 3.0 / 6.0 m/s |
| Corner speed, guest-driven (small / medium turn) | 5.0 / 8.0 m/s |
| Gap rule distance | 3.0 m |
| Path clearance under rail | 4 m |
| Max unsupported tiles in a row | 2 |
| Max pieces per ride | 300 |
| Sample step | 0.25 m |
| G moving average | 5 ticks |
| Airtime threshold | vertical G < 0.2 |
| Drop threshold | 3 m |

## 9. Tests

### 9.1 Unit (Vitest)
- **Piece table:** for every piece, the sample end matches the exit state within 1e−9 m; all samples lie in the listed tiles; the summed sample length matches the table within 0.01 m.
- **Rotation:** each piece placed in 4 directions occupies the expected world tiles and exits at the expected joint.
- **Palette:** for each end state and type, the valid piece list matches the group and slope/bank rules.
- **Validation:** one minimal case per error string in 4.6.
- **Clearance:** path under rail at 4 m passes; at 3 m fails. Span rule passes at 2 and fails at 3.
- **Closure:** the circuit closes only on an exact joint match.
- **Physics:** a steep drop of 18 m gives `v² = 2·g·h` minus losses within 1%. Chain holds chain speed. Brakes trim to target. Block brake trims to 2.0 m/s. Powered speed reaches the target. Gap rule keeps ≥ 3 m.
- **Stall:** a lift without chain fails with `Test failed: train stops on piece {n} ({name})`. A loop after a 6 m drop fails with the loop message.
- **G formulas:** flat turn `Gl = v²/(g·R)`. Loop top `Gv = −1 + v²/(g·4)`.
- **Ratings:** worked example → 500 / 314 / 143. One case each for soft cap, every penalty, and the clamp.
- **Blocks:** max trains = `max(1, block brakes)`. Over 10 game days with 3 trains, the distance between any two trains is always ≥ train length + 1 m.
- **Trig:** table sin/cos match `Math.sin`/`Math.cos` within 1e−6 (tests only).
- **Costs:** build cost, running cost, refunds, and asset value formulas.
- **Save:** round-trip with trains in motion and seated guests. Each load check in section 5 rejects a corrupted save.

### 9.2 Integration — reference circuit R1
Steel Coaster, 1 train of 4 cars, built by commands. Station at world (4, 2), direction 0. Piece list:
1. `station` ×3
2. Chain: `flat_to_gentle_up`, `gentle_to_steep_up`, `steep_up`, `steep_to_gentle_up`, `gentle_up_to_flat` (top at 16 m)
3. `straight` ×2, `turn_medium_right`
4. `flat_to_gentle_down`, `gentle_to_steep_down`, `steep_down`, `steep_to_gentle_down`, `gentle_down_to_flat`
5. `brakes` (8 m/s), `turn_medium_right`, `straight` ×10, `turn_medium_right`, `straight` ×6, `turn_medium_right` (closes the circuit)

Script: build R1 → gates + queue + footpath → test → open → run 1 game month with guests. Checks:
- The test passes. Ratings are within ±0.30 of the worked example.
- Riders > 0. Ride ticket income in the ledger = riders × price.
- Every guest who boarded also unloaded or is still seated at the end.
- The no-contact invariant holds every tick.

### 9.3 Determinism
- Run the R1 script twice → equal state hash.
- Run the test twice on fresh copies → identical `TestResult`.

### 9.4 Playwright smoke
- **Desktop:** open the builder, place a station, add 3 pieces from the palette, check that cash drops by the shown cost, undo once, check the refund. Import the R1 fixture save, press **Test**, wait for results, check that 3 ratings show, press **Open**.
- **Phone profile:** same steps with taps and the **Build** button. A pinch while the builder is open changes zoom and adds no piece.

## 10. Done when
- [ ] All 29 pieces exist with sample tables that pass the piece table tests.
- [ ] A player builds R1 by hand on desktop and on a phone.
- [ ] Every error string in 4.6 has a passing test.
- [ ] R1 passes its test with ratings near 5.00 / 3.14 / 1.43, and guests ride it for a month.
- [ ] A 3-train coaster with 3 block brakes runs 10 game days with no contact.
- [ ] Test-only defs for powered, guest-driven, and spinning types pass their physics tests.
- [ ] Save round-trip with moving trains passes.
- [ ] Desktop and phone smoke tests pass. CI is green.
- [ ] Frame rate meets the Build 1 budget with 10 track rides open.

## 11. Risks and open questions
- **κ abstraction:** G values come from gameplay κ values, not the drawn bend. Players may find a few results surprising. Mitigation: the Test tab chart shows where G peaks.
- **Edit from the end only:** Build 1 edits a finished track by removing pieces from the closing end. Mid-track insertion waits for Phase 6.
- **No sloped turns or helixes:** turns are flat only. Phase 6 adds the helix piece.
- **No diagonal track:** a deliberate Build 1 limit.
- **Strict block rule:** `max(1, block brakes)` trains is safe but conservative. Real parks often allow one more train. Revisit after play-testing.
- **Go-karts are a time trial:** single-lane tracks give no overtaking.
- **Slice sorting:** loops and large turns can show small sort errors at some angles. Mitigation: per-tile slices and a visual test fixture.
- **Rating tuning:** formulas need play-testing. All weights live in `src/data/track.ts`.
- **Phase 3 constraint:** track breakdowns may hold trains only at the station or a block brake. They never change physics mid-course. This keeps the equivalence guarantee.
