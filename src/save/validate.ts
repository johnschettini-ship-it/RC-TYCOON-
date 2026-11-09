/**
 * Save validator combinators (master §7). Owner: integrator.
 * Each validator carries its value type, and `obj<T>` needs a validator for every key of T, so adding or
 * changing a field in a state type without updating its validator is a compile error.
 * Live shapes: `schema.ts` (Build 1 slices) and `slices/*.ts` (Build 2 slices, owned by their Wave 3 cards).
 * The frozen schema 1 check: `v1/schema.ts`.
 */
import { childPath, typedArrayKind, type TypedArrayKind } from './typedArrays';


export interface Ctx {
  /** Tiles on the map (width × height), known once the map passed its check. */
  tiles: number;
}

type Problem = 'missing' | 'bad' | 'unknown' | 'kind' | 'size' | 'mapSize';

/** A failed check. Keys are collected innermost first while the failure bubbles up; the path is built only then. */
export interface Fail {
  problem: Problem;
  keys: Array<string | number>;
}

const MESSAGES: Record<Problem, (path: string) => string> = {
  missing: (p) => `missing field ${p}`,
  bad: (p) => `bad value at ${p}`,
  unknown: (p) => `unknown field ${p}`,
  kind: (p) => `wrong data type at ${p}`,
  size: (p) => `wrong size at ${p}`,
  mapSize: () => 'bad map size',
};

export function describeFail(f: Fail): string {
  let path = '';
  for (let i = f.keys.length - 1; i >= 0; i--) path = childPath(path, f.keys[i] as string | number);
  return MESSAGES[f.problem](path);
}

export const fail = (problem: Problem, ...keysInnermostFirst: Array<string | number>): Fail => ({ problem, keys: keysInnermostFirst });

export function under(f: Fail | null, key: string | number): Fail | null {
  if (f) f.keys.push(key);
  return f;
}

/** Returns null when the value is fine, else a failure. The phantom keeps validators typed (invariant in T). */
export interface V<T> {
  (value: unknown, ctx: Ctx): Fail | null;
  readonly __type?: (t: T) => T;
}

export type Shape<T> = { [K in keyof Required<T>]: V<T[K]> };

export const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

export function isRecord(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v) || ArrayBuffer.isView(v)) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

export function check<T>(fn: (value: unknown, ctx: Ctx) => Fail | null): V<T> {
  return fn as V<T>;
}

/** A validator from a predicate: fails with "bad value". */
export function when<T>(ok: (value: unknown, ctx: Ctx) => boolean): V<T> {
  return check((v, ctx) => (ok(v, ctx) ? null : fail('bad')));
}

// ---- Primitives ----

export const str: V<string> = when((v) => typeof v === 'string');
export const bool: V<boolean> = when((v) => typeof v === 'boolean');
/** Any finite number. */
export const num: V<number> = when((v) => typeof v === 'number' && Number.isFinite(v));
/** A safe integer (ids, ticks, counts, money in cents). */
export const int: V<number> = when((v) => typeof v === 'number' && Number.isSafeInteger(v));
/** A tile index on the map, or −1 for none. */
export const tileOrNone: V<number> = when((v, ctx) => typeof v === 'number' && Number.isInteger(v) && v >= -1 && v < ctx.tiles);
/** A tile index on the map. */
export const tile: V<number> = when((v, ctx) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < ctx.tiles);

export function literal<const T extends string | number>(value: T): V<T> {
  return when((v) => v === value);
}

export function oneOf<const T extends string | number>(values: readonly T[]): V<T> {
  const set = new Set<unknown>(values);
  return when((v) => set.has(v));
}

/**
 * A runtime list that must name every member of the union U. A missing member is a compile error.
 * Usage: `every<RideStatus>()(['building', …])`.
 */
export function every<U extends string | number>() {
  return <const L extends readonly U[]>(list: L & ([Exclude<U, L[number]>] extends [never] ? unknown : { missing: Exclude<U, L[number]> })): L => list;
}

// ---- Combinators ----

export function nullable<T>(inner: V<T>): V<T | null> {
  return check((v, ctx) => (v === null ? null : inner(v, ctx)));
}

/** For optional properties (`key?: T`): the key may be absent. */
export function optional<T>(inner: V<T>): V<T | undefined> {
  return check((v, ctx) => (v === undefined ? null : inner(v, ctx)));
}

export function arr<T>(item: V<T>): V<T[]> {
  return check((v, ctx) => {
    if (!Array.isArray(v)) return fail('bad');
    for (let i = 0; i < v.length; i++) {
      const e = item(v[i], ctx);
      if (e) return under(e, i);
    }
    return null;
  });
}

/** A plain object with any keys and values of one type. */
export function record<T>(value: V<T>): V<Record<string, T>> {
  return check((v, ctx) => {
    if (!isRecord(v)) return fail('bad');
    for (const k in v) {
      const e = value(v[k], ctx);
      if (e) return under(e, k);
    }
    return null;
  });
}

/** A plain object with exactly the listed keys. */
export function exactRecord<K extends string, T>(keys: readonly K[], value: V<T>): V<Record<K, T>> {
  const allowed = new Set<string>(keys);
  return check((v, ctx) => {
    if (!isRecord(v)) return fail('bad');
    for (const k of keys) {
      if (!hasOwn(v, k)) return fail('missing', k);
      const e = value(v[k], ctx);
      if (e) return under(e, k);
    }
    for (const k in v) if (!allowed.has(k)) return fail('unknown', k);
    return null;
  });
}

/** An object with exactly the fields of T. Optional fields (validated by `optional`) may be absent. */
export function obj<T>(shape: Shape<T>): V<T> {
  const keys = Object.keys(shape);
  const fields = keys.map((k) => (shape as unknown as Record<string, V<unknown>>)[k] as V<unknown>);
  const allowed = new Set(keys);
  return check((v, ctx) => {
    if (!isRecord(v)) return fail('bad');
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i] as string;
      const present = hasOwn(v, k);
      const e = (fields[i] as V<unknown>)(present ? v[k] : undefined, ctx);
      if (e) return present ? under(e, k) : fail('missing', k);
    }
    for (const k in v) if (!allowed.has(k)) return fail('unknown', k);
    return null;
  });
}

type KindToArray = {
  Int8Array: Int8Array;
  Uint8Array: Uint8Array;
  Uint8ClampedArray: Uint8ClampedArray;
  Int16Array: Int16Array;
  Uint16Array: Uint16Array;
  Int32Array: Int32Array;
  Uint32Array: Uint32Array;
  Float32Array: Float32Array;
  Float64Array: Float64Array;
};

/** A typed array of one kind, any length. */
export function typed<K extends TypedArrayKind>(kind: K): V<KindToArray[K]> {
  return check((v) => (typedArrayKind(v) === kind ? null : fail('kind')));
}

/** A map layer: a typed array of one kind with one entry per tile. */
export function layer<K extends TypedArrayKind>(kind: K): V<KindToArray[K]> {
  return check((v, ctx) => {
    if (typedArrayKind(v) !== kind) return fail('kind');
    return (v as KindToArray[K]).length === ctx.tiles ? null : fail('size');
  });
}

/** An integer 0–255 (heights in steps, water levels). */
export const byte: V<number> = when((v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 255);

/** Any validator as a plain check (for untyped shapes). */
export type Check = (value: unknown, ctx: Ctx) => Fail | null;

/**
 * An object with exactly the listed fields, with no link to a TypeScript type. Only for the frozen schema 1
 * check (`v1/schema.ts`), which must never follow later changes of the live state types.
 */
export function objLoose(shape: Record<string, Check>): V<Record<string, unknown>> {
  return obj<Record<string, unknown>>(shape as unknown as Shape<Record<string, unknown>>);
}

/** Largest map the loader accepts (tiles). Far above any planned map (256 × 256 in Phase 4). */
export const MAX_TILES = 4096 * 4096;

/**
 * A map check from a map shape: checks width and height first and sets `ctx.tiles` (tile checks elsewhere need
 * it), then the shape, then every content code and `contentRef ≥ −1`.
 */
export function makeMapCheck<T>(shape: V<T>, contentCodes: ReadonlySet<number>): V<T> {
  return check((v, ctx) => {
    if (!isRecord(v)) return fail('bad');
    for (const k of ['width', 'height']) if (!hasOwn(v, k)) return fail('missing', k);
    const w = v.width;
    const h = v.height;
    if (typeof w !== 'number' || typeof h !== 'number' || !Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w * h > MAX_TILES) {
      return fail('mapSize');
    }
    ctx.tiles = w * h;
    const e = shape(v, ctx);
    if (e) return e;
    const content = v.content as Uint8Array;
    const contentRef = v.contentRef as Int32Array;
    for (let i = 0; i < ctx.tiles; i++) {
      if (!contentCodes.has(content[i] as number)) return fail('bad', i, 'content');
      if ((contentRef[i] as number) < -1) return fail('bad', i, 'contentRef');
    }
    return null;
  });
}

/** Runs the map check first (it sets `ctx.tiles`), then the whole state shape. Null when sound, else a reason. */
export function checkStateWith(raw: unknown, mapCheck: Check, stateShape: Check): string | null {
  const ctx: Ctx = { tiles: 0 };
  if (!isRecord(raw)) return 'bad value at state';
  if (!hasOwn(raw, 'map')) return describeFail(fail('missing', 'map'));
  const e = under(mapCheck(raw.map, ctx), 'map') ?? stateShape(raw, ctx);
  return e ? describeFail(e) : null;
}
