# Core decisions on rides and building (owner, 2026-11-12)

Status: decided by the owner on 2026-11-12. The owner accepted the two proposals below ("That's fine", 2026-11-12).

Built (ride work 1, plan `docs/superpowers/plans/2026-11-12-ride-work-1.md`, 2026-11-12, Build 4, not yet tagged):
R2 in 3ffdb34; R6 in f8c9821 and 1c5ecb0; R7 in b5acb88 and d42ea36; R5 in 28c629b and 522937c; R1 and R8 in
0a51d2e, 9b5da2f and cfa87d5 (brakes and the 3 s limit). R3 and R4 are not built yet. Existing parks: save schema 3 is
unchanged; a saved ride keeps its ratings until its next test (`tests/integration/ride-rules-saves.test.ts`).

| # | Topic | Decision |
|---|---|---|
| R1 | Building track rides | Keep piece-by-piece building and add **Auto-finish**: one button that closes the circuit back to the station when a closing path exists (it shows the price and the pieces it adds; the player confirms). Owner note (2026-11-12, "Allow brakes + 3 s limit"): Auto-finish may lay the ride's ordinary brake piece, at a speed it picks from a small fixed set (17, 12 and 7 m/s, the speeds the plain turns need), to slow the train before turns (no block brakes, loops, corkscrews, helices, spooky tunnels or water features), and it stops searching after about 3 seconds, saying "No safe way back found: build closer to the station or lower the track". Owner note (2026-11-12, the 3 s on a phone): the 3 seconds are wall-clock time on the player's own device (3,000 ms since the search started), not a node count calibrated to a desktop (about 12–23 s on a phone); the node count stays only as an upper safety bound. A track that already holds a piece over a hard safety limit is answered at once, without a search: "Piece {n} is over the safety limit: fix it first" (the piece Open names). |
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
| R8 | Auto-finish and safety | Auto-finish (R1) only offers a closing path whose test lap passes the safety limits and does not stall. Owner note (2026-11-12): a path with brakes is held to the same rule (the strongest car within the hard limits, no stall). |

## Park theme and mascot maker (owner, 2026-11-12)

| # | Topic | Decision |
|---|---|---|
| T1 | Player-made identity | The player sets a park theme (name, a colour pair from readable palettes, a theme style) and builds a mascot from parts (body shape, colours, face, one accessory). Parts are made by the project; no outside images. |
| T2 | Gameplay effects | Yes: the mascot is the performer costume (with a Chill or Thrill bonus that follows the mascot's mood), a statue in the Scenery deck (park happiness as other statues), and the entrance sign. |
| T3 | When | Together with the pixel art full build (Phase 8b), so the mascot parts are drawn once in the final style. |
| T4 | Saves | Each park saves its own theme and mascot; older parks get a default theme and mascot. |
| T5 | Costumes | Every mascot the player creates becomes a costume (owner, 2026-11-12: "Costumes can be for all avatars created since we changed the concept"); a player may create several. Until the full build Boo stays the only costume; the full build also adds a "no costume" choice. |

## Tablets (owner, 2026-11-12)

Tablets get the same as phones: the pixel look with the phone frame set and the phone memory budget. The real-tablet run of the device checklist confirms speed; B4 is judged there.

## Art direction (owner, 2026-11-12)

The owner stopped the pixel art direction after seeing the stage 0b test ("Art needs a better polish let's go with curved clean concepts instead of pixel"). Next: three concept sheets in curved, clean styles (A soft rounded flat, B clay or toy 3D, C bold cartoon); the owner picks one. What stays valid from Phase 8b: the phone app and website demo, drawing pictures ahead of time when it helps speed, the safety and ride work, and the theme and mascot maker (it is drawn in the chosen style). The pixel test branch phase8b-stage0b-proto stays as a record; it is never merged.

**Owner choice (2026-11-12):** style C, bold cartoon, with A's soft ground shadows. Curved shapes, one ink outline width, flat bright fills with one shade step, and soft blurred shadows under objects (drawn ahead of time, not blurred each frame). Sheets: `docs/research/art/curved/`, pictures `docs/screenshots/concept-curved-*.png`. Next: an art spec for this style (zoom detail levels, turns, ride and guest parts, the theme and mascot maker), for owner review before any build work.

**Later rounds (2026-11-13):** the owner asked for more looks: rounds 2–5 (styles D–S, `docs/research/art/curved/`), then "let's go back to more real life concepts". Rounds 6–7 are realistic 3D renders (three.js, orthographic 2:1 camera; `docs/research/art/realistic/`, pictures `docs/screenshots/concept-real-*.png`). Owner on round 7: "Looks good". This is not yet a final choice of art style. Open risk: phone memory, estimated 60–150 MB compressed for a realistic park against about 26 MB today. Next proposed step: a phone test of the realistic daylight look (one ride and a crowd from pre-drawn pictures; measure frame time and memory) before any decision.

**Phone test of the realistic look (2026-11-13):** after three fixes (objects packed per turn, next turn decoded ahead, compressed files downloaded at start), the owner's phone passed: 60 fps with 0 dropped frames up to 1,000 guests, peak images about 93 MB, turns 34-35 ms (`docs/research/art/realistic/phone-test/results-owner-phone-1..4.md`). Limits: one phone, a small park, memory estimated. Next: an art spec for the realistic look, for owner review.
