/** The 20 SFX recipes of Phase 6 §4.2 by id (bus, priority, length, loop: `SFX` in `../types.ts`). Owner: W4-A. */
import type { SfxId } from '../types';
import type { Recipe } from './kit';
import { coasterChain, coasterRumble, crowd, rain } from './loops';
import {
  award,
  breakdown,
  buildPath,
  buildPlace,
  cashIn,
  coasterCheer,
  demolish,
  fwBurst,
  fwLaunch,
  lightSwoosh,
  rideBell,
  splash,
  thunder,
  uiClick,
  uiError,
  uiOpen,
} from './oneShots';

export type { Recipe, RecipeEnv, SfxVoice } from './kit';
export { createNoiseBank, type NoiseBank } from './noise';

export const RECIPES: Readonly<Record<SfxId, Recipe>> = Object.freeze({
  ui_click: uiClick,
  ui_open: uiOpen,
  ui_error: uiError,
  build_place: buildPlace,
  build_path: buildPath,
  demolish,
  cash_in: cashIn,
  ride_bell: rideBell,
  coaster_chain: coasterChain,
  coaster_rumble: coasterRumble,
  coaster_cheer: coasterCheer,
  splash,
  breakdown,
  award,
  rain,
  thunder,
  crowd,
  fw_launch: fwLaunch,
  fw_burst: fwBurst,
  light_swoosh: lightSwoosh,
});
