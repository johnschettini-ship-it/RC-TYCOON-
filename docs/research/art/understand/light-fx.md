# Lighting and effects: how the game draws night, shows, weather and ghosts today

Area: `src/render/lighting/` (pass, overlay, sprites, darkness, legend, project, layer), `src/sim/lighting/` (read
only), `src/render/shows/` (art, fx, layer, timeline, palette, ghost, preview, rng), the weather visuals
(`src/render/management/layer.ts`), and every placement ghost and map overlay (`src/render/renderer.ts`,
`src/render/a11y/layer.ts`, and the `drawOverlay` of the scenery, terrain tool, elevated path, track and show layers).

All paths are relative to `/home/user/RC-TYCOON-`. Line numbers are from commit `e247baa`; the files of this area have
no uncommitted changes. Everything here was read from the code. Nothing was run.

Terms:

- **World pixel**: one pixel at zoom 1 and canvas pixel ratio 1. A tile is 64 × 32 world pixels
  (`src/render/lighting/project.ts:60-67`).
- **Device scale** (`f.scale`): camera zoom × canvas pixel ratio (`src/render/renderer.ts:1059`). Canvas pixels per
  world pixel.
- **Art pixel**: one pixel of the draft pictures. The draft script draws a tile as 32 × 16 art pixels
  (`concepts/pixel3.py:78`), so 1 art pixel = 2 world pixels.
- **Night pass**: the darkening and the light pools. **Bulbs**: the small glows drawn after it.

Two facts about the target, so that the rest can be read against it:

- The two approved drafts show a **day** scene only. They show no night, no show, no rain. The only pixel-art night
  reference is in the unapproved concept script (`concepts/pixel3.py:186-197`, pictures `concepts/out/p3-spooky.png`,
  `p3-starport.png`). There, night is: a dark palette for the base art, lit pixels painted into the sprites
  (`pixel3.py:304-306, 428, 481, 516, 560, 577`), no cast shadows (`pixel3.py:180`), and light pools blended in three
  Bayer-dithered steps and snapped back to the palette (`pixel3.py:188-197`). A lamp pool there is 60 × 30 art pixels
  (`pixel3.py:300`).
- In the approved desktop draft the placement marker is **not pixel art**. It is smooth vector drawing on top of the
  pixel picture: a tile diamond with a 5 px ink (`#1f2340`) outline, a 3 px white dashed line over it, a white fill
  at 45% opacity, a dashed guide curve from the card, and an HTML label "Drop here to build $1,200"
  (`scratchpad/canvas/project/DraftDesktop.dc.html:21-30`). No tinted copy of the ride is shown on the tile.

---

## 1. What this area draws

### 1.1 Where each item sits in the frame

The frame order is fixed in `src/render/renderer.ts:1084-1118`:

| Step | Line | What is drawn | Items of this area |
|---|---|---|---|
| 1 | `1086` | sky, terrain | — |
| 2 | `1088-1090` | ground stage | Calm and Buzz overlays, Light overlay (`drawGround`), ownership tints |
| 3 | `1114` | depth-sorted objects | show site sprites (tower, launcher) |
| 4 | `1115` | weather | weather tint, rain, lightning flash |
| 5 | `1116` | `drawAfterObjects`, layers in registry order | night pass and bulbs (lighting), then beams, fireworks, site lamp (shows) |
| 6 | `1118` | overlays | every ghost, outline, hatch, marker, cursor |

Layer order comes from `src/render/worldLayers.ts:16-25`: fieldOverlay, lighting, elevatedPaths, scenery,
terrainTools, shows, a11y.

Three results of this order that a designer must know:

- Weather is drawn **before** the night pass. At night, rain streaks and the weather tint are darkened with the
  scene.
- The Light, Calm and Buzz overlays are in the ground stage. At night they are darkened too.
- Ghosts and outlines are drawn **after** the night pass. They always have full brightness, day or night.

### 1.2 Night (After Dark)

| Item | Count | Where |
|---|---|---|
| Ambient darkening | 1 colour, white → `rgb(70, 80, 130)` | `src/data/tuning/night.ts:6-7`, `src/render/lighting/darkness.ts:38-44` |
| Light pool sprite | 1 image, 128 × 128, warm radial gradient, 5 stops | `src/render/lighting/sprites.ts:30, 34-49` |
| Bulb sprite | 1 image, 32 × 32, white core with warm halo, 4 stops | `src/render/lighting/sprites.ts:31, 52-65` |
| Light source kinds | 6: Entrance 0, Ride 1, Station 2, Stall 3, Scenery 4, Lamp 5 | `src/sim/lighting/lightMap.ts:41` |
| Light pools per frame | at most 400 | `src/data/tuning/night.ts:24`, `src/render/lighting/pass.ts:190` |
| Bulbs per frame | at most 400 | `src/render/lighting/pass.ts:39, 218` |

Light sources and their radius in tiles (`src/data/tuning/night.ts:11`, `src/sim/lighting/lightMap.ts:7-13`):

| Source | Radius | Bulbs drawn for it (`pass.ts:256-297`) |
|---|---|---|
| Path lamp, not broken | 3 | 1, at the lamp head, 24 px up |
| Scenery with flag L, 1 × 1 (25 of the 85 scenery items have flag L, `src/data/catalog/scenery.ts:33`) | 2 | 1, at 80% of the item height, at least 6 px up |
| Scenery with flag L, larger | 3 | 1, same rule |
| Operating flat ride (one source for the whole footprint) | 2 | 4, at the footprint corners, 5 px up, 0.18 tile inset |
| Operating track ride (one source for the station tiles) | 2 | 4, same rule |
| Open stall | 1 | 2: roof lantern 40 px up, counter light 14 px up on the service face |
| Park entrance | 4 | 4: 2 pillars × (cap 52 px up, emblem 66 px up) |

Sprite art has **no night version**. No file under `src/render/sprites`, `src/render/scenery` or `src/render/track`
reads the darkness or `afterDark`. Lit windows and neon, which the spec names
(`docs/superpowers/specs/thrills-and-chills/phase-4-land-scenery-after-dark.md:367`), do not exist; only the bulbs do.

### 1.3 Light overlay (the map overlay `light`)

3 bands, each a tint and a hatch (`src/render/lighting/legend.ts:29-33`):

| Band | Light value | Tint | Hatch |
|---|---|---|---|
| Dark | 0–95 | `rgba(36, 40, 104, 0.6)` | dense: diagonal lines, 6 × 6 tile, `rgba(200, 210, 255, 0.55)` |
| Lit | 96–191 | `rgba(255, 200, 87, 0.42)` | sparse: one 2 × 2 dot in an 8 × 8 tile, `rgba(120, 72, 0, 0.45)` |
| Bright | 192–255 | `rgba(255, 243, 190, 0.6)` | none |

Hatch tiles: `src/render/lighting/sprites.ts:68-89`. Footpath and queue tiles get a band always; other dry ground
only when it is Lit or Bright (`src/render/lighting/overlay.ts:192-193`).

### 1.4 Shows

| Item | Count | Where |
|---|---|---|
| Show sites | 2: `lightshow_tower` (2 × 2), `fireworks_launcher` (1 × 1) | `src/data/catalog/showSites.ts:5-6` |
| Site sprites | 2 ids × 4 facings × 3 frames (0 normal, 1 valid ghost, 2 invalid ghost) × 3 buckets | `src/render/shows/layer.ts:43-45, 96-104` |
| Lightshow beams | 6 | `src/data/tuning/shows.ts:45` |
| Firework particles | 40–80 per burst, at most 600 per frame | `src/data/tuning/shows.ts:43, 48-49` |
| Show palettes | 7 themes × 6 colours | `src/render/shows/palette.ts:11-19` |
| Effect kinds | beam, lamp-head blaze, rocket with trail, burst flash, particle (streak + head), reduced-motion glow disc, site night lamp | `src/render/shows/fx.ts:116-289`, `src/render/shows/layer.ts:282-295` |
| Placement overlay | viewing tiles tint, dashed radius ring, footprint outline, ghost sprite, check or cross icon | `src/render/shows/layer.ts:177-201, 312-342` |

Tower lens colours in the art are a fixed list of 6 (`src/render/shows/art.ts:21`), the same as the `base` palette.

### 1.5 Weather

Weather states: `sunny`, `cloudy`, `rain`, `storm`, `hot`, `cold` (`src/data/catalog/types.ts:60`). All canvas
weather is one function, `drawWeather` (`src/render/management/layer.ts:314-358`):

| State | Full-screen tint (`316-321`) | Extra |
|---|---|---|
| sunny | none | — |
| cloudy | `rgba(70,80,95,0.10)` | — |
| rain | `rgba(40,55,85,0.18)` | up to 240 streaks, `rgba(190,215,255,0.42)` |
| storm | `rgba(18,22,45,0.34)` | up to 240 streaks, `rgba(200,215,255,0.5)`; white flash `rgba(235,240,255,0.22)` |
| cold | `rgba(180,220,255,0.10)` | — |
| hot | `rgba(255,190,90,0.07)` | — |

Other weather visuals, outside `drawWeather`:

- Guests open umbrellas in rain and storm: a sprite frame bit (`src/render/renderer.ts:514-516, 561`,
  `src/render/sprites/bank.ts:48, 141`). This belongs to the people area.
- A storm-cloud pin floats over a ride held for a storm, and a spanner pin over a broken ride
  (`src/render/management/layer.ts:447-532`).
- The weather badge in the top bar is HTML and SVG (`src/ui/management/weatherBadge.ts`, `weather.ts`), not canvas.
- There is no snow, no puddle, no wet ground, no cloud shadow. The terrain does not change with the weather.

### 1.6 Ghosts and placement overlays

Colours: valid = blue `#0072B2`, invalid = vermillion `#D55E00` (`src/render/palette.ts:10-11`,
`src/data/tuning/a11y.ts:15`). Fills are the same colours at 38% and 42% (`palette.ts:17-18`).

| # | Overlay | What it draws | Where |
|---|---|---|---|
| 1 | Ride ghost | footprint tiles filled and outlined; the ride sprite washed with the colour, at 85% opacity; check or cross icon above | `src/render/renderer.ts:747-766` |
| 2 | Stall ghost | tile outline; service tile with a white dashed outline; washed sprite at 85%; icon | `renderer.ts:767-781` |
| 3 | Path item ghost, part 1 | tile outline and icon. The comment in the code also names track pieces and stations, but only path items reach this branch: `tool.ghost` is set for rides, stalls and path items only (`src/input/controller.ts:527, 538`, `src/input/track/index.ts:132`) | `renderer.ts:782-784` |
| 4 | Path item ghost, part 2 | the real bench, bin or lamp sprite at 75% (valid) or 40% (invalid), no colour wash | `src/render/management/layer.ts:535-556` |
| 5 | Drag line (footpath, queue, demolish, patrol) | tile fills and outlines in a colour per tool | `renderer.ts:662-677, 853-856` |
| 6 | Hover tile, selected tile | yellow or white tile outline | `renderer.ts:859-867` |
| 7 | Selection (guest, ride, stall) | white ellipse and yellow arrow on a guest; white footprint outline on a ride or stall | `renderer.ts:787-846` |
| 8 | Buy Land | tint per ownership state in the ground stage; purchase rectangle in the overlay stage | `renderer.ts:235-241, 680-726` |
| 9 | Track builder | station outline, arrow, icon; piece ghost as 3 lines (2 rails and centre), conflict tiles, dashed drop line, 2 text chips; gate candidates with dashed outlines | `src/render/track/layer.ts:928-1093` |
| 10 | Elevated path ghost | deck quad at the chosen height, outline, guide line to the ground | `src/render/elevated/layer.ts:173-209` |
| 11 | Scenery ghost | tile outlines; washed sprite at 85%; edge highlight line; icon | `src/render/scenery/layer.ts:156-201, 205-242` |
| 12 | Land and water brush | tile outlines on the sloped faces; corner ring; cost chip | `src/render/terrainTools/layer.ts:98-196` |
| 13 | Show site ghost and viewing area | see 1.4 | `src/render/shows/layer.ts:177-201, 312-342` |
| 14 | Invalid hatch | diagonal white and vermillion lines clipped to the footprint | `src/render/a11y/layer.ts:76-118` |
| 15 | Keyboard map cursor | dashed yellow diamond with a dark under-stroke | `src/render/a11y/layer.ts:120-138` |
| 16 | Patrol area, staff ring | violet tile fill, white ellipse, violet arrow | `src/render/management/layer.ts:392-444` |
| 17 | Calm and Buzz overlays | 3 bands, tint at 40%, 55%, 75%, and 1, 2 or 4 hatch lines per tile | `src/render/fields/overlay.ts:109-168`, `src/render/fields/style.ts:24-45` |

The washed sprite ("ghost sprite") exists for flat rides, stalls, scenery and show sites. The wash colours are
`rgba(0, 114, 178, 0.5)` and `rgba(213, 94, 0, 0.55)` (`src/render/sprites/bank.ts:23-24`).

The check or cross icon is one function, `drawGhostIcon` (`src/render/sprites/props.ts:328-355`): a filled circle in
the valid or invalid colour, a white ring, and a white check or cross.

**The hatch for an invalid placement covers only rides, stalls, path items and refused footpath or queue lines.**
`invalidTiles` reads `tool.ghost` and a refused path drag, nothing else (`src/render/a11y/layer.ts:43-62`). Scenery,
show site, track, terrain and elevated path ghosts keep their state in other places
(`src/render/scenery/ghost.ts:32`, `src/render/shows/ghost.ts:22`, `src/render/track/toolState.ts:81-83`,
`tool.brush`), so an invalid one of those has no hatch. There is no hatch for a **valid** placement anywhere.

---

## 2. How it draws

### 2.1 Night pass (`src/render/lighting/pass.ts`)

Entry: `createLightingLayer` (`src/render/lighting/layer.ts:30-47`) → `LightPass.draw` in `drawAfterObjects`
(`layer.ts:40-42`).

1. `darkness = darknessAt(tick + alpha, afterDark)` (`pass.ts:110`). 0 → the pass does nothing (`111-116`).
   The curve: 0 from 07:00 to 19:00, linear to 0.75 from 19:00 to 21:00, 0.75 until 05:00, linear to 0 by 07:00
   (`src/render/lighting/darkness.ts:21-29`).
2. Sources: `lightSources(world)` gives one entry per source with map centre, footprint size, radius, height, kind
   (`src/sim/lighting/lightMap.ts:478-491, 551-622`). It is rebuilt only when a stamp changed (`618-622`).
3. Ambient colour: white moved toward `rgb(70, 80, 130)` by `darkness / 0.75`, rounded to whole numbers
   (`darkness.ts:38-44`).
4. Light canvas: one offscreen canvas of `ceil(width / 4) × ceil(height / 4)` canvas pixels (`pass.ts:35, 121-122,
   140-143`).
5. If anything in the cache key changed (`pass.ts:125-137`: source list or its version, canvas size, scale, offsets,
   rotation, ambient colour, height array), `redraw` runs (`174-207`):
   - fill the light canvas with the ambient colour, `source-over` (`176-179`);
   - switch to `lighter` (add) (`180`);
   - for each source: project its centre to the light canvas (`193-196`); draw the 128 × 128 pool sprite as an
     ellipse of half-width `rx = (radius + 0.5 + footprint / 2) × 32√2 × scale / 4` and half-height `rx / 2`
     (`36, 197-202`); skip it when it is off screen (`201`); stop at 400 (`190`).
6. Draw the light canvas over the whole frame with **`multiply`**, stretched ×4, with **smoothing forced on**
   (`pass.ts:159-162`).
7. Bulbs: switch to `lighter`, alpha `darkness / 0.75` (`164-165`); `drawBulbs` (`229-302`) places 1 to 4 bulbs
   per source by its kind and blits the 32 × 32 bulb sprite at `max(3, 12 × scale)` canvas pixels (`41, 238,
   216-226`). Skipped when the device scale is below 0.35 (`43, 166`).
8. Restore `source-over`, alpha 1 and the old smoothing value (`167-169`).

What the blend does, in numbers:

- An unlit pixel at full night is multiplied by (70, 80, 130) / 255 = (0.27, 0.31, 0.51). Grass `#6dbb4f` becomes
  about `rgb(30, 59, 40)`.
- The pool centre is `rgba(255, 214, 156, 1)` (`sprites.ts:41`). Added to the ambient colour it clips to white, so
  the centre of a pool shows the **day colours unchanged**. Two pools that overlap also clip to white. A lit area is
  never brighter than by day.
- Between centre and edge the multiplier is a smooth warm gradient (`sprites.ts:41-45`).

The pass is flat and in screen space. It does not know which sprite a pixel belongs to, there is no occlusion, and a
pool is an ellipse on the ground plane. A tall ride is lit only where the ground ellipse covers it on screen.

Light and game rules are linked only by the radius. A tile counts as lit when its light value is ≥ 96
(`src/data/tuning/night.ts:8`, `src/sim/lighting/lightMap.ts:431-434`); guests on an unlit path tile at night lose
happiness (`src/sim/lighting/hooks.ts:37-45`). A lamp alone lights tiles up to distance √5 ≈ 2.24
(`src/sim/lighting/stamps.ts:20-27`), while its drawn pool reaches 4 tiles and fades (`sprites.ts:40` says so).

### 2.2 Light overlay (`src/render/lighting/overlay.ts`)

Entry: `drawGround` when `tool.overlay === 'light'` (`layer.ts:37-39`).

- The map is cut into chunks of 16 × 16 tiles (`overlay.ts:33`). Each chunk holds one `Path2D` per band, in world
  pixels, with the view rotation applied (`208-244`).
- Each frame: for each visible chunk, compare band, height and slope per tile with the stored values (`173-206`);
  rebuild the chunk only on a change (`257-260`); join the visible chunk paths into one path per band (`95-126`).
- Draw: set the camera transform on the context (`265`), fill each band path with its tint, then fill it again
  with a `CanvasPattern` made from the hatch tile (`266-277`), reset the transform (`278`).
- Because the pattern is filled under the camera transform, the hatch scales with the zoom and is fixed to the
  world, not to the screen.

### 2.3 Show sites and effects (`src/render/shows/`)

Sprites (`layer.ts:207-253`):

- `collect` pushes the launcher as one drawable and the tower as 4 screen columns of 32 world pixels each
  (`225-236`), sorted like flat rides.
- `drawItem` gets the sprite from the layer's own `SpriteCache` (`78, 96-104`) and blits it whole or as a column
  (`113-135, 240-253`). The sprite is built by `buildSprite` from `drawShowSiteArt` (`101`,
  `src/render/shows/art.ts:171-174`).
- The art is vector calls on the shared shape helpers `box`, `cylinder`, `disc`, `poly3`
  (`art.ts:13, 82-168`, helpers in `src/render/sprites/shapes.ts`). Anchor: the footprint's top corner in the view
  (`art.ts:3`).

Effects (`layer.ts:255-310`), drawn after the night pass:

1. For each site: effect origin = footprint centre, raised by `TOWER_TOP_PX − 4` = 88 px (tower) or
   `LAUNCHER_MOUTH_PX` = 26 px (launcher) (`270-275`, `art.ts:17, 19`). Cull by reach 560 or 380 world pixels
   (`48-49, 276-277`).
2. Site lamp: when it is dark or a show is announced, a radial gradient of radius 9 (tower) or 6 (launcher) world
   pixels with `lighter` (`282-295`).
3. A running show: `plan = showPlan(site, def)` (`300`, `src/render/shows/timeline.ts:137-157`), palette from the
   scenery theme around the site (`148-157`, `src/render/shows/palette.ts:22-42`), then `drawLightshow` or
   `drawFireworks` (`302-303`).

`drawLightshow` (`src/render/shows/fx.ts:116-160`): 6 quads from the lamp head, each filled with a linear gradient
(colour at alpha 0.62 → 35% of that at 0.55 → 0), with `lighter`; then a white radial blaze of radius 16 world
pixels at the head.

`drawFireworks` (`fx.ts:208-289`), with `lighter`:

- rocket: one stroked line (trail) and one `fillRect` head (`226-240`);
- burst flash: a radial gradient disc of radius 34 world pixels for 7 ticks (`244-247`);
- particles in 2 colour passes: one path of short streak lines, stroked at 70% of the alpha, then one `fillRect`
  head per particle (`258-285`);
- reduced motion: a radial glow disc of radius 58 world pixels per burst, no rockets, no particles (`219-225`).

All effect coordinates are canvas pixels, computed as floats and not rounded. Sizes are world pixels × device scale.

Shows run only with After Dark on (`src/sim/shows/update.ts:87-91`) and start between 20:00 and 23:30
(`src/data/tuning/shows.ts:8-10`). So a show always draws over a darkened frame (darkness 0.375 at 20:00, 0.75 from
21:00).

### 2.4 Weather (`src/render/management/layer.ts:314-358`)

1. Reset the transform to identity (`323`). Everything below is in canvas pixels, not world pixels.
2. Fill the whole canvas with the tint (`324-325`).
3. Rain or storm: for `count` streaks, read a fixed seed (x, y, speed) from a `Float32Array` built once
   (`107, 120-125`), compute a wrapped position from the tick, add one line segment to a single path (`337-346`),
   stroke once (`347-349`).
4. Storm: sometimes fill the whole canvas with a pale flash (`350-357`).

### 2.5 Ghosts and outlines

There is no shared ghost module. Each tool draws its own:

- **Sprite wash.** `buildSprite(bounds, scale, paint, tint)` paints the normal art, then fills the whole sprite
  with the tint using `source-atop` (`src/render/canvas.ts:56-72`, wash at `64-70`). Callers ask for it through a
  special frame number: rides and stalls 4094 and 4095 (`src/render/anim.ts:78-79`,
  `src/render/sprites/bank.ts:101-108, 117-118`), scenery frame bits 8 and 16
  (`src/render/scenery/sprites.ts:22-23, 76`), show sites frames 1 and 2 (`src/render/shows/layer.ts:44-45, 100`).
  A ride ghost is always the frame with angle 0, no swing, no riders (`bank.ts:102`).
- **Sprite opacity.** The washed sprite is blitted with `globalAlpha = 0.85` (`renderer.ts:758, 775`,
  `scenery/layer.ts:179`, `shows/layer.ts:327`).
- **Tile outline.** A path of the tile's top face with its slope, in canvas pixels, filled and stroked. Written 8
  times: `renderer.ts:623-660`, `management/layer.ts:378-390`, `scenery/layer.ts:205-227`,
  `terrainTools/layer.ts:98-140`, `shows/layer.ts:160-174`, `track/layer.ts:1069-1093`,
  `elevated/layer.ts:70-101`, `a11y/layer.ts:23-40`, plus `fields/overlay.ts:32-67`. Insets differ: 0.02 tile
  (`renderer.ts:651`), 0.08 tile (`track/layer.ts:1073`), none elsewhere.
- **Line width.** `ghostLineWidth(w)` doubles the width with the high-contrast setting
  (`src/render/palette.ts:35-37`). Most callers pass `max(1, scale)` or `max(1, 1.5 × scale)`.
- **Invalid hatch.** Clip to the tile diamonds, then stroke two sets of 45° lines across the bounding box: white
  `rgba(255,255,255,0.75)` and, half a gap later, vermillion (`src/render/a11y/layer.ts:76-118`,
  `src/render/palette.ts:45`).
- **Text on the canvas.** Cost chips and height tags use `system-ui` (`track/layer.ts:1031`,
  `terrainTools/layer.ts:172`), not the bundled Fredoka font.

---

## 3. Sizes and scale

### 3.1 Sizes at zoom 1 (world pixels; halve for art pixels)

Night:

| Thing | Size | Source |
|---|---|---|
| Light canvas pixel | 4 canvas pixels = `4 / scale` world pixels (4 at ratio 1, 2 at ratio 2) | `pass.ts:35` |
| Pool, stall (R 1) | 181 × 91 | `pass.ts:36, 197-200` |
| Pool, 1 × 1 lit scenery (R 2) | 272 × 136 | same |
| Pool, lamp (R 3) | 362 × 181 | same |
| Pool, 3 × 3 flat ride (R 2) | 362 × 181 | same |
| Pool, 2 × 2 lit scenery (R 3) | 407 × 204 | same |
| Pool, entrance (R 4) | 453 × 226 | same |
| Bulb | 12 across, never under 3 canvas pixels | `pass.ts:41, 238` |
| Bulb heights above ground | lamp 24, entrance 52 and 66, stall 40 and 14, ride 5, scenery 0.8 × height | `pass.ts:45-54, 286` |

The game's lamp pool (362 × 181 world pixels = 181 × 90 art pixels) is three times as wide as the lamp pool of the
concept night picture (60 × 30 art pixels, `concepts/pixel3.py:300`).

Light overlay: dense hatch tile 6 × 6, sparse 8 × 8 world pixels, 1 px lines and a 2 × 2 dot (`sprites.ts:69-87`).

Shows:

| Thing | Size | Source |
|---|---|---|
| Tower sprite bounds | 136 wide (−68…68), 154 high (−84…70) | `art.ts:37` |
| Launcher sprite bounds | 72 wide, 60 high (−24…36) | `art.ts:38` |
| Beam | 560 long, 6 wide at the head, 60 wide at the end; fan of 100° | `fx.ts:62-66` |
| Lamp-head blaze | radius 16 | `fx.ts:151` |
| Site night lamp | radius 9 (tower), 6 (launcher) | `layer.ts:284` |
| Rocket climb | 170–260 up, −70…+70 sideways | `timeline.ts:107-108` |
| Particle head | 3.2 square, never under 1 canvas pixel | `fx.ts:72, 213` |
| Streak and trail line width | 1.2 and 1.6, never under 1 canvas pixel | `fx.ts:232, 257` |
| Burst spread | up to about 45–80 from the burst point (speed 2.6–4 per tick, drag 0.045, life 36–50 ticks), plus about 30–55 of fall at the end of life | `fx.ts:70-71, 168-171, 252-253`, `timeline.ts:38-39, 111` |
| Burst flash, reduced-motion glow | radius 34, radius 58 | `fx.ts:78, 82` |
| Viewing radius ring | 8 tiles (tower), 12 tiles (launcher), drawn as a ground ellipse | `showSites.ts:5-6`, `layer.ts:72-75` |

Weather (these are **CSS pixels**, multiplied by the pixel ratio; they do not change with zoom):

| Thing | Rain | Storm | Source |
|---|---|---|---|
| Streak length | 14 | 20 | `management/layer.ts:332` |
| Lean per streak | about 2.2 | about 5.9 | `331, 336` |
| Fall per tick | 32 | 44 | `330` |
| Streaks per 1280 × 800 | 110 | 200, cap 240 | `64-65, 333` |
| Line width | 1 | 1 | `348` |

Ghosts and overlays (canvas pixels):

| Thing | Size | Source |
|---|---|---|
| Tile outline width | `max(1, scale)`; selection `max(1, 1.5 × scale)`; doubled with high contrast | `renderer.ts:657, 752, 839`, `palette.ts:35-37` |
| Check or cross icon radius | `max(8, 12 × min(1.5, scale))` ride and stall; 11 scenery and show; 10 other; track `10 × k` and `8 × k`, `k` = scale clamped to 0.8–2.4 | `renderer.ts:764, 779, 784`, `scenery/layer.ts:200`, `shows/layer.ts:331`, `track/layer.ts:933, 951, 1024` |
| Stall service-tile dash | `[4, 3]`, not scaled by anything | `renderer.ts:771` |
| Invalid hatch | gap `max(5, 8 × scale)`; white line `max(1.5, 1.6 × scale)`; vermillion line `max(1, 0.9 × scale)` | `a11y/layer.ts:99-110` |
| Map cursor | dash `[6 × scale, 4 × scale]`, lines 4 and 2 × scale | `a11y/layer.ts:131-135` |
| Viewing ring dash | `[6 × ratio, 5 × ratio]`, width `max(1, 1.5 × ratio)` | `shows/layer.ts:188-189` |
| Calm and Buzz hatch | 1, 2 or 4 lines per tile, parallel to a tile edge, width `max(1, scale)` | `fields/style.ts:27`, `fields/overlay.ts:129, 149-162` |
| Cost chip | 13 px text, 20 px high, × ratio | `terrainTools/layer.ts:172-183` |

### 3.2 Zoom

- Camera zoom runs from 0.25 to 2 in free steps (`src/render/camera.ts:6-7`). Nothing in this area snaps to a zoom
  level.
- Night: the light canvas is always a quarter of the canvas, at every zoom. Pools grow and shrink with
  `scale / 4` (`pass.ts:182`). Bulbs are skipped under device scale 0.35 (`pass.ts:43`).
- Shows: every length is multiplied by the device scale (`fx.ts:122-124, 213`). Site sprites come from the 3
  buckets 0.5, 1, 2 and are resampled by `scale / bucket` at the blit (`shows/layer.ts:113-120`).
- Rain ignores the zoom.
- Ghost outlines are redrawn as vector paths each frame, so they are sharp at every zoom; the washed sprites are
  resampled like any sprite.

### 3.3 Device pixel ratio

- `f.width`, `f.height` are canvas pixels (`src/render/layers.ts:33-35`, `renderer.ts:1081-1082`). The light canvas
  is a quarter of **canvas** pixels. On a ratio-2 screen at zoom 1 one light pixel covers 2 world pixels = 1 art
  pixel; at ratio 1 it covers 4 world pixels = 2 art pixels.
- The canvas ratio is the device ratio on desktops, at most 2 on phones, 1 at `low` quality, and `auto` can step
  it down to 1 during play (`src/perf/quality.ts:64-77, 93-119`). Every size above follows at once.
- Rain, the viewing ring, the corner ring and the cost chip multiply by the ratio themselves. The stall service
  dash does not (`renderer.ts:771`).
- The ghost icon is capped at `1.5 × ` device scale, so on a ratio-2 screen it is smaller in CSS pixels than on a
  ratio-1 screen (`renderer.ts:764`).

### 3.4 View rotation (4 views)

- Night pass: source centres go through `toView` with the frame rotation (`pass.ts:194, 219`,
  `src/render/lighting/project.ts:14-33`). The rotation is in the cache key (`pass.ts:133`). The pool ellipse is the
  same in all 4 views.
- Light overlay: all chunks are rebuilt on a view turn (`overlay.ts:174`).
- Site sprites: facing = `(site rotation + view rotation) mod 4` (`shows/layer.ts:223, 245`). Both sites are
  square; only details turn (`art.ts:4-5`).
- Beams, fireworks, rain: screen space. They look the same in all 4 views; only the origin moves.
- Ghost sprites turn with `viewSpriteRotation` (`renderer.ts:745`).

### 3.5 What is cached

| Thing | Cached how | Source |
|---|---|---|
| Pool sprite, bulb sprite | built once per `LightPass`, plain canvases, not in the shared sprite memory | `pass.ts:97-106` |
| Light canvas | one; redrawn only when the key changes; multiplied again on other frames | `pass.ts:125-157` |
| Light source list | rebuilt only when a stamp changed | `lightMap.ts:618-622` |
| Hatch tiles, patterns | tiles once; pattern once per context | `overlay.ts:128-143` |
| Overlay paths | per chunk and band; joined path per band | `overlay.ts:95-126, 208-244` |
| Site sprites | `SpriteCache`, 2,000,000 pixels, key (id, facing, frame, bucket) | `shows/layer.ts:51, 78, 96-104` |
| Show plans, palettes | 16 recent plans; up to 32 palettes | `timeline.ts:147-157`, `shows/layer.ts:148-157` |
| Rain seeds | one array of 240 × 3 | `management/layer.ts:107, 120-125` |
| **Not cached** | beams, fireworks, glow discs, site lamp (gradients are created every frame), weather, every ghost outline, the invalid hatch, the Calm and Buzz paths | `fx.ts:136, 151, 184`, `shows/layer.ts:287` |

During dusk and dawn the ambient colour changes almost every frame, so the light canvas is redrawn every frame
for 2 game hours each (100 ticks = 5 s at speed 1).

---

## 4. Animation

Every motion is a pure function of `world.state.tick + alpha` (20 ticks per second at speed 1,
`src/data/tuning/core.ts:2`). Nothing keeps state between frames. So all motion stops when the game is paused and
runs 2× or 4× faster at higher game speed.

| What moves | How it is computed | Reduced motion | Source |
|---|---|---|---|
| Darkness | piecewise linear in the clock hour; ramps 19–21 h and 05–07 h | same | `darkness.ts:21-29` |
| Bulb brightness | alpha = darkness / 0.75; no flicker | same | `pass.ts:165` |
| Light pools | do not move; change only when a source changes | same | `pass.ts:125-137` |
| Beam sweep | triangle wave, −30°…+30°, 80-tick period; odd beams the other way | still beams | `fx.ts:93-106`, `timeline.ts:30-31` |
| Beam colour | palette index steps by 1–3 every 40 ticks | fixed colour per beam | `fx.ts:118, 133`, `timeline.ts:75-76` |
| Beam fade | linear over the first and last 20 ticks | alpha pulses 0.35–0.65 every 160 ticks | `fx.ts:120-121, 108-111` |
| Rocket | ease-out climb over 18–24 ticks | not drawn | `fx.ts:163-166`, `timeline.ts:36-37` |
| Particles | closed form: distance with drag 0.045, gravity 0.045, life 36–50 ticks; alpha = fade² × 0.95 + 0.05; white for the first 5 ticks; angle and speed jitter from a hash of (seed, index) | glow discs: rise 16 ticks, hold, fade 40 ticks | `fx.ts:69-82, 168-171, 194-202, 248-283`, `src/render/shows/rng.ts:43-48` |
| Show plan | seeded by (site id, start tick); the same show replays the same way | same | `rng.ts:12-18`, `timeline.ts:137-144` |
| Site lamp blink | while announced: `0.45 + 0.35 × sin(now × π / 10)`, 20-tick period | steady 0.55 | `shows/layer.ts:283` |
| Rain | position = (seed × span + t × speed × factor) mod span; factor 0.7–1.3 per streak | frozen at t = 0 | `management/layer.ts:328, 342-343` |
| Lightning | when `mix32(floor(tick / 12) × 7919) % 23 === 0`, for 3 ticks | none | `management/layer.ts:350-356` |
| Ride marker pins | bob `sin(t / 7 + id) × 2` world pixels | still | `management/layer.ts:450, 476` |
| Ghosts, outlines, hatches, cursor | no animation | — | — |

Show lengths: Lightshow 300 ticks, Fireworks 400 ticks (`showSites.ts:5-6`); effects keep drawing 56 ticks after the
end (`shows/layer.ts:47`). The sound uses the same plan (`src/audio/shows.ts:11`), so a burst is heard on the tick
it is seen.

---

## 5. What a pixel-art version must keep

### 5.1 Function signatures and types

- `WorldLayer` hooks and `LayerFrame` (`src/render/layers.ts:21-65`). The lighting and show layers are plain
  `WorldLayer` objects.
- `createLightingLayer(opts?: { createCanvas?, createPath? }): LightingLayer` with `stats()`, `overlayRebuilt()`,
  `overlayRejoined()` (`src/render/lighting/layer.ts:15-47`). It re-exports `ambientColour` and `darknessAt`
  (`layer.ts:12`). Tests inject a fake canvas and a fake path through the two options.
- `CanvasFactory`, `CanvasLike`, `Ctx2D` (`src/render/lighting/sprites.ts:8-16`); `PathFactory`, `PathLike`
  (`src/render/lighting/overlay.ts:22-31`).
- `LIGHT_CANVAS_DIVISOR`, `BULB_MIN_SCALE` (`pass.ts:35, 43`); `LightPassStats` (`pass.ts:56-65`).
- From the simulation, read only: `lightSources(world): LightSourceList` (`lightMap.ts:478-491, 618`),
  `lightRawNow(world)` (`458`), `LightKind` (`41`). The simulation must never read render state
  (`src/sim/lighting/api.ts:4`).
- `createShowLayer(): ShowLayer` with `stats()`, `totals()`, and the debug object `window.__tcShows`
  (`src/render/shows/layer.ts:53-69, 85`).
- `drawLightshow(ctx, plan, palette, t, ox, oy, scale, reduced, stats)` and `drawFireworks(…)` with the same
  parameters; `FxCtx`, `FxStats`, `sweepOffset`, `beamAngle`, `pulseAlpha`, `particlesAt`, `glowAlpha`, `rgba`
  (`src/render/shows/fx.ts:20-47, 87-116, 174, 195, 208`).
- `buildShowPlan`, `showPlan`, `showTimeline`, `ShowCue`, `Rocket`, `ShowPlan` (`timeline.ts:23-71, 137-162`).
  The audio module imports `showTimeline` (`src/audio/shows.ts:11`).
- `drawShowSiteArt(ctx, defId, facing)`, `showArtBounds(defId)`, `TOWER_TOP_PX`, `LAUNCHER_MOUTH_PX`
  (`art.ts:17-19, 36-39, 171`); `drawShowSitePreview(ctx, defId, w, h, facing = 2)` used by the picker
  (`preview.ts:6`, `src/ui/shows/picker.ts:8`).
- `ShowGhost`, `showGhostOf`, `setShowGhost` (`src/render/shows/ghost.ts:12-31`), used by
  `src/input/shows/index.ts:17` and `src/ui/shows/status.ts:8`, `view.ts:11`.
- `GhostState`, `DragState`, `BrushGhost`, `ToolState` (`src/render/types.ts:44-130`).
- `ghostFill`, `ghostStroke`, `ghostLineWidth`, `GHOST_*`, `withAlpha` (`src/render/palette.ts:10-47`);
  `GHOST_TINT_VALID`, `GHOST_TINT_INVALID` (`src/render/sprites/bank.ts:23-24`); `drawGhostIcon(ctx, x, y, valid, r)`
  (`src/render/sprites/props.ts:328`); `terrainGhostColours` (`src/render/terrainTools/layer.ts:32`);
  `ELEVATED_COLOURS` (`src/render/elevated/layer.ts:26-36`); `tileCorners`, `invalidTiles`
  (`src/render/a11y/layer.ts:23, 43`).
- `displayPrefs()` with `reducedMotion` and `highContrast` (`src/a11y/prefs.ts:9-23`).

### 5.2 Anchors, footprints and placement points

- Site sprite anchor: the footprint's top corner in the view (`art.ts:3`, `shows/layer.ts:138-146`). The tower is
  cut into 4 columns of 32 world pixels; each column sorts by the front-most tile under it
  (`shows/layer.ts:229-236`). New art must stay inside `showArtBounds`, or the bounds must change with it.
- Beam origin = footprint centre, 88 px up; rocket origin = footprint centre, 26 px up (`shows/layer.ts:272-275`).
  These two numbers are tied to the drawn lamp head and tube mouths (`art.ts:99-109, 143-161`).
- **Bulb positions are constants that copy the current art.** Lamp head 24 px (`pass.ts:45`, art at
  `src/render/sprites/litter.ts:145`: box from 22 to 26 px). Entrance pillars at 0.1 and 0.9 of the tile, cap 52,
  emblem 66 (`pass.ts:47-48, 305`, art at `src/render/sprites/props.ts:266-302`). Stall roof 40 and counter 14,
  face offset 0.38 tile (`pass.ts:50-51, 307-308`, art at `src/render/sprites/stalls.ts:171-181`). Ride corners
  5 px up, 0.18 tile inset (`pass.ts:53-54`). Lamp position on the tile comes from `pathItemPlacement`
  (`pass.ts:258-264`). If the new art moves a lamp head, the bulb must move with it.
- Pool centre: the source centre on the ground at the tile height, or at a fixed height for lamps on elevated
  paths, stations and scenery (`pass.ts:192-196`, `lightMap.ts:582-609`).
- Ghost footprint tiles follow the slope of each tile (`renderer.ts:623-638`). The ghost sprite sits at the
  footprint's view origin (`renderer.ts:754-759`). The icon sits above the art bounds (`renderer.ts:761-764`).

### 5.3 Hit areas

Nothing in this area is picked by its pixels. A show site is picked by the tile content
(`src/input/tools.ts:105-114`). The ghost follows the hovered tile, which is the footprint's top corner in the view
(`src/input/shows/index.ts:10, 47`). Light pools, bulbs, beams, particles, rain and hatches cannot be clicked. New
art cannot break picking here.

### 5.4 Tests that pin behaviour

Night:

- `tests/unit/lighting/layer.test.ts:153-170`: the light canvas is `ceil(w / 4) × ceil(h / 4)`; its first call is
  `fillRect(0, 0, 300, 150)` with `'rgb(70, 80, 130)'` and `source-over`; pools are `drawImage` with `lighter`; the
  frame gets one `drawImage(lightCanvas, 0, 0, 300, 150, 0, 0, 1200, 600)` with `multiply`; the context ends at
  `source-over`, alpha 1.
- `:172-198`: bulbs come after the multiply, with `lighter`; 5 bulbs for one lamp plus the entrance; none at scale
  0.25.
- `:200-222`: the light canvas is reused; a pan, a new lamp or a new darkness redraws it; the ambient colour at
  20:00 is `'rgb(163, 168, 193)'`.
- `:224-257`: culling, the cap of 400, open rides only.
- `:269-313`: the three overlay tints as exact strings; hatch fills are pattern objects; cached paths; chunk
  rebuild counts 16, 0, 1, 16; 5 fills per still frame.
- `tests/unit/lighting/darkness.test.ts:12-52`: the curve and the ambient colours.
- `tests/unit/lighting/perf.test.ts:46-60`: under 10 ms of JavaScript per frame.
- `tests/e2e/afterDark.spec.ts:108-125`: mean canvas brightness at 22:00 is under 80% of noon; with After Dark off
  it is within 5% of noon.

Shows:

- `tests/unit/shows/render.test.ts:76-80`: the shows layer comes after the lighting layer. `:84-104`: tower = 4
  column slices, launcher = 1; sprite keys `spriteKey(id, rotation, 0, 1)`. `:118-157`: 6 beams; nothing outside a
  show; reduced motion gives glows only.
- `tests/unit/shows/timeline.test.ts:137-174`: sweep values; the only composite mode used for fills is `lighter`;
  reduced motion keeps the geometry still. `:176-219`: each particle head is a `fillRect` (rects ≥ particles); the
  same time gives the same picture; the cap of 600 is shared; reduced motion draws no rockets, particles or
  flashes.
- `tests/e2e/shows.spec.ts:274-279, 380-382, 438-439`: reads `window.__tcShows`.

Ghosts:

- `tests/unit/render/safeColours.test.ts:58-62`: the wash colours are exactly the safe blue at 0.5 and the safe
  vermillion at 0.55. `:71-82`: no file under `src/render` may contain the old red or green literals.
  `:88-110`: terrain, elevated and shared helpers use the safe pair; high contrast doubles the width.
- `tests/unit/a11y/palette.test.ts:45-56`: the icon fill is the safe colour; a check is 1 stroke, a cross is 2.
  `:81-95`: `invalidTiles`. `:97-115`: the hatch calls `clip` and strokes in the invalid colour; the cursor is a
  dashed stroke.

No test checks `drawWeather` output, any ghost pixel, or any night pixel other than the mean brightness.

### 5.5 Rules from the code and the spec

- Darkness 0 must cost nothing (`pass.ts:111-116`).
- Budget: at most 2 ms per frame at 1920 × 1080; at most 400 pools (`pass.ts:13-20`,
  `docs/superpowers/specs/thrills-and-chills/phase-4-land-scenery-after-dark.md:368`). Measured on a
  software-rastered canvas: +2.5 ms to +6 ms (`pass.ts:16-18`).
- The per-frame loops allocate nothing (`pass.ts:10-11`, `fx.ts:11-12`).
- Colour is never the only signal: check and cross icons, hatching (`src/render/palette.ts:3-4`).
- Valid and invalid are the colour-blind safe blue and vermillion, never red and green (`palette.ts:9-15`).
- Show visuals use a render-only random generator, never the game's (`rng.ts:1-4`).

### 5.6 What a pixel-art style must do so that night, shows and ghosts still look right

These follow from the code above. They are requirements, not a design.

Night:

1. **Say what "dark" does to a palette colour.** Today it is a multiply by a smooth image, so every art colour
   appears in hundreds of shades. A pixel-art night needs a rule that gives a small set of colours (for example a
   night ramp per colour, or a few fixed light levels).
2. **Keep the lit area readable.** The player must see which path tiles are lit, because unlit paths cost
   happiness (`src/sim/lighting/hooks.ts:37-45`). The game rule is a light value ≥ 96 per tile
   (`src/data/tuning/night.ts:8`).
3. **Decide the 2-hour ramps.** Dusk and dawn are continuous today (`darkness.ts:26-27`).
4. **Keep a pool centre at day brightness or decide otherwise.** Today a lit ride looks exactly as by day.
5. **Give bulbs their positions from the new art**, not from the constants in `pass.ts:45-54`.
6. **Decide whether sprites get night pixels** (lit windows, coloured bulbs). The concept night picture relies on
   them (`concepts/pixel3.py:304-306, 428, 516`); the game has no hook for them.
7. **Stay darker than day by a clear margin**, or change the brightness test (`afterDark.spec.ts:117`).

Shows:

8. Beams and fireworks must still read as light over the dark scene and must draw after the night pass
   (`render.test.ts:76-80`).
9. Burst, launch and sweep must stay on their ticks, because the sound follows the same plan
   (`src/audio/shows.ts:11`).
10. A reduced-motion form must exist for beams and fireworks (`fx.ts:219-225`, `render.test.ts:142-157`).
11. The 7 theme palettes of 6 colours each are show colours outside any art palette (`palette.ts:11-19`). Either
    they join the art palette or they are mapped to it.

Ghosts:

12. Valid and invalid must differ by colour (safe blue, safe vermillion), by icon (check, cross) and, for invalid,
    by hatch. High contrast must thicken the lines.
13. A ghost must show the exact footprint tiles on sloped ground.
14. A ghost must stay readable over any ground and at night. Today it is drawn after the night pass at full
    brightness.
15. The approved draft shows a vector diamond with ink and white dashes and an HTML label, without a washed
    sprite. The owner approved that look. It differs from every ghost drawing in the game (rows 1–13 of the table
    in 1.6).

---

## 6. What makes pixel art hard here

1. **Night is a smooth multiply of a blurred quarter-size image.** `pass.ts:159-162` forces smoothing on and
   stretches the light canvas ×4. The pool sprite is a 5-stop radial gradient (`sprites.ts:39-47`). The result is a
   continuous gradient over the whole scene. Crisp art with a fixed palette loses its palette as soon as the sun
   goes down.

2. **The light grid is fixed to the screen; the art grid is fixed to the world.** The light canvas starts at the
   canvas corner and has 4-canvas-pixel cells (`pass.ts:121-122, 162`). An art pixel covers `2 × scale` canvas
   pixels and moves with the camera, whose offset is not rounded (`renderer.ts:1061-1062`). The two grids match
   only at device scale 2 with a lucky camera position. With smoothing simply turned off, the light blocks would
   crawl against the art on every pan.

3. **Lighting happens after everything is flattened.** The pass runs once on the finished frame
   (`renderer.ts:1114-1116`). It has no per-sprite or per-material information. A night ramp per colour, lit
   windows, or "this roof is lit, that tree is not" cannot be done in this pass. The edge of a pool cuts through
   sprites in screen space (`pass.ts:195-202`).

4. **The ambient colour takes up to 185 values during dusk and dawn** (`darkness.ts:38-43`, red goes from 255 to
   70), and the light canvas is redrawn every frame then (`pass.ts:134-136`). Any design with pre-drawn night
   sprites needs an answer for these ramps, and a sprite set per light level multiplies the sprite memory (64 MB on
   phones, `src/data/tuning/perf.ts:4`).

5. **Bulbs are soft gradient sprites with hand-copied positions.** `sprites.ts:52-65` (radial gradient),
   `pass.ts:224` (scaled blit at float positions, `lighter`), `pass.ts:45-54, 286, 305-308` (positions). Every
   ride gets the same 4 corner bulbs whatever it looks like (`pass.ts:288-296`).

6. **No sprite has a night frame.** There is no frame bit, cache key part or art option for darkness in
   `src/render/sprites/bank.ts:97-207`, `src/render/scenery/sprites.ts:16-24` or the show layer. Sprite keys have
   a 12-bit frame field (`src/render/spriteCache.ts:43-50`), and ride frames already use 11 bits
   (`src/render/anim.ts:57-60`).

7. **Show effects are gradients and thin lines by design.** Beams are quads with linear gradients
   (`fx.ts:136-147`). Particles are stroked lines with alpha plus squares at float positions
   (`fx.ts:261-283`). Flashes and glows are radial gradients (`fx.ts:183-192`). All use `lighter`, all scale
   continuously with zoom (`fx.ts:122-124, 213`). Tests name `lighter` and `fillRect` (5.4).

8. **Weather lives in screen space.** `drawWeather` resets the transform (`management/layer.ts:323`). Rain is
   anti-aliased diagonal lines 1 CSS pixel wide (`337-349`); the tints are full-screen alpha fills (`316-325`) that
   push every art colour off the palette; at night the weather tint and the night multiply stack
   (`renderer.ts:1115-1116`). Rain does not move with the camera and does not scale with the art pixel.

9. **The ghost is an alpha wash over an alpha blit.** `canvas.ts:64-70` mixes every sprite pixel 50% toward blue,
   so the dark outline of pixel art becomes mid blue; then `globalAlpha = 0.85` lets the ground show through
   (`renderer.ts:758`). The path item ghost uses opacity alone (`management/layer.ts:553`). Neither keeps a
   palette.

10. **Ghost drawing is spread over 8 files with 9 copies of the tile outline** (list in 2.5). The colours are
    shared (`palette.ts`), the drawing is not. One new ghost look means touching `renderer.ts`,
    `management/layer.ts`, `scenery/layer.ts`, `terrainTools/layer.ts`, `shows/layer.ts`, `track/layer.ts`,
    `elevated/layer.ts` and `a11y/layer.ts`.

11. **Outlines and hatches are anti-aliased vector strokes with fractional widths.** `max(1, scale)`
    (`renderer.ts:657`), `1.6 × scale` and `0.9 × scale` (`a11y/layer.ts:100, 110`), tile corners inset by 0.02
    tile (`renderer.ts:651`). A 2:1 iso line is pixel-clean only between whole-pixel points; these points are
    floats. The invalid hatch is at 45° in screen space (`a11y/layer.ts:103-107`), not along the tile.

12. **The invalid hatch does not cover all ghosts** (`a11y/layer.ts:43-62`). A new uniform "valid and invalid
    hatch" has to add what is missing for scenery, show sites, track, terrain and elevated paths, not only restyle.

13. **The Light overlay hatch is a pattern under the camera transform** (`overlay.ts:265-276`). Its 1 px lines
    and 2 × 2 dots are resampled at every zoom that is not a whole number. The Calm and Buzz hatches are vector
    lines of `max(1, scale)` width (`fields/overlay.ts:129`). The three overlays use two different hatch methods.

14. **The frame budget is small.** The night pass may cost 2 ms (`pass.ts:13`); a phone frame may cost 40 ms in
    all (`src/data/tuning/perf.ts:17`). The concept script makes its night with a per-pixel loop in Python
    (`concepts/pixel3.py:188-197`). The same per-pixel work on a 2560 × 1600 canvas each frame is not possible
    with Canvas 2D; it must come from cached images, patterns or masks.

15. **Tests name the technique.** `layer.test.ts:153-170` expects `multiply`, `lighter`, the quarter size and the
    exact ambient string. A different night method means rewriting about 10 unit tests and the e2e brightness
    check, not only the drawing.

16. **Canvas text uses `system-ui`** (`track/layer.ts:1031`, `terrainTools/layer.ts:172`), next to a UI that uses
    the bundled Fredoka font.

---

## 7. Size of the job

Draw functions that a new art style must replace or wrap, with their line counts:

| Group | Functions | Lines |
|---|---|---|
| **Night pass**: `makeGlowSprite` (`sprites.ts:34-49`), `makeBulbSprite` (`52-65`), `LightPass.draw` (`pass.ts:108-171`), `redraw` (`174-207`), `bulbAt` (`216-226`), `drawBulbs` (`229-302`) | 6 | 213 |
| **Light overlay**: `makeHatchTile` (`sprites.ts:68-89`), `pattern` (`overlay.ts:128-143`), `rebuild` (`208-244`), `draw` (`246-279`) | 4 | 109 |
| **Shows**: `mast`, `drawTower`, `drawLauncher`, `dot` (`art.ts:29-34, 42-168`); `drawLightshow`, `drawGlowDisc`, `drawFireworks` (`fx.ts:116-160, 183-192, 208-289`); site lamp, `drawViewingArea`, `tilePath`, `groundEllipse`, `drawOverlay` (`shows/layer.ts:72-75, 160-201, 282-295, 312-342`) | 12 | 357 |
| **Weather**: `drawWeather`, `drawRideMarkers`, `marker` (`management/layer.ts:314-358, 447-532`) | 3 | 130 |
| **Ghosts and placement overlays**: sprite wash (`canvas.ts:64-70`); `drawGhostIcon` (`props.ts:328-355`); `tileFace`, `outlineTiles`, `dragColours`, `drawOwnershipTints`, `drawPurchaseRect`, `drawGhost`, `drawSelection`, `drawOverlays` (`renderer.ts:623-871`); `tileDiamond`, `drawPatrol`, `drawItemGhost` (`management/layer.ts:378-444, 535-556`); `drawHatch`, `drawCursor` (`a11y/layer.ts:76-138`); scenery `drawOverlay`, `outlineTile`, `edgeHighlight` (`scenery/layer.ts:156-242`); terrain `drawOverlay`, `drawCost` (`terrainTools/layer.ts:98-196`); elevated `drawGhost` (`elevated/layer.ts:173-209`); track `drawOverlay`, `drawPieceGhost`, `label`, `arrow`, `tileOutline` (`track/layer.ts:928-1093`) | 26 | 795 |
| **Calm and Buzz overlays**: `corners`, `drawGround` (`fields/overlay.ts:32-67, 109-168`) | 2 | 96 |
| **Total** | **53** | **about 1,700** |

Whole files of the area, for scale: `src/render/lighting` 939 lines in 7 files, `src/render/shows` 1,116 lines in 8
files, `src/sim/lighting` 939 lines in 7 files (not to be changed).

What does **not** need new drawing:

- `src/sim/lighting/*`: the light map, the lit rule, the night effects on guests.
- `darkness.ts`, `project.ts`, `timeline.ts`, `rng.ts`, `palette.ts` (theme choice), `ghost.ts`: pure data and
  maths.
- The source list, the culling, the caps, the chunk cache of the Light overlay.

Tests to update if the night method or the effect method changes: `tests/unit/lighting/layer.test.ts` (337 lines),
parts of `tests/unit/shows/timeline.test.ts` (219) and `tests/unit/shows/render.test.ts` (187),
`tests/unit/render/safeColours.test.ts` (111), `tests/unit/a11y/palette.test.ts` (116), and the brightness step of
`tests/e2e/afterDark.spec.ts`.

Three points that reduce the job:

- The 4 washed-sprite ghosts share one function (`canvas.ts:56-72`). A new ghost look for sprites is one change
  there, plus the 4 blit sites.
- All ghost colours already come from `src/render/palette.ts:10-47`.
- Both the pool and the bulb are built through an injected canvas factory (`pass.ts:95-106`), and the light
  canvas content is already cached behind one key (`pass.ts:125-137`). A different light image can be dropped in
  at `redraw` without touching the source list or the culling.

---

## 8. Open questions

1. **What does the owner expect night to look like?** The approved drafts show day only. Is the concept night
   (`concepts/out/p3-spooky.png`: dark palette, dithered pools, lit pixels in sprites, no shadows) the target, or
   is a smooth darkening over pixel art acceptable?
2. **May the light pools get smaller?** The concept lamp pool is a third as wide as the game's. The pool size is
   render-only (`pass.ts:197-200`), but a smaller pool would no longer cover the tiles the game counts as lit.
   Should the picture follow the lit rule exactly (per tile), or stay a soft hint?
3. **Dusk and dawn:** a smooth 2-hour fade, or a few steps?
4. **Night pixels in sprites:** should rides, stalls and lit scenery (25 items) get lit windows and coloured bulbs
   at night? That adds a night frame to every such sprite and a cache key part.
5. **Shows:** should beams and fireworks become pixel art (hard-edged, dithered, on the art grid), or stay smooth
   light on top of the pixel scene, as the placement marker of the draft stays smooth?
6. **Rain:** should it fall in screen space as now, or on the art grid? Should weather tints stay, given that they
   shift the whole palette?
7. **Ghost look:** the draft shows a vector diamond with ink and white dashes and no washed sprite. Does this
   replace the washed sprite for every ghost (rows 1–13 of the table in 1.6), or only for the card drag?
8. **Where do valid and invalid show in the draft look?** The draft marker is white and ink only. The safe blue
   and vermillion, the check and cross, and the hatch are required by tests and by the accessibility rule.
9. **Should the invalid hatch cover scenery, show sites, track, terrain and elevated paths too?** Today it does
   not (`a11y/layer.ts:43-62`).
10. **The Light legend and the Light overlay disagree.** The map draws 3 bands with hatches
    (`src/render/lighting/legend.ts:29-33`); the legend card shows 2 rows without hatch
    (`src/ui/overlays/legend.ts:89-90`). `lightLegend()` is used only by tests. Which is right?
11. **Low zoom:** under device scale 0.35 bulbs vanish (`pass.ts:43`). What should night, beams and ghosts look like
    when one art pixel is smaller than one canvas pixel (zoom below 0.5 at ratio 1)?
12. **Is the 2 ms budget for the night pass still the rule**, and on which device is it measured? The only
    measurements in the code are from a software-rastered headless browser (`pass.ts:13-20`).
