# Phase 8b: Predrawn pixel art (design)

- **Status:** Draft for owner approval, revision 3 (2026-11-12). Revision 2 repaired three independent reviews of revision 1. Revision 3 repairs the re-reviews of revision 2 (feasibility, speed and memory, player experience and rules).
- **Build:** Build 5.
- **Replaces:** the live-drawing approach of `phase-8-pixel-art.md`, stopped by the stage 0 result (`phase-8-stage-0-report.md`). The visual rules of that spec stay where this design does not change them: hard square pixels, ink outlines, the colour ramps, the stepped zoom with the soft far overview (its sections 6 to 8, owner decisions 1 and 2).
- **Owner decisions so far (2026-11-12):** "Let's switch to predrawn." A large download is acceptable ("I've downloaded games with gigs on my phone"). The full art package will grow beyond the code-drawn pictures. Earlier: the final art must be much better than the code-drawn drafts.

## 0. Summary for the owner

- The game will show pictures drawn once, when the game is built. During play the phone copies finished pictures. Only riders on track rides, chain marks and water ripples stay drawn live, as today.
- Stage 0 was slow for two reasons: building pictures live, and extra work every frame (a full-screen shadow layer, and a sharper phone picture). This design removes the first and changes the second: shadows become small predrawn pictures, and phones use the coarser setting k = 3.
- The next test (stage 0b) checks **speed, memory and loading only**. Its pictures are the stage 0 pictures with their faults, plus a new ground and new shadows. It does **not** show better art.
- Better art comes after the test, batch by batch, and replaces today's look only after you approve it side by side.
- You decide 11 points before the test (section 9). Each has its options and what they mean for players.

## 1. Words

| Word | Meaning |
|---|---|
| Today's look, Classic | The art the game ships now: smooth vector drawing. |
| Pixel look | Hard-pixel art in the style of the approved draft. The final pictures must be much better than the drafts. |
| Sheet | One image file that holds many small pictures side by side. |
| Index | A file that says where each picture sits on its sheet and where its anchor point is. |
| Pack | A group of sheets that download together. The **core pack** is what a new park needs. |
| Art pixel | One square of the pixel art. On screen it is enlarged to `n × n` canvas pixels. |
| k | How many phone screen pixels make one canvas pixel. Stage 0 found that phones need k = 3 (coarser than k = 2). |
| Crisp levels | Zoom steps at which every art pixel is a whole number of canvas pixels. |
| Frame p95 | The frame time that 95 % of frames beat. One frame step is 16.7 ms (60 per second); 33.4 ms is 30 per second. |
| Work p95, render p95 | The time of the game's own code, and of its drawing calls, per frame (95 % beat it). They are not in frame steps, so they show small changes. |
| Kill rule | A pass/fail rule fixed before a test. When one fires, the plan stops or changes as the rule says. |
| Load gate, repeat rule | From the stage 0 plan: a timing run starts only when the machine is quiet; a run that fires a rule is repeated once. In stage 0b the median of 3 runs replaces the repeat. |
| Recorder tests, `classic-ops` | Tests that record every drawing call of today's look and compare it with the last release, so today's look cannot change by accident. |
| Palette swap | Changing the colours of a picture by changing its colour table before it is decoded. Every colour stays on the palette. |
| Decoded memory | A compressed picture file must be unpacked (decoded) before it can be drawn. Decoded pictures take width × height × 4 bytes. |
| Speed-test parks | `phone`: 800 guests, flat grass, the four start flat rides, 10 mini-railway loops. `build1`: 2 000 guests, the same kind of park. `build2`: 3 000 guests on a 128 × 128 map with 24 rides, 24 stalls, 60 scenery items, 2 show sites, a pond and raised ground. (`tests/perf/scenes.ts`) |

## 2. Goals

1. **Speed.** No live picture building during play, and the per-frame costs that stage 0 measured cut.
2. **Better art (the owner's requirement).** The final art must be much better than the code-drawn drafts. Pictures are plain files, so they can come from another source than drawing code (section 8).
3. **Today's look stays until the new look is approved.** No pixel picture replaces today's look before the owner approves it side by side.
4. **No change to saves.** No save field depends on the art. A save loads the same with any art.

## 3. What stage 0 showed, and what this design does about it

| Stage 0 failure | Cause (from the measures) | This design |
|---|---|---|
| Ride picture build 7 to 10 ms (limit 3) | Live drawing | Predrawn: no build during play |
| Chunk build 14.6 to 15.3 ms (limit 12) | Per-pixel ground painting | Ground laid from predrawn tile pieces (5.4) |
| Phone frame p95 66.6 ms at k = 2 | Canvas 1.72 times today's pixels; a full-screen shadow layer every frame | k = 3 for phones; shadows as predrawn pictures, no full-screen layer (5.5) |
| Phone `build2` p95 50.0 ms at k = 3 (today 33.4) | The shadow layer drew one shadow per guest every frame | The same |
| Desktop `build1` p95 33.3 ms (today 16.8) | The shadow layer, and every picture copied enlarged two times | The same; if B4 still fires: desktop sheets drawn pre-enlarged (two times the size per side, inside the desktop memory budget) |
| View-turn hitch 150 to 183 ms (today 100) | Ride, stall and guest picture builds and the static layer in the turn frame (chunks were already spread over frames by `FIRST_BUILD_BUDGET_MS`, `src/render/terrain.ts:400-407`) | Predrawn; neighbouring views prefetched (5.3 item 10) |

If the test still fails with these changes, the approach stops (section 6).

## 4. Structure

```
BUILD TIME   drawing code ──► sheet tool (Vite plugin) ──► art/<pack>/<sheet>-<hash>.png + one index per pack
FIRST VISIT  title screen at once ──► core pack downloads (progress on the title) ──► the park opens when its pictures are ready
PLAY         numeric index lookup ──► drawImage from a decoded sheet; ground: tile pieces laid into chunk images
```

## 5. Parts

### 5.1 The sheet tool

1. **A Vite plugin** (`tools/sheets/plugin.ts`). Why not a step before Vite: `vite build` empties `dist` first, and the release check calls `npx vite build` directly (`scripts/check-release.ts:216`). The plugin loads one entry module through Vite's module runner (`runnerImport`, with `configFile: false` so it does not load itself again). The entry module imports the surface and the art functions together, so the surface type check (`isPixelSurface`, an `instanceof`) sees one copy. It writes the sheets with `emitFile`. In `npm run dev` it serves them from memory.
2. It calls `new PixelSurface(...)`, the art function, then `finish()`, and reads the pixels from the surface. It never calls `makeCanvas` or `blitTo`, which need a browser canvas.
3. It writes **indexed PNG** (palette and transparency chunks), with no colour-space chunks. Each sheet's file name holds a hash of its palette and pixel data, not of the PNG bytes, so a change of the compression library does not change the names.
4. It removes duplicate pictures by hash and prints the unique picture count and the size per pack and per kind.
5. **Packing.** At most 2048 × 2048 pixels per sheet, a 2-pixel transparent gap between pictures. A ride in one view never shares a sheet with another ride, and may span several sheets. The phone frame set (the coarse frames of `src/render/anim.ts:66-75`) has its own sheets, so a phone never downloads or decodes frames it does not show.
6. **Hand-made sheets** (only after decision D1): when `art/source/<sheet>.png` exists and has a row in `art/PROVENANCE.md`, the tool takes it in place of the generated sheet, after the format check of 7.1.
7. A disk cache keyed by a hash of the tool's inputs keeps the build and the dev start fast.
8. The prototype branch `phase8-stage0-proto` is never merged. Each part the tool needs is copied in under review; the prototype's shortcuts are fixed before the full build (section 10).

### 5.2 The index and the picture keys

1. One index per pack, in a compact binary form. The plugin gives the bundle the URL and hash of each index (a virtual module). At load the game turns the index into numeric tables; no string is built per object per frame.
2. The core index downloads with the core pack and counts in the loading time (B5), not in the 400 KB code limit.
3. Card and picker previews (`src/render/renderer.ts:1195-1196`, `src/render/scenery/preview.ts:20`, `src/render/shows/preview.ts:15`, `src/render/track/preview.ts:105`) also draw from the index.
4. Key fields per kind follow today's sprite keys (`src/render/sprites/bank.ts`, `src/render/sprites/staff.ts`, `src/render/scenery/sprites.ts`, `src/render/anim.ts`, `src/render/track/layer.ts`). Counts are estimates; the tool prints the true counts.

| Kind | Key fields | Pictures (estimate) |
|---|---|---|
| Flat rides (18) | ride, view (4), angle (32), occupancy (5); swing tower also swing (5) | up to 14 080; phone set (16 angles × 3 occupancy) about 4 000 |
| Guests | shirt (12) or temperament step (9), walk/sit (4), look (4), item (4), facing (4) | 5 376 |
| Staff | type, costume, walk, action, facing | at most 1 024 |
| Scenery (85) | item, view, wilted, part, edge side | about 700 |
| Stalls, path items, litter, mess, fence, entrance, show sites | as today's keys | about 250 |
| Shadow pictures | object, view | about 450 |
| Rail parts | track type (12), piece, tile of the piece, view (4) | about 3 000 to 6 000 |
| Supports, gate booths, elevated deck and support segments | type, height step, view | about 1 000 |
| Cars | shape (11), the (yaw, pitch, roll) poses that pieces really reach, front car (2) | up to about 8 500 before roll; the tool enumerates the reached poses |
| Ground pieces | terrain, slope shape (16), owned/outside, view, variant; path and queue joins; face steps; water and shore | about 1 000 to 3 000 |
| **Total** | | **about 35 000 to 45 000** |

### 5.3 Loading, offline and updates

1. **Title first** (proposed, D4). The title screen draws its own pictures from data in the code, so it shows at once. A progress line on the title shows the download. Settings, language and Offline play work at once.
2. **While today's look is the default** (D3): the pixel packs download in the background and nothing waits for them. A failed download changes nothing for the player.
3. **When the pixel look is the default:** before a park starts from New park, a save, the autosave, an import, a scenario or the tutorial, the loader reads the ride and object ids in it and loads their packs behind the progress line. On a failure: while today's look still exists, the park opens in today's look and a message says so; after it is removed, the error shows with **Retry**. A park never draws with holes.
4. **Cards.** When the pixel look is the default, a card whose pictures are not ready shows a mark and cannot be placed; pressing it says why. Offline, the reason reads "Needs a connection", and the loader retries on the browser's `online` event.
5. **The art cache.** Name `tcart-v1`, outside the `tc-` prefix that today's code deletes at every update (`public/sw.js:17, 58-69`) and when Offline play is turned off (`src/offline/index.ts:75, 165`). It is kept across builds and keyed by the hash in each file name. A sheet is deleted only when no current index lists it. The code precache leaves the art out (`scripts/sw-manifest-plugin.ts:29-31`, `scripts/check-release.ts:77-97` change with it). The worker's fetch handler serves `art/` requests from `tcart-v1`. Acceptance test (B8): after a code-only release, the update downloads 0 bytes of art.
6. **One download.** The loader, in the page, fetches every art file and writes it into `tcart-v1`. The first visit downloads each sheet once.
7. **Old build after a deploy.** If an art file returns 404 (the player kept an old build with "Later"), the game shows the "Update ready" toast; this needs a new toast state (today it shows only when a newer worker waits, `src/offline/index.ts:181-182`).
8. **Offline play off** keeps `tcart-v1` (it is the art store). Settings gets an action "Remove downloaded pictures" (it shows the size); the README sentence on turning Offline play off changes with it.
9. **Storage.** After the first park, the game asks the browser for persistent storage; the browser may refuse without asking the player, so this protects nothing for sure. On a storage-full error, the game keeps playing in today's look while it exists and says why. **iPhone:** Safari deletes everything a website stored, saves and pictures, after about 7 days without a visit, unless the game was added to the home screen. The game and the README tell iPhone players to add it to the home screen, or to export their park (Save → Export).
10. **Decoding and memory.**
    - Sheets stay compressed until needed. The decoded sheets in use form a set with a byte budget per device class. A sheet used in this frame or the frame before is never removed.
    - While a sheet decodes, the object keeps its last decoded picture, and the frame counts as incomplete. B3 limits how long this lasts.
    - When the budget allows, the sheets of the two neighbouring views are decoded ahead, so a view turn finds them ready.
    - At park start the loader decodes the sheets of the current view of that park, behind the progress line.
11. **Download size and mobile data** (D5). Before the first download the title shows the size of the core pack and of everything. A setting chooses "Download all pictures now" or "Only when needed" (packs then load when their content is first needed). A website cannot reliably tell Wi-Fi from mobile data, so the game does not try.

### 5.4 Ground

1. The ground of each chunk (8 × 8 tiles) is laid from predrawn tile pieces into one chunk image: terrain tops by slope shape, path and queue joins, cliff and edge faces stacked per height step, water and shore.
2. Grass gets 4 variants per terrain (provisional), picked by a hash of the tile position. The stage 0 grass noise cannot be cut into tile pieces, so the ground looks different from stage 0. The owner judges it at the gate.
3. Chunk assembly runs under today's per-frame build budget (`FIRST_BUILD_BUDGET_MS`), as stage 0 did.

### 5.5 Shadows

1. Each ride, stall and scenery item has a predrawn shadow picture per view: a dithered pattern in a dark palette slot (half the pixels set, so the ground shows through, and every pixel stays on the palette). It is drawn under the object with one `drawImage`, in the object pass, after the ground.
2. Guest and staff pictures hold their own small shadow in the same dithered dark slot.
3. No full-screen shadow layer. Placing or removing an object rebuilds nothing.
4. **Night** (D8): the shadow pictures of objects are not drawn at night, as the draft did. Guest and staff shadows stay (they are part of the guest picture).
5. Moving track cars cast no shadow, as today.

### 5.6 Colour changes

1. **Reserved colour ramps.** The palette reserves three neutral ramps: track, supports, car body. Rail parts, supports and cars are drawn in those ramps.
2. **Swap method.** The game rewrites the colour table of the indexed PNG before it decodes the sheet: one decode per (sheet, colour set). No pixel is read back. Placement ghosts (valid, invalid) use the same method with the ghost ramps of `phase-8-pixel-art.md` (`ghostTable`).
3. Swapped sheets count in the decoded memory (B6). The decode and swap time per sheet on the throttled phone is reported, with a limit in B3.
4. Temperament shirts and rings are predrawn frames.
5. The colour-blind check of `phase-8-pixel-art.md` §6 covers every swap result.

### 5.7 Track rides, cars and elevated paths

Players build these piece by piece. They are predrawn as parts:
1. **Rails:** one picture per track type, piece, tile of the piece and view, in the track ramp.
2. **Supports:** stacked segments per height step, plus top and foot pieces, in the support ramp.
3. **Cars:** the tool walks the sample poses of every piece and lists the (yaw, pitch, roll) steps that cars really reach (corkscrews and helices included, `src/data/track/extraPieces.ts`). It predraws those poses in the car-body ramp. No car is turned or drawn live.
4. **Elevated paths:** predrawn deck and support segments.
5. Riders, chain marks and water ripples stay drawn live, as today.

## 6. Stage 0b: the test

A throwaway worktree, as stage 0. It answers one question: with predrawn pictures, predrawn shadows and k = 3 for phones, does the game meet the speed and memory limits on the slow phone, and how long does the first visit take?

**What the owner will see:** the stage 0 pictures with their faults (one flat purple haunted house, yellow grass, 17 rides in today's shapes, colours no person checked), plus the new ground (5.4) and the new dithered shadows (5.5). The test does not judge the look.

**Scope.**
- The three speed-test parks with every object and ground case in them (four flat ride types, two show sites, the mini railway on three piece kinds, a pond and raised ground in `build2`).
- One new test park for the hard cases: all 18 flat rides, a steel coaster with lift, drop, curves, a corkscrew, supports at several heights and non-default colours, an elevated path, sloped ground, cliffs and water.
- Placement ghosts and the colour swap.

**Measures.** Phone profile at CPU throttle 4, and desktop. Each timing run waits for the load gate. Each value is the median of 3 runs, reported next to today's look (quality `auto`, today's default) in the same session, with work p95 and render p95.

**Before the timing runs:** the tool prints the core pack size and the total size. The controller tells the owner the likely B5 result from these numbers.

**Kill rules (fixed before the test).** The two "today" forms (B2b, B3b) apply only if the owner chooses them (D7); otherwise the strict form applies.

| # | Condition | Result |
|---|---|---|
| B1 | A predrawn picture whose key stage 0 also produced differs from the stage 0 surface output. The compare runs in the browser: each index entry is decoded with `createImageBitmap`, read back and compared pixel by pixel (guest pictures without their shadow pixels). New keys get a format check instead: in the index, size, anchor, palette colours only, every alpha 0 or 255. The ground is not compared (5.4). | Repair the tool once, then repeat. A second failure stops the test for an owner decision. |
| B2 | Phone at k = 3, `scene phone` or `scene build2`: frame p95 above 40 ms. | Stop. |
| B2b (D7) | As B2, but `scene phone` passes when its frame p95 is not above today's frame p95 of the same session (today is 49.9 ms there, above 40) and its work p95 + render p95 is at most today's + 2 ms. `build2` keeps the 40 ms limit (today is 33.4 ms there). | Stop. |
| B3 | Phone: a cold ground chunk assembly above 12 ms; a palette swap and decode of one sheet above 12 ms; or, in `scene phone` and `build2`, the longest frame in the first second after a view turn (the unrounded maximum of 2 turns) above 6 frame steps (100 ms); or more than 30 incomplete frames (5.3 item 10) after a turn; or, in the new test park, the longest frame while 20 scenery items are placed in a row above 100 ms. Frames are compared in whole steps: `round(ms / 16.67)`. | Stop. This turn limit stopped nothing in stage 0; it becomes a stop rule only if the owner agrees (D6). |
| B3b (D7) | As B3, but the turn limit is "not more than today's turn frame + 1 step" (today is 6 steps on `scene phone`). | Stop. |
| B4 | Desktop `scene build1` or `scene build2`: frame p95 above 20 ms. | Try once with pre-enlarged desktop sheets (section 3); if it still fires: Stop. |
| B5 | First visit, phone profile, CPU throttle 4, network 1.6 Mbit/s down, 750 kbit/s up, 150 ms latency (browser network emulation on the page; every art fetch is made by the page, 5.3 item 6): time from page start to the first park frame with no missing picture, with New park pressed as soon as it is enabled, above `ART_LOAD_MAX_S` (8 s, provisional). | The owner decides (a smaller core pack, a longer limit, or core art at a lower detail). |
| B6 | Phone, the maximum over the whole run including the turns: decoded sheets + swapped sheets + chunk images + the static layer above 64 MB (the phone sprite budget, `src/data/tuning/perf.ts:4`). | Stop, or fewer frames for phones (owner decision). |
| B7 | Today's look changes (the recorder tests and the `classic-ops` compare). | Repair, then repeat. B7 holds until the owner approves the removal of today's look. |
| B8 | A code-only rebuild downloads any art bytes on update; or the art cache is gone after an update or after Offline play is turned off. | Repair, then repeat. |

**Also reported:** total size of all packs, unique picture count per kind, decode time, the drawing path the test browser used (graphics chip or software), and how many first visits per month the projected package allows within GitHub Pages' soft bandwidth limit (100 GB per month). Headless Chromium cannot show phone graphics-chip limits; the report says so. If possible, one run on a real mid-range Android phone.

**Owner gate:** the owner sees the numbers, the loading on the title, the phone at k = 3 (the picture phones will really get), the new ground and the new shadows. The full build starts only after the owner says yes.

## 7. After stage 0b (outline)

1. **Art format and source** (D1, D2). An art brief: art scale, palette file with the reserved ramps, anchor rule, frame list per object, transparent background, light from the upper left. The index check tests size, anchor and palette of every picture, not only that it exists.
2. **Batches.** Each batch (for example the 18 flat rides) is made, then shown to the owner side by side with today's look. How approved batches ship is decision D9.
3. **Today's look** follows decision D3.
4. While both looks exist, they merge to `main` behind the art style switch (`?art=`, `VITE_ART`), the exception to master §3 that the owner approved for `phase-8-pixel-art.md` (its section 3). The switch is removed when today's look is removed.

## 8. Originality and provenance

1. Master rule §1.3 says "All graphics are drawn in code" (`docs/superpowers/specs/2026-11-09-thrills-and-chills-design.md:39`), and the README says the same. Hand-made pictures need a change of that rule (D1). Until then, all art stays drawn in code.
2. If the owner allows hand-made art: source sheets live in `art/source/`, which the release check then allows. `art/PROVENANCE.md` has one row per sheet: author, tool, date, licence or grant. The release check fails a sheet with no row. No picture is traced, copied or generated from another game's art.
3. Art from an outside artist needs a written grant, and the project needs a licence first (master open decision 2).

## 9. Owner decisions before the test

| # | Question | Options and what they mean for players | Proposal |
|---|---|---|---|
| D1 | Who makes the final art? | (a) Drawing code only: no rule change; "much better" must come from better drawing code, slower to improve. (b) Also by hand, by a person (you, or a paid artist: needs a licence and a written grant first): changes master rule §1.3; best quality, costs time or money. | (b), with the provenance rule of section 8 |
| D2 | May AI image tools make art? | (a) No. (b) Yes, with the tool named in the provenance file; risk that a tool copies other games' art. (c) Decide later; until then no. | (c) |
| D3 | What happens to today's look? | (a) Kept as a permanent option in Settings: two looks to maintain forever. (b) Default and fallback until you approve the pixel look for every object, then removed. (c) Removed at once when the full build starts: no fallback while art is weak. | (b) |
| D4 | What does the first visit show? | (a) The title at once, the download on the title; Settings work at once. (b) A loading screen before the title. | (a) |
| D5 | Download size and mobile data | (a) Show the sizes first, and a setting "Download all pictures now / Only when needed". (b) Download everything without asking. | (a) |
| D6 | Does the view-turn limit (100 ms) become a stop rule? | (a) Yes: a stutter longer than today's stops the approach. (b) No: it is reported only, as in stage 0. | (a) |
| D7 | Strict speed limits, or "not worse than today"? Today's game is itself above 40 ms on the `phone` scene. | (a) Strict (B2, B3): the pixel look must meet 40 ms where today does not. (b) "Not worse than today" for the `phone` scene and the turn (B2b, B3b); the crowded `build2` keeps 40 ms. With (b), the `phone` scene of stage 0 at k = 2 would have failed, and the crowded `build2` failure of stage 0 would still fail. | (b) |
| D8 | Shadows at night | (a) Object shadows hidden at night, guest shadows stay. (b) All shadows stay at night. | (a) |
| D9 | How do approved art batches ship? | (a) Each approved batch ships at once: for a while the park mixes the two looks. (b) Batches are approved one by one, but ship together when all are approved. | (b) |
| D10 | May stage 0b start before you accept Build 4? | (a) Yes: it runs in a separate copy and changes nothing in the game. (b) No: Build 4 first. | (a) |
| D11 | The values and the core pack | `ART_LOAD_MAX_S` 8 s; growth warning 25 %; core pack: everything the tutorial and any scenario places or offers at month 0. | As written; changed after the test if B5 fires |

## 10. Rules and documents that change

| Rule today | New rule |
|---|---|
| First load ≤ 400 KB gzip of JS and CSS (`scripts/check-release.ts:29`) | Stays for JS and CSS. The core index and core pack count in B5. A release that grows the art by more than 25 % over the art size recorded in `CHANGELOG.md` for the last release prints a warning. |
| Image files only for icons and screenshots (tracked files, `check-release.ts:37-39`) | Generated sheets are not tracked, so they need no change. New check: every file under `dist/art/` is in an index, and every index entry has its file. Tracked hand-made art only after D1 (section 8). |
| Hosting: GitHub Pages, whole `dist` | Pages limits a site to about 1 GB and has a soft bandwidth limit of 100 GB per month. The release check warns above 500 MB of art; a larger package needs another host (owner decision when it comes). |
| Accessibility | The progress line has `role="progressbar"` and a name; the end of loading and errors use a polite live region; nothing animates with reduced motion; the layout holds at 175 % text and in `en-XA`; Retry is at least 44 × 44 px; a card that is not ready has `aria-disabled` and says why; every text comes from `src/data/strings/`. These states join the axe, 175 % and reduced-motion e2e checks. |
| `index.html` "Loading…" text | Replaced by the title-screen progress line (if D4 is (a)). |

Documents to update when the full build starts: the master build table (§3), the README originality statement (after D1), its "Offline play" section and the iPhone advice, the CHANGELOG (art size per release), `tsconfig.json` `include` (adds `tools/`). Prototype shortcuts to fix before the full build (stage 0 report §6): ghosts untinted, slopes and water untested, 115 colours checked by no person, guest items and the sit frame missing, staff anchors not snapped.
