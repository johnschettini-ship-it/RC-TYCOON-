# Thrills & Chills — Master Design Spec

- **Date:** 2026-11-09 (revision 2: expanded universe, all phases build-ready)
- **Status:** Draft for review
- **This file:** intent, game identity, build plan, architecture, shared rules.
- **Other spec files** (folder `docs/superpowers/specs/thrills-and-chills/`):

| File | Content |
|---|---|
| [`content-catalog.md`](thrills-and-chills/content-catalog.md) | Every ride, stall, facility, staff type, scenery theme, and mascot, with stats and the phase that adds it. Single source of truth for content numbers. |
| [`phase-0-foundation.md`](thrills-and-chills/phase-0-foundation.md) | Scaffold, loop, isometric map, camera, input, HUD shell, CI, deploy. |
| [`phase-1-first-playable.md`](thrills-and-chills/phase-1-first-playable.md) | Paths, flat rides, stalls, guests with temperament and needs, economy, rating, saves. |
| [`phase-2-coasters.md`](thrills-and-chills/phase-2-coasters.md) | Track system, track builder, train physics, test runs, ratings. |
| [`phase-3-management.md`](thrills-and-chills/phase-3-management.md) | Staff, litter, breakdowns, research, marketing, loans, weather, park value. |
| [`phase-4-land-scenery-after-dark.md`](thrills-and-chills/phase-4-land-scenery-after-dark.md) | Terrain, water, land purchase, scenery themes, Calm and Buzz, After Dark night mode, view rotation. |
| [`phase-5-scenarios.md`](thrills-and-chills/phase-5-scenarios.md) | Scenario system, 8 original scenarios, sandbox, tutorial, awards, difficulty. |
| [`phase-6-polish.md`](thrills-and-chills/phase-6-polish.md) | Generated audio, After Dark shows, extra content, performance, accessibility, localization. |

---

## 1. Intent

### 1.1 What the owner said
- Build an amusement-park management game in the tycoon genre.
- The repository is a public fan project.
- Visual style: 2D isometric. Engine: custom TypeScript + Vite + Canvas 2D.
- Desktop and touch devices are equal targets.
- Title: **Thrills & Chills**.
- Plan the full game ("universe") in phases. Expand the universe. Make the first build big.

### 1.2 Assumptions (not stated by the owner)
- Success means a free, playable browser game hosted on GitHub Pages.
- Single player only. No server, no accounts, no monetization.
- English only until Phase 6.

### 1.3 Originality rules (hard constraints)
- The game is original. It uses genre mechanics only.
- No names, art, music, sounds, characters, scenarios, maps, UI layout, or data files from any existing game.
- All graphics are drawn in code. All audio is generated in code.
- The README states that the project is an original fan-made game with no affiliation to any company.

---

## 2. The universe

### 2.1 The idea behind the title
Every park has two sides:
- **Thrills:** speed, height, drops, spins. Loud, bright, warm colours.
- **Chills:** calm gardens, gentle rides, cool water, and spooky fun after dark. Quiet, cool colours.

A good park serves both kinds of guests. This idea drives three signature mechanics.

### 2.2 Signature mechanics
| Mechanic | Summary | Phase |
|---|---|---|
| **Temperament** | Each guest has a temperament from 0 (pure Chill) to 100 (pure Thrill). It sets intensity tolerance, favourite ride tags, how fast they get tired, and what makes them happy. The park shows its guest mix as a Thrill/Chill balance bar. | 1 |
| **Calm and Buzz** | Scenery, gardens, water, and benches give paths a **Calm** value. Thrill rides give nearby paths a **Buzz** value. Chill guests recover energy and lose nausea faster in Calm areas. Thrill guests get excited by Buzz and walk faster toward thrill rides. Two map overlays show both values. | 4 |
| **After Dark** | A day/night cycle. At night, unlit paths make guests unhappy, lamps and lit rides matter, and spooky rides get a popularity bonus. Phase 6 adds night shows. Each park can turn After Dark on or off. | 4 (shows: 6) |

### 2.3 Mascots
- **Frost** — a friendly yeti. The face of the Chill side.
- **Spark** — a cheerful fire fox. The face of the Thrill side.
- Both appear in the logo, the title screen, the tutorial, toasts, and as Performer costumes (Phase 3).
- A third Performer costume, **Boo** (a small ghost), is for spooky areas.

### 2.4 Themed lands (scenery themes, Phase 4)
Classic Fair, Frost Peaks, Volcano Ridge, Spooky Hollow, Jungle Lagoon, Starport. Details in the catalog.

### 2.5 Art direction
- Flat colours, chunky shapes, clear silhouettes. Readable at 0.5× zoom.
- Thrill items use warm hues (red, orange, yellow). Chill items use cool hues (blue, teal, violet).
- Guests are small figures (about 10 × 16 px at 1× zoom) with a shirt colour from a guest palette and a thin temperament ring when the overlay is on.
- UI: rounded panels, large icons, short labels. Every icon has a text label or tooltip.
- Every drawing function is deterministic: same inputs give the same pixels.

### 2.6 Tone
- Family-friendly. No crashes, no injuries, no guest deaths anywhere in the game.
- Failures are breakdowns, stalled trains, closed rides, and unhappy guests.
- Guest thoughts are short, kind, and funny. They never mock real groups of people.

---

## 3. Build plan

The 7 phases group into 3 builds. A build is a public release to GitHub Pages.

| Build | Phases | Player gets | Status |
|---|---|---|---|
| **Build 1 — "The Big Build"** (recommended) | 0, 1, 2, 3 | The complete core tycoon game on one flat 64 × 64 map: paths, 14 flat rides, 7 track ride types, 11 stalls and facilities, temperament, coasters with physics and ratings, staff, litter, breakdowns, research, marketing, loans, weather, park value, saves. | Proposed |
| Build 2 — "The Wide World" | 4, 5 | Terrain, water rides, land purchase, 6 scenery themes, Calm and Buzz, After Dark, 8 scenarios, sandbox, tutorial, awards. | Proposed |
| Build 3 — "Lights and Sound" | 6 | Audio, night shows, extra content, performance work, accessibility, localization. | Proposed |

- Each phase still ends with its own "done when" checks and green CI. Phases inside a build merge to `main` behind no flags; the build is released when its last phase is done.
- Work inside a build may overlap only where the phase specs say so.

---

## 4. Engine and tooling

| Item | Choice | Reason |
|---|---|---|
| Language | TypeScript, `strict: true` | Type safety for a large simulation. |
| Build | Vite | Standard, fast, static output for GitHub Pages. |
| Rendering | Canvas 2D | No runtime dependencies. Full control. |
| Unit tests | Vitest | Same config as Vite. Runs the simulation without a browser. |
| Browser tests | Playwright (`@playwright/test`) | Smoke tests on a desktop viewport and a phone viewport. |
| CI | GitHub Actions | Typecheck, unit tests, build, smoke tests. |
| Hosting | GitHub Pages via Actions | Free static hosting. |
| Runtime dependencies | **None** | Any new runtime dependency needs a written reason in its PR. |

**Upgrade path:** All drawing goes through one `Renderer` interface. If profiling shows that Canvas 2D is too slow, a PixiJS renderer can replace it without changes to the simulation (Phase 6 decision).

---

## 5. Architecture

### 5.1 Module layout (all phases)
```
src/
  main.ts              Boot: title screen, new game / load, start loop.
  loop.ts              Fixed-step loop: simulation ticks + render frames.
  sim/                 Pure simulation. No DOM, no Canvas, no Date.now(), no Math.random().
    state.ts           GameState type and factory.
    rng.ts             Seeded RNG (mulberry32). State lives in GameState.
    time.ts            Ticks → clock, day, month, year, season.
    map.ts             Tile grid (typed arrays), heights, slopes.
    commands.ts        Player actions: validate, apply, return result.
    pathing.ts         Walkable network and distance fields.
    guests/            Spawn, temperament, needs, decisions, movement, thoughts.
    rides/             Flat ride cycle, queues; track/ (Phase 2).
    stalls.ts          Sales, stock cost, facilities.
    staff/             Phase 3.
    economy.ts         Ledger, prices, loans, park value.
    research.ts        Phase 3.
    weather.ts         Phase 3.
    fields.ts          Calm and Buzz fields (Phase 4).
    scenario.ts        Goals and awards (Phase 5).
    rating.ts          Park rating and arrival rate.
    tick.ts            One tick: calls each system in a fixed order.
  data/                Content definitions and tuning constants (from the catalog).
  render/              Reads GameState. Never writes it.
    iso.ts             Tile ↔ screen math, height-aware.
    camera.ts          Pan, zoom, bounds, rotation (Phase 4).
    sprites/           Procedural drawing + sprite cache.
    terrainCache.ts    Static tiles pre-drawn into 16 × 16-tile chunk images.
    renderer.ts        Frame: terrain, depth-sorted objects, ghosts, overlays, lighting.
  input/               Pointer Events (mouse, touch, pen) + keyboard → tool actions.
  ui/                  HTML/CSS layer: HUD, toolbar, panels, dialogs, toasts.
  audio/               Phase 6.
  save/                Serialize, validate, migrate, store.
tests/
  unit/  integration/  e2e/
```

### 5.2 Rules between modules
- `sim/` imports only `sim/` and `data/`. A test scans imports and fails on a violation.
- `render/`, `input/`, `ui/`, and `audio/` read `GameState`. They change it only through `sim/commands.ts`.
- `ui/` and `input/` share a small `ToolState` object (active tool, ghost, rotation, drag). They do not call each other's internals.

### 5.3 Commands
- Every player action is a command object, for example `{ type: 'buildPath', x, y, kind: 'footpath' }`.
- `executeCommand(state, cmd)` returns `{ ok: true, cost, warnings }` or `{ ok: false, reason }`.
- A failed command changes nothing. The UI shows `reason` in a toast.
- Commands are the only way to change the world from outside `sim/`.
- Signature: `executeCommand(world, cmd, opts?: { setup?: boolean })`. Setup mode skips cash checks and ledger lines. Only scenario setup (Phase 5) and tests use it.
- **Events:** systems push `SimEvent` objects to `world.events`. The client drains the list once per frame for toasts, messages, sounds, and autosave.

### 5.4 Determinism
- The same start state plus the same commands at the same ticks give the same end state.
- The simulation uses only the seeded RNG in `GameState.rng`.
- Systems iterate entities in ascending id order.
- A test runs a scripted game twice and compares state hashes.

### 5.5 Game loop
- Fixed step: **20 ticks per second** at 1× speed. Speeds: paused, 1×, 2×, 4×.
- At most 10 ticks per frame. If the device cannot keep up, game time slows. Ticks are never skipped.
- Rendering uses `requestAnimationFrame` and interpolates moving objects between the last two ticks.
- The loop pauses when `document.hidden` is true.

---

## 6. Core models

### 6.1 Units
| Quantity | Unit |
|---|---|
| Time | tick (1 s at 1× = 20 ticks) |
| Money | integer cents. Display as dollars. |
| Horizontal distance | tile = 4 m |
| Vertical distance | height step = 1 m |
| Ratings (excitement, intensity, nausea) | 0.00–10.00, stored as integer hundredths |
| Needs | 0–255 integers |
| Temperament | 0–100 integer |

### 6.2 Time model
- **1 game hour = 50 ticks.** **1 day = 24 hours = 1,200 ticks** (60 s at 1×).
- **1 month = 3 days = 3,600 ticks** (3 min at 1×, 45 s at 4×).
- **1 year = 12 months.** Seasons: winter = Dec–Feb, spring = Mar–May, summer = Jun–Aug, autumn = Sep–Nov.
- The HUD shows month, year, and clock, for example `Mar · Year 1 · 14:30`. Day numbers are not shown.
- **Tick 0 is 00:00 on 1 March, Year 1.** A new game starts at tick 450 (09:00).
- Formulas: `hour = floor(tick / 50) mod 24`, `dayIndex = floor(tick / 1200)`, `monthIndex = floor(tick / 3600)` (0 = March, Year 1), `year = floor(monthIndex / 12) + 1`.
- Guests arrive more in the day than at night (arrival curve in Phase 1). The park is open 24 hours. Guests do not leave at a closing time.
- All values live in `data/tuning.ts`.

### 6.3 Map
- Size: 64 × 64 in Build 1. Up to 256 × 256 from Phase 4.
- Struct-of-arrays, index `i = y × width + x`:
  - `terrain: Uint8Array` — grass, sand, dirt, rock, snow. A tile under water keeps its terrain type and is drawn as a bed.
  - `height: Uint8Array` — base height in steps (0–63). **Ground level is 8** on new maps, so players can dig lakes later.
  - `slope: Uint8Array` — 4-bit mask of raised corners (N, E, S, W). Flat = 0.
  - `water: Uint8Array` — water surface height, 0 = none.
  - `content: Uint8Array` — empty, footpath, queue, building, track, parkEntrance, scenery. There is no fence value: the renderer draws the park fence on every edge between an owned tile and a tile that is not owned.
  - `contentRef: Int32Array` — entity id, or −1.
  - `owned: Uint8Array` — 0 not owned, 1 owned, 2 land for sale, 3 construction rights owned, 4 construction rights for sale.
  - Phase 3 adds `pathItem`, `pathItemFlags`, `binFill`, `litter`, `mess` (all `Uint8Array`; see Phase 3 §5).
- Build 1 keeps all ground at height 8 and all slopes flat. The renderer, picking, and pathing are height-aware from Phase 0, so Phase 4 adds editing without a rewrite.
- Above-ground objects (track pieces, elevated paths) use their own height ranges and a per-tile **occupancy list** for clearance checks.

### 6.4 Isometric projection
- Tile at zoom 1: 64 × 32 px diamond. Height step: 8 px (1 m).
- Tile (x, y, z) → screen: `sx = (x − y) × 32`, `sy = (x + y) × 16 − z × 8`.
- Screen → tile: test tiles front-to-back along the screen column and pick the first whose drawn top face contains the point. On a flat map this equals the inverse formula.
- Depth order: by `(x + y)`, then base `z`, then layer (ground, path, object, guest, overlay). Multi-tile objects split into per-tile slices for correct sorting.
- View rotation (Phase 4) rotates map coordinates before projection.

### 6.5 Entities
| Entity | Phase | Key fields |
|---|---|---|
| `Ride` (flat) | 1 | id, defId, x, y, rotation, gates, price, status, cycle, riders, queue, stats, totals, age, reliability (Phase 3). |
| `TrackRide` | 2 | Ride fields + track pieces, stations, trains, test results. |
| `Stall` | 1 | id, defId, x, y, rotation, service side, price, totals. |
| `Guest` | 1 | id, position, state, target, cash, needs, temperament, thoughts (ids, not text), items (map, umbrella, balloon), history. |
| `Staff` | 3 | id, type, position, state, patrol area, wage, costume. |
| Path items, litter, mess | 3 | Per-tile map arrays, not entities (Phase 3 §5). |
| `Scenery` | 4 | id, defId, tile, height, rotation. |
| `Park` | 1 | name, entrance fee, open, rating, cash, loan, value, research, weather, scenario. |

- Ids come from `GameState.nextId` and never repeat.
- A test checks that every `contentRef` and every entity reference points to a live entity.

---

## 7. Saves and versions
- **Format:** JSON. Typed arrays as base64 strings.
- **Envelope:** `{ "format": "thrills-and-chills-save", "schemaVersion": N, "gameVersion": "x.y.z", "savedAt": "<ISO date>", "state": { ... } }`.
- **Versioning rule:** each public build has one schema version (Build 1 = 1, Build 2 = 2, Build 3 = 3). Migrations are required from every earlier public schema version. Formats inside an unreleased build may change without migrations.
- **Validation:** format, version, required fields, array lengths, and reference integrity.
  - Newer version → error: "This save comes from a newer version of the game."
  - Older version → run migrations in order.
  - Any failed check → show the error and keep the current game. **Never** load a partial state or fill in defaults for missing data.
- **Storage:** 3 manual slots (`tc.save.1`–`tc.save.3`) and 1 autosave (`tc.save.auto`) in `localStorage`, plus file export and import (`.tcsave.json`). Autosave runs at the start of each game month. If `localStorage` fails, show an error and offer file export.

---

## 8. Testing strategy (all phases)
| Layer | Tool | What |
|---|---|---|
| Unit | Vitest | Every `sim/` system, iso math, save validation and migrations. |
| Integration | Vitest | Scripted games per phase (see each phase spec). Ledger totals must add up. |
| Determinism | Vitest | Same seed and commands twice → equal state hash. |
| Save round-trip | Vitest | Save → load → deep-equal. Corrupt and future-version saves are rejected with the right error. |
| Architecture | Vitest | Import rules from 5.2. |
| Benchmark | Vitest bench | Tick time against the budgets in section 10. |
| Smoke | Playwright | Desktop and phone profiles. Each phase adds its own steps. |

- Every bug fix adds a test that fails before the fix.
- Tuning numbers come from `data/`. Tests that check behaviour read the same constants, not copies.

---

## 9. Error handling
- Commands never throw for player errors. They return `{ ok: false, reason }`.
- An unexpected exception in the loop stops the simulation, keeps the last good state, and shows "Something went wrong" with an option to export the save. The stack trace goes to the console.
- Save and load errors use plain words. Nothing is replaced with defaults.

---

## 10. Performance budgets
| Build | Target | Budget |
|---|---|---|
| 1 | Desktop, 2,000 guests, 10 track rides | 60 fps; tick < 3 ms |
| 1 | Mid-range phone, 800 guests | 30 fps or better |
| 2 | Desktop, 128 × 128 map, 3,000 guests | 60 fps; tick < 4 ms |
| All | Initial load | < 400 KB gzipped JS + CSS |

- The renderer culls objects outside the viewport.
- If a budget is missed, the phase documents the gap and the plan to close it before the build ships.

---

## 11. Non-goals
- Multiplayer, online features, accounts, analytics, ads, or payments.
- Mods or a level editor (maybe after Phase 6).
- Third-party game assets or data files of any kind.

## 12. Open decisions for the owner
1. **Build 1 boundary.** Recommended: Phases 0–3. Alternative: all 7 phases in one build (higher risk, much later first release).
2. **License.** The owner chooses. No license file is added until then.
3. **GitHub Pages.** The owner sets Settings → Pages → Source to "GitHub Actions" once.

---

## 13. Cross-phase rules
These rules settle conflicts between phase specs. They win over any phase text.

| # | Rule |
|---|---|
| R1 | **Time:** tick 0 = 00:00, 1 March, Year 1. A new game starts at tick 450. Formulas in 6.2. |
| R2 | **Ground level** is 8 on every new map (Build 1 included). No height shift in save migrations. |
| R3 | **Fence** is derived from `owned`. No `fence` content value. The park entrance tile is owned and sits in the gap of the border. |
| R4 | **Strings:** player-facing messages, errors, and thoughts have no final period. `!` and `?` stay. |
| R5 | **Thoughts** are stored as `{ id, tick, params? }`. Text comes from the string table `src/data/strings/en.ts`. A guest shows the same thought at most once per game day. |
| R6 | **Temperament groups:** Chill = T ≤ 35, Family = 36–64, Thrill = T ≥ 65. Every system that sorts guests into groups uses them: variety, costume matches, goals, show gathering. Formulas that scale smoothly with T (for example Calm and Buzz shares) may use T directly. |
| R7 | **Modifiers:** `GameState.modifiers = { arrivals: 1, priceTolerance: 1, happinessDecay: 1, researchSpeed: 1, breakdownChance: 1, loanInterest: 1, ratingBonus: 0 }` in Build 1. Phase 5 changes them. Formulas multiply by the factors and add `ratingBonus`. |
| R8 | **Park rating:** the Phase 3 formula replaces the Phase 1 formula. Phase 4 adds an Atmosphere term (100 points) and lowers Happiness from 400 to 300. The rating updates at every hour start. |
| R9 | **Hourly charge rule** (Phase 3 §4.1) covers running costs, wages, and the research budget. |
| R20 | **Charge timing:** each hourly charge is booked at the start of the hour it pays for (`hourOfMonth` 0–71). The remainder is booked at the start of hour 71, so it always lands in the right month. |
| R10 | **Research points** use the Phase 3 scale. Phase 4 costs: Log Flume 480, Rapids Raft 540, each scenery theme 240. |
| R11 | **Catalog flags:** `covered`, `spooky`, `tall`. Every open ride and stall gives light at night (Phase 4), so there is no `lit` flag. |
| R12 | **State slices:** `GameState` groups fields by owning module (`park`, `guests`, `rides`, `stalls`, `economy`, `track`, `staff`, `management`, …). Spec text such as "Park (added)" means "add to the owning slice". |
| R13 | **Tick order** (one tick): month-end pipeline at month start (ledger close → monthly tasks such as loan interest → awards → objectives → lose checks → metric resets → `monthEnded` event) → weather → arrivals → guests → staff → flat rides → track rides → stalls → shows → hour-start work (hourly charges, research points, campaign expiry, auto-repair, park value, rating, Calm and Buzz refresh) → message pruning → `tick + 1`. |
| R14 | **Asset value** (input to park value): `assetValue = totalBuildCost × max(0.30, 1 − 0.7 × ageMonths / 120)`. One formula for flat rides, track rides, and stalls. "Ride value" (excitement × $1.00) is a different term: it only drives guest price checks. |
| R15 | **Demolish refund** is 50% of build cost. Exception: a track ride that has never opened refunds 100%. Paths refund 0%. |
| R16 | **Breakdowns** may stop a train only at a station or a block brake. Trains never touch (Phase 2 safety guarantee). |
| R17 | **Track geometry** (Phase 2 wins): gentle slope 2 m per tile, steep slope 6 m per tile, bank 35°, path clearance under track ≥ 4 m. |
| R18 | **Slopes and cliffs:** within one tile, raised corners are at most 1 step above the tile base (4-bit mask). Between neighbouring tiles there is no height limit, so cliffs are allowed. A generator smoothing pass skips tiles that a cliff feature marks. |
| R19 | **Scenario heights** in specs and scenario data are relative to `baseHeight` unless the text says "absolute". |
| R21 | **Keys:** `V` cycles map overlays. `O` stays the Office/Finance key (Phase 3). |
| R22 | **Path items:** one path item per tile column (ground path or one elevated path) in Build 2. |
| R23 | **Build phase limit:** when Build 2 raises `BUILD_MAX_PHASE` to 4, Phase 4 items (lamps start unlocked; water rides and scenery themes via research) become available in every park, including Build 1 saves after migration. |
| R24 | **Slow-running rides operate:** a ride `broken` with breakdown `slow_running` keeps carrying guests (Phase 3 §4.5). Guests may choose it, and arrivals and the park rating count it as an open ride. |
| R25 | **Build 3 research costs** are the provisional Wave 4.0 values (4,200 points total), logged in `tuning-log.md` for play-testing. |
| R26 | **Monorail extra stations** are stops only: a ride keeps one entrance and one exit. |
| R27 | **Command reasons** stay English text in the simulation; the client translates them with `localizeReason`. Show-site running costs go to the `shows` ledger line. |
| R28 | **Languages:** Build 3 ships English plus a pseudo-locale (accented English) that proves the localization pipeline. A real second language is an owner decision for later. |

