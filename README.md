# Thrills & Chills

An original isometric theme-park management game for the browser. Build rides, paths, and shops. Serve two kinds of guests: **Thrill** seekers who want speed and height, and **Chill** seekers who want calm gardens and gentle rides.

> Thrills & Chills is an original fan-made game in the theme-park management genre. It has no affiliation with any company or other game. All art, names, and sounds are original and generated in code.

## Status
Work in progress. See the [master design spec](docs/superpowers/specs/2026-11-09-thrills-and-chills-design.md) and the [delivery plan](docs/superpowers/plans/2026-11-09-thrills-and-chills-delivery.md).

## Run
```bash
npm install
npm run dev
```

## Test
```bash
npm test          # unit and integration tests (Vitest)
npm run e2e       # browser smoke tests (Playwright, desktop and phone)
npm run typecheck
npm run build
```

## Controls
| Action | Desktop | Touch |
|---|---|---|
| Pan | Drag, right/middle drag, arrow keys, WASD | One-finger drag |
| Zoom | Mouse wheel, `+` / `−` | Pinch |
| Select | Click | Tap |
| Pause / speed | `Space`, `1` `2` `3` | HUD buttons |

## Tech
TypeScript, Vite, Canvas 2D. No runtime dependencies. Simulation code in `src/sim/` is deterministic and runs without a browser.
