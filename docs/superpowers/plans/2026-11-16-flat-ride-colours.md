# Flat ride colour choice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players choose Original or one of 6 colours for each flat ride; both looks show it; the realistic look colours a ride's pictures once when they load, at the same memory as Original.

**Architecture:** A palette index on the ride (sim + save + command) drives today's look (drawing code takes a main colour, cached per colour) and the realistic look (each ride sheet gets a baked mask and a recorded base colour; the set manager loads a coloured set by tinting the whole sheet once, band by band, keeping only the tinted copy).

**Tech Stack:** TypeScript strict, Canvas 2D, Vitest, three.js bake (tools/art3d), Playwright headless bench.

**Spec:** `docs/superpowers/specs/2026-11-16-flat-ride-colours-design.md` (approved 2026-11-16). Background: `phase-8c-realistic-art.md` §5.7.

## Global Constraints

- Colours: Original (`null`) + 6 palette indices `[0, 1, 2, 3, 4, 7]` of `TRACK_PALETTE` (cherry, sunset, lemon, leaf, sky, grape).
- One colour per ride; all 18 flat rides support it.
- Original draws exactly as today in both looks: `tests/unit/render/real/classicOps.test.ts` golden unchanged; website build JS/CSS/HTML byte-identical **only for realistic code** — today's-look ride drawing changes are allowed, but an Original ride must produce identical canvas ops.
- Old saves load with every ride Original; no failed load.
- Realistic look: 128 MB decode budget (2 MB reserve) counts base + mask + tinted copy during a tint; tints run one at a time within `TINT_FRAME_MS` per frame; a ride draws its Original pictures until its coloured copy is ready (counted incomplete); a failed tint keeps Original and lists the set in `fallbacksUsed`.
- Colour transfer keeps shading: per pixel with mask weight `m` (0–1), `c = target × (lum(pixel) / lum(base))` clamped to 0–255 per channel, `out = pixel × (1 − m) + c × m`; `base` is the ride's recorded base colour.
- Size rules with masks: compressed ≤ 2.5 MB per ride (≤ 4 MB for bumper_cars, pendulum_ship, magic_carpet, thunder_disc); decoded per turn at density 4 ≤ 32 MB.
- `src/render/anim.ts` unchanged; storage keys unchanged (`tcreal:` prefix in the realistic build).
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01Q5pHggx1eLkEH7W16KJFwP`.

## Review Focus

1. **Colour change while the ride is on screen.** Expected: Original (or the old colour) stays drawn until the new copy is ready, then swaps; no blank frame, no long frame. Test in Task 5.
2. **Same ride type twice in two colours.** Expected: two coloured sets, both inside the budget; the ladder still works. Test in Task 5 (unit) and Task 6 (bench).
3. **Save from before this change.** Expected: loads, every ride Original, re-saves without a `colour` field or with `null`. Test in Task 1.
4. **A dark base part tinted to a light colour.** Expected: reads as the light colour (shading kept), not dim. Test in Task 5 (pixel test) and on the review page (Task 4).
5. **Colour command on a track ride or with an index outside the 6.** Expected: rejected with a clear error, state unchanged. Test in Task 1.

---

### Task 1: Ride colour in the sim, command and save

**Files:**
- Modify: `src/sim/rides/types.ts` (`Ride.colour?: number | null`), `src/sim/commands/types.ts` (new command), the flat ride command module (next to `setTrackColours` in `src/sim/rides/track/commands.ts` style — put it in `src/sim/rides/flat/` commands), `src/data/catalog/flatRides.ts` (`RIDE_COLOUR_CHOICES`), `src/save/schema.ts` (`colour: optional(nullable(int))`), sim strings for the error.
- Test: `tests/unit/sim/rides/flatColour.test.ts`, `tests/unit/save/roundtrip.test.ts`

**Interfaces:**
- Produces: `export const RIDE_COLOUR_CHOICES: readonly number[] = [0, 1, 2, 3, 4, 7]` in `src/data/catalog/flatRides.ts`; command `{ type: 'setRideColour'; rideId: EntityId; colour: number | null }`; `Ride.colour` (absent or `null` = Original).
- [ ] **Step 1: Failing tests:** `it('sets and clears a flat ride colour')` (`colour: 4` then `null`); `it('rejects a colour outside the choices')` (`colour: 5` → `ok: false`, unchanged); `it('rejects a track ride')`; roundtrip `it('a ride colour survives save and load')`; `it('a save without ride colours loads as Original')` (fixture without the field → `colour` undefined/null).
- [ ] **Step 2–4:** fail, implement, pass. Check the command is undo-safe the way `setTrackColours` is (follow its pattern).
- [ ] **Step 5:** Commit `feat(sim): flat ride colour choice`.

### Task 2: Colour swatches in the flat ride panel

**Files:**
- Modify: `src/ui/panels/ride.ts` (flat rides only), strings in `src/data/strings` (en, and every locale file the project has — follow `ui.track.colour.*`).
- Test: `tests/unit/ui/rideColour.test.ts` (or the existing ride panel test file).

**Interfaces:**
- Consumes: Task 1 command and `RIDE_COLOUR_CHOICES`; swatch styling from `src/ui/track/ridePanel.ts` (`swatches`, `ui.track.colour.${i}` names).
- [ ] **Step 1: Failing tests:** the panel of a flat ride shows 7 swatches, Original first, the current one marked selected (`aria-pressed="true"`); a tap dispatches `setRideColour` with the index (Original → `null`); accessible names "Ride colour: <colour>" and "Ride colour: Original"; a track ride's panel does not show this row.
- [ ] **Step 2–4:** fail, implement, pass. Run `node tools/fit_probe.mjs` if the project has it for panel text, else the e2e layout check the track panel uses.
- [ ] **Step 5:** Commit `feat(ui): ride colour swatches`.

### Task 3: Today's look draws the colour

**Files:**
- Modify: `src/render/sprites/rides.ts` (`RideArtState.colour?: string | null`), the 18 rides' drawing functions (`rides.ts`, `content/gentleRides.ts`, `content/thrillRides.ts`, `content/phase6Rides.ts`), `src/render/sprites/bank.ts` (`ride(defId, w, d, rotation, frame, bucket, colour?)` with colour in the cache key), `src/render/renderer.ts` (pass `paletteColour(r.colour)` when set).
- Test: `tests/unit/render/rideColour.test.ts`; `tests/unit/render/real/classicOps.test.ts` (unchanged golden) plus a new golden case.

**Interfaces:**
- Produces: `bank.ride(defId, w, d, rotation, frame, bucket, colour?: string | null): Sprite`.
- [ ] **Step 1: Failing tests:** for each of the 18 rides, a coloured draw differs from Original in the main part's fill (record ops, assert the colour appears) and an Original draw's ops equal today's; the bank returns different sprites for two colours and the same sprite for the same colour; the classicOps golden still passes; a new golden for one coloured carousel.
- [ ] **Step 2–4:** fail, implement, pass. The main part per ride is the part named in Task 4's table (keep both looks consistent).
- [ ] **Step 5:** Commit `feat(render): today's look draws ride colours`.

### Task 4: Bake masks and base colours for the 18 rides

**Files:**
- Modify: each ride module in `tools/art3d/items/` (`masked` predicate on the colour part, `baseColour` hex), `tools/art3d/items/common.js` (`bakeObject` records `baseColour` on the set), `src/render/real/indexFormat.ts` (`RealSetEntry.baseColour?: string`, `RealSetEntry.mask` presence per sheet as today), `tools/art3d/checkIndex.ts` (every ride set has masks and a `baseColour`), `tools/art3d/reviewShots.mjs` + `reviewPage.ts` (each ride also shot in the 6 colours via `setRideColour`, one row per ride).
- Test: `tests/unit/art3d/flatRides.test.ts`, `tests/unit/art3d/sizeReport.test.ts`, `tests/unit/render/real/indexFormat.test.ts`.

**Interfaces:**
- Produces: index `baseColour` per ride set; mask sheets beside every ride sheet; `colourPart` list per ride (one line each in the module header).
- Colour part per ride (controller's call, owner judges on the review page): carousel canopy; swing_tower top canopy; big_wheel gondolas; teacup_twirl cups; rocket_rounds rocket bodies; kiddie_cars car bodies; merry_mill gondolas; observation_tower cabin roof; drop_tower carriage; gyro_globe outer ring; spiral_slide chute; pendulum_ship hull; magic_carpet carpet deck; flip_arm gondola; bumper_cars car bodies; mirror_maze roof; haunted_manor shutters and door; thunder_disc disc.
- [ ] **Step 1: Failing tests:** every flat ride set in a baked index has a mask per sheet and a `baseColour`; `checkIndex` rejects a ride set without them; size rules per ride hold.
- [ ] **Step 2–4:** fail, implement, re-bake all 18 + cards, pass. Look at three rides' masks (mask covers only the named part).
- [ ] **Step 5:** Commit per group of rides; `feat(art3d): ride colour masks`.

### Task 5: Realistic look loads coloured sets

**Files:**
- Modify: `src/render/real/indexFormat.ts` (`setKey(kind, item, density, rot, colour?: number)` → appends `:c<colour>` when set), `src/render/real/tint.ts` (`tintSheetShaded(base, mask, baseRgb, targetRgb, make, bandPx): TintJob` — band by band, the global formula), `src/render/real/setManager.ts` (a coloured key resolves to its Original entry's files; load = decode base + mask, admit base + mask + tinted transient, run one tint job at a time within `TINT_FRAME_MS`, keep only the tinted sheet, close base and mask; on failure keep the base as the set and add the key to fallbacks), `src/render/real/look/rides.ts` (`ride(defId, rot, frame, occ, colour?)`), `src/render/renderer.ts` (pass `r.colour`), d2 twin lookup keeps the colour.
- Test: `tests/unit/render/real/tint.test.ts`, `setManager.test.ts`, `look.test.ts`.

**Interfaces:**
- Consumes: Task 4 `baseColour` and masks; Task 1 `Ride.colour`.
- Produces: `setKey(..., colour?)`; `look.ride(defId, rot, frame, occ, colour?: number | null)`.
- [ ] **Step 1: Failing tests:**
  - `tintSheetShaded` on a dark red base pixel (#8a1c1c, mask 255) to lemon (#f2c230) gives a pixel whose hue is lemon and whose lightness ratio to lemon equals the base's ratio to its base colour (±2); mask 0 pixels unchanged.
  - A coloured set draws the Original sprite while tinting (incomplete counted), then the tinted sprite; resident bytes after = Original set bytes (base and mask closed).
  - Peak during the tint is admitted (base + mask + tinted) and never passes the budget; two coloured sets tint one after the other.
  - A failed tint (canvas without 2D context) leaves the Original sprite drawn and the key in `fallbacksUsed`.
  - The same ride in two colours yields two sets.
  - The d2 twin of a coloured d4 set is the coloured d2 set.
- [ ] **Step 2–4:** fail, implement, pass. Website build byte-identical in JS/CSS/HTML (realistic code folded).
- [ ] **Step 5:** Commit `feat(real): coloured ride sets`.

### Task 6: Bench, review page and gate

**Files:**
- Modify: `tests/perf/scenes.ts` (`rides` scene: 6 rides coloured, one ride type placed twice in two colours; regenerate the save through `TC_WRITE_SCENES=rides`), `tests/unit/perf/scenes.test.ts`.
- [ ] **Step 1: Failing test:** the `rides` scene has 6 coloured rides and one ride type twice in two different colours; visibility test still holds.
- [ ] **Step 2–4:** fail, implement, pass.
- [ ] **Step 5:** Headless bench twice (all scenes): S2 ≤ 128 (peak), turns ≤ 250/500, degraded 0, no timeouts, fallbacks staff only. Record.
- [ ] **Step 6:** Commit `feat(bench): coloured rides in the rides park`.
- [ ] **Step 7 (controller + owner):** merge, deploy, review page (each ride in Original + 6 colours) and phone bench; evidence file.
