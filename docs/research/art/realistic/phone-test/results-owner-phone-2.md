# Owner phone result 2 (2026-11-13): on demand, no prefetch

Same phone as result 1 (Android 10, Chrome 157, DPR 2.625). Mode: only the current zoom and turn loaded.

| Check | Value | Band |
| --- | --- | --- |
| Frame p95 at 300 guests, zoom 1x | 16.8 ms | PASS |
| Peak images in memory | 122.7 MB (steady 104.7 MB) | WARN |
| Slowest turn (includes loading the next turn) | 334 ms (turns 334, 282, 281, 82) | FAIL |

- No dropped frames in any bucket, also while turns were loading: decoding does not stall drawing.
- Load 0.6 s, 5.2 MB download. A turn back to an already-downloaded turn took 82 ms.
- Why the shared set was 86.7 MB: the bake packed the static objects of all four turns into shared pages, so every turn's objects stayed in memory.

## Change after this result (commit after c0be5dd)
- Bake packs objects per turn (`z{z}-objects-r{q}-{i}`): shared now holds only the carousel frames and guests (22.3 MB at 2x); each turn is about 34-36 MB (ground plus its objects).
- The next turn in the Turn button's direction loads in the background (`?prefetch=0` turns this off).
- Headless (CPU, same screen size): peak 92.6 MB (PASS), turns 26-36 ms with prefetch; without prefetch 0.2-1.8 s. Needs a phone run to confirm.
