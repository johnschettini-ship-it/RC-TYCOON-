# Phase 8c: Realistic predrawn art (design)

- **Status:** Approved by the owner on 2026-11-13 ("Accept all"): revision 1, decisions F1 to F10 as proposed in section 10. Next: the stage 1 plan (section 6).
- **Build:** Build 5.
- **Replaces:** the pixel style of `phase-8b-predrawn-art.md` (stopped by the owner on 2026-11-12: "Art needs a better polish"). It keeps 8b's delivery design where this document does not change it: the app wrapper and the website demo (8b §5.3 items 1 to 7, 9 and 10), the round 2 decisions E1 to E10 (8b §11), "today's look stays until the new look is approved" (8b §2 goal 3, decision D3), "no change to saves" (8b §2 goal 4), and the batch approval rule (D9).
- **Owner direction:** "let's go back to more real life concepts" (2026-11-13); on the realistic concepts of round 7: "Looks good"; then "Proceed to write the spec" after the phone test passed.
- **Evidence:** concept rounds 6 and 7 (`docs/research/art/realistic/`, pictures `docs/screenshots/concept-real-*.png`) and the phone test (`docs/research/art/realistic/phone-test/`, owner results 1 to 4).

## 0. Summary for the owner

- The park is built as 3D models **in code** (no downloaded models or textures), like rounds 6 and 7. When the game is built, a computer takes pictures of every model from the game camera, for each of the four turns. During play the phone only copies finished pictures. This is the method the phone test proved.
- Your phone passed with the method of result 4: 60 frames per second with up to 1,000 guests, about 93 MB of pictures in memory, turns in 35 ms. That was one phone and a small park.
- A full park has many more rides than the test park. So the game unpacks only the pictures of things that are **built in the park and near the screen**, for the current turn and the next one. Everything else stays compressed.
- Player choices that change colours (ride colours, guest shirts) are made by tinting marked parts of a picture when it is unpacked, not by storing one picture per colour.
- Before the full build, one more test (stage 1) runs the method **inside the real game** with real parks: the three speed-test parks, one coaster type, a few flat rides, guests, ground. It runs on your phone, an older Android and an iPhone.
- You decide 10 points (section 10). The biggest: the memory limit on phones (F2), the picture scale (F1), and whether heights get real proportions on screen (F3).

## 1. Words

| Word | Meaning |
|---|---|
| Today's look | The art the game ships now (vector drawing). |
| Realistic look | The art of this design: pictures taken of 3D models, as in concept T ("Daylight real"). |
| Kit | The code that builds the 3D models, materials and procedural textures (from `docs/research/art/realistic/tools/`). |
| Bake | Taking the pictures: the kit's models rendered with three.js in headless Chromium, with the game camera, at build time. |
| Density | Picture pixels per metre. The game today draws 11.3 screen px per metre at zoom 1 (`TILE_W` 64 px for `TILE_M` 4 m). |
| Set | A group of pictures that load and unload together, keyed by kind, item, density and turn. |
| Compressed / decoded | A WebP file as shipped, and the same picture unpacked for drawing (width × height × 4 bytes). |
| Decode budget | The most decoded picture memory the game may hold at once (F2). |
| Ahead set | The set of the turn the Turn button goes to next, decoded before the player taps. |
| Tint mask | A second small picture that marks which pixels take a player colour (track, car, shirt), and how strongly. |
| Frame p95, work p95 | As in 8b §1. |

## 2. Goals

1. **The look of concept T, at phone size.** True colours, soft sun shadows, readable guests and rides at the game's zoom levels.
2. **Speed and memory proven on phones.** No 3D drawing during play. Decoded memory under the decode budget in the biggest speed-test park.
3. **Today's look stays until the new look is approved** (8b goal 3, D3).
4. **No change to saves.** No save field depends on the art.
5. **All art made by code.** Master rule §1.3 ("All graphics are drawn in code") stays true: models and textures are code; the bake turns them into pictures.

## 3. What the evidence shows

| Finding | Source | This design |
|---|---|---|
| Drawing finished pictures is cheap: draw time p95 0.7 to 3.4 ms with up to 1,000 guests | phone results 1 to 4 | Canvas 2D `drawImage` from decoded sheets, as the test |
| Loading every picture at once: 213 MB | result 1 | Load by set (§5.4) |
| Objects of all turns in shared pages kept 87 MB in memory | result 2 | Sets are cut by turn |
| A turn that waits for a download takes up to 6.7 s | result 3 | All compressed files are inside the app; nothing downloads during play |
| Turn with the ahead set decoded: 34 to 35 ms; decoding one turn: 89 to 147 ms | result 4 | Ahead set for the Turn button's direction (F4 for the other one) |
| Small guests are hard to read below about 30 CSS px | rounds 6 and 7 | Density and zoom rules (§5.2, F1) |
| City buildings cost about 5 MB each, more than a ride | round 7 | Big scenery is cut into tiling pieces (§5.6) |
| Guests close up look like jointed dolls | round 7 close-up | Guest model work in stage 1 (§5.8); judged at the game's largest zoom, not close-up |

## 4. Structure

```
BUILD TIME   kit (3D models in code) ──► bake (three.js, headless Chromium) ──► art/<kind>/<set>-<hash>.webp + one index
             a content hash per model skips unchanged models, so a small change does not re-bake everything
APP          Capacitor wraps the game; every art file ships inside the app (8b §5.3)
APP START    title at once ──► read the index ──► decode the sets of the opened park's view ──► play
PLAY         per frame: drawImage from decoded sheets; ground chunks laid from ground pieces;
             the set manager decodes and frees sets as the view, the turn and the park change
WEBSITE      demo in today's look, no art files (E2)
```

## 5. Parts

### 5.1 The kit

1. The kit moves from `docs/research/art/realistic/tools/` to `tools/art3d/` under review, part by part, as 8b did with the stage 0 prototype. three.js stays vendored at a fixed version with its MIT licence; it is a **build tool**, not shipped in the game.
2. One module per item: each ride type, stall, scenery item, path item, guest body, staff type, ground piece and track piece. Each module exports a function that builds the model, plus its pivot, footprint and height in metres from the game's catalogue (`src/data/catalog/`), so the art cannot drift from the game data.
3. Textures stay procedural (canvas code), as in rounds 6 and 7. No downloaded models, textures, HDR images or fonts. Sign text uses a vendored font with its licence (the project already ships Fredoka).
4. Lighting is fixed for every bake: one sun from the upper left (52° high), sky light, the round 6 colour grade and ambient occlusion. The sun turns with the camera, so shadows always fall the same way on screen.

### 5.2 Camera, scale and densities

1. **Projection.** The bake uses the game's own projection: a tile is a 2:1 diamond, `TILE_M` 4 m wide. Horizontal scale 11.3 px per metre at game zoom 1.
2. **Height scale (F3).** Today the game draws 8 px per metre of height (`STEP_PX`), less than a true 30° camera (9.8 px per metre). Proposal: the realistic look uses true proportions (9.8 px per metre) in its own drawing and picking code; the simulation does not change. Today's look keeps 8 px.
3. **Densities (F1).** Proposal: two baked densities, 22.6 and 45.2 px per metre (game zoom 1 and 2 on a screen of device ratio 2). The game picks the smallest density at or above what the screen needs (zoom × device ratio × 11.3), and draws it scaled down. Zoom 0.5 and below draws the 22.6 set at a quarter size or less. A phone at device ratio 2.6 at zoom 2 draws the 45.2 set enlarged 1.3 times (soft but readable), unless F1 adds a third density.
4. At game zoom 2 an adult guest is about 34 CSS px tall (true proportions). The phone test drew 37 CSS px guests from a 49 px per metre set, close to the 45.2 density, so its memory numbers are a fair guide for this density (for the test park only).

### 5.3 Pictures per kind (estimates; the bake prints true counts)

| Kind | What is baked | Notes |
|---|---|---|
| Flat rides | Each ride, 4 turns, animation frames over one symmetry period, occupancy steps | Round rides need one turn set only (the carousel test: 16 frames over 72°). Frames per ride follow `src/render/anim.ts` (phone uses the coarse set) |
| Track rides | Rails per track type × piece × tile of the piece × turn; supports per height step; cars per reached pose (yaw, pitch, roll) | As 8b §5.7. Cars are baked with riders seated and empty (F7) |
| Stalls, path items, scenery | Each item × turn; big items cut into tiling pieces (§5.6) | Wilted and lit variants where the game has them |
| Guests | Body types × outfits × 8 facings × walk frames, plus sit, eat, wave, queue | Shirt colour by tint mask (§5.7); temperament ring drawn live as today |
| Staff | Each type × costume × facings × walk and work frames | |
| Ground | Terrain tops by slope shape (16), cliff faces per height step, path and queue joins, water and shore, per turn | Laid into chunk images at play time (§5.5) |
| Shadows | One soft shadow picture per object and turn | Drawn after the ground (§5.5) |

### 5.4 Loading by set

1. **Inside the app.** Every compressed file ships in the app (8b §5.3 item 4). Reading a file never waits on a network.
2. **What is decoded.** The set manager keeps decoded only the sets of (a) item kinds that exist in the open park, (b) the current density, (c) the current turn and the ahead set, and (d) objects inside the view plus a margin of one screen. Guests and ground pieces are always decoded for the current turn.
3. **Turns.** On a turn the game shows the new turn as soon as its sets are decoded (instant when the ahead set is ready), then frees the old turn's sets and decodes the new ahead set off the main thread (`createImageBitmap`). While a set decodes, its objects keep their last picture or a soft placeholder (the shadow), and the frame counts as incomplete.
4. **Budget.** The decode budget (F2) holds decoded sheets, tinted sheets, chunk images and the static layer, as 8b §5.3 item 8. When a park would pass it, the set manager lowers the density of the farthest objects first, then drops the ahead set, then shows the lower density everywhere. It never stops drawing an object.
5. **Sheets.** At most 2048 × 2048 px each; one item per sheet where possible, so a sheet follows one object. Placement ghosts use the decoded sets of the item, tinted.

### 5.5 Ground, shadows and night

1. **Ground.** As 8b §5.4: each 8 × 8 tile chunk is laid at play time from baked ground pieces (terrain variants picked by a hash of the tile position). Ground textures tile across piece edges by design.
2. **Shadows.** Objects are placed by the player, so their shadows cannot be baked into the ground. Each object has a soft shadow picture (alpha) per turn, drawn after the ground and before the depth-sorted objects, one `drawImage` each. Ambient occlusion where an object meets the ground is part of its shadow picture. Guests carry their own small shadow in their pictures.
3. **Night (F8).** Proposal: night is a colour grade over the whole frame (one fill with a blend mode), plus baked light pictures (lamp pools, bulb rings, lit windows) drawn on top with additive blending, as concept V. No second set of object pictures.

### 5.6 Depth order and big objects

1. Objects sort by the depth of their ground anchor, as today. A large object (a coaster station, a big building) is cut into columns along its depth, as the phone test cut the coaster into 6 m columns, so guests and other objects sort correctly beside it.
2. Big scenery and buildings are made from tiling pieces (wall, window bay, corner, roof) baked once and placed per tile. This keeps round 7's 5 MB buildings to a few pieces.

### 5.7 Colour changes

1. **Tint masks.** A track, car, support or shirt picture has a mask picture beside it. At decode time the game tints the marked pixels to the player's colour and stores the result as its own decoded sheet. One tint per (sheet, colour), counted in the budget.
2. Ride colour schemes from the catalogue and the player's choices use this method. Placement ghosts use it with the ghost colours.
3. The colour-blind check of `phase-8-pixel-art.md` §6 covers the tinted results.

### 5.8 Guests and staff

1. The round 7 guest model is the start: faces, hair, clothes, children and adults. Stage 1 improves the joints (no visible elbow and knee balls) and judges guests at game zoom 2 on a phone, not in close-up.
2. **Variety (F6).** Proposal: 4 body types (man, woman, child, older adult) × 8 outfits each, with the shirt tinted (12 colours today, `src/render/sprites/bank.ts`). Hair and skin vary by outfit bake.
3. Costumes for created mascots are guest and staff outfits (owner decision T5, `ride-decisions-2026-11-12.md`).

### 5.9 Theme and mascot maker

1. The maker (T1 to T5) builds a mascot from a parts kit (head, body, colours, accessories). Players make mascots during play, so a mascot cannot be baked at build time as a whole.
2. **Proposal (F9):** the parts are baked one by one (each head, body and accessory, per facing and frame) and stacked at play time, with their colours tinted by mask. A created mascot's stacked pictures are drawn once into its own small sheet when the mascot is made.

## 6. Stage 1: the test inside the game

A separate branch, as stage 0b. It answers one question: with this method inside the real game, do real parks meet the limits on real phones?

**Scope.**
- The bake pipeline in `tools/art3d/`: ground pieces, shadows, guests (2 body types, 4 outfits, tint masks), 3 flat rides (one round, one swinging, one large), one steel coaster type with lift, drop, curves and supports, one stall, 10 scenery items, one building from pieces.
- The set manager (§5.4) and the realistic drawing path behind the art switch (`?art=real`), today's look untouched.
- The three speed-test parks (`tests/perf/scenes.ts`) with their objects mapped to the baked items (missing items use the nearest baked one, and the report lists them).

**Where it runs.** The owner's phone (Android 10, the phone of results 1 to 4), one older Android phone, and one iPhone (Safari engine). A benchmark page like the phone test, plus the in-game benchmark runner. Headless numbers are for code checks only.

**Kill rules (fixed before the test).**

| # | Condition | Result |
|---|---|---|
| S1 | Phone, `build2` park (3,000 guests): frame p95 above 33 ms | Stop, or fewer guests drawn far away (owner decision) |
| S2 | Phone: peak decoded memory above the decode budget (F2) in any of the three parks, over a run with 4 turns, zoom in and out, and 20 placements | Stop, or lower density (owner decision) |
| S3 | Phone: a turn in the Turn button's direction above 250 ms; a turn the other way above 500 ms | Repair once, then owner decision |
| S4 | App start to the first complete park frame on the owner's phone above 4 s | Owner decision |
| S5 | App size (all art) above 150 MB | Owner decision (lower densities, fewer frames) |
| S6 | Today's look changes (recorder tests, `classic-ops`) | Repair, then repeat |
| S7 | The website build changes (8b B8) | Repair, then repeat |
| S8 | A full bake on the build computer above 60 minutes with a warm cache for an unchanged model set, or above 4 hours cold | Owner decision (bake on a faster machine, or fewer frames) |

**Owner gate:** the owner sees the numbers from the three phones and plays the parks on their own phone. The full build starts only after the owner says yes.

## 7. After stage 1 (outline)

1. **Batches**, as 8b §7: each batch (for example all flat rides) is baked, then shown to the owner side by side with today's look; approved batches ship together (D9).
2. **Today's look** follows D3 in the app; the website keeps it (E2).
3. The art switch (`?art=`, `VITE_ART`) holds both looks until the owner approves the removal of today's look from the app.

## 8. Originality and provenance

1. Every model, texture and light is made by code in this project. No model, texture or picture is downloaded, traced or generated from another game's art. The look must not copy any existing game.
2. three.js (MIT) is a vendored build tool, listed with its licence. It is not in the game's runtime files.
3. AI image tools are not used (8b D2 stays "decide later; until then no").

## 9. Rules and documents that change

| Rule today | New rule |
|---|---|
| Master §1.3: all graphics drawn in code | Stays true. The README adds: "pictures are rendered at build time from 3D models made in code". |
| Image files only for icons and screenshots (tracked files) | Stays: baked art is not tracked; it is built. The app pass checks that every file under `dist-app/art/` is in the index, and the reverse (8b §10). |
| Build time | The app build includes the bake. A content-hash cache keeps rebuilds short (S8). |
| 8b art rules (§5.8, pixel ramps and outlines) | Replaced by a realistic rule table: sun direction and height, colour grade, minimum guest height on screen, contrast of paths against grass, no pure black or white, one accent colour for selectable things. |
| 8b decode budget 64 MB (D11) | Replaced by F2. |

## 10. Owner decisions (round 3): decided 2026-11-13, every row as proposed

| # | Question | Options and what they mean for players | Proposal |
|---|---|---|---|
| F1 | Picture densities | (a) Two densities (22.6 and 45.2 px per metre): sharp on most phones; slightly soft at full zoom on very dense screens. (b) Three densities (add 67.8): sharp everywhere; about twice the app size and more memory at full zoom. | (a) |
| F2 | Decode budget on phones | (a) 128 MB: the test peaked at 93 MB for a small park; a big park gets lower density far away. (b) 96 MB: safer on older phones; big parks look softer sooner. (c) 192 MB: sharper big parks; risk of the phone closing the app on older phones. | (a), checked on the older phone in stage 1 |
| F3 | Height on screen | (a) True proportions in the realistic look (9.8 px per metre): coasters look about 22 % taller than today. (b) Keep today's 8 px per metre: the models are squashed in height to match; people look slightly squat. | (a) |
| F4 | Turns the other way (hold the Turn button) | (a) Decode on the spot: about 0.1 to 0.15 s pause on your phone. (b) Decode both neighbouring turns ahead: instant both ways, about 35 MB more memory in the test park. | (a) |
| F5 | Tablets | (a) Same as phones (8b decision). (b) Tablets get a higher budget and density. | (a) |
| F6 | Guest variety | (a) 4 body types × 8 outfits, shirt tinted. (b) 2 body types × 6 outfits: less memory, more look-alike crowds. | (a) |
| F7 | Riders in track cars | (a) Cars baked full and empty: riders sit correctly in every pose. (b) Cars empty, riders drawn live as today: less memory, riders look flatter than the cars. | (a) |
| F8 | Night | (a) Colour grade plus baked lights (concept V). (b) No night in the realistic look at first. | (a) |
| F9 | Mascot maker pictures | (a) Parts baked, stacked when a mascot is made (§5.9). (b) A fixed set of baked mascots to choose from and recolour. | (a) |
| F10 | Stage 1 before the full build | (a) Yes, on three phones (yours, an older Android, an iPhone). (b) Skip and build directly: faster, but a failure shows up later and costs more. | (a) |
