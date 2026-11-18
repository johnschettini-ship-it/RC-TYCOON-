# Touch controls and path step builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a phone one finger always moves the map, paths are built with a tap-and-arrow step builder in one single-row panel, drag tools paint only behind a Paint toggle, turning the view and a ride is always one tap away, and a placed ride opens the queue builder at its entrance.

**Architecture:** Input stays pure and DOM-free: the gesture recognizer is unchanged; `InputController.primaryDrag()` and each tool router decide `pan` vs `build` from a new per-tool "drag paints" side table (`src/input/dragPaint.ts`) and from Shift on a mouse press (paths). The step builder is a pure module (`src/input/pathBuilder.ts`) over `ToolState` (side table keyed by the `ToolState` object, like `landToolOf`), driven by map taps from the controller and by the panel. It previews through the existing `previewPathCommand` dry run and sends the existing `buildPathLine` / `buildPath` / `demolish` commands. The panel (`src/ui/paths/index.ts`) replaces the Height mini-bar and the path half of the tool status bar, following the slim track station row (`src/ui/track/panel.ts`).

**Tech Stack:** TypeScript 6, Vite 8, Vitest 5 (node env), Playwright 1.63 (Chromium at /opt/pw-browsers/chromium), axe-core.

**Spec:** `docs/superpowers/specs/2026-11-18-touch-controls-and-path-builder-design.md`

## Global Constraints

- Both builds (website and realistic `?art=real` / `VITE_ART=real`) get the change.
- Old saves load; settings keep `SETTINGS_VERSION = 2` (no new setting: the tip's "seen" flag is its own storage key, `tc.tip.shiftDrag`).
- Build rules and costs do not change: the builder sends only `buildPathLine`, `buildPath` and `demolish`, the commands the game has today; costs come from `previewPathCommand`.
- New strings go into the English tables (`src/data/strings/*.ts`, registered in `en.ts`); `en-XA` is generated. Run `tests/unit/i18n/*`.
- Every new control ≥ 44 × 44 CSS px.
- The path panel is one row of controls and fits (no clipped text, nothing outside the window, no overlap) at 390×844, 360×640, 812×375, text scale 100 and 175.
- Before each commit: `npx tsc --noEmit` and `npx vitest run --maxWorkers=4` green. Commit messages end with the two attribution lines.
- The coaster builder and card decks do not change.

## Review Focus

1. A tap on a tile next to the end that is *diagonal* or two tiles away must move the start, not build — test in Task 2 (`tapAt` with a non-4-neighbour).
2. Undo after a step that only crossed existing path tiles must remove nothing that was there before — test in Task 2 (`undo` keeps pre-existing tiles).
3. A failed step (no cash, blocked) must not move the end or push history — test in Task 2.
4. A second finger during a Paint-toggle drag still cancels and builds nothing — keep the existing patrol/buy-land/level tests green with the toggle on (Task 1).
5. Changing tool mid-build, loading a park, or switching footpath ↔ queue must not leave a stale ghost or a builder end in another world — test in Task 2 (`resetPathBuilder` on world change; end kept across kind switch).

---

### Task 1: One finger pans in every tool; Paint toggle state; Shift-drag lines

**Files:**
- Create: `src/input/dragPaint.ts`
- Modify: `src/input/controller.ts` (`primaryDrag`, `pointer`, `toolChanged`, `act` longPress), `src/input/land/index.ts` (`primaryDrag`, `update`, `gesture`), `src/input/landPurchase/index.ts` (`primaryDrag`), `src/render/terrainTools/toolState.ts` (press start time)
- Test: `tests/unit/ui/dragPaint.test.ts`; update `tests/unit/ui/controller.test.ts`, `tests/unit/ui/management/patrol.test.ts`, `tests/unit/ui/buyLand.test.ts`, `tests/unit/terrain/input.test.ts`, others that drag-build

**Interfaces:**
- Produces: `dragPaints(tool: ToolState): boolean`, `setDragPaints(tool: ToolState, on: boolean): void`, `DRAG_PAINT_TOOLS: ReadonlySet<ToolId>` (`patrol`, `land`, `water`, `buyLand`). The flag resets in `InputController.toolChanged()`.

Rules: `primaryDrag()` → `build` when (footpath/queue and the press is a left mouse press with Shift) or (tool in `DRAG_PAINT_TOOLS` and `dragPaints`); else `pan`. Touch long press in footpath/queue does nothing. Land/water with a mouse and the toggle off: the press applies only after `LAND_REPEAT_MS` held still (then repeats) or on release as a click; a `panStart` stops the press. With the toggle on, today's behaviour.

- [ ] Step 1: tests — `dragPaints` defaults false and resets on tool change; touch drag in footpath/patrol/land/buyLand pans (camera moves, no command); mouse left drag in footpath pans; Shift+mouse drag in footpath builds one `buildPathLine`; with the toggle on, patrol/buyLand/level drags build as before; land mouse drag with toggle off sends no terrain command; land mouse click still applies once; holding still 300 ms applies and repeats.
- [ ] Step 2: run, see them fail.
- [ ] Step 3: implement; update old tests that relied on drag-building to turn the toggle on or press Shift.
- [ ] Step 4: tsc + full vitest green.
- [ ] Step 5: commit `feat(input): one finger pans in every tool; Paint toggle state; Shift-drag paths`.

### Task 2: Path step builder logic

**Files:**
- Create: `src/input/pathBuilder.ts`
- Modify: `src/input/controller.ts` (tap for footpath/queue, `refreshGhost`, `toolChanged`, `worldChanged`), `src/render/types.ts` (`DragState.stepDir?: number`), `src/render/elevated/layer.ts` (`drawGhost` uses `stepDir` for a one-tile ghost)
- Test: `tests/unit/paths/pathBuilder.test.ts`

**Interfaces:**
- Produces:
  - `type StepMove = 'forward' | 'left' | 'right'`
  - `interface PathBuilderState { end: number; dir: Dir; started: boolean; history: StepRecord[] }` (side table `pathBuilderOf(tool)`; `end = -1` when no start)
  - `startAt(game: Game, tile: number, dir?: Dir): void` — moves the start; builds nothing.
  - `tapAt(game: Game, tile: number): void` — a 4-neighbour of a started end: step toward it; else `startAt`.
  - `stepPath(game: Game, move: StepMove): CommandResult | null`
  - `undoStep(game: Game): boolean`
  - `cycleSlope(tool: ToolState): void` (flat → up → down; no-op on ground)
  - `nextStep(game: Game, move?: StepMove): { tiles: number[]; dir: Dir; cost: Cents; reason: string | null } | null` — the ghost of the step (`forward` by default).
  - `refreshPathGhost(game: Game): void` — writes `tool.drag` (tiles, cost, reason, `stepDir`).
  - `resetPathBuilder(tool: ToolState): void`

Command per step (end E, next N toward d, height `z = tool.pathHeight.z`):
- not started (E unbuilt): `buildPathLine` E→N with `pathCommandHeight(tool)` (a two-tile drag today); afterwards `started = true`.
- started, ground (`z === null`): `buildPathLine` N→N.
- started, elevated, flat: `buildPathLine` N→N `{ z, ramp: 'flat' }`; up: `buildPath { x, y, kind, z, rampDir: d }` then `z += 1`; down: `buildPath { …, z: z − 1, rampDir: (d + 2) % 4 }` then `z −= 1`. (Line start: `up` → z + 2 after two tiles, `down` → z − 2, matching `elevatedLinePlan`.)
- `left`/`right` turn `d` by ∓1 (map terms) before stepping. Default heading of a fresh start: away from a 4-neighbour holding a path, else the map direction of view-north (`mapRotationFromView(0, camera.rotation)`).
- A step records only tiles that had no path of that kind at that height before; `undoStep` sends `demolish {x, y[, z]}` for them (paths refund nothing, as today) and restores end, dir, z, started.

- [ ] Step 1: tests — tap sets start, nothing built, ghost = start + forward tile with line cost; Forward builds both via one `buildPathLine`, then one tile per press; Left/Right turn; tap on 4-neighbour of end builds it, diagonal tap moves start; elevated up/down steps send `buildPath` with rampDir and move z; failed step (cash 0) changes nothing; undo removes only new tiles and restores the end; switching footpath ↔ queue keeps the end; world change resets; the cost equals `previewPathCommand`.
- [ ] Step 2: run, see them fail.
- [ ] Step 3: implement; controller tap for path tools calls `tapAt`; Shift-drag still uses the line code.
- [ ] Step 4: tsc + full vitest green.
- [ ] Step 5: commit `feat(paths): step builder logic (tap a start, Forward / Left / Right, slopes, Undo)`.

### Task 3: Single-row path panel and ghost cost tag

**Files:**
- Modify: `src/ui/paths/index.ts` (replace the Height bar), `src/ui/toolStatus.ts` (no longer shows for path tools), `src/data/strings/paths.ts`, `src/styles/main.css`
- Test: `tests/unit/i18n/*` (existing), new `tests/e2e/path-builder.spec.ts`; update `tests/e2e/paths.spec.ts` and any spec using `path-height-*`

**Interfaces:**
- Consumes: Task 2 functions.
- Produces testids: `path-panel`, `path-left`, `path-forward`, `path-right`, `path-slope` (opens `path-slope-menu` with `path-ramp-flat|up|down`, `path-height-down`, `path-height-value`, `path-height-up`), `path-undo`, `path-done`, `path-hint`, `path-cost-tag`.

Row: before a start, `[hint "Tap a tile to start"] [Slope ▾] [Done]`; after, `[◀] [▲] [▶] [Slope ▾] [Undo] [Done]`, icon buttons 44 × 44, 8 px gaps. Holding ◀ ▲ ▶ repeats every 300 ms after a 400 ms hold. The cost tag is a DOM pill over the ghost tile (`worldToScreen` of the ghost's last tile): cost and height ("$12 · +3 m"), or the reason in danger colour. Forward's aria-label carries the cost. Done → Inspect. Kind and height stay in `ToolState` (remembered across tool switches).

- [ ] Step 1: e2e (phone): open Queue, panel visible, hint shown, tap tile → arrows; Forward builds 2 tiles and cash drops by the tag's cost; Undo removes; Done leaves the tool; fit loop over 3 sizes × text 100/175: one row (all buttons share a top within 2 px), each ≥ 44 × 44, inside the window, no clipped text, not over the deck chips.
- [ ] Step 2: run, see fail. Step 3: implement. Step 4: run e2e (both projects) + tsc + vitest. Step 5: commit `feat(paths): single-row step builder panel with ghost cost tag`.

### Task 4: Paint toggles

**Files:** `src/ui/land/index.ts`, `src/ui/management/toolBars.ts` (patrol bar), `src/ui/view/index.ts` (buy land bar), strings (`landUi.ts`, `ui.ts`, `land.ts`), new `tests/e2e/paint-toggle.spec.ts`.

A toggle button (`aria-pressed`, testids `land-paint-drag`, `patrol-paint-drag`, `buy-paint-drag`; labels "Drag to paint" / "Drag to select") calling `setDragPaints`. Touch hints updated.

- [ ] e2e: patrol/land/buy land — a one-finger drag pans and changes nothing; toggle on → the same drag paints / selects; closing the tool resets it. Implement, run, commit `feat(input): Paint toggle for patrol, land and buy land`.

### Task 5: Turning

**Files:** `src/ui/view/index.ts` (both turn buttons always; the one-button phone mode goes), `src/ui/hud.ts` if it moves the parts, `src/styles/main.css`, `src/ui/toolStatus.ts` (large Rotate: `rotate-big`, 56 px), `src/input/controller.ts` (touch tap on a ghost tile turns it), tests `tests/unit/ui/controller.test.ts`, `tests/e2e/rotate.spec.ts`; update specs using `view-turn`.

- [ ] Unit: touch tap inside the ghost footprint turns `tool.rotation` and moves nothing; outside moves it. e2e: both `view-rotate-left/right` visible and ≥ 44 px at the 3 sizes; each turns the view; Rotate button turns a held ride. Implement, run, commit `feat(ui): both view turn buttons on screen; big Rotate; tap the ghost to turn`.

### Task 6: Queue at the entrance

**Files:** `src/input/controller.ts` (command listener), `src/input/pathBuilder.ts` (`startAtEntrance(game, rideId)`), tests `tests/unit/paths/pathBuilder.test.ts`, `tests/e2e/queue-entrance.spec.ts`.

After a successful `placeRide` whose ride has an `entrance`, the tool becomes `queue`, `pathHeight.z = null`, and the builder starts at `entrance.outside` heading away from `entrance.gate`. Forward builds the queue tile at the gate (it links through `gateNode`, rules unchanged).

- [ ] Unit + e2e (place a carousel by tap + Confirm, Forward, the ride's entrance outside tile is a queue). Implement, run, commit `feat(paths): open the queue builder at a placed ride's entrance`.

### Task 7: Shift-drag tip, once

**Files:** `src/ui/paths/index.ts`, `src/data/strings/paths.ts`, `tests/e2e/path-builder.spec.ts`.

On a fine pointer, the first time a path tool opens, the panel shows "Tip: Shift-drag draws a line" with Close; storage key `tc.tip.shiftDrag` = `1` once shown (try/catch; the realistic build prefixes keys itself).

- [ ] e2e desktop: tip shows once, not after a reload. Implement, commit `feat(paths): one-time Shift-drag tip for mouse players`.

### Task 8: Whole-flow checks, screenshots, report

- [ ] Run all affected e2e specs in both builds (`VITE_ART=real` for the realistic one), `tests/e2e/a11y.spec.ts`, fix fallout.
- [ ] Screenshots (390×844 and 812×375, DPR 2, website and `?art=real`): step builder mid-build, ride with Rotate, land Paint toggle → `/home/user/tc-full/.superpowers/sdd/2026-11-18-touch/shots/`; look at each, fix clipping.
- [ ] Write `/home/user/tc-full/.superpowers/sdd/2026-11-18-touch/report.md`.
