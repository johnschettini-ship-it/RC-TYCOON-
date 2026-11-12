# Core decisions on rides and building (owner, 2026-11-12)

Status: decided by the owner on 2026-11-12. The owner accepted the two proposals below ("That's fine", 2026-11-12).

| # | Topic | Decision |
|---|---|---|
| R1 | Building track rides | Keep piece-by-piece building and add **Auto-finish**: one button that closes the circuit back to the station when a closing path exists (it shows the price and the pieces it adds; the player confirms). |
| R2 | Ride limits | **Looser limits.** The height limit stays a ride's character but is higher; rides built above the old limit get a higher intensity rating (guests who want calm rides avoid them). New values: proposal below. |
| R3 | Flat rides and stalls on slopes | **Auto-flatten with a price.** When the ground is sloped, the placement offers "Flatten and build · $price" in one press; the land cost is shown before Confirm. |
| R4 | Ride focus for the next build | **All four:** coasters, water rides, family flat rides, thrill flat rides. Order: proposal below. |
| — | Height limit measure | The limit is the climb above the station, not the height above the ground (decided earlier on 2026-11-12, built in 8e0c0c7). |
| — | Mini Railway | A train may have one car (built in 8e0c0c7). |

## R2: new height limits (climb above the station)

| Ride | Today | Proposal |
|---|---|---|
| Steel Coaster | 50 m | 75 m |
| Inverted Coaster | 45 m | 70 m |
| Wooden Coaster | 40 m | 60 m |
| Bobsled Run | 25 m | 35 m |
| Log Flume | 20 m | 30 m |
| Spinning Mouse | 16 m | 24 m |
| Junior Coaster | 12 m | 20 m |
| Monorail | 12 m | 24 m |
| Rapids Raft | 10 m | 15 m |
| Mini Railway | 8 m | 16 m |
| Ghost Train | 6 m | 10 m |
| Go-Kart Track | 4 m | 6 m |

Rating rule: for each metre above the old limit, the ride's intensity rises by a fixed step, capped, so a very tall family ride starts to count as a thrill ride.

## R4: order of work

1. Coasters (new pieces: loops, launches, more inversions; Auto-finish first because every track ride uses it).
2. Thrill flat rides.
3. Family flat rides.
4. Water rides.

## Physics and safety (owner, 2026-11-12: "Yes please and if we have to restrict again for safety")

| # | Topic | Decision |
|---|---|---|
| R5 | Live meter in the builder | While a track ride is built, the builder shows the projected top speed and the strongest vertical and lateral G of the last piece's section, from a short simulation with the same physics as the test run. Colours: normal, warning (near a penalty limit), over the limit. |
| R6 | Train length | Trains are simulated with their length: the forces are averaged over every car, so a long train is pulled over a crest by its front cars and held back by its rear cars, as real trains are. Mass still cancels (guest load does not change motion). |
| R7 | Safety limits | Looser height limits (R2) come with hard safety limits. A piece whose projected section passes a hard limit cannot be built (Build disabled, with the reason), and a ride whose test lap passes a hard limit cannot open. Decided (owner, 2026-11-12): vertical G above 6.0 or below −2.0, lateral G above 3.0 (today's penalty limits 5.0, −1.5 and 2.5 stay as rating penalties). A train that cannot finish the circuit (stalls on a hill) also blocks opening, with the place shown on the map. |
| R8 | Auto-finish and safety | Auto-finish (R1) only offers a closing path whose test lap passes the safety limits and does not stall. |

## Park theme and mascot maker (owner, 2026-11-12)

| # | Topic | Decision |
|---|---|---|
| T1 | Player-made identity | The player sets a park theme (name, a colour pair from readable palettes, a theme style) and builds a mascot from parts (body shape, colours, face, one accessory). Parts are made by the project; no outside images. |
| T2 | Gameplay effects | Yes: the mascot is the performer costume (with a Chill or Thrill bonus that follows the mascot's mood), a statue in the Scenery deck (park happiness as other statues), and the entrance sign. |
| T3 | When | Together with the pixel art full build (Phase 8b), so the mascot parts are drawn once in the final style. |
| T4 | Saves | Each park saves its own theme and mascot; older parks get a default theme and mascot. |
| T5 | Costumes until then | Boo stays the only costume; the full build adds the player mascot and a "no costume" choice. |
