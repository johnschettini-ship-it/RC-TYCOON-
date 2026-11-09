/**
 * Overlay legend and chip data (Phase 4 §4.6, §7), without the DOM so it is testable: the chip row (None, Calm,
 * Buzz, Light, Temperament), the 4 band names and thresholds of Calm and Buzz with their tint and hatch, the Light
 * and Temperament legends, and the exact value of a tile. Owner: W3-E.
 */
import { text } from '../../data/strings/en';
import { FIELD_BANDS } from '../../data/tuning/fields';
import { LIGHT_MAX, LIT_THRESHOLD, NIGHT_AMBIENT } from '../../data/tuning/night';
import { FIELD_OVERLAY_STYLE } from '../../render/fields/style';
import { rgbCss, temperamentTint } from '../../render/palette';
import { OVERLAY_CYCLE, type OverlayId } from '../../render/types';
import { fieldBand, type FieldBand } from '../../sim/fields/api';
import { displayFieldValue } from '../../sim/fields/store';
import { lightAt } from '../../sim/lighting/api';
import type { World } from '../../sim/types';

export interface LegendRow {
  key: string;
  name: string;
  /** Threshold text, for example "20–59". */
  range: string;
  /** Tint over the ground swatch (Calm, Buzz) or a solid colour (Light, Temperament); null = none. */
  fill: string | null;
  /** Hatch lines and their colour and direction (Calm and Buzz only). */
  hatch: number;
  stroke: string | null;
  hatchDir: 'calm' | 'buzz' | null;
}

export interface Legend {
  overlay: OverlayId;
  title: string;
  help: string;
  rows: LegendRow[];
}

const BANDS: readonly FieldBand[] = ['none', 'low', 'medium', 'high'];

export function overlayName(overlay: OverlayId): string {
  return text(`fields.overlay.${overlay}`);
}

/** Chips in cycle order. */
export function overlayChips(): { id: OverlayId; label: string }[] {
  return OVERLAY_CYCLE.map((id) => ({ id, label: overlayName(id) }));
}

/** Threshold text of band k (0–3) from `FIELD_BANDS`: "< 20", "20–59", "60–119", "≥ 120". */
export function bandRange(k: number): string {
  const [a, b, c] = FIELD_BANDS;
  if (k === 0) return text('fields.band.below', { max: a });
  if (k === 1) return text('fields.band.range', { min: a, max: b - 1 });
  if (k === 2) return text('fields.band.range', { min: b, max: c - 1 });
  return text('fields.band.atLeast', { min: c });
}

export function bandName(band: FieldBand): string {
  return text(`fields.band.${band}`);
}

function fieldLegend(overlay: 'calm' | 'buzz'): Legend {
  const styles = FIELD_OVERLAY_STYLE[overlay];
  return {
    overlay,
    title: overlayName(overlay),
    help: text(overlay === 'calm' ? 'fields.legend.calmHelp' : 'fields.legend.buzzHelp'),
    rows: BANDS.map((band, k) => {
      const s = styles[k];
      return { key: band, name: bandName(band), range: bandRange(k), fill: s?.fill ?? null, hatch: s?.hatch ?? 0, stroke: s?.stroke ?? null, hatchDir: overlay };
    }),
  };
}

const AMBIENT = rgbCss([NIGHT_AMBIENT.r, NIGHT_AMBIENT.g, NIGHT_AMBIENT.b]);
const LIT = 'rgb(255,214,128)';

/** The legend card of an overlay, or null for None (and overlays outside the cycle). */
export function legendFor(overlay: OverlayId): Legend | null {
  switch (overlay) {
    case 'calm':
    case 'buzz':
      return fieldLegend(overlay);
    case 'light':
      return {
        overlay,
        title: overlayName(overlay),
        help: text('fields.legend.lightHelp'),
        rows: [
          { key: 'dark', name: text('fields.light.dark'), range: text('fields.band.below', { max: LIT_THRESHOLD }), fill: AMBIENT, hatch: 0, stroke: null, hatchDir: null },
          { key: 'lit', name: text('fields.light.lit'), range: text('fields.band.atLeast', { min: LIT_THRESHOLD }), fill: LIT, hatch: 0, stroke: null, hatchDir: null },
        ],
      };
    case 'temperament':
      return {
        overlay,
        title: overlayName(overlay),
        help: text('fields.legend.temperamentHelp'),
        rows: [
          { key: 'chill', name: text('ui.tag.chill'), range: text('fields.band.range', { min: 0, max: 35 }), fill: rgbCss(temperamentTint(0)), hatch: 0, stroke: null, hatchDir: null },
          { key: 'family', name: text('ui.tag.family'), range: text('fields.band.range', { min: 36, max: 64 }), fill: rgbCss(temperamentTint(50)), hatch: 0, stroke: null, hatchDir: null },
          { key: 'thrill', name: text('ui.tag.thrill'), range: text('fields.band.range', { min: 65, max: 100 }), fill: rgbCss(temperamentTint(100)), hatch: 0, stroke: null, hatchDir: null },
        ],
      };
    default:
      return null;
  }
}

/** "Calm here: 102 (Medium)" for the hovered or tapped tile; null when the overlay has no tile value. */
export function tileValueText(world: World, overlay: OverlayId, tile: number | null): string | null {
  const map = world.state.map;
  if (tile === null || tile < 0 || tile >= map.width * map.height) return null;
  if (overlay === 'calm' || overlay === 'buzz') {
    const value = displayFieldValue(world, overlay, tile);
    return text('fields.value', { overlay: overlayName(overlay), value, band: bandName(fieldBand(value)) });
  }
  if (overlay === 'light') {
    const value = Math.max(0, Math.min(LIGHT_MAX, Math.round(lightAt(world, tile))));
    return text('fields.value', { overlay: overlayName(overlay), value, band: text(value >= LIT_THRESHOLD ? 'fields.light.lit' : 'fields.light.dark') });
  }
  return null;
}
