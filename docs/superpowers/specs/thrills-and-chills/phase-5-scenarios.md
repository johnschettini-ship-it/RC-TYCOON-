# Phase 5 — Scenarios and Progression

- **Build:** 2 ("The Wide World"). Save schema version 2 (defined by Phase 4; Phase 5 adds fields before Build 2 ships).
- **Status:** Draft for review.
- **Master spec:** `../2026-11-09-thrills-and-chills-design.md`. **Content numbers:** `content-catalog.md`.

---

## 1. Goal
The player chooses a goal-driven scenario, a free sandbox, or a guided tutorial. Each scenario has an original map, start conditions, goals, and a time limit. The game records the best result per scenario. Monthly awards reward good parks and punish bad ones.

## 2. Depends on
| Phase | What Phase 5 uses |
|---|---|
| 1 | Guests (temperament, happiness 0–255, thoughts), rides, stalls, ledger, park rating (0–1000, updated at every hour start, master R8), arrival rate. |
| 2 | Track rides with tested excitement and intensity. |
| 3 | Park value, loans (balance, max loan, interest), research (unlocked items, speed), weather (states, temperature), reliability, litter and mess counts. |
| 4 | Terrain heights and slope rules, water, land ownership states, elevated footpaths over water, scenery, Calm and Buzz fields, After Dark (on/off, lit tiles). |

**Interfaces Phase 5 needs from earlier phases** (each phase spec must expose them):
- Systems read difficulty multipliers from `GameState.modifiers` (master R7; Phase 5 sets them from section 4.8).
- Weather accepts a climate id (section 4.9).
- Thoughts are stored as ids, so the game can count them (for example `thought.tooExpensive`, `thought.lost`).
- `executeCommand(world, cmd, opts?: { setup?: boolean })` and `world.events` already exist (master 5.3). Setup mode skips cash checks and ledger lines. Phase 5 also skips research (unlock) checks in setup mode. All placement checks stay.

## 3. Scope
1. Scenario definition format and a seeded map generator.
2. 9 goal types with exact evaluation rules.
3. Win, lose, end screen, and "keep playing".
4. 8 original scenarios.
5. Sandbox mode with options.
6. Tutorial scenario guided by Frost and Spark.
7. Monthly awards (6 positive, 6 negative).
8. Difficulty presets: Relaxed, Standard, Tough.
9. Progress storage, separate from saves.
10. Title screen and scenario select.

---

## 4. Detailed design

### 4.1 Scenario definition format
Scenario definitions live in `src/data/scenarios/<id>.ts` as typed objects. They are JSON-compatible (no functions, no `undefined`).

```ts
type ScenarioDef = {
  id: string;                    // 'meadow_start'
  defVersion: number;            // bump when goals or map change
  nameKey: string;               // string table key (Phase 6); English name in data until then
  stars: 1 | 2 | 3 | 4 | 5;      // difficulty shown on the card
  map: MapGenSpec;
  start: {
    cash: number;                // cents
    loan: number;                // cents, current balance
    maxLoan: number;             // cents
    entranceFee: number;         // cents
    parkName: string;
  };
  research: {
    unlocked: string[] | 'all';  // defIds available at start, in addition to 'start' items
    allowed: string[] | 'all';   // defIds that can ever appear; others never show
  };
  climate: 'temperate' | 'cold' | 'hot' | 'coastal';
  afterDark: 'off' | 'on' | 'forced';   // 'on' = player may toggle; 'forced' = always on
  objectives: Objective[];       // all must be met at the same month end
  timeLimitMonths: number | null;
};

type MapGenSpec = {
  width: number; height: number; seed: number;
  baseHeight: number;                                // steps; 8 = master ground level (R2)
  noise: { amplitude: number; scale: number; octaves: number };
  waterLevel: number;                                // 0 = no sea or lakes from noise
  terrainRules: { minHeight?: number; maxHeight?: number; nearWater?: number; terrain: TerrainId }[];
  features: Feature[];                               // applied in list order
  park: { owned: Rect[]; forSale: Rect[]; rightsForSale: Rect[];   // owned → 1, forSale → 2, rightsForSale → 4; other tiles 0 (master 6.3)
          entrance: { x: number; y: number; side: 'N' | 'E' | 'S' | 'W' } };
};
```

**Feature kinds:**
| Kind | Fields | Effect |
|---|---|---|
| `raise` / `lower` | `rect` or `circle`, `by`, `falloff` (tiles) | Change height, with a linear falloff at the edge. |
| `flatten` | `rect`, `height` | Set every tile in the area to one height. |
| `cone` | `cx, cy, radius, peak, craterRadius` | Mountain or volcano. A crater lowers the centre by 4 steps. |
| `cliff` | `from, to, height` | Raise one side of a line by `height` with no falloff. |
| `lake` | `cx, cy, radius, surface` | Lower the bed and fill water to `surface`. |
| `river` | `points[], width, depth` | Carve a channel along the polyline and fill water. |
| `sea` | `edge, depthTiles, surface` | Water along one map edge. |
| `scatterScenery` | `rect, defIds[], density` | Place scenery on free tiles with the RNG. |
| `prebuilt` | `commands[]` | Run commands in setup mode. Paths, rides, stalls, scenery. |
| `rideCondition` | `rideIndex, ageMonths, reliability` | Set age and reliability of a prebuilt ride (index in creation order). |
| `litter` | `rect, density` | Add litter to footpaths (Fading Fairground). |
| `startGuests` | `count, happiness` | Spawn guests on random owned footpaths. |

### 4.2 Map generator
1. Fill `height` with `baseHeight`.
2. Add value noise: `height += round(amplitude × (2n − 1))`, where `n` is in [0, 1].
3. Apply `features` in list order.
4. **Slope pass:** clamp corners so that shared corners of neighbours differ by at most 1 step (Phase 4 slope rules). Repeat until no change (max 64 passes; fail generation if not stable).
5. Fill water below `waterLevel` and in lakes, rivers, and seas.
6. Set terrain types from `terrainRules` (first matching rule wins; default grass).
7. Set ownership from `park`. Place the entrance on an owned tile in the gap of the border. The border fence is derived from `owned` (master R3); nothing is placed for it.
8. Run `scatterScenery`, then `prebuilt`, `rideCondition`, `litter`, and `startGuests` in list order.
9. **Validate:** the entrance is reachable on land; owned buildable tiles ≥ 200; every prebuilt command succeeded. A failure is a build-time error (test fails), never a silent fix.

**Value noise:** integer lattice hash (`Math.imul`-based finalizer) of `(seed, ix, iy, octave)`, smoothstep interpolation, octave lacunarity 2, gain 0.5.
- **Determinism rule:** generation uses only `+ − × /`, `Math.floor`, `Math.round`, and `Math.imul`. It never uses `Math.sin`, `Math.cos`, `Math.pow`, or `Math.exp`, because their precision can differ between browsers.
- Generation of a 128 × 128 map takes < 300 ms on desktop and < 800 ms on a mid-range phone.

### 4.3 Goal types
- **Month index:** `monthIndex = floor(tick / 3600)`. Month 0 is March, Year 1.
- **Start tick:** every scenario, the sandbox, and the tutorial start at tick 450 (09:00, 1 March, Year 1; master R1) unless a scenario definition says otherwise.
- **Evaluation time:** all objectives are evaluated at **month end**, after the ledger closes the month and after awards (order in 4.6).
- **Samples:** the scenario system records a **day sample** at 12:00 and a **night sample** at 22:00 each day (3 per month each).
- **Daily rating:** the rating updates at every hour start (master R8). Goals and lose checks that say "daily rating" use the rating value stored with the day sample (12:00).

| Type | Fields | Met at a month end when … |
|---|---|---|
| `guestsInPark` | `count`, `minRating?` | Guests inside the park ≥ `count`, and current rating ≥ `minRating` (if set). |
| `parkRatingHeld` | `rating`, `months` | The streak of consecutive daily ratings ≥ `rating` is ≥ `months × 3` days. One day below resets the streak to 0. |
| `parkValue` | `value` | Park value (Phase 3) ≥ `value`. |
| `monthlyRideIncome` | `amount`, `months` | Ledger "ride tickets" ≥ `amount` in each of the last `months` closed months. |
| `monthlyProfit` | `amount`, `months` | Income − expenses (all ledger categories, loan interest included) ≥ `amount` in each of the last `months` closed months. |
| `coasterExcitement` | `count`, `minExcitement`, `maxIntensity?`, `types?` | At least `count` open track rides of `types` (default: all gravity-driven coaster types) have a completed test with excitement ≥ `minExcitement` and intensity ≤ `maxIntensity`. |
| `ridesOpen` | `count`, `tag?`, `flag?`, `defIds?` | Open rides (flat and track) that match every given filter ≥ `count`. |
| `repayLoan` | — | Loan balance = 0 and cash ≥ 0. |
| `temperamentBalance` | `minGuests`, `minShare`, `minHappiness`, `months` | For each of the last `months` months, the means of that month's day samples meet all of: guests ≥ `minGuests`; Thrill share (temperament ≥ 65, master R6) ≥ `minShare`; Chill share (temperament ≤ 35) ≥ `minShare`; mean happiness of each group ≥ `minHappiness`. |
| `afterDarkHappiness` | `minGuests`, `minHappiness`, `months` | After Dark is on, and for each of the last `months` months the means of the night samples meet guests ≥ `minGuests` and happiness ≥ `minHappiness`. |

- Shares are percentages 0–100. Happiness uses the 0–255 scale (170 ≈ 67%).
- Each objective keeps its own progress record (streaks, consecutive-month counters, last value) for the objectives panel.

### 4.4 Win, lose, and keep playing
- **Win:** all objectives are met at the same month end, and `monthIndex ≤ deadlineMonthIndex`. `deadlineMonthIndex = timeLimitMonths − 1`.
- **Lose conditions** (by difficulty, section 4.8):
  - **Time up:** the deadline month ends without a win.
  - **Bankrupt:** at a month end, cash < 0 and loan = max loan. The counter rises by 1; any other month end resets it. Lose at the preset limit.
  - **Rating collapse:** every daily rating < 200 for 6 consecutive days.
- On win or lose, the sim sets `status` and `endMonthIndex` and pushes a `scenarioEnded` event to `world.events` (master 5.3). The loop pauses on this event. Pausing is UI state, not sim state.
- **Stars:** 1 = complete; 2 = complete with ≥ 25% of the time limit left; 3 = complete with ≥ 50% left. No time limit → 3 stars on completion.
- **End screen:** result title, Frost and Spark art (happy or sad), date, guests, rating, park value, total profit, best coaster excitement, stars.
  - After a win: **Keep playing**, **Scenario select**, **Main menu**.
  - After a loss: **Try again** (regenerate the same scenario and difficulty), **Keep playing**, **Main menu**.
- **Keep playing** sends `scenarioContinue`. The status stays `won` or `lost`, objectives freeze, lose checks stop, and awards continue.
- Progress records a win once, at the end tick. A save loaded after the win does not record it again (`progressRecorded: true` in state).

### 4.5 Sandbox mode
| Option | Values | Default | Changeable in game |
|---|---|---|---|
| Map size | 64, 96, 128, 192, 256 | 96 | No |
| Terrain style | Flat, Rolling hills, Mountains, Islands, River valley | Rolling hills | No |
| Seed | integer; "random" button uses `crypto.getRandomValues` once at setup | random | No |
| Climate | temperate, cold, hot, coastal | temperate | No |
| After Dark | on, off | on | Yes |
| Unlimited money | on, off | on | Yes |
| All items unlocked | on, off | on | No |
| Guests arrive | on, off | on | Yes |
| Breakdowns | on, off | on | Yes |
| Weather | normal, always sunny | normal | Yes |
| Awards | on, off | on | Yes |

- Map sizes 192 and 256 show a warning: "Large maps can run slowly on phones".
- **Unlimited money:** affordability checks always pass and cash does not fall. The ledger still records every amount, so the finance panel stays correct. The HUD shows `∞`.
- Sandbox has no objectives and no lose conditions. All land in the map is owned except a 2-tile border.

**Terrain style presets:**
| Style | Noise amp / scale / octaves | Water level | Features |
|---|---|---|---|
| Flat | 0 / — / — | 0 | none |
| Rolling hills | 4 / 24 / 3 | 0 | 2 random lakes |
| Mountains | 14 / 32 / 4 | 0 | 2 random cones |
| Islands | 6 / 20 / 3 | 3 | sea on all 4 edges |
| River valley | 6 / 28 / 3 | 0 | 1 river across the map |

### 4.6 Month-end order
See master R13. In `tick.ts`, the month-end pipeline runs at the first tick of each month, before weather: (1) ledger closes the previous month (Phase 1), (2) Phase 3 monthly tasks such as loan interest, (3) awards (4.10), (4) objectives (4.3), (5) lose checks (4.4), (6) reset monthly metrics, (7) `monthEnded` event.

### 4.7 The 8 scenarios
All maps and names are original. The deadline is the end of the named month.

| # | Scenario | Stars | Map | Start | Goals | Deadline |
|---|---|---|---|---|---|---|
| 1 | **Meadow Start** | ★ | 64 × 64 gentle grass (amp 2). Round pond (r 4) in the north-east. Owned 40 × 40 at the south centre; 12-tile strip east for sale. Entrance mid-south. Temperate. After Dark off. | Cash $20,000, loan $0, max $20,000. Prebuilt 5-tile plaza path. Bumper Cars and Spiral Slide unlocked. | `guestsInPark` 250 with `minRating` 500 | Feb Y2 (12 months) |
| 2 | **Sandy Shores** | ★★ | 96 × 48 beach. Sea on the east edge (depth 10). Low dunes (amp 3). Sand within 8 tiles of water. Owned 56 × 40; prebuilt boardwalk footpath along the beach. Hot. After Dark on. | Cash $22,000, loan $5,000, max $30,000. Ice Cream Cart unlocked. | `temperamentBalance` 400 guests, share 30, happiness 170, 2 months; `monthlyProfit` $5,000 × 1 | Aug Y2 (18 months) |
| 3 | **Frostbite Falls** | ★★ | 64 × 64. 8-step cliff across the north. A waterfall river runs from the cliff to the south-west edge. Snow above height 6. Owned 44 × 36 on both banks; a prebuilt bridge crosses the river. Cold. After Dark off. | Cash $18,000, loan $10,000, max $30,000. Cocoa Hut unlocked. | `guestsInPark` 400; `monthlyRideIncome` $4,000 × 1 | Feb Y3 (24 months) |
| 4 | **Volcano Ridge** | ★★★ | 80 × 80. Central cone (r 22, peak 30, crater r 4) with a crater lake. Rock above height 18. Owned 50 × 50 on the south slope. Volcano Ridge scenery scattered. Temperate. After Dark on. | Cash $25,000, loan $10,000, max $40,000. Drop Tower unlocked. | `coasterExcitement` 2 coasters ≥ 6.50, intensity ≤ 8.50; `guestsInPark` 500 | Feb Y3 (24 months) |
| 5 | **Spooky Hollow** | ★★★ | 64 × 64 wooded valley (amp 5). Dense bare trees (removable, normal demolish cost). A creek runs north to south. Owned 48 × 48. Temperate. After Dark **forced**. | Cash $20,000, loan $0, max $30,000. Haunted Manor and Ghost Train unlocked. | `ridesOpen` 3 with `flag: spooky`; `afterDarkHappiness` 300 guests, happiness 180, 1 month | Feb Y3 (24 months) |
| 6 | **Harbor Lights** | ★★★ | 96 × 64 coast. Sea on the south (surface 4). A harbour basin and a headland with a lighthouse scenery piece. Two prebuilt piers (elevated footpaths). Owned 70 × 40. Coastal. After Dark **forced**. | Cash $25,000, loan $0, max $50,000. Log Flume unlocked. | `guestsInPark` 600; `afterDarkHappiness` 200 guests, happiness 170, 1 month; `parkValue` $120,000 | Aug Y3 (30 months) |
| 7 | **Fading Fairground** | ★★★★ | 64 × 64 flat. A run-down park: 6 prebuilt flat rides aged 96 months at 45% reliability, paths with litter (density 0.3), 4 broken benches, 120 start guests at happiness 90. Owned 48 × 48. Temperate. After Dark off. | Cash $2,000, loan $30,000, max $35,000, rating starts from park state. | `repayLoan`; `parkRatingHeld` 650 for 3 months | Feb Y3 (24 months) |
| 8 | **Sky High** | ★★★★★ | 64 × 64. A mesa: plateau 20 × 20 at height 20 with cliffs on all sides. Owned = plateau only. Construction rights for sale on the land around it. Hot. After Dark on. | Cash $30,000, loan $0, max $60,000. | `guestsInPark` 500; `coasterExcitement` 1 coaster ≥ 7.00; `parkValue` $150,000 | Feb Y4 (36 months) |

- **Unlocks:** scenarios 1–3 are open at start. Scenarios 4–6 open after any 2 wins. Scenario 7 opens after 4 wins. Scenario 8 opens after 6 wins. The tutorial and sandbox are always open. The "Unlock all scenarios" setting removes all locks.
- Each scenario has a fixed seed. A golden-hash test pins its generated map.
- **Winnability:** each scenario passes a manual play-test on Standard before Build 2 ships. The play-test log records the win date.

### 4.8 Difficulty presets
The player picks a preset on the scenario detail sheet. It is stored in `state.scenario.difficulty` and cannot change during play.

| Setting | Relaxed | Standard | Tough |
|---|---|---|---|
| Start cash | ×1.5 | ×1.0 | ×0.75 |
| Max loan | ×1.5 | ×1.0 | ×0.75 |
| Loan interest rate | ×0.5 | ×1.0 | ×1.5 |
| Guest price tolerance | ×1.2 | ×1.0 | ×0.85 |
| Guest happiness decay | ×0.8 | ×1.0 | ×1.2 |
| Guest arrival rate | ×1.2 | ×1.0 | ×0.9 |
| Research speed | ×1.5 | ×1.0 | ×0.75 |
| Breakdown chance | ×0.6 | ×1.0 | ×1.3 |
| Time limit | Win after the deadline is allowed (1 star) | Lose at the deadline | Lose at the deadline |
| Bankrupt lose | Off | 3 month ends | 2 month ends |
| Rating collapse lose | Off | Off | On |

Goals are the same on every preset. Progress stores results per preset.

### 4.9 Climates
Climate changes Phase 3 weather weights and temperature per season.

| Climate | Temp offset (W/Sp/Su/Au) | Rain weight | Sun weight |
|---|---|---|---|
| temperate | 0 / 0 / 0 / 0 °C | ×1.0 | ×1.0 |
| cold | −10 / −6 / −3 / −6 °C | ×1.2 | ×0.8 |
| hot | +6 / +8 / +10 / +8 °C | ×0.5 | ×1.5 |
| coastal | +2 / 0 / −1 / +2 °C | ×1.4 | ×0.9 |

### 4.10 Monthly awards
At each month end, every award checks the month's metrics. Awards need mean day-sample guests ≥ 100 (positive) or ≥ 50 (negative).

| Award | Kind | Criterion (this month) |
|---|---|---|
| Spotless Park | + | Mean litter + mess per footpath tile ≤ 0.02 |
| Best Value | + | Rating ≥ 600 and mean price paid per ride ≤ $2.50 |
| Thrill Seekers' Choice | + | ≥ 3 open thrill rides with excitement ≥ 6.00, and Thrill-group happiness ≥ 180 |
| Chill Haven | + | Mean footpath Calm ≥ 3 and Chill-group happiness ≥ 180 |
| Perfect Balance | + | Thrill and Chill shares both ≥ 35%, and both group happiness ≥ 170 |
| Night Owls' Favourite | + | After Dark on, ≥ 90% of footpath tiles lit, night-sample happiness ≥ 170 |
| Litterbug Park | − | Mean litter + mess per footpath tile ≥ 0.15 |
| Rip-off Park | − | ≥ 15% of guests had `thought.tooExpensive` |
| Queue Nightmare | − | Mean queue wait ≥ 90 s (1,800 ticks) |
| Breakdown Central | − | ≥ 25% of rides broke down at least once |
| Lost and Confused | − | ≥ 10% of guests had `thought.lost` |
| Dark and Dreary | − | After Dark on and < 40% of footpath tiles lit |

- **Effect:** each award is active for the next month. Positive: arrivals ×1.10 and rating +20. Negative: arrivals ×0.90 and rating −20.
- Totals are clamped: arrival factor 0.70–1.30, rating modifier −60 to +60. The park rating (Phase 3 formula, master R8) and the Phase 1 arrival formula add these terms.
- A toast and the park panel announce each award. Award history is kept for the whole game.

### 4.11 Tutorial
- Map: 48 × 48 flat meadow, all owned. Cash $30,000. No time limit, no lose conditions, no awards. After Dark off.
- Frost (Chill side) and Spark (Thrill side) speak in a bubble near the HUD. A ring highlights the target element (`data-tutorial-target` attribute).
- Text adapts to the last pointer type: "tap" for touch, "click" for mouse.
- **Checks:** `sim` checks run after every successful command and every game hour. `ui` checks (camera, panels) come from the UI as a `tutorialAdvance` command.

| # | Guide | Step | Completion check |
|---|---|---|---|
| 1 | Both | Welcome to Thrills & Chills | `ui`: Next pressed |
| 2 | Frost | Move the view | `ui`: camera moved ≥ 4 tiles |
| 3 | Frost | Zoom in and out | `ui`: zoom changed by ≥ 0.25 |
| 4 | Spark | Build a footpath from the entrance | `sim`: ≥ 6 footpath tiles connected to the entrance |
| 5 | Frost | Place a Carousel | `sim`: a Carousel exists |
| 6 | Frost | Connect it: queue to the entrance, footpath from the exit | `sim`: Carousel has no connection warnings |
| 7 | Spark | Open the ride | `sim`: Carousel open |
| 8 | Frost | Add a Snack Shack, a Fizz Stand, and Restrooms facing a path | `sim`: one of each, each reachable |
| 9 | Spark | Open the park | `sim`: park open |
| 10 | Both | Inspect a guest. Meet Thrill and Chill guests | `ui`: guest panel opened |
| 11 | Spark | Build a Swing Tower for Thrill guests | `sim`: Swing Tower open and connected |
| 12 | Frost | Change a price | `sim`: any price changed |
| 13 | Spark | Build a Junior Coaster and run a test | `sim`: a Junior Coaster has a completed test |
| 14 | Frost | Hire a Groundskeeper | `sim`: ≥ 1 Groundskeeper |
| 15 | Both | Open the finance panel | `ui`: finance panel opened |
| 16 | Both | Reach 100 guests | `sim`: guests in park ≥ 100 |

- **Skip step** marks the step done. **Skip tutorial** ends the tutorial; the park continues as free play.
- Finishing step 16 sets `tutorialDone` in progress storage.

### 4.12 Progress storage
- Key: `tc.progress`. Separate from saves; a save never contains progress.
```json
{ "format": "thrills-and-chills-progress", "version": 1,
  "scenarios": { "meadow_start": { "defVersion": 1,
      "best": { "standard": { "stars": 2, "endMonthIndex": 7, "parkValue": 9120000,
                              "rating": 640, "guests": 312, "completedAt": "2027-01-03T10:00:00Z" } } } },
  "tutorialDone": true }
```
- **Merge rule:** keep the result with more stars; on a tie, the earlier `endMonthIndex`.
- **Validation on read:** JSON parses; `format` matches; `version` known; every record has every field with the right type.
  - Newer `version` → error "Your progress comes from a newer version of the game". The game does not write progress until the player acts.
  - Any other failure → error "Your scenario progress could not be read" with **Export raw data** and **Reset progress** (confirm dialog).
  - Until the player resets, only the start-open scenarios are open, and nothing is written. **Never** fill in missing records.
- A record with an older `defVersion` stays and shows the tag "earlier version".

### 4.13 Title screen and scenario select
- **Title:** logo with Frost and Spark; buttons **Continue** (newest save or autosave), **New game**, **Load**, **Settings**, **Credits**.
- **New game:** **Tutorial**, **Scenarios**, **Sandbox**.
- **Scenario select:** a card grid. Each card shows name, stars, climate icon, After Dark icon, lock state, and best stars per preset.
- **Detail sheet:** description, goals, deadline, start conditions, preset picker, **Start**. Desktop: side panel. Phone: bottom sheet.
- **Sandbox setup:** the options from 4.5, then **Start**.

---

## 5. State and entity changes
```ts
type ScenarioState =
  | { kind: 'freePlay'; awards: AwardState }
  | { kind: 'sandbox'; options: SandboxOptions; awards: AwardState }
  | { kind: 'tutorial'; stepIndex: number; skipped: boolean; done: boolean }
  | { kind: 'scenario'; id: string; defVersion: number; difficulty: 'relaxed' | 'standard' | 'tough';
      status: 'active' | 'won' | 'lost'; endReason?: 'timeUp' | 'bankrupt' | 'ratingCollapse';
      endMonthIndex?: number; continued: boolean; progressRecorded: boolean;
      deadlineMonthIndex: number | null; objectives: ObjectiveProgress[];
      loseCounters: { bankruptMonths: number; lowRatingDays: number }; awards: AwardState };
// Shared: state.modifiers (difficulty multipliers, master R7), state.monthMetrics (samples and counters).
```
- **Migration 1 → 2** (owned by Phase 4) sets `scenario = { kind: 'freePlay', awards: empty }` for Build 1 saves. This is a documented rule: Build 1 had no scenarios.
- `monthMetrics` holds day and night samples and counters (distinct guests with each tracked thought, queue wait sum and count, rides with a breakdown). It resets after the month-end steps.

## 6. Commands added
| Command | Valid when | Effect |
|---|---|---|
| `scenarioContinue` | scenario status `won` or `lost` | Sets `continued: true`. |
| `tutorialAdvance { stepId }` | tutorial active and the step has a `ui` check | Marks the step done. |
| `tutorialSkipStep` | tutorial active | Marks the current step done. |
| `tutorialSkipAll` | tutorial active | Ends the tutorial. |
| `setSandboxOption { key, value }` | sandbox, key changeable in game | Changes the option. |

New game, restart, and scenario select build a new `GameState`. They are not commands.

## 7. UI
- **Objectives panel** (HUD flag icon): each goal with a progress bar, current value, target, and streak; deadline as "8 months left".
- **Award toasts** at month end, with the mascot that fits (Frost for Chill awards, Spark for Thrill awards).
- **End screen:** modal on desktop; full-screen sheet on phone.
- **Touch:** cards and buttons ≥ 44 × 44 px; detail and sandbox setup as bottom sheets; tutorial bubbles never cover the highlighted target (they move to the opposite half of the screen).

## 8. Tuning constants
| Constant | Value |
|---|---|
| Samples per day | 2 (12:00 day, 22:00 night) |
| Days per month (from master) | 3 |
| Thrill / Chill thresholds | ≥ 65 / ≤ 35 (master R6) |
| Award guest minimum (+ / −) | 100 / 50 |
| Award effect (+ / −) | arrivals ×1.10 / ×0.90; rating +20 / −20 |
| Award clamps | arrivals 0.70–1.30; rating −60 to +60 |
| Rating collapse | < 200 for 6 consecutive days |
| Star thresholds | 25% / 50% of time left |
| Unlock thresholds | 2 wins → 4–6; 4 wins → 7; 6 wins → 8 |
| Max slope passes | 64 |

## 9. Tests
- **Unit:** noise determinism; golden map hashes for 8 scenarios and the tutorial; slope legality after generation; every goal type at pass, fail, and boundary; streak reset; each award criterion; difficulty multipliers reach Phase 1 and 3 systems; climate modifiers; progress validation (bad JSON, wrong format, future version, missing field, wrong type) → error and no write; merge rule.
- **Integration:** scripted Meadow Start win → `won` at the expected month with the right stars; time-up loss on Standard; late win on Relaxed gives 1 star; Tough bankrupt loss after 2 month ends; keep playing after a win; save and load mid-scenario keep streaks and counters; win recorded once after reload; tutorial script finishes all 16 steps; Build 1 fixture save migrates to `freePlay`.
- **Playwright desktop:** title → Scenarios → Meadow Start → Standard → objectives panel visible → save → reload → same progress; tutorial steps 1–4 with mouse.
- **Playwright phone:** title → Tutorial → steps 2–4 with touch pan, pinch, and tap; Skip tutorial works; scenario detail opens as a bottom sheet.

## 10. Done when
- [ ] All 8 scenarios, the tutorial, and sandbox start from the title screen on desktop and phone.
- [ ] Every goal type and award passes its unit tests.
- [ ] Each scenario has a recorded manual win on Standard.
- [ ] Progress survives reload; corrupt progress shows an error and never resets without the player.
- [ ] Map generation meets the time budget on the reference phone profile.
- [ ] CI is green.

## 11. Risks and open questions
| Risk | Mitigation |
|---|---|
| Scenario balance (too easy or impossible) | Manual win log per scenario; goals in data for quick tuning. |
| Phases 1–4 lack an interface listed in section 2 | Each phase spec review checks that list. |
| Tutorial breaks when UI changes | Targets use `data-tutorial-target`; the Playwright tutorial test runs in CI. |
| Players lose progress when they clear browser data | Settings (Phase 6) offers progress export and import. |
| Large sandbox maps on phones | Warning text; Phase 6 performance work. |

**Open question for the owner:** are the unlock thresholds right, or do you want all scenarios open from the start?
