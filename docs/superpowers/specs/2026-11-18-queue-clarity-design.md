# Queue clarity: design

- **Status:** approved by the owner on 2026-11-18 ("Yes all 4").
- **Owner question:** "How do we know queue line is for each ride? Is it defined, do we have a name of ride at the entrance? How do lines work?"
- **Today (verified in code):** queue ownership is derived by a flood fill from each ride's entrance over connected queue tiles (`src/sim/pathing/network.ts` `computeQueueOwners`; lowest ride id wins shared tiles). Nothing shows it. Guests in `ride.queue` stand still where they joined (`src/sim/guests/api.ts` `joinQueue`); limits are `QUEUE_MAX_JOIN` 25 and `QUEUE_MAX_WAIT` 1200 ticks (60 s).

## Intent

The player can see which line belongs to which ride, spot a broken line, and see a busy line fill up.

## Decisions

1. **Entrance sign.** Each ride with an entrance shows a small sign over the entrance with the ride's name (the same name the ride panel shows, including a renamed ride). Both looks. It hides at the farthest zoom. Long names are cut with an ellipsis to fit the sign.
2. **Tap a queue tile.** With the inspect tool (or no tool), tapping a queue tile highlights every tile of that queue and shows a small card: the ride's name, "Queue: N guests", and a button that opens the ride's panel. A queue tile with no owner shows "This queue reaches no ride".
3. **Warnings.**
   - A queue section that reaches no ride entrance: a warning marker on it, visible while a path tool is on and in the tap card.
   - A queue that touches another ride's queue (tiles claimed by the first ride): a warning naming both rides, shown in the tap card and as a one-time message when it is built.
   - These are hints only. They do not change ownership rules.
4. **Guests shuffle along the line.** Guests in a ride's queue stand in order along the queue path, front guest at the entrance, walking forward when the front guest boards. About 3 guests per queue tile. If the line is longer than its tiles hold, the extra guests stand bunched at the far end.
   - **Rules do not change:** the join limit (25), patience (60 s), happiness loss and boarding order stay the same. Only where a queueing guest stands and walks changes.
   - The queue order of tiles is the flood-fill distance from the entrance; ties break in a fixed order so the result is the same every run (deterministic sim).

## Constraints

- Both builds. Old saves load: guest positions in a queue are recomputed after load; no new saved fields unless needed, then with a migration and a test.
- Sim stays deterministic (same seed → same result); replay/determinism tests must pass.
- Performance: the queue tile order is cached with the path network and rebuilt only when it changes. The perf budget tests must pass.
- Strings in every locale's string table, as today. Contrast ≥ 4.5:1 on the sign and card.
- Checks: tsc, full vitest, e2e for the sign, the tap card, both warnings and a filling line; the fit probe at phone sizes; screenshots in both looks for the owner.

## Not included

No change to how ownership is decided, to queue limits, or to queue costs.

## Left to the builder

Sign art and size, the highlight colour, the exact spacing of guests on a tile, walking speed in the line.
