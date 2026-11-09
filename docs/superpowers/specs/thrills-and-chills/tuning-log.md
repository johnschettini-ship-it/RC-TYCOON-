# Tuning log

Every change to a value in `src/data/tuning/*.ts` is listed here with the old value, the new value, and the reason.
The phase spec that owns the number is updated in the same change. Newest entries first.

How to reproduce the numbers: the Phase 1 integration park (`tests/integration/scenario.ts`, `buildPhase1Park`) over
many seeds, one summary line per seed:

```
TC_BALANCE_SEEDS=12345,777,2024,1,42,9001,7,99,31337,500 npx vitest run tests/integration/balance-sweep.test.ts --silent=false
```

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
