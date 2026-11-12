# Phase 8b: Predrawn pixel art (design)

- **Status:** Draft for owner approval, revision 2 (2026-11-12). Revision 2 repairs the findings of three independent reviews of revision 1 (feasibility against the code, the stage 0 evidence, player experience and project rules).
- **Replaces:** the live-drawing approach of `phase-8-pixel-art.md`, which the stage 0 result stopped (`phase-8-stage-0-report.md`). The visual rules of that spec stay where this design does not change them: hard square pixels, ink outlines, the colour ramps, the stepped zoom (sections 6 to 8 there).
- **Owner decisions so far (2026-11-12):** "Let's switch to predrawn." A large download is acceptable ("I've downloaded games with gigs on my phone"). The full art package will grow beyond the code-drawn pictures. Earlier: the final art must be much better than the code-drawn drafts.

## 0. Summary for the owner

- The game will show pictures that were drawn once, when the game is built. The phone copies finished pictures instead of drawing them.
- Predrawing fixes the slow picture builds of stage 0. It does **not** fix all the slowness: stage 0 also lost time on shadows and on enlarging every picture to the screen. This design changes those too, and the test measures both.
- The next test (stage 0b) checks **speed, memory and loading only**. Its pictures are the stage 0 pictures, with the same faults. It does **not** show better art.
- Better art comes after the test, batch by batch. Each batch replaces today's look only after you see it side by side and say it is better.
- You decide six points before the test starts (section 9).

## 1. Words

| Word | Meaning |
|---|---|
| Today's look, Classic | The art the game ships now: smooth vector drawing. |
| Pixel look | The pixel art of the approved draft. |
| Sheet | One image file that holds many small pictures side by side. |
| Index | A file that says where each picture sits on its sheet and where its anchor point is. |
| Pack | A group of sheets that download together. The **core pack** is what a new park needs. |
| Art pixel | One square of the pixel art. On screen it is enlarged to `n × n` screen pixels. |
| k | How many screen pixels of the phone make one canvas pixel. Stage 0 found that phones need k = 3 (a coarser picture than k = 2). |
| Crisp levels | The zoom steps at which every art pixel is a whole number of screen pixels. |
| Frame p95 | The frame time that 95 % of frames beat. 16.7 ms is 60 frames per second; 33.4 ms is 30. |
| Kill rule | A pass/fail rule fixed before a test. When one fires, the plan stops or changes as the rule says. |
| Scenes `phone`, `build1`, `build2` | The three saved test parks of the speed test (`tests/perf/`): 800, 2 000 and 3 000 guests. |

## 2. Goals

1. **Speed.** Remove live picture building during play, and cut the per-frame costs that stage 0 measured.
2. **Better art (the owner's requirement).** The final art must be much better than the code-drawn drafts. Pictures are plain files, so they can come from a source other than drawing code (section 8).
3. **Today's look stays until the new look is better.** No batch of pixel pictures replaces today's look before the owner approves it side by side.
4. **No change to saves.** No save field depends on the art. A save loads the same with any art.

## 3. What stage 0 showed, and what this design does about it

| Stage 0 failure | Cause (from the measures) | This design |
|---|---|---|
| Ride picture build 7 to 10 ms (limit 3) | Live drawing | Predrawn: no build during play |
| Chunk build 14.6 to 15.3 ms (limit 12) | Per-pixel ground painting | Ground laid from predrawn tile pieces (section 5.4) |
| Phone frame p95 66.6 ms at k = 2 | Canvas 1.72 times today's pixels; a full-screen shadow pass every frame; every picture enlarged | k = 3 for phones from the start; shadows baked into pictures (section 5.5) |
| Phone `build2` p95 50.0 ms at k = 3 (today 33.4) | The shadow pass draws one shadow per guest every frame | Shadows baked (section 5.5) |
| Desktop `build1` p95 33.3 ms (today 16.8) | The shadow pass and the enlarged copies | Shadows baked; measured again |
| View-turn hitch 150 to 183 ms (today 100) | Chunk builds and ride builds in the turn frame | Predrawn; chunk assembly spread over frames (section 5.4) |

Predrawing alone would leave the shadow pass. If the test still fails with the changes above, the approach stops (section 7).

## 4. Structure

```
BUILD TIME   drawing code ──► sheet tool (Vite plugin) ──► art/<pack>/<sheet>-<hash>.png + art-index-<hash>.json
FIRST VISIT  title screen at once ──► core pack downloads (progress on the title) ──► "New park" and "Continue" enabled
PLAY         numeric index lookup ──► drawImage from a decoded sheet; ground: tile pieces laid into chunk images
```

## 5. Parts

### 5.1 The sheet tool

1. **A Vite plugin** (`tools/sheets/plugin.ts`), not a step before Vite. Why: `vite build` empties `dist` first, and the release check calls `npx vite build` directly (`scripts/check-release.ts:216`), so files written before Vite are lost. The plugin loads the drawing modules through Vite's module runner (it handles extension-less imports and `import.meta.env`), and writes the sheets with `emitFile`. In `npm run dev` it serves the sheets from memory.
2. It calls `new PixelSurface(...)`, the art function, then `finish()`, and reads the pixels from the surface. It never calls `makeCanvas` or `blitTo`, which need a browser canvas.
3. It writes **indexed PNG** (palette and transparency chunks; the art has under 256 colours), with no colour-space chunks, and a fixed compression level so the same input gives the same bytes. The PNG writer of the prototype (`protoKit.ts` `writePng`, branch `phase8-stage0-proto`) is the start.
4. It removes duplicate pictures by hash and reports the count of unique pictures per pack.
5. Each sheet is at most 2048 × 2048 pixels, with a 2-pixel transparent gap between pictures (so a smoothed zoom level never picks up a neighbour). One ride in one view direction sits on one sheet.
6. The prototype branch is never merged. Each part the tool needs is copied in under review, and the prototype's shortcuts are listed and fixed before the full build (section 10).

### 5.2 The index and the picture keys

1. The index lists, for each picture, the sheet, the rectangle and the anchor point.
2. At load the game turns the index into numeric tables. No string is built per object per frame.
3. The key fields per kind follow today's sprite keys (`src/render/sprites/bank.ts`, `src/render/sprites/staff.ts`, `src/render/scenery/sprites.ts`, `src/render/anim.ts`):

| Kind | Key fields | Pictures (estimate) |
|---|---|---|
| Flat rides (18) | ride, view (4), frame (angle × occupancy; the swing tower also swing) | about 13 000 to 14 000 full; phones use the coarse set (16 angles × 3 occupancy) |
| Guests | shirt (12) or temperament step (9), walk/sit (4), look (4), item (4), facing (4) | 5 376 |
| Staff | type, costume, walk, action, facing | at most 1 024 |
| Scenery (85) | item, view, wilted, part (arch back/front), edge side | about 700 |
| Stalls (14), path items, litter, mess, fence, entrance, show sites | as today's keys | about 250 |
| Ground pieces | terrain, slope shape (16), owned/outside, view, variant; path and queue joins; face steps; water | about 1 000 to 3 000 |
| **Total** | | **about 21 000 to 23 000** |

### 5.3 Loading, offline and updates

1. **Title first.** The title screen draws its own pictures from data in the code, so it shows at once. A progress line on the title shows the core pack download. "New park", "Continue" and "Load" are enabled when the pictures they need are ready. Settings, language and Offline play work at once. (Owner decision D4.)
2. **Packs needed by a save.** Before a park starts from a save, the autosave, an import, a scenario or the tutorial, the loader reads the ride and object ids in it and loads their packs behind the same progress line. On a failure it shows the error with **Retry**. It never draws a park with holes.
3. **Background packs.** After the core pack, the other packs download in the background. A card whose pictures are not ready shows a mark and cannot be placed; pressing it says why. When the phone is offline the reason reads "Needs a connection", and the loader retries on the browser's `online` event.
4. **Art cache that survives updates.** Today the service worker keeps one cache per build and downloads every file again at each release (`public/sw.js:16-18, 32-69`; `scripts/sw-manifest-plugin.ts:76-78`). Art gets its own cache `tc-art`, kept across builds and keyed by the content hash in each file name. The code precache leaves the art out. On each update only sheets with new hashes download; a sheet is deleted only when no current index lists it. One failed sheet does not cancel offline play of the code. Acceptance test: after a code-only release, the update downloads 0 bytes of art.
5. **One download.** The loader writes into `tc-art`; the worker reads from it. The first visit downloads each sheet once.
6. **Old build after a deploy.** If an art file returns 404 (the player kept an old build with "Later"), the game shows the "Update ready" toast and keeps Reload enabled.
7. **Offline play off.** The loader still keeps `tc-art` (it is the art store, not the offline feature), so a player with Offline play off does not download the art on every visit.
8. **Storage.** After the first park, the game asks the browser for persistent storage. A storage-full error shows a message with the size needed. On iPhone, Safari can delete a website's storage after about 7 days without use unless the game is on the home screen; the game then downloads the art again, and the README says so.
9. **Decoding and memory.** Sheets stay compressed until needed. The game decodes the sheets in use into a least-recently-used set with a byte budget per device class (`ART_DECODED_MAX_MB`: phone 48 MB, desktop 192 MB; provisional). Phones use the coarse frame set. The loader draws each core sheet once behind the progress line, so the first frame of play does not wait for decoding.

### 5.4 Ground

1. The ground of each chunk (8 × 8 tiles) is laid from predrawn tile pieces into one chunk image: terrain tops by slope shape, path and queue joins, cliff and edge faces stacked per height step, water.
2. Grass gets N variants per terrain (N = 4, provisional), picked by a hash of the tile position. The stage 0 grass noise cannot be cut into tile pieces, so the predrawn ground looks different from stage 0. The owner judges the ground in the test pictures.
3. Chunk assembly is spread over frames with a time budget per frame, as the first-build rule of today's terrain does (`FIRST_BUILD_BUDGET_MS`, `src/render/terrain.ts:407`), so a view turn does not assemble every chunk in one frame.

### 5.5 Shadows

1. The shadows of rides, stalls and scenery are drawn into the ground chunk image under them when the chunk is assembled, in palette colours. A placed or removed object rebuilds the chunks it touches.
2. Each guest and staff picture holds its own small shadow in palette pixels.
3. There is no full-screen shadow pass during play. Why: stage 0 measured it as one of the main per-frame costs.

### 5.6 Colour changes

1. **Placement ghosts** (valid and invalid) and the 12 track and car colours: a palette swap per picture, done once and cached. It keeps every colour on the palette, so the colour-blind check of `phase-8-pixel-art.md` §6 still covers the signal colours. No canvas `filter` (off-palette, and limited on Safari).
2. **Temperament shirts and rings** are predrawn frames (they change the shirt, not a wash).

### 5.7 Track rides, cars and elevated paths

Players build these piece by piece in any shape, and the car poses run to over a million combinations (`src/render/track/layer.ts:313, 846`). They cannot be predrawn whole.
1. **Rails and supports** are predrawn as parts: one picture per piece, tile of the piece, direction and view, in one neutral colour; supports as stacked segments per height step. The 12 colours come from the palette swap of 5.6.
2. **Cars** are predrawn for each shape at 16 yaw steps and the pitch steps the tracks use, in neutral colour, recoloured by the palette swap. Roll is drawn live as today. Riders, chain marks and water ripples stay live.
3. **Elevated paths** use predrawn deck and support segments.
4. Stage 0b includes one coaster and its cars to measure this (section 6).

## 6. Stage 0b: the test

A throwaway worktree, as stage 0. It answers one question: with predrawn pictures, baked shadows and k = 3 for phones, does the game meet the speed and memory limits on the slow phone, and how long does the first load take?

**What the owner will see:** the stage 0 pictures, with their faults (flat purple haunted house, yellow grass, heavy shadows replaced by baked ones, 17 rides in today's shapes), and a different ground (section 5.4). The test does not judge the look.

**Scope:** every object of the three speed-test parks (`tests/perf/scenes.ts`: all 18 flat rides, the stalls, the scenery, guests, staff, path items, the mini railway and its cars), and the ground cases in them (raised tiles and faces, paths, queues). Why: the speed rules run on those parks; an object outside the scope would still draw live and make the result false.

**Measures.** Each measure runs on the phone profile at CPU throttle 4 and on desktop, with the load gate and the repeat rule of the stage 0 plan (`docs/superpowers/plans/2026-11-11-phase-8-stage-0-prototype.md`). Each frame value is the median of 3 runs. Each value is reported next to today's look in the same session. Work p95 and render p95 are reported too, because frame p95 moves in steps of one frame.

**Kill rules (fixed before the test):**

| # | Condition | Result |
|---|---|---|
| B1 | A predrawn object picture differs from the stage 0 surface output for the same key (pixel compare of the index entries; every alpha 0 or 255). The ground is not compared (section 5.4). | Repair the tool once, then repeat. A second failure stops the test for an owner decision. |
| B2 | Phone at k = 3, `scene phone` or `scene build2`: frame p95 above 40 ms and above today's frame p95 of the same session plus one frame step. | Stop. |
| B3 | Phone: a cold ground chunk assembly above 12 ms; or the longest frame in the first second after a view turn (the `turns: longest frame` value of the speed test, 2 turns, median of 3 runs) above 100 ms and above today's value plus one frame step. | Stop. This turn rule is now a stop rule (it stopped nothing in stage 0): owner decision D6. |
| B4 | Desktop `scene build1` or `scene build2`: frame p95 above 20 ms. | Stop. |
| B5 | First visit, phone profile, CPU throttle 4, network 1.6 Mbit/s down, 750 kbit/s up, 150 ms latency (set through the browser's network emulation): time from the page start to the first park frame drawn with every core sheet, above `ART_LOAD_MAX_S` (8 s, provisional). | The owner decides (a smaller core pack, a smaller art scale, or a longer limit). |
| B6 | Decoded art memory on `scene phone` above `ART_DECODED_MAX_MB` (48 MB), counted as width × height × 4 of every decoded sheet. | Stop, or fewer frames for phones (owner decision). |
| B7 | Today's look changes (the recorder tests and the `classic-ops` compare of stage 0). | Repair, then repeat. B7 holds until the owner approves the removal of today's look. |
| B8 | A code-only rebuild downloads any art bytes on update. | Repair, then repeat. |

The report also gives: the total size of all packs, the unique picture count, the decode time, and which drawing path the test browser used (graphics chip or software). Headless Chromium cannot show phone graphics-chip limits; the report says so. If possible, one run on a real mid-range Android phone.

**Owner gate:** the owner sees the numbers, the loading on the title screen, and the phone at k = 3 (the picture phones will really get). The full build starts only after the owner says yes.

## 7. After stage 0b (outline)

1. **Art source and format** (owner decisions D1 and D2). An art brief: art scale, palette file, anchor rule, frame list per object, transparent background, light from the upper left. The index check then tests size, anchor and palette of every picture, not only that it exists.
2. **Batches.** Each batch (for example the 18 flat rides) is made, then shown to the owner side by side with today's look. It ships only after the owner says it is better.
3. **Today's look** stays the default, and the fallback, until the owner approves the pixel look for all objects (owner decision D3). Then its live drawing code is removed.

## 8. Originality and provenance

1. Master rule §1.3 says "All graphics are drawn in code" (`docs/superpowers/specs/2026-11-09-thrills-and-chills-design.md:39`), and the README says the same. Hand-made pictures need a change of that rule (owner decision D1). Until then, all art stays drawn in code.
2. If the owner allows hand-made art: source sheets live in one tracked folder (`art/source/`), which the release check then allows. A file `art/PROVENANCE.md` has one row per sheet: author, tool, date, licence or grant. The release check fails a sheet with no row. No picture is traced, copied or generated from another game's art.
3. AI image tools are not allowed until the owner decides (D2).
4. Art from an outside artist needs a written grant, and the project needs a licence first (master open decision 2).

## 9. Owner decisions before the test

| # | Decision | Proposal |
|---|---|---|
| D1 | May the final art be made by hand (by a person), not only by drawing code? This changes master rule §1.3. | Yes, with the provenance rule of section 8 |
| D2 | May AI image tools make art? | No, until decided separately |
| D3 | Does today's look stay as an option or a fallback, and when is it removed? | It stays as the default and the fallback until the owner approves the pixel look for every object |
| D4 | Does the game show the title at once, with the download on the title (a), or a loading screen before the title (b)? | (a) |
| D5 | Does the first visit show the download size, and may a player on mobile data choose "core pack only"? | Show the size; background packs wait for Wi-Fi only if the player chooses |
| D6 | The view-turn limit (100 ms) becomes a stop rule in stage 0b. | Yes, with the "worse than today" condition of B3 |

Also open: the values `ART_LOAD_MAX_S`, `ART_DECODED_MAX_MB` and `ART_GROWTH_WARN`, and the content of the core pack (proposal: everything the tutorial and any scenario places or offers at month 0). Stage 0b may start before the owner accepts Build 4; it runs in a separate worktree and changes nothing in the game.

## 10. Rules and documents that change

| Rule today | New rule |
|---|---|
| First load ≤ 400 KB gzip of JS and CSS (`scripts/check-release.ts:29`) | Stays for JS and CSS, plus the index. Art has no fixed total size. The core pack meets B5. A release that grows the art by more than `ART_GROWTH_WARN` (25 %, provisional) over the art size recorded for the last release in `CHANGELOG.md` prints a warning. |
| Image files only for icons and screenshots (tracked files, `check-release.ts:37-39`) | Generated sheets are not tracked, so they need no change. New check: every file under `dist/art/` is listed in the index, and every index entry has its file. Tracked hand-made art only after D1 (section 8). |
| Hosting: GitHub Pages, whole `dist` | Pages sites are limited to about 1 GB. The release check warns above 500 MB of art; a larger package needs another host (owner decision when it comes). |
| Accessibility | The progress line has `role="progressbar"` and a name; the end of loading and errors use a polite live region; nothing animates with reduced motion; the layout holds at 175 % text and in `en-XA`; Retry is at least 44 × 44 px; a card that is not ready has `aria-disabled` and says why; every text comes from `src/data/strings/`. These states join the axe, 175 % and reduced-motion e2e checks. |
| `index.html` "Loading…" text | Replaced by the title-screen progress line (D4). |

Documents to update when the full build starts: the master build table (§3), the README originality statement (after D1) and "Offline play" section, the CHANGELOG (art size per release), `tsconfig.json` `include` (adds `tools/`). Prototype shortcuts to fix before the full build (stage 0 report §6): ghosts untinted, slopes and water untested, 115 colours checked by no person, guest items and sit frame missing, staff anchors not snapped.
