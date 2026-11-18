# Touch controls and path step builder: design

- **Status:** approved by the owner on 2026-11-18 ("Yes", after the audit).
- **Owner requests:** "Need better UI turn clicks, scroll ability, and a build mode for paths". Turn clicks means all of: rotate the view, rotate a ride or stall, taps that hit, and fewer taps. Scroll means one finger moves the map. Path mode means a step builder.
- **Evidence:** the owner's phone screenshot (path tool on): the Height panel and the Queue panel stack and cover about a third of the screen; one finger draws paths, so the map cannot be moved with one finger.

## Intent

On a phone, moving the map, turning things and building paths must be easy and safe. A drag must never build by accident.

## Approaches

1. **One finger moves the map; paths are built with a step builder (picked).** It is safe and works the same in every tool.
2. A Move/Build toggle (rejected): one more mode to forget, and a wrong mode still builds by accident.
3. Better drag drawing (rejected): drag still fights with moving the map.

## Decisions

1. **Gestures.** One finger always moves the map, in every tool. A tap acts on a tile. Two fingers zoom (and pan, as today). A mouse left-drag also moves the map. Desktop Shift-drag keeps today's quick line drawing for paths.
2. **Other drag tools** (patrol paint, land tools, land purchase): a finger moves the map and a tap paints one tile. Each of these tools gets a "Paint" toggle in its panel; when it is on, a one-finger drag paints as today. The toggle resets when the tool closes.
3. **Path step builder** (footpath and queue):
   - Tap a start tile. Then the panel arrows add one tile per tap: Forward, Left, Right, Up slope, Down slope, Flat, plus Undo and Done.
   - A tap next to the path's end adds that tile. A tap anywhere else moves the start.
   - A ghost tile shows the next tile, with its cost. Holding an arrow repeats it.
   - One single-row panel replaces today's stacked Height and Queue panels. It must fit at 390×844, 360×640 and 812×375, at normal and large text.
   - The tool remembers the last path kind and height.
4. **Turning.** The view's turn-left and turn-right buttons (they exist in `src/ui/view`) are both clearly on screen at all times. Ride and stall placement has a large Rotate button, and a tap on the ghost also turns it.
5. **Tap targets:** every control in these flows is at least 44×44 CSS px.
6. **Fewer taps:** after a ride or stall with an entrance is placed, the queue step builder opens at its entrance, and a queue built from there links to the entrance.
7. **Tips:** one tip, once, tells mouse players about Shift-drag.

## Constraints

- Both builds get this (a gameplay change); the website build changes by design.
- Old saves load. Settings keep their version unless a new setting is added; then migrate.
- Rules and costs of building do not change: the step builder issues the same build commands as today.
- Strings go in the string tables for every locale, as today.
- Checks: tsc, full vitest, e2e taps for each flow (pan with one finger in every tool, step builder, paint toggle, rotate, queue at entrance), the fit probe, axe, and phone-size screenshots for the owner.

## Not included

The coaster builder and the card decks do not change.

## Left to the builder

Exact panel layout and icons, the hold-to-repeat rate, how the ghost cost is shown.
