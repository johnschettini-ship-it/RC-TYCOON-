# Changelog

Every public build of Thrills & Chills. A build keeps saves from the builds before it: older saves upgrade when they load (save schema 1 → 2 → 3). Settings and scenario progress are stored apart from saves.

## Build 4 — "Interface" (4.0.0, unreleased)
Build name: "Interface" (was "Frost and Spark" until the mascots were removed, owner decision 2026-11-12).
Save schema 3 (unchanged): Build 1 to Build 3 saves load. Settings document version 2.

### Changed
- **New interface** (Phase 7, `docs/superpowers/specs/thrills-and-chills/phase-7-frost-and-spark-interface.md`): the HUD top bar and the 21-button toolbar are replaced.
  - A status pill (park name, cash, guests, rating; it opens the Park panel), the controls (speed, Messages, Menu; one Speed button with a menu on a phone), and a day chip (weather, date) with the view buttons at its right.
  - The **mood bar**: the guest mix (Chill, Family, Thrill) with Frost and Spark at its ends, a knot for the lean, a lean text, and faces that turn sad for an under-served group; a press turns the Temperament overlay on and off.
  - Five **card decks** (Rides, Stalls, Paths, Scenery, Manage) and the Demolish button; every old tool keeps its place in a deck. A **hand of cards** replaces the ride and stall pickers: zone strips, previews, cost chips, press-then-place, and drag to the map with a mouse or pen. A **card details** panel shows the held card's data (the Details button on a phone). The phone hand tucks away while a card is held.
  - **Mascot tips:** one short tip at a time from Frost and Spark (no ride open, cash below zero, an under-served guest group), with a button to the place it names and Close; a new setting turns them off.
  - A **light look**: white surfaces, ink outlines, colour tokens in `src/styles/tokens.css`, and one bundled font, Fredoka (SIL Open Font License 1.1).
- **Day chip** (after the owner's test play): the wide day pill is now a small chip with the weather and the date; the two buttons that turn the view sit at the right of its row, and the map shows between them (the phone's top region is 18 px lower).
- **Slim mood bar and smaller cards** (after the owner's test play): the mood bar is a 44 px plate with no line of text under it (the percentages show on the desktop only), and the cards of the hand are about 12% smaller (the phone's top region is 14 px lower and the hand 16 px lower).
- **Phone held sideways** (after the owner's test play): a low window (under 500 px high, wider than high) has its own layout: one slim top row, the cards closed until a deck chip is pressed, and panels at the right side, so most of the screen shows the map.
- **Slim track station row and colour key** (after the owner's test play): on a phone the station step of the track builder is one slim row (name, length stepper, Rotate, Confirm with the price, and "⋯" with Details and Cancel), and an overlay's colour key is a thin strip of coloured dots and band names under the top region.
- **Compact top row on the phone** (after the owner's test play): an upright phone shows one top row (cash and guests, a mood circle with the leading face and its share, a date chip with the month and the clock, Menu) with Pause, Messages and the view buttons as small round buttons under it at the right; the rating and the year are in the names of the mood circle and the chip (the top region ends 58 px higher).
- **Build mode for track rides** (after the owner's test play): while the track builder is open the deck chips (the deck list on desktop) and the hand are hidden, and on a phone Messages and the objectives flag too; the phone's piece panel is condensed (one row each of tabs and small piece tiles, a small status line, Build with the price; 315 → 239 px high), and Build is disabled while a piece cannot be built, with the reason in the panel and no toast repeating it.
- **No mascots** (owner decision): the Frost and Spark faces are gone from the interface; the mood bar is the track alone, the phone's mood circle is a plain round button in the leading group's colour with its share ("40%"), and the tips, the tutorial, award toasts and the end screen show their text with no face or speaker; the tips setting is now labelled "Tips" (same saved value).
- **No mascots in the park** (owner decision): the Frost and Spark performer costumes, the Frost and Spark statues and their guest thoughts are removed (Boo is the costume left; Frost Peaks and Volcano Ridge have 11 items each). Older saves still load: a Frost or Spark statue becomes the Robot Statue, a performer in their costume wears Boo, and their thoughts are dropped (save schema 3 unchanged). The build is now named "Interface".
- **One top row on the phone** (owner decision): an upright phone shows the whole top region in one row: cash over guests, the mood circle, a time chip with the weather icon and the hour (the month and year in its name), Speed, one turn-view button (tap: clockwise; hold: counter-clockwise) and Menu. Messages (with the unread count) and a scenario's Objectives are Menu items, and a dot on Menu shows unread messages; from $100,000 the pill shows the cash as "$199K" or "$1.23M" (the top region ends 52 px higher: `--hud-bottom` 104 → 52 px at 390 × 844).
- **Title screen:** a pixel-art skyline park with the game name and a menu with Continue for the newest save (`docs/superpowers/specs/thrills-and-chills/phase-7-title-screen.md`). The four pictures are data in the JavaScript bundle; there are no image files.
- **Settings version 2:** adds `mascotTips` (default on). A version 1 document is checked as version 1 and gets `mascotTips: true`; the store writes version 2 at the next change.

### Ride work 1 (owner decisions R1, R2, R5–R8 of 2026-11-12)
- **Higher height limits with an intensity step** (R2): the limits (the climb above the station) rise to Steel 75, Inverted 70, Wooden 60, Bobsled 35, Log Flume 30, Spinning Mouse 24, Junior 20, Monorail 24, Rapids 15, Mini Railway 16, Ghost Train 10 and Go-Kart 6 m. Each whole metre above a ride's old limit adds +0.10 intensity, at most +2.00, so a very tall family ride counts as a thrill ride.
- **Trains with their length** (R6): a train is simulated with all its cars; the push along the track and the G forces of the ratings are the average over the cars, so a long train is pulled over a crest by its front cars and held back by its rear cars. A one-car train runs as before. A chain lift pulls while any car is on a chain piece.
- **Safety limits** (R7): vertical G above 6.0 or below −2.0 and lateral G above 3.0, measured on the strongest car, are hard limits. A piece that would pass one cannot be built (Build is disabled with the reason), and a ride whose test lap passes one, or whose train stops, cannot open. The ride panel names the value and the piece, outlines the place on the map, and has a **Show on map** button (on a phone the panel lowers so the place shows). The rating penalty limits (5.0, −1.5, 2.5) are unchanged.
- **Live meter** (R5): while a piece is chosen the builder shows the train's top speed and the strongest vertical and lateral G on that piece, from the same physics as the test run, with a level (within the limits, near the limit, over the safety limit) shown by an icon and words as well as colour, or "Train stops on piece n".
- **Auto-finish** (R1, R8): one button in the track builder finds a way from the track end back to the station and shows it on the map with its piece count and price; Confirm builds it all at once (Undo removes one piece at a time). The path uses the ride's plain pieces and, where the train is too fast for a turn, ordinary brakes at 17, 12 or 7 m/s; it never uses block brakes, loops, corkscrews, helices, spooky tunnels or water features. It is offered only when the finished ride passes its test within the safety limits. The search stops after 3 seconds of waiting on the player's own device ("No safe way back found: build closer to the station or lower the track"); a track that already holds a piece over a safety limit gets an answer at once ("Piece 19 is over the safety limit: fix it first").
- Save schema 3 (unchanged); a saved ride keeps its ratings until its next test, and open rides keep running under the new physics.

### Fixed (final review)
- **Title screen:** while it is open, the game behind it is inert (Tab and Shift+Tab stay on the title's controls), and the park behind it never overwrites the autosave.
- **Focus ring:** the keyboard focus ring is visible on every control that draws a hard shadow (status pill, mood bar, controls, cards, the title menu), over that shadow; a held card draws it inside its own edge.

### Size
- First load: **354.2 KB** gzipped (JavaScript 343.9 KB + CSS 10.3 KB) of the 400 KB budget (Build 3: JavaScript 306.4 KB + CSS 7.5 KB). The title pictures are part of the JavaScript.
- With ride work 1 (2026-11-12): first load **365.4 KB** gzipped JavaScript + CSS (measured by `node scripts/check-release.ts`; Vite reports 364.8 kB JavaScript and 12.1 kB CSS gzipped) of the 400 KB budget.
- Font files (not part of the first-load budget, cached for offline play): `fredoka-latin-wght-normal.woff2` **29,732 bytes** and `fredoka-latin-ext-wght-normal.woff2` **4,576 bytes**, with their licence in `src/assets/fonts/fredoka/LICENSE`. The release check allows exactly these two font files at these sizes.

### Not yet checked by a person
The owner accepts the screenshots of the real game (`docs/screenshots/phase-7-*.png`) before the `build-4` tag. The interface constants in `tuning-log.md` are provisional until a play-test.

## Build 3 — "Lights and Sound" (3.0.0, unreleased)
Save schema 3. Build 1 and Build 2 saves load and upgrade; Build 2 progress files load.

### Added
- **Generated audio:** a Web Audio engine with 20 synthesized sound effects (building, sales, ride bells, coaster chains, rumbles, and cheers, splashes, rain and thunder, the crowd, breakdowns, awards, fireworks, and interface sounds) with distance falloff and stereo pan, and procedural music for the title and each scenery theme, with a slower night variant. No audio files.
- **After Dark shows:** the Lightshow and the Fireworks Finale. Schedule them from 20:00 to 23:30 every 1 to 3 days; they gather guests, lift their mood, cost money per show, and are cancelled without cash ("Not enough cash for the show").
- **Extra content:** Magic Carpet, Kiddie Cars, Merry Mill, and Gyro Globe; the Inverted Coaster, Bobsled Run, and Monorail; corkscrew and helix track pieces; the Noodle Bar, Smoothie Bar, and Photo Booth; the Lightshow Tower and Fireworks Launcher. All unlock through research.
- **Accessibility:** keyboard play with a map cursor (`C`, arrows, `Enter`, `Shift` + arrows) and a shortcut list (`?`); screen reader headings, tables, dialogs, live announcements, and a description of the cursor tile; a colour-blind safe palette with check and cross icons, hatching, and full or notched temperament rings; high contrast; reduced motion; text scale 100% to 175%.
- **Settings menu:** audio volumes and mute, display, controls (pan speed, edge scrolling, long-press time), language, gameplay (autosave, confirm demolish, unlock all scenarios), data (export saves and progress, import and reset progress), and about. Stored in `tc.settings` and never reset silently.
- **Localization:** every text comes from a string table; plurals with `Intl.PluralRules`; numbers and money with `Intl.NumberFormat` and the `money.format` string; month names and the 12 h or 24 h clock from the table; command reasons from the simulation are shown in the current language. Languages: English and the pseudo-locale `en-XA` (accented, at least 30% longer), which tests use to find untranslated and clipped text. The completeness test blocks a language with a missing key or a placeholder mismatch.
- **Offline play:** a service worker caches each build under its own cache (`tc-<build id>`); the page loads from the network first, so an update never runs stale code. A new build waits until you pick **Reload** (your park is autosaved first) or **Later** on the "Update ready" toast. The Offline play setting turns it off. Web app manifest and app icons with Frost and Spark.
- **Performance:** a profiling overlay (`F3`), render quality (auto, high, low), sprite cache budgets per device, and the renderer and worker decisions in `docs/adr/`.
- Release checklist (`docs/release/build-3-checklist.md`) with an automated check (`node scripts/check-release.ts`).

### Changed
- Money, numbers, and the HUD date follow the selected language (English text is unchanged).
- Content names follow the selected language too: rides, track types and pieces, stalls, path items, staff, scenery themes and items, show sites, marketing campaigns, and scenario names and descriptions come from the string table (`content.*`), in pickers, panels, status bars, and messages. Refusal reasons in the build status bars are shown in the current language.
- Every placement ghost uses the colour-blind safe pair (blue for OK, vermillion for blocked), including scenery, land and water tools, the track builder, show sites, elevated paths, and patrol erasing; outlines are thicker with high contrast.
- Importing a progress file (Settings → Data) runs the same check as loading it and shows the same messages; a refused file changes nothing.
- Terrain is drawn in 8 × 8-tile chunks (was 16 × 16), so turning the view and panning on phones stays smooth (`docs/adr/0001-renderer.md`).

### Not yet checked by a person
Before the `build-3` tag the owner runs the manual steps of `docs/release/build-3-checklist.md`: the license choice, the browser and real-phone checks, a listening check of the generated audio, a play-test of the provisional numbers in `tuning-log.md` (Build 3 research costs, show lengths), and the service worker update flow on GitHub Pages with two deploys.

## Build 2 — "The Wide World"
Save schema 2. Build 1 saves load and upgrade.

### Added
- Terrain: raise, lower, smooth, level, and paint land; water; cliffs; map sizes from 64 × 64 to 256 × 256.
- Paths on slopes, elevated paths, and height-aware guest pathing.
- Water rides: Log Flume and Rapids Raft.
- Land and construction rights to buy.
- Scenery and gardens in 6 themed lands: Classic Fair, Frost Peaks, Volcano Ridge, Spooky Hollow, Jungle Lagoon, Starport.
- Calm and Buzz path values with map overlays (`V`).
- After Dark: day and night, lamps, lit rides, and a spooky-ride bonus.
- View rotation in 4 directions (`[` and `]`).
- 8 original scenarios with goals and Relaxed, Standard, and Tough presets; the sandbox; the tutorial; monthly awards; scenario progress stored apart from saves.

## Build 1 — "The Big Build"
Save schema 1.

### Added
- An isometric park on a 64 × 64 map with footpaths and queue paths, 14 flat rides, and 11 stalls and facilities.
- Guests with temperament (Chill to Thrill), needs, thoughts, and money; the Thrill/Chill balance bar.
- The track builder for 7 track ride types with train physics, test runs, and ratings.
- Staff, litter, vandalism, breakdowns and repairs, research, marketing, loans, weather, park value, park rating, and the finance report.
- Saves in 3 slots, a monthly autosave, and file export and import.
- Desktop and touch controls with the same features.
