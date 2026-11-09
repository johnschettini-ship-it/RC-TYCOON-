# Thrills & Chills — Content Catalog

- **Purpose:** single source of truth for content and its numbers. Phase specs refer to this file. Code copies these values into `src/data/`.
- **Status:** all numbers are starting values for play-testing. Change them here first, then in code.
- **Units:** money in dollars here (stored as cents). Ratings 0.00–10.00. Cycle times in seconds at 1× (20 ticks = 1 s).

## Legend
- **Phase:** the phase that adds the item.
- **Unlock:** `start` = available at game start. Otherwise the research category (Phase 3) that unlocks it. Before Phase 3 exists, every item of an implemented phase is available at start.
- **Tag:** `thrill`, `family`, or `chill`. It drives guest temperament matching (Phase 1).
- **Flags:** `covered` (no rain penalty, Phase 3), `spooky` (After Dark bonus, Phase 4), `tall` (closes during storms, Phase 3). Every open ride and stall gives light at night (Phase 4), so there is no light flag.
- **Gates (flat rides):** the footprint is `w × d`. The front edge has length `w`. The entrance gate is front-edge tile `floor((w − 1) / 2)`. The exit gate is the matching tile on the back edge.

---

## 1. Flat rides (14 in Build 1)

| id | Name | Ph | Unlock | Tag | Flags | Size | Exc | Int | Nau | Cap | Cycle | Build | Run/mo | Price |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `carousel` | Carousel | 1 | start | family | covered | 3×3 | 2.50 | 1.00 | 0.50 | 16 | 20 | $1,200 | $40 | $2 |
| `big_wheel` | Big Wheel | 1 | start | chill | tall | 3×3 | 3.00 | 0.80 | 0.30 | 24 | 30 | $1,800 | $60 | $3 |
| `swing_tower` | Swing Tower | 1 | start | thrill | tall | 3×3 | 4.50 | 4.00 | 2.00 | 20 | 25 | $2,400 | $80 | $3 |
| `teacup_twirl` | Teacup Twirl | 1 | start | family | covered | 3×3 | 3.50 | 3.50 | 4.50 | 18 | 20 | $1,500 | $50 | $2 |
| `bumper_cars` | Bumper Cars | 3 | Gentle | family | covered | 4×4 | 4.00 | 2.50 | 0.50 | 12 | 25 | $2,000 | $70 | $2 |
| `rocket_rounds` | Rocket Rounds | 3 | Gentle | family | — | 3×3 | 2.80 | 1.50 | 1.00 | 16 | 20 | $1,400 | $45 | $2 |
| `spiral_slide` | Spiral Slide | 3 | Gentle | chill | — | 2×2 | 2.00 | 1.50 | 0.20 | 4 | 15 | $900 | $30 | $1 |
| `observation_tower` | Observation Tower | 3 | Gentle | chill | covered, tall | 2×2 | 3.00 | 0.50 | 0.20 | 20 | 40 | $3,500 | $90 | $3 |
| `mirror_maze` | Mirror Maze | 3 | Gentle | chill | covered | 3×3 | 2.50 | 0.50 | 0.00 | 15 | 40 | $1,400 | $35 | $2 |
| `haunted_manor` | Haunted Manor | 3 | Gentle | chill | covered, spooky | 4×4 | 4.00 | 2.00 | 0.50 | 20 | 40 | $3,200 | $80 | $3 |
| `pendulum_ship` | Pendulum Ship | 3 | Thrill | thrill | — | 3×5 | 5.00 | 5.50 | 3.50 | 24 | 25 | $3,000 | $90 | $3 |
| `thunder_disc` | Thunder Disc | 3 | Thrill | thrill | — | 4×4 | 5.50 | 6.50 | 4.50 | 24 | 25 | $4,000 | $110 | $4 |
| `drop_tower` | Drop Tower | 3 | Thrill | thrill | tall | 2×2 | 6.00 | 7.50 | 3.00 | 12 | 20 | $4,500 | $120 | $4 |
| `flip_arm` | Flip Arm | 3 | Thrill | thrill | tall | 3×3 | 6.50 | 8.00 | 6.00 | 16 | 25 | $5,000 | $140 | $4 |

Phase 6 adds more flat rides (section 8).

---

## 2. Track ride types (7 in Build 1, 9 after Build 2)

Track pieces, piece costs, build and running costs, extra-train costs, physics, and rating formulas are in `phase-2-coasters.md` (§4 and §8). A track ride counts as `tall` when its highest point is 20 m or more above ground. Water piece sets are in `phase-4-land-scenery-after-dark.md`.

| id | Name | Ph | Unlock | Tag | Flags | Drive | Seats/car | Cars/train | Max trains | Max height | Piece set | Price |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `steel_coaster` | Steel Coaster | 2 | start | thrill | — | gravity + chain lift | 4 | 2–7 | 3 | 50 m | full set incl. vertical loop and banked turns | $5 |
| `junior_coaster` | Junior Coaster | 2 | start | family | — | gravity + chain lift | 2 | 2–6 | 2 | 12 m | no steep slopes, no loop | $3 |
| `mini_railway` | Mini Railway | 2 | start | chill | — | powered, 5 m/s | 6 | 2–5 | 2 | 8 m | flat, gentle slopes, turns | $2 |
| `wooden_coaster` | Wooden Coaster | 3 | Coasters | thrill | — | gravity + chain lift | 4 | 2–7 | 3 | 40 m | no loop; airtime bonus; higher friction | $5 |
| `spinning_mouse` | Spinning Mouse | 3 | Coasters | family | — | gravity + chain lift | 4 | 1 | 6 | 16 m | small turns only; spinning adds nausea | $4 |
| `ghost_train` | Ghost Train | 3 | Gentle | chill | covered, spooky | powered, 3 m/s | 2 | 1–3 | 4 | 6 m | flat, gentle slopes, turns, spooky tunnel | $3 |
| `go_karts` | Go-Kart Track | 3 | Thrill | thrill | — | guest-driven, 6–9 m/s | 1 | 1 | 12 | 4 m | flat, gentle slopes, turns; laps | $3 |
| `log_flume` | Log Flume | 4 | Water | family | — | water channel + conveyor lift | 4 | 1 | 6 | 20 m | flume set; splashdown | $4 |
| `rapids_raft` | Rapids Raft | 4 | Water | family | — | water current | 8 | 1 | 8 | 10 m | rapids set; waterfall | $4 |

---

## 3. Stalls and facilities (11 in Build 1)

All are 1×1 with one service side.

| id | Name | Ph | Unlock | Kind | Build | Run/mo | Price | Stock/sale | Effect on guest | Weather sales factor |
|---|---|---|---|---|---|---|---|---|---|---|
| `snack_shack` | Snack Shack | 1 | start | food | $400 | $20 | $3.00 | $1.00 | hunger −120 | — |
| `fizz_stand` | Fizz Stand | 1 | start | drink | $350 | $20 | $2.00 | $0.60 | thirst −120, bladder +40 | hot ×1.5, cold ×0.7 |
| `restrooms` | Restrooms | 1 | start | toilet | $300 | $15 | $0.00 | — | bladder → 0 | — |
| `pizza_slice` | Pizza Slice | 3 | Shops | food | $500 | $25 | $4.00 | $1.40 | hunger −160 | — |
| `ice_cream_cart` | Ice Cream Cart | 3 | Shops | food | $350 | $20 | $2.00 | $0.60 | hunger −60, happiness +10 | hot ×1.6, cold ×0.4 |
| `cocoa_hut` | Cocoa Hut | 3 | Shops | drink | $350 | $20 | $2.00 | $0.50 | thirst −100, happiness +5 | cold or rain ×1.6, hot ×0.4 |
| `balloon_stand` | Balloon Stand | 3 | Shops | souvenir | $300 | $15 | $2.00 | $0.40 | gives balloon: happiness +15 | — |
| `umbrella_stand` | Umbrella Stand | 3 | Shops | souvenir | $350 | $15 | $5.00 | $1.50 | gives umbrella: no rain penalty | rain ×3.0, sunny ×0.2 |
| `info_kiosk` | Info Kiosk | 3 | start | info | $400 | $15 | $1.00 | $0.10 | gives park map: guest is never lost | — |
| `first_aid` | First Aid | 3 | Shops | facility | $600 | $40 | $0.00 | — | nausea → 0, happiness +5 | — |
| `cash_machine` | Cash Machine | 3 | Shops | facility | $800 | $20 | $0.00 | — | guest with cash < $10 withdraws $40–$80 | — |

- A guest holds at most one balloon, one umbrella, and one map.
- Weather factors multiply the guest's chance to want the item (Phase 3).

---

## 4. Path items (Phase 3, lamps Phase 4)

| id | Name | Ph | Unlock | Build | Effect |
|---|---|---|---|---|---|
| `bench` | Bench | 3 | start | $40 | A tired guest sits for 3 s: energy +60. Calm +1 (Phase 4). |
| `bin` | Litter Bin | 3 | start | $30 | Holds 24 litter. Guests near a bin with space do not drop litter. |
| `lamp` | Path Lamp | 4 | start | $50 | Lights a radius of 3 tiles at night (After Dark). |

Each footpath tile holds one path item. Angry guests can break path items (Phase 3).

---

## 5. Staff (Phase 3)

| id | Name | Hire | Wage/mo | Walk speed | Job |
|---|---|---|---|---|---|
| `groundskeeper` | Groundskeeper | $100 | $50 | 1 tile / 12 ticks | Sweep litter, clean mess, empty bins. Water gardens (Phase 4). |
| `mechanic` | Mechanic | $150 | $80 | 1 tile / 10 ticks | Inspect rides on their interval. Fix breakdowns. |
| `security` | Security Guard | $120 | $60 | 1 tile / 10 ticks | Guests within 6 tiles do not vandalize. |
| `performer` | Performer | $120 | $55 | 1 tile / 14 ticks | Guests within 4 tiles gain happiness. Costume sets a bonus (below). |

| Costume | Mascot | Bonus |
|---|---|---|
| Frost | Friendly yeti | ×1.5 for Chill guests (temperament ≤ 35) |
| Spark | Fire fox | ×1.5 for Thrill guests (temperament ≥ 65) |
| Boo | Small ghost | ×1.5 for all guests at night or within 6 tiles of a spooky ride (Phase 4) |

---

## 6. Scenery themes (Phase 4)

Item lists, sizes, prices, and Calm/Buzz values are in `phase-4-land-scenery-after-dark.md`.

| Theme | Unlock | Mood | Example items |
|---|---|---|---|
| Base set | start | neutral | trees, shrubs, flower beds, hedges, fences, fountain |
| Classic Fair | start | family | striped tents, bunting poles, flower tubs, carved fountain, ticket arch |
| Frost Peaks | Scenery | chill | snow pines, ice arch, igloo, frozen fountain, Frost statue |
| Volcano Ridge | Scenery | thrill | lava rocks, steam vent, glowing crystals, ember torches, Spark statue |
| Spooky Hollow | Scenery | chill, spooky | bare trees, pumpkins, ghost lanterns, crooked gate, Boo statue |
| Jungle Lagoon | Scenery | chill | giant leaves, stone ruins, tropical flowers, rope bridge decor, rock waterfall |
| Starport | Scenery | thrill | rocket, satellite dish, planet globes, neon tubes, robot statue |

---

## 7. Mascots

| Name | Look | Side | Used in |
|---|---|---|---|
| Frost | Round white yeti, blue scarf | Chill | Logo, title screen, tutorial guide, Performer costume, statue |
| Spark | Small orange fire fox, flame tail | Thrill | Logo, title screen, tutorial guide, Performer costume, statue |
| Boo | Small round ghost, purple glow | Spooky | Performer costume, statue, After Dark hints |

---

## 8. Phase 6 extras (Build 3)

| Kind | Items |
|---|---|
| Flat rides | Magic Carpet (thrill), Kiddie Cars (family), Merry Mill (chill windmill ride), Gyro Globe (thrill) |
| Track rides | Inverted Coaster (thrill), Bobsled Run (thrill), Monorail (chill, multi-station transport) |
| Track pieces | Corkscrew (Steel, Inverted), helix (Steel, Bobsled) |
| Stalls | Noodle Bar (food), Smoothie Bar (drink), Photo Booth (souvenir) |
| Show sites | Lightshow Tower (`lightshow_tower`), Fireworks Launcher (`fireworks_launcher`) |

`phase-6-polish.md` §4 holds the final stats for these items. Copy them into sections 1–3 when Build 3 starts.

---

## 9. Research categories (Phase 3)

| Category | Build 1 items | Build 2 items | Build 3 items |
|---|---|---|---|
| Gentle | Bumper Cars, Rocket Rounds, Spiral Slide, Observation Tower, Mirror Maze, Haunted Manor, Ghost Train | — | Monorail, Kiddie Cars, Merry Mill |
| Thrill | Pendulum Ship, Thunder Disc, Drop Tower, Flip Arm, Go-Kart Track | — | Magic Carpet, Gyro Globe |
| Coasters | Wooden Coaster, Spinning Mouse | — | Inverted Coaster, Bobsled Run |
| Shops | Pizza Slice, Ice Cream Cart, Cocoa Hut, Balloon Stand, Umbrella Stand, First Aid, Cash Machine | — | Noodle Bar, Smoothie Bar, Photo Booth |
| Water | — | Log Flume, Rapids Raft | — |
| Scenery | — | Frost Peaks, Volcano Ridge, Spooky Hollow, Jungle Lagoon, Starport | — |

Research costs and order are in `phase-3-management.md` (Build 1), `phase-4-land-scenery-after-dark.md` (Build 2), and `phase-6-polish.md` (Build 3). Phase 6 places its items into categories; this table follows it.
