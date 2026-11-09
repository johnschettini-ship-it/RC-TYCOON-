# Phase 6 — Polish ("Lights and Sound")

- **Build:** 3. Save schema version 3, with a migration from version 2.
- **Status:** Draft for review.
- **Master spec:** `../2026-11-09-thrills-and-chills-design.md`. **Content numbers:** `content-catalog.md`.

---

## 1. Goal
The game sounds alive, looks good at night, plays well on every device, and is open to more players. Phase 6 adds generated audio, After Dark shows, extra content, performance work, accessibility, localization, a settings menu, and optional offline play.

## 2. Depends on
| Phase | What Phase 6 uses |
|---|---|
| 0–1 | Loop, renderer interface, sprite cache, UI layer, guests, ledger, thoughts. |
| 2 | Track system and piece rules (new pieces and track types). |
| 3 | Research categories, weather states (rain sound), breakdowns. |
| 4 | After Dark (clock, lighting pass, lit tiles), scenery themes (music per theme), water rides (splash). |
| 5 | Title screen, settings entry point, progress storage, awards. |

**Interface Phase 6 needs:** `tick()` returns a list of `SimEvent`s for that tick (for example `built`, `demolished`, `sale`, `rideCycleStart`, `trainDrop`, `splash`, `breakdown`, `award`, `showStart`). Events are not saved. Audio and UI consume them.

## 3. Scope
1. Web Audio engine with synthesized sound effects and procedural music.
2. After Dark shows: Lightshow and Fireworks Finale.
3. Extra content: 4 flat rides, 3 track ride types, 2 track pieces, 3 stalls, 2 show sites.
4. Performance: profiling tools, budgets, renderer and worker decision rules, cache limits.
5. Accessibility: keyboard play, screen readers, safe palettes, reduced motion, text scale, touch targets.
6. Localization framework with no runtime dependency.
7. Settings menu.
8. Optional offline play with a service worker.
9. Release checklist for Build 3.

---

## 4. Detailed design

### 4.1 Audio engine
- Module `src/audio/`. It reads `GameState` and `SimEvent`s. It never writes state.
- **Unlock:** the `AudioContext` is created on the first `pointerdown` or `keydown`. This is required on phones. Before that, the game is silent.
- **Graph:** sources → bus gain (`ui`, `sfx`, `ambience`, `music`) → master gain → `DynamicsCompressorNode` → output.
- **Hidden tab:** on `visibilitychange` to hidden, master gain ramps to 0 in 100 ms, then `ctx.suspend()`. On visible, `ctx.resume()` and ramp back.
- **Voices:** max 24 SFX voices. When full, the new sound steals the oldest voice with lower or equal priority. If none exists, the new sound does not play.
- **Cooldown:** the same SFX id plays at most once per 60 ms.
- **Position:** a world sound uses the distance `d` (tiles) from the camera centre.
  - `R = 24 / zoom` tiles. `gain = (max(0, 1 − d / R))²`. No sound when `d ≥ R`.
  - Stereo pan = `clamp(dxScreen / (viewportWidth / 2), −1, 1) × 0.6` through a `StereoPannerNode`.
- **Randomness:** audio uses its own seeded RNG, separate from the sim RNG. Audio never changes the sim.

### 4.2 Sound effects
All sounds are synthesized at runtime. The game ships no audio files.

| id | Trigger | Recipe | Length | Bus | Priority |
|---|---|---|---|---|---|
| `ui_click` | Button press | Sine 1,200 → 800 Hz glide; attack 2 ms, decay 40 ms; peak 0.3 | 45 ms | ui | 1 |
| `ui_open` | Panel opens | Sines 660 + 990 Hz, +5% glide | 60 ms | ui | 1 |
| `ui_error` | Command fails | Square 220 → 180 Hz, low-pass 1.5 kHz, 2 pulses | 240 ms | ui | 2 |
| `build_place` | Ride, stall, scenery placed | White-noise burst, band-pass 800 Hz Q 1.5 + sine thump 110 → 60 Hz | 150 ms | sfx | 3 |
| `build_path` | Path tile built | Noise tick, band-pass 2 kHz; max 8 per second | 30 ms | sfx | 1 |
| `demolish` | Object removed | Brown noise, low-pass sweep 2 kHz → 200 Hz + 3 thumps | 400 ms | sfx | 3 |
| `cash_in` | Sale or ticket near camera | Triangle 1,319 Hz then 1,976 Hz, 50 ms each | 100 ms | sfx | 1 |
| `ride_bell` | Ride cycle starts | FM bell: carrier 880 Hz, ratio 3.5, index 4 → 0 | 1 s | sfx | 2 |
| `coaster_chain` | Train on a lift (loop) | 5 ms high-pass noise clicks; rate = lift speed × 4 per metre | loop | sfx | 2 |
| `coaster_rumble` | Moving train (loop, max 4) | Brown noise; low-pass 150–600 Hz and gain mapped to speed | loop | sfx | 2 |
| `coaster_cheer` | Drop > 10 m with riders | 3–6 detuned saw voices 300 → 500 → 350 Hz; formants 700 Hz + 1,200 Hz; vibrato 6 Hz | 800 ms | sfx | 3 |
| `splash` | Flume or rapids splash | Noise burst, band-pass sweep 3 kHz → 600 Hz + sine 400 → 120 Hz | 600 ms | sfx | 3 |
| `breakdown` | Ride breaks down | Sines 523, 811, 1,247 Hz with fast decay + noise fizz | 500 ms | sfx | 4 |
| `award` | Award at month end | Triangle arpeggio, 4 notes up (positive) or down (negative) | 600 ms | ui | 4 |
| `rain` | Rain or storm (loop) | Pink noise, high-pass 400 Hz, low-pass 6 kHz; gain = intensity | loop | ambience | — |
| `thunder` | Storm, random | Noise burst, low-pass 120 Hz, decay 2.5 s | 2.5 s | ambience | 3 |
| `crowd` | Guests on screen (loop) | Band noise 300–3,000 Hz, amplitude modulation 0.3–0.7 Hz; gain = log of visible guests | loop | ambience | — |
| `fw_launch` | Firework launch | Sine 600 → 1,800 Hz glide | 800 ms | sfx | 2 |
| `fw_burst` | Firework burst | Noise burst low-pass 1.5 kHz + random 2 ms clicks over 1 s | 1.3 s | sfx | 2 |
| `light_swoosh` | Lightshow beam sweep | Filtered noise, band-pass sweep 500 → 4,000 Hz | 700 ms | sfx | 1 |

### 4.3 Procedural music
- One generator, `src/audio/music.ts`. Input: theme id and a seed. Output: a list of note events. Same input gives the same notes (tested).
- **Form:** 8-bar phrases in the order A A B A. Chords come from a per-theme chord table with a Markov transition table. Melody notes come from the theme scale, mostly in steps (≤ 2 scale degrees), and land on a chord tone on beats 1 and 3. Bass plays chord roots on beats 1 and 3. Drums: sine kick, noise snare, high-pass noise hat.
- **Scheduler:** a 25 ms timer schedules notes 100 ms ahead on the audio clock.
- **Theme choice:** the theme with the most scenery items in view. Default: Classic Fair. A theme change crossfades over 4 s. The title screen uses the Title theme.
- **Night variant:** with After Dark at night, tempo ×0.85, lead low-pass 1.5 kHz, and a generated reverb (impulse = decaying noise, 2 s).

| Theme | Scale | Tempo | Metre | Lead | Pad / feel |
|---|---|---|---|---|---|
| Title | C major | 104 | 4/4 | Triangle + square mix | Bright; original 4-note motif C–E–G–A |
| Classic Fair | F major | 120 | 3/4 | Triangle | Waltz bass |
| Frost Peaks | E minor pentatonic | 84 | 4/4 | Sine bells | Soft pad, sparse drums |
| Volcano Ridge | A minor | 132 | 4/4 | Saw, low-pass 2.5 kHz | Driving eighth notes |
| Spooky Hollow | D harmonic minor | 92 | 6/8 | Detuned square | Tremolo pad |
| Jungle Lagoon | G mixolydian | 108 | 4/4 swing | Sine with 4th harmonic, fast decay | Shuffle percussion |
| Starport | E minor | 116 | 4/4 | Saw arpeggio with delay | Sixteenth-note arps |

### 4.4 After Dark shows
- Shows need After Dark on. Two **show sites** exist (stats in 4.5).
- **Schedule** per site: start time 20:00–23:30 in 30-minute steps; every 1, 2, or 3 days; enabled or disabled.
- **States:** `idle → announced → running → done → idle`. The show is announced 1 game hour (50 ticks) before it starts.
- **Cost:** charged at show start to the new ledger category `shows`. If cash is below the cost (and money is not unlimited), the show is cancelled, a toast says "Not enough cash for the show", and nothing is charged.
- **Gathering:** at the announcement, each guest who is walking (not queueing, riding, or buying), has energy ≥ 40, and is within 20 tiles of walking distance decides with the sim RNG. Chance 0.5, plus 0.2 if temperament matches (Lightshow: ≤ 40; Fireworks: ≥ 60). Watchers walk to **viewing tiles** (footpaths within the show radius) through a distance field, then stand and watch.
- **Effect:** each watcher gains +1 happiness per second (20 ticks) of the show, max +40 per show. Matching temperament gains ×1.3. After the show, the guest thinks `thought.greatShow`.
- **Arrivals:** a park with ≥ 1 show per night gets arrivals ×1.05 from 20:00 to 24:00.
- **Rendering (render only, not sim):**
  - Lightshow: 6 beams from the tower top, `lighter` composite, colours cycle through the theme palette, sweep 30° per second.
  - Fireworks: rockets, then bursts of 40–80 particles with gravity and fade. Max 600 particles. Particles use a render RNG seeded by `(showId, startTick)`, so replays look the same.
  - Reduced motion: beams stay still and pulse slowly; fireworks become soft glow circles.

### 4.5 Extra content (final stats)
These tables replace section 8 of `content-catalog.md` when Phase 6 starts. The catalog is updated first, then `src/data/`.

**Flat rides**
| id | Name | Ph | Unlock | Tag | Flags | Size | Exc | Int | Nau | Cap | Cycle | Build | Run/mo | Price |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `magic_carpet` | Magic Carpet | 6 | Thrill | thrill | — | 4×3 | 5.20 | 6.00 | 3.80 | 20 | 25 | $3,600 | $100 | $3 |
| `kiddie_cars` | Kiddie Cars | 6 | Gentle | family | — | 3×3 | 2.20 | 0.60 | 0.20 | 12 | 20 | $1,000 | $30 | $1 |
| `merry_mill` | Merry Mill | 6 | Gentle | chill | lit | 3×3 | 3.20 | 1.20 | 0.80 | 16 | 30 | $2,200 | $60 | $2 |
| `gyro_globe` | Gyro Globe | 6 | Thrill | thrill | lit | 3×3 | 7.00 | 8.50 | 7.00 | 8 | 25 | $6,000 | $160 | $5 |

**Track ride types**
| id | Name | Ph | Unlock | Tag | Flags | Drive | Seats/car | Cars/train | Max trains | Max height | Piece set | Price |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `inverted_coaster` | Inverted Coaster | 6 | Coasters | thrill | — | gravity + chain lift | 4 | 3–8 | 3 | 45 m | Steel set + corkscrew + helix; riders hang below the track | $6 |
| `bobsled_run` | Bobsled Run | 6 | Coasters | thrill | — | gravity + chain lift | 2 | 1–4 | 4 | 25 m | flat, gentle and steep down, banked turns, helix; no loop | $4 |
| `monorail` | Monorail | 6 | Gentle | chill | lit | powered, 8 m/s | 6 | 3–6 | 4 | 12 m | flat, gentle slopes, turns; up to 4 stations | $2 |

**Track pieces** (cost as a multiple of the straight piece cost of the same track type, Phase 2)
| Piece | Track types | Footprint | Height change | Inversions | Min entry speed | Cost |
|---|---|---|---|---|---|---|
| Corkscrew (left, right) | Steel, Inverted | 3 tiles straight | 0 | 1 | 10 m/s | ×3 |
| Helix (left, right; up, down) | Steel, Inverted, Bobsled | 3×3, 360° turn | ±4 m | 0 | — | ×5 |

**Stalls**
| id | Name | Ph | Unlock | Kind | Build | Run/mo | Price | Stock/sale | Effect on guest | Weather sales factor |
|---|---|---|---|---|---|---|---|---|---|---|
| `noodle_bar` | Noodle Bar | 6 | Shops | food | $550 | $25 | $4.50 | $1.60 | hunger −170 | cold ×1.3, hot ×0.8 |
| `smoothie_bar` | Smoothie Bar | 6 | Shops | drink | $450 | $20 | $3.00 | $0.90 | thirst −140, energy +20 | hot ×1.5, cold ×0.6 |
| `photo_booth` | Photo Booth | 6 | Shops | souvenir | $500 | $20 | $4.00 | $0.80 | gives photo: happiness +10; want ×2 within 6 tiles of a ride exit with excitement ≥ 5.00 | — |

**Show sites**
| id | Name | Ph | Unlock | Size | Build | Run/mo | Cost per show | Radius | Show length |
|---|---|---|---|---|---|---|---|---|---|
| `lightshow_tower` | Lightshow Tower | 6 | Scenery | 2×2 | $2,500 | $40 | $150 | 8 tiles | 300 ticks (15 s) |
| `fireworks_launcher` | Fireworks Launcher | 6 | Scenery | 1×1 | $1,500 | $20 | $400 | 12 tiles | 400 ticks (20 s) |

### 4.6 Performance
- **Profiling tools:** a performance overlay (key `F3` or a setting) shows fps, frame time p50/p95, tick time p50/p95, `drawImage` calls per frame, sprite cache size in MB, and entity counts.
- **Benchmark scenes:** 3 fixed saves in `tests/perf/`: Build 1 park (2,000 guests, 10 track rides); Build 2 park (128 × 128, 3,000 guests, 2 shows); phone park (800 guests).
- **Method:** a Playwright perf run loads each scene, runs 30 s at 1×, and records frame and tick times. The phone run uses 4× CPU throttling. Before release, one manual check runs on a real mid-range Android phone and a real iPhone.

| Target | Budget |
|---|---|
| Desktop, Build 2 scene | p95 frame ≤ 20 ms; tick p95 ≤ 4 ms |
| Phone scene, 4× throttle | p95 frame ≤ 40 ms |
| JS heap | ≤ 250 MB desktop; ≤ 150 MB phone |
| Initial load | < 400 KB gzipped JS + CSS (master budget) |

- **Work order:** (1) culling and chunk caches (exist), (2) sprite atlases per zoom bucket, (3) guest level of detail: below zoom 0.5, guests draw as small coloured rectangles batched by colour, (4) skip redraw of unchanged static layers, (5) Web Worker simulation, (6) PixiJS renderer.
- **PixiJS decision rule:** adopt only if, after steps 1–4, the phone scene p95 frame > 40 ms in 2 of 3 runs **and** the profile shows ≥ 50% of frame time in canvas drawing. Then add `PixiRenderer` behind the `Renderer` interface and keep the Canvas renderer as the fallback when WebGL is missing. If the bundle budget breaks, the owner must approve a new budget. The decision goes in `docs/adr/0001-renderer.md`.
- **Web Worker simulation rule:** adopt only if desktop tick p95 > 4 ms, or main-thread long tasks (> 50 ms) occur more than once per 10 s.
  - The worker runs the same `tick()`. The main thread stamps each command with `targetTick = latestTick + 1`; the worker applies it at that tick.
  - Each tick, the worker posts a render view (positions and sprite ids in transferable typed arrays, double-buffered). Panels request full entity data on demand.
  - A test runs one script in main-thread mode and in worker mode and compares state hashes.
- **Sprite cache limits:** an LRU cache with a byte budget (`width × height × 4` per canvas; terrain chunks count). Phone (`pointer: coarse`, or `navigator.deviceMemory ≤ 4` when present): 64 MB, max 3 zoom buckets, render scale capped at 2× device pixels. Desktop: 192 MB.

### 4.7 Accessibility
- **Keyboard play:** logical tab order through HUD, toolbar, and panels. A visible focus ring (3 px). Key `C` toggles a **map cursor**; arrow keys move it; `Enter` acts as a click at the cursor; `Shift` + arrows extend a path drag; `R` rotates; `Esc` cancels. Key `?` opens the shortcut list. All Phase 1 shortcuts stay.
- **Screen readers:** panels use headings, `<dl>` for stats, and tables for lists. Dialogs use `role="dialog"` with `aria-labelledby`. Toasts, awards, and month-end summaries go to an `aria-live="polite"` region. The canvas has an `aria-label`; a text line describes the cursor tile ("Tile 12, 30: footpath, 3 guests, next to Carousel").
- **Colour:** all palettes are colour-blind safe by default (blue–orange family: `#0072B2`, `#56B4E9`, `#E69F00`, `#D55E00`). Colour is never the only signal: a valid ghost has a check icon; an invalid ghost has a cross icon and a hatch pattern; Chill guests have a full ring and Thrill guests a notched ring. A **High contrast** setting thickens outlines and darkens panel backgrounds.
- **Reduced motion:** follows `prefers-reduced-motion`, with a setting to override. It turns off camera inertia, UI transitions, guest bobbing, beam sweeps, and firework bursts.
- **Text scale:** 100%, 125%, 150%, 175%. Nothing clips at 175% on 1280 × 720 and 375 × 667. Long panels scroll.
- **Touch:** targets ≥ 44 × 44 CSS px (primary buttons 48), 8 px gaps, long-press 500 ms (setting: 400 / 500 / 700), drag threshold 8 px.
- **Sound cues:** every important sound (breakdown, award, error) also has a visible toast.

### 4.8 Localization
- **String tables:** `src/i18n/en.ts` exports one object. Keys are dotted ids. Values are strings with `{name}` placeholders, or plural objects.
```ts
export const en = {
  'hud.cash': 'Cash',
  'toast.notEnoughCash': 'Not enough cash',
  'hud.guests': { one: '{n} guest', other: '{n} guests' },
} as const;
```
- `t(key, params)` resolves strings. Plurals use the built-in `Intl.PluralRules` (categories zero, one, two, few, many, other). No runtime library.
- **Numbers and money:** `Intl.NumberFormat` for grouping; the game currency sign comes from the string table key `money.format` (`'${amount}'` in English). Month names and the clock format (12 h or 24 h) come from the string table, because the game calendar is not a real calendar.
- **Sim rule:** the sim stores no display text. Thoughts, toasts, and reasons are ids with parameters. Data definitions have `nameKey`. Names typed by the player stay as typed.
- **Missing key at runtime:** show the English text and log a warning. CI blocks any shipped locale with a missing key or a placeholder mismatch.
- **Locales in Build 3:** English, plus pseudo-locale `en-XA` (accented, 30% longer) for layout tests. Right-to-left scripts are out of scope.
- **Add a language:** (1) copy `en.ts` to `<code>.ts`; (2) translate every value and keep placeholders; (3) add the code to `src/i18n/index.ts`; (4) run `npm test` (completeness test); (5) check screens at 175% text scale.
- **Language choice:** `navigator.language` matched to available locales, else English. The setting overrides it.

### 4.9 Settings menu
| Section | Settings |
|---|---|
| Audio | Master, Music, Sound effects, Ambience, Interface volume (0–100); Mute all |
| Display | Text scale; High contrast; Reduced motion (auto/on/off); Render quality (auto/high/low); Performance overlay |
| Controls | Pan speed; Edge scrolling (desktop); Long-press time |
| Language | Locale list |
| Gameplay | Autosave on/off; Confirm demolish; Unlock all scenarios |
| Data | Export all saves; Export progress; Import progress; Reset progress (confirm) |
| About | Version, credits, originality statement, license |

- **Store:** `localStorage` key `tc.settings`: `{ "format": "thrills-and-chills-settings", "version": 1, "values": { … } }`, validated like saves.
- First run: built-in defaults. Unreadable settings: a notice "Settings could not be read" with **Reset settings**. Until the player acts, the game uses defaults in memory and does not overwrite the stored data.

### 4.10 Offline play
- A hand-written service worker `public/sw.js` and a web manifest. No extra dependency.
- A small Vite plugin writes `sw-manifest.json` at build time: the build id and every hashed asset URL.
- **Cache rules:** cache name `tc-<buildId>`. Install precaches `index.html` and all hashed assets. Activate deletes every other `tc-*` cache. Hashed assets: cache first. `index.html`: network first, cache fallback. Saves live in `localStorage` and are never in the cache.
- **Update:** a new worker waits. A toast says "Update ready" with **Reload**. Reload runs after an autosave.
- Scope is the Pages base path (`/RC-TYCOON-/`). The worker is off in `npm run dev`. Setting **Offline play** (default on) unregisters the worker when turned off.
- **Icons:** SVG icon with Frost and Spark. PNG sizes (180, 192, 512) are made once by `scripts/make-icons.ts` with Playwright and committed.

### 4.11 Release checklist (Build 3)
1. Every Phase 6 "done when" item is checked. CI is green.
2. Perf runs meet section 4.6 budgets, or the gap and plan are written in the release notes.
3. Accessibility scan has no serious or critical issues.
4. Manual checks pass on desktop Chrome, Firefox, and Safari, and on Android Chrome and iOS Safari.
5. Fixture saves from Build 1 and Build 2 load (1 → 2 → 3). A Build 2 progress file loads.
6. The service worker update flow works on the Pages URL.
7. Originality review: no third-party names, art, audio, or data in the repo.
8. `gameVersion` is `3.0.0`. CHANGELOG and README are updated. The owner's license file exists.
9. Tag `build-3` and publish release notes.

---

## 5. State and entity changes (schema version 3)
| Change | Detail |
|---|---|
| `ShowSite` entity | id, defId, x, y, rotation, schedule `{ hour, minute (0 or 30), everyNDays (1–3), enabled }`, status, nextShowTick, totals `{ shows, cost, watchers }` |
| Guest | new state `watchingShow`, field `showTarget`, item `photo` |
| Ledger | new category `shows` |
| New definitions | content in 4.5 (no new state beyond entity `defId` values) |

**Migration 2 → 3:**
- Add `shows: []`.
- Add `shows: 0` to every existing ledger month. This is a true value: shows did not exist before Build 3.
- Guests, rides, and other entities stay unchanged.
- A Build 1 save runs 1 → 2 → 3.

Settings and progress are not in saves.

## 6. Commands added
| Command | Valid when | Effect |
|---|---|---|
| `placeShowSite { defId, x, y, rotation }` | unlocked, tile valid, cash enough | Builds the site; schedule starts disabled at 21:00, every day. |
| `setShowSchedule { id, hour, minute, everyNDays }` | hour 20–23, minute 0 or 30, N 1–3 | Changes the schedule. |
| `setShowEnabled { id, enabled }` | site exists | Turns shows on or off. |

Demolish uses the existing `demolish` command. Audio, settings, and language are not sim state and use no commands.

## 7. UI
- **Settings screen:** side tabs on desktop; a full-screen sheet with a section list on phone. Sliders have 44 px thumbs.
- **Show site panel:** schedule (hour and minute steppers, every-N-days picker), enabled switch, cost per show, last show watchers, total cost.
- **Performance overlay:** top-left text block; hidden by default.
- **Map cursor:** a dashed diamond on the cursor tile; the HUD shows the tile description.
- **Update toast:** stays until the player picks **Reload** or **Later**.

## 8. Tuning constants
| Constant | Value |
|---|---|
| Volume defaults (master / music / sfx / ambience / ui) | 80 / 50 / 80 / 60 / 70 |
| Max SFX voices / same-id cooldown | 24 / 60 ms |
| Falloff radius at zoom 1 / pan width | 24 tiles / 0.6 |
| Music lookahead / timer / theme crossfade | 100 ms / 25 ms / 4 s |
| Show announce lead | 50 ticks (1 game hour) |
| Watch chance / temperament bonus / energy minimum | 0.5 / +0.2 / 40 |
| Watch happiness / cap / match factor | +1 per s / +40 / ×1.3 |
| Night arrivals with shows | ×1.05 (20:00–24:00) |
| Max firework particles | 600 |
| Sprite cache budget (phone / desktop) | 64 MB / 192 MB |
| Long-press / drag threshold | 500 ms / 8 px |

## 9. Tests
- **Unit:** audio graph wiring with a fake `AudioContext`; voice stealing and cooldown; falloff and pan math; music generator gives the same notes for the same seed and only scale notes; show state machine and schedule ticks; show cancelled without cash; gathering is deterministic; happiness cap; migration 2 → 3 with fixture saves; i18n completeness and placeholder match; plural rules; settings validation; `sw-manifest.json` lists every hashed asset; LRU eviction by bytes.
- **Integration:** one night with 2 shows → `shows` ledger total, watchers, equal state hash on a second run; worker mode and main-thread mode give equal hashes (if the worker is adopted).
- **Playwright desktop:** a volume change persists after reload; keyboard-only flow builds a path with the map cursor and opens a ride panel; accessibility scan of title, HUD, and panels (dev dependency `@axe-core/playwright`, used only in tests); `en-XA` at 175% shows no element outside the viewport; offline reload loads the game.
- **Playwright phone:** the first tap moves `AudioContext.state` to `running`; every button is ≥ 44 × 44 px; reduced-motion emulation draws glow instead of fireworks; perf run with 4× throttle reports p95 frame time.

## 10. Done when
- [ ] Every SFX in 4.2 and every music theme in 4.3 plays, with no audio files in the build.
- [ ] Both show types run on schedule, charge the ledger, and gather guests.
- [ ] All extra content is in the catalog and in `src/data/`, and passes its tests.
- [ ] Perf budgets in 4.6 are met, or the gap is documented with the PixiJS and worker decisions recorded.
- [ ] Keyboard-only play can build, inspect, and save.
- [ ] Accessibility scan is clean of serious and critical issues.
- [ ] `en-XA` passes the layout test; adding a language follows 4.8.
- [ ] Offline play and the update flow work on GitHub Pages.
- [ ] The release checklist in 4.11 is complete. CI is green.

## 11. Risks and open questions
| Risk | Mitigation |
|---|---|
| Web Audio differs on iOS Safari | Unlock on first tap; manual iOS check in the release checklist. |
| Procedural music sounds repetitive | A B sections, per-theme tables, night variant; music volume defaults to 50. |
| Worker mode adds complexity | Adopt only by the decision rule; hash-equality test. |
| A stale service worker serves an old build | Build-id cache names, network-first `index.html`, update toast. |
| Canvas content is hard for screen readers | Text description of the cursor tile; all data also in panels and tables. |
| String extraction misses text | Sim stores ids only; CI completeness test; pseudo-locale shows untranslated text. |

**Open question for the owner:** which second real language (if any) should Build 3 ship?
