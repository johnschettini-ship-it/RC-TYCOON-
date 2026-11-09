# Changelog

Every public build of Thrills & Chills. A build keeps saves from the builds before it: older saves upgrade when they load (save schema 1 → 2 → 3). Settings and scenario progress are stored apart from saves.

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
