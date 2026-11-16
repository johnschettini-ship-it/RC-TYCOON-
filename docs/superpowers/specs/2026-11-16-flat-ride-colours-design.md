# Flat ride colour choice — design

- **Status:** draft for owner approval (2026-11-16).
- **Owner request:** "Add ride color choice as an option"; then "perhaps a few choices instead" (after hearing the memory cost); "Go with option 1".
- **Related:** `phase-8c-realistic-art.md` §5.7 (colour changes, tint masks), F2 (128 MB decode budget), S5 (150 MB app art); batch 1 (all 18 flat rides baked, `phase8c-full`).

## Intent

Players can give each flat ride its own colour, as they already can for track rides (track, supports, cars). It lets a player make the park their own. The choice must work in today's look and in the realistic look, and must not break the phone limits.

## Goals

1. Each placed flat ride has a colour choice: **Original** (the ride's designed colours) or one of **6 colours**.
2. The choice is made in the ride's panel, with swatches like the track ride panel, and is saved with the park.
3. Today's look and the realistic look both show the chosen colour.
4. Realistic look: a ride in a chosen colour uses the same picture memory as in its original colours.

## Non-goals

- No per-part colours for flat rides (one colour per ride). Track rides keep their three parts.
- No colour choice for stalls, scenery, guests or staff in this change.
- No new colours: the 6 come from the existing 12-colour track palette.

## Anti-goals (a failure even if it works)

- The 18-ride bench park passes the 128 MB limit, or turns pass 250/500 ms.
- A colour change freezes the game (a long single frame).
- Old saves fail to load or change colour.
- Today's look on the website changes for rides left on **Original**.

## Approaches considered (owner picked 1)

1. **Colour once when a ride's pictures load (picked).** Each ride's baked pictures get a mask of the colourable parts. When a set loads, the game paints the colour into it once and keeps only the coloured copy. Memory as today; app art +10–20 % for masks; two instances of one ride in different colours need two copies.
2. **Bake 3 fixed colour sets per ride.** No runtime work, but ride art about 35 → 105 MB, the whole game about 57 → 127 of 150 MB before later batches.
3. **Colour live per frame** (the guest-shirt tint atlas). Ride frames are large; the 18-ride park passes the memory limit.

## Decisions (controller's calls, owner may correct)

- **Colours:** Original + 6 from `TRACK_PALETTE` (`src/render/track/colours.ts`): 0 cherry, 1 sunset, 2 lemon, 3 leaf, 4 sky, 7 grape. Stored as a palette index; Original is `null`.
- **What changes colour:** the ride's main painted parts (canopy, body, cars or seats — per ride, the part a visitor would call "the ride's colour"); structure, metal, wood, lights, riders and signs keep theirs. Each ride module names its colour part.
- **Sim and save:** `Ride.colour?: number | null` on flat rides; a new command `setRideColour { rideId, colour: number | null }` validated against the 6 allowed indices; saves without the field load as Original (no save version change needed if the field is optional — confirm in the plan against `src/save`).
- **UI:** a row of 7 swatches (Original first) in the flat ride panel (`src/ui/panels/ride.ts`), same style and labels as the track ride panel's colour rows; screen-reader names "Ride colour: <colour>".
- **Today's look:** each flat ride's drawing code takes an optional main colour and uses it for its main parts; Original draws exactly as today (the classicOps golden stays unchanged for Original).
- **Realistic look:**
  - The bake writes a mask per ride sheet (one channel: how much of the colour each pixel takes), as the steel coaster supports already do (`bakeObject({ masked })`).
  - The set manager's set key gains the colour, so a coloured set is its own set. On load: decode base + mask, tint the whole sheet once, keep only the tinted sheet, close the base and mask. Tinting runs band by band within the per-frame tint time budget (`TINT_FRAME_MS`), so it never freezes a frame; the ride draws its Original picture (or its last picture) until the tinted set is ready, counted as incomplete.
  - Memory: a coloured set costs what an Original set costs; masks are decoded only during the tint. Both are inside the 128 MB budget.
- **Changing colour:** the old colour's set is released and the new one loads as above (a short soft swap, no freeze).
- **Bench:** the `rides` bench park gives 6 of its 18 rides a colour, and one ride type appears twice in two colours, so the cost is measured.

## Builder-check answers (controller's calls)

1. **While a coloured set is not ready, and on failure:** the base sheet is resident during its tint anyway, so the ride draws the base (Original colours) until the tinted copy is ready; it counts as incomplete like any loading set. If the tint fails (no canvas, error), the ride keeps drawing Original and the failure is logged in the fallback list, never today's look and never nothing.
2. **Peak memory during a tint:** base + mask + tinted copy are admitted to the 128 MB budget for the duration (transient, like `tint:scratch`); tints run one at a time; the bench measures the peak, not the settled value.
3. **All 18 flat rides get the swatch row.** Each names a part a visitor would call its colour; the owner judges each on the review page.
4. **The re-bake of all 18 rides with masks is in this plan** (tools/art3d, CI bake). Masks add about 10–20 %; the four rides allowed 4 MB stay at ≤ 4 MB, the rest at ≤ 2.5 MB — if a ride goes over, simplify it, as in batch 1.
5. **Colour transfer keeps shading:** Original is the untinted sheet. The bake records the colour part's designed base colour per ride; the tint maps it to the chosen colour preserving each pixel's shading relative to that base (`out = target × pixelLuminance / baseLuminance`, clamped), so a dark red canopy tinted lemon reads as lemon, not dim. The review page shows each ride in all 6 colours.
6. **Densities and turns:** the colour is part of the set key at every density and turn; the d2 twin of a coloured d4 set is the coloured d2 set.
7. **Today's look:** the colour is part of today's picture-cache key (up to 7 variants per ride type, held as today's memory, inside the budget in the realistic build). The classicOps golden stays as is for Original; new golden cases cover one coloured ride.
8. **Save:** the builder confirms whether an optional `colour` field round-trips in the current save format; if not, a version bump with a migration that sets Original.

## Constraints

- Website build byte-identical for the realistic code (behind `VITE_ART === 'real'`); today's-look changes are allowed but Original must draw exactly as today.
- Storage under the existing keys; realistic build under `tcreal:`.
- Size rules per ride (compressed ≤ 2.5 MB, or 4 MB for the four rides already allowed; decoded per turn at d4 ≤ 32 MB) still hold with masks.
- `src/render/anim.ts` unchanged.

## Left to the builder

- The exact colour part per ride (one line each in the ride module, reviewed on the review page).
- Mask format details (reuse the coaster support mask path).
- How the tint job is scheduled against decodes.
