# Phase 7 — Interface ("Frost and Spark")

- **Build:** 4. No save schema change. Settings document version 2.
- **Status:** Draft for review.
- **Master spec:** `../2026-11-09-thrills-and-chills-design.md`.
- **Approved draft pictures:** `../../../screenshots/phase-7-draft-desktop.png` (1280 × 800) and `../../../screenshots/phase-7-draft-phone.png` (390 × 844).

> **Read this first.** The draft pictures show a pixel-art park. Phase 7 changes the **interface** only. The park, the rides, the card pictures, and the mascots keep the art that the game draws today. Pixel art for the park is a different, larger project (proposed Phase 8, with its own spec).

---

## 1. Goal
The player sees the park mood at all times and builds with cards. The top bar and the 21-button toolbar go away. A mood bar with Frost and Spark, five card decks, a hand of cards, and short mascot tips replace them. The game rules, the simulation, and the saves do not change.

**Problems this phase solves (measured on the live Build 3 game):**
1. On a phone narrower than 600 CSS px, the screen hides the park name, the guest count, the rating, and the Thrill/Chill balance (`src/styles/main.css`, `@media (max-width: 599px)`).
2. The toolbar shows 21 buttons at one level. On a phone, the player must scroll the toolbar sideways to find a tool.
3. The Thrill/Chill balance is the main idea of the game, but it is a 120 px bar between other values.

## 2. Depends on
| Phase | What Phase 7 uses |
|---|---|
| 1 | UI layer (`src/ui/`), `ToolState`, ride and stall pickers, tool status bar, panel host. |
| 2 | Track ride cards and the station builder (`src/ui/track/`). |
| 3 | Messages and the unread count, research unlocks. |
| 4–5 | UI extensions (`src/ui/extensions.ts`), tutorial bubbles, mascot portraits (`src/ui/scenario/mascotArt.ts`). |
| 6 | Accessibility rules (Phase 6 §4.7), string tables, settings store. |

## 3. Scope
1. A new screen layout for desktop and phone.
2. Status pill and day pill (replace the HUD top bar).
3. Mood bar with Frost and Spark (replaces the balance bar and the Temperament button).
4. Five decks and one Demolish button (replace the toolbar).
5. A hand of cards for rides and stalls (replaces the ride and stall picker panels).
6. Card details panel.
7. Mascot tips: 3 rules.
8. A new light look for all UI surfaces, with one bundled font.
9. Updated tutorial targets, tests, and documents.

**Out of scope:**
- Pixel-art park graphics (proposed Phase 8).
- New game rules, new content, new commands, new save fields.
- New layouts inside the existing panels (Finance, Staff, Research, Marketing, Park, Messages, ride, stall, guest), the settings screen, the title screen, and the dialogs. They get the new colours and font only.
- New layouts for the scenery, land, water, land purchase, overlay, show, path item, and track builder bars. They get the new colours and font only.
- Cards for locked content.

---

## 4. Detailed design

### 4.1 Screen regions
The layout switch stays at 900 CSS px (`toolbarPlacement`, `src/ui/layout.ts`). `data-layout="side"` is the desktop layout. `data-layout="bottom"` is the phone layout.

| Region | Desktop (≥ 900 px) | Phone (< 900 px) |
|---|---|---|
| **Status pill** | Top left. | Top row, left. |
| **Deck list** | Top left, below the status pill. A column. | A row of chips directly above the hand. The row scrolls sideways. |
| **Mood bar** | Top centre. Width `clamp(280px, 40vw, 520px)`. | Second row. Full width. |
| **Controls** | Top right, row 1: the 4 speed buttons, Messages, Menu. | Top row, right: Messages, one Speed button, Menu. |
| **Day pill** | Top right, row 2. | Third row. It scrolls sideways when it does not fit. |
| **Hand** | Bottom centre, on the zone strip. | Bottom, full width. |
| **Mascots** | Frost bottom left and Spark bottom right, when the screen is ≥ 1100 px wide. Decoration only. | Not shown at the bottom. |
| **Tip bubble** | Above the hand, on the side of the speaker. | Below the day pill. |
| **Card details** | The side panel on the right (the existing panel position). | The bottom sheet (the existing sheet). |

Rules:
- The UI root keeps the CSS variables `--hud-bottom` (bottom edge of the top region) and `--toolbar-space` (height of the bottom region). The UI measures both with a `ResizeObserver`, as it does today. Existing panels, bars, and toasts use these variables, so they stay clear of the new regions. On desktop, `--toolbar-space` is now the height of the hand, and the side panel ends above the hand.
- Mascot art and the zone strip have `pointer-events: none`. A click on them goes to the map.
- With the hand open on a 390 × 844 screen at 100% text scale, the free map area is at least 45% of the screen height.

### 4.2 Status pill and day pill
**Status pill.** One button. It opens the Park panel.
- Desktop: park name, cash, guests, rating. Each number has a text label.
- Phone: cash, guests, rating. Guests and rating have an icon and a screen-reader label.
- Phone, text scale 150% or 175%: cash only. The Park panel shows the guest count and the rating.
- Negative cash shows a minus sign and the danger text colour.
- The elements keep their test ids: `hud-name`, `hud-cash`, `hud-guests`, `hud-rating`.

**Day pill.** In this order: weather badge, date and clock (`hud-date`), then every `UiExtension.hud` part (the view rotate buttons and the objectives flag). The extension contract does not change.

**Controls.**
- Speed: the same 4 buttons in the same group named "Game speed". On a phone, one Speed button shows the current speed (pause icon, `1×`, `2×`, or `4×`). It opens the group as a small menu. A choice closes the menu.
- Messages: a button with the unread badge (`messages-badge`). It opens the Messages panel.
- Menu: opens the existing menu dialog.

### 4.3 Mood bar
The mood bar shows the guest mix, the same data as today (`temperamentShares` and `sharePercents` in `src/ui/format.ts`). It updates every 500 ms.

- **Parts:** Frost head at the left end. Spark head at the right end. Between them, three segments: Chill, Family, Thrill. A knot marks the lean. One line of text below the bar (desktop only).
- **Lean:** `L = thrill% − chill%`. The knot is at `50% + L / 2` of the bar width.
- **Text:**

| Condition | Text |
|---|---|
| No guests | "No guests yet" |
| `L ≥ 10` | "The park leans to Thrill" |
| `L ≤ −10` | "The park leans to Chill" |
| other | "The park is in balance" |

- **Faces:** Frost has the sad face while Chill is the under-served group of rule 3 in section 4.8. Spark has the sad face while Thrill is that group. In all other cases the face is happy. The face follows the rule, not the bubble: a closed tip or the Mascot tips setting does not change it. The art is the existing `mascotCanvas` portrait.
- **Press:** the bar is a button. It turns the Temperament overlay on and off (`aria-pressed`). This replaces the Temperament toolbar button.
- **Accessible name:** the existing text, "Thrill/Chill balance: {chill}% Chill, {family}% Family, {thrill}% Thrill", then the lean text. Test id `hud-balance`; the button also has `data-tool="temperament"`.
- **Colour is not the only signal:** each segment shows its percentage as text when the segment is at least 44 px wide. The lean text and the accessible name give the same data.
- **Reduced motion:** the knot moves with no transition.

### 4.4 Decks
The deck list is a toolbar named "Card decks" with 5 toggle buttons and the Demolish button.

| Deck | Cards, in order |
|---|---|
| **Rides** | Flat ride cards and track ride cards, sorted by section 4.5. Then the tool card Shows. |
| **Stalls** | Stall cards, sorted by section 4.5. |
| **Paths** | Tool cards: Footpath, Queue, Path items. |
| **Scenery** | Tool cards: Scenery, Land, Water, Buy land. |
| **Manage** | Tool cards: Staff, Research, Marketing, Finance, Park, Overlays. |

- A press on a deck opens the hand with that deck. A press on the open deck closes the hand. The Rides deck is open when a park starts.
- The open deck and the hand state are session data. Saves do not store them.
- **Demolish** is the last item of the deck list, after a divider. It is not a deck. It selects the Demolish tool (`aria-pressed`).
- A **tool card** does what its toolbar button does today. It has the icon and the label of that button. `ToolbarEntry` (`src/ui/extensions.ts`) gets one new required field, `deck`, so each extension names the deck of its tool.

**Where each of the 21 toolbar buttons goes:**

| Today | Phase 7 |
|---|---|
| Inspect | No button. Inspect is active when no card is held. |
| Footpath, Queue, Path items | Paths deck. |
| Rides | Rides deck. |
| Stalls | Stalls deck. |
| Shows | Rides deck, tool card. |
| Scenery, Land, Water, Buy land | Scenery deck. |
| Demolish | Demolish button in the deck list. |
| Staff, Research, Marketing, Finance, Park | Manage deck. |
| Overlays | Manage deck. |
| Temperament | Press the mood bar. |
| Messages | Controls. |
| Menu | Controls. |

Each new control keeps the `data-tool` value and the `data-testid="tool-<id>"` of the button that it replaces.

### 4.5 Hand and cards
The hand is a group named "{deck} cards". It shows only unlocked content, as the pickers do today.

**Content card (ride or stall).** One button with:
- a header band with the zone name as text (Chill, Family, Thrill, or the stall kind),
- the preview picture (`drawPreview` or `drawTrackPreview`, drawn one time and kept),
- the name,
- the build cost. A track ride card shows "From {cost}" and the word "Track".

The accessible name of a card is its visible text, as Phase 6 §4.7 requires.

**Size:** 128 × 172 CSS px on desktop, 104 × 140 on phone, multiplied by the text scale up to 150%.

**Order.**
- Rides deck: zone (Chill, Family, Thrill), then build cost from low to high, then name. A track ride uses its station cost (`stationCost` with `minStationTiles`), the cost that its picker card shows today.
- Stalls deck: kind (Food, Drink, Restrooms, Souvenir, Information, Facility), then build cost, then name.

**Zone strip.** A band behind the cards with one coloured part per zone and the zone name as text. A zone with no card is not shown. Tool decks have no zones.

**Scroll.** The hand scrolls sideways (wheel, drag, touch). On desktop, two arrow buttons show when the cards do not fit. `ArrowLeft` and `ArrowRight` move the focus between cards. `Home` and `End` go to the first and the last card.

**Refresh.** The hand shows a newly unlocked card not later than 1 s after the unlock. The UI compares the list of unlocked ids every 500 ms and builds the cards again only when the list changes. A frame with no change makes no DOM write.

### 4.6 Hold and place a card
**Press.** A press on a content card makes it the held card.
- A flat ride or stall card sets `ToolState` exactly as the picker does today (`tool`, `defId`, `rotation`, no ghost, no drag).
- A track ride card starts the station builder (`startStation`), as today.
- The held card rises 12 px and has `aria-pressed="true"`. It shows a **Put back** button. A press on the held card also puts it back.
- Put back, `Esc`, and Cancel in the tool status bar select Inspect.
- After a build, the tool stays active or returns to Inspect by the rules of today. Phase 7 does not change them.

**Place.** The player places the building on the map with the existing input: move the ghost, then click, or press Confirm on touch. The tool status bar keeps Rotate, Confirm, and Cancel, and gets a **Details** button on a phone.

**Drag (mouse and pen only).** For a flat ride or stall card:
1. A pointer move of 8 px or more with the button down starts a drag. The card becomes the held card.
2. While the pointer is over the map, the UI computes the ghost with `computeGhost` for the tile under the pointer.
3. A release over the map with a valid ghost sends the same command as Confirm (`placeRide` or `placeStall`).
4. A release with an invalid ghost builds nothing. The card stays held, and the tool status bar shows the reason.
5. A release over the UI builds nothing. The card stays held.

Touch input does not drag cards. A sideways touch move scrolls the hand. A drag on a track ride card is a press.

**Held tool card.** While a tool from a tool card is active (for example Footpath), its card shows as held in the same way. Put back selects Inspect.

### 4.7 Card details
A panel of the panel host, kind `cardDetails`. It shows the data of the held content card:
- preview, name, zone, build cost,
- flat ride: seats, excitement, intensity, nausea, ticket price, running cost per month, footprint (`w × d` tiles),
- track ride: drive, maximum height, seats per car, "From" cost (the values of the track card today),
- stall: kind, default price, running cost per month,
- the hint: "Drag the card to the map. Or press the card, then press the map" on desktop; "Tap the map to place it" on phone.

Rules:
- Desktop: the panel opens when a content card becomes the held card.
- Phone: the panel opens from the Details button in the tool status bar.
- The panel closes when no content card is held. Closing the panel does not put the card back.
- This panel replaces the stat bars of the old picker cards. No ride or stall data that the picker shows today is lost.

### 4.8 Mascot tips
A tip is one short sentence from a mascot, with at most one button. Tips read the game state. They never change it.

The UI checks the rules every 2 s and shows the first rule that matches:

| # | Id | Condition | Speaker | Text | Button |
|---|---|---|---|---|---|
| 1 | `cashLow` | `park.cash < 0` | Frost and Spark | "Cash is below zero. Look at Finance" | "Open Finance" opens the Finance panel. |
| 2 | `noRide` | No ride has the status `open`. | Frost and Spark | "Build a ride and open it. Guests come for rides" | "Show rides" opens the Rides deck. |
| 3 | `underServed` | See below. | Frost (Chill), Spark (Thrill), both (Family) | "My Chill guests need a calm ride" / "My Thrill guests need a wild ride" / "Family guests need a family ride" | "Show {zone} rides" opens the Rides deck and scrolls to that zone. |

**Rule 3.** The UI checks it only when rule 2 does not match, so at least one ride is open. It applies when the park has at least `TIP_MIN_GUESTS` guests.
- `guestShare[g]` = percentage of guests in group `g` (the mood bar value).
- `rideShare[g]` = percentage of rides with the status `open` that have the tag `g`. Flat rides and track rides each count as 1.
- `gap[g] = guestShare[g] − rideShare[g]`.
- The rule matches when the largest gap is at least `TIP_GAP_POINTS`. The group with the largest gap is the under-served group. A tie goes to Chill, then Family, then Thrill.

**Display.**
- One tip at a time, in a bubble with the portrait of the speaker. The bubble has `aria-live="polite"`.
- A **Close** button hides the tip. A closed tip stays hidden until its rule stops matching and then matches again. This is session data.
- Tips are hidden during the Tutorial scenario, on the title screen, and while a dialog is open.
- A new setting **Mascot tips** (Settings, Gameplay, default On) turns all tips off.
- A tip makes no sound and is not a toast. The toast rules (`ToastArbiter`) do not change.

### 4.9 Look
The draft pictures set the look: white surfaces, a dark ink outline, a hard shadow, round corners, one accent.

| Token | Value | Use |
|---|---|---|
| `--ink` | `#1f2340` | Text, outlines, pressed buttons. |
| `--surface` | `#ffffff` | Pills, cards, panels, dialogs. |
| `--surface-2` | `#eef0f7` | Buttons that are not pressed, table stripes. |
| `--muted-ink` | `#4d5170` | Labels. |
| `--gold` | `#ffc12e` | Cost chips, the held card ring. |
| `--accent-chill` | `#56b4e9` | Unchanged. Fill only, with ink text. |
| `--accent-family` | `#2fb38a` | Unchanged. Fill only, with ink text. |
| `--accent-thrill` | `#e69f00` | Unchanged. Fill only, with ink text. |
| `--danger-text` | `#b34700` | Negative cash, error text. |
| Outline | 3 px solid ink | All surfaces. |
| Shadow | `0 4px 0` ink | Pills, cards, panels. |
| Radius | 12 px controls, 18 px surfaces | |

Measured contrast: ink on white 15.3:1; muted ink on white 7.7:1; ink on Chill, Family, Thrill, and gold 6.6:1, 5.8:1, 6.8:1, and 9.4:1; danger text on white 5.5:1.

Rules:
- Every colour in `src/styles/main.css` and in the styles that the UI modules add at run time moves to these tokens. No rule keeps a hard-coded colour of the old dark look.
- **Font:** Fredoka (SIL Open Font License 1.1), weights 400 to 700, as one WOFF2 file in the build with its licence text. The game makes no request to another host for it. The offline cache list includes it. The system font stack is the fallback, and the layout tests also pass with the fallback.
- **High contrast setting:** outlines are 4 px, `--surface-2` is white, and `--muted-ink` is ink. The setting detail text changes to "Thicker outlines and stronger text".
- **Focus ring:** 2 px white, then 3 px ink. It is visible on every surface and on the map.
- **Motion:** a held card rises in 120 ms. Reduced motion removes this and the knot transition.
- The canvas, the park art, and the night lighting do not change.

### 4.10 Accessibility
Phase 6 §4.7 applies in full. For the new parts:
- **Tab order:** status pill, mood bar, controls, day pill, deck list, hand, tip, panel.
- **Roles:** deck list `role="toolbar"`; deck buttons `aria-pressed` and `aria-controls` (the hand); hand `role="group"`; cards are buttons with `aria-pressed`.
- **Keyboard:** all current shortcuts stay (`src/input/keyboard.ts`). No new shortcut. `Enter` or `Space` on a card holds it. The map cursor (`C`, arrows, `Enter`) places it.
- **Touch targets:** every control is at least 44 × 44 CSS px with 8 px gaps.
- **Text scale:** nothing clips at 175% on 1280 × 720 and on 375 × 667.
- **Pseudo-locale:** `en-XA` at 175% shows no element outside the screen.

### 4.11 Tutorial
- A tutorial step points at the control that replaces its toolbar button. When that control is a card in a closed deck, the ring is on the deck button until the player opens the deck.
- The steps `openRide` and `inspectGuest` pointed at the Inspect button. They now point at no control; the hint tells the player to click or tap the map.
- Hint texts keep their words where the names stay the same (Footpath, Rides, Stalls, Park, Staff, Finance). The hints for Footpath, Park, Staff, and Finance name the deck first, for example "{act} Paths, then Footpath, …".
- The tutorial bubble keeps its place rules: it never covers its target.

---

## 5. State and settings
- **Save file:** no change. The schema stays at version 3.
- **Settings document:** version 2. It adds `mascotTips: boolean`, default `true`.
  - The settings check is strict today: a document with a missing value is unreadable (`parseSettings`, `src/settings/schema.ts`). Without a migration, every stored version 1 document would become unreadable.
  - Migration: a version 1 document is checked against the version 1 values. Then it gets `mascotTips: true`. The store writes version 2 at the next change.
  - A version 2 document with a missing or non-boolean `mascotTips` is unreadable, as for every other value. Nothing else is filled in.
- **Session data (not stored):** open deck, hand open or closed, closed tip ids.

## 6. Commands
None added. None changed. The UI sends the same commands as today.

## 7. Code structure
| Unit | File | Does |
|---|---|---|
| Deck model | `src/ui/decks/model.ts` | Pure. Maps tools and content to decks; sorts cards; lists zones. |
| Deck list | `src/ui/decks/deckList.ts` | The 5 deck buttons and Demolish. |
| Hand | `src/ui/decks/hand.ts` | Cards, zone strip, scroll, held state, refresh. |
| Card | `src/ui/decks/card.ts` | One content card or tool card. Preview cache. |
| Card drag | `src/ui/decks/drag.ts` | Mouse and pen drag from a card to the map. |
| Card details | `src/ui/panels/cardDetails.ts` | The `cardDetails` panel view. |
| Mood model | `src/ui/mood/model.ts` | Pure. Lean, knot position, lean text id. |
| Mood bar | `src/ui/mood/moodBar.ts` | The bar, the faces, the overlay toggle. |
| Tip model | `src/ui/tips/model.ts` | Pure. The 3 rules and the closed-tip rule. |
| Tip bubble | `src/ui/tips/bubble.ts` | The bubble and its button. |
| Top region | `src/ui/hud.ts` (rewritten) | Status pill, controls, day pill. |
| Tuning | `src/data/tuning/interface.ts` | The constants of section 8. |
| Strings | `src/data/strings/interface.ts` | The texts of section 9. |

- `src/ui/toolbar.ts` and `src/ui/panels/picker.ts` are removed. `src/ui/track/picker.ts` keeps `trackRideCards` data for the hand and loses its tab view.
- `PanelKind` loses `ridePicker` and `stallPicker` and gets `cardDetails`.
- `src/ui/index.ts` mounts the new parts and keeps the frame loop, the toast rules, and the panel rules.
- The pure models have no DOM access. Their tests run in Node.

## 8. Tuning constants
All values are provisional until a play-test.

| Constant | Value | Meaning |
|---|---|---|
| `LEAN_BALANCE_POINTS` | 10 | Lean below this is "in balance". |
| `MOOD_UPDATE_MS` | 500 | Mood bar update period (the value of today). |
| `HAND_REFRESH_MS` | 500 | Unlock check period. |
| `TIP_CHECK_MS` | 2000 | Tip rule check period. |
| `TIP_MIN_GUESTS` | 20 | Rule 3 needs this many guests. |
| `TIP_GAP_POINTS` | 15 | Rule 3 gap, in percentage points. |
| `CARD_DRAG_PX` | 8 | Pointer move that starts a card drag (the drag threshold of Phase 6 §4.7). |
| `CARD_LIFT_PX` | 12 | Rise of the held card. |
| `MASCOT_MIN_WIDTH_PX` | 1100 | Bottom mascots show from this screen width. |

## 9. Text
New texts go in the string table with ids. No text ends with a period (the rule of the string table). The English texts are:

- Decks: "Card decks", "Rides", "Stalls", "Paths", "Scenery", "Manage", "{deck} cards".
- Cards: "From {cost}", "Track", "Put back", "Details", "Earlier cards", "More cards" (the two scroll arrows).
- Mood: "No guests yet", "The park leans to Thrill", "The park leans to Chill", "The park is in balance".
- Controls: "Speed", "Messages", "Messages, {count} unread", "Menu".
- Details: "Seats", "Ticket", "Running cost per month", "Size", "{w} × {d} tiles", and the two hints of section 4.7.
- Tips: the texts and button labels of section 4.8, "Close", "Mascot tip" (the name of the bubble), "Mascot tips" and "Frost and Spark give short tips" (the setting and its detail).

`en-XA` gets every new id. The completeness test of Phase 6 covers them.

## 10. Tests
- **Unit (Vitest):**
  - Deck model: each of the 21 old tool ids has exactly one new place; each extension toolbar entry names a deck; card order for a fixed catalog; zones with no card are not listed.
  - Mood model: lean, knot position, and text at `L` = −100, −10, −9, 0, 9, 10, 100, and with no guests.
  - Tip model: each rule on and off; rule order; the tie rule; 19 and 20 guests; gap 14 and 15; a closed tip returns only after its rule stops and starts again; setting off gives no tip; the Tutorial scenario gives no tip.
  - Settings: a version 1 document loads and gets `mascotTips: true`, and its other values do not change; a version 2 document with no `mascotTips` is unreadable; a non-boolean value is unreadable; a version 3 document is unreadable.
- **Playwright, desktop and phone:**
  - Each of the 21 old tools is reachable, and its panel, bar, or tool state is the same as before.
  - Hold the Carousel card, place it: one ride exists and cash falls by $1,200.
  - A track ride card starts the station builder.
  - Put back, `Esc`, and Cancel select Inspect.
  - A research unlock adds its card to the open hand with no reload.
  - Tip `noRide` shows in a new park; Close hides it; it is absent in the Tutorial.
  - The mood bar button turns the Temperament overlay on and off.
  - Accessibility scan (axe) of the game screen with the hand open, with a tip, and with the card details panel: no serious or critical issue.
  - `en-XA` at 175%: no element outside the screen; every button ≥ 44 × 44 px.
  - The Tutorial runs to its end.
- **Playwright, desktop only:** drag the Carousel card to a valid tile (built) and to an invalid tile (not built, reason shown).
- **Playwright, phone only:** the status pill shows cash, guests, and rating at 390 px; the free map area is ≥ 45% of the screen height with the hand open.
- **Existing suites:** all unit, integration, and e2e tests pass. Tests that used the toolbar or the pickers change to the new controls through one helper in `tests/e2e/helpers.ts`. No test is skipped or removed without a replacement that checks the same behaviour.
- **Performance:** the frame budgets of Phase 6 §4.6 still pass (`perf.spec.ts`, `perf-build3.spec.ts`).

## 11. Done when
- [ ] The game screen has no toolbar and no picker panel; every old tool works from its new place.
- [ ] The mood bar, the faces, and the lean text follow the guest mix.
- [ ] A player can build a ride with press-then-press on desktop and phone, and with a drag on desktop.
- [ ] The card details panel shows all data that the old picker cards showed.
- [ ] The 3 tips work, can be closed, and can be turned off.
- [ ] All UI surfaces use the new tokens and the bundled font; the build makes no font request to another host.
- [ ] The accessibility scan, the text scale test, and the pseudo-locale test pass.
- [ ] All tests pass. CI is green. The size of the JavaScript bundle and of the font file is recorded in the changelog.
- [ ] The build table of the master spec has a Build 4 row. The README describes the new controls.
- [ ] The owner has looked at screenshots of the real game at 1280 × 800 and 390 × 844 and has accepted them.

## 12. Risks and open questions
| Risk | Mitigation |
|---|---|
| The real game does not look like the draft pictures, because the park art is not pixel art. | Stated at the top of this spec. The owner accepts screenshots of the real game before release (section 11). |
| A light interface with a new font changes every screen. Old hard-coded dark colours can give text that is hard to read. | All colours move to tokens. The axe scan runs on the game screen, each panel, the settings screen, and the title screen. |
| The top and bottom regions use more of a phone screen than the old bars. | The hand closes with one press. The 45% map area test. |
| A card drag can conflict with a map drag or with hand scrolling. | Drag is for mouse and pen only, starts on a card only, and needs 8 px of movement. |
| About 40 selectors in the e2e tests use the toolbar. | The new controls keep `data-tool` and `tool-<id>`. One test helper opens the correct deck first. |
| Rule 3 counts rides, not seats, so a large coaster and a small ride count the same. | The values are provisional. The rule is one pure function that a play-test can tune. |
| The tips can annoy an expert player. | Close per tip, and one setting for all tips. |

**Open questions for the owner.** Each has a default. The work uses the default unless the owner says otherwise.
1. Deck name for Scenery, Land, Water, and Buy land. Default: "Scenery", as in the draft.
2. Release of Build 4. Default: when Phase 7 is done. The pixel-art park (proposed Phase 8) is a later build.
