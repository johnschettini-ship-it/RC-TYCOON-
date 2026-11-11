# People and small things: how the game draws today

Area: guests (`src/render/guestPos.ts`, the guest code in `src/render/renderer.ts`, `src/render/sprites/props.ts`,
`src/render/sprites/bank.ts`), staff (`src/render/sprites/staff.ts`), litter and path items
(`src/render/sprites/litter.ts`), `src/render/management/*`, `src/render/a11y/layer.ts`,
`src/render/fields/overlay.ts` and `style.ts`, the mascots (`src/ui/mascots.ts`, `src/ui/scenario/mascotArt.ts`),
and the UI icons (`src/ui/icons.ts`, `src/ui/management/icons.ts`).

All paths are relative to `/home/user/RC-TYCOON-`. Line numbers are from the working tree at commit `e247baa`.
Another agent has uncommitted changes in `src/styles/main.css` and four UI files, so line numbers in `main.css`
can move by a few lines. Everything here was read from the code. Nothing was run.

Terms used below (the same as in `core.md`):

- **World pixel**: one pixel at zoom 1 on a screen with device pixel ratio 1. A tile is 64 × 32 world pixels
  (`src/render/iso.ts:8-10`).
- **Device scale**: `camera zoom × canvas pixel ratio` (`src/render/renderer.ts:1059`). Canvas pixels per world pixel.
- **Bucket**: one of the three scales (0.5, 1, 2) at which sprite images are built and cached
  (`src/render/camera.ts:9`, `:69-73`).
- **Art pixel**: one pixel of the approved drafts. The draft scripts draw a tile as 32 × 16 art pixels
  (`concepts/pixel3.py:78`). The raw draft frames (640 × 400, 195 × 422) are half the size of the approved pictures
  (1280 × 800, 390 × 844). So one art pixel is 2 world pixels.
- **Anchor**: the point of a sprite that sits on the map position. For people it is the point between the feet.
- **Facing**: 0 = north, 1 = east, 2 = south, 3 = west, in map terms. The renderer turns it into a view facing
  before it asks for a sprite.

---

## 1. What this area draws

### 1.1 Inventory

| Group | Things | Count | Where the art is |
|---|---|---|---|
| Guests | One body shape. Variants by parameter: 12 shirt colours, 4 skin-and-hair looks, 4 poses (stand, step 1, step 2, sit), 4 facings, balloon yes/no, umbrella yes/no | 1 shape; up to 3,072 plain sprite variants per bucket | `src/render/sprites/props.ts:140-210` |
| Guests with the temperament overlay | The same body, shirt in one of 9 tint colours, a ring under the feet in place of the shadow (full ring, or notched ring for Thrill) | up to 2,304 more variants per bucket | `props.ts:141-156`, `src/render/sprites/bank.ts:136-153` |
| Guest held items | Balloon, open umbrella | 2 items, 6 colours | `props.ts:55-81`, `:84-130`, colours `:20` |
| Guest far-zoom dots | A 2 × 3 CSS-pixel rectangle per guest, 12 shirt colours + 9 tint colours | 21 colours | `renderer.ts:74-77`, `:124-186` |
| Staff, human | Groundskeeper (straw hat, broom), Mechanic (cap, wrench, bib), Security Guard (peaked cap, badge, belt), Performer without costume (top hat, stripes) | 4 | `src/render/sprites/staff.ts:74-201` |
| Staff, mascot costumes | Frost (yeti), Spark (fire fox), Boo (ghost) | 3 | `staff.ts:206-354` |
| Path items | Bench (4 sides, broken look), bin (4 fill levels, broken look), lamp (broken look) | 3 items, 18 looks | `src/render/sprites/litter.ts:51-154` |
| Ground decals | Litter: cup, wrapper, can, napkin, each mirrored or not. Mess: 2 puddle variants, mirrored or not | 4 + 2 | `litter.ts:159-232` |
| Weather | Full-screen tint for cloudy, rain, storm, cold, hot. Rain streaks. Storm flash | 5 tints, 1 streak pattern | `src/render/management/layer.ts:314-358` |
| Management overlays | Patrol area tiles, ring and arrow on the selected staff member, pin with a spanner (broken ride) or a storm cloud (ride held for a storm), path item ghost | 4 | `layer.ts:371-556` |
| Selection marker | White ring and yellow arrow on the selected guest | 1 | `renderer.ts:793-826` |
| Accessibility overlay | Dashed diamond on the keyboard cursor tile. Diagonal hatch over tiles of an invalid ghost or path line | 2 | `src/render/a11y/layer.ts:76-138` |
| Field overlays | Calm (teal) and Buzz (orange): 3 bands each, a tint and 1, 2, or 4 hatch lines per tile | 6 band styles | `src/render/fields/overlay.ts:109-168`, `style.ts:24-46` |
| Mascots, title | Frost and Spark, full body, on a cool and warm backdrop | 1 picture | `src/ui/mascots.ts:27-209` |
| Mascots, portraits | Frost head, Spark head, happy or sad | 4 faces | `src/ui/scenario/mascotArt.ts:49-134` |
| UI icons, core set | `footpath queue rides stalls demolish finance park menu temperament pause play rotate check cross guests star warning follow` | 18 | `src/ui/icons.ts:13-32` |
| UI icons, management set | `staff research marketing messages pathItems wrench coin flag locate bench bin lamp remove repair paint erase done weather_sunny weather_night weather_cloudy weather_rain weather_storm weather_hot weather_cold` | 24 | `src/ui/management/icons.ts:11-37` |

### 1.2 Ids and codes

- Guest sprite frame (`bank.ts:50-53`): `colour (4 bits) | walk (2) | look (2) | tinted (1) | balloon (bit 512) | umbrella (bit 1024)`.
  - `colour`: index into `SHIRT_COLOURS` (12 values, `src/render/palette.ts:52-65`), or a tint step 0–8 when
    `tinted` is set (`palette.ts:84-103`).
  - `walk`: 0 stand, 1 and 2 steps, 3 sitting (`props.ts:28-29`).
  - `look`: one of 4 fixed skin and hair pairs (`bank.ts:38-43`, colours `src/render/sprites/shapes.ts:200-201`).
- Staff sprite frame (`staff.ts:32-35`): `type (2 bits) | costume (2) | walk (2) | action (2)`.
  Type codes: groundskeeper 0, mechanic 1, security 2, performer 3 (`staff.ts:16`). Costume codes: none 0, frost 1,
  spark 2, boo 3 (`staff.ts:18`). A costume shows only on a performer (`staff.ts:356-363`).
- Path item frame (`litter.ts:27-30`): `item code (2 bits) | side (2) | fill level (2) | broken (bit 64)`.
  Item codes: bench 1, bin 2, lamp 3 (`litter.ts:16-18`).
- Decal frame (`bank.ts:75-79`): litter variants 0–3, mess variants 8–9; the mirror flag uses the rotation slot.
- Draw-list kinds: guest 5 (`renderer.ts:66`), staff 6, path item 7 (`layer.ts:45-46`).

### 1.3 Things that look like this area but are drawn elsewhere

- Riders on flat rides and in coaster cars are small heads and shirts drawn inside the ride and car art
  (`src/render/sprites/rides.ts:63`, `src/render/sprites/content/kit.ts:31`, `src/render/track/layer.ts:912-916`).
  A guest in the `riding` state is not drawn by the guest code (`renderer.ts:522`).
- The fence, the entrance arch (with a flame emblem and a snow-star emblem), and the check or cross ghost badge share
  `props.ts` with the guest art (`props.ts:233-355`).
- Six more files build their own inline SVG icons, outside the two icon files: `src/ui/overlays/index.ts:66`,
  `src/ui/scenery/index.ts:20`, `src/ui/shows/index.ts:28`, `src/ui/decks/hand.ts:21`, `src/ui/land/index.ts:53`,
  `src/ui/view/index.ts:22`.
- The lamp's light and bulb glow at night belong to the lighting pass (`src/render/lighting/pass.ts:44-45`, `:257-263`).

---

## 2. How it draws

### 2.1 The common path for every small sprite

1. A collect step computes a map position, turns it into world pixels through the frame's view table, and pushes
   one entry into the renderer's draw list: kind, sprite key, anchor, depth.
2. The renderer sorts the list by depth and draws each entry with one `drawImage` call (`renderer.ts:575-620`).
3. The image comes from the sprite bank. On a cache miss the bank calls the art function once, into a new small
   canvas, at the bucket scale (`bank.ts:124-188`, `src/render/canvas.ts:56-72`).
4. `blit` scales the image by `device scale ÷ bucket scale` and rounds the four edges to whole canvas pixels
   (`renderer.ts:338-345`). Image smoothing is on for the whole frame (`renderer.ts:1071`).

`buildSprite` sets the transform to `scale` and then calls the art function, so every art function draws in world
pixels around its anchor at (0, 0), with normal Canvas 2D anti-aliasing (`canvas.ts:62-63`). The image has a 2-pixel
transparent border on each side (`canvas.ts:50`, `:57-58`).

### 2.2 Guests

Frame order in `draw` (`renderer.ts:1098-1114`): `placeQueues` → `mgmt.collect` (places bench sitters) →
`collectGuests` → far-zoom dots drawn → list sorted → `drawList`.

`collectGuests` (`renderer.ts:508-571`) runs over every guest in `state.guests`, every frame:

| Step | What happens | Line |
|---|---|---|
| Skip | Guests that ride, and guests with no tile | `:522` |
| Position, sitting | Seat on the bench, from `mgmt.sitter`; pose `walk = 3`; faces away from the backrest | `:528-535`, `layer.ts:262-301` |
| Position, queueing | Slot on the ride's queue tiles, 4 per tile, from the gate outward; faces the front of the queue; stands still | `:536-540`, `:481-502`, `src/render/queue.ts:66-97` |
| Position, else | `guestPosition`: from `tile` toward `nextTile` by `(progress + alpha) ÷ 10`, plus a sideways lane offset | `:542`, `src/render/guestPos.ts:115-151` |
| Screen point | `viewPointSX`, `viewPointSY` with the height of the walking surface | `:553-554` |
| Far zoom | If `lod`: cull, pick a colour slot, push a dot, done | `:555-560` |
| Items | Balloon bit if the guest holds one. Umbrella bit if the guest holds one and the weather is rain or storm | `:514-516`, `:561` |
| Cull | By sprite bounds: 10 px sideways (14 with an item), 6 px below, 24 px above (42 with an item) | `:563-564` |
| Look | Shirt colour and look from a hash of the guest id (`mix32`); with the overlay, the tint step from temperament | `:565-567` |
| Push | `KIND_GUEST`, view facing and frame packed in `sub`, depth = view `u + v` of the point, layer `Guest` | `:568-569` |

Drawing: `bank.guest(key, facing, frame, bucket)` then `blit` (`renderer.ts:582-586`).

`bank.guest` (`bank.ts:124-157`):

- Cache hit: return the image.
- Cache miss, and 48 guest sprites were already built in this frame (`GUEST_BUILDS_PER_FRAME`, `bank.ts:82`): return
  the same sprite from another bucket if one is cached, in the order bucket 1, 0.5, 2 (`bank.ts:35`, `:127-134`).
  `blit` scales it to fit. If none is cached, build anyway.
- Build: decode the frame, pick the colours, call `drawGuestArt` into a canvas of `GUEST_BOUNDS` or
  `GUEST_ITEM_BOUNDS` (`bank.ts:136-155`).

`drawGuestArt` (`props.ts:140-210`) draws, in this order: ring or shadow → two legs → two arms → torso → two hands →
head → hair (and two eyes when the guest faces the viewer) → umbrella → balloon. It uses `fillRect`, one rounded
rectangle, arcs, and ellipses. There are no outlines. Shading is one darker shirt tone for the arms
(`shade(g.shirt, 0.8)`, `props.ts:181`).

Level of detail (far zoom):

- On when `camera.zoom ≤ lodZoom` (`renderer.ts:1067`). `lodZoom` is 0.5, or 0.75 with `low` render quality
  (`src/data/tuning/perf.ts:12`, `src/perf/quality.ts:22`, `:73`, `renderer.ts:905`). The test uses the camera zoom,
  not the device scale.
- Each guest is a rectangle of `2 × 3` CSS pixels times the pixel ratio, rounded, with its bottom centre on the
  feet point (`renderer.ts:74-75`, `:181`, `:1112`).
- Batching: a counting sort by colour slot, then one path and one `fill` per colour, so at most 21 fills
  (`renderer.ts:155-185`).
- The dots are drawn before the sorted objects, so rides and fences cover them (`renderer.ts:1111-1114`). They are
  not depth sorted.
- Dots show no items, no facing, and no ring. With the temperament overlay the dot takes the tint colour
  (`renderer.ts:557`).
- Staff stay sprites at far zoom (`layer.ts:231-259` has no far-zoom branch).

How many guests are drawn per frame: every guest that is on the map, not riding, and inside the view. There is no
cap in the guest code. The draw list can hold 2^20 entries (`src/render/depth.ts:74-75`). The performance tests use
2,000 guests on a desktop and 800 on a phone (`tests/e2e/perf.spec.ts:125`, `:140`), and a fixture with 3,000
(`tests/perf/build2-128-3000-guests.tcsave.json`). In sprite mode each guest costs one `drawImage`.

### 2.3 The temperament ring

- Turned on by `tool.overlay === 'temperament'` (`renderer.ts:512`). The mood bar button sets it
  (`src/ui/mood/moodBar.ts:37-39`); the overlay chips set it too (`src/ui/overlays`).
- With the overlay, `colour` is `tintStep(g.temperament)`: 0 for T ≤ 35 (Chill), 8 for T ≥ 65 (Thrill), linear
  between (`palette.ts:90-94`). The colours run from sky blue `#56B4E9` to orange `#E69F00` (`palette.ts:86-87`).
- The bank paints the shirt in the tint colour and passes the same colour as the ring (`bank.ts:139`, `:149-150`).
- The art draws the ring in place of the ground shadow: an ellipse stroke, radii 6.2 × 3, line width 1.6
  (`props.ts:141-156`). Step 8 gets a notched ring: 6 arcs, each 62% of a sixth of the circle (`props.ts:133-151`).
  Full ring or notched ring is the signal that does not rest on colour.
- The ring is part of the cached sprite. Nothing is drawn per frame for it.
- Side effect: item colours come from `colour` (`bank.ts:56-58`, `:140-141`), so a guest's balloon and umbrella
  change colour when the overlay is toggled.

### 2.4 Held items

- Balloon (`props.ts:55-81`): a string 0.5 px wide from the hand to an ellipse 8.2 × 10 px centred 31 px above the
  feet, a knot, and a highlight. Colour `ITEM_COLOURS[(colour + 3) % 6]`.
- Umbrella (`props.ts:84-130`): a shaft 0.8 px wide, a half-ellipse canopy 21 px wide with 4 scallops, darker
  alternate panels, ribs 0.4 px wide, a tip. Colour `ITEM_COLOURS[(colour + 1) % 6]`.
- The item hand is the near hand: screen right for facings east and south, screen left for north and west
  (`props.ts:47-49`). With both items the balloon moves to the other hand (`props.ts:209`).
- Items are frame bits, so they are cached with the guest and cost nothing per frame.

### 2.5 Staff

`collectStaff` (`layer.ts:231-259`): `staffPosition` (same interpolation as guests, but on the path centre line,
`src/render/management/staffPos.ts:19-48`), cull, facing, walk frame, action frame, costume, push `KIND_STAFF`
with layer `Guest`. Drawing: `bank.staff` then `blit` (`layer.ts:303-309`, `bank.ts:160-167`).

`drawStaffArt` (`staff.ts:356-363`) picks one of four body functions:

- `human` (`staff.ts:74-130`): the guest body with a uniform from a table of 4 (`staff.ts:64-69`), shoes, a hat
  (`hat`, `:132-164`), and a tool (`tool`, `:167-201`). One skin colour and one hair colour for all staff
  (`staff.ts:71-72`).
- `frost` (`:206-250`), `spark` (`:253-316`), `boo` (`:319-354`): built from ellipses and curves. Boo has a
  translucent purple glow and floats above the ground.

### 2.6 Litter, mess, and path items

- Decals: `ManagementLayer.drawGround` (`layer.ts:148-181`) scans every tile each frame. For each litter item
  (up to 8 per tile) and each mess item (up to 2) on a visible tile it takes a hashed sub-position
  (`src/render/management/litter.ts:36-60`) and blits a decal sprite. Decals are drawn right after the terrain,
  before all objects, and are not depth sorted (`renderer.ts:1087-1088`).
- Path items: `collectPathItems` (`layer.ts:203-229`) scans every tile each frame, places the item at a tile edge
  with no path join (`src/render/management/pathItemPos.ts:20-48`), and pushes `KIND_PATH_ITEM` with layer `Object`.
- Art: bench, bin, and lamp are built from the shared iso primitives `box`, `cylinder`, `line3`, `poly3`
  (`litter.ts:51-148`, primitives in `src/render/sprites/shapes.ts`). A broken item is greyed and gets a white and
  black crack mark (`litter.ts:32-46`). Litter is four small flat shapes drawn under `ctx.scale(1.6)`
  (`litter.ts:159-213`). Mess is four translucent green ellipses (`litter.ts:216-232`).

### 2.7 Weather, overlays, markers (drawn straight to the canvas, not cached)

| Function | What it draws | Unit | Line |
|---|---|---|---|
| `drawWeather` | One full-screen `fillRect` tint; up to 240 rain streaks in one path and one stroke; a white flash in storms | device px | `layer.ts:314-358` |
| `drawPatrol` | All patrol tiles in one path, violet fill and stroke; white ring and violet arrow on the staff member | device px | `layer.ts:392-444` |
| `drawRideMarkers` + `marker` | A pin (circle and point) with a spanner or a cloud and bolt | device px | `layer.ts:447-532` |
| `drawItemGhost` | The path item sprite at 75% or 40% opacity | sprite | `layer.ts:535-556` |
| `drawSelection`, guest branch | White ellipse ring and a yellow triangle above the head | device px | `renderer.ts:793-826` |
| `drawHatch` | Diagonal white and vermillion lines clipped to the tiles | device px | `a11y/layer.ts:76-118` |
| `drawCursor` | Translucent yellow diamond, dark under-stroke, dashed yellow stroke | device px | `a11y/layer.ts:120-138` |
| fields `drawGround` | Per band: one path of all tiles filled with a tint, one path of hatch lines stroked | device px | `fields/overlay.ts:109-168` |

These are all translucent fills and anti-aliased strokes. Line widths grow with the device scale
(for example `Math.max(1, f.scale)`, `fields/overlay.ts:129`).

### 2.8 Mascots

Frost and Spark are drawn by three separate pieces of code that share no functions:

| Where | Function | What | Used by |
|---|---|---|---|
| Title screen | `drawMascots(ctx, w, h)` (`mascots.ts:172-209`) | Both mascots, full body, 360 × 200 logical px, with two radial gradients, dots and sparks; Spark's tail is a linear gradient (`mascots.ts:96-99`); Frost's arms are rotated ellipses (`:33-42`) | `src/ui/title.ts:42-51` |
| Portraits | `mascotCanvas(who, mood, heightCss, label)` (`mascotArt.ts:109-134`) | A new canvas with one head or both heads; `mood` is `happy` or `sad` (mouth curve, brows, a tear) | mood bar 48 px or 40 px (`src/ui/mood/moodBar.ts:17`, `:58`); award toast 48 px (`src/ui/scenario/awardsUi.ts:39`); tutorial bubble 56 px (`src/ui/scenario/tutorialUi.ts:126`); end screen, both, 96 px (`src/ui/scenario/flow.ts:388`) |
| Map | `frost`, `spark`, `boo` in `staff.ts` | Performer in costume, about 18 × 25 world px | sprite bank |

The three versions use slightly different colours. Example: Spark's orange is `#f27b2a` on the title
(`mascots.ts:92`) and `#f07a3a` in the portrait and on the map (`mascotArt.ts:78`, `staff.ts:283`). The portrait has
no body and no scarf. Boo exists only as a map costume.

The Phase 7 plan adds a fourth use, not built yet: two bottom mascots on screens at least 1,100 px wide, drawn with
the body functions of `mascots.ts`, and a tip bubble with a `mascotCanvas` portrait
(`docs/superpowers/plans/2026-11-10-phase-7-frost-and-spark-interface.md:1272-1285`).

### 2.9 UI icons

`icon(name, className)` (`icons.ts:36-70`) and `mgmtIcon(name, className)` (`management/icons.ts:41-75`) build an
inline `<svg viewBox="0 0 24 24">` from a small record: stroked paths (stroke width 2, round caps and joins),
filled paths, and circles. The colour is `currentColor`, so the icon takes the text colour of its button. The CSS
sets the size: 22 px by default, 14 to 24 px in places, and 40% of the card width (at most 56 px high) on tool cards
(`src/styles/main.css:45`, `:126`, `:148-155`, `:212`, `:319`, `:685-686`). Icons are `aria-hidden`.
`setMgmtIcon` swaps an icon in place for the weather badge and the message toast (`management/icons.ts:78-83`).
About 25 files import one of the two functions. Four core icons have no caller under `src/ui` (`rides`, `stalls`,
`temperament`, `play`); the weather and message icons are chosen through tables
(`src/ui/management/weather.ts:18-21`, `src/ui/management/messages.ts:30-38`).

---

## 3. Sizes and scale

### 3.1 Sizes at zoom 1 (world pixels)

| Thing | Drawn size | Sprite bounds around the anchor | Image at bucket 0.5 / 1 / 2 |
|---|---|---|---|
| Guest body | 10 wide × 19 tall. Head 6.2 across. Legs 2.4 wide. Arms 1.6 wide. Eyes 0.9 × 0.9 | `GUEST_BOUNDS` 16 × 25: left −8, right 8, top −20, bottom 5 (`props.ts:15`) | 12 × 17 / 20 × 29 / 36 × 54 |
| Guest shadow | ellipse 8.4 × 3.8, black at 28% | inside the bounds | |
| Temperament ring | ellipse 12.4 × 6 plus a 1.6 stroke | inside the bounds | |
| Guest with an item | balloon top at −36; umbrella 21 wide, top at −30 | `GUEST_ITEM_BOUNDS` 26 × 45: left −13, right 13, top −40, bottom 5 (`props.ts:17`) | 17 × 27 / 30 × 49 / 56 × 94 |
| Guest far-zoom dot | 2 × 3 CSS px | none | none |
| Staff, human | body 10.4 × 19; hats reach −21 to −24; the broom head reaches 12 to the side | `STAFF_BOUNDS` 24 × 35: left −12, right 12, top −30, bottom 5 (`staff.ts:13`) | 16 × 22 / 28 × 39 / 52 × 74 |
| Frost costume | about 18 × 25 | `STAFF_BOUNDS` | same |
| Spark costume | about 15 × 23 with the tail | `STAFF_BOUNDS` | same |
| Boo costume | body 12 wide; glow 19 × 21; floats 1 to 3.5 above the ground | `STAFF_BOUNDS` | same |
| Bench | seat 0.4 tile long and 0.1 tile deep: about 16 across and 8 down on screen; backrest 11 high | `PATH_ITEM_BOUNDS` 32 × 40 (`litter.ts:11`) | 20 × 24 / 36 × 44 / 68 × 84 |
| Bin | about 8 × 12; heap up to 4 higher | `PATH_ITEM_BOUNDS` | same |
| Lamp | about 6 × 28; head box from 22 to 26 above the base | `PATH_ITEM_BOUNDS` | same |
| Litter item | about 7 × 4 (after the 1.6 scale), shadow 9 wide | `LITTER_BOUNDS` 18 × 13 (`litter.ts:12`) | 13 × 11 / 22 × 17 / 40 × 30 |
| Mess puddle | about 15 × 7 | `MESS_BOUNDS` 22 × 12 (`litter.ts:13`) | 15 × 10 / 26 × 16 / 48 × 28 |

The comment in the source says a guest is "about 10 × 16 px at zoom 1" (`props.ts:14`). The geometry gives 10 × 19:
the hair top is at −19.05 (`props.ts:198`) and the feet are at 0 (`props.ts:177`).

Guest sizes on screen:

| Camera zoom | Pixel ratio | Device scale | Bucket | Guest body in canvas pixels |
|---|---|---|---|---|
| 1 | 1 | 1 | 1 | 10 × 19 |
| 1 | 2 | 2 | 2 | 20 × 38 |
| 2 | 1 | 2 | 2 | 20 × 38 |
| 2 | 2 | 4 | 2, drawn at 2× | 40 × 76 |
| 0.6 | 1 | 0.6 | 0.5, drawn at 1.2× | 6 × 11.4 |
| ≤ 0.5 | any | | | dot, 2 × 3 CSS px |

The same guest in the approved draft: the sprite is 7 × 12 art pixels with a 1-pixel dark outline included
(`concepts/pixel3.py:256`), which is 14 × 24 world pixels. So the draft guest is 40% wider and 26% taller than the
game guest, and 2 of its 7 columns are outline. The draft also has a child sprite of 5 × 7 art pixels
(`pixel3.py:259`); the game has no child guests. The draft balloon is 5 × 9 art pixels (`pixel3.py:260`).

Draft mascots on the map: Frost 11 × 14 art pixels, Spark 13 × 13, Boo 11 × 13 (`pixel3.py:263-265`), that is
22 × 28, 26 × 26, and 22 × 26 world pixels. Draft lamp 5 × 12 and bench 12 × 7 art pixels (`pixel3.py:261-262`).
The draft has no bin, no litter, and no staff.

### 3.2 Zoom

- Camera zoom is any number from 0.25 to 2 (`camera.ts:6-7`). The wheel multiplies it by 1.15 per notch
  (`src/input/camera.ts:13`); a pinch sets any factor (`src/input/controller.ts:280`).
- Sprites exist at three scales only. The bucket is the nearest of 0.5, 1, 2 in log scale to the device scale:
  below 0.707 → 0.5, below 1.414 → 1, else 2 (`camera.ts:69-73`).
- `blit` draws the bucket image scaled by `device scale ÷ bucket scale`, a factor from 0.71 to 1.41 inside the
  bucket range, with smoothing on (`renderer.ts:338-345`, `:1071`). Above device scale 2.83 the bucket-2 image is
  enlarged up to 3× (zoom 2 on a pixel ratio 3 screen).
- Positions use the exact zoom; only the sprite pixels are bucketed.

### 3.3 Device pixel ratio

- The canvas backing store is `CSS size × pixel ratio` (`renderer.ts:912-913`). The ratio is the device's, capped
  at 2 on phones, 1 with `low` quality, and stepped down to 1 by `auto` quality when frames are slow
  (`src/perf/quality.ts:64-76`, `:92-121`). On a desktop it can be a fraction (1.25, 1.5, browser zoom).
- The ratio is folded into the device scale, so a pixel ratio 2 screen at zoom 1 uses the bucket-2 sprites.
- The far-zoom dot is `round(2 × ratio) × round(3 × ratio)` canvas pixels (`renderer.ts:1112`).
- Overlay line widths and marker sizes are in device pixels with a floor, for example
  `Math.max(9, 12 × Math.min(1.6, scale))` for the ride pin radius (`layer.ts:477`).
- Mascot canvases use `min(3, devicePixelRatio)` (`mascotArt.ts:118-123`, `title.ts:44-50`).

### 3.4 View rotation

- Positions: map coordinates go through the frame's view table (`viewPointSX`, `viewPointSY`), so lane offsets,
  queue slots, seats, decal positions, and item positions all turn with the view (`renderer.ts:553-554`,
  `layer.ts:171`, `:227`, `:244-245`).
- Depth: `viewPointDepth`, the `u + v` of the view position (`renderer.ts:569`, `layer.ts:227`, `:257`).
- Facing: `viewDir(facing, rotation)` (`renderer.ts:568`, `layer.ts:256`). The view facing is in the sprite key
  (`bank.ts:61-68`), and the art function gets the view facing.
- Bench side and item side: `viewDir(p.side, rotation)` in the frame (`layer.ts:225`, `:549`).
- What the art does with the facing: two flags only. `front` is true for east and south: eyes and a hair cap; for
  north and west the whole head is hair colour. `side` shifts the eyes 0.9 px left or right (`props.ts:164-165`,
  `:197-206`). The body is the same for all four facings. So a plain guest has 3 different pictures for 4 facings
  (north and west are equal), and they differ by a few pixels of the head.
- Decals do not turn with the view; a hash picks mirrored or not (`management/litter.ts:48`).

### 3.5 What is cached

| Thing | Cached | Key | Line |
|---|---|---|---|
| Guest sprite | yes, LRU | view facing, frame, bucket | `bank.ts:61-63`, `:124-157` |
| Staff sprite | yes | view facing, frame, bucket | `bank.ts:66-68`, `:160-167` |
| Path item sprite | yes | frame (with view side), bucket | `bank.ts:71-73`, `:170-176` |
| Decal sprite | yes | frame, mirror, bucket | `bank.ts:76-78`, `:179-188` |
| Far-zoom dots | no, redrawn each frame from typed arrays that are reused | | `renderer.ts:124-186` |
| Weather, patrol, markers, selection ring, hatch, cursor, field overlays | no, redrawn each frame | | section 2.7 |
| Rain streak positions | 240 fixed random seeds made once | | `layer.ts:107`, `:120-125` |
| Mascot portrait | one canvas per call; the mood bar redraws only when the mood or the size changes | | `moodBar.ts:52-64` |
| Title art | redrawn by `paintArt` | | `title.ts:42-51` |
| Icons | a new SVG element per call | | `icons.ts:36-70` |

The sprite cache is shared with rides and terrain: 96 MB of its own (`bank.ts:20`) inside a shared budget of 64 MB
on phones and 192 MB on desktops (`src/data/tuning/perf.ts:4`, `src/render/spriteCache.ts:67-132`). A plain guest
image is 580 pixels at bucket 1 (2.3 KB) and 1,944 pixels at bucket 2 (7.8 KB).

---

## 4. Animation

The simulation runs 20 ticks per second at speed 1 (`src/data/tuning/core.ts:2`). `alpha` is the fraction of a tick
since the last tick, 0 to 1 (`src/render/types.ts:157-158`).

| What moves | How the motion is computed | Line |
|---|---|---|
| Guest position | `t = (progress + alpha) ÷ 10`, clamped to 0–1; the position is linear from the centre of `tile` to the centre of `nextTile`. 10 ticks per tile, so 2 tiles per second: 3.2 world px across and 1.6 down per tick, about 1.1 and 0.5 per frame at 60 frames per second | `guestPos.ts:11`, `:131-139` |
| Guest lane | A fixed sideways offset of −0.27, −0.09, 0.09, or 0.27 tile, by `lane` | `guestPos.ts:14`, `:143-145` |
| Guest height | The walking surface of the guest's path node; the node changes at the half-way point of a step, so guests rise on ramps and stay level on bridges | `guestPos.ts:94-108` |
| Guest walk frames | `walk = 1 + ((floor((progress + alpha) ÷ 5) + id) & 1)`: frames 1 and 2 swap every 5 ticks (0.25 s at speed 1), 2 frames per tile; the guest id offsets the phase. Standing, queueing, and sitting guests have no frames | `renderer.ts:546-551` |
| What a walk frame changes | One leg is drawn 1.5 px higher and 0.75 px shorter, so one foot lifts 0.75 world px. A balloon sways 0.8 px. Nothing else moves; the body does not bob | `props.ts:166-178`, `:57` |
| Reduced motion | Guests keep frame 0 while walking | `renderer.ts:518-519`, `:548` |
| Staff position | Same formula with the staff type's ticks per tile (12, 10, 10, 14), on the path centre line | `staffPos.ts:19-48`, `layer.ts:53-58` |
| Staff walk frames | Same formula as guests. Not switched off by reduced motion | `layer.ts:249-252` |
| Staff work frames | While not walking: `action = 1 + (((tick >> 3) + id) & 1)`, a swap every 8 ticks (0.4 s). Broom sweeps ±2.5 px, wrench and arms lift 2.5–3 px, mascots lift arms or hop 2 px. Not switched off by reduced motion | `layer.ts:253`, `staff.ts:91`, `:169`, `:188`, `:209`, `:256` |
| Mascot costumes while walking | Frost body 0.8 px up; Spark 0.6 px up; Boo floats at −1, −2, or −1.5 px and its hem waves | `staff.ts:208`, `:256`, `:321`, `:334` |
| Queue | No animation. A guest jumps to the next slot when the queue changes | `renderer.ts:481-502` |
| Bench sitters | No animation. Pose 3 moves the body 1.5 px down with `ctx.translate` | `props.ts:169-175` |
| Bin | 4 fill pictures by `binFill` | `litter.ts:21-25`, `layer.ts:224` |
| Rain | `t = tick + alpha`. Each streak moves `drift × speed` across and `fall × speed` down per tick and wraps at the screen edge. Fall 32 px (rain) or 44 px (storm) per tick, times the pixel ratio. With reduced motion `t = 0` | `layer.ts:328-349` |
| Storm flash | For 3 ticks in a 12-tick beat, when a hash of the beat number is 0 modulo 23. Off with reduced motion | `layer.ts:350-357` |
| Ride pins | `sin(t ÷ 7 + ride id) × 2 × scale` pixels up and down, a period of about 2.2 s. Off with reduced motion | `layer.ts:450`, `:476-479` |
| Mascots in the UI | None. The portrait changes between happy and sad when the mood rule changes | `moodBar.ts:52-64` |
| Icons | None | |

All sprite animation is frame choice: the collect step picks a frame number, and the bank returns the cached image
for it. No sprite is redrawn to animate.

---

## 5. What a pixel-art version must keep

### 5.1 Function signatures and exports that other code calls

| Contract | Who depends on it |
|---|---|
| `drawGuestArt(ctx, look: GuestLook)`; `GuestLook` fields `shirt, skin, hair, facing, walk, ring, ringStep?, balloon?, umbrella?` (`props.ts:22-41`, `:140`) | `bank.ts:142-154`; `tests/unit/render/guestItems.test.ts:17-21`; `tests/unit/a11y/palette.test.ts:68-76` |
| `GUEST_BOUNDS`, `GUEST_ITEM_BOUNDS`, `ITEM_COLOURS` (`props.ts:15-20`) | `bank.ts:142`; cull margins in `renderer.ts:563-564`; `guestItems.test.ts:39-72` |
| `ringNotched(step)`, `RING_NOTCHES = 6` (`props.ts:133-138`) | `palette.test.ts:59-66`, `:74-76` |
| `guestFrame(colour, walk, look, tinted, items)`, `guestSpriteKey(facing, frame, bucket)`, `GUEST_BALLOON = 512`, `GUEST_UMBRELLA = 1024` (`bank.ts:46-63`) | `renderer.ts:561-569`; `tests/unit/render/spriteCache.test.ts:6-17`; `guestItems.test.ts:23-36` |
| `SpriteBank.guest`, `.staff`, `.pathItem`, `.decal` return a `Sprite { image, w, h, ox, oy, scale }` (`bank.ts:124-188`, `spriteCache.ts:14-21`) | `renderer.ts:584`; `layer.ts:170`, `:177`, `:305-307`, `:554` |
| `drawStaffArt(ctx, look)`, `staffFrame`, `decodeStaffFrame`, `STAFF_TYPE_CODE`, `COSTUME_CODE`, `STAFF_BOUNDS` (`staff.ts:13-39`, `:356`) | `bank.ts:160-167`; `layer.ts:254-255`; `tests/unit/render/management/layer.test.ts:41-60` |
| `drawPathItemArt(ctx, code, side, fillLevel, broken)`, `pathItemFrame`, `binFillLevel`, `PATH_ITEM_BOUNDS`, `drawLitterArt(ctx, variant, flip)`, `drawMessArt(ctx, variant, flip)`, `LITTER_BOUNDS`, `MESS_BOUNDS` (`litter.ts:11-30`, `:150`, `:159`, `:216`) | `bank.ts:170-188`; `layer.ts:224-225`; `layer.test.ts:62-82` |
| `guestPosition(map, g, alpha, out, heights?)`, `GuestPos`, `GUEST_WALK_TICKS_PER_TILE = 10`, `LANE_OFFSETS`, `walkerHeights`, `stepHeight`, `nodeSurfaceHeight`, `walkerHeight` (`guestPos.ts`) | `renderer.ts:542`, `:806`; `staffPos.ts:4`; `tests/unit/render/scene.test.ts:157-249`; `tests/unit/render/walkerHeight.test.ts` |
| `queueSlot`, `QUEUE_SLOTS_PER_TILE = 4`, `createQueueWalker` (`queue.ts:10-97`) | `renderer.ts:481-502`; `scene.test.ts:13-77` |
| `staffPosition`, `litterSlot`, `messSlot`, `pathItemPlacement` (`management/staffPos.ts`, `litter.ts`, `pathItemPos.ts`) | `layer.ts`; the lighting pass, which puts the lamp bulb at `pathItemPlacement` and 24 px above the base (`src/render/lighting/pass.ts:28`, `:44-45`, `:257-263`); `tests/unit/render/management/geometry.test.ts` |
| `ManagementLayer(bank, blit)` with `begin(scale, offX, offY, dpr, bucket, view, va?)`, `drawGround`, `collect`, `sitter`, `drawEntry`, `drawWeather`, `drawOverlays`, `strokeColours`; `KIND_STAFF = 6`, `KIND_PATH_ITEM = 7`; `DrawSink` (`layer.ts:45-51`, `:91-563`) | `renderer.ts:347`, `:528`, `:608`, `:852`, `:1087-1088`, `:1108`, `:1115`; `layer.test.ts:34-38` |
| `GUEST_LOD_ZOOM`, `GUEST_LOD_W = 2`, `GUEST_LOD_H = 3` (`renderer.ts:72-75`) | `tests/unit/render/renderer-rotation.test.ts:110-126` |
| `createA11yLayer`, `tileCorners`, `invalidTiles` (`a11y/layer.ts:23`, `:43`, `:140`) | `src/render/worldLayers.ts:24`; a11y tests |
| `createFieldOverlayLayer`, `FIELD_OVERLAY_STYLE`, `bandIndex`, `LEGEND_GROUND` (`fields/overlay.ts:101`, `fields/style.ts:22-51`) | `worldLayers.ts:18`; the legend in `src/ui/overlays/legend.ts`; `tests/unit/fields/overlay.test.ts:48-68`, `:151-205` |
| `SHIRT_COLOURS`, `shirtIndex`, `mix32`, `tintStep`, `tintStepRgb`, `temperamentTint`, `TINT_STEPS = 9` (`palette.ts:52-108`) | `renderer.ts:77`, `:557`, `:566`; coaster riders `track/layer.ts:912`; the legend `ui/overlays/legend.ts:99-101`; `scene.test.ts:251-278` |
| `drawMascots(ctx, w, h)`, `MASCOT_W = 360`, `MASCOT_H = 200` (`mascots.ts:7-8`, `:172`) | `title.ts:20`, `:44-50`; CSS aspect ratio 360 / 200 (`main.css:647`) |
| `mascotCanvas(who, mood, heightCss, label)` returns a canvas with class `tc-mascot`, `role="img"`, and an `aria-label`; types `Mascot`, `Mood` (`mascotArt.ts:6-7`, `:109-134`) | 4 callers (section 2.8); `tests/e2e/scenario.spec.ts:192-195` looks for `canvas[role=img]` with the label `Frost` or `Spark` |
| `icon(name, className)`, `IconName`; `mgmtIcon(name, className)`, `setMgmtIcon(holder, name, className)`, `MgmtIconName` (`icons.ts:34-36`, `management/icons.ts:39-41`, `:78`) | about 25 UI files; the names are typed, so removing a name breaks the build |

### 5.2 Anchors

- Guests and staff: the anchor is the ground point between the feet, at art (0, 0). The shadow or ring is centred
  on it (`props.ts:141-162`, `staff.ts:48-50`).
- Path items: the base centre, at the placement point `pathItemPlacement` gives: 0.14 tile in from an edge, or
  0.16 from the north-west corner at a crossroads (`pathItemPos.ts:17-48`).
- Decals: the ground point of the item (`litter.ts:2-4`).
- The selection arrow sits 22 to 28 world px above the guest anchor and the staff arrow 30 to 36 px
  (`renderer.ts:821-823`, `layer.ts:439-441`). A taller sprite needs these numbers changed.
- The lamp head must stay about 24 world px above the anchor, or the night bulb glow will not sit on it
  (`lighting/pass.ts:44-45`).

### 5.3 Footprints and spacing

- A guest has no footprint. Spacing comes from the lanes (0.18 tile apart, `guestPos.ts:14`), the queue slots
  (0.25 tile apart with a 0.04 tile sideways jitter, `queue.ts:10`, `:59`, `:90-94`), and the bench seats (0.2 tile
  apart, `layer.ts:61`). On screen at zoom 1 two queue neighbours are 8 px apart across and 4 px down.
- A path item stays on its tile. A bench is 0.4 tile long (`litter.ts:66`, `:84`).
- Litter uses 8 cells of a 3 × 3 grid inside the tile; the centre cell is left free (`management/litter.ts:36-50`).

### 5.4 Hit areas

- There is no hit test on sprite shapes. A tap picks by tile: first a building, then the first staff member whose
  `tile` equals the tapped tile, then the first guest (`src/input/tools.ts:104-122`). Changing the sprite size does
  not change what a tap selects.
- Mascot art and the planned bottom mascots must not take pointer events (Phase 7 spec,
  `docs/superpowers/specs/thrills-and-chills/phase-7-frost-and-spark-interface.md:68`).
- Icons sit inside buttons; the button is the hit area.

### 5.5 Behaviour rules that are tested or specified

- Sprite art is deterministic: the same look gives the same calls (`guestItems.test.ts:74-77`).
- A plain guest stays inside `GUEST_BOUNDS`; a guest with items stays 1 px inside `GUEST_ITEM_BOUNDS`; the balloon
  is more than 10 px above the head; the umbrella is at least 8 px wider than the guest; item art uses no
  transforms; the item colour appears as a `fillStyle` (`guestItems.test.ts:39-72`).
- A Thrill ring is 6 separate arcs and a Chill ring is 1 ellipse; the test counts `ellipse` calls with radius 6.2
  (`palette.test.ts:68-76`).
- Guest sprite keys equal `spriteKey('guest', facing, frame, bucket)`; a frame without items is below 512 and any
  frame is below 4,096 (`spriteCache.test.ts:6-17`, `guestItems.test.ts:24-35`).
- At zoom ≤ 0.5 with pixel ratio 1 there is exactly one 2 × 3 rectangle per guest, in more than 1 and fewer than
  `guests` colours, and none at zoom 0.6 (`renderer-rotation.test.ts:110-126`).
- Colour is never the only signal (Phase 6 §4.7): full or notched ring, hatch density on field overlays, hatch on
  invalid ghosts (`palette.ts:1-5`, `fields/style.ts:1-5`, `a11y/layer.ts:1-6`).
- No file under `src/render` may contain the old red and green ghost colours
  (`tests/unit/render/safeColours.test.ts:71-83`).
- Field overlay: one fill and one hatch stroke per band in use (`overlay.test.ts:166`).
- Frame loops do not allocate per object (`renderer.ts:10`, `layer.ts:9`).

---

## 6. What makes pixel art hard here

1. **Zoom is continuous and sprites are resampled with smoothing.** The zoom is any value from 0.25 to 2
   (`camera.ts:6-7`, `src/input/camera.ts:13`, `src/input/controller.ts:280`). A sprite is built at 0.5, 1, or 2 and
   drawn at `device scale ÷ bucket scale` (`renderer.ts:338-345`) with `imageSmoothingEnabled = true`
   (`renderer.ts:1071`). A 7 × 12 pixel guest drawn at 1.15× is blurred, and with smoothing off its pixels have
   uneven sizes.

2. **`blit` rounds each edge on its own.** The destination width is `round(right) − round(left)`
   (`renderer.ts:340-344`). At a scale that is not a whole number, the same sprite is 1 canvas pixel wider or
   narrower from one frame to the next as the guest moves. On vector art this is invisible. On pixel art it flickers.

3. **Guests move by fractions of a pixel.** The position is linear in `progress + alpha` (`guestPos.ts:134-138`),
   about 1.1 px across and 0.5 px down per frame at zoom 1. Lane offsets are ±0.09 and ±0.27 tile
   (`guestPos.ts:14`), which are 2.9, 1.4, 8.6, and 4.3 world px. None of these land on the 2-world-pixel grid of
   the drafts. A design has to say whether people snap to the art grid, to canvas pixels, or not at all.

4. **The art is drawn on no grid.** Guest coordinates are values like −15.2, 3.1, 6.2, 0.6 (`props.ts:177-205`).
   Details are smaller than a pixel at zoom 1: eyes 0.9 px (`props.ts:201-202`), balloon string 0.5 px
   (`props.ts:61`), umbrella ribs 0.4 px (`props.ts:121`). At the draft resolution a game guest is 5 × 9.5 art
   pixels. Nothing in the present shapes can be kept; the people must be designed again as pixel sprites.

5. **The draft guest is bigger than the game guest.** 14 × 24 world px with outline against 10 × 19
   (section 3.1). `GUEST_BOUNDS` is 16 wide and reaches 20 above the feet (`props.ts:15`), so the draft sprite does
   not fit: its top is near −23. The cull margins (`renderer.ts:563-564`), the selection arrow height
   (`renderer.ts:821-823`), and the dense spots all assume the present size. Queue neighbours stand 8 px apart on
   screen (`queue.ts:10`); a 14 px wide outlined sprite overlaps its neighbour by 6 px.

6. **The walk animation is less than one pixel.** One foot lifts 0.75 world px (`props.ts:166-178`). At the draft
   resolution that is 0.4 art pixel, so a pixel-art walk needs new frames with a visible change. The frame slots
   exist (2 walk frames, `renderer.ts:548`; the frame has 2 bits, `bank.ts:50-53`). A 4-frame walk needs a wider
   field, and that moves the `tinted` bit and the item bits that the tests pin
   (`spriteCache.test.ts:9-12`, `guestItems.test.ts:25-31`).

7. **The four facings are nearly one picture.** The art knows only front or back, and an eye shift
   (`props.ts:164-165`). The draft picks front, back, or cap at random and has no walk frames (`pixel3.py:290`).
   True pixel-art people need at least a front and a back view, mirrored for 4 view facings, times the walk frames.
   The design must choose how many.

8. **The variant count is high and colours are computed, not taken from ramps.** Shirts are 12 free hex colours
   (`palette.ts:52-65`); the arm shade is `shade(shirt, 0.8)` (`props.ts:181`); the 9 tint colours are a linear RGB
   blend (`palette.ts:96-103`); skin and hair are 4 fixed pairs (`bank.ts:38-43`). One body in 12 + 9 colours × 4
   looks × 4 poses × 4 item sets × 4 facings × 3 buckets is up to 16,128 cached images (`bank.ts:50-53`). A pixel
   version needs palette-swap of a few base sprites (the draft does this with a colour map, `pixel3.py:242-249`,
   `:286-294`) and a ramp for every shirt colour.

9. **The temperament ring is a thin anti-aliased ellipse with notches.** Radii 6.2 × 3 world px, stroke 1.6
   (`props.ts:141-156`), which is 6 × 3 art pixels. Six notches cannot be read at that size. The rule that Thrill
   must differ by shape, not only by colour, stays (`palette.ts:1-5`). The test counts vector `ellipse` calls
   (`palette.test.ts:74-76`), so it must change with the art. The ring also replaces the shadow, and the shirt
   changes to the tint colour (`bank.ts:139`), which a fixed palette must allow for.

10. **Tests record vector calls.** The guest art tests use a fake context that records path calls and their extents
    (`tests/unit/render/content/recorder.ts:36-95`). Art drawn with `drawImage` from an atlas or with `putImageData`
    records nothing, so the bounds tests pass with no meaning or fail on the `fillStyle` check
    (`guestItems.test.ts:68-69`). The tests need a new form, for example a check of the sprite's pixel data.

11. **Dark outlines need room and a rule for crowds.** The draft adds a 1-art-pixel ink outline (inside the sprite
    rows for people, `pixel3.py:256`; by dilation for buildings, `pixel3.py:213-216`). In the game each person is a
    separate image drawn in depth order (`renderer.ts:575-620`), so every guest carries its own outline, and a
    crowd becomes mostly outline. The image border is 2 canvas pixels (`canvas.ts:50`), enough for a 1-art-pixel
    outline only at bucket 1 and above.

12. **Translucent shadows and tints are off-palette.** The guest shadow is black at 28% (`props.ts:158`), the staff
    shadow at 30% (`staff.ts:49`), mess is green at 85% (`litter.ts:218`), Boo's glow is purple at 22% and 30%
    (`staff.ts:326-327`). Weather is a full-screen alpha fill (`layer.ts:316-325`). The drafts snap every mixed
    colour back to the palette (`pixel3.py:74-76`, `:179-184`). A canvas alpha blend cannot do that.

13. **Overlays are smooth vector lines sized in device pixels.** Rain streaks are 1-device-pixel diagonal lines
    (`layer.ts:337-349`). Patrol tiles, the cursor, hatches, and the Calm and Buzz bands are alpha fills and
    anti-aliased strokes whose width grows with the device scale (`layer.ts:421-425`, `a11y/layer.ts:99-110`,
    `:131-135`, `fields/overlay.ts:129`). They will look like a different style on top of pixel art unless they are
    redrawn on the art grid. The pins are sized in device pixels, not world pixels (`layer.ts:477`).

14. **Small things use transforms and iso primitives.** Litter is drawn under `ctx.scale(1.6)` "so a single item
    still reads at 0.5× zoom" and mirrored with a negative scale (`litter.ts:160-161`, `:217`). The sitting pose uses
    `ctx.translate(0, 1.5)` (`props.ts:171`). Bench, bin, and lamp come from `box` and `cylinder` in tile units
    (`litter.ts:51-148`). At the draft resolution a litter item is about 3 × 2 art pixels and a bin 4 × 6.

15. **The far-zoom dot is fixed at 2 × 3 CSS pixels in free colours** (`renderer.ts:74-77`). Just above the
    threshold, a guest sprite at device scale 0.51 is 5 × 10 canvas pixels, far below the 7 × 12 of the draft at
    its native size. Pixel-art people cannot be shown smaller than their native size without resampling. The design
    must say what a guest is between zoom 0.5 and 1.

16. **The mascots are three vector drawings with gradients, rotation, and free scaling.** Title: gradients and
    rotated ellipses (`mascots.ts:33-42`, `:96-99`, `:179-188`), on a canvas stretched to 100% width
    (`main.css:647`). Portraits: sized by `heightCss` at 40, 48, 56, and 96 px with a backing store of up to 3×
    (`mascotArt.ts:118-125`). The draft uses one sprite each (Frost 11 × 14, Spark 13 × 13 art pixels) shown at 6×
    with `image-rendering: pixelated` (66 × 84 and 78 × 78 CSS px in `canvas/project/DraftDesktop.dc.html`). The
    portrait needs a happy and a sad face (`mascotArt.ts:21-46`). An 11-pixel-wide sprite has 2 eye pixels and 1
    nose pixel, so a sad face needs a larger portrait sprite or a different signal. 40, 48, and 56 px are not all
    whole multiples of one sprite size.

17. **Icons are 42 SVG line drawings at free sizes in the text colour** (`icons.ts:13-32`,
    `management/icons.ts:11-37`, sizes in `main.css:45`, `:126`, `:212`, `:319`, `:685-686`). Pixel icons need fixed
    whole-number sizes and a way to take `currentColor`. Six more files build their own icons (section 1.3).

18. **Every guest is one `drawImage`, up to 2,000 to 3,000 per frame** (section 2.2). The phone budget is a 40 ms
    frame at 800 guests (`src/data/tuning/perf.ts:15-17`). Any per-guest extra work, such as a second pass for
    outlines or a per-call change of the smoothing flag, multiplies by that number.

19. **A zoom change rebuilds people in steps.** At most 48 new guest sprites are built per frame; other guests show
    a sprite from another bucket, scaled (`bank.ts:82`, `:127-134`). With pixel art a stand-in at 0.5× or 2× is a
    visible pop.

---

## 7. Size of the job

Functions that issue drawing calls and that a new art style must replace or wrap:

| Group | Functions | Count | Lines |
|---|---|---|---|
| Guest sprite art | `drawGuestArt`, `drawBalloon`, `drawUmbrella` (`props.ts`) | 3 | 145 |
| Staff sprite art | `human`, `hat`, `tool`, `frost`, `spark`, `boo` (`staff.ts`) | 6 | 270 |
| Path item and decal art | `crack`, `bench`, `bin`, `lamp`, `drawLitterArt`, `drawMessArt` (`litter.ts`) | 6 | 177 |
| Direct canvas drawing | `GuestDots.draw`, guest branch of `drawSelection` (`renderer.ts`); `drawWeather`, `drawPatrol`, `drawRideMarkers`, `marker`, `tileDiamond` (`management/layer.ts`); `drawHatch`, `drawCursor` (`a11y/layer.ts`); `drawGround` (`fields/overlay.ts`) | 10 | 384 |
| Mascots in the UI | `drawFrost`, `drawSpark`, `drawMascots` (`mascots.ts`); `eyes`, `mouth`, `drawFrost`, `drawSpark` (`mascotArt.ts`) | 7 | 261 |
| Icon builders | `icon`, `mgmtIcon`, with 42 icon records | 2 | 117 |
| **Total** | | **34** | **about 1,350** |

Also touched, but not art:

- Dispatchers and builders that stay as wrappers: `drawStaffArt`, `drawPathItemArt`, `mascotCanvas`,
  `SpriteBank.guest`, `.staff`, `.pathItem`, `.decal`, and the small helpers `ellipse`, `shadow`, `eyes` in
  `staff.ts` and `ellipse`, `eye` in the two mascot files. About 130 lines.
- Blit-only code that needs no change if the `Sprite` record is kept: `ManagementLayer.drawGround`, `drawEntry`,
  `drawItemGhost`.
- Collect code that picks frames and bounds: `collectGuests` (64 lines), `collectStaff` (29), `collectPathItems`
  (27), `placeQueues` (22), `placeSitters` (31). It changes only if the frame layout, the bounds, or the spacing
  change.
- Position math (`guestPos.ts` 151 lines, `staffPos.ts`, `pathItemPos.ts`, `management/litter.ts`, `queue.ts`):
  no change unless people snap to a grid.
- Tests that pin the vector art and must be rewritten with it: `tests/unit/render/guestItems.test.ts` (78 lines),
  the ring test in `tests/unit/a11y/palette.test.ts:59-78`, the dot test in
  `tests/unit/render/renderer-rotation.test.ts:110-126`. Staff, path item, and decal art have no art tests; only
  their frame codes are tested (`layer.test.ts`).

Pictures a pixel artist must supply for this area, counted from the present variants: 1 guest body (front and
back, stand, walk frames, sit) with a palette swap; balloon; umbrella; 4 staff uniforms with tools and work poses;
3 mascot costumes with walk and work poses; bench (4 sides, broken); bin (4 fill levels, broken); lamp (broken);
4 litter items; 2 mess puddles; 2 mascot bodies; 4 mascot faces; and, if icons are in scope, 42 icons.

Whole files in the area, for scale: `guestPos.ts` 151, `sprites/staff.ts` 363, `sprites/litter.ts` 232,
`management/` 785 (5 files), `a11y/layer.ts` 151, `fields/` 221 (2 files), `ui/mascots.ts` 209,
`ui/scenario/mascotArt.ts` 134, the two icon files 153. Total 2,399 lines, plus about 200 guest lines in
`props.ts`, about 190 in `renderer.ts`, and about 110 in `bank.ts`.

---

## 8. Open questions

1. **Guest size.** Does the pixel guest take the draft size (7 × 12 art pixels, 14 × 24 world px) or the present
   size (5 × 9.5 art pixels)? The draft size changes the bounds, the cull margins, the marker heights, and how
   crowded queues look (4 guests per tile, 8 px apart).
2. **Grid snapping.** Do people snap to the 2-world-pixel art grid, to canvas pixels, or move smoothly? This
   depends on the zoom rule that the core design picks (whole-number scales only, or free zoom).
3. **Facings and walk frames.** How many views (2 mirrored, or 4) and how many walk frames (2 as now, or 4)? Four
   frames need a new frame layout.
4. **Children.** The draft shows child guests (12% of the crowd, `pixel3.py:681`). The simulation has no children.
   Is a child a look variant only, or left out?
5. **Guest variety.** The draft has a cap variant and 6 hair colours (`pixel3.py:258`, `:284`). The game has 4
   skin-and-hair looks. Keep 4, or add looks (more cached sprites)?
6. **Temperament signal.** What replaces the notched ring at pixel size: a different ring shape, a marker above
   the head, an outline colour? It must not rest on colour alone. Should the shirt still turn to the tint colour?
7. **Balloon colour and the overlay.** Today a balloon changes colour when the temperament overlay is toggled
   (`bank.ts:140`). Keep this, or fix it in the new art?
8. **Between far zoom and zoom 1.** What is a guest at device scale 0.5 to 1: the native sprite at half size, a
   special small sprite, or dots from a higher zoom than 0.5? What colours do the dots take from the palette?
9. **Shadows.** One flat palette colour, a dither pattern, or the present translucent ellipse?
10. **Staff.** The drafts show no staff. Do they follow the guest sprite with a uniform palette and a hat, as now?
    Should staff walk and work frames stop with reduced motion (they do not today, `layer.ts:249-253`)?
11. **Boo.** The draft has a Boo sprite only in the spooky theme (`pixel3.py:265`, `:623`). The game has Boo as a
    performer costume in every park. Keep it?
12. **Mascot art source.** One sprite set for all uses (map costume, portraits, bottom mascots, title), or
    separate drawings at separate sizes? The 11 × 14 map sprite is too small for a happy and a sad face.
13. **Portrait sizes.** The mood bar uses 40 and 48 px, the toast 48, the tutorial 56, the end screen 96. Can these
    change to whole multiples of one portrait sprite?
14. **Title art.** A separate intro screen project is in progress. Does it replace `drawMascots`, so that this
    project leaves `src/ui/mascots.ts` alone except for the planned body exports (plan, task 13)?
15. **Icons.** The approved drafts keep a smooth vector interface around the pixel map. Are the 42 line icons in
    scope at all? Phase 7 says the interface is not pixel art.
16. **Weather and overlays.** The drafts show no rain, no patrol area, no hatches, no Calm or Buzz bands. Do these
    get a pixel look (dither, stepped lines) or stay as smooth vector layers?
17. **Litter and bins.** The drafts show a lamp and a bench but no bin, litter, or mess. Litter must still read at
    zoom 0.5 (`litter.ts:160`). How large may it be?
18. **Riders.** Riders on rides and coaster cars use the same shirt and skin colours but are drawn by the ride and
    track code (section 1.3). Should they match the new guest sprite? That is in the areas of the ride and track maps.
