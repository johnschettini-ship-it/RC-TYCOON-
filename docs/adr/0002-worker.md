# ADR 0002 — Web Worker simulation: not adopted (Build 3)

- **Status:** Accepted (W4-E, Build 3). Revisit if the rule below is met on a release measurement.
- **Spec:** Phase 6 §4.6 "Web Worker simulation rule"; master §5.4 (determinism), §5.5 (game loop), §10 (budgets).
- **Measurements:** `tests/e2e/perf-build3.spec.ts` (`TC_PERF=1`, desktop project: the probe's tick times and a
  `longtask` PerformanceObserver over 30 s at 1×) and `tests/bench/render.bench.ts` (a game day of ticks of the
  Build 2 perf scene in Node). Numbers: see "Evidence".

## Rule

Adopt a Web Worker simulation only if **desktop tick p95 > 4 ms**, or **main-thread long tasks (> 50 ms) occur more
than once per 10 s**.

## Evidence

Desktop profile (1280 × 800, headless Chromium, real game loop at 1×), machine load average 1–5:

| Scene | Window | Tick p50 / p95 | Long tasks (> 50 ms) |
|---|---|---|---|
| Build 2, merged build with real shows (21:00, 22:30) | 60 s = a full game day (1,200 ticks), 1 run | 1.4 / **2.5 ms** | 0 in 60 s |
| Build 2, merged build with real shows | 30 s (13:10 → 01:10, into the night), 2 runs | 1.4 / **2.4–2.5 ms** | 0 in 30 s |
| Build 2 (128 × 128, 3,000 guests, 24 rides), before the W4-C merge | 60 s, 2 runs | 1.3–1.4 / **2.2–2.4 ms** | 0 and 1 in 60 s |
| Build 2, before the W4-C merge | 30 s, 2 runs | 1.5 / **2.6–2.7 ms** | 0 in 30 s |
| Build 1 (2,000 guests, 10 track rides, 14 flat rides) | 30 s, 2 runs (merged and before) | 0.9–1.1 / **1.6–1.8 ms** | 0–1 in 30 s |

Cross-checks and caveats:

- With the machine busy (load average 8–15 from parallel agents) the same Build 2 run gave tick p95 3.5–4.9 ms: a
  loaded device has little margin.
- Node, a full game day of the Build 2 scene in the Vitest runner: p50 2.67, **p95 4.65 ms** (Vitest's module
  transform adds a property lookup to every call into `src/sim`; the same effect makes `tick.bench.ts` read about
  2× the browser figure). `tests/bench/render.bench.ts` (bench mode) reads 9.7 ms p95 for the same loop: an upper
  bound only.
- The phone profile (4× slower CPU) ticks at p95 4–5 ms (phone scene, 800 guests) and 12–14 ms (Build 2 scene). There is no
  phone tick budget; there, render work was the bound (ADR 0001).

## Decision

**Not adopted.** On the measurement the rule names (the desktop perf run), tick p95 is 2.2–2.7 ms (≤ 4 ms; 2.5 ms
over a full game day with shows) and long tasks happen at most once per 30–60 s (≤ 1 per 10 s). Neither trigger is
met.

The margin is not large (the Vitest runner and a loaded machine both read above 4 ms), so the rule is re-checked on
every release with the same run: `TC_PERF=1 TC_PERF_SECONDS=60 TC_PERF_RUNS=2 npx playwright test
tests/e2e/perf-build3.spec.ts -g "scene build2" --project desktop`.

## Consequences

- `src/worker/**` stays empty; `Game` keeps calling `stepTick` on the main thread (no `Game` / `main.ts` contract
  change request).
- The probe (`perfProbe.tickP95`, `longFrames`) and the perf run keep measuring both rule inputs, so the decision can
  be re-checked on every release (release checklist item 2).
- If a later build adopts the worker, the Phase 6 §4.6 design stands: the worker runs the same `tick()`; the main
  thread stamps each command with `targetTick = latestTick + 1`; the worker posts double-buffered transferable render
  views (positions and sprite ids); panels request full entity data on demand; a test runs one script in main-thread
  mode and in worker mode and compares state hashes. Saves, sound cues (`world.events`), and the UI's direct reads of
  `game.world` (panels, HUD, audio listener, tile descriptions) would all need the render-view or on-demand path:
  a contract change across every Wave 4 client, which is a further reason to adopt it only when the rule is met.
