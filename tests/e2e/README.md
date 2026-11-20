# End-to-end tests (Playwright)

Two builds share these specs: the website build (default) and the realistic test build (`VITE_ART=real`, the one the
deploy serves at `/real-game/`). Specs that need one build skip themselves in the other.

## Website suite

```sh
npx playwright test --trace off
```

The config builds (`npm run build`) and serves `dist/` with `vite preview` on port 4173 (`PW_PORT` changes it; set it
when another preview may already hold 4173, because a local run reuses whatever answers on the port). CI runs this.

## Realistic suite

The realistic build reads its pictures from `art/real/` next to the page. They are baked, not committed (the release
check keeps raster images out of the repository), so a realistic run needs a bake first:

```sh
node tools/art3d/bake.mjs --out dist-art/real    # all items; the cover goes to dist-art/real/title/
VITE_ART=real npx playwright test --trace off
```

With `VITE_ART=real` the config builds the realistic build, copies the baked art to `dist/art/real`
(`scripts/e2e-real-art.mjs`; it stops with the bake command when there is no baked index), then serves `dist/`.
`REAL_ART_DIR=<folder>` uses another baked folder instead of `dist-art/real` (for example one borrowed from another
checkout). The same flow by hand, to keep one server for several runs:

```sh
VITE_ART=real npm run build && node scripts/e2e-real-art.mjs dist
npx vite preview --port 4393 --strictPort &
PW_PORT=4393 VITE_ART=real npx playwright test --trace off
```

Notes:

- The bake is slow (deploy.yml: about 4 hours cold, 1 hour warm, in headless Chromium on SwiftShader). It keeps a per-item
  cache in `dist-art/cache/`, keyed on the bake tools and each item's input, so only changed items bake again;
  `--only <item>,...` bakes some items and keeps every other valid cached item in the index.
- An art folder baked by an older checkout still loads (the index format only gained optional fields), but pictures
  of items whose bake code changed since are stale, and items added since (for example the tool card objects in the
  `cards` item) are missing: `cards-real.spec.ts` needs the current `cards` item.
- `audio.spec.ts` reads `dist/`, so the realistic suite must be served from `dist/` (as above), not another folder.
- In the realistic build a new sandbox or free-play park opens with the welcome card (title-to-play bridge §3), which
  pauses the game: a test that starts a park from the title calls `dismissWelcome` (helpers.ts) after the title hides.
- The realistic look draws a height step 9.8 px tall, not 8 (`REAL_STEP_PX`): a test that turns a tile height into a
  screen point uses `stepPx(page)` (helpers.ts).
- The realistic build registers no service worker (`src/main.ts`): `offline.spec.ts` is the website's,
  `offline-real.spec.ts` the realistic build's.
