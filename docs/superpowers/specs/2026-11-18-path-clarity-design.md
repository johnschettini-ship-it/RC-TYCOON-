# Path clarity: design

- **Status:** approved by the owner on 2026-11-18 ("No name sign and clarity on the path").
- **Owner feedback:** after queue clarity shipped, the owner still did not understand how a ride's line works (phone screenshot: a Spiral Slide with a railed queue, 0 guests, night). The entrance name sign was cut off at the screen edge.
- **Related:** `2026-11-18-queue-clarity-design.md` (this changes its decision 1).

## Intent

The player can see, in the game, whether guests can reach each ride, and what is missing if they cannot. The chain is: park entrance → footpath → queue → ride entrance.

## Decisions

1. **Remove the entrance name sign** in both looks (queue clarity decision 1 is withdrawn). The tap-a-queue card, warnings and the line of guests stay.
2. **Ride reach status.** Every ride panel (flat and track) shows one status line, checked live, first failing step wins:
   - "No queue at the entrance" — the entrance has no owned queue tile.
   - "No footpath reaches the queue" — the queue's open end does not touch a footpath connected to the park entrance.
   - "The ride is closed" — the ride is not open.
   - "Guests can reach this ride" — all good.
   The same status shows in the tap-a-queue card.
3. **Show me.** When the status is not good, a "Show me" button in the panel closes the panel, moves the camera to the problem and highlights it: the entrance tile (no queue), or the queue's open end tile (no footpath). The highlight pulses for a few seconds.
4. **Path tools show the chain.** While the Footpath or Queue tool is on:
   - ride entrances with no queue glow;
   - a queue's open end that no connected footpath reaches glows;
   - footpaths that do not connect to the park entrance are drawn dimmed.
5. **A one-time tip** the first time a ride is placed: "Guests walk: park entrance → footpath → queue → ride. Build a queue from the glowing entrance, then a footpath to its end."

## Constraints

- Game rules do not change (reach is computed from the existing path network; no new pathing rules). The sim stays deterministic.
- Both builds. Old saves load; no new saved fields (the tip uses the existing seen-tips mechanism).
- The reach check is cached with the path network and rebuilt only when it changes; perf-budget tests pass.
- Strings in every locale's string table. Contrast ≥ 4.5:1. Fits at 390×844, 360×640, 812×375, normal and large text.
- Checks: tsc, full vitest, e2e for every status, Show me, the path-tool glows/dimming, and the tip; axe; phone screenshots for the owner.

## Left to the builder

Glow and dim styles, pulse timing, exact panel placement of the status line.
