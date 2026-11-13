# Owner phone result 1 (2026-11-13)

Device: Android 10, Chrome 157, DPR 2.625, viewport 411x760 CSS, canvas 1079x1995 (model not reported).

| Check | Value | Band |
| --- | --- | --- |
| Frame p95 at 300 guests, zoom 1x | 16.8 ms | PASS |
| Images decoded (everything loaded) | 212.7 MB | FAIL |
| Slowest turn | 17 ms | PASS |

- Every bucket (100 to 1000 guests, zoom 1x and 2x, while turning): p50 16.7, p95 16.8, p99 16.8 ms, 0 dropped frames. The frame time is the 60 Hz screen limit; the page's own draw time p95 is 0.9 to 3.2 ms (3.2 ms at 1000 guests).
- Turns: 17, 14, 15, 15 ms. Load 1.8 s, 7 MB download, JS heap 9.5 MB.
- Memory by set: zoom 1x 54 MB (unused on this phone: Sharp draws zoom 1x from the 2x sprites), zoom 2x 158.7 MB = 18 MB per rotation x 4 + 86.7 MB shared (carousel frames and guests).

## Reading
- Speed is not a problem on this phone: large headroom at 1000 guests.
- Memory is the only failure, and it is a loading choice in the test: everything is loaded at once. Only the 2x set: 158.7 MB (WARN). Only the 2x set for the current rotation: about 105 MB (PASS), at the cost of loading a rotation when the player turns (not measured).
- Canvas 2D holds every image decoded (4 bytes per pixel). Compressed GPU textures (ASTC/ETC2) need a WebGL renderer. A full park has far more content than this test scene, so a shipped realistic look needs on-demand loading of what is on screen, or a WebGL renderer with compressed textures, or both.
- One phone only; no low-end device, no iPhone/Safari.
