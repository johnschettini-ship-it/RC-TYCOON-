/** Phase 8b stage 0b test (never merged): pack index codec, CRC-32, palette swap and trimmed hash (tool and runtime). */

/** 'TC0B' as a little-endian u32 at byte 0 of every index. */
export const INDEX_MAGIC = 0x54433042;
export const INDEX_VERSION = 1;

/** Swap tables per role: one per track palette colour 0 to 11. */
const ROLE_TABLES = 12;
/** Index of the first ghost table (valid; invalid is the next one). */
const GHOST_BASE = 3 * ROLE_TABLES;

/**
 * The swap table of a sheet. `swappable` 1 to 3 (rt, rs, rc) takes `swap` = a track palette colour 0 to 11;
 * 4 (ghost) takes 0 (valid) or 1 (invalid). `swap` −1 is the plain sheet: −1 comes back.
 */
export function swapTableIndex(swappable: number, swap: number): number {
  if (swap === -1) return -1;
  if (swappable >= 1 && swappable <= 3 && Number.isInteger(swap) && swap >= 0 && swap < ROLE_TABLES) return (swappable - 1) * ROLE_TABLES + swap;
  if (swappable === 4 && (swap === 0 || swap === 1)) return GHOST_BASE + swap;
  throw new Error(`swapTableIndex: no table for swappable ${swappable}, swap ${swap}`);
}

export interface PackSheet {
  file: string;
  w: number;
  h: number;
  /** 0 none, 1 rt, 2 rs, 3 rc, 4 ghost. */
  swappable: number;
}

/** One pack: palette, swap tables, sheets and one entry per picture key (struct of arrays). */
export interface PackIndex {
  /** RGB per slot. */
  palette: Uint8Array;
  /** 38 tables in the order of `swapTableIndex`: slot → slot. */
  swaps: Uint8Array[];
  sheets: PackSheet[];
  kind: Uint8Array;
  key: Float64Array;
  sheet: Uint16Array;
  x: Uint16Array;
  y: Uint16Array;
  w: Uint16Array;
  h: Uint16Array;
  ox: Int16Array;
  oy: Int16Array;
}

// Layout (little-endian): magic u32, version u32, slots u16, palette slots × 3, tables u16, each table `slots` bytes,
// sheets u16, per sheet (name length u16, UTF-8 name, w u16, h u16, swappable u8), entries u32, then the entry
// columns kind u8, key f64, sheet u16, x u16, y u16, w u16, h u16, ox i16, oy i16 (each column whole).

/** Encode a pack index. */
export function encodeIndex(ix: PackIndex): Uint8Array {
  const slots = ix.palette.length / 3;
  if (!Number.isInteger(slots)) throw new Error('encodeIndex: palette length is not a multiple of 3');
  for (const t of ix.swaps) if (t.length !== slots) throw new Error('encodeIndex: a swap table does not match the palette');
  const enc = new TextEncoder();
  const names = ix.sheets.map((s) => enc.encode(s.file));
  const n = ix.kind.length;
  for (const col of [ix.key, ix.sheet, ix.x, ix.y, ix.w, ix.h, ix.ox, ix.oy]) {
    if (col.length !== n) throw new Error('encodeIndex: entry columns differ in length');
  }
  let size = 8 + 2 + slots * 3 + 2 + ix.swaps.length * slots + 2;
  for (const b of names) size += 2 + b.length + 5;
  size += 4 + n * (1 + 8 + 2 * 5 + 2 * 2);
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  let p = 0;
  const u8 = (v: number): void => {
    dv.setUint8(p, v);
    p += 1;
  };
  const u16 = (v: number): void => {
    dv.setUint16(p, v, true);
    p += 2;
  };
  const u32 = (v: number): void => {
    dv.setUint32(p, v, true);
    p += 4;
  };
  const bytes = (b: Uint8Array): void => {
    out.set(b, p);
    p += b.length;
  };
  u32(INDEX_MAGIC);
  u32(INDEX_VERSION);
  u16(slots);
  bytes(ix.palette);
  u16(ix.swaps.length);
  for (const t of ix.swaps) bytes(t);
  u16(ix.sheets.length);
  ix.sheets.forEach((s, i) => {
    const b = names[i] as Uint8Array;
    u16(b.length);
    bytes(b);
    u16(s.w);
    u16(s.h);
    u8(s.swappable);
  });
  u32(n);
  bytes(ix.kind);
  for (let i = 0; i < n; i++) {
    dv.setFloat64(p, ix.key[i] as number, true);
    p += 8;
  }
  for (const col of [ix.sheet, ix.x, ix.y, ix.w, ix.h]) for (let i = 0; i < n; i++) u16(col[i] as number);
  for (const col of [ix.ox, ix.oy]) {
    for (let i = 0; i < n; i++) {
      dv.setInt16(p, col[i] as number, true);
      p += 2;
    }
  }
  if (p !== size) throw new Error('encodeIndex: size mismatch');
  return out;
}

/** Decode a pack index; throws on a wrong magic, version or a short buffer. */
export function decodeIndex(bytes: Uint8Array): PackIndex {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  const need = (k: number): void => {
    if (p + k > bytes.length) throw new Error('decodeIndex: index is cut short');
  };
  const u8 = (): number => {
    need(1);
    return dv.getUint8(p++);
  };
  const u16 = (): number => {
    need(2);
    const v = dv.getUint16(p, true);
    p += 2;
    return v;
  };
  const u32 = (): number => {
    need(4);
    const v = dv.getUint32(p, true);
    p += 4;
    return v;
  };
  const take = (k: number): Uint8Array => {
    need(k);
    const v = bytes.slice(p, p + k);
    p += k;
    return v;
  };
  if (u32() !== INDEX_MAGIC) throw new Error('decodeIndex: wrong magic');
  const version = u32();
  if (version !== INDEX_VERSION) throw new Error(`decodeIndex: version ${version}, expected ${INDEX_VERSION}`);
  const slots = u16();
  const palette = take(slots * 3);
  const tables = u16();
  const swaps: Uint8Array[] = [];
  for (let i = 0; i < tables; i++) swaps.push(take(slots));
  const dec = new TextDecoder();
  const sheets: PackSheet[] = [];
  const nSheets = u16();
  for (let i = 0; i < nSheets; i++) {
    const file = dec.decode(take(u16()));
    const w = u16();
    const h = u16();
    sheets.push({ file, w, h, swappable: u8() });
  }
  const n = u32();
  const kind = take(n);
  const key = new Float64Array(n);
  need(n * 8);
  for (let i = 0; i < n; i++) {
    key[i] = dv.getFloat64(p, true);
    p += 8;
  }
  const col16 = (): Uint16Array => {
    const c = new Uint16Array(n);
    for (let i = 0; i < n; i++) c[i] = u16();
    return c;
  };
  const coli16 = (): Int16Array => {
    const c = new Int16Array(n);
    need(n * 2);
    for (let i = 0; i < n; i++) {
      c[i] = dv.getInt16(p, true);
      p += 2;
    }
    return c;
  };
  const sheet = col16();
  const x = col16();
  const y = col16();
  const w = col16();
  const h = col16();
  const ox = coli16();
  const oy = coli16();
  return { palette, swaps, sheets, kind, key, sheet, x, y, w, h, ox, oy };
}

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (the PNG and zlib polynomial) of `bytes[start, end)`. */
export function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = (CRC_TABLE[(c ^ (bytes[i] as number)) & 255] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * A copy of an indexed PNG whose PLTE entry `i` is `paletteRgb[table[i]]`, with a new PLTE CRC.
 * Every other chunk stays byte-identical.
 */
export function swapPalette(png: Uint8Array, table: Uint8Array, paletteRgb: Uint8Array): Uint8Array {
  const out = png.slice();
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
  let p = 8;
  while (p + 12 <= out.length) {
    const len = dv.getUint32(p);
    const at = p + 8;
    if (out[p + 4] === 0x50 && out[p + 5] === 0x4c && out[p + 6] === 0x54 && out[p + 7] === 0x45) {
      // 'PLTE'
      for (let i = 0; i * 3 < len; i++) {
        const s = (table[i] ?? i) * 3;
        out[at + i * 3] = paletteRgb[s] as number;
        out[at + i * 3 + 1] = paletteRgb[s + 1] as number;
        out[at + i * 3 + 2] = paletteRgb[s + 2] as number;
      }
      dv.setUint32(at + len, crc32(out, p + 4, at + len));
      return out;
    }
    p = at + len + 4;
  }
  throw new Error('swapPalette: no PLTE chunk');
}

/**
 * Hash of the opaque content of an RGBA image, independent of padding: the box of pixels with alpha 255 whose RGB
 * is not `skipRgb` (−1: none); FNV-1a over `x0 − ox, y0 − oy, x1 − ox, y1 − oy` (int32 LE, `x1`, `y1` exclusive)
 * and the RGBA bytes of the box, where every pixel outside that set (skipped or not opaque) counts as 4 zero bytes.
 * An empty box hashes the four zeros.
 */
export function trimmedHash(rgba: Uint8Array, w: number, h: number, ox: number, oy: number, skipRgb: number): number {
  const counted = (k: number): boolean => {
    if (rgba[k * 4 + 3] !== 255) return false;
    const rgb = ((rgba[k * 4] as number) << 16) | ((rgba[k * 4 + 1] as number) << 8) | (rgba[k * 4 + 2] as number);
    return rgb !== skipRgb;
  };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!counted(y * w + x)) continue;
      if (x < x0) x0 = x;
      if (x + 1 > x1) x1 = x + 1;
      if (y < y0) y0 = y;
      if (y + 1 > y1) y1 = y + 1;
    }
  }
  let hv = 0x811c9dc5;
  const byte = (b: number): void => {
    hv = Math.imul(hv ^ (b & 255), 0x01000193) >>> 0;
  };
  const int32 = (v: number): void => {
    for (let s = 0; s < 32; s += 8) byte(v >>> s);
  };
  if (x0 === Infinity) {
    for (let i = 0; i < 4; i++) int32(0);
    return hv >>> 0;
  }
  int32(x0 - ox);
  int32(y0 - oy);
  int32(x1 - ox);
  int32(y1 - oy);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const k = y * w + x;
      if (!counted(k)) {
        for (let i = 0; i < 4; i++) byte(0);
        continue;
      }
      for (let i = 0; i < 4; i++) byte(rgba[k * 4 + i] as number);
    }
  }
  return hv >>> 0;
}
