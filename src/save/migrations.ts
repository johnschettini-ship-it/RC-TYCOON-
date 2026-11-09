/**
 * Save migrations (master §7). Each public build has one schema version; every earlier public version needs a migration.
 *
 * `migrations[n]` turns a version-n state into a version n + 1 state. It receives the `state` object of the save
 * with typed arrays already decoded (map layers are typed arrays), may change it in place or return a new object,
 * and must set `schemaVersion` to n + 1. The result is validated in full afterwards, so a migration never has to
 * check its own output. A migration that throws makes the load fail with a "damaged" error.
 */
export type Migration = (raw: unknown) => unknown;
export type Migrations = { [fromVersion: number]: Migration };

/** Schema 1 is the first public version (Build 1), so there is nothing to migrate yet. */
export const migrations: Migrations = {};
