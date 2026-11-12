# Phase 7 — Interface ("Frost and Spark")

- **Build:** 4. No save schema change. Settings document version 2.
- **Status:** Built in Build 4 (4.0.0). The owner acceptance of the screenshots is open (`build-4-acceptance.md`). Sections 4.1, 4.2, 4.4, 4.6, 4.7, 4.8, 4.9, 4.10, 4.12, 7, 8, 9, and 12 describe what was built where it differs from the first draft; 4.1 and 4.2 also describe the day chip and the view controls that replaced the day pill after the owner's test play; 4.1, 4.2 and 4.3 also describe the upright phone's compact top row with the mood circle and the date chip (Task 21, after the owner's test play).
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
| **Status pill** | Top left. | Top row, left (cash and guests; the compact top row, below). |
| **Deck list** | Top left, below the status pill. A column. When the column does not fit, it scrolls and Demolish stays in view at its bottom. | A row of chips directly above the hand. The row scrolls sideways. |
| **Mood bar** | Top centre. Width `clamp(280px, 40vw, 520px)`. | Top row, right of the status pill: the mood circle (section 4.3). |
| **Controls** | Top right, row 1: the 4 speed buttons, Messages, Menu. | Menu at the right end of the top row; one Speed button and Messages under the row at the right, left of the view controls. |
| **Chip row** (day chip, objectives flag, view controls) | Top right, row 2, right-aligned under the controls: `[day chip] [objectives flag] [view controls]`, with no plate round the group. | The day chip is in the top row, left of Menu. Under the row at the right: the Speed button, Messages and the two view rotate buttons; the objectives flag at the left of that row; the map shows between them. With large text (above 100%) the chip leads the row under the top row, and that row wraps when it is full. |
| **Hand** | Bottom centre, on the zone strip. | Bottom, full width. |
| **Tip bubble** | Centred above the hand, in the place of the tool status bar (section 4.8). | Below the buttons under the top row. A tip too tall for the space above the chip row moves up over the top region. |
| **Card details** | The side panel on the right (the existing panel position). | The bottom sheet (the existing sheet). |

Rules:
- The UI root keeps the CSS variables `--hud-bottom` (bottom edge of the top region) and `--toolbar-space` (height of the bottom region). The UI measures both with a `ResizeObserver`, as it does today. Existing panels, bars, and toasts use these variables, so they stay clear of the new regions. On desktop, `--toolbar-space` is now the height of the hand, and the side panel ends above the hand.
- **Exception (desktop, card details):** when the card details panel does not fit above the hand (large text or a low window), it runs to the bottom of the screen and the hand gets narrower: it ends at the left edge of the panel (`data-details="tall"` on the UI root). The UI measures this when the panel opens or closes and when a region changes its size.
- The chip row has no plate and `pointer-events: none`; only the day chip, the objectives flag, and the view controls take a press. A press between them goes to the map. The row is as high as its controls (44 px at 100%).
- The zone strip has `pointer-events: none`. A click on it goes to the map. (No full-body mascots are drawn at the bottom corners; see section 4.8.)
- With the hand open on a 390 × 844 screen at 100% text scale, the free map area is at least 45% of the screen height.

#### Compact top row on the upright phone
Added after the owner's test play (Task 21; the owner chose the design "One row, compact"). It holds on the upright phone (`data-layout="bottom"` without `data-low`); the desktop and the low layout keep their top region.

```
┌────────────────────────────────────────┐
│ $14,994 👤0  (😊48)  [☀ Mar 9:04]   (≡) │
└────────────────────────────────────────┘
                       (⏸) (✉) (⟲) (⟳)
```

1. **One row:** the status pill (cash and guests, no rating), the mood circle (section 4.3), the day chip (section 4.2) and Menu, 8 px apart, each a 44 × 44 px target (the chip's press area is its weather button). The plate is 44 px high at 100% text (at most 52 px). The pill shows the cash in whole dollars; the full value is in its accessible name and title.
2. **Under the row, at the right edge:** the Speed button (Pause, `1×`, …), Messages and the two view rotate buttons, round 44 × 44 px buttons 8 px apart in one row with no plate; a press between them reaches the map. A scenario's objectives flag sits at the left of that row.
3. **Order:** `hud.ts` moves the parts into this order when the mode or the text scale changes (not per frame), so the focus order follows the rows: pill, mood circle, chip, Menu, then the flag, Speed, Messages, the rotate buttons.
4. **`--hud-bottom`** is the bottom of the buttons under the row: 104 px at 390 × 844 and 100% text (162 px before). The tip, the panels and the legend strip sit below it.
5. **Large text (above 100%):** the chip leads the row under the top row, so Menu stays in the top row (a tall mascot tip that moves up over the region cannot cover it); the row under it wraps when it is full, its buttons at the right. At 175% with `en-XA` nothing is clipped and every control can be reached.

#### Track station row and overlay legend strip on the phone
Added after the owner's test play (Task 20; the owner chose these designs). They hold on the phone (`data-layout="bottom"`) and in the low layout (`data-low="1"`); the desktop keeps the station panel and the legend card as before.

1. **Track station row:** in the station step the track builder is one slim row at the bottom (above the deck chips): the ride name (cut with an ellipsis when the row is full; the heading keeps the whole name), the length stepper (− n +; the number alone on the screen, the whole "3 tiles" for screen readers), a round Rotate button (accessible name "Rotate"), Confirm with the price ("✓ $1,308"; accessible name "Confirm Mini Railway station, $1,308"), and a "⋯" button (accessible name "More") whose small menu above the row holds Details and Cancel. Every control is 44 × 44 px or more with 8 px gaps, and the plate is at most 64 px high at 100% text (at larger text the name takes its own line and the controls wrap; nothing is cut). A station that does not fit disables Confirm, and its reason (the same text as before) shows directly above the row. The hint "Tap the map to move the station, then Confirm" is the row's accessible description, not a line on the screen. In the low layout the row is centred above the deck chips, as wide as its content. The piece-building step after the station is unchanged (a right-side panel in the low layout).
2. **Overlay legend strip:** the legend of an overlay is a slim strip under the top region, at the right: a colour dot and the name of each band, no number ranges, at most 28 px high at 100% text (Temperament: Chill · Family · Thrill). The ranges are in the strip's accessible name ("Temperament colour key: Chill 0–35, Family 36–64, Thrill 65–100"). Calm, Buzz, and Light use the same strip; their tile value ("Calm here: 102 (Medium)", or the tap hint) shows on a second line under it.

#### Low layout (a phone held sideways)
Added after the owner's test play (Task 19; the owner chose this design). A window is **low** when its height is below 500 CSS px and it is wider than high (`isLowScreen`, `LOW_HEIGHT_PX = 500`, `src/ui/layout.ts`). A low window has the phone layout at every width, also from 900 px (`toolbarPlacement(width, height)` returns `'bottom'`), and the UI root has `data-low="1"` (no such attribute otherwise). Its own rules:

1. **Top region:** one row that may wrap: the status pill (one line: cash, guests, rating), the mood bar (the free width, at least 140 px), the controls (as on the phone), then the day chip and the view controls. When they do not fit in one row, the day chip (left) and the view controls (right) go to a second row with no plate between them. At 844 × 390 everything is in one row; at 667 × 375 there are two.
2. **Hand:** closed when a park starts and when the window becomes low. A deck chip opens it above the chip row, which stays at the bottom; a second press closes it; it tucks away while a card is pressed (the phone rule) and while the track builder is open. Between the chips a press goes to the map. A hand taller than the room under the top region (large text) scrolls inside.
3. **Panels:** every part that is a bottom sheet on the upright phone is a panel at the right side: at the right edge (with the safe inset), `min(360px, 48%)` wide, from just below the top region (`--hud-bottom`; a wrapped second row keeps its view controls free) to just above the deck chips row (`--chips-space`), its content scrolling inside, no drag handle. This holds for the panels (they carry `data-layout="side"`), the card details panel, the track builder, the scenery and show pickers, and the objectives panel. The bars with a few buttons (the path item bar, the patrol bar) stay at the bottom in one row.
4. **Bars:** the tool status bar is one row when its content fits (text at the left, the buttons at the right). The tool status bar, the path Height bar and an open right-side panel never overlap: beside an open panel the bars end left of it. The tip bubble is at most 420 px wide, at the left under the top region (it never moves up over it), and hides while a panel or the hand is open. Toasts and the overlay legend keep clear of the top region (the legend scrolls inside).
5. **Free map:** `freeMapShare(page)` (24 × 12 points, `document.elementFromPoint`) at 100% text: a new park with the hand closed at least 0.60 at 844 × 390 and 0.50 at 667 × 375; the Rides deck open at least 0.20; a held Carousel card at least 0.50 and 0.40; the Finance panel open at least 0.35; the track builder after a station at least 0.30.
6. **Turning the phone:** a change between upright and sideways keeps the game state: a held card stays held, an open panel stays open in its new form, the camera keeps its centre; the hand closes when the window becomes low. At 175% text no text is clipped and every control can be reached (the shares are not required there).

### 4.2 Status pill, day chip, and view controls
**Status pill.** One button. It opens the Park panel.
- Desktop: park name, cash, guests, rating. Each number has a text label.
- Phone: cash, guests, rating. Guests and rating have an icon and a screen-reader label. The upright phone's compact top row (section 4.1) shows cash and guests only: the rating is in the mood circle's name and title; the cash shows in whole dollars, and the full value is in the pill's accessible name (a screen-reader span) and title.
- Phone, text scale 150% or 175%: cash only. The Park panel shows the guest count and the rating.
- Negative cash shows a minus sign and the danger text colour.
- The elements keep their test ids: `hud-name`, `hud-cash`, `hud-guests`, `hud-rating`.

**Day chip** (`data-testid="day-pill"`; after the owner's test play the wide day pill became this chip). A slim pill that holds only the weather badge and the date and clock (`hud-date`).
- At text scale 100% the visible plate is at most 36 px high and as wide as its content (at most 200 px with `Mar · Year 1 · 17:00`); font `calc(13px * var(--ts, 1))`; weather icon 20 px, forecast icon 12 px; surface, ink outline, full radius.
- The weather badge (`hud-weather`) is a 44 × 44 px button that reaches past the plate's edges (transparent there). Its name is the weather text only, not the date. A press shows the forecast as a toast.
- Upright phone (compact top row, Task 21): the chip shows the month and the clock, "Mar 09:04" (`date.short`); the year is in the chip's accessible name and title (the chip is a group named with the whole date, "Mar · Year 1 · 09:04").

**Objectives flag** (scenario, `hud-objectives`): directly right of the day chip, 8 px from it.

**View controls** (`.view-controls`): the two view rotate buttons, round 44 × 44 px buttons 8 px apart with the look of the other round buttons of the top region. The view module builds them; `createHud` places them at the right end of the chip row (`UiExtension.hudSlot: 'end'`). Every other `UiExtension.hud` part sits in the `chip` slot, right of the day chip.

**Controls.**
- Speed: the same 4 buttons in the same group named "Game speed". On a phone, one Speed button shows the current speed (pause icon, `1×`, `2×`, or `4×`); its name is the name of that speed ("Pause", "Speed 2×"). It opens the group as a small menu. A choice or `Esc` closes the menu; when the focus was in the menu, it goes back to the Speed button.
- Messages: a button with the unread badge (`messages-badge`). It opens the Messages panel.
- Menu: opens the existing menu dialog.

### 4.3 Mood bar
The mood bar shows the guest mix, the same data as today (`temperamentShares` and `sharePercents` in `src/ui/format.ts`). It updates every 500 ms.

- **Parts:** Frost head at the left end. Spark head at the right end. Between them, three segments: Chill, Family, Thrill. A knot marks the lean. There is no line of text below the bar: the lean text is in the accessible name and in the `title`.
- **Size (after the owner's test play):** the plate is 44 px high at 100% text on both layouts (it may grow with large text; nothing is clipped). The faces are 30 px high. The track is 16 px high on the desktop (times the text scale) and 14 px on the phone. On the desktop the bar is at most 400 px wide and centred in the top region.
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
- **Colour is not the only signal:** on the desktop each segment shows its percentage as text (`calc(11px * var(--ts, 1))`, bold) when the segment is at least 44 px wide (times the text scale); the phone segments show no numbers. When the knot would cover the percentage, the text moves to the larger part of its segment beside the knot; it is hidden when that part is under 44 px times the text scale (`segmentLabel`, `src/ui/mood/model.ts`). The accessible name (on both layouts) gives the same data.
- **Reduced motion:** the knot moves with no transition.
- **Mood circle (upright phone, Task 21):** on the compact top row the same button (`hud-balance`, `data-tool="temperament"`, the same press and `aria-pressed`) is a 44 × 44 px circle. It shows the face of the group that leads now (Frost for Chill, Spark for Thrill, with the mood of the face rule above; for Family the mascot that the face rule makes sad, or both happy faces when neither is sad; ties go Chill, Family, Thrill) and a small counter (`mood-count`) with that group's share in percent, on the group's accent colour. With no guests it shows both happy faces and no counter. Its accessible name and its title hold the three percentages, the lean text and the park rating: "Thrill/Chill balance: 40% Chill, 30% Family, 30% Thrill, The park leans to Chill, Park rating 538" (`ui.mood.nameRating`). The track and the two end faces are not shown there (`leadFace`, `src/ui/mood/model.ts`).

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
- **Phone tuck:** on the phone layout the hand tucks away (hidden; `--toolbar-space` is then the height of the chip row) while any card is pressed, and comes back when no card is pressed. A press on a deck chip while the hand is tucked shows the hand. The desktop hand never tucks.
- **Research messages:** a research message that unlocked a ride or stall (its row in the Messages panel, or the Show button of its toast) opens the Rides or Stalls deck and scrolls the new card into view; the Messages panel closes first (`goToTarget`, `src/ui/management/widgets.ts`). A press on the row with the keyboard moves the focus to the new card. Otherwise the card does not take the focus: after a pointer press on the row, a focus inside the closing Messages panel goes to the map, as for any closing panel. It replaces the old ride and stall pickers as the message's target.
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

Each new control keeps the `data-tool` value of the button that it replaces (Inspect has no control). Tool cards, Demolish, Messages, and Menu also keep `data-testid="tool-<id>"`. The deck buttons have `data-testid="deck-<id>"` (the Rides and Stalls deck buttons keep `data-tool`). The mood bar keeps `data-testid="hud-balance"` and has `data-tool="temperament"`.

### 4.5 Hand and cards
The hand is a group named "{deck} cards". It shows only unlocked content, as the pickers do today.

**Content card (ride or stall).** One button with:
- a header band with the zone name as text (Chill, Family, Thrill, or the stall kind),
- the preview picture (`drawPreview` or `drawTrackPreview`, drawn one time and kept),
- the name,
- the build cost. A track ride card shows "From {cost}" and the word "Track".

The accessible name of a card is its visible text, as Phase 6 §4.7 requires.

**Size (after the owner's test play, about 12% smaller):** ride and stall cards 112 × 152 CSS px on desktop, 92 × 124 on phone; tool cards (`--card-w`, `--card-h`) 92 × 110 on desktop, 82 × 96 on phone; multiplied by the text scale up to 150%. The picture gives way to the text down to 0.3 of the card height on desktop (the picture of a card whose cost and Track tag take two rows) and 18 px on phone (times the text scale); the desktop name has 5 px side padding, so every name fits one line at 100% text; a card whose text needs more room at large text grows, and all cards of a deck keep one height. Font sizes do not change.

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
- **Put back as built** (`putBack`, `src/ui/decks/toolCards.ts`): a card that is pressed because its tool is active (a ride or stall card, every tool card, Shows while `placeShowSite` runs) selects Inspect. Staff while its `patrol` tool runs drops the patrol member, selects Inspect, and closes the staff panel, so one press puts the card back (the panel does not open again when the patrol tool ends). A card that is pressed because its panel or its chips are open (Staff, Research, Marketing, Finance, and Park with their panel; Overlays with its chips; Shows with its picker) does what its second press does: it closes them.
- On desktop the card details panel opens with the held card (section 4.7); when it does not fit above the hand, the exception of section 4.1 applies (`data-details="tall"`).
- After a build, the tool stays active or returns to Inspect by the rules of today. Phase 7 does not change them.

**Place.** The player places the building on the map with the existing input: move the ghost, then click, or press Confirm on touch. The tool status bar keeps Rotate, Confirm, and Cancel, and gets a **Details** button on a phone. On the phone a bar too tall for the space between the top region and the hand (large text, the hand shown again over a held card) moves up over the top region and stays in the viewport; it scrolls inside, and its row of Rotate, Confirm, and Cancel stays in view at its bottom.

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
- the hint, one of four (`detailsHintId`): on desktop, a flat ride or stall "Drag the card to the map. Or press the card, then press the map" and a track ride "Click the map to place the station, then build the track piece by piece"; on phone, a flat ride or stall "Tap the map, then press Confirm" and a track ride "Tap the map to move the station, then press Confirm".

Rules:
- Desktop: the panel opens when a content card becomes the held card.
- Phone: the panel opens from the Details button in the tool status bar. For a held track ride card the tool status bar does not show, so the Details button is in the station builder (`track-details`), in the menu of its "⋯" button (section 4.1, track station row).
- Track ride: the panel shows three track lines (drive, maximum height, seats per car); the "From" cost is in the cost chip next to the zone.
- The panel closes when no content card is held. Closing the panel does not put the card back.
- This panel replaces the stat bars of the old picker cards. No ride or stall data that the picker shows today is lost.

### 4.8 Mascot tips
A tip is one short sentence from Frost, Spark, or both, with at most one button. Tips read the game state. They never change it.

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

**Display (as built, `src/ui/tips/bubble.ts`).** No full-body mascots are drawn at the bottom corners: the owner dropped them (no mascots on the title screen; the small faces stay in the mood bar, the tip bubble, and the tutorial). The constant `MASCOT_MIN_WIDTH_PX` is removed.
- One tip at a time, in a bubble with a small face of the speaker (the `mascotCanvas` portrait: Frost, Spark, or both). The bubble has the name "Mascot tip". Screen readers hear the tip from a visually hidden `role="status"` region that stays in the page: it gets the tip's sentence when the bubble shows or its tip changes, and is emptied when the bubble hides (the bubble itself has no `aria-live`).
- **Place:** on desktop the bubble sits centred above the hand, in the place of the tool status bar. On the phone it sits below the chip row; when it is too tall for the space above the chip row (large text), it moves up over the top region, so it never covers the chips.
- A **Close** button hides the tip. A closed tip stays hidden until its rule stops matching and then matches again. This is session data; a new park starts with no closed tip, and its first check runs one period (`TIP_CHECK_MS`) after the start.
- **No tip** (the rules give none): in the Tutorial scenario, and while the **Mascot tips** setting is off. The setting (Settings, Gameplay, default On) turns all tips off; a settings change checks the rules at once.
- **Hidden while** (the tip comes back when this ends and its rule still matches):
  - a dialog is open, or the title screen is open;
  - a tool other than Inspect is active (for example a held card);
  - a map overlay is on, or the overlay chip row is open (on the phone the overlay legend takes the bubble's place);
  - on the phone, a panel is open, or a card of the hand is pressed (for example while the Shows or Scenery picker is open).
- When the bubble hides while one of its buttons has the focus, the focus goes to the Rides deck button, not to the page body.
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
- **Font:** Fredoka (SIL Open Font License 1.1), weights 400 to 700, as two WOFF2 files (Latin and Latin Extended) in the build with its licence text. The game makes no request to another host for it. The offline cache list includes it. The system font stack is the fallback, and the layout tests also pass with the fallback: the 100% test of the top region and the hand (`tests/e2e/interface.spec.ts`) and the 175% `en-XA` layout test (`tests/e2e/a11y.spec.ts`) each run once with the font files blocked.
- **High contrast setting:** outlines are 4 px, `--surface-2` is white, and `--muted-ink` is ink. The setting detail text changes to "Thicker outlines and stronger text".
- **Focus ring:** 2 px white, then 3 px ink. It is visible on every surface and on the map. A held card draws it inside its own edge (a 3 px ink line over the card's content, `outline-offset: -8px`) with a 3 px gold edge outside, so the ring stays clear of the zone name above the raised card.
- **Motion:** a held card rises in 120 ms. Reduced motion removes this and the knot transition.
- The canvas, the park art, and the night lighting do not change.

### 4.10 Accessibility
Phase 6 §4.7 applies in full. For the new parts:
- **Tab order:** status pill, mood bar, controls, day chip, objectives flag, view controls, deck list, hand, tip, panel.
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

### 4.12 Title screen
Phase 7 also replaced the title screen (added after the scope of section 3, at the owner's request): a pixel-art skyline park with the game name and a menu (Continue with the saved park, New game, Load, Import, Settings, Credits), drawn from picture data in the build with no image files. Its design, layout rules, and tests are in [`phase-7-title-screen.md`](phase-7-title-screen.md).

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
| Mood bar | `src/ui/mood/moodBar.ts` | The bar, the faces, the overlay toggle; the mood circle of the upright phone (Task 21). |
| Tip model | `src/ui/tips/model.ts` | Pure. The 3 rules and the closed-tip rule. |
| Tip bubble | `src/ui/tips/bubble.ts` | The bubble with a small face, its button, and its hide rules. |
| Top region | `src/ui/hud.ts` (rewritten) | Status pill, controls, chip row (day chip; places the extension parts by `hudSlot`); the compact top row of the upright phone (Task 21). |
| Tuning | `src/data/tuning/interface.ts` | The constants of section 8. |
| Strings | `src/data/strings/interface.ts` | The texts of section 9. |

- `src/ui/toolbar.ts`, `src/ui/panels/picker.ts`, and `src/ui/track/picker.ts` are removed. The hand lists the track rides with `pickableTrackTypes` and `stationCost` (`src/ui/track/builder.ts`) in `rideCards` (`src/ui/decks/model.ts`).
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

## 9. Text
New texts go in the string table with ids. No text ends with a period (the rule of the string table). The English texts are:

- Decks: "Card decks", "Rides", "Stalls", "Paths", "Scenery", "Manage", "{deck} cards".
- Cards: "From {cost}", "Track", "Put back", "Details", "Earlier cards", "More cards" (the two scroll arrows).
- Mood: "No guests yet", "The park leans to Thrill", "The park leans to Chill", "The park is in balance".
- Controls: "Messages", "Messages, {count} unread", "Menu". The phone Speed button is named with the existing speed names ("Pause", "Speed 1×", "Speed 2×", "Speed 4×").
- Details: "Seats", "Ticket", "Running cost per month", "Size", "{w} × {d} tiles", and the four hints of section 4.7.
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
| About 40 selectors in the e2e tests use the toolbar. | The new controls keep `data-tool`; the deck buttons use `deck-<id>`. The test helpers (`toolControl`, `openTool`, `cardOf` in `tests/e2e/helpers.ts`) open the correct deck first. |
| Rule 3 counts rides, not seats, so a large coaster and a small ride count the same. | The values are provisional. The rule is one pure function that a play-test can tune. |
| The tips can annoy an expert player. | Close per tip, and one setting for all tips. |

**Open questions for the owner.** Each has a default. The work uses the default unless the owner says otherwise.
1. Deck name for Scenery, Land, Water, and Buy land. Default: "Scenery", as in the draft.
2. Release of Build 4. Default: when Phase 7 is done. The pixel-art park (proposed Phase 8) is a later build.
