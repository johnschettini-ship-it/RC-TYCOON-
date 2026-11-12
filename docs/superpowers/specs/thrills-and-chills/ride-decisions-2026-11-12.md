# Core decisions on rides and building (owner, 2026-11-12)

Status: decided by the owner on 2026-11-12, except where a line says "proposal".

| # | Topic | Decision |
|---|---|---|
| R1 | Building track rides | Keep piece-by-piece building and add **Auto-finish**: one button that closes the circuit back to the station when a closing path exists (it shows the price and the pieces it adds; the player confirms). |
| R2 | Ride limits | **Looser limits.** The height limit stays a ride's character but is higher; rides built above the old limit get a higher intensity rating (guests who want calm rides avoid them). New values: proposal below. |
| R3 | Flat rides and stalls on slopes | **Auto-flatten with a price.** When the ground is sloped, the placement offers "Flatten and build · $price" in one press; the land cost is shown before Confirm. |
| R4 | Ride focus for the next build | **All four:** coasters, water rides, family flat rides, thrill flat rides. Order: proposal below. |
| — | Height limit measure | The limit is the climb above the station, not the height above the ground (decided earlier on 2026-11-12, built in 8e0c0c7). |
| — | Mini Railway | A train may have one car (built in 8e0c0c7). |

## R2 proposal: new height limits (climb above the station)

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

Rating rule (proposal): for each metre above the old limit, the ride's intensity rises by a fixed step, capped, so a very tall family ride starts to count as a thrill ride.

## R4 proposal: order of work

1. Coasters (new pieces: loops, launches, more inversions; Auto-finish first because every track ride uses it).
2. Thrill flat rides.
3. Family flat rides.
4. Water rides.
