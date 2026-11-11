/**
 * The pixel pictures of the title screen come as data (the game ships no image files): a palette and, per row, runs
 * of palette indices (`-1` = transparent). Written by `tools/title-art/export.py`.
 */

export interface PictureData {
  w: number;
  h: number;
  palette: string[];
  rows: number[][][];
}

/** RGBA bytes, length w * h * 4. Index -1 is a transparent run. Pure. */
export function decodePicture(data: PictureData): Uint8ClampedArray {
  const { w, h, palette, rows } = data;
  const rgb = palette.map((c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)] as const);
  const px = new Uint8ClampedArray(w * h * 4);
  let p = 0;
  for (const runs of rows) {
    for (const run of runs) {
      const i = run[0] ?? -1;
      const n = run[1] ?? 0;
      const c = rgb[i];
      if (i < 0 || !c) {
        p += 4 * n;
        continue;
      }
      for (let k = 0; k < n; k++) {
        px[p] = c[0];
        px[p + 1] = c[1];
        px[p + 2] = c[2];
        px[p + 3] = 255;
        p += 4;
      }
    }
  }
  return px;
}

/** The most frequent colour of the picture's last row (the lawn under the scenes), as `#rrggbb`. Pure. */
export function lastRowColour(data: PictureData): string {
  const counts = new Map<number, number>();
  for (const run of data.rows[data.rows.length - 1] ?? []) {
    const i = run[0] ?? -1;
    if (i >= 0) counts.set(i, (counts.get(i) ?? 0) + (run[1] ?? 0));
  }
  let best = -1;
  let most = 0;
  for (const [i, n] of counts) if (n > most) [best, most] = [i, n];
  return data.palette[best] ?? data.palette[0] ?? '';
}

const canvases = new WeakMap<PictureData, HTMLCanvasElement>();

/** A canvas of the picture's own size (1 canvas px = 1 art px). Decodes on the first call for a picture, then reuses. */
export function pictureCanvas(data: PictureData): HTMLCanvasElement {
  const known = canvases.get(data);
  if (known) return known;
  const canvas = document.createElement('canvas');
  canvas.width = data.w;
  canvas.height = data.h;
  const img = new ImageData(data.w, data.h);
  img.data.set(decodePicture(data));
  canvas.getContext('2d')?.putImageData(img, 0, 0);
  canvases.set(data, canvas);
  return canvas;
}
