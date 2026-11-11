# Build 4 acceptance audit (Phase 7)

Audit of every "Done when" line of `phase-7-frost-and-spark-interface.md` (§11) at the Build 4 release gate (Task 14
of the Phase 7 plan), on 2026-11-11, on branch `ccr-6f420895-3xt45j` (version 4.0.0). The extra work of the build
(the polish task and the new title screen) is in its own section; the decisions taken during the build are listed at
the end.

**Result: 10 lines — 9 PASS, 1 OPEN.** The open line needs the owner: "The owner has accepted the screenshots."
Every automated part is green.

## How it was checked

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | clean |
| Unit + integration | `npm test` | 3,578 passed, 2 skipped (baseline at the start of Task 14: 3,572 passed, 2 skipped) |
| Build | `npm run build` | first load 352.7 KB gzipped: JavaScript 342.7 KB + CSS 10.1 KB (budget 400 KB) |
| Desktop + phone | `npm run e2e` (projects `desktop` 1280 × 800 and `phone` Pixel 7) | 267 passed, 115 skipped (opt-in screenshot and perf scripts, tests for the other project), 0 failed (baseline at the start of Task 14: 262 passed, 112 skipped) |
| Performance | `TC_PERF=1 npx playwright test tests/e2e/perf.spec.ts tests/e2e/perf-build3.spec.ts` | 9 passed, 5 skipped (scenes of the other project): desktop 2,000 guests, phone 800 guests at CPU 4×, scenes build1, build2, phone |
| Release check | `node scripts/check-release.ts --no-build` | no automated check failed; MANUAL and OWNER rows remain |

"CI" means the same commands as `.github/workflows/ci.yml` run locally; GitHub Actions runs are not observable from
this environment.

Sizes: the JavaScript bundle is 342.7 KB gzipped (the four title pictures are data in it); the font files are
`fredoka-latin-wght-normal.woff2` 29,732 bytes and `fredoka-latin-ext-wght-normal.woff2` 4,576 bytes (SIL OFL 1.1,
licence in `src/assets/fonts/fredoka/LICENSE`).

## Phase 7 — Interface ("Frost and Spark")

| # | Done when (§11) | Result | Evidence |
|---|---|---|---|
| 7.1 | The game screen has no toolbar and no picker panel; every old tool works from its new place | PASS | `tests/e2e/decks.spec.ts`: "no toolbar named Tools is on the screen", "{id} selects its tool from its new place", "{id} opens its panel from its new place", "overlays, shows, temperament, and menu work from their new places"; `tests/unit/ui/decks.test.ts` (each of the 21 old tool ids has exactly one new place; each extension entry names a deck); `src/ui/toolbar.ts` and `src/ui/panels/picker.ts` are deleted. |
| 7.2 | The mood bar, the faces, and the lean text follow the guest mix | PASS | `tests/unit/ui/mood.test.ts` (lean, knot, text at −100 … 100 and no guests, faces, the segment percentage beside the knot); `tests/unit/ui/tips.test.ts` (the under-served group that sets the faces); `tests/e2e/interface.spec.ts`: "the mood bar names the balance and toggles the Temperament overlay", "the mood bar and the weather button have a name before the first frame". |
| 7.3 | A player can build a ride with press-then-press on desktop and phone, and with a drag on desktop | PASS | `tests/e2e/decks.spec.ts`: "hold the Carousel card and place it: one ride, cash falls by $1,200" (both projects), "a track ride card starts the station builder", "Put back, Esc, and Cancel select Inspect", "a drop on a valid tile builds the ride", "a drop on a blocked tile builds nothing and shows the reason", "a drop on the UI builds nothing", "pointercancel ends the drag and builds nothing"; `tests/unit/ui/drag.test.ts`; `tests/e2e/keyboard.spec.ts` (map cursor). |
| 7.4 | The card details panel shows all data that the old picker cards showed | PASS | `tests/unit/ui/cardDetails.test.ts`; `tests/e2e/decks.spec.ts`: "the card details panel shows the data of the held card", "a held stall card shows its type, its price, and its running cost", "a held track ride card shows its four values, and the station builder stays", "phone: the details panel opens from the Details button, above the deck chips". |
| 7.5 | The 3 tips work, can be closed, and can be turned off | PASS | `tests/unit/ui/tips.test.ts` (each rule, order, tie rule, 19/20 guests, gap 14/15, closed-tip return, setting off, Tutorial); `tests/e2e/tips.spec.ts` (noRide with its button and Close, cashLow with Open Finance, the setting, the Tutorial and the menu, a held card); `tests/e2e/polish.spec.ts`: "an overlay or the open overlay chip row hides the tip; the tip comes back after". |
| 7.6 | All UI surfaces use the new tokens and the bundled font; the build makes no font request to another host | PASS | `tests/unit/ui/theme.test.ts` (no colour literal in `main.css`; tokens); `tests/unit/offline/manifest.test.ts` (both Fredoka files in the offline list); `tests/e2e/interface.spec.ts`: "the game loads the bundled font and asks no other host for anything", "with the font files blocked, the top region and the hand hold their layout in the fallback font (spec §4.9)"; `node scripts/check-release.ts` (only the two Fredoka files, at their exact sizes; `tests/unit/offline/release.test.ts`). |
| 7.7 | The accessibility scan, the text scale test, and the pseudo-locale test pass | PASS | `tests/e2e/a11y.spec.ts`: the axe scan of the game screen with the hand open and a tip, a held Carousel card with the card details panel, and the phone Speed menu, the same states in high contrast; the 44 × 44 px test and the 175% `en-XA` test (1280 × 720 and 375 × 667) with the hand open and a held card; `tests/e2e/interface.spec.ts` (45% free map on 390 × 844; 44 px targets, 8 px gaps, and no clipped text in the fallback font). |
| 7.8 | All tests pass. CI is green. The size of the JavaScript bundle and of the font file is recorded in the changelog | PASS | The table above; `CHANGELOG.md` 4.0.0 "Size" (352.7 KB first load, 342.7 KB JavaScript; 29,732 and 4,576 bytes of font). GitHub Actions on the release commit is a manual row of the release check. |
| 7.9 | The build table of the master spec has a Build 4 row. The README describes the new controls | PASS | `docs/superpowers/specs/2026-11-09-thrills-and-chills-design.md` §3 (Build 4 — "Frost and Spark", Phase 7); `README.md` "Builds" and "Controls" (title screen, top of the screen, decks and the hand, tips). |
| 7.10 | The owner has looked at screenshots of the real game at 1280 × 800 and 390 × 844 and has accepted them | OPEN | The owner has accepted the screenshots: **not yet**. Screenshots: `docs/screenshots/phase-7-desktop.png` (1280 × 800), `docs/screenshots/phase-7-phone.png` (390 × 844) — a park with 4 open rides and guests, the Rides deck open, the Carousel card held — and the title screen with that park saved, `docs/screenshots/phase-7-title-desktop.png` and `phase-7-title-phone.png`. Made by `TC_SCREENSHOT=1 npx playwright test tests/e2e/overview-build4.spec.ts`. |

## Extra work in Build 4

| Work | What | Tests |
|---|---|---|
| Polish (Task 13b) | Twelve player-visible faults from the reviews: the tip hides while an overlay or the overlay chip row is on; the zone name stays readable over a held first card; a research message closes the Messages panel; keyboard focus after a held tool card and after Close of the tip; the build toast keeps clear of the tool status bar; show cards, the station builder, and the path height bar at 175% | `tests/e2e/polish.spec.ts` |
| Title screen (Tasks 15, 15b) | The pixel-art skyline title (design E): one pure layout function, four pictures as data in the bundle (no image files), the menu with Continue, the New game view on a plate or sheet, safe areas; spec `phase-7-title-screen.md`, generator `tools/title-art/` | `tests/unit/ui/titleLayout.test.ts`, `tests/unit/ui/titlePicture.test.ts`, `tests/e2e/title.spec.ts`, the title scans of `tests/e2e/a11y.spec.ts` |
| Release gate (Task 14) | Names of the mood bar and the weather button from their creation; the segment percentage beside the knot; the font allow-list of the release check; version 4.0.0 | `tests/e2e/interface.spec.ts`, `tests/unit/ui/mood.test.ts`, `tests/unit/offline/release.test.ts` |

## Decisions made during the build

- A: migrated specs reach old tools only through the test helpers; new Phase 7 specs may use the new ids.
- B: deck buttons have `data-testid="deck-<id>"`; the Rides and Stalls deck buttons keep `data-tool` but not `tool-rides` / `tool-stalls`.
- C: the helper `openTool(page, 'rides'|'stalls')` opens the deck only when it is not open.
- D: the empty-deck test could hide stalls through the scenario content rule (later replaced by O).
- E: test bodies the plan left as comments are real assertions.
- F: work happens in the session checkout on `ccr-6f420895-3xt45j`; the controller pushes after each task.
- G: a unit run that fails only in `tests/integration/perf-budget.test.ts` counts as green when that file passes alone.
- H: the clipped scenery picker cards were fixed with CSS in the look task.
- I: the release check allows exactly the two vendored Fredoka files, by name and exact size.
- J: canvas-drawn charts keep their dark palette in Phase 7.
- K: one layout test runs with the font files blocked (the fallback font).
- L: the old toolbar layout test stayed until the deck list test replaced it.
- M: Put back on a panel card does the same as its second press (amended by M2).
- M2: Put back selects Inspect when the card is pressed because its tool is active, and closes the panel or chips when it is pressed because they are open.
- N: on the phone the hand tucks away while a card is pressed; a deck chip shows it; the desktop never tucks.
- O: the empty-deck e2e test is dropped (the state is unreachable); the empty branch stays.
- P: a research message opens the Rides or Stalls deck and scrolls the new card into view.
- Q: keyboard, a11y, and i18n specs moved from the picker panels to the hand with the same checks.
- R: track rows of the card details panel are complete lines from the old track card strings.
- S: the names Frost (Chill) and Spark (Thrill) stay.
- T: a card details panel that does not fit above the hand runs to the bottom, and the hand ends at its left edge (`data-details="tall"`).
- U: the axe scan waits for the end of entry animations.
- V: for a held track card on the phone, Details is in the station builder (`track-details`); the "From" cost is in the cost chip.
- W: no full-body mascots at the bottom corners; the tip bubble has a small face, centred above the hand on desktop and below the day pill on the phone; `MASCOT_MIN_WIDTH_PX` is removed.
- X: the title screen keeps the menu-hides-while-a-view-shows rule; the view is on a plate (desktop) or a bottom sheet (phone).
- Y: title layout rules: one pure position function, measured menu height, a "low" kind, the name never touches the rides, the picture always covers the window, the menu grows on large windows.
