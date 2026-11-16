/**
 * Node side of the tint mask PNGs (png.ts): the bake driver compresses each mask's image data again with node's zlib
 * at level 9, which the page's CompressionStream does not offer (about 12% smaller). Not part of the pictures, so not
 * in the bake cache key.
 */
import { crc32 } from './png';

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** The same PNG with its image data compressed again by `deflate`. Chunks other than IDAT are kept; the IDATs become one. */
export function repackPng(png: Uint8Array, inflate: (z: Uint8Array) => Uint8Array, deflate: (raw: Uint8Array) => Uint8Array): Uint8Array {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  if (png.length < 8 || dv.getUint32(0) !== 0x89504e47) throw new Error('repackPng: not a PNG');
  const before: Uint8Array[] = [], after: Uint8Array[] = [], idat: Uint8Array[] = [];
  let o = 8;
  while (o < png.length) {
    const len = dv.getUint32(o);
    const type = String.fromCharCode(...png.subarray(o + 4, o + 8));
    if (type === 'IDAT') idat.push(png.subarray(o + 8, o + 8 + len));
    else (idat.length ? after : before).push(png.subarray(o, o + 12 + len));
    o += 12 + len;
  }
  const z = new Uint8Array(idat.reduce((n, p) => n + p.length, 0));
  let k = 0;
  for (const p of idat) { z.set(p, k); k += p.length; }
  const parts = [png.subarray(0, 8), ...before, chunk('IDAT', deflate(inflate(z))), ...after];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let w = 0;
  for (const p of parts) { out.set(p, w); w += p.length; }
  return out;
}
