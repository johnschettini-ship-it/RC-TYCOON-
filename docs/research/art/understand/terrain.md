# Terrain, water, paths and elevated paths: how the game draws them today

Area: `src/render/terrain.ts`, `src/render/terrainTracker.ts`, `src/render/elevated/layer.ts`, `src/render/elevated/pick.ts`,
`src/render/paths.ts`, `src/render/queue.ts`, `src/render/terrainTools/`, the path item and litter code in
`src/render/management/` and `src/render/sprites/litter.ts`, and the ground overlays in `src/render/renderer.ts`.

All paths below are relative to `/home/user/RC-TYCOON-`. Everything was read from the code; nothing was run.
Where a statement is a conclusion from reading and not something seen on screen, it says so.

Short version for a designer:

- One function, `paintTile` (`src/render/terrain.ts:258-330`), paints all static ground: land, cliff sides, water,
  footpaths, queues and the entrance plaza. It uses 5 vector primitives and flat colours. There are no textures.
- The result is cached in images of 8 × 8 tiles ("chunks"), one image per view rotation and per scale.
- The approved draft uses a tile of 32 × 16 art pixels, shown at 2 × 2 screen pixels per art pixel. That is exactly
  the game's tile at zoom 1 (64 × 32 px). The draft shows only flat land in one view direction.

---

## What this area draws

### Inventory

| # | Thing | Variants today | Where it is painted | Cached? |
|---|---|---|---|---|
| 1 | Ground top face | 5 terrain types × 2 shades × 9 slope light levels × 2 (inside / outside the park) | `terrain.ts:289-296` | Chunk image |
| 2 | Grass tufts | On 1 in 8 empty grass tiles, 3 tufts each | `terrain.ts:297-310` | Chunk image |
| 3 | Cliff side, front right | 1 colour `#7b5835` | `terrain.ts:279`, `120-134` | Chunk image |
| 4 | Cliff side, front left | 1 colour `#9a7148` | `terrain.ts:287`, `137-151` | Chunk image |
| 5 | Water surface | 1 colour `rgba(63,143,214,0.8)` | `terrain.ts:312-317` | Chunk image |
| 6 | Footpath | 16 join masks × 16 corner-fill masks, 2 colours | `terrain.ts:172-189`, `320-323` | Chunk image |
| 7 | Park entrance plaza | Footpath shape + 2 inlay rectangles | `terrain.ts:237-241`, `323` | Chunk image |
| 8 | Queue | 16 join masks, 2 colours, rope rails and posts | `terrain.ts:210-235`, `324-327` | Chunk image |
| 9 | Chunk placeholder | 1 flat diamond `#67b24b` | `terrain.ts:710-733` | No |
| 10 | Sky behind the map | 1 colour `#1d2b3a` (`palette.ts:49`) | `renderer.ts:1019-1020`, `1029-1030` | Static layer |
| 11 | Elevated deck (footpath or queue) | 2 colour sets, flat or ramp in 4 directions | `elevated/layer.ts:103-133` | No, drawn every frame |
| 12 | Deck supports | 4 posts per deck tile, 2 colours | `elevated/layer.ts:106-118` | No |
| 13 | Path items: bench, bin, lamp | Bench 4 sides × 2 (broken); bin 4 fill levels × 2; lamp × 2 | `sprites/litter.ts:51-154` | Sprite per frame code and zoom bucket |
| 14 | Litter and mess decals | 4 litter looks × 2 flips, 2 mess looks × 2 flips | `sprites/litter.ts:159-232` | Sprite |
| 15 | Tile outlines (hover, selection, drag line, ghost footprints) | Colours per tool | `renderer.ts:623-677`, `850-871` | No |
| 16 | Buy Land tints and purchase rectangle | 4 tints (`renderer.ts:235-241`) | `renderer.ts:680-726` | No |
| 17 | Land / Water brush ghost, corner ring, cost chip | 3 colour sets | `terrainTools/layer.ts:98-196` | No |
| 18 | Elevated path tool ghost | 2 colour sets | `elevated/layer.ts:173-209` | No |
| 19 | Ground under picker previews | 2 grass colours, hard-coded | `renderer.ts:1183-1194` | No |

### Ids and codes a new art set must cover

- Terrain types (`src/sim/map.ts:5`): Grass 0, Sand 1, Dirt 2, Rock 3, Snow 4. Colours in `terrain.ts:28-34`:

  | Type | Shade a | Shade b |
  |---|---|---|
  | Grass | `#6dbb4f` | `#64b049` |
  | Sand | `#e3cf8f` | `#dac584` |
  | Dirt | `#a87d4f` | `#9e7449` |
  | Rock | `#a09f98` | `#96958e` |
  | Snow | `#f2f6fa` | `#e6edf3` |

- Tile content (`src/sim/map.ts:9-17`): Empty 0, Footpath 1, Queue 2, Building 3, Track 4, ParkEntrance 5, Scenery 6.
  The terrain painter draws something special only for 1, 2 and 5. Under buildings, track and scenery it paints plain
  ground (`terrain.ts:329`).
- Ownership (`src/sim/map.ts:21-27`): NotOwned 0, Owned 1, LandForSale 2, RightsOwned 3, RightsForSale 4. Ground of any
  tile that is not state 1 is darkened by factor 0.78 (`terrain.ts:35`, `266`, `294`).
- Slope mask (`src/render/iso.ts:34-38`): bits N 1, E 2, S 4, W 8 = which corners are 1 step higher. The normalize rule
  allows every mask 0–14 (`src/sim/terrain/normalize.ts:26-41`), so there are 15 top-face shapes.
- Ground ramps that a path may use (`src/sim/paths/nodes.ts:22-33`): only masks `0b0011`, `0b0110`, `0b1100`, `0b1001`.
- Path join mask (`src/render/paths.ts:10-13`): N 1, E 2, S 4, W 8. Corner-fill mask (`terrain.ts:169-170`): NE 1, SE 2,
  SW 4, NW 8.
- Path colours (`terrain.ts:39-40`): footpath fill `#dcc79c`, edge `#a88e5f` (`light: '#e8d7b2'` is declared and never
  used); queue fill `#a9c0d2`, edge `#6a8396`, post `#56636f`, rope `#e8503a`. Entrance inlay `#f39a5a` and `#7cc3e6`.
- Elevated colours (`elevated/layer.ts:26-36`): footpath top `#dcc79c`, edge `#a88e5f`, left `#b39a6b`, right `#9a8258`;
  queue top `#a9c0d2`, edge `#6a8396`, left `#8aa1b3`, right `#74899a`; supports `#6b5a45` and `#4d4032`.
- Path items (`src/sim/map.ts:30`): None 0, Bench 1, Bin 2, Lamp 3. Frame code = item (2 bits) | side (2) | fill (2) |
  broken (1) (`sprites/litter.ts:27-30`).
- Decal frames (`sprites/bank.ts:75-79`): litter 0–3, mess 8–9; the flip uses the rotation slot of the key.
- Draw-list kinds: path item 7, staff 6 (`management/layer.ts:45-46`); elevated path 60, elevated support 61
  (`layers.ts:44-53`). Kind 61 is declared and never pushed: supports are drawn inside the deck's own draw call
  (`elevated/layer.ts:155`, `159-165`).

---

## How it draws

### Frame order (the part that touches this area)

`createCanvasRenderer(...).draw` in `src/render/renderer.ts:1046-1147`:

1. `terrain.sync(map)` (`renderer.ts:1085`): compare the map with a snapshot, drop the images of changed chunks.
2. `drawStatic` (`renderer.ts:1086`, body `989-1035`): sky colour, then the terrain chunks, or a 1:1 copy of the
   "static layer" when nothing changed.
3. `mgmt.drawGround` (`renderer.ts:1088`): litter and mess decals (`management/layer.ts:148-181`).
4. `drawGround` of every world layer (`renderer.ts:1089`): the Calm / Buzz field tint (`fields/overlay.ts:109-168`).
5. Buy Land tints (`renderer.ts:1090`).
6. Depth-sorted objects (`renderer.ts:1102-1114`): this is where elevated decks (kind 60) and path items (kind 7) draw,
   mixed with rides, guests and scenery.
7. Weather, the After Dark light pass, then overlays (`renderer.ts:1115-1118`, `850-871`).

### One tile: `paintTile` (`terrain.ts:258-330`)

Inputs: the map arrays, the view tile `(u, v)`, the view rotation `r`, and `env = { seed, rides, stalls }`
(`terrain.ts:42-46`). It paints through a `TilePainter` (`terrain.ts:56-163`) whose coordinates are world pixels;
the chunk's canvas transform turns them into image pixels.

`TilePainter` has 5 drawing primitives. All of them are Canvas path fills or strokes with anti-aliasing:

| Primitive | Lines | What it does |
|---|---|---|
| `quad(u0, v0, u1, v1, fill, lift)` | `93-103` | A 4-point polygon on the tile surface, in local tile units 0–1 |
| `top(fill)` | `106-117` | The whole top face, grown by `expand` so neighbours overlap |
| `faceE(bottomN, bottomW, fill)` | `120-134` | Vertical side on the +u edge (front right) |
| `faceS(bottomW, bottomS, fill)` | `137-151` | Vertical side on the +v edge (front left) |
| `line(...)` | `153-162` | A stroked line with round caps (tufts, ropes, posts) |

The surface height at a local point is bilinear over the 4 corner heights (`h(u, v)`, `terrain.ts:80-82`), and every
primitive goes through `X(u, v)` and `Y(u, v)` (`terrain.ts:84-90`). So everything painted on a tile follows its slope.

Steps, in paint order:

1. **Cliff sides** (`terrain.ts:267-287`). The tile compares its E and S corner heights with the touching corners of
   the neighbour in front on +u, and its W and S corners with the neighbour on +v. If the tile is higher, it fills a
   side face from its own edge down to the neighbour's edge. At the front edge of the map the neighbour height is 0, so
   the map gets a brown skirt down to height 0 (64 px at ground level 8). Back sides are never drawn.
   The two colours are the same for every terrain type: snow, rock and sand cliffs are all brown.
2. **Ground** (`terrain.ts:289-296`). Pick shade a or b by a hash of the **map** tile and the park seed
   (`grassShade`, `terrain.ts:49-51`). Multiply by a light factor
   `(owned ? 1 : 0.78) × (1 + 0.12·dzdx − 0.06·dzdy)`, where `dzdx` and `dzdy` are the slope of the tile **in view
   space** (`terrain.ts:292-294`). The colour is computed at run time by `shade` (`palette.ts:122-132`). There are 9
   possible light values (0.88 to 1.12 in steps of 0.03), so up to 5 × 2 × 9 × 2 = 180 ground colours.
3. **Tufts** (`terrain.ts:297-310`). Only on tiles with content Empty and terrain Grass, on 1 tile in 8 (hash). Three
   "V" marks, each 2 strokes of width 1.2 px, 3 px high, in the ground colour × 0.8. The check does not look at water,
   so a wet grass tile can have tufts under its water.
4. **Water** (`terrain.ts:312-317`). If `water[i] > heights[i]`, one quad over the whole tile in
   `rgba(63,143,214,0.8)`, lifted by `(water − height) × 8` px. It is lifted from the tile's own surface, so on a
   sloped tile the water quad is tilted with the slope and not level (conclusion from `quad`, `terrain.ts:93-103`;
   the field overlay draws the same tile flat, `fields/overlay.ts:56-59`). Water has no side faces, no shore, no depth
   shading.
5. **Paths** (`terrain.ts:319-328`). The join mask comes from `pathJoinMask` (`paths.ts:81-100`) in map directions and
   is turned into the view by `rotateSlopeMask` (`view.ts:76-79`).
   - `paintPathShape` (`terrain.ts:172-189`) runs twice: once in the edge colour, once in the fill colour inset by
     `B = 0.055` tile. Each pass fills a centre square from `M = 0.16` to `0.84` and one arm per joined side out to the
     tile edge. For footpaths, a corner square is added between two joined arms when the diagonal tile is also a
     footpath or the entrance (`diagMask`, `terrain.ts:195-208`), which makes plazas solid.
   - Queues use the same shape with queue colours and no corner squares, then `paintQueueRails`
     (`terrain.ts:210-235`): a red rope line 7 px above the surface on every side without a join, and a post from the
     ground to 9 px at each corner where at least one of the two sides has no join.
   - The entrance adds two small rectangles (`terrain.ts:237-241`).
   - Paths are painted after water, so a path on a wet tile covers the water.

### Join rules (`src/render/paths.ts`)

- Footpath or entrance (`paths.ts:81-100`): joins a footpath or entrance neighbour; joins a queue neighbour only if
  that queue joins back; joins a building only at a ride exit gate or a stall service side; the entrance also joins
  toward the outside of the park.
- Queue (`paths.ts:56-78`): joins queue neighbours and its ride's entrance gate; at a free end it joins the first
  footpath neighbour in N, E, S, W order.
- The mask looks only at tile content. It does not look at heights or slopes, so two path tiles at different heights
  still draw arms toward each other.

### Chunks (`terrain.ts:332-734`, `terrainTracker.ts`)

- A chunk is 8 × 8 map tiles (`terrainTracker.ts:14`).
- `TerrainLayer.build` (`terrain.ts:542-561`) makes a canvas, sets `ctx.setTransform(scale, 0, 0, scale, ox, oy)`,
  and calls `paintTile` for every tile of the chunk, back to front by `u + v`, so front cliff sides cover the tiles
  behind. The image is transparent outside what was painted.
- `chunkBounds` (`terrain.ts:364-397`) gives the world-pixel box of a chunk: its tiles, 2 height steps of headroom
  above the highest corner or water, and down to the lowest neighbour (or height 0 at the front map edge).
- `TerrainLayer.draw` (`terrain.ts:567-649`) walks the chunks in view row order (`orient`, `terrain.ts:522-535`), skips
  those outside the view, finds or builds the image, and draws it with `drawImage` to a destination rectangle whose
  4 edges are rounded to whole device pixels (`terrain.ts:638-643`).
- Cache key: `chunk × 16 + rotation × 4 + slot` (`terrain.ts:426`, `438-440`). Slots 0–2 are the zoom buckets 0.5, 1,
  2; slot 3 is the "exact scale" image.
- Change detection: `TerrainTracker.sync` (`terrainTracker.ts:52-68`) diffs 7 map layers each frame
  (`terrainTracker.ts:22`: terrain, heights, slope, water, content, contentRef, owned). A changed tile dirties its own
  chunk and the chunks of its 4 orthogonal neighbours (`terrainTracker.ts:126-134`). `TerrainLayer.sync` then deletes
  all 16 images of each dirty chunk (`terrain.ts:503-510`).
- Path items, litter and bin fill are deliberately not chunk art (`terrainTracker.ts:7-10`).

### Static layer (`renderer.ts:930-1035`)

On the second frame of a still view the renderer composes sky and all visible chunks into one canvas-sized image.
While camera centre, scale, rotation, canvas size, terrain version and map object stay the same, each frame copies
that image 1:1 with a single `drawImage` (`renderer.ts:1000-1006`). It is only kept when every chunk showed its final
image (`terrain.complete`, `terrain.ts:458`, `renderer.ts:1022`).

### Elevated decks (`elevated/layer.ts`)

- `collect` (`139-157`) pushes one drawable per elevated path into the depth-sorted list, at depth `u + v + 0.5`,
  height `p.z`, layer `Path`.
- `corners` (`70-92`) computes, in device pixels, the 4 corners of the tile at deck height (a ramp raises 2 corners by
  1 step) and the 4 ground corners under them.
- `drawDeck` (`103-133`) draws, straight to the screen canvas, with vector calls:
  4 posts as `fillRect` from under the slab to the ground corner (`106-118`); the left and right slab faces, 4 px
  thick (`119-125`); the top face as one quad covering the **whole tile** (`126-129`); a stroke around the top face
  (`130-132`).
- There is no join logic for decks. Every deck tile is stroked on all 4 sides, so lines show between neighbouring deck
  tiles. Queue decks have no ropes. Decks have no rails.
- Posts go down to the ground corner height, not to the water surface (`elevated/layer.ts:87-90`).

### Path items and decals

- `collectPathItems` (`management/layer.ts:203-229`) scans all tiles, places the item by `pathItemPlacement`
  (`management/pathItemPos.ts:20-48`) at a tile edge without a join, and pushes it with a sprite key.
- The art is vector, built from `box`, `cylinder`, `line3`, `poly3` (`sprites/shapes.ts:21-110`) inside
  `drawPathItemArt` (`sprites/litter.ts:150-154`), and rendered once per frame code and zoom bucket by
  `SpriteBank.pathItem` (`sprites/bank.ts:170-176`) through `buildSprite` (`canvas.ts:56-72`).
- The render code never reads `map.pathItemLevel` (a search of `src/render` finds no use). `collectPathItems` takes
  the item height from the ground (`management/layer.ts:215`, `222`). So an item that the simulation placed on an
  elevated deck (`src/sim/staff/commands.ts:178-190`) is, by this code, drawn at ground height. Not checked on screen.
- Litter and mess are sprites placed at hashed positions inside the tile (`management/litter.ts:36-60`) and drawn
  every frame after the terrain (`management/layer.ts:148-181`).

### Overlays in this area

- `tileFace` / `tilePath` / `outlineTiles` (`renderer.ts:623-660`): the top face of a tile (with slope) as a path in
  device pixels, filled and stroked. Used for hover, selection, the path drag line, ride and stall ghost footprints.
- `drawOwnershipTints` and `drawPurchaseRect` (`renderer.ts:680-726`): one fill per ownership state.
- Land and Water brush (`terrainTools/layer.ts:98-165`): each brush tile outlined on its 4 corner heights, a ring on
  the marked corner, and a cost chip drawn with `fillText` in `system-ui` (`terrainTools/layer.ts:170-196`).
- Elevated ghost (`elevated/layer.ts:173-209`): a translucent deck quad per tile of the drag line and a guide line to
  the ground.

---

## Sizes and scale

### Pixel sizes at zoom 1 (world pixels)

| Thing | Size | Source |
|---|---|---|
| Tile top face | 64 × 32 px diamond | `iso.ts:8-9` |
| One height step | 8 px | `iso.ts:10` |
| Ground level of a new map | 8 steps = 64 px above height 0 | `src/data/tuning/core.ts:23` |
| Path margin on a side without a join | 0.16 tile (about 4.6 px measured across the path) | `terrain.ts:165` |
| Path border | 0.055 tile (about 1.6 px across) | `terrain.ts:166` |
| Path width | 0.68 tile (about 19.5 px across; a full tile is 28.6 px across) | `terrain.ts:165` |
| Queue rope | 1.6 px wide, 7 px above the surface | `terrain.ts:213`, `222` |
| Queue post | 1.8 px wide, 9 px high | `terrain.ts:233` |
| Grass tuft | about 5 px wide, 3 px high, 1.2 px strokes | `terrain.ts:304-307` |
| Entrance inlay | 0.2 × 0.4 tile each | `terrain.ts:239-240` |
| Deck slab | 4 px thick; covers the full tile | `elevated/layer.ts:24`, `126-129` |
| Deck post | 2.2 px wide | `elevated/layer.ts:108` |
| Deck edge stroke | 1 px | `elevated/layer.ts:131` |
| Path item sprite box | 32 × 40 px (anchor 16 px from the left, 32 px from the top) | `sprites/litter.ts:11` |
| Lamp | 27 px high | `sprites/litter.ts:138-148` |
| Bench | 0.4 tile long, 11 px high | `sprites/litter.ts:65-84` |
| Bin | radius 0.085 tile, 10 px high | `sprites/litter.ts:101-103` |
| Litter decal box | 18 × 13 px (art drawn at 1.6×) | `sprites/litter.ts:12`, `161` |
| Mess decal box | 22 × 12 px | `sprites/litter.ts:13` |
| Chunk image, flat inner chunk | 512 × 272 world px + 2 px pad each side | `terrain.ts:391-396`, `399`, `545-546` |

Chunk image sizes for a flat inner chunk: 260 × 140 px at bucket 0.5 (0.14 MB), 516 × 276 px at bucket 1 (0.54 MB),
1028 × 548 px at bucket 2 (2.15 MB). Chunks with cliffs or at the front map edge are taller.

### The draft's scale compared with the game

- The draft script projects with half-tile sizes 16 and 8: `scr(x, y) = (OX + (x − y)·16, OY + (x + y)·8 − z)`
  (`scratchpad/concepts/pixel3.py:78`). One tile is 32 × 16 art pixels.
- `docs/screenshots/phase-7-draft-desktop.png` is 1280 × 800. In a map-only region every 2 × 2 block of pixels has one
  colour (measured: 100% of blocks at 2 × 2, 46% at 4 × 4). So 1 art pixel = 2 screen pixels, and one tile is 64 × 32
  screen pixels: the game's zoom 1.
- The draft's native resolution therefore equals the game's zoom bucket 0.5 (32 × 16 px per tile). One height step
  would be 4 art pixels.
- The draft has no heights at all: `ground()` works on a flat plane (`pixel3.py:106-170`).

### Zoom

- Camera zoom is continuous from 0.25 to 2 (`camera.ts:6-7`). Wheel and keys multiply by 1.15 per step
  (`src/input/camera.ts:13-14`); pinch passes any factor (`src/input/controller.ts:280`). The start zoom is 1
  (`src/game.ts:17`).
- Device scale = `cam.zoom × dpr` (`renderer.ts:1059`). The zoom bucket is the nearest of 0.5, 1, 2 on a log scale:
  below 0.707 → 0.5, below 1.414 → 1, else 2 (`camera.ts:69-73`).
- A chunk image built at bucket scale is drawn scaled by `scale / sp.scale` (`terrain.ts:638`). Image smoothing is
  switched on explicitly for the screen canvas and the static layer (`renderer.ts:1071`, `1018`). The game canvas has
  no `image-rendering` CSS (`src/styles/main.css:34`).
- Exact-scale images (`terrain.ts:414-424`, `588-589`): on desktops with quality high or auto, when the device scale
  is not a bucket value and is at most 2 and has been stable for 8 frames, visible chunks are rebuilt at that exact
  scale, one per frame, and then drawn 1:1. Phones and low quality never do this (`terrain.ts:459-463`,
  `renderer.ts:906`).
- When an image of the wanted bucket is missing, an image of another bucket stands in and is refined one chunk per
  frame (`terrain.ts:401`, `611-622`). When no image exists, chunks are built within 6 ms per frame, at least one per
  frame; the rest show the flat placeholder (`terrain.ts:407`, `625-635`).

### Device pixel ratio

- The canvas backing size is CSS size × `dpr` (`renderer.ts:912-913`).
- `dpr` comes from the render plan (`src/perf/quality.ts:64-77`): the device ratio; at most 2 on phones
  (`src/data/tuning/perf.ts:7`); 1 at low quality; with quality auto it can step down to 1 when frames are slow
  (`src/perf/quality.ts:88-92`).
- Overlays work in device pixels and take line widths from `scale` or `dpr` (for example `renderer.ts:657`,
  `terrainTools/layer.ts:104`, `155`).

### View rotation

- 4 rotations, table in `view.ts:6-12`. The terrain is painted in view space: `paintTile` maps the view tile back to
  the map tile (`terrain.ts:248-252`), turns corner heights and join masks (`view.ts:174-187`, `76-79`), and always
  paints the two sides that face the viewer.
- Each rotation has its own chunk images (4 rotations × 4 scale slots = 16 keys per chunk, `terrain.ts:426`).
- The shade and the tufts are tied to the map tile, so they turn with the map (`terrain.ts:289-291`, `300`). The slope
  light is tied to the screen (`terrain.ts:292-294`).
- On a turn, the visible chunks are built over several frames (`terrain.ts:403-407`); desktops build the two
  neighbouring rotations ahead of time on idle frames (`terrain.ts:676-707`, `renderer.ts:969-986`).
- Decks, path items and overlays project through the same rotation each frame (`elevated/layer.ts:43-61`,
  `management/layer.ts:225-227`, `terrainTools/layer.ts:41-69`).

### What is cached

| Cache | Content | Limit | Source |
|---|---|---|---|
| Chunk images | Items 1–8 of the inventory | 64 MB desktop, 32 MB phone-sized screens, LRU | `terrain.ts:428-435`, `466-468` |
| Static layer | Sky + chunks, one canvas-sized image | Counts toward the shared budget | `renderer.ts:938-943` |
| Sprite bank | Path items, decals (and all other sprites) | 96 MB own cap | `sprites/bank.ts:19-20`, `88-90` |
| Shared budget over all caches | | 192 MB desktop, 64 MB phone | `src/data/tuning/perf.ts:4`, `spriteCache.ts:68-132` |

Not cached, drawn with vector calls every frame: elevated decks and supports, all overlays, ownership tints, the
placeholder.

---

## Animation

Nothing in this area moves.

- Terrain, water, paths and queues are baked into chunk images. Water does not ripple or shimmer. There is no time
  input to `paintTile`; its only inputs are the map, the seed, and the ride and stall lists (`terrain.ts:42-46`,
  `258`).
- Elevated decks are redrawn each frame but have no time input (`elevated/layer.ts:159-165`).
- Path items change look only with state: bin fill in 4 steps (`sprites/litter.ts:21-25`) and the broken flag.
- Litter and mess appear and disappear with the simulation; their positions are fixed hashes
  (`management/litter.ts:36-60`).

Things a player can see change over time in this area, none of them art animation:

- Placeholder diamonds for a frame or two after a view turn or a jump (`terrain.ts:625-631`).
- Chunks getting sharper after the zoom has been still for 8 frames (`terrain.ts:420`, `588-589`).
- Overlays following the pointer; the Land tool repeats its action every 300 ms while held
  (`terrainTools/toolState.ts:31`, `38`).

If animation is added later, the code base already has two conventions to follow:

- Time base: `world.state.tick + alpha`, which is deterministic (used by rain, `management/layer.ts:328`).
- Reduced motion: `displayPrefs().reducedMotion` switches motion off (`renderer.ts:519`,
  `management/layer.ts:112-114`, `328`).

---

## What a pixel-art version must keep

### Geometry that other code depends on

- Tile 64 × 32 px, height step 8 px. Tested in `tests/unit/render/iso.test.ts:28`. Used by every layer.
- A tile's drawn top face must stay the shape that picking assumes: the 4 corners at their corner heights, treated as
  two triangles split along the W–E diagonal (`iso.ts:98-124`, `136-167`; tests `tests/unit/render/iso.test.ts:52-108`,
  `tests/unit/render/rotation.test.ts:28-97`).
- Walkers stand on the bilinear surface (`surfaceHeight`, `iso.ts:47-67`). The comment there states it is "the same
  surface the terrain painter draws paths and decals on". Tests: `tests/unit/render/walkerHeight.test.ts:11-75`.
- A deck is the full top face of its tile at height `z`, a ramp raises 2 corners by 1 step. `pickElevatedPath` and
  `deckContains` assume exactly this (`elevated/pick.ts:33-69`; tests `tests/unit/paths/pick.test.ts:26-55`).
- Positions that must stay on the visible path surface:
  - Guest lanes at ±0.27 and ±0.09 tile from the centre line (`guestPos.ts:14`). Today's path half-width is 0.34 tile.
  - Queue slots: 4 per tile, ±0.375 tile along, ±0.04 tile sideways (`queue.ts:10`, `58`, `89-93`).
  - Path items at 0.14 tile from an edge without a join, or at (0.16, 0.16) on a crossroads
    (`management/pathItemPos.ts:17-48`; tests `tests/unit/render/management/geometry.test.ts:92-115`).
  - Litter between 0.12 and 0.88 tile, mess between 0.32 and 0.68 (`management/litter.ts:22-25`).
- Depth order of decks: `u + v + 0.5`, layer `Path` (`elevated/layer.ts:155`; test
  `tests/unit/paths/layer.test.ts:71-82`).

### Function signatures and exports

`src/render/terrain.ts` (used by `renderer.ts:33`, `management/layer.ts:31`, tests):

- `class TerrainLayer`: `constructor(budgetPixels?)`, `tracker`, `sync(map): boolean`,
  `draw(ctx, map, env, view, bucket, scale, offX, offY, r): number`, `touch(view, bucket, r)`,
  `prefetch(map, env, view, bucket, r): boolean`, `invalidate()`, `hasImage(chunk, r, bucket)`, and the fields
  `builds`, `placeholders`, `complete`, `allowExact`, `budgetPixels`, `pixels`, `prefetched`.
- `grassShade(seed, x, y): 0 | 1` (also used by `drawPreview`, `renderer.ts:1191`).
- `chunkViewRect`, `chunkBounds`, `chunkImageKey`, `chunkCacheBudgetPixels`, `CHUNK_CACHE_MB`,
  `CHUNK_CACHE_MB_PHONE`, `FIRST_BUILD_BUDGET_MS`, `PREFETCH_HEADROOM`, `EXACT_SETTLE_FRAMES`, `terrainClock`,
  `interface TerrainEnv`, `interface ViewRect`.

`src/render/terrainTracker.ts`: `CHUNK_SIZE`, `chunkCount`, `TRACKED_LAYERS`, `class TerrainTracker` (`version` is
also read by the fence and the static layer, `renderer.ts:1093-1097`, `957`).

`src/render/paths.ts`: `JOIN_N/E/S/W`, `pathJoinMask(map, i, rides, stalls)`. Also used by
`management/layer.ts:219`, `280`, `547` and `lighting/pass.ts:259` to place items, sitters and lamp bulbs.

`src/render/queue.ts`: `QUEUE_SLOTS_PER_TILE`, `createQueueWalker`, `queueSlot`.

`src/render/elevated/layer.ts`: `createElevatedPathLayer(): WorldLayer`, `ELEVATED_COLOURS`.

`src/render/terrainTools/layer.ts`: `createTerrainToolLayer(): WorldLayer`, `terrainGhostColours`, `viewPoint`,
`moneyLabel`, `interface GhostColours`.

Layer contract: `WorldLayer`, `LayerFrame`, `LayerSink`, `LAYER_KIND` (`layers.ts:21-65`).

### Rules the art must follow

- Deterministic drawing: same inputs give the same pixels
  (`docs/superpowers/specs/2026-11-09-thrills-and-chills-design.md:74`).
- All graphics drawn in code, no runtime dependency (same file, line 39; `package.json` has no `dependencies`).
- Chunk art may read only the 7 tracked map layers, the seed, and what `pathJoinMask` reads. Anything else would leave
  stale chunk images (`terrainTracker.ts:21-22`).
- No allocation per tile or per object in frame loops (stated in `terrain.ts:243`, `elevated/layer.ts:9`,
  `terrainTools/layer.ts:10`).
- Ghost colours must come from the colour-blind safe pair in `palette.ts:10-24`. A test scans every file under
  `src/render` for old red and green literals (`tests/unit/render/safeColours.test.ts:26-43`, `71-82`).
- Outlines double in width with high contrast (`palette.ts:35-37`).
- The module must import without a DOM (`tests/unit/render/terrain.test.ts:49-55`).

### Tests that pin the present behaviour

| Test | What it pins |
|---|---|
| `tests/unit/render/terrain.test.ts:17-31`, `57-83` | Exact `chunkBounds` numbers, 8 × 8 chunks, the 2-step headroom, the edge skirt to height 0 |
| `tests/unit/render/terrain.test.ts:33-46` | `grassShade` gives 0 or 1 and depends on the seed |
| `tests/unit/render/terrain.test.ts:85-123` | Draw order, the 2 px pad in the destination position, images per rotation, drop on a tile change |
| `tests/unit/render/terrain.test.ts:125-164` | Exact-scale rebuild after 8 frames, drawn with destination size = image size |
| `tests/unit/render/terrain.test.ts:171-265` | Frame budget, placeholders counted as `fill` calls on the screen context (`187`), phone rule, prefetch |
| `tests/unit/render/terrainTracker.test.ts:20-94` | The diff; path items do not redraw terrain (`83`) |
| `tests/unit/render/staticLayer.test.ts:57-120` | Static layer reuse: one `fillRect` for the sky plus chunk draws |
| `tests/unit/render/scene.test.ts:111-155` | Path join rules |
| `tests/unit/paths/layer.test.ts:84-93` | A deck makes exactly 4 `fillRect` posts of 28 px, and its last 3 fills are left, right, top in `ELEVATED_COLOURS` |
| `tests/unit/paths/layer.test.ts:95-114` | The last 4 path points of a deck are its top corners; a ramp raises 2 of them by 8 px |
| `tests/unit/paths/layer.test.ts:116-132` | Ghost fills |
| `tests/unit/terrain/layer.test.ts:52-107` | Brush ghost: one closed path per tile, an arc, the cost text, the colours |
| `tests/e2e/paths.spec.ts:106-110` | The screen pixel at the centre of a deck is within 60 (sum of channel differences) of `#dcc79c` |
| `tests/e2e/boot.spec.ts:12-21` | Some sampled pixel has green above 120 |

The unit tests run on a fake canvas that records calls and has no pixels: `getImageData` returns 4 zero bytes and
`createPattern` returns a stub (`tests/unit/render/fakeCanvas.ts:66-72`).

---

## What makes pixel art hard here

1. **Free zoom and smoothing.** Zoom is any value from 0.25 to 2 (`camera.ts:6-7`, `src/input/camera.ts:13-14`) and
   is multiplied by a device ratio that can be 1.25, 1.5, 2 or 2.625 (`renderer.ts:1059`). Chunk images are either
   drawn scaled with smoothing on (`renderer.ts:1071`, `1018`, `terrain.ts:638-643`) or rebuilt as vectors at the
   exact fractional scale (`terrain.ts:588-589`). Pixel art needs whole-number scaling of the art pixel. Neither path
   gives that today.

2. **Everything is an anti-aliased vector path in a scaled transform.** `build` sets a scale transform
   (`terrain.ts:550`) and the painter fills polygons at fractional positions. Seams are hidden by growing each top
   face by 0.6 image pixels (`terrain.ts:105-117`, `551`), which is the opposite of a pixel grid. Path margins and
   borders are fractions of a tile (0.16 and 0.055, `terrain.ts:165-166`) that do not land on art pixels: the border
   is about 0.8 art pixel wide.

3. **Slopes.** There are 15 top-face shapes (`src/sim/terrain/normalize.ts:26-41`), some not flat planes (one corner
   up, three corners up, the two diagonal masks 5 and 10). Paths run on 4 ramp shapes (`src/sim/paths/nodes.ts:22-33`).
   Today everything follows the surface through `h(u, v)` (`terrain.ts:80-90`). A texture or a pixel path edge must be
   sheared onto each shape. The draft has no slopes at all (`scratchpad/concepts/pixel3.py:106-170`).

4. **Cliff sides of any height.** A side face runs from the tile's edge down to the neighbour, with sloped top and
   bottom edges, for height differences up to 63 steps = 504 px (`terrain.ts:119-151`, `267-287`;
   `src/data/tuning/core.ts:21`). The map edge always shows a 64 px skirt. The draft shows no cliff and no map edge.

5. **Four view rotations.** The same map tile is painted 4 times in view space (`terrain.ts:258-265`). A texture
   tied to the map must turn with it; a dither tied to the screen must not. The draft mixes both: noise in map
   coordinates and a Bayer matrix in screen coordinates (`pixel3.py:116-118`). The slope light is tied to the screen
   (`terrain.ts:292-294`), so a ramp changes shade when the view turns. Memory is 16 images per chunk
   (`terrain.ts:426`).

6. **Colours are computed, not picked from a palette.** Ground colours come from `shade(base, light)`
   (`terrain.ts:290-295`, `palette.ts:122-132`), up to 180 values. Land outside the park is the same colour × 0.78
   (`terrain.ts:35`). Water is a 0.8 alpha blend over the ground (`terrain.ts:316`). Later passes blend more colour
   over the terrain: field tints (`fields/overlay.ts:146-147`), ownership tints (`renderer.ts:235-241`), weather
   tints (`management/layer.ts:316-325`), and the After Dark pass, which multiplies a quarter-resolution, smoothed
   light image over the whole frame (`lighting/pass.ts:35`, `159-162`). A fixed palette on screen needs a decision for
   each of these.

7. **Water is baked and flat.** One quad per tile inside the chunk image (`terrain.ts:312-317`). It cannot animate
   without rebuilding chunks, and any per-frame ground drawing must go after the static layer or it defeats that cache
   (`renderer.ts:930-937`, `1088-1089`). On a sloped tile the quad is tilted. There is no shore, and the draft's shore
   bands and sparkles (`pixel3.py:121-142`) need neighbour tests the painter does not have for water.

8. **Chunk build cost.** Chunks are built on the main thread inside a frame, with a 6 ms budget for first builds and
   one refine per frame (`terrain.ts:401-407`, `625-635`). Today a chunk is 64 tiles of a few fills. The draft colours
   every pixel with noise, a dither test and 4 neighbour tests (`pixel3.py:108-170`). A chunk is 142,000 pixels at
   bucket 1 and 563,000 at bucket 2. `docs/adr/0001-renderer.md` records that larger chunks once took over 100 ms to
   build on a throttled phone (quoted in `terrain.ts:4-6`).

9. **Neighbour tracking is 4-way.** A changed tile dirties only its 4 orthogonal neighbours' chunks
   (`terrainTracker.ts:126-134`). Edge and corner art between tiles (grass to path, shore corners) needs the 4
   diagonal neighbours too. The plaza corner fill already reads diagonals (`terrain.ts:203-206`), so by this code a
   corner square across a chunk corner can stay stale until its chunk is redrawn for another reason. Not checked on
   screen.

10. **Paths are inset shapes, the draft's paths fill the tile.** The game draws a centre square with arms and a 0.16
    tile grass margin (`terrain.ts:165`, `172-189`). The draft treats the whole tile as path with a dark strip 0.11
    tile wide where the neighbour is grass (`pixel3.py:92-101`, `168-169`). Queue ropes and posts
    (`terrain.ts:210-235`) and item positions (`management/pathItemPos.ts:17-18`) are tuned to the inset shape.

11. **Decks are per-frame vectors with no joins.** Each deck tile is a separate quad with a stroke on all 4 sides
    (`elevated/layer.ts:126-132`), posts are `fillRect` with width `max(1, 2.2 × scale)` (`elevated/layer.ts:108-116`),
    and nothing is cached. Tests pin the fill order, the post count and the centre colour
    (`tests/unit/paths/layer.test.ts:84-93`, `tests/e2e/paths.spec.ts:109-110`). Supports sort with their deck, not on
    their own (`layers.ts:47`, `elevated/layer.ts:155`).

12. **Sprites and terrain round to device pixels separately.** Chunks round their destination (`terrain.ts:639-642`)
    and every sprite rounds its own (`renderer.ts:338-345`). With art pixels of 2 or 4 device pixels, sprites can sit
    off the terrain's art-pixel grid. The camera centre is fractional (`camera.ts:63-66`).

13. **Tests have no pixels.** The fake canvas cannot check any pixel result, and it returns stubs for `getImageData`
    and `createPattern` (`tests/unit/render/fakeCanvas.ts:66-72`). A painter that writes pixels through `ImageData`
    must still run there, and several tests count vector calls (`tests/unit/render/terrain.test.ts:187`,
    `tests/unit/paths/layer.test.ts:89-92`).

14. **Size limit if art ships as data.** The initial load budget is 400 KB gzipped
    (`src/data/tuning/perf.ts:19`), and the design rule is that graphics are drawn in code
    (`docs/superpowers/specs/2026-11-09-thrills-and-chills-design.md:39`). That file's art direction also says "Flat
    colours, chunky shapes" (line 70), which the approved drafts replace.

---

## Size of the job

Draw code that a new art style must replace or wrap, by file. Line counts are the ranges given.

| File | Functions | Lines | Replace or keep |
|---|---|---|---|
| `src/render/terrain.ts` | Constants and colours (`24-40`); `TilePainter` with `quad`, `top`, `faceE`, `faceS`, `line` (`56-163`); `paintPathShape` (`165-189`); `paintQueueRails`, `paintEntrancePlaza` (`210-241`); `paintTile` (`258-330`); `drawPlaceholder` (`710-733`) | about 280 | Replace: this is all of the ground art (10 draw functions) |
| `src/render/terrain.ts` | `TerrainLayer.build` (`542-561`) and `draw` (`567-649`) | about 100 | Wrap: the transform, the `expand` value, the scaling and the exact-scale rule decide whether pixels stay crisp |
| `src/render/terrain.ts` | The rest of the chunk layer (`332-541`, `651-707`) | about 270 | Keep |
| `src/render/terrainTracker.ts` | `markTile` (`126-134`) | 9 of 162 | Small change if art reads diagonal neighbours |
| `src/render/elevated/layer.ts` | Colours (`26-36`), `corners`, `quad`, `drawDeck` (`70-133`), `drawGhost` (`173-209`) | about 115 of 213 | Replace `drawDeck` (3 draw functions); keep `collect` |
| `src/render/sprites/litter.ts` | `crack`, `bench`, `bin`, `lamp`, `drawPathItemArt`, `drawLitterArt`, `drawMessArt` (`32-232`) | about 200 | Replace (7 draw functions) |
| `src/render/renderer.ts` | `tileFace`, `tilePath`, `outlineTiles`, `dragColours`, `drawOwnershipTints`, `drawPurchaseRect` (`623-726`); preview ground (`1183-1194`) | about 115 | Restyle if overlays are to match (6 draw functions) |
| `src/render/terrainTools/layer.ts` | `drawOverlay`, `drawCost` (`98-196`) | about 100 | Restyle if overlays are to match (2 draw functions) |
| `src/render/renderer.ts` | Smoothing flags (`1018`, `1071`), `blit` (`338-345`), `drawStatic` (`989-1035`) | about 60 | Wrap: scaling policy |

Totals:

- Core ground art to replace: 10 draw functions, about 280 lines, all in `terrain.ts`.
- With decks, path items and decals: 20 draw functions, about 600 lines.
- With the tile overlays and tool ghosts too: 28 draw functions, about 810 lines.
- Scaling and caching code to adjust, not rewrite: about 170 lines in `terrain.ts` and `renderer.ts`.
- Pure logic that needs no art change: `paths.ts` (100 lines), `queue.ts` (97), `elevated/pick.ts` (69),
  `terrainTools/toolState.ts` (144), `management/pathItemPos.ts` (48), `management/litter.ts` (60).

Art that the draft does not show and that would have to be designed first: 14 sloped tile shapes, cliff sides, the map
edge, land outside the park, the 4 terrain types other than grass, shores on slopes, queue tiles and their ropes,
elevated decks with supports and ramps, paths on ramps, and all of it in 4 view directions.

---

## Open questions

1. **Zoom.** Should zoom snap to steps where an art pixel is a whole number of device pixels? With a 32 × 16 art tile
   that means device scale 0.5, 1, 1.5, 2 and so on. What should happen at device ratios 1.25 and 1.5, and below zoom
   0.5, where an art pixel is smaller than a screen pixel?
2. **Art resolution.** Is the art pixel fixed at 2 CSS pixels at zoom 1, as in the draft? At zoom 2 it would be 4 CSS
   pixels.
3. **Slopes and cliffs.** The drafts have none. What should a sloped tile, a cliff side, and the map edge look like?
   Is the brown cliff for every terrain type to stay?
4. **View rotation.** Must the pixel art support all 4 view directions from the start? May the slope light stay tied
   to the screen?
5. **Water.** Is animated water wanted? It needs a per-frame layer outside the chunk cache. Should water on a sloped
   tile be drawn level?
6. **Path shape.** Keep the inset path with a grass margin, or fill the tile as in the draft? The second choice moves
   benches, bins, lamps, queue ropes and posts.
7. **Terrain types and themes.** The draft script has theme palettes (orange, frost, jungle, spooky, stoneage,
   starport; `pixel3.py:27-62`). The game has terrain types per tile and no ground theme. Which one drives the ground
   palette?
8. **Palette on screen.** Are blended colours allowed for water, land outside the park, tool tints, weather and night
   lighting, or must each be snapped to palette colours?
9. **Elevated decks.** Should decks join into one surface, get rails, and be cached as sprites? May the tests that
   pin fill order and the deck centre colour change (`tests/unit/paths/layer.test.ts:84-93`,
   `tests/e2e/paths.spec.ts:109-110`)?
10. **Path items on decks.** The render code draws them at ground height (see "Path items and decals"). Fix it in
    this project or leave it?
11. **Stale corner squares.** Extend the tracker to diagonal neighbours now (see obstacle 9), since new edge art will
    need it anyway?
12. **Overlays.** Should hover outlines, tool ghosts and the cost chip become pixel art too, or stay smooth vector
    shapes over a pixel world?
13. **Tests.** Is a pixel-level check wanted (a real canvas in Node or screenshot baselines)? Today nothing can verify
    crispness or palette use.
14. **Spec text.** The design document's art direction says "Flat colours, chunky shapes"
    (`docs/superpowers/specs/2026-11-09-thrills-and-chills-design.md:70`). Should it be rewritten as part of this
    project?
