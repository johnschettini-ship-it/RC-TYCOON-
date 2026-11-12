/** Phase 8b stage 0b test (never merged): the stage 0 PNG writer (RGBA files for test outputs). */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// ------------------------------------------------------------------ PNG

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = (CRC_TABLE[(c ^ (bytes[i] as number)) & 255] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// One chunk: length, type, data, CRC32 over type and data.
function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data.buffer, data.byteOffset, data.length).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Write an RGBA image (8 bits per channel, `w × h × 4` bytes, row-major) as a PNG file: filter 0 on every row. */
export function writePng(path: string, w: number, h: number, rgba: Uint8Array): void {
  if (rgba.length !== w * h * 4) throw new Error(`writePng: ${rgba.length} bytes for ${w} × ${h}`);
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // no interlace
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  writeFileSync(path, Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array(0))]));
}
