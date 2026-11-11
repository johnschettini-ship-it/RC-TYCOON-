# Flat rides and stalls: how the game draws them today

Area: `src/render/sprites/rides.ts`, `src/render/sprites/stalls.ts`, every file in `src/render/sprites/content/`,
`src/render/sprites/props.ts`, and the catalogs `src/data/catalog/flatRides.ts` and `src/data/catalog/stalls.ts`.
I also read the code these files depend on or that calls them: `sprites/shapes.ts`, `sprites/bank.ts`, `canvas.ts`,
`anim.ts`, `renderer.ts`, `depth.ts`, `view.ts`, `fence.ts`, `queue.ts`, `lighting/pass.ts`, `sim/footprint.ts`, and
the tests under `tests/unit/render/`.

All repository paths are relative to `/home/user/RC-TYCOON-`. Line numbers are from the working tree at commit
`e247baa`. Everything was read from the code. Nothing was run. Draft script paths are relative to
`/tmp/claude-0/-home-user-RC-TYCOON-/29ee6f8c-df84-5112-ac7e-04cfb7614dae/scratchpad/concepts`.

Terms:

- **World pixel**: one pixel at zoom 1 on a screen with device pixel ratio 1. A tile is 64 × 32 world pixels.
- **Art pixel**: one pixel of the approved drafts. The draft draws a tile as 32 × 16 art pixels (`pixel3.py:78`), so
  one art pixel is 2 world pixels.
- **Bucket**: one of the three scales (0.5, 1, 2) at which sprite images are built and cached.
- **View rotation**: the camera has 4 views. A sprite is asked for with `(map rotation + view rotation) mod 4`
  (`src/render/view.ts:82-84`).

---

## What this area draws

### Counts

| Thing | Count | Where |
|---|---|---|
| Flat rides in the catalog | 18 | `src/data/catalog/flatRides.ts:19-39` |
| Flat rides with their own art function | 18 (4 in `rides.ts`, 14 in `content/`) | `rides.ts:475-493`, `content/index.ts:30-46` |
| Fallback ride art (unknown id only) | 1 | `rides.ts:418-468` |
| Stalls in the catalog | 14 | `src/data/catalog/stalls.ts:6-23` |
| Stalls with their own art function | 11 | `content/stalls.ts:496-508` |
| Stalls drawn by the generic stall (colour scheme by kind + icon) | 3: `snack_shack`, `fizz_stand`, `restrooms` | `stalls.ts:152-183` |
| Gate marks (entrance + exit) | 2 per ride, drawn inside the ride sprite | `rides.ts:80-117` |
| Guest sprite | 1 function, many frames | `props.ts:140-210` |
| Park fence segment | 1 function, 4 directions | `props.ts:233-249` |
| Park entrance arch | 1 function, 2 parts × 4 directions | `props.ts:261-323` |
| Ghost check / cross badge | 1 function, drawn straight to the screen (no sprite) | `props.ts:328-355` |

### Every flat ride

`w × d` is the catalog footprint: `w` along the front edge, `d` deep (`src/data/catalog/types.ts:22-25`).
"Lines" counts the function from its first line to its closing brace. Private helpers are listed with their ride.

| id | w × d | Tag, flags | Draw function | Lines | What animates |
|---|---|---|---|---|---|
| `carousel` | 3 × 3 | family, covered | `drawCarousel` `rides.ts:121-187` | 67 | 8 horses orbit (radius 0.9 tile) and bob ±5 px; each horse flips to face its travel; riders on horses. Canopy, valance, pole, flag are still. `rides.ts:131-158` |
| `big_wheel` | 3 × 3 | chill, tall | `drawBigWheel` `rides.ts:189-279` | 91 | 16 spokes and 8 gondolas turn in a vertical plane; gondolas stay upright. The two rims are still rings. `rides.ts:212-269` |
| `swing_tower` | 3 × 3 | thrill, tall | `drawSwingTower` `rides.ts:281-350` | 70 | 10 seats orbit; chains swing out with `swing` (radius 0.5 → 1.25 tile, seats rise 18 px, crown rises 8 px); 12 crown bulbs turn. `rides.ts:286-333` |
| `teacup_twirl` | 3 × 3 | family, covered | `drawTeacups` `rides.ts:352-412` | 61 | Floor wedges and 4 cups orbit at half speed; each cup's handle spins 3 times per angle turn. `rides.ts:358-396` |
| `bumper_cars` | 4 × 4 | family, covered | `drawBumperCars` `content/gentleRides.ts:16-92` | 77 | 6 cars on looping sine paths; spark stars at pole tops from a hash; valance bulbs alternate. `:40-63`, `:87-91` |
| `rocket_rounds` | 3 × 3 | family | `drawRocketRounds` `content/gentleRides.ts:123-178` + `rocket` `:98-121` | 56 + 24 | 6 rockets orbit (radius 1.1), rise and fall once per turn (16 → 42 px); each body points along its path; arms follow. `:135-155` |
| `spiral_slide` | 2 × 2 | chill | `drawSpiralSlide` `content/gentleRides.ts:182-251` | 70 | Building is still. Up to 4 riders on mats slide down the helix. `:220-235` |
| `observation_tower` | 2 × 2 | chill, covered, tall | `drawObservationTower` `content/gentleRides.ts:255-289` | 35 | Ring cabin goes up and down the mast once per turn (12 → 138 px); beacon blinks. `:264`, `:288` |
| `mirror_maze` | 3 × 3 | chill, covered | `drawMirrorMaze` `content/gentleRides.ts:293-358` | 66 | 3 light bands sweep the two visible walls; roof crystal changes width; 4 stars orbit it. No riders shown. `:304-313`, `:349-357` |
| `haunted_manor` | 4 × 4 | chill, covered, spooky | `drawHauntedManor` `content/gentleRides.ts:366-453` + `windowGlow` `:362-364` | 88 + 3 | Windows flicker from a hash; a ghost rises 24 px behind the roof and sways. No riders shown. `:379`, `:385`, `:392-396`, `:410-412` |
| `pendulum_ship` | 3 × 5 | thrill | `drawPendulumShip` `content/thrillRides.ts:37-144` | 108 | Hull, deck, 12 seats and arms swing ±68° about a pivot 84 px up. `:32-35`, `:44-55` |
| `thunder_disc` | 4 × 4 | thrill | `drawThunderDisc` `content/thrillRides.ts:155-238` + `trackHeight` `:151-153` | 84 + 3 | Disc slides along a U-shaped track (±1.3 tiles, up to 64 px high) and spins 3 times per turn with 12 seats. `:188-218` |
| `drop_tower` | 2 × 2 | thrill, tall | `drawDropTower` `content/thrillRides.ts:256-314` + `dropProfile` `:245-254` | 59 + 10 | Seat ring climbs for 70 % of a turn, holds 10 %, drops in 10 %, rests 10 % (14 → 152 px); 10 chase lights. `:261`, `:278-282` |
| `flip_arm` | 3 × 3 | thrill, tall | `drawFlipArm` `content/thrillRides.ts:322-391` | 70 | Arm turns a full circle in a vertical plane about a hub 76 px up; bench and riders turn over with it; two stars spin. `:340-390` |
| `magic_carpet` | 4 × 3 | thrill | `drawMagicCarpet` `content/phase6Rides.ts:41-118` | 78 | Level carpet circles on two arms (radius 1.12 tile) about an axle 66 px up; 10 seats. `:45-47`, `:60-69` |
| `kiddie_cars` | 3 × 3 | family | `drawKiddieCars` `content/phase6Rides.ts:124-183` | 60 | 4 cars drive round a ring road (radius 0.98); flag colour cycles. `:144-163`, `:172` |
| `merry_mill` | 3 × 3 | chill | `drawMerryMill` `content/phase6Rides.ts:191-244` | 54 | 4 sails turn in the screen plane; 4 gondolas hang level from the tips. `:216-243` |
| `gyro_globe` | 3 × 3 | thrill, tall | `drawGyroGlobe` `content/phase6Rides.ts:262-337` + `rot` `:256-260` | 76 + 5 | Outer ring turns about the vertical, middle ring tumbles at 2×, pod with 8 seats spins at 3×; crown star blinks. `:274-336` |
| (any other id) | 2 × 2 in previews | by tag | `drawGenericRide` `rides.ts:418-468` | 51 | Star on top turns. `:453-463` |

Every ride also gets the two gate marks: `gateMarks` `rides.ts:80-99` (20 lines), `drawGate` `rides.ts:101-109` (9),
`withGates` `rides.ts:111-117` (7). The dispatcher is `drawRideArt` `rides.ts:471-496` (26).

### Every stall

Every stall covers 1 tile (`StallDef` has no width or depth, `src/data/catalog/types.ts:72-84`). No stall animates: the
renderer always asks for frame 0 (`src/render/renderer.ts:597`, `content/stalls.ts:7`).

| id | Kind | Footprint | Draw function | Lines | What it shows |
|---|---|---|---|---|---|
| `snack_shack` | food | 1 × 1 | generic `drawStallArt` `stalls.ts:152-183` | 32 (+ `awning` 23, `serviceFront` 9, `icon` 78) | Cream booth, red pyramid roof with a stripe, burger sign disc |
| `fizz_stand` | drink | 1 × 1 | generic, same function | same | Blue roof, cup sign |
| `restrooms` | toilet | 1 × 1 | generic, same function | same | Cobalt roof, doors on both visible faces, two-figure sign |
| `pizza_slice` | food | 1 × 1 | `drawPizzaSlice` `content/stalls.ts:78-95` | 18 | Booth with a giant slice standing on the roof |
| `ice_cream_cart` | food | 1 × 1 | `drawIceCreamCart` `content/stalls.ts:99-138` | 40 | Cart on two wheels, parasol, big cone |
| `cocoa_hut` | drink | 1 × 1 | `drawCocoaHut` `content/stalls.ts:142-176` | 35 | Log cabin, snowy roof, chimney with steam, mug sign |
| `balloon_stand` | souvenir | 1 × 1 | `drawBalloonStand` `content/stalls.ts:189-205` | 17 | Low booth, 6 balloons on strings (`BALLOONS` `:180-187`) |
| `umbrella_stand` | souvenir | 1 × 1 | `drawUmbrellaStand` `content/stalls.ts:209-254` | 46 | Booth under one giant umbrella, rack of closed umbrellas, raindrops |
| `info_kiosk` | info | 1 × 1 | `drawInfoKiosk` `content/stalls.ts:258-307` | 50 | Round kiosk with a dome, map board, big "i" sign |
| `first_aid` | facility | 1 × 1 | `drawFirstAid` `content/stalls.ts:317-347` + `greenCross` `:311-315` | 31 + 5 | White box, green band, white cross on a green sign |
| `cash_machine` | facility | 1 × 1 | `drawCashMachine` `content/stalls.ts:351-382` | 32 | Slim dark machine, screen and keys, coin sign |
| `noodle_bar` | food | 1 × 1 | `drawNoodleBar` `content/stalls.ts:386-427` | 42 | Booth, two lanterns, bowl with chopsticks and steam |
| `smoothie_bar` | drink | 1 × 1 | `drawSmoothieBar` `content/stalls.ts:431-455` | 25 | Booth, fruit basket, layered cup |
| `photo_booth` | souvenir | 1 × 1 | `drawPhotoBooth` `content/stalls.ts:459-494` | 36 | Tall violet cabin, curtain, photo strip, camera sign |

Shared stall pieces in `content/stalls.ts`: `shadow` `:17-19`, `backService` `:21-23`, `awning` `:26-48`, `counter`
`:51-59`, `body` `:62-65`, `booth` `:68-74`.

### `props.ts`

| Thing | Function | Lines | Notes |
|---|---|---|---|
| Guest | `drawGuestArt` `props.ts:140-210` (71), `drawBalloon` `:55-81` (27), `drawUmbrella` `:84-130` (47) | 145 | Ground ring or shadow, two legs, torso, arms, head, hair, 2 eye dots on front facings, optional balloon and umbrella |
| Fence segment | `drawFenceArt` `props.ts:233-249` | 17 | 2 rails with a dark under-edge, 3 posts 14 px high |
| Park entrance arch | `drawEntranceArt` `props.ts:261-323` | 63 | Part 0: back pillar, two-colour beam, flame and snow emblems, flag pole. Part 1: front pillar |
| Ghost badge | `drawGhostIcon` `props.ts:328-355` | 28 | Blue check or vermillion cross, in device pixels |

### What is not drawn at all today

A designer comparing with the drafts should know these do not exist in the game code:

- No outline as a rule. `poly3` can stroke (`shapes.ts:34-38`), but only 4 calls in this area use it (map board
  `content/stalls.ts:268`, photo strips `:478-479`, mill sails `content/phase6Rides.ts:226`). A few ground rings and
  the generic stall's sign disc also carry a stroke (`rides.ts:126`, `content/phase6Rides.ts:130`, `:138`, `:196`,
  `stalls.ts:76-81`).
- No light-and-dark shading model. Each face gets a colour the caller picks by hand.
- No shadow under a ride. Stalls have one flat see-through diamond inside their own tile (`stalls.ts:163`,
  `content/stalls.ts:17-19`).
- No entrance hut, turnstile, or fence round a ride. Three rides have a rail or fence baked into their own art
  (bumper cars `content/gentleRides.ts:25-33`, `:67-69`; haunted manor `:427-443`; kiddie cars
  `content/phase6Rides.ts:175-182`).
- No rider bodies. A rider is a head (plus two legs on the drop tower, `content/thrillRides.ts:287-291`).
- No stall staff, no moving parts on stalls.

---

## How it draws

### Data flow for one ride

```
sim: ride.cycle {phase, ticks}, ride.riders[]          src/sim/rides/types.ts:48-50
  └─ rideFrameFor(ride, def)  → frame number            src/render/anim.ts:82-88
       angle 0–31 | swing 0–4 | occupancy 0–4           src/render/anim.ts:57-60
renderer.collectRides                                   src/render/renderer.ts:423-464
  ├─ vrot = (ride.rotation + view rotation) mod 4       :439
  ├─ anchor ax, ay = top corner of the footprint's view-origin tile at base height   :442-449
  ├─ bank.ride(defId, w, d, vrot, frame, bucket)        :454 → src/render/sprites/bank.ts:97-111
  │     cache miss → buildSprite(rideArtBounds(...), bucket, paint)   src/render/canvas.ts:56-72
  │        paint = drawRideArt(ctx, defId, w, d, {rotation, angle/32, swing/4, occupancy})   bank.ts:106
  │           └─ withGates(...) → back gate marks, the ride function, front gate marks       rides.ts:471-496
  └─ one draw-list entry per 32-px column of the sprite :455-462
renderer.drawList → blitColumn(sprite, ...)             src/render/renderer.ts:587-593, 350-363
```

A stall is simpler: `collectStalls` (`renderer.ts:466-478`) pushes one entry at the tile's top corner;
`bank.stall(defId, vrot, 0, bucket)` (`bank.ts:113-121`) builds it with `drawStallArt(ctx, defId, rotation)`; `blit`
draws the whole image (`renderer.ts:595-598`, `:338-345`).

### Coordinates inside an art function

- Local position `(u, v)` in tiles from the anchor tile's top corner; height `h` in world pixels above the base;
  8 px = 1 m. Screen `x = (u − v) × 32`, `y = (u + v) × 16 − h` (`shapes.ts:3-18`).
- The anchor is at `(0, 0)` of the context. `buildSprite` sets one transform (scale and offset) and then the art
  draws in world pixels (`canvas.ts:60-63`).
- A ride function gets `ex`, `ey`: the footprint extent as seen in the view (swapped for odd rotations,
  `src/sim/footprint.ts:17-19`, `rides.ts:472`).
- Art must not use canvas transforms, randomness, or time (`content/kit.ts:4`; tests check `transforms === 0`).

### The shared helper functions

`src/render/sprites/shapes.ts` (201 lines, used by rides, stalls, props, and other sprite files):

| Function | Line | What it does |
|---|---|---|
| `sx`, `sy` | 12, 16 | Projection |
| `poly3` | 21 | Filled polygon from 3D points, optional stroke |
| `line3` | 42 | Line between two 3D points, round caps |
| `flat` | 53 | Flat quad at one height |
| `box` | 58 | Box: left face, right face, top, three colours given by the caller |
| `ellipseRadii`, `disc` | 76, 81 | Ground circle as a screen ellipse (radius × 32 × √2 wide, × 16 × √2 high) |
| `cylinder` | 97 | One side colour, one top colour |
| `circlePt` | 117 | Point on a ground circle |
| `nearness` | 122 | `u + v`, the sort value for back-to-front order |
| `cone` | 127 | Striped cone roof, segments sorted back to front |
| `pyramid` | 159 | Four-sided roof: back, left, right colours |
| `head` | 170 | Round head: skin circle and a hair cap |
| `rrect` | 185 | Rounded rectangle path |
| `SKIN_TONES`, `HAIR_COLOURS` | 200-201 | 4 each |

`src/render/sprites/content/kit.ts` (116 lines, used by the 14 content rides and 11 content stalls):

| Function | Line | What it does |
|---|---|---|
| `Item`, `drawSorted` | 12, 17 | List of `{n, draw}` sorted by `n` (nearness), drawn back to front |
| `seatsFilled` | 23 | Seats to fill for an occupancy level |
| `rider` | 29 | A rider head at a screen point |
| `platform` | 35 | Low box over the whole footprint |
| `dot`, `dot3` | 40, 48 | Filled circle in screen or 3D position |
| `star` | 53 | n-pointed star, optional spin |
| `poly2`, `line2`, `oval` | 69, 86, 97 | Screen-space polygon, line, ellipse |
| `axes` | 108 | Long axis and cross axis of a footprint |
| `wave` | 114 | Smooth 0 → 1 → 0 over one turn |

Duplicates that a rewrite should merge:

- `seatsFilled`, `rider`, `platform` exist twice: `rides.ts:56-69` and `content/kit.ts:23-37`.
- `Frame`, `frameOf`, `at` exist twice: `content/thrillRides.ts:12-28` and `content/phase6Rides.ts:14-30`.
- `awning` and the counter exist twice: `stalls.ts:38-70` and `content/stalls.ts:26-59`.

How often each primitive is called in the ride, stall and props files (my `grep` count of call sites):

| File | `poly3` | `poly2` | `line3` | `line2` | `box` | `cylinder` | `cone` | `disc` | `dot`/`dot3` | `star` | `rider` |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `rides.ts` | 2 | 0 | 10 | 0 | 2 | 12 | 3 | 2 | 0 | 0 | 6 |
| `stalls.ts` | 8 | 0 | 1 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 0 |
| `content/gentleRides.ts` | 11 | 11 | 20 | 0 | 3 | 18 | 3 | 0 | 9 | 3 | 4 |
| `content/thrillRides.ts` | 3 | 0 | 11 | 0 | 6 | 5 | 0 | 0 | 6 | 5 | 5 |
| `content/phase6Rides.ts` | 5 | 1 | 12 | 2 | 1 | 7 | 2 | 4 | 13 | 2 | 4 |
| `content/stalls.ts` | 20 | 11 | 6 | 20 | 21 | 3 | 3 | 0 | 23 | 2 | 0 |
| `props.ts` | 2 | 0 | 4 | 0 | 4 | 1 | 0 | 0 | 0 | 0 | 0 |

Raw context calls are also used: `ctx.arc`, `ctx.ellipse`, `ctx.fillRect`, `quadraticCurveTo`, `rrect` (for example
the carousel horse `rides.ts:142-154`, the ghost `content/gentleRides.ts:413-422`, the guest `props.ts:168-206`).

### The pattern of a ride function

1. `platform(...)`: a 3 px high box over the footprint, inset 0.05 tile (`content/kit.ts:35-37`).
2. Static parts behind the moving parts.
3. Moving parts as a list of `{n, draw}` items, sorted by nearness, often split into "behind the centre" and "in
   front of the centre" around a central column (`rides.ts:314-349`, `content/thrillRides.ts:213-218`).
4. Static parts in front (roof, near legs, near rails).

There is no layer structure in the output: one call paints the whole ride into one image.

### Entrances and exits

- The entrance is on the front-edge tile `floor((w − 1) / 2)`; the exit is on the matching back-edge tile
  (`src/data/catalog/flatRides.ts:52-55`, `src/sim/footprint.ts:53-68`).
- Each is a "gate mark": two posts 22 px high and 0.6 tile apart, 3 px wide, with a 5 px lintel line, 0.04 tile inside
  the tile edge (`rides.ts:80-109`).
- Entrance colour is the ride tag's main colour (thrill `#f0643a`, family `#4fbf63`, chill `#3fa7d6`,
  `src/render/palette.ts:115-119`). Exit colour is grey `#8a96a3` (`rides.ts:98`).
- `withGates` draws a mark before the ride when it is farther than the footprint centre, after the ride when nearer
  (`rides.ts:111-117`).
- Which side by sprite rotation (`frontDir = (rotation + 2) mod 4`, `footprint.ts:12-14`):

  | Sprite rotation | Entrance side | Exit side |
  |---|---|---|
  | 0 | S (front left, visible) | N (back, mostly hidden) |
  | 1 | W (back, mostly hidden) | E (front right, visible) |
  | 2 | N (back, mostly hidden) | S (front left, visible) |
  | 3 | E (front right, visible) | W (back, mostly hidden) |

- The queue path and exit path are terrain. The path layer joins a queue tile to the entrance gate tile and a footpath
  to the exit gate tile or a stall's service side (`src/render/paths.ts:37-93`).

### How rotation variants are made

No ride is drawn four times by hand. One function serves all 4 rotations and reads `st.rotation`, `ex`, `ey`.

| Rides | What changes with rotation, apart from the gate marks |
|---|---|
| `carousel`, `swing_tower`, `teacup_twirl`, `bumper_cars`, `rocket_rounds`, `spiral_slide`, `observation_tower`, `drop_tower`, `kiddie_cars`, `merry_mill`, `gyro_globe` (11) | Nothing. The body is the same in all 4 rotations. |
| `big_wheel` | Wheel plane along u for even rotations, along v for odd (`rides.ts:192-196`). |
| `thunder_disc`, `flip_arm` | Long axis by rotation parity (`content/kit.ts:108-111`, `content/thrillRides.ts:21-24`). |
| `pendulum_ship` (3 × 5), `magic_carpet` (4 × 3) | Long axis follows the longer side of the footprint (`content/kit.ts:109`); the carpet also picks its far end (`content/phase6Rides.ts:71`). |
| `mirror_maze`, `haunted_manor` | Door (and, for the manor, the path and fence gap) on the E face at rotation 3, else on the S face, even when the real entrance is at the back (`content/gentleRides.ts:338`, `:369`). |

So 11 rides have 1 body and 7 rides have 2. All 18 have 4 gate layouts, and each rotation has its own cache key.

Stalls: the service side faces `rotation` (0 = N, 1 = E, 2 = S, 3 = W, `stalls.ts:3-4`). Only the S face (front
left) and the E face (front right) are visible (`shapes.ts:57`). Rotations 2 and 1 show the counter, window and awning
in front. Rotations 0 and 3 are "back service": the awning is drawn first so only its tip shows behind the body, and
there is no counter (`stalls.ts:164-176`, `content/stalls.ts:21-23`, `:68-74`). Some stalls add their own rule: first
aid and restrooms show doors on both visible faces when facing back (`content/stalls.ts:326-329`, `stalls.ts:169-172`);
the cash machine shows a blank body (`content/stalls.ts:355-366`); the ice cream cart turns its wheels
(`content/stalls.ts:102-110`); the info kiosk and umbrella stand move the board or the rack (`content/stalls.ts:261`,
`:214-215`).

### How guests on a ride are shown

- A guest in state `riding` is not drawn as a guest and cannot get the selection ring (`renderer.ts:522`, `:797`).
- The ride sprite shows riders from the occupancy level in the frame: 0 empty, 1–3 partly full, 4 full
  (`anim.ts:51-55`).
- `seatsFilled(seats, occupancy) = max(1, round(seats × occupancy / 4))` (`content/kit.ts:23-26`).
- A rider is one head: a circle of radius 2.3 world px with a hair cap. Skin and hair come from a hash of the seat
  index, not from the guest (`content/kit.ts:29-32`, `shapes.ts:170-179`). Shirt colours never show.
- Seats drawn are fewer than the catalog capacity on most rides:

  | Ride | Seats drawn | Capacity | Where |
  |---|---|---|---|
  | `carousel` | 8 horses | 16 | `rides.ts:127-129` |
  | `big_wheel` | 8 gondolas, 1 head each | 24 | `rides.ts:254-268` |
  | `swing_tower` | 10 | 20 | `rides.ts:287-289` |
  | `teacup_twirl` | 4 cups, 2 heads each | 18 | `rides.ts:365-393` |
  | `bumper_cars` | 6 cars | 12 | `content/gentleRides.ts:35-36` |
  | `rocket_rounds` | 6 | 16 | `content/gentleRides.ts:133-134` |
  | `spiral_slide` | 4 on mats | 4 | `content/gentleRides.ts:220` |
  | `observation_tower` | 8 behind glass | 20 | `content/gentleRides.ts:269-280` |
  | `mirror_maze`, `haunted_manor` | 0 (walk-through) | 15, 20 | `content/gentleRides.ts:5` |
  | `pendulum_ship` | 12 | 24 | `content/thrillRides.ts:117-130` |
  | `thunder_disc` | 12 | 24 | `content/thrillRides.ts:196-211` |
  | `drop_tower` | 12, with legs | 12 | `content/thrillRides.ts:285-313` |
  | `flip_arm` | 8 | 16 | `content/thrillRides.ts:380-384` |
  | `magic_carpet` | 10 | 20 | `content/phase6Rides.ts:94-111` |
  | `kiddie_cars` | 4 cars, 1 head each | 12 | `content/phase6Rides.ts:141`, `:159` |
  | `merry_mill` | 4 gondolas, 2 heads each | 16 | `content/phase6Rides.ts:217-242` |
  | `gyro_globe` | 8 | 8 | `content/phase6Rides.ts:313-329` |

- Queueing guests are ordinary guest sprites. The renderer places them along the queue tiles, 4 per tile from the
  entrance outward (`renderer.ts:481-502`, `src/render/queue.ts:65-97`).

### Fences and the park entrance

- The only fence sprite is the park fence: one segment on every edge between an owned tile and an unowned tile,
  except the outer edge of the entrance (`src/render/fence.ts:37-56`). `drawFenceArt(ctx, dir)` draws one edge
  (`props.ts:233-249`); the bank caches 4 directions per bucket (`bank.ts:190-197`). It sorts at the edge midpoint
  (`fence.ts:62-76`, `renderer.ts:394-406`).
- The park entrance arch is two sprites so guests can walk between them: part 0 sorts 0.4 of a tile behind the tile
  centre, part 1 sorts 0.4 in front (`renderer.ts:408-421`, `props.ts:261-323`). Pillars are 0.2 tile square and 50 px high with 3
  bands; the beam is at 40–56 px, warm on one half and cool on the other; emblem discs of radius 8 sit at 66 px; the
  flag pole reaches 80 px.

### Guests (`props.ts`)

- Drawn round the feet at `(0, 0)`, about 10 × 16 world px (`props.ts:14-17`).
- Frame bits: shirt colour (12 shirts or 9 temperament tints), walk (0 stand, 1 and 2 steps, 3 sit), look (4 skin
  and hair pairs), tinted, balloon, umbrella (`bank.ts:50-53`, `:136-153`). 4 facings; front facings (E, S) show two
  eye dots, back facings show hair only (`props.ts:197-206`).
- A walking step lifts one leg by 1.5 px (`props.ts:166-167`, `:177-178`). Sitting uses `ctx.translate(0, 1.5)`
  (`props.ts:171`), the only transform in this area.

### Card pictures

`drawPreview(ctx, defId, w, h)` (`renderer.ts:1157-1198`) does not use the sprite bank. It scales the context by a
free factor `k` to fit the card box, paints flat grass diamonds, then calls `drawRideArt` (rotation 0, angle 0, empty)
or `drawStallArt` (rotation 2). The card asks for 168 × 120 CSS px times the device pixel ratio, at most 3
(`src/ui/decks/card.ts:82-117`).

### Colour

- Colours are hex literals inside each function. My count: 233 different hex literals across `rides.ts`, `stalls.ts`,
  `content/*.ts` and `props.ts`, plus 54 `shade()` calls that derive more (`src/render/palette.ts:122-132`), plus 13
  different `rgba(...)` see-through colours in 15 places (mirror sheen, steam, door glow, sail cloth, shadows, ceiling
  grid, balloon shine).
- Shared tables are few: `TAG_COLOURS` (`palette.ts:115-119`), `SCHEMES` for the generic stall (`stalls.ts:21-29`),
  `SKIN_TONES`, `HAIR_COLOURS` (`shapes.ts:200-201`), `SHIRT_COLOURS` (`palette.ts:52-65`), `ITEM_COLOURS`
  (`props.ts:20`).
- The rule today is "warm = thrill, cool = chill, green = family" (`rides.ts:3`, `content/gentleRides.ts:3`). The
  design spec asks for "Flat colours, chunky shapes, clear silhouettes. Readable at 0.5× zoom."
  (`docs/superpowers/specs/2026-11-09-thrills-and-chills-design.md:70`).

---

## Sizes and scale

### Ride sprite sizes at zoom 1

`rideArtBounds` (`rides.ts:50-54`): `left = −ey × 32`, `right = ex × 32`, `top = (ex + ey) × 8 − height − 6`,
`bottom = (ex + ey) × 16 + 4`. So width = `(ex + ey) × 32` and height = `(ex + ey) × 8 + height + 10`. `height` is
"highest art point above the footprint centre" from `HEIGHTS` (`rides.ts:32-37`) or the content registry
(`content/index.ts:30-46`). The image adds 2 device px of padding on every side (`canvas.ts:50`, `:57-58`).

| Ride | `height` | Sprite, world px (w × h) | Same in art pixels (÷ 2) |
|---|---|---|---|
| `carousel` | 100 | 192 × 158 | 96 × 79 |
| `big_wheel` | 118 | 192 × 176 | 96 × 88 |
| `swing_tower` | 146 | 192 × 204 | 96 × 102 |
| `teacup_twirl` | 50 | 192 × 108 | 96 × 54 |
| `bumper_cars` | 106 | 256 × 180 | 128 × 90 |
| `rocket_rounds` | 84 | 192 × 142 | 96 × 71 |
| `spiral_slide` | 114 | 128 × 156 | 64 × 78 |
| `observation_tower` | 200 | 128 × 242 | 64 × 121 |
| `mirror_maze` | 82 | 192 × 140 | 96 × 70 |
| `haunted_manor` | 116 | 256 × 190 | 128 × 95 |
| `pendulum_ship` | 142 | 256 × 216 | 128 × 108 |
| `thunder_disc` | 106 | 256 × 180 | 128 × 90 |
| `drop_tower` | 208 | 128 × 250 | 64 × 125 |
| `flip_arm` | 136 | 192 × 194 | 96 × 97 |
| `magic_carpet` | 132 | 224 × 198 | 112 × 99 |
| `kiddie_cars` | 78 | 192 × 136 | 96 × 68 |
| `merry_mill` | 116 | 192 × 174 | 96 × 87 |
| `gyro_globe` | 148 | 192 × 206 | 96 × 103 |
| fallback | `genericHeight` `rides.ts:43-47` | by footprint | |

### Other sizes at zoom 1

| Thing | Size | Where |
|---|---|---|
| Stall sprite | 68 × 88 world px (left −34, right 34, top −50, bottom 38); body 0.64 tile wide, 23 px high; roof apex 38 px; sign centre about 46–52 px up | `stalls.ts:31-33`, `:166`, `:177-182` |
| Guest sprite | 16 × 25 world px; 26 × 45 with a balloon or umbrella; body about 10 × 16 | `props.ts:14-17` |
| Fence segment sprite | 68 × 56 world px | `props.ts:215-217` |
| Entrance arch sprite | 80 × 110 world px | `props.ts:253-255` |
| Rider head | radius 2.3 world px (about 2 art pixels across) | `content/kit.ts:29` |
| Gate mark | 0.6 tile wide, 22 px high, posts 3 px, lintel 5 px | `rides.ts:101-109` |
| Carousel horse | ellipse 12 × 6.8 px, neck 3 × 5 px | `rides.ts:144-146` |
| Wheel gondola | 10 × 8 px rounded box | `rides.ts:264` |
| Platform | 3 px high | `content/kit.ts:35` |
| Line widths | 85 line calls with a literal width; 40 of them are thinner than 2 world px (0.8 to 1.6), which is less than one art pixel | my `grep` over `line3(` and `line2(` |

### Zoom and device pixel ratio

- `scale = camera zoom × canvas pixel ratio`; `bucket = zoomBucket(scale)`: 0.5 below 0.707, 1 below 1.414, else 2
  (`renderer.ts:1059-1060`, `src/render/camera.ts:69-73`).
- Camera zoom is any number from 0.25 to 2 (`camera.ts:6-7`, `:31-37`). One wheel notch or key press multiplies it by
  1.15 (`src/input/camera.ts:13-14`); a pinch gives a free factor (`src/input/controller.ts:280`).
- The pixel ratio is the device's on desktops, at most 2 on phones, 1 at `low` quality (`src/perf/quality.ts:64-77`).
- A sprite is painted at its bucket scale with anti-aliased vector calls, then drawn with `drawImage` stretched by
  `scale / sprite.scale` (`renderer.ts:338-345`). The destination rectangle is rounded to whole device pixels.
  `imageSmoothingEnabled` is set to `true` every frame (`renderer.ts:1071`).
- A ride is drawn as `ex + ey` separate strips, each 32 world px wide (`renderer.ts:350-363`, `:455-462`,
  `src/render/depth.ts:88-109`). The source strip is whole image pixels because `32 × bucket` is 16, 32 or 64.
- Guests turn into coloured dots at camera zoom ≤ 0.5 (0.75 at `low`), but rides, stalls, fence and arch stay sprites
  at every zoom (`renderer.ts:1067`, `:555-559`).

### View rotation

- The art function never sees the map rotation. It gets the view rotation `(ride.rotation + view) mod 4`
  (`renderer.ts:439`, `view.ts:82-84`) and the view extent.
- The anchor is the top corner of the footprint's tile with the smallest view `u` and `v`
  (`renderer.ts:383-390`, `:442-449`), at the height of the ride's map origin tile.
- Stalls: the same rule for the service side (`renderer.ts:476`). Fence: `viewDir(seg.dir, rot)` (`renderer.ts:404`).

### What is cached

- Key: `(def id hash, view rotation, frame, bucket)` as one number (`src/render/spriteCache.ts:46-50`). The bank's
  own cap is 96 MB (`bank.ts:20`); all caches share 64 MB on phones and 192 MB on desktops
  (`src/data/tuning/perf.ts:4`). Least recently used images go first (`spriteCache.ts:212-224`).
- Ride frames: 32 angles × 5 occupancy levels = 160 per rotation per bucket; the swing tower also has 5 swing levels
  (800). Phones and `low` quality use 16 angles × 3 occupancy levels = 48 (`anim.ts:66-75`,
  `renderer.ts:453`, `quality.ts:75`).
- `mirror_maze` and `haunted_manor` draw the same picture at every occupancy level, yet the frame still carries the
  level (`anim.ts:87`), so they cache up to 5 identical images per angle.
- Every frame is the whole ride. Size of one frame at bucket 2 (4 bytes per pixel): carousel 388 × 320 px = 0.50 MB;
  pendulum ship 516 × 436 px = 0.90 MB. 160 frames of the ship are about 140 MB, more than the bank's cap, so the
  cache rebuilds frames while a big ride runs.
- For scale: the same frames at the drafts' resolution (0.5 image px per world px) are 16 times smaller (ship
  132 × 112 px = 59 KB, 160 frames = 9.5 MB).
- Stalls: 1 image per stall, rotation and bucket. Fence: 4 per bucket. Arch: 2 parts per direction per bucket.
- Ghosts (placement preview) are frames 4094 and 4095: the same art at angle 0, washed with a see-through colour by
  `source-atop` (`anim.ts:77-79`, `bank.ts:101-108`, `canvas.ts:64-70`), drawn whole at alpha 0.85
  (`renderer.ts:757-760`, `:775-777`).

### Draft sizes against game sizes

The three rides in the approved draft are larger than the game's rides (draft numbers × 2 to get world pixels):

| Ride | Draft (`pixel3.py`) | Game |
|---|---|---|
| Big wheel | Radius 2.35 tiles along the axis and 94 px up; hub 116 px up; top about 210 px; deck 3.2 × 1.4 tiles; 10 gondolas, 12 spokes (`:502-523`) | Radius 1.2 tiles and 38.4 px; hub 62 px; sprite height value 118 px; 3 × 3 footprint; 8 gondolas, 16 spokes (`rides.ts:197-199`, `:223`, `:254`) |
| Carousel | Base radius 1.62, canopy radius 1.74 tiles, canopy 70–112 px, flag to about 130 px; 8 horses as 9 × 8 pixel stamps (`:454-482`, `:267`) | Turntable radius 1.25, canopy radius 1.4, canopy 56–86 px, flag to 98 px; 8 horses (`rides.ts:125`, `:162`, `:179`) |
| Tower | Base 1.4 × 1.4 tiles, mast to 220 px, flag to about 250 px; riders with 3 × 3 pixel heads and a shirt (`:483-501`) | Observation tower 2 × 2, 200 px; drop tower 2 × 2, 208 px (`content/index.ts:34`, `:39`) |
| Stall | Body 0.8 tile, 26 px high, striped flat awning at 32 px, icon stamp on a pole (`:424-442`) | Body 0.64 tile, 23 px high, pyramid roof to 38 px, sign disc at 52 px (`stalls.ts:166-182`) |
| Guest | 7 × 12 art pixels = 14 × 24 world px (`:256`) | About 10 × 16 world px (`props.ts:14`) |

---

## Animation

### The clock

- All ride motion comes from one number, `st.angle` (0 to 1 = one turn), plus `st.swing` for the swing tower.
- `rideAnimation` (`anim.ts:42-48`): only in phase `running`. `p = ticks / cycleTicks`. The turn count is
  `revolutions × eased(p)`, where `eased` is a trapezoid speed curve with 20 % ramp up and 20 % ramp down
  (`anim.ts:19-33`). Outside `running` the angle is 0, so every ride rests in its loading pose.
- Revolutions per run: carousel 4, big wheel 1, swing tower 6, teacups 3, every other ride 2 (`anim.ts:12-18`). Whole
  numbers, so a ride stops where it started.
- The frame holds `floor(fraction of turn × 32)` (`anim.ts:84-85`). So motion is already stepped: 32 poses per
  turn, 16 on phones.
- No sub-tick blending: the frame uses `ride.cycle.ticks` only (20 ticks per second,
  `src/data/tuning/core.ts:2`).
- Reduced motion does not stop rides: `rideFrameFor` has no such check. The setting stops guest bobbing
  (`renderer.ts:518-519`) and marker bobbing (`src/render/management/layer.ts:450`).

### How fast the picture changes

Average new images per second = revolutions × 32 ÷ run seconds (peak is 1.25 × that):

| Ride | Run (s) | Turns | Average steps per second |
|---|---|---|---|
| `swing_tower` | 25 | 6 | 7.7 |
| `carousel` | 20 | 4 | 6.4 |
| `teacup_twirl` | 20 | 3 | 4.8 |
| `spiral_slide` | 15 | 2 | 4.3 |
| `rocket_rounds`, `drop_tower`, `kiddie_cars` | 20 | 2 | 3.2 |
| `bumper_cars`, `pendulum_ship`, `thunder_disc`, `flip_arm`, `magic_carpet`, `gyro_globe` | 25 | 2 | 2.6 |
| `merry_mill` | 30 | 2 | 2.1 |
| `observation_tower`, `mirror_maze`, `haunted_manor` | 40 | 2 | 1.6 |
| `big_wheel` | 30 | 1 | 1.1 |

### How each motion is computed

| Motion type | Rides | Formula |
|---|---|---|
| Orbit on a ground circle | carousel, swing tower, teacups, rockets, kiddie cars, thunder disc seats | `circlePt(centre, r, 2π × (i / n + angle))` (`shapes.ts:117-119`) |
| Turn in a vertical plane | big wheel (`rides.ts:212-217`), flip arm (`content/thrillRides.ts:340-345`), magic carpet (`content/phase6Rides.ts:45-47`), merry mill (`:211-216`) | Offset along a map axis by `cos` or `sin`, height by the other |
| Pendulum | pendulum ship | `θ = 68° × sin(2π × angle)`; every hull point is rotated about the pivot (`content/thrillRides.ts:44-55`) |
| Up and down | observation tower `wave(angle)` (`content/gentleRides.ts:264`); drop tower `dropProfile(angle)` (`content/thrillRides.ts:245-254`); rockets `sin²(π × angle)` (`content/gentleRides.ts:135`) | |
| Slide along a path | spiral slide riders (`content/gentleRides.ts:222-225`); thunder disc `1.3 × sin(2π × angle)` (`content/thrillRides.ts:188`); bumper cars two sines with different whole frequencies (`content/gentleRides.ts:42-43`) | |
| Three nested turns | gyro globe: 1×, 2×, 3× the angle with 3D vectors (`content/phase6Rides.ts:274-281`) | |
| Blink or flicker | `floor(angle × 8, 16, 20 or 32)` into a parity test or `mix32` hash (`content/gentleRides.ts:59`, `:88`, `:288`, `:379`; `content/thrillRides.ts:280`; `content/phase6Rides.ts:172`, `:335`) | |
| Free 2D rotation of a shape | rocket body along its screen tangent (`content/gentleRides.ts:98-121`, `:141-148`); stars with `spin` (`content/kit.ts:53-66`); flip-arm bench along the arm (`content/thrillRides.ts:357-385`) | |

One existing flaw: the teacups orbit at `angle × 0.5` (`rides.ts:370`), so when the angle wraps from 31/32 to 0 each
cup jumps half a turn. Cups are 4 different colours, so the colours swap places once per turn.

### What does not animate

Stalls, the fence, the entrance arch, ride gate marks, platforms, roofs, towers. Guests have 3 walk frames and a
sitting pose; that is all.

---

## What a pixel-art version must keep

### Function signatures and data

| Contract | Where it is defined | Who depends on it |
|---|---|---|
| `drawRideArt(ctx, defId, w, d, st)` | `rides.ts:471` | `bank.ts:106`, `renderer.ts:1196`, both art tests |
| `RideArtState { rotation, angle 0–1, swing 0–1, occupancy 0–4 }` | `rides.ts:22-30` | `bank.ts:106`, all 18 ride functions |
| `rideArtBounds(defId, w, d, rotation): ArtBounds` | `rides.ts:50-54` | `bank.ts:104`; view culling `renderer.ts:450-452`; ghost badge height `renderer.ts:761`; card fit `renderer.ts:1166`, `:1172`; broken and storm marker height `src/render/management/layer.ts:471` |
| `ArtBounds { left, right, top, bottom }`, exported from `rides.ts` | `rides.ts:15-20` | `canvas.ts:2`, `stalls.ts:10`, `props.ts:7`, `renderer.ts:31` |
| `CONTENT_RIDE_ART[id] = { height, draw(ctx, ex, ey, st) }` | `content/index.ts:15-46` | `rides.ts:52`, `:490-491`; tests spy on `.draw` |
| `drawStallArt(ctx, defId, rotation)`, `stallArtBounds()` | `stalls.ts:152`, `:31-33` | `bank.ts:118`, `renderer.ts:469`, `:778`, `:1168`, `:1195` |
| `CONTENT_STALL_ART[id] = { draw(ctx, rotation) }` | `content/index.ts:22-24`, `:48-50` | `stalls.ts:154-158`; tests spy on `.draw` |
| Frame number: angle 5 bits, swing 3 bits, occupancy 3 bits; ghosts 4094 and 4095 | `anim.ts:57-64`, `:77-79` | `bank.ts:101-102`, `tests/unit/render/anim.test.ts:38-48` |
| `drawGuestArt(ctx, GuestLook)`, `GUEST_BOUNDS`, `GUEST_ITEM_BOUNDS`, `ITEM_COLOURS` | `props.ts:15-41`, `:140` | `bank.ts:142-154`, guest tests |
| `drawFenceArt(ctx, dir)`, `fenceBounds()`, `edgeEnds(dir)` | `props.ts:215-249` | `bank.ts:194` |
| `drawEntranceArt(ctx, part, outerDir)`, `entranceBounds()` | `props.ts:253-323` | `bank.ts:204` |
| `drawGhostIcon(ctx, x, y, valid, r)` | `props.ts:328` | `renderer.ts:764`, `:779`, `:784`, and the scenery, track and show layers |
| `Sprite { image, w, h, ox, oy, scale }` and `buildSprite(bounds, scale, paint, tint)` | `spriteCache.ts:14-21`, `canvas.ts:56-72` | Every blit. `blit` and `blitColumn` accept any `scale` (`renderer.ts:339`, `:351`). |

### Anchors, footprints, bounds

- Ride anchor = the top corner of the footprint's view-origin tile at base height (`rides.ts:4`,
  `renderer.ts:442-449`). Stall anchor = the stall tile's top corner (`stalls.ts:3`, `renderer.ts:473-474`).
  Guest anchor = the feet (`props.ts:14`).
- Footprints are catalog data and game rules (`flatRides.ts:20-38`): cost, collision, gates, saves and many tests
  use `w` and `d`.
- The left and right edges of a ride sprite are the left and right corners of the footprint diamond, with no margin
  (`rides.ts:53`). Art outside is cut off by the sprite canvas. Today's art stays about 3 px inside (platform inset
  0.05 tile).
- A ride is cut into `ex + ey` strips of 32 world px; each strip sorts at the depth of the front-most footprint tile
  under it (`depth.ts:82-109`, `renderer.ts:455-462`). Art may rise above the footprint, but anything that hangs over
  a neighbour tile will sort as if it stood on the footprint.
- The sprite scale must keep `32 × scale` a whole number so strips cut on whole image pixels
  (`renderer.ts:355-356`). 0.5 qualifies.
- The gate marks must stay on the catalog's entrance and exit tiles, because the queue and exit paths join there
  (`footprint.ts:53-68`, `paths.ts:37-48`).
- The stall service side must stay readable on the S and E faces, because the footpath joins on that side
  (`footprint.ts:70-75`).

### Hit areas

There are none on sprites. A click finds the tile under the pointer (`src/render/iso.ts:136-167`), then the ride or
stall on that tile through `map.contentRef` (`src/input/tools.ts:105-112`). The selection outline is the footprint
tiles (`renderer.ts:837-844`). A new silhouette cannot break picking.

### Positions other code assumes

- After Dark bulbs on rides: 4 bulbs at the footprint corners, inset 0.18 tile, 5 px up
  (`src/render/lighting/pass.ts:52-54`, `:288-296`).
- After Dark bulbs on stalls: one at the tile centre 40 px up ("pyramid apex at 38 px"), one on the service face at
  ±0.38 tile, 14 px up (`pass.ts:49-51`, `:279-283`, `:306-308`).
- After Dark bulbs on the arch: pillar caps at 52 px and emblems at 66 px, at 0.1 and 0.9 along the beam
  (`pass.ts:46-48`, `:267-277`, `:305`).
- Broken and storm markers float just above `rideArtBounds().top` (`management/layer.ts:463-471`).

### Behaviour the art must keep

- Same inputs give the same picture; no time, no randomness (`content/kit.ts:4`).
- Angle 0 is the loading pose (`content/thrillRides.ts:3-4`), because a ride that is not running shows angle 0
  (`anim.ts:43`).
- Walk-through rides (`mirror_maze`, `haunted_manor`) look the same at every occupancy level
  (`tests/unit/render/content/art.test.ts:101-108`). The other rides must look different empty and full
  (`art.test.ts:105-107`, `tests/unit/render/content/phase6Art.test.ts:85-90`).
- Riding guests are hidden; the ride shows them (`renderer.ts:522`).
- With the temperament overlay on, Thrill guests get a notched ground ring and others a full ring, so colour is not
  the only signal (`props.ts:132-156`, `bank.ts:149-150`).
- Ghost colours come from the colour-blind safe pair (`palette.ts:10-11`, `bank.ts:23-24`).

### Tests that pin the art

| Test | What it requires |
|---|---|
| `tests/unit/render/content/art.test.ts:41-108` (10 Phase 3 rides) | Each id is in `CONTENT_RIDE_ART`; `drawRideArt` calls `art.draw` once (spy); every ride's call log differs from every other; for 4 rotations × 11 angles × occupancy 0 and 4: no non-finite numbers, **0 transform calls, more than 10 fill calls**, every recorded point inside `rideArtBounds` ± 3 px; same inputs give the same call log; a different angle gives a different log |
| `art.test.ts:111-148` (8 Phase 3 stalls) | In `CONTENT_STALL_ART`; spy on `.draw`; logs differ between stalls and from the 3 Phase 1 stalls; for 4 rotations: 0 transforms, **more than 8 fills**, points inside `stallArtBounds` ± 3; rotation 1 differs from rotation 2 |
| `tests/unit/render/content/phase6Art.test.ts:41-143` | The same for the 4 Phase 6 rides and 3 stalls, plus: occupancy changes the log; at least 2 different logs among the 4 rotations |
| `phase6Art.test.ts:145-173` | Sprite keys are FNV-1a of the id and never collide across all rides and stalls |
| `tests/unit/render/content/recorder.ts:14-119` | The fake context. It records points only from path and rect calls. `drawImage` and `putImageData` record nothing and do not count as fills |
| `tests/unit/render/guestItems.test.ts:38-78` | Guest inside `GUEST_BOUNDS`; balloon and umbrella inside `GUEST_ITEM_BOUNDS`; 0 transforms for walk 0–2; a `fillStyle=` with the item colour appears |
| `tests/unit/a11y/palette.test.ts:45-77` | Ghost badge: fill is the safe colour, check = 1 `moveTo`, cross = 2; full ring = 1 `ellipse` with radius 6.2, notched ring = 6 |
| `tests/unit/render/renderer-rotation.test.ts:60-72` | The same number of `drawImage` calls in all 4 views (every ride strip draws once) |
| `renderer-rotation.test.ts:74-108` | At zoom 1 the stall draw is 50–90 px wide and centred on its anchor ± 3 px |
| `tests/unit/render/anim.test.ts:7-67`, `:110-129` | Frame encoding, occupancy levels, coarse frames |
| `tests/unit/render/safeColours.test.ts:26-43`, `:71-82` | No file under `src/render` may contain 16 listed red or green literals (for example `#ff5c5c`, `#1f6b34`). A new palette file under `src/render` is scanned too |

---

## What makes pixel art hard here

1. **Every shape is an anti-aliased vector path.** `poly3` fills a path (`shapes.ts:21-39`), `line3` strokes with
   round caps (`:42-50`), `disc` and `cylinder` use `ctx.ellipse` (`:81-114`), `head` and `dot` use `ctx.arc`
   (`:170-179`, `content/kit.ts:40-45`). Canvas 2D has no switch that turns anti-aliasing off for paths;
   `imageSmoothingEnabled` only affects `drawImage`. Crisp pixels need a different way to put colour on the grid:
   filled rectangles on whole pixels, or a pixel buffer, or a clean-up step after painting.

2. **Positions are free fractions, not grid steps.** Art uses values such as 0.05 tile, radius 2.3, ellipse 6 × 3.4,
   bob `5 × sin(...)` (`rides.ts:134`, `:144`, `content/kit.ts:29`, `:35`). A tile corner lands on the art-pixel grid
   (32 and 16 are even), but almost nothing else does. Moving parts move in sub-pixel steps.

3. **40 of 85 lines are thinner than one art pixel.** Examples: swing chains 1 px (`rides.ts:300`), balloon strings
   0.8 px (`content/stalls.ts:199`), ceiling grid 1 px (`content/gentleRides.ts:73-74`); the wheel's spokes are a raw
   1.2 px stroke (`rides.ts:221-229`). At 2 world px per art pixel these vanish or turn into grey haze.

4. **Parts rotate to any angle.** The ship hull polygon turns up to ±68° (`content/thrillRides.ts:35`, `:44-55`); the
   flip arm turns 360° (`:340-349`); rockets point along their path (`content/gentleRides.ts:141-148`); gyro rings
   are 28 line segments in 3D (`content/phase6Rides.ts:288-301`); wheel spokes and mill sails turn. A drawn pixel
   stamp cannot turn like that. These parts must stay code-drawn on the pixel grid, or be redesigned as a still
   frame plus small stamps that only move.

5. **Too many frames to draw by hand.** 17 rides × 160 frames + the swing tower's 800 = 3,520 frames per rotation
   state, and 7 rides have 2 body variants, all with 4 gate layouts (`anim.ts:57-60`, `bank.ts:97-111`). Any hand-made
   sheet would have to cut this to a handful of frames per ride and change the frame layout.

6. **Each sprite is scaled by a free factor with smoothing on.** Built at 0.5, 1 or 2, then stretched by
   `scale / sprite.scale`, where `scale = zoom × pixel ratio` and zoom is continuous (`renderer.ts:338-345`,
   `:1059-1071`, `camera.ts:31-37`). With smoothing on, pixel art blurs. With smoothing off, art pixels come out
   uneven unless the factor is a whole number.

7. **Rides are drawn as separate strips.** Each 32 px strip is its own `drawImage` with its own rounded edges
   (`renderer.ts:350-363`). At a factor that is not a whole number, crisp pixels would show a doubled or missing
   pixel column where two strips meet. Smoothing hides this today.

8. **Card pictures bypass the sprite path.** `drawPreview` scales the context by `k = min(box / bounds)`
   (`renderer.ts:1174-1181`). A pixel sprite drawn this way lands on a free fraction of a pixel. The drafts' cards
   show a crop of the scene, not a fitted sprite.

9. **The draft rides are bigger than the footprints.** The draft wheel is 4.7 tiles wide on its axis and about 210 px
   tall; the game's is 2.4 tiles and 118 px on a 3 × 3 footprint (`pixel3.py:502-504`, `rides.ts:197-198`). Bounds
   are tied to the footprint (`rides.ts:53`), heights sit in two tables (`rides.ts:32-37`, `content/index.ts:30-46`),
   and the footprint is a game rule (`flatRides.ts:20-38`).

10. **Riders are about 2 art pixels wide.** Radius 2.3 world px (`content/kit.ts:29`). The draft's riders have 3 × 3
    pixel heads and a shirt (`pixel3.py:493-495`). Seats and gondolas (10 × 8 px, `rides.ts:264`) are too small to
    hold a readable pixel rider without making the ride larger.

11. **No outline, no shading, no shadow to build on.** `box` takes three colours picked by hand (`shapes.ts:58-73`);
    `cylinder` has one side colour (`:97-114`); `cone` has a comment about light but does not shade (`:152-154`). The
    draft gets its look from 2-tone surfaces and an automatic 1-pixel ink outline per layer
    (`pixel3.py:199-218`, `:226-241`). The game paints a ride in one pass with no layers, so an outline added
    afterwards would trace only the outer silhouette, not the inner parts.

12. **Cast shadows have no place to go.** The draft throws ride shadows onto the ground beside the ride
    (`pixel3.py:173-184`, `:455`, `:504`). A ride sprite cannot paint outside its footprint's left and right corners
    (`rides.ts:53`), and a shadow on a neighbour tile must lie under objects on that tile, which a depth-sorted
    sprite cannot do.

13. **Colours are loose.** 233 hex literals, 54 `shade()` calls and 13 see-through fills, written inside the
    functions (see "Colour" above). The draft uses 59 colours in 13 ramps (`pixel3.py:12-26`). See-through fills
    (`content/gentleRides.ts:309-312`, `:405`, `content/stalls.ts:156`, `content/phase6Rides.ts:226`) need a
    pixel-art answer (solid colour or dither).

14. **Rotation is faked for back views.** Doors of the maze and manor move to a visible face
    (`content/gentleRides.ts:338`, `:369`); stalls facing N or W show almost nothing of their service side
    (`stalls.ts:164-176`). Sharper art makes these shortcuts easier to notice.

15. **Tests assume vector calls.** "More than 10 fills", "0 transforms" and "points inside bounds" are measured on a
    fake context that only understands path and rect calls (`recorder.ts:40-99`, `art.test.ts:70-78`,
    `phase6Art.test.ts:71-79`). Art that stamps an image fails the fill count; art built from many `fillRect` calls
    passes.

16. **Light positions are copied from today's shapes.** Stall lantern at 40 px, counter light at ±0.38 tile, ride
    bulbs at the footprint corners (`pass.ts:44-54`). New shapes need new numbers.

17. **Whole-ride frames are large at bucket 2.** 0.5–0.9 MB each, up to 144 MB for one ride's frames
    (see "What is cached"). This is a problem today; it gets much smaller if sprites are built once at the drafts'
    resolution.

---

## Size of the job

### Draw functions a new style must replace or wrap

| Group | Functions | Lines of drawing code |
|---|---|---|
| Ride bodies in `rides.ts` (4 rides + fallback) | 5 | 340 |
| Gate marks and dispatcher in `rides.ts` (`gateMarks`, `drawGate`, `withGates`, `drawRideArt`) + 3 local helpers | 1 art function (`drawGate`) | 73 |
| Ride bodies in `content/gentleRides.ts` (6 rides, with `rocket`, `windowGlow`) | 6 | 419 |
| Ride bodies in `content/thrillRides.ts` (4 rides, with `trackHeight`, `dropProfile`, `frameOf`, `at`) | 4 | 341 |
| Ride bodies in `content/phase6Rides.ts` (4 rides, with `rot`, `frameOf`, `at`) | 4 | 280 |
| Generic stall in `stalls.ts` (`drawStallArt`, `awning`, `serviceFront`, `icon`) | 1 | 142 |
| Stalls in `content/stalls.ts` (11 stalls + 7 shared pieces) | 11 | 426 |
| `props.ts`: guest (3 functions), fence, arch | 3 | 225 |
| `props.ts`: ghost badge (screen overlay, may stay as it is) | (1) | 28 |
| **Total** | **35 art functions** (19 ride bodies, 12 stall bodies, gate mark, guest, fence, arch) | **about 2,270 lines** |

Shared primitives under them: `shapes.ts` 201 lines (15 functions), `content/kit.ts` 116 lines (12 functions). Of
these, 18 put colour on the canvas: `poly3`, `line3`, `flat`, `box`, `disc`, `cylinder`, `cone`, `pyramid`, `head`,
`rrect` and `rider`, `platform`, `dot`, `dot3`, `star`, `poly2`, `line2`, `oval`.
Whole files in this area: `rides.ts` 496, `stalls.ts` 183, `content/gentleRides.ts` 453, `content/thrillRides.ts`
391, `content/phase6Rides.ts` 337, `content/stalls.ts` 508, `content/kit.ts` 116, `content/index.ts` 50, `props.ts`
355: 2,889 lines.

### Three points that change the size of the job

- **The drafts were built from the same three shapes.** The draft's `ibox`, `icyl` and `icone`
  (`pixel3.py:220-241`) take the same inputs as the game's `box`, `cylinder` and `cone` (`shapes.ts:58`, `:97`,
  `:127`), at exactly half size (`pixel3.py:227` uses radius × 22.63 and × 11.31; `shapes.ts:76-78` uses × 45.25 and
  × 22.63). The draft adds: no anti-aliasing, a lit and a dark colour per surface from a ramp, an ink outline per
  layer, and small pixel stamps (horse 9 × 8, gondola 7 × 7, guest 7 × 12, stall icons 5–7 px, `pixel3.py:256-272`).
  So the draft look can come from a pixel version of the 18 drawing primitives plus a restyle of each art function,
  not from hand-drawn sheets. The raw `ctx.arc`, `ctx.ellipse` and `ctx.fillRect` calls inside the art functions
  (about 70 call sites by my count: 22 `arc`, 11 `ellipse`, 37 `fillRect`) would move onto those primitives.
- **One choke point.** Every ride, stall, guest, fence and arch image is made by `buildSprite`
  (`canvas.ts:56-72`) and cached by the bank (`bank.ts:97-121`, `:124-157`, `:190-207`). A step added there (snap to
  a palette, cut soft edges, add an outline) reaches all of them without touching 35 functions. That is the cheapest
  route and the weakest look.
- **The blit already accepts a sprite of any scale.** `blit` and `blitColumn` divide by `sprite.scale`
  (`renderer.ts:339`, `:351`). A ride built once at 0.5 fits the draw list as it is. What stands in the way is the
  smoothing flag and the free zoom factor (obstacles 6 and 7), which belong to the renderer core.

### Tests that must change with the art

4 files: `art.test.ts` (149 lines), `phase6Art.test.ts` (174), `guestItems.test.ts` (78), `a11y/palette.test.ts`
(the ring and badge cases), plus the stall width check in `renderer-rotation.test.ts:105` if the stall sprite grows
past 90 px, and the three light constants in `lighting/pass.ts:44-54`.

---

## Open questions

1. **Ride size.** Should rides grow to the drafts' proportions? The wheel is about twice as large in the draft. The
   choices are: keep footprints and accept smaller rides than the draft; let art overhang neighbour tiles (sorting
   will be wrong for objects standing there); or change catalog footprints, which changes game rules and saves.
2. **Resolution.** Is the target 1 art pixel = 2 world pixels, as in the drafts? At that size a rider is 2 pixels
   wide and a guest is 5 × 8. The draft guest is 7 × 12, which is 1.5 times the game's guest.
3. **Method per ride.** Code-drawn pixels for everything, or a still pixel base with small moving stamps? Which of
   the 8 rides with freely turning parts (ship, flip arm, rockets, gyro, wheel, mill, carpet, disc) may be
   redesigned to move in simpler ways?
4. **Frame count.** Keep 32 angle steps per turn (16 on phones), or pick a count per ride? The swing tower has 800
   frames per rotation today.
5. **Riders.** Should a rider show the real guest's shirt and hair? Today the look comes from the seat index and the
   seats drawn are about half the capacity. Showing real guests would add data to the frame and break the cache key
   layout.
6. **Entrances and exits.** Keep the two-post gate marks, or draw a booth, a turnstile, a sign? The drafts show no
   gate marks on flat rides.
7. **Fences round rides.** The drafts show none either; three rides bake one in. Should every ride have one?
8. **Shadows.** Should rides cast a shadow as in the drafts? That needs a ground pass outside this area.
9. **Back views.** Is it acceptable that stalls facing N or W, and the back entrances of rides, show nothing of the
   service side? Or should back views get their own art?
10. **Stalls.** Should stalls gain motion (steam, a flag, a server)? Today they are always frame 0. Should the three
    Phase 1 stalls get their own shapes instead of the shared booth?
11. **Card pictures.** A fitted sprite at a whole-number scale, or a crop of a small scene as in the drafts?
12. **Tests.** May the Recorder tests be rewritten to check pixels (for example with a real 2D canvas in Node) or
    must the new art keep passing "more than 10 fills, no transforms"?
13. **Night.** The draft's night variant lights windows inside the art. The game adds bulbs in a separate pass at
    fixed positions. Which one owns ride lights?
14. **Teacups.** Fix the half-turn colour swap at the angle wrap (`rides.ts:370`) while redrawing?
15. **Fallback art.** `drawGenericRide` is unreachable for catalog ids. Keep it in the new style or drop it?
