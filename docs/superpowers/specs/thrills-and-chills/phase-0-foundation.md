# Phase 0 — Foundation

- **Build:** 1 ("The Big Build")
- **Master spec:** [`../2026-11-09-thrills-and-chills-design.md`](../2026-11-09-thrills-and-chills-design.md)

## 1. Goal
An empty park that the player can look around, on desktop and on a phone. The code base, tests, CI, and deploy are ready for every later phase.

## 2. Depends on
Nothing.

## 3. Scope
1. Vite + TypeScript scaffold with `npm` scripts.
2. GitHub Actions CI and GitHub Pages deploy.
3. Seeded RNG, calendar and clock, `GameState` factory.
4. Height-aware map model (all heights 0 in Build 1) and map generator.
5. Fixed-step game loop with pause and speeds.
6. Isometric math, terrain chunk cache, renderer frame.
7. Camera with mouse, keyboard, and touch control.
8. Tile picking and tile highlight.
9. HUD shell and toolbar shell, responsive for phone and desktop.
10. Architecture test, unit tests, smoke tests.
11. README with the originality statement.

## 4. Detailed design

### 4.1 Scaffold
| Script | Command | Purpose |
|---|---|---|
| `dev` | `vite` | Local dev server. |
| `build` | `tsc --noEmit && vite build` | Typecheck, then static build into `dist/`. |
| `preview` | `vite preview` | Serve `dist/` locally. |
| `test` | `vitest run` | Unit and integration tests. |
| `bench` | `vitest bench --run` | Benchmarks. |
| `typecheck` | `tsc --noEmit` | Types only. |
| `e2e` | `playwright test --trace off` | Smoke tests against `vite preview`. |

- Dev dependencies only: `typescript`, `vite`, `vitest`, `@playwright/test`. No runtime dependencies.
- `vite.config.ts` sets `base: './'` so the build works under the GitHub Pages sub-path.
- `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, target ES2022.
- `.gitignore`: `node_modules`, `dist`, `test-results`, `playwright-report`.

### 4.2 CI and deploy
- `.github/workflows/ci.yml` runs on every push and pull request:
  1. `npm ci`
  2. `npm run typecheck`
  3. `npm test`
  4. `npm run build`
  5. `npx playwright install --with-deps chromium`
  6. `npm run e2e`
- `.github/workflows/deploy.yml` runs on push to `main`: build, then `actions/upload-pages-artifact` and `actions/deploy-pages`.
- The owner enables GitHub Pages once (master spec, section 12).

### 4.3 RNG
- `mulberry32` with a 32-bit state stored in `GameState.rng`.
- API: `next(state): number` in [0, 1), `int(state, min, max)` inclusive, `pick(state, array)`, `chance(state, p)`.
- The RNG mutates only `GameState.rng`.

### 4.4 Time
- Pure functions from master spec 6.2: `clockOf(tick)`, `dayOf(tick)`, `monthOf(tick)`, `yearOf(tick)`, `seasonOf(tick)`.
- Tick 0 = 00:00, 1 March, Year 1 (master rule R1). A new game starts at tick 450 (09:00). The functions use the formulas in master 6.2 with no offset.
- `formatDate(tick)` returns, for example, `Mar · Year 1 · 09:00`.

### 4.5 Map generator
- Input: `{ width: 64, height: 64, seed }`.
- Output: all tiles grass, height 8 (ground level, master R2), slope 0, water 0.
- The outer ring of tiles is not owned (`owned = 0`). All other tiles are owned (`owned = 1`).
- The renderer draws the park fence on every edge between an owned tile and a tile that is not owned (master R3).
- The south edge is the row `y = 63`. The park entrance tile is `(31, 63)`: `content = parkEntrance`, `owned = 1`. A 3-tile footpath stub `(31, 62)`, `(31, 61)`, `(31, 60)` leads into the park (Phase 1 uses it; Phase 0 draws it).
- Terrain colour varies per tile from a seeded noise value (two grass shades) so the ground is not flat-looking.

### 4.6 Game loop
- `loop.ts` exposes a pure function `advance(accumulatorMs, elapsedMs, speed) → { ticks, accumulatorMs }` so tests can check it without a browser.
- Tick length: 50 ms at 1×, 25 ms at 2×, 12.5 ms at 4×.
- At most 10 ticks per frame. Extra time is dropped, so game time slows instead of jumping.
- The loop stops on `document.hidden` and restarts on `visibilitychange`.
- Speed state lives in the loop, not in `GameState`. Saves do not store speed. A loaded game starts paused.

### 4.7 Isometric math (`render/iso.ts`)
- Constants: `TILE_W = 64`, `TILE_H = 32`, `STEP_PX = 8`.
- `tileToScreen(x, y, z)` → `{ sx: (x − y) × 32, sy: (x + y) × 16 − z × 8 }`.
- `screenToTileFlat(sx, sy)` → the inverse at z = 0, floored to a tile.
- `pickTile(map, sx, sy)`:
  1. Start at the flat estimate.
  2. Walk candidate tiles front-to-back along the screen column for the maximum map height.
  3. Return the first tile whose top face (with its height and slope) contains the point.
- On a flat map `pickTile` equals `screenToTileFlat`. A test checks this for 10,000 random points.

### 4.8 Renderer
- Canvas size = CSS size × `devicePixelRatio`. Resize on `ResizeObserver`.
- `Renderer` interface: `resize(w, h, dpr)`, `draw(state, camera, toolState, alpha)`.
- **Terrain cache:** 16 × 16-tile chunks. Each chunk is drawn once into an offscreen canvas per zoom bucket (0.5, 1, 2). A chunk redraws only when its dirty flag is set.
- **Frame order:**
  1. Clear to the sky/background colour.
  2. Draw visible terrain chunks.
  3. Draw depth-sorted objects (fence, entrance; later phases add more).
  4. Draw the tile highlight and tool ghosts.
- **Culling:** only chunks and objects whose screen box meets the viewport.
- Zoom between buckets scales the nearest bucket image.

### 4.9 Camera (`render/camera.ts`)
- State: `centerX`, `centerY` (world pixels), `zoom` (0.25–2.0).
- Bounds: the camera centre stays inside the map's screen box plus a margin of 4 tiles.
- `zoomAt(screenPoint, factor)` keeps the world point under the cursor or pinch centre fixed.
- Keyboard pan speed: 600 screen px per second, scaled by 1 / zoom.

### 4.10 Input (`input/`)
All input uses Pointer Events. The canvas has `touch-action: none`.

| Input | Action |
|---|---|
| Mouse left drag on the map (Inspect tool) | Pan |
| Mouse right or middle drag | Pan (any tool) |
| Mouse wheel | Zoom toward the cursor, factor 1.15 per notch |
| Arrow keys, WASD | Pan |
| `+`, `−` | Zoom toward the screen centre |
| One finger drag (Inspect tool) | Pan |
| Two fingers | Pinch zoom and pan together |
| Tap | Select tile (highlight stays) |
| Mouse move | Highlight follows the cursor |

- **Drag threshold:** 6 CSS px. Below it, a press counts as a tap or click.
- **Gesture rules:** when a second finger touches, the current one-finger action cancels and the pinch starts. When fingers lift, no tap fires.
- `ToolState` holds `{ tool: 'inspect', hoverTile, selectedTile }` in Phase 0.

### 4.11 HUD and toolbar shell
- **Top bar:** park name, cash, date and clock, speed buttons (pause, 1×, 2×, 4×).
- **Toolbar:** bottom of the screen when the viewport is narrower than 900 CSS px; left side when wider. Phase 0 shows only the Inspect button.
- **Buttons:** at least 44 × 44 CSS px, with `aria-label` and a visible label on wide screens.
- **Safe areas:** padding uses `env(safe-area-inset-*)` for phones with notches.
- The viewport meta tag disables page zoom so pinch goes to the game.

### 4.12 README
- Title, one-line pitch, screenshot (added in Phase 1).
- How to run: `npm install`, `npm run dev`.
- How to test: `npm test`, `npm run e2e`.
- Controls table (desktop and touch).
- Originality statement: "Thrills & Chills is an original fan-made game in the theme-park management genre. It has no affiliation with any company or other game. All art, names, and sounds are original and generated in code."

## 5. State and entity changes
`GameState` in Phase 0:
```ts
interface GameState {
  schemaVersion: 1;
  seed: number;
  rng: number;          // mulberry32 state
  tick: number;         // starts at 450 (09:00)
  nextId: number;
  map: MapState;        // master spec 6.3
  park: { name: string; cash: number /* cents */ };
  modifiers: Modifiers; // master rule R7, all neutral in Build 1
}
```
- Start cash: $15,000 (Phase 1 value, shown in the HUD now).

## 6. Commands added
None. Phase 1 adds the command system.

## 7. UI
- Desktop: top bar, left toolbar, full-screen canvas.
- Phone (portrait and landscape): top bar compresses to cash, date, and speed; bottom toolbar; canvas fills the rest.
- Loading: a simple "Loading…" text until the first frame draws.

## 8. Tuning constants (`src/data/tuning.ts`, starting values)
| Name | Value |
|---|---|
| `TICKS_PER_SECOND` | 20 |
| `TICKS_PER_HOUR` | 50 |
| `HOURS_PER_DAY` | 24 |
| `DAYS_PER_MONTH` | 3 |
| `MAX_TICKS_PER_FRAME` | 10 |
| `MAP_SIZE_BUILD1` | 64 |
| `CHUNK_SIZE` | 16 |
| `ZOOM_MIN` / `ZOOM_MAX` | 0.25 / 2.0 |
| `ZOOM_BUCKETS` | 0.5, 1, 2 |
| `WHEEL_ZOOM_FACTOR` | 1.15 |
| `DRAG_THRESHOLD_PX` | 6 |
| `CAMERA_MARGIN_TILES` | 4 |
| `START_CASH` | 1,500,000 cents |

## 9. Tests
**Unit (Vitest)**
- RNG: same seed gives the same sequence; `int` stays in range; distribution check over 100,000 draws (each bucket within 2% of expected).
- Time: tick 0 → `Mar · Year 1 · 00:00`; tick 450 → `Mar · Year 1 · 09:00`; tick 3,600 → April; tick 43,200 → March, Year 2; season boundaries.
- Map generator: size, ground height 8, outer ring not owned, entrance position and ownership, stub path.
- Iso: `tileToScreen` and `screenToTileFlat` round-trip for every tile; `pickTile` equals the flat result on a flat map for 10,000 random points.
- Loop: `advance` gives the right tick count for each speed; cap of 10 ticks; paused gives 0.
- Camera: bounds clamp; `zoomAt` keeps the anchor point fixed (error < 0.5 px).
- Architecture: no file in `src/sim/` imports from outside `src/sim/` or `src/data/`.

**Smoke (Playwright)**
- Desktop (1280 × 800): page loads; no console errors; the canvas has non-background pixels; wheel zoom changes the zoom readout (debug attribute `data-zoom` on the canvas); speed buttons change the active state.
- Phone (Playwright `Pixel 7` profile): page loads; no console errors; a two-finger pinch sent through CDP `Input.dispatchTouchEvent` changes `data-zoom`; a one-finger drag changes `data-camera-x`.

## 10. Done when
- `npm run build` output loads from a sub-path (checked with `vite preview --base`).
- The map renders, pans, and zooms with mouse, keyboard, and touch.
- The highlight follows the cursor on desktop and the tapped tile on touch.
- All unit and smoke tests pass in CI. The deploy workflow publishes the site.

## 11. Risks and open questions
| Risk | Mitigation |
|---|---|
| iOS Safari gesture conflicts (page zoom, rubber-band scroll). | `touch-action: none`, viewport meta, `overscroll-behavior: none`, and a manual test on a real iPhone before Build 1 ships. |
| Blurry canvas on high-DPI screens. | Size the backing store by `devicePixelRatio`; draw sprites at the zoom bucket × DPR. |
| Pinch tests are flaky in headless browsers. | Use CDP touch events with fixed timing; retry once in CI only. |
