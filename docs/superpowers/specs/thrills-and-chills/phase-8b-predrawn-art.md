# Phase 8b: Predrawn pixel art (design)

- **Status:** Draft for owner approval (2026-11-12).
- **Replaces:** the live-drawing approach of `phase-8-pixel-art.md` (stopped by the stage 0 result, `phase-8-stage-0-report.md`). The art goals of that spec stay: the look of the owner's approved draft, hard square pixels, ink outlines, the colour ramps, the stepped zoom.
- **Owner decision (2026-11-12):** "Let's switch to predrawn." The owner also said that a large download is acceptable ("I've downloaded games with gigs on my phone").

## 1. Goal

The game shows pixel-art pictures that were drawn once, when the game is built. During play the phone only copies finished pictures to the screen. This removes the slow picture builds that stopped stage 0 (kill rule 4), and it lets the art come from any source (the code-drawn pictures first; hand-made pictures later) without a code change.

## 2. Structure

```
BUILD TIME   drawing code ──► tools/sheets (Node) ──► dist/art/<group>-<hash>.png + art-index-<hash>.json
FIRST VISIT  loading bar ──► download every sheet ──► service worker cache (exists: public/sw.js precaches hashed assets)
PLAY         index lookup ──► drawImage from a sheet; ground: tile pieces laid into chunk images
```

1. **The sheet tool** (`tools/sheets/`, new, runs in `npm run build` before Vite). It runs the pixel drawing code of the stage 0 prototype (`PixelSurface`, the primitive twins, the carousel twin, the guest stamps, the ground painter; branch `phase8-stage0-proto`) in Node. `PixelSurface` is plain arrays, so it needs no canvas. It encodes PNG with `node:zlib` (no new dependency). It packs the pictures into sheets by group (rides, stalls, scenery, people, props, ground) and writes one index.
2. **The index** (`art-index-<hash>.json`): for each picture key (`kind:defId:rotation:frame`, for example `ride:carousel:2:5`) the sheet, the rectangle and the anchor point in art pixels.
3. **The loader** (`src/art/loader.ts`, new): on the first visit it shows a loading bar before the title screen, downloads the index and every sheet, and decodes them (`createImageBitmap`). Later visits read the files from the service worker cache. On a failed download it shows an error with a Retry button; it never starts the game with missing pictures.
4. **The renderer** (changed): where it builds a sprite today, it looks the picture up in the index and copies it. The terrain layer lays ground tile pieces into chunk images.
5. **Colour changes** (placement ghosts, tinted builds): a canvas filter on the copied picture, cached per picture and tint. No extra sheets.
6. **Zoom:** pictures exist at one art scale. The screen uses the crisp zoom levels of `phase-8-pixel-art.md` §7 (the grid check passed in stage 0, kill rule 2), so every level is a whole-number enlargement.

## 3. Rules that change

| Rule today | New rule | Why |
|---|---|---|
| First load ≤ 400 KB gzip of JS and CSS (`scripts/check-release.ts:29`) | Stays for JS and CSS. New: total art download ≤ `ART_TOTAL_MAX_MB` (20 MB, provisional); first-visit loading time ≤ `ART_LOAD_MAX_S` (8 s on the Playwright "Fast 4G" profile, provisional) | The owner accepts a large download; the code stays small |
| Image files only for icons and screenshots (`check-release.ts:37-39`) | Also images that the sheet tool wrote into `dist/art/`, each listed in the index; none committed under `src/` or `tests/` | The art is still made by the project |
| Live sprite builds with limits 3 ms (ride) and 12 ms (chunk) | A picture copy needs no build; the chunk limit (12 ms) stays for the ground assembly | Stage 0 limits stay fixed (`phase-8-pixel-art.md` §10.2) |

## 4. Stage 0b: the test

A throwaway worktree, as stage 0. It answers one question: do predrawn pictures meet the speed limits on the slow phone, at an acceptable size and loading time?

**Scope:** the objects of the stage 0 test park: carousel, big wheel, snack shack, the six scenery items, bench, lamp, guests, and flat ground tile pieces (grass, path, queue), in 4 view directions and every animation frame.

**Kill rules of stage 0b (fixed before the test):**

| # | Condition | Result |
|---|---|---|
| B1 | The predrawn pictures differ from the stage 0 live pictures of the same objects (pixel compare of the after pictures). | Repair the tool, then repeat. |
| B2 | Phone, CPU throttle 4, `scene phone`: frame p95 above 40 ms at k = 2. | Stop, or k = 3 for phones if k = 3 passes (as kill rule 3a). |
| B3 | Phone, CPU throttle 4: a ground chunk assembly above 12 ms, or the slowest frame after a view turn above 100 ms. | Stop. |
| B4 | Desktop `scene build1` frame p95 above 20 ms. | Stop. |
| B5 | The projected total art download for the whole game above `ART_TOTAL_MAX_MB`, or the first-visit load above `ART_LOAD_MAX_S`. | The owner decides (a smaller art scale, fewer frames, or a larger limit). |
| B6 | Today's look changes (the recorder tests, `classic-ops` compare). | Repair, then repeat. |

Each timing run uses the load gate and the repeat rule of the stage 0 plan; the repeat run decides. Each measure is reported next to today's look on the same test.

**Owner gate:** the owner sees the pictures (they equal stage 0, by B1), the numbers and the loading screen. The full build starts only after the owner says yes.

## 5. After stage 0b (outline only)

1. Build the sheet tool for every object; switch the game to predrawn pictures; delete the live drawing code of today's look (with the owner's approval).
2. Improve the art picture by picture. A sheet can be replaced by hand-made art in the same format; the index check proves that no picture is missing.

## 6. Open points

- The source of the final art (code-drawn, an artist, or an art tool) is the owner's choice for step 5.2; stage 0b uses the code-drawn pictures.
- Sloped ground and water need more tile pieces; stage 0b covers flat ground only and reports the count for the whole game.
- The provisional limits `ART_TOTAL_MAX_MB` and `ART_LOAD_MAX_S` are set by the owner before the full build.
