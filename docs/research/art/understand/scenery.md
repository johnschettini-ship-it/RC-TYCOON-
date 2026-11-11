# Scenery: how the game draws it today

Area: `src/render/scenery/art/*` (base, fair, frost, volcano, spooky, jungle, starport, kit, index), `src/render/scenery/layer.ts` and its helpers (`sprites.ts`, `place.ts`, `ghost.ts`, `preview.ts`), and the catalog `src/data/catalog/scenery.ts`.

All paths below are relative to `/home/user/RC-TYCOON-`. Line numbers are from the working tree on 2026-11-11 (branch head `e247baa`). Nothing in the repository was changed.

Target look, for reference: `docs/screenshots/phase-7-draft-desktop.png`. The draft script (`scratchpad/concepts/pixel3.py`) draws on a grid where one tile is 32 × 16 art pixels (`scr()` at line 78), then scales the picture up 2× with nearest-neighbour (640 × 400 raw to 1280 × 800). The game's tile is 64 × 32 world pixels at zoom 1. So **one draft art pixel = 2 game world pixels at zoom 1**. This number matters in several places below.

---

## 1. What this area draws

### Totals

| What | Count | Source |
|---|---|---|
| Scenery items in the catalog | **85** | `src/data/catalog/scenery.ts:46-146` |
| Themes | 7 (base 13 items, the other six 12 each) | `src/data/catalog/scenery.ts:9-17` |
| Item draw functions (one per id) | 85 | registry `src/render/scenery/art/index.ts:19-27` |
| 1 × 1 centre items (not edge, not arch) | 58 | catalog |
| 2 × 2 items | 11 | `tent_red`, `tent_blue`, `fountain_carved`, `bandstand`, `igloo`, `fountain_frozen`, `lava_crag`, `magma_pool`, `rock_waterfall`, `satellite_dish`, `crater` |
| 2 × 1 items | 1 | `rope_bridge_decor` |
| Edge items (flag E) | 9 | `hedge_low`, `fence_wood`, `rail_iron`, `fence_painted`, `wall_ice`, `wall_basalt`, `fence_spiked`, `wall_vine`, `wall_hull` |
| Arches over paths (flag P) | 6 | `ticket_arch`, `ice_arch`, `volcano_gate`, `gate_crooked`, `ruin_arch`, `neon_arch` |
| Gardens with a water level (flag W) | 8 | `shrub_flowering`, `bed_mixed`, `bed_tulip`, `flower_tub`, `pumpkin_patch`, `giant_leaf`, `bed_tropical`, `fern_cluster` |
| Light sources (flag L) | 25 | fair 5, frost 4, volcano 5, spooky 3, jungle 0, starport 8, base 0 |
| May stand on a slope (flag S) | 23 | catalog |
| Spooky (flag K) | 12 | all of Spooky Hollow |

Flag letters are decoded in `S()` at `src/data/catalog/scenery.ts:22-39`. The item type is `SceneryDef` at `src/data/catalog/types.ts:124-148`.

Distinct pictures the game can ask for (before tint and zoom bucket):

- 85 items × 4 sprite rotations = **340**
- plus 8 gardens × 4 rotations wilted = 32
- plus 6 arches × 4 rotations × 2 halves = 48 (the two halves are the whole drawing split in two)
- Each of these exists in up to 3 zoom buckets, and the whole drawing also in 2 ghost tints.

### Per-theme tables

Columns: footprint is `w × d` tiles; height is `heightM` in metres and (in brackets) world pixels at 8 px per metre; flags as in the catalog; "Facing use" says what the 4 sprite rotations really change (see section 2.6). All draw functions have the type `SceneryArtFn`.

#### Base Set (`base`, open at start), `src/render/scenery/art/base.ts`, 13 items

| Item id | Name | Size | Height | Flags | Draw function (file:line) | Lines | Facing use |
|---|---|---|---|---|---|---|---|
| `oak_round` | Round Oak | 1×1 | 7 (56) | S | `oak` base.ts:41-46 | 6 | lean left or right, canopy seed |
| `pine_tall` | Tall Pine | 1×1 | 9 (72) | S | `pine` base.ts:48-54 | 7 | tier offset by axis (2 looks) |
| `birch_silver` | Silver Birch | 1×1 | 6 (48) | S | `birch` base.ts:56-63 | 8 | lean, leaf seed |
| `willow` | Weeping Willow | 1×1 | 6 (48) | S | `willow` base.ts:65-78 | 14 | lean, seed, strand lengths |
| `shrub_round` | Round Shrub | 1×1 | 1 (8) | S | `shrubRound` base.ts:80-83 | 4 | seed only |
| `shrub_flowering` | Flowering Shrub | 1×1 | 1 (8) | S W | `shrubFlowering` base.ts:85-90 | 6 | seed only; wilted art |
| `bed_mixed` | Mixed Flower Bed | 1×1 | 1 (8) | W | `bedMixed` base.ts:92-95 | 4 | seed only; wilted art |
| `bed_tulip` | Tulip Bed | 1×1 | 1 (8) | W | `bedTulip` base.ts:97-117 | 21 | rows turn by axis (2 looks); wilted art |
| `boulder` | Boulder | 1×1 | 2 (16) | S | `boulder` base.ts:119-123 | 5 | rock seed |
| `fountain_garden` | Garden Fountain | 1×1 | 2 (16) | – | `fountainGarden` base.ts:125-144 | 20 | which side splashes higher (2 looks) |
| `hedge_low` | Low Hedge | edge | 1 (8) | E | `hedgeLow` base.ts:146-153 | 8 | the view edge (4) |
| `fence_wood` | Wooden Fence | edge | 1 (8) | E | `fenceWood` base.ts:155-163 | 9 | the view edge (4) |
| `rail_iron` | Iron Railing | edge | 1 (8) | E | `railIron` base.ts:165-173 | 9 | the view edge (4) |

Theme helpers: `seed` base.ts:31-33 (3 lines, no drawing), `soilBed` base.ts:36-39 (4 lines, exported, also used by `jungle.ts:6`). Item lines: 121.

#### Classic Fair (`classic_fair`, open at start), `src/render/scenery/art/fair.ts`, 12 items

| Item id | Name | Size | Height | Flags | Draw function (file:line) | Lines | Facing use |
|---|---|---|---|---|---|---|---|
| `tent_red` | Striped Tent, Red | 2×2 | 5 (40) | – | `tentRed` fair.ts:33-56 | 24 | real 4-way: door flap on the facing side (only drawn for the 2 front facings), pennant side |
| `tent_blue` | Striped Tent, Blue | 2×2 | 5 (40) | – | `tentBlue` fair.ts:58-87 | 30 | real 4-way: door, pennant side |
| `bunting_pole` | Bunting Pole | 1×1 | 6 (48) | – | `buntingPole` fair.ts:89-109 | 21 | string direction by axis (2 looks) |
| `flower_tub` | Flower Tub | 1×1 | 1 (8) | W | `flowerTub` fair.ts:111-116 | 6 | seed; wilted art |
| `fountain_carved` | Carved Fountain | 2×2 | 3 (24) | L | `fountainCarved` fair.ts:118-151 | 34 | rosette angle shifts a little |
| `ticket_arch` | Ticket Arch | 1×1 | 5 (40) | L P | `ticketArch` fair.ts:153-169 | 17 | post axis (2 looks); 2 halves |
| `lamp_globe` | Globe Lamp Post | 1×1 | 3 (24) | L | `lamp` fair.ts:171-182 | 12 | real 4-way: bracket and sign point to the facing |
| `bandstand` | Bandstand | 2×2 | 4 (32) | L | `bandstand` fair.ts:184-213 | 30 | post ring turns a little |
| `picnic_table` | Picnic Table | 1×1 | 1 (8) | – | `picnicTable` fair.ts:215-243 | 29 | long axis (2 looks) |
| `balloon_cluster` | Balloon Cluster | 1×1 | 4 (32) | – | `balloonCluster` fair.ts:245-268 | 24 | balloon order by seed |
| `park_clock` | Park Clock | 1×1 | 4 (32) | L | `parkClock` fair.ts:270-290 | 21 | clock hand angle |
| `fence_painted` | Painted Fence | edge | 1 (8) | E | `fencePainted` fair.ts:292-301 | 10 | the view edge (4) |

Theme helper: `pennant` fair.ts:28-31 (4 lines). Item lines: 258.

#### Frost Peaks (`frost_peaks`, research), `src/render/scenery/art/frost.ts`, 12 items

| Item id | Name | Size | Height | Flags | Draw function (file:line) | Lines | Facing use |
|---|---|---|---|---|---|---|---|
| `snow_pine` | Snow Pine | 1×1 | 9 (72) | S | `snowPine` frost.ts:46-51 | 6 | 0.5 px shift, snow-cap seed |
| `snow_pine_small` | Small Snow Pine | 1×1 | 5 (40) | S | `snowPineSmall` frost.ts:53-59 | 7 | 0.5 px shift, seed |
| `ice_arch` | Ice Arch | 1×1 | 5 (40) | L P | `iceArch` frost.ts:61-83 | 23 | post axis (2 looks); 2 halves |
| `igloo` | Igloo | 2×2 | 3 (24) | – | `igloo` frost.ts:85-119 | 35 | real 4-way: entrance tunnel right or left for front facings, plain back for the others |
| `fountain_frozen` | Frozen Fountain | 2×2 | 3 (24) | L | `fountainFrozen` frost.ts:121-147 | 27 | glow moves 1 px by axis |
| `statue_frost` | Frost Statue | 1×1 | 4 (32) | – | `statueFrost` frost.ts:167-171 | 5 | figure: front or back × looks left or right (4) |
| `ice_crystals` | Ice Crystal Cluster | 1×1 | 2 (16) | L | `iceCrystals` frost.ts:173-191 | 19 | shard tilt mirrored (2 looks) |
| `snowdrift` | Snowdrift | 1×1 | 1 (8) | S | `snowdrift` frost.ts:193-198 | 6 | seed, sparkle side |
| `snowman` | Snow Figure | 1×1 | 2 (16) | – | `snowman` frost.ts:200-221 | 22 | face only from the front (3 looks) |
| `aurora_lantern` | Aurora Lantern | 1×1 | 3 (24) | L | `auroraLantern` frost.ts:223-237 | 15 | colour band order |
| `sled_rack` | Sled Rack | 1×1 | 1 (8) | – | `sledRack` frost.ts:239-256 | 18 | long axis (2 looks) |
| `wall_ice` | Ice Block Wall | edge | 2 (16) | E | `wallIce` frost.ts:258-274 | 17 | the view edge (4) |

Theme helpers: `snowPineAt` frost.ts:36-44 (9 lines), `frostFigure` frost.ts:150-165 (16 lines; this is Frost the yeti mascot). Item lines: 200.

#### Volcano Ridge (`volcano_ridge`, research), `src/render/scenery/art/volcano.ts`, 12 items

| Item id | Name | Size | Height | Flags | Draw function (file:line) | Lines | Facing use |
|---|---|---|---|---|---|---|---|
| `lava_rock` | Lava Rock | 1×1 | 2 (16) | S | `lavaRock` volcano.ts:44-49 | 6 | rock seed |
| `lava_crag` | Lava Crag | 2×2 | 6 (48) | S | `lavaCrag` volcano.ts:51-66 | 16 | seed, lava stream side |
| `steam_vent` | Steam Vent | 1×1 | 1 (8) | – | `steamVent` volcano.ts:68-76 | 9 | steam side, seed |
| `glow_crystal` | Glowing Crystal | 1×1 | 3 (24) | L | `glowCrystal` volcano.ts:78-95 | 18 | shard tilt mirrored (2 looks) |
| `ember_torch` | Ember Torch | 1×1 | 3 (24) | L | `emberTorch` volcano.ts:97-109 | 13 | flame lean (2 looks) |
| `statue_spark` | Spark Statue | 1×1 | 4 (32) | L | `statueSpark` volcano.ts:127-132 | 6 | figure: front or back × left or right (4) |
| `fire_fern` | Fire Fern | 1×1 | 2 (16) | S | `fireFern` volcano.ts:134-149 | 16 | tiny angle shift |
| `ash_palm` | Ash Palm | 1×1 | 7 (56) | S | `ashPalm` volcano.ts:151-178 | 28 | lean left or right (2 looks) |
| `magma_pool` | Glow Pit | 2×2 | 1 (8) | L | `magmaPool` volcano.ts:180-204 | 25 | rim rock seed |
| `basalt_columns` | Basalt Columns | 1×1 | 5 (40) | S | `basaltColumns` volcano.ts:206-226 | 21 | layout mirrored by axis (2 looks) |
| `volcano_gate` | Volcano Gate | 1×1 | 6 (48) | L P | `volcanoGate` volcano.ts:228-243 | 16 | post axis (2 looks); 2 halves |
| `wall_basalt` | Basalt Wall | edge | 2 (16) | E | `wallBasalt` volcano.ts:245-253 | 9 | the view edge (4) |

Theme helpers: `cracks` volcano.ts:36-42 (7 lines), `sparkFigure` volcano.ts:112-125 (14 lines; Spark the fire fox mascot). Item lines: 183.

#### Spooky Hollow (`spooky_hollow`, research), `src/render/scenery/art/spooky.ts`, 12 items

| Item id | Name | Size | Height | Flags | Draw function (file:line) | Lines | Facing use |
|---|---|---|---|---|---|---|---|
| `tree_bare` | Bare Tree | 1×1 | 7 (56) | S K | `treeBare` spooky.ts:47-56 | 10 | mirrored (2 looks) |
| `tree_twisted` | Twisted Tree | 1×1 | 6 (48) | S K | `treeTwisted` spooky.ts:58-80 | 23 | S-curve mirrored, leaf seed |
| `pumpkin_patch` | Pumpkin Patch | 1×1 | 1 (8) | W K | `pumpkinPatch` spooky.ts:94-107 | 14 | vine seed; wilted art |
| `pumpkin_lantern` | Pumpkin Lantern | 1×1 | 1 (8) | L K | `pumpkinLantern` spooky.ts:109-115 | 7 | face from the front, back glow from behind (3 looks) |
| `ghost_lantern` | Ghost Lantern | 1×1 | 3 (24) | L K | `ghostLantern` spooky.ts:138-149 | 12 | arm side, face from the front (4) |
| `gate_crooked` | Crooked Gate | 1×1 | 4 (32) | P K | `gateCrooked` spooky.ts:151-187 | 37 | post axis (2 looks); 2 halves |
| `statue_boo` | Boo Statue | 1×1 | 3 (24) | L K | `statueBoo` spooky.ts:189-195 | 7 | face from the front (3 looks) |
| `old_well` | Old Well | 1×1 | 2 (16) | K | `oldWell` spooky.ts:197-216 | 20 | roof axis (2 looks) |
| `fog_pot` | Fog Pot | 1×1 | 1 (8) | K | `fogPot` spooky.ts:218-227 | 10 | fog seed, spill side |
| `owl_perch` | Owl Perch | 1×1 | 4 (32) | K | `owlPerch` spooky.ts:229-249 | 21 | owl side, front or back (4) |
| `mossy_stones` | Mossy Stones | 1×1 | 1 (8) | S K | `mossyStones` spooky.ts:251-257 | 7 | rock seed |
| `fence_spiked` | Spiked Iron Fence | edge | 2 (16) | E K | `fenceSpiked` spooky.ts:259-271 | 13 | the view edge (4) |

Theme helpers: `branches` spooky.ts:38-45 (8 lines, recursive), `pumpkin` spooky.ts:83-92 (10 lines), `ghost` spooky.ts:118-136 (19 lines; the Boo ghost). Item lines: 181.

#### Jungle Lagoon (`jungle_lagoon`, research), `src/render/scenery/art/jungle.ts`, 12 items

| Item id | Name | Size | Height | Flags | Draw function (file:line) | Lines | Facing use |
|---|---|---|---|---|---|---|---|
| `lagoon_palm` | Lagoon Palm | 1×1 | 8 (64) | S | `lagoonPalm` jungle.ts:57-67 | 11 | lean left or right (2 looks) |
| `giant_leaf` | Giant Leaf Plant | 1×1 | 3 (24) | S W | `giantLeaf` jungle.ts:69-84 | 16 | tiny angle shift; wilted art |
| `bed_tropical` | Tropical Flower Bed | 1×1 | 1 (8) | W | `bedTropical` jungle.ts:86-91 | 6 | seed; wilted art |
| `ruin_arch` | Ruined Stone Arch | 1×1 | 5 (40) | P | `ruinArch` jungle.ts:93-112 | 20 | post axis (2 looks); 2 halves |
| `mossy_pillar` | Mossy Pillar | 1×1 | 4 (32) | – | `mossyPillar` jungle.ts:114-122 | 9 | top block slip side, moss seed |
| `rope_bridge_decor` | Rope Bridge Decor | 2×1 | 3 (24) | – | `ropeBridge` jungle.ts:124-152 | 29 | long axis follows the view footprint (2 looks) |
| `rock_waterfall` | Rock Waterfall | 2×2 | 6 (48) | – | `rockWaterfall` jungle.ts:154-175 | 22 | seed, fall side |
| `bamboo_grove` | Bamboo Grove | 1×1 | 6 (48) | S | `bambooGrove` jungle.ts:177-196 | 20 | lean left or right (2 looks) |
| `lily_pond` | Lily Pond | 1×1 | 1 (8) | – | `lilyPond` jungle.ts:198-217 | 20 | lily pad angle |
| `parrot_perch` | Parrot Perch | 1×1 | 3 (24) | – | `parrotPerch` jungle.ts:219-234 | 16 | parrot side, eye from the front (4) |
| `fern_cluster` | Fern Cluster | 1×1 | 1 (8) | S W | `fernCluster` jungle.ts:236-254 | 19 | tiny angle shift; wilted art |
| `wall_vine` | Vine Wall | edge | 2 (16) | E | `wallVine` jungle.ts:256-270 | 15 | the view edge (4) |

Theme helpers: `frond` jungle.ts:39-49 (11 lines), `stoneBlock` jungle.ts:52-55 (4 lines). Item lines: 203.

#### Starport (`starport`, research), `src/render/scenery/art/starport.ts`, 12 items

| Item id | Name | Size | Height | Flags | Draw function (file:line) | Lines | Facing use |
|---|---|---|---|---|---|---|---|
| `rocket_model` | Rocket Model | 1×1 | 9 (72) | L | `rocket` starport.ts:38-64 | 27 | fin ring turns a little |
| `satellite_dish` | Satellite Dish | 2×2 | 5 (40) | – | `satelliteDish` starport.ts:66-81 | 16 | real 4-way: dish aims at the facing |
| `planet_globe` | Planet Globe | 1×1 | 4 (32) | L | `planetGlobe` starport.ts:83-103 | 21 | band offset, ring tilt |
| `neon_arch` | Neon Arch | 1×1 | 5 (40) | L P | `neonArch` starport.ts:105-138 | 34 | post axis (2 looks); 2 halves |
| `neon_post` | Neon Post | 1×1 | 3 (24) | L | `neonPost` starport.ts:140-157 | 18 | zigzag mirrored (2 looks) |
| `statue_robot` | Robot Statue | 1×1 | 4 (32) | L | `statueRobot` starport.ts:177-181 | 5 | figure: front or back × left or right (4) |
| `crater` | Crater | 2×2 | 1 (8) | – | `crater` starport.ts:183-200 | 18 | rim rock seed |
| `moon_rock` | Moon Rock | 1×1 | 2 (16) | S | `moonRock` starport.ts:202-206 | 5 | rock seed |
| `star_beacon` | Star Beacon | 1×1 | 6 (48) | L | `starBeacon` starport.ts:208-227 | 20 | star spin angle |
| `hologram_pad` | Hologram Pad | 1×1 | 2 (16) | L | `hologramPad` starport.ts:229-242 | 14 | moon position |
| `radar_tower` | Radar Tower | 1×1 | 8 (64) | L | `radarTower` starport.ts:244-256 | 13 | radar bar angle |
| `wall_hull` | Hull Panel Wall | edge | 2 (16) | E | `wallHull` starport.ts:258-270 | 13 | the view edge (4) |

Theme helper: `robotFigure` starport.ts:160-175 (16 lines). Item lines: 204.

Unknown ids (a broken save) draw a grey block: `fallback` at `src/render/scenery/art/index.ts:47-49`.

### The kit: shared drawing pieces, `src/render/scenery/art/kit.ts` (263 lines)

Drawing primitives (13). "Uses" is the number of call sites in the 7 theme files.

| Primitive | Lines | What it draws | Uses |
|---|---|---|---|
| `shadow(ctx, cu, cv, r, alpha = 0.2)` | kit.ts:91-93 | Soft ground ellipse, `rgba(20,30,20,alpha)`, radii `r × 45` by `r × 22.5` px | 62 |
| `trunk(ctx, cu, cv, h0, h1, w0, w1, fill, lean = 0)` | kit.ts:96-103 | Tapered trunk with a darker right side | 9 |
| `cluster(ctx, x, y, rx, ry, r, colours, seed, n = 7)` | kit.ts:106-116 | Seeded overlapping circles (foliage, smoke, snow, fog) | 16 |
| `canopy(ctx, x, y, r, dark, mid, light, seed)` | kit.ts:119-123 | Round tree top: dark disc, mid cluster, light dot | 4 |
| `tier(ctx, x, yb, w, ht, fill)` | kit.ts:126-129 | One conifer triangle with a shaded half | 2 |
| `rock(ctx, cu, cv, r, h, colour, seed)` | kit.ts:132-152 | Faceted 7-sided lump with a highlight facet | 17 |
| `post(ctx, cu, cv, r, h0, h1, colour)` | kit.ts:155-157 | Thin upright box | 21 |
| `glow(ctx, x, y, r, colour, core)` | kit.ts:160-165 | Bulb: two translucent halos (alpha 0.22 and 0.45), solid disc, bright core | 25 |
| `flowers(ctx, cu, cv, r, h, colours, seed, n, wilted, size = 2.2)` | kit.ts:174-189 | Seeded flowers (stem line, petal dot, centre dot), with a wilted form | 4 |
| `edgeBox(ctx, e, t, h0, h1, top, left, right, i = 0)` | kit.ts:206-220 | Box hugging one view edge of the tile | 9 |
| `panel(ctx, u0, v0, u1, v1, h0, h1, fill, stroke?)` | kit.ts:240-242 | Thin vertical wall face | 0 (unused) |
| `pedestal(ctx, r, h, colour)` | kit.ts:253-255 | Centred box under statues | 3 |
| `eyes(ctx, x, y, gap, r, s, white, pupil)` | kit.ts:258-263 | Two eyes looking to one screen side | 4 |

Helpers that do not draw (12): `edgeOf` kit.ts:34-36, `faceVec` 39-50, `facesViewer` 53-55, `screenSide` 58-60, `frac` 63-65, `seedOf` 68-75, `mixHex` 78-83, `wilt` 86-88, `withAlpha` 168-171, `edgeEnds` 192-203, `edgePoint` 223-237, `archPosts` 248-250.

Primitives the kit borrows from other areas (used by rides and stalls too):

- from `src/render/sprites/shapes.ts`: `sx` :12, `sy` :16, `poly3` :21, `box` :58, `disc` :81, `cylinder` :97, `cone` :127, `pyramid` :159
- from `src/render/sprites/content/kit.ts`: `dot` :40, `star` :53, `poly2` :69, `line2` :86 (sets round line caps at :92), `oval` :97, `TAU` :9
- from `src/render/palette.ts`: `shade` :122, `mix32` :68

Call-site counts in the theme files: `sy` 187, `sx` 98, `line2` 55, `poly2` 51, `dot` 50, `oval` 36, `cylinder` 26, `disc` 26, `box` 24, `poly3` 21, `pyramid` 4, `cone` 3, `star` 3. There are also 14 hand-written path blocks (`ctx.beginPath()` …) that use curves directly: base 1, fair 2, frost 2, volcano 1, spooky 3, jungle 2, starport 3.

Colours: 329 different `#rrggbb` literals across the 8 art files (base 59, fair 74, frost 58, volcano 35, spooky 55, jungle 49, starport 41, kit 7), plus 25 `rgba(...)` string literals in the theme files, 11 `withAlpha(...)` calls, and colours computed at draw time by `shade()` and `mixHex()`. There is no palette table.

---

## 2. How it draws

### 2.1 Data flow in one frame

1. The renderer builds the frame facts (`scale = cam.zoom × dpr`, `bucket = zoomBucket(scale)`, offsets, view rectangle, rotation): `src/render/renderer.ts:1059-1082`. The frame type is `LayerFrame`, `src/render/layers.ts:21-36`.
2. The scenery layer is one of the world layers (`src/render/worldLayers.ts:21`). Its `collect` runs once per frame (`src/render/renderer.ts:1109`):
   - `src/render/scenery/layer.ts:89-135`. For each item of `world.state.scenery` it looks up the catalog def, fills a scratch `ItemView` (`itemView`, `src/render/scenery/place.ts:37-64`), computes the anchor `ax = (u0 − v0) × 32`, `ay = (u0 + v0) × 16 − z × 8` (layer.ts:103-104), culls against the view rectangle (layer.ts:105-109), and pushes drawables into the renderer's depth-sorted list.
   - Edge item: one drawable, kind `sceneryEdge` (71), frame 0 (layer.ts:110-113).
   - Arch: two drawables, back half at depth `u0 + v0 + 0.6`, front half at `+1.4` (layer.ts:115-120).
   - 1 × 1 item: one drawable at depth `u0 + v0 + 1` (layer.ts:122-125).
   - Multi-tile item: `ex + ey` drawables, one per 32 px screen column, each at the depth of the front-most footprint tile that covers it (layer.ts:126-133; `footprintColumns`, `src/render/depth.ts:88-109`).
3. The renderer sorts all objects together and calls `drawItem` of the layer that owns the kind (`src/render/renderer.ts:613-616`).
4. `drawItem` (`src/render/scenery/layer.ts:137-154`) recomputes the item view and the wilted flag, fetches the sprite from the cache (building it on a miss), and copies it with `drawImage`: whole (`blit`, layer.ts:60-67) or one column strip (`blitColumn`, layer.ts:70-83).
5. `drawOverlay` (`src/render/scenery/layer.ts:156-201`) trims the cache and draws the scenery tool ghost.

### 2.2 Sprite build and cache

- `ScenerySprites.get` (`src/render/scenery/sprites.ts:70-81`): on a cache miss it decodes the key parts into art options (`artOpts`, sprites.ts:46-56) and calls `buildSprite(sceneryArtBounds(def, ex, ey), bucket, paint, tint)`.
- `buildSprite` (`src/render/canvas.ts:56-72`) makes a new canvas of `ceil(boundsWidth × scale) + 4` by `ceil(boundsHeight × scale) + 4` pixels (`PAD = 2`, canvas.ts:50), sets `ctx.setTransform(scale, 0, 0, scale, ox, oy)` and runs the art function once. So the art function always draws in world pixels around the anchor; the bucket scale is applied by the canvas transform.
- The art function is found by id: `drawSceneryArt(ctx, defId, o)` → `SCENERY_ART[defId]` (`src/render/scenery/art/index.ts:51-55`).
- Cache key: `scenerySpriteKey(defId, spriteRotation, frame, bucket)` (sprites.ts:35-37) → `spriteKey` (`src/render/spriteCache.ts:47-50`), a plain number built from an FNV hash of the id, 2 bits of rotation, 12 bits of frame, 2 bits of bucket.
- Frame bits (sprites.ts:16-24): `wilted` 1, `archBack` 2, `archFront` 4, `ghostValid` 8, `ghostInvalid` 16. These are variants, not animation frames.
- Cache: `SpriteCache` with a cap of 8,000,000 pixels for scenery (`SCENERY_SPRITE_BUDGET_PX`, sprites.ts:59), least-recently-used eviction, and a share in the global byte budget (64 MB phone, 192 MB desktop: `src/data/tuning/perf.ts:4`; `src/render/spriteCache.ts:68-135`).

### 2.3 Art coordinates

- Anchor: the top corner of the item's view-origin tile, at ground height. `x = (u − v) × 32`, `y = (u + v) × 16 − h`, with `u`, `v` in tiles and `h` in world pixels, 8 px = 1 m (`src/render/sprites/shapes.ts:1-18`; kit header `src/render/scenery/art/kit.ts:1-6`).
- A 1 × 1 item's tile centre is at `(0, 16)`. Theme files keep `CX = sx(0.5, 0.5)` (= 0) for this (for example `base.ts:29`).
- The footprint diamond covers `x` from `−ey × 32` to `ex × 32` and `y` from 0 to `(ex + ey) × 16`.
- Art bounds (`sceneryArtBounds`, `src/render/scenery/art/index.ts:35-44`): `left = −d × 32 − 8`, `right = w × 32 + 8`, `top = −heightM × 8 − 26`, `bottom = (w + d) × 16 + 6`. Edge items always use `w = d = 1`. `ART_HEADROOM_PX = 26` (index.ts:30). The layer repeats the same formula by hand for culling (`src/render/scenery/layer.ts:105-108`).

### 2.4 Art options

`SceneryArtOpts` (`src/render/scenery/art/kit.ts:17-29`): `facing` (0–3), `ex`, `ey` (view footprint), `wilted`, `part` (0 whole, 1 arch back, 2 arch front), `edge` (−1 or the view edge 0–3). The function type is `SceneryArtFn = (ctx, o) => void` (kit.ts:31).

### 2.5 Edge items, arches, gardens, lights

**Edge items (9).**
- The world stores the edge in map terms (`Scenery.edge`, `src/sim/scenery/types.ts:9-10, 22`). The sprite rotation of an edge item is the view edge `(edge + viewRotation) mod 4` (`src/render/scenery/place.ts:38-46`), so each edge item has 4 sprites.
- View edges (`edgeEnds`, kit.ts:192-203): 0 = the `v = 0` side (back right on screen), 1 = the `u = 1` side (front right), 2 = the `v = 1` side (front left), 3 = the `u = 0` side (back left).
- Depth: the edge midpoint, `u0 + v0 + 1.5` for edges 1 and 2, `+0.5` for edges 0 and 3 (place.ts:45).
- Art is built from `edgeBox` (a box of thickness `t` inside the tile along the whole edge, kit.ts:206-220) and `edgePoint` (points along the edge pulled `inset` tiles inward, kit.ts:223-237). Example: `fenceWood` is 5 posts plus 2 rails (`base.ts:155-163`).
- Bounds are always those of a 1 × 1 tile (`index.ts:36-37`); wilted and arch bits are never used (layer.ts:111, 146).

**Arches over paths (6).**
- `archPosts(facing)` (kit.ts:248-250): for facing 0 or 2 the posts stand at `(0.14, 0.5)` and `(0.86, 0.5)`; for facing 1 or 3 at `(0.5, 0.14)` and `(0.5, 0.86)`. "Back" is the post with the smaller `u + v`.
- Every arch function uses the same pattern: `if (o.part !== 2) { back post + beam }` and `if (o.part !== 1) { front post }` (for example `ticketArch`, `fair.ts:153-169`).
- In the world an arch is always two sprites: back half at depth `+0.6`, front post at `+1.4` (layer.ts:115-120). A guest on that tile sorts at `+1`, between them (checked in `tests/unit/scenery/render.test.ts:152-154`). The whole drawing (`part 0`) is used only by the ghost and the picker preview.

**Gardens (8).**
- The water level is 0–255 (`src/sim/scenery/types.ts:23-24`). The drawing has only two states: fresh, or wilted when `waterLevel < 64` (`GARDEN_WILT_BELOW`, `src/data/tuning/scenery.ts:9`; decided at `src/render/scenery/layer.ts:114, 144`).
- Wilted art: colours go 65% toward dry brown (`wilt`, kit.ts:86-88) and shapes shrink or droop (for example `flowers`, kit.ts:181-187; `bedTulip`, base.ts:112-114; `fernCluster`, jungle.ts:242-248).

**Light sources (25).**
- By day and by night the item sprite is the same. Lit parts are drawn into the sprite with `glow()` (kit.ts:160-165) and translucent fills.
- At night the lighting layer adds: a radial light stamp of radius 2 tiles (1 × 1 item) or 3 tiles (larger) (`LIGHT_RADIUS`, `src/data/tuning/night.ts:11`; `sceneryRec`, `src/sim/lighting/lightMap.ts:234-252`), and one emissive bulb at the footprint centre at height `max(6, heightM × 8 × 0.8)` px (`src/render/lighting/pass.ts:285-287`). The bulb position comes from the catalog height, not from where the art puts its lamp.

### 2.6 Rotation

- Two rotations combine: the item's own rotation (0–3, stored in the world) and the view rotation (0–3). Sprite rotation `f = (rotation + viewRotation) mod 4` (`src/render/scenery/place.ts:61`).
- The view rotation moves the item on screen (`viewU`, `viewV`, place.ts:27-34) and picks the view origin (the footprint tile with the smallest view `u` and `v`, place.ts:53-58). It never rotates pixels.
- `facing` meaning (kit.ts:18): 0 = faces −v (back right), 1 = +u (front right), 2 = +v (front left), 3 = −u (back left). Helpers: `facesViewer(f)` is true for 1 and 2 (kit.ts:53-55); `screenSide(f)` is +1 for 0 and 1, −1 for 2 and 3 (kit.ts:58-60); `faceVec(f)` (kit.ts:39-50).
- The footprint swaps sides at odd sprite rotations (`viewExtent`, `src/render/scenery/sprites.ts:40-43`). Only `rope_bridge_decor` (2 × 1) is affected; all other multi-tile items are 2 × 2.
- **Most items do not have four real views.** Counting from the code: about 14 items show real direction (2 tents, `lamp_globe`, `igloo`, `satellite_dish`, and 9 figures with a front and a back: `statue_frost`, `statue_spark`, `statue_boo`, `statue_robot`, `snowman`, `pumpkin_lantern`, `ghost_lantern`, `owl_perch`, `parrot_perch`); 13 items only swap an axis (6 arches, `picnic_table`, `sled_rack`, `old_well`, `bunting_pole`, `bed_tulip`, `basalt_columns`, `rope_bridge_decor`); 9 edge items take the 4 view edges; the remaining ~50 only lean, mirror, reshuffle a seed, or turn a detail by a small angle (see the "Facing use" columns above).

### 2.7 Ghost and picker preview

- Ghost (`src/render/scenery/layer.ts:156-201`): tile outlines in the colour-blind safe blue or vermillion (`outlineTile`, layer.ts:205-227), the item sprite with a colour wash, drawn at `globalAlpha = 0.85` (layer.ts:175-182), a bright edge line for edge items (`edgeHighlight`, layer.ts:230-242), and a check or cross icon (`drawGhostIcon`, `src/render/sprites/props.ts:328`).
- The wash is done in `buildSprite`: after the art is drawn, a `source-atop` rectangle of `GHOST_TINT_VALID` (alpha 0.5) or `GHOST_TINT_INVALID` (alpha 0.55) covers every drawn pixel (`src/render/canvas.ts:64-70`; `src/render/sprites/bank.ts:23-24`).
- The ghost state lives in a `WeakMap` beside the tool state (`src/render/scenery/ghost.ts:32-41`).
- Picker preview: `drawSceneryPreview(ctx, defId, w, h, facing = 2)` (`src/render/scenery/preview.ts:8-22`) scales the art with `ctx.transform(s, 0, 0, s, ox, oy)`, `s = min(w / boundsW, h / boundsH) × 0.96`, and draws it directly (no cache). Used by the scenery picker cards: 96 × 72 CSS px canvases at a device ratio up to 3 (`src/ui/scenery/picker.ts:17-18, 39-52`), stretched by CSS to the card width (`src/ui/scenery/style.ts:47`).

---

## 3. Sizes and scale

### World pixels at zoom 1

- Tile: 64 × 32 px (`TILE_W`, `TILE_H`, `src/render/iso.ts:8-9`). Half tile 32 × 16 (`HW`, `HH`, `src/render/scenery/layer.ts:29-30`). One height step: 8 px (`STEP`, layer.ts:31).
- Sprite bounds in world px:

| Footprint | Width | Height | Example |
|---|---|---|---|
| 1 × 1 and edge | 80 | `8 × heightM + 64` | `oak_round` (7 m): 80 × 120; `fence_wood` (1 m): 80 × 72; `rocket_model` (9 m): 80 × 136 |
| 2 × 2 | 144 | `8 × heightM + 96` | `tent_red` (5 m): 144 × 136 |
| 2 × 1 | 112 | `8 × heightM + 80` | `rope_bridge_decor` (3 m): 112 × 104 |

- Sprite canvas size per zoom bucket (bounds × scale, plus 4 px):

| Item | Bucket 0.5 | Bucket 1 | Bucket 2 |
|---|---|---|---|
| `oak_round` | 44 × 64 | 84 × 124 | 164 × 244 |
| `fence_wood` | 44 × 40 | 84 × 76 | 164 × 148 |
| `tent_red` | 76 × 72 | 148 × 140 | 292 × 276 |
| `rocket_model` | 44 × 72 | 84 × 140 | 164 × 276 |

- Sizes of the drawn shapes at zoom 1 (from the code):
  - Oak: trunk 8 px wide and 26 px tall, canopy a disc of radius 19 px centred 38 px above ground (`base.ts:44-45`). About 38 × 57 px.
  - Tall pine: 34 px wide at the lowest tier, about 76 px tall (`base.ts:50-53`).
  - Round shrub: radius 12 px (`base.ts:82`).
  - Flower: petal dot radius 2.2 px, centre 0.9 px, stem 1 px wide (kit.ts:185-187).
  - Wooden fence: posts about 3 px wide and 10 px tall, rails 2 px thick (`base.ts:157-162`).
  - Globe lamp: 20 px post, globe radius 4.2 px with halos to 8.8 px (`fair.ts:173-181`).
  - Statue figures: 36–42 px tall on a 6 px pedestal (`frost.ts:150-171`); eyes radius 1.2–1.6 px (kit.ts:258-263).
  - Line widths in use: 0.6 px to 2.6 px (for example `starport.ts:241`, `fair.ts:259`, `jungle.ts:139`).
- At the draft's grid (1 art pixel = 2 world px) these become: oak about 19 × 29 art px, flower 2 px, fence rail 1 px, eye less than 1 px, thin lines 0.3–1.3 px. The draft's own round tree is 19–27 px wide and 23–27 px tall before its outline (`pixel3.py:312-327`), so overall sizes are close (the draft trees are a little wider), but small details fall below one art pixel.

### Zoom, device pixel ratio, buckets

- Camera zoom is continuous from 0.25 to 2 (`ZOOM_MIN`, `ZOOM_MAX`, `src/render/camera.ts:6-7`). The mouse wheel multiplies by 1.15 per notch (`src/input/camera.ts:13`); pinch gives any factor (`src/input/controller.ts:280`).
- `scale = cam.zoom × dpr` (`src/render/renderer.ts:1059`). `dpr` comes from the render quality plan and can be lowered by the automatic quality step (`applyPlan`, renderer.ts:898-917); phone-sized screens cap it at 2 (`src/render/canvas.ts:38-48`).
- Three sprite buckets: 0.5, 1, 2 image px per world px (`ZOOM_BUCKETS`, camera.ts:9). The bucket is the nearest in log scale: below 0.707 → 0.5, below 1.414 → 1, else 2 (`zoomBucket`, camera.ts:69-73).
- The sprite is then stretched by `f.scale / sp.scale` at draw time (`blit`, `src/render/scenery/layer.ts:60-67`). That factor is anywhere from 0.71 to 1.41 inside the bucket range, and beyond it at the ends (down to 0.5 at zoom 0.25 on a 1× screen, up to 3 at zoom 2 on a 3× screen).
- Image smoothing is on for the whole frame (`ctx.imageSmoothingEnabled = true`, renderer.ts:1071).
- Destination rectangles are rounded to whole device pixels on each side (layer.ts:62-65, 72-73, 80-81).
- Bucket 0.5 already has exactly the draft's grid: 1 image pixel = 2 world pixels. All sprite origins are whole image pixels in every bucket, because the bounds are even numbers.

### View rotation

Handled only by position and by sprite choice (section 2.6). Nothing is cached per view rotation except through the sprite rotation `f`.

### What is cached

- One canvas per (item id, sprite rotation, frame bits, bucket), built on first use and kept by an LRU (section 2.2).
- A memo of the column table per footprint size (`columns`, `src/render/scenery/layer.ts:41-51`).
- Not cached: the picker previews (drawn once per card when a theme tab opens, `src/ui/scenery/picker.ts:109-135`) and the ghost outlines.

---

## 4. Animation

**Scenery has no animation.** The art uses no time, no randomness, and no canvas transforms; the same inputs give the same pixels (kit.ts:2-6; `index.ts:2-4`). Searching the scenery folder for `Date.now`, `performance.now`, `Math.random` and tick reads finds nothing, and the frame's tick interpolation (`f.alpha`) is never read.

Things that look like motion are frozen in the sprite:

- Fountain water arcs (`base.ts:131-143`, `fair.ts:137-146`), the waterfall ribbon (`jungle.ts:165-173`), steam and fog puffs (`volcano.ts:74-75`, `spooky.ts:224-226`), flames (`volcano.ts:105-108`).
- "Spinning" and "rotating" parts are fixed angles taken from the facing: star lamp (`starport.ts:225-226`), radar bar (`starport.ts:250-253`), hologram moon (`starport.ts:239-240`), clock hands (`fair.ts:285-286`).

The only things that change an item's picture over time:

- A garden switches to its wilted sprite when its water level falls below 64, and back when a groundskeeper waters it (section 2.5).
- At night the lighting layer draws light and one bulb over lit items (section 2.5). The scenery layer itself does nothing different at night.
- Deterministic "random" variation comes from `frac(seed)` (kit.ts:63-65) with seeds from `seedOf(id) + facing × k` (for example `base.ts:31-33`).

---

## 5. What a pixel-art version must keep

### Function signatures and exports used by other code

| Contract | Where defined | Who depends on it |
|---|---|---|
| `SCENERY_ART: Readonly<Record<string, SceneryArtFn>>`, keys exactly the 85 catalog ids | `src/render/scenery/art/index.ts:19-27` | `tests/unit/scenery/art.test.ts:39-41` |
| `SceneryArtFn = (ctx: Ctx, o: SceneryArtOpts) => void`; `SceneryArtOpts { facing, ex, ey, wilted, part, edge }` | `src/render/scenery/art/kit.ts:17-31` | every theme file, `sprites.ts`, `preview.ts`, tests |
| `drawSceneryArt(ctx, defId, o)` | `index.ts:51-55` | `sprites.ts:77`, `preview.ts:20`, `art.test.ts:23` |
| `sceneryArtBounds(def, ex, ey): ArtBounds` and `ART_HEADROOM_PX = 26` | `index.ts:30-44` | `sprites.ts:77`, `preview.ts:12`, `layer.ts:107`, `art.test.ts:52` |
| `scenerySpriteKey`, `sceneryFrame`, `SCENERY_FRAME`, `viewExtent`, `artOpts`, `ScenerySprites` | `src/render/scenery/sprites.ts` | `layer.ts`, `tests/unit/scenery/render.test.ts:13-55` |
| `itemView`, `newItemView`, `viewU`, `viewV` | `src/render/scenery/place.ts` | `layer.ts`, `render.test.ts:58-108` |
| `createSceneryLayer(): WorldLayer` with kinds 70 and 71 | `src/render/scenery/layer.ts:38-88`; `src/render/layers.ts:44-53` | `src/render/worldLayers.ts:21`, `render.test.ts:124-129` |
| `drawSceneryPreview(ctx, defId, w, h, facing = 2)` | `src/render/scenery/preview.ts:8` | `src/ui/scenery/picker.ts:46` |
| `sceneryGhostOf`, `setSceneryGhost`, `SceneryGhost` | `src/render/scenery/ghost.ts` | `src/input/scenery/index.ts`, `src/ui/scenery/status.ts`, `layer.ts:159` |
| `soilBed` (exported from `base.ts:36`) | base.ts | `jungle.ts:6` |

### Anchors, footprints, depth

- Anchor = top corner of the view-origin tile at the item's base height `z`; world position `ax = (u0 − v0) × 32`, `ay = (u0 + v0) × 16 − z × 8` (`layer.ts:103-104`). All anchors are multiples of 32 px in x and 8 px in y, so they sit on a 2 px art grid.
- Projection `x = (u − v) × 32`, `y = (u + v) × 16 − h`, 8 px per metre (`shapes.ts:12-18`).
- Footprints `w × d` and `heightM` are simulation data: placement, occupancy and clearance use them (`src/sim/scenery/rules.ts:120-129`, `src/sim/scenery/occupancy.ts:21`). Art should stay inside `heightM × 8` px plus the 26 px headroom.
- Depth rules (file header `layer.ts:7-10`): 1 × 1 at the tile centre; multi-tile in `ex + ey` columns of 32 px; edge items at the edge midpoint; arch halves at `+0.6` and `+1.4`. Exact values are tested (`render.test.ts:131-155`).
- **Multi-tile items are drawn only inside their columns**, from `ax − ey × 32` to `ax + ex × 32` (layer.ts:127-133, 152-153). The 8 px side pads of the sprite bounds are never copied to the screen for these items. 1 × 1 items, edge items and arch halves are copied whole.
- Arch split: the back half and the front post must be two disjoint parts of the same drawing (test below), and the beam belongs to the back half.
- Catalog ids are stored in saves (`src/save/integrity.ts:72`) and used as string keys (`src/data/strings/content.ts:32`). Do not rename them.

### Hit areas

There are no sprite-based hit areas. The scenery tool works on tiles: the pointer gives a tile (`tileAt`), and removal takes the centre item or arch on that tile, else the tile's newest edge item (`removeTarget`, `src/input/scenery/index.ts:77-82`). The ghost anchor is the footprint's view-origin tile (`src/input/scenery/index.ts:10, 62-74`). New art cannot break picking, but art that sits far from its tile would mislead the player.

### Ghost rules

- Ghost colours must come from the colour-blind safe pair (`src/render/palette.ts:10-37`). `tests/unit/render/safeColours.test.ts:26-43` scans every file under `src/render/` and fails on a list of old red and green literals (for example `#ff5c5c`, `#7dff9a`, `#1f6b34`, `#8a1f23`). A new palette must not contain those exact values.
- Ghost sprite = the item art plus the wash, drawn at 85% opacity (section 2.7). The frame bits 8 and 16 select it.

### Tests that pin today's behaviour

`tests/unit/scenery/art.test.ts` (runs every item through a recording fake context, `tests/unit/render/content/recorder.ts`):

- one drawing per catalog id and nothing else (:39-41)
- every item's call log differs from every other item's at facing 2 (:43-46)
- for every facing and variant: all recorded points inside the bounds with 3 px tolerance, no non-finite numbers, **no transform calls**, and **more than 2 fills** (:50-63). The recorder counts only `fill()` and `fillRect()` as fills and only `moveTo`, `lineTo`, `arc`, `ellipse`, curves and rects as points (recorder.ts:40-99). `translate`, `rotate`, `scale`, `transform`, `setTransform` count as transforms (recorder.ts:81-95).
- deterministic: two runs give the same call log (:65-67)
- the 4 facings do not all give the same call log (:69-72)
- gardens: wilted log differs from fresh for each facing (:74-78)
- arches: back half has more fills than the front post, the front post has at least one, and `ops(back) + ops(front) = ops(whole)` (:80-90)

`tests/unit/scenery/render.test.ts`:

- golden sprite key numbers (:23-28), keys unique across item, rotation, frame, bucket (:30-44), frame bits round-trip (:46-55)
- view placement for all rotations (:58-108)
- draw list kinds, subs, depths, wilted key, rotated key, culling (:131-180)
- ghost store (:182-194)

Other tests that touch scenery pictures:

- `tests/e2e/scenery.spec.ts:253` places all 85 items and writes `docs/screenshots/wave3-scenery.png` (no pixel comparison).
- `tests/perf/scenes.ts:169-178` puts 60 scenery items in the performance scene.
- `tests/unit/render/fakeCanvas.ts:70-72` (whole-renderer tests in Node): `getImageData` returns a 4-byte dummy, so any sprite post-process that reads pixels gets no real data there.

### Other facts to keep

- Scenarios can scatter scenery with a random rotation 0–3 (`src/sim/scenario/generate.ts:128-145`), so all 4 sprite rotations appear in normal play.
- The show layer picks its colour palette from the scenery theme around a show site (`src/render/shows/palette.ts:11-32`); it reads theme ids only, not the art.
- Sprite memory: 8,000,000 px cap for scenery and the shared budget (section 2.2).
- The art folder comment promises original designs with no real-world brands or cultural motifs (`jungle.ts:1-4`, `frost.ts:212`, `starport.ts:159`).

---

## 6. What makes pixel art hard here

1. **Sprites are stretched by a non-whole factor with smoothing on.** `scale = cam.zoom × dpr` is continuous (`src/render/renderer.ts:1059`), only 3 bucket images exist (`src/render/camera.ts:9, 69-73`), and `blit` stretches the bucket image by `f.scale / sp.scale` (`src/render/scenery/layer.ts:60-67`) with `imageSmoothingEnabled = true` (`renderer.ts:1071`). Pixel art blurs under this. Turning smoothing off instead gives uneven pixel sizes at factors like 1.15. Crisp pixels need whole-number stretch factors, which is a camera and device-ratio decision outside this area (`src/input/camera.ts:13`, `renderer.ts:898-917`).

2. **The art is vector art drawn through a scale transform.** `buildSprite` runs the same function at 0.5×, 1× and 2× (`src/render/canvas.ts:56-63`). Canvas path fills are always anti-aliased and there is no switch for that. At bucket 0.5 a 1.2 px line becomes 0.6 px of grey. There is no fixed native grid.

3. **No coordinate is snapped to a pixel.** Every shape comes from fractional tile coordinates through `sx`/`sy` (285 call sites), circles and ellipses (`dot` 50, `oval` 36, `disc` 26, `cylinder` 26), curves (14 hand-written path blocks), and round-capped lines 0.6–2.6 px wide (`line2`, 55 call sites; `src/render/sprites/content/kit.ts:86-94`). Examples: `cluster` places puffs with `cos`/`sin` of a hash (kit.ts:106-116); `rock` builds a 7-gon from hashed radii (kit.ts:132-152).

4. **No palette.** 329 hex literals, 25 `rgba` literals, and colours computed on the fly (`shade`, `src/render/palette.ts:122-132`; `mixHex`, kit.ts:78-83; `withAlpha`, kit.ts:168-171). The draft uses 13 ramps of 3–6 tones (`pixel3.py:12-26`) and snaps every mixed colour back to the palette (`pixel3.py:74-76`).

5. **Translucent fills are part of the sprite.** Shadows (`shadow`, kit.ts:91-93, 62 call sites), lamp halos (`glow`, kit.ts:160-162, 25 call sites), steam (`volcano.ts:74-75`), fog (`spooky.ts:225-226`), water (`jungle.ts:171-173`), holograms (`starport.ts:237-241`), neon (`starport.ts:126-128`, `148`). Pixel art wants solid palette colours or dither patterns. A dark outline pass over the finished sprite (the draft's method: grow the silhouette by one pixel and paint the ring in ink, `pixel3.py:199-218`) would also outline these shadows and halos unless they are drawn in a separate step.

6. **No outlines today, and silhouettes are made of many overlapping fills.** An outline cannot be added shape by shape; it needs the finished silhouette. That means reading pixels back after drawing (inside `buildSprite`, `src/render/canvas.ts:56-72`), which the unit-test fakes do not support (`tests/unit/render/fakeCanvas.ts:70-72`; the recorder in `art.test.ts` has no pixel store at all).

7. **The tests assume path drawing.** `art.test.ts:57` needs more than 2 `fill()` or `fillRect()` calls; `art.test.ts:56` forbids any transform, so mirroring with `ctx.scale(−1, 1)` is not allowed; `art.test.ts:87` needs the arch halves' call logs to add up to the whole. Art delivered as `drawImage` from a sprite sheet or as `putImageData` would record zero fills and fail. Art drawn as runs of `fillRect` on whole coordinates would pass.

8. **Multi-tile sprites are cut into 32 px columns, and the side pads are dropped.** `blitColumn` copies only `[ax − ey × 32, ax + ex × 32)` (`src/render/scenery/layer.ts:70-83, 126-133`). Anything in the 8 px side pads of the bounds (`SIDE_PAD`, `index.ts:31, 39-40`), such as an outline around a full-width roof, would be cut off in the world but visible in the ghost and the preview. Each column is also rounded to device pixels on its own (layer.ts:72-73).

9. **Each sprite is rounded to the device grid on its own.** `blit` rounds each sprite's left, top, right and bottom (layer.ts:62-65), and the camera offset is fractional (`renderer.ts:1061-1062`). When one art pixel covers 2 or more device pixels, neighbouring sprites and the ground can end up half an art pixel apart, and a sprite's width can change by one device pixel while panning.

10. **340 pictures, not 85.** Each item is asked for in 4 sprite rotations (plus wilted and arch halves). The rotation tests need at least two different results per item (`art.test.ts:69-72`). Today most items fake rotation with a lean, a mirror or a new seed (section 2.6), which costs nothing in vector code but would be real work for hand-made sprites.

11. **Details are smaller than one art pixel.** At 2 world px per art pixel: flower centres 0.45 px (kit.ts:187), eyes 0.4–0.8 px (kit.ts:258-263; `frost.ts:216-217`), railing bars 0.7 px (`base.ts:169`), bunting strings 0.4 px (`fair.ts:100`), hologram lines 0.3 px (`starport.ts:241`). These items need a redesign, not a conversion.

12. **Edge items must join across tiles.** A fence run is one sprite per tile edge, with end posts at 4% and 96% of the edge (`base.ts:157-159`) and rails over the whole edge (`edgeBox` inset 0.02, `base.ts:161-162`). With per-sprite outlines, every tile edge would get its own outline ring and the run would show a seam at each tile.

13. **The picker preview scales the art freely.** `preview.ts:15-19` uses a non-whole scale and the card canvas is stretched again by CSS (`src/ui/scenery/style.ts:47`). No stylesheet in `src/` uses `image-rendering: pixelated`.

14. **The ghost wash makes off-palette colours.** The `source-atop` wash (`src/render/canvas.ts:64-70`) and the 85% draw opacity (`layer.ts:179`) blend every pixel with blue or vermillion.

15. **Night lighting is smooth.** The light pass multiplies a quarter-resolution, smoothed light canvas over the frame and adds soft bulbs (`src/render/lighting/pass.ts:2-8`, `285-287`). The draft's night scenes use ordered dither for light (`pixel3.py:188-197`). The bulb height comes from `heightM`, so it will not sit on a hand-placed pixel lamp unless the art follows that rule.

16. **Slopes.** 23 items may stand on sloped tiles, but the art always has a flat base at the tile's base height (`src/sim/scenery/rules.ts:120-123`; `src/sim/scenery/types.ts:19-20`). A crisp outlined base will make the gap or overlap on slopes more visible than today's soft shadow does.

---

## 7. Size of the job

| Piece | Functions | Lines |
|---|---|---|
| Item draw functions (must each get a new look) | 85 | 1,350 (base 121, fair 258, frost 200, volcano 183, spooky 181, jungle 203, starport 204) |
| Theme helpers that draw (`soilBed`, `pennant`, `snowPineAt`, `frostFigure`, `cracks`, `sparkFigure`, `branches`, `pumpkin`, `ghost`, `frond`, `stoneBlock`, `robotFigure`) | 12 | 122 |
| Kit drawing primitives (`shadow` … `eyes`) | 13 | 104 |
| Fallback block | 1 | 3 |
| **Drawing code to replace or wrap** | **111** | **1,579** |
| Kit helpers that do not draw | 12 | about 90 |
| Whole `src/render/scenery/art/` folder | – | 2,238 (base 190, fair 316, frost 289, volcano 268, spooky 286, jungle 286, starport 285, kit 263, index 55) |
| Layer and helpers: `layer.ts` 243, `sprites.ts` 86, `place.ts` 64, `ghost.ts` 41, `preview.ts` 22 | – | 456 |
| Catalog `src/data/catalog/scenery.ts` (data only, no drawing) | – | 161 |
| Tests that pin the art: `art.test.ts` 91, `render.test.ts` 194 | – | 285 |

Borrowed primitives that scenery shares with rides and stalls (changing them changes those areas too): 8 in `src/render/sprites/shapes.ts` (201 lines) and 5 in `src/render/sprites/content/kit.ts` (116 lines).

Two ways to size the work:

- **Wrap**: keep the 85 functions and change what is underneath (the 13 kit primitives, the 13 borrowed primitives, and a post-process in the sprite build). Small code change (roughly 330 lines of primitives plus the build step), but the 14 hand-written path blocks, the sub-pixel details (obstacle 11) and the translucent fills (obstacle 5) still need per-item edits; expect to touch most of the 85 functions lightly.
- **Replace**: redraw 85 items × up to 4 facings, plus 8 wilted sets and 6 arch splits. About 1,470 lines of item and helper code are rewritten, and the per-item tests keep their present form only if the new art still issues fills through the context.

Blit and placement code (`layer.ts`, `place.ts`, `sprites.ts` keys) can stay as it is for either route, apart from the stretch and smoothing issue (obstacle 1), which is shared with every other area.

---

## 8. Open questions

1. **Native grid.** Is the scenery target 1 art pixel = 2 world pixels, as in the drafts (tile 32 × 16)? If yes, bucket 0.5 is the native image and buckets 1 and 2 are 2× and 4× copies. If the target is 1 art pixel = 1 world pixel, the drafts' proportions change.
2. **Zoom.** Will the camera snap to whole-number pixel sizes, or must scenery stay readable at any zoom? This decides whether crisp sprites are possible at all (obstacle 1). It is a core-renderer decision.
3. **Rotation.** Must every item keep 4 different sprite rotations, or may items with no real direction (about 50) use one picture, or one picture and its mirror? The test `art.test.ts:69-72` asks for at least 2 different results; may that test change?
4. **Tests.** May `tests/unit/scenery/art.test.ts` be rewritten for a pixel pipeline (for example checks on real pixels in a browser test), or must the recorder-based checks stay as they are (which rules out `drawImage` and `putImageData` art)?
5. **Outlines.** One outline per sprite, as in the draft? Then what should happen where sprites meet: fence and wall runs along edges, arch halves, and the columns of 2 × 2 items?
6. **Shadows.** Keep the shadow inside the item sprite, or move all object shadows to one ground pass with a single flat tone, as the draft does (`pixel3.py:173-184`)? The second needs a new draw step that this area does not have.
7. **Lights at night.** Stay with the smooth light pass, or give lit items a second "night" sprite (a new frame bit) with dithered glow? 25 items are affected.
8. **Wilted gardens.** A palette swap to a dry ramp, or separate drawings as today?
9. **Themes and palettes.** The drafts have ramps for orange, frost, jungle, spooky, stoneage and starport (`pixel3.py:27-62`). The game has base, classic_fair, frost_peaks, volcano_ridge, spooky_hollow, jungle_lagoon and starport. Volcano Ridge has no draft palette, and "stoneage" has no game theme. Does each scenery theme get its own fixed ramp set, and may items of different themes stand side by side in one park with different palettes?
10. **Mascot statues.** `statue_frost`, `statue_spark` and `statue_boo` show the mascots (Frost, Spark, Boo). The drafts have pixel mascots as fixed bitmaps (`FROST`, `SPARK`, `BOO`, `pixel3.py:263-265`). Should the statues reuse those designs?
11. **Picker cards.** The scenery picker draws live previews at a free scale. Should cards show the same pixel sprite at a whole-number scale (needs `image-rendering: pixelated` and a fixed canvas size)?
12. **Multi-tile clipping.** May the side pads be widened or the column rule changed so outlines of 2 × 2 items are not cut (obstacle 8)? This touches `layer.ts:126-133` and the bounds formula in two places (`index.ts:35-44`, `layer.ts:105-108`).
