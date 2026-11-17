# Title-to-play bridge: design

- **Status:** approved by the owner on 2026-11-17 ("Yes one single design and build").
- **Owner requests:**
  - "from a game design perspective how do we tie the title page to actual game";
  - "Let's get title colors and style to transition nicely to actual gameplay doesn't have to be exact";
  - "Yes one single design and build".
- **Related:**
  - the poster cover on the realistic title (branch `tc-poster`, `src/ui/titleScreen/real/`, `art-src/title/`);
  - storyboard v2 and the colour-bridge sheet the owner saw (`.superpowers/sdd/2026-11-16-realistic-title-and-cards/owner-shots/storyboard-title-to-game-v2.png`, `colour-bridge.png`).

## Intent

The title is a drawn fair poster at sunset, while the game is a realistic park in daylight. The player should feel that the poster becomes their park, with no hard cut. The poster should also give a new player a first goal: build the park on the poster.

## Goals

1. **Push through the arch.** When a park opens from the title, the poster zooms into its lit arch and dissolves into the game.
2. **Arrival glow.** The park first shows with a warm sunset wash that fades to daylight.
3. **Welcome card.** On a new park, a drawn card in the poster's style welcomes the player.
4. **"Make the poster real".** A goal panel with a grey copy of the poster. Each part lights up in colour as the player builds it.
5. **Shared style.** The new card and panel use the poster's cream paper and coral frame, and the title lettering colours. Other existing UI does not change.

## Non-goals

- The website build (it keeps design E and today's flow).
- A new scenario, or win and lose rules. The poster goal is a side goal and does not end the game.
- Changes to the game's ground, models, top bar or cards, beyond the items below.
- Guest silhouettes in thought bubbles (a later idea, out of scope).

## Anti-goals

- The menu or the park waits longer than today: the transition must never delay play.
- The poster stays in memory during play: it is freed when the transition ends.
- Motion for players with reduced motion turned on.
- A goal that blocks the player or nags them.

## Approaches considered

1. **Drawn arrival scene, a 3D park gate (rejected by the owner).** The owner rejected the 3D render look in storyboard v1.
2. **Straight into the real game, with a short zoom, a dissolve and a colour wash (picked).** This is what similar park builders do: the player goes from the menu straight to the live game camera. The poster style carries on in the welcome card and the goal panel.
3. **Hard cut, no transition (rejected):** it is what the owner asked to fix.

## Decisions

### 1. Push through the arch

- **When it runs:** after a park is ready behind the title (New game, Continue, Load, or a scenario start). It never runs before the park is loaded, so it adds no wait.
- **Motion:**
  - The poster scales from 1 to 2.4 about the arch centre over 900 ms, easing in. The arch centre is the cover index's new `arch` point, (690, 560) in poster pixels on the wide file.
  - During the last 400 ms the title layer fades out and shows the game below.
  - The menu and the name fade out in the first 200 ms.
- **Reduced motion:** no zoom, only a 300 ms cross-fade.
- **Input:** blocked during the transition, at most 900 ms. A tap or a key press skips it at once.
- **Memory:** the poster bitmap and the title canvas are closed at the end of the transition. The park's sets may start to load during it; the title's one bitmap (about 4 MB) is outside the play budget for at most 900 ms.

### 2. Arrival glow

- **Look:** a full-screen layer over the game canvas, under the UI. It has colour `#ff9a4a` with `mix-blend-mode: soft-light` and starts at opacity 0.35. Not exact: tune by eye so the park looks lit by the sunset, not orange.
- **Fade:** from the start opacity to 0 over 2000 ms, easing out, starting when the push ends. It has no pointer events.
- **Reduced motion:** the glow is not shown.
- **When it shows:** only after a title transition, not after a load from inside the game.

### 3. Welcome card

- **When it shows:** only on New game from the title (a new sandbox park). It does not show for Continue, Load, or a scenario with its own briefing. It shows once per new park; with no save field, a reload of that park does not show it again.
- **Look:**
  - Cream paper `#f6ecd8`, with a coral `#d9614a` double frame like the poster's border and a soft shadow.
  - "Welcome to" in brown `#6b3a28`.
  - "Thrills & Chills" in Fredoka 700, with yellow `#ffd970`, coral `#ff9f7a` and ice blue `#9fe0ea` and a brown outline. These are the same letter colours as the title's name.
  - Body text: "Your park is an empty field. Build the park on the poster!"
  - One button, "Let's go", in the game's main blue `#3fa9e6`.
- **Behaviour:**
  - It is a modal dialog: focus goes to the button, Escape closes it, and focus returns to the game.
  - The game is paused while it is open.
  - The first tip waits until the card closes.
- **Strings:** realistic-only strings under `ui.welcome.*`, added to the English table only in the realistic build. They follow the pattern of `src/data/strings/realCards.ts`, so the website's string table does not change.
- **Fit:** 390×844, 360×640 and 812×375, at normal and large text. The card never overflows the screen.

### 4. "Make the poster real" goal panel

- **Where:** a small panel in the game, collapsed to a chip by default on phones and open on desktop, at the top right under the speed controls. Both states can be toggled.
- **Contents:**
  - The title "Make the poster real · n of 5".
  - A poster thumbnail, drawn in grey except the parts that are done, which are drawn in full colour.
  - A progress bar and the list of five goals.
- **Goals:** each is worked out live from the park, with no save field. A goal can turn back off if the player demolishes what it counts.

  | Goal | Done when | Poster area that lights |
  |---|---|---|
  | Big wheel | a `big_wheel` ride is built | the wheel (ellipse) |
  | Coaster | any track ride whose catalogue type is a coaster is built | the coaster on the right |
  | Striped stalls | 3 or more stalls are built | the stalls at both sides |
  | Gate arch | a `ticket_arch` (or another arch scenery: id ends in `_arch`) is placed | the arch in the centre |
  | Happy crowd | 200 or more guests in the park | the crowd under the arch |

- **Poster areas:** shapes in poster pixels, added to the cover index as `goals: { id: { ellipse | rect } }` and checked by the index check.
- **Lit areas:** the colour copy is drawn into each lit area on the thumbnail, with a soft 10 px edge.
- **Completion:**
  - When all five are done, a toast reads "The poster is real!", and the panel shows the full-colour poster and "Poster complete". It can then be dismissed.
  - Dismissal is stored in settings under `tcreal:`, so the panel does not return in later parks.
- **Scope:** new sandbox parks and Continue or Load of a sandbox park. It is hidden in scenarios that have their own objectives.
- **Accessibility:**
  - The list is real text.
  - Each goal reads "Big wheel: done" or "Big wheel: to do".
  - The thumbnail is decorative (`alt=""`).

### 5. Shared style

- **Tokens:** the new realistic-only stylesheet defines `--tc-cream #f6ecd8`, `--tc-coral #d9614a`, `--tc-title-y #ffd970`, `--tc-title-c #ff9f7a` and `--tc-title-b #9fe0ea`. The welcome card, the goal panel and the title name use them.
- **Unchanged:** the game's existing navy panels and blue main button. They already match the title menu.

## Constraints

- **Realistic build only:**
  - code behind `import.meta.env.VITE_ART === 'real'`, or in modules only the realistic entry imports;
  - the website build's JS, CSS and HTML must stay byte-identical to `tc-poster` head.
- **Storage:** under `tcreal:` only.
- **No new art files:** the panel's thumbnail comes from the poster already shipped, drawn smaller and in grey at runtime. The grey copy is made once and freed when the panel closes.
- **Memory:** the panel thumbnail stays under 1 MB decoded. The poster at full size is not kept in play.
- **Text:** sizes as the game's existing panels. Contrast ≥ 4.5:1 for every text on cream and on navy.
- **Checks:** the fit probe sizes (390×844, 360×640, 812×375, 1366×768), at normal and large text. The a11y (axe) checks must pass.

## Left to the builder

- Exact easing curves, the glow's tuning and the panel's spacing.
- Where the goal check runs: once per sim tick, or every 500 ms; it must be cheap.
- How the scenario check detects "has its own objectives".
