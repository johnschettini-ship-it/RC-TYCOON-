# Critic: completeness check of the eight drawing maps

Read on 2026-11-11 against the working tree at commit `e247baa`. All repository paths are relative to
`/home/user/RC-TYCOON-`. Draft paths: `CONCEPTS/` =
`/tmp/claude-0/-home-user-RC-TYCOON-/29ee6f8c-df84-5112-ac7e-04cfb7614dae/scratchpad/concepts/`, `CANVAS/` = the
sibling folder `canvas/`. Nothing in the repository was changed, built or run. I read all eight maps in full
(`core`, `terrain`, `rides-stalls`, `track`, `scenery`, `people-small`, `light-fx`, `drafts-constraints`), looked at
the approved desktop draft once, and then read code only where a gap or a contradiction needed it. Counts marked
"grep" are plain `grep | wc` counts over `src/`.

## Summary

The eight maps cover every file under `src/render` that draws. They miss four small interface drawings and the app
icon. I found eleven contradictions and resolved each from the code; the two that matter are the scale of the
approved draft (it is device scale 1, not 2) and which rule sets the canvas pixel ratio (`src/perf/quality.ts`, not
`src/render/canvas.ts`). After removing double counts, a new style must replace or wrap about 306 draw functions
and about 8,700 lines. Of these, 174 functions (5,250 lines) are world art, and they sit on 34 shared primitives
and one sprite builder.

---

## A. Ten facts a designer must know first

1. **One draft art pixel is 2 world pixels, and the approved pictures show it as 2 screen pixels.** The draft tile
   is 32 × 16 art pixels (`CONCEPTS/pixel3.py:78`); the game tile is 64 × 32 world pixels (`src/render/iso.ts:8-10`).
   The draft's resolution is exactly the game's 0.5 sprite bucket (`src/render/camera.ts:9`). An art pixel covers
   `2 × zoom × pixel ratio` canvas pixels. It is a whole number only when that product is a whole number.

2. **The scale is continuous, and it is set in three places only.** `scale = cam.zoom × dpr`
   (`src/render/renderer.ts:1059`). Zoom changes only through `zoomAt` (`src/render/camera.ts:31-37`), called from
   the wheel, the keys and the pinch (`src/input/controller.ts:127, 152, 280`), in steps of × 1.15
   (`src/input/camera.ts:13-14`) or any pinch factor. There are no zoom buttons, and the camera is not stored in
   saves or settings (grep of `src/save`, `src/settings`, `src/ui`). The pixel ratio comes from `renderPlan`
   (`src/perf/quality.ts:64-77`): the raw device ratio on desktops (1.25 and 1.5 pass through), at most 2 on the
   phone class, 1 at `low`, and `auto` can drop it to 1 during play. The canvas is then stretched by CSS to 100 % of
   the window (`src/styles/main.css:34`).

3. **Image smoothing is switched on in exactly three lines and off nowhere.** `src/render/renderer.ts:1071` (main
   canvas, every frame), `src/render/renderer.ts:1018` (static layer), `src/render/lighting/pass.ts:160` (night
   pass, restored at `:169`). No stylesheet has `image-rendering` (grep). No test asserts the flag: the only two
   mentions in `tests/` are properties of fakes (`tests/unit/lighting/layer.test.ts:28`,
   `tests/bench/lightScene.ts:78`).

4. **Every sprite is a cached canvas, painted once by vector calls through a scale transform.** `buildSprite`
   (`src/render/canvas.ts:56-72`) is the only builder, with 14 call sites. It sets `setTransform(scale, …)` and runs
   the art function, so the browser rasterises the same vector art at 0.5, 1 and 2 with anti-aliasing. The canvas is
   an `HTMLCanvasElement` in a browser and an `OffscreenCanvas` elsewhere, with default context options
   (`src/render/canvas.ts:12-26`). `src/` has no `getImageData`, `putImageData`, `ImageData`, `createImageBitmap` or
   worker (grep). `Sprite.scale` is free: every blit divides by it (`src/render/renderer.ts:339`).

5. **Blitting rounds each sprite alone, and multi-tile sprites are cut at the footprint.** The blit math exists five
   times (`src/render/renderer.ts:338-363`, `src/render/scenery/layer.ts:60-83`, `src/render/shows/layer.ts:113-135`,
   `src/render/track/layer.ts:670-677`, `src/render/terrain.ts:638-643`). The camera offset is not rounded
   (`src/render/renderer.ts:1061-1062`); that one pair of lines feeds every layer (`:1073-1075`, `:1087`, `:1106`).
   Rides, 2 × 2 scenery and the show tower are drawn as 32-pixel columns that stop at the footprint corners
   (`src/render/renderer.ts:350-363, 455-462`; `src/render/sprites/rides.ts:53`; `src/render/scenery/layer.ts:126-133`),
   so an outline or a shadow outside the footprint is cut off.

6. **306 draw functions and about 8,700 lines carry today's style.** 174 functions (5,250 lines) are world art
   baked into sprites or terrain chunks. They rest on 34 shared drawing primitives (460 lines). 24 functions (480
   lines) are sprite and blit plumbing. The rest are per-frame effects, map overlays, card pictures and interface
   art. Section C.7 has the table.

7. **Four view rotations multiply every picture, but the art is always painted in view space.** A sprite is asked
   for with `(object rotation + view rotation) mod 4` (`src/render/view.ts:82-84`), and that number is in the cache
   key (`src/render/spriteCache.ts:46-50`). Counts: 18 flat rides × 4 gate layouts (7 rides have 2 bodies), 14 stalls
   × 4 (2 show the counter, 2 show the back), 340 scenery pictures before variants, 4 guest facings (3 differ
   today), 16 chunk images per terrain chunk, track slices repainted per rotation. Coaster cars are the exception:
   one sprite serves all views (`src/render/track/paint.ts:761-762`). Tests demand at least 2 different drawings per
   item over the 4 rotations (`tests/unit/scenery/art.test.ts:69-72`,
   `tests/unit/render/content/phase6Art.test.ts:92-96`).

8. **Animation is a new whole sprite per frame, generated by code and built during play.** A flat ride has 32
   angles × 5 rider levels per rotation and bucket, the swing tower × 5 swing levels (`src/render/anim.ts:9, 57-60`).
   A car has 16 × 24 × 16 poses per shape (`src/render/track/layer.ts:840-846`). Only guests (48), track slices
   (20), cars (32) and terrain chunks have a build limit per frame (`src/render/sprites/bank.ts:82`,
   `src/render/track/layer.ts:94-95`, `src/render/terrain.ts:401-421`). Ride, stall, staff, scenery and show sprites
   are built without a limit on first use (`src/render/sprites/bank.ts:97-121, 160-207`). Any extra work per sprite
   build runs inside a frame.

9. **Night and several other passes blend over the finished frame, so palette colours do not survive them.** The
   night pass draws after all objects (`src/render/renderer.ts:1116`). It multiplies a quarter-size light canvas,
   stretched × 4 with smoothing forced on, over the whole frame (`src/render/lighting/pass.ts:159-162`). An unlit
   pixel is multiplied by `rgb(70, 80, 130) / 255`; a pool centre clips to white, so there the day colours show
   unchanged (`src/render/lighting/pass.ts:174-207`, `src/render/lighting/sprites.ts:41`). Sprites have no night
   frame: the frame field has 12 bits and rides use 11 (`src/render/spriteCache.ts:43-50`, `src/render/anim.ts:57-60`).
   The ghost wash (`src/render/canvas.ts:64-70`), ghost opacity 0.85 (`src/render/renderer.ts:758, 775`), weather
   tints (`src/render/management/layer.ts:316-325`), field and ownership tints, and baked water at alpha 0.8
   (`src/render/terrain.ts:312-317`) blend too.

10. **Written rules and tests bind the method, not only the look.** No raster image may be tracked outside the app
    icons and `docs/screenshots` (`scripts/check-release.ts:36-38, 46`), so sprite sheets are not allowed; art is
    code or data in a bundle limited to 400 KB gzipped (`src/data/tuning/perf.ts:19`). Art tests run on fake
    contexts without pixels and require recorded fills, zero transforms and points inside the bounds
    (`tests/unit/render/content/art.test.ts:59-82`, `tests/unit/scenery/art.test.ts:50-63`,
    `tests/unit/render/track/slices.test.ts:105-136`). Runs of `fillRect` pass; `drawImage` or `putImageData` art
    records nothing and fails. There is no screenshot baseline anywhere (`toHaveScreenshot` and `toMatchSnapshot`
    do not occur in `tests/`), and Node has no canvas library (`package.json:16-23`), so only the Playwright tests
    can see pixels.

---

## B. Contradictions between maps, resolved from the code

| # | The maps say | The code says |
|---|---|---|
| 1 | `track.md`: the draft "as shown" has a tile 128 px wide, which equals zoom × pixel ratio = 2. `terrain.md`, `scenery.md`, `core.md`, `drafts-constraints.md`: the approved pictures show 2 screen pixels per art pixel, which is the game at zoom 1. | The second group is right. The script saves a × 4 copy (`CONCEPTS/pixel3.py:785`), but the approved desktop board shows a 1280 × 800 image (the 640 × 400 raw frame × 2) at 1280 × 800 CSS px (`CANVAS/project/DraftDesktop.dc.html:18`), and the screenshot is 1280 × 800 (`docs/screenshots/phase-7-draft-desktop.png`). The phone board shows the × 4 image at half size, 390 × 844 (`CANVAS/project/DraftPhone.dc.html:18`). Both: 2 screen pixels per art pixel = device scale 1. |
| 2 | `scenery.md` and `drafts-constraints.md` cite `src/render/canvas.ts:38-48` for the phone cap on the pixel ratio (screen side below 600 CSS px). `core.md` cites `src/perf/quality.ts`. | `core.md` is right. The renderer calls `deviceClass` and `renderPlan` (`src/render/renderer.ts:901-904`, `src/perf/quality.ts:31-35, 64-77`). `canvasPixelRatio` in `canvas.ts:45-48` has no caller in `src/`; only a unit test calls it (`tests/unit/render/renderer-rotation.test.ts:169-172`). `isPhoneScreen` is used only for the terrain chunk cap (`src/render/terrain.ts:434`). So "phone" for the pixel ratio means coarse pointer, or memory ≤ 4 GB, or a small screen: a tablet is a phone here. |
| 3 | `core.md` and `drafts-constraints.md`: the draft guest (7 × 12 art pixels = 14 × 24 world pixels) fits `GUEST_BOUNDS`. `people-small.md`: it does not fit; its top is near −23. | It does not fit. The bounds are left −8, right 8, top −20, bottom 5 (`src/render/sprites/props.ts:15`): 25 high, but only 20 above the feet. The draft stamp puts its bottom row on the anchor (`CONCEPTS/pixel3.py:243`), so the sprite spans −6…+8 across and −22…+2 down in world pixels (one world pixel more to the top left if the anchor is taken as the pixel's centre). The top is 2 to 3 world pixels over, about 1 art pixel. At the 0.5 scale it would still land inside the 2-pixel sprite pad, but the bounds test fails (`tests/unit/render/guestItems.test.ts:39-72`). |
| 4 | `rides-stalls.md`: guest body "about 10 × 16" world pixels. `people-small.md`: 10 × 19. | 10 × 19. Arms span −5…5 (`props.ts:182-183`); the hair top is at −15.9 − 3.15 = −19.05 (`props.ts:198`). The comment at `props.ts:14` is out of date. |
| 5 | `core.md`: at bucket 0.5 an odd bound gives a half-pixel anchor, and it lists "bottom 5 for guests and staff". `scenery.md`: all sprite origins are whole image pixels. | Only `left` and `top` set the anchor (`src/render/canvas.ts:60-61`). A plain guest (−8, −20), staff (−12, −30), rides, stalls, fence, arch, path items and all scenery have even values: whole-pixel anchors at 0.5. Half-pixel anchors occur for a guest with an item (left −13, `props.ts:17`), litter (left −9, top −7) and mess (left −11) (`src/render/sprites/litter.ts:12-13`). "Bottom 5" changes the image height only. |
| 6 | `core.md` table 1.2 lists draw-list kinds "60, 61: elevated path, support" as pushed and drawn. `terrain.md`: kind 61 is never pushed. | `terrain.md` is right. `elevatedSupport` appears only in its declaration and in the layer's `kinds` list (`src/render/layers.ts:47`, `src/render/elevated/layer.ts:137`). Supports are drawn inside the deck's own draw call. |
| 7 | `core.md`: all caches share one byte budget. `track.md`: slice sprites are not in it. `light-fx.md`: pool, bulb and light canvas are not in it. | `track.md` and `light-fx.md` are right. A slice keeps up to 3 sprites on its own record (`src/render/track/layer.ts:683-692`), gate sprites sit in a plain map (`:413`), and the lighting canvases are plain canvases (`src/render/lighting/pass.ts:97-106`). The shared budget covers the sprite bank, terrain chunks, the static layer, scenery, show and car sprites. |
| 8 | `core.md`: 1,606 hex literals, 734 distinct, in `src/render`. `drafts-constraints.md`: 1,602 and 730. | 1,606 literals of the form `#rrggbb`; 733 distinct when upper and lower case are folded (grep). Also 108 `rgb(` or `rgba(` literals with numbers, 105 lines that call `shade(`, 205 `fillStyle` and 91 `strokeStyle` assignments. |
| 9 | `drafts-constraints.md`: guests have "3 walk frames". Others: walk codes 0–3. | The frame has 4 pose codes: 0 stand, 1 and 2 steps, 3 sit (`src/render/sprites/props.ts:166-175`, `src/render/sprites/bank.ts:148`). A walking guest alternates 2 of them (`src/render/renderer.ts:548`). |
| 10 | `scenery.md`: the script "scales the picture up 2×". `track.md`: it saves × 4. | The script saves × 4 (`CONCEPTS/pixel3.py:785`). The × 2 image is the board asset `CANVAS/assets/ui-world-desktop.png` (1280 × 800), which equals the raw frame × 2 (`drafts-constraints.md` checked this pixel by pixel). |
| 11 | `terrain.md` says, unchecked, that a path item on an elevated deck is drawn at ground height. `light-fx.md` says the light of a lamp on a deck is placed at a fixed height. | Both are true, and together they are a visible mismatch. `collectPathItems` takes the height from the ground (`src/render/management/layer.ts:215, 222`). `map.pathItemLevel` is read by the simulation's light map (`src/sim/lighting/lightMap.ts:607`) and by no file under `src/render` (grep). A lamp on a deck is drawn on the ground while its light pool and bulb sit at deck height. |

Smaller points that are not contradictions but differ in wording: the count of functions named `draw…` or
`paint…` under `src/render` is 89 in `drafts-constraints.md`; with class methods and layer hooks included it is 125
(grep). The ghost check and cross badge (`drawGhostIcon`) is counted by `rides-stalls.md` in brackets and again by
`light-fx.md`.

---

## C. Gaps, by the standard sections

### 1. What this area draws: coverage and missing inventory

**Coverage of `src/render` (80 files, 16,922 lines).** Every file is named by at least one map except
`src/render/management/toolOptions.ts` (50 lines), which has no canvas call (grep). No drawing file is uncovered.

**Drawing that no map covers** (found by a grep for `getContext`, `createElementNS` and `svg` over `src/`):

| # | Thing | Where | What it is | Size |
|---|---|---|---|---|
| 1 | Track test chart | `src/ui/track/chart.ts:29-91` | Canvas line chart, 320 × 170 CSS px, backing × `min(3, devicePixelRatio)`, dark box `#0e1925`, grid lines, 10 px `system-ui` text, 3 series with dash patterns; an SVG legend swatch per series (`:11-27`) | 2 functions, about 63 lines |
| 2 | Track piece icons | `src/ui/track/panel.ts:43-139`, used at `:227` | One 44 × 28 CSS px canvas per piece in the builder palette (up to 56 pieces): a 3 px white round line through the piece samples, plus marks for station, brakes, water, tunnel, bank. `track.md` names it in one line only. The file has uncommitted changes from another agent. | 1 function, 93 lines |
| 3 | Guest panel dial | `src/ui/panels/guest.ts:22-58` | Inline SVG half-dial with a 3-stop gradient `#4fb3d9`, `#5fbf6a`, `#f07a3a`, two border ticks and a needle | 1 function, 30 lines |
| 4 | App icon | `public/icons/icon.svg` (4,002 bytes), PNGs made by `scripts/make-icons.ts:14-31` | Hand-written SVG of Frost and Spark with gradients; a Playwright script screenshots it at 180, 192 and 512 px. These three PNGs are the only raster files the release check allows besides `docs/screenshots`. | 1 SVG |

All four are interface art. Phase 7 says the interface is not pixel art
(`docs/superpowers/specs/thrills-and-chills/phase-7-frost-and-spark-interface.md:8`), so they are out of scope unless
the owner decides otherwise. The app icon is the one a brand change would touch.

**Inventories without a count.**

- `people-small.md` §1.3 names six more files that build their own inline SVG icons but gives no count. A grep
  finds 2 or 3 lines with SVG code in each file (`src/ui/overlays/index.ts` 3, the other five 2 each), which fits
  one small icon per file. I did not read the six icons.
- No map lists the interface canvases in one place. There are seven kinds besides the game canvas: card picture
  (`src/ui/decks/card.ts:96-117`), scenery picker (`src/ui/scenery/picker.ts:42`), show picker
  (`src/ui/shows/picker.ts:28`), piece icon (`src/ui/track/panel.ts:50`), test chart (`src/ui/track/chart.ts:39`),
  title art (`src/ui/title.ts:47`), mascot portrait (`src/ui/scenario/mascotArt.ts:112-121`). All size their backing
  store by `min(3, devicePixelRatio)` and none sets `image-rendering`.
- No map states how many screenshots the project keeps: 12 files in `docs/screenshots`, 10 of them of the game. All
  10 show the old art.

**A fact about the approved draft that no map draws a conclusion from.** The draft board itself shows pixel art at
scales that are not whole numbers. Frost (11 × 14 art pixels) is 36 × 46 CSS px in the mood bar, a factor of 3.27;
Spark (13 × 13) is 44 × 44, a factor of 3.38 (`CANVAS/project/DraftDesktop.dc.html:53, 62`); the phone uses 28 × 36
and 34 × 34 (`CANVAS/project/DraftPhone.dc.html:52, 61`). The card pictures are crops stretched by
`width: 100%; object-fit: cover` (`DraftDesktop.dc.html:85`). Only the map and the two bottom mascots (66 × 84 and
78 × 78, a factor of 6, `DraftDesktop.dc.html:114, 116`) are at whole-number scales. So the owner approved uneven
pixels in small interface pictures, but the map itself was shown crisp.

### 2. How it draws: questions no map answers, closed by reading

| Question | Answer |
|---|---|
| What kind of canvas holds a sprite, and can its pixels be read? | `makeCanvas` (`src/render/canvas.ts:12-26`) creates an `HTMLCanvasElement` when a document exists, else an `OffscreenCanvas`, with default context options. Reading pixels is possible in a browser, but nothing in `src/` does it today. The lighting layer has its own factory (`src/render/lighting/sprites.ts:19-27`). The unit-test fake returns 4 bytes from `getImageData` (`tests/unit/render/fakeCanvas.ts:70-71`). |
| Where can a new pass be added without editing the renderer? | `WorldLayer` has five optional hooks (`src/render/layers.ts:55-65`): `drawGround` (after terrain and decals, before objects, every frame; `src/render/renderer.ts:1089`), `collect` and `drawItem` (depth-sorted objects; `:1109`, `:613-616`), `drawAfterObjects` (after weather; `:1116`), `drawOverlay` (`:850-871`). A ground shadow pass fits `drawGround`. Nothing drawn there is kept in the static terrain layer (`:989-1035`). |
| Where would the camera be snapped to an art-pixel grid? | In one place: `offX` and `offY` at `src/render/renderer.ts:1061-1062`. All object anchors of tiles, rides, stalls, scenery and track slices are multiples of 2 world pixels (tile corners are multiples of 32, 16 and 8). Guests, staff and cars are not: they stand at continuous positions (`src/render/renderer.ts:553-554`, `src/render/track/layer.ts:862-865`). |
| Where would zoom be snapped? | In `zoomAt` (`src/render/camera.ts:31-37`) and the per-frame clamp (`:54-60`). Tests pin the range 0.25–2 (`tests/unit/render/camera.test.ts:53-61`) and the wheel factor 1.15 (`tests/unit/ui/controller.test.ts:342-359`). No save or setting holds a zoom, so no migration is needed. The tutorial needs a zoom change of at least 0.25 (`src/ui/scenario/tutorialUi.ts:21, 135`). |
| Does a test hold the smoothing flag? | No (fact 3). |
| Are sprite builds limited per frame? | Only for guests, track slices, cars and terrain (fact 8). |
| Is there a pixel check today? | Nine Playwright files read canvas pixels or save screenshots (`tests/e2e/boot.spec.ts`, `paths.spec.ts`, `afterDark.spec.ts`, `screenshot.spec.ts`, `overview-build3.spec.ts`, `content.spec.ts`, `scenery.spec.ts`, `track.spec.ts`, `shows.spec.ts`). Three compare a value (green above 120, a deck colour within 60 of `#dcc79c`, night darker than 80 % of noon). None compares against a stored picture. |

Claims in the maps without a file and line that a designer might act on:

- `core.md` §2.2: "27 files import `shapes.ts`" and the call counts per primitive are grep counts with no listing.
  My wider grep finds about 1,080 lines that call a drawing primitive of any kit and 406 lines with a direct canvas
  draw call (`fill`, `stroke`, `fillRect`, `drawImage`, `fillText`, `clip`) in `src/render` and the interface art
  files.
- `drafts-constraints.md` §5.1: the free bundle room of about 91 KB gzipped was measured on a `dist` folder built by
  another agent from uncommitted work. It needs a fresh measurement on a clean build.
- `terrain.md` obstacle 9 (a plaza corner square can stay stale across a chunk corner) is a conclusion from reading
  and stays unchecked. It needs a look on screen.

### 3. Sizes and scale: one table that no map has

Art pixels on screen if the art is stored at the draft's resolution (0.5 image pixel per world pixel). The stretch
factor at the blit is then `scale / 0.5 = 2 × zoom × canvas ratio`, whatever the buckets are.

| Device ratio | Canvas ratio from the plan | At zoom 1: canvas px per art px | Whole? | Then stretched by CSS |
|---|---|---|---|---|
| 1 | 1 | 2 | yes | no |
| 1.25 (desktop) | 1.25 | 2.5 | no | no |
| 1.5 (desktop) | 1.5 | 3 | yes | no |
| 2 | 2 | 4 | yes | no |
| 2.625 (phone class) | 2 | 4 | yes in the canvas | × 1.3125, not whole |
| 3 (desktop) | 3 | 6 | yes | no |
| any, `low` quality or `auto` after a step down | 1 | 2 | yes in the canvas | × device ratio |

Wheel steps from zoom 1 at ratio 1 give 2.3, 2.65, 3.04, 3.5 and 4.0 canvas pixels per art pixel going in, and
1.74, 1.51, 1.32, 1.14, 0.99 going out (1.15 to the power of the step; derived). After the zoom has touched a
clamp (2.0 or 0.25), wheel steps no longer return to exactly 1.

The plan values are at `src/perf/quality.ts:64-77`; the backing size is `round(css × ratio)`
(`src/render/renderer.ts:912-913`). For today's vector sprites the resample factor is `scale / bucket`, which is 1
only at scale 0.5, 1 or 2 (`src/render/camera.ts:69-73`).

### 4. Animation: what stops with reduced motion, in one list

No map has the full list. Collected from the maps and checked against the lines they cite.

- Stops: guest walk frames (`src/render/renderer.ts:518-519, 548`), rain motion and lightning
  (`src/render/management/layer.ts:328, 350-357`), ride pin bob (`:450`), beam sweeps and firework particles
  (`src/render/shows/fx.ts:219-225`), the site lamp blink (`src/render/shows/layer.ts:283`).
- Does not stop: flat ride frames (`src/render/anim.ts:82-88` has no check), staff walk and work frames
  (`src/render/management/layer.ts:249-253`), trains, chain dashes, water ripples and spray
  (`src/render/track/layer.ts:719-817`).

Time bases, as the maps agree: rides step per tick only (20 per second, no blending between ticks); guests, staff
and trains are interpolated every frame with `alpha`; effects use `tick + alpha`. So in a pixel style the rides
already move in steps, while people and cars move by fractions of a pixel.

### 5. What a pixel-art version must keep: cross-map notes

The maps agree on the contracts. Three points that span several maps and are stated in none as a whole:

- **Positions that copy today's shapes live outside the art files.** Night bulbs (`src/render/lighting/pass.ts:45-54,
  285-308`), beam and rocket origins (`src/render/shows/layer.ts:270-275`), the selection arrow heights
  (`src/render/renderer.ts:821-823`, `src/render/management/layer.ts:439-441`), guest cull margins
  (`src/render/renderer.ts:563-564`), and the scenery cull formula repeated by hand
  (`src/render/scenery/layer.ts:105-108`). New shapes need new numbers in all of them.
- **Picking never reads pixels** in any area (`src/render/iso.ts:136-167`, `src/input/tools.ts:104-122`,
  `src/render/elevated/pick.ts:33-69`). New silhouettes cannot break a click.
- **The colour rule is one test over the whole folder.** `tests/unit/render/safeColours.test.ts:26-43, 71-82`
  scans every file under `src/render` for 16 old red and green literals. A palette file placed there is scanned.

### 6. What makes pixel art hard here: the three largest obstacles

1. **There is no whole-number pixel grid from art to screen.** Zoom is continuous (`src/render/camera.ts:31-37`,
   `src/input/camera.ts:13-14`, `src/input/controller.ts:280`), the canvas ratio can be 1.25, 1.5 or capped below
   the device ratio and then stretched by CSS (`src/perf/quality.ts:64-77`, `src/styles/main.css:34`), smoothing is
   forced on (`src/render/renderer.ts:1071, 1018`), each sprite's edges are rounded alone
   (`src/render/renderer.ts:340-343`), and the camera offset is a float (`:1061-1062`). Desktop terrain is even
   re-rasterised at the exact fractional scale (`src/render/terrain.ts:414-424, 588-589`).

2. **All art is anti-aliased vector drawing, and the amount of it rules out hand-made sprites.** About 300
   functions paint through `fill`, `stroke`, `arc` and `ellipse` under a scale transform (`src/render/canvas.ts:62-63`);
   Canvas 2D has no switch against anti-aliasing for paths. Frames are generated: up to 800 per rotation for one ride
   (`src/render/anim.ts:57-60`), 6,144 poses per car shape (`src/render/track/layer.ts:840-846`), track at any
   heading, pitch and roll. Image files are forbidden (`scripts/check-release.ts:36-38`). The art tests accept only
   context calls that record fills (`tests/unit/render/content/art.test.ts:59-82`). So the pixel look has to come
   from code that sets whole pixels on a fixed grid, under the existing art functions or in their place.

3. **Colour is blended after the picture is flattened, and sprites are cut where outlines and shadows need room.**
   Night is a smooth multiply over the whole frame (`src/render/lighting/pass.ts:159-162`). Ghosts, weather, field
   and ownership tints and water are alpha blends (`src/render/canvas.ts:64-70`,
   `src/render/management/layer.ts:316-325`, `src/render/terrain.ts:312-317`). The draft gets shadows and light
   pools by rewriting ground pixels and snapping them to the palette (`CONCEPTS/pixel3.py:179-197`), which the game
   cannot do per frame. Rides and large scenery are cut into columns at the footprint
   (`src/render/renderer.ts:350-363`, `src/render/scenery/layer.ts:126-133`), track is cut at every tile border
   (`src/render/track/layer.ts:175-190`), and fences are one sprite per tile edge, so an outline made around each
   sprite appears inside objects or is clipped at their sides.

Obstacles that only one map states and that a designer could miss: draft rides are larger than the game footprints
(`rides-stalls.md` obstacle 9); 40 of 85 ride lines and most scenery details are thinner than one art pixel
(`rides-stalls.md` 3, `scenery.md` 11); the draft has no slopes, cliffs, terrain types or map edge (`terrain.md` 3,
4); the night light grid is fixed to the screen and the art grid to the world (`light-fx.md` 2); a crowd of outlined
guests 8 px apart becomes mostly outline (`people-small.md` 5, 11); a test expects a rebuilt chunk image wider than
300 px, and a chunk at art resolution is about 260 (`tests/unit/render/staticLayer.test.ts:122`,
`drafts-constraints.md` 13).

### 7. Size of the job: totals over all maps, double counts removed

The maps' own headline figures add up to 329 functions and about 9,730 lines (`core` 35 / 830, `terrain` 28 / 810,
`rides-stalls` 35 / 2,270, `track` 33 / 1,190, `scenery` 111 / 1,579, `people-small` 34 / 1,350, `light-fx`
53 / 1,700, `drafts-constraints` 0). That sum counts some code twice and leaves some primitives out.

Counted twice: guest art (3 functions, 145 lines; `rides-stalls` and `people-small`); path items and decals (6 or
7 functions, 177 to 200 lines; `terrain` and `people-small`); the overlays in `renderer.ts` (8 functions, 250 lines;
`core`, `light-fx`, partly `terrain` and `people-small`); terrain tool and elevated ghosts (3 functions, about 137
lines; `terrain` and `light-fx`); the track builder overlay (5 functions, 163 lines; `track` and `light-fx`);
weather, ride pins, hatch, cursor and the Calm and Buzz overlay (6 or 7 functions, about 250 to 290 lines;
`people-small` and `light-fx`); the ghost badge (1 function, 28 lines); the ghost wash, which is part of `buildSprite`.

Each function counted once, with the line figure of the map that owns it:

| Group | What | Functions | Lines | New style must |
|---|---|---|---|---|
| A | **World art baked into sprites or chunks** | **174** | **5,251** | redraw |
| | Flat rides: 19 bodies and the gate mark (`src/render/sprites/rides.ts`, `content/*Rides.ts`) | 20 | 1,453 | |
| | Stalls: 12 bodies with shared pieces (`sprites/stalls.ts`, `content/stalls.ts`) | 12 | 568 | |
| | Park fence and entrance arch (`sprites/props.ts:233-323`) | 2 | 80 | |
| | Guest, balloon, umbrella (`sprites/props.ts:55-210`) | 3 | 145 | |
| | Staff and mascot costumes (`sprites/staff.ts:74-354`) | 6 | 270 | |
| | Path items and decals (`sprites/litter.ts:32-232`) | 6 | 177 | |
| | Scenery: 85 items, 12 theme helpers, fallback (`scenery/art/*`) | 98 | 1,475 | |
| | Terrain: tile painter, paths, queues, plaza, placeholder (`terrain.ts:24-330, 710-733`) | 10 | 280 | |
| | Track painters (`track/paint.ts:173-926`) | 13 | 670 | |
| | Show sites (`shows/art.ts:29-168`) | 4 | 133 | |
| B | **Shared drawing primitives under the art** | **34** | **458** | re-implement |
| | `sprites/shapes.ts` 10, `sprites/content/kit.ts` 8, `scenery/art/kit.ts` 13, `track/paint.ts` `polyline`, `quad`, `band` 3 | | | |
| C | **Sprite, chunk and blit plumbing** | **24** | **482** | wrap |
| | `buildSprite` 1; bank builders 8; `blit`, `blitColumn`, `drawStatic`, frame setup in `renderer.ts` 4; track 5; terrain `build`, `draw` 2; scenery and show blits 4; plus `zoomBucket`, `bucketIndex`, `renderPlan` (24 lines) | | | |
| D | **Per-frame vector effects in the world** | **22** | **759** | decide |
| | Elevated decks 2 / 64; track chain, water, spray, riders, stand-ins 6 / 169; far-zoom guest dots 1 / 31; night pass 6 / 213; show beams, fireworks, glow, site lamp 4 / 151; weather 1 / 45; ride pins 2 / 86 | | | |
| E | **Map overlays and ghosts** | **35** | **1,070** | decide |
| | Ghosts and placement overlays in 8 files 25 / 788; Light overlay 4 / 109; Calm and Buzz 2 / 96; show viewing area and ghost 4 / 77 | | | |
| F | **Card and picker pictures** | **4** | **139** | replace |
| | `drawPreview` 42, `drawTrackPreview` 70, `drawSceneryPreview` 15, `drawShowSitePreview` 12 | | | |
| G | **Interface art** | **13** | **about 560** | out of scope by Phase 7, except mascots |
| | Mascots 7 / 261; icon builders 2 / 117 with 42 icon records; found by this check: piece icons 1 / 93, test chart 2 / 63, guest dial 1 / 30 | | | |
| | **Total** | **306** | **about 8,720** | |

Without the four interface drawings the maps missed, the total is 302 functions and about 8,540 lines. Not in the
table because they are data, not functions: `src/render/palette.ts` (132 lines, to be extended with ramps), the
shape tables `LOOKS` and `carDims` in `track/paint.ts`, and 1,606 hex colour literals in 733 values.

How the total splits by what a designer decides:

- **Must change for any pixel look:** groups A, B, C and F: 236 functions, about 6,330 lines.
- **A cheaper route exists for A:** re-implement the 34 primitives of group B as pixel rasterisers and add one pass
  in `buildSprite`. That touches about 480 lines first, and then most of the 174 art functions lightly, because of
  sub-pixel details, thin lines, direct `arc` and `ellipse` calls (117 call sites of `arc`, `ellipse` or a curve in
  `src/render`, grep) and translucent fills.
- **A design choice:** groups D and E, 57 functions and about 1,830 lines. The approved draft keeps its placement
  marker as smooth vector drawing over the pixel map (`CANVAS/project/DraftDesktop.dc.html:20-30`).
- **Untouched if signatures stay:** geometry, depth sorting, view rotation, caches, picking, the simulation.

Cross-check by grep, independent of the maps: 125 functions or methods named `draw…` or `paint…` under
`src/render`; the 85 scenery items, the staff bodies and all kit primitives have other names, which accounts for
the rest.

Tests that change with the art (collected from the maps): the recorder tests `tests/unit/render/content/art.test.ts`,
`phase6Art.test.ts`, `tests/unit/scenery/art.test.ts`, `tests/unit/render/guestItems.test.ts`,
`tests/unit/render/track/slices.test.ts`, `phase6Render.test.ts`, `tests/unit/track/waterRender.test.ts`, the ring
case in `tests/unit/a11y/palette.test.ts:59-78`; the pipeline tests `tests/unit/render/terrain.test.ts:125-164`,
`staticLayer.test.ts:122`, `tests/unit/paths/layer.test.ts:84-93`; `tests/unit/lighting/layer.test.ts` if the night
method changes; and the two pinned colours in `tests/e2e/paths.spec.ts:106-110` and
`tests/e2e/afterDark.spec.ts:108-125`.

### 8. Open questions

The eight maps hold 116 open questions. Most repeat the same few decisions. In the order in which they block
a design:

1. **Scale policy.** May zoom snap to steps where `2 × zoom × ratio` is whole? What happens at device ratio 1.25,
   on phones above ratio 2, at `low` quality, and below zoom 0.5? Asked by all eight maps.
2. **Art pixel size.** Is 1 art pixel = 2 world pixels fixed, as in the drafts?
3. **Method and tests.** A pixel rasteriser under the existing art functions, a pass after painting, or new art?
   May the recorder tests change, or must new art keep issuing fills on a context?
4. **Palette discipline.** Must every screen pixel be a palette colour? If so, night, ghosts, weather, overlays and
   water need dithered forms. If not, which layers may blend?
5. **Night.** The approved drafts are day only. Smooth darkening over pixel art, or the concept night (dark
   palette, dithered pools, lit pixels in sprites), which needs a night frame in the sprite key?
6. **Outlines across cuts.** Rides and 2 × 2 scenery in columns, track at tile borders, fences per tile edge,
   crowds of guests.
7. **Shadows.** In the sprite as today, or one ground pass as in the draft? A ground pass has a hook
   (`drawGround`) but no data yet.
8. **Sizes.** Draft rides and the draft guest are larger than the game's footprints and bounds. Change the art, the
   bounds, or the game rules?
9. **Terrain.** Slopes, cliffs, the map edge, five terrain types, water motion, path shape. The draft shows none of
   them.
10. **Rotation.** Four real views, or mirrored pairs? Does the light stay on the screen left?
11. **Scope.** Overlays and ghosts, card pictures, mascots, title, icons, app icon. Does the old art leave the
    bundle or stay as a setting?
12. **Themes.** Draft themes recolour the whole world; game themes are scenery sets.

Questions that reading cannot close and that need a measurement or the owner:

- What a pixel pass costs per sprite build on the phone profile. The maps quote only the old figure of 5.1 % of
  main-thread time for sprite builds (`docs/adr/0001-renderer.md:37`). No tests or builds were allowed in this run.
- The current bundle size on a clean build (the 308.8 KB figure comes from another agent's `dist`).
- Whether the 13 draft ramps are colour-blind safe (rule in
  `docs/superpowers/specs/thrills-and-chills/phase-6-polish.md:166`).
- Whether the lamp-on-a-deck mismatch (contradiction 11) and the stale plaza corner (`terrain.md` obstacle 9) are
  to be fixed in this project.
- Whether uneven pixels are acceptable on the map, given that the approved board already shows them on the small
  interface mascots (section C.1).
