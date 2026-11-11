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
| Unit + integration | `npm test` | 3,587 passed, 2 skipped, at the end of Task 18 (unchanged from Task 17; Task 14: 3,578 passed, 2 skipped) |
| Build | `npm run build` | first load 354.2 KB gzipped: JavaScript 343.9 KB + CSS 10.3 KB (budget 400 KB), at the end of Task 18 (unchanged from Task 17) |
| Desktop + phone | `npm run e2e` (projects `desktop` 1280 × 800 and `phone` Pixel 7) | 329 passed, 145 skipped (opt-in screenshot and perf scripts, tests for the other project), 0 failed, at the end of Task 18 (Task 17: 316 passed, 144 skipped; Task 16b: 306 passed, 142 skipped; Task 14: 267 passed, 115 skipped) |
| Performance | `TC_PERF=1 npx playwright test tests/e2e/perf.spec.ts tests/e2e/perf-build3.spec.ts` | 9 passed, 5 skipped (scenes of the other project), also at the end of Task 16b: desktop 2,000 guests, phone 800 guests at CPU 4×, scenes build1, build2, phone |
| Release check | `node scripts/check-release.ts --no-build` | no automated check failed (exit 0); MANUAL and OWNER rows remain, among them one OWNER row per OPEN or GAP audit line (Build 4: 7.10) |

"CI" means the same commands as `.github/workflows/ci.yml` run locally; GitHub Actions runs are not observable from
this environment.

Sizes: the JavaScript bundle is 343.8 KB gzipped (the four title pictures are data in it); the font files are
`fredoka-latin-wght-normal.woff2` 29,732 bytes and `fredoka-latin-ext-wght-normal.woff2` 4,576 bytes (SIL OFL 1.1,
licence in `src/assets/fonts/fredoka/LICENSE`).

## Phase 7 — Interface ("Frost and Spark")

| # | Done when (§11) | Result | Evidence |
|---|---|---|---|
| 7.1 | The game screen has no toolbar and no picker panel; every old tool works from its new place | PASS | `tests/e2e/decks.spec.ts`: "no toolbar named Tools is on the screen", "{id} selects its tool from its new place", "{id} opens its panel from its new place", "overlays, shows, temperament, and menu work from their new places"; `tests/unit/ui/decks.test.ts` (each of the 21 old tool ids has exactly one new place; each extension entry names a deck); `src/ui/toolbar.ts` and `src/ui/panels/picker.ts` are deleted. Final repairs: `tests/e2e/final-repairs.spec.ts` "Put back on the Staff card while the patrol tool runs selects Inspect (F1)"; `tests/e2e/scenery.spec.ts` "phone: tap an item, tap the map, Confirm" (the Scenery tool state and the card, after a tap on the deck chip). |
| 7.2 | The mood bar, the faces, and the lean text follow the guest mix | PASS | `tests/unit/ui/mood.test.ts` (lean, knot, text at −100 … 100 and no guests, faces, the segment percentage beside the knot); `tests/unit/ui/tips.test.ts` (the under-served group that sets the faces); `tests/e2e/interface.spec.ts`: "the mood bar names the balance and toggles the Temperament overlay", "the mood bar and the weather button have a name before the first frame". |
| 7.3 | A player can build a ride with press-then-press on desktop and phone, and with a drag on desktop | PASS | `tests/e2e/decks.spec.ts`: "hold the Carousel card and place it: one ride, cash falls by $1,200" (both projects), "a track ride card starts the station builder", "Put back, Esc, and Cancel select Inspect", "a drop on a valid tile builds the ride", "a drop on a blocked tile builds nothing and shows the reason", "a drop on the UI builds nothing", "pointercancel ends the drag and builds nothing"; `tests/unit/ui/drag.test.ts`; `tests/e2e/keyboard.spec.ts` (map cursor). |
| 7.4 | The card details panel shows all data that the old picker cards showed | PASS | `tests/unit/ui/cardDetails.test.ts`; `tests/e2e/decks.spec.ts`: "the card details panel shows the data of the held card", "a held stall card shows its type, its price, and its running cost", "a held track ride card shows its four values, and the station builder stays", "phone: the details panel opens from the Details button, above the deck chips". Final repairs: the four hints (`tests/unit/ui/cardDetails.test.ts`; `tests/e2e/decks.spec.ts`, phone hint). |
| 7.5 | The 3 tips work, can be closed, and can be turned off | PASS | `tests/unit/ui/tips.test.ts` (each rule, order, tie rule, 19/20 guests, gap 14/15, closed-tip return, setting off, Tutorial); `tests/e2e/tips.spec.ts` (noRide with its button and Close, cashLow with Open Finance, the setting, the Tutorial and the menu, a held card); `tests/e2e/polish.spec.ts`: "an overlay or the open overlay chip row hides the tip; the tip comes back after". Final repairs: `tests/e2e/tips.spec.ts` "underServed: Spark asks for Thrill rides; Show Thrill rides opens the Rides deck at the Thrill zone" (the third tip, its speaker, its button text and the zone); `tests/e2e/final-repairs.spec.ts` "phone: the tip hides while the Shows or the Scenery picker is open (F3)", "screen readers hear a tip: a lasting status region gets its sentence (F4)". |
| 7.6 | All UI surfaces use the new tokens and the bundled font; the build makes no font request to another host | PASS | `tests/unit/ui/theme.test.ts` (no colour literal in `main.css`; tokens); `tests/unit/offline/manifest.test.ts` (both Fredoka files in the offline list); `tests/e2e/interface.spec.ts`: "the game loads the bundled font and asks no other host for anything", "with the font files blocked, the top region and the hand hold their layout in the fallback font (spec §4.9)"; `node scripts/check-release.ts` (only the two Fredoka files, at their exact sizes; `tests/unit/offline/release.test.ts`). Final repairs: `tests/e2e/a11y.spec.ts` "with the font files blocked, no element leaves the viewport in the fallback font (Ruling K, spec §4.9)" (the 175% `en-XA` run with no Fredoka face loaded, 1280 × 720 and 375 × 667); `tests/unit/ui/theme.test.ts` (the theme colour of `index.html` and the web manifest). |
| 7.7 | The accessibility scan, the text scale test, and the pseudo-locale test pass | PASS | `tests/e2e/a11y.spec.ts`: the axe scan of the game screen with the hand open and a tip, a held Carousel card with the card details panel, and the phone Speed menu, the same states in high contrast; the 44 × 44 px test and the 175% `en-XA` test (1280 × 720 and 375 × 667) with the hand open and a held card; `tests/e2e/interface.spec.ts` (45% free map on 390 × 844; 44 px targets, 8 px gaps, and no clipped text in the fallback font). Final repairs: `tests/e2e/a11y.spec.ts` (the 175% `en-XA` run in the fallback font; the phone Speed menu is always scanned); `tests/e2e/final-repairs.spec.ts` (the title holds Tab and the clock, focus rings with a hard shadow and on the held card clear of its zone label, the Speed menu gives the focus back, focus kept by the hand, the title menu after a text scale change in Settings, the whole keyboard hint line of the desktop track builder, 44 px phone bars at 175%); `tests/e2e/polish.spec.ts` "a research message opens its deck, closes the Messages panel, and shows the new card (Ruling P)" (the card in view; the focus rule for keyboard and pointer); `tests/e2e/ui-hud.spec.ts` "a long park name and a ten-digit cash value keep the controls on the screen" (measured after the long values show). Day chip (Task 17): `tests/e2e/day-chip.spec.ts` (the chip plate at most 36 × 200 px at 100%, the 44 px weather button, the two 44 px view rotate buttons 8 px apart outside the chip; the phone top region at most 180 px high on 390 × 844; a press between the chip and the view controls reaches the map; the forecast toast and the rotate buttons in their new place; the objectives flag right of the chip). |
| 7.8 | All tests pass. CI is green. The size of the JavaScript bundle and of the font file is recorded in the changelog | PASS | The table above; `CHANGELOG.md` 4.0.0 "Size" (354.2 KB first load, 343.9 KB JavaScript; 29,732 and 4,576 bytes of font). GitHub Actions on the release commit is a manual row of the release check. |
| 7.9 | The build table of the master spec has a Build 4 row. The README describes the new controls | PASS | `docs/superpowers/specs/2026-11-09-thrills-and-chills-design.md` §3 (Build 4 — "Frost and Spark", Phase 7); `README.md` "Builds" and "Controls" (title screen, top of the screen, decks and the hand, tips). |
| 7.10 | The owner has looked at screenshots of the real game at 1280 × 800 and 390 × 844 and has accepted them | OPEN | The owner has accepted the screenshots: **not yet**. Screenshots: `docs/screenshots/phase-7-desktop.png` (1280 × 800), `docs/screenshots/phase-7-phone.png` (390 × 844) — a park with 4 open rides and guests, the Rides deck open, the Carousel card held — and the title screen with that park saved, `docs/screenshots/phase-7-title-desktop.png` and `phase-7-title-phone.png`. Made by `TC_SCREENSHOT=1 npx playwright test tests/e2e/overview-build4.spec.ts`. |

## Extra work in Build 4

| Work | What | Tests |
|---|---|---|
| Polish (Task 13b) | Twelve player-visible faults from the reviews: the tip hides while an overlay or the overlay chip row is on; the zone name stays readable over a held first card; a research message closes the Messages panel; keyboard focus after a held tool card and after Close of the tip; the build toast keeps clear of the tool status bar; show cards, the station builder, and the path height bar at 175% | `tests/e2e/polish.spec.ts` |
| Title screen (Tasks 15, 15b) | The pixel-art skyline title (design E): one pure layout function, four pictures as data in the bundle (no image files), the menu with Continue, the New game view on a plate or sheet, safe areas; spec `phase-7-title-screen.md`, generator `tools/title-art/` | `tests/unit/ui/titleLayout.test.ts`, `tests/unit/ui/titlePicture.test.ts`, `tests/e2e/title.spec.ts`, the title scans of `tests/e2e/a11y.spec.ts` |
| Release gate (Task 14) | Names of the mood bar and the weather button from their creation; the segment percentage beside the knot; the font allow-list of the release check; version 4.0.0 | `tests/e2e/interface.spec.ts`, `tests/unit/ui/mood.test.ts`, `tests/unit/offline/release.test.ts` |
| Final repairs (Tasks 16a, 16b) | The findings of the final review (below): the title holds the page (inert, Tab, no autosave), visible focus rings, tips off the pickers and in a status region, Put back on Staff during patrol, readable track piece icons, focus kept by the hand, whole px on the title; tests that could not fail or missed a ruling, the release check reads the audit tables, the documents match the build | `tests/e2e/final-repairs.spec.ts`, `tests/e2e/a11y.spec.ts`, `tests/e2e/tips.spec.ts`, `tests/e2e/polish.spec.ts`, `tests/unit/offline/release.test.ts`, `tests/unit/settings/data.test.ts` |

## Final review

Six reviewers read the whole branch, one per area (decks, top bar with tips and settings, title screen, CSS with
accessibility and languages, tests and gates, documents with the deferred list); a second reader checked each blocking
finding. 16 findings were confirmed; Task 16a repaired those in the game code and Task 16b the tests, the release check,
the documents, and the dead code. The items of the deferred list that stay open, each with its reason:

- T1: `SharePercents` is declared by hand, not as `ReturnType<typeof sharePercents>`: Naming taste; the type matches `sharePercents` today, and typecheck catches any drift at the call sites (moodBar.ts:107-110)
- T1: `knotPercent` rounds to a whole percent; no test for odd leans: Half a percent of the knot is at most 2.6 px on a 520 px bar, which a player cannot see. mood.test.ts:11 already pins one non-even case (15/56/29 → 57)
- T2: no test for a track ride in `tipInput` (the getTrackRideDef path): A one-operator fallback (`??`). Low risk; add the test when the tip rule is next tuned
- T3: no test for an unknown zone sorting last, or for the `thrill` fallback of a track type with no catalog entry: Unreachable with today's catalog; the code is a defensive fallback
- T3: path comment on line 1 of decks.test.ts: Taste
- T4: duplicate local `MemoryStore` class in the settings tests: Older pattern: the same class is in five more test files from before the branch (save/store, core/settings-store, integration). Belongs to a test-helper cleanup, not this release
- T4: `as unknown as` casts in `parseSettings`: The casts are local and each key is checked by `isValidSetting`. A rewrite risks the strict validation for no player gain
- T5: `.tool-status`, `.mgmt-bar`, `.tb-status`, `.msg-toast[data-kind]` keep a coloured state border, not the 3 px ink outline: The colours come from tokens (`--ok`, `--danger`, `--warn`), and the border colour carries the valid/invalid state. Taste, not a rule break
- T5: colour literals used as drawing data in style modules; theme.test.ts scans only main.css: SVG stroke fallback and terrain swatches are drawing data of the park art (like Ruling J for canvas charts); a later art phase owns them
- T5: no permanent regression check for the card-clipping fix: Show cards are now covered ('no part of a show card leaves the card'); scenery cards are an old bar, out of the Phase 7 scope
- T6: `cardOf` opens the deck with the mouse when the card is hidden; keyboard.spec could use the mouse path silently: In keyboard.spec the Rides deck is opened with Enter first (lines 69-75), so `cardOf` only scrolls. No mouse press happens today
- T6: keyboard.spec `toolControl` calls `scrollIntoViewIfNeeded` before the Tab walk: Scrolling does not move focus. The Tab walk still proves reachability
- T7: hud.ts document `keydown`/`pointerdown` listeners are never removed; one Esc can close the speed menu and a panel together: `createHud` runs once per `mountUI` (src/ui/index.ts:205), so there is no leak. The double close needs a keyboard on the phone layout with the speed menu and a panel open together. A rare path
- T7: `.status-pill` / `.day-pill` wrap with a 4 px vertical gap at 175% on desktop: Visual spacing inside a pill; not a control gap
- T7: layout.test.ts wraps the brief's test in a new `describe` with a different name: Naming
- T8: no test of the mood bar with guests present (knot, lean text, {n}% labels, face switching): Partly done in Task 14: the 30/40/30 test checks the name, the label, and the proportion with guests. The face wiring `faceMoods(underServedGroup(tipInput(...)))` has no test, but both functions are unit-tested (mood.test.ts:24, tips.test.ts:15-45). A face e2e needs 20 guests and open rides: heavy for the gain
- T8: `.mood-knot` slides in from 0 on load; `.mood-track` overflow clips the knot by 1 px: The knot starts at `left: auto`, which a transition does not animate, so the slide cannot be shown from the code. The 1 px clip is cosmetic
- T9: no test for the hand's ArrowLeft/ArrowRight/Home/End, wheel and drag scroll, the dropped click after a strip drag, `hand-prev`/`hand-next`: No test exists (grep finds no hand-next or Home/End in the e2e suite), but the code is short and was reviewed twice. Add the test with the next hand change; it does not belong in the final small repair
- T9: tests/e2e/helpers.ts `DECK_OF` is a second copy of the id-to-deck map: A test keeping its own expectation of the product map is deliberate: it catches a wrong `TOOL_PLACE`
- T9: deckList.ts imports `selectTool` from toolCards.ts for Demolish: Module layout taste
- T10: no test of `.hand-zone` pointer-events, card sizes, held-card rise, `.tc-rm`; the 175% check misses stall cards: Styling checks with low regression risk. The 44 px phone test does visit the stall cards (a11y.spec.ts:229-232)
- T11: the axe wait in a11y has no upper bound: Infinite animations are filtered out (`endTime !== Infinity`), and the Playwright test timeout bounds the rest (Ruling U)
- T11: `380px` / `410px` in the `:has()` rules repeat the side panel's width and offset as bare numbers: Maintainability taste. A `--panel-w` token is a refactor that risks layout regressions this late
- T11: the stall unit test pins values but not label ids; a stall shows its kind twice (zone chip and row): Spec §4.7 lists both zone and kind; the repeat is harmless
- T11: the tall details state starts on any overflow with no lower limit for the hand width; the hand moves a frame after the press; not re-measured when the panel content changes: The hand still scrolls and keeps the held card in view (hand.ts:113-118). A minimum width rule is a design decision (Ruling T)
- T11: the tool status bar is 195-253 px high at 900-1000 px windows at 175%: Old bar layout, out of scope by spec §3
- T11: phone 175%: descenders of some detail rows touch the separator: Cosmetic
- T12: `dropClick` stays true until the next pointerdown when no click follows a drag: Harmless: the next press resets it, and a keyboard click (detail 0) passes through (drag.ts:121)
- T12: the drag lifecycle is tested only on the desktop project: Spec §4.6 makes drag mouse and pen only. The phone has a test that touch does not drag
- T13: no e2e test for the hide rules modalOpen/titleOpen (only the menu), the phone panel rule, the underServed button with its zone, closed set cleared on world change: The rules are one boolean expression; the model is unit-tested. Low gain for the final small repair
- T13b: `placeToast` measures the toast height at its old width, and also runs on the phone: On the phone the status bar is at the bottom, so the condition at line 360 is false in practice. The width error is a few px in a desktop 175% edge case
- T13b: when the bubble hides with focus inside, focus always goes to the Rides deck button, also after an action that opened another deck: Spec §4.8 line 230 states this rule; the focus lands on a visible control, not on the body
- T13b (to measure): phone 175%: Station length / Height bar minus and plus look 41-42 px wide; Flat/Up/Down chips 41 px tall: Not measured. The 44 px phone test (a11y.spec.ts:204) runs at 100% only, and I cannot prove the size from the code. Measure before repairing
- T13b: the selected Height bar chip (Flat) looks disabled; Up and Down are pale on pale: Visual taste in an old bar (spec §3 out of scope); the pressed state is exposed with aria
- T13b: phone 175% show picker: locked cards have light grey text on near white; the bottom of the cards is cut by the deck chip row: Locked cards are `:disabled` (opacity 0.5); WCAG exempts inactive controls from contrast. The cut was repaired in 1bef750 (polish.spec.ts:136)
- T15: 768x1024 with a save: the Continue / New game split is 4 px off the mock-up: 4 px against a mock-up; no player effect
- T15b (to watch): the safe-area e2e waits one animation frame after it sets the custom properties: Watch for flakiness; no failure on record. If it flakes, replace the single rAF with `expect.poll` on the name position
- T15b: stale `data-compact` attribute on the title screen element: Written on each layout, so not stale; nothing reads it. Harmless
- T15b (to decide): on an iPhone in standalone mode (safe top 47, bottom 34) the title's name is drawn at half size; proposal to shrink the name margins first: An owner and design decision. It changes the pure layout numbers that titleLayout.test.ts pins. The name stays readable at scale 1
- T15b: the phone sheet of the New game view scrolls inside; Back and Start are cut until the player scrolls: Title spec §8 ('it scrolls inside') specifies this; a sticky action row would be a design change
- T14: the mood bar proportion e2e injects a hand-written guest object through window.__tc: A typed helper from tests/helpers/world would be cleaner, but the test asserts real layout; a sim change that breaks the shape would show up as a test error, not a silent pass

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
- K: one run of the 175% `en-XA` layout test with the font files blocked (the fallback font), in `tests/e2e/a11y.spec.ts` since Task 16b; the 100% test of the top region and the hand with the font files blocked (`tests/e2e/interface.spec.ts`) stays.
- L: the old toolbar layout test stayed until the deck list test replaced it.
- M: Put back on a panel card does the same as its second press (amended by M2).
- M2: Put back selects Inspect when the card is pressed because its tool is active, and closes the panel or chips when it is pressed because they are open.
- N: on the phone the hand tucks away while a card is pressed; a deck chip shows it; the desktop never tucks.
- O: the empty-deck e2e test is dropped (the state is unreachable); the empty branch stays.
- P: a research message opens the Rides or Stalls deck and scrolls the new card into view; from the keyboard the new card gets the focus (Task 16a), with a pointer it does not.
- Q: keyboard, a11y, and i18n specs moved from the picker panels to the hand with the same checks.
- R: track rows of the card details panel are complete lines from the old track card strings.
- S: the names Frost (Chill) and Spark (Thrill) stay.
- T: a card details panel that does not fit above the hand runs to the bottom, and the hand ends at its left edge (`data-details="tall"`).
- U: the axe scan waits for the end of entry animations.
- V: for a held track card on the phone, Details is in the station builder (`track-details`); the "From" cost is in the cost chip.
- W: no full-body mascots at the bottom corners; the tip bubble has a small face, centred above the hand on desktop and below the day pill (now the chip row) on the phone; `MASCOT_MIN_WIDTH_PX` is removed.
- X: the title screen keeps the menu-hides-while-a-view-shows rule; the view is on a plate (desktop) or a bottom sheet (phone).
- Y: title layout rules: one pure position function, measured menu height, a "low" kind, the name never touches the rides, the picture always covers the window, the menu grows on large windows.
- AA: after the owner's test play, the day pill became a small chip and the view rotate buttons moved to the right (the owner chose this design)
- AB: after the owner's test play, the mood bar became 44 px high and the cards about 12% smaller
