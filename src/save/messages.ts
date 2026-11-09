/** Player-facing save and load messages (master §7, §9). Plain words, no final period (master R4). */
export const ERR_NOT_A_SAVE = 'This file is not a Thrills & Chills save';
export const ERR_UNREADABLE = 'This save could not be read';
export const ERR_NEWER = 'This save comes from a newer version of the game';
export const ERR_TOO_OLD = 'This save comes from an older version that this game cannot load';
export const ERR_SAVE_FAILED = 'Could not save. Storage is full or blocked. Use Export instead';
export const ERR_NO_STORAGE = 'Saved games are not available in this browser. Use Import instead';
export const ERR_EMPTY_SLOT = 'This save slot is empty';
/** Phase 4 §5.1 step 6: an older save failed to upgrade. */
export const ERR_UPGRADE = 'This save could not be upgraded';

/** The live state would not load back, so the slot keeps its old save. */
export function saveInvalid(reason: string): string {
  return `Could not save. The park data has a problem: ${reason}`;
}

export function damaged(reason: string): string {
  return `This save is damaged: ${reason}`;
}
