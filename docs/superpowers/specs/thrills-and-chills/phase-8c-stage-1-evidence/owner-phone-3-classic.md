# Stage 1 bench, owner's phone, run 3 — today's look (`?art=classic&bench=1`), same build and phone as run 2

Verdict printed by the bench: FAIL (build1 S1 38.9 ms). Android 10, Chrome 157, DPR 2.625.
Canvas at the END of the run: 411x760 (render ratio 1). Run 2 (realistic) ended at 823x1521 (ratio 2).

| Park | S1 frame p95 (≤33) | pan p95 | zoom p95 | work p95 | slowest turn | longest gap | outside-budget MB (terrain / static / sprites) |
|---|---|---|---|---|---|---|---|
| build1 | **38.9 fail** | 50.7 | 50.6 | 5.3 | 38.9 | 81.5 | 35.4 / 4.8 / 39.6 |
| build2 | 22.5 | 22.1 | 21.9 | 6.7 | 25.8 | 50.4 | 32.0 / 1.2 / 43.1 |
| phone | 21.3 | 20.3 | 21.2 | 3.4 | 20.9 | 49.4 | 32.0 / 1.2 / 43.4 |
| coaster | 21.4 | 19.9 | 32.5 | 3.3 | 21.7 | 52.8 | 31.9 / 1.2 / 42.2 |
| scale (info only) | 21.7 | 21.5 | 21.2 | 6.9 | 20.7 | 36.7 | 31.9 / 1.2 / 35.8 |

S4 start 0.82 s. All-picture peak 64 MB in every park (cache budget). No fallbacks, no degraded frames.

## Reading (inference, not measured directly)

- The game's `auto` quality (`AutoScale`, `src/perf/quality.ts`) drops the render ratio to 1 for the rest of the session
  when a 60-frame window has p95 over 50 ms on a phone (40 ms x 1.25). build1 pan p95 was 50.7 ms.
- The canvas size is read once, at the end (`defaultDevice()` in `realBench.ts`). So today's look most likely ran build1
  at ratio 2, was too slow, dropped to ratio 1, and ran the other four parks at a quarter of the pixels.
- Realistic run 2 held ratio 2 for all five parks (canvas 823x1521 at the end) with build1 p95 22.4 ms.
- So on this phone, at full sharpness, the realistic look is faster than today's look, not slower. The other four
  parks in this run are NOT a like-for-like comparison: they drew 4x fewer pixels than run 2.
- Not verified: the exact frame where the step-down happened. The bench does not log render-ratio changes.
- Memory: today's look peaks at 64 MB in all; realistic peaks at 145–160 MB all-picture (108–128 MB managed). The
  realistic look costs about 2.3–2.5x the picture memory.
