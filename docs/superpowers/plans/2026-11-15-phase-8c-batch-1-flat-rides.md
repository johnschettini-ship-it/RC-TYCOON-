# Phase 8c batch 1: flat rides — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bake the 15 flat rides that still draw in today's look, so all 18 flat rides draw in the realistic look, inside the memory and speed rules.

**Architecture:** Each ride is one item module in `tools/art3d/items/` built in code with three.js (the stage 1 pattern: `export default { bake(B) }`, `rideKeys`, `bakeObject`). The registry, the card list, the catalogue heights and the reader's `BAKED` list gain one entry per ride. A new bench park places all 18 rides, and the review page shoots them; the owner approves the batch side by side (D9).

**Tech Stack:** three.js 0.160 (vendored build tool), headless Chromium bake, TypeScript reader, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/thrills-and-chills/phase-8c-realistic-art.md` (§5.1 kit, §5.3 flat rides, §5.6 big objects, §8 originality). Roadmap: `docs/superpowers/plans/2026-11-14-phase-8c-full-build.md` (batch 1 row). Batch 0 notes: `phase-8c-full-evidence/batch0-deferred.md`.

## Global Constraints

- Branch `phase8c-full` (batch 0 merged, head `b8b5455` at plan time); task branches `b1-tN` in worktrees `/home/user/tc-b1-*`; controller merges. No merge to `main`.
- Originality (spec §8): every model, texture and light made by code in this project; nothing downloaded, traced or generated; must not copy any existing game's ride designs, names or look. Ride names are the catalogue's own.
- Website build byte-identical in JS/CSS/HTML; today's look unchanged (`classicOps` golden); realistic paths behind `import.meta.env.VITE_ART === 'real'`; storage under `tcreal:` only.
- Lighting, camera, densities, colour grade: the kit's fixed values (spec §5.1 item 4, §5.2). Heights true proportions (F3, 9.8 px/m).
- **Height rule:** each ride's `RIDE_HEIGHT_M` in `tools/art3d/catalog.ts` = today's drawn height in pixels ÷ `STEP_PX` (8 px/m), rounded to 0.5 m, from `HEIGHTS` in `src/render/sprites/rides.ts` or `CONTENT_RIDE_ART[id].height` in `src/render/sprites/content/index.ts`. Picking and gameplay sizes then match today's look.
- **Frame rule:** frames follow `src/render/anim.ts`: 32 angle slots, phones use even angles (`coarseRideFrame`), occupancy baked as empty and full (`occ0`/`occ1`). Fold frames by the ride's real symmetry period, measured against `REVOLUTIONS[defId] ?? 2`. A motion that is not a rotation (drop, swing, lift) uses the 16 even slots as time in the cycle. Round rides with rotational symmetry bake `rots: 'all'`; any ride with a front (entrance, boarding, a non-square footprint) bakes `rots: [0,1,2,3]`.
- **Size rule per ride:** compressed ≤ 2.5 MB (S5 projection) and decoded per turn at density 4 ≤ 32 MB. Over either, cut frames by symmetry or simplify geometry before merging; state the numbers in the report.
- No tint masks for rides in this batch (no ride colour choice in the game yet).
- Walk-through rides (mirror_maze, haunted_manor) have no riders: one occupancy state.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01Q5pHggx1eLkEH7W16KJFwP`.
- Gate per task: `npx tsc --noEmit`, `npx vitest run tests/unit/art3d tests/unit/render/real`, one full `npx vitest run`, the bake of the task's items (`node tools/art3d/bake.mjs --out dist-art/real`), `npx tsx tools/art3d/checkIndexCli.ts dist-art/real` (S5 and missing files), `VITE_ART=real npx vite build`.

## Review Focus

1. **Wrong cycle period.** A ride whose baked frames assume a different period than `REVOLUTIONS` jumps once per cycle in play. Test: for each new ride, a unit test that the frame for angle slot 0 and slot 32 (wrapped) map to the same picture id, and that consecutive game frames map to pictures in order.
2. **A ride left in today's look by accident.** A missing `BAKED` entry silently draws today's art. Test: every `FLAT_RIDES` id is in `BAKED` and in `ITEM_LIST`, and none is in `STAND_INS` (Task 1).
3. **Front-facing ride baked as round.** An entrance or boarding side drawn in the wrong place after a view turn. Test: rides with `rots: [0,1,2,3]` are exactly the non-round list in Task 1; the review page shows turns 0 and 1.
4. **Memory with many rides on screen.** 18 different rides on screen at density 4 cannot all fit 128 MB. Expected: the ladder lowers far rides first, no hang, S2 ≤ 128. Test: the new `rides` bench park (Task 6).
5. **Card art.** Each ride's card picture is its own bake, not a stand-in. Test: the cards set has a frame per flat ride (Task 1).

---

### Task 1: Batch scaffolding (shared lists, heights, tests)

All shared edits in one task, so the ride tasks touch only their own module files plus one line each in the lists.

**Files:**
- Modify: `tools/art3d/catalog.ts` (`RIDE_HEIGHT_M` for all 15, by the height rule), `tests/unit/art3d/catalog.test.ts`
- Modify: `src/render/real/fallbacks.ts` (remove `teacup_twirl` from `STAND_INS` only when Task 2 merges — see below), `tests/unit/art3d/bakeRegistry.test.ts`
- Create: `tools/art3d/items/flatRides.js` — shared helpers for the batch
- Create: `tests/unit/art3d/flatRides.test.ts`

**Interfaces:**
- Produces in `tools/art3d/items/flatRides.js`:
  - `export const NON_ROUND = ['bumper_cars', 'pendulum_ship', 'magic_carpet', 'big_wheel', 'haunted_manor', 'mirror_maze', 'thunder_disc', 'drop_tower', 'observation_tower', 'spiral_slide']` — rides that bake `rots: [0,1,2,3]`.
  - `export function cycleKeys(item, opts: { period: number; walkThrough?: boolean }, pick)` — wraps `rideKeys` with the frame rule: `period` in even angle slots (2..32); `walkThrough` bakes one occupancy state.
  - `export function timeKeys(item, opts: { walkThrough?: boolean }, pick)` — 16 time steps for non-rotational motion.
- Test helpers in `flatRides.test.ts`: `periodOk(id)` asserting slot 0 ≡ slot 32 and monotone pictures — reused by every ride task (each adds its id to the table).
- [ ] **Step 1:** Write failing tests: `catalog.test.ts` — every `FLAT_RIDES` id has a `RIDE_HEIGHT_M` entry equal to today's pixel height ÷ 8 rounded to 0.5; `bakeRegistry.test.ts` — `it.todo` list of the 15 ids becomes real assertions in each ride task (Task 1 asserts the 3 baked ones plus the helper contract); `flatRides.test.ts` — `cycleKeys` and `timeKeys` key counts and wrap.
- [ ] **Step 2:** Run: fail. **Step 3:** Implement heights and helpers. **Step 4:** Run: pass; gate.
- [ ] **Step 5:** Commit `feat(art3d): batch 1 scaffolding — ride heights, frame helpers`.

### Tasks 2–5: Ride modules (parallel; each group in its own worktree)

Each ride follows the same steps; the group task repeats them per ride.

**Files per ride `X`:**
- Create: `tools/art3d/items/X.js` (`export default { bake(B) }`, uses `placeOnFootprint`, `cycleKeys` or `timeKeys`, `bakeObject({ kind: 'ride', item: 'X', ... })`).
- Modify (one line each): `tools/art3d/items/registry.js` (`ITEM_LIST` entry `{ id: 'X', file: 'items/X.js', catalog: ['ride','X'], deps: RIDE_DEPS }`, `CARD_ITEMS` entry), `tools/art3d/items/index.js` and `index.d.ts`, `tools/art3d/items/cards.js` (`MODULES`), `src/render/real/fallbacks.ts` (`BAKED`), `tests/unit/art3d/bakeRegistry.test.ts` (`REAL_FALLBACK_IDS`), `tests/unit/art3d/flatRides.test.ts` (period table).

**Steps per ride:**
- [ ] Add X to the test tables (registry, fallback ids, period table); run; fail.
- [ ] Build the model: recognisable as the ride today's look shows (read its drawing code named below), realistic materials and proportions, riders seated when full, original design.
- [ ] Bake X; open its pictures (turn 0 and 1, empty and full, three frames across the cycle) and look at them; check the size rule with the size report.
- [ ] Run tests; pass. Commit `feat(art3d): bake X`.

| Task | Group | Rides (today's drawing code) | Motion |
|---|---|---|---|
| 2 | Spinners | teacup_twirl (`rides.ts:352`; also remove it from `STAND_INS`), rocket_rounds (`gentleRides.ts` ~135), kiddie_cars (`phase6Rides.ts:145`), merry_mill (`phase6Rides.ts:216`) | rotation; teacups 3 revolutions per cycle (`anim.ts:15`) |
| 3 | Swingers | pendulum_ship (`thrillRides.ts:44`, 3×5), magic_carpet (`phase6Rides.ts:45`, 4×3), flip_arm (`thrillRides.ts:340`) | swing / arm rotation — `timeKeys` for the ship and carpet |
| 4 | Towers | observation_tower (`gentleRides.ts` ~264), drop_tower (`thrillRides.ts:261`), gyro_globe (`phase6Rides.ts:274`), spiral_slide (`gentleRides.ts` ~222) | lift / drop (`timeKeys`), gimbal (1×/2×/3× axes: period = full cycle), riders sliding |
| 5 | Buildings and arenas | bumper_cars (`gentleRides.ts` ~41, 4×4 pavilion), mirror_maze (`gentleRides.ts` ~304, walk-through), haunted_manor (`gentleRides.ts` ~379, walk-through), thunder_disc (`thrillRides.ts:162`, 4×4) | cars / disc motion (`timeKeys`); walk-throughs static with a light change across 4 time steps at most |

Big rides taller than one screen column follow spec §5.6 (cut into columns by the existing `blitColumn` path, as stage 1 did for rides).

### Task 6: Rides bench park and review page

**Files:**
- Modify: `tests/perf/scenes.ts` (new scene `rides`: all 18 flat rides placed within two screens of each other, paths and 300 guests), `src/perf/realBench.ts` (add `rides` to the verdict scenes), `tests/unit/perf/scenes.test.ts`
- Modify: deploy workflow on `ccr-6f420895-3xt45j`: the review step shoots all 18 rides (`--items` default already includes every `ITEM_LIST` entry with `catalog`).

**Interfaces:**
- Consumes: Tasks 2–5 baked items; the save format used by the existing scenes.
- [ ] **Step 1:** Failing test: the `rides` scene contains each `FLAT_RIDES` id exactly once and fits the map.
- [ ] **Step 2–4:** Fail, implement, pass.
- [ ] **Step 5:** Headless bench (390×844, DPR 2.75, quality high) on the merged branch: all scenes incl. `rides` — S2 ≤ 128, turns, caps, degraded, timeouts. Record.
- [ ] **Step 6:** Commit `feat(bench): rides park with all 18 flat rides`.

### Task 7: Batch gate (controller + owner)

- [ ] Merge Tasks 1–6; final whole-batch review; one fix wave.
- [ ] Deploy; check the deploy log for the size report (`projectedFull` ≤ 150 MB, `ride` basis now `measured` for all 18).
- [ ] **Owner:** review page — approve or reject each ride (D9). Rejected rides go back to their group task.
- [ ] **Owner:** bench on the phone at `/real-game/?art=real&bench=1`: pass on every scene including `rides`, no render ratio change.
- [ ] Evidence files `phase-8c-full-evidence/batch1-*.md`; update the full build plan's batch table.

## Not covered by this plan

- Ride colour choice (no tint masks for rides until the game offers ride colours).
- Lit and night variants (batch 7).
- Track rides (batch 5).
