# Phase 7: the title screen, design E (the skyline)

The owner chose this design for the title screen (Task 15 of Phase 7). Sections 1 to 7 are the designer's porting
notes (`PORTING.md` of the mock-up, unchanged). Section 8, "In the game", holds the rules of the game build; where they
differ from sections 1 to 7, section 8 wins. In particular, section 8's panel rule replaces the panel rules of section 3
(the panel table, the scene sink and rise, the smaller name) and section 6 (the notch, the pressed menu item).

Code: `src/ui/title.ts`, `src/ui/titleScreen/layout.ts` (every place and scale), `src/ui/titleScreen/picture.ts`
(decoding), `src/ui/titleScreen/art/*.json` (the pictures). Generator scripts: `tools/title-art/`. Tests:
`tests/unit/ui/titleLayout.test.ts`, `tests/unit/ui/titlePicture.test.ts`, `tests/e2e/title.spec.ts`.

Everything needed to build this screen in the game with HTML, CSS and a canvas. All design decisions are made here; the
mock-up pages `intro.html`, `intro-nosave.html` and `intro-panel.html` with `style.css` (plus `../kit3/base.css`) are the
reference. The game ships no image files: the four pictures come as JSON data (`json/*.json`, written by `export.py`).

## 1. The pictures

| Data file | Size (art px) | What | Shown at |
|---|---|---|---|
| `scene-wide.json` | 960 x 400 | desktop scene | `--s` of the desktop layout |
| `scene-tall.json` | 450 x 470 | phone scene | `--s` of the phone layout |
| `logo-line.json` | 496 x 62 | the name on one line | desktop from 1024 px wide |
| `logo-stack.json` | 176 x 118 | the name on three lines: "Thrills", a violet "&" between an orange and a blue rule, "Chills", all centred | phone; desktop 900 to 1023 px wide |

Sizes from `export.py` (JSON without spaces; gzip level 9):

| File | Raw bytes | Gzip bytes | Colours |
|---|---|---|---|
| scene-wide.json | 156,241 | 19,580 | 46 |
| scene-tall.json | 75,537 | 9,898 | 44 |
| logo-line.json | 33,698 | 3,285 | 13 |
| logo-stack.json | 23,317 | 2,444 | 13 |
| **total** | **288,793** | **35,207** | (limit 40,000) |

Format: `{"w": W, "h": H, "palette": ["#rrggbb", ...], "rows": [[[paletteIndex, runLength], ...], ...]}`. One list of
runs per row, left to right; the runs of a row add up to `w`; index `-1` is a transparent pixel (only the logos have
them). Every other pixel is fully opaque.

Important art rows and columns (used by the layout rules below):

- `scene-wide`: row 0 is entirely `#ffe9bf`. Ride tops (the tower's flag) at row 134. A shaded, outlined knoll fills
  the lower left (crest at row 230, its right slope reaches the bottom row at column 250); the menu stands on it. The
  coaster's left foot is column 168 (a small station there carries the start of the track; the knoll hides its lower
  left corner). The skyline that must always be seen is columns 168..492 (coaster with station 168..278, its lift hill
  crest at row 149 with a two-car train; tower 282..310; carousel 315..383; wheel 391..489; outlines one column wider).
  Rows 288..300 are the promenade; a flat path (rows 352..358) runs from the
  knoll to a landing stage on the lake. No object crosses the window edges of the tested sizes (columns 512, 640, 683
  at 2x; 56 and 696 at 3x), and no lawn object crosses the edges of the open panel (columns 166 and 386 at 2x, 313 at
  3x): the one autumn tree on the lawn stands at column 412, right of them. The knoll carries its props only on its
  flat crest (rows 229..231: trees, a pine, a bench, two guests); its slope has only flat patches of a lighter and a
  darker grass tone, grass tufts and a few 2-pixel flowers (no outline, nothing taller than 2 px). The far hills are
  round domes (sand on the Thrill side, teal from column 400 on the Chill side): one flat body, a lit rim on the upper
  left, a short wedge of shade under the right slope only (no crescents, no arches); no hill starts with a vertical
  edge. The sun (a white disc, radius 11, centre 250, 133) stands above and right of the coaster's crest in two calm
  warm bands (pale yellow, peach) that are higher than wide.
- `scene-tall`: row 0 is entirely `#ffe9bf`. Ride tops at row 190 for the closed layout rule; the tower's flag tip
  (the highest ride pixel) is row 194, used by the open-sheet rule. The promenade's bottom edge is row 314; the lawn below
  it (rows 315..469) is where the menu stands. Columns 138..317 hold the whole skyline, with free gaps: tower 138..154,
  coaster 155..214 (a lift hill, a round crest with one car on it, a drop, a second hump; a clean 2-pixel track), carousel
  220..254 (a dark teal room, one white centre pole, two white horses on gold poles), wheel 259..317 (radius 27, hub
  at row 227) on the far bank (row 270) of a lake (rows 271..301). The lake's left shore is a curved sand bank (from
  column 276 at the far bank to 262 at the promenade) under a round lawn headland; outlines one column wider; free
  columns between the rides. No
  object crosses the window edges (columns 97, 122, 127, 131 at the left, 318, 322, 328, 353 at the right).

### Drawing a JSON picture on a canvas (whole-number scale, no smoothing)

Decode once into a canvas of the picture's own size (1 canvas px = 1 art px), then let CSS scale it by a whole number
with hard pixels. This is exactly what the mock-up does with `<img class="px">`.

```js
// data = the parsed JSON picture
function pictureCanvas(data) {
  const { w, h, palette, rows } = data;
  const rgb = palette.map((c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
  const img = new ImageData(w, h);            // starts fully transparent
  const px = img.data;
  let p = 0;
  for (const runs of rows) {
    for (const [i, n] of runs) {
      if (i < 0) { p += 4 * n; continue; }    // transparent run
      const [r, g, b] = rgb[i];
      for (let k = 0; k < n; k++) { px[p] = r; px[p + 1] = g; px[p + 2] = b; px[p + 3] = 255; p += 4; }
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').putImageData(img, 0, 0);
  canvas.className = 'px';                    // CSS: image-rendering: pixelated; display: block;
  return canvas;
}
```

CSS for the canvas: `image-rendering: pixelated; width: calc(W px * var(--s)); height: calc(H px * var(--s));` — never
a fractional scale, never `object-fit`. If the game draws into one big canvas instead, use
`ctx.imageSmoothingEnabled = false` and `ctx.drawImage(pictureCanvas(data), x, y, w * s, h * s)` with whole-number `s`,
`x`, `y`. Give the name canvas `role="img"` and `aria-label="Thrills & Chills"` (the mock-up uses the alt text).

## 2. Colours

| Use | Colour |
|---|---|
| Sky above the pictures (CSS `background` of the page and the screen) | `#ffe9bf` |
| Warm sky bands round the sun, inside to outside (in the pictures) | sun `#fff8e6`, `#ffab33`, `#ffd76a`, `#fbd08e` |
| Top band (row 0 of both scenes) = CSS sky; also the ring between the warm halo and the cool haze | `#ffe9bf` |
| Cool haze bands, inside to outside (in the pictures) | `#62d1c0` (t1), `#8fe3d6` (a0), `#b4f0e0` (t0) |
| Scrim over the scene while the panel is open | `rgba(255, 233, 191, 0.55)` (a veil of the sky colour, 55 %) |

The warm colours (sun halo plus the pale top band) take about 60 % of the sky: 64 % at 1280 x 800, 61 % at 1280 x 720,
58 % at 1366 x 768, 52 % at 1920 x 1080, 77 % at 1024 x 768 (the narrow window sees mostly the sun's side), 64 % at
390 x 844, 65 % at 375 x 667, 64 % at 412 x 915, 61 % at 768 x 1024 (sky pixels of the scene in the window). The teal
haze rises in round arcs (centre right of the wheel) over the wheel and the lake up to the top of the window, and never
touches the halo (a ring of the top colour lies between them). The scrim is a pale veil, not a dark one: the orange day
fades back instead of turning grey, and the sun stays a white disc.

Only `#ffe9bf` is needed in CSS: the bands are part of the pictures, and the top row of each scene is all `#ffe9bf`, so
the CSS colour continues the sky without a seam. Interface colours come from `base.css` (`--ink #1f2340`,
`--surface #ffffff`, `--surface-2 #eef0f7`, `--accent-chill #56b4e9` for the primary button, `--surface` (white) for
New game when there is a saved park, `--muted-ink #4d5170`).

## 3. Layout rules (exact CSS)

`--s` is the whole-number scale of the scene and the name. All rules are media queries; `round()` keeps every picture on
whole pixels. The screen is `position: fixed; inset: 0; overflow: hidden; background: #ffe9bf`.

```css
/* ================= DESKTOP: from 900 px wide ================= */
@media (min-width: 900px) {
  .screen { --s: 2; --mb: 32px; --h1: 68px; --h2: 56px; --h3: 52px; --gap: 12px; }
  /* scene: bottom anchored; art column 168 (the coaster's foot) lands at x = 336 px, right of the menu */
  .scene-wide { position: absolute; bottom: 0; left: calc(336px - 168px * var(--s));
                width: calc(960px * var(--s)); height: calc(400px * var(--s)); }
  /* name: centred on the window and in the free sky above the ride tops (ride top = 100vh - 266 * s) */
  .name { position: absolute; z-index: 2; --nw: 176px; --nh: 118px;  /* logo-stack below 1024 px wide */
          left: round(calc(50% - var(--nw) * var(--s) / 2), 1px);
          top: max(12px, round(calc((100vh - 266px * var(--s) - var(--nh) * var(--s)) / 2), 1px)); }
  .name canvas { width: calc(var(--nw) * var(--s)); height: calc(var(--nh) * var(--s)); }
  .menu { position: absolute; z-index: 2; left: 32px; bottom: var(--mb); width: 288px;
          display: grid; grid-template-columns: 1fr 1fr; gap: var(--gap); }
  /* panel: 12 px right of the menu, on the menu's bottom line, as high as its content (--ph). While it is open the
     scene sinks just far enough that the ride tops (266 art px above the picture's bottom) lie 8 px under the
     panel's top edge: the coaster and the tower stand wholly behind the panel, never cut by it */
  .screen { --ph: 380px; }
  .panel { position: absolute; z-index: 2; left: 332px; bottom: var(--mb); width: 440px; height: var(--ph); }
  .panel-open .scene-wide { bottom: min(0px, calc(var(--mb) + var(--ph) - 8px - 266px * var(--s))); }
}
@media (min-width: 1024px) { .name { --nw: 496px; --nh: 62px; } }          /* logo-line */
@media (min-width: 900px) and (max-height: 768px) {                         /* compact menu */
  .screen { --mb: 24px; --h1: 60px; --h2: 56px; --h3: 46px; --gap: 10px; }
}
@media (min-width: 1536px) and (min-height: 1000px) {
  .screen { --s: 3; --ph: 508px; }            /* a larger panel on the larger screen: the scene sinks less */
  .panel { padding: 26px 28px 30px; gap: 18px; }  .panel h2 { font-size: 32px; line-height: 38px; }
  .panel .row { gap: 6px; }  .panel .row span { font-size: 16px; line-height: 20px; }
  .panel .row i { height: 62px; border-radius: 12px; }  .panel .actions .btn { height: 64px; font-size: 22px; }
}
@media (min-width: 2304px) and (min-height: 1440px) { .screen { --s: 4; } }

/* ================= PHONE: below 900 px wide ================= */
@media (max-width: 899px) {
  /* ROW menu by default (short phones, tablets) */
  .screen { --s: 2; --mb: 32px; --mh: 116px; --h1: 60px; --h2: 60px; --h3: 46px; --gap: 10px; }
  /* scene: centred; the promenade's bottom edge (row 314) sits 8 px above the menu */
  .scene-tall { position: absolute; width: calc(450px * var(--s)); height: calc(470px * var(--s));
                left: round(calc(50% - 225px * var(--s)), 1px);
                top: calc(100vh - var(--mb) - var(--mh) - 8px - 314px * var(--s)); }
  /* name: logo-stack, centred in the free sky above the ride tops */
  .name { position: absolute; z-index: 2; --nw: 176px; --nh: 118px;
          left: round(calc(50% - 88px * var(--ns, var(--s))), 1px);
          top: max(12px, round(calc((100vh - var(--mb) - var(--mh) - 8px - 124px * var(--s) - 118px * var(--s)) / 2), 1px)); }
  /* row menu: 12 columns; Continue 7, New game 5 (no save: New game 12); the four small buttons 3 each */
  .menu { position: absolute; z-index: 2; left: 0; right: 0; bottom: var(--mb); margin: 0 auto;
          width: min(100% - 32px, 560px); display: grid; grid-template-columns: repeat(12, 1fr); gap: var(--gap); }
  .menu .btn { grid-column: span 3; }  .menu .btn.new { grid-column: span 5; }  .menu .btn.go { grid-column: span 7; }
  .nosave .menu .btn.go { grid-column: 1 / -1; }
  /* bottom sheet: as high as its content (379 px), at most 60 % of the window, scrolling inside beyond that */
  .panel { position: absolute; z-index: 2; left: 0; right: 0; bottom: 0; margin: 0 auto; width: min(100%, 560px);
           max-height: round(down, 60vh, 1px); overflow: auto; }
  /* while the sheet is open the name moves to the top (12 px) and the scene RISES so that the flag tip (row 194)
     stands 8 px under the name: the skyline shows between the name and the sheet. It never rises so far that the
     picture's bottom row leaves the window bottom. */
  .panel-open .name { top: 12px; }
  .panel-open .scene-tall { top: max(calc(12px + 118px * var(--ns, var(--s)) + 8px - 194px * var(--s)),
                                     calc(100vh - 470px * var(--s))); }
}
.name canvas { width: calc(var(--nw) * var(--ns, var(--s))); height: calc(var(--nh) * var(--ns, var(--s))); }
/* short phones: while the sheet is open the name is drawn at 1x so that the skyline still shows above the sheet */
@media (max-width: 899px) and (max-height: 739px) { .panel-open .screen { --ns: 1; } }
@media (max-width: 599px) and (min-height: 740px) {                         /* COLUMN menu: tall phones */
  .screen { --mh: 252px; --h1: 64px; --h2: 56px; --h3: 48px; --gap: 12px; }
  .nosave .screen { --mh: 184px; }
  .menu { grid-template-columns: 1fr 1fr; }
  .menu .btn { grid-column: auto; }  .menu .btn.new, .menu .btn.go { grid-column: 1 / -1; }
}
@media (max-width: 899px) and (min-width: 600px) and (min-height: 900px) { .screen { --s: 3; } }
```

What the rules give at the tested sizes:

| Window | Layout | Scale | Name | Menu form | Menu block | Scene box (x, y, w x h) |
|---|---|---|---|---|---|---|
| 1280 x 800 | desktop | 2 | line 992 x 124 at 144, 72 | 2 + 2 x 2 | 264 px | 0, 0, 1920 x 800 |
| 1280 x 720 | desktop | 2 | line at 144, 32 | compact | 238 px | 0, -80 |
| 1366 x 768 | desktop | 2 | line at 187, 56 | compact | 238 px | 0, -32 |
| 1920 x 1080 | desktop | 3 | line 1488 x 186 at 216, 48 | 2 + 2 x 2 | 264 px | -168, -120, 2880 x 1200 |
| 1024 x 768 | desktop | 2 | line at 16, 56 | compact | 238 px | 0, -32 |
| 390 x 844 | phone | 2 | stack 352 x 236 at 19, 34 | column | 252 px | -255, -76, 900 x 940 |
| 375 x 667 | phone | 2 | stack at 12, 14 | row | 116 px | -262, -117 |
| 412 x 915 | phone | 2 | stack at 30, 70 | column | 252 px | -244, -5 |
| 768 x 1024 | phone (tablet) | 3 | stack 528 x 354 at 120, 71 | row | 116 px | -291, -74, 1350 x 1410 |

Cropping: the desktop scene is cut at the right (and, at 3x and 4x, at the left: only the knoll); its top sky rows are
cut when the window is lower than 400 x s. The phone scene is cut on both sides (centred) and at the top. Wherever the
window is taller than the picture, the flat `#ffe9bf` continues the sky. The desktop picture covers windows up to
1920 px wide at 2x, 2712 px at 3x, 3504 px at 4x.

While a panel is open (`intro-panel.html`):

| Window | Scene box | Panel box | Name |
|---|---|---|---|
| 1280 x 800 | 0, 128 (sunk 128 px) | 440 x 380 at 332, 388 | 144, 72 |
| 1280 x 720 | 0, 56 (sunk 136) | 440 x 380 at 332, 316 | 144, 32 |
| 1366 x 768 | 0, 104 (sunk 136) | 440 x 380 at 332, 364 | 187, 56 |
| 1920 x 1080 | -168, 146 (sunk 266) | 440 x 508 at 332, 540 | 216, 48 |
| 1024 x 768 | 0, 104 (sunk 136) | 440 x 380 at 332, 364 | 16, 56 |
| 390 x 844 | -255, -96 (risen 20) | sheet 390 x 379 at 0, 465 | 2x at 19, 12 |
| 375 x 667 | -262, -250 (risen 133) | sheet 375 x 379 at 0, 288 | 1x 176 x 118 at 100, 12 |
| 412 x 915 | -244, -25 (risen 20) | sheet 412 x 379 at 0, 536 | 2x at 30, 12 |
| 768 x 1024 | -291, -208 (risen 134) | sheet 560 x 379 at 104, 645 | 3x at 120, 12 |

Not covered: landscape phones (phone layout lower than about 600 px, desktop layout lower than about 700 px): the name
would touch the rides. Show a "turn your phone" hint or accept it.

## 4. The menu

No big plate: each button is its own plate (`.btn` of `base.css`: 3 px ink outline, radius 12 px, hard shadow
`0 4px 0 var(--ink)`, Fredoka 600, dark ink text). Every menu button carries `data-menu`.

Desktop (block 288 px wide, left 32 px, bottom 32 px; compact: bottom 24 px):

| Item | Size | Compact | Look |
|---|---|---|---|
| Continue + line "Maple Hollow · Year 2" (13 px, weight 500) | 288 x 68 | 288 x 60 | primary `--accent-chill`, 21 px |
| New game | 288 x 56 | 288 x 56 | white `--surface`, 21 px (the quiet second button) |
| Load, Import | 138 x 52 each | 138 x 46 | `--surface-2`, 18 px |
| Settings, Credits | 138 x 52 each | 138 x 46 | `--surface-2`, 18 px |
| gaps | 12 px | 10 px | |

Phone, column form (tall phones, `max-width: 599px` and `min-height: 740px`): left and right 16 px, bottom 32 px
(28 px free under the button shadow, outside the gesture zone); Continue (blue) full width x 64, New game (white)
full width x 56, then a 2 x 2 grid of 48 px buttons, gaps 12 px: 252 px.
Phone, row form (all other phone-layout windows): width `min(100% - 32px, 560px)` centred, bottom 32 px, 12 grid
columns; Continue (blue, 7 columns: 196 px on a 375 px phone) and New game (white, 5 columns: 137 px) side by side x 60
(19 px text), then Load, Import, Settings, Credits in one row x 46 (3 columns each, 16 px text), gap 10 px: 116 px.
Desktop: block 68 + 56 + 52 + 52 + 3 x 12 = 264 px; compact 60 + 56 + 46 + 46 + 3 x 10 = 238 px.

## 5. The two states

- **A saved park** (`intro.html`): Continue (primary, blue, larger, with the park line "Maple Hollow · Year 2"), New game
  (white, quieter and smaller: the second button), Load, Import, Settings, Credits.
- **No saved park** (`intro-nosave.html`, class `nosave` on `<body>`): no Continue. New game is the primary button (blue)
  in Continue's place and size (desktop 288 x 68, phone column full width x 64, phone row full width x 60) with the line
  "Start your first park". Then Load, Import, Settings, Credits as before. The column menu is then 184 px high, which
  moves the phone scene and the name down by itself (`--mh`).

## 6. The panel (New game, Load, Credits)

`intro-panel.html` shows it with the title "New park", three grey form rows (label 14 px weight 600 `--muted-ink`, field
44 px, `--surface-2`, 2 px border `#c9cddd`, radius 10 px) and two buttons Back (`.btn`) and Start (`.btn.primary`), each
52 px high in a grid `1fr 1.4fr`, gap 12 px. The panel is a `.plate` of `base.css` (white, 3 px ink outline, radius 18 px,
hard shadow), padding 18 px 20 px 20 px, gap 12 px, title Fredoka 700 26 px / 30 px.

- **Scrim:** while a panel is open, a layer `position: absolute; inset: 0; background: rgba(255, 233, 191, 0.55)` lies
  over the scene (z-index 1): a veil of the sky colour, so the scene fades back into the orange day (no grey). The name,
  the menu and the panel lie above it (z-index 2) at full strength. In a canvas: `ctx.fillStyle = 'rgba(255,233,191,0.55)';
  ctx.fillRect(0, 0, w, h)` after drawing the scene, before the name.
- **Content (fixed gaps, never spread):** padding 18 px 20 px 20 px, gap 12 px between title, rows and buttons; title
  Fredoka 700 26 px / 30 px; each row a label (14 px / 18 px, weight 600, `--muted-ink`) over a field 44 px high
  (`--surface-2`, 2 px border `#c9cddd`, radius 10 px), gap 4 px; Back (`.btn`) and Start (`.btn.primary`) 52 px high
  in a grid `1fr 1.4fr`, gap 12 px, 6 px above them. That is 380 px with the border (`--ph`). At 3x (from 1536 x 1000)
  everything is larger: padding 26/28/30, gap 18, title 32/38, labels 16/20, fields 62, buttons 64 (22 px text): 508 px.
  The panel is a `.plate` of `base.css` (white, 3 px ink outline, radius 18 px, hard shadow).
- **Desktop:** 440 px wide, `left: 332px` (menu right edge + 12 px), `bottom` = the menu's bottom (32 px, compact 24 px),
  height `--ph` (380 px; 508 px at 3x). While it is open the scene picture sinks (CSS `bottom` of the scene =
  `min(0, mb + ph - 8 - 266 * s)`) until the ride tops lie 8 px under the panel's top edge: the coaster and the tower are
  wholly behind the panel at every size, never cut; the carousel (at 3x) and the wheel stand free to its right; the
  sky continues above the sunk picture. In the game this is a short slide (for example 200 ms) of the scene canvas.
  A notch (triangle 14 px, ink, with a 10 px white triangle inside) on its left edge points at the middle of the menu
  item that opened it; that item looks pressed (`translateY(2px)`, shadow `0 2px 0`).
- **Phone:** a bottom sheet: `left: 0; right: 0; bottom: 0; margin: 0 auto; width: min(100%, 560px)`, as high as its
  content (379 px: padding 10 px 20 px 36 px, gap 8 px, a grab bar 48 x 6 px, title 24 px / 28 px, three rows, Back and
  Start 48 px), at most 60 % of the window (scrolling inside beyond that), no bottom border, top corners round 24 px.
  While it is open the name moves to the top (12 px) and the scene rises so that the tower's flag tip stands 8 px under
  the name: the skyline (tower, coaster crest, carousel roof, wheel) shows between the name and the sheet edge, which
  covers only the ride bases and the promenade. On phones lower than 740 px the name is drawn at 1x while the sheet is
  open (`--ns: 1`), so that the skyline still shows there.

## 7. Checks

`python3 make.py` writes the PNGs; `python3 export.py` writes `json/` and proves every JSON file equals its PNG;
`NODE_PATH=/home/user/RC-TYCOON-/node_modules node shots.cjs` renders the three pages at the nine sizes into `shots/` and
warns about menu items under 44 px (main under 56 px), closer than 8 px, outside the window, pictures off a whole-number
scale or off whole pixels, and less than 24 px free under the phone menu.


## 8. In the game

### Rules of the game build (G1 to G13)

- **G1. Numbers from one pure function.** `titleLayout` computes every position and scale. `title.ts` writes them to the screen element as CSS custom properties and `data-` attributes (`data-kind`, `data-menu`, `data-scene`, `data-name`), and runs it again when the window size or the size of the menu block changes (`ResizeObserver`). Do not use the CSS function `round()` (older browsers do not have it). Every position and every picture size is a whole number of CSS px.
- **G2. The menu height is measured.** `menuH` is the real height of the menu block. PORTING's fixed `--mh` values (252, 184, 116) are what the menu must measure at text scale 100% (± 1 px); they are not constants in the code. `menu` and `compact` depend only on `w` and `h`; positions depend on `menuH`.
- **G3. Kinds.** `low` when `h < 500` and `w > h` and `w <= 960` (landscape phones). Else `desktop` when `w >= 900`, else `phone`. Desktop and phone follow PORTING §3 (scales, scene anchor, menu form, name form), with G4 to G6.
- **G4. The name fits the window.** The name is never wider than `w - 8`. Desktop: the form is `line` when `496 * nameS <= w - 32`, else `stack`. Phone: always `stack`. `nameS` starts at `s` and goes down by 1 while the name is too wide.
- **G5. The name never touches the rides.** "Ride top" is the y of the highest ride pixel row (wide: row 134; tall: row 190). The name fits when `nameY >= 12` and `nameY + name height <= ride top - 8`, with `nameY = max(12, round((ride top - name height) / 2))`. When it does not fit: (a) move the scene down by the missing amount, at most `50 * s` px on the desktop and `14 * s` px on the phone and in the low kind; (a2) the phone kind under a top safe inset (`safe.top > 0`; with all insets 0 nothing changes): when the name still does not fit, its top margin becomes 6 px (plus `safe.top`) and its gap to the ride tops 4 px, and the scene moves down by the amount still missing, at most `14 * s` px (390 × 844 with insets top 47 and bottom 34: `nameS` 2, `nameY` 53); (b) if that is not enough, lower `nameS` by 1 and try again from the start; (c) at `nameS = 1`, move the scene down as far as needed, at most `75 * s` px, and accept an overlap beyond that. On the desktop the scene is anchored to the bottom (`sceneY = h - 400 * s` plus the move), so "down" cuts lawn rows. `Math.round` is the rounding everywhere.
- **G6. The low kind** (PORTING leaves it open): the wide scene at `s = 1`; `sceneX = clamp(round(w / 2 - 330), w - 960, 0)`; the menu is one row of six buttons (it may wrap), centred, `mb = 12`, width `min(w - 24, 820)`; `sceneY = h - 400 - max(0, mb + menuH + 8 - 99)`; the name is `line` at scale 1 when `w >= 512`, else `stack` at scale 1; then G5. The panel in the low kind is a plate from `top: 8px` to `bottom: 8px`, width `min(560px, w - 16px)`, centred, scrolling inside; it may cover the name.
- **G7. Below the picture.** When the scene's bottom edge is above the bottom of the window (large text, wrapped menu), the last row of the scene is repeated downward, so each column keeps its own colour (lawn under the lawn, lake under the lake): a canvas `w × 1` px made from the picture's last row (`lastRowPicture`), shown at the scene's x and width, from the scene's bottom edge to the bottom of the window, with hard pixels.
- **G9. The picture covers the window.** Desktop: when the scene at PORTING's scale does not reach the right edge of the window (`sceneX + 960 * s < w`), `s` goes up by 1 until it does (for example 2560 × 950 → `s` 3; 3440 × 1300 → `s` 4). G4 and G5 then find the name's scale.
- **G10. The menu grows on large windows.** Desktop: `ms` is 1 for `s <= 2`, 1.25 for `s = 3`, 1.5 for `s >= 4`. The menu block's left, bottom, width, gaps, minimum heights and font sizes are PORTING's values times `ms`. The coaster's foot lands at `x = round(336 * ms)`: `sceneX = round(336 * ms) - 168 * s`. This changes the 1920 × 1080 row of PORTING's table: `sceneX` −84 (not −168), menu block 330 px.
- **G11. Safe areas.** The scene and the fill below it cover the whole window; the name, the menu, the plate and the sheet stay inside the safe area (`--safe-top`, `--safe-right`, `--safe-bottom`, `--safe-left` of `main.css`; `index.html` uses `viewport-fit=cover`). `title.ts` reads the four insets (whole CSS px) from a probe element whose paddings are those properties, passes them to `titleLayout` as `safe`, writes them as `--tl-safe-*`, and runs the layout again when they change (a `ResizeObserver` on the probe's border box). Rules: `mb` is the kind's value plus `safe.bottom`; the name's smallest `nameY` is `12 + safe.top` (in G5 as well); G4 uses the width `w - safe.left - safe.right` in place of `w`, and the name is centred in that safe width; the desktop menu's `left` adds `safe.left`; the phone menu and the low kind's menu row lie between `safe.left` and `w - safe.right` with their margins (16 px and 12 px); the plate and the sheet keep their insets from the safe edges (the desktop plate's left is the menu's left; the low plate lies from `8px + safe.top` to `8px + safe.bottom`, between the safe edges; the sheet's padding adds the insets at the sides and at the bottom). With all four insets at 0 the layout is exactly the one of G1 to G10.
- **G12. The menu height while a view shows.** `menuH` is always the height of the menu block in its current form. While a view shows, the menu stays in the layout with `visibility: hidden` and `inert` (so it can be measured, but no player, screen reader or keyboard reaches it); when the window changes size or turns while a view shows, the scene and the name take the places of the menu form of the new window, exactly as a fresh title of that size with the same view open.
- **G13. Whole pixels for the desktop menu.** The menu block's sizes that come from PORTING's values times `ms` (left, bottom, width, the three minimum heights, the gap) are rounded to whole CSS px (`titleLayout` returns them as `menuBox`; for example at `ms` 1.25 the compact small button 57.5 → 58 and the gap 12.5 → 13). The width is `2 × round((288 × ms - gap) / 2) + gap`, so two small buttons side by side are whole px wide too (1920 × 1080: 361 px, buttons 173 px).
- **G8. Text scale and language.** Font sizes are `calc(Npx * var(--ts, 1))`. PORTING's button heights are minimum heights; a button grows with its text; no text is clipped at 175% or in `en-XA`. When the two small buttons of a row do not fit side by side, they go one below the other. The park line under Continue (`{park} · {date}`, the date as the month and the year without the clock, `SlotInfo.gameDateShort`) is one line and ends with an ellipsis when it does not fit; it never makes the button higher. The Load view and the in-game menu keep the full date with the clock.

### The panel

- As today, the menu hides while a view (`new`, `load`, `credits`, `flow`) shows, and Back returns to the menu. Do not build PORTING's notch, its pressed menu item, its scene sink, its scene rise, or its smaller name.
- A veil lies over the scene while a view shows (`--title-scrim`, a veil of the sky colour); the name and the plate are above it.
- Desktop: the view is on a plate (PORTING §6: white, 3 px ink outline, radius 18 px, hard shadow, padding 18 px 20 px 20 px) in the menu's place: `left` and `bottom` as the menu, width `min(440px * ms, w - 2 * left)`; a wide flow view (scenario select): `min(760px * ms, w - 2 * left)`. Its height is its content, at most `h - bottom - (name bottom + 12px)`; it scrolls inside.
- Phone: a bottom sheet (PORTING §6: full width, at most 560 px, centred, top corners round 24 px, a grab bar, 40 px padding at the bottom). Its height is its content, at most `max(60% of h, h - (name bottom + 12px))`; it scrolls inside.
- Low kind: G6. A wide flow view (the scenario select) uses the width `w - 16px` (less the side insets, G11).
- The plate and the sheet must hold the real views of the game (the New game view has three mode buttons and the free-play form; the scenario select is a grid of cards), at 100% and at 175%.

### Notes of the build

- The picture facts the code depends on are constants in `layout.ts` (`ART`): the sizes; wide scene ride top row 134,
  promenade rows 288 to 300 with 99 lawn rows below, the coaster's left foot at column 168, the skyline middle at column
  330; tall scene ride top row 190, the promenade's bottom edge at row 314.
- A picture is decoded the first time its kind shows (`pictureCanvas` keeps the canvas).
- The menu buttons are the game's `.btn` with the surface outline and the hard shadow (`--outline`, `--shadow`), since
  each one stands on the picture as its own plate. The plate and the sheet use the same tokens.
- Colours: `--title-sky` and `--title-scrim` in `tokens.css`; below a lifted scene the scene's own last row is
  repeated (G7).
- The pictures are the polished export (Task 15b): row 0 of both scenes is all `#ffe9bf` (the unit test checks it).
- `decodePicture` fails loudly on bad data: it throws an Error that names the picture row when a palette index is
  outside the palette (other than -1) or the runs of a row do not add up to `w`, and when the number of rows is not
  `h`.
