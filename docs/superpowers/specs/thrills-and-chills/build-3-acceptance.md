# Build 3 acceptance audit (Phase 6)

Audit of every "Done when" line in `phase-6-polish.md` (§10) at the Build 3 release gate (Wave 4, delivery plan),
done on 2026-11-09 by the Build 3 gate agent on top of `c09c8ca` (Phases 0–6 merged) plus the gate commits on the
same branch. The Build 2 lines (Phases 4–5) are in `build-2-acceptance.md`; the release checklist with its status
is `docs/release/build-3-checklist.md`.

**Result: 9 lines — 7 PASS, 2 GAP.** Both gaps need the owner: the service worker update flow on the GitHub Pages
URL with two deploys, and the rest of the release checklist (license, browser and real-phone checks, listening check,
play-test of the provisional numbers, the tag). Every automated part is green.

## How it was checked

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | clean |
| Unit + integration | `npx vitest run` | 247 files (1 skipped), 3,463 tests passed, 2 skipped (opt-in) |
| Build | `npx vite build` | JS 306.4 KB + CSS 7.5 KB gzipped (budget 400 KB) |
| Benchmarks | `npm run bench` | 6 files, 17 benchmarks run |
| Desktop + phone | `CI=1 PW_PORT=4801 npx playwright test --trace off` | 204 tests: 130 passed, 74 skipped (opt-in screenshot and perf scripts, tests for the other profile), 0 failed, no retries |
| Release check | `node scripts/check-release.ts` | no automated check failed; MANUAL and OWNER rows listed in the checklist |

"CI" means the same commands as `.github/workflows/ci.yml` run locally; GitHub Actions runs are not observable from
this environment (agents never push).

## Phase 6 — Polish ("Lights and Sound")

| # | Done when | Result | Evidence |
|---|---|---|---|
| 6.1 | Every SFX in 4.2 and every music theme in 4.3 plays, with no audio files in the build | PASS | `tests/unit/audio/recipes.test.ts` (a recipe for each of the 20 SFX ids), `engine.test.ts`, `voices.test.ts`, `loops.test.ts`, `mix.test.ts`, `cues.test.ts`, `shows.test.ts` (with a fake Web Audio graph); `tests/unit/music/generate.test.ts` (the 7 themes with scale, tempo, and metre), `player.test.ts` (night variant, crossfades), `sequencer.test.ts`, `choose.test.ts`; `tests/e2e/audio.spec.ts` (silent until the first gesture, sounds in play recorded in the played log, hidden tab, mute and volumes, no audio files in the build); `node scripts/check-release.ts` (no audio file tracked or built). The listening check stays an owner step (checklist item 4). |
| 6.2 | Both show types run on schedule, charge the ledger, and gather guests | PASS | `tests/integration/shows.test.ts` (one night with 2 shows: both run on schedule, the `shows` line is the show costs plus running costs exactly, guests gather and watch, deterministic); `tests/unit/shows/*` (schedule, gathering, placement, state, timeline, UI); `tests/e2e/shows.spec.ts` (desktop picker, panel schedule, a night show that gathers guests and charges the line; no-cash cancel toast; phone sheet and 44 px controls; reduced motion). |
| 6.3 | All extra content is in the catalog and in `src/data/`, and passes its tests | PASS | `tests/unit/core/build3-contracts.test.ts` (Phase 6 catalog rows), `tests/unit/content/flatAndStalls.test.ts`, `research.test.ts`, `tests/unit/track/phase6Rides.test.ts` (Inverted Coaster, Bobsled Run, Monorail, corkscrew, helix); `tests/e2e/content.spec.ts` (researched items in the pickers, corkscrew and helix from the palette). Names are `content.<id>` strings since this gate (`tests/unit/i18n/content.test.ts`). |
| 6.4 | Perf budgets in 4.6 are met, or the gap is documented with the PixiJS and worker decisions recorded | PASS | `docs/adr/0001-renderer.md` (keep Canvas 2D; merged build: phone scene at 4× CPU frame p95 33.3–33.4 ms in 3 of 3 runs, budget 40 ms; desktop frame p95 16.7–16.8 ms, budget 20 ms) and `docs/adr/0002-worker.md` (no worker: desktop tick p95 2.4–2.5 ms, budget 4 ms; no long tasks); initial load 306.4 + 7.5 KB gzipped (budget 400 KB). Documented gap: the measurements use a headless software-raster proxy; the real-phone check is an owner step (checklist item 4), and the Build 2 scene on the phone proxy reached p95 49.9 ms in one run (not a budget scene; ADR 0001). |
| 6.5 | Keyboard-only play can build, inspect, and save | PASS | `tests/e2e/keyboard.spec.ts`: title by keyboard, footpath with the map cursor and `Shift` + arrows, a Carousel from the picker placed with `Enter`, `Esc` to Inspect and `Enter` opens its panel, the shortcut list, save to slot 1 from the menu. |
| 6.6 | Accessibility scan is clean of serious and critical issues | PASS | `tests/e2e/a11y.spec.ts` (`@axe-core/playwright` on the title screens, HUD and panels, Build 2 tool bars and sheets, and with high contrast; every phone button ≥ 44 × 44 px) green in the run above. |
| 6.7 | `en-XA` passes the layout test; adding a language follows 4.8 | PASS | `tests/e2e/a11y.spec.ts` "175% text scale with a pseudo-localized UI" boots in `en-XA` at 175% (1280 × 720 and 375 × 667); `tests/unit/i18n/locales.test.ts` (every locale complete, placeholders match, `en-XA` ≥ 30% longer); `tests/e2e/i18n.spec.ts` (HUD switches at once, reasons localized, no hard-coded text on the title, scenario, HUD, panel, track, scenery, and show screens; content names no longer exempt); README "Add a language". |
| 6.8 | Offline play and the update flow work on GitHub Pages | GAP | Automated part PASS: `tests/unit/offline/*` (cache rules, manifest, registration and update flow, the real `vite build`), `tests/e2e/offline.spec.ts` (precache, offline reload, Update ready / Later / Reload with autosave, Offline play off), release check item 6 (`sw.js` carries the build id, every hashed asset listed). Not done: the two-deploy update flow on the Pages URL (G1). |
| 6.9 | The release checklist in 4.11 is complete. CI is green | GAP | CI commands green; `node scripts/check-release.ts` reports no automated failure. Owner and manual items remain (G2): license, browser checks, real-phone check, listening check, play-test of the provisional values, Pages update flow, the `build-3` tag and release notes. |

## Gaps

| Id | Line | Gap | Plan |
|---|---|---|---|
| G1 | 6.8 | The service worker update flow is not checked on the Pages URL. | Owner: deploy the release commit, then a second build, and run "Service worker update flow on Pages" in `docs/release/build-3-checklist.md` (needs Pages set to "GitHub Actions", master §12.3). |
| G2 | 6.9 | Owner actions of the release checklist. | Owner: choose the license (no license file until then, master §12.2); run the manual browser check on desktop Chrome, Firefox, Safari, Android Chrome, iOS Safari (includes the real-phone frame rate); listen to the title music, two themes, and the SFX; play-test the provisional values logged in `tuning-log.md` (Build 3 research costs, show lengths of 6–8 game hours, track type terms, mix levels) and record a Standard win of each scenario (Build 2 G1); originality review by hand; then `git tag build-3` and the release notes. |

## Changes made during this audit (Build 3 gate)

- Colour-blind safe ghost colours in every render layer (scenery, land and water tools, track builder, show sites,
  elevated paths, patrol erase), with thicker outlines in high contrast; a test scans `src/render/**` for the old
  red / green literals (`tests/unit/render/safeColours.test.ts`).
- Content names localized: `content.<id>` strings generated from the catalogs (and scenario names and descriptions),
  `contentName(id)` in the UI, catalog names in sim reasons and messages mapped back; status-bar refusal reasons go
  through `localizeReason`. `en-XA` translates them; the i18n e2e no longer exempts catalog names.
- `ProgressStore.importRaw` (strict check, the load errors, no write on a refused file); Settings → Data uses it.
- Version 3.0.0, CHANGELOG, README; the tuning log lists every provisional value; specs say 8 × 8 chunks.
- Overview screenshot `docs/screenshots/build3-overview.png` (`TC_SCREENSHOT=1 npx playwright test
  tests/e2e/overview-build3.spec.ts --project desktop`).
