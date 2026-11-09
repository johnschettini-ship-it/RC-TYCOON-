# Thrills & Chills

An original isometric theme-park management game for the browser. Build rides, paths, and shops. Serve two kinds of guests: **Thrill** seekers who want speed and height, and **Chill** seekers who want calm gardens and gentle rides. Frost the friendly yeti and Spark the fire fox show you around.

> **Originality statement.** Thrills & Chills is an original fan-made game in the theme-park management genre. It has no affiliation with any company or other game. It uses genre mechanics only: no names, art, music, sounds, characters, scenarios, maps, UI layouts, or data files from any existing game. All graphics are drawn in code and all audio is generated in code.

It runs in any modern browser on desktop and touch devices, with no install, no account, no ads, and no tracking. After the first visit it also plays offline.

## Builds

The game ships in three public builds. Each build keeps your saves: older saves upgrade when they load.

### Build 1 — "The Big Build"
The complete core tycoon game on one flat 64 × 64 map.
- Footpaths and queue paths; 14 flat rides and 11 stalls and facilities.
- **Temperament:** every guest sits somewhere from pure Chill (0) to pure Thrill (100). It sets what they ride, how fast they tire, and what makes them happy. The HUD shows your park's Thrill/Chill balance.
- **Coasters:** a piece-by-piece track builder for 7 track ride types, train physics, test runs, and excitement, intensity, and nausea ratings.
- **Management:** staff (groundskeepers, mechanics, security guards, and performers in Frost, Spark, and Boo costumes), litter and vandalism, breakdowns, research, marketing campaigns, loans, weather, park value, and a monthly finance report.
- Saves: 3 slots, an autosave each game month, and file export and import.

### Build 2 — "The Wide World"
- **Land:** raise, lower, and paint terrain; water; cliffs; land and construction rights to buy; maps up to 128 × 128.
- Elevated paths and paths on slopes; 2 water rides (Log Flume, Rapids Raft).
- **Scenery:** 6 themed lands (Classic Fair, Frost Peaks, Volcano Ridge, Spooky Hollow, Jungle Lagoon, Starport).
- **Calm and Buzz:** gardens and water calm the paths around them; thrill rides fill them with buzz. Two map overlays show both.
- **After Dark:** a day and night cycle with lamps, lit rides, and a spooky-ride bonus at night.
- View rotation in 4 directions.
- **Scenarios:** 8 original scenarios with goals and 3 difficulty presets, a sandbox, a tutorial, and monthly awards.

### Build 3 — "Lights and Sound"
- **Sound:** sound effects and music generated in the browser with Web Audio (no audio files). Each scenery theme has its own music, with a night variant.
- **After Dark shows:** the Lightshow and the Fireworks Finale run on a schedule at night and draw a crowd.
- **More content:** 4 flat rides, 3 track ride types (Inverted Coaster, Bobsled Run, Monorail), corkscrew and helix track pieces, 3 stalls, and 2 show sites.
- **Accessibility:** keyboard play with a map cursor, screen reader labels and live announcements, a colour-blind safe palette with shapes as well as colours, high contrast, reduced motion, and text scale up to 175%.
- **Settings menu:** audio volumes, display, controls, language, gameplay, and data (export saves and progress).
- **Languages:** every text comes from a string table. Build 3 ships English and the pseudo-locale `en-XA` that tests the pipeline (see [Languages](#languages)).
- **Offline play:** a service worker keeps the current build on your device (see [Offline play](#offline-play)).
- **Performance:** profiling overlay (`F3`) and render quality settings.

## How to play
1. **Start.** On the title screen pick **New game**, then the **Tutorial**, a **Scenario** (with a difficulty: Relaxed, Standard, or Tough), the **Sandbox**, or a free park with your own name and map size. The tutorial walks you through your first ride.
2. **Paths first.** Build a footpath from the park entrance. Guests only reach what the paths connect.
3. **Rides.** Open the ride picker, place a ride, then connect its entrance with a **queue path** and its exit with a **footpath**. Open the ride to set its price.
4. **Stalls.** Food, drinks, and restrooms must face a footpath. Hungry, thirsty, or tired guests leave unhappy.
5. **Balance the crowd.** Watch the Thrill/Chill bar. Chill guests like gentle rides, gardens, and benches; Thrill guests want intense rides and buzz.
6. **Run the park.** Hire groundskeepers and mechanics, set the research budget, run marketing, and check the finance panel each month. Take a loan if cash runs low.
7. **Coasters.** Start with a station, add pieces until the circuit closes, place the entrance and exit, then run a test. Good coasters are exciting without being too intense.
8. **After dark.** Light your paths. Spooky rides shine at night, and from Build 3 you can schedule shows.
9. **Win.** Scenarios list their goals in the objectives panel. In a free park, aim for a high park rating and a happy crowd.

## Controls
| Action | Desktop | Touch |
|---|---|---|
| Pan | Drag, right or middle drag, arrow keys, `W` `A` `S` `D`, screen edge (setting) | One-finger drag |
| Zoom | Mouse wheel, `+` / `−` | Pinch |
| Select, build | Click | Tap |
| Drag a path line or area | Drag with a tool | Drag with a tool |
| Inspect anything | Click with Inspect | Tap, or long-press |
| Rotate the item to place | `R` | Rotate button |
| Rotate the view | `[` and `]` | View buttons |
| Pause / speed 1× 2× 4× | `Space`, `1` `2` `3` | HUD buttons |
| Footpath, queue path, demolish | `P`, `Q`, `Delete` | Toolbar |
| Path height | `Page Up` / `Page Down` | Path height bar |
| Bench, bin | `B`, `N` | Toolbar |
| Staff, office (finance), messages | `H`, `O`, `M` | Toolbar |
| Map overlays (Calm, Buzz, …) | `V` | Overlays button |
| Cancel, close | `Esc` | Close buttons |
| Map cursor (keyboard play) | `C`, then arrows, `Enter` to act, `Shift` + arrows to drag a path | — |
| Shortcut list | `?` | — |
| Performance overlay | `F3` | Settings |

Every button is at least 44 × 44 CSS pixels. All controls have text labels or screen reader names.

## Settings
Settings live in your browser (`tc.settings`), never in saves. If they cannot be read, the game says "Settings could not be read" and uses the defaults until you pick **Reset settings**; it never overwrites them silently.

## Languages
Every player-facing text is an id in a string table (`src/data/strings/`). The simulation stores ids and parameters, not text; command reasons are mapped back to their ids on screen. Numbers use `Intl.NumberFormat`, plurals use `Intl.PluralRules`, and the currency sign, month names, and 12 h or 24 h clock come from the string table.

Build 3 ships **English** and **`en-XA`**, a pseudo-locale (every letter accented, every text at least 30% longer, wrapped in `[ … ]`). Pick it under Settings → Language to see which text is translated and whether it still fits. The game follows your browser language when it has a match, else English; the setting overrides it.

**Add a language:**
1. Copy `src/data/strings/en.ts` to `src/data/strings/<code>.ts` (or build the table from the English sections as `en-XA.ts` does).
2. Translate every value, including the content names (`content.<id>`: rides, track types and pieces, stalls, scenery, show sites, campaigns, and scenario names and descriptions; `src/data/strings/content.ts` lists them from the catalogs). Keep every `{placeholder}` exactly. Give the plural forms your language needs (`zero`, `one`, `two`, `few`, `many`, `other`) for each key in `plurals.ts`. `date.clock` is `24` or `12`.
3. Add the locale to `LOCALES` in `src/data/strings/index.ts`.
4. Run `npm test`. The completeness test fails for a missing key, an extra key, or a placeholder mismatch.
5. Check the screens at 175% text scale.

## Offline play
After the first visit the game works without a network. A service worker caches the current build (`index.html` and its hashed files) under a cache named after the build. When a new build is published, it downloads in the background and waits; a toast says **Update ready**. **Reload** saves your park to the autosave slot first, then switches to the new build; **Later** keeps playing. The page itself is always loaded from the network first when you are online, so you never run stale code after an update. Saves stay in `localStorage` and are never cached. Turn **Offline play** off in the settings to remove the service worker and its cache.

## Run
```bash
npm ci
npm run dev       # development server (no service worker)
npm run build     # typecheck and production build in dist/
npm run preview   # serve dist/ (with the service worker)
```

## Test
```bash
npm test          # unit and integration tests (Vitest)
npm run e2e       # browser tests (Playwright, desktop and phone)
npm run typecheck
npm run bench     # tick benchmarks
```

## Release
The Build 3 release checklist is [docs/release/build-3-checklist.md](docs/release/build-3-checklist.md). Its automated part runs with:
```bash
node scripts/check-release.ts
```
App icons are drawn in `public/icons/icon.svg`; `node scripts/make-icons.ts` renders the PNG sizes with Playwright.

## Project
- [Master design spec](docs/superpowers/specs/2026-11-09-thrills-and-chills-design.md), [phase specs](docs/superpowers/specs/thrills-and-chills/), and the [content catalog](docs/superpowers/specs/thrills-and-chills/content-catalog.md).
- [Delivery plan](docs/superpowers/plans/2026-11-09-thrills-and-chills-delivery.md) and [changelog](CHANGELOG.md).
- Tech: TypeScript (strict), Vite, Canvas 2D, Web Audio. No runtime dependencies. The simulation in `src/sim/` is deterministic and runs without a browser.

## License
The owner has not chosen a license yet, so this repository has no license file. One will be added when the owner decides (master spec, open decision 2).
