# Phase 8c batch 0: deferred items (from the SDD ledger, 2026-11-15)

Batch 0 closed: owner phone run 2 PASS at full sharpness (batch0-owner-phone-2.md). Older Android and iPhone not run (owner: start batch 1 now).

## Deferred minors and parked findings
- Task 2: minor (deferred): tests do not assert defaultRenderRatio dataset read directly (covered partly by round 1 n/a test).
- Task 2: minor (deferred): card ratio row .replace strips only the first "render ratio " with several changes.
- Task 2: minor (deferred): ratioAtEnd carries a stale value when a scene had no readings (text still n/a).
- Task 2: minor (deferred): card test stubs document without try/finally.
- Task 1: minor (deferred): core.ts 480 lines (T4 extraction should shrink it); index.ts header prose drift; SUPPORT_PARTS (scope.ts) vs SUPPORT_CODE (track.ts) two lists.
- Task 6: minor (deferred): bench/bin hard-coded w:2,d:1,heightM:1; loading="lazy" on review images.
- Task 5: minor (deferred): bytes-per-piece divisor uses union of pieces across baked track items (exact with one type; fix before batch 5).
- Task 5: minor (deferred): water track types projected at steel rail cost; mask decoded size counted RGBA; pieceCount re-implements sim filter.
- Task 6: minor (deferred): removePathItem undo pushed before buildPathItem succeeds (aborts with undo error instead of noting); no try/finally around browser/server close and bundling.
- Task 4: minor (deferred): page upBytes not scaled at d2 (bounded by 12 MiB cap); ~50–150 of 1,000 guests stay untinted when the atlas is full (phone check in T7); spec §5.7 wording "per sheet" to update in the report/spec at batch 0 close.
- Task 4: minor (deferred): reuse test lacks a positive assert on new-frame pixels; a context-less canvas retries each frame and repeats onError('tint:canvas'); fallback loop counts one refusal per evicted frame; setManager hold doc comment does not mention tint:scratch.
- Task 3: minor (deferred): flat placeholders without cliff faces (slivers at height steps); classic hold lags one frame; uncovered today's terrain shares 16 MB with sprites.
- Task 3: minor (deferred): zoom back-and-forth discards the matching-scale stand-in (pre-existing); classic hold recorded after the frame; scale park other-way turns 547–587 ms (info only).
- Task 3: minor (deferred): isTwin room not cumulative across twins; setManager:465 and realBench capLog comments; reclaim frees on-screen stand-ins before off-screen chunks (controller's round-2 order — final review to judge, off-screen first is likely better); build1/phone S2 125–128 MB, little margin.
- Task 4b: minor (deferred): 24-page cap partly tuned to one bench (state derivation / margin assert); no test of recovery after degrade in new tests; a frame drawn on alternate prepares resets its wait (could count incomplete indefinitely).
- Final: parked — reserve 2 MiB does not cover a static-layer remake (~5 MiB) — Ruling: real, deferred; size the reserve from the static layer before batch 1 — cost: one-frame S2 overshoot to ~131 on resize right after a full pump.
- Final: parked — I2 residual: frames redrawn at gaps > 8 prepares never degrade — Ruling: unlikely, deferred (restart only after DEGRADE_FRAMES gap) — cost: rare incomplete wait.
- Final: parked — scratch failures can trip the atlas stop in one step; stop never recovers — Ruling: deferred (one failure per step; retry every N s) — cost: tinting lost for the session after a transient canvas failure on a phone.
- Ratio fix: minor (deferred): `?art=classic` in the real build leaves awaitingComplete true (harmless, comment); one frame at auto after a mid-run settings change.

## Rulings
- Ruling: T2 reads the existing canvas.dataset.pixelRatio each frame; no renderer change — avoids a T2/T3 conflict — cost: none.
- Ruling: T3 step 5 uses whichever headless phone path exists (realShots.mjs or the headless bench), at a DPR where the phone cap gives ratio 2 — the plan's script detail was approximate — cost: none.
- Ruling: T6 builds tools on phase8c-full; the controller edits deploy.yml on the work branch in T7 — deploy.yml is on another branch — cost: none.
- Ruling: waves W1 {T1,T2,T5,T6} parallel worktrees fb-tN off phase8c-full; W2 {T3,T4} after T1 merges; W3 T7 controller+owner — owner approved parallel agents — cost: merge conflicts, resolved by controller.
- Ruling: T1 core.ts 480 lines accepted for now — shared machinery; Task 4 removes whole-sheet tint from it — cost: one large file until T4. T1 extra files types.ts/scope.ts accepted.
- Ruling: no fix round; it matches the plan's text for core ("shared want/use/soft-draw/tint-budget machinery"). T4 dispatch is told its real edit surface is core.ts tintedSheet/sprite tint branch and to extract the tint path into look/tint.ts; T3 dispatch is told not to edit core's sprite tint branch (its ground work is in src/render/real/ground.ts, terrain.ts, renderer.ts) — cost if wrong: merge conflict in core.ts, resolved by controller.
- Ruling: T3/T4 do not depend on T5/T6; start now to save time — cost: none): T3 a416c11dbabe77a24 (fb-t3, opus), T4 a1d78f9b66697b6f3 (fb-t4, opus)
- Ruling: T6 item count 14 is right — the plan's '18 stage 1 items' counted ground, guests, steel_coaster and facade, which are not one-item placements; coaster review shots need a track layout and belong to the batch 5 plan — cost: none.
- Ruling: T5 does not fail CI for unbaked kinds; explicit ASSUMED_MEAN_BYTES per kind, marked 'assumed' in output/JSON — batches add kinds over weeks; failing would block every deploy — cost: assumed means may be off until a kind is baked.
- Ruling: T4 plan defect — 12 pages of 1024x1024 is 48 MiB, not '12 MB at most'; keep the 12 MiB cap (the stated intent and the test) with 1024x256 pages (1 MiB each), taller frames get a page as tall as themselves — cost: more pages for tall rails, counted in the cap. T4 implementer 905c631 done; coaster tint peak 11.82 MiB vs 29.31 MiB at base (headless).
- Ruling: T4 evict-before-grow threshold TINT_STALE_FRAMES = 30 (not KEEP_RECENT 1) — evicting 2-frame-old walk frames would flicker guests untinted; fall back to KEEP_RECENT only when no page can be had — cost: atlas may grow a page sooner under pressure, bounded by 12 MiB cap.
- Ruling: S2 is the DECODE budget (spec F2, §5.4 item 4: decoded sheets, tints, chunks, static layer, plus today's decoded terrain/sprites); kept compressed files are not decoded pictures — the bench reports them on their own line, outside S2 — T2's S2 definition included blobs by over-reading "all picture memory" — cost if wrong: up to ~9 MB (stage 1) / ~60 MB (full) of JS-held compressed art unbudgeted on phones; risk logged for batch 8 (app reads files on demand).
- Ruling: free the old turn's sets first on a turn (spec §5.4 item 3), before any demotion or cap; keep the budget and the static layer inside it — cost: one more round; if wrong, turns stay slow and phone S3 fails.
- Ruling: round 2 and round 3 fix diffs get one combined scoped re-review (a67f285..round-3 head) — round 2's measurement exposed the turn cap that round 3 fixes; reviewing them apart would review a known-incomplete state — cost: larger re-review diff.
- Ruling: raise atlas page cap (below the 29 MB whole-sheet figure), pages stay in the 128 MB budget; a frame without room counts degraded after DEGRADE_FRAMES, not incomplete — the 12 MiB plan number was sized for guests — cost: more tint memory inside the budget.
- Ruling: reviewer's I3 accepted, controller's round-2 order reversed — off-screen chunks first, then stand-ins — off-screen costs only a later rebuild, on-screen costs a visible flash — cost: none known.
- Ruling: real, deferred; size the reserve from the static layer before batch 1 — cost: one-frame S2 overshoot to ~131 on resize right after a full pump.
- Ruling: unlikely, deferred (restart only after DEGRADE_FRAMES gap) — cost: rare incomplete wait.
- Ruling: deferred (one failure per step; retry every N s) — cost: tinting lost for the session after a transient canvas failure on a phone.
- Ruling: keep this workspace until Task 7 (owner phone gate) closes — T7 is a plan task not yet done — cost: none.
