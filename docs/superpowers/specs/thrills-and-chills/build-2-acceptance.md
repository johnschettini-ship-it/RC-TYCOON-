# Build 2 acceptance audit (Phases 4–5)

Audit of every "Done when" line in `phase-4-land-scenery-after-dark.md` and `phase-5-scenarios.md`, done at the
Build 3 release gate (Wave 4, delivery plan) on 2026-11-09, on top of `c09c8ca` (Phases 0–6 merged) plus the gate
commits on the same branch. Build 2 shipped inside the Build 3 code: every line is checked against the merged game.

**Result: 15 lines — 14 PASS, 1 GAP.** The gap is the recorded manual win of each scenario on Standard (a person
plays it). Three small gaps were closed during this audit (see "Changes made during this audit").

## How it was checked

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | clean |
| Unit + integration | `npx vitest run` | 247 files (1 skipped), 3,463 tests passed, 2 skipped (the opt-in balance sweep and perf-scene writer) |
| Build | `npx vite build` | JS 306.4 KB + CSS 7.5 KB gzipped (budget 400 KB) |
| Benchmarks | `npm run bench` | 6 files, 17 benchmarks run |
| Desktop + phone | `CI=1 PW_PORT=4801 npx playwright test --trace off` | 204 tests: 130 passed, 74 skipped (opt-in and other-profile tests), 0 failed |
| Phone map generation | `TC_PERF=1 npx playwright test tests/e2e/mapgen.spec.ts --project phone` | 230–258 ms (budget 800 ms) |

"CI" below means the same commands as `.github/workflows/ci.yml` run locally; GitHub Actions runs are not
observable from this environment (agents never push).

## Phase 4 — Land, scenery, After Dark

| # | Done when | Result | Evidence |
|---|---|---|---|
| 4.1 | All tools in section 7 work with mouse, keyboard, and touch | PASS | Land, Level, Water: `tests/unit/terrain/input.test.ts` (mouse brush ghost, click, hold-to-repeat 300 ms, smooth, paint, corner, level drag; touch tap ghost, Raise / Lower mini-bar, hold, corner marker, level + / − and Confirm, second finger cancels; `Page Up` / `Page Down`). Buy Land: `tests/unit/land/buyLand.test.ts`, `tests/unit/ui/buyLand.test.ts`. Scenery: `tests/unit/scenery/input.test.ts`. Path height: `tests/unit/paths/pathHeight.test.ts`. Overlays: `tests/unit/fields/overlay.test.ts`. View: `tests/unit/ui/rotation.test.ts`. Park panel switch: `tests/unit/lighting/afterDarkUi.test.ts`. Playwright on both profiles: `land`, `paths`, `scenery`, `view`, `fields`, `afterDark` specs; keyboard-only play with the map cursor: `keyboard.spec.ts` (Build 3). |
| 4.2 | Every error string in sections 4.1–4.9 appears in a test | PASS | All 23 quoted strings of §4.1–4.9 were scanned for this audit; each appears in a test: `tests/unit/scenery/placement.test.ts` (in the way, clearance, entrance, outside the park, construction rights, water, flat land), `tests/unit/paths/build.test.ts` (water, slope), `tests/unit/terrain/strings.test.ts` and `water.test.ts` (higher, lower, water higher, no water, skip warning), `tests/unit/ui/buyLand.test.ts` (nothing to buy, not for sale), `tests/unit/track/phase4Placement.test.ts` (track below the land), `tests/unit/ui/controller.test.ts` (path below the land), `tests/integration/scenarios.test.ts` (land must be flat). `tests/unit/i18n/reasons.test.ts` also maps every error constant back to its string id. |
| 4.3 | Water rides pass test runs and get ratings with the water extras | PASS | `tests/unit/track/waterRides.test.ts` (both circuits close, pass the test, ratings = Phase 2 formula + extras, guests ride and get wet), `waterRatings.test.ts` (extras table and count limits), `waterPhysics.test.ts` (splashdown cap, whirlpool); `tests/e2e/waterRides.spec.ts` builds, tests, and opens both on desktop and phone. |
| 4.4 | The 85 scenery items render in all 4 view rotations | PASS | `tests/unit/scenery/catalog.test.ts` (85 ids in spec order), `tests/unit/scenery/art.test.ts` (every item inside its bounds in every rotation and variant; the 4 rotations differ), `render.test.ts`; screenshot `docs/screenshots/wave3-scenery.png`. |
| 4.5 | Calm, Buzz, and Light overlays show correct bands with a legend | PASS | `tests/unit/fields/overlay.test.ts` (bands, legend), `tests/unit/lighting/layer.test.ts` (Light overlay and legend); `tests/e2e/fields.spec.ts` (V cycles, legend, hover / tap value, both profiles), `afterDark.spec.ts` (Light overlay draws). |
| 4.6 | After Dark on and off behave as in 4.7 | PASS | `tests/unit/lighting/commands.test.ts` (switch, warning text, no ledger line), `darkness.test.ts`, `nightEffects.test.ts`, `lightMap.test.ts`, `determinism.test.ts`; `tests/e2e/afterDark.spec.ts` (switch, dark-path toast, darker canvas at 22:00, phone switch). |
| 4.7 | 3 Build 1 fixture saves migrate and keep playing for 1 game month without errors | PASS | `tests/unit/save/migrate-v1.test.ts`: `save-v1`, `save-v1-new`, and `save-v1-rich` load through 1 → 2 → 3, keep every Build 1 value, re-save, and **each plays a whole game month** with a valid state (the new and rich parks played only part of a day before this audit). |
| 4.8 | Section 9 tests pass. CI is green | PASS | Full suite green with the CI commands (table above). |
| 4.9 | Section 4.10 budgets are met, or the gap and a fix plan are documented | PASS | Desktop 128 × 128 with 3,000 guests (master §10: 60 fps, tick < 4 ms): 59.9–60 fps, tick p95 2.4–2.5 ms (`docs/adr/0001-renderer.md`, merged-build table; `tests/e2e/perf-build3.spec.ts`). Chunk and sprite caches: byte-budget LRU (`tests/unit/render/spriteCache.test.ts`, `tests/unit/render/terrain.test.ts`, `tests/unit/perf/quality.test.ts`; ADR 0001 replaced the separate 64 / 96 MB caps with one budget of 192 MB desktop, 64 MB phone). Guest LOD at zoom ≤ 0.5, distance fields (`tests/unit/paths/perf.test.ts`: 100 destinations × 5,000 nodes), field updates (`tests/unit/fields/perf.test.ts`), light pass (`tests/unit/lighting/perf.test.ts`). |

## Phase 5 — Scenarios

| # | Done when | Result | Evidence |
|---|---|---|---|
| 5.1 | All 8 scenarios, the tutorial, and sandbox start from the title screen on desktop and phone | PASS | New this audit: `tests/e2e/scenario-starts.spec.ts` starts each of the 8 scenarios on Standard through title → New game → Scenarios → card → Start, with the mouse on desktop and taps on the phone (16 runs). Sandbox: `scenario.spec.ts` (desktop setup and Start; phone "New game, sandbox setup, and Start fit the phone"). Tutorial: `tutorial.spec.ts` (desktop steps 1–4; phone steps 2–4 with touch). |
| 5.2 | Every goal type and award passes its unit tests | PASS | `tests/unit/scenario/goals.test.ts` (every goal type at pass, fail, and boundary; streaks), `tests/unit/awards/criteria.test.ts` and `effects.test.ts` (every award criterion and effect). |
| 5.3 | Each scenario has a recorded manual win on Standard | GAP | Needs a person to play each scenario to a win (G1). Automated proxy: the scripted Meadow Start win (`tests/integration/scenarios.test.ts`), the win, loss, and keep-playing rules (`tests/unit/scenario/lifecycle.test.ts`), and every scenario's generated map, goals, and start money (`tests/unit/scenario/scenarios.test.ts`). |
| 5.4 | Progress survives reload; corrupt progress shows an error and never resets without the player | PASS | `tests/unit/progress/store.test.ts` and `model.test.ts` (validation, every corruption class → error and no write, merge rule, reset only by the player; Build 3: `importRaw` with the same errors); `tests/unit/save/progress-v2.test.ts` (Build 2 progress file); `tests/e2e/scenario.spec.ts` (corrupt and newer progress, a won run recorded once, survives reload). |
| 5.5 | Map generation meets the time budget on the reference phone profile | PASS | §4.2: 128 × 128 in < 300 ms on desktop (`tests/unit/scenario/sandbox.test.ts`) and < 800 ms on a mid-range phone. New this audit: `tests/e2e/mapgen.spec.ts` (`TC_PERF=1`, Pixel 7 profile, CPU 4× slower) times the whole Start click of a 128 × 128 sandbox: 258 ms (mountains), 230 ms (rolling hills), 236 ms (river valley). A real phone is checked by the owner (Build 3 checklist item 4). |
| 5.6 | CI is green | PASS | Same commands as CI, green (table above). |

## Gaps

| Id | Line | Gap | Plan |
|---|---|---|---|
| G1 | 5.3 | No recorded manual win on Standard for the 8 scenarios. | Owner (or a play-tester) plays each scenario on Standard before the `build-3` tag and records the end month and stars in the release notes; the automated proxies above cover the rules. |

## Changes made during this audit

- `tests/unit/save/migrate-v1.test.ts`: the new and the rich Build 1 fixtures now play a whole game month after the
  upgrade (4.7 named 3 fixtures; only one played a month).
- `tests/e2e/scenario-starts.spec.ts`: every scenario starts from the title on both profiles (5.1 covered 1 of 8).
- `tests/e2e/mapgen.spec.ts`: the phone map-generation measurement (5.5 had a desktop test only).
- Master §5.1, Phase 0 §4.8, and Phase 4 §4.10 now say 8 × 8-tile terrain chunks (ADR 0001).
