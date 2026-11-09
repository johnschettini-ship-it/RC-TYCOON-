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

EVIDENCE

## Decision

DECISION

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
