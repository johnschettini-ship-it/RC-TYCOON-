# Path Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Execution method chosen by the owner's lead:** superpowers:executing-plans (one implementer, task by task, TDD).

**Goal:** The player sees, in the game, whether guests can reach each ride and what is missing (park entrance → footpath → queue → ride): a status line with Show me in every ride panel and the queue card, glows and dimming while a path tool is on, and a one-time tip. The entrance name sign goes.

**Architecture:** Reach is derived, read-only data hung off the path network cache (`src/sim/pathing/network.ts`): one BFS from the park entrance over guest-walkable nodes (the same nodes and links the `exit` field uses), computed lazily on first query and dropped when the network rebuilds. A new module `src/sim/pathing/reach.ts` answers per ride (no queue / no footpath / closed / ok, with the tile to show) and lists the path-tool marks. The UI gets one shared status widget (`src/ui/rides/reachStatus.ts`) used by the flat ride panel, the track ride Overview tab and the queue card. Show me closes the panel, centres the camera with the existing `showMapPlace`, and sets a short-lived `ToolState.pathFocus` that the queue layer draws as a pulse. The queue layer (both looks) loses its sign and gains the glows, the dimming and the pulse. The tip lives in the path builder row, next to the Shift tip, with its own `localStorage` key.

**Tech Stack:** TypeScript 6, Vite 8, Canvas 2D, Vitest 5, Playwright 1.63 + axe.

**Spec:** `docs/superpowers/specs/2026-11-18-path-clarity-design.md` (changes decision 1 of `2026-11-18-queue-clarity-design.md`).

## Global Constraints

- Game rules unchanged: reach reads the existing network (nodes, links, `guestPass`, queue `owner`); no pathing rule, field or `GameState` field changes. `tests/integration/queue-rules-unchanged.test.ts` stays green, untouched.
- Deterministic sim: nothing in `src/sim` reads the new data; reach uses its own buffer, never the field pool.
- Reach cached with the network: computed at most once per network rebuild; perf-budget tests pass.
- Status, first failing step wins, live: "No queue at the entrance" → "No footpath reaches the queue" → "The ride is closed" (status ≠ `open`) → "Guests can reach this ride". The same status in the queue card.
- Show me (when the status is "no queue" or "no footpath"): closes the panel, moves the camera to the entrance tile (the tile outside the entrance gate) or the queue's open end tile, highlights it with a pulse for 3 s (steady with reduced motion).
- While the Footpath or Queue tool is on: entrances with no queue glow; a queue's open end that no connected footpath reaches glows; footpaths not connected to the park entrance are drawn dimmed.
- Tip, once, the first time a ride is placed: "Guests walk: park entrance → footpath → queue → ride. Build a queue from the glowing entrance, then a footpath to its end" (no final period, master R4).
- Remove the entrance sign fully (code, colours, tests, `data-queue-signs`); the tap card, warnings and line of guests stay.
- Both builds (website and `VITE_ART=real`). Old saves load; no new saved fields (the tip uses a `tc.tip.*` storage key like `tc.tip.shiftDrag`).
- Strings in the `en` section files (`en-XA` is generated). Contrast ≥ 4.5:1. Fits at 390×844, 360×640, 812×375, normal and large text.
- Before each commit: `npx tsc --noEmit` and `npx vitest run --maxWorkers=4` green. Every commit message ends with exactly:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Q5pHggx1eLkEH7W16KJFwP
  ```
- No push, no merge.

## Decisions left to the builder (made here)

- Status line: the first row of the Overview content (flat panel: top of the panel; track panel: top of Overview), an icon (check / warning) + text + Show me button. Hidden for a track ride with no entrance yet (its "Next step" line already says what to do).
- No Show me for "The ride is closed": the Open button is right below it.
- The panel warning "The entrance needs a queue path" (`ui.ride.entranceQueue`) is dropped from the UI: the status line says it, with Show me. The sim's own placement warning (`BUILD_STRINGS.entranceNeedsQueue`, used by the build toast and the tutorial) stays.
- Queue "open end": the last node of the ride's queue line (flood-fill order, farthest from the entrance).
- Glow: `#39d0ff` stroke (the queue highlight colour) with a soft pulsing fill `rgba(57,208,255,0.35)`, plus a "+" badge; dimmed footpath: `rgba(20,24,40,0.55)` wash. Show me pulse: a `#ffd23f` ring, 1 Hz, 3 s.
- Tip shows in the path builder row (the place the player is after placing a ride: the queue tool opens at the entrance); it waits there if the ride was placed another way. Not in the tutorial, not when tips are off.

## Review Focus

1. **A queue reached only through another ride's queue** (queues touch; a footpath touches only ride B's tiles): ride A must say "No footpath reaches the queue" — queue nodes are not guest-walkable. Pinned in Task 2 (`a queue reached only through another ride's queue is not reached`).
2. **Elevated footpaths and decks** (queue on a deck, footpath ramp to it): reach follows node links, the glow and pulse sit at node height. Pinned in Task 2 (`an elevated footpath links the queue to the park`) and Task 4 (`glow at deck height`).
3. **Map with no park entrance node / disconnected park entrance** (scenario or demolished path): every footpath dims, every ride says no footpath; no crash. Pinned in Task 2 (`no park entrance: nothing is reached`).
4. **The network changes while the panel is open** (player builds the missing footpath with the panel up, or demolishes it): the status flips on the next update; the reach cache is new after a rebuild and the same object before. Pinned in Task 2 (`rebuilt only with the network`) and Task 3 (`status follows a footpath built while the panel is open`).
5. **Show me with the panel then reopened / the target gone** (queue built before the pulse ends, ride demolished): the pulse ends by its time and never draws off-map; `pathFocus` with a bad tile draws nothing. Pinned in Task 4 (`pulse ends after 3 s; bad tile draws nothing`).

---

### Task 1: Remove the entrance sign

**Files:**
- Delete: `src/render/queues/sign.ts`
- Modify: `src/render/queues/layer.ts` (drop signs, `queueSigns` dataset), `src/render/queues/colours.ts` (drop `sign*`), `src/render/worldLayers.ts` (comment)
- Modify: `tests/unit/render/queueLayer.test.ts`, `tests/unit/render/queueRenderer.test.ts`, `tests/e2e/queue-clarity.spec.ts`

- [ ] **Step 1: Tests:** replace the sign tests with `queue layer draws no ride name over an entrance` (a park with two named rides: no `fillText` of either name in `drawOverlay`, no `queueSigns` key on the canvas dataset); `queueRenderer.test.ts` asserts `canvas.dataset.queueSigns` is undefined; e2e sign test becomes `no name sign over an entrance` (`data-queue-signs` absent).
- [ ] **Step 2: Run** `npx vitest run tests/unit/render/queueLayer.test.ts tests/unit/render/queueRenderer.test.ts` → FAIL.
- [ ] **Step 3: Remove** the sign code; `grep -rn "sign\.ts\|signBoxes\|fitSignText\|SIGN_\|queueSigns\|signText\|signPost\|signEdge" src tests` returns nothing.
- [ ] **Step 4: Run** → PASS. tsc + full vitest.
- [ ] **Step 5: Commit** `refactor(render): drop the entrance name sign (path clarity replaces it)`.

### Task 2: Reach from the park entrance, cached with the network

**Files:**
- Modify: `src/sim/pathing/network.ts` (`NetworkCache.reach: ReachData | null`, reset in `rebuild`)
- Create: `src/sim/pathing/reach.ts`
- Test: `tests/unit/paths/reach.test.ts`

**Interfaces:**
- Produces (`src/sim/pathing/reach.ts`):
  ```ts
  export type ReachStatus = 'noQueue' | 'noFootpath' | 'closed' | 'ok';
  export interface RideReach { status: ReachStatus; /** tile to show, −1 for none */ tile: number; /** height of that spot */ z: number }
  export function rideReach(world: World, rideId: number): RideReach | null; // null: no such ride or no entrance
  export interface PathMarks {
    /** Entrances with no owned queue: the tile outside the gate and the gate height. Ascending ride id. */
    entrances: readonly { rideId: number; tile: number; z: number }[];
    /** Open-end node of each queue line no reached footpath touches. Ascending ride id. */
    queueEnds: readonly { rideId: number; node: number }[];
    /** Footpath nodes (ground and elevated) not connected to the park entrance, ascending. */
    dimmed: readonly number[];
  }
  export function pathMarks(world: World): PathMarks; // same object until the network rebuilds
  export function footpathReached(world: World, node: number): boolean;
  ```
- `ReachData` (network.ts): `{ reached: Uint8Array; lineReached: Map<number, boolean>; marks: PathMarks | null }`.

- [ ] **Step 1: Failing tests** (`makeTestWorld`, `placeRideDirect`, `placeQueue`, `placeFootpath`/path line helpers, entrance at `map.entranceTile`):
  - `ride with no queue: noQueue at the tile outside the entrance gate` (`tile === ride.entrance.outside`, `z === heights[gate]`).
  - `queue with no footpath: noFootpath at the queue's open end` (`tile` = tile of the last line node).
  - `queue touching a footpath that does not reach the park: noFootpath; that footpath is dimmed`.
  - `queue reached from the park, ride closed: closed; open: ok` (`setRideOpen` / `ride.status = 'open'`).
  - `a queue reached only through another ride's queue is not reached`.
  - `an elevated footpath links the queue to the park` (ramp/deck chain → ok).
  - `no park entrance: nothing is reached` (`map.entranceTile = -1` → every footpath dimmed, status noFootpath).
  - `pathMarks lists unqueued entrances, unreached queue ends, dimmed footpaths`.
  - `rebuilt only with the network`: two `pathMarks` calls → same object; after a footpath edit + `markNetworkDirty` → new object.
  - `ride with no entrance: null`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/paths/reach.test.ts` → FAIL.
- [ ] **Step 3: Implement.** `reached`: BFS from `map.entranceTile` (only when its kind is the park entrance) over `guestPass` nodes via `adj` (own `Int32Array` queue local to the call; never `c.work` while fields are in use — use a fresh array). A line is reached when any of its nodes has a link to a reached node. Status order per Global Constraints; `closed` reads `ride.status` live (not cached).
- [ ] **Step 4: Run** → PASS; `tests/unit/paths`, `tests/integration/queue-rules-unchanged.test.ts` green.
- [ ] **Step 5: tsc + full vitest; commit** `feat(paths): ride reach from the park entrance, cached with the path network`.

### Task 3: Status line and Show me in the ride panels and the queue card

**Files:**
- Create: `src/ui/rides/reachStatus.ts`
- Modify: `src/data/strings/queues.ts` (new keys), `src/data/strings/ui.ts` + `src/ui/info.ts` (drop `ui.ride.entranceQueue`), `src/ui/panels/ride.ts`, `src/ui/track/ridePanel.ts`, `src/ui/panels/queue.ts`, `src/render/types.ts` (`ToolState.pathFocus`), styles for `.reach-status`
- Test: `tests/unit/ui/reachStatus.test.ts`; update `tests/unit/ui/panels.test.ts`, `tests/unit/ui/strings.test.ts`

**Interfaces:**
- Consumes: `rideReach` (Task 2), `ctx.closePanel`, `ctx.showMapPlace`.
- Produces:
  ```ts
  // render/types.ts
  pathFocus: { tile: number; z: number; until: number } | null; // ms, performance.now() clock; default null
  // ui/rides/reachStatus.ts
  export const SHOW_ME_MS = 3000;
  export function createReachStatus(ctx: UiContext, rideId: number): { el: HTMLElement; update(): void };
  export function showMe(ctx: UiContext, reach: RideReach, now: number): void;
  ```
- Strings (exact, `queueStrings`): `ride.reach.noQueue` 'No queue at the entrance', `ride.reach.noFootpath` 'No footpath reaches the queue', `ride.reach.closed` 'The ride is closed', `ride.reach.ok` 'Guests can reach this ride', `ride.reach.showMe` 'Show me'.
- DOM: `[data-testid="reach-status"]` with `data-status` = the `ReachStatus`; `[data-testid="reach-show-me"]` button.

- [ ] **Step 1: Failing tests:** each status gives its text and `data-status`; Show me only for `noQueue`/`noFootpath`; `showMe` calls `closePanel`, then `showMapPlace(tile)`, and sets `pathFocus = { tile, z, until: now + 3000 }`; `status follows a footpath built while the panel is open`; hidden for a ride with no entrance; `rideWarnings` (ui) no longer lists the entrance warning.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; mount in the flat panel (first), the track Overview (first), and the queue card (under the count row, only for an owned queue).
- [ ] **Step 4: Run** → PASS; i18n tests green.
- [ ] **Step 5: tsc + full vitest; commit** `feat(ui): ride reach status with Show me in ride panels and the queue card`.

### Task 4: Path tools show the chain; the Show me pulse

**Files:**
- Modify: `src/render/queues/layer.ts`, `src/render/queues/colours.ts`
- Test: `tests/unit/render/queueLayer.test.ts`

**Interfaces:**
- Consumes: `pathMarks` (Task 2), `ToolState.pathFocus` (Task 3), `displayPrefs().reducedMotion`.
- Produces: canvas dataset `pathGlows` (entrances + queue ends drawn), `pathDimmed` (dimmed nodes), `pathFocus` (`"tile"` while the pulse draws, `""` otherwise) — written only on change; layer clock injectable: `createQueueLayer(now: () => number = () => performance.now())`.

- [ ] **Step 1: Failing tests:** no glows/dim with the inspect tool; with `footpath` and with `queue`: `pathGlows` = 2 for one unqueued entrance + one unreached queue end, `pathDimmed` = the disconnected footpath count, dim drawn in `drawGround`, glows in `drawOverlay`; `glow at deck height` (corner y uses the deck z); pulse draws while `now < until`, `pulse ends after 3 s; bad tile draws nothing`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: tsc + full vitest; commit** `feat(render): path tools glow at missing queues and ends, dim cut-off footpaths; Show me pulse`.

### Task 5: The one-time chain tip

**Files:**
- Create: `src/ui/paths/chainTip.ts`
- Modify: `src/ui/paths/index.ts` (mount; Shift tip waits while it shows), `src/data/strings/paths.ts` (`paths.tipChain`)
- Test: `tests/unit/ui/chainTip.test.ts`

**Interfaces:**
- Produces: `export const CHAIN_TIP_KEY = 'tc.tip.pathChain'`; `createChainTip(game): { el: HTMLElement; showing(): boolean; update(pathToolOn: boolean): void }` — armed by a successful `placeRide` or `placeTrackGate` (kind `entrance`) command; shows when armed, a path tool is on, not the tutorial, `mascotTips` on and not seen; marks seen when it first shows; stays until Close or the tool closes.
- `[data-testid="chain-tip"]`, close `[data-testid="chain-tip-close"]`.

- [ ] **Step 1: Failing tests:** not shown before a ride is placed; shown after `placeRide` with the queue tool on, text exact; seen key written; a second park/session with the key set never shows it; tutorial and tips-off never show it; closes on Close and when the tool closes.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: tsc + full vitest; commit** `feat(ui): one-time tip on how guests reach a ride`.

### Task 6: E2E, axe, fit, screenshots, docs

**Files:**
- Create: `tests/e2e/path-clarity.spec.ts`; modify README (How to play step 3), CHANGELOG
- Screenshots (not committed): `/home/user/tc-full/.superpowers/sdd/2026-11-18-pathc/shots/`

- [ ] **Step 1: e2e** (desktop + phone): one ride and the road, then each status in turn (no queue → queue → footpath link → open) in the ride panel and the queue card; Show me closes the panel, the target tile is near the centre of the visible map, `data-path-focus` set then cleared; queue tool on → `pathGlows`/`pathDimmed` counts; the tip after placing a ride from the Rides deck, once only (reload: gone); axe with each status; fit at 390×844, 360×640, 812×375 × normal and large text (`textScale` 175, `en-XA`) for the panel status row and the tip.
- [ ] **Step 2: Run** in the website build, then in `VITE_ART=real` (art copied read-only into `dist/art/real`); also `queue-clarity`, `path-builder`, `touch-controls`, `tips`, `a11y`, `phase1-smoke`.
- [ ] **Step 3: Screenshots** 390×844 DPR 2, both builds: each status, Show me pulse, Queue tool with glow + dimmed footpath, the tip. Look; fix; re-shoot.
- [ ] **Step 4: tsc + full vitest; commit** `test(e2e): path clarity statuses, Show me, path-tool glows and the tip`.
