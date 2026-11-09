/** Standard base64 (RFC 4648, with padding) in plain TypeScript, so it runs the same in browsers and Node. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const LOOKUP: Int16Array = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) t[ALPHABET.charCodeAt(i)] = i;
  return t;
})();

export function encodeBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let chunk = '';
  const n = bytes.length;
  let i = 0;
  for (; i + 2 < n; i += 3) {
    const v = ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8) | (bytes[i + 2] as number);
    chunk += ALPHABET[v >>> 18]! + ALPHABET[(v >>> 12) & 63]! + ALPHABET[(v >>> 6) & 63]! + ALPHABET[v & 63]!;
    if (chunk.length >= 8192) {
      parts.push(chunk);
      chunk = '';
    }
  }
  const rest = n - i;
  if (rest === 1) {
    const v = (bytes[i] as number) << 16;
    chunk += ALPHABET[v >>> 18]! + ALPHABET[(v >>> 12) & 63]! + '==';
  } else if (rest === 2) {
    const v = ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8);
    chunk += ALPHABET[v >>> 18]! + ALPHABET[(v >>> 12) & 63]! + ALPHABET[(v >>> 6) & 63]! + '=';
  }
  parts.push(chunk);
  return parts.join('');
}

function sextet(s: string, i: number): number {
  const c = s.charCodeAt(i);
  return c < 128 ? (LOOKUP[c] as number) : -1;
}

/** Decoded bytes, or null when `s` is not well-formed padded base64. */
export function decodeBase64(s: string): Uint8Array | null {
  if (s.length % 4 !== 0) return null;
  let pad = 0;
  if (s.endsWith('==')) pad = 2;
  else if (s.endsWith('=')) pad = 1;
  const out = new Uint8Array((s.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const last = i + 4 === s.length;
    const a = sextet(s, i);
    const b = sextet(s, i + 1);
    const c = last && pad === 2 ? 0 : sextet(s, i + 2);
    const d = last && pad >= 1 ? 0 : sextet(s, i + 3);
    if (a < 0 || b < 0 || c < 0 || d < 0) return null;
    const v = (a << 18) | (b << 12) | (c << 6) | d;
    out[o++] = v >>> 16;
    if (o < out.length) out[o++] = (v >>> 8) & 255;
    if (o < out.length) out[o++] = v & 255;
  }
  return out;
}
