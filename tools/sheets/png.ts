/** Phase 8b stage 0b test (never merged): indexed PNG writer and content-hash sheet names. */
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { crc32 } from '../../src/render/pixel/app/format';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** One chunk: length, type, data, CRC-32 over type and data. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

/**
 * Indexed PNG (colour type 3, bit depth 8): PLTE with every slot of `paletteRgb`, tRNS of one byte 0 (slot 0
 * transparent, all others opaque), one IDAT (filter 0 on every row, deflate `level`, 9 by default), IEND.
 * No gAMA, cHRM, sRGB or iCCP, so the browser does no colour-space work.
 */
export function encodeIndexedPng(w: number, h: number, slots: Uint8Array, paletteRgb: Uint8Array, level = 9): Uint8Array {
  if (slots.length !== w * h) throw new Error(`encodeIndexedPng: ${slots.length} slots for ${w} × ${h}`);
  const entries = paletteRgb.length / 3;
  if (!Number.isInteger(entries) || entries < 1 || entries > 256) throw new Error(`encodeIndexedPng: ${entries} palette entries`);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 3; // colour type: palette
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // no interlace
  const raw = new Uint8Array((w + 1) * h);
  for (let y = 0; y < h; y++) raw.set(slots.subarray(y * w, (y + 1) * w), y * (w + 1) + 1);
  const parts = [
    new Uint8Array(SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('PLTE', paletteRgb),
    chunk('tRNS', new Uint8Array([0])),
    chunk('IDAT', new Uint8Array(deflateSync(raw, { level }))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** First 10 hex digits of SHA-256 over the palette, then the slots (not the PNG bytes). */
export function sheetName(slots: Uint8Array, paletteRgb: Uint8Array): string {
  return createHash('sha256').update(paletteRgb).update(slots).digest('hex').slice(0, 10);
}
