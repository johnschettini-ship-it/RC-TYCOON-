/**
 * Generic typed-array encoding for saves: `{ "$ta": "<Kind>", "b64": "<base64 of little-endian bytes>" }`.
 * Any typed array anywhere in the state is encoded this way, so new slices need no save code.
 */
import { decodeBase64, encodeBase64 } from './base64';

export type TypedArrayKind =
  | 'Int8Array'
  | 'Uint8Array'
  | 'Uint8ClampedArray'
  | 'Int16Array'
  | 'Uint16Array'
  | 'Int32Array'
  | 'Uint32Array'
  | 'Float32Array'
  | 'Float64Array';

export interface TypedArrayMarker {
  $ta: TypedArrayKind;
  b64: string;
}

type NumericTypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array;

interface KindInfo {
  size: number;
  make(n: number): NumericTypedArray;
  get(v: DataView, at: number): number;
  set(v: DataView, at: number, x: number): void;
}

const KINDS: Record<TypedArrayKind, KindInfo> = {
  Int8Array: { size: 1, make: (n) => new Int8Array(n), get: (v, a) => v.getInt8(a), set: (v, a, x) => v.setInt8(a, x) },
  Uint8Array: { size: 1, make: (n) => new Uint8Array(n), get: (v, a) => v.getUint8(a), set: (v, a, x) => v.setUint8(a, x) },
  Uint8ClampedArray: { size: 1, make: (n) => new Uint8ClampedArray(n), get: (v, a) => v.getUint8(a), set: (v, a, x) => v.setUint8(a, x) },
  Int16Array: { size: 2, make: (n) => new Int16Array(n), get: (v, a) => v.getInt16(a, true), set: (v, a, x) => v.setInt16(a, x, true) },
  Uint16Array: { size: 2, make: (n) => new Uint16Array(n), get: (v, a) => v.getUint16(a, true), set: (v, a, x) => v.setUint16(a, x, true) },
  Int32Array: { size: 4, make: (n) => new Int32Array(n), get: (v, a) => v.getInt32(a, true), set: (v, a, x) => v.setInt32(a, x, true) },
  Uint32Array: { size: 4, make: (n) => new Uint32Array(n), get: (v, a) => v.getUint32(a, true), set: (v, a, x) => v.setUint32(a, x, true) },
  Float32Array: { size: 4, make: (n) => new Float32Array(n), get: (v, a) => v.getFloat32(a, true), set: (v, a, x) => v.setFloat32(a, x, true) },
  Float64Array: { size: 8, make: (n) => new Float64Array(n), get: (v, a) => v.getFloat64(a, true), set: (v, a, x) => v.setFloat64(a, x, true) },
};

function isKind(name: string): name is TypedArrayKind {
  return Object.prototype.hasOwnProperty.call(KINDS, name);
}

/** The typed-array kind of `v` (for example 'Uint8Array'), or null when `v` is not a supported typed array. */
export function typedArrayKind(v: unknown): TypedArrayKind | null {
  if (!ArrayBuffer.isView(v)) return null;
  const name = Object.prototype.toString.call(v).slice(8, -1);
  return isKind(name) ? name : null;
}

/** Throws for views JSON cannot carry (DataView, BigInt arrays): those are programming errors, not player errors. */
export function encodeTypedArray(ta: ArrayBufferView): TypedArrayMarker {
  const kind = typedArrayKind(ta);
  if (kind === null) throw new TypeError(`Saves cannot store ${Object.prototype.toString.call(ta).slice(8, -1)}`);
  const info = KINDS[kind];
  const src = ta as NumericTypedArray;
  const bytes = new Uint8Array(src.length * info.size);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < src.length; i++) info.set(view, i * info.size, src[i] as number);
  return { $ta: kind, b64: encodeBase64(bytes) };
}

export function isTypedArrayMarker(v: unknown): v is TypedArrayMarker {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return typeof o.$ta === 'string' && typeof o.b64 === 'string' && Object.keys(o).length === 2;
}

/** Error reason, or the decoded array. */
function decodeMarker(m: TypedArrayMarker, path: () => string): NumericTypedArray | string {
  if (!isKind(m.$ta)) return `unknown data type at ${path()}`;
  const info = KINDS[m.$ta];
  const bytes = decodeBase64(m.b64);
  if (bytes === null || bytes.length % info.size !== 0) return `unreadable data at ${path()}`;
  if (m.$ta === 'Uint8Array') return bytes;
  const n = bytes.length / info.size;
  const out = info.make(n);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < n; i++) out[i] = info.get(view, i * info.size);
  return out;
}

function put(holder: Record<string, unknown> | unknown[], key: string | number, value: unknown): void {
  // defineProperty keeps a key named "__proto__" an ordinary data property.
  Object.defineProperty(holder, key, { value, writable: true, enumerable: true, configurable: true });
}

export function childPath(path: string, key: string | number): string {
  if (typeof key === 'number') return `${path}[${key}]`;
  return path === '' ? key : `${path}.${key}`;
}

function formatPath(keys: ReadonlyArray<string | number>): string {
  let path = '';
  for (const k of keys) path = childPath(path, k);
  return path;
}

/** Depth-first in document order. `keys` is the path of `node`; it is formatted only for an error. */
function decodeIn(node: object, keys: Array<string | number>): string | null {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const e = decodeChild(node, i, node[i] as unknown, keys);
      if (e) return e;
    }
  } else {
    const o = node as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      const e = decodeChild(o, k, o[k], keys);
      if (e) return e;
    }
  }
  return null;
}

function decodeChild(holder: Record<string, unknown> | unknown[], key: string | number, value: unknown, keys: Array<string | number>): string | null {
  if (typeof value !== 'object' || value === null || ArrayBuffer.isView(value)) return null;
  keys.push(key);
  let error: string | null;
  if (isTypedArrayMarker(value)) {
    const decoded = decodeMarker(value, formatPath.bind(null, keys));
    error = typeof decoded === 'string' ? decoded : null;
    if (error === null) put(holder, key, decoded);
  } else {
    error = decodeIn(value, keys);
  }
  keys.pop();
  return error;
}

/**
 * Replace every marker inside `root` (parsed JSON) with its typed array, in place.
 * Returns null on success, else a short reason with the path of the bad marker.
 */
export function decodeTypedArrays(root: unknown): string | null {
  if (typeof root !== 'object' || root === null) return null;
  return decodeIn(root, []);
}
