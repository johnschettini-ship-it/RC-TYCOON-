# Owner phone result 4 (2026-11-13): PASS

Same phone (Android 10, Chrome 157, DPR 2.625). Mode: compressed files downloaded at start (5.2 MB held), only the current zoom and turn decoded, next turn (Turn button direction) decoded ahead.

| Check | Value | Band |
| --- | --- | --- |
| Frame p95 at 300 guests, zoom 1x | 16.8 ms; 0 dropped frames in every bucket (100-1000 guests, both zooms, while turning); draw time p95 0.7-3.4 ms | PASS |
| Peak images in memory | 92.6 MB (estimate) | PASS |
| Slowest turn | 35 ms (turns 35, 34, 34, 34) | PASS |

Load 1.4 s, 5.4 MB download. Decoding one turn's set takes 89-147 ms on this phone.

## What this does NOT prove
- One mid-range Android phone only. No low-end Android, no iPhone/Safari.
- The test park is small: one coaster, one carousel, 44 objects per turn. A full park has more rides, so memory grows with content unless the game also loads by screen area.
- Memory is an estimate (width x height x 4); the browser may hold GPU copies as well.
- Only turns in the Turn button's direction were measured. A turn the other way decodes on the spot: about 0.1-0.15 s on this phone.
- No ride animation beyond the carousel (no coaster trains), no building, no UI on top.
