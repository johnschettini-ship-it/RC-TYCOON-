# Intro kit for "Thrills & Chills": style and contract

Mock-ups of a new intro (title) screen: desktop 1280 x 800 and phone 390 x 844 (portrait). Nothing here goes into the game.
Kit folder: `kit3/` with `palette.py`, `base.css`, `shot.cjs`, `check.py`, `STYLE.md`, `example/`. Your design is a folder **beside** `kit3`.

## 1. Palette (`palette.py`)

Index 0 is the lightest tone, the last index the darkest. `col('o0')` returns an RGB tuple; `col('o-1')` is the darkest tone.

| Ramp | Use | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|---|
| g | grass | #f0e07a | #d6c85a | #bdb24b | #98993f | #6f7f3a | #4d6238 |
| s | sand, paths | #ffe9bf | #fbd08e | #f0ae62 | #cf8444 | #9c5a36 | #6e3d2e |
| o | orange to red (Thrill) | #ffd76a | #ffab33 | #f47a1c | #d9501a | #a8301f | #6e2330 |
| t | teal (Chill) | #b4f0e0 | #62d1c0 | #2fa89c | #207a80 | #1a5266 | |
| b | blue | #a9d8ff | #5aa2ee | #356cc4 | #27468c | | |
| v | violet | #c9a4f0 | #9a6bd6 | #6b45a8 | #472d78 | | |
| c | cream to warm grey (walls, steel) | #fff8e6 | #f3e0be | #d3b894 | #a48a78 | #75606a | |
| l | leaves | #c2de62 | #8fc04a | #5a9a44 | #3a7748 | #28554a | |
| w | wood | #d99a5a | #b06a34 | #7a4426 | #4f2c22 | | |
| k | skin of tiny guests | #f8d2a6 | #d99a66 | #9a5e38 | #5e3a26 | | |
| a | water | #8fe3d6 | #52c4bd | #35a0aa | #27788c | | |
| p | pink | #ffb0c0 | #ff7a9a | #d94a78 | | | |
| i | ink, shadows | #6e4470 | #4a2c52 | #2a1a36 | | | |

`FROST_RAMPS` (use `fcol('g0')` or `col('g0', FROST_RAMPS)`) is the same set with four ramps replaced:

| Ramp | Use | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|---|
| g | snow | #ffffff | #eef6ff | #dbe9f7 | #bcd2ea | #93b0d2 | #6f8fb8 |
| s | grey stone | #f4f1ea | #dcd6cc | #bdb5ab | #958d8a | #6d6670 | #4d4856 |
| l | cold leaves | #bfe6cf | #74b596 | #3f8a72 | #2a6660 | #1d4a52 | |
| a | ice | #f2fbff | #c9ecf7 | #9fd6ea | #6fb4d6 | | |

- `INK` = i2 = #2a1a36 (outlines). `ALLOWED` = all 81 colours above, with pure white #ffffff and pure black #000000.
- Also in `palette.py`: `c_table()` (the table `C` of pixel3.py, keys from 1: `C['o4'] == col('o3')`), `nearest(rgb)`, `count_colours(im)`, `reduce_colours(im, 48)`, `rgb('#..')`, `hexs(rgb)`.
- The interface colours of `base.css` (`--ink #1f2340` and so on) are for HTML only. Do not paint them into a PNG.

## 2. Rules of the brief

- **Content:** the name "Thrills & Chills" is the hero. Tagline "Build a park for thrill seekers and chill seekers" (small, or left out). Menu of six items in this order: Continue (the main action), New game, Load, Import, Settings, Credits. Continue and New game are the important two; the others may be smaller. New game, Load and Credits open a panel over the screen (today a white plate about 380 to 440 px wide with a form or a list): you do not draw it, but leave a sensible place and name it in NOTES.txt.
- **No characters:** no mascots (no yeti, no fox), no large people or animals. Tiny guests of 3 to 6 art pixels high are allowed.
- **Original:** nothing may copy the look of an existing game, film or park.
- **Idea in one glance:** one park with a calm cool side (Chill: gardens, water, big wheel, carousel; teal and blue) and a wild warm side (Thrill: coasters, drop tower; orange and red). Overall mood: the warm orange day of the drafts.
- **Pixel art:** palette colours only; at most 48 colours in one picture; no anti-aliasing, no blur, no smooth gradients (flat bands, a checker dither row where it helps); 1-pixel ink outline around main objects; light from the upper left; clean clusters; no noise. Show each picture at one whole-number scale (2x, 3x or 4x) with hard pixels.
- **Menu:** every item at least 44 px high and at least 8 px from its neighbour; on the phone in the lower half of the screen; dark ink on white or on a pale colour; never text directly on a busy picture without a plate.
- **Interface parts** (buttons, plates, panels) use `base.css`: white or pale surface, 3 px ink outline, hard shadow `0 4px 0`, round corners, Fredoka. You may dress them up (a ticket, a sign board), but they must stay clear and buildable with HTML and CSS.
- **Logo:** HTML text in Fredoka ("Thrills" warm, "&" ink, "Chills" cool: class `.logo` with `.t` and `.c`), or pixel lettering drawn as a picture. Large, sharp, readable on both screens.

## 3. Design contract

A design is one folder beside `kit3` (for example `intro/ticket-gate/`) with three files:

- **`make.py`** writes every pixel picture of the design as a PNG into its own folder (1 file pixel = 1 art pixel; scale in CSS, not in the file). Start it with:
  ```python
  import os, sys
  HERE = os.path.dirname(os.path.abspath(__file__))
  sys.path.insert(0, os.path.join(HERE, '..', 'kit3'))
  from PIL import Image, ImageDraw
  from palette import col, INK
  ```
  Save with `im.save(os.path.join(HERE, 'name.png'))`. Pixels are fully opaque or fully transparent.
- **`intro.html`** is one page, no JavaScript. It links `<link rel="stylesheet" href="../kit3/base.css">`, shows the pictures with `<img class="px" src="name.png">` and sets their `width` and `height` in CSS to a whole multiple of the file's size (a 320 x 200 file at 4x: `width: 1280px; height: 800px`). The six menu items carry the attribute `data-menu`, in menu order. One page serves both screens: use `@media (max-width: 600px)` for the phone. To crop a picture, put the `<img>` in a box with `overflow: hidden`; do not stretch it.
- **`NOTES.txt`**: the idea in three sentences; where the New game / Load / Credits panel opens; which parts are pictures and which are HTML.

`base.css` gives: Fredoka (weights 300 to 700), the colour tokens, `* { box-sizing: border-box }`, `html, body` (no margin, full height, no scroll), `.btn` (48 px high, `--surface-2`), `.btn.primary` (`--accent-chill`), `.plate` (white, radius 18 px), `.logo` (set the font-size yourself), `img.px`. Add your own `<style>` in intro.html. `example/` is the plainest valid design (it lies inside kit3, so its two paths differ: read its comments).

## 4. Run the check

```
python3 /tmp/claude-0/-home-user-RC-TYCOON-/29ee6f8c-df84-5112-ac7e-04cfb7614dae/scratchpad/art/intro/kit3/check.py <design folder>
```

It runs make.py, checks every PNG that make.py wrote or that the page shows (alpha 0 or 255 only, at most 48 colours, every colour in `ALLOWED`), renders intro.html with Chromium and writes `desktop.png` and `phone.png` into the folder. For each screen it prints: font Fredoka loaded or not, the scale of every picture, and every menu item with its size.
**FAIL** (exit code 1, the design is not finished): a missing file; a picture rule broken; a picture that did not load, or that is not shown at one whole-number scale with hard pixels; font not loaded; base.css not linked; fewer than six visible `data-menu` items; an item under 44 px high; two items closer than 8 px; an item outside the screen. **warn** does not fail but needs a look (a menu item in the upper half of the phone, a wrong menu order, a picture on a fraction of a pixel). After a pass, open `desktop.png` and `phone.png` with the Read tool and judge them with your eyes: the check cannot see beauty, contrast or a logo hidden behind a button. Render only: `NODE_PATH=/home/user/RC-TYCOON-/node_modules node kit3/shot.cjs <design folder>`.

## 5. Copying helpers from `concepts/pixel3.py`

pixel3.py cannot be imported: it reads `sys.argv` and paints a whole scene when it loads. Copy the lines you need into your make.py. They read these globals, so define them first:

```python
import math, random
from PIL import Image, ImageDraw, ImageChops
from palette import c_table, INK
W, H = 640, 400                        # size of YOUR picture in art pixels (the helpers clip and mask with it)
OX, OY = W // 2, H // 2 - 197          # screen position of tile (0, 0); tile (12.5, 12.5) lands in the centre
C = c_table()                          # pixel3 colour keys, from 1: C['g1'] is the lightest grass
TH = {'shadow': ('i2', 0.3)}           # theme switches: TH['shadow'], TH.get('snowcap'), TH.get('torchlamps'), TH.get('bare')
NIGHT = False; TZ = 20
PALETTE = list(dict.fromkeys(C.values()))
frame = Image.new('RGB', (W, H), C['g2'])   # every helper paints into this global; use 'RGBA' and (0, 0, 0, 0) for a cut-out
```

- **Geometry:** `scr(x, y, z)` maps a tile position to a pixel: one tile is 32 x 16 pixels, z is height in pixels. `ibox`, `icyl`, `icone` draw an isometric box, cylinder and striped cone into a `Layer`.
- **`Layer`** is a transparent sheet; `flush()` adds the 1-pixel ink outline around everything on it and pastes it into `frame` (`Layer(outline=False)` for thin far parts). `stamp(rows, x, y, cmap)` paints a text sprite; `P(x, y, colour)` one pixel.
- **Depth:** an object function (`carousel(x, y)`, `wheel`, `tower`, `stall`, `fountain`, `tree_round`, `tree_pine`, `bush`, `lamp`, `bench`, `flowerbed`) does not paint at once. It marks its shadow (`sh_ell`, `sh_box` into the image `shadow`) and stores a painter with `add(key, fn)`. Paint in this order: the ground into `frame`, then `apply_shadows()`, then `for key, fn in sorted(items, key=lambda it: it[0]): fn()`. Also copy `snap`, `mix`, `inside`, `glow` (it does nothing by day), `items`, `add`, and the sprite tables that the object uses (HORSE, GONDOLA, CAR, LAMP, BENCH, ICE, CUP, BURGER, SHIRTS).
- **Fixed parts:** `coaster()` takes no position (its track points are tiles 5.5 to 10.5); move it by changing the list `cp`. `ground()` needs `tile_type`, `PATH`, `WATER`, `h3`, `vnoise`, `BAYER` and is tied to the draft's map: write your own ground for a new composition.
- **Sizes in art pixels:** carousel 81 x 86, wheel 81 x 131, tower 49 x 139, coaster 157 x 116, stall 39 x 34, fountain 31 x 30, trees 21 x 26 to 30, lamp 5 x 12. The drafts are 640 x 400 at 2x (desktop) and 195 x 422 at 2x (phone).
- **Do not copy:** the sprites FROST, SPARK and BOO (mascots) and the two `sprite(...)` lines that place them. `GUEST` is 12 pixels high and `KID` 7: too large for this brief, so draw your own guests of 3 to 6 pixels.
- **Colours:** the full draft scene has 51 to 52 colours, more than the limit of 48. Use fewer shirt, hair and skin tones, or call `reduce_colours(im, 48)` before you save.

## 6. Five tips for clean pixel scenes

1. **Draw small, show large.** Pick the scale first: a desktop picture of 640 x 400 at 2x (the look of the drafts), 320 x 200 at 4x (bold, good for lettering), or a 3x picture in a cropped box; a phone picture of 195 x 422 at 2x. Never resize a finished picture, except with `Image.NEAREST` by a whole number.
2. **Three flat tones for each surface,** from one ramp: lit, base, shade. The light comes from the upper left, so tops and left faces are light, right faces dark, and shadows fall to the lower right as one flat darker shape. Add a 1-pixel highlight on upper left edges. No fourth tone "for softness".
3. **Outline objects, not everything.** Each main object goes on its own `Layer` and gets a 1-pixel ink outline; ground, water, far hills and small marks (tufts, flowers) get none. Paint from back to front. PIL shapes are hard-edged as long as you never paste through a grey mask and never use a blur or a rotate.
4. **Bands, not gradients.** A sky or a lawn is 3 to 5 flat bands; where two bands meet, one or two checker rows (`(x + y) % 2`) are enough. Dither only there, never over a whole area.
5. **Clusters, calm and count.** No lonely pixels except planned marks; place tufts and guests with a fixed seed and a minimum distance (see `example/make.py`). Keep large calm areas where the logo and the menu will sit, and put the detail beside them. Print `count_colours(im)` in make.py and stay at or under 48.

## 7. Three tips for laying a menu over a picture

1. **Reserve the boxes first.** Decide where the logo, the menu and the opened panel sit on both screens, then compose the picture around them: heroes (wheel, coaster, tower) outside these boxes, calm ground or sky inside. On the phone six items take about 350 px (two at 56 px, four at 48 px, 12 px apart), so the picture's subject belongs in the upper half.
2. **Always a plate.** Text stands on white or a pale surface with the 3 px ink outline and the hard shadow; a `.btn` is its own plate and may sit on the picture. Keep 12 px between buttons (the shadow takes 4 px of the gap; under 8 px fails). No see-through plates and no blur: they turn the picture behind the text into mud.
3. **Keep interface and picture on one grid.** Place plates and pictures on whole pixels, best on multiples of the picture's scale, so that an edge never cuts an art pixel. Interface outlines stay 3 px whatever the scale of the art. If a sign board or a ticket is a picture, show it behind a real button: the picture is the `<img class="px">`, the label stays HTML text.
