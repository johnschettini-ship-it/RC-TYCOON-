# Stage 1 bench, owner's phone, run 2 — round 3 build (f59f10b), realistic look: PASS

Android 10, Chrome 157, DPR 2.625, canvas 823x1521 (render ratio 2; run 1 was 411x760, ratio 1 — this run draws 4x the pixels).

| Park | S1 frame p95 (≤33) | work p95 | S2 managed peak (≤128) | all-picture peak | S3 slowest turn | sharpen max | longest gap (S6g ≤500) |
|---|---|---|---|---|---|---|---|
| build1 | 22.4 | 6.9 | 120.9 | 160.3 | 48.1 | 250.2 | 82.2 |
| build2 | 22.4 | 7.7 | 112.5 | 154.0 | 47.5 | 51.2 | 91.6 |
| phone | 21.1 | 5.5 | 108.5 | 145.0 | 76.2 | 216.4 | 61.9 |
| coaster | 21.9 | 6.0 | 127.7 | 151.3 | 27.8 | 301.0 | 48.0 |
| scale (info only) | 22.6 | 8.9 | 128.0 | 147.1 | 150.9 | 150.9 | 130.7 |

- S4 start 1.59 s pass. Art download 8.8 MB in 4.2 s before the run.
- 0 degraded frames, no timed-out waits. Fallbacks: staff only (not baked).
- Versus run 1 (round 1 build): build2 p95 35.8 → 22.4 ms, coaster slowest turn 379 → 28 ms, longest gap 1,060 → 48 ms.
- Open: all-picture peak 145–160 MB (today's terrain 26–49 MB still outside the budget); coaster managed peak 127.7 of 128 MB (tints 39 MB); sharpen after the first turn up to 301 ms. Today's-look run on the same phone still to come.
