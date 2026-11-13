# Owner phone result 3 (2026-11-13): objects per turn, next turn loaded ahead

Same phone (Android 10, Chrome 157, DPR 2.625).

| Check | Value | Band |
| --- | --- | --- |
| Frame p95 at 300 guests, zoom 1x | 16.8 ms, 0 dropped frames in every bucket | PASS |
| Peak images in memory | 92.6 MB (56.9 MB at the end) | PASS |
| Slowest turn | 6671 ms (turns 35, 6671) | FAIL |

- Turn 1 was instant (35 ms): the prefetched turn worked.
- Turn 2 waited for turn 3's files to DOWNLOAD: set load times r2 7641 ms, r3 4186 ms, against 115-142 ms for sets already downloaded. Decoding is not the cost; the phone's network during play is.
- Only 2 of 4 turns were recorded because the benchmark segment ended while turn 2 waited.

## Change after this result
- The test downloads every compressed file of the sprite zoom at start (about 5.5 MB held in memory) and only DECODES on demand. A turn then never waits on the network. In the shipped app (Capacitor) the files are on the device anyway.
- Headless (CPU, same screen size): peak 92.6 MB, turns 59/34/33/36 ms with prefetch; without prefetch 0.2-1.7 s.
