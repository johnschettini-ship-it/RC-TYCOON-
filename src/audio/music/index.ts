/**
 * Procedural music (Phase 6 §4.3). Owner: W4-B. Public entry of `src/audio/music/`; W4-A's audio client calls it.
 * All music is generated in code from original theme tables (`./themes.ts`); the game ships no audio files.
 *
 * Contract:
 * - `generatePhrase(theme, seed, section)`: 8 bars of the A A B A form for `section` (0–3). Same input → same notes
 *   (tested); melody notes only from the theme scale, mostly steps of ≤ 2 degrees, a chord tone on beats 1 and 3;
 *   bass on chord roots on beats 1 and 3; drums sine kick, noise snare, high-pass noise hat. Chords from the theme's
 *   chord table with a Markov transition table. Its RNG is its own (seeded), never the sim RNG.
 * - `chooseTheme(world, view, current?)`: the scenery theme with the most items in view; default Classic Fair; a tie
 *   keeps `current`. `viewTilesForCamera(camera, cssW, cssH, map)` turns the camera into the tile rectangle.
 * - `chooseMusic(world, view, onTitle, current?)`: the `setTheme` arguments: `title` on the title screen, else the
 *   theme in view with `night` = `nightActive(world)`.
 * - `createMusicPlayer(host)`: 25 ms timer, 100 ms lookahead on `host.ctx.currentTime`, 4 s crossfade on a theme
 *   change, night variant (tempo × 0.85, lead low-pass 1.5 kHz, generated 2 s reverb) with After Dark at night.
 *
 * Wiring (W4-A, once `engine.musicHost()` is not null): `const music = createMusicPlayer(host)`; every frame
 * `choice = chooseMusic(world, viewTilesForCamera(camera, cssW, cssH, map), titleOpen(), choice?.theme)`,
 * `music.setTheme(choice.theme, choice.night)` (a no-op while nothing changes), then `music.update(nowMs)`.
 */
export { composePhrase, formLetter, generatePhrase, phraseBeats, swingBeat, type BarChord, type Phrase } from './generate';
export { chooseMusic, chooseTheme, DEFAULT_THEME, viewTilesForCamera, type MusicChoice, type ViewTiles } from './choose';
export { createMusicPlayer, deckParams, type DeckParams, type MusicPlayerOptions } from './player';
