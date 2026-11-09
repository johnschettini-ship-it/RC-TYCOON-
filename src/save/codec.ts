/** Save encoding and decoding (master §7). Pure: no storage, no DOM. */
import type { GameState, World } from '../sim/types';
import { checkIntegrity } from './integrity';
import { damaged, ERR_NEWER, ERR_NOT_A_SAVE, ERR_TOO_OLD, ERR_UNREADABLE } from './messages';
import type { Migrations } from './migrations';
import { checkStructure, isRecord } from './schema';
import { decodeTypedArrays, encodeTypedArray } from './typedArrays';

export const SAVE_FORMAT = 'thrills-and-chills-save';
export const SCHEMA_VERSION = 1;

export type LoadResult = { ok: true; world: World } | { ok: false; error: string };

export interface SaveEnvelope {
  format: typeof SAVE_FORMAT;
  schemaVersion: number;
  gameVersion: string;
  savedAt: string;
  state: unknown;
}

/** The save file text. Events are not saved. Typed arrays become `{ $ta, b64 }`. */
export function serializeWorld(world: World, gameVersion: string, savedAtIso: string): string {
  const envelope: SaveEnvelope = {
    format: SAVE_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    gameVersion,
    savedAt: savedAtIso,
    state: world.state,
  };
  return JSON.stringify(envelope, (_key, value: unknown) => (ArrayBuffer.isView(value) ? encodeTypedArray(value) : value));
}

export interface DecodeOptions {
  /** Schema version this build writes. */
  schemaVersion: number;
  migrations: Migrations;
}

function fail(error: string): LoadResult {
  return { ok: false, error };
}

/** `deserialize` with the version and migration table injected (tests use a fake table). Never throws. */
export function deserializeWith(json: string, opts: DecodeOptions): LoadResult {
  try {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      return fail(ERR_UNREADABLE);
    }
    if (!isRecord(raw) || raw.format !== SAVE_FORMAT) return fail(ERR_NOT_A_SAVE);

    const version = raw.schemaVersion;
    if (version === undefined) return fail(damaged('missing field schemaVersion'));
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return fail(damaged('bad value at schemaVersion'));
    if (version > opts.schemaVersion) return fail(ERR_NEWER);

    for (const k of ['gameVersion', 'savedAt', 'state'] as const) {
      if (!Object.prototype.hasOwnProperty.call(raw, k)) return fail(damaged(`missing field ${k}`));
    }
    if (typeof raw.gameVersion !== 'string') return fail(damaged('bad value at gameVersion'));
    if (typeof raw.savedAt !== 'string') return fail(damaged('bad value at savedAt'));
    let state: unknown = raw.state;
    if (!isRecord(state)) return fail(damaged('bad value at state'));
    if (state.schemaVersion !== version) return fail(damaged('the version numbers do not match'));

    const decodeError = decodeTypedArrays(state);
    if (decodeError) return fail(damaged(decodeError));

    for (let from = version; from < opts.schemaVersion; from++) {
      const migrate = opts.migrations[from];
      if (!migrate) return fail(ERR_TOO_OLD);
      try {
        state = migrate(state);
      } catch {
        return fail(damaged(`could not upgrade it from version ${from}`));
      }
    }

    const structureError = checkStructure(state);
    if (structureError) return fail(damaged(structureError));
    const valid = state as GameState;
    const integrityError = checkIntegrity(valid);
    if (integrityError) return fail(damaged(integrityError));
    return { ok: true, world: { state: valid, events: [] } };
  } catch {
    return fail(ERR_UNREADABLE);
  }
}
