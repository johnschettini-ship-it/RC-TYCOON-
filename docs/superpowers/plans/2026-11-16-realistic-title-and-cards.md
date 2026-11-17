# Realistic title screen and cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the realistic build, the title screen is a baked realistic park panorama with a baked name sign, and every card (ride, stall, scenery, tool) uses a frame and pictures that match the realistic look.

**Architecture:** Title pictures are baked by the existing pipeline into `dist-art/real/title/` with a small index, loaded by a realistic-only title module with its own layout; cards get a realistic-only stylesheet and tool objects baked into the existing `preview:cards` set under `tool:<id>` ids. The website build keeps design E and today's cards.

**Tech Stack:** TypeScript strict, DOM + Canvas, three.js 0.160 bake (tools/art3d), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-16-realistic-title-and-cards-design.md` (approved 2026-11-16, "Approve all"). Background: `phase-7-title-screen.md` (design E rules G1–G15), `phase-8c-realistic-art.md` §8.

## Global Constraints

- Realistic build only: code behind compile-time `import.meta.env.VITE_ART === 'real'` or in modules/stylesheets only the realistic entry imports. Website build JS/CSS/HTML byte-identical to the base.
- All art made by code (kit + three.js), vendored Fredoka font for the sign; nothing downloaded, traced or AI-generated; no copy of an existing game's look, logo or park.
- **Owner change, 2026-11-17:** the title shows the owner's supplied fair poster (`art-src/title/`, copied by `tools/art3d/cover.mjs` to `title/`) instead of the baked panorama, with the name as real Fredoka text over its sky (mocks variant-10 and variant-11). The poster is the one exception to "all art made by code": it is logged in `docs/superpowers/specs/thrills-and-chills/asset-log.md` with its licence pending owner confirmation, and the release check lists it as an owner item. The panorama item stays in tools/art3d, out of the default bake (`--only title` writes `title-panorama/`). The cover rules (focus box, title anchor, fit, twinkle) are in `src/ui/titleScreen/real/layout.ts` and `view.ts`; the wheel sprite, sign pictures and layer caps below apply to the panorama only.
- Title: menu visible at once over a sky gradient; panorama fades in when decoded; ≤ 3 MB compressed; ≤ 24 MB decoded; layers ≤ 1920×800 (wide) / 900×1300 (tall) px; wheel is an 8-frame sprite on the park layer; `prefers-reduced-motion` → no drift, still wheel; title bitmaps closed when a park opens; returning to the title releases the park's sets first.
- Name: "Thrills & Chills", never translated; a visually hidden heading keeps it for screen readers.
- Cards: frame with soft shadow, thin warm-cream edge, rounded corners as today, picture on top, name (and price where there is one) on a dark translucent band over the picture's bottom, white text, contrast ≥ 4.5:1, category stripe at the top; text sizes unchanged; selected and unaffordable states as today.
- Tool objects (`tool:<id>` in `preview:cards`): footpath paving tiles; queue rope posts; pathItems a bench with a lamp; staff a mechanic with a toolbox; research a drafting table with a ride model; marketing a poster board; finance a ticket booth with a cash box; park the entrance arch. Extension cards without a picture keep their icon centred in the picture area.
- Layout checks: 390×844, 360×640, 812×375, normal and large text; a11y (axe) specs pass.
- Storage under `tcreal:`. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01Q5pHggx1eLkEH7W16KJFwP`.

## Review Focus

1. **Slow or failed title art download.** Expected: the menu works at once; the sky gradient stays; no error shown; the panorama appears when ready. Test in Task 2.
2. **Returning to the title from a park.** Expected: park sets released, title art decoded again, no memory growth across three round trips. Test in Task 2.
3. **Window resize / rotation on the title.** Expected: the layout switches wide ↔ tall framing without a blank frame. Test in Task 2.
4. **A long card name on the band.** Expected: fits like today (ellipsis or wrap rule unchanged), band height grows, never covers the category stripe. Test in Task 3.
5. **A tool card whose picture is missing.** Expected: icon in the frame, no broken image. Test in Task 3/4.

---

### Task 1: Bake the title pictures

**Files:** Create `tools/art3d/items/title.js` (scene, sign, wheel sprite), register in `tools/art3d/items/registry.js` + `index.js`; extend `tools/art3d/bake.mjs` output with `title/` and `title/index.json`; Test `tests/unit/art3d/title.test.ts`.

**Interfaces — Produces** `dist-art/real/title/index.json`:
`{ wide: { w, h, layers: { sky, park, front }, wheel: { file, frames: 8, fw, fh, x, y }, nameRow: number, menuAnchorX: number }, tall: {...same}, sign: { line: {file,w,h}, stack: {file,w,h} } }` — file names relative to `title/`; `nameRow` = the top of the tallest ride in layer px (the name sits above it); `menuAnchorX` = the x the menu must not cover (the wheel's left edge).
- [ ] **Step 1: Failing tests:** the registry has `title`; `title/index.json` schema check (sizes within the caps, 8 wheel frames, both framings, both signs); checkIndex accepts it.
- [ ] **Step 2–4:** fail, build the scene from batch 1 ride models + kit (golden-hour light), bake, pass. Look at the pictures; describe them.
- [ ] **Step 5:** sizes: compressed ≤ 3 MB, decoded ≤ 24 MB (report numbers). Commit `feat(art3d): bake the realistic title`.

### Task 2: Realistic title screen

**Files:** Create `src/ui/titleScreen/real/{layout.ts,load.ts,view.ts}`; Modify `src/ui/title.ts` (one call behind the compile-time guard); Test `tests/unit/ui/titleReal.test.ts`, `tests/e2e/title-real.spec.ts`.

**Interfaces — Consumes** Task 1's `title/index.json` (use a fixture in tests). **Produces** `realTitleLayout(input: TitleLayoutInput, idx: TitleIndex): RealTitleLayout` (pure), `loadTitleArt(base: string): Promise<TitleArt>` and `TitleArt.close(): void`.
- [ ] **Step 1: Failing tests:** layout picks tall framing when h > w; the name sits above `nameRow`, inside safe areas; the menu never covers `menuAnchorX` on wide; non-integer scale allowed; reduced motion → zero drift; a failed load keeps the gradient and the menu (no throw); `close()` releases all bitmaps; returning to the title calls the park release first; 3 round trips leave no extra held memory (spy on bitmap close count).
- [ ] **Step 2–4:** fail, implement, pass; e2e at 390×844, 360×640, 812×375, 1366×768 with screenshots; a11y spec passes (hidden heading present).
- [ ] **Step 5:** Commit `feat(ui): realistic title screen`.

### Task 3: Realistic card frames

**Files:** Create `src/styles/realCards.css` (imported only by the realistic entry); Modify `src/ui/decks/card.ts` (structure hook behind the guard if the band needs markup), Test `tests/e2e/cards-real.spec.ts`.
- [ ] **Step 1: Failing tests:** in the realistic build, a ride card shows the picture, the band with name and price, contrast ≥ 4.5:1 (axe), category stripe visible; a long name keeps today's wrap/ellipsis rule; selected and unaffordable states visible; a tool card shows only the name; an extension card without picture shows its icon in the frame; layouts at 390×844, 360×640, 812×375 normal and large text.
- [ ] **Step 2–4:** fail, implement, pass; website build byte-identical.
- [ ] **Step 5:** Commit `feat(ui): realistic card frames`.

### Task 4: Baked tool objects for tool cards

**Files:** Modify `tools/art3d/items/cards.js` (8 tool models, `tool:<id>` frame keys), `tools/art3d/items/registry.js` (`CARD_ITEMS` tool entries), `src/render/real/cards.ts` (`cardPicture` accepts `tool:<id>`), `src/ui/decks/toolCards.ts` (realistic build asks for `tool:<id>`, guarded); Test `tests/unit/render/real/cards.test.ts`, `tests/unit/art3d/bakeRegistry.test.ts`.
- [ ] **Step 1: Failing tests:** the cards set has a frame for each of the 8 tool ids; `cardPicture('tool:footpath')` resolves; an unknown tool id returns null (icon fallback).
- [ ] **Step 2–4:** fail, model the 8 objects in the kit, bake, pass. Look at them.
- [ ] **Step 5:** cards set growth ≤ 0.5 MB decoded (report). Commit `feat(art3d): tool card objects`.

### Task 5: Gate (controller + owner)

- [ ] Merge; final review; deploy (deploy.yml copies `title/` with the art); screenshots of the title (phone, desktop) and a hand of cards for the owner; owner approval.
