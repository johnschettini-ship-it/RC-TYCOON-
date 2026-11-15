# Batch 0 bench, owner's phone, run 2 — build dc8b985 (ratio fix), realistic look: PASS at full sharpness

Android 10, Chrome 157, DPR 2.625, canvas 823x1521 (render ratio 2) in every park, no ratio change.

| Park | S1 p95 (≤33) | S2 decode peak (≤128) | slowest turn | sharp after (max) | longest gap | caps | densities |
|---|---|---|---|---|---|---|---|
| build1 | 23.8 | 125.9 | 68.5 | 116.7 | 66.3 | 0 | d4/d2/d2/d4/d4 |
| build2 | 23.1 | 105.7 | 49.4 | 52.7 | 38.0 | 0 | d4/d2/d2/d4/d4 |
| phone | 21.9 | 121.7 | 49.2 | 130.8 | 44.8 | 1 (turns, 126.2 MB) | d4/d2/d2/d4/d2 |
| coaster | 21.6 | 108.4 | 117.8 | 117.8 | 66.0 | capped at start | d4/d2/d2/d4/d4 |
| scale (info) | 22.6 | 126.0 | 158.2 | 158.2 | 67.0 | 1 (zoom, 209.9 MB) | d2 all |

S4 1.78 s. Today's terrain 0 MB; static layer 4.8 MB inside the budget. Tints peak 20.1 MB (coaster). 0 degraded, no
timeouts. Fallbacks: staff only. Hidden gaps 1–3 in some parks (tab or app switch; excluded by the bench).

Versus stage 1 run 2 (round 3 build, same phone, ratio 2): S2 now counts all decoded memory (then 108–128 managed +
26–49 outside = 145–160 all-picture); now 106–126 in total. Frame p95 21.6–23.8 vs 21.1–22.6. Turns all ≤ 118 ms.

Open: phone park capped once in turns at 126.2 MB; coaster "capped at start" (cap carried in at scene start); coaster pan
phase only 15 frames (p95 54.1) — short phase, not investigated; older Android and iPhone not run (F10).
