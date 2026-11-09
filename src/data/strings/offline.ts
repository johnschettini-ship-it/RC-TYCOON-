/**
 * Owner: W4-G. Offline play and language strings (Phase 6 §4.8, §4.10, §7). Keys start with `offline.`, `lang.`,
 * `money.`, `date.`. Master R4: no final period. Texts the spec gives are exact.
 */
export const offlineStrings: Record<string, string> = {
  // Phase 6 §4.10, §7: the update toast stays until Reload or Later.
  'offline.updateReady': 'Update ready',
  'offline.reload': 'Reload',
  'offline.later': 'Later',
  // Phase 6 §4.8: the game currency sign comes from the string table.
  'money.format': '${amount}',
};
