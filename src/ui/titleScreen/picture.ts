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

/**
 * RGBA bytes, length w * h * 4. Index -1 is a transparent run. Pure. Bad data fails loudly: an index outside the
 * palette, a row whose runs do not add up to `w`, or a number of rows other than `h` throws an Error.
 */
export function decodePicture(data: PictureData): Uint8ClampedArray {
  const { w, h, palette, rows } = data;
  if (rows.length !== h) throw new Error(`picture has ${rows.length} rows, not ${h}`);
  const rgb = palette.map((c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)] as const);
  const px = new Uint8ClampedArray(w * h * 4);
  rows.forEach((runs, y) => {
    let x = 0;
    for (const run of runs) {
      const i = run[0] ?? -1;
      const n = run[1] ?? 0;
      if (x + n > w) throw new Error(`picture row ${y}: the runs add up to ${x + n} px or more, not ${w}`);
      if (i === -1) {
        x += n;
        continue;
      }
      const c = rgb[i];
      if (!c) throw new Error(`picture row ${y}: palette index ${i} is outside the palette of ${palette.length}`);
      let p = (y * w + x) * 4;
      for (let k = 0; k < n; k++) {
        px[p] = c[0];
        px[p + 1] = c[1];
        px[p + 2] = c[2];
        px[p + 3] = 255;
        p += 4;
      }
      x += n;
    }
    if (x !== w) throw new Error(`picture row ${y}: the runs add up to ${x} px, not ${w}`);
  });
  return px;
}

const lastRows = new WeakMap<PictureData, PictureData>();

/**
 * The picture's last row as a picture of its own (w x 1): the fill below a scene repeats it downward, so each column
 * keeps its own colour (G7). The same object for the same picture. Pure.
 */
export function lastRowPicture(data: PictureData): PictureData {
  const known = lastRows.get(data);
  if (known) return known;
  const row: PictureData = { w: data.w, h: 1, palette: data.palette, rows: data.rows.slice(-1) };
  lastRows.set(data, row);
  return row;
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
