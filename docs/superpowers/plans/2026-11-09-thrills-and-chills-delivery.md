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
| 3 | Build 2: Phases 4–5 | up to 9 | Same, plus save migration 1 → 2 |
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
Cards are cut from `phase-4-land-scenery-after-dark.md` and `phase-5-scenarios.md` when Build 1 is integrated: terrain editing + height rendering; water + water rides; land purchase + map sizes; scenery catalog + placement + sprites; Calm and Buzz fields + overlays; After Dark lighting; view rotation; scenario engine + 8 scenarios + sandbox; tutorial + awards + difficulty + progress storage. The integrator owns save migration 1 → 2.

## Wave 4 — Build 3 (Phase 6)
Cards are cut from `phase-6-polish.md`: audio engine + SFX; generated music; After Dark shows; extra content; performance and renderer decision; accessibility; localization + settings + offline. The integrator owns migration 2 → 3 and the release checklist.
