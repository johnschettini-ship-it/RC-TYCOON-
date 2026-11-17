# New rides (14): design

- **Status:** approved by the owner on 2026-11-17 ("great build").
- **Owner requests:**
  - "increase coaster ride types, family rides, and flat rides";
  - "but we also need more rides overall".
- **Related:**
  - the catalogue (`src/data/catalog/`);
  - research (`src/data/research.ts`);
  - phase 8c realistic art (`docs/superpowers/specs/thrills-and-chills/phase-8c-realistic-art.md`, §5.3 flat rides and §8 originality);
  - batch 1 plan (`docs/superpowers/plans/2026-11-15-phase-8c-batch-1-flat-rides.md`), the pattern for ride modules;
  - ride colours (`docs/superpowers/specs/2026-11-16-flat-ride-colours-design.md`);
  - the bigger start roster (branch `start-roster`).

## Intent

The game has 30 rides. The owner wants many more, across coasters, family rides and flat rides. This adds 14 original ride types, so the game has 44.

## The rides

| # | Working name | id | Kind | Group | Unlock |
|---|---|---|---|---|---|
| 1 | Dodgem Boats | `dodgem_boats` | Flat | family | start |
| 2 | Mini Pirate Ship | `mini_pirate_ship` | Flat | family | start |
| 3 | Balloon Wheel | `balloon_wheel` | Flat | family | start |
| 4 | Frog Hopper | `frog_hopper` | Flat | family | start |
| 5 | Chair Swing Twist | `chair_swing_twist` | Flat | thrill | research |
| 6 | Spinning Wheel Drop | `spin_wheel_drop` | Flat | thrill | research |
| 7 | Loop Swing | `loop_swing` | Flat | thrill | research (late) |
| 8 | Carousel Deluxe | `carousel_deluxe` | Flat | chill | research |
| 9 | Train Station Show | `station_show` | Flat (walk-through) | chill | research |
| 10 | Launch Coaster | `launch_coaster` | Track | thrill | research |
| 11 | Mine Train | `mine_train` | Track | family | start |
| 12 | Water Coaster | `water_coaster` | Track | thrill | research |
| 13 | Flying Coaster | `flying_coaster` | Track | thrill | research (late) |
| 14 | Sky Ride | `sky_ride` | Track (cable) | chill | research |

The names are working names. They stay original, and no real ride brand or trademark is used (for example, no "Wave Swinger", "Tilt-A-Whirl" or "Top Spin"). Every model is designed from scratch, as phase 8c §8 requires.

## Decisions

- **Game rules:** each new ride is a catalogue row like the existing rides, with footprint, excitement, intensity, nausea, capacity, cycle, build cost and default price. Values sit between the nearest existing rides of its group; the builder states the values and their reason.
  - Track rides reuse the track system, with new type rows and their own cars.
  - The Sky Ride is a powered track type on tall towers, with gondola cars and no queue-line track.
- **Today's look:** each ride gets drawing code like the existing rides, with the ride colour main part on flat rides.
- **Realistic look:** each ride gets a bake module like batch 1, with masks for the ride colours on flat rides. The same size rules apply: ≤ 2.5 MB compressed, and ≤ 32 MiB decoded per turn at density 4.
- **Cards and strings:** each ride gets a name and description string, a card picture in both looks and the ride colour swatches for flat rides.
- **Start and research:** rides marked start are unlocked at the start. Research rides are added to the research order, interleaved with the existing items by cost.
- **Benches and checks:** the rides bench park gains the new flat rides. The content and economy audits run after each batch.

## Batches

- **A, family flat rides (1–4):** catalogue rows, start roster, today's look, realistic bake, cards and strings.
- **B, flat and thrill rides (5–9):** as A; these go into research.
- **C, track rides (10–14):** new track types and cars, today's look, realistic track and car bake. Batch 5 of the art plan (realistic track for the existing coasters) should land first or together, so this batch builds on its track kit.

Each batch ends with a review, the gates, screenshots, a deploy and the owner's review page.

## Constraints

- **Saves:** old saves still load. New ride ids are only additive.
- **Website build:** it gains the new rides too, because this is a content change, not a realistic-only change.
- **Memory:** the 128 MB decode budget and the rides bench rules still hold. The rides bench park grows; the bench must still pass, or the batch reports what does not and proposes a fix.
- **Commits:** the usual trailer lines.
