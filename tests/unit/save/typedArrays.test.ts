import { describe, expect, it } from 'vitest';
import { decodeBase64, encodeBase64 } from '../../../src/save/base64';
import { decodeTypedArrays, encodeTypedArray, isTypedArrayMarker } from '../../../src/save/typedArrays';

describe('base64 (no Node-only APIs)', () => {
  it('matches the standard alphabet and padding', () => {
    const bytes = (s: string): Uint8Array => new Uint8Array(Array.from(s, (c) => c.charCodeAt(0)));
    expect(encodeBase64(bytes(''))).toBe('');
    expect(encodeBase64(bytes('f'))).toBe('Zg==');
    expect(encodeBase64(bytes('fo'))).toBe('Zm8=');
    expect(encodeBase64(bytes('foo'))).toBe('Zm9v');
    expect(encodeBase64(bytes('foobar'))).toBe('Zm9vYmFy');
    expect(encodeBase64(new Uint8Array([0, 255, 254, 62, 63]))).toBe('AP/+Pj8=');
  });

  it('round-trips every byte value and every tail length', () => {
    for (let n = 0; n < 300; n++) {
      const b = new Uint8Array(n);
      for (let i = 0; i < n; i++) b[i] = (i * 37 + n) & 255;
      expect(decodeBase64(encodeBase64(b))).toEqual(b);
    }
  });

  it('rejects malformed input with null', () => {
    expect(decodeBase64('Zg=')).toBeNull();
    expect(decodeBase64('Zg==Zg==')).toBeNull();
    expect(decodeBase64('Z===')).toBeNull();
    expect(decodeBase64('Zm9*')).toBeNull();
    expect(decodeBase64('Zm 9')).toBeNull();
    expect(decodeBase64('=Zm9')).toBeNull();
  });
});

describe('typed array markers', () => {
  it('encodes every supported kind and decodes it back exactly', () => {
    const samples = [
      new Int8Array([-128, -1, 0, 1, 127]),
      new Uint8Array([0, 1, 200, 255]),
      new Uint8ClampedArray([0, 128, 255]),
      new Int16Array([-32768, -2, 0, 3, 32767]),
      new Uint16Array([0, 1, 65535, 4660]),
      new Int32Array([-2147483648, -1, 0, 1, 2147483647]),
      new Uint32Array([0, 1, 4294967295, 305419896]),
      new Float32Array([0, -1.5, 3.25, Infinity]),
      new Float64Array([0, -0.1, Math.PI, 1e300]),
    ];
    for (const ta of samples) {
      const marker = encodeTypedArray(ta);
      expect(isTypedArrayMarker(marker)).toBe(true);
      const root = { a: [{ x: JSON.parse(JSON.stringify(marker)) as unknown }] };
      expect(decodeTypedArrays(root)).toBeNull();
      expect(root.a[0]?.x).toEqual(ta);
    }
  });

  it('stores multi-byte values little-endian whatever the platform', () => {
    expect(encodeTypedArray(new Uint16Array([0x0102]))).toEqual({ $ta: 'Uint16Array', b64: encodeBase64(new Uint8Array([2, 1])) });
    expect(encodeTypedArray(new Int32Array([-1]))).toEqual({ $ta: 'Int32Array', b64: '/////w==' });
  });

  it('encodes only the viewed slice of a larger buffer', () => {
    const buf = new Uint8Array([9, 9, 1, 2, 3, 9]);
    const view = new Uint8Array(buf.buffer, 2, 3);
    const root: { v: unknown } = { v: encodeTypedArray(view) };
    expect(decodeTypedArrays(root)).toBeNull();
    expect(root.v).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('refuses kinds that JSON cannot carry', () => {
    expect(() => encodeTypedArray(new BigInt64Array(1))).toThrow();
    expect(() => encodeTypedArray(new DataView(new ArrayBuffer(4)))).toThrow();
  });

  it('reports a bad marker with its path', () => {
    expect(decodeTypedArrays({ map: { terrain: { $ta: 'Uint8Array', b64: '***' } } })).toBe('unreadable data at map.terrain');
    expect(decodeTypedArrays({ list: [1, { $ta: 'Nope', b64: '' }] })).toBe('unknown data type at list[1]');
    expect(decodeTypedArrays({ v: { $ta: 'Uint16Array', b64: encodeBase64(new Uint8Array(3)) } })).toBe('unreadable data at v');
  });

  it('leaves look-alike objects with extra keys alone', () => {
    const root = { v: { $ta: 'Uint8Array', b64: '', extra: 1 } };
    expect(decodeTypedArrays(root)).toBeNull();
    expect(root.v).toEqual({ $ta: 'Uint8Array', b64: '', extra: 1 });
  });
});
