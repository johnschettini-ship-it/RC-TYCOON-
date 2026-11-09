/**
 * Light overlay bands and legend data (Phase 4 §4.7, §7 Overlays row). Owner: W3-F. Pure.
 * W3-E's overlay UI (chip row, legend card, value on tap or hover) reads `lightLegend()` and `lightBand()` for the
 * Light entry, and the tile value from `lightAt` (`sim/lighting/api.ts`). Each band has a hatch, so colour is not
 * the only signal.
 */
import { text } from '../../data/strings/en';
import { LIT_THRESHOLD } from '../../data/tuning/night';

export type LightBandId = 'dark' | 'lit' | 'bright';
export type LightHatch = 'dense' | 'sparse' | 'none';

export interface LightBandDef {
  id: LightBandId;
  /** Inclusive range of the read value `min(255, lightRaw)`. */
  min: number;
  max: number;
  labelKey: string;
  /** Overlay tint (CSS colour). */
  colour: string;
  /** Legend swatch (opaque CSS colour). */
  swatch: string;
  hatch: LightHatch;
}

/** Bright starts where two lamps overlap a tile or one lamp is next to it. */
export const LIGHT_BRIGHT_FROM = 192;

export const LIGHT_BANDS: readonly LightBandDef[] = [
  { id: 'dark', min: 0, max: LIT_THRESHOLD - 1, labelKey: 'night.legend.dark', colour: 'rgba(36, 40, 104, 0.6)', swatch: '#2e3478', hatch: 'dense' },
  { id: 'lit', min: LIT_THRESHOLD, max: LIGHT_BRIGHT_FROM - 1, labelKey: 'night.legend.lit', colour: 'rgba(255, 200, 87, 0.42)', swatch: '#e8b450', hatch: 'sparse' },
  { id: 'bright', min: LIGHT_BRIGHT_FROM, max: 255, labelKey: 'night.legend.bright', colour: 'rgba(255, 243, 190, 0.6)', swatch: '#fff0b8', hatch: 'none' },
];

/** Band of a light read value 0–255: Dark < 96 (unlit), Lit 96–191, Bright ≥ 192. */
export function lightBand(value: number): LightBandId {
  if (value < LIT_THRESHOLD) return 'dark';
  if (value < LIGHT_BRIGHT_FROM) return 'lit';
  return 'bright';
}

export function lightBandIndex(value: number): 0 | 1 | 2 {
  return value < LIT_THRESHOLD ? 0 : value < LIGHT_BRIGHT_FROM ? 1 : 2;
}

export interface LightLegend {
  title: string;
  bands: Array<{ id: LightBandId; label: string; range: string; swatch: string; hatch: LightHatch }>;
}

/** Legend card content: the band names and their thresholds. */
export function lightLegend(): LightLegend {
  return {
    title: text('night.legend.title'),
    bands: LIGHT_BANDS.map((b) => ({ id: b.id, label: text(b.labelKey), range: `${b.min}–${b.max}`, swatch: b.swatch, hatch: b.hatch })),
  };
}

/** Value readout for a hovered or tapped tile, for example "Light 164". */
export function lightValueLabel(value: number): string {
  return text('night.legend.value', { value });
}
