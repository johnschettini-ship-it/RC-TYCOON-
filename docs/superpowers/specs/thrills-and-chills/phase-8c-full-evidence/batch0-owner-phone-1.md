# Batch 0 bench, owner's phone, run 1 — build f46c916 (phase8c-full), realistic look

Verdict printed: PASS, "not at full sharpness: the game lowered its render ratio during the run".
Android 10, Chrome 157, DPR 2.625. build1 started at canvas 823x1521 (ratio 2); render ratio 2→1 at build1 frame 27;
every later park ran at 411x760 (ratio 1), so every park used density 2. This is NOT the full-sharpness test.

| Park | S1 p95 | S2 decode peak (≤128) | slowest turn | longest gap | caps | incomplete |
|---|---|---|---|---|---|---|
| build1 | 21.1 | 84.6 | 48.3 | 32.6 | 0 | 18 |
| build2 | 20.8 | 57.1 | 33.7 | 103.6 | 0 | 5 |
| phone | 20.2 | 62.7 | 50.5 | 29.2 | 0 | 14 |
| coaster | 19.6 | 47.1 | 52.0 | 52.5 | 0 | 11 |
| scale (info) | 21.3 | 125.6 | 146.8 | 33.1 | 1 (zoom, 155.3 MB pressure) | 20 |

S4 1.81 s. Art download 8.8 MB / 274 files in 96.5 ms (cached). Today's terrain 0 MB in every park.
Fallbacks: staff only (groundskeeper, mechanic, security — not baked). 0 degraded, no timeouts.

Reading: the ratio drop came 27 frames into the first park, so `auto` quality judged frames from the start/load,
not steady play (steady p95 ≈ 21 ms). Next: make the bench hold the device's best ratio, find why `auto` stepped
down so early, rerun.
