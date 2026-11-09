# Phase 4 — Land, Scenery, and After Dark

- **Build:** 2 ("The Wide World"). Phase 4 is the first phase of Build 2.
- **Status:** Draft for review.
- **Master spec:** [`../2026-11-09-thrills-and-chills-design.md`](../2026-11-09-thrills-and-chills-design.md). Content numbers: [`content-catalog.md`](content-catalog.md).
- **Units:** tile = 4 m, height step = 1 m = 8 px, 20 ticks = 1 s at 1×, 1 game hour = 50 ticks, 1 day = 1,200 ticks. Money is stored in cents. This file shows dollars.

---

## 1. Goal
The player shapes the land, adds water, buys more land, decorates with themed scenery, and runs the park at night. Calm and Buzz give scenery a real effect on guests. Build 1 saves load and keep playing.

## 2. Depends on
| Phase | What this phase uses |
|---|---|
| 0 | Height-aware iso math, picking, terrain chunk cache, camera, Pointer Events input. |
| 1 | Paths and queues, flat rides, stalls, guests with temperament and needs, distance fields, park rating, saves. |
| 2 | Generic track system: piece geometry, 1D train physics, test runs, ratings, occupancy list. |
| 3 | Groundskeeper tasks, litter and mess, path items (bench, bin), research categories, weather (hot, cold, rain, sunny), Performer costumes. |

## 3. Scope
1. Terrain editing: corner tool, raise and lower brushes, level tool, smooth tool, terrain paint.
2. Paths on ramps, elevated paths with supports, height-aware path connectivity.
3. Water surface editing. Water blocks walking. Elevated paths work as bridges.
4. Water rides: Log Flume and Rapids Raft piece sets on the Phase 2 track system.
5. Map sizes 64, 96, 128, 192, 256. Land purchase and construction rights. Derived border fence.
6. Scenery: base set plus 6 themes (85 items). Gardens need water.
7. Calm and Buzz fields, guest effects, park rating input, overlays.
8. After Dark: day/night lighting, lamps, light map, night effects on guests, per-park toggle.
9. View rotation in 4 directions.
10. Save schema version 2 with a migration from version 1.
11. Performance work for 128 × 128 maps with 3,000 guests.

---

## 4. Detailed design

### 4.1 Terrain model and editing
**Corners.** Tile (x, y) has 4 corners: N = (x, y), E = (x + 1, y), S = (x + 1, y + 1), W = (x, y + 1). Mask bits: N = 1, E = 2, S = 4, W = 8. Corner height = `height[i] + bit`.

**Normalize rule.** After any edit, the game rebuilds each changed tile from its 4 corner heights `c`:
1. `m = min(c)`. Each corner above `m + 1` drops to `m + 1`.
2. `height = m`. `slope` = bits of corners at `m + 1`. If all 4 bits are set, `height = m + 1` and `slope = 0`.
3. Corner heights stay in 0–63. Base height stays in 0–63.

**Between neighbours.** No limit. Neighbour tiles may differ by any height. The renderer draws a cliff face where a tile edge is higher than the neighbour edge. Paths cannot cross a cliff because their edge heights do not match (4.2). Reason: the player gets full freedom, and the rule stays simple.

**Tools.**
| Tool | Input | Effect |
|---|---|---|
| Corner | Pointer quadrant of a tile picks the nearest corner (vertex). | Raise or lower that vertex by 1 in all tiles that share it (up to 4). Normalize each tile. Atomic: one blocked tile fails the command. |
| Raise brush | Size 1, 3, 5, or 7, centred on the tile. | Each tile in the brush: a sloped tile becomes flat at its highest corner; a flat tile rises by 1. |
| Lower brush | Same sizes. | Each tile: a sloped tile becomes flat at its lowest corner; a flat tile drops by 1. |
| Level | Drag a rectangle. | Each tile becomes flat at the target height. Target = lowest corner of the first tile pressed. Touch can change the target with + and − before Confirm. |
| Smooth | Size 1, 3, 5, or 7. | Each vertex of the brush tiles takes `Math.round(mean)` of all corner heights at that vertex (all tiles that touch it). Brush tiles then take the new vertex heights and normalize. |
| Paint | Size 1, 3, 5, or 7 + terrain type. | Sets `terrain` to grass, sand, dirt, rock, or snow. Cosmetic only. |

**Brush tools skip blocked tiles.** Raise, Lower, Level, Smooth, and Paint apply to every tile that passes the checks. They return the warning `"{n} tiles were skipped: {reason}"` with the first reason. If every tile fails, the command fails with the first reason. The Corner tool is atomic.

**Cost.** Each changed tile costs a tile fee plus a fee per corner step (sum of `|Δ|` over its 4 corners). Paint has a flat fee per changed tile. The whole command fails with `"Not enough cash"` if the total is above cash. The ghost shows the total before the player confirms.

**Checks per tile (in this order, first failure wins).**
| Check | Reason string |
|---|---|
| Tile owned state is not 1 | `"Outside the park"`; for state 3: `"You only have construction rights here"` |
| Park entrance or its outside spawn tile | `"The park entrance is in the way"` |
| Ground path on the tile | `"A path is in the way"` |
| Ride or stall footprint | `"A ride or stall is in the way"` |
| Track piece or track support base on the tile | `"A track is in the way"` |
| Scenery on the tile (centre or edge) | `"Scenery is in the way"` |
| New max corner ≥ zMin of an object above (elevated path, track) | `"Not enough clearance under an object"` |
| Corner would go above 63 | `"The land cannot go higher"` |
| Corner would go below 0 | `"The land cannot go lower"` |

Guests and staff do not block terrain edits. They are never on a tile without a path.

### 4.2 Paths on slopes, elevated paths, and connectivity
**Ground paths** sit at the tile base height. They need a flat tile or one of 4 ramp masks:
| Mask | Raised corners | High edge | Ramp rises toward |
|---|---|---|---|
| 0b0011 | N, E | the −y edge | −y |
| 0b0110 | E, S | the +x edge | +x |
| 0b1100 | S, W | the +y edge | +y |
| 0b1001 | W, N | the −x edge | −x |

- Other masks fail with `"Paths need flat land or an even slope"`.
- A wet tile fails with `"Paths cannot go in water"`.

**Elevated paths.** The path tool has a height control (+ and − buttons, or `Page Up` and `Page Down`) and a ramp toggle (flat, up, down along the drag direction).
- An elevated path entry stores `{ id, x, y, z, kind, rampDir }`. `z` is the base height of its walking surface.
- Rule: `z ≥ maxCorner + 1`. Otherwise: `"The path is below the land"`.
- Maximum height: ground + 20 m. Supports are drawn at the tile corners from the path to the ground. Supports do not block ground paths or scenery.
- Each path (ground or elevated) occupies the height range `[z, z + 3)` in the occupancy list (3 m headroom). Overlaps fail with `"Not enough clearance under an object"`.
- An elevated path over a wet tile is a bridge. This is the only way to cross water.
- Ground paths keep their Build 1 storage. Elevated paths are a new list. Path items (bench, bin, lamp) gain a `level` field: 0 = ground, else the elevated path id.

**Connectivity.** A path node is `(tile, z)`. Each node has 4 edge heights:
- Flat node at `z`: all 4 edges at `z`, all connectable.
- Ramp node from `z` to `z + 1`: low edge at `z`, high edge at `z + 1`. Side edges do not connect.
- Two nodes on neighbour tiles connect when both facing edges are connectable, the heights match, no edge scenery blocks the shared edge (4.5), and the Phase 1 queue rules allow it.
- Ride gates and stall service sides connect at the ride or stall height.

**Distance fields.** Phase 1 BFS stays, but it runs over path nodes, not tiles. Fields are `Int32Array(nodeCount)`. Edge cost stays 1. A field is rebuilt on demand, before the first guest reads it after a network change. This keeps results deterministic.

**Walking speed.** Up a ramp × 0.75. Down a ramp × 1.10. Flat × 1.00. Guests and staff use the same factors.

**Flat rides and stalls** need flat, dry land at one height under the whole footprint. Otherwise: `"The land must be flat here"`. Track pieces must stay above the land: `"The track is below the land"`.

### 4.3 Water
- `water[i]` is the surface height. 0 = no water. A tile is **wet** when `water[i] > minCorner(i)`. Depth = `water[i] − minCorner(i)`.
- **Raise water** (brush 1–7): new surface = `maxCorner + 1` if dry, else `water + 1`. Above 63: `"The water cannot go higher"`.
- **Lower water** (brush 1–7): new surface = `water − 1`. If the new surface ≤ `minCorner`, it becomes 0. A dry tile: `"There is no water here"`.
- Raise water fails per tile when an object has `zMin` below the new surface. The reason uses the 4.1 strings for that object type.
- No flow simulation. Neighbour tiles may hold different surfaces. The renderer draws a water edge between them. Reason: no flooding by accident and no extra cost per tick.
- Lowering land under water makes it deeper. Raising land above the surface makes the tile dry (normalize water to 0).
- Guests never walk on water: no path can sit on a wet tile.
- Wet tiles are Calm sources (4.6).

### 4.4 Water rides
Both rides use the Phase 2 track system: the same piece geometry, builder, validation, 1D integration, test run, and rating model. This phase adds piece sets and a drive mode. Track pieces carry their own water channel. They do not need terrain water.

**Geometry (Phase 2 §4.1–4.5).** Gentle slope = 2 m per tile. Steep slope = 6 m per tile. Small turn = 1 tile, 90°. Medium turn = 3 × 3 tiles, 90°. Bank angle = 35°. A path fits under track when the lowest rail is at least 4 m above the path. These match the Phase 2 geometry names and numbers.

| Piece id | Geometry | Drive | Notes |
|---|---|---|---|
| `flume_station` | straight, station | conveyor 1.5 m/s | Boarding. 1 boat per station tile. |
| `flume_straight` | straight | water current | — |
| `flume_turn_small_l` / `_r` | small turn | water current | — |
| `flume_turn_medium_l` / `_r` | medium turn | water current | — |
| `flume_slope_down` | gentle slope down | water current + gravity | — |
| `flume_drop` | steep slope down | gravity | Excitement source. |
| `flume_lift` | gentle slope up | conveyor 2.0 m/s | — |
| `flume_splashdown` | straight, 2 tiles | splash brake | Cuts speed to ≤ 4 m/s. Spray effect. Riders get wet. |
| `rapids_station` | straight, station | conveyor 1.5 m/s | Boarding. |
| `rapids_straight` | straight | water current | — |
| `rapids_turn_small_l` / `_r` | small turn | water current | — |
| `rapids_turn_medium_l` / `_r` | medium turn | water current | — |
| `rapids_slope_down` | gentle slope down | water current + gravity | — |
| `rapids_waterfall` | steep slope down | gravity | Riders get wet. |
| `rapids_rough` | straight | water current | Bumps: intensity source. |
| `rapids_whirlpool` | straight | whirlpool | Speed cap 2 m/s. Raft spins: nausea source. |
| `rapids_lift` | gentle slope up | conveyor 2.0 m/s | — |

**Physics (per tick, 1D along the track).**
- Water current: `a = −g·sinθ − k·(v − vCurrent)`, with `g = 9.81 m/s²` and pitch `θ` signed as in Phase 2 §4.7 (up is positive).
- Conveyor: `v = vLift`. Gravity is ignored.
- Splash brake: if `v > 4 m/s`, then `a = −12 m/s²`.
- Whirlpool: `v = min(v, 2 m/s)`.
- A boat that reaches `v ≤ 0` outside a conveyor fails the test run, as in Phase 2.

**Rating extras** (added to the Phase 2 result, after its formula).
| Source | Excitement | Intensity | Nausea | Count limit |
|---|---|---|---|---|
| Each `flume_splashdown` | +0.40 | +0.10 | — | 3 |
| Each `rapids_waterfall` | +0.30 | +0.20 | — | 3 |
| Each `rapids_rough` piece | — | +0.10 | — | 10 |
| Each `rapids_whirlpool` | +0.20 | — | +0.50 | 3 |

**Wet riders.** A rider on a piece that "gets riders wet" gains `wet` for 1 game hour. Hot weather: happiness +8. Cold or rain: happiness −8. Other weather: 0.

### 4.5 Scenery
**Placement model.** Each tile has 1 **centre slot** and 4 **edge slots**. There are no quarter tiles. Reasons: one entity per tile keeps occupancy and depth sort simple, entity counts stay 4× lower on large maps, and whole-tile targets suit touch. Small items use "cluster" art (for example, several flowers in one bed).

**Rules.**
| Rule | Reason string on failure |
|---|---|
| Tile owned state is 1 | `"Outside the park"` / `"You only have construction rights here"` |
| Tile is dry | `"Scenery cannot go in water"` |
| Centre slot is free (no path, ride, stall, track base, entrance, other centre item) | the 4.1 string for the object |
| Flat tile, unless the item has `slopeOk` | `"This item needs flat land"` |
| `[ground, ground + height)` is free in the occupancy list | `"Not enough clearance under an object"` |
| Cash ≥ cost | `"Not enough cash"` |

- **Multi-tile items** (2 × 1, 2 × 2) check every tile. Rotation 1 and 3 swap the sides of a 2 × 1 item.
- **`overPath` items** (arches) go on the centre slot of a flat ground path tile. They occupy `[ground + 3, ground + height)`. Guests walk under them.
- **Edge items** (fences, hedges, walls) go on one edge of any owned tile, path tiles included. An edge item on a path tile blocks guest movement across that edge.
- **Trees under track:** allowed when the track `zMin` ≥ ground + item height.
- **Rotation:** 4 steps. `R` key or the Rotate button.
- **Removal:** refunds 50% of the build cost, as Phase 1 demolish does.

**Gardens.** Items with `needsWater` have `waterLevel` 0–255. New items start at 255.
- Water drains 3 per game hour (5 in hot weather). Rain sets every garden to 255 when rain starts.
- Below 64 the item is **wilted**: wilted art, Calm value halved (rounded down), and a rare guest thought "These flowers look sad".
- **Groundskeeper task order:** mess, full bins, litter, then gardens with `waterLevel < 128` inside the patrol area. Watering takes 2 s and sets the level to 255.

**Scenery item tables.** `Size` is tiles. `H` is height in m. `C` is Calm strength, `B` is Buzz strength. Flags: `L` = light source (scenery only; every open ride and stall gives light anyway, master R11), `W` = needsWater, `S` = slopeOk, `E` = edge item, `P` = overPath, `K` = spooky.

*Base set (start, 13 items)*
| id | Name | Size | H | Cost | C | B | Flags |
|---|---|---|---|---|---|---|---|
| `oak_round` | Round Oak | 1×1 | 7 | $40 | 3 | 0 | S |
| `pine_tall` | Tall Pine | 1×1 | 9 | $45 | 3 | 0 | S |
| `birch_silver` | Silver Birch | 1×1 | 6 | $35 | 2 | 0 | S |
| `willow` | Weeping Willow | 1×1 | 6 | $60 | 4 | 0 | S |
| `shrub_round` | Round Shrub | 1×1 | 1 | $15 | 1 | 0 | S |
| `shrub_flowering` | Flowering Shrub | 1×1 | 1 | $20 | 2 | 0 | S, W |
| `bed_mixed` | Mixed Flower Bed | 1×1 | 1 | $25 | 3 | 0 | W |
| `bed_tulip` | Tulip Bed | 1×1 | 1 | $25 | 3 | 0 | W |
| `boulder` | Boulder | 1×1 | 2 | $20 | 1 | 0 | S |
| `fountain_garden` | Garden Fountain | 1×1 | 2 | $150 | 5 | 0 | — |
| `hedge_low` | Low Hedge | edge | 1 | $10 | 1 | 0 | E |
| `fence_wood` | Wooden Fence | edge | 1 | $8 | 0 | 0 | E |
| `rail_iron` | Iron Railing | edge | 1 | $12 | 0 | 0 | E |

*Classic Fair (start, 12 items)*
| id | Name | Size | H | Cost | C | B | Flags |
|---|---|---|---|---|---|---|---|
| `tent_red` | Striped Tent, Red | 2×2 | 5 | $180 | 0 | 3 | — |
| `tent_blue` | Striped Tent, Blue | 2×2 | 5 | $180 | 1 | 2 | — |
| `bunting_pole` | Bunting Pole | 1×1 | 6 | $30 | 0 | 1 | — |
| `flower_tub` | Flower Tub | 1×1 | 1 | $20 | 2 | 0 | W |
| `fountain_carved` | Carved Fountain | 2×2 | 3 | $400 | 6 | 0 | L |
| `ticket_arch` | Ticket Arch | 1×1 | 5 | $120 | 0 | 2 | L, P |
| `lamp_globe` | Globe Lamp Post | 1×1 | 3 | $50 | 1 | 0 | L |
| `bandstand` | Bandstand | 2×2 | 4 | $350 | 3 | 1 | L |
| `picnic_table` | Picnic Table | 1×1 | 1 | $40 | 2 | 0 | — |
| `balloon_cluster` | Balloon Cluster | 1×1 | 4 | $35 | 0 | 1 | — |
| `park_clock` | Park Clock | 1×1 | 4 | $90 | 1 | 0 | L |
| `fence_painted` | Painted Fence | edge | 1 | $10 | 0 | 0 | E |

*Frost Peaks (research: Scenery, 12 items)*
| id | Name | Size | H | Cost | C | B | Flags |
|---|---|---|---|---|---|---|---|
| `snow_pine` | Snow Pine | 1×1 | 9 | $50 | 3 | 0 | S |
| `snow_pine_small` | Small Snow Pine | 1×1 | 5 | $35 | 2 | 0 | S |
| `ice_arch` | Ice Arch | 1×1 | 5 | $140 | 3 | 0 | L, P |
| `igloo` | Igloo | 2×2 | 3 | $160 | 3 | 0 | — |
| `fountain_frozen` | Frozen Fountain | 2×2 | 3 | $380 | 6 | 0 | L |
| `statue_frost` | Frost Statue | 1×1 | 4 | $250 | 4 | 0 | — |
| `ice_crystals` | Ice Crystal Cluster | 1×1 | 2 | $60 | 2 | 0 | L |
| `snowdrift` | Snowdrift | 1×1 | 1 | $15 | 1 | 0 | S |
| `snowman` | Snow Figure | 1×1 | 2 | $45 | 2 | 0 | — |
| `aurora_lantern` | Aurora Lantern | 1×1 | 3 | $70 | 2 | 0 | L |
| `sled_rack` | Sled Rack | 1×1 | 1 | $30 | 1 | 0 | — |
| `wall_ice` | Ice Block Wall | edge | 2 | $20 | 1 | 0 | E |

*Volcano Ridge (research: Scenery, 12 items)*
| id | Name | Size | H | Cost | C | B | Flags |
|---|---|---|---|---|---|---|---|
| `lava_rock` | Lava Rock | 1×1 | 2 | $25 | 0 | 1 | S |
| `lava_crag` | Lava Crag | 2×2 | 6 | $120 | 0 | 2 | S |
| `steam_vent` | Steam Vent | 1×1 | 1 | $80 | 0 | 3 | — |
| `glow_crystal` | Glowing Crystal | 1×1 | 3 | $90 | 0 | 2 | L |
| `ember_torch` | Ember Torch | 1×1 | 3 | $55 | 0 | 1 | L |
| `statue_spark` | Spark Statue | 1×1 | 4 | $250 | 0 | 4 | L |
| `fire_fern` | Fire Fern | 1×1 | 2 | $30 | 1 | 1 | S |
| `ash_palm` | Ash Palm | 1×1 | 7 | $50 | 1 | 1 | S |
| `magma_pool` | Glow Pit | 2×2 | 1 | $200 | 0 | 4 | L |
| `basalt_columns` | Basalt Columns | 1×1 | 5 | $70 | 0 | 2 | S |
| `volcano_gate` | Volcano Gate | 1×1 | 6 | $160 | 0 | 3 | L, P |
| `wall_basalt` | Basalt Wall | edge | 2 | $20 | 0 | 1 | E |

*Spooky Hollow (research: Scenery, 12 items)*
| id | Name | Size | H | Cost | C | B | Flags |
|---|---|---|---|---|---|---|---|
| `tree_bare` | Bare Tree | 1×1 | 7 | $35 | 2 | 0 | S, K |
| `tree_twisted` | Twisted Tree | 1×1 | 6 | $45 | 2 | 0 | S, K |
| `pumpkin_patch` | Pumpkin Patch | 1×1 | 1 | $30 | 2 | 0 | W, K |
| `pumpkin_lantern` | Pumpkin Lantern | 1×1 | 1 | $40 | 1 | 0 | L, K |
| `ghost_lantern` | Ghost Lantern | 1×1 | 3 | $60 | 2 | 0 | L, K |
| `gate_crooked` | Crooked Gate | 1×1 | 4 | $120 | 2 | 0 | P, K |
| `statue_boo` | Boo Statue | 1×1 | 3 | $250 | 4 | 0 | L, K |
| `old_well` | Old Well | 1×1 | 2 | $90 | 2 | 0 | K |
| `fog_pot` | Fog Pot | 1×1 | 1 | $110 | 3 | 0 | K |
| `owl_perch` | Owl Perch | 1×1 | 4 | $40 | 2 | 0 | K |
| `mossy_stones` | Mossy Stones | 1×1 | 1 | $20 | 1 | 0 | S, K |
| `fence_spiked` | Spiked Iron Fence | edge | 2 | $15 | 0 | 0 | E, K |

*Jungle Lagoon (research: Scenery, 12 items)*
| id | Name | Size | H | Cost | C | B | Flags |
|---|---|---|---|---|---|---|---|
| `lagoon_palm` | Lagoon Palm | 1×1 | 8 | $50 | 3 | 0 | S |
| `giant_leaf` | Giant Leaf Plant | 1×1 | 3 | $30 | 2 | 0 | S, W |
| `bed_tropical` | Tropical Flower Bed | 1×1 | 1 | $30 | 3 | 0 | W |
| `ruin_arch` | Ruined Stone Arch | 1×1 | 5 | $130 | 3 | 0 | P |
| `mossy_pillar` | Mossy Pillar | 1×1 | 4 | $60 | 2 | 0 | — |
| `rope_bridge_decor` | Rope Bridge Decor | 2×1 | 3 | $90 | 2 | 0 | — |
| `rock_waterfall` | Rock Waterfall | 2×2 | 6 | $420 | 7 | 0 | — |
| `bamboo_grove` | Bamboo Grove | 1×1 | 6 | $40 | 3 | 0 | S |
| `lily_pond` | Lily Pond | 1×1 | 1 | $70 | 4 | 0 | — |
| `parrot_perch` | Parrot Perch | 1×1 | 3 | $45 | 1 | 1 | — |
| `fern_cluster` | Fern Cluster | 1×1 | 1 | $20 | 2 | 0 | S, W |
| `wall_vine` | Vine Wall | edge | 2 | $18 | 1 | 0 | E |

*Starport (research: Scenery, 12 items)*
| id | Name | Size | H | Cost | C | B | Flags |
|---|---|---|---|---|---|---|---|
| `rocket_model` | Rocket Model | 1×1 | 9 | $220 | 0 | 4 | L |
| `satellite_dish` | Satellite Dish | 2×2 | 5 | $180 | 0 | 2 | — |
| `planet_globe` | Planet Globe | 1×1 | 4 | $120 | 1 | 2 | L |
| `neon_arch` | Neon Arch | 1×1 | 5 | $150 | 0 | 3 | L, P |
| `neon_post` | Neon Post | 1×1 | 3 | $50 | 0 | 1 | L |
| `statue_robot` | Robot Statue | 1×1 | 4 | $240 | 0 | 3 | L |
| `crater` | Crater | 2×2 | 1 | $80 | 0 | 1 | — |
| `moon_rock` | Moon Rock | 1×1 | 2 | $25 | 0 | 1 | S |
| `star_beacon` | Star Beacon | 1×1 | 6 | $110 | 0 | 2 | L |
| `hologram_pad` | Hologram Pad | 1×1 | 2 | $160 | 1 | 3 | L |
| `radar_tower` | Radar Tower | 1×1 | 8 | $130 | 0 | 2 | L |
| `wall_hull` | Hull Panel Wall | edge | 2 | $22 | 0 | 1 | E |

### 4.6 Calm and Buzz fields
**Storage.** `calmRaw` and `buzzRaw` are `Uint16Array(width × height)`, one value per tile. They are derived data. Saves do not store them. Load rebuilds them from sources.

**Sources.**
| Source | Field | Strength `s` | Radius `R` |
|---|---|---|---|
| Centre scenery, 1×1 (from the item table) | Calm and/or Buzz | item C / B | 3 |
| Centre scenery, 2×1 or 2×2 | Calm and/or Buzz | item C / B, stamped from every tile | 4 |
| Edge scenery | Calm and/or Buzz | item C / B | 1 |
| Wilted garden | Calm | `floor(C / 2)` | as its size |
| Wet tile | Calm | 1 | 2 |
| Bench | Calm | 1 | 2 |
| Open flat ride, tag `thrill` (each footprint tile) | Buzz | `2 + floor(intensity / 2)` | 5 |
| Open flat ride, tag `family` (each footprint tile) | Buzz | 1 | 5 |
| Open track ride, tag `thrill` (each track tile) | Buzz | 2 | 3 |
| Open track ride, tag `family` (each track tile) | Buzz | 1 | 2 |

- Rides with tag `chill`, closed rides, and broken rides give no Buzz.
- **Stamp:** a source adds `s × (R + 1 − d)` to every tile at Chebyshev distance `d ≤ R`. All math is integer.
- **Read value:** `field = min(255, raw − localPenalty)`, floored at 0. `localPenalty` = 8 per litter item and 16 per mess on that tile only (Calm only).
- **Bands:** None < 20, Low 20–59, Medium 60–119, High ≥ 120.
- **Incremental update:** add, remove, or change of a source subtracts its old stamp and adds its new stamp. Cost is `(2R + 1)²` per tile of the source. Changes include placement, removal, wilting, ride status, water edits, and bench edits.

**Effects on guests.** `t` = temperament (0–100). `c = (100 − t) / 100` (chill share). `h = t / 100` (thrill share). `C = calm / 255`. `B = buzz / 255`. Values come from the guest's current tile and apply each game hour, except speed.
Chill and Thrill below mean the master R6 groups (Chill: T ≤ 35, Thrill: T ≥ 65).

| Effect | Formula |
|---|---|
| Energy loss | Phase 1 rate × `(1 − 0.6 × C × c)` |
| Nausea recovery | Phase 1 rate × `(1 + C × (1 + 2c))` |
| Happiness | `+ round(6 × C × c) − round(3 × B × c) + round(6 × B × h)` |
| Walking speed | Chill: × `(1 − 0.15 × C × c)`. Thrill, walking to a `thrill` ride: × `(1 + 0.25 × B × h)` |

**Park rating input: Atmosphere.** At every hour start, when the rating updates (master R8), the game computes `a = c × C + h × B` for every guest on a path (ascending id). Atmosphere = `round(mean(a) × 100)`, worth 0–100 rating points. The Phase 3 rating formula adds this term and lowers Happiness from 400 to 300 (master R8), so the weights still sum to 1,000.

**Overlays.** Calm (teal) and Buzz (orange) tint path and ground tiles by band. Each band also has a hatch density, so colour is not the only signal. A legend shows the 4 band names and thresholds. Tap or hover on a tile shows the exact value.

### 4.7 After Dark
**Darkness curve** (render only, from the clock).
| Clock | Darkness |
|---|---|
| 07:00–19:00 | 0 |
| 19:00–21:00 | linear 0 → 0.75 |
| 21:00–05:00 | 0.75 |
| 05:00–07:00 | linear 0.75 → 0 |

**Night (simulation).** Night is the integer clock window **20:00–06:00** (darkness ≈ 0.375 at its edges). The simulation never reads the darkness float.

**Light sources and light map.** `lightRaw: Uint16Array(width × height)`, derived and not saved. It does not change with the clock.
| Source | Radius `R` (tiles) |
|---|---|
| Path lamp | 3 |
| Scenery with flag `L`, 1×1 | 2 |
| Scenery with flag `L`, 2×2 | 3 |
| Open ride (from each footprint or station tile) | 2 |
| Stall | 1 |
| Park entrance | 4 |

- Stamp: `255 × (R + 1 − d) / (R + 1)` (integer division) for tiles with `d² ≤ R²` (Euclidean). A precomputed stamp table per radius gives exact integers.
- A tile is **lit** when `min(255, lightRaw) ≥ 96`.

**Rendering.**
1. Draw the frame as usual.
2. If darkness > 0, draw a light canvas at 1/4 screen resolution. Fill it with the ambient colour: lerp from white to `rgb(70, 80, 130)` by `darkness / 0.75`.
3. Draw each visible light source with additive blending (`lighter`) as a cached warm radial-gradient sprite.
4. Draw the light canvas over the frame with `multiply`, scaled up with smoothing.
5. Draw emissive sprites (bulbs, neon, lit windows) after the multiply, so they glow.
- Budget: ≤ 2 ms per frame on desktop at 1920 × 1080. At most 400 visible light sprites. Sources outside the viewport are culled. Darkness = 0 skips steps 2–5.

**Night effects** (only when After Dark is on).
| Effect | Value |
|---|---|
| Guest on an unlit path tile at night | happiness −4 per game hour; thought "This path is too dark" (cooldown 4 game hours) |
| Spooky ride (flag `spooky`) at night | ride choice score × 1.3, plus 2% per spooky scenery item within 6 tiles (max +20%) |
| Riding a spooky ride at night | happiness +5 extra |
| Energy loss at night | × 1.25 |
| Arrivals at night | Phase 1 arrival curve × `(0.5 + 0.5 × litShare)`; `litShare` = lit footpath tiles / all footpath tiles |
| Boo costume bonus | active at night, or within 6 tiles of a spooky ride |

**Per-park toggle `park.afterDark`.**
- On: all of the above.
- Off: darkness is always 0. No unlit penalty, no spooky night bonus, no night energy or arrival changes. The Phase 1 arrival curve still applies. The Boo bonus uses only the spooky-ride distance rule. Lamps stay placeable as decoration.
- New Build 2 parks: on. Migrated Build 1 parks: off.
- Turning it on with `litShare < 0.5` shows the toast "Guests dislike dark paths. Build lamps".

### 4.8 View rotation
- `r` ∈ {0, 1, 2, 3}. Each step turns the view 90° clockwise. Rotation is UI state. The simulation never reads it. Saves do not store it.
- Map → view for a tile (map size W × H):
| r | u | v |
|---|---|---|
| 0 | x | y |
| 1 | (H − 1) − y | x |
| 2 | (W − 1) − x | (H − 1) − y |
| 3 | y | (W − 1) − x |
- Continuous positions use the same table with `W` and `H` in place of `W − 1` and `H − 1`.
- Projection uses `(u, v, z)` with the master 6.4 formula. Depth sort uses `u + v`.
- Slope masks rotate by `r` positions in N → E → S → W order. Object sprites use `(rotation + r) mod 4`.
- Input: screen → view tile → inverse table → map tile. The player picks rotation for a new object in view terms; the command stores `(viewRotation − r) mod 4`.
- Sprite cache key: `defId, viewRotation, frame, zoomBucket, variant`.
- On rotation, all terrain chunk images are invalid. The renderer rebuilds visible chunks first and the rest lazily.
- The camera keeps the same map point at the screen centre.
- Controls: keys `[` (counter-clockwise) and `]` (clockwise). Two HUD buttons (44 × 44 px) on all devices.

### 4.9 Map sizes and land purchase
- Sizes: 64, 96, 128, 192, 256 (square). The New Park dialog offers all 5. Default: 96.
- Free-play layout: owned centre square of `min(48, size − 8)` tiles. A ring around it is for sale. The outer 4 tiles are not owned.
- **Owned states:** 0 = not owned, 1 = owned, 2 = land for sale, 3 = construction rights owned, 4 = construction rights for sale.
- **Buy land:** drag a rectangle. The command buys every state-2 tile in it (→ 1) and every state-4 tile (→ 3). Other tiles are skipped. Total price shows before confirm. Atomic for cash: `"Not enough cash"` fails the whole command. No tile to buy: `"Nothing to buy here"`. A single-tile tap on a state 0 tile: `"This land is not for sale"`.
- **Construction rights (state 3):** track and elevated paths may pass over with `zMin ≥ ground + 3`. Supports may stand there. Nothing else may touch the ground.
- **Border fence:** derived from `owned`, not stored (master R3). The renderer draws a fence on every edge between a state-1 tile and a tile that is not state 1. There is no `fence` content value in any schema.
- The park entrance does not move. Guests still spawn on the tile outside it.

### 4.10 Performance (128 × 128, 3,000 guests)
| Item | Rule |
|---|---|
| Terrain chunks | 16 × 16 tiles. Image bounds include the chunk's height range. LRU cache capped at 64 MB of image memory. |
| Chunk invalidation | A terrain, water, or ground-object edit marks its chunk dirty. An edit on a chunk edge also marks the neighbour chunk. |
| Sprite cache | LRU capped at 96 MB across rotations and zoom buckets. |
| Guests at zoom ≤ 0.5 | Drawn as 2 × 3 px rectangles grouped by colour (level of detail). |
| Distance fields | On demand per destination. Benchmark the worst case: 100 destinations × 5,000 nodes after a network change. |
| Fields and light | Incremental stamps only. Full rebuild on load. |
| Budget | Master section 10: 60 fps, tick < 4 ms. |

---

## 5. State and entity changes (schema version 2)
| Item | Change |
|---|---|
| `map.height`, `slope`, `water`, `terrain` | Editable. Base ground level for new parks = 8 m, so the player can dig 8 m down. |
| `map.owned` | Same values as schema 1 (master 6.3): 0 not owned, 1 owned, 2 land for sale, 3 construction rights owned, 4 construction rights for sale. Land purchase now uses 2–4. |
| `ElevatedPath` (new list) | `{ id, x, y, z, kind, rampDir }`. |
| `PathItem` | New field `level` (0 = ground, else elevated path id). Lamp added. |
| `Scenery` (new list) | `{ id, defId, x, y, z, rotation, edge (−1 = centre, 0–3), waterLevel }`. |
| `Guest`, `Staff` | Position gains the path node `z`. |
| `TrackRide` | Water piece ids and drive modes. |
| `Park` | `afterDark`, `landPrice`, `rightsPrice`. |
| Derived (not saved) | Path node graph, distance fields, occupancy list, `calmRaw`, `buzzRaw`, `lightRaw`. |

### 5.1 Migration 1 → 2 (`save/migrations/v1-to-v2.ts`)
1. Validate the input with the schema 1 validator. Failure → existing load error.
2. Keep `water` at 0. Keep `owned` values unchanged (same encoding as schema 1, master 6.3). Heights are not shifted (master R2).
3. Set `park.afterDark = false`, `landPrice = 15000`, `rightsPrice = 6000` (cents).
4. Add empty `elevatedPaths` and `scenery` lists. Set path item `level = 0`. Set guest and staff `z` from their ground path height.
4a. Set `scenario = { kind: 'freePlay' }` (Phase 5 §5).
5. Set `schemaVersion = 2`. Validate with the schema 2 validator.
6. Any failure shows "This save could not be upgraded" and keeps the current game.

---

## 6. Commands added
| Command | Fields |
|---|---|
| `raiseCorner` / `lowerCorner` | `x, y, corner` |
| `raiseLand` / `lowerLand` / `smoothLand` | `x, y, size` |
| `levelLand` | `x0, y0, x1, y1, targetHeight` |
| `paintTerrain` | `x, y, size, terrain` |
| `raiseWater` / `lowerWater` | `x, y, size` |
| `buildPath` (extended) | adds `z` and `rampDir` for elevated paths |
| `buyLand` | `x0, y0, x1, y1` |
| `placeScenery` | `defId, x, y, rotation, edge` |
| `removeScenery` | `id` |
| `setAfterDark` | `on` |
| Track commands (Phase 2) | accept water piece ids |

---

## 7. UI
| Tool | Desktop | Touch |
|---|---|---|
| Land | Brush ghost follows the cursor with a cost tooltip. Click applies. Hold the button to repeat every 300 ms. Size chips 1/3/5/7. Mode chips Raise, Lower, Smooth, Corner, Level, Paint. | Tap places the brush ghost. A mini-bar shows Raise and Lower. Each tap applies once; press and hold repeats. Corner mode marks the chosen corner before Raise or Lower. |
| Level | Drag a rectangle. Release applies. | Drag a rectangle. + / − chips change the target. Confirm applies. |
| Water | Same as Land with Raise and Lower. | Same as Land. |
| Buy Land | Owned states shown as tints. Drag shows the total. Release buys. | Drag a rectangle, check the total chip, then Confirm. |
| Scenery | Theme tabs and an item grid. Ghost is green or red with a reason icon. `R` rotates. Click places. Shift-click keeps the tool. | Tap moves the ghost. Rotate and Confirm buttons. A Repeat toggle keeps the tool. |
| Path height | `Page Up` / `Page Down` and a ramp toggle. | + / − buttons and a ramp toggle in the path mini-bar. |
| Overlays | `V` cycles None → Calm → Buzz → Light → Temperament (`O` stays the Phase 3 Office/Finance key). Legend in the corner. | Overlay button opens a chip row. Legend as a small card. |
| View | `[` and `]`. | Two rotate buttons in the HUD. |
| Park panel | After Dark switch with a short help line. | Same, in the bottom sheet. |

- All new buttons are at least 44 × 44 px and have text labels or `aria-label`.
- Ghost validity uses colour plus an icon and the reason text.

---

## 8. Tuning constants (`src/data/tuning.ts`, `src/data/scenery.ts`)
| Constant | Value |
|---|---|
| `GROUND_LEVEL_DEFAULT` | 8 m |
| `MAX_CORNER_HEIGHT` | 63 m |
| `TERRAIN_TILE_FEE` | $4 per changed tile |
| `TERRAIN_STEP_COST` | $6 per corner step |
| `PAINT_COST` | $2 per changed tile |
| `WATER_STEP_COST` | $10 per tile per step |
| `BRUSH_SIZES` | 1, 3, 5, 7 |
| `PATH_HEADROOM` | 3 m |
| `ELEVATED_PATH_MAX` | ground + 20 m |
| `ELEVATED_PATH_COST` | footpath $10, queue $12, plus $2 per m of support |
| `RAMP_SPEED_UP` / `RAMP_SPEED_DOWN` | 0.75 / 1.10 |
| `LAND_PRICE` / `RIGHTS_PRICE` | $150 / $60 per tile |
| `SCENERY_REFUND` | 50% |
| `GARDEN_DRAIN` | 3 per game hour (hot: 5) |
| `GARDEN_WILT_BELOW` / `GARDEN_WATER_BELOW` | 64 / 128 |
| `WATERING_TIME` | 2 s |
| `FIELD_BANDS` | 20 / 60 / 120 |
| `LITTER_CALM_PENALTY` / `MESS_CALM_PENALTY` | 8 / 16 |
| `ATMOSPHERE_MAX_POINTS` | 100 |
| `NIGHT_WINDOW` | 20:00–06:00 |
| `MAX_DARKNESS` / `NIGHT_AMBIENT` | 0.75 / `rgb(70, 80, 130)` |
| `LIT_THRESHOLD` | 96 |
| `DARK_PATH_PENALTY` | −4 happiness per game hour |
| `SPOOKY_NIGHT_MULT` / per item / cap | 1.3 / +2% / +20% |
| `NIGHT_ENERGY_MULT` | 1.25 |
| `FLUME_V_CURRENT` / `FLUME_K` | 1.5 m/s / 0.6 s⁻¹ |
| `RAPIDS_V_CURRENT` / `RAPIDS_K` | 3.0 m/s / 0.9 s⁻¹ |
| `V_LIFT` | 2.0 m/s |
| `SPLASH_MAX_V` / `SPLASH_DECEL` | 4 m/s / 12 m/s² |
| `WHIRLPOOL_MAX_V` | 2 m/s |
| `CHUNK_CACHE_MB` / `SPRITE_CACHE_MB` | 64 / 96 |
| Research points (Phase 3 unit, master R10) | Log Flume 480; Rapids Raft 540; each scenery theme 240 |

---

## 9. Tests

### 9.1 Unit (Vitest)
- Normalize rule: every 4-corner combination with spread 0–3 gives a valid `height` + `slope`.
- Corner tool raises the shared vertex in all 4 tiles. A blocked tile fails the whole command.
- Raise and Lower brushes on flat and sloped tiles. Level target and cost. Smooth gives the same output for the same input.
- Every check in the 4.1 table returns its exact string. Brush skip warning text and count.
- Path ramp masks (4 allowed, 11 rejected). Elevated path clearance. Connectivity on ramps, across cliffs (no link), and under edge scenery (no link).
- Water raise and lower rules, wet test, normalize to 0, blocked objects.
- Water ride physics: a flume boat completes a circuit; conveyor speed is exact; splashdown caps speed at 4 m/s; whirlpool adds rating nausea.
- Land purchase state changes, cash atomicity, border fence derivation.
- Scenery placement rules, edge items, `overPath`, rotation of 2 × 1 items, 50% refund.
- Garden drain, wilt, rain refill, groundskeeper task order.
- Calm and Buzz: incremental fields equal a full rebuild after 1,000 random operations (seeded).
- Guest effect formulas at temperament 0, 50, and 100.
- Darkness curve at 06:00, 12:00, 20:00, and 22:00. Night window edges. Light stamps. Lit threshold.
- After Dark off: no night effects. Boo bonus rules.
- Rotation: map → view → map is the identity for all 4 values of `r`. Mask rotation matches corner heights. Depth order under rotation.
- Migration 1 → 2 on 3 Build 1 fixture saves: heights unchanged, `owned` unchanged, `afterDark` false, schema 2 validator passes.

### 9.2 Integration (scripted game, 96 × 96)
Buy land. Raise a 5 × 5 hill and smooth it. Build a ramp path to the top and a flat ride there. Raise water for a 6 × 6 lake. Build an elevated path across it. Build a Log Flume. Place a Frost Peaks garden with lamps on one side and leave the other side unlit. Hire 2 groundskeepers. Turn After Dark on. Run 6 game months.
- Guests reach the hill-top ride.
- No guest is ever on a wet tile.
- No garden in the groundskeepers' area wilts.
- Mean happiness of guests on lit paths at night is higher than on unlit paths.
- Ledger totals add up.

### 9.3 Determinism
Run the scripted game twice: equal state hash. Run it again with view rotation changes between ticks: equal hash.

### 9.4 Benchmark
128 × 128, 3,000 guests: tick < 4 ms. One scenery change updates fields and light in < 0.2 ms.

### 9.5 Playwright smoke
Tests use the `window.__tc` debug hook, which exists only in dev and test builds.
- **Desktop:** New Park at 96 × 96. Raise land with the 3 × 3 brush; cash drops. Paint snow. Place a Frost Statue. Turn on the Calm overlay; the legend shows. Rotate the view; the centre tile stays the same. Turn on After Dark. Set the clock to 22:00 and then 12:00; mean canvas brightness is lower at 22:00. No console errors.
- **Phone profile:** Tap Land, tap a tile, tap Raise twice. Buy land by drag and Confirm. Place scenery with Confirm. Tap both view rotate buttons. No console errors.

---

## 10. Done when
- [ ] All tools in section 7 work with mouse, keyboard, and touch.
- [ ] Every error string in sections 4.1–4.9 appears in a test.
- [ ] Water rides pass test runs and get ratings with the water extras.
- [ ] The 85 scenery items render in all 4 view rotations.
- [ ] Calm, Buzz, and Light overlays show correct bands with a legend.
- [ ] After Dark on and off behave as in 4.7.
- [ ] 3 Build 1 fixture saves migrate and keep playing for 1 game month without errors.
- [ ] Section 9 tests pass. CI is green.
- [ ] Section 4.10 budgets are met, or the gap and a fix plan are documented.

## 11. Risks and open questions
| Risk | Mitigation |
|---|---|
| Chunk images use too much memory on phones. | LRU cap, lower cap on phones (32 MB), cache only visible zoom bucket. |
| `multiply` compositing is slow on some mobile browsers. | Measure in Phase 4. Fallback: draw darkness with `source-over` and light holes with `destination-out`. |
| Depth sort errors with cliffs, elevated paths, and tracks. | Per-tile slices (master 6.4) plus a visual regression test at fixed seeds and rotations. |
| Water piece geometry differs from the Phase 2 spec. | Section 4.4 uses the Phase 2 geometry names and numbers. Re-check both if either spec changes. |

**Open questions for the owner**
1. Should darkness hours change with the season (longer winter nights)? This spec uses one fixed curve.
2. Should `chill` rides also give Calm? This spec says no, so scenery stays the main Calm source.
