/**
 * Grey PNG writer for the tint masks (pure: the bake page and the tests both use it). A mask sheet is one channel of
 * mostly flat black with white parts; Chromium's canvas encoders write it badly (lossless WebP took the drop tower's
 * 2% mask to 0.96 MB, an RGBA PNG is larger still), so the bake writes an 8-bit greyscale PNG itself: each row
 * filtered with the PNG filter of least absolute sum (the usual heuristic), then zlib. `deflate` is the zlib
 * compressor (the page: CompressionStream('deflate'); tests: node:zlib), so this file imports nothing.
 */

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = (CRC[(c ^ (bytes[i] as number)) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** The filtered scanlines of a w x h grey image (`grey`: one byte per pixel, rows top down). */
export function filterRows(grey: Uint8Array, w: number, h: number): Uint8Array {
  if (grey.length !== w * h) throw new Error(`png: ${grey.length} bytes for a ${w}x${h} grey image`);
  const out = new Uint8Array(h * (w + 1));
  const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(w));
  for (let y = 0; y < h; y++) {
    const row = grey.subarray(y * w, y * w + w);
    const up = y > 0 ? grey.subarray((y - 1) * w, y * w) : null;
    let best = 0, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const c = cand[f] as Uint8Array;
      let sum = 0;
      for (let x = 0; x < w; x++) {
        const v = row[x] as number, a = x > 0 ? (row[x - 1] as number) : 0, b = up ? (up[x] as number) : 0, cc = up && x > 0 ? (up[x - 1] as number) : 0;
        const p = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, cc);
        const r = (v - p) & 0xff;
        c[x] = r;
        sum += r < 128 ? r : 256 - r;
      }
      if (sum < bestSum) { bestSum = sum; best = f; }
    }
    out[y * (w + 1)] = best;
    out.set(cand[best] as Uint8Array, y * (w + 1) + 1);
  }
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** An 8-bit greyscale PNG of `grey` (w x h, one byte per pixel); `deflate` compresses to zlib format. */
export async function greyPng(grey: Uint8Array, w: number, h: number, deflate: (raw: Uint8Array) => Promise<Uint8Array>): Promise<Uint8Array> {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', await deflate(filterRows(grey, w, h))), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
