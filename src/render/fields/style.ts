/**
 * Calm and Buzz overlay styles (Phase 4 §4.6): Calm is teal, Buzz is orange. Each band has a tint and a hatch
 * density, so colour is not the only signal; Calm hatches run one way and Buzz hatches the other. The legend
 * (`src/ui/overlays`) uses the same values. Owner: W3-E.
 */
import { FIELD_BANDS } from '../../data/tuning/fields';
import type { FieldBand } from '../../sim/fields/api';

export type FieldOverlay = 'calm' | 'buzz';

export interface BandStyle {
  band: FieldBand;
  /** Tile tint (canvas fill style), or null for no tint. */
  fill: string | null;
  /** Hatch line colour. */
  stroke: string;
  /** Hatch lines per tile (0 = none). */
  hatch: number;
}

/** Ground colour behind legend swatches (the grass the tint sits on). */
export const LEGEND_GROUND = '#6dbb4f';

const CALM_RGB = [36, 196, 182] as const;
const BUZZ_RGB = [255, 104, 16] as const;
const ALPHA = [0, 0.4, 0.55, 0.75] as const;
const HATCH = [0, 1, 2, 4] as const;
const BANDS: readonly FieldBand[] = ['none', 'low', 'medium', 'high'];

function styles(rgb: readonly [number, number, number], hatchRgb: readonly [number, number, number]): readonly BandStyle[] {
  return Object.freeze(
    BANDS.map((band, k) =>
      Object.freeze({
        band,
        fill: k === 0 ? null : `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${ALPHA[k]})`,
        stroke: `rgba(${hatchRgb[0]},${hatchRgb[1]},${hatchRgb[2]},0.85)`,
        hatch: HATCH[k] as number,
      }),
    ),
  );
}

export const FIELD_OVERLAY_STYLE: Readonly<Record<FieldOverlay, readonly BandStyle[]>> = Object.freeze({
  calm: styles(CALM_RGB, [8, 84, 78]),
  buzz: styles(BUZZ_RGB, [120, 46, 0]),
});

/** Band index 0–3 (None, Low, Medium, High) of a read value. */
export function bandIndex(value: number): number {
  return value < FIELD_BANDS[0] ? 0 : value < FIELD_BANDS[1] ? 1 : value < FIELD_BANDS[2] ? 2 : 3;
}
