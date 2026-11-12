/** Phase 8b stage 0b test (never merged): index codec, CRC-32, indexed PNG, palette swap, trimmed hash, sheet names. */
import { inflateSync } from 'node:zlib';
import * as zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  INDEX_MAGIC,
  INDEX_VERSION,
  crc32,
  decodeIndex,
  encodeIndex,
  swapPalette,
  swapTableIndex,
  trimmedHash,
  type PackIndex,
} from '../../../../src/render/pixel/app/format';
import { encodeIndexedPng, sheetName } from '../../../../tools/sheets/png';
import { paintPicture, pictureHash, trim } from '../../../../tools/sheets/picture';

/** The chunks of a PNG: type, data offset and length. */
function chunks(png: Uint8Array): Array<{ type: string; at: number; len: number }> {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const out: Array<{ type: string; at: number; len: number }> = [];
  let p = 8;
  while (p < png.length) {
    const len = dv.getUint32(p);
    out.push({ type: String.fromCharCode(...png.subarray(p + 4, p + 8)), at: p + 8, len });
    p += 12 + len;
  }
  return out;
}

const PAL4 = new Uint8Array([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]);

function sampleIndex(): PackIndex {
  return {
    palette: new Uint8Array([0, 0, 0, 10, 20, 30, 40, 50, 60]),
    swaps: [new Uint8Array([0, 2, 1]), new Uint8Array([0, 1, 2])],
    sheets: [
      { file: 'art/objects/stall-0123456789.png', w: 64, h: 32, swappable: 0 },
      { file: 'art/track/rail-ü-abcdef0123.png', w: 2048, h: 1024, swappable: 1 },
    ],
    kind: new Uint8Array([1, 9, 13]),
    key: new Float64Array([2 ** 47 + 5, 3, 0.5]),
    sheet: new Uint16Array([0, 1, 1]),
    x: new Uint16Array([2, 2, 100]),
    y: new Uint16Array([2, 40, 2]),
    w: new Uint16Array([10, 20, 30]),
    h: new Uint16Array([11, 21, 31]),
    ox: new Int16Array([-7, 5, 0]),
    oy: new Int16Array([3, -2, 40]),
  };
}

/** An RGBA image of `w × h` with the given opaque pixels. */
function rgbaImage(w: number, h: number, px: Array<[number, number, number]>): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (const [x, y, rgb] of px) {
    const k = (y * w + x) * 4;
    out[k] = (rgb >> 16) & 255;
    out[k + 1] = (rgb >> 8) & 255;
    out[k + 2] = rgb & 255;
    out[k + 3] = 255;
  }
  return out;
}

describe('pack index', () => {
  it('index round trip', () => {
    const ix = sampleIndex();
    const bytes = encodeIndex(ix);
    expect(new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true)).toBe(INDEX_MAGIC);
    expect(new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true)).toBe(INDEX_VERSION);
    expect(decodeIndex(bytes)).toEqual(ix);
  });
  it('index rejects a wrong magic', () => expect(() => decodeIndex(new Uint8Array(16))).toThrow());
  it('index rejects a wrong version', () => {
    const bytes = encodeIndex(sampleIndex());
    new DataView(bytes.buffer, bytes.byteOffset).setUint32(4, INDEX_VERSION + 1, true);
    expect(() => decodeIndex(bytes)).toThrow();
  });
  it('swap table numbers', () => {
    expect(swapTableIndex(1, -1)).toBe(-1);
    expect(swapTableIndex(1, 0)).toBe(0);
    expect(swapTableIndex(2, 6)).toBe(18);
    expect(swapTableIndex(3, 11)).toBe(35);
    expect(swapTableIndex(4, 0)).toBe(36);
    expect(swapTableIndex(4, 1)).toBe(37);
    expect(() => swapTableIndex(0, 3)).toThrow();
    expect(() => swapTableIndex(4, 2)).toThrow();
  });
});

describe('indexed PNG', () => {
  it('PNG is indexed, has no colour-space chunk, index 0 transparent', () => {
    const slots = new Uint8Array([0, 1, 2, 3, 2, 1]);
    const png = encodeIndexedPng(3, 2, slots, PAL4);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const cs = chunks(png);
    expect(cs.map((c) => c.type)).toEqual(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);
    expect(png[24]).toBe(8); // bit depth
    expect(png[25]).toBe(3); // colour type: palette
    const plte = cs[1]!;
    expect(plte.len).toBe(12);
    expect([...png.subarray(plte.at, plte.at + plte.len)]).toEqual([...PAL4]);
    const trns = cs[2]!;
    expect([...png.subarray(trns.at, trns.at + trns.len)]).toEqual([0]);
    const idat = cs[3]!;
    const raw = inflateSync(png.subarray(idat.at, idat.at + idat.len));
    expect([...raw]).toEqual([0, 0, 1, 2, 0, 3, 2, 1]);
    for (const c of cs) {
      const crc = new DataView(png.buffer, png.byteOffset).getUint32(c.at + c.len);
      expect(crc).toBe(crc32(png, c.at - 4, c.at + c.len));
    }
  });
  it('crc32 matches zlib', () => {
    const bytes = new TextEncoder().encode('Thrills & Chills stage 0b');
    expect(crc32(bytes, 0, bytes.length)).toBe(zlib.crc32(bytes));
    expect(crc32(bytes, 3, 9)).toBe(zlib.crc32(bytes.subarray(3, 9)));
  });
  it('swapPalette rewrites PLTE only', () => {
    const png = encodeIndexedPng(3, 2, new Uint8Array([0, 1, 2, 3, 2, 1]), PAL4);
    const out = swapPalette(png, new Uint8Array([0, 2, 1, 3]), PAL4);
    expect(out).not.toBe(png);
    expect(out.length).toBe(png.length);
    const a = chunks(png);
    const b = chunks(out);
    expect(b.map((c) => c.type)).toEqual(a.map((c) => c.type));
    const plte = b[1]!;
    expect([...out.subarray(plte.at, plte.at + plte.len)]).toEqual([0, 0, 0, 0, 255, 0, 255, 0, 0, 0, 0, 255]);
    expect(new DataView(out.buffer, out.byteOffset).getUint32(plte.at + plte.len)).toBe(crc32(out, plte.at - 4, plte.at + plte.len));
    // Every byte outside the PLTE data and its CRC is unchanged (IDAT included).
    for (let i = 0; i < png.length; i++) if (i < plte.at || i >= plte.at + plte.len + 4) expect(out[i], `byte ${i}`).toBe(png[i]);
  });
  it('sheetName depends on palette and slots, not on PNG bytes', () => {
    const slots = new Uint8Array(64 * 16).map((_, i) => (i * 7) % 4);
    const fast = encodeIndexedPng(64, 16, slots, PAL4, 1);
    const best = encodeIndexedPng(64, 16, slots, PAL4, 9);
    expect(Buffer.from(fast).equals(Buffer.from(best))).toBe(false);
    const name = sheetName(slots, PAL4);
    expect(name).toMatch(/^[0-9a-f]{10}$/);
    const other = slots.slice();
    other[5] = ((other[5] as number) + 1) % 4;
    expect(sheetName(other, PAL4)).not.toBe(name);
    const pal = PAL4.slice();
    pal[3] = 254;
    expect(sheetName(slots, pal)).not.toBe(name);
  });
});

describe('trimmed hash', () => {
  it('trimmedHash ignores padding and skipped pixels', () => {
    const blk: Array<[number, number, number]> = [
      [0, 0, 0xff0000],
      [1, 0, 0x00ff00],
      [0, 1, 0x0000ff],
      [1, 1, 0x123456],
    ];
    const big = rgbaImage(4, 4, blk.map(([x, y, c]) => [x + 1, y + 1, c]));
    const small = rgbaImage(2, 2, blk);
    expect(trimmedHash(big, 4, 4, 1, 1, -1)).toBe(trimmedHash(small, 2, 2, 0, 0, -1));
    const skip = 0x6e4470;
    const third = rgbaImage(4, 4, [...blk.map(([x, y, c]): [number, number, number] => [x + 1, y + 1, c]), [3, 3, skip]]);
    expect(trimmedHash(third, 4, 4, 1, 1, skip)).toBe(trimmedHash(small, 2, 2, 0, 0, skip));
    expect(trimmedHash(third, 4, 4, 1, 1, -1)).not.toBe(trimmedHash(small, 2, 2, 0, 0, -1));
    // A different anchor changes the hash.
    expect(trimmedHash(small, 2, 2, 1, 0, -1)).not.toBe(trimmedHash(small, 2, 2, 0, 0, -1));
    // An empty image hashes the four zeros, whatever its size.
    expect(trimmedHash(new Uint8Array(16), 2, 2, 0, 0, -1)).toBe(trimmedHash(new Uint8Array(36), 3, 3, 1, 1, -1));
  });
});

describe('pictures', () => {
  it('paintPicture uses even bounds; trim drops empty borders and keeps the anchor', () => {
    const p = paintPicture({ left: -11, right: 9, top: -13, bottom: 5 }, (c) => {
      c.fillStyle = '#ff0000';
      c.fillRect(-4, -4, 8, 4);
    });
    expect(p.slots.length).toBe(p.w * p.h);
    const t = trim(p);
    expect(t.w).toBeLessThan(p.w);
    expect(t.h).toBeLessThan(p.h);
    // Every opaque pixel keeps its place relative to the anchor.
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        const v = p.slots[y * p.w + x] as number;
        if (v === 0) continue;
        const tx = x - p.ox + t.ox;
        const ty = y - p.oy + t.oy;
        expect(t.slots[ty * t.w + tx]).toBe(v);
      }
    }
    // Trimmed edges are not empty.
    const col = (x: number): boolean => Array.from({ length: t.h }, (_, y) => t.slots[y * t.w + x]).some((v) => v !== 0);
    const row = (y: number): boolean => Array.from({ length: t.w }, (_, x) => t.slots[y * t.w + x]).some((v) => v !== 0);
    expect(col(0) && col(t.w - 1) && row(0) && row(t.h - 1)).toBe(true);
    expect(pictureHash(t)).toBe(pictureHash(trim(p)));
    expect(pictureHash(t)).not.toBe(pictureHash({ ...t, ox: t.ox + 1 }));
  });
});
