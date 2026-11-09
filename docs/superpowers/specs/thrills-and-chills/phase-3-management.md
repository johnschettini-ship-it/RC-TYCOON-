# Phase 3 — Management

- **Build:** 1 ("The Big Build"), last phase.
- **Status:** Draft for review.
- **Shared rules:** units, commands, determinism, and saves follow the master spec (`../2026-11-09-thrills-and-chills-design.md`). Content stats come from `content-catalog.md`.
- **Constants:** names in `CODE_CASE` refer to section 8. Section 8 is the only place for their values.

---

## 1. Goal
Running the park becomes a challenge. The player hires staff, keeps the park clean, keeps rides working, funds research, runs marketing, uses loans, and reacts to weather. Guests react to all of it, and the park rating shows the result.

## 2. Depends on
- **Phase 1:** paths, queues, flat rides, stalls, guests (temperament, needs, thoughts), distance fields, ledger, park rating, saves.
- **Phase 2:** generic track system, track rides, trains, dispatch from stations, per-type track parameters.

## 3. Scope
1. Staff: Groundskeeper, Mechanic, Security Guard, Performer. Hire, fire, wages, patrol areas, tasks.
2. Litter, mess, bins, and benches.
3. Vandalism of path items and repair.
4. Ride reliability, breakdowns, inspections.
5. Research: budget, focus, unlock order for all Build 1 research items.
6. Marketing: 7 campaigns.
7. Loans.
8. Weather with seasons.
9. Behaviour of the 8 new stalls and facilities, the 10 new flat rides, and the 4 new track ride types.
10. Park value.
11. Extended park rating.
12. Message log with tap-to-locate.
13. Finance categories and finance panel changes.
14. New guest thoughts.

---

## 4. Detailed design

### 4.1 Shared rules
- **Hourly charge rule.** A monthly amount `M` (cents) charges `floor(M / 72)` at the end of each game hour (72 hours per month). At the last hour of the month, an item that was active for all 72 hours at the same `M` also charges `M − 72 × floor(M / 72)`. So a full month costs exactly `M`. A partial month costs only the full hours worked. Running costs, wages, and the research budget use this rule (master R9).
- **Staff walking.** Staff walk on footpath and queue tiles. Queue ownership does not limit staff. Staff use their own distance fields (walkable mask `staff`), built and cached by the Phase 1 `pathing.ts` code. A path change marks these fields dirty.
- **Local search.** Staff look for nearby work with a breadth-first search (BFS) over walkable tiles inside their patrol area. The search stops at `STAFF_SEARCH_RADIUS` steps. The BFS parent links give the route. Ties break by fixed direction order (N, E, S, W).
- **Chebyshev radius.** "Within r tiles" means `max(|dx|, |dy|) ≤ r`.
- **Spatial index.** `sim/spatial.ts` keeps guest ids per tile. It updates when a guest changes tile. Radius checks read only the tiles inside the radius.
- **Decision tick.** Guests decide every 40 ticks (Phase 1). All per-decision effects in this phase apply at that tick.

### 4.2 Staff
- **Hire:** the player picks a type. The game charges `hire` from the catalog to `staffHiring`. The new staff member appears on the walkable tile next to the park entrance. A name comes from `data/names.ts` (original list) through the seeded RNG.
- **Limit:** at most `STAFF_MAX` staff. Hire fails with "Staff limit reached".
- **Fire:** removes the staff member at once. No refund. A Mechanic who was fixing a ride puts that breakdown back at the front of the pending queue.
- **Wages:** hourly charge rule, ledger category `wages`.
- **Patrol area:** a bitset over map tiles (`ceil(w × h / 8)` bytes). An empty patrol means "whole park". Staff never choose a task target outside their patrol, except a Mechanic dispatch fallback (below). If no patrol tile is reachable, the staff panel shows "Patrol area is not connected" and the staff member works as if the patrol were empty.
- **Movement:** speed per type from the catalog. Wandering picks a random walkable neighbour inside the patrol. It avoids the tile it came from, except at a dead end.

**Task priority per type (highest first):**

| Type | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| Groundskeeper | Mess within search radius | Bin with fill ≥ `BIN_EMPTY_AT` | Tile with the most litter (tie: nearest) | Wander |
| Mechanic | Assigned breakdown | Most overdue inspection in patrol | — | Wander |
| Security Guard | Walk to a random reachable patrol tile within `SECURITY_ROAM_RADIUS` | Repeat | — | — |
| Performer | Perform at the busiest spot | Walk `PERFORMER_WALK_TICKS` | Repeat | — |

- **Task times:** sweep a tile = `SWEEP_TICKS_PER_LITTER` × litter count. Clean mess = `MESS_CLEAN_TICKS`. Empty a bin = `BIN_EMPTY_TICKS`.
- **Re-check:** a walking staff member re-runs task selection every 40 ticks. A Groundskeeper drops a litter target for a mess target. A Mechanic drops an inspection walk for a dispatch.
- **Mechanic dispatch:** when a ride breaks down, the game picks one Mechanic who is not fixing a ride:
  1. Candidates are Mechanics whose patrol contains the ride's service tile (the footpath outside the exit gate), or whose patrol is empty.
  2. If no candidate exists, all free Mechanics are candidates (fallback).
  3. The game picks the smallest value in the ride's service distance field at the Mechanic's tile. Ties go to the lower id.
  4. A Mechanic who is inspecting on site finishes the inspection first (at most `INSPECTION_TICKS`).
  5. If no Mechanic is free, the breakdown goes to `pendingBreakdowns` (FIFO by tick). The next free Mechanic takes the oldest one.
  6. If the park has no Mechanic, the message "No mechanic is available" appears once per breakdown.
- **Inspection:** each ride has an interval (section 8, default `INSPECT_DEFAULT`). A ride is due when `now − lastInspectionTick ≥ interval`. The Mechanic picks the due ride with the highest `elapsed / interval` (tie: lower ride id), walks to its service tile, and waits until the current cycle ends. The ride status becomes `inspecting` for `INSPECTION_TICKS`. The ride starts no new cycle during the inspection.
- **Performer:** a Performer picks a spot by sampling `PERFORMER_SPOT_SAMPLES` random reachable patrol tiles within `PERFORMER_SEARCH_RADIUS`. The spot with the most guests within `PERFORMER_RADIUS` wins. The Performer performs for `PERFORMER_SHOW_TICKS`. At each decision tick, every guest within `PERFORMER_RADIUS` of a performing Performer gains `PERFORMER_HAPPY` happiness, or `PERFORMER_HAPPY_MATCH` on a costume match. A guest gets at most one Performer bonus per decision tick.
- **Costumes:** Frost matches Chill guests (temperament ≤ 35). Spark matches Thrill guests (temperament ≥ 65). Groups follow master R6. Boo has no match in Phase 3. Phase 4 adds Boo's match: night, or within 6 tiles of a `spooky` ride.

### 4.3 Litter, mess, bins, benches
- **Litter source:** a guest who buys food or drink gets `trash` with a timer from `TRASH_TIMER_MIN` to `TRASH_TIMER_MAX` ticks.
- **Bin use:** a guest with trash who enters a tile, or a 4-neighbour of a tile, that has a usable bin (not broken, fill < capacity) puts the trash in it. The bin fill rises by 1.
- **Drop:** when the timer ends and no usable bin is near, the guest drops litter on the current tile. A tile holds at most `LITTER_TILE_MAX` litter. On a full tile, the guest keeps the trash and tries again on the next tile.
- **Mess:** at each decision, a guest with nausea ≥ `SICK_NAUSEA` is sick with chance `SICK_CHANCE`. The tile gets 1 mess (max `MESS_TILE_MAX`; extra mess is not stored). The guest loses `SICK_NAUSEA_DROP` nausea and `SICK_HAPPY_DROP` happiness.
- **Storage:** litter and mess are per-tile counters (section 5). The renderer places items at sub-positions from a hash of tile index and item index. This is deterministic.
- **Dirt effect:** at each decision, `d = Σ litter + 4 × Σ mess` over the current tile and its 4 neighbours. If `d ≥ DIRT_MILD`, happiness −1. If `d ≥ DIRT_BAD`, happiness −3 and the thought "This path is filthy".
- **Cleanliness** (for the rating): `C = 1 − min(1, (totalLitter + 4 × totalMess) / (walkableTiles × DIRT_PER_TILE_ZERO))`.
- **Bins:** capacity 24 (catalog). A full bin accepts nothing. A broken bin accepts nothing but can still be emptied.
- **Benches:** at a decision, a guest with energy < `BENCH_TIRED` sits if a bench with a free seat is on the current tile or a 4-neighbour. Chill guests (temperament ≤ 35, master R6) use `BENCH_TIRED_CHILL`. Each bench has 2 seats. Sitting lasts 60 ticks and gives energy +60 (catalog).
- **Placement:** one path item per footpath tile. Not on queue tiles. Not on the park entrance tile.

### 4.4 Vandalism and repair
- At a decision, a walking guest with happiness < `ANGRY_HAPPY` may break a path item that is on the current tile or a 4-neighbour and is not broken.
- No vandalism happens if a Security Guard is within `SECURITY_RADIUS` of the guest.
- Chance per decision: `VANDAL_CHANCE`. The item gets the `broken` flag. Lamps can break too (Phase 4 effect: no light).
- A broken bench seats nobody. A broken bin accepts nothing.
- Guests next to a broken item lose 1 happiness per decision and may think "Someone broke that bench" (or bin, or lamp).
- **Repair:** cost = 50% of the item's build cost, ledger category `repairs`. The player repairs one item, or all broken items in one command. With the park setting **Auto-repair** on (default on), the game repairs each broken item at the next game hour if cash ≥ cost. If cash is too low, the item stays broken and the message log says so once per game day.

### 4.5 Reliability, breakdowns, inspections
- **Reliability** `R` is 0–100, stored as integer hundredths. A new ride starts at 100.
- **Cap:** `cap = max(REL_CAP_MIN, 100 − REL_CAP_LOSS_PER_YEAR × ageYears)`. Age counts from placement.
- **Wear:** after each cycle (flat ride) or each train dispatch (track ride), `R −= WEAR_PER_CYCLE × ageFactor`, with `ageFactor = min(2.0, 1 + 0.25 × ageYears)`. `R` never goes below 0.
- **Breakdown roll:** at the start of each cycle or dispatch, chance `p = BREAK_BASE + BREAK_SCALE × ((100 − R) / 100)²`.
- **Inspection result:** `R += max(1, 0.5 × (cap − R))`, clamped to `cap`.
- **Fix result:** `R += 0.25 × (cap − R)`, clamped to `cap`.
- **Family-friendly rule:** no crashes, no injuries, no falling vehicles. Riders always stay seated and safe.

| Type | Applies to | Weight | Effect until fixed | Fix factor |
|---|---|---|---|---|
| `stopped` | flat | 40 | Ride stops at once. Riders wait on board. | 1.00 |
| `train_stalled` | track | 40 | Each train continues to the next station or block brake and is held there. Trains are never held anywhere else, so they never touch (Phase 2 §4.7 and §11). Riders stay seated. | 1.50 |
| `gate_stuck` | all | 30 | The current cycle ends. Riders cannot leave and no one can board. Track rides: running trains finish the circuit and are held at the station or a block brake. | 0.50 |
| `slow_running` | all | 30 | The ride keeps running. Flat cycle time ×1.5. Track rides: powered drive speeds ×0.6; chain and lift speeds never change, so gravity physics stays as tested (Phase 2 §11). Rider excitement −1.00. | 0.75 |

- **Status:** the ride status becomes `broken` and stores `breakdownType`. A spanner icon shows above the ride. A `breakdown` message appears.
- **Fix:** the Mechanic stands on the service tile for `FIX_TICKS × fix factor`. Then the ride returns to its status before the breakdown, and the trains or cycle continue.
- **Guests:** queue patience drains ×2 while the ride is `broken` (except `slow_running`). Guests on their way to the ride decide again. Riders on a stopped ride lose 1 happiness per decision and think "We are stuck!". For one game day after a fix, guests score the ride ×`RECENT_BREAK_SCORE`.
- **Counters:** each ride stores `breakdownsThisMonth` and `lastBreakdownTick`.
- **Unattended breakdowns:** a ride that stays `broken` (not `slow_running`) for `EVACUATE_TICKS` (400 ticks, 8 game hours) with no Mechanic assigned lets its riders off safely, so no guest stays `riding` forever in a park without Mechanics (Phase 1 §9). The ride stays `broken` and nobody boards. Flat rides: every rider gets off at the exit. Track rides (master R16): riders on a train held in the station get off at the exit gate. Riders on a train held at a block brake stay seated until their train reaches the station: the train moves on block by block under the normal block rules, so trains never touch, and an empty train in the station goes to the shed when another train needs the station (as when the ride closes). When a Mechanic is assigned, the hold rules above apply again.

### 4.6 Research
- **Budget levels** (section 8): none, low, medium, high. The budget uses the hourly charge rule, category `research`. No charge happens while no item is in progress.
- **Points:** each game hour adds the level's points to `progress`.
- **Item choice:** when `current` is empty or done, the game picks the first item in the default order whose category is focused. If no category is focused, or no focused category has items left, the game picks the first remaining item in default order. Changing focus never resets the progress of the current item.
- **Unlock:** when `progress ≥ cost`, the item joins `unlocked`. The surplus carries to the next item. A `research` message says "New ride available: Drop Tower" (or stall, or track type). Tapping the message opens the build menu at that item.
- **Complete:** when no item remains, `current` is empty, charges stop, and the message "All research is complete" appears once.
- **Start state:** catalog items with unlock `start` begin unlocked. Phase 5 sandbox unlocks everything.

**Default order and costs (Build 1):**

| # | Item | Category | Cost (points) |
|---|---|---|---|
| 1 | Spiral Slide | Gentle | 150 |
| 2 | Ice Cream Cart | Shops | 150 |
| 3 | Umbrella Stand | Shops | 180 |
| 4 | Rocket Rounds | Gentle | 200 |
| 5 | Pendulum Ship | Thrill | 250 |
| 6 | First Aid | Shops | 200 |
| 7 | Bumper Cars | Gentle | 250 |
| 8 | Cocoa Hut | Shops | 180 |
| 9 | Mirror Maze | Gentle | 250 |
| 10 | Spinning Mouse | Coasters | 450 |
| 11 | Pizza Slice | Shops | 220 |
| 12 | Thunder Disc | Thrill | 350 |
| 13 | Balloon Stand | Shops | 180 |
| 14 | Observation Tower | Gentle | 350 |
| 15 | Go-Kart Track | Thrill | 400 |
| 16 | Ghost Train | Gentle | 400 |
| 17 | Cash Machine | Shops | 250 |
| 18 | Drop Tower | Thrill | 450 |
| 19 | Haunted Manor | Gentle | 450 |
| 20 | Wooden Coaster | Coasters | 600 |
| 21 | Flip Arm | Thrill | 550 |

Total: 6,460 points. At medium (216 points per month), all items unlock in about 30 game months.

### 4.7 Marketing
- The player starts a campaign. The full cost is charged at once, category `marketing`. A campaign cannot be cancelled for a refund.
- Only one campaign of each type runs at a time. Thrill Weekend and Chill Weekend cannot run together.
- Arrival multipliers of running campaigns multiply together. The product is capped at `CAMPAIGN_ARRIVAL_CAP`.

| id | Name | Cost | Duration | Target | Effect |
|---|---|---|---|---|---|
| `open_gate_day` | Open Gate Day | $400 | 1 day | park | Entrance fee is $0 for arrivals. Arrivals ×1.8. |
| `poster_run` | Town Poster Run | $600 | 1 month | park | Arrivals ×1.25. |
| `radio_jingle` | Radio Jingle | $1,200 | 1 month | park | Arrivals ×1.5. |
| `ride_spotlight` | Ride Spotlight | $350 | 1 month | one ride | Guests score that ride ×1.6. Arrivals ×1.1. |
| `snack_deal` | Snack Deal | $250 | 1 month | one stall id | Guests pay 50% of the price there. Want chance ×1.5. Arrivals ×1.05. Stock cost does not change. |
| `thrill_weekend` | Thrill Weekend | $500 | 2 days | park | Arrivals ×1.2. New guests get temperament +20 (max 100). Thrill rides scored ×1.2. |
| `chill_weekend` | Chill Weekend | $500 | 2 days | park | Arrivals ×1.2. New guests get temperament −20 (min 0). Chill rides scored ×1.2. |

- A targeted campaign ends early if its target is removed. A `marketing` message reports it. No refund.

### 4.8 Loans
- **Limit:** `maxLoan = max(LOAN_MIN_LIMIT, floor(0.5 × parkValue / LOAN_STEP) × LOAN_STEP)`.
- **Borrow and repay** in steps of `LOAN_STEP`. Borrow fails with "Loan limit reached". Repay fails with "Not enough cash" or "No loan to repay".
- **Interest:** at the first tick of each month, `floor(balance × LOAN_RATE_BP / 10,000)` cents, category `loanInterest`.
- Borrowed and repaid amounts are **financing**. They change cash but not profit.
- If `parkValue` falls, the limit falls. The game never forces a repayment.
- Cash below $0 at a month start gives a `finance` message: "Cash is negative. Repay costs or take a loan". Phase 3 has no game over. Phase 5 scenarios add fail rules.

### 4.9 Weather
- **States:** sunny, cloudy, rain, storm, hot, cold. A new game starts sunny.
- **Change:** every `WEATHER_INTERVAL` ticks. The game always holds the next state (`weather.next`) for the forecast.
- **Draw:** with chance `WEATHER_STAY`, `next = current`. Otherwise, draw from the season weights. If the draw is `storm` and the current state is not rain or cloudy, the result is `rain`. A storm never lasts more than one interval: after a storm, the draw uses only rain and cloudy (weights 1:1).

| Season | Sunny | Cloudy | Rain | Storm | Hot | Cold |
|---|---|---|---|---|---|---|
| Winter | 15 | 30 | 20 | 5 | 0 | 30 |
| Spring | 35 | 30 | 25 | 5 | 5 | 0 |
| Summer | 35 | 15 | 10 | 10 | 30 | 0 |
| Autumn | 25 | 35 | 25 | 5 | 0 | 10 |

| Effect | Sunny | Cloudy | Rain | Storm | Hot | Cold |
|---|---|---|---|---|---|---|
| Arrival factor | 1.0 | 0.9 | 0.6 | 0.3 | 1.1 | 0.7 |
| Happiness per decision, uncovered, no umbrella | 0 | 0 | −1 | −2 | 0 | 0 |
| Same, with umbrella | 0 | 0 | 0 | −1 | 0 | 0 |
| Need rate change | — | — | — | — | thirst rise ×1.5 | energy fall ×1.2 |

- **Covered:** a guest is covered while riding a `covered` ride.
- **Ride choice in rain or storm:** a guest without an umbrella scores `covered` rides ×1.5 and other rides ×0.6. Guests with temperament ≥ 80 use ×0.8 for other rides.
- **Stall factors:** the catalog factors multiply the impulse chance (4.10). In need-based stall choice, the game divides the distance to each stall by its factor. So a hot day pulls hungry guests toward the Ice Cream Cart.
- **Storm hold:** during a storm, tall rides finish the current cycle or circuit and start no new one. Status `stormHold`. Tall rides are `big_wheel`, `swing_tower`, `observation_tower`, `drop_tower`, `flip_arm`, and any track ride with highest track point ≥ 20 m. Queues stay. Guests think "They closed it for the storm".
- **HUD:** an icon for the current state, plus a small forecast icon for `next`.

### 4.10 New stalls and facilities (behaviour)
- **Impulse buy:** a guest on a stall's service tile, with no urgent need and cash ≥ price, buys with chance `IMPULSE[kind] × weatherFactor × priceFactor`. `priceFactor = 1` if price ≤ catalog price. Otherwise `max(0, 1 − (price − catalogPrice) / catalogPrice)`. A guest never impulse-buys a souvenir or map they already hold.
- **Pizza Slice:** food, need-based like the Snack Shack.
- **Ice Cream Cart:** food with a small hunger effect. Mostly impulse buys.
- **Cocoa Hut:** drink. Mostly impulse buys in cold or rain.
- **Balloon Stand:** the guest holds a balloon (drawn above the guest). Each game hour, the balloon floats away with chance `BALLOON_LOSS`. Then the guest thinks "My balloon flew away!" and loses 5 happiness.
- **Umbrella Stand:** the guest holds an umbrella. It opens in rain and storm (render only).
- **Info Kiosk and maps:**
  - **Wrong turns:** a guest without a map, on a junction tile (3 or more walkable neighbours), takes a random non-best neighbour with chance `WRONG_TURN`.
  - **Lost:** a guest whose target distance has not improved for `LOST_STEPS` steps becomes lost. A lost guest thinks "I am lost. I need a map", loses 1 happiness per decision, and uses `WRONG_TURN × 2`. Lost ends when the distance improves.
  - A lost guest without a map targets the nearest Info Kiosk if it is closer than the current target. A lost guest always buys a map if cash allows.
  - **With a map:** no wrong turns, never lost by this rule. An unreachable target still gives "I can't find" thoughts (Phase 1 rule).
- **First Aid:** a guest with nausea ≥ `FIRST_AID_NAUSEA` targets the nearest First Aid with the same urgency as Restrooms. The visit takes 60 ticks.
- **Cash Machine:** a guest with cash < $10, happiness ≥ `CASH_MACHINE_HAPPY`, and fewer than 2 withdrawals targets the nearest Cash Machine. The guest withdraws a random amount from $40 to $80 (whole dollars). This money comes from outside the park, so no ledger entry is made.

### 4.11 New rides (behaviour)
- **Flat rides:** all 10 research flat rides use the Phase 1 cycle. Mirror Maze and Haunted Manor are walk-through attractions. They use the same cycle with riders hidden inside.
- **Track ride types:** Phase 2 owns the physics and rating formulas. Phase 3 sets these per-type parameters. If Phase 2 uses other names, the Phase 2 names win and this table maps to them.

| Type | Drive | Parameters |
|---|---|---|
| Wooden Coaster | gravity | `frictionFactor` 1.25. `airtimeBonus` +0.30 excitement per airtime event, max +1.20. Track shake (render only). |
| Spinning Mouse | gravity | Single cars. `spinNausea` +1.50 nausea, +0.50 excitement. Small turns only. |
| Ghost Train | powered 3 m/s | Spooky tunnel piece: +0.40 excitement each, max +1.20. |
| Go-Kart Track | guest-driven | Kart speed = 6 + 3 × temperament / 100 m/s. 3 laps. A kart stays at least one piece behind the kart ahead and waits if needed. |

### 4.12 Park value
- Updated at every hour start (master R13).
- `parkValue = Σ rides and stalls (asset value) + Σ paths and path items (buildCost × 0.5) + land value (Phase 4 hook, 0 in Phase 3)`.
- **Asset value** of a ride or stall = `buildCost × max(DEP_FLOOR, 1 − (1 − DEP_FLOOR) × ageMonths / DEP_MONTHS)` = `buildCost × max(0.30, 1 − 0.7 × ageMonths / 120)`. Phase 2 uses the same formula.
- A track ride's `buildCost` is its `totalBuildCost`: pieces, stations, and trains (Phase 2).
- The park panel and finance panel show it. Loans and Phase 5 goals use it.

### 4.13 Park rating (replaces the Phase 1 formula)
`rating = round(Σ weight × subScore)`. Each sub-score is 0–1. Updated at every hour start (master R8).

| Sub-score | Formula | Weight |
|---|---|---|
| Happiness `H` | average guest happiness / 255 | 400 |
| Cleanliness `C` | from 4.3 | 150 |
| Reliability `B` | `1 − min(1, (ridesBrokenNow + 0.5 × ridesBrokeThisMonth) / max(1, rides))` | 100 |
| Fair prices `P` | `1 − min(1, 3 × tooExpensiveThoughtsToday / max(1, guests))` | 100 |
| Variety `V` | `(1 − 0.5 × Σ |guestShare − rideShare|) × min(1, openRides / 8)` | 100 |
| Lost guests `L` | `1 − min(1, 4 × lostGuests / max(1, guests))` | 75 |
| Queues `Q` | `1 − min(1, average over open rides of queueLength / (3 × capacity))` | 75 |

- **Variety shares** use the three master R6 groups. Guests: temperament ≤ 35 (chill), 36–64 (family), ≥ 65 (thrill). Rides: open rides by tag.
- **Phase 4 hook:** Phase 4 adds Atmosphere with weight 100 and lowers Happiness to 300 (master R8). The sum stays 1,000.
- With 0 guests, `H`, `P`, `L` use 0.5.

### 4.14 Message log
- Each message has: id, tick, category, text, and an optional target (entity id or tile).
- Categories: `breakdown`, `research`, `weather`, `finance`, `staff`, `marketing`, `park`.
- The log keeps the newest `MESSAGE_MAX` messages. It is part of `GameState` and the save.
- Breakdown and research messages also show a toast with a "Show" button.
- Tap or click a message: the camera centres on the target, and the target's panel opens. A message without a target only opens the log.
- `messagesReadUpTo` drives the unread badge.

### 4.15 Finance
- **New expense categories:** `wages`, `staffHiring`, `research`, `marketing`, `loanInterest`, `repairs`.
- **Financing rows** (excluded from profit): `loanBorrowed`, `loanRepaid`.
- **Check:** for every month, `cashEnd − cashStart = income − expenses + loanBorrowed − loanRepaid`. An integration test checks this.

### 4.16 New guest thoughts
"This path is filthy" · "Nice clean park!" · "Someone broke that bench" · "The ride broke down. Typical!" · "We are stuck!" · "They closed it for the storm" · "I am lost. I need a map" · "This map is a lifesaver" · "My balloon flew away!" · "I love my balloon" · "It is raining and I have no umbrella" · "Good thing I have an umbrella" · "It is too hot" · "Brr, it is cold" · "A cocoa would be nice" · "I feel awful" · "That performer is fun!" · "Frost is so cute!" · "Spark is awesome!" · "I need cash" · "Thrill Weekend? Count me in!" · "Chill Weekend sounds perfect".

- A guest shows the same thought at most once per game day.

### 4.17 Tick order (Phase 3)
See master R13. Phase 3 parts, in that order: month-end pipeline at month start (ledger close → loan interest → metric resets → `monthEnded` event) → weather (on interval) → arrivals → guests (id order) → staff (id order) → flat rides → track rides → stalls → hour-start work (hourly charges for running costs, wages, and research → research points → campaign expiry → auto-repair → park value → rating) → message pruning → `tick + 1`.

---

## 5. State and entity changes
- **Schema:** Build 1 ships as schema version 1. No migration is needed inside Build 1 (master spec section 7).
- **Map arrays (new):** `pathItem: Uint8Array` (0 none, 1 bench, 2 bin, 3 lamp), `pathItemFlags: Uint8Array` (bit 0 = broken), `binFill: Uint8Array`, `litter: Uint8Array` (0–8), `mess: Uint8Array` (0–2).
- **`Staff`:** id, type, name, tile, sub-tile progress, state (`walking`, `sweeping`, `cleaning`, `emptying`, `inspecting`, `fixing`, `performing`), task target, patrol bitset or null, costume (Performer), hiredTick, hoursThisMonth.
- **`Ride` (added):** reliability, lastInspectionTick, inspectionInterval, breakdownType or null, statusBeforeBreakdown, breakdownsThisMonth, lastBreakdownTick, assignedMechanicId or null. Status adds `broken`, `inspecting`, `stormHold`.
- **`Guest` (added):** trashTimer (0 = no trash), items (map, umbrella, balloon flags), withdrawals, lostSteps, bestDistance, sittingTicks, thought cooldowns.
- **`Park` (added):** `research` {level, focus per category, current, progress, unlocked[], completeNotified}, `campaigns[]` {type, targetId, endTick}, `loan` {balance}, `weather` {current, next, nextChangeTick}, `parkValue`, `autoRepair`, `pendingBreakdowns[]`, `messages[]`, `messagesReadUpTo`.
- **Ledger:** new categories from 4.15.
- **Integrity tests:** every staff target, assigned Mechanic, pending breakdown, campaign target, and message target points to a live entity or is cleared when the entity is removed.

## 6. Commands added

| Command | Fields | Failure reasons |
|---|---|---|
| `hireStaff` | staffType | "Not enough cash", "Staff limit reached" |
| `fireStaff` | staffId | "Staff member not found" |
| `editPatrol` | staffId, add: tile[], remove: tile[] | "Staff member not found", "Tile is outside the park" |
| `clearPatrol` | staffId | "Staff member not found" |
| `setCostume` | staffId, costume | "Only Performers wear costumes" |
| `setInspectionInterval` | rideId, interval | "Ride not found" |
| `buildPathItem` | x, y, itemType | "Not enough cash", "Needs a footpath", "Tile already has an item", "Not unlocked" |
| `removePathItem` | x, y | "No item here" |
| `repairPathItem` | x, y | "Not enough cash", "Item is not broken" |
| `repairAllPathItems` | — | "Not enough cash", "Nothing to repair" |
| `setAutoRepair` | on | — |
| `setResearchBudget` | level | — |
| `setResearchFocus` | category, on | "Unknown category" |
| `startCampaign` | campaignType, targetId? | "Not enough cash", "Campaign already running", "Thrill and Chill Weekends cannot run together", "Pick a target" |
| `borrow` | amount | "Loan limit reached", "Amount must be a multiple of $1,000" |
| `repay` | amount | "Not enough cash", "No loan to repay", "Amount must be a multiple of $1,000" |
| `markMessagesRead` | upToId | — |

- `editPatrol` is sent once per paint stroke, at the end of the drag. The ghost stroke lives in `ToolState` during the drag.

## 7. UI

### 7.1 New controls
- **Toolbar:** Staff, Path items (Bench, Bin), Office, Messages (unread badge), Overlays.
- **HUD:** weather icon with forecast. Tap or hover shows "Rain now · Cloudy next".
- **Office panel** with 4 tabs: Finances, Loan, Research, Marketing.
  - Finances: this month, last month, 12-month profit chart, all categories, financing rows apart.
  - Loan: balance, limit, monthly interest, Borrow $1,000 and Repay $1,000 buttons. Borrow asks for confirmation.
  - Research: budget selector, one focus toggle per category, current item name, progress bar, estimated unlock month.
  - Marketing: campaign cards with cost, duration, effect, and a Start button. Running campaigns show the time left.
- **Staff panel:** hire buttons per type with wage, a list filtered by type, and per staff: status line ("Fixing Big Wheel"), patrol edit, costume picker (Performer), Fire (with confirmation).
- **Ride panel (added):** reliability %, status chip, breakdowns this month, last inspection, inspection interval selector (4 h, 8 h, 12 h, 1 day, 2 days, 1 month, never).
- **Map icons:** spanner above broken rides, cloud icon above `stormHold` rides, crack mark on broken path items.
- **Overlays:** Litter (heat tint per tile), Reliability (rides tinted by `R`), Patrol (selected staff's area). Each overlay has a legend with text, not only colour.

### 7.2 Patrol painting
- Open from the staff panel: "Edit patrol area". The tool `patrolPaint` starts and shows a floating bar: Paint / Erase toggle, brush 1×1 / 3×3 / 5×5, Clear, Done.
- **Desktop:** left-drag paints in the current mode. Shift + left-drag uses the other mode. Right-drag pans.
- **Touch:** one-finger drag paints. Two fingers pan and zoom and never paint. A stroke that becomes a two-finger gesture is dropped.
- Painted tiles show a coloured outline. Tiles outside the park cannot be painted.
- Done sends `editPatrol` for any stroke not yet sent and closes the tool.

### 7.3 Touch and layout
- On screens < 900 px wide, the Office and Staff panels are bottom sheets. Their tabs become a segmented control.
- All buttons are at least 44 × 44 px.
- Long-press on a staff member opens its panel.
- Toasts stack at most 1. A newer toast replaces an older one of a lower category priority (breakdown > research > others).

### 7.4 Keyboard
`H` Staff panel · `O` Office · `M` Messages · `B` Bench · `N` Bin · `L` Litter overlay.

---

## 8. Tuning constants
All values are **starting values**. They live in `src/data/` (`staff.ts`, `litter.ts`, `breakdowns.ts`, `research.ts`, `marketing.ts`, `loans.ts`, `weather.ts`, `rating.ts`). Tests read the same constants.

| Constant | Value | Notes |
|---|---|---|
| `STAFF_MAX` | 200 | |
| `STAFF_SEARCH_RADIUS` | 10 steps | Groundskeeper and Mechanic local BFS |
| `SECURITY_RADIUS` | 6 tiles | Vandalism block |
| `SECURITY_ROAM_RADIUS` | 12 tiles | |
| `PERFORMER_RADIUS` | 4 tiles | |
| `PERFORMER_SEARCH_RADIUS` | 10 tiles | |
| `PERFORMER_SPOT_SAMPLES` | 8 | |
| `PERFORMER_SHOW_TICKS` | 200 | 10 s |
| `PERFORMER_WALK_TICKS` | 100–300 | random |
| `PERFORMER_HAPPY` / `PERFORMER_HAPPY_MATCH` | +2 / +3 | per decision |
| `SWEEP_TICKS_PER_LITTER` | 20 | |
| `MESS_CLEAN_TICKS` | 60 | |
| `BIN_EMPTY_TICKS` | 40 | |
| `BIN_EMPTY_AT` | 18 | of 24 |
| `TRASH_TIMER_MIN` / `MAX` | 400 / 1,200 ticks | 20–60 s |
| `LITTER_TILE_MAX` / `MESS_TILE_MAX` | 8 / 2 | |
| `SICK_NAUSEA` | 180 | of 255 |
| `SICK_CHANCE` | 0.08 | per decision |
| `SICK_NAUSEA_DROP` / `SICK_HAPPY_DROP` | 100 / 15 | |
| `DIRT_MILD` / `DIRT_BAD` | 4 / 10 | |
| `DIRT_PER_TILE_ZERO` | 0.5 | cleanliness reaches 0 |
| `BENCH_TIRED` / `BENCH_TIRED_CHILL` | 100 / 130 | energy, of 255 |
| `ANGRY_HAPPY` | 50 | of 255 |
| `VANDAL_CHANCE` | 0.03 | per decision |
| `REL_CAP_MIN` | 50 | |
| `REL_CAP_LOSS_PER_YEAR` | 5 | |
| `WEAR_PER_CYCLE` | 1.5 | reliability points |
| `BREAK_BASE` / `BREAK_SCALE` | 0.002 / 0.20 | |
| `INSPECTION_TICKS` | 100 | 2 game hours |
| `INSPECT_DEFAULT` | 1 day (1,200 ticks) | |
| Inspection intervals | 200, 400, 600, 1,200, 2,400, 3,600 ticks, never | 4 h, 8 h, 12 h, 1 day, 2 days, 1 month |
| `FIX_TICKS` | 200 | 4 game hours, × fix factor |
| `RECENT_BREAK_SCORE` | 0.8 | for 1 day |
| Research budget (none/low/med/high) | $0 / $200 / $400 / $600 per month | hourly charge rule |
| Research points per hour | 0 / 2 / 3 / 4 | = 0 / 144 / 216 / 288 per month |
| `CAMPAIGN_ARRIVAL_CAP` | 2.5 | |
| `LOAN_MIN_LIMIT` | $10,000 | |
| `LOAN_STEP` | $1,000 | |
| `LOAN_RATE_BP` | 100 | 1% per month |
| `WEATHER_INTERVAL` | 600 ticks | 12 game hours |
| `WEATHER_STAY` | 0.5 | |
| `IMPULSE` (food / drink / souvenir / info) | 0.05 / 0.05 / 0.06 / 0.10 | |
| `BALLOON_LOSS` | 0.01 | per game hour |
| `WRONG_TURN` | 0.08 | |
| `LOST_STEPS` | 60 | |
| `FIRST_AID_NAUSEA` | 150 | |
| `CASH_MACHINE_HAPPY` | 100 | |
| `DEP_FLOOR` / `DEP_MONTHS` | 0.30 / 120 | asset value reaches the floor at 120 months |
| `MESSAGE_MAX` | 200 | |

---

## 9. Tests

### 9.1 Unit (Vitest)
- Hourly charge rule: full month equals `M` exactly for several `M` values (including values not divisible by 72). Partial month equals full hours only.
- Staff: hire and fire costs, limit, spawn tile, task priority per type, patrol limits, unreachable-patrol fallback.
- Mechanic dispatch: patrol candidate first, nearest wins, lower id breaks ties, fallback to any free Mechanic, FIFO pending queue, re-queue on fire.
- Inspection due logic and most-overdue choice. Reliability formulas for wear, cap, inspection, fix. Breakdown chance function at R = 100, 80, 50, 0.
- Each breakdown type: ride behaviour, riders stay on board, status restore after fix.
- Litter: bin deposit, drop on timer end, tile cap, full and broken bins. Mess at the nausea threshold. Dirt effect thresholds. Cleanliness formula.
- Benches: seat limit, chill threshold. Vandalism: chance, Security block radius, repair cost, auto-repair with and without cash.
- Research: points per level, item choice with and without focus, surplus carry, completion message once, no charge when complete.
- Marketing: each campaign effect, stacking cap, exclusive weekends, target removal.
- Loans: limit formula, step checks, interest floor, financing excluded from profit.
- Weather: season weights, stay chance, storm rules, storm hold of tall rides, umbrella and covered effects, stall factor on distance.
- Impulse buy price factor. Wrong turns and lost rule. Map stops both. First Aid. Cash Machine limits.
- Park value depreciation. Rating weights sum to 1,000. Each sub-score at its edges (0 guests, 0 rides).
- Message log cap, unread count, target clearing on entity removal.

### 9.2 Integration: 6-month scripted game
Setup: 64 × 64 map, footpath loop, 4 Phase 1 rides with queues, 3 stalls, 6 bins, 6 benches, 1 Junior Coaster, 2 Groundskeepers (one with a patrol), 1 Mechanic, 1 Security Guard, 1 Performer (Spark), research at medium, a $5,000 loan, Town Poster Run at month 2. Run 6 game months (21,600 ticks). Check:
- The finance check from 4.15 holds for every month.
- Research unlocks match the points: 6 × 216 = 1,296 points. Item 7 needs 1,380 cumulative points, so exactly items 1–6 unlock.
- At least one breakdown occurs and is fixed. No ride stays `broken` longer than `FIX_TICKS × 1.5` plus walking time while the Mechanic is free.
- Total litter stays below 0.5 per walkable tile at each month end.
- All reference integrity checks pass. The rating stays in 0–1,000.

### 9.3 Determinism
- Run the scripted game twice: equal state hashes.
- Run it with a save and load at month 3: the final hash equals the run without the save.

### 9.4 Save round-trip
- A state with staff, patrol bitsets, path items, litter, research, campaigns, a loan, weather, and messages saves and loads deep-equal.

### 9.5 Benchmark
- 2,000 guests, 40 staff, 1,000 litter, 10 track rides: tick < 3 ms on the CI runner (master budget).

### 9.6 Playwright smoke
- **Desktop:** hire a Groundskeeper, paint a patrol with the mouse, place a bin, set research to high, borrow $1,000, start Town Poster Run, open Messages and click a message.
- **Phone profile:** hire a Mechanic from the bottom sheet, paint a patrol with a one-finger drag, check that a two-finger pan paints nothing, open the Office Loan tab and repay $1,000.

---

## 10. Done when
- [ ] All 4 staff types can be hired, fired, assigned patrols, and do their tasks in the integration game.
- [ ] Wages, research, marketing, interest, and repairs appear in the ledger. The month finance check passes.
- [ ] Rides break down, Mechanics fix them, and inspections raise reliability as specified.
- [ ] All 21 research items unlock in default order at the specified costs. Focus changes the order.
- [ ] All 7 campaigns work and respect the cap and exclusivity rules.
- [ ] Weather follows season weights. Storm hold, umbrellas, covered rides, and stall factors work.
- [ ] The 8 new stalls and facilities, 10 flat rides, and 4 track ride types work in a park.
- [ ] Park value and the new rating appear in the UI and match the formulas.
- [ ] Messages log, toast, and locate their targets on desktop and touch.
- [ ] Unit, integration, determinism, save, and smoke tests pass. The benchmark meets the budget, or the gap is documented.

## 11. Risks and open questions
- **Mechanic overload.** Large parks may need many Mechanics. Mitigation: the ride panel shows "Inspection overdue". Tune `WEAR_PER_CYCLE` in play-tests.
- **Ageing rides.** Reliability caps fall with age, and Phase 3 has no refurbish action. The player must rebuild. Open question: add a "Refurbish" command (cost 50% of build cost, resets age) in Phase 3 or Phase 6?
- **Patrol painting on phones.** Small tiles are hard to hit at low zoom. Mitigation: brush sizes and an automatic zoom-in hint below 0.75× zoom.
- **Performance.** Local BFS for many Groundskeepers. Mitigation: the radius cap, and task search only every 40 ticks.
- **Weather rhythm.** A change every 12 game hours means about every 30 s at 1×. Play-tests may show this is too fast. Change `WEATHER_INTERVAL` only.
- **Research pacing.** About 30 months at medium. Phase 5 scenarios may scale costs by difficulty.
- **Negative cash.** Phase 3 has no game over. Phase 5 adds scenario fail rules.
- **Balloon float-away effect.** Phase 3 only removes the balloon. A floating animation needs a render-only event channel (Phase 6).
