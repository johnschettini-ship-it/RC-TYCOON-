# Phase 8b: Predrawn pixel art (design)

- **Status:** Draft for owner approval, revision 5 (2026-11-12). Revision 2 repaired three reviews of revision 1; revision 3 repaired the re-reviews of revision 2. Revision 4 followed the owner's decision to ship as a phone app (Android and iPhone) with a website demo. Revision 5 repairs the reviews of revision 4, adds the art rules taken from Orange Day (5.8), and splits the owner decisions into two rounds: the test (section 9) and the app and website (section 11).
- **Build:** Build 5.
- **Replaces:** the live-drawing approach of `phase-8-pixel-art.md`, stopped by the stage 0 result (`phase-8-stage-0-report.md`). The visual rules of that spec stay where this design does not change them: hard square pixels, ink outlines, the colour ramps, the stepped zoom with the soft far overview (its sections 6 to 8, owner decisions 1 and 2).
- **Owner decisions so far (2026-11-12):** "Let's switch to predrawn." The game ships as an app on Android and iPhone, with a website demo ("All with website demo"); the model is the owner's project Orange Day: Pocket Republic (Capacitor 7 wrapper, art painted by a build tool, `tools/gen_art.js`, about 15 MB of art in the app). A large download is acceptable ("I've downloaded games with gigs on my phone"). The full art package will grow beyond the code-drawn pictures. Earlier: the final art must be much better than the code-drawn drafts.

## 0. Summary for the owner

- The game ships as an app for Android and iPhone, wrapped with Capacitor like Orange Day. All pictures are inside the app: no download after install, no website storage limits. The website stays as a free demo in today's look.
- The game will show pictures drawn once, when the game is built. During play the phone copies finished pictures. Only riders on track rides, chain marks and water ripples stay drawn live, as today.
- Stage 0 was slow for two reasons: building pictures live, and extra work every frame (a full-screen shadow layer, and a sharper phone picture). This design removes the first and changes the second: shadows become small predrawn pictures, and phones use the coarser setting k = 3.
- The next test (stage 0b) checks **speed, memory and loading only**. Its pictures are the stage 0 pictures with their faults, plus a new ground and new shadows. It does **not** show better art.
- Better art comes after the test, batch by batch, and replaces today's look only after you approve it side by side.
- You decide 8 points before the test (section 9), and 10 points about the app and the website before the full build (section 11). Each has its options and what they mean for players. Each has its options and what they mean for players.

## 1. Words

| Word | Meaning |
|---|---|
| Today's look, Classic | The art the game ships now: smooth vector drawing. |
| Pixel look | Hard-pixel art in the style of the approved draft. The final pictures must be much better than the drafts. |
| Sheet | One image file that holds many small pictures side by side. |
| Index | A file that says where each picture sits on its sheet and where its anchor point is. |
| Pack | A group of sheets by kind (rides, people, ground and so on). All packs ship inside the app. |
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
| Desktop `build1` p95 33.3 ms (today 16.8) | The shadow layer, and every picture copied enlarged two times | The same. Desktop Pixel is not in the product unless decision E1 adds it; a tablet profile replaces the desktop rule (B4) |
| View-turn hitch 150 to 183 ms (today 100) | Ride, stall and guest picture builds and the static layer in the turn frame (chunks were already spread over frames by `FIRST_BUILD_BUDGET_MS`, `src/render/terrain.ts:400-407`) | Predrawn; decoding off the main thread while the last picture stays (5.3 item 6) |

If the test still fails with these changes, the approach stops (section 6).

## 4. Structure

```
BUILD TIME   drawing code ──► sheet tool (Vite plugin) ──► art/<pack>/<sheet>-<hash>.png + one index per pack
APP          Capacitor wraps the built game; the sheets ship inside the app (Android and iPhone)
APP START    title at once ──► decode the sheets of the park being opened ──► play
WEBSITE      demo build in today's look: no art sheets, today's offline rules unchanged
PLAY         numeric index lookup ──► drawImage from a decoded sheet; ground: tile pieces laid into chunk images
```

## 5. Parts

### 5.1 The sheet tool

1. **A Vite plugin** (`tools/sheets/plugin.ts`). Why not a step before Vite: `vite build` empties `dist` first, and the release check calls `npx vite build` directly (`scripts/check-release.ts:216`). The plugin loads one entry module through Vite's module runner (`runnerImport`, with `configFile: false` so it does not load itself again). The entry module imports the surface and the art functions together, so the surface type check (`isPixelSurface`, an `instanceof`) sees one copy. It writes the sheets with `emitFile`. In `npm run dev` it serves them from memory.
2. It calls `new PixelSurface(...)`, the art function, then `finish()`, and reads the pixels from the surface. It never calls `makeCanvas` or `blitTo`, which need a browser canvas.
3. It writes **indexed PNG** (palette and transparency chunks), with no colour-space chunks. Each sheet's file name holds a hash of its palette and pixel data, not of the PNG bytes, so a change of the compression library does not change the names.
4. It removes duplicate pictures by hash and prints the unique picture count and the size per pack and per kind.
5. **Packing.** At most 2048 × 2048 pixels per sheet, a 2-pixel transparent gap between pictures. A ride in one view never shares a sheet with another ride, and may span several sheets. The phone frame set (the coarse frames of `src/render/anim.ts:66-75`) has its own sheets, so a phone never decodes frames it does not show. (One store app carries both sets; Android App Bundles do not split phones from tablets.)
6. **Hand-made sheets** (only after decision D1): when `art/source/<sheet>.png` exists and has a row in `art/PROVENANCE.md`, the tool takes it in place of the generated sheet, after the format check of 7.1.
7. A disk cache keyed by a hash of the tool's inputs keeps the build and the dev start fast.
8. The prototype branch `phase8-stage0-proto` is never merged. Each part the tool needs is copied in under review; the prototype's shortcuts are fixed before the full build (section 10).

### 5.2 The index and the picture keys

1. One index per pack, in a compact binary form. The plugin gives the bundle the URL and hash of each index (a virtual module). At load the game turns the index into numeric tables; no string is built per object per frame.
2. The indexes ship inside the app; reading them counts in the app start time (B5).
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

### 5.3 The app, the website demo, and memory

1. **App wrapper.** Capacitor 7, as in Orange Day (`orange-day-pocket-republic`: `capacitor.config.json`, `scripts/build-mobile-www.mjs`, `docs/MOBILE-STORE.md`, `docs/ANDROID-FIRST-RUN.md`). Capacitor is a runtime dependency; the written reason (master §4 asks for one): the stores accept only native apps, and Capacitor wraps the existing game without a rewrite. The game code imports nothing from Capacitor except where items 5 to 8 need a native feature.
2. **Two outputs from one source.**
   - `vite build` (web mode) makes the website demo: today's look, the service worker, no sheets, no pixel loader (it compiles out).
   - `vite build --mode app --outDir dist-app` makes the app: the sheet plugin runs, the service worker, the "Update ready" toast and the Settings → Offline play row are left out (`import.meta.env.MODE`).
   - `npm run mobile:www` copies `dist-app` into the Capacitor web root; `npm run mobile:sync` runs `npx cap sync`.
   - The release check gets an app pass: it builds app mode, checks that every file under `dist-app/art/` is in an index and the reverse, that there is no `sw.js` or `sw-manifest.json`, and the art size.
   - `base: './'` works under Capacitor (`https://localhost` on Android, `capacitor://localhost` on iPhone).
3. **Native projects.** `android/` and `ios/` are tracked, as in Orange Day. Their launcher icons and splash images are made from the project icon at build time and not tracked, so the release check's image rule does not change. `ios/` is created on a Mac (`npx cap add ios`).
4. **Art inside the app.** Every sheet ships in the app. There is no download after install. A store update replaces the sheets.
5. **Saves in the app.** The app keeps saves in files through a Capacitor storage plugin (a further runtime dependency; reason: the phone may clear web storage inside an app when space is low, and large parks come near the web storage limit of about 5 MB). The scheme and host in `capacitor.config.json` are fixed for good, so save locations never move. The game also autosaves when the app goes to the background (the page becomes hidden).
6. **Moving a park.** From the website to the app: Export on the website, then Import in the app. In the app, Export uses the phone's share sheet (a file download does not work inside the app). Device test: export then import, on Android and iPhone. A website park opens in the app only if the app is not older than the website build.
7. **App shell.** The Android back button closes the open panel first; on the title it asks before closing the app. Safe areas (`viewport-fit=cover`) are respected on screens with a notch. The game pauses and autosaves when the app goes to the background.
8. **Decoding and memory.**
   - One shared byte budget per device class holds the decoded sheets, the swapped sheets, the chunk images and the static layer; the chunk cache gives way to the sheets. Phone and tablet: 64 MB (decision D11).
   - Sheets are fine-grained: one ride, view and occupancy level per sheet, so the decoded set follows the frames on screen. Placement ghosts have their own small sheets.
   - A sheet used in this frame or the frame before is never removed. Decoding runs off the main thread (`createImageBitmap`); while it runs, the object keeps its last decoded picture and the frame counts as incomplete (B3 limits this).
   - Neighbouring views are not decoded ahead (they do not fit the budget). At park start the game decodes the sheets of the current view of that park, behind a progress line on the title.
   - **Device classes in the app** come from the screen size: phone (shorter side under 600 CSS px) and tablet. Both get the coarse frame set unless the test shows that tablets fit the full set inside 64 MB.
   - Each sheet is at most 2048 × 2048, and each canvas stays under the iPhone canvas area limit (about 16.7 million pixels).
9. **App size.** The store shows the size before install; iPhones ask before a large download over mobile data. The release check prints the app's art size and warns when it grows by more than 25 % over the size recorded in `CHANGELOG.md` for the last release, and above 150 MB (Google Play allows 200 MB before asset packs).
10. **Website demo.** It keeps today's look and today's offline rules, with no pixel sheets; what else it keeps is decision E2. A line on its title links to the app stores.

### 5.4 Ground

1. The ground of each chunk (8 × 8 tiles) is laid from predrawn tile pieces into one chunk image: terrain tops by slope shape, path and queue joins, cliff and edge faces stacked per height step, water and shore.
2. Grass gets 4 variants per terrain (provisional), picked by a hash of the tile position. The stage 0 grass noise cannot be cut into tile pieces, so the ground looks different from stage 0. The owner judges it at the gate.
3. Chunk assembly runs under today's per-frame build budget (`FIRST_BUILD_BUDGET_MS`), as stage 0 did.

### 5.5 Shadows

1. Each ride, stall and scenery item has a predrawn shadow picture per view: a dithered pattern in one declared dark palette slot (half the pixels set, so the ground shows through, and every pixel stays on the palette). All visible shadows are drawn in one pass right after the ground and before the depth-sorted objects, culled to the view with numeric keys, one `drawImage` each. Shadows lie flat; a shadow next to a cliff is part of the owner pictures.
2. Guest and staff pictures hold their own small shadow in the same dithered dark slot.
3. No full-screen shadow layer. Placing or removing an object rebuilds nothing.
4. **Night** (D8): the shadow pictures of objects are not drawn at night, as the draft did. Guest and staff shadows stay (they are part of the guest picture).
5. Moving track cars cast no shadow, as today.

### 5.6 Colour changes

1. **Reserved colour ramps.** The palette reserves three neutral ramps: track, supports, car body. Rail parts, supports and cars are drawn in those ramps.
2. **Swap method.** The game rewrites the colour table of the indexed PNG before it decodes the sheet: one decode per (sheet, colour set). No pixel is read back. Placement ghosts (valid, invalid) use the same method with the ghost ramps of `phase-8-pixel-art.md` (`ghostTable`).
3. Swapped sheets count in the shared budget (B6). The main-thread part of a swap (rewriting the colour table and building the file) is limited in B3; the decode itself runs off the main thread and is reported.
4. Temperament shirts and rings are predrawn frames.
5. The colour-blind check of `phase-8-pixel-art.md` §6 covers every swap result.

### 5.7 Track rides, cars and elevated paths

Players build these piece by piece. They are predrawn as parts:
1. **Rails:** one picture per track type, piece, tile of the piece and view, in the track ramp.
2. **Supports:** stacked segments per height step, plus top and foot pieces, in the support ramp.
3. **Cars:** the tool walks the sample poses of every piece and lists the (yaw, pitch, roll) steps that cars really reach (corkscrews and helices included, `src/data/track/extraPieces.ts`). It predraws those poses in the car-body ramp. No car is turned or drawn live.
4. **Elevated paths:** predrawn deck and support segments.
5. Riders, chain marks and water ripples stay drawn live, as today.

### 5.8 Art rules (taken from Orange Day)

The owner's project Orange Day: Pocket Republic paints all its pixel art with a code tool (`tools/gen_art.js`), and its rules (`docs/PLAN-PIXEL-OVERHAUL.md`) give better pictures than the stage 0 test. This design takes over the method, not the pictures (Orange Day is seen from above; this game is isometric with 4 views):
1. **Ramps:** six steps per material; shadows lean violet, highlights lean gold.
2. **Outlines:** each edge is a darker step of the colour it touches, not one black line everywhere.
3. **Each object has its own idea:** no two rides, stalls or roofs alike; guests and staff differ by build, hair and a prop, not only by colour.
4. **One declared shadow colour** (5.5), drawn into pictures, never code-drawn ellipses.
5. **Night pictures** as separate frames where lights matter (lamps, ride lights).
6. **A written rule table** (scale, palette, outlines, shadows, light) kept in this project, as Orange Day keeps one.
Orange Day's newest art is on the owner's computer, not on GitHub (its `main` branch is from 2026-11-11); the rules are checked again when the owner shares it.

## 6. Stage 0b: the test

A throwaway worktree, as stage 0. It answers one question: with predrawn pictures, predrawn shadows and k = 3 for phones, does the game meet the speed and memory limits on a phone, and how long does the app take to start a park?

**What the owner will see:** the stage 0 pictures with their faults (one flat purple haunted house, yellow grass, 17 rides in today's shapes, colours no person checked), plus the new ground (5.4) and the new dithered shadows (5.5). The art rules of 5.8 are not applied yet. The test does not judge the look.

**Scope.**
- The three speed-test parks with every object and ground case in them (four flat ride types, two show sites, the mini railway on three piece kinds, a pond and raised ground in `build2`).
- One new test park for the hard cases: all 18 flat rides, a steel coaster with lift, drop, curves, a corkscrew, supports at several heights and non-default colours, an elevated path, sloped ground, cliffs and water.
- Placement ghosts and the colour swap.

**Where it runs.**
- Headless Chromium (the engine of the Android WebView) at CPU throttle 4, phone profile and tablet profile (1024 × 1366 CSS at device ratio 2, touch). This measures the game's own code. It does not model a phone's graphics chip, which did most of stage 0's pixel filling.
- One run in Playwright's WebKit, labelled "function only" (decoding, crisp pixels, canvas sizes; no throttle, so no speed).
- **Real devices (part of the owner gate):** one mid-range Android phone and one older iPhone (a cloud device service or a test build). B2, B3 and B6 are read on those devices too, with frame steps from each screen's refresh rate. If a real device fails a rule that Chromium passed, the device result decides.

**Measures.** Each timing run waits for the load gate. Each value is the median of 3 runs, reported next to today's look (quality `auto`, today's default) in the same session, with work p95 and render p95 reported separately.

**Before the timing runs:** the tool prints the art size per kind and in total, the projected app size (both frame sets), and the projected decoded memory of each test scene. If the projection is already above 64 MB, the controller stops before timing and reports to the owner.

**Kill rules (fixed before the test).** The "today" forms (B2b, B3b) apply only if the owner chooses them (D7); otherwise the strict forms apply.

| # | Condition | Result |
|---|---|---|
| B1 | A predrawn picture whose key stage 0 also produced differs from the stage 0 surface output. The compare runs in the browser: each index entry is decoded with `createImageBitmap`, read back and compared pixel by pixel (guest pictures without their shadow pixels). New keys get a format check instead: in the index, size, anchor, palette colours only, every alpha 0 or 255. The ground is not compared (5.4). | Repair the tool once, then repeat. A second failure stops the test for an owner decision. |
| B2 | Phone at k = 3, `scene phone` or `scene build2`: frame p95 above 40 ms. | Stop. |
| B2b (D7) | As B2, but `scene phone` passes when its frame p95 is not above today's frame p95 of the same session (today is 49.9 ms there, above 40) and its work p95 is at most today's + 2 ms. `build2` keeps the 40 ms limit (today is 33.4 ms there). | Stop. |
| B3-turn | `scene phone` and `build2`: the longest frame in the first second after a view turn (the unrounded maximum of 2 turns) above 6 frame steps (100 ms). Frames are compared in whole steps: `round(ms / 16.67)`. | Stop if D6 is (a); reported only if D6 is (b). |
| B3b (D7) | As B3-turn, but the limit is "not more than today's turn frame + 1 step" (today is 6 steps on `scene phone`). | As B3-turn. |
| B3-other | Phone: a cold ground chunk assembly above 12 ms; the main-thread part of one palette swap above 3 ms; more than 30 incomplete frames after a turn (5.3 item 8; the count is reported next to the turn frame, and the owner sees a turn in the device recording); in the new test park, the longest frame while 20 scenery items are placed in a row above 100 ms. | Stop. |
| B4 | Tablet profile, `scene build1` and `scene build2`: frame p95 above 40 ms; or the tablet's decoded memory above its budget (64 MB). | Tablets get the phone frame set; if it still fires: Stop. |
| B5 | Page start to park: `vite preview` of `dist-app`, phone profile, CPU throttle 4: time from page start to the first park frame with no missing picture, (a) New park pressed as soon as it is enabled, (b) Continue on the `build2` save; above `ART_START_MAX_S` (4 s, provisional). Also reported, from the real devices: time from tapping the app icon to the first complete frame. | The owner decides (fewer frames decoded at start, or a longer limit). |
| B6 | Phone and tablet, the maximum over the whole run including the turns and placements: the shared budget (decoded sheets, swapped sheets, chunk images, the static layer) above 64 MB. | Stop, or fewer frames (owner decision). |
| B7 | Today's look changes (the recorder tests and the `classic-ops` compare). | Repair, then repeat. B7 holds until the owner approves the removal of today's look. |
| B8 | The website build changes: its initial load grows by more than 2 KB, it contains an `art/` folder, or its service worker rules change; or the app build contains the service worker. | Repair, then repeat. |

**Also reported:** total size, unique picture count per kind, decode time per sheet (and whether the throttle applied to decoding), the drawing path of the test browser (graphics chip or software), and an Android emulator run of the app on the owner's computer (following Orange Day's `docs/ANDROID-FIRST-RUN.md`): sheets load from inside the app, Export and Import, a save after the app is closed, the back button.

**Owner gate:** the owner sees the numbers, the real-device results, the app start, the phone at k = 3 (the picture phones will really get), the new ground and the new shadows. The full build starts only after the owner says yes.

## 7. After stage 0b (outline)

1. **Art format and source** (D1, D2). An art brief: art scale, palette file with the reserved ramps, anchor rule, frame list per object, transparent background, light from the upper left. The index check tests size, anchor and palette of every picture, not only that it exists.
2. **Batches.** Each batch (for example the 18 flat rides) is made, then shown to the owner side by side with today's look. How approved batches ship is decision D9.
3. **Today's look** follows decision D3.
4. While both looks exist, they merge to `main` behind the art style switch (`?art=`, `VITE_ART`), the exception to master §3 that the owner approved for `phase-8-pixel-art.md` (its section 3). In the app, the switch is removed when today's look leaves the app. The website keeps today's look (decision E2), so its drawing code stays in the project for as long as the website demo exists.

## 8. Originality and provenance

1. Master rule §1.3 says "All graphics are drawn in code" (`docs/superpowers/specs/2026-11-09-thrills-and-chills-design.md:39`), and the README says the same. Hand-made pictures need a change of that rule (D1). Until then, all art stays drawn in code.
2. If the owner allows hand-made art: source sheets live in `art/source/`, which the release check then allows. `art/PROVENANCE.md` has one row per sheet: author, tool, date, licence or grant. The release check fails a sheet with no row. No picture is traced, copied or generated from another game's art.
3. Art from an outside artist needs a written grant, and the project needs a licence first (master open decision 2).

## 9. Owner decisions before the test (round 1)

| # | Question | Options and what they mean for players | Proposal |
|---|---|---|---|
| D1 | Who makes the final art? | (a) Code only, with the art rules of 5.8: no rule change; Orange Day shows that code-drawn pixel art can look good. (b) Also by hand, by a person (you, or a paid artist: needs a licence and a written grant first): changes master rule §1.3; costs time or money. | (a) for now; (b) stays possible later |
| D2 | May AI image tools make art? | (a) No. (b) Yes, with the tool named in the provenance file; risk that a tool copies other games' art. (c) Decide later; until then no. | (c) |
| D3 | What happens to today's look in the app? | (a) A permanent option in the app's Settings: two looks to maintain in the app. (b) Default and fallback in the app until you approve the pixel look for every object, then removed from the app. (c) Removed from the app at once. In every option the website demo keeps today's look (E2), so today's drawing code stays in the project. | (b) |
| D6 | Does the view-turn limit (100 ms) become a stop rule? | (a) Yes: a stutter longer than about 6 frames stops the approach. (b) No: reported only, as in stage 0. | (a) |
| D7 | Strict speed limits, or "not worse than today"? Today's game is itself above 40 ms on the `phone` scene. | (a) Strict (B2, B3-turn). (b) "Not worse than today" for the `phone` scene and the turn (B2b, B3b); the crowded `build2` keeps 40 ms. For players, (b) means: on a full phone park the game may stutter as much as today at its worst moments (about 50 ms per frame, 20 frames per second). With (b), stage 0's results would still have failed. | (b) |
| D8 | Shadows at night | (a) Object shadows hidden at night, guest shadows stay. (b) All shadows stay at night. | (a) |
| D9 | How do approved art batches ship? | (a) Each approved batch ships at once: for a while the park mixes the two looks. (b) Batches are approved one by one, but ship together when all are approved. | (b) |
| D10 | May stage 0b start before you accept Build 4? | (a) Yes: it runs in a separate copy and changes nothing in the game. (b) No: Build 4 first. | (a) |
| D11 | Test values | (a) Start 4 s; memory 64 MB on phones and tablets; growth warning 25 %. (b) Other values you name. These are starting values; a failed rule comes back to you. | (a) |

## 10. Rules and documents that change

| Rule today | New rule |
|---|---|
| First load ≤ 400 KB gzip of JS and CSS (`scripts/check-release.ts:29`) | Stays for the website. The app build checks the art size (5.3 item 9) and B5 instead. |
| Image files only for icons and screenshots (tracked files, `check-release.ts:37-39`) | Generated sheets are not tracked, so they need no change. New check (app pass): every file under `dist-app/art/` is in an index, and every index entry has its file. Tracked hand-made art only after D1 (section 8). |
| Hosting: GitHub Pages, whole `dist` | The website demo stays on Pages, with no pixel sheets. The app ships through Google Play and the App Store. |
| Accessibility | The start progress line has `role="progressbar"` and a name; its end and a decode error use a polite live region; a decode error offers Retry (at least 44 × 44 px) and, while today's look is in the app, opens the park in today's look; nothing animates with reduced motion; the layout holds at 175 % text and in `en-XA`; every text comes from `src/data/strings/`. These states join the axe, 175 % and reduced-motion e2e checks. Screen readers (TalkBack, VoiceOver) are checked on the real devices. |

Documents to update when the full build starts: the master build table (§3) and its platform line (the game becomes an app with a website demo), a store and packaging guide copied from Orange Day's `docs/MOBILE-STORE.md`, the README originality statement (after D1), its install section (app stores, website demo), the CHANGELOG (art size per release), `tsconfig.json` `include` (adds `tools/`). Prototype shortcuts to fix before the full build (stage 0 report §6): ghosts untinted, slopes and water untested, 115 colours checked by no person, guest items and the sit frame missing, staff anchors not snapped.

## 11. Owner decisions about the app and the website (round 2, before the full build)

Stage 0b depends on these only through B5 and B8, so they can be decided while the test runs.

| # | Question | Options and what they mean for players | Proposal |
|---|---|---|---|
| E1 | Desktop players | (a) Desktop keeps the website in today's look only (changes master §1.1: "Desktop and touch devices are equal targets"). (b) The website also offers the pixel look on desktop (brings back download rules like revision 3). (c) A desktop app later (for example on Steam), extra cost. | (a) now, (c) possible later |
| E2 | What is the website? | (a) The full game in today's look, updated with each build. (b) The full game frozen at Build 4. (c) A limited demo (you name the limit). Today's website players keep their parks in every option. | (a) |
| E3 | Price and money | (a) Free, no ads, no purchases (as master §11). (b) Paid app. (c) Free with ads or purchases: changes master §11 and brings privacy, tracking and children's-app rules. | (a) for the first release |
| E4 | Who is the game for? (target ages, for the store ratings) | (a) Everyone, not aimed at children. (b) Aimed at children too: brings Google's Families policy and Apple's Kids rules. | (a) |
| E5 | Licence | The project needs a licence before the first store release (master open decision 2); the Fredoka font's licence text ships inside the app. | You choose; I list the options when we get there |
| E6 | First store release | (a) When the pixel look is approved. (b) Earlier in today's look, the pixel look in an update. | (a) |
| E7 | Platforms first | (a) Android first (works from your Windows computer), then iPhone. (b) Both at once (needs a Mac or a paid cloud build service). | (a) |
| E8 | App identity and accounts | App ID, store name (checked in both stores and against the name rule), your Google Play account (Google: about $25 once; new personal accounts need a closed test with 12 testers for 14 days) and Apple Developer account (about $99 a year); who keeps the Android signing key (losing it blocks all updates); who submits each release. | Same accounts as Orange Day |
| E9 | Store duties | Privacy policy page (the website can host it), Google's Data safety form, Apple's App Privacy answers, age ratings, the export-compliance question, Apple's rule against apps that only wrap a website (the app's own value: art inside, offline play). | I prepare each with you before the first release |
| E10 | Master spec changes | The app changes master §1.1 (desktop), §1.2 (a browser game on GitHub Pages), §4 (no runtime dependencies; hosting), §7 (save storage), §10 (the 400 KB budget is for the website only), §11 (non-goals, if E3 is (b) or (c)), and the README ("no install, no account"). | A table of old and new text for your approval with round 2 |
