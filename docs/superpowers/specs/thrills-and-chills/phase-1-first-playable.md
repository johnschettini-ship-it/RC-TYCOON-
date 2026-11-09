# Phase 1 — First Playable

- **Build:** 1 ("The Big Build")
- **Master spec:** [`../2026-11-09-thrills-and-chills-design.md`](../2026-11-09-thrills-and-chills-design.md)
- **Content numbers:** [`content-catalog.md`](content-catalog.md) sections 1 and 3 (Phase 1 rows).

## 1. Goal
A small park that works. Guests arrive, ride, eat, drink, use restrooms, pay, and leave. Each guest is a Thrill seeker, a Chill seeker, or in between. The player sees money go up or down and knows why.

## 2. Depends on
Phase 0.

## 3. Scope
1. Command system (master spec 5.3).
2. Footpaths, queue paths, demolish.
3. Flat rides: Carousel, Big Wheel, Swing Tower, Teacup Twirl.
4. Stalls: Snack Shack, Fizz Stand, Restrooms.
5. Walkable network and distance fields.
6. Guests: spawn, temperament, needs, decisions, movement, queues, riding, buying, thoughts, leaving.
7. Ride cycle and stall service.
8. Economy: prices, ledger, running costs, finance panel.
9. Park rating and arrival rate.
10. UI: build tools, ghosts, panels, toasts, overlays for temperament.
11. Title screen, saves, autosave, export and import.
12. Tests and smoke tests.

## 4. Detailed design

### 4.1 Building
- **Tools:** Inspect, Footpath, Queue path, Place ride, Place stall, Demolish.
- **Paths:** drag draws a straight line along the x or y axis, whichever has the larger distance from the start tile. The ghost shows the total cost before release. On touch, the line follows the finger and builds on release. A tap builds one tile.
- **Rides and stalls:** a ghost follows the pointer. `R` or the Rotate button turns it 90°. The ghost is green with a check icon when valid, red with a cross icon when not. Click places it. On touch: tap moves the ghost, the Confirm button places it, the Cancel button removes it.
- **Ride gates:** catalog legend rule. The tile outside the entrance gate needs a queue path. The tile outside the exit gate needs a footpath.
- **Stalls:** the service side faces one edge. The tile outside it needs a footpath.
- **Demolish:** refunds 50% of build cost (paths 0%). Riders finish their cycle first; the queue empties; guests re-plan.

**Command results (exact strings)**
| Case | Result |
|---|---|
| Cash below cost | Block: "Not enough cash." |
| Tile not empty | Block: "Something is in the way." |
| Tile not owned | Block: "You do not own this land." |
| Ride entrance has no queue path | Warning: "The entrance needs a queue path." |
| Ride exit has no footpath | Warning: "The exit needs a footpath." |
| Stall faces no footpath | Warning: "This stall must face a footpath." |
| Demolish the park entrance | Block: "You cannot remove the park entrance." |

Warnings do not block the command. The ride or stall panel keeps showing the warning until it is fixed.

### 4.2 Walkable network
- Footpath and queue tiles connect to their 4 neighbours. No diagonal moves.
- A **queue** is a set of connected queue tiles. It belongs to the ride whose entrance gate it touches. A queue that touches no entrance shows a warning icon.
- Only guests that go to that ride may walk on its queue tiles.
- **Distance fields:** one `Uint16Array` per destination (ride entrance, stall service tile, park entrance). BFS from the destination over walkable tiles. Fields for stalls and the park entrance exclude queue tiles.
- Fields rebuild only when the network changes. A rebuild of all fields on a 64 × 64 map must take < 5 ms.
- **Movement:** a guest steps to the neighbour with the smallest distance. Ties break in the order N, E, S, W.
- **No route:** the guest wanders (random neighbour, no immediate reversal) and gets the thought "I am lost." After 2 game hours lost, the guest heads for the exit if it is reachable.

### 4.3 Guests

**Spawn and entry**
- Guests appear outside the park entrance at the arrival rate (4.6).
- **Entrance fee tolerance** = ($5 + $2.50 × open rides) × random factor 0.8–1.2.
- Fee above tolerance: the guest turns away. The park counts it as "turned away: too expensive".

**Temperament**
- `T` = round of the mean of two uniform draws in [0, 100]. This gives a triangle distribution centred on 50.
- Groups for UI and stats: Chill (T ≤ 35), Family (36–64), Thrill (T ≥ 65).

| Derived value | Formula | T = 0 | T = 50 | T = 100 |
|---|---|---|---|---|
| Max intensity | 2.0 + 0.08 × T | 2.0 | 6.0 | 10.0 |
| Min intensity (below = boring) | 0.05 × T | 0.0 | 2.5 | 5.0 |
| Nausea gain multiplier | 1.5 − T / 100 | 1.5 | 1.0 | 0.5 |
| Energy drain multiplier | 0.8 + T / 250 | 0.8 | 1.0 | 1.2 |
| Tag fit: `thrill` | (T − 50) / 50 | −1.0 | 0.0 | +1.0 |
| Tag fit: `chill` | (50 − T) / 50 | +1.0 | 0.0 | −1.0 |
| Tag fit: `family` | 0.3 | 0.3 | 0.3 | 0.3 |

**Needs** (0–255; master spec 6.1)
| Need | Start | Change per 100 ticks | Uncomfortable | Urgent |
|---|---|---|---|---|
| Hunger | 30–60 | +7 | 160 | 210 |
| Thirst | 30–60 | +8 | 160 | 210 |
| Bladder | 10–40 | +5 | 160 | 210 |
| Energy | 200–255 | −3 × energy drain multiplier | — | ≤ 50 → go home |
| Nausea | 0 | −10 | 120 | 180 |
| Happiness | 180 | see below | — | ≤ 60 → go home |

- Each need at or above **uncomfortable**: happiness −1 per 100 ticks. At or above **urgent**: −3 per 100 ticks instead.
- Cash at start: $40–$120.

**States**
`arriving → walking → queueing → riding → walking → buying → walking → leaving → gone`

**Decisions** (every 40 ticks while walking with no target, or on arrival at a target)
1. A need at or above **uncomfortable** → target the nearest reachable stall of that kind (hunger → food, thirst → drink, bladder → toilet).
2. Else → score every open, reachable ride and target the best score above 0.
3. Leave when: happiness ≤ 60, energy ≤ 50, cash below the cheapest open ride or stall price, or no ride has a score above 0 for 3 decisions in a row.

**Ride score**
| Term | Rule |
|---|---|
| Hard reject | Intensity > max intensity → thought "That looks too intense for me." |
| Hard reject | Price > ride value × 1.5 → thought "That ride costs too much." Ride value = excitement × $1.00. |
| Hard reject | Queue length ≥ 25 guests → thought "That queue is far too long." |
| Hard reject | Nausea ≥ 120 and ride nausea ≥ 2.0 |
| Excitement | + excitement × 0.6 |
| Tag fit | + tag fit × 1.5 |
| Boring | − (min intensity − intensity) × 0.8, only when intensity < min intensity |
| Price | − max(0, price − ride value) × 0.5 per dollar |
| Distance | − 0.02 per path tile |
| Repeat | − 1.5 per earlier ride on this ride |
| Noise | + uniform [−0.5, 0.5] |

**Queueing**
- Guests in a queue form a FIFO list. They stand on queue tiles in order, spaced 4 per tile.
- Happiness −1 per 100 ticks in the queue.
- A guest leaves the queue after 1,200 ticks (1 game day) of waiting. Thought: "I waited too long."

**Riding**
- Boarding: the guest pays the price. Ledger: ride tickets.
- After the ride: happiness + round(12 × excitement / 5 × (1 + max(0, tag fit) × 0.5)), capped at 255.
- Nausea + round(ride nausea × 15 × nausea gain multiplier).
- Energy −5.
- Intensity below min intensity: happiness gain halves. Thought: "That was a bit tame."
- Thoughts after a good ride (gain ≥ 15): "That was amazing!" Otherwise: "That was nice."

**Buying**
- Item value: food $3, drink $2, toilet $0.
- Price > value × 2 → no purchase, thought "Too expensive for a snack." (or "...for a drink.").
- Sale takes 20 ticks. Restrooms take 60 ticks.
- Effects come from catalog section 3.

**Thoughts**
- Each guest keeps the newest 5 thoughts with their tick.
- The same thought does not repeat within 2 game hours.
- Phase 1 list: "I am hungry." / "I am thirsty." / "I need a restroom." / "I am tired." / "I feel a bit sick." / "I am lost." / "That was amazing!" / "That was nice." / "That was a bit tame." / "That looks too intense for me." / "That ride costs too much." / "Too expensive for a snack." / "Too expensive for a drink." / "That queue is far too long." / "I waited too long." / "Time to go home." / "What a great park!" (happiness ≥ 220 on leaving).

**Leaving**
- The guest walks to the park entrance and despawns.
- The park stores the final happiness in a rolling list of the last 200 leavers (used by the rating).

### 4.4 Rides in operation
- **Cycle:** `waiting → loading → running → unloading → waiting`.
- Loading ends when the ride is full, or after 200 ticks with at least 1 rider.
- Running lasts the catalog cycle time. Unloading takes 40 ticks; riders leave through the exit gate.
- **Closed ride:** current riders finish; the queue empties; no new guests target it.
- **Open/close** is a command (`setRideOpen`).

### 4.5 Economy
- **Ledger:** one record per month. Categories: construction, demolition refunds, ride running costs, stall running costs, stock, entrance tickets, ride tickets, stall sales.
- **Running costs:** charged every game hour. Hourly charge = monthly cost / 72, rounded down to the cent. The last hour of the month charges the remainder, so each month total is exact.
- **Stock cost:** charged on each sale.
- **Negative cash:** allowed. Build commands are blocked while cash < cost. Phase 3 adds loans.
- **Prices:** set per ride, per stall, and for park entry. Range $0–$20 in $0.10 steps (entry: $0–$50 in $1 steps).
- **Finance panel:** this month and last month by category, and a 12-month profit bar chart.
- Invariant (tested): cash change over a month = sum of that month's ledger lines.

### 4.6 Park rating and arrival rate
- **Rating (0–1000)**, updated once per game hour:

| Term | Max points | Rule |
|---|---|---|
| Happiness | 400 | 400 × mean happiness of guests in the park and the last 200 leavers / 255. With no data: 200. |
| Rides | 200 | 200 × min(1, open rides / 6) |
| Variety | 100 | 100 × (distinct tags among open rides / 3) |
| Not lost | 150 | 150 × (1 − lost guests / guests in park). With no guests: 150. |
| Short queues | 150 | 150 × (1 − rides with queue ≥ 20 / open rides). With no open rides: 0. |

- The "with no data" values are documented formula choices, not missing-data fill-ins. They are shown in the rating tooltip.
- **Arrivals per game hour** = 4 × rating factor × ride factor × clock factor.
  - Rating factor = clamp(rating / 500, 0.2, 2.0).
  - Ride factor = 0 with no open rides; else min(1.5, 0.25 + open rides × 0.25).
  - Clock factor: 06–10 = 0.6, 10–18 = 1.0, 18–22 = 0.6, 22–06 = 0.1.
- The park must be open (`setParkOpen`) for arrivals.
- Fractional arrivals accumulate between hours.

### 4.7 Title screen and saves
- **Title screen:** logo with Frost and Spark, buttons New Park, Continue (autosave; hidden when none), Load, Import.
- **New Park:** park name field (1–32 characters), then the Phase 0 map with a new seed.
- **Saves:** master spec section 7. Schema version 1. 3 slots and 1 autosave. Export and import as `.tcsave.json`.
- **In-game menu:** Save, Load, Export, Import, Quit to title. Quit asks to confirm when the game has unsaved changes.

## 5. State and entity changes
- `GameState` adds: `rides`, `stalls`, `guests` (arrays sorted by id), `ledger` (array of monthly records), `park` fields (`entranceFee`, `open`, `rating`, `turnedAway`, `recentLeavers`), `network` (dirty flag; distance fields are derived and not saved).
- Derived data (distance fields, queue membership, sprite caches) rebuilds after load. It is never saved.
- Guest record: `{ id, x, y, progress, dir, state, targetId, cash, needs, temperament, thoughts, ridden: Record<rideId, count>, spent, items }`.

## 6. Commands added
`buildPath`, `buildPathLine`, `placeRide`, `placeStall`, `demolish`, `setRidePrice`, `setStallPrice`, `setEntranceFee`, `setRideOpen`, `setParkOpen`, `renamePark`.

## 7. UI
- **HUD:** cash, guest count, rating, Thrill/Chill balance bar (share of guests in each group), date and clock, speed buttons.
- **Toolbar:** Inspect, Footpath, Queue, Rides (opens a picker), Stalls (opens a picker), Demolish, Finance, Park, Menu.
- **Pickers:** cards with a sprite preview, name, tag colour (warm = thrill, cool = chill, green = family), excitement/intensity/nausea bars, cost.
- **Panels:** side panel on desktop, bottom sheet on phone (drag handle, 3 heights). One panel at a time.
  - Ride: status, open/close, price slider, stats, queue length, riders today, income this month, warnings.
  - Stall: price, sales, income, warnings.
  - Guest: needs bars, cash, temperament dial, thoughts, current target, "follow" button.
  - Park: name, open/close, entrance fee, rating with term breakdown, turned-away count.
  - Finance (4.5).
- **Inspect:** click or tap an object. Long-press (500 ms) also opens it on touch.
- **Overlay:** "Temperament" toggle tints guests from blue (Chill) to orange (Thrill).
- **Keyboard:** `Space` pause, `1`/`2`/`3` speeds, `P` footpath, `Q` queue, `R` rotate, `Delete` demolish tool, `Esc` cancel tool, `F` finance.
- **Toasts:** command blocks and warnings; 3 s; one at a time; newest replaces oldest.
- **Accessibility:** every control has a label. Ghost state uses an icon as well as a colour.

## 8. Tuning constants (`src/data/tuning.ts`, starting values)
All numbers in sections 4.1–4.6 are tuning constants with the values given there. Key ones:

| Name | Value |
|---|---|
| `GUEST_WALK_TICKS_PER_TILE` | 10 |
| `GUEST_DECISION_INTERVAL` | 40 ticks |
| `QUEUE_MAX_JOIN` | 25 guests |
| `QUEUE_MAX_WAIT` | 1,200 ticks |
| `LOAD_MAX_WAIT` | 200 ticks |
| `UNLOAD_TICKS` | 40 |
| `SALE_TICKS` / `RESTROOM_TICKS` | 20 / 60 |
| `BASE_ARRIVALS_PER_HOUR` | 4 |
| `START_CASH` | $15,000 |
| `START_ENTRANCE_FEE` | $10 |
| `PATH_COST` / `QUEUE_COST` | $10 / $12 per tile |
| `DEMOLISH_REFUND` | 50% |

## 9. Tests
**Unit**
- Commands: every block and warning string in 4.1; a failed command leaves the state hash unchanged.
- Network: queue ownership; queue tiles excluded from stall fields; tie-break order; rebuild time < 5 ms (bench).
- Guests: temperament distribution (mean 50 ± 2 over 10,000 guests); derived values table; needs rates; every hard reject; score ordering for a thrill guest vs. a chill guest on the same rides.
- Rides: cycle timing; loading rules; closing a ride empties the queue.
- Economy: hourly charges sum exactly to the monthly cost; ledger invariant.
- Rating: each term at its edge values.
- Saves: round-trip deep-equal; corrupt JSON, wrong format, missing field, wrong array length, and future version each give the right error and keep the current game.

**Integration** (scripted game, seed fixed)
- Build: path loop, 2 queues, Carousel, Swing Tower, Snack Shack, Fizz Stand, Restrooms; open the park.
- Run 3 game months at full speed in the test.
- Expect: > 300 guests arrived; every ride has riders; every stall has sales; no guest stuck in one state for > 2 game days; ledger invariant holds every month; average happiness of leavers ≥ 150.

**Determinism:** the integration script twice → equal state hash.

**Benchmark:** 2,000 guests on a dense path grid; tick < 3 ms on the CI runner (warning only on CI; hard limit locally documented).

**Smoke (Playwright)**
- Desktop: new park; build a 5-tile path with a drag; place a Carousel with a queue; open the park; run at 4× for 20 s; guest count > 0; save to slot 1; reload page; load slot 1; guest count matches.
- Phone: new park; tap-build a path; place a ride with tap + Confirm; open a guest panel with a long-press.

## 10. Done when
- Manual play-test: a new player builds a path, a queue, a ride, and a stall, and opens the park within 2 minutes without help text.
- Guests arrive, ride, buy, use restrooms, and leave. The finance panel explains every change in cash.
- Thrill and Chill guests visibly prefer different rides (checked in the integration test and in the overlay).
- Save, reload, export, and import keep the full state.
- All tests pass in CI. Performance budgets from the master spec are met, or the gap is documented.

## 11. Risks and open questions
| Risk | Mitigation |
|---|---|
| Guest crowds look like one blob on narrow paths. | Sub-tile lane offsets by guest id (4 lanes per tile). |
| Distance fields grow with many destinations. | `Uint16Array` per destination = 8 KB each on 64 × 64. 50 destinations = 400 KB. Acceptable for Build 1; Phase 4 revisits for 256 × 256. |
| Tuning makes the park too easy or too hard. | All values live in `data/`. A debug panel (dev builds only) shows live rates. |
