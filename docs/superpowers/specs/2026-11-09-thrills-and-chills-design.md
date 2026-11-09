# Thrills & Chills — Game Design Spec

- **Date:** 2026-11-09
- **Status:** Draft for review
- **Scope of this spec:** Full game vision in 7 phases. Phase 0 and Phase 1 have build-ready detail. Phases 2–6 have roadmap-level detail and get their own spec before work starts.

---

## 1. Intent

### 1.1 What the owner said
- Build an amusement-park management game in the tycoon genre.
- The repository is a public fan project.
- Visual style: 2D isometric.
- Plan the full game in phases.
- Support desktop and touch devices as equal targets.
- Title: **Thrills & Chills**.
- Engine: custom TypeScript + Vite + Canvas 2D (chosen over PixiJS and Phaser).

### 1.2 Assumptions (not stated by the owner)
- Success means a free, playable browser game hosted on GitHub Pages.
- Single player only. No server, no accounts, no monetization.
- English only until Phase 6.

### 1.3 Originality rules (hard constraints)
- The game is original. It uses genre mechanics only: build rides, paths, and shops; guests with needs; money; coasters.
- No names, art, music, sounds, characters, scenarios, maps, UI layout, or data files from any existing game.
- All graphics are drawn in code. All sounds and music are generated in code (Phase 6).
- The README states that the project is an original fan-made game and has no affiliation with any company.

---

## 2. Engine and tooling

| Item | Choice | Reason |
|---|---|---|
| Language | TypeScript, `strict: true` | Type safety for a large simulation. |
| Build | Vite | Standard, fast, static output for GitHub Pages. |
| Rendering | Canvas 2D | No runtime dependencies. Full control. |
| Unit tests | Vitest | Same config as Vite. Runs the simulation without a browser. |
| Browser tests | Playwright (`@playwright/test`) | One smoke test on desktop and one on a phone viewport. |
| CI | GitHub Actions | Typecheck, unit tests, build, smoke test. |
| Hosting | GitHub Pages via Actions | Free static hosting. |
| Runtime dependencies | **None** | Any new runtime dependency needs a written reason in its PR. |

**Upgrade path:** All drawing goes through one `Renderer` interface. If profiling shows that Canvas 2D is too slow for large crowds on phones, a PixiJS renderer can replace it without changes to the simulation.

---

## 3. Architecture

### 3.1 Module layout
```
src/
  main.ts            Boot: create state, renderer, input, UI; start loop.
  loop.ts            Fixed-step loop: simulation ticks + render frames.
  sim/               Pure simulation. No DOM, no Canvas, no Date.now(), no Math.random().
    state.ts         GameState type and factory.
    rng.ts           Seeded random number generator (mulberry32). State lives in GameState.
    time.ts          Calendar: ticks → day, month, year.
    map.ts           Tile grid (typed arrays).
    commands.ts      Player actions: validate, apply, return result.
    pathing.ts       Path network and distance fields.
    guests/          Guest spawn, needs, decisions, movement, thoughts.
    rides.ts         Ride operation cycle and queues.
    stalls.ts        Stall sales and stock cost.
    economy.ts       Ledger, prices, monthly report.
    rating.ts        Park rating and guest arrival rate.
    tick.ts          One simulation tick: calls each system in a fixed order.
  data/              Definitions as data: rides, stalls, path types, costs, tuning constants.
  render/            Reads GameState. Never writes it.
    iso.ts           Tile ↔ screen math.
    camera.ts        Pan, zoom, bounds.
    sprites/         Procedural sprite drawing + sprite cache.
    terrainCache.ts  Static tiles pre-drawn into 16×16-tile chunk images.
    renderer.ts      Frame: terrain chunks, depth-sorted objects, ghosts, overlays.
  input/             Pointer Events (mouse, touch, pen) + keyboard → tool actions.
  ui/                HTML/CSS layer: HUD, toolbar, panels, dialogs, toasts.
  save/              Serialize, validate, migrate, store.
tests/
  unit/              Vitest tests for sim/, save/, render/iso.ts.
  e2e/               Playwright smoke tests.
```

### 3.2 Rules between modules
- `sim/` imports only `sim/` and `data/`. A test enforces this rule (it scans imports).
- `render/`, `input/`, and `ui/` read `GameState`. They change it only through `commands.ts`.
- `ui/` and `input/` never call each other's internals. They share a small `ToolState` object (active tool, ghost position, rotation).

### 3.3 Commands
- Every player action is a command object, for example `{ type: 'buildPath', x, y, kind: 'footpath' }`.
- `executeCommand(state, cmd)` returns `{ ok: true, cost }` or `{ ok: false, reason }`.
- A failed command changes nothing. The UI shows `reason` in a toast.
- Commands are the only way to change the world from outside `sim/`. This makes replays, undo (later), and tests possible.

### 3.4 Determinism
- The same start state plus the same command list at the same ticks gives the same end state.
- The simulation uses only the seeded RNG in `GameState.rng`.
- Iteration order is fixed (arrays sorted by entity id).
- A test runs a scripted game twice and compares state hashes.

### 3.5 Game loop
- Simulation: fixed step of **20 ticks per second** at 1× speed.
- Speeds: paused, 1×, 2×, 4×. At 4×, the loop runs up to 80 ticks per second.
- Safety cap: at most 10 ticks per frame. If the device cannot keep up, game time slows. Game time never skips ticks.
- Rendering: `requestAnimationFrame`. Moving objects use interpolation between the last two ticks.
- Background tab: the loop pauses when `document.hidden` is true.

### 3.6 Calendar
- 1 day = 100 ticks (5 seconds at 1×).
- 1 month = 30 days (2.5 minutes at 1×).
- 1 year = 12 months.
- All values are constants in `data/tuning.ts`.
- **Time units:** the simulation counts ticks only. This spec gives durations in seconds at 1× speed (1 s = 20 ticks).

---

## 4. World model

### 4.1 Map
- Phase 1 map: 64 × 64 tiles. Later phases support up to 256 × 256.
- Storage: struct-of-arrays with typed arrays, index `i = y * width + x`.
  - `terrain: Uint8Array` (grass, sand, dirt, water — Phase 1 uses grass only).
  - `height: Uint8Array` (height in steps; Phase 1 is flat at 0).
  - `content: Uint8Array` (empty, footpath, queue, building, parkEntrance, fence).
  - `contentRef: Int32Array` (entity id of the building, or −1).
  - `owned: Uint8Array` (park owns the tile; Phase 1: all tiles inside the park border).
- The park border is a fence. The park entrance sits on the border. Guests spawn outside the entrance.

### 4.2 Isometric projection
- Tile size at zoom 1: 64 × 32 px (2:1 diamond).
- Height step: 16 px.
- Tile (x, y, z) → screen: `sx = (x − y) × 32`, `sy = (x + y) × 16 − z × 16`.
- Screen → tile: inverse of the formula at z = 0. Phase 4 adds a per-tile hit test for raised land.
- Depth order: sort by `(x + y)`, then by `z`, then by layer (ground, path, object, guest, overlay).

### 4.3 Entities
| Entity | Key fields |
|---|---|
| `Ride` | id, defId, x, y, rotation (0–3), footprint, entrance tile, exit tile, price, open, cycle phase, riders, queue (guest ids), stats (excitement, intensity, nausea), totals (riders, income). |
| `Stall` | id, defId, x, y, rotation, service side, price, totals (sales, income). |
| `Guest` | id, position (tile + sub-tile progress), state, target, cash, needs, preferences, thoughts, rides taken, spent. |
| `Park` | name, entrance fee, open/closed, rating, guest count, cash. |

- Entity ids come from `GameState.nextId` and never repeat.
- Removed entities leave no references behind. A test checks that every `contentRef` points to a live entity.

---

## 5. Phase 0 — Foundation

**Goal:** An empty park that the player can look around, on desktop and phone.

### 5.1 Scope
1. Vite + TypeScript scaffold, `npm run dev`, `build`, `test`, `typecheck`, `e2e`.
2. GitHub Actions CI: typecheck, unit tests, build, Playwright smoke test.
3. GitHub Actions deploy to GitHub Pages on push to `main`.
4. Fixed-step loop with pause and speed controls (no simulation systems yet).
5. Map of 64 × 64 grass tiles with a fence border and a park entrance.
6. Terrain chunk cache.
7. Camera:
   - Mouse: drag with left button on empty ground, or right/middle button anywhere, pans. Wheel zooms toward the cursor.
   - Keyboard: arrow keys and WASD pan. `+` and `−` zoom.
   - Touch: one-finger drag pans. Two-finger pinch zooms and pans.
   - Zoom range: 0.25× to 2×. Camera stays inside map bounds plus a margin.
8. Tile picking: the tile under the pointer gets a highlight.
9. HUD shell: date, cash, speed buttons. Layout adapts to phone width.
10. README with how to run, how to play, and the originality statement.

### 5.2 Done when
- `npm run build` gives a static site that loads on GitHub Pages.
- The map renders, pans, and zooms with mouse, keyboard, and touch.
- The highlight follows the pointer on desktop and the finger on touch.
- CI is green.

---

## 6. Phase 1 — First playable

**Goal:** A small park that works. Guests arrive, ride, eat, drink, use restrooms, pay, and leave. The player sees money go up or down.

### 6.1 Content (original names)
| Kind | Name | Size | Excitement | Intensity | Nausea | Capacity | Cycle | Build cost | Running cost / month | Default price |
|---|---|---|---|---|---|---|---|---|---|---|
| Ride | Carousel | 3×3 | 2.5 | 1.0 | 0.5 | 16 | 20 s | $1,200 | $40 | $2 |
| Ride | Big Wheel | 3×3 | 3.0 | 0.8 | 0.3 | 24 | 30 s | $1,800 | $60 | $3 |
| Ride | Swing Tower | 3×3 | 4.5 | 4.0 | 2.0 | 20 | 25 s | $2,400 | $80 | $3 |
| Ride | Teacup Twirl | 3×3 | 3.5 | 3.5 | 4.5 | 18 | 20 s | $1,500 | $50 | $2 |
| Stall | Snack Shack | 1×1 | — | — | — | — | — | $400 | $20 | $3 (food) |
| Stall | Fizz Stand | 1×1 | — | — | — | — | — | $350 | $20 | $2 (drink) |
| Stall | Restrooms | 1×1 | — | — | — | — | — | $300 | $15 | $0 |

- Stats use a 0–10 scale. Values are starting points. They live in `data/` and get tuned by play-testing.
- Stock cost per sale: food $1.00, drink $0.60.
- Paths: footpath $10 per tile, queue path $12 per tile.
- Start cash: $15,000. Start entrance fee: $10.

### 6.2 Building
- **Tools:** Inspect, Footpath, Queue path, Place ride, Place stall, Demolish.
- **Paths:** Drag draws a straight line of tiles along the x or y axis, whichever has the larger distance from the start tile (L-shape not in Phase 1). The ghost shows the cost before release. On touch, the line appears while the finger moves and builds on release.
- **Rides:** A ghost follows the pointer. `R` key or the Rotate button turns it 90°. The ghost is green when valid and red when not. Click places it. On touch: tap moves the ghost, then the Confirm button places it.
- **Ride entrance and exit:** The entrance gate is the middle tile of the front edge of the footprint. The exit gate is the middle tile of the back edge. Rotation sets which edge is the front. Guests enter from the tile directly outside the entrance gate, which must be a queue tile. Guests leave to the tile directly outside the exit gate, which must be a footpath.
- **Stalls:** Face one side. The service side must touch a footpath.
- **Validation reasons** (shown in a toast): "Not enough cash", "Tile is not empty", "Outside the park", "Entrance needs a queue path" (warning, not a block), "Stall must face a path" (warning, not a block).
- **Demolish:** Refunds 50% of build cost. Guests on a removed ride get off first and walk away.
- **Connection warnings:** A ride or stall with no path access shows a red icon and the reason in its panel.

### 6.3 Path network and pathfinding
- Footpath and queue tiles connect to the 4 neighbours (no diagonals).
- Queue tiles connect to other queue tiles, to footpaths, and to a ride entrance gate.
- A queue belongs to the ride whose entrance gate it touches (found by flood fill over connected queue tiles). A queue that touches no ride entrance shows a warning.
- Only guests that go to that ride may walk on its queue tiles. Distance fields for all other destinations exclude queue tiles.
- Each destination (ride entrance, stall service tile, park exit) has a **distance field**: a BFS over walkable tiles from the destination.
- Distance fields rebuild only when the path network changes (dirty flag).
- A guest moves to the neighbour with the smallest distance. Ties break by a fixed direction order.
- No reachable destination: the guest wanders and thinks "I am lost".

### 6.4 Guests
- **Spawn:** At the park entrance. Arrival rate per day depends on park rating, number of open rides, and entrance fee. Formula in `rating.ts`, constants in `data/tuning.ts`.
- **Entry:** A guest compares the entrance fee with their price tolerance. Too high: they turn away and the park gets a "too expensive" count in the info panel.
- **Start values:** cash $40–$120, happiness 70, hunger 20, thirst 20, bladder 10, energy 90, nausea 0. Intensity tolerance: min 0–3, max 4–9. All random within ranges from the seeded RNG.
- **Needs over time:** hunger, thirst, and bladder rise. Energy falls. Nausea falls slowly. Rates are in `data/tuning.ts`.
- **States:** `arriving → walking → queueing → riding → walking → buying → walking → leaving → gone`.
- **Decision every 2 s (when walking):**
  1. A need above its urgent threshold → go to the nearest matching stall.
  2. Else → score each open, reachable ride: excitement fit, intensity fit, price, distance, and "already ridden" penalty. Pick the best with a small random factor.
  3. Low happiness, low energy, or no cash → go to the exit.
- **Queue:** Join only if queue length < patience limit. Leave the queue if the wait is too long. Happiness drops while waiting.
- **Riding:** Happiness rises by excitement fit. Nausea rises by ride nausea. Intensity outside tolerance lowers happiness.
- **Thoughts:** Short, original lines with a timestamp. Examples: "I am hungry", "That was great!", "Too expensive", "I am lost", "This queue is too long", "I feel sick". The newest 5 per guest are kept.
- **Leaving:** Walk to the park entrance and despawn. The park records the guest's final happiness for the rating.

### 6.5 Rides and stalls in operation
- **Ride cycle:** `waiting → loading → running → unloading → waiting`.
  - Loading ends when the ride is full or after a max wait of 10 seconds with at least 1 rider.
  - Each rider pays when they board.
- **Stalls:** A sale takes 1 second. The guest pays the price. The park pays the stock cost.
- **Restrooms:** A visit takes 3 seconds and resets bladder.
- **Open/close:** A closed ride lets current riders finish and sends its queue away.

### 6.6 Economy
- **Ledger:** One record per month. Categories: construction, ride running costs, stall running costs, stock, entrance tickets, ride tickets, stall sales.
- **Running costs** are charged daily so cash changes smoothly. Daily charge = monthly cost / 30, rounded down to the cent. The last day of the month charges the remainder, so the month total is exact.
- **Negative cash:** allowed (no loans until Phase 3). Building is blocked while cash is below the build cost.
- **Prices:** The player sets the entrance fee and each ride and stall price. Guest price tolerance reacts to them.
- **Finance panel:** This month, last month, and a 12-month bar chart of profit.

### 6.7 Park rating (0–1000)
- Inputs: average guest happiness, number of guests who are lost, number of rides, and queue lengths.
- Updated once per game day.
- Drives the guest arrival rate.

### 6.8 User interface
- **HUD (top):** cash, guest count, park rating, date, speed buttons (pause, 1×, 2×, 4×).
- **Toolbar:** bottom on screens narrower than 900 px, left side on wider screens. Buttons are at least 44 × 44 px.
- **Panels:** side panel on desktop, bottom sheet on phone. One panel open at a time.
  - Ride panel: status, price slider, open/close, stats, queue length, riders, income, connection warnings.
  - Stall panel: price, sales, income.
  - Guest panel: needs bars, cash, thoughts, current target.
  - Park panel: name, entrance fee, open/close, rating, guest list summary.
  - Finance panel (6.6).
- **Inspect:** Click or tap an object to open its panel. Long-press on touch also opens it.
- **Keyboard shortcuts:** `Space` pause, `1`–`3` speed, `P` footpath, `Q` queue, `R` rotate, `Delete` demolish tool, `Esc` cancel tool.
- **Toasts:** command failures and warnings, 3 seconds, one at a time.
- **Accessibility:** every button has a text label or `aria-label`. Colour is never the only signal (icons and text back up red/green ghost states).

### 6.9 Save and load
- **Format:** JSON. Typed arrays are stored as base64 strings.
- **Envelope:** `{ "format": "thrills-and-chills-save", "schemaVersion": 1, "savedAt": "<ISO date>", "state": { ... } }`.
- **Slots:** 3 manual slots and 1 autosave in `localStorage`. Autosave runs at the start of each game month.
- **Export/import:** download and upload a `.tcsave.json` file.
- **Validation on load:** check `format`, `schemaVersion`, and required fields and array lengths.
  - Unknown future version → error: "This save comes from a newer version of the game."
  - Old version → run migrations in order (`migrations[1→2]`, …).
  - Any check fails → show the error and keep the current game. **Never** load a partial state or fill in defaults for missing data.
- **Storage full or blocked** (`localStorage` throws) → show an error and offer file export.

### 6.10 Performance budgets (Phase 1)
| Target | Budget |
|---|---|
| Desktop, 1,000 guests | 60 fps, simulation tick < 2 ms |
| Mid-range phone, 500 guests | 30 fps or better |
| Initial load | < 300 KB gzipped JS + CSS |

- A Vitest benchmark measures the tick time with 1,000 guests.
- The renderer culls objects outside the viewport.

### 6.11 Done when
- Manual play-test: a new player can build a path, a queue, a ride, and a stall, and open the park within 2 minutes without help text.
- Guests arrive, ride, buy, use restrooms, and leave. Money changes and the finance panel shows why.
- Save, reload, export, and import keep the full state (round-trip test passes).
- The phone smoke test can build a path and place a ride with touch.
- CI is green. Performance budgets are met or the gap is documented.

---

## 7. Phase 2 — Coasters (roadmap level)
- **Track builder:** piece by piece from a station. Pieces: station, straight, gentle slope up/down, steep slope up/down, small and medium turns, lift hill (chain), brakes. Each piece changes position, direction, and height.
- **Heights:** tracks rise above the ground. Supports are drawn to the ground. Guests and paths can pass under track with clearance.
- **Validation:** the circuit must end back at the station. No overlap with other objects. Clear error for each failed rule.
- **Physics:** 1D motion along the track. Speed from energy: gravity on slopes, friction, constant speed on lift hills, braking on brakes. A train that stops on a slope fails the test run.
- **Test run:** the train runs empty. The game measures max speed, max drop, time, and approximate vertical and lateral G-forces.
- **Ratings:** excitement, intensity, and nausea come from the test data. Very high intensity warns the player that most guests will not ride.
- **Trains:** 1–3 trains, 2–6 cars. Block sections (brakes) are needed for more than one train.
- **Saves:** schema version 2 with a migration from version 1.

## 8. Phase 3 — Management (roadmap level)
- **Staff:** Groundskeeper (sweeps litter, empties bins), Mechanic (inspects and fixes rides), Security (lowers vandalism), Performer (raises happiness nearby). Hire, fire, wages, patrol areas.
- **Litter and sickness:** guests drop litter; sick guests make a mess; dirty paths lower happiness.
- **Breakdowns:** each ride has reliability that falls with age; breakdowns stop the ride until a mechanic fixes it; inspections slow the decline.
- **Marketing:** time-limited campaigns that raise arrivals or ride popularity.
- **Loans:** a credit limit, monthly interest, and repayment.
- **Research:** a monthly budget unlocks new rides, stalls, and track pieces over time.
- **Weather:** sun, cloud, rain. Rain lowers arrivals and raises demand for covered rides and umbrellas.
- **Park rating:** extended with cleanliness, breakdowns, and scenery inputs.

## 9. Phase 4 — Land and scenery (roadmap level)
- Raise and lower land per tile corner. Slopes for paths.
- Water tiles. Water-based rides become possible.
- Land purchase at the park border.
- Scenery: trees, flower beds, fences, lamps, benches, bins, and themed sets. Scenery near paths and queues raises happiness.
- View rotation in 4 directions.

## 10. Phase 5 — Scenarios and progression (roadmap level)
- Original scenario maps, each with a goal (for example, "300 guests and a rating of 600 by the end of year 2").
- Sandbox mode: unlimited cash, all items unlocked.
- Awards: monthly awards for cleanest park, best value, and similar.
- Difficulty settings that change start cash, guest tolerance, and research speed.

## 11. Phase 6 — Polish (roadmap level)
- Generated sound effects and music with Web Audio. No recorded third-party audio.
- Tutorial scenario.
- More flat rides, coaster types, and stalls.
- Performance work. A PixiJS renderer if profiling shows the need.
- Accessibility pass and localization support.

---

## 12. Testing strategy
| Layer | Tool | What |
|---|---|---|
| Unit | Vitest | iso math, RNG, calendar, commands, pathing, guest decisions, ride cycle, economy, rating, save validation and migrations. |
| Integration | Vitest | Scripted game: build a small park, run 3 game months, check guest flow and ledger totals add up. |
| Determinism | Vitest | Same seed and commands twice → equal state hash. |
| Save round-trip | Vitest | Save → load → deep-equal state. Corrupt and future-version saves are rejected with the right error. |
| Architecture | Vitest | `sim/` imports nothing outside `sim/` and `data/`. |
| Benchmark | Vitest bench | Tick time with 1,000 guests. |
| Smoke (desktop) | Playwright | Game boots, canvas is not blank, no console errors, build a path with the mouse. |
| Smoke (phone) | Playwright, phone device profile | Game boots, pinch zoom changes zoom, tap-place a path and a ride. |

- Every bug fix adds a test that fails before the fix.
- Money values are integers in cents to avoid float drift in the ledger.

---

## 13. Error handling
- Commands never throw for player errors. They return `{ ok: false, reason }`.
- Unexpected exceptions in the loop stop the simulation, keep the last state, and show "Something went wrong" with an option to export the save. The error goes to the console with the stack trace.
- Save and load errors are shown to the player in plain words. Nothing is replaced with defaults.

---

## 14. Non-goals
- Multiplayer, online features, accounts, analytics, ads, or payments.
- Mods or a level editor (maybe after Phase 6).
- Use of any third-party game assets or data files.

## 15. Open decisions for the owner
- **License.** Code license (for example MIT) is the owner's choice. No license file is added until the owner chooses.
- **GitHub Pages.** The owner must set Settings → Pages → Source to "GitHub Actions" once.
