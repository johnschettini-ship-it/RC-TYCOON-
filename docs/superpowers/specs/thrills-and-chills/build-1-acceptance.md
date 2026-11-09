# Build 1 acceptance audit (Phases 0–3)

Audit of every "Done when" line in `phase-0-foundation.md`, `phase-1-first-playable.md`, `phase-2-coasters.md`, and
`phase-3-management.md` (Wave 2 gate, delivery plan). Done on 2026-11-09 by the Build 1 polish agent, on top of
commit `33ac3b5` plus the polish commits on the same branch.

**Result: 28 lines — 25 PASS, 3 GAP.** The gaps are a manual play-test with a new player, the GitHub deploy (owner
setting), and the phone frame-rate budget (not met on the headless proxy; needs a real device). Details below.

## How it was checked

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | clean |
| Unit + integration | `npx vitest run` | 105 files, 1,454 tests passed, 1 skipped (`balance-sweep`, opt-in) |
| Build | `npx vite build` | JS 144.1 KB + CSS 6.0 KB gzipped (budget 400 KB) |
| Benchmarks | `npm run bench` | see "Performance" |
| Smoke (desktop + phone) | `CI=1 npx playwright test --trace off` | 19 passed, 15 skipped (opt-in screenshot / perf scripts, profile-only tests) |
| Sub-path load | `vite preview --base /thrills-and-chills/` + Chromium | title → new park, canvas drawn, no console errors, no failed requests |
| Frame rate | `TC_PERF=1 npx playwright test tests/e2e/perf.spec.ts` | see "Performance" |

"CI" below means the same commands as `.github/workflows/ci.yml` run locally; GitHub Actions runs were not observable
from this environment (nothing is pushed by agents).

## Phase 0 — Foundation

| # | Done when | Result | Evidence |
|---|---|---|---|
| 0.1 | `npm run build` output loads from a sub-path (checked with `vite preview --base`) | PASS | `vite.config.ts` `base: './'`; `dist/index.html` uses `./assets/…`. Checked this audit with `vite preview --base /thrills-and-chills/` in Chromium: the title screen starts a park, the canvas draws, no errors or failed requests. |
| 0.2 | The map renders, pans, and zooms with mouse, keyboard, and touch | PASS | `tests/unit/ui/camera.test.ts` (wheel notches, trackpad, clamp), `tests/unit/ui/keyboard.test.ts` and `controller.test.ts` (arrow-key pan, +/− zoom, one-finger pan, pinch, wheel zoom about the cursor); e2e `boot.spec.ts` (map drawn), `phase1-smoke.spec.ts` "a two-finger pinch zooms". |
| 0.3 | The highlight follows the cursor on desktop and the tapped tile on touch | PASS | `controller.test.ts` "mouse hover highlights the tile under the cursor; leaving clears it" and "a tap selects the tile…" (selected-tile outline, `renderer.ts` `drawOverlays`). |
| 0.4 | All unit and smoke tests pass in CI. The deploy workflow publishes the site | GAP | Tests: green locally with the CI commands. Deploy: `.github/workflows/deploy.yml` builds and uploads `dist` on `main`, but publishing needs the owner to set Settings → Pages → Source to "GitHub Actions" (master §12.3) and a push to `main`; not verifiable here. |

## Phase 1 — First playable

| # | Done when | Result | Evidence |
|---|---|---|---|
| 1.1 | Manual play-test: a new player builds a path, a queue, a ride, and a stall, and opens the park within 2 minutes without help text | GAP | Needs a human first-time player; not done. Automated proxy: e2e `phase1-smoke.spec.ts` builds a path, a Carousel with a queue, opens the park (desktop) and tap-builds a path and a ride with Confirm (phone). |
| 1.2 | Guests arrive, ride, buy, use restrooms, and leave. The finance panel explains every change in cash | PASS | `tests/integration/phase1-game.test.ts`: > 300 arrivals, every ride has riders and every stall (Restrooms included) has sales, leavers happy on average, no guest stuck > 2 game days, ledger invariant every month; `tests/unit/ui/finance.test.ts` (panel lines = ledger). |
| 1.3 | Thrill and Chill guests visibly prefer different rides (integration test and overlay) | PASS | `phase1-game.test.ts` "Thrill and Chill guests prefer different rides"; temperament overlay (toolbar "Temperament", guest tint) — `tests/unit/render/scene.test.ts` "tints blue at T ≤ 35 and orange at T ≥ 65". |
| 1.4 | Save, reload, export, and import keep the full state | PASS | `tests/unit/save/roundtrip.test.ts`, `tests/integration/save-roundtrip-load.test.ts` (busy park, same hash after 1,000 ticks, byte-identical re-save), `tests/unit/save/browser.test.ts` (export `.tcsave.json`, import, foreign file message), e2e `phase1-smoke.spec.ts` "save, reload, load". |
| 1.5 | All tests pass in CI. Performance budgets from the master spec are met, or the gap is documented | GAP | Tests green; tick budget met; desktop 60 fps met (see "Performance"). The phone budget (30 fps, 800 guests) is not met on the only proxy available here and is not yet measured on a real phone — documented below (G3) with a plan. |

## Phase 2 — Coasters

| # | Done when | Result | Evidence |
|---|---|---|---|
| 2.1 | All 29 pieces exist with sample tables that pass the piece table tests | PASS | `tests/unit/track/pieces.test.ts` "has all 29 pieces in table order with the listed costs" and the per-piece entry/exit and sample checks. |
| 2.2 | A player builds R1 by hand on desktop and on a phone | PASS | e2e `track.spec.ts` "build R1 through the builder, place the gates, test, and open" on both profiles (mouse + Build button; taps + Confirm/Build; pinch mid-build adds no piece). |
| 2.3 | Every error string in 4.6 has a passing test | PASS | All 24 §4.6 strings are asserted in `tests/unit/track/commands.test.ts` (and `tests/unit/ui/track/builder.test.ts` for previews); "Too high … (max 12 m)" is asserted with its filled value. |
| 2.4 | R1 passes its test with ratings near 5.00 / 3.46 / 1.42, and guests ride it for a month | PASS | `tests/unit/track/operation.test.ts` "builds R1 by commands, tests, opens, and carries guests for a month" (within ±0.05); `tests/unit/track/ratings.test.ts` worked example 500 / 346 / 142. |
| 2.5 | A 3-train coaster with 3 block brakes runs 10 game days with no contact | PASS | `operation.test.ts` "3 trains with 3 block brakes run 10 game days with no contact" (clearance ≥ 1 m). |
| 2.6 | Test-only defs for powered, guest-driven, and spinning types pass their physics tests | PASS | The real types now exist; `tests/unit/track/physics.test.ts` (powered speed and corners, guest-driven temperament speed, 3 m gap rule) and `operation.test.ts` (Mini Railway, Go-Kart Track, Spinning Mouse run without contact). |
| 2.7 | Save round-trip with moving trains passes | PASS | `tests/integration/track-save.test.ts` (save mid-ride with seated guests, same hash after 1,000 ticks). |
| 2.8 | Desktop and phone smoke tests pass. CI is green | PASS | `CI=1 npx playwright test` green on both profiles (local run of the CI commands). |
| 2.9 | Frame rate meets the Build 1 budget with 10 track rides open | PASS | Desktop scene with 10 open track rides and 2,000 guests: 58.8–60 fps in every view (`tests/e2e/perf.spec.ts`, see "Performance"). The phone budget is G3. |

## Phase 3 — Management

| # | Done when | Result | Evidence |
|---|---|---|---|
| 3.1 | All 4 staff types can be hired, fired, assigned patrols, and do their tasks in the integration game | PASS | `tests/integration/phase3-game.test.ts`: all 4 types hired and paid, a patrol painted, and (new this audit) "every staff type does its work" — Groundskeepers sweep and empty bins, the Mechanic inspects and fixes, Security roams, the Performer performs. Fire and patrol commands: `tests/unit/staff/commands.test.ts`, `mechanics.test.ts`. |
| 3.2 | Wages, research, marketing, interest, and repairs appear in the ledger. The month finance check passes | PASS | `phase3-game.test.ts` (wages, research, marketing $600, loan interest, finance check every month); repairs: `tests/unit/staff/commands.test.ts` "repairPathItem costs 50% of build cost to repairs". |
| 3.3 | Rides break down, Mechanics fix them, and inspections raise reliability as specified | PASS | `phase3-game.test.ts` (fixed within FIX_TICKS × 1.5 + walk); `tests/unit/staff/breakdowns.test.ts`, `mechanics.test.ts`, `reliability.test.ts`. |
| 3.4 | All 21 research items unlock in default order at the specified costs. Focus changes the order | PASS | `tests/unit/management/research.test.ts` (21 items, 6,460 points, focus picks, surplus carry) and `phase3-game.test.ts` (exactly items 1–6). |
| 3.5 | All 7 campaigns work and respect the cap and exclusivity rules | PASS | `tests/unit/management/marketing.test.ts` (each campaign's effect, one per type, Thrill/Chill exclusive, product cap, expiry, target removal). |
| 3.6 | Weather follows season weights. Storm hold, umbrellas, covered rides, and stall factors work | PASS | `tests/unit/management/weather.test.ts` (season table over 5 years, storm rules, tall-ride hold, umbrella and covered effects, stall factors). Umbrellas now also show over guests in rain (`tests/unit/render/guestItems.test.ts`). |
| 3.7 | The 8 new stalls and facilities, 10 flat rides, and 4 track ride types work in a park | PASS | `tests/unit/facilities/*` (flat rides, food, services, souvenirs, impulse, wayfinding); track types: Spinning Mouse and Go-Kart Track in `operation.test.ts`, and (new this audit) Wooden Coaster and Ghost Train pass a test and carry guests (`operation.test.ts` "every Build 1 track type…"). |
| 3.8 | Park value and the new rating appear in the UI and match the formulas | PASS | Rating in the HUD and Park panel, park value in the Finance panel loan section; `tests/unit/economy/rating.test.ts`, `tests/unit/management/parkValue.test.ts`. |
| 3.9 | Messages log, toast, and locate their targets on desktop and touch | PASS | `tests/unit/ui/management/messages.test.ts` (log order, unread, locate ride/stall/guest/staff, removed-target fallback), `staffAndToasts.test.ts` (toast arbitration); e2e `management.spec.ts` opens Messages on both profiles. |
| 3.10 | Unit, integration, determinism, save, and smoke tests pass. The benchmark meets the budget, or the gap is documented | PASS | All suites green; tick and hour-start tick within 3 ms (see "Performance"). |

## Gaps

| Id | Line | Gap | Plan |
|---|---|---|---|
| G1 | 1.1 | No manual play-test with a new player. | Owner (or a recruited first-time player) runs it before the Build 1 release; automated flows already cover the steps. |
| G2 | 0.4 | Deploy publishing not verified. | Owner sets Pages → "GitHub Actions" (master §12.3); the first push to `main` publishes. Check the site loads from its `/RC-TYCOON-/` sub-path (0.1 shows the build does). |
| G3 | 1.5 | Phone frame rate (master §10: 30 fps with 800 guests) not met on the proxy and not measured on a real phone. | See "Performance". Measure on a mid-range phone; if it misses, cap the canvas device-pixel ratio on small screens and cache the track layer before the Phase 6 renderer decision. Large: not fixed in this polish pass. |

## Performance

**Tick time** (master §10: < 3 ms with 2,000 guests). `tests/integration/perf-budget.test.ts`, normal runner, means of 3 runs:

| Scene | Tick mean | Hour-start tick mean, before → after this polish |
|---|---|---|
| 2,000 guests, 10 rides, 8 staff | 1.1–1.3 ms | 2.65–3.01 → 1.63–1.80 ms |
| 2,000 guests, 10 rides, 40 staff, 1,000 litter | 1.0–1.1 ms | 2.72–2.91 → 1.49–1.61 ms |
| Lockstep crowd (worst case, not a budget scene) | 0.9–1.0 ms | 4.45–4.93 → 3.19–3.25 ms |

- The hour-start work fell from about 1.5 ms to about 0.5 ms: the rating counts "too expensive" thoughts from the
  cooldown record in one pass with ids found once, the hourly 4,096-tile scans are tight, catalog lookups use maps.
- The old bench put all 2,000 guests down on one tick, so they stepped in lockstep and every 10th tick — every hour
  start among them — carried about 3× a normal tick. The bench crowd now enters over 10 ticks, like arrivals; the
  lockstep case stays as a reported worst case. It is still over 3 ms at the hour start (3.2 ms): the guest step work
  of the whole park lands on that tick.
- `npm run bench` (Vitest bench mode, about 2.4× slower than the normal runner; an upper bound): tick 2.68 / 2.42 ms,
  field rebuild 0.51 ms, hour-start 3.08 / 3.15 ms, lockstep hour-start 6.76 ms.
- Results are unchanged by the speed-ups: state hashes, hourly ratings, and park values were compared before and after
  on the lockstep scenes and a 3-month Phase 3 game.

**Frame rate** (`tests/e2e/perf.spec.ts`, `TC_PERF=1`; headless Chromium, software raster, real game loop at 1×, 5 s):

| Scene | Crowd view | Track view | Whole map (zoom 0.5) |
|---|---|---|---|
| Desktop 1280 × 800, 2,000 guests, 10 open track rides | 58.8 fps (p95 16.7 ms) | 59.2 fps (p95 16.7 ms) | 58.6 fps (p95 16.8 ms) |
| Pixel 7 profile (DPR 2.6), CPU 4× slower, 800 guests, 10 track rides | 6.9 fps (p95 200 ms) | 4.4 fps (p95 300 ms) | — |

- Desktop meets 60 fps (frames are vsync-bound). The phone proxy misses 30 fps by far, but even an empty park runs at
  about 12 fps there, so most of the cost is per-pixel software raster of a 1082 × 2202 canvas under a 4× CPU
  throttle, not guests. A real phone rasterizes canvas on the GPU, so the proxy is pessimistic; it still flags the
  track layer (track view slower than the crowd view) and the full device-pixel ratio as the first things to check.

## Changes made during this audit

- Phase 3 integration game: the §9.2 Junior Coaster is now part of the park (it was left out before the track system
  merged), and the game checks every staff type's work.
- Unit tests for the Junior Coaster, Wooden Coaster, and Ghost Train running with guests.
- Phase 2 §5 type block brought in line with `src/sim/rides/track/types.ts`.
- Frame-rate measurement script (`tests/e2e/perf.spec.ts`) and the hour-start tick check in `perf-budget.test.ts`.
