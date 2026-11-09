# Build 3 release checklist — "Lights and Sound"

The release checklist of Phase 6 §4.11 for Build 3 (version 3.0.0, save schema 3). Each item says how it is checked and its status. The integrator ticks it at the Wave 4 gate; the owner gives the go for the tag.

**Automated part:** `node scripts/check-release.ts` builds `dist/`, runs the save and localization tests, checks that no done-when row below is still PENDING and that the acceptance audits exist, and prints a table of every check (PASS, FAIL, MANUAL, OWNER). It exits with code 1 when an automated check fails. Options: `--no-build` (use the `dist/` that is there), `--no-tests` (skip the Vitest runs). Paste its table into the release notes.

**Status words:** PASS (checked, with the commit), PENDING (waits for a Wave 4 card or the gate), MANUAL (a person runs the steps below), OWNER (the owner decides).

Status at the Wave 4 gate (2026-11-09, the gate branch on top of `c09c8ca`): every automated check is green; the rows still marked MANUAL or OWNER are the [owner actions](#owner-actions-before-the-build-3-tag). The audits of every "done when" line are `docs/superpowers/specs/thrills-and-chills/build-3-acceptance.md` (Phase 6) and `build-2-acceptance.md` (Phases 4–5).

## §4.11 items

| # | Item | How it is checked | Status |
|---|---|---|---|
| 1 | Every Phase 6 "done when" item is checked. CI is green. | The [done-when table](#phase-6-done-when) below, ticked at the gate; CI (`.github/workflows/ci.yml`: typecheck, unit and integration, build, Playwright desktop and phone) green on the release commit. Script: locale completeness (`tests/unit/i18n`). | PASS at the gate (done-when audit 7 PASS, 2 GAP owner; CI commands green locally); CI on the release commit OWNER |
| 2 | Perf runs meet the §4.6 budgets, or the gap and plan are in the release notes. | Script: initial load < 400 KB gzipped JS + CSS (master §10; 304.3 KB at the gate). W4-E: `tests/e2e/perf-build3.spec.ts` (desktop p95 frame ≤ 20 ms, tick p95 ≤ 4 ms; phone at 4× CPU throttle p95 ≤ 40 ms) and `docs/adr/0001-renderer.md`, `0002-worker.md`. | PASS (ADR 0001: phone scene p95 33.3–33.4 ms in 3 of 3 runs; desktop frame p95 16.7–16.8 ms, tick p95 2.4–2.5 ms; real phone in item 4) |
| 3 | Accessibility scan has no serious or critical issues. | W4-F: `tests/e2e/a11y.spec.ts` (`@axe-core/playwright` on the title, HUD, and panels) green in CI. Script: the spec exists. | PASS (green in the gate run) |
| 4 | Manual checks pass on desktop Chrome, Firefox, and Safari, and on Android Chrome and iOS Safari. | [Manual browser check](#manual-browser-check) on each browser, on the Pages URL, with the results written in the release notes. | MANUAL |
| 5 | Fixture saves from Build 1 and Build 2 load (1 → 2 → 3). A Build 2 progress file loads. | Script runs `tests/unit/save/migrate-v1.test.ts` (Build 1 fixtures through 1 → 2 → 3), `migrate-v2.test.ts` (`tests/fixtures/save-v2.tcsave.json`, written by the Build 2 code), and `progress-v2.test.ts` (`tests/fixtures/progress-v2.json`). | PASS (43 tests) |
| 6 | The service worker update flow works on the Pages URL. | Script: `dist/` has `sw.js` stamped with the build id, `sw-manifest.json` listing every hashed asset, the web manifest, and the icons. Unit: `tests/unit/offline/` (cache rules with a fake cache API, the real `vite build`, registration and update flow). Playwright: `tests/e2e/offline.spec.ts` (the build precaches itself; offline reload loads the game; a waiting worker shows "Update ready", Later hides it, Reload autosaves and hands over; Offline play off unregisters). Then the [update flow on Pages](#service-worker-update-flow-on-pages) by hand. | Build PASS; Pages flow MANUAL (after the first Build 3 deploy) |
| 7 | Originality review: no third-party names, art, audio, or data in the repo. | Script: every tracked file is scanned for names of other games, studios, and parks, for audio and font files, and for raster images other than the generated app icons and game screenshots. Then the [originality review](#originality-review) by hand. | Scan PASS; review MANUAL |
| 8 | `gameVersion` is `3.0.0`. CHANGELOG and README are updated. The owner's license file exists. | Script: `package.json` version (the save envelope's `gameVersion` comes from it); `CHANGELOG.md` has a Build 3 section; `README.md` covers Build 3 and the originality statement; a `LICENSE` file exists. | Version PASS (3.0.0); CHANGELOG PASS; README PASS; license OWNER (not chosen yet; no license file is added until then) |
| 9 | Tag `build-3` and publish release notes. | After the owner's go: `git tag build-3` on the release commit, push the tag, publish the release notes (the CHANGELOG Build 3 section, the script table, perf numbers, manual check results). Script: the tag exists. | PENDING (owner's go) |

## Phase 6 done when

| Done-when item (Phase 6 §10) | How it is checked | Card | Status |
|---|---|---|---|
| Every SFX in 4.2 and every music theme in 4.3 plays, with no audio files in the build. | W4-A unit tests (recipes, graph, voices) and manual check log; W4-B unit tests (themes, scale notes, form); script: no audio files in `dist/` and none tracked. | W4-A, W4-B | PASS (listening check: item 4) |
| Both show types run on schedule, charge the ledger, and gather guests. | W4-C unit and integration tests (`tests/integration/shows.test.ts`), `tests/e2e/shows.spec.ts`. | W4-C | PASS |
| All extra content is in the catalog and in `src/data/`, and passes its tests. | W4-D unit tests and `tests/e2e/content.spec.ts`. | W4-D | PASS |
| Perf budgets in 4.6 are met, or the gap is documented with the PixiJS and worker decisions recorded. | W4-E perf run and ADRs. | W4-E | PASS |
| Keyboard-only play can build, inspect, and save. | W4-F `tests/e2e/keyboard.spec.ts`. | W4-F | PASS |
| Accessibility scan is clean of serious and critical issues. | W4-F `tests/e2e/a11y.spec.ts`. | W4-F | PASS |
| `en-XA` passes the layout test; adding a language follows 4.8. | `tests/unit/i18n/locales.test.ts` (every locale complete, placeholders match, `en-XA` ≥ 30% longer); `tests/e2e/i18n.spec.ts` (switching changes the HUD, reasons localized, no unexpected hard-coded text); W4-F's 175% layout test boots in `en-XA` (`tests/e2e/a11y.spec.ts`); the README "Add a language" steps. | W4-G, W4-F | PASS |
| Offline play and the update flow work on GitHub Pages. | Item 6. | W4-G | Build and tests PASS; Pages MANUAL |
| The release checklist in 4.11 is complete. CI is green. | This file and `node scripts/check-release.ts`. | Integrator | Automated PASS; owner actions open |

## Manual browser check

Run on the Pages URL with a fresh profile (or after clearing site data) on: desktop Chrome, desktop Firefox, desktop Safari, Android Chrome, iOS Safari. Write browser, version, device, and the result of each step in the release notes.

1. The title screen shows Frost and Spark; no error in the console (desktop: open the developer tools).
2. **Sound:** before any click or tap, nothing plays; the first tap or key starts the title music (iOS: the mute switch is off). Button clicks make a sound.
3. **New game → free park:** build a footpath from the entrance, place a ride with a queue path and an exit path, open it; guests arrive and ride. The ride bell and sale sounds play near the camera.
4. **Touch (phones):** pan with one finger, pinch to zoom, long-press a ride to inspect it, a second finger during a path drag cancels the drag. Every button is easy to hit.
5. **Night show:** in a sandbox with After Dark on, place a Lightshow Tower or Fireworks Launcher, schedule it for 21:00, run to night: the show plays and guests gather. With reduced motion on (system setting or Settings → Display), it glows instead of bursting.
6. **Settings:** change the music volume and the text scale to 175%, reload: both are kept; nothing is cut off. Switch Language to `Pseudo-English`: dynamic text (HUD date, money, toasts) changes at once, and every text after a reload.
7. **Keyboard (desktop):** `C` shows the map cursor; arrows move it; `Enter` builds; `Shift` + arrows drags a path; `?` lists the shortcuts; save from the menu with the keyboard.
8. **Save and load:** save to a slot, reload the page, load it; export a save file and import it.
9. **Offline:** after the first visit, wait a few seconds, turn the network off (airplane mode), reload: the game starts and a new park runs. Turn the network back on.
10. **Install (optional):** "Add to Home Screen" (iOS) or "Install app" (Chrome) shows the Frost and Spark icon and opens the game full screen.

## Service worker update flow on Pages

Needs two deploys of different builds (for example the release commit and a later small change). Use desktop Chrome with the developer tools (Application → Service workers, Cache storage), then repeat steps 3–6 on a phone.

1. Open the Pages URL. Application → Service workers shows `sw.js` activated with scope `/RC-TYCOON-/`; Cache storage has exactly one `tc-<build id>` cache, with `/RC-TYCOON-/`, the hashed `assets/`, the icons, and the web manifest. The build id equals `buildId` in `/RC-TYCOON-/sw-manifest.json`.
2. Start a park and play for a minute (unsaved changes).
3. Deploy the second build. Keep the tab open; switch to another tab and back (the game checks for a new build when the tab becomes visible, and every hour).
4. The "Update ready" toast appears with **Reload** and **Later**, and stays. The new worker is "waiting to activate"; Cache storage now holds both caches.
5. Pick **Later**: the toast goes away and play continues. Switch tabs away and back: it does not come back for the same build.
6. Reload the page by hand: the page comes from the network (Network tab: `index.html` from the server, not "(ServiceWorker)" cache), so the second build's code runs; the toast shows again because the new worker still waits.
7. Pick **Reload**: the park is saved to the autosave slot first (title → Continue shows it), the page reloads once, the new worker is active, and only the new `tc-<build id>` cache is left.
8. Offline after the update: turn the network off and reload; the second build starts from the cache.
9. Settings → Offline play off: the worker is unregistered and the `tc-*` caches are gone. On again: the worker registers on the next load.

Never acceptable: a reload online that runs the old build's code; two `tc-*` caches after the new worker activates; a reload that loses unsaved changes without a save.

## Originality review

1. Read `src/data/` names (rides, stalls, scenery, scenarios, staff, campaigns, thoughts, awards) and the README: every name is original; none is the name of a ride, park, game, or company.
2. Look at the title, every toolbar icon, the mascots, and a sample of ride, stall, scenery, and show art in game: all drawn in code (`src/render/`, `src/ui/`), none copied.
3. Listen to the title music, two theme tracks, and the sound effects: generated in code (`src/audio/`); no audio files are tracked or built (the script checks).
4. Check that no data file came from another game (maps, scenarios, ride stats): scenarios are in `src/data/scenarios/` and follow `phase-5-scenarios.md`.
5. Record the result and the reviewer in the release notes.

## Owner actions before the `build-3` tag

Nothing below can be done by an agent; each needs the owner (or a person the owner asks).

1. **License:** choose one (master §12.2) and add the file; the script then turns item 8 to PASS.
2. **Manual browser check** (item 4) on desktop Chrome, Firefox, Safari, Android Chrome, and iOS Safari, on the Pages URL. It includes the **real-phone measurement** (frame rate on a mid-range phone; ADR 0001 used a 4× CPU proxy).
3. **Listening check:** the title music, two theme tracks (day and night), and the sound effects (Phase 6 §10 line 1); the mix levels in `tuning-log.md` are starting values.
4. **Play-test** of the provisional values in `docs/superpowers/specs/thrills-and-chills/tuning-log.md` (Build 3 research costs, R25; show lengths of 6–8 game hours; the show happiness cap; Build 3 track type terms), and a recorded **win on Standard** of each of the 8 scenarios (Build 2 audit G1).
5. **GitHub Pages:** Settings → Pages → Source "GitHub Actions" (master §12.3), then **two deploys** of different builds and the [update flow on Pages](#service-worker-update-flow-on-pages) (item 6).
6. **Originality review** by hand (item 7).
7. CI green on the release commit on GitHub, then `git tag build-3`, push the tag, and publish the release notes (item 9).

## Known gaps carried into Build 3

- The title logo wordmark (the brand name, `aria-hidden`) and the default park name of the boot world behind the title screen are not translated; `tests/e2e/i18n.spec.ts` lists them as known gaps, and any other plain English on screen fails the test.
- Names stored in the game state (rides and stalls are named "Carousel 1" when built, staff names, park names) are game data like a name the player types: they stay as they were made. Catalog names (`content.<id>`) and scenario names and descriptions follow the language since the gate.
- Text built when the UI mounts changes language at the next reload; dynamic text changes at once.
