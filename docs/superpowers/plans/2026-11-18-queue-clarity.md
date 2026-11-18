# Queue Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Execution method chosen by the owner's lead:** superpowers:executing-plans (one implementer, task by task, TDD).

**Goal:** The player can see which line belongs to which ride (entrance sign, tap card with highlight), spot a broken line (unlinked and touching warnings), and see a busy line fill up (guests stand in order and shuffle forward).

**Architecture:** All new behaviour is derived and read-only. The path network cache (`src/sim/pathing/network.ts`) already flood-fills each queue from its ride's entrance; that same pass now records each ride's queue nodes in flood-fill order with the parent node toward the entrance, the unowned queue nodes, and rides whose entrance sits on another ride's queue. A new read-only API (`src/sim/pathing/queues.ts`) exposes them. The renderer (shared by both looks) places queueing guests on those nodes (3 per tile), eases them forward, and a new world layer draws entrance signs, the queue highlight and the unlinked markers. The UI gets a queue card panel and a one-time toast. No sim rule, no saved field, no `GameState` field changes.

**Tech Stack:** TypeScript 6, Vite 8, Canvas 2D, Vitest 5, Playwright 1.63 + axe.

**Spec:** `docs/superpowers/specs/2026-11-18-queue-clarity-design.md`

## Finding that shapes the plan

The spec's "Today" line says queueing guests stand where they joined. That is true of the **simulation** (`guest.tile` stays at the join node; `joinQueue` calls `stopWalking`). The **renderer** already draws them elsewhere: `src/render/renderer.ts` `placeQueues` + `src/render/queue.ts` lay `ride.queue` along a single chain of `Content.Queue` tiles from `entrance.outside`, 4 per tile. That chain ignores ownership and node links (it can walk into another ride's queue or across a blocked edge), stops at the first branch, skips elevated queues, and snaps guests when the line moves. This plan replaces that chain with the network's flood-fill order and adds easing; it keeps guest positions display-only, exactly as today.

**Why rules cannot change:** the sim never reads display positions. `guest.tile`/`guest.z` of a queueing guest stay where they are today, so `stepOffQueue` (which picks the exit node from `guest.tile`), litter, vomit, crowding and every other tile-reading system see exactly what they saw before. The new network data is a by-product of the existing `computeQueueOwners` BFS and changes no existing array. Task 1 pins this with golden state hashes recorded on the base commit `0372c2b` before any change.

## Global Constraints

- Game rules unchanged: join limit `QUEUE_MAX_JOIN` 25, patience `QUEUE_MAX_WAIT` 1200 ticks, happiness loss, boarding order, ownership rule (ascending ride id, first claim wins), costs.
- Queue tile order = flood-fill distance from the entrance; ties break in a fixed order (N, E, S, W link order of the existing BFS) — deterministic.
- About 3 guests per queue tile; guests past capacity stand bunched at the far end.
- Sign shows `ride.name` (the ride panel title, so a renamed ride shows its new name); both looks; hidden at the farthest zoom; long names cut with an ellipsis.
- Warnings are hints only; no ownership change.
- Both builds (website and `VITE_ART=real` / `?art=real`). Old saves load; no new saved fields.
- Sim deterministic; determinism and perf-budget tests pass. Queue order cached with the network, rebuilt only when it changes.
- Strings in every locale's table (`en` sections + `enPlurals`; `en-XA` is generated). Contrast ≥ 4.5:1 on sign and card.
- Before each commit: `npx tsc --noEmit` and `npx vitest run --maxWorkers=4` green.
- Every commit message ends with exactly:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Q5pHggx1eLkEH7W16KJFwP
  ```
- No push, no merge.

## Review Focus

1. **Branching or looping queue** (a T or a ring): guests follow BFS order and never draw on a tile that is not their ride's; the highlight covers every tile of the component. Pinned in Task 2 (`orders a branching queue by distance, ties N,E,S,W`) and Task 3.
2. **Queue edited while guests stand in it** (a tile demolished mid-line, queue cut in two): guests on the cut-off part keep a slot on the remaining owned nodes, never NaN or off-map; the card for a deleted tile closes. Pinned in Task 3 (`slot of a line with no nodes is -1`) and Task 5 (`card closes when its tile is no longer a queue`).
3. **Elevated queue decks and ramps:** order, slots and highlight use path nodes, not ground tiles; height comes from the node surface. Pinned in Task 2 (`includes elevated queue nodes`) and Task 3 (`slot height on an elevated node`).
4. **Very long or renamed ride name, pseudo-locale and large text:** sign text ellipsised to the sign width; card text wraps without clipping at 390×844 and 812×375. Pinned in Task 4 (`fitSignText`) and the Task 7 e2e fit checks.
5. **Load an old save with guests mid-queue:** every queueing guest gets a slot on its ride's line on the first frame, and the loaded state is byte-identical to before. Pinned in Task 1 (fixture test) and Task 3.

---

### Task 1: Rule guard and old-save guard (tests only)

**Files:**
- Create: `tests/integration/queue-rules-unchanged.test.ts`

**Interfaces:**
- Consumes: `runPhase1Game`, `PHASE1_SEED` (`tests/integration/scenario.ts`), `stateHash`, `runTicks` (`tests/helpers/world.ts`), `deserialize` (`src/save`).
- Produces: golden values later tasks must keep.

- [ ] **Step 1: Write the tests** with values recorded on base commit `0372c2b`:
  - `phase 1 game on seed PHASE1_SEED gives the same state as before queue clarity`: `stateHash(run.world)` = `'fa1dc5b5'`, `state.park.cash` = `1282780`, rides' `totals.riders` = `[323, 396]`.
  - `save-v2 fixture (70 guests queueing) loads and runs 4000 ticks to the same state as before`: `stateHash` = `'7c5bfd3f'`, `park.cash` = `553029`.
  - `save-v2 fixture loads with guests in queues and no new state fields`: after `deserialize`, at least one guest has `state === 'queueing'`, each such guest's id is in its ride's `queue`; `Object.keys(world.state)` equals the key list of the raw fixture's migrated state (no field added).
- [ ] **Step 2: Run** `npx vitest run tests/integration/queue-rules-unchanged.test.ts` → PASS (this guards; it must stay green after every later task).
- [ ] **Step 3: Commit** `test(queues): pin seeded results and old-save load before queue clarity`.

### Task 2: Queue lines in the network cache

**Files:**
- Modify: `src/sim/pathing/network.ts` (`NetworkCache`, `rebuild`, `computeQueueOwners`)
- Create: `src/sim/pathing/queues.ts`
- Test: `tests/unit/paths/queueLines.test.ts`

**Interfaces:**
- Produces (in `src/sim/pathing/queues.ts`):
  ```ts
  export interface QueueLine { rideId: number; nodes: readonly number[]; toward: readonly number[] } // toward[k]: parent node (one step nearer the entrance), −1 for the entrance node
  export interface QueueConflict { rideId: number; ownerId: number } // ride whose entrance node is a queue owned by ownerId
  export function queueLine(world: World, rideId: number): QueueLine | null;
  export function queueNodeAt(world: World, tile: number, z?: number): number;          // queue node on tile (with z: at that height; else ground, then lowest elevated), −1
  export function queueComponent(world: World, node: number): { owner: number | null; nodes: readonly number[] }; // linked queue nodes of `node` (BFS N,E,S,W), cached per rebuild
  export function unlinkedQueueGroups(world: World): readonly (readonly number[])[]; // components with owner −1, ordered by first node id
  export function queueConflicts(world: World): readonly QueueConflict[];            // ascending rideId; same array object until the network rebuilds
  export function nodeTile(world: World, node: number): number;
  ```
- `NetworkCache` gains `queueLines: Map<number, QueueLine>`, `queueConflicts: QueueConflict[]`, `unlinked: number[][] | null` (lazy), `components: Map<number, …>` (lazy).

- [ ] **Step 1: Failing tests** (build with `makeTestWorld`, `placeRideDirect`, `placeQueue`):
  - `orders a straight queue from the entrance outward`: carousel at (10,10) rot 0, queue (11,13),(11,14),(11,15),(12,15) → `nodes` = those tiles in order; `toward` = `[-1, q0, q1, q2]`.
  - `orders a branching queue by distance, ties N,E,S,W`: T at (11,13),(11,14),(10,14),(12,14) → nodes `[q(11,13), q(11,14), q(12,14), q(10,14)]` (E before W).
  - `includes elevated queue nodes`: an elevated queue deck linked to the entrance node appears in `nodes` with node id ≥ tileCount.
  - `lists a queue section that reaches no ride`: a lone queue pair → `unlinkedQueueGroups` has one group of 2; owned tiles never appear.
  - `names a ride whose entrance is on another ride's queue`: two carousels whose queues join; lower id owns all; `queueConflicts` = `[{ rideId: higher, ownerId: lower }]`.
  - `queueComponent of an owned and of an unowned node`.
  - `rebuilds only when the network does`: two calls return the same `queueConflicts` array object; after `markNetworkDirty` + a queue edit, a new one.
- [ ] **Step 2: Run** `npx vitest run tests/unit/paths/queueLines.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement.** In `computeQueueOwners`, keep a per-node `parent` (reuse a `Int32Array` on the cache) and push each claimed node into that ride's `nodes`/`toward` arrays in BFS order (the BFS already visits in distance order with N,E,S,W ties). A ride whose seed is a queue node already owned by another ride records a conflict. `owner` is written exactly as today. Unlinked groups and components are computed lazily on first query (BFS over queue links), cached on the cache object.
- [ ] **Step 4: Run** the new test, `tests/unit/paths`, `tests/integration/queue-rules-unchanged.test.ts` → PASS.
- [ ] **Step 5: tsc + full vitest, commit** `feat(paths): queue lines, unlinked groups and conflicts from the queue flood fill`.

### Task 3: Guests stand in line, 3 per tile, and shuffle forward

**Files:**
- Modify: `src/render/queue.ts` (replace the chain walker), `src/render/renderer.ts` (`placeQueues`, guest scratch), `src/render/guestPos.ts` (export nothing new; reuse `nodeSurfaceHeight`)
- Modify: `tests/unit/render/scene.test.ts`, `tests/unit/render/walkerHeight.test.ts` (old chain tests rewritten for the new API)
- Test: `tests/unit/render/queueSlots.test.ts`

**Interfaces:**
- Consumes: `queueLine`, `nodeTile` (Task 2); `nodeZOf` (`src/sim/paths/nodes`); `nodeSurfaceHeight` (`src/render/guestPos`).
- Produces (in `src/render/queue.ts`):
  ```ts
  export const QUEUE_SLOTS_PER_TILE = 3;
  export function queueSlot(world: World, line: QueueLine, gateTile: number, k: number, out: QueueSlotPos): QueueSlotPos; // out.tile −1 when the line has no nodes
  export interface QueueSlotPos extends GuestPos { dir: Dir }  // facing toward the front
  export interface QueueEase { step(id: number, target: QueueSlotPos, t: number, out: QueueSlotPos): boolean; sweep(frame: number): void } // returns true while moving
  export function createQueueEase(): QueueEase;
  export const QUEUE_WALK_TILES_PER_TICK = 0.1; // the guests' own walking speed (1 tile per 10 ticks)
  ```
- Slot k stands on `nodes[floor(k / 3)]`, from the edge facing `toward` (or the gate for node 0) to the far edge. Overflow (`k ≥ 3 × nodes.length`) bunches on the last node: deterministic offsets from `k` inside a 0.3-tile disc.
- Easing: a guest's drawn point moves toward its slot at `QUEUE_WALK_TILES_PER_TICK` per sim tick (by `tick + alpha`, so pause freezes it); a gap over 1.2 tiles (a new joiner, a load, a rotation) snaps. Walking frames while moving.

- [ ] **Step 1: Failing tests:**
  - `3 slots per tile from the entrance outward` (tiles of k = 0…8 on the straight queue from Task 2).
  - `slot 0 is nearest the gate; slots run along the line` (as the old test, 3 per tile).
  - `overflow guests bunch on the last node, distinct and inside it` (k = 12…30 on a 4-tile line: all on the last tile, no two equal points, all within 0.5 of its centre).
  - `slot of a line with no nodes is -1`.
  - `slot height on an elevated node` equals `nodeSurfaceHeight` at the slot point.
  - `ease walks toward the slot at walking speed and snaps over 1.2 tiles`.
  - `the front guest boards: everyone behind moves one slot forward` (queue of 5 → shift → each remaining guest's target is the previous guest's old slot).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `queueSlot`, `createQueueEase`; in `placeQueues` use `queueLine(world, r.id)` (skip when null) and the ease (keyed by guest id, swept each frame for ids not seen); remove `createQueueWalker`.
- [ ] **Step 4: Run** render tests + Task 1 guard → PASS. Run `tests/bench/render.bench.ts` once and note the number against the base.
- [ ] **Step 5: tsc + full vitest, commit** `feat(render): queueing guests stand in flood-fill order, 3 per tile, and step forward`.

### Task 4: Entrance signs, queue highlight and unlinked markers (render layer)

**Files:**
- Create: `src/render/queues/layer.ts`, `src/render/queues/sign.ts`
- Modify: `src/render/worldLayers.ts` (add before the a11y layer), `src/render/types.ts` (`selectedEntity.kind` gains `'queue'`, id = queue node), `src/render/palette.ts` (sign and highlight colours)
- Test: `tests/unit/render/queueLayer.test.ts`

**Interfaces:**
- Consumes: Task 2 API; `ToolState`; `pathKindOf` semantics (tool `footpath` or `queue`); `GUEST_LOD_ZOOM`/frame `scale/dpr`.
- Produces:
  ```ts
  export function fitSignText(measure: (s: string) => number, name: string, maxPx: number): string; // name, or the longest prefix + '…' that fits
  export interface SignBox { rideId: number; text: string; x: number; y: number; w: number; h: number } // device px
  export function signBoxes(world: World, f: LayerFrame, measure: (s: string) => number, out: SignBox[]): SignBox[]; // [] when f.scale / f.dpr ≤ GUEST_LOD_ZOOM
  export function createQueueLayer(): WorldLayer; // drawOverlay: highlight of the selected queue, unlinked tint + one "!" badge per group while a path tool is on, then signs
  ```
- Colours: sign `#14213d` fill, `#ffffff` text (15.6:1), 1px `#ffffff` 40% border; highlight `rgba(57,208,255,0.30)` fill, `#39d0ff` stroke; unlinked tint `rgba(255,176,32,0.28)`, badge `#ffb020` with `#1a1a1a` "!" (10.9:1).
- Sign: anchored above the entrance gate tile at the ride's height + 28 world px; font `600 11px` × `clamp(zoom, 0.8, 1.4)`; max width 120 css px; a short post to the gate. The canvas gets `data-queue-signs` (names joined by `|`) and `data-queue-warnings` (unlinked group count, shown only while a path tool is on), written only when they change — e2e reads them.

- [ ] **Step 1: Failing tests:** `fitSignText` (short name unchanged; long name cut to fit with `…`; empty stays empty); `signBoxes` (one box per ride with an entrance, text = `ride.name`, renamed ride shows the new name, none at zoom ≤ 0.5); a fake-canvas draw of the layer calls `fillText` with the ride names and draws the highlight only when `selectedEntity.kind === 'queue'`; unlinked badges only while `tool.tool` is `footpath`/`queue`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; Task 1 guard green.
- [ ] **Step 5: tsc + full vitest, commit** `feat(render): ride name sign at each entrance, queue highlight and unlinked queue markers`.

### Task 5: Tap a queue tile: the queue card

**Files:**
- Create: `src/ui/panels/queue.ts`, `src/data/strings/queues.ts`
- Modify: `src/data/strings/en.ts` (register `queueStrings`), `src/data/strings/plurals.ts` (`queue.card.count`), `src/input/tools.ts` (`pickEntity`), `src/ui/context.ts` (`PanelKind`/`EntityPanelKind` gain `'queue'`), `src/ui/index.ts` (open/close rules for `'queue'`), `src/styles/*` (card styles, if needed)
- Test: `tests/unit/ui/queuePanel.test.ts`, `tests/unit/input/pickQueue.test.ts` (or the existing tools test file)

**Interfaces:**
- Consumes: `queueNodeAt`, `queueComponent`, `queueConflicts` (Task 2); `selectedEntity` kind `'queue'` (Task 4).
- Produces: `createQueuePanel(ctx: UiContext, node: number): PanelView`; `pickEntity` order: ride/stall/show building → staff → **queue tile** `{ kind: 'queue', id: node }` → guest.
- Strings (exact):
  - `queue.card.title`: `'Queue'` (title when no ride owns it)
  - plural `queue.card.count`: `{ one: 'Queue: {n} guest', other: 'Queue: {n} guests' }`
  - `queue.card.openRide`: `'Open ride'`
  - `queue.card.noRide`: `'This queue reaches no ride'`
  - `queue.warn.touches`: `'The {ride} line touches the {owner} line. Guests in it only go to {owner}'`

- [ ] **Step 1: Failing tests:** owned queue → title `ride.name`, count text from `ride.queue.length` (1 → singular), an `Open ride` button that calls `ctx.openPanel('ride', id)`; unowned → title `Queue`, the text `This queue reaches no ride`, no button; a conflict whose owner is this ride → the touches warning naming both; `update()` returns false once the node is no longer a queue (the card closes); `pickEntity` on a queue tile with a guest standing there returns the queue, on a footpath returns the guest.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** (panel built with `section`, `warningList`, `h('button')`, like the ride panel).
- [ ] **Step 4: Run** → PASS (+ `tests/unit/i18n` locale-coverage tests).
- [ ] **Step 5: tsc + full vitest, commit** `feat(ui): tap a queue tile for its ride, guest count and warnings`.

### Task 6: One-time message when touching queues are built

**Files:**
- Create: `src/ui/queues/conflictWatch.ts`
- Modify: `src/ui/index.ts` (call from the frame loop)
- Test: `tests/unit/ui/conflictWatch.test.ts`

**Interfaces:**
- Produces: `createConflictWatch(): { check(world: World, toast: (m: string, k: 'warning') => void): void; reset(world: World): void }` — the first `check` on a world only remembers the conflicts that exist (a loaded park does not toast); later, each new `rideId:ownerId` pair toasts `queue.warn.touches` once per session; a world change (`setWorld`) resets.

- [ ] **Step 1: Failing tests:** no toast on first check; joining two queues → one toast naming both rides; second check → no repeat; splitting and rejoining → no repeat (once per pair); new world → silent baseline again. Only reads when `queueConflicts` returns a new array.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: tsc + full vitest, commit** `feat(ui): one-time message when a queue touches another ride's queue`.

### Task 7: E2E, axe, fit, screenshots

**Files:**
- Create: `tests/e2e/queue-clarity.spec.ts`
- Create (not committed): `/home/user/tc-full/.superpowers/sdd/2026-11-18-queue/shots/*.png` via a scratch script

- [ ] **Step 1: Write e2e** (desktop + phone projects): build two rides with queues through `__tc.dispatch`; `data-queue-signs` lists both names; rename one → sign updates. Tap a queue tile → card with ride name, `Queue: N guests`, `Open ride` opens the ride panel; tap an unlinked queue → `This queue reaches no ride`; with the queue tool on → `data-queue-warnings` = 1; join two queues → the toast and the card warning name both rides. Filling line: open the park, run at 4× until a ride's queue ≥ 6; each queueing guest's drawn tile is a node of its ride's line (read through a debug read of the ease) and the count shown matches `ride.queue.length`. `scan()` (axe) with the card open; no clipped text in the card at 390×844 and 812×375 with large text; no console errors.
- [ ] **Step 2: Run** `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium… npx playwright test tests/e2e/queue-clarity.spec.ts` (website), then with `VITE_ART=real`; plus the e2e files touched by pick changes (`touch-controls`, `paths`, `path-builder`, `phase1-smoke`).
- [ ] **Step 3: Screenshots** 390×844 and 812×375 at DPR 2, website and `?art=real` (baked art copied read-only from `/home/user/tc-full/dist-art`): signs on two rides, tap card with highlight, unlinked warning, touching warning, long full line. Look at every shot; fix clipping/overlap and re-shoot.
- [ ] **Step 4: tsc + full vitest, commit** `test(e2e): queue signs, tap card, warnings and a filling line`.
