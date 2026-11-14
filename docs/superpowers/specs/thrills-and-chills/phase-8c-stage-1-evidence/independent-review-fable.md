# Independent review of stage 1 (Fable model, 2026-11-14, read-only)

Verdict: proceed with the realistic look, but do not start the full bake until steps 1–3 below are done and re-measured. Treat density 2 as the phone baseline and density 4 as a zoomed-in bonus.

## What breaks first at full scale
- Loading is not view-scoped (look.ts:323-325 wants every built kind plus the ahead turn; spec §5.4.2(d) says view + one screen). Baked rides cost 8–10 MB (d2) / 29–38 MB (d4) each; 18 ride types ≈ 160 MB at d2 — over budget before guests or ground.
- The ladder ends at "density 2 everywhere" (setManager.ts:329-335); past that, sets never decode and null sprites are skipped — objects vanish (spec §5.4.4: never drop an object).
- Guest tints copy whole sheets per (outfit, colour) (look.ts:202-239): 8×12 now, 32×12 with F6.

## What the phone numbers say
- S1: 32.6 / 32.8 / 35.8 ms are all "p95 = two vsyncs"; the 33 ms limit sits on that boundary.
- build2 never used density 4.
- S2 reads the manager's own ledger and admit() refuses over budget, so it can hardly fail; not counted: today's terrain still drawn underneath (renderer.ts:1089-1090, 1100-1101), classic sprite cache, compressed blobs (never evicted), tint transients, GPU copies.
- S3: ahead sets are dropped first under pressure, so the 250 ms rule is unreachable when memory is tight.
- The 1,060 ms gap has no kill rule; likely cause (inference): synchronous tinting with no per-frame budget.
- Missing: today's look on the same phone, older Android, iPhone, the real app wrapper.

## Top risks
1. Not view-scoped + no last ladder step → invisible objects in a late-game park.
2. Ground chunks at zoom 2 ≈ 60 MB of 128 (ground.ts:298) → forces the cap, loses the ahead set, root of the S3 fail.
3. Per-frame main-thread cost hidden by small parks: unbudgeted tinting; prepare walks every scenery object building strings (look.ts:279-351); per-guest string building and findIndex (look.ts:246-265).

## Next, in order
1. build2 in today's look on the same phone.
2. Shrink ground at high zoom (small chunks or direct tile draws into the static layer); re-run coaster.
3. Scope prepare to the view, cache by world version, add a final ladder step (today's art or shadow, never nothing).
4. Budget tinting per frame, or tint per frame rectangle.
5. Bench: S1 per phase with share of frames > 33 ms, a longest-gap rule, real process memory.
6. Synthetic "18 ride types, 5,000 scenery" park before the full bake; then older Android and iPhone.
