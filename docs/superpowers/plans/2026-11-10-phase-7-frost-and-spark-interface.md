# Phase 7 Interface ("Frost and Spark") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the HUD bar and the 21-button toolbar with a status pill, a mood bar with Frost and Spark, five card decks, a hand of cards, a card details panel, and three mascot tips, in a new light look.

**Architecture:** Pure models (`src/ui/mood`, `src/ui/tips`, `src/ui/decks/model.ts`) hold every rule and run in Node tests. Thin DOM parts read the models each frame and write `ToolState` or open panels exactly as the toolbar and the pickers do today. The work is a strangler: each task leaves a game in which every tool works.

**Tech Stack:** TypeScript strict, Vite, plain CSS, Canvas 2D, Vitest (Node environment), Playwright (projects `desktop` 1280 × 800 and `phone` Pixel 7).

**Spec:** `docs/superpowers/specs/thrills-and-chills/phase-7-frost-and-spark-interface.md`. Read it before each task. Section numbers below (§) refer to it.

## Global Constraints

- No file under `src/sim/` changes. No new command. The save schema stays at version 3.
- No new package in `package.json`. The font files are copied into the repository.
- All player text comes from the string table. No text ends with a period. No UI text is hard-coded (the `en-XA` e2e tests find plain ASCII words).
- Every control is at least 44 × 44 CSS px, has a text label or an `aria-label`, and has 8 px gaps.
- Every font size is `calc(Npx * var(--ts, 1))`.
- After Task 5, `src/styles/main.css` and the style modules contain no colour literal. Colours come from `src/styles/tokens.css`.
- A replacement control keeps the `data-tool` value and `data-testid="tool-<id>"` of the toolbar button that it replaces. These test ids stay: `hud-name`, `hud-cash`, `hud-guests`, `hud-rating`, `hud-date`, `hud-balance`, `hud-weather`, `hud-objectives`, `messages-badge`, `tool-status`, `tool-status-detail`.
- A frame with no change makes no DOM write. Use `setText`, `setAttr`, and `toggleClass` from `src/ui/dom.ts`.
- Drawing functions are deterministic.
- Never skip, disable, or weaken a test to get green. A test that used the toolbar or a picker changes to the new control and checks the same behaviour.
- Work on branch `ccr-6f420895-3xt45j`. One commit per task. End each commit message with the attribution lines of the session. Do not open a pull request.
- Gates for every task: `npm run typecheck` (no output), `npm test` (all pass), and the e2e specs that the task names. Tasks 6, 9, 10, and 14 also run the full `npm run e2e`.

**Baseline (Build 3 gate; measure again before Task 1 and keep the numbers for Task 14):** `npm test` 3,463 passed, 2 skipped. `npm run build` 306.4 KB gzip JavaScript. `npm run e2e` 130 passed, 74 skipped, 0 failed.

## Review Focus

Conditions that the spec implies but does not test, most likely first. Each has a test in the task named.

1. **A save is loaded while a card is held, or while the hand shows the cards of the old park.** The player expects the hand of the loaded park and no held card. Test: Task 10.
2. **The window crosses 900 px while the phone Speed menu is open.** The player expects exactly one visible speed control in each layout. Test: Task 7.
3. **A 32-character park name and a ten-digit cash value.** The player expects the controls to stay on the screen. Test: Task 7.
4. **A card drag ends with `pointercancel` or outside the window.** The player expects no build and no ghost that follows later moves. Test: Task 12.
5. **A deck has no unlocked card.** The player expects the text "Nothing is available yet", not an empty strip. Test: Task 10.

## File Structure

| File | Task | Responsibility |
|---|---|---|
| `src/data/tuning/interface.ts` | 1 | Constants of §8. |
| `src/data/strings/interface.ts` | 1 | New English texts (§9). |
| `src/ui/mood/model.ts` | 1, 8 | Lean, knot, lean text id, face moods. Pure. |
| `src/ui/tips/model.ts` | 2 | The 3 tip rules and the closed-tip rule. Pure. |
| `src/ui/decks/model.ts` | 3 | Tool places, card order, zones, held card id. Pure. |
| `src/settings/schema.ts`, `types.ts` | 4 | Settings version 2 and its migration. |
| `src/styles/tokens.css` | 5 | Every colour, the font face. |
| `src/assets/fonts/fredoka/` | 5 | Two WOFF2 files and the licence. |
| `tests/e2e/helpers.ts` | 6, 9, 10 | One way to reach a tool or a card. |
| `src/ui/hud.ts` | 7 | Status pill, controls, day pill. |
| `src/ui/mood/moodBar.ts` | 8 | The mood bar. |
| `src/ui/decks/toolCards.ts`, `card.ts`, `hand.ts`, `deckList.ts`, `index.ts` | 9, 10 | Deck list, hand, cards. |
| `src/ui/panels/cardDetails.ts` | 11 | Card details rows and panel. |
| `src/ui/decks/drag.ts` | 12 | Mouse and pen drag. |
| `src/ui/tips/bubble.ts`, `src/ui/tips/bottomMascots.ts` | 13 | Tip bubble, bottom mascots. |
| Removed: `src/ui/toolbar.ts` (Task 9), `src/ui/panels/picker.ts` and `src/ui/track/picker.ts` (Task 10). | | |

---

### Task 1: Constants, strings, mood model

**Files:**
- Create: `src/data/tuning/interface.ts`, `src/data/strings/interface.ts`, `src/ui/mood/model.ts`
- Modify: `src/data/strings/en.ts` (spread `interfaceStrings` after `uiStrings`)
- Test: `tests/unit/ui/mood.test.ts`, `tests/unit/ui/interfaceStrings.test.ts`

**Interfaces:**
- Produces, `src/data/tuning/interface.ts`: `LEAN_BALANCE_POINTS = 10`, `MOOD_UPDATE_MS = 500`, `HAND_REFRESH_MS = 500`, `TIP_CHECK_MS = 2000`, `TIP_MIN_GUESTS = 20`, `TIP_GAP_POINTS = 15`, `CARD_DRAG_PX = 8`, `CARD_LIFT_PX = 12`, `MASCOT_MIN_WIDTH_PX = 1100`.
- Produces, `src/ui/mood/model.ts`:
  - `type Group = 'chill' | 'family' | 'thrill'`
  - `type SharePercents = Record<Group, number>` (the output of `sharePercents` in `src/ui/format.ts`)
  - `type LeanTextId = 'ui.mood.none' | 'ui.mood.thrill' | 'ui.mood.chill' | 'ui.mood.balance'`
  - `lean(p: SharePercents): number`
  - `knotPercent(p: SharePercents): number`
  - `leanTextId(p: SharePercents, totalGuests: number): LeanTextId`
- Produces, `src/data/strings/interface.ts`: `export const interfaceStrings: Record<string, string>` with exactly these entries:

```ts
'ui.deck.label': 'Card decks',
'ui.deck.rides': 'Rides',
'ui.deck.stalls': 'Stalls',
'ui.deck.paths': 'Paths',
'ui.deck.scenery': 'Scenery',
'ui.deck.manage': 'Manage',
'ui.deck.cards': '{deck} cards',
'ui.card.from': 'From {cost}',
'ui.card.track': 'Track',
'ui.card.putBack': 'Put back',
'ui.card.details': 'Details',
'ui.hand.prev': 'Earlier cards',
'ui.hand.next': 'More cards',
'ui.mood.none': 'No guests yet',
'ui.mood.thrill': 'The park leans to Thrill',
'ui.mood.chill': 'The park leans to Chill',
'ui.mood.balance': 'The park is in balance',
'ui.controls.speed': 'Speed',
'ui.details.seats': 'Seats',
'ui.details.ticket': 'Ticket',
'ui.details.running': 'Running cost per month',
'ui.details.size': 'Size',
'ui.details.sizeValue': '{w} × {d} tiles',
'ui.details.hintDesktop': 'Drag the card to the map. Or press the card, then press the map',
'ui.details.hintPhone': 'Tap the map to place it',
'ui.tip.label': 'Mascot tip',
'ui.tip.close': 'Close',
'ui.tip.cashLow': 'Cash is below zero. Look at Finance',
'ui.tip.cashLow.button': 'Open Finance',
'ui.tip.noRide': 'Build a ride and open it. Guests come for rides',
'ui.tip.noRide.button': 'Show rides',
'ui.tip.underServed.chill': 'My Chill guests need a calm ride',
'ui.tip.underServed.family': 'Family guests need a family ride',
'ui.tip.underServed.thrill': 'My Thrill guests need a wild ride',
'ui.tip.showZone': 'Show {zone} rides',
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/ui/mood.test.ts
import { describe, expect, it } from 'vitest';
import { knotPercent, lean, leanTextId } from '../../../src/ui/mood/model';

const p = (chill: number, family: number, thrill: number) => ({ chill, family, thrill });

describe('mood model (Phase 7 §4.3)', () => {
  it('lean is thrill minus chill; the knot is at 50 + lean / 2', () => {
    expect(lean(p(100, 0, 0))).toBe(-100);
    expect(knotPercent(p(100, 0, 0))).toBe(0);
    expect(knotPercent(p(0, 100, 0))).toBe(50);
    expect(knotPercent(p(15, 56, 29))).toBe(57);
    expect(knotPercent(p(0, 0, 100))).toBe(100);
  });
  it.each([
    [p(100, 0, 0), 'ui.mood.chill'],
    [p(40, 30, 30), 'ui.mood.chill'],
    [p(39, 31, 30), 'ui.mood.balance'],
    [p(30, 40, 30), 'ui.mood.balance'],
    [p(30, 31, 39), 'ui.mood.balance'],
    [p(30, 30, 40), 'ui.mood.thrill'],
    [p(0, 0, 100), 'ui.mood.thrill'],
  ])('%j gives %s', (shares, id) => expect(leanTextId(shares, 50)).toBe(id));
  it('no guests gives the no-guests text', () => expect(leanTextId(p(0, 0, 0), 0)).toBe('ui.mood.none'));
});
```

```ts
// tests/unit/ui/interfaceStrings.test.ts
import { describe, expect, it } from 'vitest';
import { interfaceStrings } from '../../../src/data/strings/interface';
import { text } from '../../../src/data/strings/en';

describe('interface strings (Phase 7 §9)', () => {
  it('every key starts with ui. and no text ends with a period', () => {
    expect(Object.keys(interfaceStrings)).toHaveLength(35);
    for (const [k, v] of Object.entries(interfaceStrings)) {
      expect(k.startsWith('ui.'), k).toBe(true);
      expect(/\.$/.test(v), `${k}: "${v}"`).toBe(false);
    }
  });
  it('spec texts are exact and take params', () => {
    expect(text('ui.mood.thrill')).toBe('The park leans to Thrill');
    expect(text('ui.tip.cashLow')).toBe('Cash is below zero. Look at Finance');
    expect(text('ui.deck.cards', { deck: 'Rides' })).toBe('Rides cards');
    expect(text('ui.tip.showZone', { zone: 'Chill' })).toBe('Show Chill rides');
    expect(text('ui.details.sizeValue', { w: 3, d: 3 })).toBe('3 × 3 tiles');
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/ui/mood.test.ts tests/unit/ui/interfaceStrings.test.ts`
Expected: FAIL, cannot find the modules.

- [ ] **Step 3: Write the three files and register the strings in `en.ts`**

- [ ] **Step 4: Run the gates**

Run: `npm run typecheck && npm test`
Expected: typecheck prints nothing; all tests pass, including `tests/unit/i18n/locales.test.ts` and `tests/unit/architecture.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/data/tuning/interface.ts src/data/strings/interface.ts src/data/strings/en.ts src/ui/mood/model.ts tests/unit/ui/mood.test.ts tests/unit/ui/interfaceStrings.test.ts
git commit -m "feat(ui): interface constants, strings, and the mood model"
```

---

### Task 2: Tip model

**Files:**
- Create: `src/ui/tips/model.ts`
- Test: `tests/unit/ui/tips.test.ts`

**Interfaces:**
- Consumes: `Group`, `SharePercents` (Task 1); `TIP_MIN_GUESTS`, `TIP_GAP_POINTS`; `temperamentShares`, `sharePercents` (`src/ui/format.ts`); the ride catalog (`getFlatRideDef`, `getTrackRideDef`).
- Produces:
  - `type TipId = 'cashLow' | 'noRide' | 'underServed.chill' | 'underServed.family' | 'underServed.thrill'`
  - `interface TipInput { cash: number; tutorial: boolean; tipsOn: boolean; guestPercents: SharePercents; guestTotal: number; openRides: Record<Group, number> }`
  - `interface Tip { id: TipId; speaker: 'frost' | 'spark' | 'both'; mood: 'happy' | 'sad'; group: Group | null }`
  - `underServedGroup(i: TipInput): Group | null`. It ignores `tutorial` and `tipsOn` (the faces of §4.3 use it).
  - `matchingTips(i: TipInput): Tip[]`. Priority order of §4.8. Empty when `tutorial` is true or `tipsOn` is false.
  - `dropStale(closed: ReadonlySet<TipId>, matching: readonly Tip[]): Set<TipId>`. Keeps only the closed ids that still match.
  - `shownTip(matching: readonly Tip[], closed: ReadonlySet<TipId>): Tip | null`. The first tip that is not closed.
  - `tipInput(world: World, tipsOn: boolean): TipInput`. `tutorial` is `world.state.scenario.kind === 'tutorial'`. `openRides` counts rides with the status `open` by the `tag` of their catalog entry.
- Speaker and mood: `cashLow` both, sad. `noRide` both, happy. `underServed.chill` Frost, sad. `underServed.thrill` Spark, sad. `underServed.family` both, happy.
- Gap rule in whole numbers: group `g` matches when `guestPercents[g] * totalOpen − openRides[g] * 100 ≥ TIP_GAP_POINTS * totalOpen`. The largest left side wins. A tie goes to Chill, then Family, then Thrill.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/ui/tips.test.ts
import { describe, expect, it } from 'vitest';
import { makeTestWorld, placeRideDirect } from '../../helpers/world';
import { dropStale, matchingTips, shownTip, tipInput, underServedGroup, type TipId, type TipInput } from '../../../src/ui/tips/model';

const base: TipInput = {
  cash: 100_000, tutorial: false, tipsOn: true,
  guestPercents: { chill: 15, family: 55, thrill: 30 }, guestTotal: 20,
  openRides: { chill: 0, family: 2, thrill: 2 },
};
const ids = (i: TipInput): TipId[] => matchingTips(i).map((t) => t.id);
const none = { chill: 0, family: 0, thrill: 0 };

describe('tip rules (Phase 7 §4.8)', () => {
  it('order: cashLow, then noRide, then underServed', () => {
    expect(ids({ ...base, cash: -1, openRides: none })).toEqual(['cashLow', 'noRide']);
    expect(ids({ ...base, cash: -1 })).toEqual(['cashLow', 'underServed.chill']);
    expect(ids({ ...base, cash: 0 })).toEqual(['underServed.chill']);
  });
  it('rule 3 needs 20 guests', () => {
    expect(ids({ ...base, guestTotal: 19 })).toEqual([]);
    expect(ids({ ...base, guestTotal: 20 })).toEqual(['underServed.chill']);
  });
  it('a gap of 14 points gives no tip; 15 gives a tip', () => {
    expect(ids({ ...base, guestPercents: { chill: 14, family: 56, thrill: 30 } })).toEqual([]);
    expect(ids(base)).toEqual(['underServed.chill']);
  });
  it('a tie goes to Chill, then Family, then Thrill', () => {
    expect(underServedGroup({ ...base, guestPercents: { chill: 50, family: 0, thrill: 50 }, openRides: { chill: 0, family: 1, thrill: 0 } })).toBe('chill');
    expect(underServedGroup({ ...base, guestPercents: { chill: 0, family: 50, thrill: 50 }, openRides: { chill: 1, family: 0, thrill: 0 } })).toBe('family');
  });
  it('speakers and moods', () => {
    const thrill = matchingTips({ ...base, guestPercents: { chill: 10, family: 20, thrill: 70 }, openRides: { chill: 1, family: 1, thrill: 0 } })[0];
    expect(thrill).toEqual({ id: 'underServed.thrill', speaker: 'spark', mood: 'sad', group: 'thrill' });
    expect(matchingTips(base)[0]).toEqual({ id: 'underServed.chill', speaker: 'frost', mood: 'sad', group: 'chill' });
    expect(matchingTips({ ...base, openRides: none })[0]).toEqual({ id: 'noRide', speaker: 'both', mood: 'happy', group: null });
    expect(matchingTips({ ...base, cash: -1 })[0]).toEqual({ id: 'cashLow', speaker: 'both', mood: 'sad', group: null });
  });
  it('the Tutorial and the setting hide the tips, not the under-served group', () => {
    expect(ids({ ...base, tutorial: true })).toEqual([]);
    expect(ids({ ...base, tipsOn: false })).toEqual([]);
    expect(underServedGroup({ ...base, tutorial: true, tipsOn: false })).toBe('chill');
    expect(underServedGroup({ ...base, openRides: none })).toBeNull();
  });
  it('a closed tip returns only after its rule stops and starts again', () => {
    const noRide = matchingTips({ ...base, openRides: none });
    let closed = new Set<TipId>(['noRide']);
    expect(shownTip(noRide, closed)).toBeNull();
    closed = dropStale(closed, noRide);
    expect([...closed]).toEqual(['noRide']);
    closed = dropStale(closed, []);
    expect(closed.size).toBe(0);
    expect(shownTip(noRide, closed)?.id).toBe('noRide');
  });
  it('closing the first tip shows the next', () => {
    expect(shownTip(matchingTips({ ...base, cash: -1, openRides: none }), new Set<TipId>(['cashLow']))?.id).toBe('noRide');
  });
  it('tipInput reads the world', () => {
    const w = makeTestWorld();
    expect(tipInput(w, true)).toMatchObject({ cash: w.state.park.cash, tutorial: false, tipsOn: true, guestTotal: 0, openRides: none });
    const ride = placeRideDirect(w, 'carousel', 10, 10, 0);
    ride.status = 'open';
    expect(tipInput(w, true).openRides).toEqual({ chill: 0, family: 1, thrill: 0 });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/unit/ui/tips.test.ts`
Expected: FAIL, cannot find `src/ui/tips/model`.

- [ ] **Step 3: Implement `src/ui/tips/model.ts` with the signatures above**

- [ ] **Step 4: Run the gates**

Run: `npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/tips/model.ts tests/unit/ui/tips.test.ts
git commit -m "feat(ui): mascot tip rules"
```

---

### Task 3: Deck model and `ToolbarEntry.deck`

**Files:**
- Create: `src/ui/decks/model.ts`
- Modify: `src/ui/extensions.ts` (`ToolbarEntry` gets `deck: DeckId`), `src/ui/land/index.ts`, `src/ui/scenery/index.ts`, `src/ui/overlays/index.ts`, `src/ui/shows/index.ts`, `src/ui/view/index.ts` (each entry sets `deck`)
- Test: `tests/unit/ui/decks.test.ts`

**Interfaces:**
- Consumes: `FLAT_RIDES`, `STALLS`, `getTrackRideDef` (catalog); `isUnlocked` (`src/sim/research/api`); `pickableTrackTypes`, `minStationTiles`, `stationCost` (`src/ui/track/builder.ts`); `contentName`; `trackToolOf` (`src/render/track/toolState.ts`).
- Produces:
  - `type DeckId = 'rides' | 'stalls' | 'paths' | 'scenery' | 'manage'`; `DECK_ORDER: readonly DeckId[]` in that order.
  - `OLD_TOOL_IDS`: `inspect, footpath, queue, rides, stalls, pathItems, demolish, staff, research, marketing, finance, park, messages, temperament, menu, land, water, scenery, overlays, shows, buyLand`. `type OldToolId`.
  - `type ToolPlace = { place: 'inspectDefault' } | { place: 'deckButton'; deck: DeckId } | { place: 'toolCard'; deck: DeckId } | { place: 'demolishButton' } | { place: 'controls' } | { place: 'moodBar' }`
  - `TOOL_PLACE: Readonly<Record<OldToolId, ToolPlace>>`, the table of §4.4.
  - `TOOL_CARD_ORDER: Readonly<Record<DeckId, readonly string[]>>` = `{ rides: ['shows'], stalls: [], paths: ['footpath', 'queue', 'pathItems'], scenery: ['scenery', 'land', 'water', 'buyLand'], manage: ['staff', 'research', 'marketing', 'finance', 'park', 'overlays'] }`
  - `orderToolCards<T extends { id: string }>(deck: DeckId, cards: readonly T[]): T[]`. Ids not in the list go last, in input order.
  - `RIDE_ZONES = ['chill', 'family', 'thrill']`; `STALL_ZONES = ['food', 'drink', 'toilet', 'souvenir', 'info', 'facility']`.
  - `interface CardSpec { id: string; kind: 'flat' | 'track' | 'stall'; zone: string; cost: number; name: string }`
  - `sortCards(cards: readonly CardSpec[], zones: readonly string[]): CardSpec[]`: zone order, then cost, then name.
  - `zonesPresent(cards: readonly CardSpec[], zones: readonly string[]): string[]`
  - `rideCards(world: World): CardSpec[]`: unlocked flat rides and pickable track types, sorted. A track card costs `stationCost(type, minStationTiles(type, type.vehicle.defaultCars))`; its zone is the catalog tag, or `thrill` when the catalog has no entry.
  - `stallCards(world: World): CardSpec[]`
  - `handSignature(world: World): string`: the ids of `rideCards` and `stallCards`, joined.
  - `heldCardId(tool: ToolState): string | null`: `defId` for `placeRide` and `placeStall`; the track type id while the track tool is in phase `station`; else null.
- Extension decks: `land`, `water`, `scenery`, `buyLand` → `scenery`; `overlays` → `manage`; `shows` → `rides`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/ui/decks.test.ts
import { describe, expect, it } from 'vitest';
import { makeTestWorld } from '../../helpers/world';
import { toolbarEntries } from '../../../src/ui/extensions';
import { defaultToolState } from '../../../src/render/types';
import {
  DECK_ORDER, OLD_TOOL_IDS, RIDE_ZONES, STALL_ZONES, TOOL_PLACE, handSignature, heldCardId, orderToolCards, rideCards, sortCards,
  stallCards, zonesPresent, type CardSpec, type OldToolId,
} from '../../../src/ui/decks/model';

const card = (id: string, zone: string, cost: number, name = id): CardSpec => ({ id, kind: 'flat', zone, cost, name });

describe('deck model (Phase 7 §4.4, §4.5)', () => {
  it('the 21 old tools each have one place', () => {
    expect(OLD_TOOL_IDS).toHaveLength(21);
    expect(Object.keys(TOOL_PLACE).sort()).toEqual([...OLD_TOOL_IDS].sort());
    expect(TOOL_PLACE.inspect).toEqual({ place: 'inspectDefault' });
    expect(TOOL_PLACE.rides).toEqual({ place: 'deckButton', deck: 'rides' });
    expect(TOOL_PLACE.footpath).toEqual({ place: 'toolCard', deck: 'paths' });
    expect(TOOL_PLACE.demolish).toEqual({ place: 'demolishButton' });
    expect(TOOL_PLACE.temperament).toEqual({ place: 'moodBar' });
    expect(TOOL_PLACE.messages).toEqual({ place: 'controls' });
    expect(TOOL_PLACE.menu).toEqual({ place: 'controls' });
  });
  it('each extension toolbar entry names the deck of the table', () => {
    const entries = toolbarEntries();
    expect(entries.map((e) => e.id).sort()).toEqual(['buyLand', 'land', 'overlays', 'scenery', 'shows', 'water']);
    for (const e of entries) expect(TOOL_PLACE[e.id as OldToolId]).toEqual({ place: 'toolCard', deck: e.deck });
  });
  it('deck order and tool card order', () => {
    expect(DECK_ORDER).toEqual(['rides', 'stalls', 'paths', 'scenery', 'manage']);
    const ids = (deck: Parameters<typeof orderToolCards>[0], list: string[]) => orderToolCards(deck, list.map((id) => ({ id }))).map((c) => c.id);
    expect(ids('scenery', ['land', 'water', 'scenery', 'buyLand'])).toEqual(['scenery', 'land', 'water', 'buyLand']);
    expect(ids('manage', ['overlays', 'park', 'new', 'staff'])).toEqual(['staff', 'park', 'overlays', 'new']);
  });
  it('cards sort by zone, then cost, then name', () => {
    const sorted = sortCards([card('d', 'thrill', 100), card('c', 'chill', 300), card('b', 'chill', 200, 'Zed'), card('a', 'chill', 200, 'Alp'), card('e', 'family', 50)], RIDE_ZONES);
    expect(sorted.map((c) => c.id)).toEqual(['a', 'b', 'c', 'e', 'd']);
  });
  it('zones with no card are not listed', () => {
    expect(zonesPresent([card('x', 'thrill', 1), card('y', 'chill', 1)], RIDE_ZONES)).toEqual(['chill', 'thrill']);
    expect(zonesPresent([], STALL_ZONES)).toEqual([]);
  });
  it('the start catalog gives sorted ride and stall cards', () => {
    const w = makeTestWorld();
    const rides = rideCards(w);
    expect(rides).toEqual(sortCards(rides, RIDE_ZONES));
    expect(rides.find((c) => c.id === 'carousel')).toMatchObject({ kind: 'flat', zone: 'family', cost: 120_000 });
    expect(rides.some((c) => c.kind === 'track')).toBe(true);
    const stalls = stallCards(w);
    expect(stalls).toEqual(sortCards(stalls, STALL_ZONES));
    expect(stalls.every((c) => c.kind === 'stall')).toBe(true);
    expect(handSignature(w)).toBe([...rides, ...stalls].map((c) => c.id).join(','));
  });
  it('the held card comes from the tool state', () => {
    const t = defaultToolState();
    expect(heldCardId(t)).toBeNull();
    t.tool = 'placeRide';
    t.defId = 'carousel';
    expect(heldCardId(t)).toBe('carousel');
    t.tool = 'footpath';
    expect(heldCardId(t)).toBeNull();
  });
});
```

If `makeTestWorld()` starts with no pickable track type, replace the `kind === 'track'` line with an assertion against `pickableTrackTypes(w).length`.

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/unit/ui/decks.test.ts`
Expected: FAIL, cannot find `src/ui/decks/model`.

- [ ] **Step 3: Implement `model.ts`; add `deck` to `ToolbarEntry` and to the six entries**

`extensions.ts` imports `DeckId` with `import type`. `model.ts` does not import `extensions.ts`.

- [ ] **Step 4: Run the gates**

Run: `npm run typecheck && npm test`
Expected: all pass. The toolbar ignores `deck` until Task 9.

- [ ] **Step 5: Commit**

```bash
git add src/ui/decks/model.ts src/ui/extensions.ts src/ui/land/index.ts src/ui/scenery/index.ts src/ui/overlays/index.ts src/ui/shows/index.ts src/ui/view/index.ts tests/unit/ui/decks.test.ts
git commit -m "feat(ui): deck model; each extension tool names its deck"
```

---

### Task 4: Settings version 2 and the Mascot tips setting

**Files:**
- Modify: `src/settings/types.ts`, `src/settings/schema.ts`, `src/ui/settings/model.ts`, `src/data/strings/settings.ts`
- Test: `tests/unit/settings/data.test.ts`, `tests/unit/settings/behaviour.test.ts`, `tests/unit/settings/model.test.ts`

**Interfaces:**
- Produces: `SettingsValues.mascotTips: boolean` (in the Gameplay block); `SETTING_SPECS.mascotTips = { check: isBool, fallback: true }`; `SETTINGS_VERSION = 2`.
- `parseSettings(json)`:
  - Version 1: the document must hold exactly the 19 version 1 keys (a frozen list `V1_KEYS` in `schema.ts`, written out, not derived from `SETTING_KEYS`). `mascotTips` in a version 1 document is `unknown setting mascotTips`. The result adds `mascotTips: true`.
  - Version 2: every key of `SETTING_KEYS`, as today.
  - Version 3 or more: `newer version`, as today.
- `SettingsStore` does not change: it writes only when a setting changes, and `serializeSettings` writes version 2.
- Strings: `'settings.gameplay.mascotTips': 'Mascot tips'`, `'settings.gameplay.mascotTipsDetail': 'Frost and Spark give short tips'`.
- Settings screen: a toggle for `mascotTips` in the `gameplay` section, after `confirmDemolish`.

- [ ] **Step 1: Write the failing tests**

```ts
// add to tests/unit/settings/data.test.ts
const doc = (version: number, values: Record<string, unknown>): string => JSON.stringify({ format: SETTINGS_FORMAT, version, values });
const v1Values = (): Record<string, unknown> => {
  const { mascotTips: _drop, ...rest } = defaultSettings();
  return { ...rest, musicVolume: 30 };
};

describe('settings version 2 (Phase 7 §5)', () => {
  it('a version 1 document loads, gets mascotTips true, and keeps its values', () => {
    const r = parseSettings(doc(1, v1Values()));
    expect(r).toMatchObject({ ok: true, values: { mascotTips: true, musicVolume: 30 } });
  });
  it('a version 1 document with mascotTips is unreadable', () => {
    expect(parseSettings(doc(1, { ...v1Values(), mascotTips: false }))).toEqual({ ok: false, error: 'unknown setting mascotTips' });
  });
  it('a version 2 document needs a boolean mascotTips', () => {
    expect(parseSettings(doc(2, v1Values()))).toEqual({ ok: false, error: 'missing setting mascotTips' });
    expect(parseSettings(doc(2, { ...v1Values(), mascotTips: 'yes' }))).toEqual({ ok: false, error: 'bad value at mascotTips' });
    expect(parseSettings(doc(2, { ...v1Values(), mascotTips: false }))).toMatchObject({ ok: true, values: { mascotTips: false } });
  });
  it('a version 3 document is unreadable', () => {
    expect(parseSettings(doc(3, { ...v1Values(), mascotTips: true }))).toEqual({ ok: false, error: 'newer version' });
  });
  it('the build writes version 2', () => {
    expect(JSON.parse(serializeSettings(defaultSettings()))).toMatchObject({ version: 2, values: { mascotTips: true } });
  });
});
```

```ts
// add to tests/unit/settings/behaviour.test.ts (use the fake KeyValueStore of that file)
it('a stored version 1 document is not rewritten until a setting changes; then it is version 2', () => {
  const stored = doc(1, v1Values());
  const storage = fakeStorage({ [SETTINGS_KEY]: stored });
  const store = new SettingsStore(storage);
  expect(store.problem).toBeNull();
  expect(store.get('mascotTips')).toBe(true);
  expect(storage.getItem(SETTINGS_KEY)).toBe(stored);
  store.set('mascotTips', false);
  expect(JSON.parse(storage.getItem(SETTINGS_KEY) as string)).toMatchObject({ version: 2, values: { mascotTips: false, musicVolume: 30 } });
});
```

```ts
// add to tests/unit/settings/model.test.ts: the gameplay section lists mascotTips after confirmDemolish
```

Use the helper names that the files already have (for example the fake storage). Add `doc` and `v1Values` where a file lacks them.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/settings`
Expected: FAIL (`mascotTips` does not exist; version is 1).

- [ ] **Step 3: Implement the changes**

- [ ] **Step 4: Run the gates**

Run: `npm run typecheck && npm test && npm run e2e -- tests/e2e/settings.spec.ts`
Expected: all pass. Fix any existing test that wrote a literal version 1 document so that it states which version it tests.

- [ ] **Step 5: Commit**

```bash
git add src/settings src/ui/settings/model.ts src/data/strings/settings.ts tests/unit/settings
git commit -m "feat(settings): version 2 with a migration; Mascot tips setting"
```

---

### Task 5: Look — tokens and font

**Files:**
- Create: `src/styles/tokens.css`, `src/assets/fonts/fredoka/fredoka-latin-wght-normal.woff2`, `src/assets/fonts/fredoka/fredoka-latin-ext-wght-normal.woff2`, `src/assets/fonts/fredoka/LICENSE`
- Modify: `src/styles/main.css` (first line `@import './tokens.css';`; every colour becomes `var(--…)`), the style modules `src/ui/scenery/style.ts`, `src/ui/shows/style.ts`, `src/ui/scenario/styles.ts`, `src/ui/overlays/index.ts`, `src/ui/land/index.ts`, `src/ui/perf/index.ts`, `src/ui/offline/index.ts`, `src/data/strings/settings.ts` (`settings.display.highContrastDetail` → `'Thicker outlines and stronger text'`), `tests/e2e/helpers.ts` (`newPark` waits for `document.fonts.ready`)
- Test: `tests/unit/ui/theme.test.ts`, `tests/e2e/interface.spec.ts`

**Interfaces:**
- Produces, `tokens.css` `:root`: `--ink: #1f2340`, `--surface: #ffffff`, `--surface-2: #eef0f7`, `--muted-ink: #4d5170`, `--gold: #ffc12e`, `--accent-chill: #56b4e9`, `--accent-family: #2fb38a`, `--accent-thrill: #e69f00`, `--danger-text: #b34700`, `--outline: 3px solid var(--ink)`, `--shadow: 0 4px 0 var(--ink)`, `--radius: 12px`, `--radius-surface: 18px`, and one token for each other colour that the UI needs (weather icons, ok, warn, overlays). Every text token has a contrast of 4.5:1 or more on the surface that it is used on.
- `.tc-hc` in `tokens.css`: `--outline: 4px solid var(--ink)`, `--surface-2: #ffffff`, `--muted-ink: var(--ink)`.
- Old token names (`--panel`, `--panel-2`, `--panel-3`, `--line`, `--panel-text`, `--muted`, `--bg`) are removed; rules use the new names.
- Focus ring for all controls: `box-shadow: 0 0 0 2px #fff, 0 0 0 5px var(--ink)` through one token `--focus-ring`.
- `@font-face` `Fredoka`, `font-weight: 300 700`, `font-display: swap`, two sources with the `unicode-range` values of `wght.css` in the font package. `:root` font family: `'Fredoka', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`.
- Font source: `npm pack @fontsource-variable/fredoka@5.3.0` in a temporary folder outside the repository; copy `package/files/fredoka-latin-wght-normal.woff2` (29,732 bytes), `package/files/fredoka-latin-ext-wght-normal.woff2` (4,576 bytes), and `package/LICENSE` (SIL OFL 1.1). `package.json` does not change.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/ui/theme.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const read = (p: string): string => readFileSync(resolve(root, p), 'utf8');
const STYLE_MODULES = ['src/ui/scenery/style.ts', 'src/ui/shows/style.ts', 'src/ui/scenario/styles.ts', 'src/ui/overlays/index.ts', 'src/ui/land/index.ts', 'src/ui/perf/index.ts', 'src/ui/offline/index.ts'];
const OLD_DARK = ['#12202e', '#1f3347', '#29425a', '#345270', '#3e5d7b', '#0e1925', '#0d1b28'];

describe('look (Phase 7 §4.9)', () => {
  it('main.css has no colour literal', () => {
    const css = read('src/styles/main.css');
    expect(css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? []).toEqual([]);
    expect(css).toContain("@import './tokens.css';");
  });
  it('no file keeps a colour or a token name of the old dark look', () => {
    for (const f of ['src/styles/main.css', 'src/styles/tokens.css', ...STYLE_MODULES]) {
      const s = read(f).toLowerCase();
      for (const c of OLD_DARK) expect(s.includes(c), `${f} has ${c}`).toBe(false);
      expect(/var\(--(panel|panel-2|panel-3|line|panel-text|muted|bg)\)/.test(s), `${f} uses an old token`).toBe(false);
    }
  });
  it('tokens.css has the spec values', () => {
    const t = read('src/styles/tokens.css');
    for (const line of ['--ink: #1f2340;', '--surface: #ffffff;', '--surface-2: #eef0f7;', '--muted-ink: #4d5170;', '--gold: #ffc12e;', '--accent-chill: #56b4e9;', '--accent-family: #2fb38a;', '--accent-thrill: #e69f00;', '--danger-text: #b34700;']) {
      expect(t.includes(line), line).toBe(true);
    }
  });
  it('the font files and the licence are in the repository', () => {
    expect(statSync(resolve(root, 'src/assets/fonts/fredoka/fredoka-latin-wght-normal.woff2')).size).toBe(29732);
    expect(statSync(resolve(root, 'src/assets/fonts/fredoka/fredoka-latin-ext-wght-normal.woff2')).size).toBe(4576);
    expect(read('src/assets/fonts/fredoka/LICENSE')).toContain('SIL Open Font License, Version 1.1');
  });
});
```

```ts
// tests/e2e/interface.spec.ts
import { expect, test } from '@playwright/test';
import { newPark } from './helpers';

test('the game loads the bundled font and asks no other host for anything', async ({ page, baseURL }) => {
  const foreign: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith('http') && u.origin !== new URL(baseURL as string).origin) foreign.push(r.url());
  });
  await newPark(page);
  const loaded = await page.evaluate(() => [...document.fonts].some((f) => f.family.replace(/["']/g, '') === 'Fredoka' && f.status === 'loaded'));
  expect(loaded).toBe(true);
  expect(foreign).toEqual([]);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/ui/theme.test.ts`
Expected: FAIL (62 hex literals and 15 `rgb` literals in `main.css` outside the token block today).

- [ ] **Step 3: Add the font files, write `tokens.css`, and move every colour to a token**

Work file by file. After each file, open the game (`npm run dev`) and look at the screens that the file styles.

- [ ] **Step 4: Run the gates**

Run: `npm run typecheck && npm test && npm run build && npm run e2e`
Expected: all pass. `tests/e2e/a11y.spec.ts` (axe: title, HUD, toolbar, panels, Build 2 bars, high contrast) reports no serious or critical issue. `dist/sw-manifest.json` lists both `.woff2` files under `assets`.

- [ ] **Step 5: Commit**

```bash
git add src/styles src/assets/fonts src/ui src/data/strings/settings.ts tests/unit/ui/theme.test.ts tests/e2e/interface.spec.ts tests/e2e/helpers.ts
git commit -m "feat(ui): light look through tokens; bundled Fredoka font"
```

---

### Task 6: One e2e way to reach a tool or a card (refactor)

No game code changes. The helpers work on the toolbar and the pickers of today. Tasks 9 and 10 change only the helper bodies.

**Files:**
- Modify: `tests/e2e/helpers.ts`, every `tests/e2e/*.spec.ts` that uses a toolbar button, a picker tab, or a picker card
- Test: the existing e2e suite

**Interfaces:**
- Produces, `tests/e2e/helpers.ts`:
  - `openTool(page: Page, id: string): Promise<void>`: press the control of an old toolbar id (`'footpath'`, `'scenery'`, `'staff'`, `'menu'`, …).
  - `toolControl(page: Page, id: string): Promise<Locator>`: that control, made visible first, for checks such as `aria-pressed` and `data-tutorial-target`.
  - `pickCard(page: Page, kind: 'flat' | 'track' | 'stall', defId: string): Promise<void>`: hold the card.
  - `cardOf(page: Page, kind: 'flat' | 'track' | 'stall', defId: string): Promise<Locator>`: the card, made visible first.
- The helper `tool(page, name)` is removed. `setSpeed` stays.

- [ ] **Step 1: Add the four helpers on top of the toolbar and the pickers**

- [ ] **Step 2: Change every spec to the helpers**

- [ ] **Step 3: Check that no spec reaches the old controls directly**

Run: `grep -rnE "tool-[a-zA-Z]+|getByRole\('toolbar'|picker-tab-|track-card-|\[data-def=|\[data-tool=" tests/e2e --include=*.spec.ts | grep -v "tool-status"`
Expected: no output.

- [ ] **Step 4: Run the gates**

Run: `npm run typecheck && npm run e2e`
Expected: the same passed, skipped, and failed counts as the baseline, plus the one test of Task 5.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e
git commit -m "test(e2e): reach tools and cards through helpers"
```

---

### Task 7: Top region — status pill, controls, day pill

**Files:**
- Modify: `src/ui/hud.ts` (rewrite), `src/ui/layout.ts` (`pillFields`), `src/ui/toolbar.ts` (remove the Messages and Menu buttons and the badge), `src/ui/index.ts` (`createHud(ctx, () => openMenu(ctx))`), `src/styles/main.css`, `tests/e2e/helpers.ts` (`setSpeed` opens the Speed menu on the phone; `openTool` for `messages` and `menu`)
- Test: `tests/unit/ui/layout.test.ts`, `tests/e2e/ui-hud.spec.ts`

**Interfaces:**
- Produces: `createHud(ctx: UiContext, openMenu: () => void): { el: HTMLElement; moodSlot: HTMLElement; update(now: number): void }`. `el` stays `header.hud` with `role="region"` and the name "Park status". In this task `moodSlot` holds the old balance bar.
- Negative cash keeps the class `neg`; its colour is `--danger-text`.
- Produces: `pillFields(layout: ToolbarPlacement, textScale: TextScale): Array<'name' | 'cash' | 'guests' | 'rating'>` in `src/ui/layout.ts`.
- DOM contract:
  - `button[data-testid="status-pill"]` opens the Park panel and contains `hud-name`, `hud-cash`, `hud-guests`, `hud-rating`. A hidden field is `hidden`, not removed.
  - `div[data-testid="day-pill"]` contains the weather badge, `hud-date`, then each `UiExtension.hud` part.
  - The group named "Game speed" with the 4 buttons of today. On the phone it is hidden until `button[data-testid="speed-toggle"]` (`aria-label` "Speed", `aria-expanded`, `aria-controls`) opens it; the toggle shows the current speed; a choice or `Esc` closes it.
  - `button[data-tool="messages"][data-testid="tool-messages"]` with `messages-badge` and the unread `aria-label` of today.
  - `button[data-tool="menu"][data-testid="tool-menu"][aria-haspopup="dialog"]`.
- `--hud-bottom` is the bottom edge of the whole top region (status pill, mood slot, controls, day pill).

- [ ] **Step 1: Write the failing tests**

```ts
// add to tests/unit/ui/layout.test.ts
it('status pill fields by layout and text scale (Phase 7 §4.2)', () => {
  expect(pillFields('side', 100)).toEqual(['name', 'cash', 'guests', 'rating']);
  expect(pillFields('side', 175)).toEqual(['name', 'cash', 'guests', 'rating']);
  expect(pillFields('bottom', 100)).toEqual(['cash', 'guests', 'rating']);
  expect(pillFields('bottom', 125)).toEqual(['cash', 'guests', 'rating']);
  expect(pillFields('bottom', 150)).toEqual(['cash']);
  expect(pillFields('bottom', 175)).toEqual(['cash']);
});
```

```ts
// tests/e2e/ui-hud.spec.ts: add these tests; keep the date, cash, and speed tests; the toolbar test loses Menu
test('the status pill shows cash, guests, and rating, and opens the Park panel', async ({ page }, info) => {
  if (info.project.name === 'phone') await page.setViewportSize({ width: 390, height: 844 });
  for (const id of ['hud-cash', 'hud-guests', 'hud-rating']) await expect(page.getByTestId(id)).toBeVisible();
  await page.getByTestId('status-pill').click();
  await expect(page.locator('.panel-title')).toHaveText('Test Park');
});

test('the phone has one Speed button that opens the speed group', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone');
  const group = page.getByRole('group', { name: 'Game speed' });
  await expect(group).toBeHidden();
  await page.getByTestId('speed-toggle').click();
  await group.getByRole('button', { name: 'Speed 2×' }).click();
  await expect(group).toBeHidden();
  await expect(page.getByTestId('speed-toggle')).toHaveText('2×');
});

test('a resize across 900 px keeps exactly one visible speed control', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  const group = page.getByRole('group', { name: 'Game speed' });
  await page.setViewportSize({ width: 800, height: 800 });
  await page.getByTestId('speed-toggle').click();
  await expect(group).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(group).toBeVisible();
  await expect(page.getByTestId('speed-toggle')).toBeHidden();
  await page.setViewportSize({ width: 800, height: 800 });
  await expect(page.getByTestId('speed-toggle')).toBeVisible();
  await expect(group).toBeHidden();
});

test('a long park name and a ten-digit cash value keep the controls on the screen', async ({ page }) => {
  await page.evaluate(() => {
    const park = (window as unknown as { __tc: { world: { state: { park: { name: string; cash: number } } } } }).__tc.world.state.park;
    park.name = 'W'.repeat(32);
    park.cash = 999_999_999_900;
  });
  const vp = page.viewportSize();
  if (!vp) throw new Error('no viewport');
  for (const id of ['status-pill', 'tool-messages', 'tool-menu']) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, id).not.toBeNull();
    expect(box!.x, id).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, id).toBeLessThanOrEqual(vp.width);
  }
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/ui/layout.test.ts && npm run e2e -- tests/e2e/ui-hud.spec.ts`
Expected: FAIL (`pillFields` and `status-pill` do not exist).

- [ ] **Step 3: Rewrite `hud.ts`; remove Messages and Menu from the toolbar; write the CSS for both layouts**

- [ ] **Step 4: Run the gates**

Run: `npm run typecheck && npm test && npm run e2e -- tests/e2e/ui-hud.spec.ts tests/e2e/a11y.spec.ts tests/e2e/management.spec.ts tests/e2e/settings.spec.ts tests/e2e/i18n.spec.ts tests/e2e/scenario.spec.ts tests/e2e/view.spec.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/hud.ts src/ui/layout.ts src/ui/toolbar.ts src/ui/index.ts src/styles tests
git commit -m "feat(ui): status pill, controls, and day pill replace the HUD bar"
```

---

### Task 8: Mood bar

**Files:**
- Create: `src/ui/mood/moodBar.ts`
- Modify: `src/ui/mood/model.ts` (`faceMoods`), `src/ui/hud.ts` (mount the mood bar in `moodSlot`; remove the old balance bar), `src/ui/toolbar.ts` (remove the Temperament button), `src/styles/main.css`, `tests/e2e/helpers.ts` (`openTool('temperament')` presses the mood bar)
- Test: `tests/unit/ui/mood.test.ts`, `tests/e2e/interface.spec.ts`

**Interfaces:**
- Consumes: `lean`, `knotPercent`, `leanTextId` (Task 1); `underServedGroup`, `tipInput` (Task 2); `mascotCanvas` (`src/ui/scenario/mascotArt.ts`); `MOOD_UPDATE_MS`.
- Produces: `faceMoods(group: Group | null): { frost: 'happy' | 'sad'; spark: 'happy' | 'sad' }` in `src/ui/mood/model.ts`.
- Produces: `createMoodBar(ctx: UiContext): UiPart`.
- DOM contract: one `button[data-testid="hud-balance"][data-tool="temperament"][aria-pressed]`. Its `aria-label` is the text of `ui.hud.balance` or `ui.hud.balanceEmpty`, a comma, then the lean text. Inside: the Frost portrait, the segments `.seg-chill`, `.seg-family`, `.seg-thrill` (each shows `{n}%` when it is 44 px wide or more), the knot `.mood-knot` with `left: {knotPercent}%`, the Spark portrait, and `[data-testid="mood-text"]` (desktop only). The portraits are `aria-hidden`. A portrait is drawn again only when its mood changes.

- [ ] **Step 1: Write the failing tests**

```ts
// add to tests/unit/ui/mood.test.ts
it('Frost is sad for Chill, Spark for Thrill; both are happy for Family and for no group', () => {
  expect(faceMoods('chill')).toEqual({ frost: 'sad', spark: 'happy' });
  expect(faceMoods('thrill')).toEqual({ frost: 'happy', spark: 'sad' });
  expect(faceMoods('family')).toEqual({ frost: 'happy', spark: 'happy' });
  expect(faceMoods(null)).toEqual({ frost: 'happy', spark: 'happy' });
});
```

```ts
// add to tests/e2e/interface.spec.ts
test('the mood bar names the balance and toggles the Temperament overlay', async ({ page }, info) => {
  await newPark(page);
  const bar = page.getByTestId('hud-balance');
  await expect(bar).toHaveAttribute('aria-label', 'Thrill/Chill balance: no guests yet, No guests yet');
  if (info.project.name === 'desktop') await expect(page.getByTestId('mood-text')).toHaveText('No guests yet');
  const overlay = () => page.evaluate(() => (window as unknown as { __tc: { tool: { overlay: string } } }).__tc.tool.overlay);
  await bar.click();
  await expect(bar).toHaveAttribute('aria-pressed', 'true');
  expect(await overlay()).toBe('temperament');
  await bar.click();
  await expect(bar).toHaveAttribute('aria-pressed', 'false');
  expect(await overlay()).toBe('none');
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/ui/mood.test.ts && npm run e2e -- tests/e2e/interface.spec.ts`
Expected: FAIL (`faceMoods` does not exist; the balance bar is not a button).

- [ ] **Step 3: Implement `faceMoods` and `moodBar.ts`; mount it; remove the old bar and the Temperament button**

Reduced motion (`.tc-rm`): the knot has no transition.

- [ ] **Step 4: Run the gates**

Run: `npm run typecheck && npm test && npm run e2e -- tests/e2e/interface.spec.ts tests/e2e/ui-hud.spec.ts tests/e2e/a11y.spec.ts tests/e2e/fields.spec.ts tests/e2e/tutorial.spec.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/mood src/ui/hud.ts src/ui/toolbar.ts src/styles tests
git commit -m "feat(ui): mood bar with Frost and Spark"
```

---

### Task 9: Decks with tool cards; remove the toolbar; tutorial targets

After this task the toolbar is gone. The Rides and Stalls decks each hold one temporary tool card (`rides`, `stalls`) that opens the picker panel of today. Task 10 replaces those two cards.

**Files:**
- Create: `src/ui/decks/toolCards.ts`, `src/ui/decks/card.ts`, `src/ui/decks/hand.ts`, `src/ui/decks/deckList.ts`, `src/ui/decks/index.ts`
- Modify: `src/ui/index.ts` (mount the decks; measure `--toolbar-space` from the bottom region in both layouts; the blur rule covers `.deck-list` and `.hand`), `src/ui/context.ts` (`openDeck`, `controlFor`), `src/ui/scenario/tutorialUi.ts`, `src/data/strings/progression.ts`, `src/styles/main.css`, `tests/e2e/helpers.ts`, `tests/e2e/ui-hud.spec.ts`, `tests/e2e/tutorial.spec.ts`
- Delete: `src/ui/toolbar.ts`
- Test: `tests/e2e/decks.spec.ts`

**Interfaces:**
- Consumes: `DeckId`, `DECK_ORDER`, `TOOL_PLACE`, `orderToolCards` (Task 3); `toolbarEntries` with `deck`; `createHud` (Task 7).
- Produces, `toolCards.ts`: `interface ToolCardDef { id: string; deck: DeckId; label: string; icon(): Element; onClick(ctx: UiContext): void; pressed(ctx: UiContext): boolean }`; `allToolCards(ctx: UiContext): ToolCardDef[]`: the base cards `footpath`, `queue`, `pathItems`, `staff`, `research`, `marketing`, `finance`, `park` (the `onClick` and `pressed` bodies move from `toolbar.ts` unchanged), the temporary `rides` and `stalls` cards, and every extension entry.
- Produces, `decks/index.ts`: `interface DecksUi extends UiPart { list: HTMLElement; hand: HTMLElement; open(deck: DeckId, zone?: string): void; close(): void; current(): DeckId | null; controlFor(toolId: string): HTMLElement | null }`; `createDecks(ctx: UiContext): DecksUi`.
- Produces, `UiContext`: `openDeck(deck: DeckId, zone?: string): void`; `controlFor(toolId: string): HTMLElement | null`. `controlFor` gives the card when its deck is open, else its deck button; the Demolish button, the mood bar, Messages, and Menu for their ids; null for `inspect`.
- DOM contract:
  - `nav.deck-list[role="toolbar"]` named "Card decks". Deck buttons `button[data-deck="<id>"][data-testid="deck-<id>"][aria-pressed][aria-controls]`. Then a divider and `button[data-tool="demolish"][data-testid="tool-demolish"][aria-pressed]`.
  - `div.hand[role="group"][data-testid="hand"][data-deck]` named "{deck} cards"; `hidden` when closed. Arrow buttons `hand-prev` and `hand-next` (desktop, only when the cards do not fit).
  - Tool card: `div.card-wrap` with `button.card.tool-card[data-tool="<id>"][data-testid="tool-<id>"][aria-pressed]` and, while held, a sibling `button[data-testid="card-put-back"]` named "Put back".
- Mount order in `src/ui/index.ts` is the tab order of §4.10: top region (status pill, mood bar, controls, day pill), deck list, hand, tool status, bars, panel.
- The hand scrolls sideways with the wheel, a drag on the strip, and touch.
- Behaviour: the Rides deck is open when a park starts (`onWorldChanged` too). A press on the open deck closes the hand. A press on a held card or on Put back selects Inspect (`tool = 'inspect'`, `defId`, `ghost`, `drag` null) and closes a panel that the card opened. `ArrowLeft`, `ArrowRight`, `Home`, and `End` move the focus in the hand.
- Tutorial: `TARGETS` holds tool ids (`footpath`, `rides`, `queue`, `stalls`, `park`, `staff`, `finance`) and `guests100` keeps `[data-testid="hud-guests"]`. `openRide` and `inspectGuest` have no target. The target is resolved with `ctx.controlFor` on every update, so the ring moves from the deck button to the card when the deck opens.
- Hint texts (`progression.ts`):
  - `footpath`: `'{act} Paths, then Footpath. Drag from the path at the entrance. Build 6 tiles or more'`
  - `openRide`: `'{act} the Carousel on the map, then Open ride'`
  - `openPark`: `'{act} Manage, then Park, then Open park'`
  - `inspectGuest`: `'{act} a guest on the map. Thrill guests love speed; Chill guests love calm rides'`
  - `groundskeeper`: `'{act} Manage, then Staff. Hire a Groundskeeper to keep the paths clean'`
  - `financePanel`: `'{act} Manage, then Finance, to see where your money goes'`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/e2e/decks.spec.ts
import { expect, test, type Page } from '@playwright/test';
import { newPark, openTool, toolControl } from './helpers';

const tc = <T>(page: Page, f: string): Promise<T> => page.evaluate(`(() => { const g = window.__tc; return ${f}; })()`) as Promise<T>;
const toolNow = (page: Page): Promise<string> => tc<string>(page, 'g.tool.tool');

test.beforeEach(async ({ page }) => newPark(page, 'Deck Park'));

test('the Rides deck is open at the start; a press on the open deck closes the hand', async ({ page }) => {
  const hand = page.getByTestId('hand');
  await expect(hand).toBeVisible();
  await expect(hand).toHaveAttribute('data-deck', 'rides');
  await expect(page.getByTestId('deck-rides')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('deck-rides').click();
  await expect(hand).toBeHidden();
  await page.getByTestId('deck-paths').click();
  await expect(hand).toHaveAttribute('data-deck', 'paths');
  await expect(page.getByRole('group', { name: 'Paths cards' })).toBeVisible();
});

const TOOL_STATES: Array<[string, string]> = [['footpath', 'footpath'], ['queue', 'queue'], ['pathItems', 'pathItem'], ['scenery', 'scenery'], ['land', 'land'], ['water', 'water'], ['buyLand', 'buyLand'], ['demolish', 'demolish']];
for (const [id, state] of TOOL_STATES) {
  test(`${id} selects its tool from its new place`, async ({ page }) => {
    await openTool(page, id);
    expect(await toolNow(page)).toBe(state);
    await expect(await toolControl(page, id)).toHaveAttribute('aria-pressed', 'true');
  });
}

const PANELS: Array<[string, RegExp]> = [['staff', /Staff/], ['research', /Research/], ['marketing', /Marketing/], ['finance', /Finance/], ['park', /Deck Park/], ['messages', /Messages/], ['rides', /Rides/], ['stalls', /Stalls/]];
for (const [id, title] of PANELS) {
  test(`${id} opens its panel from its new place`, async ({ page }) => {
    await openTool(page, id);
    await expect(page.locator('.panel-title')).toHaveText(title);
  });
}

test('overlays, shows, temperament, and menu work from their new places', async ({ page }) => {
  await openTool(page, 'overlays');
  await expect(await toolControl(page, 'overlays')).toHaveAttribute('aria-pressed', 'true');
  await openTool(page, 'overlays');
  await openTool(page, 'shows');
  await expect(await toolControl(page, 'shows')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await openTool(page, 'temperament');
  expect(await tc<string>(page, 'g.tool.overlay')).toBe('temperament');
  await openTool(page, 'menu');
  await expect(page.getByTestId('menu-resume')).toBeVisible();
});

test('Put back, Esc, and Cancel select Inspect', async ({ page }) => {
  await openTool(page, 'footpath');
  await page.getByTestId('card-put-back').click();
  expect(await toolNow(page)).toBe('inspect');
  await openTool(page, 'footpath');
  await page.keyboard.press('Escape');
  expect(await toolNow(page)).toBe('inspect');
  await openTool(page, 'footpath');
  await page.getByRole('region', { name: 'Tool options' }).getByRole('button', { name: 'Cancel' }).click();
  expect(await toolNow(page)).toBe('inspect');
  await expect(page.getByTestId('card-put-back')).toHaveCount(0);
});

test('no toolbar named Tools is on the screen', async ({ page }) => {
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toHaveCount(0);
  await expect(page.getByRole('toolbar', { name: 'Card decks' })).toBeVisible();
});
```

```ts
// tests/e2e/tutorial.spec.ts: the footpath step
// before the deck opens: the ring is on the Paths deck button
await expect(page.getByTestId('deck-paths')).toHaveAttribute('data-tutorial-target', 'footpath');
await expect(page.locator('.tc-ring')).toBeVisible();
// after the deck opens: the ring is on the Footpath card
await page.getByTestId('deck-paths').click();
await expect(page.getByTestId('tool-footpath')).toHaveAttribute('data-tutorial-target', 'footpath');
```

`tests/e2e/ui-hud.spec.ts`: replace the toolbar test with a deck list test: the 5 deck buttons and Demolish are at least 44 × 44 px; the list is at the top left on desktop and directly above the hand on the phone.

- [ ] **Step 2: Run them and see them fail**

Run: `npm run e2e -- tests/e2e/decks.spec.ts`
Expected: FAIL (`hand` and `deck-rides` do not exist).

- [ ] **Step 3: Implement the decks, mount them, delete `toolbar.ts`, and update the tutorial and the helpers**

`openTool(page, id)` in the helpers now reads the place of the id: open the deck when the card is not visible, then press the card; press the deck-list, mood-bar, or controls element for the other ids.

- [ ] **Step 4: Run the gates**

Run: `npm run typecheck && npm test && npm run build && npm run e2e`
Expected: all pass. `grep -rn "toolbar" src/ui --include=*.ts | grep -v "role\|toolbarEntries\|ToolbarEntry\|toolbarPlacement\|ToolbarPlacement"` shows no use of the removed module.

- [ ] **Step 5: Commit**

```bash
git add -A src/ui src/data/strings/progression.ts src/styles tests
git commit -m "feat(ui): card decks and tool cards replace the toolbar"
```

---

### Task 10: Content cards in the hand; remove the pickers

**Files:**
- Modify: `src/ui/decks/card.ts` (content card, preview cache), `src/ui/decks/hand.ts` (zones, refresh, empty text), `src/ui/decks/toolCards.ts` (remove the temporary `rides` and `stalls` cards), `src/ui/decks/index.ts`, `src/ui/context.ts` (`PanelKind` loses `ridePicker` and `stallPicker`), `src/ui/index.ts` (the `default` branch of `openPanel`), `src/ui/track/index.ts`, `src/styles/main.css`, `tests/e2e/helpers.ts`, `tests/e2e/decks.spec.ts`
- Delete: `src/ui/panels/picker.ts`, `src/ui/track/picker.ts`
- Test: `tests/e2e/decks.spec.ts`

**Interfaces:**
- Consumes: `rideCards`, `stallCards`, `handSignature`, `heldCardId`, `zonesPresent`, `RIDE_ZONES`, `STALL_ZONES`, `CardSpec` (Task 3); `drawPreview` (`src/render/renderer.ts`), `drawTrackPreview` (`src/render/track`); `startStation` (`src/ui/track/builder.ts`); `HAND_REFRESH_MS`, `CARD_LIFT_PX`.
- Produces, `card.ts`: `contentCard(ctx: UiContext, spec: CardSpec): HTMLElement` (the `div.card-wrap`); `previewCanvas(spec: CardSpec): HTMLCanvasElement` (drawn one time per id and device pixel ratio).
- Produces, `decks/index.ts`: `holdCard(ctx: UiContext, spec: CardSpec): void`. Flat ride: `tool = 'placeRide'`, `defId`, `ghost` and `drag` null, `rotation = 0`. Stall: `tool = 'placeStall'`, `rotation = 2`. Track: `startStation(ctx.game, spec.id)`. These are the values of the pickers today.
- DOM contract:
  - Content card: `button.card.content-card[data-def="<id>"][data-kind="flat|track|stall"][data-testid="card-<id>"][aria-pressed]`. Its text, in order: zone name, name, then cost (`formatMoney`) or "From {cost}" and "Track". The accessible name is this visible text.
  - Zone strip: `.hand-zone[data-zone="<zone>"]` with the zone name as text (`ui.tag.*` or `ui.kind.*`), only for zones from `zonesPresent`. The strip has `pointer-events: none`.
  - Card size: 128 × 172 CSS px on desktop and 104 × 140 on the phone, multiplied by `min(var(--ts, 1), 1.5)`.
  - The held card rises `CARD_LIFT_PX` in 120 ms. With reduced motion (`.tc-rm`) it has no transition.
  - A deck with no card shows `p.muted` with `ui.picker.empty`.
  - The Rides deck button has `data-tool="rides"` and `data-testid="deck-rides"`; the Stalls deck button the same for `stalls`. The Shows tool card is the last card of the Rides deck.
- Refresh: every `HAND_REFRESH_MS` the hand compares `handSignature(world)` with the last value and builds the cards again only on a change. `onWorldChanged` builds them again at once and scrolls the hand to its start.

- [ ] **Step 1: Write the failing tests**

```ts
// add to tests/e2e/decks.spec.ts; remove 'rides' and 'stalls' from PANELS
import { centerOn, pickCard, cardOf, setSpeed, tilePoint } from './helpers';

test('hold the Carousel card and place it: one ride, cash falls by $1,200', async ({ page }, info) => {
  await setSpeed(page, 'Pause');
  const cash0 = await tc<number>(page, 'g.world.state.park.cash');
  await pickCard(page, 'flat', 'carousel');
  await expect(await cardOf(page, 'flat', 'carousel')).toHaveAttribute('aria-pressed', 'true');
  expect(await toolNow(page)).toBe('placeRide');
  await centerOn(page, 31, 56);
  const pt = await tilePoint(page, 31, 56);
  if (info.project.name === 'phone') {
    await page.touchscreen.tap(pt.x, pt.y);
    await page.getByRole('region', { name: 'Tool options' }).getByRole('button', { name: 'Confirm' }).click();
  } else {
    await page.mouse.click(pt.x, pt.y);
  }
  expect(await tc<number>(page, 'g.world.state.rides.length')).toBe(1);
  expect(cash0 - (await tc<number>(page, 'g.world.state.park.cash'))).toBe(120_000);
});

test('a track ride card starts the station builder', async ({ page }) => {
  const id = await tc<string>(page, `document.querySelector('[data-kind="track"]').dataset.def`);
  await pickCard(page, 'track', id);
  expect(await toolNow(page)).toBe('track');
});

test('ride cards are in zone order; each card names its zone and its cost', async ({ page }) => {
  const zones = await page.locator('[data-testid="hand"] .hand-zone').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.zone));
  expect(zones).toEqual(['chill', 'family', 'thrill'].filter((z) => zones.includes(z)));
  await expect(await cardOf(page, 'flat', 'carousel')).toHaveAccessibleName(/Family.*Carousel.*\$1,200/);
  await expect(page.locator('[data-testid="hand"] [data-tool="shows"]')).toHaveCount(1);
});

test('a research unlock adds its card with no reload', async ({ page }) => {
  // Unlock one locked flat ride through the research state that `isUnlocked` reads (src/sim/research/api.ts).
  const id = await unlockOneFlatRide(page);
  await expect(page.getByTestId(`card-${id}`)).toHaveCount(1, { timeout: 1500 });
});

test('loading a save rebuilds the hand and holds no card', async ({ page }) => {
  await openTool(page, 'menu');
  await page.getByTestId('menu-save').click();
  await page.getByTestId('slot-1').click();
  await pickCard(page, 'flat', 'carousel');
  await openTool(page, 'menu');
  await page.getByTestId('menu-load').click();
  await page.getByTestId('slot-1').click();
  expect(await toolNow(page)).toBe('inspect');
  await expect(page.getByTestId('hand')).toHaveAttribute('data-deck', 'rides');
  await expect(page.getByTestId('card-carousel')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('card-put-back')).toHaveCount(0);
});

test('a deck with no card shows the empty text', async ({ page }) => {
  // Lock every stall through the same research state, then open the Stalls deck.
  await lockAllStalls(page);
  await page.getByTestId('deck-stalls').click();
  await expect(page.getByTestId('hand')).toContainText('Nothing is available yet');
});
```

Write `unlockOneFlatRide` and `lockAllStalls` in the spec file with `page.evaluate` on `window.__tc`. They change only the unlocked set that `isUnlocked` reads. Tile (31, 56) is the free tile where `phase1-smoke.spec.ts` puts its Carousel in the 64 × 64 park.

- [ ] **Step 2: Run them and see them fail**

Run: `npm run e2e -- tests/e2e/decks.spec.ts`
Expected: FAIL (no `card-carousel`).

- [ ] **Step 3: Implement the content cards and the refresh; delete the two picker files; update the helpers**

`pickCard` and `cardOf` in the helpers now open the Rides or Stalls deck when it is not open, scroll the card into view, and use `card-<id>`.

- [ ] **Step 4: Run the gates**

Run: `npm run typecheck && npm test && npm run build && npm run e2e`
Expected: all pass. `grep -rn "ridePicker\|stallPicker\|ridePickerTabs\|picker-tab" src tests` gives no output.

- [ ] **Step 5: Commit**

```bash
git add -A src/ui src/styles tests
git commit -m "feat(ui): ride and stall cards in the hand replace the pickers"
```

---

### Task 11: Card details panel

**Files:**
- Create: `src/ui/panels/cardDetails.ts`
- Modify: `src/ui/context.ts` (`PanelKind` gets `cardDetails`), `src/ui/index.ts` (`openPanel` case; open and close rule for desktop), `src/ui/toolStatus.ts` (Details button), `src/styles/main.css`
- Test: `tests/unit/ui/cardDetails.test.ts`, `tests/e2e/decks.spec.ts`

**Interfaces:**
- Consumes: `CardSpec`, `heldCardId`, `rideCards`, `stallCards`; the catalog; `formatMoney`, `formatPrice`, `formatRating`.
- Produces: `interface DetailRow { labelId: string; value: string }`; `cardDetailRows(spec: CardSpec): DetailRow[]` (pure):
  - flat: `ui.details.seats` (`capacity`), `ui.stat.excitement`, `ui.stat.intensity`, `ui.stat.nausea` (`formatRating`), `ui.details.ticket` (`formatPrice(defaultPrice)`), `ui.details.running` (`formatMoney(runningCostMonthly)`), `ui.details.size` (`ui.details.sizeValue` with `w`, `d`).
  - track: the four values of the track picker card of today, in its order (drive, maximum height, seats per car, "From" cost), with its string ids.
  - stall: kind (`ui.kind.*`), `ui.details.ticket` (`formatPrice(defaultPrice)`), `ui.details.running`.
- Produces: `createCardDetailsPanel(ctx: UiContext): PanelView` with `kind: 'cardDetails'`, `id: null`. The title is the name of the held card. The body has the preview, the zone, the build cost, a `<dl>` of the rows, and the hint (`ui.details.hintDesktop` or `ui.details.hintPhone` by layout). `update()` returns false when no content card is held, so the panel host closes it.
- Rules: on desktop (`data-layout="side"`), the UI opens the panel when `heldCardId` changes to an id of a content card. On the phone, the tool status bar shows `button[data-testid="status-details"]` named "Details" while a content card is held; it opens the panel. Closing the panel does not change the tool.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/ui/cardDetails.test.ts
import { describe, expect, it } from 'vitest';
import { getFlatRideDef, STALLS } from '../../../src/data/catalog';
import { text } from '../../../src/data/strings/en';
import { cardDetailRows } from '../../../src/ui/panels/cardDetails';
import { formatMoney, formatPrice } from '../../../src/ui/format';

describe('card details (Phase 7 §4.7)', () => {
  it('a flat ride shows seats, ratings, ticket, running cost, and size', () => {
    const def = getFlatRideDef('carousel')!;
    expect(cardDetailRows({ id: 'carousel', kind: 'flat', zone: 'family', cost: def.buildCost, name: 'Carousel' })).toEqual([
      { labelId: 'ui.details.seats', value: '16' },
      { labelId: 'ui.stat.excitement', value: '2.50' },
      { labelId: 'ui.stat.intensity', value: '1.00' },
      { labelId: 'ui.stat.nausea', value: '0.50' },
      { labelId: 'ui.details.ticket', value: '$2.00' },
      { labelId: 'ui.details.running', value: formatMoney(def.runningCostMonthly) },
      { labelId: 'ui.details.size', value: text('ui.details.sizeValue', { w: def.w, d: def.d }) },
    ]);
  });
  it('a stall shows its kind, its price, and its running cost', () => {
    const def = STALLS[0]!;
    expect(cardDetailRows({ id: def.id, kind: 'stall', zone: def.kind, cost: def.buildCost, name: def.name }).map((r) => r.value)).toEqual([
      text(`ui.kind.${def.kind}`), formatPrice(def.defaultPrice), formatMoney(def.runningCostMonthly),
    ]);
  });
  it('a track ride shows four rows', () => {
    // Use the first id of pickableTrackTypes(makeTestWorld()).
  });
});
```

```ts
// add to tests/e2e/decks.spec.ts
test('the card details panel shows the data of the held card', async ({ page }, info) => {
  await pickCard(page, 'flat', 'carousel');
  if (info.project.name === 'phone') await page.getByTestId('status-details').click();
  const panel = page.locator('.panel');
  await expect(panel.locator('.panel-title')).toHaveText('Carousel');
  await expect(panel).toContainText('Seats');
  await expect(panel).toContainText('16');
  await expect(panel).toContainText('2.50');
  await panel.getByRole('button', { name: 'Close' }).click();
  expect(await toolNow(page)).toBe('placeRide');
  await page.getByTestId('card-put-back').click();
  await expect(page.getByTestId('status-details')).toBeHidden();
});
```

Fill the track test with the real rows.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/ui/cardDetails.test.ts`
Expected: FAIL, cannot find the module.

- [ ] **Step 3: Implement the rows, the panel, the desktop rule, and the Details button**

- [ ] **Step 4: Run the gates**

Run: `npm run typecheck && npm test && npm run e2e -- tests/e2e/decks.spec.ts tests/e2e/a11y.spec.ts tests/e2e/phase1-smoke.spec.ts tests/e2e/content.spec.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui src/styles tests
git commit -m "feat(ui): card details panel"
```

---

### Task 12: Card drag (mouse and pen)

**Files:**
- Create: `src/ui/decks/drag.ts`
- Modify: `src/input/tools.ts` (`heldGhostAt`), `src/input/controller.ts` (`refreshGhost` calls `heldGhostAt`; no behaviour change), `src/input/index.ts` (`tileAtClient`), `src/ui/decks/card.ts` (attach the drag), `src/styles/main.css`
- Test: `tests/unit/ui/tools.test.ts`, `tests/unit/ui/drag.test.ts`, `tests/e2e/decks.spec.ts`

**Interfaces:**
- Produces, `src/input/tools.ts`: `heldGhostAt(world: World, tool: ToolState, viewRotation: Dir, tile: number): GhostState | null`. Null unless the tool is `placeRide` or `placeStall` with a `defId`. It uses `mapRotationFromView(tool.rotation, viewRotation)` (`src/render/view.ts`) and `computeGhost`, as `refreshGhost` does today.
- Produces, `src/input/index.ts`: `tileAtClient(game: Game, canvas: HTMLCanvasElement, clientX: number, clientY: number): number | null`. The same math as `InputController.tileAt`, with the canvas rectangle taken off.
- Produces, `drag.ts`:
  - `dragStarts(dx: number, dy: number, pointerType: string, kind: CardSpec['kind']): boolean` (pure): true when `Math.hypot(dx, dy) ≥ CARD_DRAG_PX`, the pointer is `mouse` or `pen`, and the kind is not `track`.
  - `attachCardDrag(ctx: UiContext, el: HTMLElement, spec: CardSpec): void`.
- Drag rules (§4.6): at the start, `holdCard` and pointer capture. On a move over the canvas, `tool.hoverTile = tileAtClient(…)`; the controller makes the ghost. On release over the canvas, compute `heldGhostAt`; dispatch `placeRide` or `placeStall` only when the ghost is valid; else set `tool.hoverTile` so the status bar shows the reason. On release over the UI, on `pointercancel`, and on `lostpointercapture`: end the drag and build nothing. The card stays held in every case. A click that follows a drag does not put the card back.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/ui/drag.test.ts
import { describe, expect, it } from 'vitest';
import { dragStarts } from '../../../src/ui/decks/drag';

describe('card drag start (Phase 7 §4.6)', () => {
  it.each([
    [7, 0, 'mouse', 'flat', false],
    [8, 0, 'mouse', 'flat', true],
    [6, 6, 'pen', 'stall', true],
    [20, 0, 'touch', 'flat', false],
    [20, 0, 'mouse', 'track', false],
  ] as const)('dx %i dy %i %s %s gives %s', (dx, dy, pointer, kind, want) => expect(dragStarts(dx, dy, pointer, kind)).toBe(want));
});
```

```ts
// add to tests/unit/ui/tools.test.ts
it('heldGhostAt gives the ghost of the held ride, and null for other tools', () => {
  const w = makeTestWorld();
  const tool = defaultToolState();
  const tile = 20 * w.state.map.width + 20;
  expect(heldGhostAt(w, tool, 0, tile)).toBeNull();
  tool.tool = 'placeRide';
  tool.defId = 'carousel';
  tool.rotation = 0;
  expect(heldGhostAt(w, tool, 0, tile)).toEqual(computeGhost(w, 'ride', 'carousel', tile, mapRotationFromView(0, 0)));
});
```

```ts
// add to tests/e2e/decks.spec.ts (desktop only)
test.describe('card drag', () => {
  test.skip(({}, info) => info.project.name !== 'desktop');
  const drag = async (page: Page, to: { x: number; y: number }, end: 'up' | 'cancel' = 'up') => {
    const box = (await (await cardOf(page, 'flat', 'carousel')).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    if (end === 'up') await page.mouse.up();
    else await page.evaluate(() => document.querySelector('[data-testid="card-carousel"]')!.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerType: 'mouse' })));
  };
  const rides = (page: Page) => tc<number>(page, 'g.world.state.rides.length');

  test('a drop on a valid tile builds the ride', async ({ page }) => {
    await setSpeed(page, 'Pause');
    const cash0 = await tc<number>(page, 'g.world.state.park.cash');
    await centerOn(page, 31, 56);
    await drag(page, await tilePoint(page, 31, 56));
    expect(await rides(page)).toBe(1);
    expect(cash0 - (await tc<number>(page, 'g.world.state.park.cash'))).toBe(120_000);
  });
  test('a drop on a blocked tile builds nothing and shows the reason', async ({ page }) => {
    await centerOn(page, 31, 56);
    await drag(page, await tilePoint(page, 31, 56));
    await drag(page, await tilePoint(page, 31, 56));
    expect(await rides(page)).toBe(1);
    await expect(page.getByTestId('tool-status-detail')).not.toHaveText('');
    await expect(await cardOf(page, 'flat', 'carousel')).toHaveAttribute('aria-pressed', 'true');
  });
  test('a drop on the UI builds nothing', async ({ page }) => {
    const pill = (await page.getByTestId('status-pill').boundingBox())!;
    await drag(page, { x: pill.x + 10, y: pill.y + 10 });
    expect(await rides(page)).toBe(0);
    expect(await toolNow(page)).toBe('placeRide');
  });
  test('pointercancel ends the drag and builds nothing', async ({ page }) => {
    await centerOn(page, 31, 56);
    const pt = await tilePoint(page, 31, 56);
    await drag(page, pt, 'cancel');
    await page.mouse.up();
    await page.mouse.move(pt.x + 40, pt.y);
    expect(await rides(page)).toBe(0);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/ui/drag.test.ts tests/unit/ui/tools.test.ts`
Expected: FAIL (`dragStarts` and `heldGhostAt` do not exist).

- [ ] **Step 3: Implement `heldGhostAt`, `tileAtClient`, and the drag**

- [ ] **Step 4: Run the gates**

Run: `npm run typecheck && npm test && npm run e2e -- tests/e2e/decks.spec.ts tests/e2e/phase1-smoke.spec.ts tests/e2e/keyboard.spec.ts tests/e2e/view.spec.ts`
Expected: all pass. `tests/unit/ui/controller.test.ts` passes unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/input src/ui/decks src/styles tests
git commit -m "feat(ui): drag a card to the map with mouse or pen"
```

---

### Task 13: Tip bubble and bottom mascots

**Files:**
- Create: `src/ui/tips/bubble.ts`, `src/ui/tips/bottomMascots.ts`
- Modify: `src/ui/mascots.ts` (export `drawFrostBody` and `drawSparkBody`, the two private body functions of today), `src/ui/index.ts` (mount both parts), `src/styles/main.css`
- Test: `tests/e2e/tips.spec.ts`

**Interfaces:**
- Consumes: `tipInput`, `matchingTips`, `dropStale`, `shownTip`, `Tip` (Task 2); `ctx.openDeck`, `ctx.openPanel`; `mascotCanvas`; `modalOpen`, `titleOpen` (`src/ui/scenario/shared.ts`); `game.settings.get('mascotTips')`; `TIP_CHECK_MS`, `MASCOT_MIN_WIDTH_PX`.
- Produces: `createTipBubble(ctx: UiContext): UiPart`; `createBottomMascots(ctx: UiContext): UiPart`.
- DOM contract: `aside.tip-bubble[data-testid="tip"][data-tip="<id>"][aria-live="polite"]` named "Mascot tip", with the speaker portrait, `[data-testid="tip-text"]` (`ui.tip.<id>`), `button[data-testid="tip-action"]`, and `button[data-testid="tip-close"]` named "Close". It is `hidden` when no tip shows, when `modalOpen()` or `titleOpen()` is true.
- Buttons: `cashLow` → "Open Finance" → `ctx.openPanel('finance')`. `noRide` → "Show rides" → `ctx.openDeck('rides')`. `underServed.<g>` → `ui.tip.showZone` with the zone name → `ctx.openDeck('rides', g)`; the hand scrolls to that zone.
- Check period: `TIP_CHECK_MS`. The closed set clears on `onWorldChanged`.
- Bottom mascots: two `canvas` elements, `aria-hidden`, `pointer-events: none`, shown only in the desktop layout at `window.innerWidth ≥ MASCOT_MIN_WIDTH_PX`. On desktop the bubble is above the hand on the side of the speaker (Frost left, Spark right, both left). On the phone it is below the day pill.

- [ ] **Step 1: Write the failing test**

```ts
// tests/e2e/tips.spec.ts
import { expect, test } from '@playwright/test';
import { newPark, openTool } from './helpers';

test('a new park shows the noRide tip; its button opens the Rides deck; Close hides it', async ({ page }) => {
  await newPark(page, 'Tip Park');
  const tip = page.getByTestId('tip');
  await expect(tip).toBeVisible({ timeout: 4000 });
  await expect(tip).toHaveAttribute('data-tip', 'noRide');
  await expect(page.getByTestId('tip-text')).toHaveText('Build a ride and open it. Guests come for rides');
  await page.getByTestId('deck-paths').click();
  await page.getByTestId('tip-action').click();
  await expect(page.getByTestId('hand')).toHaveAttribute('data-deck', 'rides');
  await page.getByTestId('tip-close').click();
  await expect(tip).toBeHidden();
  await page.waitForTimeout(2500);
  await expect(tip).toBeHidden();
});

test('negative cash shows cashLow first; Open Finance opens the Finance panel', async ({ page }) => {
  await newPark(page, 'Tip Park');
  await page.evaluate(() => ((window as unknown as { __tc: { world: { state: { park: { cash: number } } } } }).__tc.world.state.park.cash = -100));
  await expect(page.getByTestId('tip')).toHaveAttribute('data-tip', 'cashLow', { timeout: 4000 });
  await page.getByTestId('tip-action').click();
  await expect(page.locator('.panel-title')).toHaveText(/Finance/);
});

test('the Mascot tips setting turns the tips off', async ({ page }) => {
  await newPark(page, 'Tip Park');
  await expect(page.getByTestId('tip')).toBeVisible({ timeout: 4000 });
  await page.evaluate(() => (window as unknown as { __tc: { settings: { set(k: string, v: boolean): boolean } } }).__tc.settings.set('mascotTips', false));
  await expect(page.getByTestId('tip')).toBeHidden({ timeout: 4000 });
});

test('the Tutorial shows no tip, and an open menu hides the tip', async ({ page }) => {
  await newPark(page, 'Tip Park');
  await expect(page.getByTestId('tip')).toBeVisible({ timeout: 4000 });
  await openTool(page, 'menu');
  await expect(page.getByTestId('tip')).toBeHidden();
  // Start the Tutorial scenario with the steps that tutorial.spec.ts uses; then:
  // await page.waitForTimeout(2500); await expect(page.getByTestId('tip')).toBeHidden();
});
```

Fill the Tutorial part with the start steps of `tests/e2e/tutorial.spec.ts`.

- [ ] **Step 2: Run it and see it fail**

Run: `npm run e2e -- tests/e2e/tips.spec.ts`
Expected: FAIL (no `tip` element).

- [ ] **Step 3: Implement the bubble and the bottom mascots; mount them**

- [ ] **Step 4: Run the gates**

Run: `npm run typecheck && npm test && npm run e2e -- tests/e2e/tips.spec.ts tests/e2e/tutorial.spec.ts tests/e2e/a11y.spec.ts tests/e2e/decks.spec.ts tests/e2e/phase1-smoke.spec.ts`
Expected: all pass. A tip does not cover a control that another e2e test presses; if it does, change the place of the bubble, not the test.

- [ ] **Step 5: Commit**

```bash
git add src/ui src/styles tests/e2e/tips.spec.ts
git commit -m "feat(ui): mascot tips and bottom mascots"
```

---

### Task 14: Release gate — layout, accessibility, documents, owner screenshots

**Files:**
- Modify: `tests/e2e/a11y.spec.ts`, `tests/e2e/interface.spec.ts`, `docs/superpowers/specs/2026-11-09-thrills-and-chills-design.md` (build table: Build 4, Phase 7), `docs/superpowers/specs/thrills-and-chills/tuning-log.md` (the constants of §8, all provisional), `README.md` (controls), `CHANGELOG.md`, `package.json` (`version` → `4.0.0`), `scripts/check-release.ts` (`RELEASE_VERSION = '4.0.0'`), `tests/unit/offline/release.test.ts` (the version that it expects)
- Create: `docs/superpowers/specs/thrills-and-chills/build-4-acceptance.md`, `docs/screenshots/phase-7-desktop.png`, `docs/screenshots/phase-7-phone.png`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the remaining checks**

```ts
// add to tests/e2e/interface.spec.ts
test('with the hand open on the phone, the free map area is at least 45% of the screen height', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone');
  await page.setViewportSize({ width: 390, height: 844 });
  await newPark(page);
  await expect(page.getByTestId('hand')).toBeVisible();
  const free = await page.evaluate(() => {
    const css = getComputedStyle(document.getElementById('ui') as HTMLElement);
    return window.innerHeight - parseFloat(css.getPropertyValue('--hud-bottom')) - parseFloat(css.getPropertyValue('--toolbar-space'));
  });
  expect(free).toBeGreaterThanOrEqual(0.45 * 844);
});
```

`tests/e2e/a11y.spec.ts`:
- The axe test for the game screen also scans three more states: the hand open with a tip on the screen; a held Carousel card with the card details panel; the phone Speed menu open. High contrast scans the same states.
- The 44 × 44 px test and the 175% `en-XA` test run with the hand open and a held card. They keep 1280 × 720 and 375 × 667.

- [ ] **Step 2: Run the full gates**

Run: `npm run typecheck && npm test && npm run build && npm run e2e && node scripts/check-release.ts --no-build`
Expected: typecheck prints nothing; unit and e2e tests all pass, with no fewer passed tests than the baseline; `tests/e2e/perf.spec.ts` and `tests/e2e/perf-build3.spec.ts` pass; `check-release.ts` exits 0.

- [ ] **Step 3: Make the owner screenshots**

Use the opt-in pattern of `tests/e2e/overview-build3.spec.ts` (`TC_SCREENSHOT=1`): a park with 4 open rides and guests, the Rides deck open, the Carousel card held. Save 1280 × 800 to `docs/screenshots/phase-7-desktop.png` and 390 × 844 to `docs/screenshots/phase-7-phone.png`. Look at both pictures: no overlap, no clipped text.

- [ ] **Step 4: Write the documents**

- `build-4-acceptance.md`: each line of §11 "Done when" with its evidence (test name or file), the baseline and the new test counts, the gzip size of the JavaScript bundle, and the bytes of the two font files. The owner line stays open: "The owner has accepted the screenshots."
- Master spec build table: a row "Build 4 — Frost and Spark | 7 | New interface: mood bar, card decks, hand of cards, mascot tips".
- `README.md`: the controls section describes the decks, the hand, the mood bar, and the tips.
- `CHANGELOG.md`: 4.0.0 with the interface change, settings version 2, the bundle size, and the font size.
- `tuning-log.md`: the 9 constants, marked provisional.

- [ ] **Step 5: Commit and push**

```bash
git add -A
git commit -m "docs(release): Build 4 acceptance; version 4.0.0; owner screenshots"
git push -u origin ccr-6f420895-3xt45j
```

Then give the owner the two screenshots and ask for acceptance. Do not merge to `main` and do not open a pull request without a request from the owner.
