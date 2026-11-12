# Tuning log

Every change to a value in `src/data/tuning/*.ts` is listed here with the old value, the new value, and the reason.
The phase spec that owns the number is updated in the same change. Newest entries first.

How to reproduce the numbers: the Phase 1 integration park (`tests/integration/scenario.ts`, `buildPhase1Park`) over
many seeds, one summary line per seed:

```
TC_BALANCE_SEEDS=12345,777,2024,1,42,9001,7,99,31337,500 npx vitest run tests/integration/balance-sweep.test.ts --silent=false
```

---

## 2026-11-12 — Height limits and the intensity step (ride work 1, Task 1; owner decision R2)

The height limits (climb above the station) are the owner's values of `ride-decisions-2026-11-12.md` R2: Steel 50 → 75,
Inverted 45 → 70, Wooden 40 → 60, Bobsled 25 → 35, Log Flume 20 → 30, Spinning Mouse 16 → 24, Junior 12 → 20,
Monorail 12 → 24, Rapids 10 → 15, Mini Railway 8 → 16, Ghost Train 6 → 10, Go-Kart 4 → 6 m (`maxHeightM`, catalog data,
`src/data/catalog/trackRides.ts`). The old limits stay as `intensityHeightM`. The step is new (plan ride-work-1
decision 1), in `src/data/tuning/track.ts`:

| Constant | Value | Meaning | Status |
|---|---|---|---|
| `HEIGHT_INTENSITY.perMHundredths` | 10 (+0.10) | Intensity added per whole metre the circuit climbs above the station beyond the old limit | provisional |
| `HEIGHT_INTENSITY.capHundredths` | 200 (+2.00) | Most intensity the step adds | provisional |

Why: at 0.10 per metre a Junior Coaster at its new 20 m limit gains 0.80 and leaves the calmest guests' range
(`maxIntensity = 2.0 + 0.08 × T`); the cap keeps height alone from dominating a coaster's rating.

## 2026-11-11 — Phase 7 interface constants (Build 4, logged at the Build 4 gate)

All values are **provisional** until a play-test. They live in `src/data/tuning/interface.ts` (8 constants) and in
spec `phase-7-frost-and-spark-interface.md` §8. `MASCOT_MIN_WIDTH_PX` (1100) of the first draft is not in the code:
the bottom mascots were not built (spec §4.8).

| Constant | Value | Meaning | Status |
|---|---|---|---|
| `LEAN_BALANCE_POINTS` | 10 | Lean below this is "in balance" | provisional |
| `MOOD_UPDATE_MS` | 500 | Mood bar update period (the value of Build 3) | provisional |
| `HAND_REFRESH_MS` | 500 | Unlock check period of the hand | provisional |
| `TIP_CHECK_MS` | 2000 | Tip rule check period | provisional |
| `TIP_MIN_GUESTS` | 20 | Rule 3 (`underServed`) needs this many guests | provisional |
| `TIP_GAP_POINTS` | 15 | Rule 3 gap, in percentage points | provisional |
| `CARD_DRAG_PX` | 8 | Pointer move that starts a card drag (the drag threshold of Phase 6 §4.7) | provisional |
| `CARD_LIFT_PX` | 12 | Rise of the held card (CSS px) | provisional |

---

## 2026-11-09 — Provisional starting values (Build 2 and Build 3 cards, logged at the Build 3 gate)

### Why
The specs give no number for these values, so the card that needed them chose a starting value and reported it.
None has been play-tested. Each row is logged with **Old = provisional** and **New = provisional**: the value has not
changed since it was first written; the row records that it is a guess to check, not a tuned number. When a play-test
changes one, add a new entry above this one with the real old and new values. Spec numbers (Phase 4 §8, Phase 6 §4.5
and §8, the catalog) are not repeated here, except the show lengths, which are flagged.

### Build 3 research costs (master R25, `src/data/research.ts`, W4-D)
Phase 6 §4.5 gives the research category of each Build 3 item but no cost (catalog §9). Total **4,200 points**, after
the Build 2 items; cheaper items first, categories alternating as in Builds 1 and 2.

| Item | Category | Cost (points) | Old | New | Reason |
|---|---|---|---|---|---|
| `kiddie_cars` | Gentle | 150 | provisional | provisional | Cheapest family ride, like the Build 1 Spiral Slide (150). |
| `smoothie_bar` | Shops | 180 | provisional | provisional | Like the Build 1 Cocoa Hut and Balloon Stand (180). |
| `magic_carpet` | Thrill | 400 | provisional | provisional | Mid thrill ride, between Thunder Disc (350) and Drop Tower (450). |
| `lightshow_tower` | Scenery | 300 | provisional | provisional | A show site costs more than a scenery theme (240): it brings guests at night. |
| `photo_booth` | Shops | 200 | provisional | provisional | Souvenir stall, like First Aid (200). |
| `merry_mill` | Gentle | 250 | provisional | provisional | Chill flat ride, like Bumper Cars and Mirror Maze (250). |
| `bobsled_run` | Coasters | 500 | provisional | provisional | Between Spinning Mouse (450) and Wooden Coaster (600). |
| `noodle_bar` | Shops | 220 | provisional | provisional | Food stall, like Pizza Slice (220). |
| `gyro_globe` | Thrill | 550 | provisional | provisional | Most intense flat ride, like Flip Arm (550). |
| `fireworks_launcher` | Scenery | 350 | provisional | provisional | The bigger show (radius 12, Thrill crowd): above the Lightshow Tower. |
| `monorail` | Gentle | 450 | provisional | provisional | Transport ride with up to 4 stations, like Haunted Manor (450). |
| `inverted_coaster` | Coasters | 650 | provisional | provisional | Last and dearest item, above the Wooden Coaster (600). |

Play-test: Build 3 research is about 4,200 / 6,460 of the Build 1 research time; check that a free park reaches the
Inverted Coaster in a reasonable number of game years at the medium research budget.

### After Dark shows (`src/data/tuning/shows.ts`, `src/data/catalog/showSites.ts`, W4-C)

| Constant | File | Value | Old | New | Reason |
|---|---|---|---|---|---|
| `SHOW_HAPPY_CAP` (how the cap and the match factor combine) | `tuning/shows.ts` | +40 per show as a **hard cap** for every watcher; the ×1.3 match factor scales the running total, so a matching watcher reaches +40 sooner, never more | provisional | provisional | Phase 6 §4.4 says "max +40 per show. Matching temperament gains ×1.3" without saying which applies first. The hard cap keeps the two show types even and a show from paying more than the spec's +40. The other reading (a matching watcher can reach 52) is the alternative to try. |
| `showTicks` Lightshow Tower | `catalog/showSites.ts` | 300 ticks | provisional | provisional | Spec value "300 ticks (15 s)". **Flag for play-test:** 300 ticks are **6 game hours** (50 ticks per hour), so a 20:00 show runs to 02:00 and a 23:30 show to 05:30, while watchers stand for 15 real seconds at 1×. The spec reads as real seconds; if the game clock should matter, a show of 1–2 game hours (50–100 ticks) is the alternative. |
| `showTicks` Fireworks Launcher | `catalog/showSites.ts` | 400 ticks | provisional | provisional | Spec value "400 ticks (20 s)": **8 game hours**; same flag as above. |

### Build 3 track types and pieces (`src/data/track/trackTypes.ts`, `src/data/tuning/track.ts`, W4-D)
Phase 6 §4.5 gives seats, cars, trains, max height, drive, piece set, and price; Phase 2 §4.10 and §4.12 define the
terms. The type rating terms, costs, friction, chain speed, and car length are not in the spec.

| Type | Ratings (E / I / N type, kAir, extra) | Costs (base, piece factor, run base/mo, extra train) | Physics (μ, c_d per m, chain, car length, default cars) | Old | New | Reason |
|---|---|---|---|---|---|---|
| Inverted Coaster | 1.3 / 0.5 / 0.2, 0.8, none | $3,500, ×1.10, $140, $900 | 0.015, 0.0008, 3 m/s, 2.5 m, 4 | provisional | provisional | The Steel Coaster's numbers (1.0 / 0.3 / 0.0, kAir 1.0, $3,000) raised: hanging seats feel more intense and exciting; airtime counts less. Dearest coaster, as in the research order. |
| Bobsled Run | 1.4 / 0.4 / 0.4, 0.6, none | $2,600, ×0.90, $100, $400 | 0.012, 0.0008, 2.5 m/s, 2.2 m, 2 | provisional | provisional | Free-running cars in a trough: lower friction than steel, little airtime, some nausea from the banked swings; cheaper than the Wooden Coaster ($2,800). |
| Monorail | 1.6 / 0.0 / 0.0, 1.0, scenic | $2,400, ×0.80, $80, $600 | 0, 0, —, 3 m, 3 | provisional | provisional | Powered transport like the Mini Railway (2.0 / 0 / 0, scenic, $1,200) but dearer to build (beam and pillars) and a little less exciting. |

| Constant | Value | Old | New | Reason |
|---|---|---|---|---|
| `CORKSCREW_RADIUS_M` / `CORKSCREW_RISE_M` / `CORKSCREW_KAPPA` | 1.4 m / 1.0 m / 0.15 per m | provisional | provisional | Fit the spec footprint (3 tiles straight, no height change) and keep a train entered at the 10 m/s minimum pressing the riders into their seats at the top. Arc length 15,919 mm. |
| `HELIX_RADIUS_M` / `HELIX_LEAD_M` / `HELIX_RISE_M` | 4.8 m / 6 m / 4 m | provisional | provisional | Fit the 3 × 3 footprint with a 360° turn; the rise is the spec's ±4 m. Arc length 42,386 mm. |
| `STOP_DWELL_TICKS` (Monorail extra stations) | 60 ticks (3 s at 1×, 1.2 game hours) | provisional | provisional | Master R26 makes extra stations stops only; the spec gives no dwell. 60 ticks equals the default minimum station dwell (`DEFAULT_MIN_DWELL_TICKS`). |

### Build 2 water rides (`src/data/track/trackTypes.ts`, `src/data/tuning/track.ts`, W3-C)
Phase 4 §4.4 and §8 give the piece set, current speeds and k, lift and station conveyors, splash brake, whirlpool cap,
rating extras, and wet riders. W3-C chose these:

| Item | Value | Old | New | Reason |
|---|---|---|---|---|
| Log Flume type terms | E 1.5, I 0.8, N 0.3, kAir 1.0 | provisional | provisional | A family ride with one big drop; the drop and splashdown extras add the rest. |
| Rapids Raft type terms | E 1.6, I 1.0, N 0.5, kAir 1.0 | provisional | provisional | Rougher than the flume (rough water, spinning rafts). |
| Log Flume costs | base $2,400, ×1.00, run $80/mo, extra boat $200 | provisional | provisional | Between the Junior Coaster ($1,500) and the Wooden Coaster ($2,800). |
| Rapids Raft costs | base $2,800, ×1.00, run $90/mo, extra boat $250 | provisional | provisional | The Wooden Coaster's base; a little above the flume to run. |
| Channel friction on gravity pieces (`WATER_MU`, `WATER_CD`) | 0.02, 0.001 per m | provisional | provisional | The Junior Coaster's friction. |
| Boat length | 4 m | provisional | provisional | The spec's "1 boat per station tile". |
| `ROUGH_AMPLITUDE` / `ROUGH_WAVELENGTH_MM` | 0.4 / 4,000 mm | provisional | provisional | Rough water varies the current by ±40% once per tile, by position (never the RNG). |

### Audio and music mix (`src/data/tuning/audio.ts`, `src/data/tuning/music.ts`, W4-A, W4-B)
Phase 6 §8 gives the volume defaults, voices, falloff, and music scheduling; the mix levels below are starting values.
All of them need the **listening check** (owner action, `docs/release/build-3-checklist.md`).

| Constant | Value | Old | New | Reason |
|---|---|---|---|---|
| `VOLUME_EXPONENT` | 2 (gain = (v / 100)²) | provisional | provisional | Closer to perceived loudness than a straight line. |
| `VOLUME_GLIDE_S` / `STEAL_FADE_S` / `LOOP_GLIDE_S` | 0.02 / 0.01 / 0.15 s | provisional | provisional | No clicks on slider moves, voice steals, or loop changes. |
| `SFX_PEAK` | 0.5 (`ui_click` 0.3 from the table) | provisional | provisional | A full mix stays under the master compressor. |
| `CHAIN_CLICKS_PER_M` / `CHAIN_CLICK_MS` / `MAX_CHAIN_LOOPS` | 4 per m / 5 ms / 2 | provisional | provisional | A lift at 3 m/s clicks 12 times a second; two lifts at most, so the chain does not drown the park. |
| `RUMBLE_MIN_SPEED_MS` / `RUMBLE_FULL_SPEED_MS` / cutoff | 2 / 25 m/s, 150–600 Hz | provisional | provisional | Silent at walking speed, full on a fast drop. |
| `RAIN_INTENSITY` | rain 0.6, storm 1 | provisional | provisional | Storm louder than rain. |
| `THUNDER_GAP_MIN_MS` / `THUNDER_GAP_MAX_MS` | 6–20 s | provisional | provisional | Thunder often enough to notice, not constant. |
| `CROWD_FULL_GUESTS` / amplitude modulation | 400 guests / 0.3–0.7 Hz | provisional | provisional | Crowd at full gain with 400 guests on screen (log curve). |
| `MUSIC_VOICE_GAIN` | lead 0.2, pad 0.06, bass 0.24, kick 0.5, snare 0.2, hat 0.07 | provisional | provisional | Lead and bass in front, pad and hat as colour. |
| `MUSIC_REVERB_WET` / `MUSIC_DELAY_WET` / `MUSIC_DELAY_FEEDBACK` | 0.35 / 0.3 / 0.35 | provisional | provisional | Night reverb and the Starport delay audible without washing out the lead. |
| `MUSIC_TREMOLO_HZ` / `MUSIC_TREMOLO_DEPTH` | 5 Hz / 0.45 | provisional | provisional | Spooky Hollow pad wobble. |
| `MUSIC_BASS_LOWPASS_HZ` | 900 Hz | provisional | provisional | Saw and square basses stay round. |
| `MUSIC_LEAP_CHANCE` / `MUSIC_REST_CHANCE` / `MUSIC_BASS_OCTAVE_CHANCE` | 0.06 / 0.5 / 0.3 | provisional | provisional | Melodies mostly step (spec: "steps of at most 2 scale degrees (mostly)") and breathe at the half phrase. |

---

## 2026-11-09 — Build 1 balance pass (W2-D)

### Problem
The Phase 1 §9 integration game (path loop, Carousel, Swing Tower, Snack Shack, Fizz Stand, Restrooms, 3 game months,
with every Phase 3 system running) missed both targets: > 300 arrivals and an average leaver happiness ≥ 150.

| 10 seeds, before | Arrivals | Turned away | Leaver happiness |
|---|---|---|---|
| Mean | 213 | 212 | 130.9 |
| Worst seed | 127 | 242 | 116.9 |

Measured causes (happiness change per guest, averaged over every guest who came in, seeds 12345 / 777 / 2024):

| Source | Per guest | Notes |
|---|---|---|
| Needs at uncomfortable or urgent | −32 | Urgent thirst alone −11. Most of it while riding (−13) or queueing (−4). |
| Rides | +14 | About 2 rides per guest. |
| Queue waiting | −7 | |
| Dirt (no bins or Groundskeepers) | −8 to −10 | Phase 3 design: an unmanaged park gets dirty. Not tuned. |
| Rain and storm | −2 to −11 | Phase 3 design: Umbrella Stand and covered rides help. Not tuned. |

1. **Entrance fee.** About half of all arrivals turned away. Fee tolerance is ($5 + $2.50 × open rides) × 0.8–1.2,
   so with 2 open rides the $10 starting fee sits exactly at the median tolerance. Whenever the tall Swing Tower is
   held for a storm, or a ride breaks down, only 1 ride is open and the tolerance tops out at $9: everyone turns away.
2. **Needs outrun the rides.** A flat ride holds a guest for up to 740 ticks (loading ≤ 200, cycle 400–500,
   unloading 40), plus the queue wait. At +8 thirst per 100 ticks, the step from uncomfortable (160) to urgent (210)
   takes only 625 ticks, so a guest who gets thirsty in a queue or on a ride almost always reaches urgent
   (−3 happiness per 100 ticks) before reaching a stall.
3. **The only thrill ride is full.** Every guest with T ≥ 25 ranks the Swing Tower first, and Thrill guests rode it up to
   3 times. Its queue sat at the 25-guest cap most of the day. Thrill guests then found nothing else above 0 (the
   Carousel scored below 0 for T ≥ 69 because of the boring term) and left after 3 decisions: about 36% of Thrill
   leavers never rode anything.

### Changes

| Constant | File | Old | New | Reason |
|---|---|---|---|---|
| `START_ENTRANCE_FEE` | `core.ts` | $10 (1,000) | **$6 (600)** | Cause 1. A new park opens with 1–2 rides; $6 is at or below the lowest tolerance with 1 open ride ($7.50 × 0.8), so a storm hold or a breakdown no longer turns every guest away. The player still has a reason to raise the fee as the park grows ($12+ tolerance at 4 rides). Lowering the fee instead of raising the tolerance keeps the income per guest modest. |
| `THIRST_RATE` | `guests.ts` | +8 | **+6** per 100 ticks | Cause 2. Uncomfortable → urgent now takes 833 ticks, longer than one ride with loading, so a guest who gets thirsty on a ride usually reaches the Fizz Stand before the urgent penalty. Guests still drink about 1–2 times per visit. |
| `HUNGER_RATE` | `guests.ts` | +7 | **+6** per 100 ticks | Cause 2, same reasoning for food (uncomfortable → urgent 833 ticks). |
| `BASE_THIRST_PER_100` | `management.ts` | 8 | **6** | Follows `THIRST_RATE` (the weather hook scales the Phase 1 base rate; the file says to keep them equal). Hot weather still raises thirst ×1.5: +3 extra per 100 ticks instead of +4. |
| `SCORE_BORING` | `guests.ts` | 0.8 | **0.6** | Cause 3. Mild Thrill seekers (T up to 85) now accept a gentle family ride as a second choice when the thrill queue is full, with the "That was a bit tame" thought and half the happiness gain. Extreme Thrill seekers (T ≥ 86) still refuse the Carousel, and every Thrill guest still ranks the Swing Tower far above it, so the groups keep visibly different preferences. |
| `SCORE_REPEAT` | `guests.ts` | 1.5 | **2.0** per earlier ride | Cause 3. Guests re-ride the same ride one time fewer (a T = 80 guest: 2 rides instead of 3), which frees the bottleneck ride for new guests and nudges the player to build variety. |

### Result

| 10 seeds | Arrivals | Turned away | Leaver happiness | Cash after 3 months |
|---|---|---|---|---|
| Before, mean | 213 | 212 | 130.9 | $12,420 |
| After, mean | 425 | 0 | 164.8 | $13,110 |
| After, worst seed | 370 | 0 | 158.7 | $12,655 |

Contribution of each step (same seeds): the fee alone gives 401 arrivals and 139.7 happiness; adding the need rates
gives 159.2 (worst 150.5); adding the score changes gives 164.8 (worst 158.7). Thrill leavers who never rode: about
36% → 18%.

The game is not trivially easy after this pass: a park without staff still ends the 3 months with cleanliness 0 (−150
rating points) and a rating near 660, breakdowns without a Mechanic are never fixed, rain still costs happiness, and the
2-ride park earns about $1,200 a month. The managed Phase 3 §9.2 park earns about $6,000 over 6 months after wages.

### Follow-ups for other owners
- `tests/unit/guests/scoring.test.ts` (score-term test) and `tests/unit/management/weather.test.ts` (hot weather test)
  copy the old numbers (0.8, 1.5, and a base thirst of 8) instead of reading the constants (master §8). They need to
  read `SCORE_BORING`, `SCORE_REPEAT`, and `BASE_THIRST_PER_100`.
- A broken ride in a park without a Mechanic keeps its riders on board forever (see
  `tests/integration/findings.test.ts`). It happens in about 1 of 5 three-month Phase 1 games and is not a tuning issue.
