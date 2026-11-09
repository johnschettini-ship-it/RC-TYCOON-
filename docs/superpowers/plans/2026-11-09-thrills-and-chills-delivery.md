# Thrills & Chills Implementation Plan — Parallel Delivery

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this plan, one **workstream card** = one agent. Each agent follows TDD inside its card: failing test → minimal code → passing test → commit.

**Goal:** Build the full Thrills & Chills game (Phases 0–6) with many agents working at the same time, in waves separated by integration gates.

**Architecture:** Wave 0 builds the scaffold and every shared contract (state slice types, command registry, tick order, pathing API, renderer interface, catalog data, test helpers). Later waves split the work into workstreams. Each workstream owns a fixed set of folders and works in its own git worktree. An integrator merges all workstreams of a wave, runs the full test suite, and only then starts the next wave.

**Tech Stack:** TypeScript (strict), Vite, Canvas 2D, Vitest, Playwright, GitHub Actions, GitHub Pages. No runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-11-09-thrills-and-chills-design.md` (master) and every file in `docs/superpowers/specs/thrills-and-chills/`. The catalog (`content-catalog.md`) is the single source for content numbers.

## Global Constraints
- No runtime dependencies. Dev dependencies only: `typescript`, `vite`, `vitest`, `@playwright/test`.
- `src/sim/` imports only `src/sim/` and `src/data/`. No DOM, no `Date.now()`, no `Math.random()` in `src/sim/`.
- Money is integer cents. Ratings are integer hundredths (0–1000). Needs are 0–255. Temperament is 0–100.
- 20 ticks = 1 s at 1×. 1 game hour = 50 ticks. 1 day = 1,200 ticks. 1 month = 3 days = 3,600 ticks. Tick 0 = 1 March, Year 1, 09:00.
- Tile = 4 m. Height step = 1 m = 8 px. Tile = 64 × 32 px at zoom 1.
- Player actions change state only through commands. Commands return `{ ok: true, cost, warnings }` or `{ ok: false, reason }` and never throw for player errors.
- Systems iterate entities in ascending id order. Only the seeded RNG in `GameState.rng` is used.
- Saves never fill missing data with defaults. A failed load keeps the current game and shows the error.
- Family-friendly: no crashes, injuries, or guest deaths.
- Original names, art, and sounds only. All graphics and audio are generated in code.
- Player-facing strings match the spec text exactly where the spec gives them.
- Touch targets are at least 44 × 44 CSS px. Every control has a label or `aria-label`.

## Review Focus
1. **Demolish while in use** — a ride, stall, or path removed while guests stand on it, queue for it, or target it. Expected: no guest keeps a dangling target or stands on a non-walkable tile; all re-plan within 1 decision interval. Owner test: W1-D `guests re-plan after target demolished`.
2. **Disconnected network** — a ride or stall with no path to the entrance, or a path island. Expected: guests never target unreachable destinations; lost-guest logic engages; no infinite loops. Owner test: W1-C `unreachable destinations return null`, W1-D `lost guest heads for exit`.
3. **Corrupted or foreign save files** — truncated JSON, wrong `format`, wrong typed-array length, dangling entity reference, future `schemaVersion`. Expected: the exact error message and the current game unchanged. Owner test: W1-F `rejects each corruption class`.
4. **Touch gesture overlap** — a second finger lands during a path drag or ghost placement. Expected: the drag cancels, nothing is built, pinch starts. Owner test: W1-B `second finger cancels build drag`.
5. **Money edge cases** — cash exactly equal to cost, negative cash, a price of $0, month rollover with uneven running costs. Expected: build allowed at exact cash, blocked below; month totals exact to the cent. Owner test: W1-E `ledger month totals exact with remainder`, W1-C `build allowed at exact cash`.

---

## Parallel delivery model

### Waves
| Wave | Content | Agents at once | Gate to finish |
|---|---|---|---|
| 0 | Scaffold, CI, contracts, catalog data, test helpers, boot to an empty map | 1 (integrator) | `npm run typecheck && npm test && npm run build` green; contracts committed |
| 1 | Build 1 core: Phases 0–1 complete, Phase 2 and 3 simulation cores | 9 | Each card's tests green in its worktree; merged branch green |
| 2 | Build 1 integration: track builder UI/render, management UI/render, research-unlocked content, e2e and benchmarks | 4 | Full suite + smoke tests green; Build 1 "done when" lists checked |
| 3 | Build 2: Phases 4–5 (Wave 3.0 contracts first, then 9 cards) | 1, then 9 | Same, plus save migration 1 → 2 (done in Wave 3.0) |
| 4 | Build 3: Phase 6 | up to 7 | Same, plus migration 2 → 3 and release checklist |

### Worktrees and branches
- Each agent works in its own git worktree on a local branch `ws/<card-id>` created from the integration branch `ccr-6f420895-3xt45j`.
- Agents commit only in their worktree. They never push.
- The integrator merges each `ws/*` branch into `ccr-6f420895-3xt45j`, runs the full suite, fixes seams, and pushes.

### Ownership rules
- Each card lists the paths it **owns**. An agent creates and edits files only inside its owned paths and its own test folder.
- **Contract files** (listed under Wave 0) belong to the integrator. An agent that needs a contract change writes it in its final report under "Contract change requests" and works around it inside its own files (for example, with a local adapter). It never edits a contract file.
- Each workstream has its own tuning file `src/data/tuning/<area>.ts`, so tuning edits never conflict.
- Each workstream has its own test folder `tests/unit/<area>/`.

### Agent report (required at the end of every card)
1. What is done, with the test command output summary.
2. Files created or changed.
3. Contract change requests (or "none").
4. Known gaps or risks.

---

## Wave 0 — Foundation and contracts (integrator)

### Task W0.1: Scaffold, CI, deploy
**Files:** Create `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `index.html`, `.gitignore`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `README.md`.
**Produces:** scripts `dev`, `build`, `preview`, `test`, `bench`, `typecheck`, `e2e` exactly as in Phase 0 spec 4.1; `base: './'`; strict tsconfig with `noUncheckedIndexedAccess`.
- [ ] Write `tests/unit/smoke.test.ts` asserting `1 + 1 === 2`; run `npm test` → PASS.
- [ ] Run `npm run build` → `dist/index.html` exists.
- [ ] Commit `chore: scaffold Vite + TypeScript + Vitest + Playwright, CI and Pages deploy`.

### Task W0.2: Core simulation contracts
**Files (contract files):**
- `src/sim/types.ts` — `EntityId`, `Cents`, `GameState`, `World`, `DerivedCache`, `SimEvent`.
- `src/sim/rng.ts`, `src/sim/time.ts`, `src/sim/map.ts` (data model + generator), `src/sim/ids.ts`.
- `src/sim/commands/types.ts` — `Command` union for every Build 1 command, `CommandResult`.
- `src/sim/commands/index.ts` — `executeCommand(world, cmd)` dispatch over a handler registry.
- `src/sim/tick.ts` — fixed system order with hour/day/month boundaries.
- Slice type files, one per owner: `src/sim/guests/types.ts`, `src/sim/rides/types.ts`, `src/sim/rides/track/types.ts`, `src/sim/stalls/types.ts`, `src/sim/economy/types.ts`, `src/sim/staff/types.ts`, `src/sim/park/types.ts`, `src/sim/management/types.ts`.
- Stub system and handler files for every workstream (bodies are no-ops or return `{ ok: false, reason: 'Not implemented yet.' }`). Each stub file sits inside the owning card's paths.

**Interfaces (produced, used by every Wave 1 card):**
```ts
type EntityId = number; type Cents = number;
interface World { state: GameState; cache: DerivedCache; events: SimEvent[] }
function createWorld(opts: { seed: number; parkName: string }): World;
function executeCommand(world: World, cmd: Command): CommandResult;
type CommandResult = { ok: true; cost: Cents; warnings: string[]; id?: EntityId } | { ok: false; reason: string };
function stepTick(world: World): void;           // one tick, fixed system order
function emit(world: World, ev: SimEvent): void;  // UI drains world.events each frame
// time.ts
function clockOf(tick: number): { hour: number; minute: number };
function monthIndexOf(tick: number): number;      // 0 = March Year 1
function formatDate(tick: number): string;        // "Mar · Year 1 · 09:00"
function isHourStart(tick: number): boolean; function isDayStart(tick: number): boolean; function isMonthStart(tick: number): boolean;
// rng.ts
function rngNext(s: GameState): number; function rngInt(s: GameState, min: number, max: number): number; function rngChance(s: GameState, p: number): boolean;
```
- [ ] Tests: rng determinism and range; time table from Phase 0 spec 9; map generator (fence ring, entrance at x = 31 on the south edge, 3-tile stub); `executeCommand` returns the stub reason for an unimplemented command and leaves the state hash unchanged; `stepTick` advances `tick` by 1.
- [ ] Commit `feat(sim): core contracts, rng, time, map, command registry, tick order`.

### Task W0.3: Catalog data
**Files:** `src/data/catalog/flatRides.ts`, `trackRides.ts`, `stalls.ts`, `pathItems.ts`, `staff.ts`, `research.ts`; `src/data/tuning/core.ts`.
**Produces:** typed, frozen arrays matching `content-catalog.md` sections 1–5 and 9 exactly, money in cents, ratings in hundredths. Lookup `getFlatRideDef(id)`, `getStallDef(id)`, `getTrackRideDef(id)`.
- [ ] Test: counts (14 flat rides, 9 track types, 11 stalls, 3 path items, 4 staff); spot-check Carousel row and Flip Arm row values; gate index rule `floor((w − 1) / 2)` helper.
- [ ] Commit `feat(data): content catalog data`.

### Task W0.4: Client contracts and boot
**Files (contract files):** `src/render/types.ts` (`Renderer`, `Camera`, `ToolState`), `src/game.ts` (`Game` facade: world, loop, speed, `dispatch`, event drain), `src/main.ts`, `src/loop.ts` (`advance`).
**Interfaces:**
```ts
interface Renderer { resize(w: number, h: number, dpr: number): void; draw(world: World, cam: Camera, tool: ToolState, alpha: number): void }
interface Camera { centerX: number; centerY: number; zoom: number }
interface ToolState { tool: ToolId; hoverTile: number | null; selectedTile: number | null; rotation: 0|1|2|3; ghost: GhostState | null; drag: DragState | null }
class Game { world: World; speed: 0|1|2|4; dispatch(cmd: Command): CommandResult; onEvents(cb: (evs: SimEvent[]) => void): void }
function advance(accMs: number, elapsedMs: number, speed: 0|1|2|4): { ticks: number; accMs: number };
```
- [ ] Tests: `advance` table (speeds, cap 10, paused 0).
- [ ] Boot shows a placeholder flat-colour diamond map so `npm run dev` works.
- [ ] Commit `feat(client): renderer/camera/tool contracts, game facade, loop`.

### Task W0.5: Test helpers and architecture test
**Files:** `tests/helpers/world.ts` (`makeTestWorld`, `placeFootpath`, `placeQueue`, `placeRideDirect`, `placeStallDirect`, `addGuestDirect`, `runTicks`, `stateHash`), `tests/unit/architecture.test.ts`.
- [ ] Architecture test fails on a deliberately bad import, then passes after removal.
- [ ] Commit `test: helpers and architecture rule`.

**Wave 0 gate:** typecheck, tests, build green. Push. Then start Wave 1.

### Wave 0 result (as built, commit `ee5571d`)
Contract files (integrator only): `src/sim/{types,map,footprint,units,rng,time,ids,events,hooks,tick,world}.ts`, `src/sim/economy/{ledger,types}.ts`, `src/sim/commands/{types,index}.ts`, Phase 1 slice types (`guests/types.ts`, `rides/types.ts`, `stalls/types.ts`, `park/types.ts`), `src/render/types.ts`, `src/game.ts`, `src/loop.ts`, `src/main.ts`, `src/data/catalog/*`, `src/data/tuning/core.ts`, `src/data/strings/en.ts`, `tests/helpers/world.ts`.
Coordination APIs added in Wave 0 (stubs owned by the named card): `guests/api.ts` (`boardRide`, `finishRide`, `leaveQueue`, `forgetDestination`) W1-D; `rides/flat/api.ts` (`stopRide`) W1-E; `stalls/api.ts` (`sellItem`) W1-E; `park/arrivals.ts` (`arrivalsPerHour`) W1-E; `breakdowns/api.ts` (`onRideDispatch`, `reliabilityScore`) W1-H; `litter/metrics.ts` (`cleanliness`) W1-H; `rides/track/api.ts` (`canOpenTrackRide`, `demolishTrackRide`) W1-G; `weather/update.ts` (`weatherArrivalFactor`) W1-I; `marketing/update.ts` (`campaignArrivalFactor`) W1-I; `research/api.ts` (`isUnlocked`) W1-I; `notifications/index.ts` (`notify`) W1-I; `save/index.ts` W1-F.
Slice types owned by their cards (may be extended): `rides/track/types.ts` W1-G, `staff/types.ts` W1-H, `management/types.ts` W1-I.
Guest hooks (`src/sim/hooks.ts`): `litterHooks` W1-H, `weatherHooks` W1-I, `facilityHooks` W2-C.
Scope change: W1-G also implements track-ride guest boarding (former W2-B). Wave 2 has 4 cards.

---

## Wave 1 — Build 1 core (9 agents in parallel)

Every card: read the master spec, the catalog, the listed spec sections, and the Wave 0 contract files first. Write tests first. Do not edit contract files.

### W1-A Render core
- **Owns:** `src/render/**` except `src/render/types.ts`; `tests/unit/render/`.
- **Spec:** Phase 0 §4.7–4.9; Phase 1 §7 (visuals); master §2.5, §6.4.
- **Consumes:** `World`, `Camera`, `ToolState`, catalog defs.
- **Produces:** `createCanvasRenderer(canvas): Renderer`; `tileToScreen`, `screenToTileFlat`, `pickTile`; `clampCamera`, `zoomAt`; `drawPreview(ctx, defId, w, h)` for UI pickers; procedural sprites for terrain, fence, park entrance, footpath, queue (with auto-joined edges), 4 Phase 1 flat rides (animated), 3 stalls, guests (shirt colour, temperament tint overlay), ghosts (valid/invalid with icon).
- **Required tests:** iso round-trip all tiles; `pickTile` = flat inverse on 10,000 points; camera clamp; `zoomAt` anchor error < 0.5 px; depth comparator order; sprite cache key stability.
- **Done:** renders a hand-built test world at 60 fps with 2,000 guests on desktop (manual check with the dev overlay).

### W1-B Input and UI
- **Owns:** `src/input/**`, `src/ui/**`, `src/styles/**`, `index.html` body markup; `tests/unit/ui/`.
- **Spec:** Phase 0 §4.10–4.11; Phase 1 §4.1 (tool behaviour and strings), §4.7, §7.
- **Consumes:** `Game.dispatch`, `ToolState`, `drawPreview`, `pickTile`, `zoomAt`.
- **Produces:** gesture recognizer (pure, testable: pointer event list → actions), tools (inspect, footpath line, queue line, place ride/stall with rotate/confirm/cancel, demolish), HUD, toolbar, pickers, panel framework (side panel ↔ bottom sheet), ride/stall/guest/park/finance panels, toasts, title screen, in-game menu, keyboard shortcuts.
- **Required tests:** gesture recognizer: tap vs drag threshold 6 px, second finger cancels drag and starts pinch (Review Focus 4), long-press 500 ms; path line axis choice; toast queue replaces oldest; keyboard map.
- **Done:** all Phase 1 UI flows work against the stubbed sim (commands return stub reasons as toasts).

### W1-C World simulation (building + network)
- **Owns:** `src/sim/commands/build/**`, `src/sim/pathing/**`, `src/sim/map-ops/**`, `src/data/tuning/world.ts`; `tests/unit/world/`.
- **Spec:** Phase 1 §4.1, §4.2.
- **Produces:** handlers `buildPath`, `buildPathLine`, `placeRide`, `placeStall`, `demolish`; pathing API:
  ```ts
  type DestKey = `ride:${number}` | `stall:${number}` | 'exit';
  function nextStep(world: World, fromTile: number, dest: DestKey): number | null;
  function distanceTo(world: World, fromTile: number, dest: DestKey): number | null;
  function queueOwner(world: World, tile: number): EntityId | null;
  function markNetworkDirty(world: World): void;
  ```
- **Required tests:** every block/warning string; build allowed at exact cash (Review Focus 5); failed command leaves state hash unchanged; queue ownership flood fill; queue tiles excluded from stall/exit fields; tie-break N, E, S, W; unreachable → `null` (Review Focus 2); rebuild all fields < 5 ms on 64 × 64 (bench).

### W1-D Guests
- **Owns:** `src/sim/guests/**` except `types.ts`, `src/data/tuning/guests.ts`; `tests/unit/guests/`.
- **Spec:** Phase 1 §4.3 (all), §4.6 arrival formula (spawn side only).
- **Consumes:** pathing API (W1-C; use a test fake until merge), ride and stall slice types, `rngInt`.
- **Produces:** `updateGuests(world)`, `spawnGuests(world, count)`, `guestThought(world, guest, key)`, `scoreRide(guest, ride, distance): number | Reject`.
- **Required tests:** temperament mean 50 ± 2 over 10,000; derived-value table rows; need rates; each hard reject with its exact thought; thrill vs chill ride ranking; queue join cap and wait timeout; thought de-duplication window; re-plan after target demolished (Review Focus 1); lost guest heads for exit after 2 game hours (Review Focus 2).

### W1-E Rides, stalls, economy, rating
- **Owns:** `src/sim/rides/flat/**`, `src/sim/stalls/**` except `types.ts`, `src/sim/economy/**` except `types.ts`, `src/sim/park/**` except `types.ts`, `src/sim/commands/prices/**`, `src/data/tuning/economy.ts`; `tests/unit/economy/`.
- **Spec:** Phase 1 §4.4–4.6.
- **Produces:** `updateFlatRides(world)`, `updateStalls(world)`, `chargeHourlyCosts(world)`, `rollMonth(world)`, `computeRating(world)`, `arrivalsThisHour(world): number`, `recordLedger(world, category, cents)`; handlers `setRidePrice`, `setStallPrice`, `setEntranceFee`, `setRideOpen`, `setParkOpen`, `renamePark`.
- **Required tests:** cycle timings; load end rules; closing empties queue; hourly charges sum exactly to monthly cost with remainder (Review Focus 5); ledger invariant; rating terms at edges and "no data" values; arrival factors by clock band.

### W1-F Saves
- **Owns:** `src/save/**`; `tests/unit/save/`.
- **Spec:** master §7; Phase 1 §4.7.
- **Produces:** `serialize(world): string`, `deserialize(json): { ok: true; world } | { ok: false; error: string }`, `migrations` table (empty for schema 1), `SaveStore` (3 slots + autosave, `localStorage` guarded), `exportFile`, `importFile`.
- **Required tests:** round-trip deep-equal on the integration fixture; each corruption class rejected with the exact message (Review Focus 3); derived caches rebuilt after load; storage failure path.

### W1-G Track system core (Phase 2 simulation)
- **Owns:** `src/sim/rides/track/**` except `types.ts`, `src/data/track/**`, `src/data/tuning/track.ts`; `tests/unit/track/`.
- **Spec:** `phase-2-coasters.md` §4 (pieces, validation, physics, test run, ratings), §5, §6 (commands).
- **Produces:** piece table, `nextPieceOptions`, `validateTrack`, `simulateTrain` (1D physics per tick), `runTestRun(track, rideType): TestResult`, `ratingsFromTest(result, rideType)`, block-section dispatch, track command handlers.
- **Required tests:** every piece entry/exit state; circuit closure; each validation string; energy conservation without friction (error < 0.5%); chain lift speed; stalled-train detection; worked example from the spec reproduces its ratings to ±0.05.

### W1-H Staff, litter, vandalism, breakdowns (Phase 3 simulation part 1)
- **Owns:** `src/sim/staff/**` except `types.ts`, `src/sim/litter/**`, `src/sim/breakdowns/**`, `src/data/tuning/staff.ts`; `tests/unit/staff/`.
- **Spec:** `phase-3-management.md` sections for staff, litter and mess, vandalism, breakdowns.
- **Consumes:** pathing API (fake until merge).
- **Produces:** `updateStaff(world)`, `updateLitter(world)`, `updateBreakdowns(world)`, staff command handlers.
- **Required tests:** as listed in the Phase 3 spec test section for these systems.

### W1-I Weather, research, marketing, loans, park value, notifications (Phase 3 simulation part 2)
- **Owns:** `src/sim/weather/**`, `src/sim/research/**`, `src/sim/marketing/**`, `src/sim/finance/**`, `src/sim/notifications/**`, `src/data/tuning/management.ts`; `tests/unit/management/`.
- **Spec:** `phase-3-management.md` sections for weather, research, marketing, loans, park value, rating extension, notifications.
- **Produces:** `updateWeather(world)`, `updateResearch(world)`, `updateMarketing(world)`, loan handlers, `parkValue(world)`, `notify(world, n)`.
- **Required tests:** as listed in the Phase 3 spec test section for these systems.

**Wave 1 gate:** integrator merges A → I in order C, E, D, F, G, H, I, A, B; runs the full suite after each merge; resolves contract change requests; pushes.

---

## Wave 2 — Build 1 integration (4 agents in parallel)

| Card | Owns | Spec | Deliverable |
|---|---|---|---|
| W2-A Track builder UI + track rendering | `src/ui/track/**`, `src/input/track/**`, `src/render/track/**` | Phase 2 §7, §4.13 | Build, test, and open a coaster on desktop and touch. |
| W2-B Management UI + render | `src/ui/management/**`, `src/render/management/**` | Phase 3 §7 | Staff, research, marketing, loans, weather, notifications, patrol painting, litter/staff/path-item sprites. |
| W2-C Research-unlocked content | `src/sim/facilities/**`, `src/render/sprites/content/**` | Catalog §1–3 Phase 3 rows; Phase 3 §4.10–4.11 | All 10 new flat rides, 4 new track types, 8 new stalls work and draw. |
| W2-D E2E, benchmarks, integration games | `tests/e2e/**`, `tests/integration/**`, `tests/bench/**` | Each phase §9 | All Build 1 smoke tests and scripted games; budgets measured. |

**Wave 2 gate:** every Build 1 "done when" list checked; full suite green; README updated; Build 1 is ready to merge to `main` (owner decision).

---

## Wave 3 — Build 2 (Phases 4–5)

Wave 3 runs like Waves 0–1: one integrator step (Wave 3.0) lays down every shared contract, then 9 cards run in parallel. Every card: read the master spec (§5–7, §13), `phase-4-land-scenery-after-dark.md`, `phase-5-scenarios.md`, the catalog, the Wave 3.0 result below, and your stub files first. Write tests first. Do not edit contract files; ask for changes under "Contract change requests" in your report.

### Wave 3.0 — Build 2 contracts (integrator)
Deliverables: schema 2 state and its owner type files, save schema 2 with migration 1 → 2, Phase 4–5 command unions with stub handlers, tick order stubs, guest and staff hook call sites, stub APIs for every cross-card query, client extension points (render layers, tool routers, UI registry), the 9 cards below. Gate: typecheck, unit + integration, build, and Playwright green with Build 1 behaviour unchanged.

### Wave 3.0 result (as built, commits `180c192`…`d6dbd54`)
**State (schema 2).** `GameState.schemaVersion: 2` (`STATE_SCHEMA_VERSION`); new games are schema 2. New slices and fields, each type in its owner's file with a factory:
| Item | Type file (owner) | Start value (new game) |
|---|---|---|
| `elevatedPaths: ElevatedPath[]` (`{ id, x, y, z, kind, rampDir }`, sorted by id) | `sim/paths/types.ts` (W3-B) | `[]` |
| `map.pathItemLevel: Int32Array` (0 = ground, else elevated path id; one path item per tile column) | `sim/map.ts` (contract; W3-B writes it) | zeros |
| `scenery: Scenery[]` (`{ id, defId, x, y, z, rotation, edge, waterLevel }`) | `sim/scenery/types.ts` (W3-D) | `[]` |
| `park.afterDark`, `park.landPrice`, `park.rightsPrice` | `sim/park/types.ts` | `true`, 15,000, 6,000 |
| `Guest.z`, `Staff.z` (path node height), `Guest.wetUntilTick` | `sim/guests/types.ts`, `sim/staff/types.ts` | ground height, −1 |
| Staff task `water`, state `watering` | `sim/staff/types.ts` | — |
| `scenario: ScenarioState` (freePlay / sandbox / tutorial / scenario) | `sim/scenario/types.ts` (W3-H); `AwardState` in `sim/awards/types.ts`, `TutorialRun` in `sim/tutorial/types.ts` (W3-I) | `{ kind: 'freePlay', awards: empty }` |
| `monthMetrics: MonthMetrics` (day/night samples, tracked-thought guests, queue waits, broken rides) | `sim/scenario/types.ts` (W3-H) | empty for the current month |
| Terrain editing types (`Corner`, `BrushSize`) and read helpers (`cornerHeightsOf`, `minCorner`, `maxCorner`, `isFlat`, `isWet`, `waterDepth`) | `sim/terrain/types.ts`, `sim/terrain/corners.ts` (W3-A) | — |
Deviation: Phase 5 §5 `endReason?` / `endMonthIndex?` are stored as `… | null`, so a save never has a field that may be absent.

**Saves.** Combinators moved to `save/validate.ts`. Live Build 1 shapes stay in `save/schema.ts` (integrator); each Build 2 slice validator lives in `save/slices/` and belongs to its card (`elevatedPaths.ts` W3-B, `track.ts` W3-C, `scenery.ts` W3-D, `scenario.ts` W3-H, `awards.ts` W3-I) — a card that changes its slice type fixes its own validator (the compiler enforces it). `save/v1/schema.ts` is a frozen, untyped copy of the Build 1 structure check. `migrations[1]` (`save/migrations/v1-to-v2.ts`) follows Phase 4 §5.1 including step 4a, writes literals only, and also sets `wetUntilTick = −1` and empty `monthMetrics`. Errors: step 1 failure → "This save is damaged: …"; a structure failure after the upgrade or a throwing migration → "This save could not be upgraded"; a dangling reference in the old save → "This save is damaged: …". `integrity.ts` checks the new ids (unique across all lists), scenery types, positions, and path item levels. Fixtures `tests/fixtures/save-v1{,-new,-rich}.tcsave.json` were written by the Build 1 code (`180c192`); `tests/unit/save/migrate-v1.test.ts` loads, migrates, validates, round-trips, and plays them on for a game month; `schema-v2.test.ts` covers every new field.

**Commands** (`sim/commands/types.ts`, registered in `commands/index.ts`; every stub returns "Not implemented yet" and changes nothing): `TerrainCommand` (9 terrain and water commands) → `sim/terrain/commands.ts` W3-A; `LandCommand` (`buyLand`) → `sim/land/commands.ts` W3-G; `SceneryCommand` (`placeScenery`, `removeScenery`) → `sim/scenery/commands.ts` W3-D; `AfterDarkCommand` (`setAfterDark`) → `sim/lighting/commands.ts` W3-F; `ScenarioCommand` (`scenarioContinue`, `setSandboxOption`) → `sim/scenario/commands.ts` W3-H; `TutorialCommand` (3) → `sim/tutorial/commands.ts` W3-I. Extended Build 1 commands (optional fields, absent = Build 1 behaviour): `buildPath { z?, rampDir? }`, `buildPathLine { z?, ramp? }`, `demolish { z? }`, `buildPathItem { level? }` (W3-B). `executeCommand` calls `tutorialAfterCommand` after every successful command. Setup mode skips unlock checks in `placeRide`, `placeStall`, `placeStation` (Phase 5 §2). `demolish` on a `Content.Scenery` tile calls W3-D's `removeScenery`.

**Tick order** (`sim/tick.ts`, master R13): month start → `closeMonth` → `monthlyFinance` → `evaluateAwards` (W3-I) → `evaluateObjectives` (W3-H) → `checkLoseConditions` (W3-H) → `resetMonthMetrics` (real body) → `monthEnded`; hour start, after `updateRating` → `hourlyScenery` (W3-D) → `hourlyFields` (W3-E) → `recordSamples` (W3-H) → `hourlyTutorial` (W3-I). Lighting has no tick system (derived light map; render-only darkness). Covered by `tests/unit/core/tick-order-build2.test.ts`.

**Call sites wired into Build 1 code (all neutral until the owner fills its stub):**
| Where | What | Stub owner |
|---|---|---|
| `sim/hookTypes.ts`, `sim/hooks.ts` | `GuestHooks` gains `perHour`, `afterRide`, `onThought`, `onBoard`, `walkSpeed`, `energyFactor`, `nauseaRecoveryFactor`; registry merged lazily (import order no longer matters); test mocks use `emptyGuestHooks()` | lists from `fields/hooks.ts` W3-E, `lighting/hooks.ts` W3-F, `rides/track/waterHooks.ts` W3-C, `scenario/hooks.ts` W3-H |
| `guests/needs.ts`, `guests/update.ts`, `guests/api.ts`, `guests/thoughts.ts` | energy and nausea factors, walking factor, per-hour hooks, board/ride/thought hooks (`addThought` reaches the registry through `setThoughtListener`) | — |
| `park/rating.ts`, `data/tuning/economy.ts` | `atmosphere` rating part (`atmosphereScore`, weight 0) and `awardRatingBonus` | W3-E (weights 300/100), W3-I |
| `park/arrivals.ts` | × `nightArrivalFactor` × `scenarioArrivalFactor` × `awardArrivalFactor` | W3-F, W3-H, W3-I |
| `economy/ledger.ts` | `unlimitedMoney`: `canAfford` passes, expenses do not lower cash, lines still booked | W3-H |
| `weather/update.ts` | `drawNextWeather(…, weights)` with `weatherWeights(world, season)` (climate, always sunny) | W3-H |
| `research/api.ts` | `scenarioContentRule`; scenery items and themes are content (`sceneryTheme`, `scenery`), locked while `BUILD_MAX_PHASE` is 3 | W3-H, W3-D |
| `staff/tasks.ts`, `staff/update.ts` | Groundskeeper task `water` after mess, bins, litter; state `watering` for `WATERING_TICKS`; asks `gardenNeedsWaterNear`, then `waterGardensNear` (`tests/unit/core/watering-plumbing.test.ts`) | W3-D |
| `staff/costumes.ts`, `litter/hooks.ts` | Boo costume matches when `booBonusActive(world, performerTile)` | W3-F |
| `staff/commands.ts` | path items gated by `BUILD_MAX_PHASE` (the lamp unlocks with Phase 4) | W3-D raises it |
| `guests/thoughts.ts`, `data/strings/guests.ts` | thoughts `flowersSad`, `pathTooDark` | W3-D, W3-F raise them |

**Stub APIs** (contract doc comment on every function; neutral bodies unless marked real):
- W3-B `sim/paths/api.ts`: `elevatedPathsOn` (real), `pathNodesAt`, `rampSpeedFactor`, `nodeZAfterStep`; `sim/occupancy/index.ts`: `occupantsAt`, `clearanceBlock`, `lowestAbove`, `markOccupancyDirty`, `occupantReason` (real).
- W3-D `sim/scenery/api.ts`: `findScenery`, `sceneryExtent`, `isWilted` (real), `sceneryOnTile`, `edgeBlocked`, `spookyItemsNear`; `gardens.ts`; `occupancy.ts` (`forEachSceneryOccupant`); `update.ts`.
- W3-E `sim/fields/api.ts`: `calmAt`, `buzzAt`, `fieldBand` (real), `markFieldsDirty`, `atmosphereScore`; `update.ts`; `hooks.ts`.
- W3-F `sim/lighting/api.ts`: `isNight`, `nightActive` (real), `lightAt`, `isLit`, `litShare`, `markLightDirty`, `nightArrivalFactor`, `booBonusActive`; `hooks.ts`; `render/lighting/layer.ts` `darknessAt`.
- W3-G `sim/land/api.ts`: `groundOwnershipBlock`, `aboveGroundOwnershipBlock` (real); `land/layout.ts` `generateFreePlayMap`; `createWorld({ layout: 'freePlay', mapSize })`.
- W3-H `sim/scenario/api.ts`: `unlimitedMoney`, `climateOf`, `weatherWeights`, `scenarioArrivalFactor`, `scenarioContentRule`, `afterDarkLocked`, `scenarioResult`; `objectives.ts`, `lose.ts`, `metrics.ts`, `hooks.ts`, `start.ts` (`createScenarioWorld`, `createSandboxWorld`).
- W3-I `sim/awards/api.ts` (`awardArrivalFactor`, `awardRatingBonus`), `awards/update.ts`, `tutorial/{commands,update,start}.ts`, `progress/index.ts` (`ProgressStore`, formats, messages, `openScenarioIds`), `ui/scenario/flow.ts` (`createScenarioFlow`: title → scenario select → detail → start, sandbox setup, tutorial, end screen).
- Shared strings: `data/strings/terrain.ts` (`TERRAIN_ERR`, the Phase 4 §4.1–4.3 check strings, W3-A); one string table per card registered in `en.ts` (`landUi`, `paths`, `waterRides`, `scenery`, `fields`, `night`, `land`, `scenario`, `progression`).
- Data: `data/catalog/scenery.ts` (85 items generated from the spec tables, `SCENERY_THEMES`, `getSceneryDef`); `data/scenarios/types.ts` (`ScenarioDef`, `MapGenSpec`, `Feature`, `Objective`), `data/scenarios/index.ts` (empty `SCENARIOS`); tuning files `terrain`, `paths`, `land`, `scenery`, `fields`, `night`, `scenario`, `awards` with the spec constants.

**Client contracts.** `render/types.ts`: tools `land`, `water`, `buyLand`, `scenery`; overlay `light`; `OVERLAY_CYCLE`; `ToolState.land`, `.pathHeight`, `.scenery`, `.brush`; ghost kind `scenery`. `render/view.ts` (W3-G): §4.8 table helpers with real bodies (`mapToView`, `viewToMap`, `mapToViewContinuous`, `viewSize`, `rotateSlopeMask`, `viewSpriteRotation`, `mapRotationFromView`) and the `rotateCameraView` stub. `render/layers.ts`: `WorldLayer` (`drawGround`, `collect`/`drawItem` with `LAYER_KIND`, `drawAfterObjects`, `drawOverlay`) called by the renderer for the stub layers `fields/overlay.ts` W3-E, `lighting/layer.ts` W3-F, `elevated/layer.ts` W3-B, `scenery/layer.ts` W3-D, `terrainTools/layer.ts` W3-A. `input/toolRouters.ts`: `ToolRouter` per tool, asked before the controller's own handling — `input/land` W3-A, `input/landPurchase` W3-G, `input/scenery` W3-D. Keys: `[` / `]` → `rotateCameraView` (W3-G), `Page Up` / `Page Down` → `changePathHeight` (`input/pathHeight.ts` W3-B; path commands carry `pathCommandHeight(tool)`), `V` → `cycleOverlay` (`input/overlays.ts` W3-E). `ui/extensions.ts`: `UiExtension` (`toolbar` entries before Demolish, `hud`, `bars`, `parkPanel`, `onEvents`), mounted by the toolbar, HUD, park panel, and UI root; stubs `ui/{land,paths,scenery,overlays,afterDark,view,scenario}/index.ts`.

**Contract files for Wave 3** (integrator only): `sim/{types,map,hookTypes,hooks,tick,world,events,ids}.ts`, `sim/commands/{types,index}.ts`, `sim/economy/ledger.ts`, `save/{index,codec,schema,validate,integrity,messages,typedArrays}.ts`, `save/v1/**`, `save/migrations/**`, `render/{types,layers}.ts`, `input/toolRouters.ts`, `ui/extensions.ts`, `game.ts`, `main.ts`, `data/catalog/**`, `data/strings/en.ts`, `tests/helpers/world.ts`. Slice type files named above belong to their card and may be extended.

### Rules for every Wave 3 card
- **Ownership** is the card's "Owns" list plus its test folder. "Named hunks" are the only edits allowed outside it; keep them to the lines named.
- **Your slice changed?** Update your `save/slices/*.ts` validator in the same commit. If the new field needs a start value in migrated Build 1 saves, edit only your slice's line in `save/migrations/v1-to-v2.ts` (named hunk for every card) and keep `migrate-v1.test.ts` green.
- **Derived data** (fields, light, occupancy, node graph) lives in module-level `WeakMap<World, …>` caches, never in `GameState`; rebuild on first use after a load.
- **Strings** go in your table under `src/data/strings/`; check strings shared with other cards are in `terrain.ts` (W3-A) — ask W3-A by contract change request.
- **Benchmarks and e2e**: add new files only (`tests/bench/<area>.bench.ts`, `tests/e2e/<area>.spec.ts`); use the `window.__tc` hook.
- **Merge order** at the gate: W3-B, W3-A, W3-G, W3-C, W3-D, W3-E, W3-F, W3-H, W3-I (consumers of occupancy and pathing land after them).

### W3-A Terrain and water shaping
- **Owns:** `src/sim/terrain/**`, `src/data/tuning/terrain.ts`, `src/data/strings/{terrain,landUi}.ts`, `src/input/land/**`, `src/ui/land/**`, `src/render/terrainTools/**`; `tests/unit/terrain/`, `tests/e2e/land.spec.ts`.
- **Spec:** Phase 4 §4.1 (all), §4.3, §6 terrain and water rows, §7 Land, Level, Water rows, §8 terrain constants, §9.1 terrain and water bullets, §9.5 land steps.
- **Consumes:** `terrain/corners.ts`; `groundOwnershipBlock` (W3-G); `clearanceBlock`, `lowestAbove`, `occupantReason` (W3-B; stubs answer "free" until merge); `markNetworkDirty`, `markFieldsDirty`, `markLightDirty`, `markOccupancyDirty`; `canAfford`, `pay`; `ToolState.land` / `brush`; `ToolRouter`; `UiExtension`; `WorldLayer`; `render/view.ts`.
- **Produces:** `normalizeCorners(c): { height, slope }`; the 9 terrain and water handlers (atomic corner tool; brush skip warning `"{n} tiles were skipped: {reason}"`; tile fee + step cost, paint fee, water step cost); Land and Water tools on desktop (brush ghost with cost tooltip, hold to repeat every 300 ms, mode and size chips, Level drag) and touch (tap ghost, Raise / Lower mini-bar, corner marker, + / − target and Confirm); brush, corner, and level ghosts. Terrain chunks already draw heights, slopes, cliffs, and water (W3-G owns `render/terrain.ts`; request visual changes there).
- **Required tests:** normalize rule for every 4-corner combination with spread 0–3; corner tool raises the shared vertex in all 4 tiles and a blocked tile fails it all; raise and lower on flat and sloped tiles; level target and cost; smooth is deterministic; every §4.1 check string in table order; skip warning text and count; water raise/lower, wet test, normalize to 0, blocked objects, `"The water cannot go higher"`, `"There is no water here"`; cost totals exact and `"Not enough cash"` atomic; a failed command leaves the state hash unchanged.
- **Done:** Land and Water tools work with mouse, keyboard, and touch; Playwright desktop raises land with the 3 × 3 brush (cash drops) and paints snow; phone taps Land, a tile, Raise twice.

### W3-B Paths on slopes, elevated paths, height-aware pathing
- **Owns:** `src/sim/pathing/**`, `src/sim/paths/**`, `src/sim/occupancy/**`, `src/sim/commands/build/**`, `src/sim/guests/movement.ts`, `src/sim/guests/update.ts`, `src/sim/staff/bfs.ts`, `src/sim/staff/update.ts`, `src/data/tuning/{paths,world}.ts`, `src/data/strings/paths.ts`, `src/render/elevated/**`, `src/input/pathHeight.ts`, `src/ui/paths/**`, `src/save/slices/elevatedPaths.ts`; `tests/unit/world/`, `tests/unit/paths/`, `tests/bench/pathing.bench.ts`.
- **Named hunks:** `src/sim/staff/commands.ts` — `buildPathItem` / `removePathItem` / repair handlers for `level`; `src/sim/guests/api.ts` — the exit tile placement in `finishRide` (set `z`); `src/sim/guests/arrivals.ts` — the spawn `z` line.
- **Spec:** Phase 4 §4.2 (all), §4.3 last bullets (no path on a wet tile, bridges), §4.5 edge items block movement, §4.10 distance fields, §5 `ElevatedPath`, path item `level`, guest and staff `z`, §6 `buildPath` extended, §7 Path height row, §8 path constants, §9.1 path bullets; master 6.3 occupancy list, R17.
- **Consumes:** `terrain/corners.ts`; `edgeBlocked` (W3-D); `buildOccupancy` (track envelopes, W3-C) and `forEachSceneryOccupant` (W3-D) for the unified list; `groundOwnershipBlock`, `aboveGroundOwnershipBlock`; `TERRAIN_ERR`; `ToolState.pathHeight`; `LAYER_KIND.elevatedPath`.
- **Produces:** ramp masks for ground paths; elevated paths with supports, clearance, max ground + 20 m, cost with supports; the path node graph and node-based distance fields (on demand, deterministic); guest and staff walking on nodes with `z` kept right everywhere a walker changes tile; ramp speed factors 0.75 / 1.10; the occupancy module (all clearance checks go through it); `"The land must be flat here"` for flat rides and stalls in `place.ts`; path items on elevated paths; the elevated path layer; the path height mini-bar and `Page Up` / `Page Down`.
- **Required tests:** 4 allowed and 11 rejected ramp masks with their strings; `"Paths cannot go in water"`, `"The path is below the land"`, `"Not enough clearance under an object"`; connectivity on ramps, across cliffs (no link), under edge scenery (no link), over a bridge; guests never stand on a wet tile; ramp speed factors for guests and staff; Review Focus 1 and 2 still hold on nodes; unreachable → null; bench: 100 destinations × 5,000 nodes after a network change.
- **Done:** guests walk up a ramp path to a hill-top ride and across a bridge; elevated paths draw with supports.

### W3-C Water rides
- **Owns:** `src/sim/rides/track/**` (incl. `waterHooks.ts`), `src/data/track/**`, `src/data/tuning/track.ts`, `src/data/strings/{track,trackUi,waterRides}.ts`, `src/render/track/**`, `src/ui/track/**`, `src/input/track/**`, `src/save/slices/track.ts`; `tests/unit/track/`.
- **Spec:** Phase 4 §4.4 (all), §4.2 "The track is below the land", §4.9 construction rights for track, §6 track row, §8 water constants, §9.1 water ride bullets; catalog §2 Log Flume and Rapids Raft rows; phase-2 §4 geometry names.
- **Consumes:** `aboveGroundOwnershipBlock`; occupancy (W3-B) for elevated paths and scenery near track; `afterRide` / `perHour` guest hooks; weather state; `isUnlocked` (water rides are researched once W3-D raises `BUILD_MAX_PHASE`; test them in setup mode).
- **Produces:** the 17 flume and rapids pieces and their palette groups; drive modes (water current, conveyor, splash brake, whirlpool) in the 1D integration; rating extras with count limits; wet riders (`wetUntilTick`, hot +8 / cold or rain −8 per hour); water channel art and boats/rafts in the builder and the track layer; `placeStation` accepts the water types.
- **Required tests:** a flume boat completes a circuit; conveyor speed is exact; splashdown caps speed at 4 m/s; whirlpool caps at 2 m/s and adds rating nausea; each rating extra and its count limit; a boat stopping outside a conveyor fails the test run; wet rider effects by weather; `"The track is below the land"`; rights tiles need ≥ ground + 3.
- **Done:** both water rides build, pass test runs, open, and carry guests on desktop and touch.

### W3-D Scenery and gardens
- **Owns:** `src/sim/scenery/**`, `src/data/tuning/scenery.ts`, `src/data/strings/scenery.ts`, `src/data/research.ts`, `src/render/scenery/**`, `src/input/scenery/**`, `src/ui/scenery/**`, `src/save/slices/scenery.ts`; `tests/unit/scenery/`, `tests/bench/scenery.bench.ts`, `tests/e2e/scenery.spec.ts`.
- **Named hunks:** `BUILD_MAX_PHASE` in `src/data/tuning/management.ts` (3 → 4: Phase 4 content, the lamp, water ride research) and the matching "Phase 4 stays locked" assertions in `tests/unit/management/research.test.ts`.
- **Spec:** Phase 4 §4.5 (all), §5 Scenery, §6 scenery rows, §7 Scenery row, §8 scenery constants, §9.1 scenery and garden bullets; master R10 (Log Flume 480, Rapids Raft 540, each theme 240 research points); catalog §6.
- **Consumes:** `SCENERY`, `SCENERY_THEMES` (contract data); `groundOwnershipBlock`; `isWet`, `isFlat`, `maxCorner`; occupancy (W3-B); `markFieldsDirty`, `markLightDirty`, `markNetworkDirty`, `markOccupancyDirty`; the Groundskeeper plumbing (`gardenNeedsWaterNear`, `waterGardensNear`); `render/view.ts`; `LAYER_KIND.scenery`; `ToolState.scenery`; thought `flowersSad`.
- **Produces:** placement and removal with every rule and string, edge items, arches over paths, 2 × 1 rotation, 50% refund; gardens (drain 3 / 5 hot, wilt < 64, rain refill, watering < 128); `sceneryOnTile`, `edgeBlocked`, `spookyItemsNear`, `forEachSceneryOccupant`; Phase 4 research entries and the theme unlocks; 85 procedural items in 4 view rotations with wilted variants; the scenery picker and tool.
- **Required tests:** each placement rule and its string; edge items on path tiles; `overPath`; 2 × 1 rotation; refund; garden drain, wilt, rain refill, and the task order mess → bins → litter → gardens with real Groundskeepers; theme research unlocks items; sprite cache keys stable; bench: one scenery change updates fields and light in < 0.2 ms (with W3-E/W3-F stubs, then at the gate).
- **Done:** all 85 items place, remove, and draw in 4 rotations; gardens in a Groundskeeper's area never wilt.

### W3-E Calm and Buzz
- **Owns:** `src/sim/fields/**`, `src/data/tuning/fields.ts`, `src/data/strings/fields.ts`, `src/render/fields/**`, `src/input/overlays.ts`, `src/ui/overlays/**`; `tests/unit/fields/`, `tests/bench/fields.bench.ts`.
- **Named hunks:** `RATING_WEIGHTS` in `src/data/tuning/economy.ts` (happiness 400 → 300, atmosphere 0 → 100) and the weight / part assertions in `tests/unit/economy/rating.test.ts`.
- **Spec:** Phase 4 §4.6 (all), §7 Overlays row, §8 field constants, §9.1 Calm/Buzz bullets, §9.4 field bench; master R6, R8.
- **Consumes:** `state.scenery` + `getSceneryDef` + `isWilted`; `isWet`; bench tiles (`map.pathItem`); litter and mess arrays; ride status and tags; guest hooks `energyFactor`, `nauseaRecoveryFactor`, `perHour`, `walkSpeed`; `OVERLAY_CYCLE`; the Light legend from W3-F.
- **Produces:** derived `calmRaw` / `buzzRaw` with integer stamps and incremental updates; `calmAt`, `buzzAt`, `markFieldsDirty`, `atmosphereScore`, `hourlyFields`; `fieldHooks`; Calm and Buzz overlays (tint + hatch), legend, chip row, value on tap or hover, `V` cycling.
- **Required tests:** incremental fields equal a full rebuild after 1,000 random seeded operations; stamp math per source table row; litter/mess penalties; bands; guest effect formulas at temperament 0, 50, 100; atmosphere = round(mean × 100) and the weights still sum to 1,000; bench < 0.2 ms per scenery change.
- **Done:** Calm and Buzz overlays show correct bands with a legend; Chill guests recover in gardens, Thrill guests speed up near thrill rides.

### W3-F After Dark
- **Owns:** `src/sim/lighting/**`, `src/data/tuning/night.ts`, `src/data/strings/night.ts`, `src/render/lighting/**`, `src/ui/afterDark/**`; `tests/unit/lighting/`, `tests/e2e/afterDark.spec.ts`.
- **Spec:** Phase 4 §4.7 (all), §6 `setAfterDark`, §7 Park panel row, §8 night constants, §9.1 darkness, night, light, After Dark bullets, §9.5 brightness step; catalog §5 Boo.
- **Consumes:** `isNight`, `nightActive`; lamps (`map.pathItem`), scenery `light` / `spooky` flags and `spookyItemsNear` (W3-D); open rides, stalls, the entrance; guest hooks; `booBonusActive` call site; `afterDarkLocked` (W3-H); `WorldLayer`; thought `pathTooDark`.
- **Produces:** derived `lightRaw` with Euclidean stamp tables and incremental updates; `lightAt`, `isLit`, `litShare`, `markLightDirty`, `nightArrivalFactor`, `booBonusActive`; `nightHooks` (dark path −4 and thought, energy × 1.25, spooky score × 1.3 + 2% per item up to +20%, spooky ride +5); `setAfterDark` with the lit-share warning; `darknessAt`; the light pass (1/4-res light canvas, `lighter`, `multiply`, emissive sprites, culling, ≤ 400 sprites) and the Light overlay; the park panel switch.
- **Required tests:** darkness at 06:00, 12:00, 20:00, 22:00; night window edges; stamps and the lit threshold; After Dark off → no night effect; Boo bonus rules; arrival factor; Playwright: mean canvas brightness lower at 22:00 than at 12:00.
- **Done:** After Dark on and off behave as in §4.7; frame budget ≤ 2 ms measured or the gap documented.

### W3-G View rotation, map sizes, land purchase, render core
- **Owns:** `src/sim/land/**`, `src/data/tuning/land.ts`, `src/data/strings/land.ts`, `src/render/{iso,camera,depth,renderer,terrain,terrainTracker,fence,paths,queue,guestPos,spriteCache,anim,palette,canvas,view}.ts`, `src/render/sprites/**`, `src/render/management/**`, `src/input/{index,controller,camera,gestures,keyboard,tools,patrol,pathItemTool}.ts`, `src/input/landPurchase/**`, `src/ui/view/**`; `tests/unit/render/`, `tests/unit/land/`, `tests/unit/ui/` (input tests), `tests/e2e/view.spec.ts`.
- **Spec:** Phase 4 §4.8 (all), §4.9 (all), §4.10, §6 `buyLand`, §7 Buy Land and View rows, §9.1 rotation and land bullets, §9.3 rotation determinism, §9.5 rotate and buy steps; master 6.4.
- **Consumes:** `render/view.ts` table helpers (tests them); `Guest.z`, `Staff.z` (W3-B keeps them right); `ToolRouter`; `UiExtension`; `park.landPrice` / `rightsPrice`.
- **Produces:** rotation in the whole Build 1 renderer (terrain chunks rebuilt on rotation, visible first; depth by `u + v`; sprites `(rotation + r) mod 4` with the rotation in the sprite cache key; slope masks rotated; fence and paths; guests and staff drawn at their `z`), picking through the inverse table, `rotateCameraView` keeping the centre, `[` `]` and 2 HUD buttons; new objects store `(viewRotation − r) mod 4`; `buyLand` (atomic cash, `"Nothing to buy here"`, `"This land is not for sale"`), ownership tints and the Buy Land tool; `generateFreePlayMap` for sizes 64–256; chunk LRU (64 MB; 32 MB on phones), sprite LRU (96 MB), guest LOD at zoom ≤ 0.5.
- **Required tests:** map → view → map identity for all `r`; mask rotation matches corner heights; depth order under rotation; picking round trip under rotation; the centre tile stays after rotation; land purchase state changes and cash atomicity; border fence derivation; free-play layout per size; state hash unchanged by rotation changes between ticks.
- **Done:** every Build 1 and Build 2 object draws in 4 rotations; 128 × 128 with 3,000 guests keeps 60 fps on desktop or the gap is documented.

### W3-H Scenario engine and sandbox
- **Owns:** `src/sim/scenario/**`, `src/data/scenarios/**`, `src/data/tuning/scenario.ts`, `src/data/strings/scenario.ts`, `src/save/slices/scenario.ts`; `tests/unit/scenario/`, `tests/integration/scenarios.test.ts`.
- **Named hunks:** `pickNextResearch` in `src/sim/research/update.ts` (skip items the scenario hides).
- **Spec:** Phase 5 §4.1–4.9, §5, §6 `scenarioContinue` / `setSandboxOption`, §8, §9 unit and integration bullets for these; master R7, R13, R19.
- **Consumes:** `executeCommand(…, { setup: true })`; terrain and water helpers (W3-A) and scenery placement (W3-D) for features; `createWorld`; `state.modifiers`; ledger lines; park value; track test results; guest hooks `onThought`, `onBoard`; `awardsOf` (W3-I writes awards).
- **Produces:** the seeded map generator (value noise without `Math.sin`/`cos`/`pow`/`exp`, features in order, slope pass ≤ 64, water, terrain rules, ownership, entrance, scatter, prebuilt, ride condition, litter, start guests, validation); the 8 scenario definitions with golden map hashes; month metrics (12:00 and 22:00 samples, tracked-thought guests, queue waits, broken rides); every goal type of the §4.3 table (10 rows; §3 says 9) with progress records; win, lose, stars, keep playing, `scenarioEnded`; difficulty → modifiers and start values; climates; sandbox presets and options (unlimited money, guests on/off, breakdowns via `breakdownChance`, always sunny, After Dark); `createScenarioWorld`, `createSandboxWorld`, `scenarioResult`, `afterDarkLocked`, `scenarioContentRule`.
- **Required tests:** noise determinism; golden hashes for the 8 maps; slope legality after generation; every goal type at pass, fail, and boundary; streak reset; difficulty multipliers reach Phase 1 and 3 systems; climate weights; integration: Meadow Start win at the expected month with the right stars, time-up loss on Standard, late win on Relaxed = 1 star, Tough bankrupt after 2 month ends, keep playing, save/load mid-scenario keeps streaks and counters; generation of 128 × 128 < 300 ms.
- **Done:** every scenario and the sandbox start from `createScenarioWorld` / `createSandboxWorld` and validate; manual Standard win log started.

### W3-I Awards, tutorial, progress, title flow
- **Owns:** `src/sim/awards/**`, `src/sim/tutorial/**`, `src/data/tuning/awards.ts`, `src/data/strings/progression.ts`, `src/save/slices/awards.ts`, `src/progress/**`, `src/ui/title.ts`, `src/ui/scenario/**`; `tests/unit/awards/`, `tests/unit/tutorial/`, `tests/unit/progress/`, `tests/e2e/scenario.spec.ts`, `tests/e2e/tutorial.spec.ts`.
- **Spec:** Phase 5 §4.4 end screen, §4.7 unlocks, §4.10, §4.11, §4.12, §4.13, §6 tutorial rows, §7, §9 award, tutorial, progress, and Playwright bullets; Phase 4 §4.9 New Park sizes in the title form.
- **Consumes:** `MonthMetrics` and scenario state (W3-H), `scenarioResult`, `createScenarioWorld`, `createSandboxWorld` (W3-H), `createWorld({ layout: 'freePlay', mapSize })` (W3-G), `calmAt` (W3-E) and `litShare` (W3-F) for awards, `UiExtension`, `KeyValueStore`, `game.setWorld`, `scenarioEnded` / `award` / `tutorialStep` events.
- **Produces:** the 12 awards with effects and clamps (`awardArrivalFactor`, `awardRatingBonus`) and history; the 16 tutorial steps (`sim` checks after commands and every hour, `ui` checks via `tutorialAdvance`, Skip step, Skip tutorial, `tutorialDone`); the progress store (validation, merge rule, errors, reset); title → New game (Tutorial, Scenarios, Sandbox, New Park with map sizes) → scenario select → detail sheet → Start; sandbox setup; objectives panel; end screen; award toasts with Frost or Spark; tutorial bubbles.
- **Required tests:** each award criterion and minimum guests; clamps; progress validation (bad JSON, wrong format, future version, missing field, wrong type → error and no write); merge rule; unlock thresholds; win recorded once after reload; tutorial script finishes all 16 steps; Playwright desktop (title → Meadow Start → Standard → objectives → save → reload; tutorial steps 1–4 with mouse) and phone (tutorial steps 2–4 with touch; Skip tutorial; scenario detail as a bottom sheet).
- **Done:** all 8 scenarios, the tutorial, and sandbox start from the title on desktop and phone; progress survives reload; corrupt progress shows an error and never resets without the player.

**Wave 3 gate:** the integrator merges in the order above, runs the full suite after each merge, resolves contract change requests, then runs Phase 4 §9.2–9.3 (the scripted 96 × 96 game, with and without rotation) and the §9.4 128 × 128 benchmark (tick < 4 ms), and checks every Phase 4 and Phase 5 "Done when" item.

**Open questions for the owner (from Wave 3.0):**
1. Phase 4 §7 binds `O` to the overlay cycle, but Phase 3 §7.4 uses `O` for the Office panel. Wave 3.0 binds the overlay cycle to `V`; keep, or move Office?
2. One path item per tile column (ground or one elevated level, `map.pathItemLevel`) instead of one per path node. Enough?
3. `BUILD_MAX_PHASE` goes to 4 with W3-D, which also unlocks the lamp and water ride research in every park, including migrated Build 1 parks. Intended?

## Wave 4 — Build 3 (Phase 6)
Cards are cut from `phase-6-polish.md`: audio engine + SFX; generated music; After Dark shows; extra content; performance and renderer decision; accessibility; localization + settings + offline. The integrator owns migration 2 → 3 and the release checklist.
