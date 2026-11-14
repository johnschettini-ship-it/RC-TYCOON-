# Stage 1 bench, owner's phone, run 1 (2026-11-14)

Android 10, Chrome 157, DPR 2.625, canvas 411x760 (render ratio capped at 2 on phones). Build: /real-game/ from phase8c-stage1 7754617.

| Park | S1 frame p95 (≤33) | S2 peak (≤128 MB) | S3 slowest turn (250 / 500 ms) | Other |
|---|---|---|---|---|
| build1 (2,000 guests) | 32.6 pass | 102.3 pass | +84 / −115 pass | S4 start 2.2 s pass; work p95 16.9 ms |
| build2 (3,000 guests) | **35.8 fail** | 56.3 pass | +136 / −116 pass | work p95 24.7 ms; all density 2 |
| phone (800 guests) | 23.2 pass | 64.2 pass | +93 / −117 pass | 1 cap event |
| coaster (600 guests) | 32.8 pass | 124.8 pass | **+379 / +274 fail** | densities 4/2/2/4/2; longest gap 1,060 ms; 72 incomplete frames; tints 29.5 MB at peak |

- Art download 8.8 MB in 351 ms before the run; boot to first complete frame 381 ms.
- Fallbacks: staff (groundskeeper, mechanic, security) draw in today's art — staff are not baked in stage 1.
- Not yet known: today's look on the same phone for build2 (S1 may be the game's own cost, not the art's — work p95 24.7 ms).
