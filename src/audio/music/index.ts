/**
 * Procedural music (Phase 6 §4.3). Owner: W4-B. Neutral stubs: no notes, silent player, default theme.
 *
 * Contract:
 * - `generatePhrase(theme, seed, section)`: 8 bars of the A A B A form for `section` (0–3). Same input → same notes
 *   (tested); melody notes only from the theme scale, mostly steps of ≤ 2 degrees, a chord tone on beats 1 and 3;
 *   bass on chord roots on beats 1 and 3; drums sine kick, noise snare, high-pass noise hat. Chords from the theme's
 *   chord table with a Markov transition table. Its RNG is its own (seeded), never the sim RNG.
 * - `chooseTheme(world, view)`: the scenery theme with the most items in view; default Classic Fair. Title screen:
 *   `title` (the audio client decides when).
 * - `createMusicPlayer(host)`: 25 ms timer, 100 ms lookahead on `host.ctx.currentTime`, 4 s crossfade on a theme
 *   change, night variant (tempo × 0.85, lead low-pass 1.5 kHz, generated 2 s reverb) with After Dark at night.
 */
import type { World } from '../../sim/types';
import type { MusicHost, MusicPlayer, MusicThemeId, NoteEvent } from '../types';

export function generatePhrase(theme: MusicThemeId, seed: number, section: number): NoteEvent[] {
  void theme;
  void seed;
  void section;
  return [];
}

/** The visible tile rectangle (inclusive) the theme choice counts scenery in. */
export interface ViewTiles {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function chooseTheme(world: World, view: ViewTiles): MusicThemeId {
  void world;
  void view;
  return 'classic_fair';
}

export function createMusicPlayer(host: MusicHost): MusicPlayer {
  void host;
  return { setTheme() {}, update() {}, stop() {} };
}
