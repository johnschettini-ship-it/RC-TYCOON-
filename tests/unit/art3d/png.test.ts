import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32, filterRows, greyPng } from '../../../tools/art3d/png';
import { repackPng } from '../../../tools/art3d/pngRepack';

const deflate = async (raw: Uint8Array): Promise<Uint8Array> => new Uint8Array(deflateSync(raw));

/** A minimal PNG reader for 8-bit grey: checks signature, chunk CRCs and IHDR, and undoes the row filters. */
function readGrey(png: Uint8Array): { w: number; h: number; px: Uint8Array } {
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let o = 8, w = 0, h = 0;
  const idat: Uint8Array[] = [];
  const types: string[] = [];
  while (o < png.length) {
    const len = dv.getUint32(o);
    const type = String.fromCharCode(...png.subarray(o + 4, o + 8));
    const data = png.subarray(o + 8, o + 8 + len);
    expect(dv.getUint32(o + 8 + len), `${type} crc`).toBe(crc32(png.subarray(o + 4, o + 8 + len)));
    types.push(type);
    if (type === 'IHDR') { w = dv.getUint32(o + 8); h = dv.getUint32(o + 12); expect([...data.subarray(8)]).toEqual([8, 0, 0, 0, 0]); }
    if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  expect(types).toEqual(['IHDR', 'IDAT', 'IEND']);
  const raw = new Uint8Array(inflateSync(Buffer.concat(idat)));
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (w + 1)]!;
    for (let x = 0; x < w; x++) {
      const r = raw[y * (w + 1) + 1 + x]!;
      const a = x > 0 ? px[y * w + x - 1]! : 0, b = y > 0 ? px[(y - 1) * w + x]! : 0, c = x > 0 && y > 0 ? px[(y - 1) * w + x - 1]! : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      px[y * w + x] = (r + pred) & 0xff;
    }
  }
  return { w, h, px };
}

describe('grey PNG (tint masks)', () => {
  it('crc32 of "IEND" is the PNG constant', () => {
    expect(crc32(new TextEncoder().encode('IEND'))).toBe(0xae426082);
  });
  it('round-trips a mask: flat black, white parts, soft edge levels', async () => {
    const w = 37, h = 23;
    const px = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = x > 10 && x < 25 && y > 4 ? 255 : x === 10 ? 146 : (x * 7 + y * 13) % 5 === 0 ? 36 : 0;
    const png = await greyPng(px, w, h, deflate);
    const back = readGrey(png);
    expect([back.w, back.h]).toEqual([w, h]);
    expect([...back.px]).toEqual([...px]);
  });
  it('each row picks the filter of least sum (none, sub, up; a flat row: sub)', () => {
    const w = 16, h = 4;
    const px = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) { px[x] = 0; px[w + x] = x * 10; px[2 * w + x] = x * 10; px[3 * w + x] = 200; }
    const f = filterRows(px, w, h);
    expect([0, 1, 2, 3].map((y) => f[y * (w + 1)])).toEqual([0, 1, 2, 1]);
  });
  it('a big flat mask stays small', async () => {
    const w = 2000, h = 1100;
    const px = new Uint8Array(w * h);
    for (let y = 500; y < 540; y++) px.fill(255, y * w + 900, y * w + 960);
    expect((await greyPng(px, w, h, deflate)).length).toBeLessThan(10_000);
  });
  it('rejects a buffer of the wrong size', () => {
    expect(() => filterRows(new Uint8Array(5), 2, 2)).toThrow(/5 bytes for a 2x2/);
  });
});

describe('repackPng', () => {
  it('recompresses the image data and keeps the image', async () => {
    const w = 300, h = 200;
    const px = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = (x * x + y) % 97 < 30 ? 255 : 0;
    const fast = await greyPng(px, w, h, async (raw) => new Uint8Array(deflateSync(raw, { level: 1 })));
    const best = repackPng(fast, (z) => new Uint8Array(inflateSync(z)), (raw) => new Uint8Array(deflateSync(raw, { level: 9, memLevel: 9 })));
    expect(best.length).toBeLessThan(fast.length);
    expect([...readGrey(best).px]).toEqual([...px]);
    expect(() => repackPng(new Uint8Array(16), inflateSync, deflateSync)).toThrow(/not a PNG/);
  });
});
