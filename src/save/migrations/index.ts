/**
 * Save migrations (master §7). Each public build has one schema version; every earlier public version needs a migration.
 * Owner: integrator.
 *
 * `migrations[n]` turns a version-n state into a version n + 1 state. It receives the `state` object of the save
 * with typed arrays already decoded (map layers are typed arrays), may change it in place or return a new object,
 * and must set `schemaVersion` to n + 1. After the last migration the result gets the full live checks:
 * a structure failure there means the upgrade went wrong ("This save could not be upgraded"); a reference
 * failure means the old save was damaged. A migration that throws `MigrationError` fails the load with that
 * error's message; any other throw fails it with "This save could not be upgraded".
 */
import { migrateV1toV2 } from './v1-to-v2';

export { MigrationError } from './error';
export type Migration = (raw: unknown) => unknown;
export type Migrations = { [fromVersion: number]: Migration };

/** Build 1 (schema 1) → Build 2 (schema 2): Phase 4 §5.1. */
export const migrations: Migrations = {
  1: migrateV1toV2,
};
